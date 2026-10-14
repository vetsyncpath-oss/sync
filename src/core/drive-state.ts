import type { FileSystem } from '../sources/types';
import { sha256Hex } from './hasher';
import type { DriveBaseline } from './drive-planner';
import type { DriveUploadState } from '../sources/gdrive-client';
import type { LocalVersion } from './local-version';
import type { RecoveryRef } from './operation-store';
import type { SyncPolicy } from './policy';
import { artifactProperties, type DriveArtifactLineage } from './drive-artifact';
import type { RecoveryStore } from './recovery-store';
export async function driveNamespace(subject:string,rootId:string,connectionId:string,policy:SyncPolicy):Promise<string>{
    if(!subject||!rootId||!connectionId)throw Error('Drive identity is incomplete');
    const rules=policy.fileRules??[],routes=rules.filter(r=>r.source===connectionId).map(r=>({scope:r.scope,path:r.path,names:r.names,remotePath:r.remotePath}));
    const isDefault=policy.defaultSource===connectionId&&!rules.some(r=>r.scope==='vault'&&!r.names&&r.source);
    const mapping=policy.folders.filter(r=>r.target).map(r=>({path:r.path,target:r.target}));
    return 'drive_'+await sha256Hex(new TextEncoder().encode(JSON.stringify({subject,rootId,connectionId,isDefault,routes,mapping})).buffer);
}
export interface DriveIntent {
    id:string; path:string; remotePath:string; kind:'upload'|'conflict'|'trash-local'|'trash-remote'|'delete-edit-local'|'delete-edit-remote';
    local:LocalVersion; remoteId?:string; remoteVersion?:string; remoteHash?:string; bytes?:RecoveryRef;
    uploadId?:string; upload?:DriveUploadState; copyPath?:string; copyRemotePath?:string; copyId?:string;
    copyUpload?:DriveUploadState; copyBytes?:RecoveryRef; copyLocal?:LocalVersion; step?:string; historyPath?:string; directories?:Record<string,string>;
    reviewRequired?:boolean;
    /** Publication identity is separate from this attempt's local mutation IDs. */
    proposalId?:string;
}
export interface DriveReview { copyPath:string;copyId:string;hash:string }
export interface DriveProposal extends DriveArtifactLineage {
    id:string; key?:string; path:string; remotePath:string; copyPath:string; copyRemotePath:string; copyId?:string;
    payload?:RecoveryRef; portable:boolean; status:'prepared'|'published'|'converged'; needsReview:boolean;
}
export interface DriveArtifactReceipt {
    id:string; proposalId:string; originId:string; path:string; originPath:string; remotePath:string;
    hash:string; remoteVersion:string; issue?:string; localHash?:string;
}
interface LegacyDriveState { version:1; sequence:number; baseline:Record<string,DriveBaseline>; pending:Record<string,DriveIntent>;reviews?:Record<string,DriveReview> }
export interface DriveState extends Omit<LegacyDriveState,'version'> { version:2; proposals:Record<string,DriveProposal>;artifacts:Record<string,DriveArtifactReceipt> }
const hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validRef=(v:unknown):v is RecoveryRef=>object(v)&&text(v.path)&&hex(v.sha256)&&Number.isSafeInteger(v.size)&&v.size>=0;
const localVersion=(v:unknown):v is LocalVersion=>object(v)&&(v.kind==='missing'||v.kind==='file'&&hex(v.sha256)&&Number.isSafeInteger(v.size)&&v.size>=0);
export const ownEntry = <T>(record:Record<string,T>|undefined,key:string):T|undefined =>
    record&&Object.prototype.hasOwnProperty.call(record,key)?record[key]:undefined;
