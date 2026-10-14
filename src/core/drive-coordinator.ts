import type { ConflictChoice, SyncStats, SyncFileResult, TransferObserver, VaultAdapter } from '../sources/types';
import type { DriveFile, DriveItem } from '../sources/gdrive-client';
import { GoogleDriveRoot } from '../sources/gdrive-root';
import { DriveStateStore, type DriveIntent } from './drive-state';
import { planDrive, type DriveBaseline, type DriveObservation } from './drive-planner';
import type { EffectiveBehavior } from './profile-policy';
import { assertLocal, MISSING, observeLocal, sameVersion, versionOf, type LocalVersion } from './local-version';
import { sha256Hex } from './hasher';
import { DurableMutations } from './durable-mutations';
import { DirLock } from './dirlock';
import { SyncFault, syncIssue } from './sync-issue';
import type { FailedQueue } from './queue';
export interface DriveExecutionPorts {
    vault:VaultAdapter; mutations:DurableMutations; state:DriveStateStore; root:GoogleDriveRoot; queue:FailedQueue;
    localPaths():Promise<string[]>;
    localForRemote(path:string):string[];
    remoteForLocal(path:string):string|undefined;
    behavior(path:string):EffectiveBehavior;
    guard():void; signal:AbortSignal; auto:boolean; observe?:TransferObserver;
    restoreOnly?:boolean;
    allowQuestions?:boolean;
    ask?(path:string,localSize:number,remoteSize:number):Promise<ConflictChoice>;
}
const sibling=(path:string,id:string,label='local')=>{const slash=path.lastIndexOf('/'),base=path.slice(slash+1),dot=base.lastIndexOf('.');
    const extension=dot>0?base.slice(dot):'',suffix=`.conflict-drive-${label}-${id}${extension}`;let stem='';
    for(const c of dot>0?base.slice(0,dot):base){if(new TextEncoder().encode(stem+c+suffix).length>240)break;stem+=c;}
    return path.slice(0,slash+1)+(stem||'_')+suffix;};
