import type { DriveFile } from '../sources/gdrive-client';
import { sha256Hex } from './hasher';

export type ProposalKind = 'conflict' | 'gated-upload' | 'delete-edit-local' | 'delete-edit-remote';
export interface DriveArtifactLineage {
    proposalId:string; originId:string; hash:string; baseVersion:string; baseHash:string; kind:ProposalKind;
}
export const ARTIFACT_KEYS = { protocol:'vetsync_artifact', proposal:'vetsync_proposal', origin:'vetsync_origin',
    hash:'vetsync_payload', baseVersion:'vetsync_base_version', baseHash:'vetsync_base_hash', kind:'vetsync_kind' } as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{64}$/;
const kinds:readonly string[] = ['conflict','gated-upload','delete-edit-local','delete-edit-remote'];
const own = (record:Record<string,string>|undefined,key:string):string|undefined => {
    const value=record&&Object.prototype.hasOwnProperty.call(record,key)?record[key]:undefined;
    return typeof value==='string'?value:undefined;
};
export const isDriveArtifactCandidate = (file:DriveFile):boolean => /\.conflict-/i.test(file.name)
    || own(file.properties,ARTIFACT_KEYS.protocol)!==undefined;
/** The marker is a claim, never authority. Root, origin policy, name, parent and bytes are checked by the runner. */
export function readArtifactLineage(file:DriveFile):DriveArtifactLineage|undefined {
    if(file.mimeType.startsWith('application/vnd.google-apps.'))return undefined;
    const p=file.properties;
    if(own(p,ARTIFACT_KEYS.protocol)!=='1')return undefined;
    const proposalId=own(p,ARTIFACT_KEYS.proposal),originId=own(p,ARTIFACT_KEYS.origin),hash=own(p,ARTIFACT_KEYS.hash),
        baseVersion=own(p,ARTIFACT_KEYS.baseVersion),baseHash=own(p,ARTIFACT_KEYS.baseHash),kind=own(p,ARTIFACT_KEYS.kind);
    if(!proposalId||!uuid.test(proposalId)||!originId||originId===file.id||!hash||!hex.test(hash)||!baseHash||!hex.test(baseHash)
        ||!baseVersion||!/^\d{1,40}$/.test(baseVersion)||!kind||!kinds.includes(kind))return undefined;
    for(const key of Object.values(ARTIFACT_KEYS))if(new TextEncoder().encode(key+(own(p,key)??'')).length>124)return undefined;
    return {proposalId,originId,hash,baseVersion,baseHash,kind:kind as ProposalKind};
}
export function artifactProperties(lineage:DriveArtifactLineage):Record<string,string> {
    const properties={ [ARTIFACT_KEYS.protocol]:'1',[ARTIFACT_KEYS.proposal]:lineage.proposalId,[ARTIFACT_KEYS.origin]:lineage.originId,
        [ARTIFACT_KEYS.hash]:lineage.hash,[ARTIFACT_KEYS.baseVersion]:lineage.baseVersion,[ARTIFACT_KEYS.baseHash]:lineage.baseHash,[ARTIFACT_KEYS.kind]:lineage.kind };
    if(!readArtifactLineage({id:'',name:'',mimeType:'application/octet-stream',parents:[],version:'1',properties}))throw Error('Drive artifact lineage exceeds the supported metadata contract');
    return properties;
}
export function sameArtifactLineage(a:DriveArtifactLineage|undefined,b:DriveArtifactLineage):boolean {
    return !!a&&a.proposalId===b.proposalId&&a.originId===b.originId&&a.hash===b.hash&&a.baseVersion===b.baseVersion&&a.baseHash===b.baseHash&&a.kind===b.kind;
}
export const artifactLabel=(kind:ProposalKind):'local'|'remote'=>kind==='delete-edit-remote'?'remote':'local';
export function driveConflictSibling(path:string,id:string,label='local'):string {
    const slash=path.lastIndexOf('/'),base=path.slice(slash+1),dot=base.lastIndexOf('.');
    const extension=dot>0?base.slice(dot):'',suffix=`.conflict-drive-${label}-${id}${extension}`;let stem='';
    for(const c of dot>0?base.slice(0,dot):base){if(new TextEncoder().encode(stem+c+suffix).length>240)break;stem+=c;}
    return path.slice(0,slash+1)+(stem||'_')+suffix;
}
export async function proposalKey(namespace:string,base:{originId:string;baseVersion:string;baseHash:string},hash:string,kind:ProposalKind):Promise<string> {
    return sha256Hex(new TextEncoder().encode(JSON.stringify([namespace,base.originId,base.baseVersion,base.baseHash,hash,kind])).buffer);
}
