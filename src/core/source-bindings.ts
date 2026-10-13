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

/** Invert the winning assignment; require an unambiguous round trip before uploading. */
export function sourcePathForDestination(local:string,source:string,rules:readonly FileRule[],defaultSource:string,folders:readonly FolderPolicy[]=[]):string|undefined {
    const resolved=resolveFileRule(local,rules);
    if((resolved.source??defaultSource)!==source)return undefined;
    const binding=resolved.sourceRule===undefined?undefined:rules[resolved.sourceRule];
    let remote=local;
    if(binding?.remotePath!==undefined){
        remote=binding.scope==='file'?binding.remotePath:[binding.remotePath,local.split('/').slice(binding.path?binding.path.split('/').length:0).join('/')].filter(Boolean).join('/');
    }else{
        const targets=folders.filter(f=>f.target).map(f=>({rule:f,local:computeLocalPath(f.path,f.path,f)}))
            .filter(f=>canonical(local)===canonical(f.local)||canonical(local).startsWith(canonical(f.local)+'/')).sort((a,b)=>b.local.length-a.local.length);
        if(targets[1]&&canonical(targets[0].local)===canonical(targets[1].local))throw Error('Ambiguous source mapping');
        if(targets[0])remote=[targets[0].rule.path,local.split('/').slice(targets[0].local.split('/').length).join('/')].filter(Boolean).join('/');
    }
    const map=(path:string)=>{const f=folders.filter(f=>f.target&&(!f.path||path===f.path||path.startsWith(f.path+'/'))).sort((a,b)=>b.path.length-a.path.length)[0];return f?computeLocalPath(path,f.path,f):path;};
    const paths=sourceCandidates(remote,source,rules,defaultSource,map).map(path=>resolveFileRule(path,rules).remotePath!==undefined?path:map(path));
    return paths.some(p=>canonical(p)===canonical(local))?remote:undefined;
}
