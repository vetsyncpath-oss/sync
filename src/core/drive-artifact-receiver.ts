import type { DriveExecutionPorts } from './drive-coordinator';
import type { DriveArtifactReceipt, DriveStateStore } from './drive-state';
import type { DriveItem } from '../sources/gdrive-client';
import type { SyncFileResult, SyncStats } from '../sources/types';
import { artifactLabel, driveConflictSibling, isDriveArtifactCandidate, readArtifactLineage, sameArtifactLineage } from './drive-artifact';
import { observeLocal, type LocalVersion } from './local-version';
import { sha256Hex } from './hasher';
import { SyncFault, syncIssue } from './sync-issue';

interface Effects {
    write(path:string,before:LocalVersion,bytes:ArrayBuffer,id:string):Promise<void>;
    checkpoint(update:Parameters<DriveStateStore['save']>[0]):Promise<void>;
    attention(row:SyncFileResult):void;stats:SyncStats;
}
/** Artifacts travel as immutable proposals, outside the canonical three-way diff. Never upload/trash an artifact. */
export async function receiveDriveArtifacts(p:DriveExecutionPorts,inventory:DriveItem[],effects:Effects):Promise<'continue'|'stop'> {
    if(!p.allowArtifact)return 'continue';
    const guard=()=>{p.signal.throwIfAborted();p.guard();},byId=new Map(inventory.map(item=>[item.file.id,item]));
    const targets=new Map<string,{item:DriveItem;receipt:DriveArtifactReceipt;originRemotePath:string}[]>(),seen=new Set<string>();
    const remember=async(receipt:DriveArtifactReceipt)=>{
        const previous=p.state.artifact(receipt.id);
        if(JSON.stringify(previous)!==JSON.stringify(receipt))await effects.checkpoint(s=>{s.artifacts[receipt.id]=receipt;});
    };
    const pending=async(receipt:DriveArtifactReceipt,issue:string,localHash?:string)=>{
        await remember({...receipt,issue,...(localHash?{localHash}:{})});
        effects.attention({path:receipt.path,remotePath:receipt.remotePath,status:'pending',reason:issue,
            conflictPath:receipt.path,proposalIds:[receipt.proposalId]});
    };
    const failed=(error:unknown,path:string,hash='drive-artifact',originPath?:string)=>{
        const issue=syncIssue(error,'apply');if(issue.code==='io')issue.scope='session';
        effects.stats.problems!.push(issue);effects.stats.failed++;effects.stats.problem=issue.message;effects.stats.outcome='error';
        (effects.stats.results??=[]).push({path,status:'error',reason:issue.code,issue});
        p.queue.add({path,hash,size:0,originPath},issue.message,Date.now(),issue.retryable?'transient':'blocked',Math.max(0,(issue.retryAt??0)-Date.now()),issue);
        return issue.scope==='session'||issue.code==='auth-required'||issue.code==='root-unavailable';
    };
    // Project first, so two valid claims for one physical target cannot win by traversal order.
    for(const item of inventory.filter(item=>isDriveArtifactCandidate(item.file))){
        const lineage=readArtifactLineage(item.file);if(!lineage)continue; // Legacy/unmarked copies stay excluded.
        try{
            guard();const folder=item.path.slice(0,Math.max(0,item.path.lastIndexOf('/')));
            const listed=byId.get(lineage.originId),origin=await p.root.owned(lineage.originId,p.signal,true,listed?.path);
            if(origin.mimeType.startsWith('application/vnd.google-apps.')||isDriveArtifactCandidate(origin))continue;
            const originRemotePath=listed?.path??[folder,origin.name].filter(Boolean).join('/');
            if(!listed)await p.root.owned(origin.id,p.signal,true,originRemotePath);
            if(origin.parents.length!==1||item.file.parents.length!==1||origin.parents[0]!==item.file.parents[0]
                ||item.path!==driveConflictSibling(originRemotePath,lineage.proposalId,artifactLabel(lineage.kind)))continue;
            const originPaths=p.localForRemote(originRemotePath);
            if(originPaths.length>1)throw new SyncFault('artifact-target-collision','Drive artifact origin has multiple local destinations');
            for(const originPath of originPaths){
                guard();const behavior=p.behavior(originPath),path=driveConflictSibling(originPath,lineage.proposalId,artifactLabel(lineage.kind));
                if(p.skipQueued&&p.queue.all().some(entry=>entry.path===path||entry.path===originPath)){effects.stats.skipped++;continue;}
                if(behavior.protected||behavior.direction!=='bidirectional'||!p.allowArtifact(originPath,path,item.path))continue;
                const old=p.state.artifact(item.file.id);
                const receipt:DriveArtifactReceipt={id:item.file.id,proposalId:lineage.proposalId,originId:origin.id,path,originPath,
                    remotePath:item.path,hash:lineage.hash,remoteVersion:item.file.version};
                if(old&&(old.path!==path||old.originId!==origin.id||old.proposalId!==lineage.proposalId||old.hash!==lineage.hash)){
                    await pending(old,'artifact-lineage-changed');seen.add(old.id);continue;
                }
                const key=path.normalize('NFC').toLowerCase(),group=targets.get(key)??[];
                group.push({item,receipt,originRemotePath});targets.set(key,group);seen.add(item.file.id);
            }
        }catch(error){
            if(p.signal.aborted){effects.stats.outcome='cancelled';return 'stop';}
            const known=p.state.artifact(item.file.id);
            if((error as {status?:number}).status===404||(error as {code?:string}).code==='root-boundary'){
                if(known){await pending(known,'artifact-origin-unavailable');seen.add(known.id);}
                else effects.attention({path:item.path,remotePath:item.path,status:'pending',reason:'artifact-origin-unavailable',proposalIds:[lineage.proposalId]});
                continue;
            }
            if(failed(error,known?.path??item.path,lineage.hash,known?.originPath))return 'stop';
        }
    }
    for(const group of targets.values())for(const {item,receipt,originRemotePath} of group){
        try{
            guard();effects.stats.totalFiles++;
            if(group.length>1){await pending(receipt,'artifact-target-collision');continue;}
            const queued=p.queue.all().find(q=>q.path===receipt.path);
            if(p.auto&&queued&&(queued.poisoned||queued.nextRetryAt>Date.now())){effects.stats.skipped++;continue;}
            const lineage=readArtifactLineage(item.file)!,fresh=await p.root.owned(item.file.id,p.signal,false,item.path);
            if(fresh.version!==item.file.version||!sameArtifactLineage(readArtifactLineage(fresh),lineage))throw new SyncFault('source-changed','Drive artifact changed after inventory','file',true);
            if(fresh.sha256Checksum&&fresh.sha256Checksum.toLowerCase()!==receipt.hash){await pending(receipt,'artifact-remote-edited');continue;}
            const local=await observeLocal(p.vault,receipt.path),previous=p.state.artifact(receipt.id);
            if(local.kind==='file'&&local.sha256!==receipt.hash){await pending(receipt,'artifact-local-edited',local.sha256);continue;}
            if(local.kind==='missing'&&previous&&!p.restoreOnly){await pending(receipt,'artifact-local-missing');continue;}
            const verifyOrigin=async()=>{const origin=await p.root.owned(receipt.originId,p.signal,true,originRemotePath);
                if(origin.mimeType.startsWith('application/vnd.google-apps.')||isDriveArtifactCandidate(origin)||origin.parents.length!==1||fresh.parents.length!==1||origin.parents[0]!==fresh.parents[0]
                    ||origin.name!==originRemotePath.split('/').pop()!)throw new SyncFault('source-changed','Drive artifact origin changed during transfer; copy retained remotely','file',true);};
            if(local.kind==='missing'){
                const bytes=await p.root.client.download(fresh,p.signal);if(await sha256Hex(bytes)!==receipt.hash){await pending(receipt,'artifact-remote-edited');continue;}
                const after=await p.root.owned(fresh.id,p.signal,false,item.path);
                if(after.version!==fresh.version||!sameArtifactLineage(readArtifactLineage(after),lineage))throw new SyncFault('source-changed','Drive artifact changed during transfer','file',true);
                await verifyOrigin();guard();await effects.write(receipt.path,local,bytes,crypto.randomUUID());effects.stats.downloaded++;effects.stats.bytesTransferred+=bytes.byteLength;
            }else await verifyOrigin();
            await remember(receipt);p.queue.delete(receipt.path);
            (effects.stats.results??=[]).push({path:receipt.path,remotePath:receipt.remotePath,status:local.kind==='missing'?'applied':'unchanged',
                reason:'drive-proposal-received',proposalIds:[receipt.proposalId]});
        }catch(error){if(p.signal.aborted){effects.stats.outcome='cancelled';return 'stop';}if(failed(error,receipt.path,receipt.hash,receipt.originPath))return 'stop';}
    }
    // An omitted tracked artifact is uncertainty, never authority to trash its local copy.
    for(const receipt of p.state.artifacts().filter(a=>!seen.has(a.id))){
        if(!p.allowArtifact(receipt.originPath,receipt.path,receipt.remotePath)||p.behavior(receipt.originPath).protected||p.behavior(receipt.originPath).direction!=='bidirectional')continue;
        try{guard();const file=await p.root.owned(receipt.id,p.signal,true,receipt.remotePath),lineage=readArtifactLineage(file);
            const changed=!lineage||lineage.proposalId!==receipt.proposalId||lineage.originId!==receipt.originId||lineage.hash!==receipt.hash;
            await pending(receipt,file.trashed?'artifact-remote-trashed':changed?'artifact-lineage-changed':'artifact-unlisted');
        }catch(error){if(p.signal.aborted){effects.stats.outcome='cancelled';return 'stop';}
            if((error as {status?:number}).status===404||(error as {code?:string}).code==='root-boundary')await pending(receipt,'artifact-unavailable');
            else if(failed(error,receipt.path,receipt.hash,receipt.originPath))return 'stop';}
    }
    return 'continue';
}
