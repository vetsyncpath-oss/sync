import test from 'node:test';
import assert from 'node:assert/strict';
import Plugin from '../main';
import { fixture, ab, str, sha } from './helpers';
import { compileProfiles, STANDARD_PROFILES } from '../src/core/profiles';
import type { SyncPolicy } from '../src/core/policy';
import { PathPolicy } from '../src/core/path-policy';
import { RoutedSource } from '../src/sources/routed-source';
import { GDriveOAuthSource } from '../src/sources/gdrive-oauth-source';
import { GoogleDriveClient, DRIVE_FOLDER, type DriveFile } from '../src/sources/gdrive-client';
import { artifactProperties, driveConflictSibling } from '../src/core/drive-artifact';
import { DriveStateStore } from '../src/core/drive-state';
import { SyncFault } from '../src/core/sync-issue';

class Remote {
    files=new Map<string,{file:DriveFile;bytes:ArrayBuffer}>();counter=0;uploads=0;lostReply=false;downloadErrorId?:string;
    client:GoogleDriveClient={maxFileBytes:1024*1024,
        inspect:async(id:string)=>{const item=this.files.get(id);if(!item)throw Object.assign(Error('HTTP 404'),{status:404});return structuredClone(item.file);},
        listChildren:async(id:string)=>[...this.files.values()].filter(i=>i.file.parents.includes(id)&&!i.file.trashed).map(i=>structuredClone(i.file)),
        reserveId:async()=>`reserved-${++this.counter}`,
        mkdir:async(id:string,name:string,parent:string)=>{this.folder(id,name,parent);return structuredClone(this.files.get(id)!.file);},
        verify:async(file:DriveFile,data:ArrayBuffer)=>{assert.equal(sha(str(data)),file.sha256Checksum);},
        download:async(file:DriveFile)=>{if(file.id===this.downloadErrorId)throw new SyncFault('network','Interrupted artifact transfer','file',true);
            const item=this.files.get(file.id)!;assert.equal(item.file.version,file.version);return item.bytes.slice(0);},
        upload:async(id:string,metadata:any,data:ArrayBuffer,create:boolean,_signal:AbortSignal,persist:any)=>{
            assert(create);assert(!this.files.has(id));await persist({url:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',fileId:id,offset:0,size:data.byteLength});
            const file={...metadata,id,size:String(data.byteLength),version:'1',sha256Checksum:sha(str(data))};this.files.set(id,{file,bytes:data.slice(0)});this.uploads++;
            if(this.lostReply){this.lostReply=false;throw new SyncFault('network','Lost final create response','file',true);}return structuredClone(file);
        },
        metadata:async(id:string,patch:object)=>{const item=this.files.get(id)!;Object.assign(item.file,patch);item.file.version=String(Number(item.file.version)+1);return structuredClone(item.file);}
    } as unknown as GoogleDriveClient;
    constructor(){this.folder('root','Root');this.client.inventory=(root,signal)=>GoogleDriveClient.prototype.inventory.call(this.client,root,signal);}
    folder(id:string,name:string,parent?:string){this.files.set(id,{file:{id,name,mimeType:DRIVE_FOLDER,parents:parent?[parent]:[],version:'1'},bytes:ab('')});}
    add(id:string,name:string,content:string,parent='root',properties?:Record<string,string>){this.files.set(id,{file:{id,name,mimeType:'text/plain',parents:[parent],version:'1',size:String(ab(content).byteLength),sha256Checksum:sha(content),properties},bytes:ab(content)});}
    artifact(originId:string,originPath:string,content='proposal',id='artifact',proposalId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'){
        const origin=this.files.get(originId)!.file,path=driveConflictSibling(originPath,proposalId);
        this.add(id,path.split('/').pop()!,content,origin.parents[0],artifactProperties({originId,proposalId,hash:sha(content),baseVersion:origin.version,baseHash:origin.sha256Checksum!,kind:'gated-upload'}));
        return path;
    }
}
const fullPolicy=():SyncPolicy=>({version:1,mirror:false,folders:[],defaultSource:'drive',assignments:[{scope:'vault',path:'',profileId:'standard:drive-bidirectional'}]});
const namedPolicy=():SyncPolicy=>({...fullPolicy(),assignments:[{scope:'vault',path:'',profileId:'standard:preserve'},
    {scope:'folder',path:'Notes',source:'drive',remotePath:'Library',names:['a.md'],profileId:'standard:drive-bidirectional'}]});
async function peer(remote:Remote,policy=fullPolicy()){
    const f=fixture(),profiles=structuredClone([...STANDARD_PROFILES]),compiled=compileProfiles(policy,profiles),plugin=Object.create(Plugin.prototype) as any;
    const protection=new PathPolicy({syncMode:'full-vault',allowedFolders:'',ignoredFolders:'',allowPlugins:true,allowSnippets:false,protectedPaths:['.obsidian/plugins/sync']});
    const drive=new GDriveOAuthSource(remote.client,'root'),routed=new RoutedSource([{id:'drive',name:'Drive',source:drive}],compiled.fileRules!,p=>p,'drive');
    await f.coordinator.setSource(routed);f.coordinator.setSyncPolicy(compiled);f.coordinator.setPolicy(protection.forSources(['drive'],'drive',compiled.fileRules!,compiled.folders,['pull']));
    f.vault.createBinary=async(path,data)=>{assert(!f.files.has(path));f.files.set(path,data.slice(0));};
    f.vault.compareAndWrite=async(path,data,before)=>{if(!f.files.has(path)||str(f.files.get(path)!)!==str(before))return false;f.files.set(path,data.slice(0));return true;};
    f.vault.trash=async path=>{const data=f.files.get(path)!;f.files.delete(path);f.files.set('.trash/'+path,data);};
    Object.assign(plugin,{settings:{profiles,connections:[{id:'drive',name:'Drive',kind:'gdrive',values:{authMode:'oauth-desktop',folderId:'root',accountSub:'SUB'}}],vaultPolicy:policy},
        coordinator:f.coordinator,cache:f.cache,queue:f.queue,mutations:f.mutations,fsAdapter:f.memory.fs,preparedConfigRevision:0,getConfigurationRevision:()=>0,
        effectiveProfilePolicy:()=>compiled,makePolicy:()=>protection,makeVaultAdapter:()=>f.vault,sessionController:new AbortController(),
        persistEngineState:async()=>{},makeSyncUI:()=>f.ui,statusBar:{setState:()=>{}}});
    const state=async()=>{const name=[...f.memory.files.keys()].filter(n=>/^drive-state-.*-\d{16}\.json$/.test(n)).sort().at(-1)!;
        const payload=JSON.parse(JSON.parse(f.memory.files.get(name)!).payload),store=new DriveStateStore(f.memory.fs,name.slice('drive-state-'.length,-'-0000000000000001.json'.length));
        await store.load();return {payload,store};};
    return {f,plugin,drive,state,run:(paths?:string[],mode='auto',control?:any)=>plugin.executeSync(mode,paths,false,control)};
}
test('actual host dispatch delivers a proposal to another vault through an exact-name mount without changing the canonical ID',async()=>{
    const remote=new Remote();remote.folder('library','Library','root');remote.add('origin','a.md','base','library');remote.add('excluded','b.md','excluded','library');
    const a=await peer(remote,namedPolicy());a.f.files.set('Notes/a.md',ab('base'));await a.run();a.f.files.set('Notes/a.md',ab('edit'));
    const produced=await a.run();assert.equal(produced.failed,0);assert.equal(remote.uploads,1);assert.equal(str(remote.files.get('origin')!.bytes),'base');
    const b=await peer(remote,namedPolicy()),received=await b.run();assert.equal(received.failed,0);assert.equal(str(b.f.files.get('Notes/a.md')!),'base');
    const copy=[...b.f.files.keys()].find(p=>p.startsWith('Notes/a.conflict-'))!;assert(copy);assert.equal(str(b.f.files.get(copy)!),'edit');
    assert(!b.f.files.has('Library/a.md'));assert(!b.f.files.has('Notes/b.md'));assert.equal(remote.uploads,1);assert.equal(received.results.find((r:any)=>r.path===copy)?.reason,'drive-proposal-received');
    const {store}=await b.state();assert.equal(Object.keys(store.snapshot().baseline).length,1);assert.equal(store.artifacts().length,1);
    let writes=0;const write=b.f.memory.fs.write;b.f.memory.fs.write=async(path,data)=>{if(path.startsWith('drive-state-'))writes++;await write(path,data);};
    const warm=await b.run();assert.equal(warm.downloaded,0);assert.equal(warm.uploaded??0,0);assert.equal(writes,0);
});
test('peer edits and removals are visible pending artifacts, preserve local bytes and never recursively publish or trash copies',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const copy=remote.artifact('origin','a.md');const b=await peer(remote);await b.run();
    b.f.files.set(copy,ab('peer edit'));let result=await b.run();assert.equal(result.results.find((r:any)=>r.path===copy)?.reason,'artifact-local-edited');assert.equal(str(b.f.files.get(copy)!),'peer edit');
    assert.equal(remote.uploads,0);assert.equal((await b.state()).store.artifacts()[0].localHash,sha('peer edit'));
    b.f.files.delete(copy);result=await b.run();assert.equal(result.results.find((r:any)=>r.path===copy)?.reason,'artifact-local-missing');assert(!b.f.files.has(copy));assert(!remote.files.get('artifact')!.file.trashed);
    result=await b.run([copy],'scan');assert.equal(result.failed,0);assert.equal(str(b.f.files.get(copy)!),'proposal');assert.equal(remote.uploads,0);
});
test('origin exclusions, protected control paths, legacy files and forged names cannot broaden artifact coverage',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const copy=remote.artifact('origin','a.md');remote.add('legacy','a.conflict-old.md','legacy');
    remote.add('own','main.js','code','.obsidian-folder');remote.folder('.obsidian-folder','sync','plugins');remote.folder('plugins','plugins','obsidian');remote.folder('obsidian','.obsidian','root');
    const ownCopy=remote.artifact('own','.obsidian/plugins/sync/main.js','secret','own-artifact','cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee');
    remote.add('forged','b.md','payload','root',artifactProperties({originId:'origin',proposalId:'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',hash:sha('payload'),baseVersion:'1',baseHash:sha('base'),kind:'gated-upload'}));
    const policy=fullPolicy();policy.fileExclusions=[{pattern:'a.md'}];
    const b=await peer(remote,policy),result=await b.run();assert.equal(result.failed,0);assert(!b.f.files.has(copy));assert(!b.f.files.has(ownCopy));assert(!b.f.files.has('b.md'));assert(!b.f.files.has('a.conflict-old.md'));
    assert.equal(remote.uploads,0);assert.equal((await b.state()).store.artifacts().length,0);
});
test('an artifact with a different parent or a digest claim that does not match its bytes is not downloaded as a proposal',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const copy=remote.artifact('origin','a.md');remote.files.get('artifact')!.file.sha256Checksum=sha('changed');remote.files.get('artifact')!.bytes=ab('changed');remote.files.get('artifact')!.file.size='7';
    const b=await peer(remote),result=await b.run();assert.equal(result.results.find((r:any)=>r.path===copy)?.reason,'artifact-remote-edited');assert(!b.f.files.has(copy));assert.equal(str(b.f.files.get('a.md')!),'base');
    remote.folder('elsewhere','Elsewhere','root');remote.files.get('artifact')!.file.parents=['elsewhere'];const c=await peer(remote);await c.run();assert(![...c.f.files.keys()].some(p=>p.includes('.conflict-')));
});
test('artifact copy-before-trash reaches a second vault after the tracked origin is explicitly trashed',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const a=await peer(remote);a.f.files.set('a.md',ab('base'));await a.run();
    // Enable deletion coverage already requested by the user; the old mirror guard is a separate input.
    a.plugin.effectiveProfilePolicy=()=>compileProfiles({...fullPolicy(),mirrorFolders:{'':{state:'on',level:'light'}}},structuredClone([...STANDARD_PROFILES]));
    a.f.files.set('a.md',ab('survivor'));remote.files.get('origin')!.file.trashed=true;const saved=await a.run();assert.equal(saved.failed,0);
    const b=await peer(remote),received=await b.run();assert.equal(received.failed,0);const copy=[...b.f.files.keys()].find(p=>p.includes('.conflict-'))!;
    assert(copy);assert.equal(str(b.f.files.get(copy)!),'survivor');assert(!b.f.files.has('a.md'));assert.equal(remote.files.get('origin')!.file.trashed,true);
    a.f.files.set('a.md',ab('recreated'));const before=remote.uploads,recreated=await a.run();
    assert.equal(remote.uploads,before);assert.equal(remote.files.get('origin')!.file.trashed,true);assert(recreated.results.some((r:any)=>r.reason==='drive-deleted-review'));
});
test('an artifact transfer error leaves independent canonical files working and retries through its origin named rule',async()=>{
    const remote=new Remote();remote.folder('library','Library','root');remote.add('origin','a.md','base','library');const copy=remote.artifact('origin','Library/a.md');remote.downloadErrorId='artifact';
    const b=await peer(remote,namedPolicy()),partial=await b.run();const target=copy.replace('Library/','Notes/');
    assert.equal(partial.failed,1);assert.equal(str(b.f.files.get('Notes/a.md')!),'base');assert.equal(partial.pendingAfter,1);assert.equal(b.f.queue.all()[0].originPath,'Notes/a.md');
    b.plugin.runSession=async()=>partial;const scheduled=await b.plugin.runAutoSession(['drive'],false);assert(scheduled.retryAt);
    remote.downloadErrorId=undefined;const retry=await b.run([target],'retry');assert.equal(retry.failed,0);assert.equal(retry.pendingAfter,0);assert.equal(str(b.f.files.get(target)!),'proposal');
});
test('loss or trash of a received remote artifact never deletes the peer copy or republishes a new object',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const copy=remote.artifact('origin','a.md');const b=await peer(remote);await b.run();
    remote.files.get('artifact')!.file.trashed=true;let result=await b.run();assert.equal(result.results.find((r:any)=>r.path===copy)?.reason,'artifact-remote-trashed');assert.equal(str(b.f.files.get(copy)!),'proposal');
    remote.files.delete('artifact');result=await b.run();assert.equal(result.results.find((r:any)=>r.path===copy)?.reason,'artifact-unavailable');assert.equal(str(b.f.files.get(copy)!),'proposal');assert.equal(remote.uploads,0);
});

