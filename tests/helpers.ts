import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Coordinator, type CoordinatorDeps, type CoordinatorMessages } from '../src/core/coordinator';
import { ManifestCache } from '../src/core/manifest-cache';
import { OperationStore } from '../src/core/operation-store';
import { RecoveryStore } from '../src/core/recovery-store';
import { DurableMutations } from '../src/core/durable-mutations';
import { FailedQueue } from '../src/core/queue';
import { ConflictResolver, type ConflictResolverDeps } from '../src/core/conflict';
import { PathPolicy } from '../src/core/path-policy';
import { sha256Hex, crc32Hex, gitBlobSha1Hex } from '../src/core/hasher';
import type { FileSystem, RemoteEntry, SyncSource, SyncUI, VaultAdapter } from '../src/sources/types';
import type { MirrorLevel } from '../src/core/mirror';

export const ab = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer;
export const str = (b: ArrayBuffer): string => new TextDecoder().decode(b);
export const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
export const entry = (path: string, s = 'REMOTE'): RemoteEntry => ({ path, hash: sha(s), hashAlg: 'sha256', size: ab(s).byteLength });
export const pathPolicy = (protectedPaths: string[] = []): PathPolicy => new PathPolicy({
  syncMode: 'full-vault', allowedFolders: '', ignoredFolders: '', allowPlugins: false, allowSnippets: false, protectedPaths,
});
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
export function fsMemory() {
  const files = new Map<string, string>();
  const fs: FileSystem = {
    read: async p => files.get(p) ?? null,
    write: async (p, v) => { files.set(p, v); },
    rename: async (a, b) => { assert(files.has(a), 'missing ' + a); files.set(b, files.get(a)!); files.delete(a); },
    exists: async p => files.has(p), remove: async p => { files.delete(p); }, list: async () => [...files.keys()],
  };
  return { files, fs };
}
const messages: CoordinatorMessages = {
  alreadyInProgress: 'busy', offline: 'offline', notConfigured: 'configure', upToDate: 'current', cancelled: 'cancelled',
  syncFailed: s => 'failed: ' + s, deletingFiles: n => 'delete ' + n, orphanWarning: n => 'orphans ' + n,
  syncedWithErrors: n => 'errors ' + n, success: () => 'success', fileTooLarge: () => 'too large',
  conflictKeptLocal: p => 'local ' + p, conflictBoth: p => 'copy ' + p, nothingToRetry: 'no retries',
  retryNotDue: n => 'not due ' + n, retryParked: n => 'parked ' + n, deletionsDeferred: n => 'deferred ' + n,
  deletionsBlocked: n => 'blocked ' + n, phaseManifest: 'manifest', phasePolicy: 'policy', phaseDiff: 'diff',
  phaseDeletions: 'delete', phaseDownloads: 'download', phaseFinalize: 'finalize',
};
export function fixture(manifest: RemoteEntry[] = [], level: MirrorLevel = 'fetch') {
  const files = new Map<string, ArrayBuffer>();
  const dirs = new Set<string>();
  const operations: string[] = [];
  const parent = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), 0));
  const vault: VaultAdapter = {
    exists: async p => files.has(p) || dirs.has(p),
    readBinary: async p => { assert(files.has(p), 'missing ' + p); return files.get(p)!.slice(0); },
    writeBinary: async (p, b) => { files.set(p, b.slice(0)); operations.push('write ' + p); },
    mkdir: async p => { dirs.add(p); },
    remove: async p => { files.delete(p); dirs.delete(p); operations.push('delete ' + p); },
    rename: async (a, b) => { assert(files.has(a)); files.set(b, files.get(a)!); files.delete(a); operations.push('rename ' + a + ' ' + b); },
    stat: async p => files.has(p) ? { mtime: 1, size: files.get(p)!.byteLength } : null,
    list: async p => ({ files: [...files.keys()].filter(f => parent(f) === p), folders: [...dirs].filter(f => parent(f) === p) }),
  };
  const memory = fsMemory();
  const cache = new ManifestCache(memory.fs, 'test');
  const queue = new FailedQueue({ maxRetries: 1 });
  const source: SyncSource = { kind: 'git', deletionSafety: 'immutable', getManifest: async () => manifest, fetch: async () => ab('REMOTE') };
  const notices: string[] = [], statuses: string[] = [];
  const ui: SyncUI = {
    notify: s => { notices.push(s); }, notifyVerbose: s => { notices.push(s); },
    setStatus: s => { statuses.push(s); }, setLastSyncTime: () => {}, confirmSync: async () => true,
  };
  const resolverDeps: ConflictResolverDeps = { vault, sha256: sha256Hex, crc32: crc32Hex, gitSha1: gitBlobSha1Hex };
  const conflict = new ConflictResolver('keep-both', resolverDeps);
  const store = new OperationStore(memory.fs), recovery = new RecoveryStore(vault, '.obsidian/plugins/sync/recovery-v2');
  const mutations = new DurableMutations(store, recovery, vault);
  const deps: CoordinatorDeps = { mutations, source, vault, cache, queue, conflict, ui, policy: pathPolicy(['.obsidian/plugins/sync']), messages,
    options: { mirrorLevel: () => level, useTrash: () => false, isOnline: () => true, isConfigured: () => true } };
  const coordinator = new Coordinator(deps);
  const own = (p: string, content = 'LOCAL') => {
    files.set(p, ab(content)); const e = entry(p, content); cache.set(p, { h: e.hash, s: e.size, alg: e.hashAlg });
  };
  return { store, recovery, mutations, files, dirs, operations, vault, memory, cache, queue, source, ui, notices, statuses, conflict, resolverDeps, deps, coordinator, own };
}
