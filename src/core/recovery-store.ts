import type { VaultAdapter } from '../sources/types';
import type { RecoveryRef } from './operation-store';
import { sha256Hex } from './hasher';
import { DirLock } from './dirlock';

/** Plugin-private content-addressed objects, verified before authorizing a commit.
 * FileSystem/Vault promises do not expose fsync or a power-loss durability guarantee. */
export class RecoveryStore {
        private readonly dirs = new DirLock();
        private chain: Promise<void> = Promise.resolve();
        constructor(private readonly vault: VaultAdapter, readonly root: string, private readonly maxBytes = 512 * 1024 * 1024) {
                if (!root || root.startsWith('/') || root.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid recovery root');
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
                        if (used + data.byteLength > this.maxBytes) throw new Error('Recovery storage budget exhausted; original retained');
                        await this.vault.writeBinary(path, data); await this.verify(ref); return ref;
                });
                this.chain = result.then(() => {}, () => {}); return result;
        }
        async verify(ref: RecoveryRef): Promise<void> {
                if (ref.path !== `${this.root}/${ref.sha256}.bin` || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new Error('Invalid recovery reference');
                const bytes = await this.vault.readBinary(ref.path);
                if (bytes.byteLength !== ref.size || await sha256Hex(bytes) !== ref.sha256) throw new Error('Recovery content verification failed');
        }
}
