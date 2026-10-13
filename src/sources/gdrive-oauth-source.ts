import type { RemoteEntry, SyncSource } from './types';
import { GoogleDriveClient, DRIVE_FOLDER, type DriveFile } from './gdrive-client';
export class GDriveOAuthSource implements SyncSource {
    readonly kind = 'gdrive' as const;
    readonly deletionSafety = 'unverified' as const;
    readonly maxFileSizeBytes: number;
    private readonly files = new Map<string, DriveFile>();
    inventorySnapshot?: Awaited<ReturnType<GoogleDriveClient['inventory']>>;
    constructor(readonly client: GoogleDriveClient, readonly rootId: string) { this.maxFileSizeBytes = client.maxFileBytes; }
    async getManifest(signal: AbortSignal): Promise<RemoteEntry[]> {
        this.files.clear(); const inventory = this.inventorySnapshot ??= await this.client.inventory(this.rootId,signal);
        return inventory.items.filter(item => item.file.mimeType !== DRIVE_FOLDER).map(({path,file}) => {
            this.files.set(path,file);
            return {path,size:Number(file.size),hash:file.sha256Checksum?.toLowerCase() ?? `gdrive:${file.md5Checksum ?? file.version}`,
                hashAlg:file.sha256Checksum ? 'sha256' as const : 'weak' as const,modified:file.modifiedTime ? Date.parse(file.modifiedTime) : undefined};
        });
    }
    fetch(entry: RemoteEntry, signal: AbortSignal): Promise<ArrayBuffer> {
        const file = this.files.get(entry.path);
        if (!file||Number(file.size)!==entry.size||(file.sha256Checksum?.toLowerCase()??`gdrive:${file.md5Checksum??file.version}`)!==entry.hash) throw Error('Drive locator is stale');
        return this.client.download(file,signal);
    }
    async dispose(): Promise<void> { this.files.clear(); }
}
