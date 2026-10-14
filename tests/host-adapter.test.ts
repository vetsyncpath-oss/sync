import test from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import Plugin from '../main';
import { BufferArchiveReader } from '../src/core/archive';
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
    syncMode: 'full-vault', allowedFolders: '', ignoredFolders: '', allowPlugins: false, allowSnippets: false, useTrash: false, lastSyncTime: 0 };
  Object.assign(plugin, {
    settings, pluginDir:()=>'.obsidian/plugins/sync',saveSettingsImmediate:async()=>{},queue:f.queue, cache: f.cache, fsAdapter: f.memory.fs, conflictResolver: f.conflict,
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
  const h = preparationHost();await h.port.prepareSession();const plugin=h.port as any;
  const cache=plugin.cache,swaps=h.swaps();cache.set('a.md',{h:'owned',s:1,alg:'sha256'});
  (h.settings as any).connections[0].values.accessToken='fresh-token';
  await h.port.prepareSession();
  await (h.source() as any).members[0].source.fetch(entry('a.md'), new AbortController().signal);
  assert.equal(h.authorization(), 'token fresh-token'); assert.equal(h.swaps(),swaps); assert.equal(h.port.cache,cache);
  assert(cache.get('a.md')); assert.equal(h.port.preparedConfigRevision, h.port.getConfigurationRevision());
});
test('configuration revision ignores runtime counters and captures policy and credential changes', () => {
  const h = preparationHost(), first = h.port.getConfigurationRevision();
  h.settings.lastSyncTime = 123; assert.equal(h.port.getConfigurationRevision(), first);
  h.settings.useTrash = true; const second = h.port.getConfigurationRevision(); assert(second > first);
  h.settings.ignoredFolders='private'; const third = h.port.getConfigurationRevision(); assert(third > second);
  h.values.accessToken = 'fresh-token'; assert(h.port.getConfigurationRevision() > third);
});

