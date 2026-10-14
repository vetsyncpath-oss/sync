import type { ProfileAssignment } from './profiles';
import { validateFileRules, resolveFileRule, deletionLevel, type FileRule } from './file-rules';
// src/core/policy.ts — политика структуры vault (Phase 1 модуля
// Vault Structure Sync Policy; дизайн download/design-vault-structure-policy.md
// §2 (модель данных) + §5.2/§5.7 (applyPolicy) + §6 (валидация путей)).
//
// ЧТО ЭТО: пользователь выбирает, какие папки источника синхронизировать,
// куда их класть (rename/move) и включать ли зеркальный режим. Политика
// хранится в data.json (main.ts, settings.syncPolicies: Record<sourceId,
// SyncPolicy>) — НЕ в manifest-<sourceId>.json, потому что кэш сносится
// forceResync'ом, а политика — долговременное намерение пользователя
// (дизайн §2.1).
//
// Phase 1: только чистые данные + чистая функция applyPolicy. Без UI,
// без obsidian/node-импортов (правило ядра core/, решение В5-1).
// [W1-T05 / BUG-5] шаг зеркальных удалений делегирован core/mirror.ts —
// единой модели «уровень × охват» (спека §2); двойная система правды
// удалений «тумблер deleteMissing против policy.mirror» (BUG-5) умерла.
//
// СЕМАНТИКА ПРАВИЛ (дизайн §5.2, уточнено по тест-таблице §8.1):
//   - Правила матчатся префиксом: rule.path === p или p.startsWith(rule.path+'/');
//     правило корня (path='') матчит всё.
//   - Эффективное include: идём от САМОГО ДЛИННОГО совпавшего правила вверх,
//     первое не-'inherit' побеждает (тесты 14/15: вложенный exclude/include
//     перекрывает родителя). Нет правил / все inherit → include.
//   - Эффективный target: самое длинное совпавшее правило С target.
//     Таргеты НЕ компонуются (тест 17: notes→A + notes/drafts→B ⇒ B/, не A/B/).
//   - Родитель exclude + ребёнок rename(inherit) → ребёнок исключён (тест 9):
//     'inherit' явно означает «состояние родителя».
//
// ИНДЕКСЫ ДВУХ ВИДОВ (дизайн §5.7): правила ищутся по REMOTE-пути (цикл по
// манифесту) и по LOCAL-пути (зеркальный обход кэша — ключи кэша после
// переименования прошлой сессии живут по local-путям).

import type { FileExclusion, RemoteEntry } from '../sources/types';
import type { PathPolicy } from './path-policy';
// [overhaul v4 / Этап 2] matchesFileExclusion — per-file/per-glob исключения.
import { matchesFileExclusion } from './file-glob';
// [W1-T05] planMirrorDeletions — рантайм-импорт из соседнего чистого модуля
// core/mirror.ts. Цикл policy↔mirror безопасен: оба модуля используют
// экспорты друг друга ТОЛЬКО в момент вызова функций (не на этапе
// инициализации модулей) — живые binding'и ES-модулей это позволяют.
import { planMirrorDeletions, levelOf } from './mirror';
import type { MirrorFolders, MirrorLevel, MirrorModel, MirrorPlan } from './mirror';

// ────────────────────────────────────────────────────────────────────────
// Модель данных (дизайн §2.2) — чистые интерфейсы, без методов
// ────────────────────────────────────────────────────────────────────────

/** Правило на одну папку; одна строка дерева. */
export interface FolderPolicy {
        /** Нормализованный REMOTE-путь папки. '' = корень vault. */
        path: string;
        /** include/exclude/inherit (inherit = состояние родителя; дефолт). */
        include: 'include' | 'exclude' | 'inherit';
        /**
         * Переименование/перемещение:
         *  - 'rename' — один сегмент ('Notes' → 'Archive Notes'), родитель тот же;
         *  - 'move'   — полный путь ('Notes/Drafts'), поддерево перезапускается.
         * Целевой путь обязан проходить PathPolicy.isPathSafe + isPathAllowed
         * в момент применения (§6.1); провал — unsafeCount, запись пропускается.
         */
        target?: {
                kind: 'rename' | 'move';
                /** rename: имя сегмента; move: полный локальный путь. */
                localPath: string;
        };
}

