// src/core/mirror.ts — модель зеркала 3.0: уровни × охват × план удалений.
// [W1-T04, overhaul 3.0] Канон: implementation spec §2 (матрица §2.2),
// решения Д1 (охват отдельно от уровня), Д2 (пер-папочные override,
// «ближайший к файлу побеждает»), Е1 (полное зеркало: локальная конфликтная
// версия — в корзину), Е2 (исключение = защита: off-папки не удаляются
// никогда, ни на каком уровне).
//
// ЗАЧЕМ: в 2.3.3 «зеркало» строилось только по ключам кэша (BUG-1: UI
// обещал «клон хозяйского vault», движок не удалял local-only файлы и
// лишние папки) и имело ДВА источника правды об удалениях (BUG-5:
// тумблер deleteMissing против policy.mirror). Этот модуль — единая
// модель: MirrorLevel (fetch/light/full) × FolderState (off/on/custom)
// и ЧИСТАЯ функция плана удалений по матрице §2.2. I/O (скан vault) —
// отдельная функция scanVaultTree поверх VaultAdapter.
//
// ЧИСТОТА: модуль ядра — без obsidian/node; импортирует только тип
// VaultAdapter, normalizePolicyPath из ./policy и pMap из utils.
//
// СЕМАНТИКА РЕШЕНИЙ (зафиксирована тестами tests/mirror.test.ts):
//   - resolveForFile/resolveForFolder → isCovered/isFolderCovered (охват)
//     и levelOf/folderLevel (уровень): идём ВВЕРХ по дереву папок;
//     первая явная запись побеждает: 'off' → вне охвата (защита Е2),
//     'custom' → уровень записи (override самодостаточен: работает даже
//     при глобальном fetch — Д2 вариант 1), 'on' → ПРОЗРАЧЕН («сбросить
//     к наследованию», Е1-в: уровень наследуется от родительской цепочки,
//     а не жёстко глобальный). Нет записей → глобальный уровень.
//   - orphan (ex-synced, удалён из источника): fetch — остаётся;
//     light/full — корзина (матрица §2.2 строка 3).
//   - never-synced файл в охвате: остаётся при fetch/light, корзина при full.
//   - лишняя local-only папка: только full, целиком в корзину.
//   - off-папка: её файлы не трогаются НИКОГДА (Е2), скан в неё не заходит.
//   - File Recovery / .trash / конфликт-копии: автоисключены из зеркала.

import type { FileExclusion, VaultAdapter } from '../sources/types';
import { normalizePolicyPath } from './policy';
// [overhaul v4 / Этап 2] matchesFileExclusion — per-file/per-glob защита от mirror-удалений.
import { matchesFileExclusion } from './file-glob';
import { pMap } from '../utils/concurrency';

// ────────────────────────────────────────────────────────────────────────
// Модель данных (spec §2.1/§2.3) — чистые сериализуемые типы
// ────────────────────────────────────────────────────────────────────────

/** Уровень зеркала. fetch = «Подгрузка», light = «Лёгкое зеркало», full = «Полное зеркало». */
export type MirrorLevel = 'fetch' | 'light' | 'full';

/**
 * Состояние папки в модалке политики (Д1: «охват отдельно от уровня»):
 *  - 'off'    = ⬜ не выбрано: не синхронизируется, зеркалом не трогается (Е2);
 *  - 'on'     = ☑ выбрано: в охвате, уровень наследуется (прозрачна для резолвера);
 *  - 'custom' = ☑⚡ выбрано со своим уровнем (override ближайший к файлу побеждает).
 */
export type FolderState = 'off' | 'on' | 'custom';

/** Причина зеркального удаления — для confirm-секций (по уровням) и журнала.
 *  'conflict-overwrite' порождается НЕ здесь: его ставит conflict.ts (W1-T06)
 *  для локальных версий при full-перезаписи — тип общий для единого списка. */
export type DeletionReason = 'orphan' | 'local-only' | 'extra-folder' | 'conflict-overwrite';

/** Правило на одну папку (одна строка дерева политики). */
export interface FolderMirrorRule {
        state: FolderState;
        /** Собственный уровень; обязателен для 'custom', игнорируется для остальных. */
        level?: MirrorLevel;
}