test('an unavailable or out-of-root artifact origin never freezes independent files or authorizes a guessed local path',async()=>{
    for(const unavailable of [true,false]){
        const remote=new Remote();remote.add('origin','a.md','base');remote.artifact('origin','a.md');remote.add('independent','other.md','ready');
        if(unavailable)remote.files.delete('origin');else{remote.folder('outside','Outside');remote.files.get('origin')!.file.parents=['outside'];}
        const b=await peer(remote),result=await b.run();assert.equal(result.failed,0);assert.equal(str(b.f.files.get('other.md')!),'ready');
        assert(![...b.f.files.keys()].some(p=>p.includes('.conflict-')));assert(result.results.some((r:any)=>r.reason==='artifact-origin-unavailable'));assert.equal(remote.uploads,0);
    }
});

test('removing a received artifact marker preserves the peer bytes and records the lineage change',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const copy=remote.artifact('origin','a.md'),b=await peer(remote);await b.run();
    delete remote.files.get('artifact')!.file.properties;remote.files.get('artifact')!.file.version='2';const result=await b.run();
    assert.equal(result.results.find((r:any)=>r.path===copy)?.reason,'artifact-lineage-changed');assert.equal(str(b.f.files.get(copy)!),'proposal');assert.equal(remote.uploads,0);
});

