import { applyPolicy, type FolderPolicy, type SyncPolicy } from './policy';
import { resolveFileRule } from './file-rules';
import { compileProfiles, type SyncProfile } from './profiles';
import type { PathPolicy } from './path-policy';
import { destinationIsRouted } from './source-bindings';

export type ScopeMode = 'full' | 'obsidian' | 'custom';
const clone = <T>(value: T): T => structuredClone(value);

/** Preserve the first legacy rule, exactly as the execution policy does. */
export function uniqueFolders(folders: readonly FolderPolicy[]): FolderPolicy[] {
    return clone(folders.filter((rule, index) => folders.findIndex(other => other.path === rule.path) === index));
}
export function scopeMode(policy: SyncPolicy): ScopeMode {
    return policy.scopeSelection?.mode ?? policy.preset ?? (policy.folders.length ? 'custom' : 'full');
}
export function setScope(policy: SyncPolicy, mode: ScopeMode): SyncPolicy {
    const next = clone(policy);
    const previousMode = scopeMode(policy);
    const custom = uniqueFolders(previousMode === 'custom' ? policy.folders : policy.scopeSelection?.customFolders ??
        (previousMode==='full'?[{path:'',include:'exclude'},...policy.folders.filter(rule=>rule.path)]:policy.folders));
    next.scopeSelection = { mode, customFolders: custom };
    next.preset = mode;
    if (mode === 'custom') next.folders = clone(custom);
    else {
        // Folder choices are dormant; explicit exclusions and legacy mappings remain effective.
        const exceptions = custom.filter(rule => rule.path && (rule.include === 'exclude' || rule.target ||
            custom.some(parent => parent.path && parent.include === 'exclude' && rule.path.startsWith(parent.path + '/'))));
        next.folders = mode === 'full' ? clone(exceptions) : uniqueFolders([
            ...exceptions.map(rule => ({ ...rule, include: rule.include === 'exclude' ? 'exclude' as const : rule.path==='.obsidian'?'include' as const:rule.path.startsWith('.obsidian/')?rule.include:'inherit' as const })),
            { path: '', include: 'exclude' }, { path: '.obsidian', include: 'include' },
        ]);
    }
    return next;
}
export function setParticipation(policy: SyncPolicy, path: string, include: FolderPolicy['include']): SyncPolicy {
    let next = clone(policy);
    // An explicit inclusion outside .obsidian makes the scope selective, and the label follows it.
    if (scopeMode(next) === 'obsidian' && include === 'include' && path !== '.obsidian' && !path.startsWith('.obsidian/')) {
        next.scopeSelection = { mode: 'custom', customFolders: clone(next.folders) };
        next.preset = 'custom';
    }
    const existing = next.folders.find(rule => rule.path === path);
    next.folders = next.folders.filter(rule => rule.path !== path);
    if (include !== 'inherit' || existing?.target) next.folders.push({ ...existing, path, include });
    const mode = scopeMode(next);
    const custom = mode === 'custom' ? clone(next.folders) : clone(next.scopeSelection?.customFolders ?? policy.folders);
    if (mode !== 'custom') {
        const index = custom.findIndex(rule => rule.path === path);
        const replacement = { ...(index >= 0 ? custom[index] : {}), path, include };
        if (index >= 0) custom.splice(index, 1);
        if (include !== 'inherit' || replacement.target) custom.push(replacement);
    }
    next.scopeSelection = { mode, customFolders: custom };
    return next;
}
export function pathState(policy: SyncPolicy, profiles: readonly SyncProfile[], paths: PathPolicy, path: string, compiled = compileProfiles(policy, profiles)) {
    const rule = resolveFileRule(path, compiled.fileRules);
    const source = rule.source ?? policy.defaultSource;
    // Use the same inclusion, basename/glob and protected-path evaluator as execution.
    const result = applyPolicy([{ path, size: 0, hash: 'ui', hashAlg: 'weak', resolvedDestination: true }], compiled, paths, new Set());
    const state = result.excludedCount ? 'excluded' : !paths.isPathSafe(path) || !paths.isPathAllowed(path) ? 'protected' :
        !source ? 'unassigned' : !destinationIsRouted(path,compiled.fileRules??[],policy.defaultSource,policy.folders)?'excluded':rule.write === 'preserve' ? 'preserve' : 'included';
    return { state, source, rule } as const;
}
