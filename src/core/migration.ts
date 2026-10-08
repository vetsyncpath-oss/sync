// src/core/migration.ts — [W1-T08] однократная миграция data.json 2.3.3 → 3.0.
//
// ЗАКРЫВАЕТ: BUG-2 (legacy-поля syncMode/allowedFolders/ignoredFolders
// «протекали» на каждый НОВЫЙ sourceId через migrateLegacyStructurePolicy,
// работавший по требованию), BUG-3-логика (дефолт config-only противоречил
// «клону хозяйского vault»), BUG-5-хвост (тумблер deleteMissing поглощается
// уровнем зеркала). Спека §2.4:
//   - policy.mirror=true ИЛИ deleteMissing=true → mirrorLevel='light'
//     (ровно поведение 2.3.3, никому не меняем апгрейдом);
//   - оба выкл → 'fetch';
//   - глобальные текстовые фильтры → структура-политика ТОКУЩЕГО источника
//     (один раз!), после чего legacy-поля ОЧИЩАЮТСЯ — новые sourceId
//     стартуют без политики (онбординг W2-T06 спросит охват явно);
//   - миграция идемпотентна: глобальный флаг migratedV3.
//
// ЧИСТЫЙ модуль ядра: без obsidian/node — только типы policy/mirror и
// normalizePolicyPath. Вызывается из main.ts ОДИН раз после buildEngine
// (нужен builtSourceId для конвертации глобальных фильтров).

import { migrateLegacyMirrorLevel, type MirrorFolders, type MirrorLevel } from './mirror';
import { normalizePolicyPath, type FolderPolicy, type SyncPolicy } from './policy';

/** Глобальные legacy-поля 2.3.3 (сохранены в data.json). */
export interface LegacyGlobalFields {
        syncMode?: 'config-only' | 'full-vault';
        allowedFolders?: string;
        ignoredFolders?: string;
        deleteMissing?: boolean;
}

/** Вход миграции: settings как в data.json + политики + контекст запуска. */
export interface V3MigrationInput {
        settings: LegacyGlobalFields & {
                mirrorLevel?: unknown;
                migratedV3?: boolean;
        };
        syncPolicies: Record<string, SyncPolicy>;
        /** Источник, собранный к моменту миграции; null — сборки не было. */
        currentSourceId: string | null;
        /** Каталог плагина ('.obsidian/plugins/<dir>') — исключается при config-only. */
        pluginDir?: string;
}

/** Итог миграции: НОВЫЕ значения глобальных полей и политик. */
export interface V3MigrationResult {
        /** Были изменения → main.ts обязан сохранить settings. */
        changed: boolean;
        mirrorLevel: MirrorLevel;
        /** legacy-поля после очистки (постоянные значения). */
        syncMode: 'full-vault';
        allowedFolders: '';
        ignoredFolders: '';
        deleteMissing: false;
        /** Обновлённые политики (та же карта + возможная новая запись текущего источника). */
        syncPolicies: Record<string, SyncPolicy>;
}

function isMirrorLevel(v: unknown): v is MirrorLevel {
        return v === 'fetch' || v === 'light' || v === 'full';
}

/**
 * Конвертация legacy include/exclude-правил в охват-состояния 3.0:
 * exclude → off, include → on, inherit → без записи (прозрачность).
 * Правила с target (rename/move) остаются в FolderPolicy — переименования
 * живут в легаси-оси до W2-T07 (унификация UI дерева политики).
 */
function foldersToStates(folders: FolderPolicy[]): MirrorFolders {
        const out: MirrorFolders = {};
        for (const f of folders) {
                const path = normalizePolicyPath(f.path);
                if (f.include === 'exclude') out[path] = { state: 'off' };
                else if (f.include === 'include') out[path] = { state: 'on' };
                // 'inherit' — намеренное отсутствие записи
        }
        return out;
}

/** Структура-политика из ГЛОБАЛЬНЫХ текстовых фильтров (порт логики
 *  migrateLegacyStructurePolicy main.ts 2.3.3 — дословно, но с states). */
