import { SyncFault } from './sync-issue';
import type { CacheEntry, FileSystem, RemoteEntry } from '../sources/types';
import { sha256Hex } from './hasher';
import { validateManifest } from './source-validation';
import { sameVersion, type LocalVersion } from './local-version';

export type CacheEffect =
        | { kind: 'set'; remote: RemoteEntry; mode: 'applied' | 'incoming'; remotePath?: string }
        | { kind: 'delete'; path: string }
        | { kind: 'move'; from: string; to: string; entry?: CacheEntry };
export interface RecoveryRef { path: string; sha256: string; size: number }
export interface OperationRecord {
        id: string;
        namespace: string;
        planId: string;
        kind: 'write' | 'delete' | 'move';
        path: string;
        from?: string;
        before: LocalVersion;
        after: LocalVersion;
        recovery?: RecoveryRef;
        effect?: CacheEffect;
        status: 'committing' | 'applied' | 'not-applied' | 'blocked';
        appliedSequence?: number;
        createdAt: number;
}
export interface AppliedBaseline {
        remote: RemoteEntry;
        remotePath: string;
        confidence: 'digest-verified' | 'observed';
        localSha256: string;
        size: number;
}
interface State {
        version: 2;
        sequence: number;
        operations: Record<string, OperationRecord>;
        baselines: Record<string, AppliedBaseline>;
}
const LEGACY = /^sync-operations-v2-(\d{16})\.json$/;
const EVENT = /^sync-operations-v3-event-(\d{16})\.json$/;
const CHECKPOINT = /^sync-operations-v3-checkpoint-(\d{16})\.json$/;
// The 2a reader rejects this name instead of silently ignoring newer history.
const MARKER = 'sync-operations-v2-migrated.json';
const TEMP = /^sync-operations-(?:v2-\d{16}|v2-migrated|v3-(?:event|checkpoint)-\d{16})\.json\.[\w-]+\.tmp$/;
const ROOT = '0'.repeat(64);
type FinalStatus = 'applied' | 'not-applied' | 'blocked';
type Command = { kind: 'begin'; record: OperationRecord } | { kind: 'finish'; id: string; status: FinalStatus } | {kind:'prune';ids:string[];before:number};
interface Event { version: 3; kind: 'event'; sequence: number; previous: string; command: Command }
interface Checkpoint { version: 3; kind: 'checkpoint'; tip: string; state: State }
interface Marker { version: 3; kind: 'migration-marker'; initialSequence: number; initialTip: string }
export interface OperationStoreOptions { minimumCheckpointEvents?: number }
const filename = (kind: 'event' | 'checkpoint', sequence: number) => `sync-operations-v3-${kind}-${String(sequence).padStart(16, '0')}.json`;
const sequenceOf = (pattern: RegExp, name: string) => Number(pattern.exec(name)![1]);
const idValid = (id: string) => /^[\w-]+$/.test(id) && !['__proto__', 'prototype', 'constructor'].includes(id);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const pathValid = (path: unknown): path is string => {
        try { validateManifest([{ path: path as string, size: 0, hash: 'version', hashAlg: 'weak' }]); return true; } catch { return false; }
};
function localValid(v: unknown): v is LocalVersion {
        return object(v) && (v.kind === 'missing' || (v.kind === 'file' && digest(v.sha256) && Number.isSafeInteger(v.size) && Number(v.size) >= 0));
}
function remoteValid(value: unknown): value is RemoteEntry {
        try { validateManifest([value as RemoteEntry]); return true; } catch { return false; }
}
const key = (namespace: string, path: string) => JSON.stringify([namespace, path]);
function validateState(value: unknown): asserts value is State {
        if (!object(value) || value.version !== 2 || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0
                || !object(value.operations) || !object(value.baselines)) throw new Error('Invalid operation state');
        for (const [id, record] of Object.entries(value.operations)) {
                if (!object(record) || record.id !== id || !idValid(id) || typeof record.namespace !== 'string' || !record.namespace
                        || typeof record.planId !== 'string' || !record.planId || !pathValid(record.path)
                        || !['write', 'delete', 'move'].includes(String(record.kind))
                        || !['committing', 'applied', 'not-applied', 'blocked'].includes(String(record.status))
                        || !localValid(record.before) || !localValid(record.after) || !Number.isFinite(record.createdAt)) throw new Error('Invalid operation record');
                if (record.kind === 'move' && (!pathValid(record.from) || record.from === record.path || record.before.kind !== 'file'
                        || !sameVersion(record.before, record.after))) throw new Error('Invalid move record');
                if (record.kind === 'delete' && record.after.kind !== 'missing') throw new Error('Invalid deletion record');
                if (record.kind === 'write' && record.after.kind !== 'file') throw new Error('Invalid write record');
                if (record.before.kind === 'file' && (record.kind !== 'write' || !sameVersion(record.before, record.after))) {
                        const recovery = record.recovery;
                        if (!object(recovery) || !pathValid(recovery.path) || recovery.sha256 !== record.before.sha256 || recovery.size !== record.before.size) throw new Error('Missing operation recovery');
                }
                if (record.status === 'applied' && (!Number.isSafeInteger(record.appliedSequence) || Number(record.appliedSequence) < 1 || Number(record.appliedSequence) > Number(value.sequence))) throw new Error('Invalid applied sequence');
                if (record.effect !== undefined) {
                        const effect = record.effect;
                        if (!object(effect)) throw new Error('Invalid cache effect');
                        if (effect.kind === 'set') {
                                if (record.kind !== 'write' || !remoteValid(effect.remote) || !['applied', 'incoming'].includes(String(effect.mode))) throw new Error('Invalid cache write effect');
                                if (effect.mode === 'applied' && effect.remote.path !== record.path) throw new Error('Invalid applied target');
                                if (effect.remotePath !== undefined && !pathValid(effect.remotePath)) throw new Error('Invalid remote locator path');
                        } else if (effect.kind === 'delete') {
                                if (record.kind !== 'delete' || effect.path !== record.path) throw new Error('Invalid cache deletion effect');
                        } else if (effect.kind === 'move') {
                                if (record.kind !== 'move' || effect.from !== record.from || effect.to !== record.path) throw new Error('Invalid cache move effect');
                                if (effect.entry !== undefined && (!object(effect.entry) || !remoteValid({ path: effect.to, hash: effect.entry.h, size: effect.entry.s, hashAlg: effect.entry.alg }))) throw new Error('Invalid moved baseline');
                        } else throw new Error('Unknown cache effect');
                }
        }
        for (const [k, baseline] of Object.entries(value.baselines)) {
                if (!object(baseline) || !remoteValid(baseline.remote) || !pathValid(baseline.remotePath) || !['digest-verified', 'observed'].includes(String(baseline.confidence))
                        || !digest(baseline.localSha256) || !Number.isSafeInteger(baseline.size) || Number(baseline.size) < 0) throw new Error('Invalid applied baseline');
                const parsed: unknown = JSON.parse(k);
                if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || parsed[1] !== baseline.remote.path) throw new Error('Invalid baseline key');
        }
}

