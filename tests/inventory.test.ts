import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateManifest, verifyRemoteData } from '../src/core/source-validation';
import { ManifestCache } from '../src/core/manifest-cache';
import { FileJournal, type JournalEntry } from '../src/core/journal';
import { pathPolicy } from './helpers';
import { ab, entry, deferred, fsMemory } from './helpers';

test('ambiguous paths and invalid metadata fail closed', () => {
  for (const pair of [['a.md', 'a.md'], ['A.md', 'a.md'], ['é.md', 'e\u0301.md'], ['dir', 'dir/a.md']]) {
    assert.throws(() => validateManifest(pair.map(p => entry(p))), /collision/);
  }
  for (const path of ['../a.md', '/a.md', 'C:/a.md', 'dir//a.md', 'dir\\a.md', 'dir/./a.md', 'a\0.md']) {
    assert.throws(() => validateManifest([entry(path)]), /path/);
  }
  for (const size of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateManifest([{ ...entry('a.md'), size }]), /size/);
  }
  assert.throws(() => validateManifest([{ ...entry('a.md'), hash: 'invalid' }]), /version/);
  assert.doesNotThrow(() => validateManifest([entry('a.md', ''), entry('dir/b.md')]));
});
test('all content digest algorithms accept valid bytes and reject corruption', async () => {
  const data = ab('123456789');
  const gitHash = createHash('sha1').update('blob 9\0').update('123456789').digest('hex');
  for (const [hashAlg, hash] of [['sha256', entry('a', '123456789').hash], ['git-sha1', gitHash], ['crc32', 'cbf43926']] as const) {
    const remote = { path: 'a', size: 9, hashAlg, hash };
    await verifyRemoteData(remote, data);
    await assert.rejects(verifyRemoteData(remote, ab('123456780')), /integrity/);
  }
});
test('zero-length entries still require exact length; ETags do not claim byte integrity', async () => {
  await verifyRemoteData(entry('empty', ''), ab(''));
  await assert.rejects(verifyRemoteData(entry('empty', ''), ab('x')), /size/);
  await verifyRemoteData({ path: 'a', size: 1, hashAlg: 'etag', hash: 'opaque' }, ab('x'));
});
test('Windows device aliases with multiple extensions are rejected', () => {
  const policy = pathPolicy();
  for (const path of ['notes/CON.tar.gz', 'notes/aux.md', 'NUL.backup.txt', 'LPT1.md']) assert(!policy.isPathSafe(path));
  assert(policy.isPathSafe('notes/normal.tar.gz'));
});
test('journal persists blocked/deferred counts and loads legacy entries', async () => {
  let stored: string | null = null;
  const journal = new FileJournal({ read: async () => stored, write: async s => { stored = s; } });
  const legacy: JournalEntry = { startedAt: 1, durationMs: 1, engine: 'git', mirrorLevel: 'light', trigger: 'manual', outcome: 'ok',
    downloaded: 0, updated: 0, deletedLight: 0, deletedFull: 0, overwritten: 0, conflicts: 0, skipped: 0, errors: 0, topErrors: [] };
  await journal.append(legacy); await journal.append({ ...legacy, outcome: 'error', deferredDeletions: 3, blockedDeletions: 2 });
  const entries = await journal.load(); assert.equal(entries[0].deferredDeletions, 3); assert.equal(entries[0].blockedDeletions, 2);
  assert.equal(entries[1].deferredDeletions, 0); assert.equal(entries[1].blockedDeletions, 0);
});
test('concurrent cache flushes are serialized and retain the newer snapshot', async () => {
  const { fs, files } = fsMemory(); const entered = deferred(), release = deferred();
  const write = fs.write; let calls = 0;
  fs.write = async (p, v) => { await write(p, v); if (++calls === 1) { entered.resolve(); await release.promise; } };
  const cache = new ManifestCache(fs, 'test'); const a = entry('a');
  cache.set('a', { h: a.hash, s: a.size, alg: a.hashAlg });
  const one = cache.flush(); await entered.promise;
  cache.set('b', { h: a.hash, s: a.size, alg: a.hashAlg }); const two = cache.flush();
  await Promise.resolve(); assert.equal(calls, 1);
  release.resolve(); await Promise.all([one, two]);
  const stored = JSON.parse(files.get('manifest-test.json')!); assert.deepEqual(Object.keys(stored.entries), ['a', 'b']);
  assert(!files.has('manifest-test.json.tmp'));
});
test('a failed cache flush does not poison subsequent writes', async () => {
  const { fs, files } = fsMemory(); const write = fs.write; let fail = true;
  fs.write = async (p, v) => { if (fail) { fail = false; throw new Error('disk full'); } await write(p, v); };
  const cache = new ManifestCache(fs, 'test');
  await assert.rejects(cache.flush(), /disk full/); await cache.flush(); assert(files.has('manifest-test.json'));
});
