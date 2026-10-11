import { resolveFileRule, deletionLevel, type FileRule, type WriteMode } from '../core/file-rules';
// src/ui/status.ts — статус-движок вкладок модалки политики (Phase 4).
//
// ЧИСТЫЙ модуль: без obsidian/DOM. Считает статус каждой строки для ДВУХ
// вкладок с РАЗНОЙ легендой (односторонняя синхронизация: выбор всегда
// на стороне источника, инспекция — на стороне локали):
//
//   Вкладка «ИСТОЧНИК» (remote → локаль): что произойдёт при sync
//     synced        hash в кэше == hash манифеста (зелёный)
//     changed       hash различается — обновить (жёлтый)
//     new           нет в кэше И на диске — придёт с источника (акцент)
//     conflict-risk на диске, но не в кэше — нетронутость не доказана,
//                   сработает конфликт-резолвер (оранжевый)
//     excluded      эффективный exclude политики (приглушённый)
//
//   Вкладка «ТЕКУЩИЙ VAULT» (локаль → источник): что где лежит
//     synced        в кэше, hash совпадает; t = дата применения (зелёный)
//     changed       в кэше, hash различается — обновится (жёлтый)
//     local-only    нет в манифесте (и не в кэше); [W2-T07] судьба — по
//                   эффективному уровню зеркала: fetch/light — остаётся,
//                   full — корзина (матрица §2.2 «never-synced файл»)
//     deleted-src   был в кэше, исчез из источника (orphan); [W2-T07]
//                   fetch — остаётся, light/full — корзина (§2.2 строка 3)
//     not-synced    есть в источнике/на диске, кэша нет; [W2-T07] подпись
//                   по уровню: full затирает локальную версию (конфликт-
//                   ветка §2.2), light — оставляет, fetch — просто скачает
//     conflict-copy .conflict-* — не синхронизируется никогда (красный)
//     plugin-locked собственная папка плагина (приглушённый)
//
// [W2-T07 / конец BUG-1-UI] Модуль LEVEL-ОСОЗНАН: булево «зеркало вкл/выкл»
// умер — снимок несёт глобальный MirrorLevel + пер-папочные custom-уровни
// (mirrorFolders), статусы local-only/not-synced/deleted-in-source возвращают
// ЭФФЕКТИВНЫЙ уровень пути, а рендер выбирает подпись ровно по семантике
// матрицы §2.2 («модалка обещает то, что сделает движок»).
//
// Данные: кэш + манифест + список локальных путей + политика — БЕЗ
// хэширования локальных файлов (статусы кэш-ориентированы; ленивая
// проверка целостности — отдельная P2-фича).

import type { CacheEntry, FileExclusion, RemoteEntry } from '../sources/types';
import type { SyncPolicy } from '../core/policy';
import { normalizePolicyPath } from '../core/policy';
import { isCovered, levelOf } from '../core/mirror';
import type { MirrorFolders, MirrorLevel, MirrorModel } from '../core/mirror';

// ─── Статусы ───

export type RemoteStatus =
        | { kind: 'rule'; write: WriteMode }
        | { kind: 'synced' }
        | { kind: 'changed' }
        | { kind: 'new' }
        | { kind: 'conflict-risk' }
        | { kind: 'excluded' };

export type LocalStatus =
        | { kind: 'rule'; write: WriteMode }
        | { kind: 'synced'; t?: number }
        | { kind: 'changed' }
        /** [W2-T07] Эффективный уровень пути (custom-цепочка/глобальный);
         *  защита off (Е2) и sync-exclude сворачиваются к 'fetch'. */
        | { kind: 'local-only'; mirrorLevel: MirrorLevel }
        | { kind: 'not-synced'; mirrorLevel: MirrorLevel }
        | { kind: 'deleted-in-source'; mirrorLevel: MirrorLevel }
        | { kind: 'conflict-copy' }
        | { kind: 'plugin-locked' };

/** Цветовая группа статуса → CSS-класс надписи (vts-c-*). */
export type StatusColor = 'ok' | 'warn' | 'accent' | 'danger' | 'faint';

export const REMOTE_COLOR: Record<RemoteStatus['kind'], StatusColor> = {
        rule: 'faint',
        synced: 'ok',
        changed: 'warn',
        new: 'accent',
        'conflict-risk': 'warn',
        excluded: 'faint',
};

