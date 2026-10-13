import { resolveFileRule, type FileRule } from './file-rules';
import { computeLocalPath, type FolderPolicy } from './policy';

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
        if (!local) return;
        mapped=true;
        if(rule.names && !rule.names.some(n=>canonical(n)===canonical(remote.split('/').pop()!)))return;
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

/** Whether a final local path belongs to a published route, including a filtered mount's consumed siblings. */
export function destinationIsRouted(path:string,rules:readonly FileRule[],defaultSource:string|undefined,folders:readonly FolderPolicy[]=[]):boolean {
    const resolved=resolveFileRule(path,rules),owner=resolved.source??defaultSource;
    if(!owner)return false;
    if(resolved.remotePath!==undefined)return true;
    const candidates=folders.filter(rule=>rule.target).map(rule=>({rule,local:computeLocalPath(rule.path,rule.path,rule)}))
        .filter(({local})=>canonical(path)===canonical(local)||canonical(path).startsWith(canonical(local)+'/'))
        .sort((a,b)=>b.local.split('/').length-a.local.split('/').length);
    if(candidates.length>1&&canonical(candidates[0].local)===canonical(candidates[1].local))return false;
    const target=candidates[0];
    const remote=target?[target.rule.path,path.split('/').slice(target.local.split('/').length).join('/')].filter(Boolean).join('/'):path;
    const map=(raw:string)=>{
        const rule=folders.filter(rule=>rule.target&&(!rule.path||raw===rule.path||raw.startsWith(rule.path+'/'))).sort((a,b)=>b.path.length-a.path.length)[0];
        return rule?computeLocalPath(raw,rule.path,rule):raw;
    };
    return sourceCandidates(remote,owner,rules,defaultSource??'',map).some(candidate=>canonical(resolveFileRule(candidate,rules).remotePath!==undefined?candidate:map(candidate))===canonical(path));
}
