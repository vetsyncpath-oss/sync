import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { App, Notice } from 'obsidian';
import { SyncWorkspaceModal } from '../src/ui/sync-workspace-modal';
import { SourceInventories } from '../src/ui/source-inventories';
import { compileProfiles, STANDARD_PROFILES, type SourceConnection } from '../src/core/profiles';
import { RoutedSource } from '../src/sources/routed-source';
import { resolveFileRule } from '../src/core/file-rules';
import { fixture, entry, ab, str, deferred, pathPolicy } from './helpers';
import { i18n } from '../src/i18n';
const signal=()=>new AbortController().signal;
const connections:SourceConnection[]=[{id:'git',name:'Plugin repository',kind:'git',values:{repoUrl:'https://github.com/test/plugins',branch:'main'}},{id:'disk',name:'Documents disk',kind:'yandex',values:{vaultUrl:'https://disk.example/docs'}}];
const profiles=[...STANDARD_PROFILES];
const policy=()=>({version:1 as const,mirror:false,folders:[],assignments:[],defaultSource:'git'});
const source=(kind:'git'|'yandex',path:string,text:string)=>({kind,deletionSafety:'immutable' as const,getManifest:async()=>[entry(path,text)],fetch:async(e:any)=>{assert.equal(e.path,path);return ab(text);}});
function dom(){
 const {document,window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document,window});
 const proto=window.HTMLElement.prototype as any;proto.empty=function(){this.replaceChildren();};proto.setText=function(text:string){this.textContent=text;};proto.createEl=function(tag:string,opts:any={}){const el=document.createElement(tag);el.textContent=opts.text??'';this.append(el);return el;};i18n.setLocale('en');return document;
}
function click(box:HTMLElement,text:string){const b=Array.from(box.querySelectorAll('button')).find(b=>b.textContent===text);assert(b,`Missing ${text}`);b.click();}
function changeSelect(el:HTMLSelectElement,value:string){for(const o of Array.from(el.options))o.selected=false;const o=Array.from(el.options).find(o=>o.value===value);assert(o);o.selected=true;el.dispatchEvent(new window.Event('change'));}
function input(el:HTMLInputElement,value:string){el.value=value;el.dispatchEvent(new window.Event('input'));}
async function tick(){await new Promise(r=>setTimeout(r,0));}

