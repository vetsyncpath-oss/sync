// @ts-ignore Virtual module supplied by audit-drive-jobs.mjs.
import {Fixture,bytes} from '@audit/fixture';
import {GoogleDriveClient,DRIVE_FOLDER} from '../src/sources/gdrive-client';
import {GDriveOAuthSource} from '../src/sources/gdrive-oauth-source';
import {planDrive} from '../src/core/drive-planner';
import {effectiveBehavior} from '../src/core/profile-policy';
import {applyPolicy} from '../src/core/policy';
import {compileProfiles,STANDARD_PROFILES} from '../src/core/profiles';
import {pathPolicy} from '../tests/helpers';
import {OperationStore} from '../src/core/operation-store';
import {DurableMutations} from '../src/core/durable-mutations';
import {versionOf,MISSING} from '../src/core/local-version';
import {ManifestCache} from '../src/core/manifest-cache';
import {driveNamespace} from '../src/core/drive-state';
import {Scheduler} from '../src/core/scheduler';
const output:Record<string,unknown>[]=[];
const record=(probe:string,result:unknown)=>output.push({probe,result});
const response=(value:unknown)=>({status:200,headers:{},text:async()=>JSON.stringify(value),arrayBuffer:async()=>new ArrayBuffer(0)});
const item=(id:string,name:string,mimeType='text/markdown')=>({id,name,mimeType,parents:['root'],version:'1',size:'1'});
async function listing(files:any[],repeat=false){let pages=0;
    const client=new GoogleDriveClient({fetch:async url=>new URL(url).pathname.endsWith('/root')?
        response({id:'root',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):
        response({files,...(repeat&&pages++===0?{nextPageToken:'next'}:{})})});
    try{const inventory=await client.inventory('root',new AbortController().signal),source=new GDriveOAuthSource(client,'root');source.inventorySnapshot=inventory;
        let execution:unknown;try{execution={ok:true,count:(await source.getManifest(new AbortController().signal)).length};}catch(error:any){execution={ok:false,code:error.code,message:error.message};}
        return {ok:true,count:inventory.items.length,excluded:inventory.excluded,completeness:inventory.completeness,diagnostics:inventory.diagnostics.map(d=>d.code),execution};}
    catch(error:any){return {ok:false,code:error.code,message:error.message};}
}
async function pluginTree(repeat=false){let pages=0;
    const children:Record<string,any[]>={
        root:[{...item('config','.obsidian',DRIVE_FOLDER),parents:['root']}],
        config:[{...item('plugins','plugins',DRIVE_FOLDER),parents:['config']}],
        plugins:[{...item('plugin','example',DRIVE_FOLDER),parents:['plugins']}],
        plugin:[{...item('main','main.js','application/javascript'),parents:['plugin']}],
    };
    const client=new GoogleDriveClient({fetch:async url=>{
        const parsed=new URL(url);if(parsed.pathname.endsWith('/root'))return response({id:'root',name:'Root',mimeType:DRIVE_FOLDER,version:'1'});
        const parent=parsed.searchParams.get('q')!.match(/'([^']+)' in parents/)![1];
        return response({files:children[parent]??[],...(repeat&&parent==='plugin'&&pages++===0?{nextPageToken:'next'}:{})});
    }});
    try{const result=await client.inventory('root',new AbortController().signal);return {ok:true,files:result.items.filter(item=>item.file.mimeType!==DRIVE_FOLDER).map(item=>item.path),diagnostics:result.diagnostics.map(d=>d.code)};}
    catch(error:any){return {ok:false,code:error.code,message:error.message};}
}
async function main(){
record('single binary file',await listing([item('one','note.md')]));
record('single file inside a plugin folder',await pluginTree());
record('single plugin file repeated across API pages',await pluginTree(true));
record('one file ID repeated across listing pages',await listing([item('one','note.md')],true));
record('two distinct IDs with one name',await listing([item('one','note.md'),item('two','note.md')]));
record('binary plus excluded Google native object with one name',await listing([item('one','note.md'),item('doc','note.md','application/vnd.google-apps.document')]));
record('case alias',await listing([item('one','Note.md'),item('two','note.md')]));
record('NFC alias',await listing([item('one','e\u0301.md'),item('two','\u00e9.md')]));
const behavior=effectiveBehavior({direction:'bidirectional',write:'changes',delete:'tracked'}),base={localHash:'B',remoteHash:'B',remoteId:'one',remoteVersion:'1',remotePath:'note.md'};
record('missing local plus inaccessible/404 remote',planDrive(undefined,{kind:'unavailable'},base,behavior));
const compiled=compileProfiles({version:1,mirror:false,folders:[],defaultSource:'drive',assignments:[{scope:'vault',path:'',profileId:'standard:drive-bidirectional'}]},STANDARD_PROFILES);
const policy=pathPolicy().forSources(['drive'],'drive',compiled.fileRules!,[],['bidirectional']);
for(const path of ['note.md','note.conflict-drive-local-123.md'])record('actual host policy: '+path,
    applyPolicy([{path,hash:'h',hashAlg:'weak',size:1}],compiled,policy,[]).transformedManifest.map(entry=>entry.path));
for(const n of [1,20,100]){
    const f=new Fixture();for(let i=0;i<n;i++){f.local.set('n'+i+'.md',bytes('base'));await f.addRemote('n'+i+'.md','base');}
    await f.run();let writes=0,total=0;const write=f.fs.write;
    f.fs.write=async(path,data)=>{if(path.startsWith('drive-state-')){writes++;total+=new TextEncoder().encode(data).length;}await write(path,data);};
    const result=await f.run();record('warm no-op '+n,{writes,metadataBytes:total,downloaded:result.downloaded,uploaded:result.uploaded,failed:result.failed});
}
{
    const f=new Fixture();f.local.set('note.md',bytes('base'));await f.addRemote('note.md','base');await f.run();
    const results=[];for(const edit of ['first','second','first']){f.local.set('note.md',bytes(edit));const result=await f.run();results.push({edit,deferred:result.deferredConflicts,reviewCount:Object.keys(f.state.snapshot().reviews??{}).length,proposalCount:f.state.proposals('note.md').length,copyCount:f.inventory().filter(i=>i.path.includes('.conflict-')).length});}
    record('review counters and repeated identical proposal',results);
}
{
    const f=new Fixture(),other=new Map<string,string>(),fs={...f.fs,read:async(p:string)=>other.get(p)??null,write:async(p:string,s:string)=>{other.set(p,s);},exists:async(p:string)=>other.has(p),rename:async(a:string,b:string)=>{other.set(b,other.get(a)!);other.delete(a);},remove:async(p:string)=>{other.delete(p);},list:async()=>[...other.keys()]};
    await f.mutations.store.begin({id:'old-operation',planId:'old-plan',namespace:'old-job',path:'shared.md',kind:'write',before:MISSING,after:await versionOf(bytes('A')),status:'committing',createdAt:1});
    const next=new DurableMutations(new OperationStore(fs),f.mutations.recovery,f.vault);
    await next.write('new-job',{id:'new-operation',planId:'new-plan',path:'shared.md',before:MISSING,guard:()=>{}},bytes('B'));
    record('separate operation stores lose unresolved cross-job path protection',{oldStatus:f.mutations.store.records()[0].status,newLocal:f.text('shared.md')});
}
{
    const f=new Fixture(),old=new ManifestCache(f.fs,'old-namespace');old.set('note.md',{h:'h',alg:'weak',s:1});await old.flush();
    await f.fs.rename('manifest-old-namespace.json','manifest-new-job.json');
    try{const loaded=await new ManifestCache(f.fs,'new-job').load();record('rename-only manifest migration',{originalEntries:Object.keys(old.entries()).length,migratedEntries:Object.keys(loaded).length});}
    catch(error:any){record('rename-only manifest migration',error.message);}
}
{
    const a={version:1 as const,mirror:false,defaultSource:'git',folders:[],fileRules:[{scope:'folder' as const,path:'Notes',source:'drive',remotePath:'Library'},{scope:'folder' as const,path:'Code',source:'git',remotePath:'repo'}]};
    const b={...a,folders:[{path:'Git',include:'inherit' as const,target:{kind:'move' as const,localPath:'Code'}}]};
    record('unrelated legacy folder mapping resets Drive identity',(await driveNamespace('sub','root','drive',a))!==(await driveNamespace('sub','root','drive',b)));
}
{
    const f=new Fixture();await f.addRemote('constructor','first');await f.addRemote('other.md','other');const result=await f.run();
    record('extensionless filename shadows a plain-object prototype key',{failed:result.failed,problem:result.problem,scope:result.problems?.[0]?.scope,otherDownloaded:f.local.has('other.md')});
}
{
    const f=new Fixture();let tick=()=>{},delay=0;
    const auto='inherit',globalInterval='1h',schedule=auto??globalInterval??'off';
    const scheduler=new Scheduler({queue:f.queue,onAutoRetry:()=>{},onAutoTick:()=>true,setTimeout:run=>{tick=run;return 1;},clearTimeout:()=>{},
        setInterval:(_run,ms)=>{delay=ms;return 2;},clearInterval:()=>{}});
    scheduler.start(schedule as any,0);tick();for(let i=0;i<8;i++)await Promise.resolve();
    record('V6 migration leaves inherit unresolved',{schedule,periodicDelay:Number.isNaN(delay)?'NaN':delay});scheduler.stop();
}
{
    const f=new Fixture();f.local.set('note.md',bytes('base'));const id=await f.addRemote('note.md','base');await f.run();f.remote.delete(id);await f.run();const entry=f.state.inbox('note.md');
    let writes=0;const write=f.fs.write;f.fs.write=async(path,data)=>{if(path.startsWith('drive-state-'))writes++;await write(path,data);};await f.run();const warmWrites=writes;f.local.delete('note.md');await f.run();
    record('canonical 404 survives local deletion',{originId:f.state.inbox('note.md')?.originId,sameInboxId:entry?.id===f.state.inbox('note.md')?.id,reason:f.state.inbox('note.md')?.reason,baselineId:f.state.baseline('note.md')?.remoteId,warmWrites,creates:f.counter});
}
{
    const f=new Fixture();f.local.set('note.md',bytes('base'));const id=await f.addRemote('note.md','base');await f.run();f.remote.delete(id);await f.addRemote('note.md','base','replacement');await f.run();
    record('same bytes cannot silently rebind another ID',{baselineId:f.state.baseline('note.md')?.remoteId,reason:f.state.inbox('note.md')?.reason,candidateId:f.state.inbox('note.md')?.candidateId,creates:f.counter});
}
{
    const f=new Fixture();f.local.set('note.md',bytes('base'));const id=await f.addRemote('note.md','base');await f.run();f.remote.get(id).file.name='renamed.md';await f.run();
    record('tracked rename is not duplicate bootstrap',{reason:f.state.inbox('note.md')?.reason,originalLocal:f.text('note.md'),newLocalCreated:f.local.has('renamed.md'),creates:f.counter});
}
{
    const f=new Fixture();f.local.set('note.md',bytes('base'));const id=await f.addRemote('note.md','base');await f.run();f.local.delete('note.md');await f.run();
    await f.state.save(state=>{state.tombstones['note.md'].deletedAt=Date.now()-100*24*60*60*1000;});f.local.set('note.md',bytes('recreated'));await f.run();
    record('tombstone survives retention and local recreation',{originalId:f.state.tombstone('note.md')?.baseline.remoteId,stillTrashed:f.remote.get(id).file.trashed,local:f.text('note.md'),reason:f.state.inbox('note.md')?.reason,creates:f.counter});
}
{
    const f=new Fixture();f.local.set('note.md',bytes('base'));const id=await f.addRemote('note.md','base');await f.run();f.local.delete('note.md');await f.run();await f.run(false,{probeOnly:true});
    const result=await f.run(false,{resolution:{namespace:'test',entry:f.state.inbox('note.md'),action:'restore-known'}});
    record('explicit same-ID restore',{failed:result.failed,originalId:id,baselineId:f.state.baseline('note.md')?.remoteId,local:f.text('note.md'),stillTrashed:f.remote.get(id).file.trashed,creates:f.counter});
}
console.log(JSON.stringify(output,null,2));
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