function dictionaries(state:DriveState):DriveState {
    state.baseline=Object.assign(Object.create(null),state.baseline);
    state.pending=Object.assign(Object.create(null),state.pending);
    if(state.reviews)state.reviews=Object.assign(Object.create(null),state.reviews);
    state.proposals=Object.assign(Object.create(null),state.proposals);
    state.artifacts=Object.assign(Object.create(null),state.artifacts);
    return state;
}
function validate(value:any):asserts value is DriveState|LegacyDriveState {
    if(!value||![1,2].includes(value.version)||!Number.isSafeInteger(value.sequence)||value.sequence<1||!value.baseline||!value.pending
        ||typeof value.baseline!=='object'||typeof value.pending!=='object'||Array.isArray(value.baseline)||Array.isArray(value.pending))throw Error('Invalid Drive checkpoint');
    for(const [path,b] of Object.entries(value.baseline) as [string,DriveBaseline][])if(!path||!object(b)||!hex(b.localHash)||!hex(b.remoteHash)||!text(b.remoteId)||!text(b.remoteVersion)||!text(b.remotePath))throw Error('Invalid Drive baseline');
    for(const [path,p] of Object.entries(value.pending) as [string,DriveIntent][]){
        if(!path||!object(p)||p.path!==path||!text(p.id)||!text(p.remotePath)||!['upload','conflict','trash-local','trash-remote','delete-edit-local','delete-edit-remote'].includes(p.kind)||!localVersion(p.local))throw Error('Invalid Drive recovery intent');
        for(const key of ['remoteId','remoteVersion','remoteHash','uploadId','copyPath','copyRemotePath','copyId','step','historyPath','proposalId'] as const)if(p[key]!==undefined&&!text(p[key]))throw Error('Invalid Drive recovery locator');
        for(const key of ['bytes','copyBytes'] as const)if(p[key]!==undefined&&!validRef(p[key]))throw Error('Invalid Drive recovery payload');
        if(p.copyLocal!==undefined&&!localVersion(p.copyLocal)||p.reviewRequired!==undefined&&typeof p.reviewRequired!=='boolean')throw Error('Invalid Drive recovery precondition');
        if(p.directories!==undefined&&(!object(p.directories)||Object.values(p.directories).some(id=>!text(id))))throw Error('Invalid Drive directory reservations');
        for(const upload of [p.upload,p.copyUpload])if(upload!==undefined&&(!object(upload)||!text(upload.url)||!text(upload.fileId)||!Number.isSafeInteger(upload.size)||upload.size<0||!Number.isSafeInteger(upload.offset)||upload.offset<0||upload.offset>upload.size))throw Error('Invalid Drive upload session');
    }
    if(value.reviews!==undefined){if(!value.reviews||typeof value.reviews!=='object'||Array.isArray(value.reviews))throw Error('Invalid Drive review state');
        for(const r of Object.values(value.reviews) as DriveReview[])if(!object(r)||!text(r.copyPath)||!text(r.copyId)||!hex(r.hash))throw Error('Invalid Drive review entry');}
    if(value.version===2){
        for(const key of ['proposals','artifacts'])if(!value[key]||typeof value[key]!=='object'||Array.isArray(value[key]))throw Error('Invalid Drive proposal state');
        const keys=new Set<string>();
        for(const [id,p] of Object.entries(value.proposals) as [string,DriveProposal][]){
            if(!object(p)||id!==p.id||id!==p.proposalId||![p.path,p.remotePath,p.copyPath,p.copyRemotePath,p.originId,p.baseVersion].every(text)
                ||!hex(p.hash)||!hex(p.baseHash)||typeof p.portable!=='boolean'||typeof p.needsReview!=='boolean'
                ||!['conflict','gated-upload','delete-edit-local','delete-edit-remote'].includes(p.kind)||!['prepared','published','converged'].includes(p.status)
                ||p.key!==undefined&&(!hex(p.key)||keys.has(p.key))||p.status!=='prepared'&&!p.copyId)throw Error('Invalid Drive proposal');
            if(p.key)keys.add(p.key);
            if(p.portable)artifactProperties(p);
            if(p.portable&&!p.payload||p.payload!==undefined&&(!validRef(p.payload)||p.payload.sha256!==p.hash))throw Error('Invalid Drive proposal payload');
        }
        for(const p of Object.values(value.pending) as DriveIntent[])if(p.proposalId){
            const proposal=ownEntry<DriveProposal>(value.proposals,p.proposalId);
            if(!proposal||p.path!==proposal.path||p.remotePath!==proposal.remotePath||p.remoteId!==proposal.originId
                ||p.copyPath!==proposal.copyPath||p.copyRemotePath!==proposal.copyRemotePath||p.copyBytes?.sha256!==proposal.hash
                ||p.copyId!==proposal.copyId)throw Error('Missing or inconsistent Drive proposal for recovery intent');
        }
        for(const [id,a] of Object.entries(value.artifacts) as [string,DriveArtifactReceipt][])if(!object(a)||a.id!==id||![a.path,a.originPath,a.remotePath,a.proposalId,a.originId,a.remoteVersion].every(text)||!hex(a.hash)
            ||a.localHash!==undefined&&!hex(a.localHash)||a.issue!==undefined&&typeof a.issue!=='string')throw Error('Invalid Drive artifact receipt');
    }
}
/** Deterministic import, without reserving new remote IDs or replacing resumable state. */
async function upgrade(state:LegacyDriveState|DriveState):Promise<DriveState>{
    if(state.version===2)return dictionaries(state);
    const next=dictionaries({...state,version:2,proposals:{},artifacts:{}});
    for(const intent of Object.values(next.pending))if(intent.copyPath&&intent.copyRemotePath&&intent.copyBytes&&intent.remoteId&&intent.remoteVersion){
        intent.proposalId=intent.id;
        next.proposals[intent.id]={id:intent.id,proposalId:intent.id,path:intent.path,remotePath:intent.remotePath,
            copyPath:intent.copyPath,copyRemotePath:intent.copyRemotePath,copyId:intent.copyId,payload:intent.copyBytes,
            originId:intent.remoteId,baseVersion:intent.remoteVersion,baseHash:intent.remoteHash??ownEntry(next.baseline,intent.path)?.remoteHash??intent.copyBytes.sha256,
            hash:intent.copyBytes.sha256,kind:intent.kind==='conflict'?(intent.reviewRequired?'gated-upload':'conflict'):intent.kind==='delete-edit-remote'?'delete-edit-remote':'delete-edit-local',
            portable:false,status:'prepared',needsReview:!!intent.reviewRequired};
    }
    const importedCopies=new Set(Object.values(next.proposals).flatMap(p=>p.copyId?[p.copyId]:[]));
    for(const [path,r] of Object.entries(next.reviews??{})){
        if(importedCopies.has(r.copyId))continue;
        const base=ownEntry(next.baseline,path);
        // Older reviews may outlive their baseline. Keep them as legacy history, never infer an executable origin.
        const id='legacy-'+await sha256Hex(new TextEncoder().encode(JSON.stringify([path,r.copyId,r.copyPath])).buffer);
        next.proposals[id]={id,proposalId:id,path,remotePath:base?.remotePath??path,copyPath:r.copyPath,copyRemotePath:r.copyPath,copyId:r.copyId,
            originId:base?.remoteId??'legacy-unknown',baseVersion:base?.remoteVersion??'0',baseHash:base?.remoteHash??r.hash,hash:r.hash,
            kind:'gated-upload',portable:false,status:'published',needsReview:true};
    }
    return next;
}
/** Immutable, verified generations. Never silently reset a corrupt or foreign checkpoint. */
export class DriveStateStore {
    private state:DriveState=dictionaries({version:2,sequence:0,baseline:{},pending:{},proposals:{},artifacts:{}});
    private loaded=false;
    private chain:Promise<void>=Promise.resolve();
    private cleanupError?:string;
    get cleanupProblem():string|undefined{return this.cleanupError;}
    private readonly prefix:string;
    private proposalPaths=new Map<string,string[]>();private proposalKeys=new Map<string,string>();
    private proposalTotal=0;
    get proposalCount():number{if(!this.loaded)throw Error('Drive state not loaded');return this.proposalTotal;}
    private legacyBackedUp=false;
    private writerFenced=false;
    constructor(private readonly fs:FileSystem,readonly namespace:string,readonly maxProposals=10_000){if(!/^[\w-]+$/.test(namespace))throw Error('Invalid Drive namespace');
        if(!Number.isSafeInteger(maxProposals)||maxProposals<1)throw Error('Invalid Drive proposal limit');this.prefix=`drive-state-${namespace}-`;}
    private names(names:string[]):string[]{return names.filter(n=>n.startsWith(this.prefix)&&/^\d{16}\.json$/.test(n.slice(this.prefix.length))).sort();}
    private async decode(raw:string):Promise<DriveState|LegacyDriveState>{const envelope=JSON.parse(raw);
        if(typeof envelope.payload!=='string'||!hex(envelope.sha256)||await sha256Hex(new TextEncoder().encode(envelope.payload).buffer)!==envelope.sha256)throw Error('Drive checkpoint checksum mismatch');
        const state=JSON.parse(envelope.payload);validate(state);return state;}
    private async readRaw(name:string):Promise<DriveState|LegacyDriveState>{const raw=await this.fs.read(name);if(raw===null)throw Error('Drive checkpoint missing');
        const state=await this.decode(raw);if(name!==this.filename(state.sequence))throw Error('Drive checkpoint generation mismatch');return state;}
    private async read(name:string):Promise<DriveState>{return upgrade(await this.readRaw(name));}
    private filename(sequence:number):string{return this.prefix+String(sequence).padStart(16,'0')+'.json';}
    private index():void{this.proposalPaths.clear();this.proposalKeys.clear();this.proposalTotal=0;for(const p of Object.values(this.state.proposals)){
        this.proposalTotal++;
        const ids=this.proposalPaths.get(p.path)??[];ids.push(p.id);this.proposalPaths.set(p.path,ids);if(p.key)this.proposalKeys.set(p.key,p.id);
    }}
    async load():Promise<void>{if(this.loaded)return;const names=this.names(await this.fs.list()),backups=await this.backupStates();
        if(!names.length&&backups.length)throw Error('Drive active checkpoint is missing; migration backup retained, empty-history writes are blocked');
        if(backups.length){const covered=new Map(backups.map(state=>[state.sequence,JSON.stringify(state)]));
            for(const name of names){const state=await this.readRaw(name);if(state.version===1&&covered.get(state.sequence)!==JSON.stringify(state))
                throw Error('Drive migration backup does not cover a retained v1 generation; legacy writer advanced, verified reconciliation is required before effects');}}
        this.legacyBackedUp=backups.length>0;
        if(names.length){const raw=await this.readRaw(names.at(-1)!);this.writerFenced=raw.version===2;this.state=await upgrade(raw);}this.index();this.loaded=true;}
    /** Publish the version fence before any new effect, including resume of an already reserved legacy intent. */
    async ensureWriterVersion():Promise<void>{if(!this.loaded)throw Error('Drive state not loaded');if(!this.writerFenced)await this.save(()=>{});}
    snapshot():DriveState{if(!this.loaded)throw Error('Drive state not loaded');return dictionaries(structuredClone(this.state));}
    private entry<T>(record:Record<string,T>|undefined,path:string):T|undefined{if(!this.loaded)throw Error('Drive state not loaded');const value=ownEntry(record,path);return value===undefined?undefined:structuredClone(value);}
    baseline(path:string):DriveBaseline|undefined{return this.entry(this.state.baseline,path);}
    pending(path:string):DriveIntent|undefined{return this.entry(this.state.pending,path);}
    review(path:string):DriveReview|undefined{return this.entry(this.state.reviews,path);}
    proposal(id:string):DriveProposal|undefined{return this.entry(this.state.proposals,id);}
    matchingProposal(key:string):DriveProposal|undefined{const id=this.proposalKeys.get(key);return id?this.proposal(id):undefined;}
    proposals(path:string):DriveProposal[]{if(!this.loaded)throw Error('Drive state not loaded');return (this.proposalPaths.get(path)??[]).map(id=>this.proposal(id)!);}
    artifact(id:string):DriveArtifactReceipt|undefined{return this.entry(this.state.artifacts,id);}
    artifacts():DriveArtifactReceipt[]{if(!this.loaded)throw Error('Drive state not loaded');return Object.values(this.state.artifacts).map(a=>structuredClone(a));}
    paths():string[]{if(!this.loaded)throw Error('Drive state not loaded');return [...new Set([...Object.keys(this.state.baseline),...Object.keys(this.state.pending),...Object.keys(this.state.reviews??{}),...this.proposalPaths.keys()])];}
    private backupName():string{return this.prefix+'v1-backup.json';}
    private async backupStates():Promise<(DriveState|LegacyDriveState)[]>{const raw=await this.fs.read(this.backupName());if(raw===null)return [];
        const envelope=JSON.parse(raw);if(typeof envelope.payload!=='string'||!hex(envelope.sha256)||await sha256Hex(new TextEncoder().encode(envelope.payload).buffer)!==envelope.sha256)throw Error('Drive migration backup checksum mismatch');
        const backup=JSON.parse(envelope.payload);if(backup.version!==1||backup.namespace!==this.namespace||!Array.isArray(backup.checkpoints)||!backup.checkpoints.length)throw Error('Invalid Drive migration backup');
        const states:(DriveState|LegacyDriveState)[]=[];
        for(const item of backup.checkpoints){if(!item||typeof item.name!=='string'||typeof item.json!=='string')throw Error('Invalid Drive migration backup');const state=await this.decode(item.json);
            if(state.version!==1||item.name!==this.filename(state.sequence))throw Error('Invalid Drive migration backup generation');states.push(state);}
        return states;
    }
    private async backupLegacy():Promise<void>{if(this.legacyBackedUp)return;if(await this.fs.exists(this.backupName())){await this.backupStates();this.legacyBackedUp=true;return;}
        const checkpoints:{name:string;json:string}[]=[];
        for(const name of this.names(await this.fs.list()))if((await this.readRaw(name)).version===1)checkpoints.push({name,json:(await this.fs.read(name))!});
        if(!checkpoints.length){this.legacyBackedUp=true;return;}
        const payload=JSON.stringify({version:1,namespace:this.namespace,checkpoints}),json=JSON.stringify({payload,sha256:await sha256Hex(new TextEncoder().encode(payload).buffer)}),temp=this.backupName()+'.tmp';
        await this.fs.write(temp,json);if(await this.fs.read(temp)!==json)throw Error('Drive migration backup write failed');await this.fs.rename(temp,this.backupName());await this.backupStates();this.legacyBackedUp=true;
    }
    async recoveryReferences(legacyHashes?:Set<string>):Promise<RecoveryRef[]>{const refs:RecoveryRef[]=[];for(const name of this.names(await this.fs.list())){
        const state=await this.read(name);for(const intent of Object.values(state.pending))for(const ref of [intent.bytes,intent.copyBytes])if(ref)refs.push(ref);
        for(const proposal of Object.values(state.proposals))if(proposal.payload)refs.push(proposal.payload);else if(!proposal.portable)legacyHashes?.add(proposal.hash);
    }for(const state of await this.backupStates()){
        for(const intent of Object.values(state.pending))for(const ref of [intent.bytes,intent.copyBytes])if(ref)refs.push(ref);
        for(const review of Object.values(state.reviews??{}))legacyHashes?.add(review.hash);
    }return refs;}
    save(update:(state:DriveState)=>void):Promise<void>{const work=this.chain.then(()=>this.publish(update));this.chain=work.then(()=>{},()=>{});return work;}
    private async publish(update:(state:DriveState)=>void):Promise<void>{if(!this.loaded)throw Error('Drive state not loaded');
        await this.backupLegacy();
        if(this.names(await this.fs.list()).length>=4)await this.cleanup();
        const next=dictionaries(structuredClone(this.state));next.sequence++;update(next);validate(next);
        const payload=JSON.stringify(next),json=JSON.stringify({payload,sha256:await sha256Hex(new TextEncoder().encode(payload).buffer)}),name=this.filename(next.sequence);
        if(await this.fs.exists(name))throw Error('Drive state concurrent writer detected');
        const temp=name+'.tmp';await this.fs.write(temp,json);if(await this.fs.read(temp)!==json)throw Error('Drive checkpoint write failed');
        await this.fs.rename(temp,name);const verified=await this.read(name);this.state=verified;this.writerFenced=true;this.index();
        // Retain two authoritative generations. Cleanup failure is visible and retried next publication.
        this.cleanupError=undefined;
        try {await this.cleanup();}
        catch(error){this.cleanupError='Old Drive checkpoints could not be cleaned; metadata retained';console.warn('[VaultSync] Drive checkpoint cleanup deferred',error);}
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
export async function driveRecoveryReferences(fs:FileSystem,recovery?:Pick<RecoveryStore,'existingReference'>):Promise<RecoveryRef[]>{
    const names=await fs.list(),namespaces=new Set<string>();
    for(const name of names){const match=/^drive-state-([\w-]+)-(?:\d{16}|v1-backup)\.json$/.exec(name);if(match)namespaces.add(match[1]);}
    const refs:RecoveryRef[]=[],legacyHashes=new Set<string>();
    for(const namespace of namespaces){const store=new DriveStateStore(fs,namespace);
        refs.push(...await store.recoveryReferences(legacyHashes));
    }if(recovery)for(const hash of legacyHashes){const ref=await recovery.existingReference(hash);if(ref)refs.push(ref);}return refs;
}