/** Политика одного источника (sourceId). Разреженная: только явные правила. */
export interface SyncPolicy {
        /** Версия схемы; менять только с миграцией (дизайн §2.4). */
        version: 1;
        /** Independent rules on final vault paths; absent = legacy modes. */
        fileRules?: FileRule[];
        assignments?: ProfileAssignment[];
        /** Vault-wide default connection; assignments override it. */
        defaultSource?: string;
        /**
         * [W1-T05 / BUG-5] Легаси-тумблер зеркала 2.3.3. Как источник правды
         * об удалениях УМЕР (двойная система BUG-5): поле остаётся в типе
         * ТОЛЬКО для чтения старых data.json до миграции (W1-T08).
         * mirror:true без явного уровня трактуется шагом 4 applyPolicy как
         * legacy-light (ровно поведение 2.3.3 — миграция §2.4 никому не
         * меняет поведение апгрейдом); после миграции поле исчезает из схемы.
         */
        mirror: boolean;
        /** Только пути с явным намерением пользователя (sparse). */
        folders: FolderPolicy[];
        /**
         * [W1-T05] Per-source охват-модель зеркала (spec §2.3, решение Д1
         * «охват отдельно от уровня»): нормализованный путь папки →
         * { state: off/on/custom, level? }. Лежит рядом с folders — те же
         * «разреженные пер-папочные правила», но про ЗЕРКАЛО, а не про
         * include/rename синхронизации. Сырой data.json проходит
         * normalizeMirrorModel (mirror.ts) ДО попадания сюда (W1-T08).
         */
        mirrorFolders?: MirrorFolders;
        /** [REV-P4] Пресет структуры: 'full' | 'obsidian' | 'custom'.
         *  Опционально — политики до Phase 4 без поля читаются как custom
         *  (или full при пустых folders). НЕ влияет на applyPolicy — только
         *  UI-семантика (шапка модалки, селектор настроек, миграция). */
        preset?: 'full' | 'obsidian' | 'custom';
        /** Remember selective scope independently of the currently materialized folders. */
        scopeSelection?: { mode: 'full' | 'obsidian' | 'custom'; customFolders: FolderPolicy[] };
        /**
         * [overhaul v4 / Этап 2] Per-file/per-glob исключения.
         *
         * Файлы, попадающие под паттерн:
         *  - НЕ скачиваются (applyPolicy шаг 2 пропускает их до computeLocalPath);
         *  - НЕ удаляются при mirror='light'/'full' (planMirrorDeletions
         *    помечает их как skippedExcluded, не как deletions);
         *  - кэш НЕ чистится как orphan (если ключ попадает под exclusion).
         *
         * Опционально — отсутствие поля = текущее поведение (ничего не исключено).
         * Нормализуется в SettingsManager.load(): не-массив → delete.
         */
        fileExclusions?: FileExclusion[];
}

/** Пустая политика = «включить всё, без переименований, зеркало выкл». */
export const EMPTY_POLICY: SyncPolicy = { version: 1, mirror: false, folders: [] };

// ────────────────────────────────────────────────────────────────────────
// Нормализация путей (дизайн §2.3)
// ────────────────────────────────────────────────────────────────────────

/**
 * Канонический POSIX-вид: trim → обратные слэши → схлопывание '/' →
 * срез ведущих/хвостовых '/'. Порядок фиксирован: trim ПЕРВЫМ — иначе
 * ' /foo/ ' оставляет ведущий слэш (баг порядка в дизайне исправлен здесь;
 * ср. приватный PathPolicy.normalize, у которого та же латентная проблема —
 * сознательно не трогаем, у него свои зафиксированные тесты).
 */
export function normalizePolicyPath(raw: string): string {
        return raw
                .trim()
                .replace(/\\/g, '/')
                .replace(/\/+/g, '/')
                .replace(/^\/+|\/+$/g, '');
}

/** Структурная безопасность пути (делегирует PathPolicy.isPathSafe). */
export function isPolicyPathSafe(path: string, policy: PathPolicy): boolean {
        return policy.isPathSafe(path);
}

// ────────────────────────────────────────────────────────────────────────
// Результат applyPolicy (дизайн §5.2) — все пути ЛОКАЛЬНЫЕ (после политики)
// ────────────────────────────────────────────────────────────────────────