export const LOCAL_COLOR: Record<LocalStatus['kind'], StatusColor> = {
        rule: 'faint',
        synced: 'ok',
        changed: 'warn',
        'local-only': 'warn',
        'not-synced': 'warn',
        'deleted-in-source': 'warn',
        'conflict-copy': 'danger',
        'plugin-locked': 'faint',
};

/**
 * [W2-T07] Цвет локального статуса С УЧЁТОМ уровня зеркала: жертвы полного
 * зеркала (local-only/not-synced/full-перезапись) и light/full-orphan'ы —
 * danger («БУДЕТ УДАЛЁН»); прочее — по статической карте LOCAL_COLOR.
 */
export function localStatusColor(st: LocalStatus): StatusColor {
        switch (st.kind) {
                case 'local-only':
                case 'not-synced':
                        return st.mirrorLevel === 'full' ? 'danger' : LOCAL_COLOR[st.kind];
                case 'deleted-in-source':
                        return st.mirrorLevel === 'fetch' ? 'warn' : 'danger';
                default:
                        return LOCAL_COLOR[st.kind];
        }
}

// ─── Входные снимки ───

export interface StatusSnapshot {
        fileRules?: FileRule[];
        /** Манифест источника: path → entry. */
        remote: Map<string, RemoteEntry>;
        /** Кэш последнего применённого состояния: path → entry. */
        cache: Map<string, CacheEntry>;
        /** Локальные пути (файлы на диске). */
        local: Set<string>;
        /** [W2-T07] Глобальный уровень зеркала (замена boolean mirror —
         *  уровень-осознанная семантика BUG-1-UI). */
        mirrorLevel: MirrorLevel;
        /** [W2-T07] Пер-папочные custom-уровни (spec §2.1); пусто/отсутствует —
         *  все пути на глобальном уровне. */
        mirrorFolders?: MirrorFolders;
        /** [W2-T07] Путь исключён из СИНХРА политикой (legacy include/exclude)?
         *  applyPolicy вычищает exclude-поддеревья из плана удалений ДО
         *  mirror-шага — статус обязан обещать то же (не «БУДЕТ УДАЛЁН»). */
        excludedFromSync?: (path: string) => boolean;
        /** Папка самого плагина (например '.obsidian/plugins/v-clone'). */
        pluginDir: string;
}

// ─── Вычисление статусов ───

/** Модель зеркала снимка (для резолверов mirror.ts). */
function mirrorModelOf(snap: StatusSnapshot): MirrorModel {
        return { level: snap.mirrorLevel, folders: snap.mirrorFolders ?? {} };
}

/**
 * [W2-T07] Эффективный уровень для «судьбоносных» статусов (local-only /
 * deleted-in-source): levelOf (custom-цепочка вверх, 'on' прозрачен — Е1-в)
 * с двумя защитами, где движок НЕ удаляет никогда → семантика fetch:
 *  - sync-exclude (excludedFromSync): applyPolicy фильтрует эти поддеревья
 *    до плана удалений (W1-T05);
 *  - вне охвата зеркала (off-папка, Е2): матрица §2.2 «не трогается».
 */
function deletionLevelOf(snap: StatusSnapshot, path: string): MirrorLevel {
        if (snap.excludedFromSync?.(path) === true) return 'fetch';
        const model = mirrorModelOf(snap);
        if (!isCovered(model, path)) return 'fetch';
        return deletionLevel(path, snap.fileRules, levelOf(model, path));
}

/**
 * Статус строки на вкладке ИСТОЧНИКА для remote-пути. excluded —
 * эффективная включённость (та же семантика, что в applyPolicy).
 */
export function remoteStatus(path: string, snap: StatusSnapshot, effectiveInclude: 'include' | 'exclude'): RemoteStatus {
        if (effectiveInclude === 'exclude' || snap.excludedFromSync?.(path)) return { kind: 'excluded' };
        const entry = snap.remote.get(path);
        if (!entry) return { kind: 'excluded' }; // путь не из источника
        const mode = resolveFileRule(path, snap.fileRules).write;
        if (mode && (mode !== 'create' || snap.local.has(path))) return { kind: 'rule', write: mode };
        const cached = snap.cache.get(path);
        if (!cached) {
                // Нет в кэше: новый ИЛИ на диске с локальными правками (конфликт).
                return snap.local.has(path) ? { kind: 'conflict-risk' } : { kind: 'new' };
        }
        if (cached.alg !== entry.hashAlg || cached.h !== entry.hash) return { kind: 'changed' };
        return { kind: 'synced' };
}