function structurePolicyFromGlobals(globals: LegacyGlobalFields, pluginDir: string): {
        policy: SyncPolicy;
        hasPolicy: boolean;
} {
        const hasFolderFilters = Boolean(
                (globals.allowedFolders ?? '').trim() || (globals.ignoredFolders ?? '').trim(),
        );
        if (globals.syncMode !== 'config-only' && !hasFolderFilters) {
                return { policy: { version: 1, mirror: false, folders: [] }, hasPolicy: false };
        }

        const folders: FolderPolicy[] = [];
        if (globals.syncMode === 'config-only') {
                folders.push({ path: '', include: 'exclude' });
                folders.push({ path: '.obsidian', include: 'include' });
                if (pluginDir) folders.push({ path: pluginDir, include: 'exclude' });
                const policy: SyncPolicy = {
                        version: 1,
                        mirror: false,
                        preset: 'obsidian',
                        folders,
                        mirrorFolders: foldersToStates(folders),
                };
                return { policy, hasPolicy: true };
        }

        // full-vault + текстовые фильтры → custom-пресет
        const allowed = (globals.allowedFolders ?? '')
                .split('\n').map((s) => s.trim()).filter(Boolean);
        const ignored = (globals.ignoredFolders ?? '')
                .split('\n').map((s) => s.trim()).filter(Boolean);
        if (allowed.length > 0) folders.push({ path: '', include: 'exclude' });
        for (const a of allowed) folders.push({ path: a, include: 'include' });
        for (const ig of ignored) folders.push({ path: ig, include: 'exclude' });
        const policy: SyncPolicy = {
                version: 1,
                mirror: false,
                preset: 'custom',
                folders,
                mirrorFolders: foldersToStates(folders),
        };
        return { policy, hasPolicy: true };
}

/**
 * Однократная миграция 2.3.3 → 3.0. Чистая: одинаковый вход → одинаковый
 * выход. Идемпотентна: settings.migratedV3=true → changed=false, значения
 * пробрасываются без изменений.
 */
export function migrateSettingsToV3(input: V3MigrationInput): V3MigrationResult {
        const { settings, syncPolicies, currentSourceId } = input;

        // Уже мигрировано: проброс (уровень валидируется на всякий случай).
        if (settings.migratedV3 === true) {
                return {
                        changed: false,
                        mirrorLevel: isMirrorLevel(settings.mirrorLevel) ? settings.mirrorLevel : 'fetch',
                        syncMode: 'full-vault',
                        allowedFolders: '',
                        ignoredFolders: '',
                        deleteMissing: false,
                        syncPolicies,
                };
        }

        // ── 1. Глобальный уровень: любой legacy-источник «light» → light. ──
        const anyPolicyMirror = Object.values(syncPolicies).some((p) => p?.mirror === true);
        const mirrorLevel: MirrorLevel = isMirrorLevel(settings.mirrorLevel)
                ? settings.mirrorLevel
                : migrateLegacyMirrorLevel({
                        mirror: anyPolicyMirror,
                        deleteMissing: settings.deleteMissing === true,
                });

        // ── 2. Существующие политики: mirror-флаг гаснет (поглощён уровнем),
        //      include/exclude конвертируются в states (merge: существующие
        //      mirrorFolders приоритетнее — не затираем осознанные 3.0-правки). ──
        const nextPolicies: Record<string, SyncPolicy> = {};
        for (const [id, policy] of Object.entries(syncPolicies)) {
                const folders = policy?.folders ?? [];
                const legacyStates = foldersToStates(folders);
                const mirrorFolders: MirrorFolders = { ...legacyStates, ...(policy.mirrorFolders ?? {}) };
                nextPolicies[id] = { ...policy, mirror: false, mirrorFolders };
        }

        // ── 3. Текущий источник без политики + глобальные фильтры → политика
        //      создаётся ОДИН раз (BUG-2: после очистки полей протекать нечему). ──
        if (currentSourceId && nextPolicies[currentSourceId] === undefined) {
                const { policy, hasPolicy } = structurePolicyFromGlobals(
                        {
                                syncMode: settings.syncMode,
                                allowedFolders: settings.allowedFolders,
                                ignoredFolders: settings.ignoredFolders,
                        },
                        input.pluginDir ?? '',
                );
                if (hasPolicy) nextPolicies[currentSourceId] = policy;
        }

        return {
                changed: true,
                mirrorLevel,
                syncMode: 'full-vault',
                allowedFolders: '',
                ignoredFolders: '',
                deleteMissing: false,
                syncPolicies: nextPolicies,
        };
}

