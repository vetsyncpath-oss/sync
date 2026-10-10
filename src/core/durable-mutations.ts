import type { ManifestCache } from './manifest-cache';
import type { VaultAdapter } from '../sources/types';
import { OperationStore, type CacheEffect, type OperationRecord } from './operation-store';
import { RecoveryStore } from './recovery-store';
import { assertLocal, MISSING, observeLocal, sameVersion, StalePlanError, versionOf, type LocalVersion } from './local-version';

export interface MutationRequest {
        id: string; planId: string; path: string; before: LocalVersion; effect?: CacheEffect;
        /** Checks cancellation, config revision and policy, including after each async prerequisite. */
        guard(): void;
}
export class DurableMutations {
        constructor(readonly store: OperationStore, readonly recovery: RecoveryStore, private readonly vault: VaultAdapter) {}
        private async commit(namespace: string, request: MutationRequest, kind: OperationRecord['kind'], after: LocalVersion, action: () => Promise<void>, from?: string): Promise<void> {
                request.guard(); await assertLocal(this.vault, from ?? request.path, request.before);
                if (from) await assertLocal(this.vault, request.path, MISSING);
                const recovery = request.before.kind === 'file' && (kind !== 'write' || !sameVersion(request.before, after))
                        ? await this.recovery.save(await this.vault.readBinary(from ?? request.path)) : undefined;
                if (recovery && (recovery.sha256 !== (request.before.kind === 'file' ? request.before.sha256 : '') || recovery.size !== (request.before.kind === 'file' ? request.before.size : -1))) throw new Error('Local file changed during recovery');
                request.guard(); await assertLocal(this.vault, from ?? request.path, request.before);
                if (from) await assertLocal(this.vault, request.path, MISSING);
                const record: OperationRecord = { id: request.id, planId: request.planId, path: request.path, before: request.before,
                        effect: request.effect, namespace, kind, from, after, recovery, status: 'committing', createdAt: Date.now() };
                await this.store.begin(record);
                let started = false;
                try {
                        request.guard(); await assertLocal(this.vault, from ?? request.path, request.before);
                        if (from) await assertLocal(this.vault, request.path, MISSING);
                        request.guard(); started = true; await action();
                        if (!sameVersion(await observeLocal(this.vault, request.path), after) || (from && (await observeLocal(this.vault, from)).kind !== 'missing')) throw new Error('Mutation result verification failed');
                        await this.store.finish(record.id, 'applied');
                } catch (error) {
                        // An observed stale precondition proves that our commit was not made.
                        // An arbitrary IO error can be thrown after a write; retain its intent.
                        if (!started || error instanceof StalePlanError) await this.store.finish(record.id, 'not-applied');
                        throw error;
                }
        }
        async write(namespace: string, request: MutationRequest, data: ArrayBuffer, signal?: AbortSignal): Promise<void> {
                const after = await versionOf(data);
                await this.commit(namespace, request, 'write', after, async () => {
                        if (sameVersion(request.before, after)) return;
                        if (request.before.kind === 'file' && this.vault.compareAndWrite) {
                                const previous = await this.vault.readBinary(request.path); request.guard();
                                if (!sameVersion(await versionOf(previous), request.before)) throw new StalePlanError(request.path);
                                const result = await this.vault.compareAndWrite(request.path, data, previous, signal);
                                if (result === false) throw new StalePlanError(request.path);
                                if (result === true) return;
                        }
                        request.guard(); await assertLocal(this.vault, request.path, request.before); request.guard();
                        await this.vault.writeBinary(request.path, data);
                });
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
        async recover(namespace: string): Promise<OperationRecord[]> {
                await this.store.load(); const recovered: OperationRecord[] = [];
                for (const record of this.store.records(namespace).filter(r => r.status === 'committing' || r.status === 'blocked')) {
                        if (record.recovery) await this.recovery.verify(record.recovery);
                        const actual = await observeLocal(this.vault, record.path);
                        const source = record.from ? await observeLocal(this.vault, record.from) : undefined;
                        let status: 'applied' | 'not-applied' | 'blocked';
                        if (sameVersion(actual, record.after) && (!source || source.kind === 'missing')) status = 'applied';
                        else if (record.from ? source && sameVersion(source, record.before) && actual.kind === 'missing' : sameVersion(actual, record.before)) status = 'not-applied';
                        else status = 'blocked';
                        await this.store.finish(record.id, status);
                        if (status === 'blocked') throw new Error(`Recovery needs review; local bytes preserved: ${record.path}`);
                        if (status === 'applied') recovered.push(record);
                }
                return recovered;
        }
        projectCache(namespace: string, cache: ManifestCache): void {
                for (const record of this.store.records(namespace).filter(r => r.status === 'applied').sort((a, b) => a.appliedSequence! - b.appliedSequence!)) {
                        const effect = record.effect;
                        if (effect?.kind === 'set') cache.set(effect.remote.path, { h: effect.remote.hash, alg: effect.remote.hashAlg, s: effect.remote.size, t: record.createdAt });
                        else if (effect?.kind === 'delete') cache.delete(effect.path);
                        else if (effect?.kind === 'move') { cache.delete(effect.from); if (effect.entry) cache.set(effect.to, effect.entry); }
                }
        }
}