/** Статус строки на вкладке ТЕКУЩЕГО VAULT для локального пути. */
export function localStatus(path: string, snap: StatusSnapshot): LocalStatus {
        const norm = normalizePolicyPath(path);
        if (snap.pluginDir !== '' && (norm === snap.pluginDir || norm.startsWith(snap.pluginDir + '/'))) {
                return { kind: 'plugin-locked' };
        }
        if (isConflictCopyName(norm)) return { kind: 'conflict-copy' };
        const mode = resolveFileRule(norm, snap.fileRules).write;
        if (mode === 'preserve' || (mode && snap.remote.has(norm))) return { kind: 'rule', write: mode };
        const cached = snap.cache.get(norm);
        const remote = snap.remote.get(norm);
        if (remote && cached) {
                // Есть в источнике: обновится или синхронизирован.
                if (cached.alg !== remote.hashAlg || cached.h !== remote.hash) return { kind: 'changed' };
                return { kind: 'synced', t: cached.t };
        }
        if (!remote) {
                // Нет в источнике: либо исторический orphan (в кэше), либо local-only.
                // [W2-T07] Уровень — эффективный (с защитами Е2/sync-exclude).
                if (cached) return { kind: 'deleted-in-source', mirrorLevel: deletionLevelOf(snap, norm) };
                return { kind: 'local-only', mirrorLevel: deletionLevelOf(snap, norm) };
        }
        // remote есть, кэша нет: файл НИКОГДА не был успешно применён
        // (первая синхронизация не дошла до него / кэш потерян — например,
        // история Windows-EINVAL). Честный статус — «не синхронизирован»,
        // НЕ local-only (файл существует в источнике!).
        // [W2-T07] Уровень — levelOf без Е2-сворачивания: конфликт-ветка
        // движка (W1-T06/T07) берёт levelOf пути; sync-exclude файл вообще
        // не обрабатывается → fetch-семантика подписи (как в 2.3.3).
        const nsLevel = snap.excludedFromSync?.(norm) === true
                ? 'fetch'
                : levelOf(mirrorModelOf(snap), norm);
        return { kind: 'not-synced', mirrorLevel: nsLevel };
}

/** Конфликт-копия: сегмент имени содержит '.conflict-' (порт PathPolicy). */
function isConflictCopyName(path: string): boolean {
        return /(^|\/)[^/]+\.conflict-/.test(path);
}

// ─── Агрегация для папок ───

/** Счётчики по подмножеству статусов (подпись папки в дереве). */
export interface FolderCounters {
        synced: number;
        changed: number;
        new: number;
        conflictRisk: number;
        excluded: number;
        localOnly: number;
        notSynced: number;
        deletedInSource: number;
        conflictCopies: number;
        pluginLocked: number;
}

export const EMPTY_COUNTERS: FolderCounters = {
        synced: 0, changed: 0, new: 0, conflictRisk: 0, excluded: 0,
        localOnly: 0, notSynced: 0, deletedInSource: 0, conflictCopies: 0, pluginLocked: 0,
};

/**
 * Счётчики статусов ФАЙЛОВ поддерева (папки не считаются — только leaves,
 * чтобы двойной учёт не завышал числа). excludeEffective — для remote-вкладки.
 */
export function folderCounters(
        paths: Iterable<string>,
        side: 'remote' | 'local',
        snap: StatusSnapshot,
        effectiveInclude?: (path: string) => 'include' | 'exclude',
): FolderCounters {
        const c = { ...EMPTY_COUNTERS };
        for (const p of paths) {
                if (side === 'remote') {
                        const inc = effectiveInclude ? effectiveInclude(p) : 'include';
                        const st = remoteStatus(p, snap, inc);
                        if (st.kind === 'rule') continue;
                        if (st.kind === 'synced') c.synced++;
                        else if (st.kind === 'changed') c.changed++;
                        else if (st.kind === 'new') c.new++;
                        else if (st.kind === 'conflict-risk') c.conflictRisk++;
                        else c.excluded++;
                } else {
                        const st = localStatus(p, snap);
                        if (st.kind === 'rule') continue;
                        if (st.kind === 'synced') c.synced++;
                        else if (st.kind === 'changed') c.changed++;
                        else if (st.kind === 'local-only') c.localOnly++;
                        else if (st.kind === 'not-synced') c.notSynced++;
                        else if (st.kind === 'deleted-in-source') c.deletedInSource++;
                        else if (st.kind === 'conflict-copy') c.conflictCopies++;
                        else c.pluginLocked++;
                }
        }
        return c;
}

