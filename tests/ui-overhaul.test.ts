import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { App, Notice } from 'obsidian';
import { SyncWorkspaceModal } from '../src/ui/sync-workspace-modal';
import { ConflictAskModal } from '../src/ui/conflict-modal';
import { SourceConnectionModal } from '../src/ui/source-connection-modal';
import { compileProfiles, STANDARD_PROFILES, type SourceConnection } from '../src/core/profiles';
import { setScope, setParticipation, pathState } from '../src/core/workspace-state';
import { applyPolicy, type SyncPolicy } from '../src/core/policy';
import { RoutedSource } from '../src/sources/routed-source';
import { ConflictResolver } from '../src/core/conflict';
import { versionOf } from '../src/core/local-version';
import { fixture, pathPolicy, entry, ab, str } from './helpers';
import Plugin from '../main';
import { i18n } from '../src/i18n';

function dom() {
    const { document, window } = parseHTML('<html><body></body></html>'); Object.assign(globalThis, { document, window });
    const proto = window.HTMLElement.prototype as any;
    proto.empty = function () { this.replaceChildren(); }; proto.setText = function (text:string) { this.textContent=text; };
    proto.createEl=function(tag:string,opts:any={}) { const el=document.createElement(tag);el.textContent=opts.text??'';this.append(el);return el; };
    i18n.setLocale('en'); (Notice as any).messages=[]; return document;
}
const connections:SourceConnection[]=[
    {id:'a',name:'Source A',kind:'git',values:{repoUrl:'https://github.com/test/vault',branch:'main'}},
    {id:'b',name:'Source B',kind:'yandex',values:{vaultUrl:'https://disk.yandex.ru/d/example'}},
];
const profiles=[...STANDARD_PROFILES];
const policy=():SyncPolicy=>({version:1,mirror:false,folders:[],assignments:[],defaultSource:'a'});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function click(root:HTMLElement,label:string) {const button=Array.from(root.querySelectorAll('button')).find(b=>b.textContent===label);assert(button,label);button.click();}
function node(root:HTMLElement,path:string) {const row=Array.from(root.querySelectorAll<HTMLElement>('[role=treeitem]')).find(r=>r.dataset.path===path);assert(row,path);row.click();}
function control(root:HTMLElement,label:string) {const el=Array.from(root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-sync-field]')).find(e=>e.dataset.syncField===label);assert(el,label);return el;}
function select(el:HTMLSelectElement,value:string) {for(const option of Array.from(el.options))option.selected=false;const option=Array.from(el.options).find(o=>o.value===value);assert(option);option.selected=true;el.dispatchEvent(new window.Event('change'));}
function input(el:HTMLInputElement,value:string) {el.value=value;el.dispatchEvent(new window.Event('input'));}
async function workspace(initial=policy(),override:any={}) {
    dom();let saved:any;
    const deps={policy:initial,profiles,connections,pathPolicy:pathPolicy(),pluginDir:'.obsidian/plugins/sync',isRunning:()=>false,
        local:async()=>({files:['Notes/a.md','a.tmp'],folders:['Notes']}),fetch:async()=>[entry('Notes/a.md'),entry('a.tmp')],
        save:async(p:any,c:any)=>{saved={p,c};},dispose:()=>{},...override};
    const modal=new SyncWorkspaceModal(new App(),deps);modal.open();await tick();return {modal:modal as any,saved:()=>saved,deps};
}

test('entire-vault round trip preserves selection, mappings, assignments and exclusions',()=>{
    const initial:SyncPolicy={...policy(),preset:'custom',folders:[{path:'',include:'exclude'},{path:'Notes',include:'include',target:{kind:'move',localPath:'Archive'}},{path:'Private',include:'exclude'}],
        assignments:[{scope:'folder',path:'Notes',source:'b',remotePath:'notes',profileId:'standard:preserve'}],fileExclusions:[{pattern:'*.tmp'}]};
    const full=setScope(initial,'full');assert(full.folders.some(r=>r.path==='Private'&&r.include==='exclude'));
    assert.equal(applyPolicy([entry('Elsewhere/a.md')],compileProfiles(full,profiles),pathPolicy(),new Set()).transformedManifest.length,1);
    assert.deepEqual(setScope(full,'custom').folders,initial.folders);assert.deepEqual(full.assignments,initial.assignments);assert.deepEqual(full.fileExclusions,initial.fileExclusions);
    assert.equal(initial.scopeSelection,undefined);
});
test('configuration preset with a legacy .obsidian mapping remains included',()=>{
    const initial={...policy(),preset:'custom' as const,folders:[{path:'.obsidian',include:'include' as const,target:{kind:'move' as const,localPath:'Config'}}]};
    const selected=setScope(initial,'obsidian');assert.equal(applyPolicy([entry('.obsidian/app.json')],compileProfiles(selected,profiles),pathPolicy(),new Set()).excludedCount,0);
});
test('excluded scope can be included again without duplicate rules',()=>{
    let p=setParticipation(policy(),'Notes','exclude');p=setParticipation(p,'Notes','include');
    assert.equal(p.folders.filter(r=>r.path==='Notes').length,1);
    assert.equal(applyPolicy([entry('Notes/a.md')],compileProfiles(p,profiles),pathPolicy(),new Set()).transformedManifest.length,1);
});
test('including notes outside configuration changes the scope label',()=>{
    const p=setParticipation(setScope(policy(),'obsidian'),'Notes','include');assert.equal(p.preset,'custom');
    assert.equal(applyPolicy([entry('Notes/a.md')],compileProfiles(p,profiles),pathPolicy(),new Set()).transformedManifest.length,1);
});
test('tree and execution agree about glob exclusions',async()=>{
    const p={...policy(),fileExclusions:[{pattern:'*.tmp'}]};assert.equal(pathState(p,profiles,pathPolicy(),'a.tmp').state,'excluded');
    const w=await workspace(p);const row=Array.from((w.modal.contentEl as HTMLElement).querySelectorAll<HTMLElement>('[data-path]')).find(r=>r.dataset.path==='a.tmp');assert(row?.textContent?.includes('Excluded'));w.modal.close();
});
test('unfinished inspector input survives navigation, source refresh and default changes and saves',async()=>{
    const w=await workspace();node(w.modal.contentEl,'Notes');let box=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;
    select(control(box,'Source') as HTMLSelectElement,'b');input(control(box,'Source path') as HTMLInputElement,'remote-notes');
    select(control(w.modal.contentEl.querySelector('.sync-workspace-sources'),'Default source') as HTMLSelectElement,'b');
    assert.equal((control(box,'Source path') as HTMLInputElement).value,'remote-notes');
    click(w.modal.contentEl,'Source B · default');await tick();click(w.modal.contentEl,'Vault');node(w.modal.contentEl,'Notes');
    assert.equal((control(box,'Source path') as HTMLInputElement).value,'remote-notes');
    click(w.modal.contentEl,'Save settings');await tick();assert.equal(w.saved().p.assignments[0].remotePath,'remote-notes');
    assert.deepEqual(w.deps.policy.assignments,[]);w.modal.close();
});
test('unfinished inspector input participates in the close guard',async()=>{
    const w=await workspace();node(w.modal.contentEl,'Notes');const box=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;
    select(control(box,'Source') as HTMLSelectElement,'b');input(control(box,'Source path') as HTMLInputElement,'pending');
    w.modal.close();assert.equal(w.modal.closed,false);const prompt=document.body.lastElementChild as HTMLElement;assert(prompt.textContent?.includes('unsaved'));
    click(prompt,'Discard');assert.equal(w.modal.closed,true);assert.equal(w.saved(),undefined);
});
test('refreshing a source keeps the local tree context',async()=>{
    const w=await workspace();node(w.modal.contentEl,'Notes');click(w.modal.contentEl,'Refresh contents');await tick();
    assert.equal(w.modal.view,'vault');assert.equal(w.modal.context.selected.path,'Notes');w.modal.close();
});
test('filtered assignment is editable without broadening its selector',async()=>{
    const p={...policy(),assignments:[{scope:'folder' as const,path:'Notes',names:['data.json'],source:'b',remotePath:'notes',profileId:'standard:preserve'}]};
    const w=await workspace(p);node(w.modal.contentEl,'Notes');click(w.modal.contentEl,'Edit assignment');
    const box=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;assert.equal((control(box,'Exact file names') as HTMLInputElement).value,'data.json');
    select(control(box,'Behaviour profile') as HTMLSelectElement,'standard:seed');click(box,'Apply to draft');click(w.modal.contentEl,'Save settings');await tick();
    assert.equal(w.saved().p.assignments.length,1);assert.deepEqual(w.saved().p.assignments[0].names,['data.json']);assert.equal(w.saved().p.assignments[0].source,'b');w.modal.close();
});
test('invalid endpoint stays in the editor with an inline error',()=>{
    dom();let applied=false;const modal=new SourceConnectionModal(new App(),{...connections[0],values:{repoUrl:'nonsense',branch:'main'}},()=>applied=true);modal.open();
    click(modal.contentEl,'Apply to draft');assert.equal(applied,false);assert(modal.contentEl.querySelector('[aria-invalid=true]'));assert(document.body.contains(modal.contentEl));
});
test('closing conflict modal defers rather than authorizing replacement',async()=>{
    dom();const modal=new ConflictAskModal(new App(),{path:'a.md',localSize:5,remoteSize:6});const promise=modal.wait();modal.close();assert.equal(await promise,'defer');
    const f=fixture([entry('a.md')]);f.files.set('a.md',ab('LOCAL'));
    f.deps.conflict=new ConflictResolver('ask',{...f.resolverDeps,ui:{askConflict:async()=> 'defer'}});
    const stats=await f.coordinator.sync();assert.equal(str(f.files.get('a.md')!),'LOCAL');assert.equal(stats?.deferredConflicts,1);assert.equal(stats?.updated,0);assert.equal(stats?.downloaded,0);
});
test('skipped local update is not counted as applied; preview shows its condition',async()=>{
    const f=fixture([entry('a.md')]);f.files.set('a.md',ab('LOCAL'));f.coordinator.setSyncPolicy(compileProfiles({...policy(),assignments:[]},profiles));
    f.ui.confirmSync=async info=>{assert.equal(info.operations?.[0].action,'check');return true;};
    const stats=await f.coordinator.sync();assert.equal(stats?.updated,0);assert.equal(stats?.received,1);assert.equal(stats?.downloaded,0);assert.equal(stats?.results?.[0].status,'skipped');
});
test('source-selected runs cannot read, write, delete or clear the other owner',async()=>{
    const p={...policy(),defaultSource:undefined,assignments:[{scope:'folder' as const,path:'A',source:'a',remotePath:'root',profileId:'replace'},{scope:'folder' as const,path:'B',source:'b',remotePath:'root',profileId:'replace'}]};
    const library=[...profiles,{id:'replace',name:'Replace',write:'remote' as const,delete:'mirror' as const}],compiled=compileProfiles(p,library),rules=compiled.fileRules!;
    let readsB=0;const members=[{id:'a',name:'A',source:{kind:'git' as const,deletionSafety:'immutable' as const,getManifest:async()=>[entry('root/new.md')],fetch:async()=>ab('REMOTE')}},
        {id:'b',name:'B',source:{kind:'yandex' as const,deletionSafety:'unverified' as const,getManifest:async()=>{readsB++;return [entry('root/new.md')];},fetch:async()=>ab('REMOTE')}}];
    const f=fixture();f.deps.source=new RoutedSource(members,rules,p=>p,'none',['a']);f.deps.policy=pathPolicy().forSources(['a'],undefined,rules);f.deps.syncPolicy=compiled;
    f.own('A/gone.md','OLD_A');f.own('B/gone.md','PERSONAL_B');f.queue.add(entry('B/failed.md'),'offline',0);
    const first=await f.coordinator.sync();assert.equal(readsB,0);assert.equal(first?.outcome,'ok');assert.equal(first?.failed,0);assert(f.files.has('A/new.md'));assert(!f.files.has('A/gone.md'));assert.equal(str(f.files.get('B/gone.md')!),'PERSONAL_B');assert(f.cache.get('B/gone.md'));assert.equal(f.queue.size(),1);
    await f.coordinator.setSource(new RoutedSource(members,rules,p=>p,'none',['b']));f.coordinator.setPolicy(pathPolicy().forSources(['b'],undefined,rules));
    const beforeA=f.files.get('A/new.md')!;await f.coordinator.sync();assert.equal(readsB,1);assert.deepEqual(f.files.get('A/new.md'),beforeA);assert(f.files.has('B/new.md'));assert(f.files.has('B/gone.md'));
});
test('alternating selected sources uses the same configured routing namespace',async()=>{
    const plugin=new (Plugin as any)();plugin.settings={sourceType:'git',repoUrl:'',branch:'main',accessToken:'',profiles,connections,vaultPolicy:{...policy(),assignments:[{scope:'folder',path:'Docs',source:'b',remotePath:'notes'}]}};plugin.engineCtx=()=>({});
    const a=await plugin.routingContext(false,['a']),b=await plugin.routingContext(false,['b']);assert.equal(a.namespace,b.namespace);assert.deepEqual(a.source.sources.map((s:any)=>s.id),['a']);assert.deepEqual(b.source.sources.map((s:any)=>s.id),['b']);await a.source.dispose();await b.source.dispose();
});
test('recovery restoration creates a separate verified copy and protects it from future sync',async()=>{
    const f=fixture([entry('a.md')],'full');f.files.set('a.md',ab('PERSONAL'));
    f.vault.createBinary=async(path,data)=>{if(f.files.has(path))throw Error('exists');f.files.set(path,data.slice(0));};
    await f.coordinator.sync();const record=f.store.records().find(r=>r.recovery)!;assert(record);
    const path=await f.mutations.restoreCopy(record.id,p=>pathPolicy().isPathAllowed(p),()=>{});
    assert.equal(str(f.files.get('a.md')!),'REMOTE');assert.equal(str(f.files.get(path)!),'PERSONAL');assert.equal(pathPolicy().isPathAllowed(path),false);
    await f.coordinator.sync();assert(f.files.has(path));
});
test('keeping current bytes after recovery review rejects stale observations and retains history',async()=>{
    const f=fixture();const before=await versionOf(ab('BEFORE')),after=await versionOf(ab('AFTER'));const recovery=await f.recovery.save(ab('BEFORE'));
    await f.store.begin({id:'review',namespace:'test',planId:'p',path:'a.md',kind:'write',before,after,recovery,status:'committing',createdAt:1});
    f.files.set('a.md',ab('THIRD'));await assert.rejects(f.mutations.recover('test'),/needs review/);
    const expected=await versionOf(ab('THIRD'));f.files.set('a.md',ab('CHANGED'));await assert.rejects(f.mutations.keepCurrent('review',expected,undefined,()=>{}));assert.equal(f.store.records()[0].status,'blocked');
    f.files.set('a.md',ab('THIRD'));await f.mutations.keepCurrent('review',expected,undefined,()=>{});assert.equal(f.store.records()[0].status,'not-applied');assert.equal(str(f.files.get('a.md')!),'THIRD');assert(f.store.records()[0].recovery);
});

test('filtered mounts consume unselected siblings without downloading or deleting their original paths',async()=>{
    const p:SyncPolicy={...policy(),assignments:[
        {scope:'vault',path:'',profileId:'replace'},
        {scope:'folder',path:'Config',names:['config.json'],source:'a',remotePath:'root'},
    ]};
    const compiled=compileProfiles(p,[...profiles,{id:'replace',name:'Replace',write:'remote',delete:'mirror'}]),rules=compiled.fileRules!;
    const f=fixture();f.own('root/private.md','PERSONAL');
    f.deps.source=new RoutedSource([{id:'a',name:'A',source:{...f.source,getManifest:async()=>[entry('root/config.json'),entry('root/private.md')]}}],rules,p=>p,'a');
    f.deps.syncPolicy=compiled;f.deps.policy=pathPolicy().forSources(['a'],'a',rules);
    f.ui.confirmSync=async info=>{assert.equal(info.operations?.find(row=>row.path==='Config/config.json')?.remotePath,'root/config.json');return true;};
    const stats=await f.coordinator.sync();assert.equal(stats?.outcome,'ok');assert(f.files.has('Config/config.json'));assert.equal(stats.results?.find(row=>row.path==='Config/config.json')?.remotePath,'root/config.json');assert(!f.files.has('root/config.json'));
    assert.equal(str(f.files.get('root/private.md')!),'PERSONAL');assert(f.cache.get('root/private.md'));
    assert.equal(pathState(p,[...profiles,{id:'replace',name:'Replace',write:'remote',delete:'mirror'}],pathPolicy(),'root/private.md').state,'excluded');
});
test('legacy moved folders still publish and protect only their final destinations',async()=>{
    const p:SyncPolicy={...policy(),folders:[{path:'Notes',include:'include',target:{kind:'move',localPath:'Archive'}}]};
    const compiled=compileProfiles(p,profiles),rules=compiled.fileRules!,f=fixture([entry('Notes/a.md')]);
    f.deps.source=new RoutedSource([{id:'a',name:'A',source:f.source}],rules,p=>p.startsWith('Notes/')?'Archive/'+p.slice(6):p,'a');
    f.deps.policy=pathPolicy().forSources(['a'],'a',rules,p.folders);f.deps.syncPolicy=compiled;
    assert.equal((await f.coordinator.sync())?.outcome,'ok');assert(f.files.has('Archive/a.md'));assert(!f.files.has('Notes/a.md'));
    assert.equal(f.deps.policy.isPathAllowed('Notes/a.md'),false);assert.equal(f.deps.policy.isPathAllowed('Archive/a.md'),true);
});
test('adding a filtered assignment retains the all-files assignment and its editor after saving',async()=>{
    const p:SyncPolicy={...policy(),assignments:[{scope:'folder',path:'Notes',source:'a',remotePath:'notes',profileId:'standard:safe'}]};
    const w=await workspace(p);node(w.modal.contentEl,'Notes');click(w.modal.contentEl,'Add assignment');
    const box=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;
    input(control(box,'Exact file names') as HTMLInputElement,'data.json');select(control(box,'Source') as HTMLSelectElement,'b');
    input(control(box,'Source path') as HTMLInputElement,'config');click(w.modal.contentEl,'Save settings');await tick();
    assert.equal(w.saved().p.assignments.length,2);assert.equal(w.saved().p.assignments.find((a:any)=>!a.names).remotePath,'notes');
    assert.deepEqual(w.saved().p.assignments.find((a:any)=>a.names).names,['data.json']);assert.equal((control(box,'Exact file names') as HTMLInputElement).value,'data.json');
    assert.equal(w.modal.isDirty(),false);w.modal.close();
});
test('a stale dirty inspector cannot silently replace an assignment made in another panel',async()=>{
    const w=await workspace();node(w.modal.contentEl,'Notes');const box=w.modal.contentEl.querySelector('.sync-workspace-inspector') as HTMLElement;
    select(control(box,'Source') as HTMLSelectElement,'b');input(control(box,'Source path') as HTMLInputElement,'pending');
    click(w.modal.contentEl,'Source B');await tick();node(w.modal.contentEl,'Notes');click(box,'Place in vault');
    click(w.modal.contentEl,'Vault');node(w.modal.contentEl,'Notes');assert(box.textContent?.includes('changed in another panel'));
    click(w.modal.contentEl,'Save settings');await tick();assert.equal(w.saved(),undefined);
    assert.equal(w.modal.policy.assignments[0].remotePath,'Notes');click(box,'Apply to draft');click(w.modal.contentEl,'Save settings');await tick();
    assert.equal(w.saved().p.assignments[0].remotePath,'pending');w.modal.close();
});
test('connections used by unfinished assignments cannot be removed',async()=>{
    const w=await workspace();node(w.modal.contentEl,'Notes');select(control(w.modal.contentEl.querySelector('.sync-workspace-inspector'),'Source') as HTMLSelectElement,'b');
    click(w.modal.contentEl.querySelectorAll('.sync-workspace-source')[1],'Remove connection');assert.equal(w.modal.connections.length,2);
    assert((Notice as any).messages.some((s:string)=>s.includes('Connection is used')));
});

test('run preparation can be cancelled while an authentication probe is still pending',async()=>{
    const {awaitBeforeSession}=await import('../src/core/governance');const controller=new AbortController();
    const pending=awaitBeforeSession({beforeSession:()=>new Promise(()=>{})},10000,controller.signal);
    controller.abort();await assert.rejects(pending,{name:'AbortError'});
    const syncAbort=new AbortController();await assert.rejects(awaitBeforeSession({beforeSession:()=>{syncAbort.abort();return new Promise(()=>{});}},10000,syncAbort.signal),{name:'AbortError'});
});
test('the manual run panel opens during preparation and status clicks do not duplicate it',async()=>{
    dom();const plugin=new (Plugin as any)();let finish!:()=>void;const ready=new Promise<void>(resolve=>finish=resolve);
    plugin.app=new App();plugin.settings={mirrorLevel:'fetch',profiles,connections};plugin.queue={all:()=>[]};plugin.journal={load:async()=>[]};
    plugin.statusBar={state:'idle',setState(state:string,options:any){this.state=state;Object.assign(this,options);this.pipelinePhase=options?.phase??-1;}};
    plugin.runOwnedSession=async()=>{await ready;return null;};const pending=plugin.runSession('manual',async()=>null);
    assert(document.body.textContent?.includes('Preparing run'));const count=document.body.children.length;plugin.openStatusPopover();assert.equal(document.body.children.length,count);
    assert(plugin.statusModal);plugin.cancelSync();assert.equal(plugin.sessionController.signal.aborted,true);finish();await pending;plugin.statusModal.close();
});
test('recovery copy names stay within a portable UTF-8 filename length',async()=>{
    const f=fixture(),original='Notes/'+'я'.repeat(120)+'.md';f.files.set(original,ab('BEFORE'));
    f.vault.createBinary=async(path,data)=>{assert(!f.files.has(path));f.files.set(path,data.slice(0));};
    const bytes=await versionOf(ab('BEFORE')),recovery=await f.recovery.save(ab('BEFORE'));
    await f.store.begin({id:'long-name',namespace:'test',planId:'p',path:original,kind:'delete',before:bytes,after:{kind:'missing'},recovery,status:'committing',createdAt:1});
    const path=await f.mutations.restoreCopy('long-name',()=>true,()=>{});assert(new TextEncoder().encode(path.split('/').pop()!).length<=255);assert(path.endsWith('.md'));assert.equal(str(f.files.get(original)!),'BEFORE');
});

test('scope-only changes retain the configured route namespace and its applied baselines',async()=>{
    const plugin=new (Plugin as any)();const initial:SyncPolicy={...policy(),preset:'custom',folders:[{path:'',include:'exclude'},{path:'Notes',include:'include'}]};
    plugin.settings={sourceType:'git',repoUrl:'',branch:'main',accessToken:'',profiles,connections,vaultPolicy:initial};plugin.engineCtx=()=>({});
    const before=await plugin.routingContext(false);plugin.settings.vaultPolicy=setScope(initial,'full');const full=await plugin.routingContext(false);
    assert.equal(before.namespace,full.namespace);await before.source.dispose();await full.source.dispose();
});
test('legacy profile sources and layout opt-out migrate once without changing their meaning',async()=>{
    const plugin=new (Plugin as any)();let saves=0;const p:SyncPolicy={...policy(),assignments:[{scope:'vault',path:'',profileId:'legacy'}]};
    plugin.settings={sourceType:'git',repoUrl:connections[0].values.repoUrl,branch:'main',accessToken:'',mirrorLevel:'fetch',workspaceSync:false,conflictStrategy:'keep-both',
        profiles:[...profiles,{id:'legacy',name:'Legacy',write:'create',delete:'keep',source:'b'}],connections:structuredClone(connections),vaultPolicy:structuredClone(p),syncPolicies:{}};
    plugin.pluginDir=()=>'.obsidian/plugins/sync';plugin.saveSettingsImmediate=async()=>{saves++;};
    plugin.settings.syncPolicies[plugin.makeSourceId('git')]=structuredClone(p);
    await plugin.ensureProfileSettings();assert.equal(plugin.settings.vaultPolicy.assignments[0].source,'b');
    assert.equal(plugin.settings.profiles.find((profile:any)=>profile.id==='legacy').source,undefined);
    assert.deepEqual(plugin.settings.vaultPolicy.fileExclusions.map((e:any)=>e.pattern),['workspace.json','workspace-mobile.json']);
    await plugin.ensureProfileSettings();assert.equal(saves,1);
    plugin.settings.vaultPolicy.fileExclusions=[];await plugin.ensureProfileSettings();assert.deepEqual(plugin.settings.vaultPolicy.fileExclusions,[]);
});