test('source-side exact exclusions survive a named mount and block both origin and proposal effects',async()=>{
    const remote=new Remote();remote.folder('library','Library','root');remote.add('origin','a.md','base','library');remote.artifact('origin','Library/a.md');
    const policy=namedPolicy();policy.fileExclusions=[{pattern:'Library/a.md'}];const b=await peer(remote,policy),result=await b.run();
    assert.equal(result.failed,0);assert(!b.f.files.has('Notes/a.md'));assert(![...b.f.files.keys()].some(p=>p.includes('.conflict-')));assert.equal(remote.uploads,0);
});

test('conflicting artifact IDs block their target group without stopping an independent canonical download',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const copy=remote.artifact('origin','a.md');
    remote.files.set('duplicate',{file:{...structuredClone(remote.files.get('artifact')!.file),id:'duplicate'},bytes:ab('proposal')});remote.add('other','other.md','ready');
    const b=await peer(remote),result=await b.run();assert.equal(result.failed,0);assert(!b.f.files.has(copy));assert.equal(str(b.f.files.get('other.md')!),'ready');
    assert.equal(result.results.filter((r:any)=>r.reason==='artifact-target-collision').length,1);assert.equal((await b.state()).store.artifacts().length,2);assert.equal(remote.uploads,0);
});