/** Per-source карта папок: нормализованный путь → правило. Разреженная. */
export type MirrorFolders = Record<string, FolderMirrorRule>;

/** Модель зеркала одного источника: глобальный дефолт + пер-папочные правила. */
export interface MirrorModel {
        /** Глобальный уровень (дефолт для всех папок без override). */
        level: MirrorLevel;
        folders: MirrorFolders;
}

export const MIRROR_LEVELS: readonly MirrorLevel[] = ['fetch', 'light', 'full'];

/** Дефолтная модель: подгрузка без удалений (безопасный старт, Д8). */
export const EMPTY_MIRROR_MODEL: MirrorModel = { level: 'fetch', folders: {} };

// ────────────────────────────────────────────────────────────────────────
// Автоисключения (матрица §2.2: «File Recovery / .trash — автоисключены
// из синка и зеркала»). В 2.3.3 их не существовало вовсе.
// ────────────────────────────────────────────────────────────────────────

/** Папки, никогда не участвующие в зеркале (локальные данные восстановления). */
export const MIRROR_AUTO_EXCLUDED_FOLDERS: readonly string[] = [
        '.trash', // внутренняя корзина Obsidian ( setting «.trash folder»)
        '.obsidian/plugins/obsidian-file-recovery', // снапшоты File Recovery
];

/** Путь внутри автоисключённой папки (или сама папка)? */
export function isAutoExcluded(path: string): boolean {
        const p = normalizePolicyPath(path);
        return MIRROR_AUTO_EXCLUDED_FOLDERS.some((f) => p === f || p.startsWith(f + '/'));
}

/**
 * Конфликт-копия (*.conflict-<ts>)? Дубль правила PathPolicy.isConflictCopy
 * (§9.4) — модуль не тянет инстанс PathPolicy ради одного регекса; правило
 * синхронизировано вручную (оба места помечены).
 */
export function isConflictCopyPath(path: string): boolean {
        return /(^|\/)[^/]+\.conflict-/.test(normalizePolicyPath(path));
}

/** Защищён от зеркальных удалений всегда (автоисключение или конфликт-копия). */
export function isMirrorProtected(path: string): boolean {
        return isAutoExcluded(path) || isConflictCopyPath(path);
}

// ────────────────────────────────────────────────────────────────────────
// Резолверы (spec §2.5) — ДВЕ оси, две пары функций:
//
// ОХВАТ (чекбокс дерева ⬜/☑, Е2): ближайшая ЯВНАЯ запись решает; 'on'
// НЕ прозрачен для охвата — корень ⬜ + «.obsidian» ☑ работает (форма
// config-only, миграция §2.4). Нет записей → в охвате (дефолт).
//
// УРОВЕНЬ (⚡, Д2): ближайший custom ВВЕРХ по дереву; 'on' прозрачен
// («сбросить к наследованию» Е1-в — наследует от родительской цепочки,
// НЕ жёстко глобальный); 'off' обрывает (вне охвата уровень не нужен);
// нет custom → глобальный.
// ────────────────────────────────────────────────────────────────────────

function isMirrorLevel(v: unknown): v is MirrorLevel {
        return v === 'fetch' || v === 'light' || v === 'full';
}

/**
 * Охват ПАПКИ: сама папка + предки; ближайшая запись: off → false,
 * on/custom → true; нет записей → true. Ближайший 'on' блокирует
 * родительский 'off' — так дерево чекбоксов выражает «выбранное
 * поддерево внутри невыбранного» (миграция config-only, §2.4).
 */
export function isFolderCovered(model: MirrorModel, folderPath: string): boolean {
        let p = normalizePolicyPath(folderPath);
        for (;;) {
                const rule = model.folders[p];
                if (rule) return rule.state !== 'off';
                if (p === '') return true;
                const slash = p.lastIndexOf('/');
                p = slash > 0 ? p.slice(0, slash) : '';
        }
}

/**
 * Охват ФАЙЛА: цепочка родительских папок (запись на пути самого файла
 * не матчится — записи бывают только на папках).
 */