test('failed profile migration restores previous settings for a safe retry', async () => {
  const h=preparationHost();const plugin=h.port as any;
  const before=structuredClone(h.settings);plugin.saveSettingsImmediate=async()=>{throw Error('Disk full');};
  await assert.rejects(plugin.ensureProfileSettings(),/Disk full/);
  assert.equal(h.settings.mirrorLevel,before.mirrorLevel);assert.deepEqual(h.settings.syncPolicies,before.syncPolicies);
  assert.equal((h.settings as any).profiles,undefined);
  plugin.saveSettingsImmediate=async()=>{};await plugin.ensureProfileSettings();
  assert((h.settings as any).profiles.length);assert((h.settings.syncPolicies as any).test.assignments.length);
});
test('routing changes isolate caches and failed queues while token rotation keeps ownership', async () => {
  const h=preparationHost(),plugin=h.port as any;
  await plugin.prepareSession();const primaryNamespace=plugin.cache.namespace;
  const settings=h.settings as any;
  settings.connections.push({id:'docs',name:'Docs',kind:'git',values:{repoUrl:'https://github.com/test/docs',branch:'main',accessToken:'secret'}});
  settings.profiles.push({id:'docs-profile',name:'Docs',write:'update',delete:'keep',source:'docs'});
  h.f.queue.add({path:'old.md',hash:'a',size:1},'primary failure',1);
  settings.vaultPolicy.assignments.push({scope:'folder',path:'docs',profileId:'docs-profile'});
  await plugin.prepareSession();const namespace=plugin.cache.namespace;
  assert.match(namespace,/^routes_[0-9a-f]{64}$/);assert.equal(h.f.queue.size(),0);
  h.f.queue.add({path:'docs/new.md',hash:'b',size:1},'route failure',1);
  settings.connections.find((c:any)=>c.id==='docs').values.accessToken='rotated';await plugin.prepareSession();
  assert.equal(plugin.cache.namespace,namespace);assert.equal(h.f.queue.size(),1);
  settings.vaultPolicy.assignments.pop();await plugin.prepareSession();
  assert.equal(plugin.cache.namespace,primaryNamespace);assert.equal(h.f.queue.all()[0].path,'old.md');
  assert.equal(settings.failedQueues[namespace][0].path,'docs/new.md');
});
test('cache load failure never installs an empty replacement or bypasses the next load', async () => {
  const h=preparationHost(),plugin=h.port as any;let loads=0,disposed=0;
  plugin.routingContext=async()=>({source:{...h.f.source,dispose:async()=>{disposed++;}},namespace:'new-route'});
  h.f.memory.fs.read=async()=>{loads++;throw Error('Disk unavailable');};
  h.f.queue.add({path:'old.md',hash:'a',size:1},'failure',1);
  for(let attempt=0;attempt<2;attempt++) await assert.rejects(plugin.prepareSession(),/Disk unavailable/);
  assert.equal(loads,2);assert.equal(disposed,2);assert.equal(plugin.cache,h.f.cache);assert.equal(h.f.queue.size(),1);assert.equal(h.swaps(),0);
});
test('vault migration keeps assignments stable when the legacy primary source changes',async()=>{
  const h=preparationHost(),plugin=h.port as any;await plugin.ensureProfileSettings();
  const settings=h.settings as any,policy=settings.vaultPolicy;
  policy.assignments.push({scope:'folder',path:'Notes',source:policy.defaultSource,remotePath:'remote-notes'});
  const snapshot=structuredClone(policy),connections=structuredClone(settings.connections);
  h.values.repoUrl='https://github.com/test/another-repo';await plugin.ensureProfileSettings();
  assert.deepEqual(settings.vaultPolicy,snapshot);assert.deepEqual(settings.connections,connections);
});
test('all-vault explicit source avoids loading an unused default source',async()=>{
  const h=preparationHost(),plugin=h.port as any;await plugin.ensureProfileSettings();const settings=h.settings as any;
  const defaultId=settings.vaultPolicy.defaultSource;
  settings.connections.push({id:'docs',name:'Docs',kind:'git',values:{repoUrl:'https://github.com/test/docs',branch:'main'}});
  settings.vaultPolicy.assignments.push({scope:'vault',path:'',source:'docs',remotePath:''});
  const context=await plugin.routingContext();assert.deepEqual(context.source.members.map((m:any)=>m.id),['docs']);assert.notEqual(defaultId,'docs');
});
test('an unconfigured required default cannot be silently omitted from a deletion-capable plan',async()=>{
 const h=preparationHost(),plugin=h.port as any;await plugin.ensureProfileSettings();const settings=h.settings as any;
 settings.connections[0].values.repoUrl='';settings.connections.push({id:'docs',name:'Docs',kind:'git',values:{repoUrl:'https://github.com/test/docs',branch:'main'}});
 settings.vaultPolicy.assignments.push({scope:'folder',path:'Docs',source:'docs',remotePath:'notes'});
 const blocked=await plugin.routingContext();assert(blocked.source.executionMembers().some((member:any)=>member.id===settings.vaultPolicy.defaultSource));await assert.rejects(()=>blocked.source.getManifest(new AbortController().signal),/not configured/);
 settings.vaultPolicy.defaultSource=undefined;const context=await plugin.routingContext();assert.deepEqual(context.source.members.map((m:any)=>m.id),['docs']);
});