test('two mounted sources with equal remote paths deliver different bytes to distinct vault folders',async()=>{
 const p={...policy(),assignments:[{scope:'folder' as const,path:'Plugins',source:'git',remotePath:'bundle',profileId:'standard:source'},{scope:'folder' as const,path:'Documents',source:'disk',remotePath:'bundle',profileId:'standard:source'}]};
 const rules=compileProfiles(p,profiles).fileRules!;
 const routed=new RoutedSource([{id:'git',name:'Git',source:source('git','bundle/file.md','CODE')},{id:'disk',name:'Disk',source:source('yandex','bundle/file.md','DOCS')}],rules,p=>p,'git');
 const f=fixture();f.deps.source=routed;f.deps.syncPolicy=compileProfiles(p,profiles);
 const stats=await f.coordinator.sync();assert.equal(stats?.downloaded,2);assert.equal(str(f.files.get('Plugins/file.md')!),'CODE');assert.equal(str(f.files.get('Documents/file.md')!),'DOCS');assert(!f.files.has('bundle/file.md'));
});
test('exact file binding fetches original source path and does not leak siblings',async()=>{
 const p={...policy(),defaultSource:'none',assignments:[{scope:'file' as const,path:'Local/custom.md',source:'git',remotePath:'remote/original.md',profileId:'standard:source'}]};
 const s=new RoutedSource([{id:'git',name:'Git',source:source('git','remote/original.md','DATA')}],compileProfiles(p,profiles).fileRules!,p=>p,'none');
 const manifest=await s.getManifest(signal());assert.equal(manifest[0].path,'Local/custom.md');assert.equal(str(await s.fetch(manifest[0],signal())),'DATA');
});
test('nested owner overrides consume remote paths without reverting to another source',async()=>{
 const p={...policy(),assignments:[{scope:'folder' as const,path:'Docs',source:'git',remotePath:'root'},{scope:'file' as const,path:'Docs/private.md',source:'disk',remotePath:'private.md'}]};
 const s=new RoutedSource([{id:'git',name:'Git',source:source('git','root/private.md','WRONG')},{id:'disk',name:'Disk',source:{kind:'yandex' as const,getManifest:async()=>[],fetch:async()=>ab('')}}],compileProfiles(p,profiles).fileRules!,p=>p,'git');
 assert.deepEqual(await s.getManifest(signal()),[]);
});
test('source-only assignments inherit behaviour, and a profile cannot replace a direct source',()=>{
 const p={...policy(),assignments:[{scope:'folder' as const,path:'Docs',source:'disk',remotePath:'notes'},{scope:'file' as const,path:'Docs/a.md',profileId:'standard:preserve'}]};
 const r=resolveFileRule('Docs/a.md',compileProfiles(p,profiles).fileRules);assert.equal(r.source,'disk');assert.equal(r.write,'preserve');assert.equal(r.delete,'keep');
 assert.throws(()=>compileProfiles({...p,assignments:[{scope:'folder',path:'Docs',source:'disk',remotePath:'one'},{scope:'folder',path:'Docs',source:'disk',remotePath:'two'}]},profiles),/Conflicting source/);
});
test('one failed preview does not hide another, and failed refresh retains stale snapshot',async()=>{
 const previews=new SourceInventories();await previews.load('git',async()=>[entry('a.md')]);const stamp=previews.state('git').loadedAt;
 await previews.load('disk',async()=>{throw Error('Access denied');});assert.equal(previews.state('git').status,'ready');assert.equal(previews.state('disk').status,'error');
 await previews.load('git',async()=>{throw Error('Offline');});assert.equal(previews.state('git').entries.length,1);assert.equal(previews.state('git').loadedAt,stamp);assert.equal(previews.state('git').status,'error');
});
test('superseded source responses and close-time responses never overwrite current snapshots',async()=>{
 const previews=new SourceInventories(),slow=deferred<any>();const loading=previews.load('git',async()=>slow.promise);
 await previews.load('git',async()=>[entry('new.md')]);slow.resolve([entry('old.md')]);await loading;assert.equal(previews.state('git').entries[0].path,'new.md');
 const close=deferred<any>(),pending=previews.load('disk',async()=>close.promise);previews.dispose();close.resolve([entry('late.md')]);await pending;assert.equal(previews.state('disk').entries.length,0);
});
function workspace(overrides:any={}){
 let saved:any;const deps={policy:policy(),profiles,connections,pathPolicy:pathPolicy(),pluginDir:'.obsidian/plugins/sync',isRunning:()=>false,local:async()=>({files:['Documents/local.md'],folders:['Documents']}),fetch:async(c:SourceConnection)=>{if(c.id==='git')throw Error('Offline');return [entry('notes/remote.md')];},save:async(p:any,c:any)=>{saved={p,c};},dispose:()=>{},...overrides};
 const modal=new SyncWorkspaceModal(new App(),deps);modal.onOpen();return {modal,deps,saved:()=>saved};
}
test('vault opens immediately with blocked default, then another source can load separately',async()=>{
 dom();const slow=deferred<any>();const w=workspace({fetch:async(c:SourceConnection)=>c.id==='git'?slow.promise:[entry('notes/remote.md')]});await tick();
 assert(w.modal.contentEl.textContent?.includes('Documents'));click(w.modal.contentEl,'Documents disk');await tick();assert(w.modal.contentEl.textContent?.includes('notes'));
 slow.resolve('invalid inventory');await tick();assert(w.modal.contentEl.textContent?.includes('notes'));click(w.modal.contentEl,'Vault');assert(w.modal.contentEl.textContent?.includes('Documents'));
});
test('local folder inspector assigns source path without creating a source-specific profile',async()=>{
 dom();const w=workspace();await tick();click(w.modal.contentEl,'Documents');
 const inspector=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;
 changeSelect(inspector.querySelectorAll('select')[0],'disk');input(inspector.querySelectorAll('input')[0],'notes');changeSelect(inspector.querySelectorAll('select')[1],'standard:source');click(inspector,'Apply to draft');
 assert.equal(w.saved(),undefined);const p=(w.modal as any).policy;assert.equal(p.assignments[0].source,'disk');assert.equal(p.assignments[0].remotePath,'notes');assert.equal(p.assignments[0].path,'Documents');
 click(w.modal.contentEl,'Save assignments');await tick();assert.equal(w.saved().p.assignments[0].source,'disk');assert.deepEqual(w.deps.policy.assignments,[]);
});
test('remote placement creates a vault binding and same-name sources stay separate',async()=>{
 dom();const w=workspace({fetch:async()=>[entry('bundle/file.md')]});await tick();click(w.modal.contentEl,'Documents disk');await tick();click(w.modal.contentEl,'bundle');
 const inspector=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;input(inspector.querySelectorAll('input')[0],'Docs');click(inspector,'Place in vault');
 assert.deepEqual((w.modal as any).policy.assignments[0],{scope:'folder',path:'Docs',names:undefined,profileId:undefined,source:'disk',remotePath:'bundle'});
 click(w.modal.contentEl,'Plugin repository · default');await tick();assert(w.modal.contentEl.textContent?.includes('bundle'));
});
test('source editor opens the migrated default and edits only a draft',async()=>{
 dom();const w=workspace();await tick();click(w.modal.contentEl,'Configure');const editor=document.body.lastElementChild as HTMLElement;
 assert.equal(editor.querySelector('input')?.value,'Plugin repository');input(editor.querySelector('input')!,'New repository');click(editor,'Apply to draft');await tick();
 assert(w.modal.contentEl.textContent?.includes('New repository'));assert.equal(w.deps.connections[0].name,'Plugin repository');assert.equal(w.saved(),undefined);
});
test('discard leaves settings unchanged and save failure leaves the draft open',async()=>{
 dom();const w=workspace({save:async()=>{throw Error('Disk full');}});await tick();click(w.modal.contentEl,'Documents');const inspector=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;
 changeSelect(inspector.querySelectorAll('select')[1],'standard:preserve');click(inspector,'Apply to draft');click(w.modal.contentEl,'Save assignments');await tick();assert((Notice as any).messages.some((m:unknown)=>String(m).includes('Disk full')));assert((w.modal as any).policy.assignments.length);
 w.modal.close();const confirm=document.body.lastElementChild as HTMLElement;click(confirm,'Discard');assert.deepEqual(w.deps.policy.assignments,[]);
});
test('basename-filtered bindings preserve other files and inheritance',async()=>{
 const p={...policy(),defaultSource:'none',assignments:[{scope:'folder' as const,path:'Plugins',source:'git',remotePath:'bundle',names:['main.js','manifest.json'],profileId:'standard:source'},{scope:'folder' as const,path:'Plugins',names:['data.json'],profileId:'standard:preserve'}]};
 const entries=[entry('bundle/example/main.js'),entry('bundle/example/data.json')];
 const s=new RoutedSource([{id:'git',name:'Git',source:{kind:'git',getManifest:async()=>entries,fetch:async()=>ab('REMOTE')}}],compileProfiles(p,profiles).fileRules!,p=>p,'none');
 assert.deepEqual((await s.getManifest(signal())).map(e=>e.path),['Plugins/example/main.js']);assert.equal(resolveFileRule('Plugins/example/data.json',compileProfiles(p,profiles).fileRules).write,'preserve');
});
test('background source fetch failure still prevents every write in the execution plan',async()=>{
 const f=fixture();f.deps.source=new RoutedSource([{id:'git',name:'Git',source:source('git','a.md','A')},{id:'disk',name:'Disk',source:{kind:'yandex',getManifest:async()=>{throw Error('Offline');},fetch:async()=>ab('')}}],[{scope:'folder',path:'Docs',source:'disk',remotePath:'notes'}],p=>p,'git');
 const stats=await f.coordinator.sync();assert.equal(stats?.outcome,'error');assert.deepEqual(f.operations,[]);
});
test('a source response does not reset partially edited assignment fields',async()=>{
 dom();const slow=deferred<any>();const w=workspace({fetch:async()=>slow.promise});await tick();click(w.modal.contentEl,'Documents');
 const inspector=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;
 changeSelect(inspector.querySelectorAll('select')[0],'disk');input(inspector.querySelectorAll('input')[0],'custom-path');
 slow.resolve([entry('remote.md')]);await tick();assert.equal(inspector.querySelectorAll('input')[0].value,'custom-path');click(inspector,'Apply to draft');assert.equal((w.modal as any).policy.assignments[0].remotePath,'custom-path');
});
test('explicit final destinations are not remapped a second time by legacy folder targets',async()=>{
 const p={...policy(),defaultSource:'none',folders:[{path:'Notes',include:'include' as const,target:{kind:'move' as const,localPath:'Archive'}}],assignments:[{scope:'folder' as const,path:'Notes',source:'git',remotePath:'remote',profileId:'standard:source'}]};
 const f=fixture();f.deps.syncPolicy=compileProfiles(p,profiles);f.deps.source=new RoutedSource([{id:'git',name:'Git',source:source('git','remote/a.md','A')}],f.deps.syncPolicy.fileRules!,p=>p,'none');
 const result=await f.coordinator.sync();assert.equal(result?.downloaded,1);assert(f.files.has('Notes/a.md'));assert(!f.files.has('Archive/a.md'));
});
test('bulk profile editing preserves direct source bindings',async()=>{
 dom();const p={...policy(),assignments:[{scope:'folder' as const,path:'Documents',source:'disk',remotePath:'notes'}]};const w=workspace({policy:p});await tick();
 const modal=w.modal as any;modal.selection.set('Documents','folder');modal.selection.set('extra.md','file');click(w.modal.contentEl,'Profile for selection');
 const editor=document.body.lastElementChild as HTMLElement;changeSelect(editor.querySelector('select')!,'standard:preserve');click(editor,'Apply to draft');
 const folder=modal.policy.assignments.find((a:any)=>a.path==='Documents');assert.equal(folder.source,'disk');assert.equal(folder.remotePath,'notes');assert.equal(folder.profileId,'standard:preserve');assert.equal(modal.policy.assignments.find((a:any)=>a.path==='extra.md').profileId,'standard:preserve');assert.equal(w.saved(),undefined);
});
