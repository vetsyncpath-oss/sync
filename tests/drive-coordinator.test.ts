import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveCoordinator } from '../src/core/drive-coordinator';
import { DriveStateStore,driveNamespace } from '../src/core/drive-state';
import { GoogleDriveRoot } from '../src/sources/gdrive-root';
import { GoogleDriveClient,DRIVE_FOLDER,type DriveFile,type DriveItem } from '../src/sources/gdrive-client';
import { OperationStore } from '../src/core/operation-store';
import { RecoveryStore } from '../src/core/recovery-store';
import { DurableMutations } from '../src/core/durable-mutations';
import { FailedQueue } from '../src/core/queue';
import { effectiveBehavior } from '../src/core/profile-policy';
import { sha256Hex } from '../src/core/hasher';
import { sourceCandidates,sourcePathForDestination } from '../src/core/source-bindings';
import { planDrive } from '../src/core/drive-planner';
import type { FileSystem,VaultAdapter } from '../src/sources/types';
import { SyncFault } from '../src/core/sync-issue';
const bytes=(s:string)=>new TextEncoder().encode(s).buffer;
class Fixture {
    local=new Map<string,ArrayBuffer>();folders=new Set<string>(['']);metadata=new Map<string,string>();remote=new Map<string,{file:DriveFile;data:ArrayBuffer}>();counter=0;
    readonly queue=new FailedQueue(); readonly state:DriveStateStore;readonly mutations:DurableMutations;failCheckpoint=false;afterUpload?:()=>void;unknownUpload=false;
    fs:FileSystem={read:async p=>this.metadata.get(p)??null,write:async(p,s)=>{if(this.failCheckpoint&&p.startsWith('drive-state-'))throw Error('disk full');this.metadata.set(p,s);},
        rename:async(a,b)=>{if(this.metadata.has(b))throw Error('EEXIST');this.metadata.set(b,this.metadata.get(a)!);this.metadata.delete(a);},exists:async p=>this.metadata.has(p),remove:async p=>{this.metadata.delete(p);},list:async()=>[...this.metadata.keys()]};
    vault:VaultAdapter={exists:async p=>this.local.has(p)||this.folders.has(p),readBinary:async p=>{if(!this.local.has(p))throw Error('ENOENT');return this.local.get(p)!.slice(0);},
        writeBinary:async(p,b)=>{this.local.set(p,b.slice(0));},createBinary:async(p,b)=>{if(this.local.has(p))throw Error('EEXIST');this.local.set(p,b.slice(0));},
        compareAndWrite:async(p,b,expected)=>{if(new TextDecoder().decode(this.local.get(p))!==new TextDecoder().decode(expected))return false;this.local.set(p,b.slice(0));return true;},
        mkdir:async p=>{this.folders.add(p);},remove:async p=>{this.local.delete(p);},trash:async p=>{this.local.set('.trash/'+p,this.local.get(p)!);this.local.delete(p);},rename:async(a,b)=>{if(this.local.has(b))throw Error('EEXIST');this.local.set(b,this.local.get(a)!);this.local.delete(a);},
        stat:async p=>this.local.has(p)?{mtime:0,size:this.local.get(p)!.byteLength,type:'file'}:this.folders.has(p)?{mtime:0,size:0,type:'folder'}:null,
        list:async p=>({files:[...this.local.keys()].filter(n=>n.startsWith(p?p+'/':'')&&!n.slice(p?p.length+1:0).includes('/')),folders:[...this.folders].filter(n=>n!==p&&n.startsWith(p?p+'/':'')&&!n.slice(p?p.length+1:0).includes('/'))})};
    client:GoogleDriveClient={maxFileBytes:1024*1024,inspect:async(id:string)=>{const f=this.remote.get(id);if(!f)throw Object.assign(Error('HTTP 404'),{status:404});return structuredClone(f.file);},
        listChildren:async(id:string)=>[...this.remote.values()].filter(v=>v.file.parents.includes(id)&&!v.file.trashed).map(v=>structuredClone(v.file)),
        reserveId:async()=>`new-${++this.counter}`,mkdir:async(id:string,name:string,parent:string)=>{const file={id,name,mimeType:DRIVE_FOLDER,parents:[parent],version:'1'};this.remote.set(id,{file,data:bytes('')});return structuredClone(file);},
        metadata:async(id:string,patch:object)=>{const item=this.remote.get(id)!;Object.assign(item.file,patch);item.file.version=String(Number(item.file.version)+1);return structuredClone(item.file);},
        download:async(file:DriveFile)=>{const item=this.remote.get(file.id)!;assert.equal(item.file.version,file.version);return item.data.slice(0);},
        verify:async(file:DriveFile,data:ArrayBuffer)=>{assert.equal(await sha256Hex(data),file.sha256Checksum);},
        upload:async(id:string,meta:any,data:ArrayBuffer,create:boolean,_signal:AbortSignal,persist:any)=>{
            assert(create,'existing bytes must never be overwritten');await persist({url:'https://www.googleapis.com/upload/drive/v3/files?upload_id=secret',fileId:id,offset:0,size:data.byteLength});
            const file={...meta,id,version:'1',size:String(data.byteLength),sha256Checksum:await sha256Hex(data)};this.remote.set(id,{file,data:data.slice(0)});
            this.afterUpload?.();if(this.unknownUpload){this.unknownUpload=false;throw Object.assign(Error('connection lost after create'),{code:'network'});}return structuredClone(file);
        }} as unknown as GoogleDriveClient;
    constructor(){this.remote.set('root',{file:{id:'root',name:'root',mimeType:DRIVE_FOLDER,parents:[],version:'1'},data:bytes('')});
        this.state=new DriveStateStore(this.fs,'test');this.mutations=new DurableMutations(new OperationStore(this.fs),new RecoveryStore(this.vault,'private/recovery'),this.vault);}
    async addRemote(name:string,content:string,id='r-'+name):Promise<string>{this.remote.set(id,{file:{id,name,mimeType:'text/plain',parents:['root'],version:'1',size:String(bytes(content).byteLength),sha256Checksum:await sha256Hex(bytes(content))},data:bytes(content)});return id;}
    inventory():DriveItem[]{return [...this.remote.values()].filter(v=>v.file.id!=='root'&&!v.file.trashed).map(v=>({path:v.file.name,file:structuredClone(v.file)}));}
    async run(auto=false){return new DriveCoordinator({vault:this.vault,mutations:this.mutations,state:this.state,root:new GoogleDriveRoot(this.client,'root'),queue:this.queue,
        localPaths:async()=>[...this.local.keys()].filter(p=>!p.startsWith('private/')&&!p.startsWith('.trash/')&&!p.includes('.conflict-')),
        localForRemote:p=>p.includes('.conflict-')?[]:[p],remoteForLocal:p=>p.includes('.conflict-')||p.startsWith('private/')||p.startsWith('.trash/')?undefined:p,
        behavior:()=>effectiveBehavior({direction:'bidirectional',write:'changes',delete:this.deletions,conflict:'keep-both'}),guard:()=>{},signal:new AbortController().signal,auto}).run(this.inventory());}
    deletions:'keep'|'tracked'='tracked';
    text(path:string){return this.local.has(path)?new TextDecoder().decode(this.local.get(path)):undefined;}
}
test('bootstrap forms a union, adopts identical bytes, and keeps both versions of an initial conflict',async()=>{
    const f=new Fixture();f.local.set('same.md',bytes('same'));await f.addRemote('same.md','same');
    f.local.set('local.md',bytes('local'));await f.addRemote('remote.md','remote');f.local.set('conflict.md',bytes('mine'));await f.addRemote('conflict.md','theirs');
    const stats=await f.run(true);assert.equal(stats.failed,0);assert.equal(stats.conflicts,1);assert.equal(f.text('remote.md'),'remote');assert.equal(f.text('conflict.md'),'theirs');
    const copy=[...f.local.keys()].find(p=>p.includes('.conflict-drive-local-'))!;assert.equal(f.text(copy),'mine');assert(f.inventory().some(i=>i.path===copy));
    assert(f.inventory().some(i=>i.path==='local.md'));assert.equal(Object.keys(f.state.snapshot().baseline).length,4);
});
test('verified tracked deletions use trash in both directions; 404 never authorizes local deletion',async()=>{
    const f=new Fixture();for(const n of ['local-delete.md','remote-delete.md','lost.md']){f.local.set(n,bytes('base'));await f.addRemote(n,'base');}await f.run();
    f.local.delete('local-delete.md');f.remote.get('r-remote-delete.md')!.file.trashed=true;f.remote.delete('r-lost.md');
    const stats=await f.run(true);assert.equal(stats.failed,0);assert.equal(f.remote.get('r-local-delete.md')!.file.trashed,true);assert.equal(f.text('remote-delete.md'),undefined);
    assert.equal(stats.deleted,2);assert.equal(stats.deletedDrive,1);
    assert.equal(f.text('.trash/remote-delete.md'),'base');assert.equal(f.text('lost.md'),'base');assert.equal(stats.deferredDeletions,1);
});
test('delete versus edit preserves the edited survivor on both sides before trashing the original',async()=>{
    const f=new Fixture();f.local.set('a.md',bytes('base'));await f.addRemote('a.md','base');await f.run();
    f.local.set('a.md',bytes('edited'));f.remote.get('r-a.md')!.file.trashed=true;
    const stats=await f.run(true);assert.equal(stats.failed,0);assert.equal(f.text('a.md'),undefined);
    const copy=[...f.local.keys()].find(p=>p.includes('.conflict-drive-local-'))!;assert.equal(f.text(copy),'edited');assert(f.inventory().some(i=>i.path===copy));
});
test('a lost create response resumes by its reserved ID and never generates a second conflict copy',async()=>{
    const f=new Fixture();f.local.set('a.md',bytes('mine'));await f.addRemote('a.md','theirs');f.unknownUpload=true;
    assert.equal((await f.run()).failed,1);assert.equal(Object.keys(f.state.snapshot().pending).length,1);
    const result=await f.run();assert.equal(result.failed,0);assert.equal(f.text('a.md'),'theirs');assert.equal(f.inventory().filter(i=>i.path.includes('.conflict-')).length,1);
});
test('editing during upload preserves the newer local bytes and requests a follow-up',async()=>{
    const f=new Fixture();f.local.set('a.md',bytes('snapshot'));f.afterUpload=()=>{f.local.set('a.md',bytes('new edit'));};
    const result=await f.run(true);assert.equal(result.failed,0);assert.equal(result.followUp,true);assert.equal(f.text('a.md'),'new edit');
    assert.equal(f.state.snapshot().baseline['a.md'].localHash,await sha256Hex(bytes('snapshot')));
});
test('checkpoint failure stops the session before any remote publication or later file mutation',async()=>{
    const f=new Fixture();f.local.set('a.md',bytes('a'));f.local.set('b.md',bytes('b'));f.failCheckpoint=true;
    const result=await f.run();assert.equal(result.failed,1);assert.equal(result.problems![0].scope,'session');assert.equal(f.inventory().length,0);assert.equal(f.text('b.md'),'b');
});
test('a transient file transfer failure queues retry and does not stop independent downloads',async()=>{
    const f=new Fixture();await f.addRemote('a.md','a');await f.addRemote('b.md','b');const download=f.client.download;
    f.client.download=async(file,signal)=>{if(file.name==='a.md')throw new SyncFault('network','Connection interrupted','source',true);return download.call(f.client,file,signal);};
    const partial=await f.run(true);assert.equal(partial.failed,1);assert.equal(f.text('b.md'),'b');assert.equal(f.text('a.md'),undefined);
    assert.equal(f.queue.all().length,1);assert(!f.queue.all()[0].poisoned);
    f.client.download=download;const retry=await f.run();assert.equal(retry.failed,0);assert.equal(f.text('a.md'),'a');assert.equal(f.queue.all().length,0);
});
test('state corruption cannot reset a deletion baseline; checkpoints remain bounded',async()=>{
    const f=new Fixture();await f.state.load();for(let i=0;i<6;i++)await f.state.save(()=>{});
    const names=[...f.metadata.keys()].filter(p=>p.startsWith('drive-state-'));assert.equal(names.length,2);
    f.metadata.set(names.sort().at(-1)!,'{}');await assert.rejects(()=>new DriveStateStore(f.fs,'test').load(),/checksum/);
});
test('mount inversion retains exact names, source identity, and protects consumed siblings',()=>{
    const rules=[{scope:'folder' as const,path:'Notes',source:'drive',remotePath:'Library',names:['a.md']}];
    assert.deepEqual(sourceCandidates('Library/a.md','drive',rules,'other',p=>p),['Notes/a.md']);
    assert.equal(sourcePathForDestination('Notes/a.md','drive',rules,'other'),'Library/a.md');
    assert.equal(sourcePathForDestination('Notes/b.md','drive',rules,'other'),undefined);
    assert.equal(sourcePathForDestination('Notes/a.md','other',rules,'other'),undefined);
});
test('three-way truth table refuses inferred tombstones and recognizes only actual divergent edits',()=>{
    const behavior=effectiveBehavior({direction:'bidirectional',write:'changes',delete:'tracked'}),base={localHash:'B',remoteHash:'B',remoteId:'id',remoteVersion:'1',remotePath:'a'};
    assert.equal(planDrive('B',{kind:'absent'},base,behavior),'pending');assert.equal(planDrive('B',{kind:'unavailable'},base,behavior),'pending');
    assert.equal(planDrive('L',{kind:'file',hash:'B',id:'id',version:'1'},base,behavior),'upload');
    assert.equal(planDrive('B',{kind:'file',hash:'R',id:'id',version:'2'},base,behavior),'download');
    assert.equal(planDrive('L',{kind:'file',hash:'R',id:'id',version:'2'},base,behavior),'conflict');
});
test('preserve-ID policy publishes one reviewed copy without replacing the existing Drive object',async()=>{
    const f=new Fixture();f.local.set('a.md',bytes('base'));const id=await f.addRemote('a.md','base');await f.run();
    f.local.set('a.md',bytes('edited'));const result=await f.run(true);assert.equal(result.failed,0);assert.equal(result.deferredConflicts,1);
    assert.equal(f.remote.get(id)!.file.name,'a.md');assert(!f.remote.get(id)!.file.trashed);assert.equal(f.text('a.md'),'base');
    const review=f.state.snapshot().reviews!['a.md'];assert.equal(f.text(review.copyPath),'edited');assert.equal(f.inventory().filter(i=>i.path.includes('.conflict-')).length,1);
    const second=await f.run(true);assert.equal(second.deferredConflicts,1);assert.equal(f.inventory().filter(i=>i.path.includes('.conflict-')).length,1);
    const remote=f.remote.get(id)!;remote.data=bytes('edited');remote.file.sha256Checksum=await sha256Hex(remote.data);remote.file.size=String(remote.data.byteLength);remote.file.version='2';
    await f.run();const final=await f.run();assert.equal(final.deferredConflicts??0,0);assert.equal(f.text('a.md'),'edited');assert(!f.state.snapshot().reviews?.['a.md']);
});
test('a newer local edit after a partial conflict publication is replanned and retained, rather than replaying a stale write',async()=>{
    const f=new Fixture();f.local.set('a.md',bytes('first'));await f.addRemote('a.md','remote');f.afterUpload=()=>{f.local.set('a.md',bytes('second'));};
    const first=await f.run();assert.equal(first.failed,1);assert.equal(f.text('a.md'),'second');f.afterUpload=undefined;
    const retry=await f.run();assert.equal(retry.failed,0);assert.equal(f.text('a.md'),'remote');
    const copies=[...f.local.keys()].filter(p=>p.includes('.conflict-'));assert(copies.some(p=>f.text(p)==='first'));assert(copies.some(p=>f.text(p)==='second'));
});
test('unavailable atomic local replacement retains binary originals and an explicit recovery intent',async()=>{
    const f=new Fixture();f.vault.compareAndWrite=async()=>undefined;f.local.set('a.bin',bytes('mine'));await f.addRemote('a.bin','theirs');
    const result=await f.run();assert.equal(result.failed,1);assert.equal(result.problems![0].code,'local-guard-unavailable');assert.equal(f.text('a.bin'),'mine');
    assert.equal(f.inventory().filter(i=>i.path.includes('.conflict-')).length,1);assert(f.state.snapshot().pending['a.bin']);
});
test('failed checkpoint cleanup cannot accumulate unbounded generations and resumes after permission repair',async()=>{
    const f=new Fixture();await f.state.load();const remove=f.fs.remove;f.fs.remove=async()=>{throw Error('permission denied');};
    for(let i=0;i<4;i++)await f.state.save(()=>{});await assert.rejects(()=>f.state.save(()=>{}),/cleanup/);
    assert.equal([...f.metadata.keys()].filter(p=>p.startsWith('drive-state-')&&!p.endsWith('.tmp')).length,4);
    f.fs.remove=remove;await f.state.save(()=>{});assert.equal([...f.metadata.keys()].filter(p=>p.startsWith('drive-state-')).length,2);
});
test('repairing a conditional write capability resumes one conflict copy without reusing a finalized operation ID',async()=>{
    const f=new Fixture(),write=f.vault.compareAndWrite;f.vault.compareAndWrite=async()=>undefined;f.local.set('a.md',bytes('mine'));await f.addRemote('a.md','theirs');
    assert.equal((await f.run()).failed,1);f.vault.compareAndWrite=write;
    const repaired=await f.run();assert.equal(repaired.failed,0);assert.equal(f.text('a.md'),'theirs');assert.equal(f.inventory().filter(i=>i.path.includes('.conflict-')).length,1);
});
test('keeping deletions restores a trashed tracked object without changing its file ID',async()=>{
    const f=new Fixture();f.deletions='keep';f.local.set('a.md',bytes('base'));const id=await f.addRemote('a.md','base');await f.run();f.remote.get(id)!.file.trashed=true;
    const result=await f.run(true);assert.equal(result.failed,0);assert(!f.remote.get(id)!.file.trashed);assert.equal(f.state.snapshot().baseline['a.md'].remoteId,id);assert.equal(f.inventory().length,1);
});
test('Drive baseline identity ignores unrelated provider changes and behavior, while isolating account/root/mount changes',async()=>{
    const policy={version:1 as const,mirror:false,folders:[],defaultSource:'drive',fileRules:[{scope:'folder' as const,path:'Git',source:'git'},{scope:'folder' as const,path:'Notes',source:'drive',remotePath:'Library'}]};
    const id=await driveNamespace('SUB','ROOT','drive',policy),changed=structuredClone(policy);
    changed.fileRules[0].source='different-git';assert.equal(await driveNamespace('SUB','ROOT','drive',changed),id);
    assert.notEqual(await driveNamespace('OTHER','ROOT','drive',policy),id);assert.notEqual(await driveNamespace('SUB','OTHER','drive',policy),id);
    changed.fileRules[1].remotePath='Elsewhere';assert.notEqual(await driveNamespace('SUB','ROOT','drive',changed),id);
});
