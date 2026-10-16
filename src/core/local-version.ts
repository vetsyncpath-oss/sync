import { SyncFault } from './sync-issue';
import type { VaultAdapter } from '../sources/types';
import { sha256Hex } from './hasher';

export type LocalVersion = Readonly<{ kind: 'missing' } | { kind: 'file'; sha256: string; size: number }>;
export const MISSING: LocalVersion = Object.freeze({ kind: 'missing' });

export async function versionOf(data: ArrayBuffer): Promise<LocalVersion> {
        return Object.freeze({ kind: 'file', sha256: await sha256Hex(data), size: data.byteLength });
}
export async function observeLocal(vault: VaultAdapter, path: string): Promise<LocalVersion> {
        return await vault.exists(path) ? versionOf(await vault.readBinary(path)) : MISSING;
}
export function sameVersion(a: LocalVersion, b: LocalVersion): boolean {
        return a.kind === 'missing' ? b.kind === 'missing'
                : b.kind === 'file' && a.sha256 === b.sha256 && a.size === b.size;
}
export class StalePlanError extends SyncFault {
        constructor(path: string) { super('local-changed',`Local file changed after planning: ${path}`,'file',true); this.name = 'StalePlanError'; }
}
export async function assertLocal(vault: VaultAdapter, path: string, expected: LocalVersion): Promise<void> {
        if (!sameVersion(await observeLocal(vault, path), expected)) throw new StalePlanError(path);
}
