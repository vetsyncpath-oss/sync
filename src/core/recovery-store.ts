import { SyncFault } from './sync-issue';
import type { VaultAdapter } from '../sources/types';
import type { RecoveryRef } from './operation-store';
import { sha256Hex } from './hasher';
import { DirLock } from './dirlock';

/** Plugin-private content-addressed objects, verified before authorizing a commit.
 * FileSystem/Vault promises do not expose fsync or a power-loss durability guarantee. */
export class RecoveryStore {
        private readonly dirs = new DirLock();
        private chain: Promise<void> = Promise.resolve();
        constructor(private readonly vault: VaultAdapter, readonly root: string, private maxBytes = 512 * 1024 * 1024) {
                if (!root || root.startsWith('/') || root.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid recovery root');
        }
        setLimit(bytes:number):void{if(!Number.isSafeInteger(bytes)||bytes<1)throw Error('Invalid recovery budget');this.maxBytes=bytes;}
        async preflight(versions:readonly import('./local-version').LocalVersion[]):Promise<void>{
                const {used,limit}=await this.usage();let extra=0;const seen=new Set<string>();
                for(const version of versions)if(version.kind==='file'&&!seen.has(version.sha256)){
                        seen.add(version.sha256);if(!(await this.vault.exists(`${this.root}/${version.sha256}.bin`)))extra+=version.size;
                }
                if(used+extra>limit)throw new SyncFault('recovery-quota','Insufficient recovery capacity for this plan; originals retained','session');
        }
        async save(data: ArrayBuffer): Promise<RecoveryRef> {
                const sha256 = await sha256Hex(data), path = `${this.root}/${sha256}.bin`;
                const result = this.chain.then(async () => {
                        const ref = { path, sha256, size: data.byteLength };
                        if (await this.vault.exists(path)) { await this.verify(ref); return ref; }
                        await this.dirs.ensure(this.vault, path);
                        let used = 0;
                        if (!this.vault.list) throw new Error('Recovery storage listing is unavailable');
                        for (const existing of (await this.vault.list(this.root)).files) {
                                const stat = await this.vault.stat(existing); if (!stat || !Number.isSafeInteger(stat.size) || stat.size < 0) throw new Error('Recovery storage size is unavailable');
                                used += stat.size;
                        }
                        if (used + data.byteLength > this.maxBytes) throw new SyncFault('recovery-quota','Recovery storage budget exhausted; original retained','session');
                        await this.vault.writeBinary(path, data); await this.verify(ref); return ref;
                });
                this.chain = result.then(() => {}, () => {}); return result;
        }
        async verify(ref: RecoveryRef): Promise<void> {
                if (ref.path !== `${this.root}/${ref.sha256}.bin` || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new Error('Invalid recovery reference');
                const bytes = await this.vault.readBinary(ref.path);
                if (bytes.byteLength !== ref.size || await sha256Hex(bytes) !== ref.sha256) throw new Error('Recovery content verification failed');
        }
        async read(ref: RecoveryRef): Promise<ArrayBuffer> {
                await this.verify(ref);
                const data=await this.vault.readBinary(ref.path);
                if(data.byteLength!==ref.size || await sha256Hex(data)!==ref.sha256)throw Error('Recovery content changed');
                return data;
        }
        /** A legacy review may retain only a hash. Protect an existing object without claiming it is recoverable. */
        async existingReference(sha256:string):Promise<RecoveryRef|undefined>{
                if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('Invalid legacy recovery hash');
                const path=`${this.root}/${sha256}.bin`;if(!(await this.vault.exists(path)))return undefined;
                const stat=await this.vault.stat(path);if(!stat||stat.type==='folder'||!Number.isSafeInteger(stat.size)||stat.size<0)throw Error('Legacy recovery object size unavailable');
                return {path,sha256,size:stat.size};
        }
        async unreferencedUsage(references:readonly RecoveryRef[],before:number):Promise<{count:number;bytes:number}>{
                if(!this.vault.list)throw Error('Recovery storage listing unavailable');const keep=new Set(references.map(ref=>ref.path));let count=0,bytes=0;
                if(await this.vault.exists(this.root))for(const path of (await this.vault.list(this.root)).files){if(keep.has(path)||!new RegExp('^[a-f0-9]{64}\\.bin$').test(path.slice(this.root.length+1)))continue;const stat=await this.vault.stat(path);if(stat&&stat.mtime<before){count++;bytes+=stat.size;}}
                return {count,bytes};
        }
        async collectUnreferenced(references:readonly RecoveryRef[],before:number):Promise<number>{
                const work=this.chain.then(async()=>{
                        if(!this.vault.list)throw Error('Recovery storage listing unavailable');
                        const keep=new Set(references.map(ref=>ref.path));let removed=0;
                        if(await this.vault.exists(this.root))for(const path of (await this.vault.list(this.root)).files){
                                if(keep.has(path)||!new RegExp('^[a-f0-9]{64}\\.bin$').test(path.slice(this.root.length+1)))continue;
                                const stat=await this.vault.stat(path);if(!stat||stat.mtime>=before)continue;
                                await this.vault.remove(path);removed++;
                        }return removed;
                });this.chain=work.then(()=>{},()=>{});return work;
        }
        async usage():Promise<{used:number;limit:number}> {
                if(!this.vault.list)throw Error('Recovery storage listing unavailable');
                let used=0;
                if(await this.vault.exists(this.root))for(const path of (await this.vault.list(this.root)).files){
                        const stat=await this.vault.stat(path);if(!stat||!Number.isSafeInteger(stat.size)||stat.size<0)throw Error('Recovery storage size unavailable');used+=stat.size;
                }
                return {used,limit:this.maxBytes};
        }
}
