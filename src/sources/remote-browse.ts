import type { RemoteEntry } from './types';

/** Browse identities are independent of executable vault paths. */
export interface RemoteBrowseDiagnostic {
    code: 'repeated-object' | 'inconsistent-object' | 'duplicate-name' | 'target-alias' | 'unsafe-name' | 'cycle' | 'parent-mismatch';
    message: string;
    objectIds: string[];
    paths: string[];
    severity: 'info' | 'warning' | 'error';
}
export interface RemoteBrowseNode {
    key: string; parentKey: string; objectId: string; parentId: string;
    name: string; path: string; kind: 'file' | 'folder';
    mimeType: string; version: string; unsupported: boolean;
    blocked?: string; entry?: RemoteEntry;
}
export interface RemoteBrowseSnapshot {
    rootId: string; rootName: string; nodes: RemoteBrowseNode[];
    diagnostics: RemoteBrowseDiagnostic[]; completeness: 'complete' | 'unstable';
}
export type SourceBrowseResult = RemoteEntry[] | RemoteBrowseSnapshot;

/** Validate identities/edges without rejecting duplicate or unsafe display names. */
export function validateBrowseSnapshot(snapshot: RemoteBrowseSnapshot): void {
    if (!snapshot || typeof snapshot.rootId !== 'string' || !snapshot.rootId || typeof snapshot.rootName !== 'string' || !Array.isArray(snapshot.nodes)
        || snapshot.nodes.length > 100_000 || !Array.isArray(snapshot.diagnostics)
        || !['complete', 'unstable'].includes(snapshot.completeness)) throw Error('Invalid browse snapshot');
    const keys = new Set<string>(['']);
    const parents = new Map<string, string>();
    const kinds=new Map<string,string>([['','folder']]);
    for (const node of snapshot.nodes) {
        if (!node || typeof node.key !== 'string' || !node.key || keys.has(node.key) || typeof node.parentKey !== 'string'
            || typeof node.objectId !== 'string' || !node.objectId || typeof node.parentId !== 'string' || !node.parentId || typeof node.name !== 'string' || typeof node.path !== 'string'
            || typeof node.mimeType !== 'string' || typeof node.version !== 'string' || typeof node.unsupported !== 'boolean'
            || node.blocked!==undefined&&typeof node.blocked!=='string'
            || !['file', 'folder'].includes(node.kind)) throw Error('Invalid browse node identity');
        keys.add(node.key); parents.set(node.key, node.parentKey);kinds.set(node.key,node.kind);
    }
    for (const node of snapshot.nodes) {
        if(kinds.get(node.parentKey)!=='folder')throw Error('Invalid browse parent graph: parent is not a folder');
        const seen = new Set<string>(); let key = node.key;
        while (key) {
            if (seen.has(key) || seen.size > 100 || !keys.has(key)) throw Error('Invalid browse parent graph');
            seen.add(key); key = parents.get(key)!;
        }
    }
}