test('an artifact without an API SHA-256 still requires a matching downloaded payload digest',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const copy=remote.artifact('origin','a.md');const item=remote.files.get('artifact')!;
    delete item.file.sha256Checksum;item.bytes=ab('forgery!');item.file.size=String(item.bytes.byteLength);
    const b=await peer(remote),result=await b.run();assert.equal(result.failed,0);assert(!b.f.files.has(copy));assert(result.results.some((r:any)=>r.reason==='artifact-remote-edited'));assert.equal(remote.uploads,0);
});

test('moving the origin out of the selected root during an artifact download invalidates local publication',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const copy=remote.artifact('origin','a.md');remote.folder('outside','Outside');
    const download=remote.client.download;remote.client.download=async(file,signal)=>{const data=await download.call(remote.client,file,signal);if(file.id==='artifact')remote.files.get('origin')!.file.parents=['outside'];return data;};
    const b=await peer(remote),result=await b.run();assert(!b.f.files.has(copy));assert.equal(remote.uploads,0);assert(result.results.some((r:any)=>r.path===copy&&r.status==='error'));
});

test('exact file mappings preserve the actual origin name, parent and ID when case or NFC spelling differs',async()=>{
    const remote=new Remote(),actualName='e\u0301.MD';remote.folder('library','Library','root');remote.add('origin',actualName,'base','library');
    const policy=fullPolicy();policy.assignments=[{scope:'vault',path:'',profileId:'standard:preserve'},
        {scope:'file',path:'Notes/custom.md',source:'drive',remotePath:'library/É.md',profileId:'standard:drive-bidirectional'}];
    const a=await peer(remote,policy);a.f.files.set('Notes/custom.md',ab('base'));await a.run();a.f.files.set('Notes/custom.md',ab('edit'));
    const saved=await a.run();assert.equal(saved.failed,0);assert.equal(remote.uploads,1);const proposal=(await a.state()).store.proposals('Notes/custom.md')[0];
    const copy=remote.files.get(proposal.copyId!)!.file;assert.equal(copy.name,driveConflictSibling(actualName,proposal.id));assert.deepEqual(copy.parents,['library']);
    assert.equal(remote.files.get('origin')!.file.id,'origin');const b=await peer(remote,policy),received=await b.run();assert.equal(received.failed,0);
    assert.equal(str(b.f.files.get(proposal.copyPath)!),'edit');assert.equal(str(b.f.files.get('Notes/custom.md')!),'base');assert.equal(remote.uploads,1);
});

