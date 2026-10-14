import type { ManifestCache } from './manifest-cache';
import type { VaultAdapter } from '../sources/types';
import { OperationStore, type CacheEffect, type OperationRecord } from './operation-store';
import { RecoveryStore } from './recovery-store';
import { assertLocal, MISSING, observeLocal, sameVersion, StalePlanError, versionOf, type LocalVersion } from './local-version';
import { overlapsPhysical } from './job-policy';
import { SyncFault,diagnosticText } from './sync-issue';
class ConditionalWriteUnavailable extends SyncFault { constructor(){super('local-guard-unavailable','Conditional local write unavailable; original retained');} }

export interface MutationRequest {
        id: string; planId: string; path: string; before: LocalVersion; effect?: CacheEffect;
        requireConditionalWrite?:boolean;
        /** Checks cancellation, config revision and policy, including after each async prerequisite. */
        guard(): void;
}
export class DurableMutations {
        constructor(readonly store: OperationStore, readonly recovery: RecoveryStore, private readonly vault: VaultAdapter) {}
        private async commit(namespace: string, request: MutationRequest, kind: OperationRecord['kind'], after: LocalVersion, action: () => Promise<void>, from?: string): Promise<void> {
                try{await this.store.load();}catch(error){throw new SyncFault('operation-journal',`Operation state could not be read: ${diagnosticText(error)}`,'session');}
                const paths=[request.path,...(from?[from]:[])].map(p=>p.normalize('NFC').toLowerCase());
                if(this.store.records().some(record=>record.id!==request.id&&['committing','blocked'].includes(record.status)
                    &&[record.path,record.from].some(path=>path!==undefined&&paths.some(target=>overlapsPhysical(target,path)))))
                    throw new SyncFault('recovery-overlap','A physical target has an unresolved operation; review recovery before changing it');
                request.guard(); await this.vault.assertWritable?.(from??request.path);await this.vault.assertWritable?.(request.path); await assertLocal(this.vault, from ?? request.path, request.before);
                if (from) await assertLocal(this.vault, request.path, MISSING);
                const recovery = request.before.kind === 'file' && (kind !== 'write' || !sameVersion(request.before, after))
                        ? await this.recovery.save(await this.vault.readBinary(from ?? request.path)) : undefined;
                if (recovery && (recovery.sha256 !== (request.before.kind === 'file' ? request.before.sha256 : '') || recovery.size !== (request.before.kind === 'file' ? request.before.size : -1))) throw new Error('Local file changed during recovery');
                request.guard(); await this.vault.assertWritable?.(from??request.path);await this.vault.assertWritable?.(request.path); await assertLocal(this.vault, from ?? request.path, request.before);
                if (from) await assertLocal(this.vault, request.path, MISSING);
                const record: OperationRecord = { id: request.id, planId: request.planId, path: request.path, before: request.before,
                        effect: request.effect, namespace, kind, from, after, recovery, status: 'committing', createdAt: Date.now() };
                try{await this.store.begin(record);}catch(error){if(error instanceof SyncFault)throw error;throw new SyncFault('operation-journal',`Operation intent could not be persisted; original retained: ${diagnosticText(error)}`,'session');}
                let started = false;
                try {
                        request.guard(); await this.vault.assertWritable?.(from??request.path);await this.vault.assertWritable?.(request.path); await assertLocal(this.vault, from ?? request.path, request.before);
                        if (from) await assertLocal(this.vault, request.path, MISSING);
                        request.guard(); started = true; await action();
                        if (!sameVersion(await observeLocal(this.vault, request.path), after) || (from && (await observeLocal(this.vault, from)).kind !== 'missing')) throw new Error('Mutation result verification failed');
                        try{await this.store.finish(record.id, 'applied');}catch(error){throw new SyncFault('operation-journal',`Applied operation could not be acknowledged; recovery intent retained: ${diagnosticText(error)}`,'session');}
                } catch (error) {
                        // An observed stale precondition proves that our commit was not made.
                        // An arbitrary IO error can be thrown after a write; retain its intent.
                        if (!started || error instanceof StalePlanError||error instanceof ConditionalWriteUnavailable) await this.store.finish(record.id, 'not-applied');
                        throw error;
                }
        }
        async write(namespace: string, request: MutationRequest, data: ArrayBuffer, signal?: AbortSignal): Promise<void> {
                const after = await versionOf(data);
                if(request.requireConditionalWrite&&!sameVersion(request.before,after)&&(request.before.kind==='missing'?!this.vault.createBinary:!this.vault.compareAndWrite))throw new ConditionalWriteUnavailable();
                await this.commit(namespace, request, 'write', after, async () => {
                        if (sameVersion(request.before, after)) return;
                        if(request.before.kind==='missing' && this.vault.createBinary){
                                request.guard();await this.vault.createBinary(request.path,data);return;
                        }
                        if (request.before.kind === 'file' && this.vault.compareAndWrite) {
                                const previous = await this.vault.readBinary(request.path); request.guard();
                                if (!sameVersion(await versionOf(previous), request.before)) throw new StalePlanError(request.path);
                                const result = await this.vault.compareAndWrite(request.path, data, previous, signal);
                                if (result === false) throw new StalePlanError(request.path);
                                if (result === true) return;
                                if(request.requireConditionalWrite)throw new ConditionalWriteUnavailable();
                        }
                        request.guard(); await assertLocal(this.vault, request.path, request.before); request.guard();
                        await this.vault.writeBinary(request.path, data);
                });
        }
        /** Restore to a new protected conflict-copy name, never over the user's current file. */
        async restoreCopy(id:string, allow:(path:string)=>boolean, guard:()=>void):Promise<string> {
                await this.store.load();const record=this.store.records().find(r=>r.id===id);
                if(!record?.recovery)throw Error('Recovery copy unavailable');
                if(!this.vault.createBinary)throw Error('Non-overwriting file creation unavailable');
                const original=record.kind==='move'?record.from!:record.path;
                if(!allow(original))throw Error('Recovery destination is protected by permissions');
                guard();const bytes=await this.recovery.read(record.recovery);guard();
                const slash=original.lastIndexOf('/'),base=original.slice(slash+1),dot=base.lastIndexOf('.');
                const encoder=new TextEncoder(),extension=dot>0&&encoder.encode(base.slice(dot)).length<=64?base.slice(dot):'';
                const suffix='.conflict-restored-'+crypto.randomUUID()+extension;
                let stem='';const budget=255-encoder.encode(suffix).length;
                for(const char of extension?base.slice(0,dot):base){if(encoder.encode(stem+char).length>budget)break;stem+=char;}
                const path=original.slice(0,slash+1)+(stem||'_')+suffix;
                const parent=path.slice(0,Math.max(path.lastIndexOf('/'),0));
                if(parent && !(await this.vault.exists(parent))) {
                        const parts=parent.split('/');let directory='';
                        for(const part of parts){directory=directory?directory+'/'+part:part;if(!(await this.vault.exists(directory)))await this.vault.mkdir(directory);}
                }
                guard();await this.write('manual-recovery',{id:crypto.randomUUID(),planId:'manual-recovery',path,before:MISSING,guard},bytes);
                return path;
        }
        async keepCurrent(id:string, expected:LocalVersion, from:LocalVersion|undefined, guard:()=>void):Promise<void> {
                await this.store.load();const record=this.store.records().find(r=>r.id===id);
                if(!record || !['committing','blocked'].includes(record.status))throw Error('Operation no longer needs review');
                if(record.recovery)await this.recovery.verify(record.recovery);
                guard();await assertLocal(this.vault,record.path,expected);
                if(record.from){if(!from)throw Error('Move observation missing');await assertLocal(this.vault,record.from,from);}
                guard();await this.store.finish(id,'not-applied');
        }
        async delete(namespace: string, request: MutationRequest, useTrash: boolean): Promise<void> {
                await this.commit(namespace, request, 'delete', MISSING, async () => {
                        if (request.before.kind === 'missing') return;
                        if (useTrash && this.vault.trash) await this.vault.trash(request.path); else await this.vault.remove(request.path);
                });
        }
        async move(namespace: string, request: MutationRequest, from: string): Promise<void> {
                await this.commit(namespace, request, 'move', request.before, () => this.vault.rename(from, request.path), from);
        }
        /** Complete proven commits; never replay an old destructive command after restart. */
        async recover(namespace: string,signal?:AbortSignal,eligible:(record:OperationRecord)=>boolean=()=>true): Promise<OperationRecord[]> {
                await this.store.load(); const recovered: OperationRecord[] = [];
                for (const record of this.store.records(namespace).filter(r => (r.status === 'committing' || r.status === 'blocked')&&eligible(r))) {
                        signal?.throwIfAborted();
                        if (record.recovery)try{await this.recovery.verify(record.recovery);}catch(error){throw new SyncFault('recovery-payload',`Saved effect payload needs review: ${diagnosticText(error)}`);}
                        const actual = await observeLocal(this.vault, record.path);
                        const source = record.from ? await observeLocal(this.vault, record.from) : undefined;
                        let status: 'applied' | 'not-applied' | 'blocked';
                        if (sameVersion(actual, record.after) && (!source || source.kind === 'missing')) status = 'applied';
                        else if (record.from ? source && sameVersion(source, record.before) && actual.kind === 'missing' : sameVersion(actual, record.before)) status = 'not-applied';
                        else status = 'blocked';
                        signal?.throwIfAborted();try{await this.store.finish(record.id, status);}catch(error){throw new SyncFault('operation-journal',`Recovery acknowledgement failed: ${diagnosticText(error)}`,'session');}
                        if (status === 'blocked') throw new SyncFault('recovery-review',`Recovery needs review; local bytes preserved: ${record.path}`);
                        if (status === 'applied') recovered.push(record);
                }
                return recovered;
        }
        projectCache(namespace: string, cache: ManifestCache): void {
                for(const baseline of this.store.baselines(namespace))cache.set(baseline.remote.path,{h:baseline.remote.hash,alg:baseline.remote.hashAlg,s:baseline.remote.size});
                for (const record of this.store.records(namespace).filter(r => r.status === 'applied').sort((a, b) => a.appliedSequence! - b.appliedSequence!)) {
                        const effect = record.effect;
                        if (effect?.kind === 'set') cache.set(effect.remote.path, { h: effect.remote.hash, alg: effect.remote.hashAlg, s: effect.remote.size, t: record.createdAt });
                        else if (effect?.kind === 'delete') cache.delete(effect.path);
                        else if (effect?.kind === 'move') { cache.delete(effect.from); if (effect.entry) cache.set(effect.to, effect.entry); }
                }
        }
}
