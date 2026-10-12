import { resolveFileRule, type FileRule } from './file-rules';

const canonical = (path: string) => path.normalize('NFC').toLowerCase();
/** Map an inventory path through one explicit source→vault assignment. */
export function bindingDestination(remote: string, rule: FileRule): string | undefined {
    if (rule.remotePath === undefined) return undefined;
    const root = canonical(rule.remotePath), path = canonical(remote);
    if (rule.scope === 'file') return path === root ? rule.path : undefined;
    if (root && !path.startsWith(root + '/')) return undefined;
    const suffix = root ? remote.split('/').slice(rule.remotePath.split('/').length).join('/') : remote;
    return [rule.path, suffix].filter(Boolean).join('/');
}
/** Only the winning source assignment may publish its candidate destination. */
export function sourceCandidates(remote: string, source: string, rules: readonly FileRule[],
    defaultSource: string, legacyMap: (path: string) => string): string[] {
    const output = new Set<string>();let mapped=false;
    rules.forEach((rule, index) => {
        if (rule.source !== source) return;
        const local = bindingDestination(remote, rule);
        if (!local || (rule.names && !rule.names.some(n=>canonical(n)===canonical(remote.split('/').pop()!)))) return;
        mapped=true;
        const resolved = resolveFileRule(local, rules);
        if (resolved.source === source && resolved.sourceRule === index) output.add(local);
    });
    // A mounted subtree is consumed by its bindings, including child overrides;
    // it must not also appear under its original remote-relative location.
    if(!mapped){
        const legacy = legacyMap(remote), fallback = resolveFileRule(legacy, rules);
        if ((fallback.source ?? defaultSource) === source && fallback.remotePath === undefined) output.add(remote);
    }
    return [...output];
}
