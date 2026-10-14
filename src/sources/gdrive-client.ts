// Small URL/query helpers adapted from hesprs/sync-engine, a795a46, under MIT.
// See licenses/sync-engine-MIT.txt and THIRD_PARTY_NOTICES.md.
import type { NetRequest, NetResponse, NetTransport } from './types';
import { googleJson,googleResponse } from '../auth/google-auth';
import { sleepInterruptible } from '../core/net';
import { SyncFault } from '../core/sync-issue';
import { sha256Hex } from '../core/hasher';
import { md5Hex } from '../core/md5';

export const DRIVE_FOLDER = 'application/vnd.google-apps.folder';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FIELDS = 'id,name,mimeType,parents,size,modifiedTime,version,headRevisionId,sha256Checksum,md5Checksum,trashed,driveId,capabilities(canEdit,canDownload,canTrash,canAddChildren)';
export interface DriveFile {
    id: string; name: string; mimeType: string; parents: string[]; size?: string; version: string;
    modifiedTime?: string; headRevisionId?: string; sha256Checksum?: string; md5Checksum?: string;
    trashed?: boolean; driveId?: string;
    capabilities?: { canEdit?: boolean; canDownload?: boolean; canTrash?: boolean; canAddChildren?: boolean };
}
export interface DriveItem { path: string; file: DriveFile }
export interface DriveUploadState { url: string; offset: number; size: number; fileId: string }
const escapeQuery = (value: string) => value.replaceAll('\\', String.raw`\\`).replaceAll("'", String.raw`\'`);
function buildUrl(base: string, path: string, query: Record<string, string> = {}): string {
    const url = new URL(base + path); for (const [key,value] of Object.entries(query)) url.searchParams.set(key,value); return url.href;
}
function parseFile(value: any): DriveFile {
    if (value && value.parents === undefined) value = { ...value, parents: [] };
    if (!value || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || typeof value.mimeType !== 'string'
        || !Array.isArray(value.parents) || value.parents.some((p:unknown) => typeof p !== 'string')
        || typeof value.version !== 'string' || !/^\d+$/.test(value.version)) throw new SyncFault('response-format','Invalid Drive file metadata','source');
    if (value.mimeType !== DRIVE_FOLDER && !value.mimeType.startsWith('application/vnd.google-apps.')
        && (typeof value.size !== 'string' || !/^\d+$/.test(value.size) || !Number.isSafeInteger(Number(value.size))))
        throw new SyncFault('response-format','Drive file size is missing or invalid','source');
    for (const [key,length] of [['sha256Checksum',64],['md5Checksum',32]] as const)
        if (value[key] !== undefined && !new RegExp(`^[a-fA-F0-9]{${length}}$`).test(value[key])) throw new SyncFault('response-format','Invalid Drive checksum','source');
    return value;
}
export class GoogleDriveClient {
    constructor(private readonly transport: NetTransport, readonly maxFileBytes = 64 * 1024 * 1024) {}
    inspect(id: string, signal: AbortSignal): Promise<DriveFile> {
        return googleJson(this.transport,buildUrl(API,`/files/${encodeURIComponent(id)}`,{fields:FIELDS,supportsAllDrives:'true'}),{signal}).then(parseFile);
    }
    async listChildren(id: string, signal: AbortSignal, driveId?: string): Promise<DriveFile[]> {
        const files: DriveFile[] = []; let token: string | undefined; const seen = new Set<string>();
        do {
            const query: Record<string,string> = { q:`'${escapeQuery(id)}' in parents and trashed=false`,pageSize:'1000',
                fields:`nextPageToken,incompleteSearch,files(${FIELDS})`,supportsAllDrives:'true',includeItemsFromAllDrives:'true',
                ...(driveId ? { corpora:'drive',driveId } : { corpora:'user' }) };
            if (token) query.pageToken = token;
            const data = await googleJson(this.transport,buildUrl(API,'/files',query),{signal,maxBytes:8 * 1024 * 1024});
            if (data.incompleteSearch || !Array.isArray(data.files)) throw new SyncFault('inventory-incomplete','Drive listing is incomplete','source');
            if(files.length+data.files.length>100_000)throw new SyncFault('inventory-incomplete','Drive folder exceeds the listing limit','source');
            files.push(...data.files.map(parseFile));
            token = data.nextPageToken;
            if (token !== undefined && (typeof token !== 'string' || seen.has(token) || seen.size >= 1000))
                throw new SyncFault('inventory-incomplete','Drive pagination is invalid or exceeds the limit','source');
            if (token) seen.add(token);
        } while (token);
        return files;
    }
    async inventory(rootId: string, signal: AbortSignal): Promise<{root:DriveFile;items:DriveItem[];excluded:number}> {
        const root = await this.inspect(rootId,signal);
        if (root.mimeType !== DRIVE_FOLDER || root.trashed) throw new SyncFault('root-unavailable','Selected Drive folder is unavailable','source');
        const items: DriveItem[] = [], paths = new Set<string>(), seen = new Set<string>([root.id]); let excluded = 0;
        const queue = [{id:root.id,path:''}];
        while (queue.length) {
            signal.throwIfAborted(); const folder = queue.shift()!;
            for (const file of await this.listChildren(folder.id,signal,root.driveId)) {
                const path = folder.path ? `${folder.path}/${file.name}` : file.name;
                if (!file.name || /[\\/\x00-\x1f]/.test(file.name) || file.name === '.' || file.name === '..')
                    throw new SyncFault('path-collision','Drive contains an unrepresentable file name','source');
                const canonical = path.normalize('NFC').toLowerCase();
                if (paths.has(canonical) || seen.has(file.id)) throw new SyncFault('path-collision',`Drive path collision: ${path}`,'source');
                paths.add(canonical); seen.add(file.id);
                if (seen.size > 100_000) throw new SyncFault('inventory-incomplete','Drive tree exceeds the traversal limit','source');
                if (file.mimeType.startsWith('application/vnd.google-apps.') && file.mimeType !== DRIVE_FOLDER) { excluded++; continue; }
                items.push({path,file}); if (file.mimeType === DRIVE_FOLDER) queue.push({id:file.id,path});
            }
        }
        return {root,items,excluded};
    }
    async download(file: DriveFile, signal: AbortSignal): Promise<ArrayBuffer> {
        if (file.capabilities?.canDownload === false || file.trashed) throw new SyncFault('access-denied','Drive file cannot be downloaded');
        const size = Number(file.size);
        if (size > this.maxFileBytes) throw new SyncFault('file-too-large','File exceeds the configured transfer limit');
        const response = await this.transport.fetch(buildUrl(API,`/files/${encodeURIComponent(file.id)}`,{alt:'media',supportsAllDrives:'true'}),
            {signal,maxBytes:this.maxFileBytes,redirect:'error'});
        if (response.status !== 200) { if(response.status>=400)await googleResponse(response,signal);response.discard?.();throw new SyncFault('download',`Drive download failed: HTTP ${response.status}`); }
        const bytes = await response.arrayBuffer(); signal.throwIfAborted();
        await this.verify(file,bytes);
        const after = await this.inspect(file.id,signal);
        if (after.version !== file.version || after.trashed) throw new SyncFault('source-changed','Drive file changed during download','file',true);
        return bytes;
    }
    async verify(file: DriveFile, bytes: ArrayBuffer): Promise<void> {
        if (bytes.byteLength !== Number(file.size) || file.sha256Checksum && await sha256Hex(bytes) !== file.sha256Checksum.toLowerCase()
            || file.md5Checksum && md5Hex(bytes) !== file.md5Checksum.toLowerCase()) throw new SyncFault('integrity','Drive content checksum mismatch','file',true);
    }
    async reserveId(signal: AbortSignal): Promise<string> {
        const data = await googleJson(this.transport,buildUrl(API,'/files/generateIds',{count:'1',space:'drive',type:'files'}),{signal});
        if (!Array.isArray(data.ids) || data.ids.length !== 1 || typeof data.ids[0] !== 'string') throw new SyncFault('response-format','Drive file ID was not returned','source');
        return data.ids[0];
    }
    async mkdir(id: string, name: string, parent: string, signal: AbortSignal): Promise<DriveFile> {
        return this.json('/files',{method:'POST',signal,body:JSON.stringify({id,name,parents:[parent],mimeType:DRIVE_FOLDER})});
    }
    async metadata(id: string, patch: object, signal: AbortSignal, query: Record<string,string> = {}): Promise<DriveFile> {
        return this.json(`/files/${encodeURIComponent(id)}`,{method:'PATCH',signal,body:JSON.stringify(patch)},query);
    }
    private async json(path: string, request: NetRequest, query: Record<string,string> = {}): Promise<DriveFile> {
        return parseFile(await googleJson(this.transport,buildUrl(API,path,{fields:FIELDS,supportsAllDrives:'true',...query}),
            {...request,headers:{'Content-Type':'application/json',...request.headers}}));
    }
    async upload(fileId: string, metadata: object, bytes: ArrayBuffer, create: boolean, signal: AbortSignal,
        persist: (state:DriveUploadState)=>Promise<void>, previous?:DriveUploadState): Promise<DriveFile> {
        if (bytes.byteLength > this.maxFileBytes) throw new SyncFault('file-too-large','File exceeds the configured transfer limit');
        const target = buildUrl(UPLOAD,create?'/files':`/files/${encodeURIComponent(fileId)}`,
            {uploadType:'resumable',fields:FIELDS,supportsAllDrives:'true',...(create?{}:{keepRevisionForever:'true'})});
        let state = previous;
        if (state && (state.size !== bytes.byteLength || state.fileId !== fileId||!Number.isSafeInteger(state.offset)||state.offset<0||state.offset>state.size)) throw new SyncFault('recovery-invalid','Upload snapshot changed','session');
        if(state){const url=new URL(state.url);if(url.origin!=='https://www.googleapis.com'||url.username||url.password||!url.pathname.startsWith('/upload/drive/v3/'))throw new SyncFault('recovery-invalid','Untrusted persisted upload session','session');}
        if (!state) {
            const start = await this.transport.fetch(target,{method:create?'POST':'PATCH',signal,redirect:'error',maxBytes:1024*1024,
                headers:{'Content-Type':'application/json','X-Upload-Content-Length':String(bytes.byteLength),'X-Upload-Content-Type':'application/octet-stream'},
                body:JSON.stringify(metadata)});
            const location=start.headers.location;if(start.status>=400)await googleResponse(start,signal);start.discard?.();
            if (start.status < 200 || start.status >= 300 || !location) throw new SyncFault('upload-session',`Drive upload initialization failed: HTTP ${start.status}`,'file',start.status===429||start.status>=500);
            const url = new URL(location);
            if (url.origin!=='https://www.googleapis.com' || !url.pathname.startsWith('/upload/drive/v3/')) throw new SyncFault('redirect-policy','Untrusted upload session','source');
            state={url:location,offset:0,size:bytes.byteLength,fileId};await persist({...state});
        }
        const acknowledged = (response: NetResponse) => {
            const range=response.headers.range;
            if (!range) return 0;
            const match=/^bytes=0-(\d+)$/.exec(range);
            if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1])>=bytes.byteLength) throw new SyncFault('response-format','Invalid upload acknowledgement','file');
            return Number(match[1])+1;
        };
        let probe = Boolean(previous), transient = 0, stalls = 0;
        while (true) {
            signal.throwIfAborted();
            const end=Math.min(state.offset+8*1024*1024,bytes.byteLength);
            const request:NetRequest={method:'PUT',signal,redirect:'error',maxBytes:1024*1024,
                headers:{'Content-Range':probe||bytes.byteLength===0?`bytes */${bytes.byteLength}`:`bytes ${state.offset}-${end-1}/${bytes.byteLength}`},
                body:probe?new Uint8Array(0):new Uint8Array(bytes,state.offset,end-state.offset)};
            let response:NetResponse;
            try {response=await this.transport.fetch(state.url,request);}
            catch (error) {signal.throwIfAborted();if(++transient>4||error instanceof SyncFault&&!error.retryable)throw error;await sleepInterruptible(1000*2**(transient-1),signal);probe=true;continue;}
            if (response.status===200 || response.status===201) {
                const file=parseFile(await googleResponse(response,signal));
                if(file.id!==fileId)throw new SyncFault('integrity','Drive returned a different upload target','file');
                await this.verify(file,bytes);return file;
            }
            if (response.status===308) {
                const offset=acknowledged(response);response.discard?.();
                if (offset===state.offset && ++stalls>4)throw new SyncFault('upload-incomplete','Drive upload stopped making progress','file',true);
                if (offset<state.offset)throw new SyncFault('upload-incomplete','Drive upload acknowledgement regressed','file',true);
                if(offset>state.offset)stalls=0;
                state={...state,offset};await persist({...state});probe=offset===bytes.byteLength;continue;
            }
            let failure:unknown;try{await googleResponse(response,signal);}catch(error){failure=error;}
            if(response.status===404)throw Object.assign(new SyncFault('upload-expired','Drive upload session expired','file',true),{status:404});
            if(failure instanceof SyncFault&&failure.retryable&&++transient<=4){
                const retryAt=(failure as SyncFault&{retryAt?:number}).retryAt,delay=Math.max(1000*2**(transient-1),(retryAt??0)-Date.now());
                if(delay>60_000)throw failure;await sleepInterruptible(delay,signal);probe=true;continue;
            }
            throw failure??new SyncFault('upload',`Drive upload failed: HTTP ${response.status}`);
        }
    }
}
