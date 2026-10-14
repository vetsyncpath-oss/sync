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
import { GDriveOAuthSource } from '../src/sources/gdrive-oauth-source';
import { GoogleDriveClient, DRIVE_FOLDER, type DriveFile } from '../src/sources/gdrive-client';
import { SourcePathModal } from '../src/ui/source-path-modal';
import { validateBrowseSnapshot } from '../src/sources/remote-browse';
import { artifactProperties, driveConflictSibling } from '../src/core/drive-artifact';
import { operationTable } from '../src/ui/operation-table';
const signal=()=>new AbortController().signal;
const connections:SourceConnection[]=[{id:'git',name:'Plugin repository',kind:'git',values:{repoUrl:'https://github.com/test/plugins',branch:'main'}},{id:'disk',name:'Documents disk',kind:'yandex',values:{vaultUrl:'https://disk.example/docs'}}];
const profiles=[...STANDARD_PROFILES];
const policy=()=>({version:1 as const,mirror:false,folders:[],assignments:[],defaultSource:'git'});
const source=(kind:'git'|'yandex',path:string,text:string)=>({kind,deletionSafety:'immutable' as const,getManifest:async()=>[entry(path,text)],fetch:async(e:any)=>{assert.equal(e.path,path);return ab(text);}});
function dom(){
 const {document,window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document,window});
 const proto=window.HTMLElement.prototype as any;proto.empty=function(){this.replaceChildren();};proto.setText=function(text:string){this.textContent=text;};proto.createEl=function(tag:string,opts:any={}){const el=document.createElement(tag);el.textContent=opts.text??'';this.append(el);return el;};i18n.setLocale('en');return document;
}
function click(box:HTMLElement,text:string){const b=Array.from(box.querySelectorAll('button')).find(b=>b.textContent===text);if(b){b.click();return;}const name=Array.from(box.querySelectorAll('.sync-tree-name')).find(n=>n.textContent===text);assert(name,`Missing ${text}`);(name.parentElement as HTMLElement).click();}
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
 changeSelect(inspector.querySelectorAll('select')[0],'disk');input(inspector.querySelector('input[type=text]')!,'notes');changeSelect(inspector.querySelectorAll('select')[1],'standard:source');click(inspector,'Apply to draft');
 assert.equal(w.saved(),undefined);const p=(w.modal as any).policy;assert.equal(p.assignments[0].source,'disk');assert.equal(p.assignments[0].remotePath,'notes');assert.equal(p.assignments[0].path,'Documents');
 click(w.modal.contentEl,'Save settings');await tick();assert.equal(w.saved().p.assignments[0].source,'disk');assert.deepEqual(w.deps.policy.assignments,[]);
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
 changeSelect(inspector.querySelectorAll('select')[1],'standard:preserve');click(inspector,'Apply to draft');click(w.modal.contentEl,'Save settings');await tick();assert((Notice as any).messages.some((m:unknown)=>String(m).includes('Disk full')));assert((w.modal as any).policy.assignments.length);
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
 changeSelect(inspector.querySelectorAll('select')[0],'disk');input(inspector.querySelector('input[type=text]')!,'custom-path');
 slow.resolve([entry('remote.md')]);await tick();assert.equal(inspector.querySelector<HTMLInputElement>('input[type=text]')!.value,'custom-path');click(inspector,'Apply to draft');assert.equal((w.modal as any).policy.assignments[0].remotePath,'custom-path');
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