export function isCovered(model: MirrorModel, path: string): boolean {
        const norm = normalizePolicyPath(path);
        const slash = norm.lastIndexOf('/');
        return isFolderCovered(model, slash > 0 ? norm.slice(0, slash) : '');
}

/**
 * Уровень ПАПКИ (сама + предки): ближайший custom (валидный level);
 * 'on' прозрачен; 'off' обрывает → глобальный. Битый level у custom —
 * идём выше (защита от кривого data.json).
 */
export function folderLevel(model: MirrorModel, folderPath: string): MirrorLevel {
        let p = normalizePolicyPath(folderPath);
        for (;;) {
                const rule = model.folders[p];
                if (rule) {
                        if (rule.state === 'custom' && isMirrorLevel(rule.level)) return rule.level;
                        if (rule.state === 'off') return model.level;
                        // 'on' — прозрачен: наследуем от родительской цепочки (Е1-в)
                }
                if (p === '') return model.level;
                const slash = p.lastIndexOf('/');
                p = slash > 0 ? p.slice(0, slash) : '';
        }
}

/** Уровень ФАЙЛА (spec §2.5 levelOf): цепочка родительских папок. */
export function levelOf(model: MirrorModel, path: string): MirrorLevel {
        const norm = normalizePolicyPath(path);
        const slash = norm.lastIndexOf('/');
        return folderLevel(model, slash > 0 ? norm.slice(0, slash) : '');
}

/**
 * Санитизация модели из data.json: валидный уровень, нормализованные ключи,
 * выкидывание мусорных записей. Поведение: битый глобальный уровень → fetch
 * (безопасный дефолт); запись с неизвестным state или state==='custom' без
 * level → 'on' (наследование); дубликаты после нормализации — последняя
 * выигрывает (data.json переписывается SettingsManager'ом).
 */
export function normalizeMirrorModel(raw: {
        level?: unknown;
        folders?: unknown;
}): MirrorModel {
        const level = isMirrorLevel(raw.level) ? raw.level : 'fetch';
        const folders: MirrorFolders = {};
        if (raw.folders && typeof raw.folders === 'object') {
                for (const [key, value] of Object.entries(raw.folders as Record<string, unknown>)) {
                        const path = normalizePolicyPath(key);
                        if (path === '') continue;
                        const rule = value as { state?: unknown; level?: unknown } | null;
                        if (!rule || typeof rule !== 'object') continue;
                        const state = rule.state;
                        if (state === 'off') {
                                folders[path] = { state: 'off' };
                        } else if (state === 'on') {
                                folders[path] = { state: 'on' };
                        } else if (state === 'custom') {
                                // custom с валидным level → override; битый level → 'on'
                                // (наследование: папка остаётся выбранной, уровень — глобальный)
                                folders[path] = isMirrorLevel(rule.level)
                                        ? { state: 'custom', level: rule.level }
                                        : { state: 'on' };
                        }
                        // записи с неизвестным state/не-объекты молча выпадают
                }
        }
        return { level, folders };
}

// ────────────────────────────────────────────────────────────────────────
// План зеркальных удалений (матрица §2.2 — ЧИСТАЯ функция, без I/O)
// ────────────────────────────────────────────────────────────────────────

/** Одно удаление. level — эффективный уровень, ПО КОТОРОМУ удаляем:
 *  confirm группирует «Удалено (Лёгкое): N · (Полное): M» (W2-T04). */
export interface MirrorDeletion {
        path: string;
        reason: Extract<DeletionReason, 'orphan' | 'local-only'>;
        level: MirrorLevel;
}

/** Лишняя папка (целиком вне источника) — корзина одним действием. */
export interface MirrorExtraFolder {
        path: string;
        /** Файлы внутри (их индивидуальные удаления поглощены папкой). */
        filesInside: string[];
}

