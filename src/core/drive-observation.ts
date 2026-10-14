import type { DriveFile } from '../sources/gdrive-client';
import type { GoogleDriveRoot } from '../sources/gdrive-root';
import { isDriveArtifactCandidate } from './drive-artifact';
import type { DriveBaseline, DriveObservation } from './drive-planner';
import type { DriveInboxReason } from './drive-state';
import { sha256Hex } from './hasher';

export interface ObservedDrive {
    observation:DriveObservation; remote?:DriveFile; bytes?:ArrayBuffer; reason?:DriveInboxReason;httpStatus?:number;
}
type TrackedIdentity=Pick<DriveBaseline,'remoteId'> & Partial<DriveBaseline>;
/** Probe the tracked identity, including its assigned path. A listing is not deletion evidence. */
export async function inspectDriveIdentity(root:GoogleDriveRoot,signal:AbortSignal,path:string,candidate:DriveFile|undefined,base:TrackedIdentity|undefined):Promise<Pick<ObservedDrive,'remote'|'reason'|'httpStatus'>>{
    const replaced=!!base&&!!candidate&&candidate.id!==base.remoteId;
    const id=base?.remoteId??candidate?.id;
    if(!id)return {};
    let remote:DriveFile;
    try{remote=await root.owned(id,signal,true,path);}
    catch(error){signal.throwIfAborted();const issue=error as {status?:number;code?:string};
        if(issue.code==='source-changed'||issue.code==='root-boundary')return {reason:replaced?'drive-identity-changed':'drive-relocated'};
        if(issue.status===404||issue.status===403&&(!issue.code||issue.code==='access-denied'))return {reason:replaced?'drive-identity-changed':'drive-unavailable',httpStatus:issue.status};
        throw error;
    }
    if(replaced)return {remote,reason:'drive-identity-changed'};
    if(remote.mimeType.startsWith('application/vnd.google-apps.')||isDriveArtifactCandidate(remote))return {remote,reason:'drive-unsupported'};
    if(!remote.trashed&&base&&!candidate)return {remote,reason:'drive-unlisted'};
    return {remote};
}
export async function observeDrive(root:GoogleDriveRoot,signal:AbortSignal,path:string,candidate:DriveFile|undefined,base:TrackedIdentity|undefined):Promise<ObservedDrive>{
    const identity=await inspectDriveIdentity(root,signal,path,candidate,base);
    if(identity.reason)return {...identity,observation:{kind:'unavailable'}};
    const remote=identity.remote;if(!remote)return {observation:{kind:'absent'}};
    if(remote.trashed)return {observation:{kind:'trashed'},remote};
    // A targeted fresh version supersedes the stale listing; bytes must belong to that version.
    let hash=remote.sha256Checksum?.toLowerCase(),bytes:ArrayBuffer|undefined;
    if(!hash&&base?.remoteId===remote.id&&base.remoteVersion===remote.version)hash=base.remoteHash;
    if(!hash){bytes=await root.client.download(remote,signal);hash=await sha256Hex(bytes);}
    return {observation:{kind:'file',hash,id:remote.id,version:remote.version},remote,bytes};
}
