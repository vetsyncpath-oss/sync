import { GoogleDriveClient, DRIVE_FOLDER, type DriveFile } from './gdrive-client';
import { SyncFault } from '../core/sync-issue';
import type { DriveIntent } from '../core/drive-state';
import { ownEntry } from '../core/drive-state';
const key=(s:string)=>s.normalize('NFC').toLowerCase();
/** Every mutable locator is checked against the selected root, never against account-wide search. */
export class GoogleDriveRoot {
    constructor(readonly client:GoogleDriveClient,readonly rootId:string,private readonly guard:()=>void=()=>{}){}
    async owned(id:string,signal:AbortSignal,allowTrash=false,expectedPath?:string):Promise<DriveFile>{
        this.guard();signal.throwIfAborted();
        const file=await this.client.inspect(id,signal);if(file.trashed&&!allowTrash)throw new SyncFault('remote-deleted','Drive file is in trash');
        let current=file;const seen=new Set<string>(),names:string[]=[];
        for(let depth=0;current.id!==this.rootId;depth++){
            if(depth>100||seen.has(current.id)||current.parents.length!==1)throw new SyncFault('root-boundary','Drive locator is outside the selected folder','source');
            if(!current.name||/[\\/\x00-\x1f]/.test(current.name)||current.name==='.'||current.name==='..')
                throw new SyncFault('root-boundary','Drive locator has unsafe path segments; identity cannot be projected','source');
            names.push(current.name);seen.add(current.id);current=await this.client.inspect(current.parents[0],signal);
            if(current.trashed)throw new SyncFault('root-unavailable','A Drive ancestor is in trash','source');
        }
        if(current.mimeType!==DRIVE_FOLDER)throw new SyncFault('root-unavailable','Selected Drive root is not a folder','source');
        if(expectedPath!==undefined&&key(names.reverse().join('/'))!==key(expectedPath))throw new SyncFault('source-changed','Drive locator moved outside its assigned path','file',true);
        return file;
    }
    async parent(path:string,intent:DriveIntent,persist:()=>Promise<void>,signal:AbortSignal):Promise<string>{
        if(intent.directories)intent.directories=Object.assign(Object.create(null),intent.directories);
        this.path(path);let parent=this.rootId,current='';
        for(const name of path.split('/').slice(0,-1)){
            current=current?current+'/'+name:name;
            const folder=await this.owned(parent,signal);
            const children=await this.client.listChildren(parent,signal,folder.driveId),matching=children.filter(f=>key(f.name)===key(name));
            if(matching.length>1||matching[0]&&matching[0].mimeType!==DRIVE_FOLDER)throw new SyncFault('path-collision','Drive parent folder collision');
            if(matching.length){parent=matching[0].id;continue;}
            if(folder.capabilities?.canAddChildren===false)throw new SyncFault('access-denied','Cannot create files in selected Drive folder');
            let id=ownEntry(intent.directories,current);if(!id){id=await this.client.reserveId(signal);(intent.directories??=Object.create(null))[current]=id;await persist();}
            try{const existing=await this.client.inspect(id,signal);
                if(existing.mimeType!==DRIVE_FOLDER||existing.name!==name||!existing.parents.includes(parent)||existing.trashed)throw new SyncFault('recovery-invalid','Reserved folder identity changed','session');
            }catch(error){if((error as {status?:number}).status!==404)throw error;this.guard();signal.throwIfAborted();await this.client.mkdir(id,name,parent,signal);}
            await this.owned(id,signal);parent=id;
        }
        return parent;
    }
    async vacant(path:string,parent:string,allowedId:string|undefined,signal:AbortSignal):Promise<void>{
        this.path(path);const folder=await this.owned(parent,signal);
        const matches=(await this.client.listChildren(parent,signal,folder.driveId)).filter(f=>key(f.name)===key(path.split('/').pop()!));
        if(matches.some(f=>f.id!==allowedId))throw new SyncFault('path-collision',`Drive destination already exists: ${path}`);
    }
    path(path:string):void{if(!path||path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f]/.test(p)))throw new SyncFault('path-collision','Invalid Drive relative path','session');}
}
