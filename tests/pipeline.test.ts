import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPolicy, EMPTY_POLICY } from '../src/core/policy';
import { ab, str, entry, fixture, deferred, pathPolicy } from './helpers';
import { OperationStore } from '../src/core/operation-store';
import { DurableMutations } from '../src/core/durable-mutations';
import { ManifestCache } from '../src/core/manifest-cache';
import { Coordinator } from '../src/core/coordinator';

test('verified download updates the vault and baseline', async () => {
  const f = fixture([entry('a.md')]); const result = await f.coordinator.sync();
  assert.equal(result?.outcome, 'ok'); assert.equal(result?.downloaded, 1);
  assert.equal(str(f.files.get('a.md')!), 'REMOTE'); assert.equal(f.cache.get('a.md')?.h, entry('a.md').hash);
});
test('an edit after preview invalidates full replacement without changing the baseline', async () => {
  const f = fixture([entry('a.md')], 'full'); f.own('a.md');
  f.ui.confirmSync = async () => { f.files.set('a.md', ab('LATEST')); return true; };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.equal(str(f.files.get('a.md')!), 'LATEST');
  assert.equal(f.cache.get('a.md')?.h, entry('a.md', 'LOCAL').hash); assert.equal(f.store.baseline('test', 'a.md'), undefined);
});
test('an edit after preview invalidates deletion and keeps ownership', async () => {
  const f = fixture([], 'light'); f.own('gone.md');
  f.ui.confirmSync = async () => { f.files.set('gone.md', ab('LATEST')); return true; };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.equal(str(f.files.get('gone.md')!), 'LATEST'); assert(f.cache.get('gone.md'));
});
test('configuration revision changed during preview cancels every planned commit', async () => {
  const f = fixture([entry('a.md')], 'light'); f.own('gone.md'); let revision = 1, fetches = 0;
  f.deps.options.configurationRevision = () => revision;
  f.source.fetch = async () => { fetches++; return ab('REMOTE'); };
  f.ui.confirmSync = async () => { revision++; return true; };
  assert.equal((await f.coordinator.sync())?.outcome, 'cancelled'); assert.equal(fetches, 0); assert(f.cache.get('gone.md')); assert.deepEqual(f.operations, []);
});
test('a source prepared under an old revision cannot fetch a new session inventory', async () => {
  const f = fixture([entry('a.md')]); f.deps.options.preparedRevision = () => 1; f.deps.options.configurationRevision = () => 2;
  let requests = 0; f.source.getManifest = async () => { requests++; return [entry('a.md')]; };
  assert.equal((await f.coordinator.sync())?.outcome, 'cancelled'); assert.equal(requests, 0);
});
test('missing-file scan rejects a configuration change and releases its session', async () => {
  const f = fixture([entry('a.md')]); let revision = 1;
  f.deps.options.configurationRevision = () => revision;
  f.source.getManifest = async () => { revision++; return [entry('a.md')]; };
  await assert.rejects(f.coordinator.collectMissing(), { name: 'AbortError' });
  assert(!f.coordinator.isRunning()); assert.deepEqual(f.operations, []);
  f.source.getManifest = async () => [entry('a.md')]; assert.deepEqual(await f.coordinator.collectMissing(), ['a.md']);
});
test('a preview cannot mutate the remote metadata used by the accepted plan', async () => {
  const remote = entry('a.md'); const f = fixture([remote]);
  f.ui.confirmSync = async () => { remote.hash = entry('a.md', 'WRONG!').hash; remote.path = 'unplanned.md'; return true; };
  assert.equal((await f.coordinator.sync())?.outcome, 'ok'); assert.equal(f.cache.get('a.md')?.h, entry('a.md').hash); assert(!f.files.has('unplanned.md'));
});
test('full reconciles local drift even when remote and cached versions are unchanged', async () => {
  const f = fixture([entry('a.md')], 'full'); f.own('a.md', 'REMOTE'); f.files.set('a.md', ab('LOCAL EDIT'));
  const result = await f.coordinator.sync(); assert.equal(result?.outcome, 'ok'); assert.equal(result?.downloaded, 1);
  assert.equal(str(f.files.get('a.md')!), 'REMOTE'); assert.equal(f.store.baseline('test', 'a.md')?.localSha256, entry('a.md').hash);
  assert([...f.files.values()].some(bytes => str(bytes) === 'LOCAL EDIT'));
});
test('weak remote versions use real applied bytes and incoming copies never advance that baseline', async () => {
  let remote = { path: 'a.md', hashAlg: 'etag' as const, hash: 'v1', size: 1 }, content = 'A';
  const f = fixture([remote], 'light'); f.source.getManifest = async () => [remote]; f.source.fetch = async () => ab(content);
  assert.equal((await f.coordinator.sync())?.outcome, 'ok');
  remote = { ...remote, hash: 'v2' }; content = 'B';
  const update = await f.coordinator.sync(); assert.equal(update?.conflicts, 0); assert.equal(str(f.files.get('a.md')!), 'B');
  const baseline = f.store.baseline('test', 'a.md')!; assert.equal(baseline.remote.hash, 'v2'); assert.equal(baseline.confidence, 'observed');
  f.files.set('a.md', ab('C')); remote = { ...remote, hash: 'v3' }; content = 'D';
  assert.equal((await f.coordinator.sync())?.conflicts, 1); assert.equal(str(f.files.get('a.md')!), 'C');
  assert.equal(f.store.baseline('test', 'a.md')?.localSha256, baseline.localSha256); assert.equal(f.store.baseline('test', 'a.md')?.remote.hash, 'v2');
});
test('applied state repairs a lost legacy checkpoint without redownloading', async () => {
  const f = fixture([entry('a.md')]); f.cache.flush = async () => { throw new Error('checkpoint disk failure'); };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.equal(str(f.files.get('a.md')!), 'REMOTE');
  const cache = new ManifestCache(f.memory.fs, 'test'); await cache.load();
  const store = new OperationStore(f.memory.fs); f.deps.cache = cache; f.deps.mutations = new DurableMutations(store, f.recovery, f.vault);
  f.source.fetch = async () => { assert.fail('already applied download'); };
  assert.equal((await new Coordinator(f.deps).sync())?.outcome, 'ok'); assert.equal(cache.get('a.md')?.h, entry('a.md').hash);
});
test('incoming commit recovered after a crash does not create another conflict copy', async () => {
  const f = fixture([entry('a.md')], 'light'); f.own('a.md', 'OLD'); f.files.set('a.md', ab('LOCAL'));
  f.store.finish = async () => { throw new Error('crash after incoming'); };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.equal(str(f.files.get('a.md')!), 'LOCAL');
  const copies = [...f.files.keys()].filter(p => p.includes('.conflict-'));
  f.deps.mutations = new DurableMutations(new OperationStore(f.memory.fs), f.recovery, f.vault);
  f.source.fetch = async () => { assert.fail('incoming was already received'); };
  assert.equal((await new Coordinator(f.deps).sync())?.outcome, 'ok'); assert.equal(f.queue.size(), 0);
  assert.deepEqual([...f.files.keys()].filter(p => p.includes('.conflict-')), copies); assert.equal(str(f.files.get('a.md')!), 'LOCAL');
});
test('invalid concurrency cannot silently skip downloads and permit deletions', async () => {
  const f = fixture([entry('a.md')], 'light'); f.own('gone.md'); f.deps.options.concurrency = NaN;
  f.source.fetch = async () => ab('WRONG!');
  const result = await f.coordinator.sync(); assert.equal(result?.outcome, 'error'); assert.equal(result?.deleted, 0); assert(f.files.has('gone.md'));
});
test('an unexpected worker error stops the session before deletion', async () => {
  const f = fixture([entry('a.md')], 'light'); f.own('gone.md');
  f.ui.setStatus = (_state, progress) => { if (progress?.bytesTransferred !== undefined) throw new Error('host progress failed'); };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert(f.files.has('gone.md')); assert(f.cache.get('gone.md'));
});
test('wrong bytes with the correct length cannot overwrite or authorize deletion', async () => {
  const f = fixture([entry('a.md')], 'light'); f.own('gone.md'); f.source.fetch = async () => ab('WRONG!');
  const result = await f.coordinator.sync();
  assert.equal(result?.outcome, 'error'); assert.equal(result?.failed, 1); assert.equal(result?.deleted, 0);
  assert(!f.files.has('a.md')); assert.equal(f.cache.get('a.md'), undefined);
  assert(f.files.has('gone.md')); assert(f.cache.get('gone.md')); assert.equal(result?.deferredDeletions, 1);
});
test('ambiguous manifest aborts the entire session without mutation', async () => {
  const f = fixture([entry('A.md'), entry('a.md')], 'light'); f.own('gone.md');
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.deepEqual(f.operations, []); assert(f.cache.get('gone.md'));
});
test('cancel while a conflict question is pending leaves both vault and cache intact', async () => {
  const f = fixture([entry('a.md')]); f.files.set('a.md', ab('LOCAL'));
  const asked = deferred(), answer = deferred<'remote-wins'>();
  f.conflict.setStrategy('ask'); f.resolverDeps.ui = { askConflict: async () => { asked.resolve(); return answer.promise; } };
  const run = f.coordinator.sync(); await asked.promise; f.coordinator.cancel(); answer.resolve('remote-wins');
  assert.equal((await run)?.outcome, 'cancelled'); assert.equal(str(f.files.get('a.md')!), 'LOCAL');
  assert.deepEqual(f.operations, []); assert.equal(f.cache.get('a.md'), undefined);
});
test('an edit saved while the question is open invalidates replacement and remains recoverable', async () => {
  const f = fixture([entry('a.md')]); f.files.set('a.md', ab('OLD LOCAL'));
  const asked = deferred(), answer = deferred<'keep-both'>();
  f.conflict.setStrategy('ask'); f.resolverDeps.ui = { askConflict: async () => { asked.resolve(); return answer.promise; } };
  const run = f.coordinator.sync(); await asked.promise; f.files.set('a.md', ab('NEW LOCAL')); answer.resolve('keep-both');
  assert.equal((await run)?.outcome, 'error'); assert.equal(str(f.files.get('a.md')!), 'NEW LOCAL'); assert.equal(f.cache.get('a.md'), undefined);
  assert([...f.files].some(([p, b]) => p.includes('.conflict-') && str(b) === 'NEW LOCAL'));
});
for (const mode of ['remote-wins', 'full'] as const) {
  test(`${mode} preserves a recovery copy before replacement`, async () => {
    const f = fixture([entry('a.md')], mode === 'full' ? 'full' : 'fetch');
    f.conflict.setStrategy('remote-wins'); f.files.set('a.md', ab('LOCAL'));
    assert.equal((await f.coordinator.sync())?.outcome, 'ok');
    assert.equal(str(f.files.get('a.md')!), 'REMOTE');
    assert([...f.files].some(([p, b]) => p.includes('.conflict-') && str(b) === 'LOCAL'));
  });
}
test('a recovery write failure preserves the original', async () => {
  const f = fixture([entry('a.md')], 'full'); f.files.set('a.md', ab('LOCAL'));
  f.vault.writeBinary = async () => { throw new Error('disk full'); };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.equal(str(f.files.get('a.md')!), 'LOCAL');
  assert.equal(f.cache.get('a.md'), undefined);
});
test('an edit saved during the recovery write prevents replacement', async () => {
  const f = fixture([entry('a.md')], 'full'); f.files.set('a.md', ab('LOCAL'));
  const write = f.vault.writeBinary;
  f.vault.writeBinary = async (p, b) => { await write(p, b); if (p.includes('.conflict-')) f.files.set('a.md', ab('LATEST')); };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.equal(str(f.files.get('a.md')!), 'LATEST');
  assert.equal(f.cache.get('a.md'), undefined);
});
test('a host compare-and-write rejection does not fall back to unsafe replacement', async () => {
  const f = fixture([entry('a.md')]); f.own('a.md');
  f.vault.compareAndWrite = async () => { f.files.set('a.md', ab('LATEST')); return false; };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.equal(str(f.files.get('a.md')!), 'LATEST');
  assert.equal(f.cache.get('a.md')?.h, entry('a.md', 'LOCAL').hash);
});
test('identical bytes require no write, even if an edit arrives during hashing', async () => {
  const f = fixture([entry('a.md')]); f.files.set('a.md', ab('REMOTE'));
  const hash = f.resolverDeps.sha256;
  f.resolverDeps.sha256 = async b => { f.files.set('a.md', ab('LATEST')); return hash(b); };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.equal(str(f.files.get('a.md')!), 'LATEST'); assert.deepEqual(f.operations, []);
});
test('failed deletion keeps ownership and is retried with recovery on the next manual run', async () => {
  const f = fixture([], 'light'); f.own('gone.md'); const remove = f.vault.remove;
  f.vault.remove = async () => { throw new Error('permission denied'); };
  const first = await f.coordinator.sync(); assert.equal(first?.outcome, 'error'); assert.equal(first?.failed, 1); assert(f.cache.get('gone.md'));
  f.vault.remove = remove;
  const second = await f.coordinator.sync(); assert.equal(second?.outcome, 'ok'); assert.equal(second?.deleted, 1);
  assert(!f.files.has('gone.md')); assert.equal(f.cache.get('gone.md'), undefined);
  assert([...f.files.values()].some(b => str(b) === 'LOCAL'));
});
test('forced retry does not discard unresolved orphan ownership', async () => {
  const f = fixture([], 'light'); f.own('gone.md');
  await f.coordinator.sync({ forcedPaths: new Set(['another.md']) }); assert(f.files.has('gone.md')); assert(f.cache.get('gone.md'));
  assert.equal((await f.coordinator.sync())?.deleted, 1);
});
for (const level of ['fetch', 'light'] as const) {
  test(`preview distinguishes retained orphans from planned removals in ${level}`, async () => {
    const f = fixture([], level); f.own('gone.md');
    // Add one new download so fetch also reaches the preview.
    f.source.getManifest = async () => [entry('a.md')];
    f.ui.confirmSync = async info => {
      assert.equal(info.toDelete, level === 'light' ? 1 : 0);
      assert.equal(info.orphans, level === 'fetch' ? 1 : 0); return false;
    };
    assert.equal(await f.coordinator.sync(), null); assert(f.files.has('gone.md')); assert(f.cache.get('gone.md')); assert.deepEqual(f.operations, []);
  });
}
test('force resync retains the last applied baseline', async () => {
  const f = fixture([entry('a.md')]); f.own('a.md', 'REMOTE');
  assert.equal((await f.coordinator.forceResync())?.outcome, 'ok'); assert.equal(f.cache.get('a.md')?.h, entry('a.md').hash);
  assert.deepEqual(f.operations, []);
});
test('a no-op with outstanding failures reports attention rather than success', async () => {
  const f = fixture(); f.queue.add(entry('gone.md'), 'offline', 0);
  const result = await f.coordinator.sync(); assert.equal(result?.outcome, 'error'); assert.equal(result?.failed, 1);
  assert(!f.notices.includes('current')); assert.equal(f.queue.size(), 1);
});
test('a parked download still prevents unrelated mirror deletion', async () => {
  const f = fixture([entry('a.md')], 'light'); f.own('gone.md');
  f.queue.add(entry('a.md'), 'offline', 0); f.queue.add(entry('a.md'), 'offline', 1);
  const result = await f.coordinator.sync(); assert.equal(result?.outcome, 'error'); assert.equal(result?.deleted, 0);
  assert.equal(result?.deferredDeletions, 1); assert(f.cache.get('gone.md')); assert(f.files.has('gone.md'));
});
test('rejecting the preview does not discard a previous-version failure', async () => {
  const f = fixture([entry('a.md')]); const old = entry('a.md', 'OLD');
  f.queue.add(old, 'offline', 0); f.queue.add(old, 'offline', 1); f.ui.confirmSync = async () => false;
  assert.equal(await f.coordinator.sync(), null); assert.equal(f.queue.all()[0].hash, old.hash); assert(f.queue.all()[0].poisoned);
});
test('failed approved rename cannot authorize downloads or deletions', async () => {
  const f = fixture([entry('old/a.md')], 'light'); f.own('old/a.md', 'REMOTE'); f.own('gone.md');
  f.deps.syncPolicy = { version: 1, mirror: false, folders: [{ path: 'old', include: 'include', target: { kind: 'move', localPath: 'new' } }] };
  f.vault.rename = async () => { throw new Error('permission denied'); };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert(f.cache.get('old/a.md')); assert(f.cache.get('gone.md'));
  assert(!f.files.has('new/a.md')); assert(f.files.has('old/a.md'));
  assert(!f.operations.some(operation => operation.startsWith('rename ') || operation.startsWith('delete ')));
});
test('edits during deletion recovery preserve the current file and baseline', async () => {
  const f = fixture([], 'light'); f.own('gone.md'); const write = f.vault.writeBinary;
  f.vault.writeBinary = async (p, b) => { await write(p, b); f.files.set('gone.md', ab('LATEST')); };
  const result = await f.coordinator.sync(); assert.equal(result?.outcome, 'error'); assert.equal(result?.deleted, 0);
  assert.equal(str(f.files.get('gone.md')!), 'LATEST'); assert(f.cache.get('gone.md'));
});
for (const parked of [false, true]) {
  test(`auto respects ${parked ? 'parked entries' : 'retry backoff'}`, async () => {
    const f = fixture([entry('a.md')]); f.queue.add(entry('a.md'), 'offline', Date.now());
    f.queue.add(entry('a.md'), 'offline', Date.now());
    if (!parked) { const item = f.queue.all()[0]; f.queue.clear(); f.queue.mergeBack([{ ...item, poisoned: false, nextRetryAt: Date.now() + 60000 }]); }
    let calls = 0; f.source.fetch = async () => { calls++; return ab('REMOTE'); };
    assert.equal((await f.coordinator.sync({ trigger: 'auto' }))?.outcome, 'error'); assert.equal(calls, 0);
    assert.equal((await f.coordinator.sync({ forceAll: true }))?.outcome, 'ok'); assert.equal(calls, 1);
  });
}
test('rejecting the preview cannot rename a file', async () => {
  const f = fixture([entry('old/a.md')]); f.own('old/a.md', 'REMOTE');
  f.deps.syncPolicy = { version: 1, mirror: false, folders: [{ path: 'old', include: 'include', target: { kind: 'move', localPath: 'new' } }] };
  f.ui.confirmSync = async () => false;
  assert.equal(await f.coordinator.sync(), null); assert(f.files.has('old/a.md')); assert(!f.files.has('new/a.md')); assert.deepEqual(f.operations, []);
});
test('matching content is insufficient provenance to rename an unrelated path', () => {
  const a = entry('unchanged/a.md'), b = entry('source/b.md');
  const result = applyPolicy([a, b], { version: 1, mirror: false, folders: [{ path: 'source', include: 'include', target: { kind: 'move', localPath: 'target' } }] }, pathPolicy(), ['unchanged/a.md'], { cacheHashes: new Map([['unchanged/a.md', `sha256:${a.hash}`]]) });
  assert.deepEqual(result.toMove, []);
});
test('orphan planning protects disallowed scripts and the entire plugin runtime', () => {
  const p = pathPolicy(['.obsidian/plugins/sync']);
  const result = applyPolicy([], EMPTY_POLICY, p, ['.obsidian/plugins/other/main.js', '.obsidian/plugins/sync/manifest-x.json'], { mirrorLevel: 'light' });
  assert.deepEqual(result.mirrorPlan.deletions, []);
  assert(!p.isPathAllowed('.Obsidian/Plugins/SYNC/data.json'));
});
test('a mapping into a protected runtime directory aborts without mutation', async () => {
  const f = fixture([entry('notes/data.json')]); f.deps.policy = pathPolicy(['.obsidian/plugins/sync']);
  f.deps.syncPolicy = { version: 1, mirror: false, folders: [{ path: 'notes', include: 'include', target: { kind: 'move', localPath: '.obsidian/plugins/sync' } }] };
  assert.equal((await f.coordinator.sync())?.outcome, 'error'); assert.deepEqual(f.operations, []);
});
test('unverified inventories cannot authorize deletion even in a manual run', async () => {
  const f = fixture([], 'light'); f.own('gone.md'); f.deps.source = { ...f.source, deletionSafety: 'unverified' };
  f.ui.confirmSync = async info => { assert.equal(info.toDelete, 0); assert.equal(info.orphans, 0); assert.equal(info.blockedDeletions, 1); return true; };
  const result = await f.coordinator.sync(); assert.equal(result?.outcome, 'error'); assert.equal(result?.blockedDeletions, 1);
  assert.equal(result?.deleted, 0); assert(f.files.has('gone.md')); assert(f.cache.get('gone.md')); assert(f.notices.includes('blocked 1'));
});
test('auto never applies light deletions hidden inside a full policy', async () => {
  const f = fixture([], 'full'); f.own('notes/a.md'); f.dirs.add('notes');
  f.deps.syncPolicy = { version: 1, mirror: false, folders: [], mirrorFolders: { notes: { state: 'custom', level: 'light' } } };
  f.ui.confirmSync = async () => { assert.fail('background confirmation'); };
  const result = await f.coordinator.sync({ trigger: 'auto' });
  assert.equal(result?.deferredDeletions, 1); assert.equal(result?.deleted, 0); assert.equal(result?.outcome, 'error'); assert(f.cache.get('notes/a.md'));
});
test('full deletion only removes enumerated files and preserves a newly created child', async () => {
  const f = fixture([], 'full'); f.dirs.add('extra'); f.files.set('extra/old.md', ab('OLD'));
  f.ui.confirmSync = async () => { f.files.set('extra/new.md', ab('NEW')); return true; };
  const result = await f.coordinator.sync(); assert.equal(result?.deleted, 1); assert(f.files.has('extra/new.md'));
  assert(!f.operations.includes('delete extra')); assert([...f.files.keys()].some(p => p.includes('.conflict-')));
});
test('full scans a selected child under an excluded parent without deleting excluded siblings', async () => {
  const f = fixture(); f.dirs.add('parent'); f.dirs.add('parent/selected');
  f.files.set('parent/selected/extra.md', ab('EXTRA')); f.files.set('parent/keep.md', ab('KEEP'));
  f.deps.syncPolicy = { version: 1, mirror: false, folders: [], mirrorFolders: {
    parent: { state: 'off' }, 'parent/selected': { state: 'custom', level: 'full' },
  } };
  const result = await f.coordinator.sync(); assert.equal(result?.outcome, 'ok'); assert.equal(result?.deleted, 1);
  assert(!f.files.has('parent/selected/extra.md')); assert.equal(str(f.files.get('parent/keep.md')!), 'KEEP');
});
for (const stage of ['persist', 'dispose'] as const) {
  test(`session ownership is retained until final ${stage} finishes`, async () => {
    const f = fixture(); const entered = deferred(), release = deferred(); let calls = 0;
    if (stage === 'persist') f.deps.options.persistState = async () => { if (++calls === 2) { entered.resolve(); await release.promise; } };
    else f.source.dispose = async () => { entered.resolve(); await release.promise; };
    const run = f.coordinator.sync(); await entered.promise;
    assert(f.coordinator.isRunning()); assert.equal(await f.coordinator.sync(), null);
    release.resolve(); await run; assert(!f.coordinator.isRunning());
  });
}