export interface MirrorPlanStats {
        /** orphan-удаления (ex-synced, удалены из источника). */
        orphan: number;
        /** local-only удаления (never-synced, только full). */
        localOnly: number;
        /** лишние папки (только full). */
        extraFolders: number;
        /** защищено off-папкой (Е2) — не тронем и посчитаем (журнал/подсветка). */
        skippedOff: number;
        /** не удалено из-за уровня fetch/light. */
        skippedFetch: number;
        /** автоисключения и конфликт-копии. */
        skippedProtected: number;
        /** [W1-T07] не удалено как не-допустимое политикой путей
         *  (isPathEligible; .git, отключённые плагины, блок-расширения). */
        skippedIneligible: number;
        /**
         * [overhaul v4 / Этап 2] Защищено fileExclusions — per-file/per-glob
         * исключения (policy.fileExclusions). Не удалено как orphan/local-only,
         * кэш не чистится (если ключ попадает под exclusion).
         */
        skippedExcluded: number;
}

export interface MirrorPlan {
        /** Файловые удаления (orphan | local-only). */
        deletions: MirrorDeletion[];
        /** Папки к удалению целиком (reason 'extra-folder', level full). */
        extraFolders: MirrorExtraFolder[];
        stats: MirrorPlanStats;
}

export interface MirrorPlanInput {
        /** Локальные пути манифеста ПОСЛЕ политики (что источник предоставляет). */
        manifestPaths: Iterable<string>;
        /** Ключи кэша (ex-synced локальные пути). */
        cacheKeys: Iterable<string>;
        /** Скан vault (см. scanVaultTree): файлы/папки/обрезанные поддеревья. */
        scan: { files: Iterable<string>; folders: Iterable<string>; blocked?: Iterable<string> };
        /** [W1-T07] Файл ДОПУСТИМ к зеркальному удалению как local-only?
         *  Предикат политики путей (PathPolicy.isPathAllowed): не-допустимые
         *  файлы (.git/*, отключённые плагины, блокированные расширения)
         *  УДАЛЕНИЮ не подлежат — и автоматически становятся «выживающими»
         *  для проверки extra-папок (файл вне deletionPaths = родитель не
         *  лишний): так «.git/config» страхует папку «.git» от корзины. */
        isPathEligible?: (path: string) => boolean;
        /**
         * [overhaul v4 / Этап 2] Per-file/per-glob исключения — защищают
         * от mirror-удаления. Файлы, попадающие под паттерн, не удаляются
         * ни как orphan, ни как local-only; считаются в skippedExcluded.
         *
         * Логика: matchesFileExclusion(path, exclusions) — true → skip удаления.
         * Кэш-ключи под exclusion тоже не чистятся (mirror.ts оставляет их).
         */
        fileExclusions?: readonly FileExclusion[];
}

/**
 * Компоновка плана удалений по матрице §2.2. Чистая: любые комбинации
 * входов детерминированы. Порядок: (1) orphan по кэшу, (2) local-only по
 * скану, (3) лишние папки снизу вверх (поглощают файловые удаления).
 * Все входы нормализуются; дубликаты схлопываются.
 */