// ────────────────────────────────────────────────────────────────────────
// [overhaul v4 / Этап 4] Миграция granular plugin exclusion
//
// Старые пресеты (до v4) исключали ВСЮ папку плагина через
// { path: pluginDir, include: 'exclude' } в folders. Это закрывало
// main.js / manifest.json / styles.css — они не синкались, и плагин
// на других машинах не обновлялся через sync.
//
// Новые пресеты (v4) — granular: исключают только machine-specific
// файлы (data.json, data.json.bak, vault-sync-journal.json,
// manifest-*.json) через fileExclusions. main.js и др. — в синке.
//
// Эта функция детектирует старый паттерн и мигрирует:
//  1. Убирает folder-exclude правило на pluginDir.
//  2. Добавляет granular fileExclusions (если их ещё нет).
//  3. Сохраняет остальные папки/правила без изменений.
//
// Идемпотентна: повторный вызов на уже-мигрированной политике — no-op.
// ────────────────────────────────────────────────────────────────────────

import type { FileExclusion } from '../sources/types';

/**
 * Паттерны machine-specific файлов, которые исключает новый пресет v4.
 * Используются для проверки наличия в существующей политике (если уже
*  есть — не дублируем при миграции).
 */
const MACHINE_SPECIFIC_PATTERNS: readonly string[] = [
        'data.json',
        'data.json.bak',
        'vault-sync-journal.json',
        'manifest-*.json',
];

/**
 * Миграция одной политики: folder-exclude на pluginDir → granular fileExclusions.
 *
 * @param policy Политика для миграции (не мутируется — возвращается новая).
 * @param pluginDir Каталог плагина ('.obsidian/plugins/<dir>' или пусто).
 * @returns { policy: новая политика, changed: была ли миграция }
 */
export function migratePluginExclusionToGranular(
        policy: SyncPolicy,
        pluginDir: string,
): { policy: SyncPolicy; changed: boolean } {
        if (!pluginDir) return { policy, changed: false };

        // Найти exclude-правило на pluginDir
        const pluginExcludeRule = policy.folders.find(
                (f) => f.path === pluginDir && f.include === 'exclude',
        );
        if (!pluginExcludeRule) return { policy, changed: false };

        // Убрать старое folder-exclude
        const newFolders = policy.folders.filter((f) => f !== pluginExcludeRule);

        // Подготовить granular fileExclusions (если их ещё нет)
        const existingExcl: FileExclusion[] = policy.fileExclusions
                ? [...policy.fileExclusions]
                : [];
        const newExclusions = [...existingExcl];
        for (const pattern of MACHINE_SPECIFIC_PATTERNS) {
                const exists = newExclusions.some(
                        (e) => e.pattern === pattern && (e.scope ?? '') === pluginDir,
                );
                if (!exists) {
                        newExclusions.push({
                                pattern,
                                scope: pluginDir,
                                note: 'migrated from folder exclude (v4)',
                        });
                }
        }

        return {
                policy: {
                        ...policy,
                        folders: newFolders,
                        fileExclusions: newExclusions,
                },
                changed: true,
        };
}

/**
 * Миграция всех политик в syncPolicies сразу (для runV4Migration в main.ts).
 *
 * @param syncPolicies Record<sourceId, SyncPolicy>
 * @param pluginDir Каталог плагина.
 * @returns { syncPolicies: обновлённые, changed: хоть одна политика мигрирована }
 */
export function migrateAllPluginExclusionsToGranular(
        syncPolicies: Record<string, SyncPolicy>,
        pluginDir: string,
): { syncPolicies: Record<string, SyncPolicy>; changed: boolean } {
        if (!pluginDir) return { syncPolicies, changed: false };

        let anyChanged = false;
        const next: Record<string, SyncPolicy> = {};
        for (const [id, policy] of Object.entries(syncPolicies)) {
                const { policy: newPolicy, changed } = migratePluginExclusionToGranular(
                        policy, pluginDir,
                );
                if (changed) anyChanged = true;
                next[id] = newPolicy;
        }
        return { syncPolicies: next, changed: anyChanged };
}
