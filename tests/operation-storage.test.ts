import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rename, access, unlink, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FileSystem } from '../src/sources/types';
import { OperationStore, type OperationRecord } from '../src/core/operation-store';
import { DurableMutations } from '../src/core/durable-mutations';
import { MISSING, versionOf } from '../src/core/local-version';
import { ManifestCache } from '../src/core/manifest-cache';
import { ab, str, sha, entry, fixture } from './helpers';

const events = (f: ReturnType<typeof fixture>) => [...f.memory.files.keys()].filter(p => /^sync-operations-v3-event-\d{16}\.json$/.test(p)).sort();
const checkpoints = (f: ReturnType<typeof fixture>) => [...f.memory.files.keys()].filter(p => /^sync-operations-v3-checkpoint-\d{16}\.json$/.test(p)).sort();
const seal = (value: unknown) => { const payload = JSON.stringify(value); return JSON.stringify({ sha256: sha(payload), payload }); };
function storage(minimumCheckpointEvents = 4) {
  const f = fixture();
  const store = new OperationStore(f.memory.fs, 10000, { minimumCheckpointEvents });
  return { ...f, store, mutations: new DurableMutations(store, f.recovery, f.vault) };
}
function reopen(f: ReturnType<typeof fixture>) {
  const store = new OperationStore(f.memory.fs);
  return { store, mutations: new DurableMutations(store, f.recovery, f.vault) };
}
async function write(f: ReturnType<typeof storage>, id: string, path = `${id}.md`, content = 'REMOTE') {
  await f.mutations.write('test', { id, planId: 'plan', path, before: MISSING, guard: () => {},
    effect: { kind: 'set', remote: entry(path, content), mode: 'applied' } }, ab(content));
}
async function legacy(f: ReturnType<typeof fixture>, status: 'committing' | 'applied' = 'committing') {
  const record: OperationRecord = { id: 'legacy', planId: 'old-plan', namespace: 'test', kind: 'write', path: 'a.md',
    before: await versionOf(ab('OLD')), after: await versionOf(ab('REMOTE')), recovery: await f.recovery.save(ab('OLD')),
    effect: { kind: 'set', remote: entry('a.md'), mode: 'applied' }, status, createdAt: 1,
    ...(status === 'applied' ? { appliedSequence: 2 } : {}) };
  const baseline = { remote: entry('a.md'), remotePath: 'a.md', localSha256: sha('REMOTE'), size: 6, confidence: 'digest-verified' };
  const name = 'sync-operations-v2-0000000000000002.json';
  f.memory.files.set(name, seal({ version: 2, sequence: 2, operations: { legacy: record },
    baselines: status === 'applied' ? { [JSON.stringify(['test', 'a.md'])]: baseline } : {} }));
  f.files.set('a.md', ab(status === 'applied' ? 'REMOTE' : 'OLD'));
  return { record, name };
}

