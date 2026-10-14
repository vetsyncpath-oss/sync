// src/ui/tree-walk.ts — модель дерева vault для модалки структуры-политики
// (Phase 3 модуля Vault Structure Sync Policy; дизайн §4).
//
// ЧИСТЫЙ модуль: без obsidian/node/DOM — только типы из sources/types и
// normalizePolicyPath из core/policy. Всё тестируется изолированно.
//
// Локальное дерево строится из СПИСКА ПУТЕЙ (строки), а не из App/Vault:
// адаптация design §4.1 — модалка (vault-tree-modal.ts) конвертирует
// app.vault.getAllLoadedFiles() → string[] и передаёт сюда. Так walk
// остаётся платформенно-независимым, а obsidian-слой — тонким.
//
// Промежуточные папки выводятся из сегментов путей: пустые локальные папки
// (без файлов) НЕ попадают в дерево — для политики это корректно (правила
// на пустые папки бессмысленны, mirror-чистка всё равно работает по кэшу).

import type { RemoteEntry } from '../sources/types';
import { normalizePolicyPath } from '../core/policy';
import type { RemoteBrowseNode, RemoteBrowseSnapshot } from '../sources/remote-browse';

/** Узел дерева: папка или файл; корень — синтетический узел с path=''. */
export interface TreeNode {
        /** Opaque browse key; legacy/local trees retain path keys. */
        key?: string;
        browseNode?: RemoteBrowseNode;
        kind: 'folder' | 'file';
        /** Нормализованный POSIX-путь; '' у корня. */
        path: string;
        /** Отображаемое имя (последний сегмент). */
        name: string;
        parent: TreeNode | null;
        children: TreeNode[];
        /** Происхождение: локально / удалённо / везде. */
        origin: 'local' | 'remote' | 'both';
        /** Remote-запись, если узел есть в источнике. */
        remoteEntry?: RemoteEntry;
}

/** Корневой синтетический узел (path='', kind='folder'). */
export function makeRoot(origin: TreeNode['origin'] = 'both'): TreeNode {
        return { kind: 'folder', path: '', name: '', parent: null, children: [], origin };
}

/** Найти или создать папку (рекурсивно создаёт всех предков). */
function ensureFolder(nodeByPath: Map<string, TreeNode>, path: string, origin: TreeNode['origin']): TreeNode {
        const existing = nodeByPath.get(path);
        if (existing) return existing;
        const slash = path.lastIndexOf('/');
        const parentPath = slash > 0 ? path.slice(0, slash) : '';
        const parent = parentPath === '' ? nodeByPath.get('')! : ensureFolder(nodeByPath, parentPath, origin);
        const node: TreeNode = {
                kind: 'folder',
                path,
                name: slash > 0 ? path.slice(slash + 1) : path,
                parent,
                children: [],
                origin,
        };
        parent.children.push(node);
        nodeByPath.set(path, node);
        return node;
}

/**
 * Локальное дерево из списков файлов И папок (Phase 4.1: getAllLoadedFiles
 * отдаёт и TFolder — раньше пути папок становились ФАЙЛОВЫМИ узлами,
 * из-за чего вкладка «Текущий vault» показывала «только файлы»). Папки из
 * сегментов путей файлов выводятся как раньше; явный список добавляет
 * пустые папки и делает kind корректным. O(f+d). Дубликаты игнорируются.
 */
export function buildLocalTree(paths: Iterable<string>, explicitFolders: Iterable<string> = []): TreeNode {
        const root = makeRoot('local');
        const nodeByPath = new Map<string, TreeNode>([['', root]]);
        // Сначала явные папки (в т.ч. пустые) — как folder-узлы.
        for (const raw of explicitFolders) {
                const path = normalizePolicyPath(raw);
                if (path === '') continue;
                ensureFolder(nodeByPath, path, 'local');
        }
        for (const raw of paths) {
                const path = normalizePolicyPath(raw);
                if (path === '') continue; // битый путь — пропускаем
                if (nodeByPath.has(path)) continue; // дубликат (папка уже создана)
                const slash = path.lastIndexOf('/');
                const parentPath = slash > 0 ? path.slice(0, slash) : '';
                const parent = ensureFolder(nodeByPath, parentPath, 'local');
                const node: TreeNode = {
                        kind: 'file',
                        path,
                        name: slash > 0 ? path.slice(slash + 1) : path,
                        parent,
                        children: [],
                        origin: 'local',
                };
                parent.children.push(node);
                nodeByPath.set(path, node);
        }
        return root;
}

/**
 * Удалённое дерево из манифеста. Каждый leaf — файл, папки выводятся из
 * сегментов путей (дизайн §4.2). O(n) по числу записей.
 */
export function buildRemoteTree(remote: RemoteEntry[]): TreeNode {
        const root = makeRoot('remote');
        const nodeByPath = new Map<string, TreeNode>([['', root]]);
        for (const entry of remote) {
                const path = normalizePolicyPath(entry.path);
                if (path === '') continue;
                if (nodeByPath.has(path)) continue; // дубликат в манифесте
                const slash = path.lastIndexOf('/');
                const parentPath = slash > 0 ? path.slice(0, slash) : '';
                const parent = ensureFolder(nodeByPath, parentPath, 'remote');
                const node: TreeNode = {
                        kind: 'file',
                        path,
                        name: slash > 0 ? path.slice(slash + 1) : path,
                        parent,
                        children: [],
                        origin: 'remote',
                        remoteEntry: entry,
                };
                parent.children.push(node);
                nodeByPath.set(path, node);
        }
        return root;
}

