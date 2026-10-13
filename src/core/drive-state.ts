import type { FileSystem } from '../sources/types';
import { sha256Hex } from './hasher';
import type { DriveBaseline } from './drive-planner';
import type { DriveUploadState } from '../sources/gdrive-client';
import type { LocalVersion } from './local-version';
import type { RecoveryRef } from './operation-store';
export interface DriveIntent {
    id:string; path:string; remotePath:string; kind:'upload'|'conflict'|'trash-local'|'trash-remote'|'delete-edit-local'|'delete-edit-remote';
    local:LocalVersion; remoteId?:string; remoteVersion?:string; remoteHash?:string; bytes?:RecoveryRef;
    uploadId?:string; upload?:DriveUploadState; copyPath?:string; copyRemotePath?:string; copyId?:string;
    copyUpload?:DriveUploadState; copyBytes?:RecoveryRef; copyLocal?:LocalVersion; step?:string; historyPath?:string; directories?:Record<string,string>;
    reviewRequired?:boolean;
}
export interface DriveReview { copyPath:string;copyId:string;hash:string }
export interface DriveState { version:1; sequence:number; baseline:Record<string,DriveBaseline>; pending:Record<string,DriveIntent>;reviews?:Record<string,DriveReview> }
const hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function validate(value:any):asserts value is DriveState {
    if(!value||value.version!==1||!Number.isSafeInteger(value.sequence)||value.sequence<1||!value.baseline||!value.pending
        ||typeof value.baseline!=='object'||typeof value.pending!=='object'||Array.isArray(value.baseline)||Array.isArray(value.pending))throw Error('Invalid Drive checkpoint');
    for(const [path,b] of Object.entries(value.baseline) as [string,DriveBaseline][])if(!path||!hex(b.localHash)||!hex(b.remoteHash)||!b.remoteId||!b.remoteVersion||!b.remotePath)throw Error('Invalid Drive baseline');
    for(const [path,p] of Object.entries(value.pending) as [string,DriveIntent][])if(!path||p.path!==path||!p.id||!p.remotePath||!['upload','conflict','trash-local','trash-remote','delete-edit-local','delete-edit-remote'].includes(p.kind)||!p.local||!['file','missing'].includes(p.local.kind)
        ||p.local.kind==='file'&&(!hex(p.local.sha256)||!Number.isSafeInteger(p.local.size)||p.local.size<0))throw Error('Invalid Drive recovery intent');
    if(value.reviews!==undefined){if(!value.reviews||typeof value.reviews!=='object'||Array.isArray(value.reviews))throw Error('Invalid Drive review state');
        for(const r of Object.values(value.reviews) as DriveReview[])if(!r.copyPath||!r.copyId||!hex(r.hash))throw Error('Invalid Drive review entry');}
}
/** Immutable, verified generations. Never silently reset a corrupt or foreign checkpoint. */
export class DriveStateStore {
    private state:DriveState={version:1,sequence:0,baseline:{},pending:{}};
    private loaded=false;
    private chain:Promise<void>=Promise.resolve();
    private readonly prefix:string;
    constructor(private readonly fs:FileSystem,readonly namespace:string){if(!/^[\w-]+$/.test(namespace))throw Error('Invalid Drive namespace');this.prefix=`drive-state-${namespace}-`;}
    private names(names:string[]):string[]{return names.filter(n=>n.startsWith(this.prefix)&&/^\d{16}\.json$/.test(n.slice(this.prefix.length))).sort();}
    private async read(name:string):Promise<DriveState>{const raw=await this.fs.read(name);if(raw===null)throw Error('Drive checkpoint missing');const envelope=JSON.parse(raw);
        if(typeof envelope.payload!=='string'||!hex(envelope.sha256)||await sha256Hex(new TextEncoder().encode(envelope.payload).buffer)!==envelope.sha256)throw Error('Drive checkpoint checksum mismatch');
        const state=JSON.parse(envelope.payload);validate(state);if(name!==this.filename(state.sequence))throw Error('Drive checkpoint generation mismatch');return state;}
    private filename(sequence:number):string{return this.prefix+String(sequence).padStart(16,'0')+'.json';}
    async load():Promise<void>{if(this.loaded)return;const names=this.names(await this.fs.list());if(names.length)this.state=await this.read(names.at(-1)!);this.loaded=true;}
    snapshot():DriveState{if(!this.loaded)throw Error('Drive state not loaded');return structuredClone(this.state);}
    async recoveryReferences():Promise<RecoveryRef[]>{const refs:RecoveryRef[]=[];for(const name of this.names(await this.fs.list())){
        const state=await this.read(name);for(const intent of Object.values(state.pending))for(const ref of [intent.bytes,intent.copyBytes])if(ref)refs.push(ref);
    }return refs;}
    save(update:(state:DriveState)=>void):Promise<void>{const work=this.chain.then(()=>this.publish(update));this.chain=work.then(()=>{},()=>{});return work;}
    private async publish(update:(state:DriveState)=>void):Promise<void>{if(!this.loaded)throw Error('Drive state not loaded');
        if(this.names(await this.fs.list()).length>=4)await this.cleanup();
        const next=structuredClone(this.state);next.sequence++;update(next);validate(next);
        const payload=JSON.stringify(next),json=JSON.stringify({payload,sha256:await sha256Hex(new TextEncoder().encode(payload).buffer)}),name=this.filename(next.sequence);
        if(await this.fs.exists(name))throw Error('Drive state concurrent writer detected');
        const temp=name+'.tmp';await this.fs.write(temp,json);if(await this.fs.read(temp)!==json)throw Error('Drive checkpoint write failed');
        await this.fs.rename(temp,name);const verified=await this.read(name);this.state=verified;
        // Retain two authoritative generations. Cleanup failure is visible and retried next publication.
        try {await this.cleanup();}
        catch(error){console.warn('[VaultSync] Drive checkpoint cleanup deferred',error);}
    }
    private async cleanup():Promise<void>{
        const names=this.names(await this.fs.list());if(names.length<3)return;
        if(names.at(-1)!!==this.filename(this.state.sequence))throw Error('Drive checkpoint cleanup blocked by a concurrent generation');
        await this.read(names.at(-1)!);await this.read(names.at(-2)!);
        try{for(const old of names.slice(0,-2)){await this.read(old);await this.fs.remove(old);}}
        catch{throw Error('Drive checkpoint cleanup must complete before adding another generation');}
    }
}
/** Include all retained generations: an interrupted journal cleanup must not remove a resumable payload. */
export async function driveRecoveryReferences(fs:FileSystem):Promise<RecoveryRef[]>{
    const names=await fs.list(),namespaces=new Set<string>();
    for(const name of names){const match=/^drive-state-([\w-]+)-\d{16}\.json$/.exec(name);if(match)namespaces.add(match[1]);}
    const refs:RecoveryRef[]=[];
    for(const namespace of namespaces){const store=new DriveStateStore(fs,namespace);await store.load();
        refs.push(...await store.recoveryReferences());
    }return refs;
}