export function planMirrorDeletions(model: MirrorModel, input: MirrorPlanInput): MirrorPlan {
        const manifestSet = new Set(Array.from(input.manifestPaths, normalizePolicyPath));
        const cacheSet = new Set(Array.from(input.cacheKeys, normalizePolicyPath));
        const scanFiles = Array.from(new Set(Array.from(input.scan.files, normalizePolicyPath)));
        const scanFolders = Array.from(
                new Set(Array.from(input.scan.folders, normalizePolicyPath)),
        ).filter((f) => f !== '');
        const blockedSet = new Set(Array.from(input.scan.blocked ?? [], normalizePolicyPath));

        const stats: MirrorPlanStats = {
                orphan: 0, localOnly: 0, extraFolders: 0,
                skippedOff: 0, skippedFetch: 0, skippedProtected: 0, skippedIneligible: 0,
                skippedExcluded: 0, // [overhaul v4 / Этап 2]
        };
        const deletions: MirrorDeletion[] = [];
        const deletionPaths = new Set<string>();

        // ── 1. orphan: ex-synced ключи кэша, которых нет в источнике ──
        for (const key of cacheSet) {
                if (manifestSet.has(key)) continue; // ещё в источнике
                if (isMirrorProtected(key)) { stats.skippedProtected++; continue; }
                // [overhaul v4 / Этап 2] fileExclusions — защита от mirror-удаления.
                // Файл, попадающий под glob-исключение, не удаляется как orphan.
                // Кэш-ключ НЕ чистится (возвращается как skippedExcluded, не в cacheCleanup).
                if (matchesFileExclusion(key, input.fileExclusions)) {
                        stats.skippedExcluded++;
                        continue;
                }
                if (!isCovered(model, key)) { stats.skippedOff++; continue; } // Е2: off защищает всегда
                const eff = levelOf(model, key);
                if (eff === 'fetch') { stats.skippedFetch++; continue; } // fetch: orphan остаётся
                deletions.push({ path: key, reason: 'orphan', level: eff });
                deletionPaths.add(key);
                stats.orphan++;
        }

        // ── 2. local-only: never-synced файлы скана (только full) ──
        for (const file of scanFiles) {
                if (manifestSet.has(file)) continue; // вот-вот придёт из источника (MISSING_LOCAL)
                if (cacheSet.has(file)) continue; // orphan-ветка выше уже решила судьбу
                if (isMirrorProtected(file)) { stats.skippedProtected++; continue; }
                // [overhaul v4 / Этап 2] fileExclusions — защита local-only от удаления.
                // Файл под glob-исключением остаётся на диске, даже если mirror='full'.
                if (matchesFileExclusion(file, input.fileExclusions)) {
                        stats.skippedExcluded++;
                        continue;
                }
                // [W1-T07] не-допустимые политикой путей файлы — не наши: не удаляем
                // (и они выживают для extra-проверки родительских папок — см. вход).
                if (input.isPathEligible && !input.isPathEligible(file)) {
                        stats.skippedIneligible++;
                        continue;
                }
                if (!isCovered(model, file)) { stats.skippedOff++; continue; }
                const eff = levelOf(model, file);
                if (eff !== 'full') { stats.skippedFetch++; continue; } // fetch И light: never-synced остаётся
                deletions.push({ path: file, reason: 'local-only', level: 'full' });
                deletionPaths.add(file);
                stats.localOnly++;
        }

        // ── 3. лишние папки (только full), снизу вверх ──
        // Предки манифеста/блоков считаются один раз: F «имеет источник внутри»
        // ⇔ F ∈ manifestAncestors (множество всех родительских папок манифеста).
        const manifestAncestors = new Set<string>();
        for (const p of manifestSet) {
                let dir = p.lastIndexOf('/') > 0 ? p.slice(0, p.lastIndexOf('/')) : '';
                while (dir !== '') {
                        manifestAncestors.add(dir);
                        const slash = dir.lastIndexOf('/');
                        dir = slash > 0 ? dir.slice(0, slash) : '';
                }
        }
        const blockedAncestors = new Set<string>();
        for (const b of blockedSet) {
                let dir = b;
                while (dir !== '') {
                        blockedAncestors.add(dir);
                        const slash = dir.lastIndexOf('/');
                        dir = slash > 0 ? dir.slice(0, slash) : '';
                }
        }

        const extraFolders: MirrorExtraFolder[] = [];
        const extraByPath = new Map<string, MirrorExtraFolder>();
        /** Папки, «обречённые» для родителей: extra сейчас ИЛИ уже поглощённые
         *  (после поглощения из extraByPath исчезают — а для проверки родителя
         *  обязаны оставаться обречёнными). */
        const doomedFolders = new Set<string>();
        const sortedFolders = [...scanFolders].sort((a, b) => b.length - a.length);

        // [overhaul S3/M-3] Индекс ПРЯМЫХ детей (папка → свои файлы/подпапки):
        // один проход O(N+F) вместо O(F×N) — раньше на каждого кандидата шел
        // линейный проход по ВСЕМ scanFiles (10k файлов × 1k папок ≈ 10⁷–10⁸
        // итераций на каждый full-скан). Теперь кандидат обходит ТОЛЬКО своё
        // поддерево. Эквивалентность зафиксирована mirror-equivalence-тестом
        // (эталон снят со старой реализации).
        const childFilesOf = new Map<string, string[]>();
        const childFoldersOf = new Map<string, string[]>();
        for (const f of scanFiles) {
                const slash = f.lastIndexOf('/');
                const dir = slash > 0 ? f.slice(0, slash) : '';
                let arr = childFilesOf.get(dir);
                if (arr === undefined) { arr = []; childFilesOf.set(dir, arr); }
                arr.push(f);
        }
        for (const g of scanFolders) {
                const slash = g.lastIndexOf('/');
                const dir = slash > 0 ? g.slice(0, slash) : '';
                let arr = childFoldersOf.get(dir);
                if (arr === undefined) { arr = []; childFoldersOf.set(dir, arr); }
                arr.push(g);
        }

        for (const folder of sortedFolders) {
                if (!isFolderCovered(model, folder)) continue;
                if (folderLevel(model, folder) !== 'full') continue;
                if (isMirrorProtected(folder)) continue;
                if (manifestAncestors.has(folder)) continue; // внутри есть файлы источника
                if (blockedAncestors.has(folder)) continue; // внутри выживающее поддерево
                const prefix = folder + '/';

                // Все просканированные файлы внутри — обречены (индивидуально или
                // внутри уже поглощённой extra-папки)? Обход поддерева по индексу
                // детей; allDoomed=false останавливает спуск на первом выжившем.
                const filesInside: string[] = [];
                let allDoomed = true;
                const walkFiles = (dir: string): void => {
                        for (const f of childFilesOf.get(dir) ?? []) {
                                if (deletionPaths.has(f)) {
                                        filesInside.push(f);
                                        continue;
                                }
                                let coveredByExtra = false;
                                for (const g of doomedFolders) {
                                        if (f.startsWith(g + '/')) {
                                                coveredByExtra = true;
                                                break;
                                        }
                                }
                                if (!coveredByExtra) {
                                        allDoomed = false;
                                        return;
                                }
                        }
                        for (const g of childFoldersOf.get(dir) ?? []) {
                                if (!allDoomed) return;
                                walkFiles(g);
                        }
                };
                walkFiles(folder);
                if (!allDoomed) continue;

                // Все просканированные подпапки внутри — тоже обречены? Выживающая
                // подпапка (например, light-потомок, опустевший после orphan-чистки)
                // консервативно оставляет родителя: пустые папки досыпает
                // существующий cleanupEmptyDirectories (coordinator).
                // [overhaul S3/M-3] проверка через индекс детей: каждый потомок
                // обязан быть в doomedFolders (поглощён/принят ранее).
                const subFoldersAllDoomed = (function walkFolders(dir: string): boolean {
                        for (const g of childFoldersOf.get(dir) ?? []) {
                                if (!doomedFolders.has(g)) return false;
                                if (!walkFolders(g)) return false;
                        }
                        return true;
                })(folder);
                if (!subFoldersAllDoomed) continue;

                // Поглощаем вложенные extra-папки (их filesInside переходят сюда)…
                for (const [g, extra] of [...extraByPath.entries()]) {
                        if (!g.startsWith(prefix)) continue;
                        extraByPath.delete(g);
                        doomedFolders.add(g);
                        filesInside.push(...extra.filesInside);
                        const idx = extraFolders.indexOf(extra);
                        if (idx >= 0) extraFolders.splice(idx, 1);
                }
                // …и снимаем индивидуальные удаления поглощённых файлов (in-place,
                // без splice-разворота больших массивов).
                let removedAny = false;
                for (const f of filesInside) {
                        if (deletionPaths.delete(f)) removedAny = true;
                }
                if (removedAny) {
                        let w = 0;
                        for (let i = 0; i < deletions.length; i++) {
                                if (deletionPaths.has(deletions[i].path)) deletions[w++] = deletions[i];
                        }
                        deletions.length = w;
                }

                const merged: MirrorExtraFolder = { path: folder, filesInside };
                extraByPath.set(folder, merged);
                doomedFolders.add(folder);
                extraFolders.push(merged);
        }
        stats.extraFolders = extraFolders.length;

        return { deletions, extraFolders, stats };
}

