import type { RemoteEntry, SyncSource } from './types';
import { resolveFileRule, type FileRule } from '../core/file-rules';
import { validateManifest } from '../core/source-validation';
import { sourceCandidates } from '../core/source-bindings';
import { sha256Hex } from '../core/hasher';
import type { FolderPolicy } from '../core/policy';
export interface RoutedMember { id: string; name: string; source: SyncSource }
/** All selected inventories succeed before any writes. Source instances belong to this session only. */
export class RoutedSource implements SyncSource {
    readonly sources: readonly {id:string;name:string;kind:string}[];
    readonly kind: SyncSource['kind'];
    readonly maxConcurrentDownloads:number;
    readonly deletionSafety: 'immutable' | 'unverified';
    private readonly locators = new Map<string,{member:RoutedMember;entry:RemoteEntry;exposedPath:string}>();
    constructor(private readonly members: RoutedMember[], private readonly rules: readonly FileRule[],
        private readonly localPath: (path:string)=>string = p=>p, private readonly defaultSource='primary', private readonly selectedIds?: readonly string[]) {
        if (!members.length || new Set(members.map(m=>m.id)).size!==members.length) throw new Error('Invalid source connections');
        for(const rule of rules)if(rule.source&&!members.some(m=>m.id===rule.source))throw Error('Missing assigned source');
        const active=members.filter(m=>!selectedIds || selectedIds.includes(m.id));
        if(!active.length || selectedIds?.some(id=>!members.some(m=>m.id===id)))throw Error('No assigned source selected');
        this.kind=active[0].source.kind;
        this.sources=active.map(m=>({id:m.id,name:m.name,kind:m.source.kind}));
        this.maxConcurrentDownloads=Math.min(...active.map(m=>m.source.maxConcurrentDownloads??Infinity));
        this.deletionSafety=active.every(m=>m.source.deletionSafety==='immutable')?'immutable':'unverified';
    }
    private async inventories(signal:AbortSignal) {
        this.locators.clear();const result: {member:RoutedMember;entries:RemoteEntry[]}[]=[];
        for (const member of this.members) {
            if(this.selectedIds && !this.selectedIds.includes(member.id))continue;
            signal.throwIfAborted();
            try {const entries=await member.source.getManifest(signal);validateManifest(entries);result.push({member,entries});}
            catch(error){if(signal.aborted||(error as Error)?.name==='AbortError')throw error;throw Object.assign(new Error(member.name+': '+(error instanceof Error?error.message:String(error))),{cause:error});}
        }
        return result;
    }
    async getManifest(signal:AbortSignal):Promise<RemoteEntry[]> {
        const inventories=await this.inventories(signal);const output:RemoteEntry[]=[];
        for (const {member,entries} of inventories) for (const entry of entries) {
            for(const path of sourceCandidates(entry.path,member.id,this.rules,this.defaultSource,this.localPath)) {
                const canonical=path.normalize('NFC').toLowerCase();
                if (this.locators.has(canonical)) throw new Error(`Source path collision: ${path}`);
                this.locators.set(canonical,{member,entry:{...entry},exposedPath:path});
                output.push({...entry,path,sourcePath:entry.path,provider:member.name,connectionId:member.id,resolvedDestination:resolveFileRule(path,this.rules).remotePath!==undefined});
            }
        }
        validateManifest(output);return output;
    }
    /** Tree inspection includes available paths before assignment, never populates execution locators. */
    async previewManifest(signal:AbortSignal):Promise<RemoteEntry[]> {
        const inventory=await this.inventories(signal), visible=new Map<string,RemoteEntry>();
        for (const {member,entries} of inventory) for (const e of entries) {
            const existing=visible.get(e.path);
            visible.set(e.path,{...e,provider:existing?.provider ? `${existing.provider}, ${member.name}` : member.name});
        }
        return [...visible.values()];
    }
    async fetch(entry:RemoteEntry,signal:AbortSignal):Promise<ArrayBuffer> {
        const found=this.locators.get(entry.path.normalize('NFC').toLowerCase());
        if (!found || found.exposedPath!==entry.path || found.entry.hash!==entry.hash || found.entry.hashAlg!==entry.hashAlg
            || found.entry.size!==entry.size) throw new Error(`Stale source locator: ${entry.path}`);
        if (found.member.source.maxFileSizeBytes!==undefined && entry.size>found.member.source.maxFileSizeBytes) throw new Error('Source file size limit exceeded');
        return found.member.source.fetch({...found.entry},signal);
    }
    async dispose():Promise<void> {
        this.locators.clear();const results=await Promise.allSettled(this.members.map(m=>m.source.dispose?.()));
        const error=results.find(r=>r.status==='rejected');if(error?.status==='rejected')throw error.reason;
    }
}
/** Credentials must be removed by callers. Routing changes isolate ownership, cache and failed queues. */
export async function routedNamespace(identity:unknown, rules:readonly FileRule[], folders:readonly FolderPolicy[]):Promise<string> {
    const routes=rules.filter(r=>r.source!==undefined).map(r=>({scope:r.scope,path:r.path,names:r.names,source:r.source,remotePath:r.remotePath}));
    const mapping=folders.filter(rule=>rule.target).map(rule=>({path:rule.path,target:rule.target}));
    return 'routes_'+await sha256Hex(new TextEncoder().encode(JSON.stringify({identity,routes,mapping})).buffer);
}
