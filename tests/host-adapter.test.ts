import test from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import Plugin from '../main';
import type { VaultAdapter, SyncSource } from '../src/sources/types';
import { ab, deferred, fixture, entry } from './helpers';

// Exercises the real plugin adapter with a narrow host mock, without onload,
// authentication or an actual Obsidian runtime.
function hostAdapter() {
  let text = 'OLD', extension = 'md', processCalls = 0;
  let beforeProcess = () => {};
  const plugin = Object.create(Plugin.prototype) as Plugin;
  plugin.app = { vault: {
    adapter: {},
    getFileByPath: () => ({ extension }),
    process: async (_file: unknown, callback: (current: string) => string) => {
      processCalls++; beforeProcess(); text = callback(text);
    },
  } } as unknown as App;
  const vault = (plugin as unknown as { makeVaultAdapter(): VaultAdapter }).makeVaultAdapter();
  return {
    vault, text: () => text, calls: () => processCalls,
    edit: (next: string) => { text = next; },
    extension: (next: string) => { extension = next; },
    beforeProcess: (callback: () => void) => { beforeProcess = callback; },
  };
}
test('host Markdown adapter compares inside process and rejects a newer saved version', async () => {
  const f = hostAdapter();
  assert.equal(await f.vault.compareAndWrite!('a.md', ab('REMOTE'), ab('OLD')), true); assert.equal(f.text(), 'REMOTE');
  f.edit('LATEST');
  assert.equal(await f.vault.compareAndWrite!('a.md', ab('REMOTE'), ab('OLD')), false); assert.equal(f.text(), 'LATEST');
});
test('host adapter checks cancellation in process and leaves unsupported bytes untouched', async () => {
  const f = hostAdapter(), controller = new AbortController();
  f.beforeProcess(() => controller.abort());
  await assert.rejects(f.vault.compareAndWrite!('a.md', ab('REMOTE'), ab('OLD'), controller.signal), { name: 'AbortError' });
  assert.equal(f.text(), 'OLD');
  const invalidUtf8 = new Uint8Array([0xff]).buffer;
  assert.equal(await f.vault.compareAndWrite!('a.md', invalidUtf8, ab('OLD')), undefined);
  f.extension('png'); assert.equal(await f.vault.compareAndWrite!('a.png', ab('REMOTE'), ab('OLD')), undefined);
  assert.equal(f.calls(), 1); assert.equal(f.text(), 'OLD');
});

test('plugin session ownership spans preparation and journal finalization', async () => {
  const plugin = Object.create(Plugin.prototype) as Plugin;
  const ready = deferred(), release = deferred(); let entries = 0;
  const port = plugin as unknown as {
    runSession(trigger: 'manual', fn: () => Promise<null>): Promise<unknown>;
    runOwnedSession(): Promise<null>;
  };
  port.runOwnedSession = async () => { entries++; ready.resolve(); await release.promise; return null; };
  const first = port.runSession('manual', async () => null); await ready.promise;
  assert.equal(await port.runSession('manual', async () => null), null); assert.equal(entries, 1);
  release.resolve(); await first; await port.runSession('manual', async () => null); assert.equal(entries, 2);
});

function preparationHost() {
  const f = fixture(), plugin = Object.create(Plugin.prototype) as Plugin;
  const values = { repoUrl: 'https://github.com/test/repo', branch: 'main', accessToken: 'old-token' };
  let source!: SyncSource, cacheSwaps = 0, authorization = '';
  const settings = { mirrorLevel: 'fetch', syncPolicies: {}, conflictStrategy: 'keep-both', lightConflictStrategy: 'keep-local',
    syncMode: 'full-vault', allowedFolders: [] as string[], ignoredFolders: [] as string[], allowPlugins: false, allowSnippets: false, useTrash: false, lastSyncTime: 0 };
  Object.assign(plugin, {
    settings, cache: f.cache, fsAdapter: f.memory.fs, conflictResolver: f.conflict,
    builtKind: 'git', builtSourceId: 'test', builtEngineConfigKey: JSON.stringify(values),
    configurationEpoch: 0, configurationKey: '', preparedConfigRevision: 0,
    desiredSourceKind: () => 'git', engineValues: () => ({ ...values }), makeSourceId: () => 'test',
    makePolicy: () => f.deps.policy, migrateLegacyShas: async () => {}, gcKeepSet: () => new Set(['test']),
    statusBar: { setMirrorLevel: () => {} },
    engineCtx: () => ({ transport: { fetch: async (_url: string, options: { headers?: Record<string, string> }) => {
      authorization = options.headers?.Authorization ?? '';
      return { status: 200, headers: {}, arrayBuffer: async () => ab('REMOTE'), text: async () => 'REMOTE' };
    } } }),
    coordinator: { isRunning: () => false, setSource: async (next: SyncSource) => { source = next; },
      setCache: () => { cacheSwaps++; }, setPolicy: () => {}, setSyncPolicy: () => {} },
  });
  const port = plugin as unknown as { prepareSession(): Promise<void>; getConfigurationRevision(): number; preparedConfigRevision: number; cache: unknown };
  return { f, port, values, settings, source: () => source, swaps: () => cacheSwaps, authorization: () => authorization };
}
test('credential rotation rebuilds the real Git adapter without discarding the cache', async () => {
  const h = preparationHost(); h.f.own('a.md'); h.values.accessToken = 'fresh-token';
  await h.port.prepareSession();
  await h.source().fetch(entry('a.md'), new AbortController().signal);
  assert.equal(h.authorization(), 'token fresh-token'); assert.equal(h.swaps(), 0); assert.equal(h.port.cache, h.f.cache);
  assert(h.f.cache.get('a.md')); assert.equal(h.port.preparedConfigRevision, h.port.getConfigurationRevision());
});
test('configuration revision ignores runtime counters and captures policy and credential changes', () => {
  const h = preparationHost(), first = h.port.getConfigurationRevision();
  h.settings.lastSyncTime = 123; assert.equal(h.port.getConfigurationRevision(), first);
  h.settings.useTrash = true; const second = h.port.getConfigurationRevision(); assert(second > first);
  h.settings.ignoredFolders.push('private'); const third = h.port.getConfigurationRevision(); assert(third > second);
  h.values.accessToken = 'fresh-token'; assert(h.port.getConfigurationRevision() > third);
});
