import type { DeleteMode, ResolvedFileRule, RuleConflict, WriteMode } from './file-rules';

export type SyncDirection = 'pull' | 'bidirectional';
export interface EffectiveBehavior {
    direction: SyncDirection;
    createMissingLocal: boolean;
    createMissingRemote: boolean;
    updates: 'none' | 'on-source-change' | 'enforce-source' | 'changed-side';
    deletions: 'keep' | 'tracked' | 'all' | 'propagate-trash';
    conflict: { action: 'keep-local' | 'keep-remote' | 'ask'; keepOther: boolean };
    protected: boolean;
}

/** Canonical view of compatibility fields. No second independently editable policy is stored. */
export function effectiveBehavior(rule: Pick<ResolvedFileRule, 'write' | 'delete' | 'conflict' | 'direction'>,
    fallbackConflict: RuleConflict = 'keep-both'): EffectiveBehavior {
    const write: WriteMode = rule.write ?? 'update', deletion: DeleteMode = rule.delete ?? 'keep';
    const direction = rule.direction ?? 'pull';
    if (direction !== 'pull' && direction !== 'bidirectional') throw Error('Invalid sync direction');
    const choice = rule.conflict ?? fallbackConflict;
    const conflict: EffectiveBehavior['conflict'] = choice === 'ask' ? { action: 'ask', keepOther: true }
        : choice === 'local-wins' || choice === 'incoming' ? { action: 'keep-local', keepOther: choice === 'incoming' }
        : { action: 'keep-remote', keepOther: true };
    if (write === 'preserve') return { direction, createMissingLocal: false, createMissingRemote: false,
        updates: 'none', deletions: 'keep', conflict, protected: true };
    if (direction === 'bidirectional') {
        if (write !== 'changes' || deletion === 'mirror' || choice === 'incoming'||choice==='local-wins') throw Error('Incompatible bidirectional profile; publishing over an existing Drive ID awaits concurrency validation');
        return { direction, createMissingLocal: true, createMissingRemote: true, updates: 'changed-side',
            deletions: deletion === 'keep' ? 'keep' : 'propagate-trash', conflict, protected: false };
    }
    return { direction, createMissingLocal: true, createMissingRemote: false,
        updates: write === 'create' ? 'none' : write === 'remote' ? 'enforce-source' : 'on-source-change',
        deletions: deletion === 'mirror' ? 'all' : deletion,
        conflict: write === 'update' ? { action: 'keep-local', keepOther: false } : conflict, protected: false };
}