const driveFile=(id:string,name:string,parent='root',folder=false):DriveFile=>({id,name,parents:[parent],version:'1',size:'1',mimeType:folder?DRIVE_FOLDER:'text/markdown'});
async function driveBrowse(children:Map<string,DriveFile[]>){
 const client=new GoogleDriveClient({fetch:async url=>{const u=new URL(url),value=u.pathname.endsWith('/root')?
  {id:'root',name:'Root',parents:[],version:'1',mimeType:DRIVE_FOLDER}:{files:children.get(u.searchParams.get('q')!.match(/'([^']+)' in parents/)![1])??[]};
  return {status:200,headers:{},text:async()=>JSON.stringify(value),arrayBuffer:async()=>new ArrayBuffer(0)};}});
 return new GDriveOAuthSource(client,'root').getBrowseSnapshot(signal());
}
function driveWorkspace(snapshot:Awaited<ReturnType<typeof driveBrowse>>){return workspace({connections:[{id:'drive',name:'Drive',kind:'gdrive',values:{}}],policy:{...policy(),defaultSource:'drive'},fetch:async()=>snapshot});}
const objectRow=(box:HTMLElement,id:string)=>Array.from(box.querySelectorAll<HTMLElement>('[role=treeitem]')).find(row=>row.dataset.objectId===id)!;

test('one plugin-path file opens in the actual workspace browse tree',async()=>{
 dom();const snapshot=await driveBrowse(new Map([
  ['root',[driveFile('config','.obsidian','root',true)]],['config',[driveFile('plugins','plugins','config',true)]],
  ['plugins',[driveFile('plugin','example','plugins',true)]],['plugin',[driveFile('main','main.js','plugin')]],
 ]));
 const w=driveWorkspace(snapshot);await tick();click(w.modal.contentEl,'Drive · default');await tick();
 for(const id of ['config','plugins','plugin'])objectRow(w.modal.contentEl,id).querySelector<HTMLButtonElement>('button')!.click();
 assert.equal(objectRow(w.modal.contentEl,'main').dataset.path,'.obsidian/plugins/example/main.js');assert(!w.modal.contentEl.textContent?.includes('Drive path collision'));
});
test('same-name folder selection and expansion use IDs without merging children',async()=>{
 dom();const snapshot=await driveBrowse(new Map([
  ['root',[driveFile('one','Shared','root',true),driveFile('two','Shared','root',true)]],
  ['one',[driveFile('a','a.md','one')]],['two',[driveFile('b','b.md','two')]],
 ]));const w=driveWorkspace(snapshot);await tick();click(w.modal.contentEl,'Drive · default');await tick();
 objectRow(w.modal.contentEl,'two').querySelector<HTMLButtonElement>('button')!.click();
 assert(objectRow(w.modal.contentEl,'b'));assert.equal(objectRow(w.modal.contentEl,'a'),undefined);
 objectRow(w.modal.contentEl,'two').click();
 assert.equal(objectRow(w.modal.contentEl,'two').getAttribute('aria-selected'),'true');assert.equal(objectRow(w.modal.contentEl,'one').getAttribute('aria-selected'),'false');
 const inspector=w.modal.contentEl.querySelector('.sync-workspace-inspector')!;assert(inspector.textContent?.includes('ID two'));
 assert(inspector.querySelector<HTMLButtonElement>('.mod-cta')!.disabled);assert.equal((w.modal as any).policy.assignments.length,0);
});
test('source path picker shows both duplicate objects but cannot choose an arbitrary path match',async()=>{
 dom();const snapshot=await driveBrowse(new Map([['root',[driveFile('one','same.md'),driveFile('two','same.md')]]]));let selected:string|undefined;
 const modal=new SourcePathModal(new App(),'Drive','file',snapshot,'ready',async()=>snapshot,path=>selected=path);modal.onOpen();
 const rows=Array.from(modal.contentEl.querySelectorAll<HTMLElement>('[role=option]'));assert.equal(rows.length,2);assert.notEqual(rows[0].dataset.objectId,rows[1].dataset.objectId);
 rows[1].click();assert.equal(selected,undefined);assert.equal(rows[1].getAttribute('aria-disabled'),'true');modal.close();
});
test('raw browse refresh retains stale identities, while legacy invalid manifests remain rejected',async()=>{
 const snapshot=await driveBrowse(new Map([['root',[driveFile('one','same.md'),driveFile('two','same.md')]]]));const inventories=new SourceInventories();
 await inventories.load('drive',async()=>snapshot);assert.equal(inventories.state('drive').browse?.nodes.length,2);
 await inventories.load('drive',async()=>{throw Error('Offline');});assert.equal(inventories.state('drive').status,'error');assert.equal(inventories.state('drive').browse?.nodes[1].objectId,'two');
 await inventories.load('legacy',async()=>[entry('same.md'),entry('same.md')]);assert.equal(inventories.state('legacy').status,'error');
});
test('malformed/cyclic browse graphs cannot bypass UI admission',async()=>{
 const snapshot=await driveBrowse(new Map([['root',[driveFile('one','a.md')]]]));snapshot.nodes[0].parentKey=snapshot.nodes[0].key;
 assert.throws(()=>validateBrowseSnapshot(snapshot),/parent graph/);const inventories=new SourceInventories();await inventories.load('drive',async()=>snapshot);assert.equal(inventories.state('drive').status,'error');
});

test('Drive tree distinguishes proposal claims from legacy copies and exposes origin IDs without enabling a canonical binding',async()=>{
 dom();const proposalId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',name=driveConflictSibling('a.md',proposalId);
 const snapshot=await driveBrowse(new Map([['root',[driveFile('origin','a.md'),{...driveFile('copy',name),properties:artifactProperties({proposalId,originId:'origin',hash:entry('a').hash,baseVersion:'1',baseHash:entry('b').hash,kind:'gated-upload'})},driveFile('legacy','a.conflict-old.md')]]]));
 const w=driveWorkspace(snapshot);await tick();click(w.modal.contentEl,'Drive · default');await tick();
 const row=objectRow(w.modal.contentEl,'copy');assert(row.textContent?.includes('Proposal'));assert(objectRow(w.modal.contentEl,'legacy').textContent?.includes('Legacy conflict copy'));
 row.click();const inspector=w.modal.contentEl.querySelector('.sync-workspace-inspector')!;assert(inspector.textContent?.includes('origin ID origin'));assert(inspector.textContent?.includes(proposalId));
 assert(inspector.querySelector<HTMLButtonElement>('.mod-cta')!.disabled);
 const inventories=new SourceInventories();await inventories.load('drive',async()=>snapshot);assert.deepEqual(inventories.state('drive').entries.map(e=>e.path),['a.md']);
});

test('file results display all retained proposal copy paths and do not turn artifact-local-edited into an upload action',()=>{
 dom();const table=operationTable([{path:'a.md',status:'pending',reason:'artifact-local-edited',proposalIds:['one','two'],conflictPaths:['a.conflict-first.md','a.conflict-second.md']}]);
 assert(table.textContent?.includes('Received copy was edited locally'));assert(table.textContent?.includes('a.conflict-first.md'));assert(table.textContent?.includes('a.conflict-second.md'));
});