test('format upgrade is read-only on load and preserves legacy bytes and applied state', async () => {
  const f = storage(), { name } = await legacy(f, 'applied'), original = f.memory.files.get(name)!;
  await f.store.load(); assert.equal(f.memory.files.size, 1); assert.equal(f.store.baseline('test', 'a.md')?.localSha256, sha('REMOTE'));
  await write(f, 'new'); assert.equal(f.memory.files.get(name), original); assert(f.memory.files.has('sync-operations-v2-migrated.json'));
  const r = reopen(f); await r.store.load(); assert.equal(r.store.records().length, 2);
  assert.equal(r.store.baseline('test', 'a.md')?.localSha256, sha('REMOTE'));
  assert.equal(str(f.files.get('a.md')!), 'REMOTE');
});
for (const stage of ['checkpoint-temp', 'checkpoint-publish', 'marker-temp', 'marker-publish'] as const) {
  test(`interrupted migration at ${stage} preserves the legacy original and resumes safely`, async () => {
    const f = storage(); const { name } = await legacy(f); const original = f.memory.files.get(name)!;
    const oldWrite = f.memory.fs.write, oldRename = f.memory.fs.rename;
    const matches = (path: string) => stage.startsWith('checkpoint') ? path.startsWith('sync-operations-v3-checkpoint-') : path.startsWith('sync-operations-v2-migrated.json');
    if (stage.endsWith('temp')) f.memory.fs.write = async (p, value) => { await oldWrite(p, value); if (matches(p)) throw new Error('migration interrupted'); };
    else f.memory.fs.rename = async (a, b) => { await oldRename(a, b); if (matches(b)) throw new Error('migration interrupted'); };
    await assert.rejects(write(f, 'new'), /interrupted|uncertain/);
    assert.equal(str(f.files.get('a.md')!), 'OLD'); assert(!f.files.has('new.md')); assert.equal(f.memory.files.get(name), original);
    f.memory.fs.write = oldWrite; f.memory.fs.rename = oldRename;
    const r = reopen(f); await r.mutations.recover('test'); assert.equal(r.store.records()[0].status, 'not-applied');
    await r.mutations.write('test', { id: 'resumed', planId: 'fresh-plan', path: 'new.md', before: MISSING, guard: () => {} }, ab('NEW'));
    assert.equal(str(f.files.get('a.md')!), 'OLD'); assert.equal(str(f.files.get('new.md')!), 'NEW');
  });
}
test('corrupt latest legacy state cannot be upgraded into empty or older history', async () => {
  const f = storage(), { name } = await legacy(f); f.memory.files.set(name, '{corrupt');
  await assert.rejects(write(f, 'new')); assert.equal(checkpoints(f).length, 0); assert(!f.files.has('new.md'));
});
test('a missing event within the replay tail blocks loading', async () => {
  const f = storage(1000); await write(f, 'one'); await write(f, 'two');
  f.memory.files.delete(events(f)[1]); const r = reopen(f);
  await assert.rejects(r.store.load(), /chain is broken/); assert.throws(() => r.store.records(), /must be loaded/);
});
test('a valid checksum cannot hide a wrong predecessor or illegal state transition', async () => {
  for (const fault of ['predecessor', 'transition']) {
    const f = storage(1000); await write(f, 'one');
    const tail = events(f).at(-1)!, previous = JSON.parse(f.memory.files.get(tail)!).sha256;
    const command = fault === 'transition' ? { kind: 'finish', id: 'one', status: 'not-applied' }
      : { kind: 'begin', record: { id: 'new', planId: 'p', namespace: 'test', kind: 'write', path: 'new.md', before: MISSING,
        after: await versionOf(ab('NEW')), status: 'committing', createdAt: 1 } };
    f.memory.files.set('sync-operations-v3-event-0000000000000003.json', seal({ version: 3, kind: 'event', sequence: 3,
      previous: fault === 'predecessor' ? '0'.repeat(64) : previous, command }));
    await assert.rejects(reopen(f).store.load(), /broken|terminal/); assert.equal(str(f.files.get('one.md')!), 'REMOTE');
  }
});
for (const missing of ['marker', 'checkpoint'] as const) {
  test(`a missing ${missing} cannot fall back to legacy or an empty ledger`, async () => {
    const f = storage(); await legacy(f); await write(f, 'new');
    if (missing === 'marker') f.memory.files.delete('sync-operations-v2-migrated.json');
    else for (const name of checkpoints(f)) f.memory.files.delete(name);
    await assert.rejects(reopen(f).store.load(), /missing/); assert.equal(str(f.files.get('new.md')!), 'REMOTE');
  });
}
test('corrupt latest checkpoint never falls back to the retained previous checkpoint', async () => {
  const f = storage(); await write(f, 'one'); await f.store.compact();
  assert.equal(checkpoints(f).length, 2); f.memory.files.set(checkpoints(f).at(-1)!, '{broken');
  await assert.rejects(reopen(f).store.load()); assert.equal(str(f.files.get('one.md')!), 'REMOTE');
});
test('checkpoint tip must agree with its retained anchor event', async () => {
  const f = storage(); await write(f, 'one'); await f.store.compact();
  const name = checkpoints(f).at(-1)!, value = JSON.parse(JSON.parse(f.memory.files.get(name)!).payload);
  value.tip = 'f'.repeat(64); f.memory.files.set(name, seal(value));
  await assert.rejects(reopen(f).store.load(), /tip mismatch/);
});
for (const acknowledged of [false, true]) {
  test(`uncertain checkpoint publication ${acknowledged ? 'after' : 'before'} rename is recoverable without replaying vault writes`, async () => {
    const f = storage(); await write(f, 'one'); const rename = f.memory.fs.rename;
    f.memory.fs.rename = async (a, b) => {
      if (b.startsWith('sync-operations-v3-checkpoint-')) { if (acknowledged) await rename(a, b); throw new Error('checkpoint interrupted'); }
      await rename(a, b);
    };
    await assert.rejects(f.store.compact(), /uncertain/); await assert.rejects(write(f, 'two'), /uncertain/);
    f.memory.fs.rename = rename; const count = f.operations.length, r = reopen(f);
    await r.mutations.recover('test'); assert.equal(f.operations.length, count); assert.equal(r.store.records()[0].status, 'applied');
  });
}
test('failed checkpoint preparation retains published deltas and permits a later retry', async () => {
  const f = storage(); await write(f, 'one'); const oldWrite = f.memory.fs.write;
  f.memory.fs.write = async (p, value) => { if (p.startsWith('sync-operations-v3-checkpoint-')) throw new Error('disk full'); await oldWrite(p, value); };
  await assert.rejects(f.store.compact(), /disk full/); assert.equal(f.store.records()[0].status, 'applied');
  f.memory.fs.write = oldWrite; await f.store.compact(); const r = reopen(f); await r.store.load(); assert.equal(r.store.records().length, 1);
});
for (const published of [false, true]) {
  test(`uncertain applied-event publication ${published ? 'after' : 'before'} rename recovers the commit without rewriting the file`, async () => {
    const f = storage(), rename = f.memory.fs.rename;
    f.memory.fs.rename = async (a, b) => {
      if (b === 'sync-operations-v3-event-0000000000000002.json') { if (published) await rename(a, b); throw new Error('finish interrupted'); }
      await rename(a, b);
    };
    await assert.rejects(write(f, 'one'), /uncertain/); assert.equal(str(f.files.get('one.md')!), 'REMOTE');
    f.memory.fs.rename = rename; const count = f.operations.length, r = reopen(f);
    await r.mutations.recover('test'); r.mutations.projectCache('test', f.cache);
    assert.equal(f.operations.length, count); assert.equal(f.cache.get('one.md')?.h, sha('REMOTE'));
    assert.equal(r.store.baseline('test', 'one.md')?.localSha256, sha('REMOTE'));
  });
}
test('an unverified previous checkpoint cannot authorize deleting metadata', async () => {
  const f = storage(); await write(f, 'one'); await f.store.compact(); await write(f, 'two');
  const previous = checkpoints(f).at(-1)!, original = f.memory.files.get(previous)!;
  f.memory.files.set(previous, '{corrupt'); await f.store.compact();
  assert(events(f).some(name => name.endsWith('0000000000000001.json')));
  const r = reopen(f); await r.store.load(); assert.equal(r.store.records().length, 2);
  f.memory.files.set(previous, original); await r.store.compact(); assert.equal(checkpoints(f).length, 2);
  assert(!events(f).some(name => name.endsWith('0000000000000001.json')));
});
test('a future checkpoint filename cannot authorize deleting verified history', async () => {
  const f = storage(); await write(f, 'one'); await f.store.compact(); await write(f, 'two');
  f.memory.files.set('sync-operations-v3-checkpoint-0000000000000999.json', '{corrupt'); await f.store.compact();
  assert(events(f).some(name => name.endsWith('0000000000000001.json')));
  await assert.rejects(reopen(f).store.load()); assert.equal(str(f.files.get('one.md')!), 'REMOTE');
});
test('interrupted metadata cleanup can resume without removing recovery objects or history', async () => {
  const f = storage(); await write(f, 'one'); await f.store.compact(); await write(f, 'two');
  const remove = f.memory.fs.remove; let calls = 0;
  f.memory.fs.remove = async p => { if (++calls === 2) throw new Error('cleanup interrupted'); await remove(p); };
  await f.store.compact(); f.memory.fs.remove = remove;
  const r = reopen(f); await r.store.load(); await r.store.compact();
  assert.equal(checkpoints(f).length, 2); assert.equal(r.store.records().length, 2);
  assert(events(f).every(p => Number(/(\d{16})\.json$/.exec(p)![1]) > 2));
});
test('compaction preserves incoming versions, applied baselines, deletion effects and recovery references', async () => {
  const f = storage(); await write(f, 'primary', 'a.md', 'A');
  await f.mutations.write('test', { id: 'incoming', planId: 'p', path: 'a.conflict-new.md', before: MISSING, guard: () => {},
    effect: { kind: 'set', remote: entry('a.md', 'B'), mode: 'incoming' } }, ab('B'));
  await f.store.compact(); assert.equal(f.store.baseline('test', 'a.md')?.localSha256, sha('A'));
  await f.mutations.move('test', { id: 'move', planId: 'p', path: 'b.md', before: await versionOf(ab('A')), guard: () => {},
    effect: { kind: 'move', from: 'a.md', to: 'b.md', entry: { h: sha('A'), s: 1, alg: 'sha256' } } }, 'a.md');
  assert.equal(f.store.baseline('test', 'b.md')?.remotePath, 'a.md');
  await f.store.compact();
  await f.mutations.delete('test', { id: 'delete', planId: 'p', path: 'b.md', before: await versionOf(ab('A')), guard: () => {},
    effect: { kind: 'delete', path: 'b.md' } }, false);
  await write(f, 'keep', 'keep.md', 'K'); await f.store.compact();
  const recoveryPaths = f.store.records().flatMap(r => r.recovery ? [r.recovery.path] : []), r = reopen(f);
  await r.store.load(); const cache = new ManifestCache(f.memory.fs, 'test'); cache.set('legacy.md', { h: sha('L'), s: 1, alg: 'sha256' });
  r.mutations.projectCache('test', cache); assert(cache.get('legacy.md')); assert(cache.get('keep.md')); assert(!cache.get('a.md')); assert(!cache.get('b.md'));
  assert.equal(r.store.baseline('test', 'keep.md')?.localSha256, sha('K')); assert.equal(r.store.baseline('test', 'b.md'), undefined);
  for (const record of r.store.records().filter(r => r.recovery)) await f.recovery.verify(record.recovery!);
  assert(recoveryPaths.every(p => f.files.has(p))); assert.equal(r.store.records().length, 5);
});
test('compaction cannot discard unresolved operations or recycle their IDs', async () => {
  const f = storage(), { record } = await legacy(f); await f.store.load(); await f.store.finish(record.id, 'blocked');
  await f.store.compact(); await write(f, 'other'); await f.store.compact();
  f.files.set('a.md', ab('LATEST')); const r = reopen(f); await assert.rejects(r.mutations.recover('test'), /needs review/);
  assert.equal(str(f.files.get('a.md')!), 'LATEST'); assert.equal(r.store.records().find(v => v.id === record.id)?.status, 'blocked');
  await assert.rejects(r.store.begin(record), /Duplicate/);
});
test('adaptive checkpoints bound metadata IO rather than rewriting cumulative history per event', async () => {
  const f = storage(256); let bytes = 0; const oldWrite = f.memory.fs.write;
  f.memory.fs.write = async (p, value) => { bytes += Buffer.byteLength(value); await oldWrite(p, value); };
  for (let i = 0; i < 500; i++) await write(f, `w${i}`, `f${i}.md`, 'x');
  assert(bytes < 2 * 1024 * 1024, `excessive metadata IO: ${bytes}`);
  const r = reopen(f); await r.store.load(); assert.equal(r.store.records().length, 500);
  assert.equal(r.store.baseline('test', 'f499.md')?.localSha256, sha('x'));
});
test('compaction preserves the history budget and cannot reuse finalized operation IDs', async () => {
  const f = storage(); f.store = new OperationStore(f.memory.fs, 2, { minimumCheckpointEvents: 1 });
  f.mutations = new DurableMutations(f.store, f.recovery, f.vault);
  await write(f, 'one'); await write(f, 'two'); await f.store.compact();
  await assert.rejects(write(f, 'three'), /budget/); assert(!f.files.has('three.md'));
  await assert.rejects(write(f, 'one', 'unrelated.md'), /Duplicate/); assert(!f.files.has('unrelated.md'));
  const r = reopen(f); await r.store.load(); assert.equal(r.store.records().length, 2);
});
test('editing during automatic checkpoint publication invalidates the following intention', async () => {
  const f = storage(1); await write(f, 'first', 'a.md', 'A'); const rename = f.memory.fs.rename;
  f.memory.fs.rename = async (a, b) => {
    await rename(a, b); if (b === 'sync-operations-v3-checkpoint-0000000000000002.json') f.files.set('a.md', ab('LATEST'));
  };
  await assert.rejects(f.mutations.write('test', { id: 'replace', planId: 'p', path: 'a.md', before: await versionOf(ab('A')), guard: () => {},
    effect: { kind: 'set', remote: entry('a.md'), mode: 'applied' } }, ab('REMOTE')), /changed/);
  assert.equal(str(f.files.get('a.md')!), 'LATEST'); assert.equal(f.store.records().find(record => record.id === 'replace')?.status, 'not-applied');
  assert.equal(f.store.baseline('test', 'a.md')?.localSha256, sha('A'));
  await reopen(f).mutations.recover('test'); assert.equal(str(f.files.get('a.md')!), 'LATEST');
});
test('automatic checkpoint failure precedes a new intention and preserves the previous commit', async () => {
  const f = storage(1); await write(f, 'first'); const writeFs = f.memory.fs.write;
  f.memory.fs.write = async (p, value) => { if (p.startsWith('sync-operations-v3-checkpoint-')) throw new Error('disk full'); await writeFs(p, value); };
  await assert.rejects(write(f, 'second'), /disk full/); assert(!f.files.has('second.md'));
  assert.equal(f.store.records().length, 1); assert.equal(f.store.records()[0].status, 'applied'); assert.equal(str(f.files.get('first.md')!), 'REMOTE');
});
test('real filesystem publication and compaction reopen with all applied baselines', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sync-operation-store-'));
  const fs: FileSystem = {
    read: async p => { try { return await readFile(join(directory, p), 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } },
    write: (p, value) => writeFile(join(directory, p), value), rename: (a, b) => rename(join(directory, a), join(directory, b)),
    exists: async p => { try { await access(join(directory, p)); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } },
    remove: p => unlink(join(directory, p)), list: () => readdir(directory),
  };
  try {
    const store = new OperationStore(fs, 10000, { minimumCheckpointEvents: 4 });
    for (let i = 0; i < 12; i++) {
      await store.begin({ id: `w${i}`, planId: 'p', namespace: 'test', kind: 'write', path: `f${i}.md`, before: MISSING,
        after: await versionOf(ab('x')), effect: { kind: 'set', remote: entry(`f${i}.md`, 'x'), mode: 'applied' }, status: 'committing', createdAt: 1 });
      await store.finish(`w${i}`, 'applied');
    }
    await store.compact(); const r = new OperationStore(fs); await r.load();
    assert.equal(r.records().length, 12); assert(r.records().every(record => record.status === 'applied'));
    assert.equal(r.baseline('test', 'f11.md')?.localSha256, sha('x'));
    assert.equal((await fs.list()).filter(name => name.startsWith('sync-operations-v3-checkpoint-')).length, 2);
    assert((await fs.list()).every(name => !name.endsWith('.tmp')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