export interface PolicyResult {
        /** Манифест для diff(): path заменён на локальный; исключённых нет. */
        transformedManifest: RemoteEntry[];
        /**
         * Переименования ДО diff(): «переместить локальный файл from→to
         * и переложить ключ кэша». Иначе diff увидел бы NEW на to и
         * ORPHAN на from — бессмысленная перекачка (дизайн §5.2 toMove).
         */
        toMove: Array<{ from: string; to: string }>;
        /**
         * [W1-T05] План зеркальных удалений от mirror.ts (planMirrorDeletions,
         * матрица §2.2): файловые удаления с reason/level (confirm-секции по
         * уровням, журнал) + лишние папки. ЕДИНЫЙ источник правды удалений
         * политики.
         */
        mirrorPlan: MirrorPlan;
        /**
         * [W1-T05] Производное поле для совместимости: плоский список путей
         * mirrorPlan.deletions + mirrorPlan.extraFolders. Координатор (W1-T07)
         * переключится на mirrorPlan; до тех пор consumes как в 2.3.3.
         */
        toDeleteFromPolicy: string[];
        /** remote путь → local путь (для обновления ключа кэша; §5.4). */
        renameMap: Map<string, string>;
        /** Сколько remote-записей выпало под исключённым поддеревом. */
        excludedCount: number;
        /** Сколько записей отброшено: unsafe-путь или коллизия цели. */
        unsafeCount: number;
}

/** Структурная ошибка политики (битый data.json) — честный throw. */
export class SyncPolicyError extends Error {
        constructor(message: string, public readonly paths: string[] = []) {
                super(message);
                this.name = 'SyncPolicyError';
        }
}

// ────────────────────────────────────────────────────────────────────────
// Внутренние структуры
// ────────────────────────────────────────────────────────────────────────

/** Правило + его эффективный локальный корень (для двух индексов §5.7). */
interface IndexedRule {
        rule: FolderPolicy;
        /** remote путь правила (нормализованный). */
        remoteKey: string;
        /** локальный путь правила (после target; без target = remote). */
        localKey: string;
}

/**
 * Собрать индекс: нормализация путей правил, вычисление localKey,
 * сортировка по длине remoteKey УБЫВАЮЩЕЙ (самое специфичное первым).
 * Дубли remoteKey: побеждает первое в массиве folders (порядок записи).
 */
function indexRules(folders: FolderPolicy[], pathPolicy: PathPolicy): IndexedRule[] {
        const seenRemote = new Set<string>();
        const badPaths: string[] = [];
        const indexed: IndexedRule[] = [];

        for (const f of folders) {
                const remoteKey = normalizePolicyPath(f.path);
                // Структурная защита: правило с unsafe-путём = битый data.json
                // (через UI такое не заводится — normalize рвёт ведущий '/', но
                // '..' и зарезервированные имена Windows проходят). Такой файл
                // не «пропускаем тихо», а честно роняем sync (§2.3 пункт 3).
                if (!pathPolicy.isPathSafe(remoteKey) || remoteKey.includes('..')) {
                        badPaths.push(f.path);
                        continue;
                }
                if (seenRemote.has(remoteKey)) continue; // дубль — первое правило приоритетно
                seenRemote.add(remoteKey);
                const localKey = f.target ? computeLocalPath(remoteKey, remoteKey, f) : remoteKey;
                indexed.push({ rule: f, remoteKey, localKey });
        }

        if (badPaths.length > 0) {
                throw new SyncPolicyError(
                        `sync policy: structurally unsafe folder path(s): ${badPaths.join(', ')}`,
                        badPaths,
                );
        }

        indexed.sort((a, b) => b.remoteKey.length - a.remoteKey.length);
        return indexed;
}

/** Матчится ли правило на путь (префикс; корень '' матчит всё). */
function ruleMatches(path: string, key: string): boolean {
        if (key === '') return true;
        return path === key || path.startsWith(key + '/');
}

/**
 * Эффективное include: от самого специфичного совпавшего правила вверх,
 * первое не-'inherit' побеждает; нет правил — 'include'.
 */
function resolveInclude(path: string, indexed: IndexedRule[], byKey: 'remoteKey' | 'localKey'): 'include' | 'exclude' {
        for (const ir of indexed) {
                if (!ruleMatches(path, ir[byKey])) continue;
                const state = ir.rule.include;
                if (state === 'include' || state === 'exclude') return state;
        }
        return 'include';
}