test('unsafe ancestor names cannot impersonate the same joined path after a remote move during inventory',async()=>{
    const remote=new Remote();remote.folder('a','a','root');remote.folder('b','b','a');remote.add('origin','file.md','base','b');remote.add('other','other.md','ready');
    const b=await peer(remote);b.f.files.set('a/b/file.md',ab('edit'));
    const inventory=remote.client.inventory;remote.client.inventory=async(root,signal)=>{const snapshot=await inventory.call(remote.client,root,signal);
        remote.files.get('b')!.file.name='a/b';remote.files.get('b')!.file.parents=['root'];return snapshot;};
    const result=await b.run();assert.equal(result.results.find((row:any)=>row.path==='a/b/file.md')?.reason,'drive-relocated');assert.equal((await b.state()).store.inbox('a/b/file.md')?.reason,'drive-relocated');assert.equal(remote.uploads,0);
    assert.equal(str(b.f.files.get('a/b/file.md')!),'edit');assert.equal(str(b.f.files.get('other.md')!),'ready');
});

test('an explicitly excluded outgoing copy blocks publication and primary rollback while preserving its pending payload',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const policy=fullPolicy();policy.fileExclusions=[{pattern:'*.conflict-*'}];
    const a=await peer(remote,policy);a.f.files.set('a.md',ab('base'));await a.run();a.f.files.set('a.md',ab('edit'));remote.add('other','other.md','ready');
    const result=await a.run();assert.equal(result.problems[0].code,'artifact-excluded');assert.equal(remote.uploads,0);
    assert.equal(str(a.f.files.get('a.md')!),'edit');assert.equal(str(a.f.files.get('other.md')!),'ready');assert((await a.state()).store.pending('a.md')?.copyBytes);
});