/** Immutable deltas and adaptive checkpoints. Publication is serialized, and
 * corruption or a broken chain never falls back to older/empty history. */
export class OperationStore {
        private state: State = { version: 2, sequence: 0, operations: {}, baselines: {} };
        private loaded = false;
        private fault?: Error;
        private chain: Promise<void> = Promise.resolve();
        private tip = ROOT;
        private checkpointSequence = -1;
        private marker?: Marker;
        private count = 0;
        private readonly minimumCheckpointEvents: number;
        constructor(private readonly fs: FileSystem, private maxRecords = 10000, options: OperationStoreOptions = {}) {
                this.minimumCheckpointEvents = options.minimumCheckpointEvents ?? 256;
                if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || !Number.isSafeInteger(this.minimumCheckpointEvents)
                        || this.minimumCheckpointEvents < 1) throw new Error('Invalid operation storage budget');
        }
        private serial<T>(fn: () => Promise<T>): Promise<T> {
                const result = this.chain.then(fn); this.chain = result.then(() => {}, () => {}); return result;
        }
        async load(): Promise<void> {
                await this.serial(async () => {
                        if (this.fault) throw this.fault;
                        if (this.loaded) return;
                        this.state = { version: 2, sequence: 0, operations: {}, baselines: {} };
                        this.tip = ROOT; this.checkpointSequence = -1; this.marker = undefined; this.count = 0;
                        const names = await this.fs.list();
                        if (names.some(name => name.startsWith('sync-operations-v') && name !== MARKER
                                && !LEGACY.test(name) && !EVENT.test(name) && !CHECKPOINT.test(name) && !TEMP.test(name))) throw new Error('Unknown operation state generation');
                        const checkpoints = names.filter(name => CHECKPOINT.test(name)).sort();
                        const events = names.filter(name => EVENT.test(name)).sort();
                        if (names.includes(MARKER)) {
                                const value = (await this.read(MARKER)).value;
                                if (!object(value) || value.version !== 3 || value.kind !== 'migration-marker' || !digest(value.initialTip)
                                        || !Number.isSafeInteger(value.initialSequence) || Number(value.initialSequence) < 0) throw new Error('Invalid operation migration marker');
                                this.marker = value as unknown as Marker;
                        }
                        // A checkpoint can precede the marker during interrupted initialization;
                        // events can only be published after the marker is verified.
                        if (!checkpoints.length && (this.marker || events.length)) throw new Error('Operation checkpoint is missing');
                        if (events.length && !this.marker) throw new Error('Operation migration marker is missing');
                        if (checkpoints.length) {
                                const latest = checkpoints.at(-1)!;
                                const value = await this.readCheckpoint(latest);
                                this.state = value.state; this.tip = value.tip; this.checkpointSequence = this.state.sequence;
                                if (this.marker && (this.state.sequence < this.marker.initialSequence
                                        || (this.state.sequence === this.marker.initialSequence && this.tip !== this.marker.initialTip))) throw new Error('Operation migration anchor mismatch');
                                const anchor = events.find(name => sequenceOf(EVENT, name) === this.checkpointSequence);
                                if (anchor && (await this.read(anchor)).sha256 !== this.tip) throw new Error('Operation checkpoint tip mismatch');
                                this.count = Object.keys(this.state.operations).length;
                                for (const name of events.filter(name => sequenceOf(EVENT, name) > this.checkpointSequence)) {
                                        const { value: raw, sha256 } = await this.read(name);
                                        const event = this.validateEvent(raw);
                                        if (event.sequence !== sequenceOf(EVENT, name) || event.sequence !== this.state.sequence + 1
                                                || event.previous !== this.tip) throw new Error('Operation event chain is broken');
                                        this.accept(event.command, event.sequence); this.tip = sha256;
                                }
                                validateState(this.state);
                        } else {
                                const legacy = names.filter(name => LEGACY.test(name)).sort();
                                if (legacy.length) {
                                        const latest = legacy.at(-1)!;
                                        const { value, sha256 } = await this.read(latest); validateState(value);
                                        if (value.sequence < 1 || value.sequence !== sequenceOf(LEGACY, latest)) throw new Error('Operation generation mismatch');
                                        this.state = value; this.tip = sha256;
                                }
                                this.count = Object.keys(this.state.operations).length;
                        }
                        this.loaded = true;
                });
        }
        records(namespace?: string): OperationRecord[] {
                this.assertReadable();
                return structuredClone(Object.values(this.state.operations).filter(r => namespace === undefined || r.namespace === namespace));
        }
        baselines(namespace:string):AppliedBaseline[]{this.assertReadable();return structuredClone(Object.entries(this.state.baselines).filter(([k])=>JSON.parse(k)[0]===namespace).map(([,value])=>value));}
        baseline(namespace: string, path: string): AppliedBaseline | undefined {
                this.assertReadable();
                const baseline = this.state.baselines[key(namespace, path)]; return baseline && structuredClone(baseline);
        }
        private assertReadable(): void {
                if (this.fault) throw this.fault;
                if (!this.loaded) throw new Error('Operation state must be loaded before reading');
        }
        prunable(before:number):OperationRecord[]{this.assertReadable();return this.retentionCandidates(before);}
        private retentionCandidates(before:number):OperationRecord[]{
                const protectedIds=new Set<string>(),seen=new Set<string>();
                const ordered=Object.values(this.state.operations).filter(record=>record.status==='applied').sort((a,b)=>b.appliedSequence!-a.appliedSequence!);
                for(const record of ordered){const effect=record.effect;
                        const paths=effect?.kind==='set'?[effect.remote.path]:effect?.kind==='delete'?[effect.path]:effect?.kind==='move'?[effect.from,effect.to]:[];
                        for(const path of paths){const k=key(record.namespace,path);if(!seen.has(k))protectedIds.add(record.id);seen.add(k);}
                }
                return structuredClone(Object.values(this.state.operations)).filter(record=>['applied','not-applied'].includes(record.status)&&record.createdAt<before&&!protectedIds.has(record.id));
        }
        async prune(before:number,ids:readonly string[]):Promise<void>{
                await this.load();await this.serial(async()=>{
                        this.assertReadable();const allowed=new Set(this.prunable(before).map(record=>record.id));
                        if(ids.some(id=>!allowed.has(id)))throw Error('Retention preview changed; review it again');
                        if(!ids.length)return;await this.ensureFormat();await this.append({kind:'prune',before,ids:[...ids]});await this.compactLocked();
                });
        }
        setLimit(records:number):void{if(!Number.isSafeInteger(records)||records<1)throw Error('Invalid history budget');this.maxRecords=records;}
        async capacity():Promise<{used:number;limit:number}>{await this.load();this.assertReadable();return {used:this.count,limit:this.maxRecords};}
        async begin(input: OperationRecord): Promise<void> {
                const record = structuredClone(input);
                await this.load();
                await this.serial(async () => {
                        this.assertReadable();
                        const command: Command = { kind: 'begin', record };
                        this.prepare(command, this.state.sequence + 1);
                        if (this.count >= this.maxRecords) throw new SyncFault('history-quota','Operation history budget exhausted; original retained','session');
                        // Maintenance precedes a new intention; it cannot turn an already
                        // applied mutation into a spurious download failure.
                        await this.ensureFormat();
                        if (this.state.sequence - this.checkpointSequence >= Math.max(this.minimumCheckpointEvents, Math.min(this.count,512))) await this.compactLocked();
                        await this.append(command);
                });
        }
        async finish(id: string, status: FinalStatus): Promise<void> {
                await this.load();
                await this.serial(async () => {
                        this.assertReadable();
                        if (!Object.prototype.hasOwnProperty.call(this.state.operations, id)) throw new Error('Unknown operation');
                        if (this.state.operations[id].status === status) return;
                        await this.ensureFormat(); await this.append({ kind: 'finish', id, status });
                });
        }
        /** Coalesces metadata only; preserves every operation and recovery reference. */
        async compact(): Promise<void> {
                await this.load();
                await this.serial(async () => { this.assertReadable(); await this.ensureFormat(); await this.compactLocked(); });
        }
        private validateEvent(value: unknown): Event {
                if (!object(value) || value.version !== 3 || value.kind !== 'event' || !Number.isSafeInteger(value.sequence)
                        || Number(value.sequence) < 1 || !digest(value.previous) || !object(value.command)) throw new Error('Invalid operation event');
                const command = value.command;
                if (command.kind === 'begin') {
                        if (!object(command.record)) throw new Error('Invalid operation begin event');
                } else if(command.kind==='prune'){if(!Array.isArray(command.ids)||!Number.isFinite(command.before))throw Error('Invalid retention event');}
                else if (command.kind !== 'finish' || typeof command.id !== 'string' || !idValid(command.id)
                        || !['applied', 'not-applied', 'blocked'].includes(String(command.status))) throw new Error('Invalid operation command');
                return value as unknown as Event;
        }
        private prepare(command: Command, sequence: number): OperationRecord|undefined {
                if (!Number.isSafeInteger(sequence)) throw new Error('Operation sequence exhausted');
                if(command.kind==='prune'){
                        if(!Number.isFinite(command.before)||!Array.isArray(command.ids)||new Set(command.ids).size!==command.ids.length)throw Error('Invalid retention operation');
                        const allowed=new Set(this.retentionCandidates(command.before).map(record=>record.id));
                        if(command.ids.some(id=>!idValid(id)||!allowed.has(id)))throw Error('Retention would remove protected history');return;
                }
                let record: OperationRecord;
                if (command.kind === 'begin') {
                        record = command.record;
                        if (!idValid(record.id)) throw new Error('Invalid operation ID');
                        if (Object.prototype.hasOwnProperty.call(this.state.operations, record.id)) throw new Error('Duplicate operation ID');
                        if (record.status !== 'committing' || record.appliedSequence !== undefined) throw new Error('New operation must be committing');
                } else {
                        if (!Object.prototype.hasOwnProperty.call(this.state.operations, command.id)) throw new Error('Unknown operation');
                        const current = this.state.operations[command.id];
                        if (current.status === 'applied' || current.status === 'not-applied') throw new Error('Cannot change a terminal operation');
                        record = { ...current, status: command.status };
                        if (command.status === 'applied') record.appliedSequence = sequence;
                }
                validateState({ version: 2, sequence, operations: { [record.id]: record }, baselines: {} });
                return record;
        }
        private accept(command: Command, sequence: number): void {
                const record = this.prepare(command, sequence);
                if(command.kind==='prune'){for(const id of command.ids)delete this.state.operations[id];this.count-=command.ids.length;this.state.sequence=sequence;return;}
                if(!record)throw Error('Operation record missing');
                this.state.operations[record.id] = record;
                if (command.kind === 'begin') this.count++;
                this.state.sequence = sequence;
                if (record.status !== 'applied') return;
                const effect = record.effect;
                if (effect?.kind === 'set' && effect.mode === 'applied' && record.after.kind === 'file') {
                        this.state.baselines[key(record.namespace, effect.remote.path)] = { remote: effect.remote, remotePath: effect.remotePath ?? effect.remote.path,
                                confidence: effect.remote.hashAlg === 'etag' || effect.remote.hashAlg === 'weak' ? 'observed' : 'digest-verified',
                                localSha256: record.after.sha256, size: record.after.size };
                } else if (effect?.kind === 'delete') delete this.state.baselines[key(record.namespace, effect.path)];
                else if (effect?.kind === 'move') {
                        const previous = this.state.baselines[key(record.namespace, effect.from)];
                        if (previous) this.state.baselines[key(record.namespace, effect.to)] = { ...previous, remote: { ...previous.remote, path: effect.to } };
                        delete this.state.baselines[key(record.namespace, effect.from)];
                }
        }
        private async append(command: Command): Promise<void> {
                const event: Event = { version: 3, kind: 'event', sequence: this.state.sequence + 1, previous: this.tip, command };
                this.prepare(command, event.sequence);
                const tip = await this.publish(filename('event', event.sequence), event);
                this.accept(command, event.sequence); this.tip = tip;
        }
        private async read(name: string, expectedHash?: string): Promise<{ value: unknown; sha256: string }> {
                const raw = await this.fs.read(name); if (!raw) throw new Error('Operation state is missing or unreadable');
                const envelope: unknown = JSON.parse(raw);
                if (!object(envelope) || typeof envelope.payload !== 'string' || !digest(envelope.sha256)
                        || (expectedHash !== undefined && envelope.sha256 !== expectedHash)
                        || await sha256Hex(new TextEncoder().encode(envelope.payload).buffer) !== envelope.sha256) throw new Error('Operation state checksum mismatch');
                return { value: JSON.parse(envelope.payload), sha256: envelope.sha256 };
        }
        private async readCheckpoint(name: string): Promise<Checkpoint> {
                const value = (await this.read(name)).value;
                if (!object(value) || value.version !== 3 || value.kind !== 'checkpoint' || !digest(value.tip)) throw new Error('Invalid operation checkpoint');
                validateState(value.state);
                if (value.state.sequence !== sequenceOf(CHECKPOINT, name)) throw new Error('Operation checkpoint sequence mismatch');
                return value as unknown as Checkpoint;
        }
        private async publish(final: string, value: Event | Checkpoint | Marker): Promise<string> {
                if (await this.fs.exists(final)) {
                        this.fault = new Error('Operation state already exists; reload the plugin to verify it'); throw this.fault;
                }
                const payload = JSON.stringify(value);
                const sha256 = await sha256Hex(new TextEncoder().encode(payload).buffer);
                const temp = `${final}.${globalThis.crypto.randomUUID()}.tmp`;
                await this.fs.write(temp, JSON.stringify({ sha256, payload })); await this.read(temp, sha256);
                try {
                        await this.fs.rename(temp, final); await this.read(final, sha256);
                } catch (error) {
                        this.fault = Object.assign(new Error('Operation state publication is uncertain; reload the plugin to verify it'), { cause: error }); throw this.fault;
                }
                return sha256;
        }
        private async ensureFormat(): Promise<void> {
                if (this.checkpointSequence < 0) {
                        await this.publish(filename('checkpoint', this.state.sequence), { version: 3, kind: 'checkpoint', tip: this.tip, state: this.state });
                        this.checkpointSequence = this.state.sequence;
                }
                if (!this.marker) {
                        const marker: Marker = { version: 3, kind: 'migration-marker', initialSequence: this.checkpointSequence, initialTip: this.tip };
                        await this.publish(MARKER, marker); this.marker = marker;
                }
        }
        private async compactLocked(): Promise<void> {
                if (this.checkpointSequence !== this.state.sequence) {
                        validateState(this.state);
                        await this.publish(filename('checkpoint', this.state.sequence), { version: 3, kind: 'checkpoint', tip: this.tip, state: this.state });
                        this.checkpointSequence = this.state.sequence;
                }
                // Only verified checkpoints authorize removing superseded metadata.
                // Both snapshots contain full operation history and recovery references.
                // Keep only the current anchor event; older deltas are redundant.
                try {
                        const names = await this.fs.list();
                        const checkpoints = names.filter(name => CHECKPOINT.test(name)).sort();
                        // A filename from another writer or unexpected future generation
                        // cannot authorize deletion of this instance's verified history.
                        if (checkpoints.some(name => sequenceOf(CHECKPOINT, name) > this.checkpointSequence)
                                || names.some(name => EVENT.test(name) && sequenceOf(EVENT, name) > this.state.sequence)) return;
                        const previous = checkpoints.at(-2);
                        if (previous) {
                                const current=await this.readCheckpoint(filename('checkpoint', this.checkpointSequence));
                                if(current.tip!==this.tip)throw new Error('Journal checkpoint tip mismatch during cleanup');
                                const anchor=filename('event',this.checkpointSequence);
                                if(names.includes(anchor)&&(await this.read(anchor)).sha256!==this.tip)throw new Error('Journal anchor mismatch during cleanup');
                                await this.readCheckpoint(previous);
                                const boundary = sequenceOf(CHECKPOINT, previous);
                                for (const name of names) if ((EVENT.test(name) && sequenceOf(EVENT, name) < this.checkpointSequence)
                                        || (CHECKPOINT.test(name) && sequenceOf(CHECKPOINT, name) < boundary)) await this.fs.remove(name);
                        }
                } catch(error) {
                        // Metadata already committed stays authoritative; retry cleanup next session.
                        console.warn('[VaultSync] Journal cleanup deferred; retained metadata will be checked again:',error);
                }
        }
}
