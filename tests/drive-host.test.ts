import test from 'node:test';
import assert from 'node:assert/strict';
import Plugin from '../main';
import { fixture,entry,ab,str,pathPolicy } from './helpers';
import { RoutedSource } from '../src/sources/routed-source';
import { GDriveOAuthSource } from '../src/sources/gdrive-oauth-source';
import { GoogleDriveClient,DRIVE_FOLDER } from '../src/sources/gdrive-client';
import { compileProfiles,STANDARD_PROFILES,validateProfileConnections } from '../src/core/profiles';
const profiles=structuredClone([...STANDARD_PROFILES]);
const policy={version:1 as const,mirror:false,folders:[],defaultSource:'drive',assignments:[
    {scope:'vault' as const,path:'',profileId:'standard:drive-bidirectional'},
    {scope:'folder' as const,path:'Git',source:'git',profileId:'standard:safe'}]};
const connections=[{id:'drive',name:'Drive',kind:'gdrive' as const,values:{authMode:'oauth-desktop',folderId:'root',accountSub:'SUB'}},{id:'git',name:'Git',kind:'git' as const,values:{repoUrl:'https://github.com/test/repo'}}];
async function host(){
    const f=fixture(),compiled=compileProfiles(policy,profiles),plugin=Object.create(Plugin.prototype) as any;
    const file={id:'remote',name:'a.md',mimeType:'text/plain',parents:['root'],version:'1',size:String(ab('REMOTE').byteLength),sha256Checksum:entry('a.md').hash};
    const root={id:'root',name:'root',mimeType:DRIVE_FOLDER,parents:[],version:'1'};let driveDownloads=0;
    const client={maxFileBytes:1024*1024,inventory:async()=>({root,items:[{path:'a.md',file,parentId:'root'}],excluded:0,diagnostics:[],completeness:'complete' as const}),inspect:async(id:string)=>id==='root'?root:file,
        download:async()=>{driveDownloads++;return ab('REMOTE');}} as unknown as GoogleDriveClient;
    const drive=new GDriveOAuthSource(client,'root'),git={...f.source,getManifest:async()=>[entry('Git/b.md')]};
    const routed=new RoutedSource([{id:'drive',name:'Drive',source:drive},{id:'git',name:'Git',source:git}],compiled.fileRules!,p=>p,'drive');
    await f.coordinator.setSource(routed);f.coordinator.setSyncPolicy(compiled);f.coordinator.setPolicy(pathPolicy().forSources(['drive','git'],'drive',compiled.fileRules!,[],['pull']));
    f.vault.createBinary=async(p,data)=>{assert(!f.files.has(p));f.files.set(p,data.slice(0));};
    Object.assign(plugin,{settings:{profiles,connections,vaultPolicy:policy},coordinator:f.coordinator,cache:f.cache,queue:f.queue,mutations:f.mutations,fsAdapter:f.memory.fs,
        preparedConfigRevision:0,getConfigurationRevision:()=>0,effectiveProfilePolicy:()=>compiled,makePolicy:()=>pathPolicy(),makeVaultAdapter:()=>f.vault,
        sessionController:new AbortController(),persistEngineState:async()=>{},makeSyncUI:()=>f.ui,statusBar:{setState:()=>{}}});
    return {plugin,f,git,driveDownloads:()=>driveDownloads};
}
test('real plugin dispatch separates a bidirectional Drive route from a pull child and merges results',async()=>{
    const h=await host(),result=await h.plugin.executeSync('auto');assert.equal(result.problem,undefined);assert.equal(result.failed,0);assert.equal(result.downloaded,2);
    assert.equal(str(h.f.files.get('a.md')!),'REMOTE');assert.equal(str(h.f.files.get('Git/b.md')!),'REMOTE');assert.equal(h.driveDownloads(),1);
    assert(h.f.memory.files.size>0);
});
test('a failed selected Git inventory leaves the independently owned Drive job working',async()=>{
    const h=await host();h.git.getManifest=async()=>{throw Error('inventory incomplete');};
    const result=await h.plugin.executeSync('auto');assert.equal(result.failed,1);assert.equal(result.downloaded,1);assert.equal(str(h.f.files.get('a.md')!),'REMOTE');assert.equal(h.driveDownloads(),1);assert.equal(result.jobResults.find((job:any)=>job.connectionId==='drive').outcome,'success');assert.equal(result.jobResults.find((job:any)=>job.connectionId==='git').outcome,'failed');
});
test('profile validation rejects bidirectional inheritance into a Git child without an explicit pull profile',()=>{
    const invalid:import('../src/core/policy').SyncPolicy=structuredClone(policy);delete invalid.assignments![1].profileId;
    assert.throws(()=>validateProfileConnections(invalid,profiles,connections),/OAuth Google Drive/);
    validateProfileConnections(policy,profiles,connections);
});
test('automatic completion verifies initial and repaired transfers, then leaves a no-op startup job completed',async()=>{
    const h=await host();let stats={totalFiles:0,downloaded:0,deleted:0,skipped:0,failed:0,bytesTransferred:0,duration:0,conflicts:0,outcome:'ok'};
    h.plugin.runSession=async()=>stats;
    assert.equal((await h.plugin.runAutoSession(['drive'],true)).followUp,true);
    assert.equal((await h.plugin.runAutoSession(['drive'],false)).followUp,false);
    stats={...stats,downloaded:1,failed:1,outcome:'error'};
    assert.equal((await h.plugin.runAutoSession(['drive'],false)).followUp,true);
    stats={...stats,downloaded:1,failed:0,outcome:'ok'};
    assert.equal((await h.plugin.runAutoSession(['drive'],false)).followUp,true);
});
test('public synchronization state covers the Drive phase while the pull coordinator is idle',async()=>{
    const h=await host();h.plugin.currentMirrorLevel=()=> 'fetch';h.plugin.governance={managerEverActive:false,status:'none',lastCheckedAt:null,lastBlockedReason:null};
    h.plugin.sessionOwned=true;assert.equal(h.plugin.buildVaultSyncState().syncState,'syncing');
    h.plugin.sessionOwned=false;assert.equal(h.plugin.buildVaultSyncState().syncState,'idle');
});
test('mixed manual pipeline applies independent files from both engines before presenting either source question',async()=>{
    const {parseHTML}=await import('linkedom'),{document,window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document,window});
    const {ConflictAskModal}=await import('../src/ui/conflict-modal');const oldWait=ConflictAskModal.prototype.wait;
    const h=await host(),p=[...profiles,{id:'ask-drive',name:'Ask Drive',direction:'bidirectional' as const,write:'changes' as const,delete:'tracked' as const,conflict:'ask' as const},
        {id:'ask-pull',name:'Ask pull',write:'changes' as const,delete:'keep' as const,conflict:'ask' as const}];
    const next=structuredClone(policy);next.assignments[0].profileId='ask-drive';next.assignments[1].profileId='ask-pull';const compiled=compileProfiles(next,p);
    h.plugin.settings.profiles=p;h.plugin.settings.vaultPolicy=next;h.plugin.effectiveProfilePolicy=()=>compiled;h.plugin.serializeAsk=(fn:()=>unknown)=>fn();
    h.f.coordinator.setSyncPolicy(compiled);h.f.coordinator.setPolicy(pathPolicy().forSources(['drive','git'],'drive',compiled.fileRules!,[],['pull']));
    h.f.files.set('a.md',ab('LOCAL DRIVE'));h.f.files.set('Git/b.md',ab('LOCAL GIT'));
    const drive=h.plugin.coordinator.getCurrentSource().executionMembers().find((m:any)=>m.id==='drive').source,inventory=drive.client.inventory;
    drive.client.inventory=async()=>{const original=await inventory();return {...original,items:[...original.items,{path:'other.md',file:{...original.items[0].file,id:'other',name:'other.md'}}]};};
    const inspect=drive.client.inspect;drive.client.inspect=async(id:string,signal:AbortSignal)=>id==='other'?{...(await inventory()).items[0].file,id:'other',name:'other.md'}:inspect(id,signal);
    h.git.getManifest=async()=>[entry('Git/b.md'),entry('Git/c.md')];let questions=0;
    const assertReady=()=>{questions++;assert.equal(str(h.f.files.get('Git/c.md')!),'REMOTE');assert.equal(str(h.f.files.get('other.md')!),'REMOTE');};
    h.f.resolverDeps.ui={askConflict:async()=>{assertReady();return 'defer';}};
    ConflictAskModal.prototype.wait=async()=>{assertReady();return 'defer';};
    try{const result=await h.plugin.executeSync('manual');assert.equal(result.failed,0);assert.equal(result.deferredConflicts,2);assert.equal(questions,2);}
    finally{ConflictAskModal.prototype.wait=oldWait;}
});

