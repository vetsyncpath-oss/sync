import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationStore, type OperationRecord } from '../src/core/operation-store';
import { RecoveryStore } from '../src/core/recovery-store';
import { DurableMutations, type MutationRequest } from '../src/core/durable-mutations';
import { createOperationPlan } from '../src/core/operation-plan';
import { MISSING, versionOf, observeLocal } from '../src/core/local-version';
import { ManifestCache } from '../src/core/manifest-cache';
import { ab, str, sha, entry, fixture, deferred } from './helpers';

function request(id: string, path: string, before: MutationRequest['before']): MutationRequest {
  return { id, planId: 'plan', path, before, guard: () => {} };
}
function restart(f: ReturnType<typeof fixture>) {
  const store = new OperationStore(f.memory.fs);
  return { store, mutations: new DurableMutations(store, f.recovery, f.vault) };
}
test('primary write durably distinguishes applied bytes from an incoming version', async () => {
  const f = fixture(); f.own('a.md');
  await f.mutations.write('test', { ...request('w1', 'a.md', await observeLocal(f.vault, 'a.md')), effect: { kind: 'set', remote: entry('a.md'), mode: 'applied' } }, ab('REMOTE'));
  assert.equal(f.store.baseline('test', 'a.md')?.localSha256, sha('REMOTE'));
  assert.equal(f.store.records()[0].status, 'applied'); await f.recovery.verify(f.store.records()[0].recovery!);
  await f.mutations.write('test', { ...request('w2', 'a.conflict-new.md', MISSING), effect: { kind: 'set', remote: entry('a.md', 'INCOMING'), mode: 'incoming' } }, ab('INCOMING'));
  assert.equal(f.store.baseline('test', 'a.md')?.remote.hash, sha('REMOTE'));
  const reopened = restart(f); await reopened.store.load(); assert.equal(reopened.store.records().length, 2);
});
for (const kind of ['write', 'delete', 'move'] as const) {
  test(`crash after ${kind}, before applied persist, reconciles cache without repeating the operation`, async () => {
    const f = fixture(); f.own('a.md'); const before = await observeLocal(f.vault, 'a.md');
    const originalFinish = f.store.finish.bind(f.store);
    f.store.finish = async (id, status) => { if (status === 'applied') throw new Error('simulated crash'); await originalFinish(id, status); };
    const req = request('operation', kind === 'move' ? 'b.md' : 'a.md', before);
    if (kind === 'write') await assert.rejects(f.mutations.write('test', { ...req, effect: { kind: 'set', remote: entry('a.md'), mode: 'applied' } }, ab('REMOTE')), /crash/);
    if (kind === 'delete') await assert.rejects(f.mutations.delete('test', { ...req, effect: { kind: 'delete', path: 'a.md' } }, false), /crash/);
    if (kind === 'move') await assert.rejects(f.mutations.move('test', { ...req, effect: { kind: 'move', from: 'a.md', to: 'b.md', entry: f.cache.get('a.md') } }, 'a.md'), /crash/);
    const writes = f.operations.length, reopened = restart(f);
    const recovered = await reopened.mutations.recover('test'); assert.equal(recovered.length, 1); assert.equal(f.operations.length, writes);
    reopened.mutations.projectCache('test', f.cache);
    if (kind === 'write') assert.equal(f.cache.get('a.md')?.h, sha('REMOTE'));
    else assert.equal(f.cache.get('a.md'), undefined);
    if (kind === 'move') assert(f.cache.get('b.md'));
    assert.equal((await reopened.mutations.recover('test')).length, 0);
  });
}
test('crash before mutation retires the old intent and requires fresh planning', async () => {
  const f = fixture(); f.own('a.md');
  const recovery = await f.recovery.save(ab('LOCAL'));
  await f.store.begin({ id: 'old', planId: 'old-plan', namespace: 'test', path: 'a.md', kind: 'write', before: await versionOf(ab('LOCAL')),
    after: await versionOf(ab('REMOTE')), recovery, status: 'committing', createdAt: 1 });
  const reopened = restart(f); assert.equal((await reopened.mutations.recover('test')).length, 0);
  assert.equal(reopened.store.records()[0].status, 'not-applied'); assert.equal(str(f.files.get('a.md')!), 'LOCAL');
});
test('unknown third version blocks recovery and never overwrites it', async () => {
  const f = fixture(); const recovery = await f.recovery.save(ab('OLD'));
  await f.store.begin({ id: 'uncertain', planId: 'plan', namespace: 'test', path: 'a.md', kind: 'write', before: await versionOf(ab('OLD')),
    after: await versionOf(ab('REMOTE')), recovery, status: 'committing', createdAt: 1 });
  f.files.set('a.md', ab('LATEST')); const reopened = restart(f);
  await assert.rejects(reopened.mutations.recover('test'), /needs review/); assert.equal(str(f.files.get('a.md')!), 'LATEST');
  assert.equal(reopened.store.records()[0].status, 'blocked');
});
test('corrupt newest generation cannot roll back to an older valid ledger', async () => {
  const f = fixture(); await f.mutations.write('test', request('new', 'a.md', MISSING), ab('REMOTE'));
  const generations = [...f.memory.files.keys()].filter(p => p.startsWith('sync-operations-v3-event-') && p.endsWith('.json')).sort();
  assert.equal(generations.length, 2); f.memory.files.set(generations.at(-1)!, '{broken');
  await assert.rejects(restart(f).store.load()); assert.equal(str(f.files.get('a.md')!), 'REMOTE');
});
test('unloaded or malformed state cannot masquerade as an empty operation history', async () => {
  const f = fixture(); assert.throws(() => f.store.records(), /must be loaded/);
  assert.throws(() => f.store.baseline('test', 'a.md'), /must be loaded/);
  f.memory.files.set('sync-operations-v2-unrecognized.json', '{}');
  await assert.rejects(f.store.load(), /Unknown operation state/);
  assert.throws(() => f.store.records(), /must be loaded/);
});
test('an unpublished temporary generation is ignored and reserved IDs cannot mutate prototypes', async () => {
  const f = fixture(); f.memory.files.set('sync-operations-v2-0000000000000001.json.abcd.tmp', 'partial');
  await f.store.load(); assert.deepEqual(f.store.records(), []);
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    await assert.rejects(f.store.begin({ id, planId: 'plan', namespace: 'test', kind: 'write', path: 'a.md', before: MISSING,
      after: await versionOf(ab('NEW')), createdAt: 1, status: 'committing' }), /Invalid operation ID/);
  }
  await assert.rejects(f.store.finish('constructor', 'applied'), /Unknown operation/);
  assert.deepEqual(f.store.records(), []);
});
test('failed WAL preparation never touches the original', async () => {
  const f = fixture(); f.own('a.md'); f.memory.fs.write = async () => { throw new Error('disk full'); };
  await assert.rejects(f.mutations.write('test', request('replace', 'a.md', await observeLocal(f.vault, 'a.md')), ab('REMOTE')), /disk full/);
  assert.equal(str(f.files.get('a.md')!), 'LOCAL'); assert.equal(f.store.records().length, 0);
});
test('cancel after intent persistence prevents the physical commit', async () => {
  const f = fixture(); f.own('a.md'); let cancelled = false; const begin = f.store.begin.bind(f.store);
  f.store.begin = async record => { await begin(record); cancelled = true; };
  await assert.rejects(f.mutations.write('test', { ...request('cancel', 'a.md', await observeLocal(f.vault, 'a.md')),
    guard: () => { if (cancelled) throw new DOMException('cancelled', 'AbortError'); } }, ab('REMOTE')), { name: 'AbortError' });
  assert.equal(str(f.files.get('a.md')!), 'LOCAL'); assert.equal(f.store.records()[0].status, 'not-applied');
});
test('an atomic stale rejection retires intent without blocking later recovery', async () => {
  const f = fixture(); f.own('a.md'); f.vault.compareAndWrite = async () => { f.files.set('a.md', ab('LATEST')); return false; };
  await assert.rejects(f.mutations.write('test', request('stale', 'a.md', await observeLocal(f.vault, 'a.md')), ab('REMOTE')), /changed/);
  assert.equal(f.store.records()[0].status, 'not-applied'); await restart(f).mutations.recover('test'); assert.equal(str(f.files.get('a.md')!), 'LATEST');
});
test('corrupt recovery object blocks deletion even if its filename is correct', async () => {
  const f = fixture(); f.own('a.md'); const ref = await f.recovery.save(ab('LOCAL')); f.files.set(ref.path, ab('WRONG'));
  await assert.rejects(f.mutations.delete('test', request('delete', 'a.md', await observeLocal(f.vault, 'a.md')), false), /verification/);
  assert(f.files.has('a.md')); await f.store.load(); assert.equal(f.store.records().length, 0);
});
test('recovery budget exhaustion keeps original and does not reclaim earlier copies', async () => {
  const f = fixture(); const recovery = new RecoveryStore(f.vault, '.obsidian/plugins/sync/limited', 4);
  await recovery.save(ab('1234')); await assert.rejects(recovery.save(ab('5')), /budget/);
  assert.equal([...f.files].filter(([p]) => p.startsWith(recovery.root)).length, 1);
});
test('concurrent store updates merge records and publish serialized generations', async () => {
  const f = fixture(); const entered = deferred(), release = deferred(); const write = f.memory.fs.write; let calls = 0;
  f.memory.fs.write = async (p, value) => { await write(p, value); if (++calls === 1) { entered.resolve(); await release.promise; } };
  const first = f.mutations.write('test', request('one', 'a.md', MISSING), ab('A')); await entered.promise;
  const second = f.mutations.write('test', request('two', 'b.md', MISSING), ab('B')); release.resolve();
  await Promise.all([first, second]); const reopened = restart(f); await reopened.store.load();
  assert.deepEqual(reopened.store.records().map(r => r.id).sort(), ['one', 'two']); assert(reopened.store.records().every(r => r.status === 'applied'));
});
test('publication with an uncertain result poisons the old writer rather than reusing its sequence', async () => {
  const f = fixture(); const rename = f.memory.fs.rename;
  f.memory.fs.rename = async (a, b) => { await rename(a, b); if (b.startsWith('sync-operations-v3-event-')) throw new Error('lost acknowledgement'); };
  await assert.rejects(f.mutations.write('test', request('first', 'a.md', MISSING), ab('A')), /uncertain/);
  await assert.rejects(f.mutations.write('test', request('second', 'b.md', MISSING), ab('B')), /uncertain/);
  assert(!f.files.has('a.md')); assert(!f.files.has('b.md'));
  f.memory.fs.rename = rename; const reopened = restart(f); await reopened.mutations.recover('test');
  assert.equal(reopened.store.records()[0].status, 'not-applied');
});
test('plan compilation is immutable and snapshots all mutable inputs', async () => {
  const remote = entry('a.md'); const observations = new Map([['a.md', MISSING]]);
  const plan = createOperationPlan({ id: 'plan', downloads: [remote], deletions: [], moves: [], observations, cache: {}, remotePaths: new Map(), levels: new Map(), immutableInventory: true, trigger: 'manual' });
  remote.hash = sha('WRONG!'); observations.set('a.md', await versionOf(ab('NEW')));
  assert.equal(plan.downloads[0].entry.hash, sha('REMOTE')); assert.equal(plan.downloads[0].expected.kind, 'missing');
  assert.throws(() => { (plan.downloads as unknown as unknown[]).push('invalid'); }); assert(Object.isFrozen(plan.downloads[0].entry));
});
test('move dependencies expect the source bytes at the subsequent write target', async () => {
  const source = await versionOf(ab('LOCAL'));
  const plan = createOperationPlan({ id: 'plan', downloads: [entry('new/a.md')], moves: [{ from: 'old/a.md', to: 'new/a.md' }], deletions: [],
    observations: new Map([['old/a.md', source], ['new/a.md', MISSING]]), cache: {}, remotePaths: new Map([['new/a.md', 'remote/a.md']]), levels: new Map(), immutableInventory: true, trigger: 'manual' });
  assert.deepEqual(plan.downloads[0].expected, source); assert.equal(plan.downloads[0].remotePath, 'remote/a.md');
});
test('a cache projection after restart cannot import another namespace', async () => {
  const f = fixture(); await f.mutations.write('other', { ...request('other-write', 'a.md', MISSING), effect: { kind: 'set', remote: entry('a.md'), mode: 'applied' } }, ab('REMOTE'));
  const cache = new ManifestCache(f.memory.fs, 'test'); const reopened = restart(f); await reopened.store.load();
  reopened.mutations.projectCache('test', cache); assert.deepEqual(cache.entries(), {});
});
