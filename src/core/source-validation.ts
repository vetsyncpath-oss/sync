import type { RemoteEntry } from '../sources/types';
import { crc32Hex, gitBlobSha1Hex, sha256Hex } from './hasher';

/** Reject ambiguous/invalid inventories before omissions can become deletions. */
export function validateManifest(entries: RemoteEntry[]): void {
        if (!Array.isArray(entries)) throw new Error('Invalid source manifest');
        const paths = new Set<string>();
        for (const entry of entries) {
                if (!entry || typeof entry.path !== 'string' || !entry.path
                        || entry.path.startsWith('/') || /^[A-Za-z]:/.test(entry.path)
                        || entry.path.includes('\\') || entry.path.includes('\0')
                        || entry.path.split('/').some(part => !part || part === '.' || part === '..')) {
                        throw new Error('Invalid source path');
                }
                const key = entry.path.normalize('NFC').toLowerCase();
                if (paths.has(key)) throw new Error(`Source path collision: ${entry.path}`);
                paths.add(key);
                if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
                        throw new Error(`Invalid source size: ${entry.path}`);
                }
                const patterns: Record<string, RegExp> = {
                        sha256: /^[0-9a-f]{64}$/i,
                        'git-sha1': /^[0-9a-f]{40}$/i,
                        crc32: /^[0-9a-f]{8}$/i,
                        etag: /\S/,
                        weak: /\S/,
                };
                if (typeof entry.hash !== 'string' || !patterns[entry.hashAlg]?.test(entry.hash)) {
                        throw new Error(`Invalid source version: ${entry.path}`);
                }
        }
        for (const path of paths) {
                const parts = path.split('/');
                for (let i = 1; i < parts.length; i++) {
                        if (paths.has(parts.slice(0, i).join('/'))) {
                                throw new Error(`Source file/directory collision: ${path}`);
                        }
                }
        }
}

/** ETag/weak are version hints; content digests are verified against received bytes. */
export async function verifyRemoteData(entry: RemoteEntry, data: ArrayBuffer): Promise<void> {
        if (data.byteLength !== entry.size) throw new Error(`Source size mismatch: ${entry.path}`);
        let digest: string | undefined;
        if (entry.hashAlg === 'sha256') digest = await sha256Hex(data);
        else if (entry.hashAlg === 'git-sha1') digest = await gitBlobSha1Hex(data);
        else if (entry.hashAlg === 'crc32') digest = crc32Hex(data);
        if (digest !== undefined && digest.toLowerCase() !== entry.hash.toLowerCase()) {
                throw new Error(`Source integrity mismatch: ${entry.path}`);
        }
}