test('a surviving unsaved editor blocks remote trash of a missing local file without stopping independent transfers',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const policy=fullPolicy();policy.mirrorFolders={'':{state:'on',level:'light'}};
    const a=await peer(remote,policy);a.f.files.set('a.md',ab('base'));await a.run();a.f.files.delete('a.md');remote.add('other','other.md','ready');
    a.plugin.app={workspace:{getLeavesOfType:()=>[{view:{file:{path:'a.md'},editor:{getValue:()=> 'unsaved edit'}}}]},
        vault:{adapter:{exists:async()=>false,read:async()=>{throw Error('ENOENT');}}}};
    a.f.vault.assertWritable=path=>a.plugin.assertEditorSaved(path);const result=await a.run();
    assert.equal(result.problems[0].code,'unsaved-editor');assert.equal(result.problems[0].scope,'file');assert(!remote.files.get('origin')!.file.trashed);
    assert.equal(str(a.f.files.get('other.md')!),'ready');assert.equal((await a.state()).store.pending('a.md')?.kind,'trash-remote');
});

test('actual host read-only probe skips pull files, peer artifact receipt and canonical download while preserving unknown identity',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const a=await peer(remote);a.f.files.set('a.md',ab('base'));await a.run();remote.files.delete('origin');await a.run();
    remote.add('other','other.md','ready');const {store}=await a.state(),entry=store.inbox('a.md')!;assert(entry);
    const result=await a.run(['a.md'],'retry',{namespace:store.namespace});assert.equal(result.failed,0);assert(!a.f.files.has('other.md'));assert.equal(str(a.f.files.get('a.md')!),'base');assert.equal((await a.state()).store.inbox('a.md')!.id,entry.id);
});
test('actual host action refuses inactive namespaces before transfer and restores only the approved known object',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const a=await peer(remote);a.f.files.set('a.md',ab('base'));a.plugin.effectiveProfilePolicy=()=>compileProfiles({...fullPolicy(),mirrorFolders:{'':{state:'on',level:'light'}}},structuredClone([...STANDARD_PROFILES]));await a.run();a.f.files.delete('a.md');await a.run();
    const {store}=await a.state();remote.add('other','other.md','ready');await assert.rejects(()=>a.run(['a.md'],'retry',{namespace:'inactive'}),/inactive account/);assert(!a.f.files.has('other.md'));assert(remote.files.get('origin')!.file.trashed);
    await a.run(['a.md'],'retry',{namespace:store.namespace});const entry=(await a.state()).store.inbox('a.md')!,result=await a.run(['a.md'],'retry',{namespace:store.namespace,resolution:{namespace:store.namespace,entry,action:'restore-known'}});
    assert.equal(result.failed,0);assert.equal(str(a.f.files.get('a.md')!),'base');assert(!a.f.files.has('other.md'));assert.equal(remote.uploads,0);assert.equal(remote.files.get('origin')!.file.trashed,false);
});
test('actual restore action does not fetch peer artifacts or independent canonical files',async()=>{
    const remote=new Remote();remote.add('origin','a.md','base');const a=await peer(remote);a.f.files.set('a.md',ab('base'));a.plugin.effectiveProfilePolicy=()=>compileProfiles({...fullPolicy(),mirrorFolders:{'':{state:'on',level:'light'}}},structuredClone([...STANDARD_PROFILES]));await a.run();a.f.files.delete('a.md');await a.run();
    remote.add('other','other.md','ready');const copy=remote.artifact('origin','a.md'),{store}=await a.state();await a.run(['a.md'],'retry',{namespace:store.namespace});const entry=(await a.state()).store.inbox('a.md')!;
    const result=await a.run(['a.md'],'retry',{namespace:store.namespace,resolution:{namespace:store.namespace,entry,action:'restore-known'}});assert.equal(result.failed,0);assert.equal(str(a.f.files.get('a.md')!),'base');assert(!a.f.files.has(copy));assert(!a.f.files.has('other.md'));assert.equal((await a.state()).store.artifacts().length,0);
});
