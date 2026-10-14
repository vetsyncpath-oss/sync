import type { RemoteEntry, SyncSource } from './types';
import { GoogleDriveClient, DRIVE_FOLDER, type DriveFile } from './gdrive-client';
import type { RemoteBrowseSnapshot } from './remote-browse';
import { validateManifest } from '../core/source-validation';
import { SyncFault } from '../core/sync-issue';
import { isDriveArtifactCandidate, readArtifactLineage } from '../core/drive-artifact';
const manifestHash=(file:DriveFile)=>file.sha256Checksum?.toLowerCase()??`gdrive:${file.md5ChecksumToken??file.md5Checksum??file.version}`;
export class GDriveOAuthSource implements SyncSource {
    readonly kind = 'gdrive' as const;
    readonly deletionSafety = 'unverified' as const;
    readonly maxFileSizeBytes: number;
    private readonly files = new Map<string, DriveFile>();
    inventorySnapshot?: Awaited<ReturnType<GoogleDriveClient['inventory']>>;
    constructor(readonly client: GoogleDriveClient, readonly rootId: string) { this.maxFileSizeBytes = client.maxFileBytes; }
    async getManifest(signal: AbortSignal): Promise<RemoteEntry[]> {
        signal.throwIfAborted();
        this.files.clear(); const inventory = this.inventorySnapshot ??= await this.client.inventory(this.rootId,signal);
        if (inventory.completeness === 'unstable') throw new SyncFault('inventory-unstable',inventory.diagnostics.filter(d=>d.severity==='error').map(d=>d.message).slice(0,3).join('; '),'source',true);
        // Artifacts use the separately guarded receiver, never the ordinary pull/canonical manifest.
        const eligible = inventory.items.filter(item=>item.file.mimeType === DRIVE_FOLDER || !item.file.mimeType.startsWith('application/vnd.google-apps.')&&!isDriveArtifactCandidate(item.file));
        const unsafeById=new Map(inventory.diagnostics.filter(d=>d.code==='unsafe-name').flatMap(d=>d.objectIds.map(id=>[id,d.message] as const)));
        const paths = new Map<string, typeof eligible[number]>();
        for (const item of eligible) {
            const unsafe=unsafeById.get(item.file.id);if(unsafe)throw new SyncFault('unsafe-name',unsafe,'source');
            const key=item.path.normalize('NFC').toLowerCase(), previous=paths.get(key);
            if (previous) throw new SyncFault('path-collision',`Drive path collision: ${item.path} (IDs ${previous.file.id}, ${item.file.id}; parents ${previous.parentId}, ${item.parentId})`,'source');
            paths.set(key,item);
        }
        const entries = eligible.filter(item => item.file.mimeType !== DRIVE_FOLDER).map(({path,file}) => {
            this.files.set(path,file);
            return {path,size:Number(file.size),hash:manifestHash(file),
                hashAlg:file.sha256Checksum ? 'sha256' as const : 'weak' as const,modified:file.modifiedTime ? Date.parse(file.modifiedTime) : undefined};
        });
        validateManifest(entries); return entries;
    }
    async getBrowseSnapshot(signal: AbortSignal): Promise<RemoteBrowseSnapshot> {
        signal.throwIfAborted();
        const inventory=this.inventorySnapshot??=await this.client.inventory(this.rootId,signal);
        const keys=new Map(inventory.items.map(item=>[item.file.id,JSON.stringify(['drive',item.parentId,item.file.id])]));
        const unsafe=new Map<string,string>(),ambiguous=new Map<string,string>(),blockedById=new Map<string,string>();
        const eligibleIds=new Set(inventory.items.filter(item=>item.file.mimeType===DRIVE_FOLDER||!item.file.mimeType.startsWith('application/vnd.google-apps.')).map(item=>item.file.id));
        for(const diagnostic of inventory.diagnostics){
            if(diagnostic.code==='unsafe-name')for(const id of diagnostic.objectIds)unsafe.set(id,diagnostic.message);
            if((diagnostic.code==='duplicate-name'||diagnostic.code==='target-alias')&&diagnostic.objectIds.filter(id=>eligibleIds.has(id)).length>1)for(const id of diagnostic.objectIds)ambiguous.set(id,diagnostic.message);
        }
        return {rootId:inventory.root.id,rootName:inventory.root.name,completeness:inventory.completeness,diagnostics:inventory.diagnostics,
            nodes:inventory.items.map(({path,file,parentId})=>{
                const unsupported=file.mimeType.startsWith('application/vnd.google-apps.')&&file.mimeType!==DRIVE_FOLDER;
                const artifact=readArtifactLineage(file),copyKind=isDriveArtifactCandidate(file)?artifact?'proposal' as const:file.properties?.vetsync_artifact!==undefined?'invalid' as const:'legacy' as const:undefined;
                const copyReason=copyKind==='proposal'?'Drive proposal: inherits its verified origin assignment during synchronization':copyKind==='legacy'?'Legacy conflict copy: automatic import is disabled':copyKind==='invalid'?'Invalid Drive artifact marker: automatic import is disabled':undefined;
                const blocked=inventory.completeness==='unstable'?'Drive observations are inconsistent':unsupported?'Google-native objects are not supported':unsafe.get(file.id)??ambiguous.get(file.id)??blockedById.get(parentId!)??copyReason;
                if(blocked)blockedById.set(file.id,blocked);
                return {key:keys.get(file.id)!,parentKey:parentId===inventory.root.id?'':keys.get(parentId!)!,parentId:parentId!,objectId:file.id,
                    name:file.name,path,kind:file.mimeType===DRIVE_FOLDER?'folder' as const:'file' as const,mimeType:file.mimeType,version:file.version,unsupported,
                    blocked,
                    copyKind,artifact:artifact&&{proposalId:artifact.proposalId,originId:artifact.originId,hash:artifact.hash,kind:artifact.kind},
                    entry:unsupported||file.mimeType===DRIVE_FOLDER?undefined:{path,size:Number(file.size),hash:manifestHash(file),hashAlg:file.sha256Checksum?'sha256' as const:'weak' as const}};
            })};
    }
    fetch(entry: RemoteEntry, signal: AbortSignal): Promise<ArrayBuffer> {
        const file = this.files.get(entry.path);
        if (!file||Number(file.size)!==entry.size||manifestHash(file)!==entry.hash) throw Error('Drive locator is stale');
        return this.client.download(file,signal);
    }
    async dispose(): Promise<void> { this.files.clear(); this.inventorySnapshot=undefined; }
}
