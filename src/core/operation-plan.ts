import type { CacheEntries, RemoteEntry } from '../sources/types';
import type { LocalVersion } from './local-version';

export interface PlannedDownload {
        readonly id: string; readonly entry: Readonly<RemoteEntry>; readonly remotePath: string;
        readonly expected: LocalVersion; readonly kind: 'add' | 'replace' | 'restore';
        readonly level: 'fetch' | 'light' | 'full';
}
export interface PlannedDeletion { readonly id: string; readonly path: string; readonly expected: LocalVersion; readonly level: 'light' | 'full' }
export interface PlannedMove { readonly id: string; readonly from: string; readonly to: string; readonly expected: LocalVersion }
export interface OperationPlan {
        readonly id: string; readonly revision?: number;
        readonly downloads: readonly PlannedDownload[]; readonly deletions: readonly PlannedDeletion[]; readonly moves: readonly PlannedMove[];
        readonly summary: Readonly<{ downloads: number; newFiles: number; updates: number; restores: number; bytes: number; deleteLight: number; deleteFull: number; blocked: number; deferred: number }>;
}
interface PlanInput {
        id: string; revision?: number; cache: CacheEntries;
        downloads: readonly RemoteEntry[]; deletions: readonly string[]; moves: readonly { from: string; to: string }[];
        observations: ReadonlyMap<string, LocalVersion>; remotePaths: ReadonlyMap<string, string>;
        levels: ReadonlyMap<string, 'fetch' | 'light' | 'full'>;
        immutableInventory: boolean; trigger: 'auto' | 'manual';
}
/** Pure compilation. No port calls or references to mutable input escape the result. */
export function createOperationPlan(input: PlanInput): OperationPlan {
        const observed = (path: string) => {
                const version = input.observations.get(path); if (!version) throw new Error(`Local observation missing: ${path}`);
                return Object.freeze({ ...version }) as LocalVersion;
        };
        const targets = new Set<string>(), sources = new Set<string>();
        const moves: PlannedMove[] = [];
        for (const [i, move] of input.moves.entries()) {
                const from = observed(move.from), to = observed(move.to);
                if (from.kind === 'missing') continue;
                if (to.kind !== 'missing' || targets.has(move.to) || sources.has(move.from)) throw new Error(`Ambiguous move target: ${move.to}`);
                targets.add(move.to); sources.add(move.from);
                moves.push(Object.freeze({ id: `${input.id}-m${i}`, from: move.from, to: move.to, expected: from }));
        }
        if (moves.some(move => sources.has(move.to))) throw new Error('Cyclic mappings require a separate migration plan');
        const downloads = input.downloads.map((entry, i): PlannedDownload => {
                const moved = moves.find(move => move.to === entry.path);
                const expected = moved?.expected ?? observed(entry.path);
                const kind = expected.kind === 'missing' ? (input.cache[entry.path] ? 'restore' : 'add') : 'replace';
                return Object.freeze({ id: `${input.id}-w${i}`, entry: Object.freeze({ ...entry }), expected,
                        remotePath: input.remotePaths.get(entry.path) ?? entry.path, kind, level: input.levels.get(entry.path) ?? 'fetch' });
        });
        if (new Set(input.deletions).size !== input.deletions.length) throw new Error('Duplicate deletion target');
        if (input.deletions.some(path => targets.has(path) || sources.has(path) || downloads.some(file => file.entry.path === path))) throw new Error('Conflicting mutation plan');
        const blocked = !input.immutableInventory ? input.deletions.length : 0;
        const deferred = blocked || (input.trigger === 'auto' ? input.deletions.length : 0);
        const deletions: PlannedDeletion[] = deferred ? [] : input.deletions.map((path, i) => Object.freeze({
                id: `${input.id}-d${i}`, path, expected: observed(path), level: input.levels.get(path) === 'full' ? 'full' : 'light',
        }));
        return Object.freeze({ id: input.id, revision: input.revision, downloads: Object.freeze(downloads), deletions: Object.freeze(deletions), moves: Object.freeze(moves),
                summary: Object.freeze({ downloads: downloads.length, newFiles: downloads.filter(f => f.kind === 'add').length,
                        updates: downloads.filter(f => f.kind === 'replace').length, restores: downloads.filter(f => f.kind === 'restore').length,
                        bytes: downloads.reduce((s, f) => s + f.entry.size, 0), deleteLight: deletions.filter(f => f.level === 'light').length,
                        deleteFull: deletions.filter(f => f.level === 'full').length, blocked, deferred }),
        });
}
