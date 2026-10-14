import type { EffectiveBehavior } from './profile-policy';
export interface DriveBaseline { localHash: string; remoteHash: string; remoteId: string; remoteVersion: string; remotePath: string }
export type DriveObservation = { kind:'file'; hash:string; id:string; version:string } | {kind:'absent'|'trashed'|'unavailable'};
export type DriveDecision = 'protected'|'adopt'|'upload'|'download'|'trash-local'|'trash-remote'|'conflict'|'delete-edit-local'|'delete-edit-remote'|'gone'|'pending';
/** Absence from a listing is never a tombstone. Only an explicit trashed ID proves remote deletion. */
export function planDrive(localHash:string|undefined,remote:DriveObservation,baseline:DriveBaseline|undefined,behavior:EffectiveBehavior):DriveDecision {
    if(behavior.protected)return 'protected';
    if(remote.kind==='unavailable')return 'pending';
    if(remote.kind==='absent'&&baseline)return 'pending';
    const remoteHash=remote.kind==='file'?remote.hash:undefined;
    if(baseline&&remote.kind==='file'&&remote.id!==baseline.remoteId)return 'pending';
    if(localHash!==undefined&&remoteHash!==undefined&&localHash===remoteHash)return 'adopt';
    if(!baseline){
        if(localHash===undefined)return remoteHash===undefined?'gone':'download';
        return remoteHash===undefined?'upload':'conflict';
    }
    const localChanged=localHash!==baseline.localHash,remoteChanged=remoteHash!==baseline.remoteHash
        ||remote.kind==='file'&&remote.id!==baseline.remoteId;
    if(localHash===undefined&&remoteHash===undefined)return 'gone';
    if(localHash===undefined){
        if(behavior.deletions==='keep')return 'download';
        return remoteChanged?'delete-edit-remote':'trash-remote';
    }
    if(remoteHash===undefined){
        if(behavior.deletions==='keep')return 'upload';
        return localChanged?'delete-edit-local':'trash-local';
    }
    if(!localChanged&&remoteChanged)return 'download';
    if(localChanged&&!remoteChanged)return 'upload';
    return 'conflict';
}
