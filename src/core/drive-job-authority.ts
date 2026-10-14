import { DRIVE_FOLDER, type DriveFile, type GoogleDriveClient } from '../sources/gdrive-client';
import type { GoogleDriveRoot } from '../sources/gdrive-root';
import { SyncFault } from './sync-issue';
export interface DriveRootClaim {connectionId:string;folderId:string;observed?:DriveFile;client?:GoogleDriveClient}
/** IDs share a Drive object namespace across accounts. An unreadable competing root is not proof of disjointness. */
export async function verifyDriveRootAuthority(connectionId:string,root:GoogleDriveRoot,claims:readonly DriveRootClaim[],signal:AbortSignal):Promise<void>{
    if(claims.filter(claim=>claim.connectionId!==connectionId).length===0)return;
    const ancestors=async(client:GoogleDriveClient,id:string)=>{
        const ids=new Set<string>();let file=await client.inspect(id,signal);
        for(let depth=0;;depth++){
            signal.throwIfAborted();if(depth>100||ids.has(file.id)||file.parents.length>1||file.trashed||file.mimeType!==DRIVE_FOLDER)throw new SyncFault('remote-ownership','Drive root ancestry cannot be verified','source');
            ids.add(file.id);if(!file.parents.length){if(file.id!=='root'&&file.driveId!==file.id){const accountRoot=await client.inspect('root',signal);if(accountRoot.id!==file.id)throw new SyncFault('remote-ownership','Drive ancestry ended without a verified account or shared-drive root','source');}return ids;}file=await client.inspect(file.parents[0],signal);
        }
    };
    const own=await ancestors(root.client,root.rootId);
    for(const claim of claims){if(claim.connectionId===connectionId)continue;
        const otherId=claim.observed?.id??claim.folderId;
        if(!otherId||otherId==='root')throw new SyncFault('remote-ownership',`Writable root for ${claim.connectionId} is unresolved; Drive writes are blocked`,'source');
        if(own.has(otherId))throw new SyncFault('remote-ownership',`Writable Drive roots overlap with ${claim.connectionId}`,'source');
        const reader=claim.observed?claim.client??root.client:root.client;
        let other:Set<string>;try{other=await ancestors(reader,otherId);}
        catch(error){signal.throwIfAborted();if(reader===root.client&&((error as {code?:string}).code==='auth-required'||(error as {retryable?:boolean}).retryable))throw error;throw new SyncFault('remote-ownership',`Cannot prove writable Drive root disjoint from ${claim.connectionId}`,'source');}
        if(other.has(root.rootId))throw new SyncFault('remote-ownership',`Writable Drive roots overlap with ${claim.connectionId}`,'source');
    }
}