/**
 * Компактная цветная подпись папки для вкладки ИСТОЧНИКА: без глифов,
 * только слова. Порядок: сначала «тревога» (обновить/новые/риск),
 * затем позитив; пустое поддерево — «N файлов».
 */
export function remoteFolderLabel(c: FolderCounters, totalFiles: number, texts: {
        update: (n: number) => string;
        newFiles: (n: number) => string;
        risk: (n: number) => string;
        files: (n: number) => string;
}): Array<{ color: StatusColor; text: string }> {
        const parts: Array<{ color: StatusColor; text: string }> = [];
        if (c.changed > 0) parts.push({ color: 'warn', text: texts.update(c.changed) });
        if (c.new > 0) parts.push({ color: 'accent', text: texts.newFiles(c.new) });
        if (c.conflictRisk > 0) parts.push({ color: 'warn', text: texts.risk(c.conflictRisk) });
        if (parts.length === 0) {
                parts.push({ color: c.excluded === totalFiles && totalFiles > 0 ? 'faint' : 'ok', text: texts.files(totalFiles) });
        }
        return parts;
}

/**
 * Подпись папки вкладки ТЕКУЩЕГО VAULT: local-only/удалённые — «тревога»,
 * зеркальные жертвы видны на листьях (красным) и здесь же при наличии.
 */
export function localFolderLabel(c: FolderCounters, totalFiles: number, texts: {
        localOnly: (n: number) => string;
        notSynced: (n: number) => string;
        deleted: (n: number) => string;
        conflicts: (n: number) => string;
        files: (n: number) => string;
}): Array<{ color: StatusColor; text: string }> {
        const parts: Array<{ color: StatusColor; text: string }> = [];
        if (c.notSynced > 0) parts.push({ color: 'warn', text: texts.notSynced(c.notSynced) });
        if (c.localOnly > 0) parts.push({ color: 'warn', text: texts.localOnly(c.localOnly) });
        if (c.deletedInSource > 0) parts.push({ color: 'warn', text: texts.deleted(c.deletedInSource) });
        if (c.conflictCopies > 0) parts.push({ color: 'danger', text: texts.conflicts(c.conflictCopies) });
        if (parts.length === 0) parts.push({ color: 'ok', text: texts.files(totalFiles) });
        return parts;
}

// ─── Фильтры вкладок ───

/** Фильтры вкладки ИСТОЧНИКА (id + какие статусы пропускают). */
export type RemoteFilterId = 'all' | 'changes' | 'new' | 'excluded' | 'renamed';

/** Фильтры вкладки ТЕКУЩЕГО VAULT. */
export type LocalFilterId = 'all' | 'local-only' | 'deleted' | 'conflicts' | 'mirror';

/**
 * Пропускает ли ФАЙЛ фильтр remote-вкладки. Папки не фильтруются по
 * статусу (иначе пропадут родители видимых файлов); фильтр вычищает
 * только листья, свёртка пустых папок — забота рендера.
 */
export function remoteFilterPass(
        filter: RemoteFilterId,
        status: RemoteStatus,
        hasTarget: boolean,
): boolean {
        switch (filter) {
                case 'all': return true;
                // [P1/M17] «Изменения» = changed + NEW + conflict-risk: комментарий
                // в vault-tree-modal обещал «update+new+risk одной кнопкой», но new
                // не проходил фильтр — новые файлы исчезали из вкладки при
                // переключении на «Изменения».
                case 'changes': return status.kind === 'changed' || status.kind === 'new' || status.kind === 'conflict-risk' || (status.kind === 'rule' && (status.write === 'update' || status.write === 'remote'));
                case 'new': return status.kind === 'new';
                case 'excluded': return status.kind === 'excluded';
                case 'renamed': return hasTarget;
        }
}

/** Пропускает ли ФАЙЛ фильтр local-вкладки.
 *  [W2-T07] 'mirror' («под угрозой зеркала») = local-only на эффективном
 *  уровне light|full: full кладёт never-synced в корзину, light — нет
 *  (матрица §2.2); not-synced источником не является (он скачается). */
export function localFilterPass(filter: LocalFilterId, status: LocalStatus): boolean {
        switch (filter) {
                case 'all': return true;
                case 'local-only': return status.kind === 'local-only' || status.kind === 'not-synced';
                case 'deleted': return status.kind === 'deleted-in-source';
                case 'conflicts': return status.kind === 'conflict-copy';
                case 'mirror': return status.kind === 'local-only' && status.mirrorLevel !== 'fetch';
        }
}

