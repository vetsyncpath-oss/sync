import type { ConflictChoice, SyncStats, SyncFileResult, TransferObserver, VaultAdapter } from '../sources/types';
import type { DriveFile, DriveItem } from '../sources/gdrive-client';
import { GoogleDriveRoot } from '../sources/gdrive-root';
import { DriveStateStore, type DriveIntent, type DriveProposal } from './drive-state';
import { artifactProperties, driveConflictSibling as sibling, isDriveArtifactCandidate, proposalKey, readArtifactLineage, sameArtifactLineage, type ProposalKind } from './drive-artifact';
import { receiveDriveArtifacts } from './drive-artifact-receiver';
import { planDrive, type DriveBaseline, type DriveObservation } from './drive-planner';
import type { EffectiveBehavior } from './profile-policy';
import { assertLocal, MISSING, observeLocal, sameVersion, versionOf, type LocalVersion } from './local-version';
import { sha256Hex } from './hasher';
import { DurableMutations } from './durable-mutations';
import { DirLock } from './dirlock';
import { diagnosticText, SyncFault, syncIssue } from './sync-issue';
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
    /** Evaluates actual artifact protections/exclusions and inherited origin ownership. Default is deny. */
    allowArtifact?(originPath:string,artifactPath:string,remotePath:string):boolean;
    ask?(path:string,localSize:number,remoteSize:number):Promise<ConflictChoice>;
}
/** Bidirectional executor has a separate three-way baseline; pull caches never authorize uploads. */
export class DriveCoordinator {
    private readonly dirs=new DirLock();
    private inventory:DriveItem[]=[];
    private readonly attention=new Set<string>();
    private readonly stats:SyncStats={totalFiles:0,downloaded:0,uploaded:0,deleted:0,skipped:0,failed:0,bytesTransferred:0,duration:0,conflicts:0,problems:[],outcome:'ok'};
    constructor(private readonly p:DriveExecutionPorts){}
    async run(inventory:DriveItem[]):Promise<SyncStats>{
        const started=Date.now();this.inventory=inventory;
        this.guard();await this.p.state.load();this.guard();
        try{await this.p.state.ensureWriterVersion();if(this.p.state.cleanupProblem)throw new SyncFault('checkpoint-cleanup',this.p.state.cleanupProblem,'session');}
        catch(error){if(this.p.signal.aborted)this.stats.outcome='cancelled';else{const issue=syncIssue(error instanceof SyncFault?error:new SyncFault('checkpoint',`Drive writer version could not be persisted; session stopped: ${diagnosticText(error)}`,'session'),'checkpoint');
            this.stats.failed++;this.stats.problems!.push(issue);this.stats.problem=issue.message;this.stats.outcome='error';}this.stats.duration=Date.now()-started;return this.stats;}
        this.guard();await this.p.mutations.store.load();await this.p.mutations.recover(this.p.state.namespace,this.p.signal);
        const artifacts=await receiveDriveArtifacts(this.p,inventory,{write:(path,before,bytes,id)=>this.write(path,before,bytes,id),
            checkpoint:update=>this.checkpoint(update),attention:row=>this.deferConflict(row),stats:this.stats});
        if(artifacts==='stop'){this.stats.pendingAfter=this.p.queue.size();this.stats.duration=Date.now()-started;return this.stats;}
        const localPaths=await this.p.localPaths(),all=new Set([...localPaths,...this.p.state.paths()]);
        const remotes=new Map<string,{path:string;file:DriveFile}>();
        for(const item of inventory.filter(item=>!isDriveArtifactCandidate(item.file)))for(const path of this.p.localForRemote(item.path)){
            if(remotes.has(path))throw new SyncFault('path-collision','Multiple remote files target one local path','source');
            remotes.set(path,item);all.add(path);
        }
        const canonical=new Set<string>();for(const path of all){const key=path.normalize('NFC').toLowerCase();if(canonical.has(key))throw new SyncFault('path-collision','Portable local/remote path collision','source');canonical.add(key);}
        this.stats.totalFiles+=all.size;this.stats.pendingBefore=this.p.queue.size();
        const asks:string[]=[];
        for(const path of all){
            try {
                this.guard();const remotePath=this.p.remoteForLocal(path),behavior=this.p.behavior(path);
                if(/\.conflict-/i.test(path.split('/').pop()!)){this.stats.skipped++;continue;}
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
                if(!base&&observation.kind==='absent'&&this.p.state.proposals(path).some(p=>p.originId!=='legacy-unknown'&&p.remotePath===remotePath)){
                    // Proposal history proves an earlier identity. Losing its baseline is not a fresh-name create authorization.
                    decision='pending';this.deferConflict({path,status:'pending',reason:'tracked-lineage-without-baseline'});
                }
                await this.proposalAttention(path,local,observation);
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
                    const actualRemotePath=remotePath.slice(0,remotePath.lastIndexOf('/')+1)+remote!.name;
                    intent.copyRemotePath=sibling(actualRemotePath,intent.id,decision==='delete-edit-remote'||keepRemoteCopy?'remote':'local');
                    if(decision==='delete-edit-remote'||keepRemoteCopy){
                        const bytes=remoteBytes??await this.p.root.client.download(remote!,this.p.signal);intent.copyBytes=await this.p.mutations.recovery.save(bytes);
                    }else intent.copyBytes=intent.bytes;
                    intent.copyLocal=MISSING;
                    await this.prepareProposal(intent,base);
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
                remoteForLocal:p=>p===path?this.p.remoteForLocal(p):undefined,allowArtifact:this.p.allowArtifact?(origin,artifact,remote)=>origin===path&&this.p.allowArtifact!(origin,artifact,remote):undefined,behavior:p=>({...this.p.behavior(p),conflict:{action:'keep-remote',keepOther:true}}),ask:undefined});
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
            localForRemote:path=>this.p.localForRemote(path).filter(local=>paths.includes(local)),remoteForLocal:path=>paths.includes(path)?this.p.remoteForLocal(path):undefined,
            allowArtifact:this.p.allowArtifact?(origin,artifact,remote)=>paths.includes(origin)&&this.p.allowArtifact!(origin,artifact,remote):undefined}).run(this.inventory);
    }
    private guard():void{this.p.signal.throwIfAborted();this.p.guard();}
    private deferConflict(row:SyncFileResult):void{this.attention.add(row.path);this.stats.deferredConflicts=this.attention.size;
        this.stats.results=this.stats.results?.filter(old=>old.path!==row.path||old.status!=='pending');(this.stats.results??=[]).push(row);}
    private async checkpoint(update:Parameters<DriveStateStore['save']>[0]):Promise<void>{this.guard();try{await this.p.state.save(update);}catch{throw new SyncFault('checkpoint','Drive checkpoint could not be saved; session stopped','session');}this.guard();if(this.p.state.cleanupProblem)throw new SyncFault('checkpoint-cleanup',this.p.state.cleanupProblem,'session');}
    private persist(intent:DriveIntent):Promise<void>{return this.checkpoint(s=>s.pending[intent.path]=structuredClone(intent));}
    private async prepareProposal(intent:DriveIntent,base?:DriveBaseline):Promise<void>{
        const kind:ProposalKind=intent.kind==='conflict'?(intent.reviewRequired?'gated-upload':'conflict'):intent.kind==='delete-edit-remote'?'delete-edit-remote':'delete-edit-local';
        const lineage={originId:intent.remoteId!,baseVersion:intent.remoteVersion!,baseHash:intent.remoteHash??base?.remoteHash??intent.copyBytes!.sha256};
        const key=await proposalKey(this.p.state.namespace,lineage,intent.copyBytes!.sha256,kind),existing=this.p.state.matchingProposal(key);
        if(existing){
            if(existing.path!==intent.path||existing.remotePath!==intent.remotePath||!existing.payload)throw new SyncFault('recovery-invalid','Drive proposal lineage no longer matches its binding','session');
            intent.proposalId=existing.id;intent.copyId=existing.copyId;intent.copyPath=existing.copyPath;intent.copyRemotePath=existing.copyRemotePath;intent.copyBytes=existing.payload;
            return;
        }
        if(this.p.state.proposalCount>=this.p.state.maxProposals)throw new SyncFault('proposal-limit','Drive proposal history limit reached; original retained. History needs review before new proposals can be published');
        if(this.p.state.proposal(intent.id))throw new SyncFault('recovery-review','An existing legacy proposal cannot be converted to a different publication; its IDs and payload remain retained');
        intent.proposalId=intent.id;
        const proposal:DriveProposal={id:intent.id,proposalId:intent.id,key,path:intent.path,remotePath:intent.remotePath,
            copyPath:intent.copyPath!,copyRemotePath:intent.copyRemotePath!,hash:intent.copyBytes!.sha256,payload:intent.copyBytes!,
            ...lineage,kind,portable:true,status:'prepared',needsReview:!!intent.reviewRequired};
        // Validate the portable representation before admitting any remote effect.
        try{artifactProperties(proposal);}catch{throw new SyncFault('artifact-lineage','Drive identity cannot be represented by the supported artifact metadata; original retained');}
        await this.checkpoint(s=>{s.proposals[proposal.id]=proposal;s.pending[intent.path]=structuredClone(intent);});
    }
    private async proposalAttention(path:string,local:LocalVersion,remote:DriveObservation):Promise<void>{
        const proposals=this.p.state.proposals(path).filter(p=>p.needsReview&&p.status!=='converged');
        const converged=proposals.filter(p=>remote.kind==='file'&&remote.id===p.originId&&remote.hash===p.hash&&local.kind==='file'&&local.sha256===p.hash);
        if(converged.length)await this.checkpoint(s=>{for(const p of converged)s.proposals[p.id].status='converged';
            const review=s.reviews?.[path];if(review&&converged.some(p=>p.copyId===review.copyId))delete s.reviews![path];});
        const open=proposals.filter(p=>!converged.some(c=>c.id===p.id));
        if(open.length)this.deferConflict({path,status:'pending',reason:'drive-proposals-review',proposalCount:open.length,
            conflictPath:open.at(-1)!.copyPath,proposalIds:open.slice(0,50).map(p=>p.id),conflictPaths:open.slice(0,50).map(p=>p.copyPath)});
    }
    private clear(path:string):Promise<void>{if(!this.p.state.pending(path)&&!this.p.state.baseline(path)&&!this.p.state.review(path))return Promise.resolve();return this.checkpoint(s=>{delete s.pending[path];delete s.baseline[path];if(s.reviews)delete s.reviews[path];});}
    private async baseline(path:string,remotePath:string,local:LocalVersion,remote:DriveFile,review?:DriveIntent):Promise<void>{
        this.guard();if(local.kind!=='file'||remote.trashed)throw Error('Cannot adopt an absent version');
        const baseline:DriveBaseline={localHash:local.sha256,remoteHash:local.sha256,remoteId:remote.id,remoteVersion:remote.version,remotePath};
        const previous=this.p.state.baseline(path);
        if(!review&&!this.p.state.pending(path)&&previous&&previous.localHash===baseline.localHash&&previous.remoteHash===baseline.remoteHash
            &&previous.remoteId===baseline.remoteId&&previous.remoteVersion===baseline.remoteVersion&&previous.remotePath===baseline.remotePath)return;
        await this.checkpoint(s=>{s.baseline[path]=baseline;if(review)(s.reviews??=Object.create(null))[path]={copyPath:review.copyPath!,copyId:review.copyId!,hash:review.copyBytes!.sha256};delete s.pending[path];});
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
    private async verifyPublication(file:DriveFile,bytes:ArrayBuffer,expectedHash:string,copy:boolean):Promise<void>{
        await this.p.root.client.verify(file,bytes);
        // Size/MD5 and a public marker cannot prove recovery of an unknown create against another writer.
        if(copy&&!file.sha256Checksum&&await sha256Hex(await this.p.root.client.download(file,this.p.signal))!==expectedHash)
            throw new SyncFault('integrity','Drive proposal bytes do not match the immutable payload; original retained','file',true);
    }
    private async create(intent:DriveIntent,copy:boolean):Promise<DriveFile>{
        const ref=copy?intent.copyBytes:intent.bytes;if(!ref)throw new SyncFault('recovery-invalid','Upload snapshot is missing','session');
        const bytes=await this.p.mutations.recovery.read(ref),path=(copy?intent.copyRemotePath:intent.remotePath)!;
        this.p.root.path(path);
        // Copy identity comes from the fresh origin, including its actual parent/name, rather than a spelling in the mapping.
        const origin=copy?await this.p.root.owned(intent.remoteId!,this.p.signal,true,intent.remotePath):undefined;
        if(origin&&(origin.mimeType.startsWith('application/vnd.google-apps.')||isDriveArtifactCandidate(origin)))throw new SyncFault('artifact-lineage','Drive proposal origin is not a canonical binary file');
        const proposal=copy&&intent.proposalId?this.p.state.proposal(intent.proposalId):undefined;
        if(origin&&proposal?.portable&&path.split('/').pop()!==sibling(origin.name,proposal.id,proposal.kind==='delete-edit-remote'?'remote':'local'))
            throw new SyncFault('source-changed','Drive proposal origin name changed; fixed publication identity retained','file',true);
        const parent=origin?origin.parents[0]:await this.p.root.parent(path,intent,()=>this.persist(intent),this.p.signal);
        if(!parent)throw new SyncFault('root-boundary','Drive copy parent cannot be verified');
        let id=copy?intent.copyId:intent.uploadId;
        const properties=proposal?.portable?artifactProperties(proposal):undefined;
        if(!id){id=await this.p.root.client.reserveId(this.p.signal);if(copy)intent.copyId=id;else intent.uploadId=id;
            await this.checkpoint(s=>{s.pending[intent.path]=structuredClone(intent);if(proposal)s.proposals[proposal.id].copyId=id;});}
        // Probe a fixed, durably reserved ID after an indeterminate create or lost final response.
        try{const existing=await this.p.root.owned(id,this.p.signal,false,path);await this.verifyPublication(existing,bytes,ref.sha256,copy);
            if(existing.name!==path.split('/').pop()!||!existing.parents.includes(parent)||proposal?.portable&&!sameArtifactLineage(readArtifactLineage(existing),proposal))throw new SyncFault('recovery-invalid','Upload destination or artifact lineage changed','file');return existing;
        }catch(error){if((error as {status?:number}).status!==404)throw error;
            if(proposal&&proposal.status!=='prepared')throw new SyncFault('artifact-unavailable','Published Drive proposal is unavailable; retained ID will not be recreated');}
        await this.p.root.vacant(path,parent,id,this.p.signal);this.guard();
        let result:DriveFile;
        try{result=await this.p.root.client.upload(id,{id,name:path.split('/').pop()!,parents:[parent],mimeType:'application/octet-stream',...(properties?{properties}:{})},bytes,true,this.p.signal,
            async state=>{if(copy)intent.copyUpload=state;else intent.upload=state;await this.persist(intent);this.p.observe?.({stage:'apply',bytes:state.offset,totalBytes:state.size,capability:'buffered'});},copy?intent.copyUpload:intent.upload);
        }catch(error){if((error as {code?:string}).code==='upload-expired'){if(copy)delete intent.copyUpload;else delete intent.upload;await this.persist(intent);}throw error;}
        if(result.id!==id)throw new SyncFault('response-format','Drive publication returned a different reserved object ID; intent retained');
        const verified=await this.p.root.owned(result.id,this.p.signal,false,path);await this.verifyPublication(verified,bytes,ref.sha256,copy);
        if(verified.name!==path.split('/').pop()!||!verified.parents.includes(parent)||proposal?.portable&&!sameArtifactLineage(readArtifactLineage(verified),proposal))throw new SyncFault('artifact-lineage','Drive publication metadata could not be verified');
        this.stats.uploaded!++;this.stats.bytesTransferred+=bytes.byteLength;return verified;
    }
    private async copy(intent:DriveIntent):Promise<void>{
        const file=await this.create(intent,true);const path=intent.copyPath!,bytes=await this.p.mutations.recovery.read(intent.copyBytes!);
        const actual=await observeLocal(this.p.vault,path),after=await versionOf(bytes);
        if(!sameVersion(actual,after))await this.write(path,intent.copyLocal??MISSING,bytes,intent.id+'-copy');
        if(intent.proposalId){const proposal=this.p.state.proposal(intent.proposalId)!;
            if(proposal.status==='prepared')await this.checkpoint(s=>{s.proposals[proposal.id].status='published';s.proposals[proposal.id].copyId=file.id;});}
    }
    private async execute(intent:DriveIntent):Promise<void>{
        this.guard();if(this.p.remoteForLocal(intent.path)!==intent.remotePath||this.p.behavior(intent.path).protected)throw new SyncFault('configuration-changed','Pending Drive operation no longer belongs to this assignment','session');
        if(['trash-local','trash-remote','delete-edit-local','delete-edit-remote'].includes(intent.kind)&&this.p.behavior(intent.path).deletions==='keep')
            throw new SyncFault('configuration-changed','Pending trash is blocked by the current keep-deletions profile; its intent and copies remain retained');
        if(intent.copyPath&&(!['local','remote'].some(label=>intent.copyPath===sibling(intent.path,intent.proposalId??intent.id,label)&&intent.copyRemotePath?.normalize('NFC').toLowerCase()===sibling(intent.remotePath,intent.proposalId??intent.id,label).normalize('NFC').toLowerCase())||intent.copyLocal?.kind!=='missing'))throw new SyncFault('recovery-invalid','Invalid Drive conflict destination','session');
        if(intent.copyPath&&this.p.allowArtifact&&!this.p.allowArtifact(intent.path,intent.copyPath,intent.copyRemotePath!))
            throw new SyncFault('artifact-excluded','Current scope excludes the required proposal copy; primary and intent retained');
        if(intent.historyPath&&intent.historyPath!==sibling(intent.remotePath,intent.id,'history'))throw new SyncFault('recovery-invalid','Invalid Drive publication destination','session');
        if(intent.kind==='conflict'){
            await this.copy(intent);const remote=await this.p.root.owned(intent.remoteId!,this.p.signal,false,intent.remotePath);
            const proposal=intent.proposalId?this.p.state.proposal(intent.proposalId):undefined;
            if(isDriveArtifactCandidate(remote)||proposal?.portable&&intent.copyRemotePath!.split('/').pop()!==sibling(remote.name,proposal.id))throw new SyncFault('source-changed','Drive conflict origin changed; copies retained','file',true);
            const bytes=await this.p.root.client.download(remote,this.p.signal),after=await versionOf(bytes),actual=await observeLocal(this.p.vault,intent.path);
            if(!sameVersion(actual,after))await this.write(intent.path,intent.local,bytes,intent.id+'-primary');
            await this.baseline(intent.path,intent.remotePath,after,remote,intent.reviewRequired?intent:undefined);this.stats.downloaded++;
            if(intent.reviewRequired){
                await this.proposalAttention(intent.path,after,{kind:'file',id:remote.id,version:remote.version,hash:after.kind==='file'?after.sha256:''});}
            return;
        }
        if(intent.kind==='delete-edit-local'||intent.kind==='delete-edit-remote')await this.copy(intent);
        if(intent.kind==='trash-local'||intent.kind==='delete-edit-local'){await this.trashLocal(intent);await this.clear(intent.path);return;}
        if(intent.kind==='trash-remote'||intent.kind==='delete-edit-remote'){
            await this.p.vault.assertWritable?.(intent.path);await assertLocal(this.p.vault,intent.path,MISSING);const file=await this.p.root.owned(intent.remoteId!,this.p.signal,true,intent.remotePath);
            if(!file.trashed&&file.version!==intent.remoteVersion)throw new SyncFault('source-changed','Drive deletion target changed; original retained','file',true);
            await this.p.vault.assertWritable?.(intent.path);await assertLocal(this.p.vault,intent.path,MISSING);
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
            intent.remoteHash=old.sha256Checksum?.toLowerCase()??await sha256Hex(await this.p.root.client.download(old,this.p.signal));
            intent.copyPath=sibling(intent.path,intent.id);intent.copyRemotePath=sibling(intent.remotePath.slice(0,intent.remotePath.lastIndexOf('/')+1)+old.name,intent.id);
            intent.copyBytes=intent.bytes;intent.copyLocal=MISSING;await this.prepareProposal(intent,base);await this.persist(intent);await this.execute(intent);return;
        }
        const remote=await this.create(intent,false),bytes=await this.p.mutations.recovery.read(intent.bytes!);
        await this.baseline(intent.path,intent.remotePath,await versionOf(bytes),remote);
        if(!sameVersion(await observeLocal(this.p.vault,intent.path),await versionOf(bytes)))this.stats.followUp=true;
    }
}