/** Bidirectional executor has a separate three-way baseline; pull caches never authorize uploads. */
export class DriveCoordinator {
    private readonly dirs=new DirLock();
    private inventory:DriveItem[]=[];
    private readonly attention=new Set<string>();
    private readonly stats:SyncStats={totalFiles:0,downloaded:0,uploaded:0,deleted:0,skipped:0,failed:0,bytesTransferred:0,duration:0,conflicts:0,problems:[],outcome:'ok'};
    constructor(private readonly p:DriveExecutionPorts){}
    async run(inventory:DriveItem[]):Promise<SyncStats>{
        const started=Date.now();this.inventory=inventory;
        await this.p.state.load();await this.p.mutations.store.load();await this.p.mutations.recover(this.p.state.namespace,this.p.signal);
        const localPaths=await this.p.localPaths(),all=new Set([...localPaths,...this.p.state.paths()]);
        const remotes=new Map<string,{path:string;file:DriveFile}>();
        for(const item of inventory)for(const path of this.p.localForRemote(item.path)){
            if(remotes.has(path))throw new SyncFault('path-collision','Multiple remote files target one local path','source');
            remotes.set(path,item);all.add(path);
        }
        const canonical=new Set<string>();for(const path of all){const key=path.normalize('NFC').toLowerCase();if(canonical.has(key))throw new SyncFault('path-collision','Portable local/remote path collision','source');canonical.add(key);}
        this.stats.totalFiles=all.size;this.stats.pendingBefore=this.p.queue.size();
        const asks:string[]=[];
        for(const path of all){
            try {
                this.guard();const remotePath=this.p.remoteForLocal(path),behavior=this.p.behavior(path);
                if(!remotePath||behavior.direction!=='bidirectional'||behavior.protected){this.stats.skipped++;continue;}
                const queued=this.p.queue.all().find(q=>q.path===path);
                if(this.p.auto&&queued&&(queued.poisoned||queued.nextRetryAt>Date.now())){this.stats.skipped++;continue;}
                const stat=await this.p.vault.stat(path);if(stat&&stat.size>this.p.root.client.maxFileBytes)throw new SyncFault('file-too-large','Local file exceeds transfer limit');
                const pending=this.p.state.pending(path);
                if(pending&&!this.p.restoreOnly){
                    const current=await observeLocal(this.p.vault,path),candidate=remotes.get(path)?.file;
                    const newLocal=!sameVersion(current,pending.local)&&!(current.kind==='file'&&current.sha256===candidate?.sha256Checksum?.toLowerCase());
                    const newDeletionTarget=(pending.kind==='trash-remote'||pending.kind==='delete-edit-remote')&&candidate&&candidate.version!==pending.remoteVersion;
                    if((newLocal||newDeletionTarget)&&!(pending.kind==='upload'&&!pending.remoteId))await this.checkpoint(s=>{delete s.pending[path];});
                    else{await this.execute(pending);this.p.queue.delete(path);continue;}
                }
                const local=await observeLocal(this.p.vault,path),base=this.p.state.baseline(path);
                const candidate=remotes.get(path);let remote=candidate?.file,remoteBytes:ArrayBuffer|undefined;
                let observation:DriveObservation;
                if(remote){
                    if(remote.trashed)observation={kind:'trashed'};
                    else {let hash=remote.sha256Checksum?.toLowerCase();
                        if(!hash&&base?.remoteId===remote.id&&base.remoteVersion===remote.version)hash=base.remoteHash;
                        if(!hash){remoteBytes=await this.p.root.client.download(remote,this.p.signal);hash=await sha256Hex(remoteBytes);}
                        observation={kind:'file',hash,id:remote.id,version:remote.version};}
                }else if(base){
                    try{remote=await this.p.root.owned(base.remoteId,this.p.signal,true);observation=remote.trashed?{kind:'trashed'}:{kind:'unavailable'};}
                    catch(error){this.guard();if((error as {status?:number}).status===404||(error as {code?:string}).code==='root-boundary')observation={kind:'unavailable'};else throw error;}
                }else observation={kind:'absent'};
                let decision=planDrive(local.kind==='file'?local.sha256:undefined,observation,base,behavior);
                const review=this.p.state.review(path);
                if(review){if(observation.kind==='file'&&observation.hash===review.hash&&local.kind==='file'&&local.sha256===review.hash)await this.checkpoint(s=>{delete s.reviews![path];});
                    else this.deferConflict({path,status:'pending',reason:'Existing Drive object retained; review its published conflict copy',conflictPath:review.copyPath});}
                if(this.p.restoreOnly){if(local.kind==='missing'&&observation.kind==='file')decision='download';else{this.stats.skipped++;continue;}}
                if(decision==='pending'){this.stats.deferredDeletions=(this.stats.deferredDeletions??0)+1;this.stats.skipped++;continue;}
                if(decision==='protected'){this.stats.skipped++;continue;}
                if(decision==='gone'){await this.clear(path);this.p.queue.delete(path);continue;}
                if(decision==='adopt'){await this.baseline(path,remotePath,local,remote!);this.p.queue.delete(path);continue;}
                if(decision==='download'){
                    const bytes=remoteBytes??await this.p.root.client.download(remote!,this.p.signal);
                    await this.write(path,local,bytes,crypto.randomUUID());await this.baseline(path,remotePath,await versionOf(bytes),remote!);this.stats.downloaded++;this.stats.bytesTransferred+=bytes.byteLength;this.p.queue.delete(path);continue;
                }
                if(decision==='conflict'){
                    this.stats.conflicts++;
                    if(behavior.conflict.action==='ask'){asks.push(path);this.deferConflict({path,status:'pending',reason:'decision-required'});continue;}
                    if(behavior.conflict.action==='keep-local')throw new SyncFault('unsupported-choice','Applying local content over an existing Drive ID is not supported; original retained');
                }
                if(decision==='delete-edit-local'||decision==='delete-edit-remote')this.stats.conflicts++;
                const reviewRequired=decision==='upload'&&!!remote&&!remote.trashed;
                if(reviewRequired){decision='conflict';this.stats.conflicts++;}
                const intent:DriveIntent={id:crypto.randomUUID(),kind:decision as DriveIntent['kind'],path,remotePath,local,reviewRequired,
                    remoteId:remote?.id,remoteVersion:remote?.version,remoteHash:observation.kind==='file'?observation.hash:undefined};
                if(local.kind==='file'){intent.bytes=await this.p.mutations.recovery.save(await this.p.vault.readBinary(path));
                    if(intent.bytes.sha256!==local.sha256)throw new SyncFault('local-changed','Local file changed while preparing upload','file',true);}
                const keepRemoteCopy=decision==='upload'&&remote&&behavior.conflict.action==='keep-local'&&behavior.conflict.keepOther;
                if(decision==='conflict'||decision==='delete-edit-local'||decision==='delete-edit-remote'||keepRemoteCopy){
                    intent.copyPath=sibling(path,intent.id,decision==='delete-edit-remote'||keepRemoteCopy?'remote':'local');
                    intent.copyRemotePath=sibling(remotePath,intent.id,decision==='delete-edit-remote'||keepRemoteCopy?'remote':'local');
                    if(decision==='delete-edit-remote'||keepRemoteCopy){
                        const bytes=remoteBytes??await this.p.root.client.download(remote!,this.p.signal);intent.copyBytes=await this.p.mutations.recovery.save(bytes);
                    }else intent.copyBytes=intent.bytes;
                    intent.copyLocal=MISSING;
                }
                await this.persist(intent);await this.execute(intent);this.p.queue.delete(path);
            }catch(error){if(this.p.signal.aborted){this.stats.outcome='cancelled';break;}
                const issue=syncIssue(error,'apply');if(issue.code==='io')issue.scope='session';this.stats.problems!.push(issue);this.stats.failed++;this.stats.problem=issue.message;this.stats.outcome='error';
                const pending=this.p.state.pending(path),base=this.p.state.baseline(path);
                this.p.queue.add({path,hash:pending?.bytes?.sha256??base?.remoteHash??'drive',size:pending?.bytes?.size??0},issue.message,Date.now(),issue.retryable?'transient':'blocked',Math.max(0,(issue.retryAt??0)-Date.now()),issue);
                if(issue.scope==='session'||issue.code==='auth-required'||issue.code==='root-unavailable')break;
            }
        }
        // Background never waits on a dialog; manual questions occur only after all independent files.
        if(!this.p.auto&&this.p.ask&&this.p.allowQuestions!==false)for(const path of asks){try{
            this.guard();const candidate=remotes.get(path)!,questionFile=await this.p.root.owned(candidate.file.id,this.p.signal,false,candidate.path),local=await observeLocal(this.p.vault,path);
            const choice=await this.p.ask(path,local.kind==='file'?local.size:0,Number(questionFile.size));this.guard();
            if(choice==='defer')continue;
            if(choice!=='keep-both'&&choice!=='remote-wins')throw new SyncFault('unsupported-choice','This conflict choice requires unsupported existing-ID content updates');
            const current=await observeLocal(this.p.vault,path),fresh=await this.p.root.owned(questionFile.id,this.p.signal,false,candidate.path);
            if(!sameVersion(current,local)||fresh.version!==questionFile.version){this.deferConflict({path,status:'pending',reason:'decision-stale'});continue;}
            // Consent applies only to the versions actually shown, with targeted fresh metadata.
            const child=new DriveCoordinator({...this.p,localPaths:async()=>[path],localForRemote:r=>r===candidate.path?[path]:[],
                remoteForLocal:p=>p===path?this.p.remoteForLocal(p):undefined,behavior:p=>({...this.p.behavior(p),conflict:{action:'keep-remote',keepOther:true}}),ask:undefined});
            const result=await child.run([{...candidate,file:fresh}]);this.stats.downloaded+=result.downloaded;this.stats.uploaded!+=result.uploaded??0;
            this.stats.failed+=result.failed;this.stats.deleted+=result.deleted;this.stats.deletedDrive=(this.stats.deletedDrive??0)+(result.deletedDrive??0);
            this.stats.bytesTransferred+=result.bytesTransferred;const settled=result.outcome==='ok'&&!result.failed&&!result.deferredConflicts;
            if(settled)this.attention.delete(path);this.stats.deferredConflicts=this.attention.size;
            if(settled)this.stats.results=this.stats.results?.filter(row=>row.path!==path||row.reason!=='decision-required');
            for(const row of result.results??[])if(row.status==='pending')this.deferConflict(row);else this.stats.results?.push(row);
            if(result.outcome==='error'){this.stats.outcome='error';this.stats.problems!.push(...result.problems??[]);}
            if(result.outcome==='cancelled'){this.stats.outcome='cancelled';break;}
        }catch(error){if(this.p.signal.aborted){this.stats.outcome='cancelled';break;}else{const issue=syncIssue(error,'confirm');this.stats.problems!.push(issue);this.stats.problem=issue.message;this.stats.failed++;this.stats.outcome='error';if(issue.scope==='session'||issue.code==='auth-required')break;}}}
        this.stats.pendingAfter=this.p.queue.size();this.stats.duration=Date.now()-started;return this.stats;
    }
    resolveQuestions(paths:readonly string[]):Promise<SyncStats>{
        return new DriveCoordinator({...this.p,allowQuestions:true,localPaths:async()=>paths.filter(path=>this.p.remoteForLocal(path)!==undefined),
            localForRemote:path=>this.p.localForRemote(path).filter(local=>paths.includes(local)),remoteForLocal:path=>paths.includes(path)?this.p.remoteForLocal(path):undefined}).run(this.inventory);
    }
    private guard():void{this.p.signal.throwIfAborted();this.p.guard();}
    private deferConflict(row:SyncFileResult):void{this.attention.add(row.path);this.stats.deferredConflicts=this.attention.size;
        this.stats.results=this.stats.results?.filter(old=>old.path!==row.path||old.status!=='pending');(this.stats.results??=[]).push(row);}
    private async checkpoint(update:Parameters<DriveStateStore['save']>[0]):Promise<void>{this.guard();try{await this.p.state.save(update);}catch{throw new SyncFault('checkpoint','Drive checkpoint could not be saved; session stopped','session');}this.guard();if(this.p.state.cleanupProblem)throw new SyncFault('checkpoint-cleanup',this.p.state.cleanupProblem,'session');}
    private persist(intent:DriveIntent):Promise<void>{return this.checkpoint(s=>s.pending[intent.path]=structuredClone(intent));}
    private clear(path:string):Promise<void>{if(!this.p.state.pending(path)&&!this.p.state.baseline(path)&&!this.p.state.review(path))return Promise.resolve();return this.checkpoint(s=>{delete s.pending[path];delete s.baseline[path];if(s.reviews)delete s.reviews[path];});}
    private async baseline(path:string,remotePath:string,local:LocalVersion,remote:DriveFile,review?:DriveIntent):Promise<void>{
        this.guard();if(local.kind!=='file'||remote.trashed)throw Error('Cannot adopt an absent version');
        const baseline:DriveBaseline={localHash:local.sha256,remoteHash:local.sha256,remoteId:remote.id,remoteVersion:remote.version,remotePath};
        const previous=this.p.state.baseline(path);
        if(!review&&!this.p.state.pending(path)&&previous&&previous.localHash===baseline.localHash&&previous.remoteHash===baseline.remoteHash
            &&previous.remoteId===baseline.remoteId&&previous.remoteVersion===baseline.remoteVersion&&previous.remotePath===baseline.remotePath)return;
        await this.checkpoint(s=>{s.baseline[path]=baseline;if(review)(s.reviews??={})[path]={copyPath:review.copyPath!,copyId:review.copyId!,hash:review.copyBytes!.sha256};delete s.pending[path];});
    }
    private async write(path:string,before:LocalVersion,bytes:ArrayBuffer,id:string):Promise<void>{
        this.guard();await this.dirs.ensure(this.p.vault,path);this.guard();
        const existing=this.p.mutations.store.records(this.p.state.namespace).find(record=>record.id===id);
        const attempt=existing?.status==='not-applied'?id+'-'+crypto.randomUUID():id;
        await this.p.mutations.write(this.p.state.namespace,{id:attempt,planId:id,path,before,requireConditionalWrite:true,guard:()=>this.guard()},bytes,this.p.signal);
    }
    private async trashLocal(intent:DriveIntent):Promise<void>{
        if(!this.p.vault.trash)throw new SyncFault('trash-unavailable','Local trash is unavailable; original retained','session');
        const actual=await observeLocal(this.p.vault,intent.path);
        if(actual.kind==='missing')return;
        await this.p.mutations.delete(this.p.state.namespace,{id:intent.id+'-delete',planId:intent.id,path:intent.path,before:intent.local,guard:()=>this.guard()},true);this.stats.deleted++;
    }
    private async trashRemote(id:string):Promise<void>{this.guard();const file=await this.p.root.owned(id,this.p.signal,true);
        if(file.trashed)return;if(file.capabilities?.canTrash===false)throw new SyncFault('access-denied','Drive trash permission is missing');
        this.guard();await this.p.root.client.metadata(id,{trashed:true},this.p.signal);this.stats.deleted++;this.stats.deletedDrive=(this.stats.deletedDrive??0)+1;}
    private async create(intent:DriveIntent,copy:boolean):Promise<DriveFile>{
        const ref=copy?intent.copyBytes:intent.bytes;if(!ref)throw new SyncFault('recovery-invalid','Upload snapshot is missing','session');
        const bytes=await this.p.mutations.recovery.read(ref),path=(copy?intent.copyRemotePath:intent.remotePath)!;
        this.p.root.path(path);const parent=await this.p.root.parent(path,intent,()=>this.persist(intent),this.p.signal);
        let id=copy?intent.copyId:intent.uploadId;
        if(!id){id=await this.p.root.client.reserveId(this.p.signal);if(copy)intent.copyId=id;else intent.uploadId=id;await this.persist(intent);}
        // Probe a fixed, durably reserved ID after an indeterminate create or lost final response.
        try{const existing=await this.p.root.owned(id,this.p.signal,false,path);await this.p.root.client.verify(existing,bytes);
            if(existing.name!==path.split('/').pop()!||!existing.parents.includes(parent))throw new SyncFault('recovery-invalid','Upload destination changed','session');return existing;
        }catch(error){if((error as {status?:number}).status!==404)throw error;}
        await this.p.root.vacant(path,parent,id,this.p.signal);this.guard();
        let result:DriveFile;
        try{result=await this.p.root.client.upload(id,{id,name:path.split('/').pop()!,parents:[parent],mimeType:'application/octet-stream'},bytes,true,this.p.signal,
            async state=>{if(copy)intent.copyUpload=state;else intent.upload=state;await this.persist(intent);this.p.observe?.({stage:'apply',bytes:state.offset,totalBytes:state.size,capability:'buffered'});},copy?intent.copyUpload:intent.upload);
        }catch(error){if((error as {code?:string}).code==='upload-expired'){if(copy)delete intent.copyUpload;else delete intent.upload;await this.persist(intent);}throw error;}
        await this.p.root.owned(result.id,this.p.signal,false,path);this.stats.uploaded!++;this.stats.bytesTransferred+=bytes.byteLength;return result;
    }
    private async copy(intent:DriveIntent):Promise<void>{
        await this.create(intent,true);const path=intent.copyPath!,bytes=await this.p.mutations.recovery.read(intent.copyBytes!);
        const actual=await observeLocal(this.p.vault,path),after=await versionOf(bytes);
        if(!sameVersion(actual,after))await this.write(path,intent.copyLocal??MISSING,bytes,intent.id+'-copy');
    }
    private async execute(intent:DriveIntent):Promise<void>{
        this.guard();if(this.p.remoteForLocal(intent.path)!==intent.remotePath||this.p.behavior(intent.path).protected)throw new SyncFault('configuration-changed','Pending Drive operation no longer belongs to this assignment','session');
        if(intent.copyPath&&(!['local','remote'].some(label=>intent.copyPath===sibling(intent.path,intent.id,label)&&intent.copyRemotePath===sibling(intent.remotePath,intent.id,label))||intent.copyLocal?.kind!=='missing'))throw new SyncFault('recovery-invalid','Invalid Drive conflict destination','session');
        if(intent.historyPath&&intent.historyPath!==sibling(intent.remotePath,intent.id,'history'))throw new SyncFault('recovery-invalid','Invalid Drive publication destination','session');
        if(intent.kind==='conflict'){
            await this.copy(intent);const remote=await this.p.root.owned(intent.remoteId!,this.p.signal,false,intent.remotePath);
            if(remote.name!==intent.remotePath.split('/').pop()!)throw new SyncFault('source-changed','Drive conflict file moved; copies retained','file',true);
            const bytes=await this.p.root.client.download(remote,this.p.signal),after=await versionOf(bytes),actual=await observeLocal(this.p.vault,intent.path);
            if(!sameVersion(actual,after))await this.write(intent.path,intent.local,bytes,intent.id+'-primary');
            await this.baseline(intent.path,intent.remotePath,after,remote,intent.reviewRequired?intent:undefined);this.stats.downloaded++;
            if(intent.reviewRequired){
                this.deferConflict({path:intent.path,status:'pending',reason:'Existing Drive object retained; review its published conflict copy',conflictPath:intent.copyPath});}
            return;
        }
        if(intent.kind==='delete-edit-local'||intent.kind==='delete-edit-remote')await this.copy(intent);
        if(intent.kind==='trash-local'||intent.kind==='delete-edit-local'){await this.trashLocal(intent);await this.clear(intent.path);return;}
        if(intent.kind==='trash-remote'||intent.kind==='delete-edit-remote'){
            await assertLocal(this.p.vault,intent.path,MISSING);const file=await this.p.root.owned(intent.remoteId!,this.p.signal,true,intent.remotePath);
            if(!file.trashed&&file.version!==intent.remoteVersion)throw new SyncFault('source-changed','Drive deletion target changed; original retained','file',true);
            await this.trashRemote(file.id);await this.clear(intent.path);return;
        }
        if(intent.remoteId){
            // Restoring a kept, tracked object preserves its ID and never overwrites its content.
            let old=await this.p.root.owned(intent.remoteId,this.p.signal,true,intent.remotePath);
            if(old.trashed){this.guard();old=await this.p.root.client.metadata(old.id,{trashed:false},this.p.signal);}
            const bytes=await this.p.mutations.recovery.read(intent.bytes!),base=this.p.state.baseline(intent.path);
            if(old.sha256Checksum?.toLowerCase()===intent.bytes!.sha256){await this.baseline(intent.path,intent.remotePath,await versionOf(bytes),old);return;}
            if(base&&intent.bytes!.sha256===base.localHash){const remoteBytes=await this.p.root.client.download(old,this.p.signal);
                await this.write(intent.path,intent.local,remoteBytes,intent.id+'-restore');await this.baseline(intent.path,intent.remotePath,await versionOf(remoteBytes),old);this.stats.downloaded++;return;}
            intent.kind='conflict';intent.remoteVersion=old.version;intent.reviewRequired=true;
            intent.copyPath=sibling(intent.path,intent.id);intent.copyRemotePath=sibling(intent.remotePath,intent.id);
            intent.copyBytes=intent.bytes;intent.copyLocal=MISSING;await this.persist(intent);await this.execute(intent);return;
        }
        const remote=await this.create(intent,false),bytes=await this.p.mutations.recovery.read(intent.bytes!);
        await this.baseline(intent.path,intent.remotePath,await versionOf(bytes),remote);
        if(!sameVersion(await observeLocal(this.p.vault,intent.path),await versionOf(bytes)))this.stats.followUp=true;
    }
}
