/** Independent, source-specific policies on final vault paths. Absence preserves legacy behaviour. */
export type WriteMode = 'preserve' | 'create' | 'update' | 'remote' | 'changes';
export type DeleteMode = 'keep' | 'tracked' | 'mirror';
export type RuleConflict = 'keep-both' | 'local-wins' | 'remote-wins' | 'ask' | 'incoming';
export interface FileRule {
    direction?: import('./profile-policy').SyncDirection;
    source?: string;
    remotePath?: string;
    conflict?: RuleConflict;
    scope: 'vault' | 'folder' | 'file';
    path: string;
    /** Optional exact basenames within a vault/folder, not extensions or globs. */
    names?: string[];
    write?: WriteMode;
    delete?: DeleteMode;
}
export interface ResolvedFileRule { direction?: import('./profile-policy').SyncDirection; write?: WriteMode; delete?: DeleteMode; writeRule?: number; deleteRule?: number; source?: string; sourceRule?: number; remotePath?: string; conflict?: RuleConflict }
const writes = ['preserve', 'create', 'update', 'remote', 'changes'];
const deletes = ['keep', 'tracked', 'mirror'];
function validPath(path: unknown): path is string {
    return typeof path === 'string' && path === path.trim() && !/[\\\x00-\x1f:*?"<>|]/.test(path)
        && !path.startsWith('/') && !path.endsWith('/')
        && path.split('/').every(s => s !== '' && s !== '.' && s !== '..' && !/[. ]$/.test(s));
}
/** Reject corrupt rules rather than silently removing protection. */
export function validateFileRules(value: unknown): asserts value is FileRule[] | undefined {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length > 500) throw new Error('Invalid file rules: expected at most 500 rules');
    value.forEach((r, i) => {
        const fail = () => { throw new Error(`Invalid file rule ${i + 1}`); };
        if (!r || typeof r !== 'object' || !['vault', 'folder', 'file'].includes(r.scope)) return fail();
        if (r.scope === 'vault' ? r.path !== '' : !validPath(r.path)) return fail();
        if (r.write !== undefined && !writes.includes(r.write)) return fail();
        if (r.direction !== undefined && !['pull', 'bidirectional'].includes(r.direction)) return fail();
        if (r.delete !== undefined && !deletes.includes(r.delete)) return fail();
        if (r.source !== undefined && (typeof r.source !== 'string' || !r.source)) return fail();
        if (r.conflict !== undefined && !['keep-both','local-wins','remote-wins','ask','incoming'].includes(r.conflict)) return fail();
        if (r.write === undefined && r.delete === undefined && r.source === undefined) return fail();
        if (r.remotePath !== undefined && (!r.source || (r.remotePath !== '' && !validPath(r.remotePath)) || (r.scope==='file' && !r.remotePath))) return fail();
        if (r.names !== undefined && (r.scope === 'file' || !Array.isArray(r.names) || !r.names.length
            || r.names.some((n: unknown) => !validPath(n) || n.includes('/')))) return fail();
    });
}
const canonical = (p: string) => p.normalize('NFC').toLowerCase();
/** Exact file > deepest folder > vault; name filter > whole scope; last equal rule wins, per axis. */
export function resolveFileRule(path: string, rules?: readonly FileRule[]): ResolvedFileRule {
    const p = canonical(path), name = p.slice(p.lastIndexOf('/') + 1);
    const matches = (rules ?? []).map((r, i) => ({ r, i })).filter(({ r }) => {
        const root = canonical(r.path);
        return (r.scope === 'vault' || (r.scope === 'file' ? p === root : p.startsWith(root + '/')))
            && (!r.names || r.names.some(n => canonical(n) === name));
    }).sort((a, b) => {
        const rank = (r: FileRule) => r.scope === 'file' ? 10000 : r.scope === 'vault' ? 0 : r.path.split('/').length;
        return rank(a.r) - rank(b.r) || Number(!!a.r.names) - Number(!!b.r.names) || a.i - b.i;
    });
    const result: ResolvedFileRule = {};
    for (const { r, i } of matches) {
        if (r.direction !== undefined) result.direction = r.direction;
        if (r.write !== undefined) { result.write = r.write; result.writeRule = i; }
        if (r.delete !== undefined) { result.delete = r.delete; result.deleteRule = i; }
        if (r.conflict !== undefined) result.conflict = r.conflict;
        if (r.source !== undefined) {
            const previous = result.sourceRule === undefined ? undefined : rules![result.sourceRule];
            if (previous && previous.scope === r.scope && canonical(previous.path) === canonical(r.path)
                && !!previous.names === !!r.names && (result.source !== r.source || previous.remotePath !== r.remotePath)) throw new Error(`Conflicting source assignments for ${path}`);
            result.source = r.source; result.sourceRule = i; result.remotePath = r.remotePath;
        }
    }
    // “Do not touch” is a protection, including when a parent requests mirroring.
    if (result.write === 'preserve') result.delete = 'keep';
    return result;
}
export function deletionLevel(path: string, rules: readonly FileRule[] | undefined, fallback: 'fetch' | 'light' | 'full') {
    const mode = resolveFileRule(path, rules).delete;
    return mode === 'keep' ? 'fetch' : mode === 'tracked' ? 'light' : mode === 'mirror' ? 'full' : fallback;
}
export const PLUGIN_CODE_FILES = ['main.js', 'manifest.json', 'styles.css'];

/** Prefix/exact/basename classes include absent descendants. Fresh segments represent
 * the complement of every literal in the rules, rather than an observed file. */
export function symbolicRulePaths(rules:readonly FileRule[],extraRoots:readonly string[]=[]):string[]{
    const roots=new Set(['',...extraRoots]),names=new Set<string>(),segments=new Set<string>();
    for(const rule of rules){for(const segment of rule.path.split('/'))segments.add(canonical(segment));
        if(rule.scope==='file'){roots.add(rule.path);roots.add(rule.path.split('/').slice(0,-1).join('/'));names.add(rule.path.split('/').pop()!);}
        else roots.add(rule.path);
        for(const name of rule.names??[])names.add(name);
    }
    let fresh='__sync_scope__';while(segments.has(canonical(fresh))||[...names].some(name=>canonical(name)===canonical(fresh)))fresh+='_';
    names.add(fresh);const paths=new Set<string>();
    for(const root of roots){if(root)paths.add(root);for(const name of names){paths.add([root,name].filter(Boolean).join('/'));paths.add([root,fresh,name].filter(Boolean).join('/'));}
        if(paths.size>100_000)throw Error('Policy symbolic partition exceeds its limit; narrow the assignments before activation');}
    return [...paths];
}
