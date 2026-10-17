import test from 'node:test';
import assert from 'node:assert/strict';
import { ManifestCache } from '../src/core/manifest-cache';
import { PathPolicy } from '../src/core/path-policy';
import { SyncFault } from '../src/core/sync-issue';
import { MISSING, versionOf } from '../src/core/local-version';
import { ab, str, fixture, fsMemory } from './helpers';

const specialPaths = ['__proto__', 'constructor', 'toString'];
const cached = { h: 'abc', s: 3, alg: 'sha256' as const };

test('B13: absent prototype names are not cache entries before or after load/reset', async () => {
  const memory = fsMemory(), cache = new ManifestCache(memory.fs, 'test');
  for (const phase of ['fresh', 'load', 'reset']) {
    if (phase === 'load') await cache.load();
    if (phase === 'reset') await cache.reset();
    for (const path of specialPaths) assert.equal(cache.get(path), undefined, `${phase}: ${path}`);
  }
});
test('B13: own-key set, snapshot, flush, reload, delete and backup roundtrip', async () => {
  const memory = fsMemory(), cache = new ManifestCache(memory.fs, 'test');
  for (const path of specialPaths) cache.set(path, cached);
  const snapshot = cache.entries();
  for (const path of specialPaths) {
    assert(Object.prototype.hasOwnProperty.call(snapshot, path), path);
    assert.deepEqual(snapshot[path], cached);
  }
  snapshot.__proto__.h = 'changed outside';
  assert.deepEqual(cache.get('__proto__'), cached);
  await cache.flush();
  const reopened = new ManifestCache(memory.fs, 'test');
  await reopened.load();
  for (const path of specialPaths) assert.deepEqual(reopened.get(path), cached);
  await reopened.reset();
  assert(await reopened.restoreBackup());
  for (const path of specialPaths) {
    assert.deepEqual(reopened.get(path), cached);
    reopened.delete(path);
    assert.equal(reopened.get(path), undefined);
  }
  await reopened.flush();
  assert.deepEqual(Object.keys(await cache.load()), []);
});
test('B13: existing JSON with prototype names survives load and republish', async () => {
  const memory = fsMemory(), cache = new ManifestCache(memory.fs, 'test');
  const entries = Object.fromEntries(specialPaths.map(path => [path, cached]));
  memory.files.set('manifest-test.json', JSON.stringify({version: 1, sourceId: 'test', entries}));
  await cache.load(); await cache.flush();
  const persisted = JSON.parse(memory.files.get('manifest-test.json')!).entries;
  for (const path of specialPaths) assert(Object.prototype.hasOwnProperty.call(persisted, path), path);
});
test('B19: requested trash without capability preserves original and creates no intent', async () => {
  const f = fixture(); f.own('a.md');
  await assert.rejects(f.mutations.delete('test', {id:'delete', planId:'p', path:'a.md',
    before:await versionOf(ab('LOCAL')), guard:()=>{}}, true),
    error => error instanceof SyncFault && error.code === 'trash-unavailable' && !error.retryable);
  assert.equal(str(f.files.get('a.md')!), 'LOCAL');
  assert.deepEqual(f.operations, []);
  await f.store.load(); assert.deepEqual(f.store.records(), []);
});
for (const durable of [true, false]) {
  test(`B19: coordinator preserves tracked original and reports unavailable trash (durable=${durable})`, async () => {
    const f = fixture([], 'light'); f.own('a.md');
    f.deps.options.useTrash = () => true;
    if (!durable) f.deps.mutations = undefined;
    const result = await f.coordinator.sync();
    assert.equal(result?.deleted, 0);
    assert.equal(result?.failed, 1);
    assert(result?.results?.some(item => item.issue?.code === 'trash-unavailable'));
    assert.equal(str(f.files.get('a.md')!), 'LOCAL');
    assert(f.cache.get('a.md'));
    assert(!f.operations.includes('delete a.md'));
  });
}
test('B19: supported trash is called with its receiver and verified recovery already stored', async () => {
  const f = fixture(); f.own('a.md'); let calls = 0;
  f.vault.trash = async function(path) {
    assert.equal(this, f.vault); calls++;
    const record = f.store.records()[0]; assert(record.recovery);
    assert.equal(str(await f.recovery.read(record.recovery)), 'LOCAL');
    f.files.delete(path);
  };
  await f.mutations.delete('test', {id:'delete',planId:'p',path:'a.md',before:await versionOf(ab('LOCAL')),guard:()=>{}},true);
  assert.equal(calls, 1); assert.equal(f.store.records()[0].status, 'applied');
  assert(!f.operations.includes('delete a.md'));
});
test('B19: throwing trash retains uncertain intent and never falls back to remove', async () => {
  const f = fixture(); f.own('a.md');
  f.vault.trash = async () => { throw new Error('trash failed'); };
  await assert.rejects(f.mutations.delete('test', {id:'delete',planId:'p',path:'a.md',before:await versionOf(ab('LOCAL')),guard:()=>{}},true), /trash failed/);
  assert.equal(str(f.files.get('a.md')!), 'LOCAL');
  assert.equal(f.store.records()[0].status, 'committing');
  assert(!f.operations.includes('delete a.md'));
  await f.mutations.recover('test'); assert.equal(f.store.records()[0].status, 'not-applied');
});
test('B19: missing target needs no trash capability and explicit remove keeps recovery', async () => {
  const f = fixture();
  await f.mutations.delete('test', {id:'absent',planId:'p',path:'absent.md',before:MISSING,guard:()=>{}},true);
  f.own('a.md');
  await f.mutations.delete('test', {id:'delete',planId:'p',path:'a.md',before:await versionOf(ab('LOCAL')),guard:()=>{}},false);
  assert(f.operations.includes('delete a.md'));
  const record = f.store.records().find(r => r.id === 'delete')!;
  assert.equal(str(await f.recovery.read(record.recovery!)), 'LOCAL');
});
const options = {syncMode:'full-vault' as const,allowedFolders:'',ignoredFolders:'',allowPlugins:false,allowSnippets:false};
for (const path of ['a//b', '/a/b', 'a\\b', ' A/B/ ']) {
  test(`B61 reservation aliases: ${JSON.stringify(path)}`, () => {
    const policy = new PathPolicy({...options,blockedTargets:[{path:'a/b',reason:'reserved'}]});
    assert.equal(policy.blockReason(path), 'reserved');
    assert.equal(policy.isPathAllowed(path), false);
    assert.equal(policy.snapshot().blockReason(path), 'reserved');
  });
}
test('B61: block declarations, descendants and ancestors use the same alias key', () => {
  const policy = new PathPolicy({...options,blockedTargets:[{path:'/A//B/',reason:'reserved',ancestors:true,descendants:true}]});
  for (const path of ['a', 'a/b', 'a//b/c']) assert.equal(policy.blockReason(path), 'reserved');
  for (const path of ['ab', 'a/bc', 'a/c']) assert.equal(policy.blockReason(path), undefined);
});