test('a Drive observer failure neither stops Git nor transfers the failed source ownership or queue',async()=>{
    const h=await host(),drive=h.plugin.coordinator.getCurrentSource().executionMembers().find((member:any)=>member.id==='drive').source;
    h.f.files.set('a.md',ab('PRIVATE'));h.f.queue.add(entry('a.md'),'waiting for Drive',1,'blocked');drive.getManifest=async()=>{throw Error('Drive unavailable');};
    const result=await h.plugin.executeSync('auto');assert.equal(result.failed,1);assert.equal(str(h.f.files.get('Git/b.md')!),'REMOTE');assert.equal(str(h.f.files.get('a.md')!),'PRIVATE');assert.equal(h.f.queue.size(),1);
    assert.equal(result.jobResults.find((job:any)=>job.connectionId==='git').outcome,'success');assert.equal(result.jobResults.find((job:any)=>job.connectionId==='drive').outcome,'failed');
});
test('ready Git applies before a slow Drive observer resolves, while all external effects remain serial',async()=>{
    const h=await host(),drive=h.plugin.coordinator.getCurrentSource().executionMembers().find((member:any)=>member.id==='drive').source;
    let release!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve),manifest=drive.getManifest.bind(drive);drive.getManifest=async(signal:AbortSignal)=>{await waiting;return manifest(signal);};
    const run=h.plugin.executeSync('auto');for(let i=0;i<60&&!h.f.files.has('Git/b.md');i++)await new Promise(resolve=>setTimeout(resolve,1));
    assert.equal(str(h.f.files.get('Git/b.md')!),'REMOTE');assert.equal(h.f.files.has('a.md'),false);release();const result=await run;assert.equal(result.failed,0);assert.equal(result.downloaded,2);
});
test('scope directories prevent a failed or delayed source from replacing a future child job parent with a file',async()=>{
    const h=await host(),drive=h.plugin.coordinator.getCurrentSource().executionMembers().find((member:any)=>member.id==='drive').source;
    const inventory=drive.client.inventory,inspect=drive.client.inspect;let ancestor:any;
    drive.client.inventory=async()=>{const current=await inventory();ancestor={...current.items[0].file,id:'ancestor',name:'Git'};return {...current,items:[...current.items,{path:'Git',file:ancestor}]};};
    drive.client.inspect=async(id:string,signal:AbortSignal)=>id==='ancestor'?ancestor:inspect(id,signal);
    const result=await h.plugin.executeSync('auto');assert.equal(result.failed,0);assert.equal(str(h.f.files.get('Git/b.md')!),'REMOTE');assert.equal(h.f.files.has('Git'),false);assert(result.results.some((row:any)=>row.path==='Git'&&row.reason==='directory-reservation'));
});
test('manual tracked pull deletion remains scoped and does not depend on a failed neighboring Drive inventory',async()=>{
    const h=await host(),next=structuredClone(policy),library=[...profiles,{id:'tracked-git',name:'Tracked',write:'changes' as const,delete:'tracked' as const,conflict:'keep-both' as const}];next.assignments[1].profileId='tracked-git';
    const compiled=compileProfiles({...next,mirrorFolders:{Git:{state:'on' as const,level:'light' as const}}},library);h.plugin.settings.profiles=library;h.plugin.settings.vaultPolicy=next;h.plugin.effectiveProfilePolicy=()=>compiled;h.f.coordinator.setSyncPolicy(compiled);
    const drive=h.plugin.coordinator.getCurrentSource().executionMembers().find((member:any)=>member.id==='drive').source;drive.getManifest=async()=>{throw Error('Drive failed');};h.f.own('Git/gone.md','OLD');h.f.own('a.md','PRIVATE');
    const result=await h.plugin.executeSync('manual');assert.equal(result.failed,1);assert.equal(result.deleted,1);assert(!h.f.files.has('Git/gone.md'));assert.equal(str(h.f.files.get('a.md')!),'PRIVATE');assert(h.f.cache.get('a.md'));
});
test('a retained Drive baseline blocks a new owner from bootstrap replacement while independent Git files finish',async()=>{
    const h=await host();await h.plugin.executeSync('auto');const next=structuredClone(policy);next.assignments.push({scope:'file' as any,path:'a.md',profileId:'standard:source',source:'git'} as any);
    const compiled=compileProfiles(next,profiles);h.plugin.settings.vaultPolicy=next;h.plugin.effectiveProfilePolicy=()=>compiled;h.f.coordinator.setSyncPolicy(compiled);h.git.getManifest=async()=>[entry('a.md','NEW'),entry('Git/new.md')];h.git.fetch=async()=>ab('REMOTE');const members=h.f.coordinator.getCurrentSource() as RoutedSource;await h.f.coordinator.setSource(new RoutedSource([...members.executionMembers()],compiled.fileRules!,p=>p,'drive'));
    const result=await h.plugin.executeSync('auto');assert.equal(str(h.f.files.get('a.md')!),'REMOTE');assert.equal(str(h.f.files.get('Git/new.md')!),'REMOTE');assert(result.results.some((row:any)=>row.path==='a.md'&&row.reason==='retained-drive-identity'));assert.equal(result.jobResults.find((job:any)=>job.connectionId==='git').outcome,'needs-attention');
});
test('finishing skips queued failures and transfers only eligible independent work, without asking questions',async()=>{
    const h=await host();h.f.queue.add(entry('Git/b.md'),'waiting for retry',0,'transient');h.git.getManifest=async()=>[entry('Git/b.md'),entry('Git/new.md')];let requests=0;h.git.fetch=async()=>{requests++;return ab('REMOTE');};
    const result=await h.plugin.executeSync('auto',undefined,false,undefined,'finishing');assert.equal(result.failed,0);assert.equal(requests,1);assert(!h.f.files.has('Git/b.md'));assert.equal(str(h.f.files.get('Git/new.md')!),'REMOTE');assert.equal(h.f.queue.size(),1);
});
test('configuration changes and cancellation fence every queued job before file effects',async()=>{
    for(const cancel of [false,true]){const h=await host();let revision=0;h.plugin.getConfigurationRevision=()=>revision;h.git.getManifest=async()=>{if(cancel)h.plugin.sessionController.abort();else revision=1;return [entry('Git/b.md')];};
        const result=await h.plugin.executeSync('auto');assert.equal(h.f.files.size,0);assert.equal(result.outcome,cancel?'cancelled':'error');}
});
test('an existing local parent file alias blocks only its child group and keeps independent files working',async()=>{
    const h=await host();h.f.files.set('git',ab('USER FILE'));h.git.getManifest=async()=>[entry('Git/b.md'),entry('Elsewhere.md')];
    // Place an independently owned Git exact-file target outside the blocked folder.
    const next=structuredClone(policy);next.assignments.push({scope:'file' as any,path:'Elsewhere.md',source:'git',profileId:'standard:safe'} as any);const compiled=compileProfiles(next,profiles);h.plugin.settings.vaultPolicy=next;h.plugin.effectiveProfilePolicy=()=>compiled;h.f.coordinator.setSyncPolicy(compiled);const members=h.f.coordinator.getCurrentSource() as RoutedSource;await h.f.coordinator.setSource(new RoutedSource([...members.executionMembers()],compiled.fileRules!,p=>p,'drive'));
    const result=await h.plugin.executeSync('auto');assert.equal(result.failed,0);assert.equal(str(h.f.files.get('git')!),'USER FILE');assert(!h.f.files.has('Git/b.md'));assert.equal(str(h.f.files.get('Elsewhere.md')!),'REMOTE');assert(result.results.some((row:any)=>row.reason==='local-parent-collision'));
});
test('selected job updates preserve the unselected job last result and expose cloned public projections',async()=>{
    const h=await host();await h.plugin.executeSync('auto');const before=h.plugin.jobRuns.find((job:any)=>job.connectionId==='drive');h.plugin.publishJobs(h.plugin.jobRuns.filter((job:any)=>job.connectionId==='git').map((job:any)=>({...job,runId:'next-git-run'})));
    assert.equal(h.plugin.jobRuns.find((job:any)=>job.connectionId==='drive').runId,before.runId);const snapshot=h.plugin.automaticJobSnapshots();snapshot.find((job:any)=>job.connectionId==='drive').run.downloaded=999;assert.notEqual(h.plugin.jobRuns.find((job:any)=>job.connectionId==='drive').downloaded,999);
});
test('an unresolved historical file target holds its parents before another job can mkdir or stage a descendant',async()=>{
    const h=await host();await h.f.store.begin({id:'retired',planId:'retired',namespace:'old-route',path:'Git',kind:'write',before:{kind:'missing'},after:{kind:'file',size:3,sha256:entry('Git','old').hash},status:'committing',createdAt:1});
    const result=await h.plugin.executeSync('auto');assert(!h.f.dirs.has('Git'));assert(!h.f.files.has('Git/b.md'));assert.equal(h.f.store.records().find(record=>record.id==='retired')!.status,'committing');assert(result.results.some((row:any)=>row.reason==='recovery-overlap'));assert.equal(str(h.f.files.get('a.md')!),'REMOTE');
});
test('an owned interrupted write is accounted without repeating transfer, while an edited unresolved target leaves independent files working',async()=>{
    for(const edited of [false,true]){const h=await host();await h.f.store.begin({id:'owned',planId:'owned',namespace:'test',path:'Git/b.md',kind:'write',before:{kind:'missing'},after:{kind:'file',size:6,sha256:entry('Git/b.md').hash},status:'committing',createdAt:1,effect:{kind:'set',remote:entry('Git/b.md'),mode:'applied'}});
        h.f.files.set('Git/b.md',ab(edited?'USER':'REMOTE'));h.f.queue.add(entry('Git/b.md'),'interrupted transfer',Date.now()-100000);h.f.dirs.add('Git');h.git.getManifest=async()=>[entry('Git/b.md'),entry('Git/new.md')];let requests=0;h.git.fetch=async()=>{requests++;return ab('REMOTE');};const result=await h.plugin.executeSync('auto');
        assert.equal(str(h.f.files.get('Git/b.md')!),edited?'USER':'REMOTE');assert.equal(str(h.f.files.get('Git/new.md')!),'REMOTE');assert.equal(requests,1);assert.equal(h.f.queue.size(),edited?1:0);assert.equal(h.f.store.records().find(record=>record.id==='owned')!.status,edited?'blocked':'applied');if(edited)assert(result.results.some((row:any)=>row.reason==='recovery-review'||row.reason==='recovery-overlap'));}
});
test('a source case-only rename cannot orphan-trash its accepted local alias while other files finish',async()=>{
    const h=await host(),next=structuredClone(policy),library=[...profiles,{id:'tracked-case',name:'Tracked',write:'changes' as const,delete:'tracked' as const,conflict:'keep-both' as const}];next.assignments[1].profileId='tracked-case';
    const compiled=compileProfiles(next,library);h.plugin.settings.profiles=library;h.plugin.settings.vaultPolicy=next;h.plugin.effectiveProfilePolicy=()=>compiled;h.f.coordinator.setSyncPolicy(compiled);h.f.own('Git/A.md','REMOTE');h.f.dirs.add('Git');h.git.getManifest=async()=>[entry('Git/a.md'),entry('Git/new.md')];
    const result=await h.plugin.executeSync('manual');assert.equal(str(h.f.files.get('Git/A.md')!),'REMOTE');assert.equal(h.f.files.has('Git/a.md'),false);assert.equal(result.deleted,0);assert.equal(str(h.f.files.get('Git/new.md')!),'REMOTE');assert(result.results.some((row:any)=>row.reason==='cached-path-alias'));assert(h.f.cache.get('Git/A.md'));
});
test('host admission blocks two writers of the same Drive root while an independent Git job finishes',async()=>{
 const h=await host(),current=h.f.coordinator.getCurrentSource() as RoutedSource,members=[...current.bindingMembers()],drive=members.find(member=>member.id==='drive')!.source as GDriveOAuthSource;
 const root={id:'account-root',name:'Root',mimeType:DRIVE_FOLDER,parents:[],version:'1'},file={id:'remote',name:'a.md',mimeType:'text/plain',parents:[root.id],version:'1',size:'6',sha256Checksum:entry('a.md').hash};
 drive.client.inventory=async()=>({root,items:[{path:'a.md',file,parentId:root.id}],excluded:0,diagnostics:[],completeness:'complete'});drive.client.inspect=async(id:string)=>id==='root'||id===root.id?root:file;
 const other=new GDriveOAuthSource(drive.client,root.id),next=structuredClone(policy);next.assignments.push({scope:'folder',path:'Other',source:'drive2',remotePath:'',profileId:'standard:drive-bidirectional'} as any);
 const compiled=compileProfiles(next,profiles);h.plugin.settings.vaultPolicy=next;h.plugin.settings.connections=[...connections,{id:'drive2',name:'Other Drive',kind:'gdrive',values:{authMode:'oauth-desktop',folderId:root.id,accountSub:'SUB'}}];h.plugin.effectiveProfilePolicy=()=>compiled;
 await h.f.coordinator.setSource(new RoutedSource([...members,{id:'drive2',name:'Other Drive',source:other}],compiled.fileRules!,p=>p,'drive'));h.f.coordinator.setSyncPolicy(compiled);
 const result=await h.plugin.executeSync('auto');assert.equal(h.driveDownloads(),0);assert(!h.f.files.has('a.md'));assert(!h.f.files.has('Other/a.md'));assert.equal(str(h.f.files.get('Git/b.md')!),'REMOTE');assert.equal(result.jobResults.find((job:any)=>job.connectionId==='git').outcome,'success');
 for(const id of ['drive','drive2'])assert(result.jobResults.find((job:any)=>job.connectionId===id).issues.some((issue:any)=>issue.code==='remote-ownership'));
});