/** Preserve duplicate names, empty folders and unsafe names using parent IDs. */
export function buildBrowseTree(snapshot: RemoteBrowseSnapshot): TreeNode {
        const root=makeRoot('remote');root.key='';root.name=snapshot.rootName;
        const byKey=new Map<string,TreeNode>([['',root]]);
        for(const node of snapshot.nodes)byKey.set(node.key,{key:node.key,kind:node.kind,path:node.path,name:node.name,
                parent:null,children:[],origin:'remote',remoteEntry:node.entry,browseNode:node});
        for(const node of snapshot.nodes){const item=byKey.get(node.key)!,parent=byKey.get(node.parentKey);
                if(!parent)throw Error('Browse parent is missing');item.parent=parent;parent.children.push(item);}
        return root;
}
export const treeNodeKey = (node: TreeNode): string => node.key ?? node.path;

/** Клон поддерева с перевязкой parent (вход не мутируется). */
function cloneSubtree(src: TreeNode, parent: TreeNode | null): TreeNode {
        const clone: TreeNode = { ...src, parent, children: [] };
        clone.children = src.children.map((c) => cloneSubtree(c, clone));
        return clone;
}

/**
 * Merge локального и удалённого деревьев (дизайн §4.3): union путей,
 * origin пересчитывается — 'both' при совпадении пути И типа узла
 * (файл против папки на одном пути = разные узлы, а не 'both').
 * Входные деревья не мутируются.
 */
export function mergeTrees(local: TreeNode, remote: TreeNode): TreeNode {
        const merged = makeRoot('both');
        mergeInto(merged, local);
        mergeInto(merged, remote);
        return merged;
}

function mergeInto(target: TreeNode, source: TreeNode): void {
        for (const srcChild of source.children) {
                const existing = target.children.find((c) => c.path === srcChild.path && c.kind === srcChild.kind);
                if (existing) {
                        existing.origin = 'both';
                        if (srcChild.remoteEntry) existing.remoteEntry = srcChild.remoteEntry;
                        mergeInto(existing, srcChild);
                } else {
                        const clone = cloneSubtree(srcChild, target);
                        target.children.push(clone);
                }
        }
}

/** Сортировка детей: папки вперёд, далее по алфавиту (numeric collation). */
export function sortChildren(node: TreeNode): void {
        node.children.sort((a, b) => {
                if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
        });
        for (const c of node.children) sortChildren(c);
}

/** Плоский элемент видимого списка (для виртуализации). */
export interface VisibleNode {
        node: TreeNode;
        depth: number;
}

/**
 * Flatten видимой части дерева (дизайн §3.7): depth-first, дети свёрнутой
 * папки не входят (сама строка папки — входит). O(n) по видимым узлам,
 * НЕ по всему vault — свёрнутые поддеревья отсечены.
 *
 * [Phase 4] side-фильтр: 'remote' — узлы, существующие на стороне
 * источника (origin remote|both); 'local' — существующие локально
 * (local|both). Узел, не прошедший фильтр, НЕ показывается вместе со
 * всем поддеревом (двусторонняя вложенность невозможна: origin папки
 * выводится из её файлов). undefined — без фильтра (merged-вид).
 */
export function flattenVisible(
        root: TreeNode,
        expanded: ReadonlySet<string>,
        side?: 'remote' | 'local',
): VisibleNode[] {
        const pass = (node: TreeNode): boolean => {
                if (side === undefined) return true;
                return side === 'remote' ? node.origin !== 'local' : node.origin !== 'remote';
        };
        const out: VisibleNode[] = [];
        const walk = (node: TreeNode, depth: number): void => {
                if (!pass(node)) return;
                out.push({ node, depth });
                if (node.kind === 'folder' && expanded.has(node.path)) {
                        for (const c of node.children) walk(c, depth + 1);
                }
        };
        for (const child of root.children) walk(child, 0);
        return out;
}

/** Все потомки узла (без самого узла), depth-first. */
export function iterDescendants(node: TreeNode): TreeNode[] {
        const out: TreeNode[] = [];
        const walk = (n: TreeNode): void => {
                for (const c of n.children) {
                        out.push(c);
                        walk(c);
                }
        };
        walk(node);
        return out;
}

/** Все предки узла (без самого узла), от ближайшего к корню. */
export function iterAncestors(node: TreeNode): TreeNode[] {
        const out: TreeNode[] = [];
        for (let p = node.parent; p !== null; p = p.parent) out.push(p);
        return out;
}

/** Все узлы дерева (включая корень), depth-first. */
export function iterAll(root: TreeNode): TreeNode[] {
        const out: TreeNode[] = [];
        const walk = (n: TreeNode): void => {
                out.push(n);
                for (const c of n.children) walk(c);
        };
        walk(root);
        return out;
}

/** node находится ПОД maybeAncestor (строго ниже, не равен). */
export function isDescendantOf(node: TreeNode, maybeAncestor: TreeNode): boolean {
        for (let p = node.parent; p !== null; p = p.parent) {
                if (p === maybeAncestor) return true;
        }
        return false;
}

/** Найти узел по пути (null — нет). */
export function findNode(root: TreeNode, path: string): TreeNode | null {
        const norm = normalizePolicyPath(path);
        if (norm === '') return root;
        for (const node of iterAll(root)) {
                if (node.path === norm) return node;
        }
        return null;
}