/** Additional scope checks for an artifact already projected from an included origin. No ownership/name bypass here. */
export function isPolicyPathIncluded(remotePath:string,localPath:string,policy:SyncPolicy):boolean {
        const indexed=(policy.folders??[]).map(rule=>({rule,remoteKey:normalizePolicyPath(rule.path),
                localKey:rule.target?computeLocalPath(normalizePolicyPath(rule.path),normalizePolicyPath(rule.path),rule):normalizePolicyPath(rule.path)}))
                .sort((a,b)=>b.remoteKey.length-a.remoteKey.length);
        return resolveInclude(remotePath,indexed,'remoteKey')!=='exclude'
                &&resolveInclude(localPath,[...indexed].sort((a,b)=>b.localKey.length-a.localKey.length),'localKey')!=='exclude'
                &&!matchesFileExclusion(remotePath,policy.fileExclusions)&&!matchesFileExclusion(localPath,policy.fileExclusions);
}

/**
 * Локальный путь записи под правилом с target (дизайн §5.2 computeLocalPath):
 *  - 'rename' — последний сегмент rule.path заменяется на новое имя
 *    ('notes/drafts/a.md' под правилом 'notes/drafts' rename 'Drafts'
 *     → 'notes/Drafts/a.md');
 *  - 'move' — префикс rule.path заменяется на новый путь целиком
 *    ('notes/drafts/a.md' под правилом 'notes/drafts' move 'Archive/Drafts'
 *     → 'Archive/Drafts/a.md').
 */
export function computeLocalPath(remotePath: string, rulePath: string, rule: FolderPolicy): string {
        if (!rule.target) return remotePath;
        const targetPath = normalizePolicyPath(rule.target.localPath);
        // Правило корня (rulePath === ''): remotePath.slice(0) не даёт ведущего
        // '/' — разделитель добавляется явно (иначе 'root'+'b.md' = 'rootb.md';
        // тот же баг в формуле дизайна §5.2, пойман тестом 23).
        const joinUnder = (prefix: string): string =>
                rulePath === '' ? `${prefix}/${remotePath}` : prefix + remotePath.slice(rulePath.length);
        if (rule.target.kind === 'rename') {
                const slash = rulePath.lastIndexOf('/');
                const parent = slash > 0 ? rulePath.slice(0, slash + 1) : '';
                const newRulePath = parent + targetPath;
                if (remotePath === rulePath) return newRulePath;
                return joinUnder(newRulePath);
        }
        // 'move'
        if (remotePath === rulePath) return targetPath;
        return joinUnder(targetPath);
}

// ────────────────────────────────────────────────────────────────────────
// applyPolicy — чистая функция (дизайн §5.2 + §5.7)
// ────────────────────────────────────────────────────────────────────────

/**
 * Применить SyncPolicy к сырому манифесту источника. Чистая: без I/O,
 * побочных эффектов и obsidian. Бросает SyncPolicyError при структурно
 * битых путях правил (коррупция data.json); неверные ЦЕЛИ переименования —
 * не throw, а unsafeCount + пропуск записи (§2.3 пункт 3, тесты 10/11).
 *
 * Алгоритм: O(n·m), m = число явных правил (на практике единицы) ⇒ ~O(n).
 *   1. Индекс правил (нормализация, localKey, сортировка по специфичности).
 *   2. Цикл по манифесту: resolveInclude → exclude? пропуск → computeLocalPath
 *      → isPathSafe+isPathAllowed → коллизия эмита → transformedManifest.
 *   3. toMove: пересечение старых ключей кэша с renameMap.
 *   4. Зеркало [W1-T05 / BUG-5]: план удалений считает mirror.ts
 *      (planMirrorDeletions, модель «уровень × охват», матрица §2.2);
 *      legacy-exclude-поддеревья ЭТОЙ политики защищают и кэш-ключи, и
 *      скан (§5.7: ключи прошлой сессии после переименования живут по
 *      local-путям — lookup по LOCAL-индексу правил).
 */

/** Опции applyPolicy [W1-T05]: уровень зеркала и скан vault (для full). */
export interface ApplyPolicyOptions {
        /**
         * Глобальный уровень зеркала из настроек (после миграции §2.4 —
         * единственный авторитет). Авторитетнее легаси policy.mirror:
         * явный 'fetch' при mirror:true полностью выключает удаления.
         */
        mirrorLevel?: MirrorLevel;
        /**
         * Скан vault (результат mirror.ts scanVaultTree): файлы/папки/
         * обрезанные поддеревья. Нужен уровню full (local-only и лишние
         * папки); не подан — full честно видит только orphan по кэшу
         * (обратная совместимость: в 2.3.3 скана не существовало).
         */
        scan?: {
                files?: Iterable<string>;
                folders?: Iterable<string>;
                blocked?: Iterable<string>;
        };
        /** @deprecated Content hashes cannot prove rename provenance; ignored. */
        cacheHashes?: ReadonlyMap<string, string>;
}