test('fresh unconfigured settings do not invent a default connection',async()=>{
 const h=preparationHost(),plugin=h.port as any;h.values.repoUrl='';await plugin.ensureProfileSettings();
 const settings=h.settings as any;assert.equal(settings.vaultPolicy.defaultSource,undefined);assert.deepEqual(settings.connections,[]);
 await assert.rejects(plugin.routingContext(),/Connections → Vault source/);
});
test('selected Yandex connection drives real listing and download instead of legacy Git',async()=>{
 const h=preparationHost(),plugin=h.port as any;await plugin.ensureProfileSettings();const settings=h.settings as any;
 settings.connections[0].values.repoUrl='';settings.connections.push({id:'disk',name:'My Yandex',kind:'yandex',values:{vaultUrl:'https://disk.yandex.ru/d/example'}});
 settings.vaultPolicy.defaultSource='disk';const calls:string[]=[];
 const remote=entry('note.md','REMOTE');
 plugin.engineCtx=(kind:string)=>{assert.equal(kind,'yandex');return {transport:{fetch:async(url:string)=>{
  calls.push(url);const parsed=new URL(url);const body=parsed.hostname==='download.example'?'REMOTE':JSON.stringify(parsed.pathname.endsWith('/download')?{href:'https://download.example/file'}:{type:'dir',_embedded:{total:1,items:[{type:'file',name:'note.md',path:'/note.md',size:6,sha256:remote.hash}]}});
  return {status:200,headers:{},arrayBuffer:async()=>ab(body),text:async()=>body};
 }}};};
 const context=await plugin.routingContext();assert.equal(context.source.kind,'yandex');
 const manifest=await context.source.getManifest(new AbortController().signal);assert.equal(manifest[0].path,'note.md');
 assert.equal(new TextDecoder().decode(await context.source.fetch(manifest[0],new AbortController().signal)),'REMOTE');
 assert.equal(new URL(calls[0]).searchParams.get('public_key'),'https://disk.yandex.ru/d/example');assert.equal(calls.length,3);
 await context.source.dispose();
});

for(const kind of ['git','gdrive','webdav','zip-url'] as const)test(`named ${kind} connection reaches inventory and file download through plugin routing`,async()=>{
 const h=preparationHost(),plugin=h.port as any;await plugin.ensureProfileSettings();const settings=h.settings as any;
 const values={git:{repoUrl:'https://github.com/test/repo',branch:'default'},gdrive:{apiKey:'test-key',folderId:'shared-folder'},webdav:{baseUrl:'https://dav.example/root/',username:'',password:''},'zip-url':{vaultUrl:'https://cloud.example/s/abcdefgh?x=1'}}[kind];
 settings.connections=[{id:'selected',name:'Selected source',kind,values}];settings.vaultPolicy.defaultSource='selected';
 const calls:string[]=[];
 plugin.engineCtx=(requested:string)=>{assert.equal(requested,kind);return {
  archiveDownloader:{download:async(url:string)=>{calls.push(url);return new BufferArchiveReader(Uint8Array.from(Buffer.from('UEsDBBQAAAAAACWrSF3xCA2bBAAAAAQAAAAEAAAAYS5tZEFBQUFQSwECFAMUAAAAAAAlq0hd8QgNmwQAAAAEAAAABAAAAAAAAAAAAAAAgAEAAAAAYS5tZFBLBQYAAAAAAQABADIAAAAmAAAAAAA=','base64')).buffer);}},
  transport:{fetch:async(url:string,req:any)=>{
   calls.push(url);let body='AAAA';
   if(kind==='git'&&!url.includes('/git/blobs/'))body=JSON.stringify(url.endsWith('/test/repo')?{default_branch:'main'}:url.includes('/branches/')?{commit:{commit:{tree:{sha:'tree'}}}}:{tree:[{type:'blob',path:'a.md',sha:'a'.repeat(40),size:4}],truncated:false});
   if(kind==='gdrive'&&!url.includes('alt=media'))body=JSON.stringify({files:[{id:'file',name:'a.md',mimeType:'text/plain',size:'4',sha256Checksum:entry('a.md','AAAA').hash}]});
   if(kind==='webdav'&&req.method!=='GET')body='<D:multistatus xmlns:D="DAV:"><D:response><D:href>/root/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response><D:response><D:href>/root/a.md</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>4</D:getcontentlength><D:getetag>"v1"</D:getetag></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>';
   return {status:kind==='webdav'&&req.method!=='GET'?207:200,headers:{},arrayBuffer:async()=>ab(body),text:async()=>body};
  }}
 };};
 const context=await plugin.routingContext();assert.equal(context.source.kind,kind);
 try{const manifest=await context.source.getManifest(new AbortController().signal);assert.equal(manifest.length,1);assert.equal(manifest[0].path,'a.md');assert.equal(new TextDecoder().decode(await context.source.fetch(manifest[0],new AbortController().signal)),'AAAA');assert(calls.length>0);if(kind==='zip-url')assert.equal(new URL(calls[0]).pathname,'/s/abcdefgh/download');}
 finally{await context.source.dispose();}
});