// ────────────────────────────────────────────────────────────────────────
// Скан vault (единственная I/O-функция модуля; адаптер — как в coordinator)
// ────────────────────────────────────────────────────────────────────────

/** Скан vault: файлы/папки, в которые спускались, и обрезанные поддеревья. */
export interface VaultScan {
        files: string[];
        folders: string[];
        /** Папки, обрезанные pruneFolder (off-папки, автоисключения): их содержимое
         *  неизвестно, но сами они считаются «выживающими» — родитель такой папки
         *  не может быть лишним (защита Е2 от транзитивного нарушения). */
        blocked: string[];
}

export interface ScanOptions {
        /** Прун поддерева: true = не спускаться (папка → blocked). */
        pruneFolder?: (folder: string) => boolean;
        signal?: AbortSignal;
}

/** Конкурентность листинга каталогов (план R7: pMap(8) на 10k+ файлов). */
const SCAN_CONCURRENCY = 8;

/**
 * Обход vault по уровням (BFS, листинг каталогов конкурентно pMap(8)).
 * Контракт VaultAdapter.list: полные пути относительно корня (как в фейке
 * coordinator.test.ts и Obsidian DataAdapter.list). list('') = корень.
 * Сигнал: проверяется между уровнями; abort → Error с .aborted=true
 * (координатор опознает и завершит сессию как cancelled).
 */