// ─── Дата ───

/** «24.08» из epoch-ms (день.месяц, без времени — решение пользователя). */
export function formatSyncDay(t: number): string {
        const d = new Date(t);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}.${mm}`;
}

// ─── Пресеты ───

/** Пресет структуры (настройки/шапка модалки). */
export type StructurePreset = 'full' | 'obsidian' | 'custom';

/** Прочитать пресет из политики (custom — есть ручные правила). */
export function presetOf(policy: SyncPolicy | undefined): StructurePreset {
        if (!policy) return 'full';
        if (policy.preset === 'full' || policy.preset === 'obsidian') return policy.preset;
        return 'custom';
}

/**
 * [overhaul v4 / Этап 4] Глобальные исключения — machine-specific файлы,
 * которые не имеют смысла синхронизировать: они либо содержат секреты/
 * локальные настройки (data.json, journal), либо это мусор ОС (.DS_Store,
 * Thumbs.db). Применяются в обоих пресетах ниже.
 *
 * Файлы внутри pluginDir (data.json, data.json.bak, vault-sync-journal.json,
 * manifest-*.json) — machine-specific, содержат секреты и журналы. Они НЕ
 * должны попадать в синк, иначе конфигурация одной машины перезапишет
 * конфигурацию другой.
 *
 * Файлы типа .DS_Store / Thumbs.db — глобально исключаются (мусор ОС).
 */
const GLOBAL_FILE_EXCLUSIONS: readonly FileExclusion[] = [
        { pattern: '.DS_Store', note: 'macOS metadata' },
        { pattern: 'Thumbs.db', note: 'Windows thumbnail cache' },
        { pattern: '*.tmp', note: 'temp files' },
        { pattern: '*.bak', note: 'backup files (generic)' },
];

/** [overhaul v4 / Этап 4] Machine-specific файлы внутри pluginDir. */
function pluginFileExclusions(pluginDir: string): FileExclusion[] {
        if (!pluginDir) return [];
        return [
                { pattern: 'data.json', scope: pluginDir, note: 'plugin secrets (machine-specific)' },
                { pattern: 'data.json.bak', scope: pluginDir, note: 'plugin backup snapshot' },
                { pattern: 'vault-sync-journal.json', scope: pluginDir, note: 'local session journal' },
                { pattern: 'manifest-*.json', scope: pluginDir, note: 'manifest cache files (per-sourceId)' },
        ];
}

/**
 * Политика пресета «Только .obsidian».
 *
 * [overhaul v4 / Этап 4] Granular: корень exclude, .obsidian include.
 * Папка плагина БОЛЬШЕ НЕ исключается целиком — вместо этого через
 * fileExclusions точечно исключаются machine-specific файлы (data.json,
 * data.json.bak, vault-sync-journal.json, manifest-*.json). main.js,
 * manifest.json, styles.css — ОСТАЮТСЯ в синке, что позволяет плагину
 * обновляться на других машинах через sync без ручной установки.
 *
 * Бонус: глобально исключены .DS_Store / Thumbs.db / *.tmp / *.bak.
 */
export function obsidianOnlyPolicy(pluginDir: string): SyncPolicy {
        const folders = [
                { path: '', include: 'exclude' as const },
                { path: '.obsidian', include: 'include' as const },
        ];
        return {
                version: 1,
                mirror: false,
                preset: 'obsidian',
                folders,
                fileExclusions: [
                        ...pluginFileExclusions(pluginDir),
                        ...GLOBAL_FILE_EXCLUSIONS,
                ],
        };
}

/**
 * Политика пресета «Полный vault».
 *
 * [overhaul v4 / Этап 4] Granular: папка плагина БОЛЬШЕ НЕ исключается
 * целиком. main.js / manifest.json / styles.css теперь в синке — плагин
 * обновляется на других машинах через sync. Machine-specific файлы
 * (data.json, journal, manifest-*.json) исключены через fileExclusions.
 */
export function fullVaultPolicy(pluginDir: string): SyncPolicy {
        return {
                version: 1,
                mirror: false,
                preset: 'full',
                folders: [],
                fileExclusions: [
                        ...pluginFileExclusions(pluginDir),
                        ...GLOBAL_FILE_EXCLUSIONS,
                ],
        };
}
