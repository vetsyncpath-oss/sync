import type { SyncPolicy } from './policy';
import { validateFileRules, type FileRule, type WriteMode, type DeleteMode, type RuleConflict } from './file-rules';
import type { MirrorLevel } from './mirror';
import type { SyncSource } from '../sources/types';
export interface SyncProfile {
    id: string; name: string; write: WriteMode; delete: DeleteMode; conflict?: RuleConflict;
    /** Named connection; absent inherits the enclosing assignment's connection. */
    source?: string; builtin?: boolean;
}
export interface ProfileAssignment { scope: FileRule['scope']; path: string; names?: string[]; profileId: string }
export interface SourceConnection { id: string; name: string; kind: SyncSource['kind']; values: Record<string, unknown> }
export const STANDARD_PROFILES: readonly SyncProfile[] = [
    {id:'standard:preserve',name:'Не трогать',write:'preserve',delete:'keep',builtin:true},
    {id:'standard:seed',name:'Установить только отсутствующие',write:'create',delete:'keep',builtin:true},
    {id:'standard:safe',name:'Обновлять без локальных правок',write:'update',delete:'keep',builtin:true},
    {id:'standard:source',name:'Версия источника без удалений',write:'remote',delete:'keep',builtin:true},
    {id:'standard:conflicts',name:'Обновлять с сохранением конфликтной копии',write:'changes',delete:'keep',conflict:'keep-both',builtin:true},
];
export function validateProfiles(profiles: readonly SyncProfile[], connections: readonly SourceConnection[] = []): void {
    const ids = new Set<string>();
    for (const c of connections) {
        if (!c.id || c.id === 'primary' || ids.has(c.id) || !c.name.trim() || !['git','yandex','zip-url','gdrive','webdav'].includes(c.kind)
            || !c.values || typeof c.values !== 'object' || Array.isArray(c.values)) throw new Error('Invalid source connection');
        ids.add(c.id);
    }
    const sources = ids; const seen = new Set<string>();
    for (const p of profiles) {
        if (!p.id || seen.has(p.id) || !p.name.trim() || !p.write || !p.delete) throw new Error('Invalid or duplicate profile');
        seen.add(p.id);
        validateFileRules([{scope:'vault',path:'',write:p.write,delete:p.delete,conflict:p.conflict,source:p.source}]);
        if (p.source && p.source !== 'primary' && !sources.has(p.source)) throw new Error(`Unknown source in profile: ${p.name}`);
    }
}
export function compileProfiles(policy: SyncPolicy, profiles: readonly SyncProfile[]): SyncPolicy {
    if (policy.assignments === undefined) return structuredClone(policy);
    const library = new Map(profiles.map(p => [p.id,p]));
    const assignedRules: FileRule[] = policy.assignments.map(a => {
        const p = library.get(a.profileId); if (!p) throw new Error(`Missing profile: ${a.profileId}`);
        return {scope:a.scope,path:a.path,...(a.names ? {names:[...a.names]} : {}),write:p.write,delete:p.delete,conflict:p.conflict,source:p.source};
    });
    const fileRules:FileRule[]=[{scope:'vault',path:'',write:'update',delete:'keep'},...assignedRules];
    validateFileRules(fileRules);
    // Validate source overlaps even when a matching file is currently absent.
    for (const rule of fileRules) for (const name of rule.names ?? ['__file__']) {
        resolveFileRule(rule.scope==='file'?rule.path:[rule.path,name].filter(Boolean).join('/'),fileRules);
    }
    return {...structuredClone(policy),fileRules};
}
/** One-time conversion, including per-folder legacy levels and already-created file rules. */
export function migrateProfilePolicy(policy: SyncPolicy, profiles: SyncProfile[], key: string,
    level: MirrorLevel, conflict: RuleConflict, light: 'keep-local' | 'keep-both'): SyncPolicy {
    if (policy.assignments !== undefined) return structuredClone(policy);
    const result = structuredClone(policy);const assignments: ProfileAssignment[]=[];
    const add = (r: FileRule, label: string) => {
        const id=`migrated:${key}:${assignments.length}`;
        if (!profiles.some(p=>p.id===id)) profiles.push({id,name:label,write:r.write ?? 'changes',delete:r.delete ?? 'keep',conflict:r.conflict,source:r.source});
        assignments.push({scope:r.scope,path:r.path,names:r.names,profileId:id});
    };
    const legacy = (l: MirrorLevel): Pick<FileRule,'write'|'delete'|'conflict'> => ({
        write:l==='full'?'remote':'changes',delete:l==='full'?'mirror':l==='light'?'tracked':'keep',
        conflict:l==='light'?(light==='keep-local'?'incoming':'keep-both'):conflict,
    });
    add({scope:'vault',path:'',...legacy(level)},'Перенесённые настройки');
    for (const [path,r] of Object.entries(policy.mirrorFolders ?? {})) if (r.state==='custom' && r.level) {
        add({scope:path?'folder':'vault',path,...legacy(r.level)},`Перенесено: ${path || 'vault'}`);
    }
    // Existing partial file rules inherit the already-compiled root/folder settings per axis.
    for (const r of policy.fileRules ?? []) {
        const base=resolveMigrated(r.scope==='file'?r.path:[r.path,r.names?.[0]??'__file__'].filter(Boolean).join('/'),assignments,profiles);
        add({...base,...r},`Перенесённое правило ${assignments.length}`);
    }
    result.assignments=assignments; delete result.fileRules;
    result.mirror=false;
    result.mirrorFolders=Object.fromEntries(Object.entries(result.mirrorFolders ?? {}).filter(([,r])=>r.state!=='custom'));
    return result;
}
import { resolveFileRule } from './file-rules';
function resolveMigrated(path:string, assignments:ProfileAssignment[], profiles:SyncProfile[]):FileRule {
    const resolved=resolveFileRule(path,compileProfiles({version:1,mirror:false,folders:[],assignments},profiles).fileRules);
    return {scope:'file',path,write:resolved.write,delete:resolved.delete,conflict:resolved.conflict,source:resolved.source};
}