export async function scanVaultTree(
        vault: VaultAdapter,
        opts: ScanOptions = {},
): Promise<VaultScan> {
        if (typeof vault.list !== 'function') {
                throw new Error('scanVaultTree: адаптер без list() — скан local-only невозможен');
        }
        const list = vault.list.bind(vault);
        const files: string[] = [];
        const folders: string[] = [];
        const blocked: string[] = [];
        let frontier: string[] = [''];

        while (frontier.length > 0) {
                if (opts.signal?.aborted) {
                        const err = new Error('vault scan aborted');
                        (err as Error & { aborted?: boolean }).aborted = true;
                        throw err;
                }
                const listed = await pMap(
                        frontier,
                        async (dir) => ({ dir, res: await list(dir) }),
                        SCAN_CONCURRENCY,
                );
                const next: string[] = [];
                // [overhaul S4/M-19] pMap кладёт ошибку листинга В СЛОТ: раньше
                // деструктуризация { res } превращала её в непонятный TypeError
                // («res.files of undefined») вместо исходной причины. Теперь
                // честный throw первого Error — скан fail-closed.
                for (const item of listed) {
                        if (item instanceof Error) throw item;
                        const { res } = item;
                        for (const f of res.files) files.push(normalizePolicyPath(f));
                        for (const sub of res.folders) {
                                const p = normalizePolicyPath(sub);
                                if (p === '') continue;
                                if (opts.pruneFolder?.(p)) {
                                        blocked.push(p);
                                        continue;
                                }
                                folders.push(p);
                                next.push(p);
                        }
                }
                frontier = next;
        }
        return { files, folders, blocked };
}

// ────────────────────────────────────────────────────────────────────────
// Пресет охвата (Д2: авто-переименование) и миграция уровней (spec §2.4)
// ────────────────────────────────────────────────────────────────────────

/** Пресет охвата — производное от off-записей (Д1). */
export type CoveragePreset = 'full-vault' | 'selected-folders';

/**
 * Пресет по корневым папкам: хоть одна корневая вне охвата → «Выбранные
 * папки» (Д2: снятие галочки корневой папки переименовывает пресет).
 * rootFolders — пути корневых папок vault (первый уровень).
 */
export function coveragePreset(model: MirrorModel, rootFolders: Iterable<string>): CoveragePreset {
        for (const raw of rootFolders) {
                const p = normalizePolicyPath(raw);
                if (p === '') continue;
                if (!isFolderCovered(model, p)) return 'selected-folders';
        }
        return 'full-vault';
}

/**
 * Миграция уровня 2.3.3 → 3.0 (spec §2.4): mirror=true ИЛИ
 * deleteMissing=true → 'light' (ровно текущее поведение зеркала, честно
 * переименованное); оба выключены/отсутствуют → 'fetch'. Никому не меняем
 * поведение апгрейдом (Д8=1).
 */
export function migrateLegacyMirrorLevel(legacy: {
        mirror?: boolean;
        deleteMissing?: boolean;
}): MirrorLevel {
        return legacy.mirror === true || legacy.deleteMissing === true ? 'light' : 'fetch';
}
