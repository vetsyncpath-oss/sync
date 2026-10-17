import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProfiles, migrateProfilePolicy, STANDARD_PROFILES, validateProfiles, type SyncProfile } from '../src/core/profiles';
import { resolveFileRule } from '../src/core/file-rules';
import { RoutedSource, routedNamespace } from '../src/sources/routed-source';
import { fixture, entry, ab, str } from './helpers';
import { PolicyEditor } from '../src/ui/policy-editor';
import type { SyncSource } from '../src/sources/types';
import type { SyncPolicy } from '../src/core/policy';
const empty=():SyncPolicy=>({version:1,mirror:false,folders:[]});
function source(contents:Record<string,string>, fail=false):SyncSource {
 return {kind:'git',deletionSafety:'immutable',getManifest:async()=>{if(fail)throw new Error('source offline');return Object.entries(contents).map(([p,s])=>entry(p,s));},fetch:async e=>ab(contents[e.path])};
}
const base=()=>structuredClone([...STANDARD_PROFILES]);
test('migration preserves legacy mode/conflict meanings and is idempotent',()=>{
 for(const level of ['fetch','light','full'] as const){const p=base();
  const migrated=migrateProfilePolicy(empty(),p,'one',level,'local-wins','keep-local');
  const result=resolveFileRule('a.md',compileProfiles(migrated,p).fileRules);
  assert.equal(result.write,level==='full'?'remote':'changes');
  assert.equal(result.delete,level==='full'?'mirror':level==='light'?'tracked':'keep');
  assert.equal(result.conflict,level==='light'?'incoming':'local-wins');
  const before=structuredClone(p);assert.deepEqual(migrateProfilePolicy(migrated,p,'one','full','ask','keep-both'),migrated);assert.deepEqual(p,before);
 }
});
test('migration retains nested mode overrides, inline rules, mappings and exclusions',()=>{
 const p=base(),policy:SyncPolicy={...empty(),folders:[{path:'notes',include:'include',target:{kind:'move',localPath:'Notes'}}],
 fileExclusions:[{pattern:'secret.json'}],mirrorFolders:{notes:{state:'custom',level:'full'},private:{state:'off'}},
 fileRules:[{scope:'file',path:'notes/data.json',write:'preserve'}]};
 const m=migrateProfilePolicy(policy,p,'one','fetch','keep-both','keep-local');const c=compileProfiles(m,p);
 assert.equal(resolveFileRule('notes/a.md',c.fileRules).delete,'mirror');assert.equal(resolveFileRule('notes/data.json',c.fileRules).write,'preserve');
 assert.deepEqual(m.folders,policy.folders);assert.deepEqual(m.fileExclusions,policy.fileExclusions);assert.deepEqual(m.mirrorFolders,{private:{state:'off'}});
});
test('removing a vault assignment falls back to safe updates and no deletion',()=>{
 const policy=compileProfiles({...empty(),assignments:[]},base());const r=resolveFileRule('a.md',policy.fileRules);
 assert.equal(r.write,'update');assert.equal(r.delete,'keep');
});
test('missing profiles and missing source connections fail closed',()=>{
 assert.throws(()=>compileProfiles({...empty(),assignments:[{scope:'vault',path:'',profileId:'missing'}]},base()),/Missing profile/);
 assert.throws(()=>validateProfiles([{id:'x',name:'x',write:'remote',delete:'keep',source:'missing'}]),/Unknown source/);
});
test('same-priority overlapping source rules conflict; child assignment explicitly overrides parent',()=>{
 assert.throws(()=>resolveFileRule('plugins/main.js',[
 {scope:'folder',path:'plugins',names:['main.js','manifest.json'],write:'remote',source:'a'},
 {scope:'folder',path:'plugins',names:['main.js'],write:'remote',source:'b'}]),/Conflicting source/);
 assert.equal(resolveFileRule('plugins/main.js',[{scope:'vault',path:'',write:'remote',source:'a'},
 {scope:'folder',path:'plugins',write:'remote',source:'b'}]).source,'b');
});
test('Git and Yandex-like providers route exact bytes to disjoint paths in one session',async()=>{
 const f=fixture(); const rules=[{scope:'folder' as const,path:'plugins',write:'remote' as const,delete:'keep' as const,source:'github'}];
 const routed=new RoutedSource([{id:'primary',name:'Files',source:source({'notes.md':'DOCUMENT','plugins/main.json':'WRONG'})},
 {id:'github',name:'Plugins',source:source({'plugins/main.json':'CODE','notes.md':'WRONG'})}],rules);
 f.deps.source=routed;f.coordinator.setSyncPolicy({...empty(),fileRules:rules});
 const result=await f.coordinator.sync();assert.equal(result?.outcome,'ok');
 assert.equal(str(f.files.get('notes.md')!),'DOCUMENT');assert.equal(str(f.files.get('plugins/main.json')!),'CODE');
});
test('one failed inventory prevents all writes and deletions',async()=>{
 const f=fixture();f.own('old.md','OLD');f.deps.source=new RoutedSource([{id:'primary',name:'A',source:source({'new.md':'NEW'})},{id:'b',name:'B',source:source({},true)}],[]);
 f.coordinator.setSyncPolicy({...empty(),fileRules:[{scope:'vault',path:'',write:'remote',delete:'mirror'}]});
 const result=await f.coordinator.sync();assert.equal(result?.outcome,'error');assert(!f.files.has('new.md'));assert(f.files.has('old.md'));
});
test('unverified member prevents destructive authorization for the composite',()=>{
 const unverified={...source({}),deletionSafety:'unverified' as const};
 const routed=new RoutedSource([{id:'primary',name:'A',source:source({})},{id:'b',name:'B',source:unverified}],[]);assert.equal(routed.deletionSafety,'unverified');
});
test('same path in providers is assigned to one; absence never falls back to another source',async()=>{
 const rules=[{scope:'file' as const,path:'a.md',write:'remote' as const,source:'other'}];
 const r=new RoutedSource([{id:'primary',name:'A',source:source({'a.md':'WRONG'})},{id:'other',name:'B',source:source({})}],rules);
 assert.deepEqual(await r.getManifest(new AbortController().signal),[]);
});
test('routing follows final mapped paths, not raw source paths',async()=>{
 const rules=[{scope:'folder' as const,path:'Plugins',write:'remote' as const,source:'other'}];
 const r=new RoutedSource([{id:'primary',name:'A',source:source({'repo/a.json':'WRONG'})},{id:'other',name:'B',source:source({'repo/a.json':'RIGHT'})}],rules,p=>p.replace('repo/','Plugins/'));
 const manifest=await r.getManifest(new AbortController().signal);assert.equal(str(await r.fetch(manifest[0],new AbortController().signal)),'RIGHT');
});
test('stale locators and portable aliases are rejected',async()=>{
 const r=new RoutedSource([{id:'primary',name:'A',source:source({'a.md':'A','A.md':'B'})}],[]);
 await assert.rejects(()=>r.getManifest(new AbortController().signal),/collision/);
 const good=new RoutedSource([{id:'primary',name:'A',source:source({'a.md':'A'})}],[]);
 const m=await good.getManifest(new AbortController().signal);await good.dispose();await assert.rejects(()=>good.fetch(m[0],new AbortController().signal),/Stale/);
});
test('preview uses isolated instances; available unassigned paths are visible',async()=>{
 const a=()=>[{id:'primary',name:'A',source:source({'a.md':'A'})},{id:'other',name:'B',source:source({'b.md':'B'})}];
 const runner=new RoutedSource(a(),[]),preview=new RoutedSource(a(),[]);
 const m=await runner.getManifest(new AbortController().signal);assert.equal((await preview.previewManifest(new AbortController().signal)).length,2);
 await preview.dispose();assert.equal(str(await runner.fetch(m[0],new AbortController().signal)),'A');
});
test('routing ownership changes namespace but writing mode changes do not',async()=>{
 const a=[{scope:'vault' as const,path:'',write:'remote' as const,source:'a'}];
 const one=await routedNamespace({url:'example'},a,[]);
 assert.notEqual(one,await routedNamespace({url:'example'},[{...a[0],source:'b'}],[]));
 assert.equal(one,await routedNamespace({url:'example'},[{...a[0],write:'preserve'}],[]));
});
test('migrated incoming conflict keeps local primary and saves incoming copy',async()=>{
 const p=base(),policy=compileProfiles(migrateProfilePolicy(empty(),p,'one','light','keep-both','keep-local'),p);
 const f=fixture([entry('a.md')]);f.files.set('a.md',ab('PERSONAL'));f.coordinator.setSyncPolicy(policy);
 await f.coordinator.sync();assert.equal(str(f.files.get('a.md')!),'PERSONAL');assert([...f.files].some(([p,b])=>p.includes('.conflict-')&&str(b)==='REMOTE'));
});
test('background ask does not open a prompt and remains available for manual resolution',async()=>{
 const f=fixture([entry('a.md')]);f.files.set('a.md',ab('PERSONAL'));let prompts=0;f.resolverDeps.ui={askConflict:async()=>{prompts++;return 'remote-wins';}} as any;
 f.coordinator.setSyncPolicy({...empty(),fileRules:[{scope:'vault',path:'',write:'changes',delete:'keep',conflict:'ask'}]});
 const first=await f.coordinator.sync({trigger:'auto'});assert.equal(prompts,0);assert.equal(first?.deferredConflicts,1);assert.equal(f.queue.size(),0);
 await f.coordinator.sync();assert.equal(prompts,1);assert.equal(str(f.files.get('a.md')!),'REMOTE');
});
test('tree assigns profiles, resets inheritance and retains draft through snapshot recreation',()=>{
 const p=base(),policy={...empty(),assignments:[]};
 const init={localFiles:['a.md'],localFolders:[],remote:[],cache:new Map(),pluginDir:'.obsidian/plugins/sync',policy};
 const e=new PolicyEditor(init);e.assignProfiles([{scope:'file',path:'a.md',profileId:'standard:preserve'}],p);assert(e.isDirty());
 const draft=e.getPolicy(),reloaded=new PolicyEditor(init);reloaded.replacePolicy(draft);assert(reloaded.isDirty());assert.equal(resolveFileRule('a.md',reloaded.getPolicy().fileRules).write,'preserve');
 reloaded.assignProfiles([],p);assert.equal(resolveFileRule('a.md',reloaded.getPolicy().fileRules).write,'update');
});
test('clearing destination does not remove scope exclusion',()=>{
 const e=new PolicyEditor({localFiles:[],localFolders:[],remote:[],cache:new Map(),pluginDir:'',policy:{...empty(),folders:[{path:'private',include:'exclude',target:{kind:'move',localPath:'else'}}]}});
 e.setTarget('private',undefined);assert.equal(e.effectiveInclude('private/a.md'),'exclude');
});
test('remote profile enforces source despite global incoming and retains local recovery',async()=>{
 const f=fixture([entry('a.md')]);f.files.set('a.md',ab('AUTHOR'));// Legacy persisted input can contain incoming although the current global dropdown excludes it.
 (f.conflict as unknown as {setStrategy(value:string):void}).setStrategy('incoming');
 f.coordinator.setSyncPolicy({...empty(),fileRules:[{scope:'vault',path:'',write:'remote',delete:'keep'}]});
 const result=await f.coordinator.sync();assert.equal(result?.failed,0);assert.equal(str(f.files.get('a.md')!),'REMOTE');
 assert([...f.files].some(([p,b])=>p.includes('.conflict-')&&str(b)==='AUTHOR'));
});