export function applyPolicy(
        manifest: RemoteEntry[],
        policy: SyncPolicy,
        pathPolicy: PathPolicy,
        cacheKeys: Iterable<string>,
        opts?: ApplyPolicyOptions,
): PolicyResult {
        const result: PolicyResult = {
                transformedManifest: [],
                toMove: [],
                // Заполняется на шаге 4 (нужен итоговый transformedManifest);
                // до подсчёта — пустой план «ничего не удаляем».
                mirrorPlan: {
                        deletions: [],
                        extraFolders: [],
                        stats: { orphan: 0, localOnly: 0, extraFolders: 0, skippedOff: 0, skippedFetch: 0, skippedProtected: 0, skippedIneligible: 0, skippedExcluded: 0 },
                },
                toDeleteFromPolicy: [],
                renameMap: new Map(),
                excludedCount: 0,
                unsafeCount: 0,
        };

        const folders = policy.folders ?? [];
        const indexed = indexRules(folders, pathPolicy);

        // Защита от мутации входа: копия manifest-записей с новым path.
        validateFileRules(policy.fileRules);
        const emittedLocalPaths = new Set<string>();
        // Старые remote-пути, участвующие в переименовании (для шага 4).
        const renamedOldPaths = new Set<string>();

        // ── Шаг 2: цикл по манифесту (lookup по REMOTE-индексу) ──
        for (const entry of manifest) {
                const remotePath = normalizePolicyPath(entry.path);

                // (b) Исключено? (разрешение include — самое специфичное
                // не-inherit правило; родитель-exclude + ребёнок-rename(inherit)
                // ⇒ исключён — тест 9.)
                if (resolveInclude(remotePath, indexed, 'remoteKey') === 'exclude') {
                        result.excludedCount++;
                        continue;
                }

                // [overhaul v4 / Этап 2] (b2) Исключено через fileExclusions
                // (per-file/per-glob)? Проверяем ПОСЛЕ folder-exclude (для
                // согласованности с зеркальной защитой ниже), ДО computeLocalPath.
                // Если файл матчится — он не попадает в transformedManifest,
                // не скачивается, и не попадает в deletionPaths — кэш-ключ
                // защищён от orphan-удаления на шаге 4 (planMirrorDeletions).
                if (matchesFileExclusion(remotePath, policy.fileExclusions)) {
                        result.excludedCount++;
                        continue;
                }

                // (c) Локальный путь: самое длинное совпавшее правило С target.
                let localPath = remotePath;
                for (const ir of entry.resolvedDestination ? [] : indexed) {
                        if (!ruleMatches(remotePath, ir.remoteKey)) continue;
                        if (ir.rule.target) {
                                localPath = computeLocalPath(remotePath, ir.remoteKey, ir.rule);
                                break; // таргеты не компонуются (тест 17)
                        }
                }

                // (d) Валидация локального пути (zip-slip + бизнес-правила).
                if (matchesFileExclusion(localPath, policy.fileExclusions)) {
                        result.excludedCount++;
                        continue;
                }
                if (!pathPolicy.isPathSafe(localPath) || !pathPolicy.isPathAllowed(localPath)) {
                        result.unsafeCount++;
                        continue;
                }

                // Коллизия: другой entry уже эммитит этот локальный путь.
                const localKey = localPath.normalize('NFC').toLowerCase();
                if (emittedLocalPaths.has(localKey)) {
                        throw new Error(`Local mapping collision: ${localPath}`);
                }
                emittedLocalPaths.add(localKey);

                // (e) Преобразованная запись (независимая копия).
                result.transformedManifest.push({ ...entry, path: localPath });

                // (f) Переименование зафиксировано.
                if (localPath !== remotePath) {
                        result.renameMap.set(remotePath, localPath);
                        renamedOldPaths.add(remotePath);
                }
        }

        // ── Шаг 3: toMove = ключи кэша ∩ переименования ──
        // Прямой матч (канон): кэш ещё помнит СТАРЫЙ remote-путь — первая
        // сессия с rename. После неё кэш-ключи — ЛОКАЛЬНЫЕ пути.
        for (const cacheKey of cacheKeys) {
                const newLocal = result.renameMap.get(cacheKey);
                if (newLocal !== undefined && resolveFileRule(cacheKey, policy.fileRules).write === undefined
                        && resolveFileRule(newLocal, policy.fileRules).write === undefined) {
                        result.toMove.push({ from: cacheKey, to: newLocal });
                }
        }
        // Content equality does not establish which remote object owns a local path.
        // Preserve the previous path until a provenance-aware mapping ledger exists.

        // ── Шаг 4 [W1-T05 / BUG-5]: зеркальные удаления — единая модель
        // mirror.ts (план по матрице §2.2). Легаси-тумблер policy.mirror
        // больше не источник правды: mirror:true без уровней = legacy-семантика
        // light (ровно поведение 2.3.3 — миграция §2.4 никому не меняет
        // поведение апгрейдом); mirror:false = fetch (удалений нет — как в
        // 2.3.3, где авторитетом был флаг deleteMissing координатора).
        // Явный opts.mirrorLevel АВТОРИТЕТНЕЕ тумблера: после миграции (W1-T08)
        // поле mirror исчезает, уровень остаётся единственным входом. ──
        const mirrorModel: MirrorModel = {
                level: opts?.mirrorLevel ?? (policy.mirror ? 'light' : 'fetch'),
                folders: policy.mirrorFolders ?? {},
        };

        // Кэш-ключи под legacy-exclude-поддеревьями (§5.7, LOCAL-индекс) НЕ
        // попадают в план — как и в 2.3.3: явное исключение из синхронизации
        // защищает от зеркального удаления (тесты 8/28/29/30). Старые
        // remote-пути переименований тоже исключены — их судьба решена toMove.
        const mirrorCacheKeys: string[] = [];
        for (const cacheKey of cacheKeys) {
                if (renamedOldPaths.has(cacheKey)) continue;
                if (resolveInclude(cacheKey, indexed, 'localKey') === 'exclude') continue;
                mirrorCacheKeys.push(cacheKey);
        }

        // Скан уровня full: exclude-поддеревья — та же защита, что off-папки
        // (Е2), но на оси ЭТОЙ политики: файлы под ними невидимы зеркалу,
        // папки переносятся в blocked — родитель exclude-папки не сможет
        // стать «лишним» (иначе удаление родителя транзитивно снесло бы
        // защищённое поддерево; см. «blocked-поддерево защищает родителя»
        // в tests/mirror.test.ts). Полнота scan.folders — контракт
        // scanVaultTree (mirror.ts): каждая папка со списком файлов в нём есть.
        const scanFiles: string[] = [];
        const scanFolders: string[] = [];
        const scanBlocked: string[] = Array.from(opts?.scan?.blocked ?? []);
        if (opts?.scan) {
                for (const f of opts.scan.files ?? []) {
                        if (resolveInclude(f, indexed, 'localKey') === 'exclude') continue;
                        scanFiles.push(f);
                }
                for (const d of opts.scan.folders ?? []) {
                        if (resolveInclude(d, indexed, 'localKey') === 'exclude') {
                                scanBlocked.push(d);
                                continue;
                        }
                        scanFolders.push(d);
                }
        }

        result.mirrorPlan = planMirrorDeletions(mirrorModel, {
                manifestPaths: result.transformedManifest.map((e) => e.path),
                cacheKeys: mirrorCacheKeys,
                scan: { files: scanFiles, folders: scanFolders, blocked: scanBlocked },
                // [W1-T07] Предикат допустимости local-only удаления: файлы,
                // которые политика путей никогда не синхронизировала бы
                // (.git/*, отключённые плагины, блок-расширения), не наши —
                // не удаляются и страхуют свои родительские папки от
                // extra-удаления (см. MirrorPlanInput.isPathEligible).
                isPathEligible: (p) => pathPolicy.isPathSafe(p) && pathPolicy.isPathAllowed(p),
                // [overhaul v4 / Этап 2] Per-file/per-glob исключения
                // передаются в mirror.ts — там защищают orphan/local-only
                // от удаления, считаются в skippedExcluded.
                fileExclusions: policy.fileExclusions,
                levelForPath: p => deletionLevel(p, policy.fileRules, levelOf(mirrorModel, p)),
        });

        // [W1-T05] производное поле для совместимости (см. PolicyResult):
        // координатор (W1-T07) переключится на mirrorPlan.
        result.toDeleteFromPolicy = [
                ...result.mirrorPlan.deletions.map((d) => d.path),
                ...result.mirrorPlan.extraFolders.map((f) => f.path),
        ];

        return result;
}
