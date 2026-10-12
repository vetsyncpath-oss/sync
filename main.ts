import { SyncWorkspaceModal } from './src/ui/sync-workspace-modal';
import { ProfileLibraryModal } from './src/ui/profile-library';
import { compileProfiles, migrateProfilePolicy, STANDARD_PROFILES, validateProfiles, type SyncProfile, type SourceConnection } from './src/core/profiles';
import { RoutedSource, routedNamespace } from './src/sources/routed-source';
import { computeLocalPath } from './src/core/policy';
import { scanVaultTree } from './src/core/mirror';
import { validateFileRules, type FileRule } from './src/core/file-rules';
import {
        App,
        Notice,
        Plugin,
        PluginSettingTab,
        Setting,
        normalizePath,
        Modal,
        Platform,
        requestUrl
} from 'obsidian';
import type { DataAdapter } from 'obsidian';

import { GitSource } from './src/sources/git-source';
import { ZipUrlSource } from './src/sources/zip-url-source';
import { YandexSource } from './src/sources/yandex-source';
// [W3-T03] реестр движков — единая фабрика kind→descriptor; main.ts
// перестал дублировать switch по виду движка (§8.1 аудита).
import { EngineRegistry, type EngineCtx } from './src/engines/registry';
// [W3-T04] NodeZipRangeTransport — десктопный транспорт для лёгкой
// проверки ZIP-соединения (HEAD + Range-хвост, без полного скачивания).
import { NodeArchiveDownloader, NodeZipRangeTransport } from './src/adapters/archive-downloader';
// [W3-T03] resolveLabel — резолвер i18n-пути для schema-driven SettingsTab;
// [W3-T04] type-only ZipRangeTransport — аннотация для engineCtx().rangeTransport.
import { i18n, setLocale, resolveLabel, type Locale } from './src/i18n';
import type { ZipRangeTransport } from './src/sources/zip-test-connection';
import { Coordinator } from './src/core/coordinator';
import { OperationStore } from './src/core/operation-store';
import { RecoveryStore } from './src/core/recovery-store';
import { DurableMutations } from './src/core/durable-mutations';
import { Scheduler, type SchedulerInterval, type SchedulerSnapshot } from './src/core/scheduler';
import { FetchTransport } from './src/adapters/fetch-transport';
import { BufferArchiveReader } from './src/core/archive';
import { ConflictResolver, buildStampedPath, formatConflictTimestamp } from './src/core/conflict';
// [overhaul S6] тег сборки — залогируется при загрузке плагина и в каждой
// сессии: по присланному логу видно, какая версия исполняется (урок
// инцидента «всё так же» на необновлённой сборке).
import { BUILD_TAG } from './src/core/build';
import { ManifestCache, gcManifestCaches } from './src/core/manifest-cache';
import { isSourceConfigured, reconnectStatus } from './src/core/config-guards';
import { FailedQueue } from './src/core/queue';
import { PathPolicy } from './src/core/path-policy';
import type { SyncPolicy } from './src/core/policy';
import type { VaultTreeModalLabels } from './src/ui/vault-tree-modal';
import { injectPluginCss, removePluginCss } from './src/ui/styles';
// [W2-T02] чистая display-логика статус-бара (чип Д13 + сегменты состояний)
import { statusBarView } from './src/ui/statusbar-view';
// [P2/M4] канонические билдеры пресетов структуры (дедупликация инлайн-копий
// из applyStructurePreset/онбординга — находка §5.15 пост-аудита: функции
// status.ts были мёртвым кодом, пока main дублировал их вручную).
import { obsidianOnlyPolicy, fullVaultPolicy } from './src/ui/status';
// [W2-T04] единый confirm-modal (DOM-слой): один шаблон для sync/force/retry/scan (В5=1+2)
import { ConfirmModalView, type ConfirmFlow, type ConfirmSections } from './src/ui/confirm-modal';
import { sha256Hex, crc32Hex, gitBlobSha1Hex } from './src/core/hasher';
import { debounce } from './src/utils/concurrency';
import { formatBytes } from './src/utils/format';
import type {
        ArchiveDownloader,
        CacheEntry,
        ConflictChoice,
        ConflictInfo,
        ConflictStrategy,
        FailedFile,
        FileExclusion,
        FileSystem,
        LightConflictStrategy,
        SyncUI,
        VaultAdapter,
} from './src/sources/types';
// [W3-T03] i18n-менеджер вынесен в src/i18n (W2-T01) — импорт наверху,
// рядом с EngineRegistry (оба относятся к проводке реестра движков).
import type { MirrorLevel } from './src/core/mirror';
import { migrateSettingsToV3 } from './src/core/migration';
// [overhaul v4 / Этап 4] миграция granular plugin exclusion.
import { migrateAllPluginExclusionsToGranular } from './src/core/migration';
// [W2-T05] journalSummary — канонический агрегатор журнала для чипов
// Диагностики (В6=3); переиспользуем ядро, не дублируем логику в SettingsTab.
import { FileJournal, journalSummary, topErrorsFrom, type JournalEntry, type JournalIo } from './src/core/journal';
import { JournalModalView } from './src/ui/journal-modal';
import { SyncPopoverView, type PopoverState } from './src/ui/sync-popover';
import { OnboardingModalView, type OnboardingChoice } from './src/ui/onboarding-modal';
// [W5-T01] governance — fail-closed state machine для контроля менеджер-плагина.
// Чистый модуль: main.ts владеет инстансом GovernanceState, обновляет его по
// probe и интегрирует guard в runSession (fail-closed на старте сессии).
import {
    initGovernance,
    probeManager,
    resetGovernance,
    isSyncAllowed,
    blockReason,
    snapshotGovernance,
    awaitBeforeSession,
    type GovernanceState,
    type ManagerProbe,
} from './src/core/governance';
// [W5-T02] window.vaultSync — read-only pub/sub реестр для сторонних плагинов.
// main.ts владеет singleton SubscriberRegistry, выставляет window.vaultSync в
// onload и снимает в onunload. Состояние берётся из live plugin state.
import {
    createSubscriberRegistry,
    type SubscriberRegistry,
    type VaultSyncState,
} from './src/core/vault-sync-hook';
// [VAM] Контроль доступа (из плагина-донора Note AI Assistant, «схожим
// образом»): вендоримый гвард протокола v4 (window.__VAM__) + наш мост —
// гейт «работы, требующей входа» для ВСЕХ сессий синка (аналог гейта
// AI-запросов в доноре) и локализация кодов причин. Гвард — «капля-в-замене»
// из поставки VAM: НЕ правится руками, обновление = замена файла целиком.
import { vamGuard, type VamGate } from './src/vam/vam-guard';
import {
    assertVamAllowed,
    describeVamReason,
    describeVamStatus,
    vamAllowsWork,
} from './src/vam/vam-bridge';
// [VAM] Статусная модалка (команда «Статус доступа (VAM)» + Диагностика):
// показывает granted/blocked/pending с причиной; скрытый бэкдор —
// 10 ЛКМ по телу модалки → мягкий режим (сессионный, без записи в data.json).
// [overhaul S1/H-2] жест ПУБЛИЧЕН: работает у любого пользователя, знающего
// о нём (осознанное решение владельца); UI о жесте не сообщает.
import { VamStatusModal } from './src/ui/vam-status-modal';
// [overhaul S4 / S3-review #2] общий реестр модалок (main + vault-tree-modal).
import { trackModal, closeAllTrackedModals } from './src/ui/modal-registry';

// ============================================================
// --- CONSTANTS ---
// ============================================================

const DEBOUNCE_MS = 500;
const REQUEST_TIMEOUT_MS = 60000; // таймаут API-запросов источников (git/yandex)
// [P2 / manager-build-spec §3.5] таймаут ожидания менеджера аутентификации
// в guard-фазе runSession: менеджер делает pull credentials-канала; зависший
// pull не должен замораживать сессию дольше 10 с (вердикт остаётся прежним).
const BEFORE_SESSION_TIMEOUT_MS = 10_000;

// ============================================================
// --- INTERFACES ---
// ============================================================

type SyncState = 'idle' | 'syncing' | 'error' | 'offline' | 'conflicts' | 'unconfigured';

interface GitSyncSettings {
        vaultPolicy?: SyncPolicy;
        profiles?: SyncProfile[];
        connections?: SourceConnection[];
        failedQueues?: Record<string, FailedFile[]>;
        repoUrl: string;
        accessToken: string;
        branch: string;
        /** [W6-T04] GitHub Enterprise / Gitea API base URL. Empty = https://api.github.com */
        gitBaseUrl?: string;
        /** [W6-T03] Google Drive API key (secret). */
        gdriveApiKey?: string;
        /** [W6-T03] Google Drive folder ID (optional). */
        gdriveFolderId?: string;
        /** [W6-T03] Include Google Docs/Sheets/Slides (default false). */
        gdriveIncludeDocs?: boolean;
        /** [W6-T05] WebDAV base URL. */
        webdavBaseUrl?: string;
        /** [W6-T05] WebDAV username for Basic auth. */
        webdavUsername?: string;
        /** [W6-T05] WebDAV password (secret, optional for public WebDAV). */
        webdavPassword?: string;
        /** [W6-T05] WebDAV root path inside baseUrl (optional). */
        webdavRootPath?: string;
        syncMode: 'config-only' | 'full-vault';
        /** [W1-T08 / BUG-5] Глобальный уровень зеркала (fetch/light/full);
         *  поглотил deleteMissing-тумблер и policy.mirror (миграция §2.4). */
        mirrorLevel?: MirrorLevel;
        /** [W1-T08 / BUG-2] Миграция 3.0 выполнена — ровно один раз. */
        migratedV3?: boolean;
        /**
         * [overhaul v4 / Этап 4] Миграция granular plugin exclusion выполнена.
         *
         * Старые пресеты исключали ВСЮ папку плагина через folder-exclude.
         * Новые — granular: только data.json/data.json.bak/journal/manifest-*.json
         * через fileExclusions, оставляя main.js/manifest.json/styles.css в синке.
         *
         * Idempotent: после миграции флаг=true, повторный вызов no-op.
         */
        migratedV4?: boolean;
        /** [5-g] Источник: GitHub или zip-ссылка (UI-переключатель — фаза 7). */
        sourceType: 'git' | 'zip-url' | 'yandex' | 'gdrive' | 'webdav';
        /** [7-d] Мобильный лимит архива, МБ; 0 — без проверки (дизайн §7.1). */
        mobileArchiveWarnBytes: number;
        /** [5-g] Ссылка на архив/папку для zip-источника. */
        vaultUrl: string;
        _syncModeLegacy?: 'obsidian' | 'all';
        allowedFolders: string;
        ignoredFolders: string;
        allowPlugins: boolean;
        allowSnippets: boolean;
        deleteMissing: boolean;
        useTrash: boolean;
        conflictStrategy: ConflictStrategy;
        /**
         * [overhaul v4 / Этап 3] Стратегия конфликтов для Light mirror.
         *  - 'keep-local' (default, текущее поведение): локаль остаётся, remote в .conflict-копию
         *  - 'keep-both': локаль в .conflict-копию, remote на место (как fetch-keep-both)
         *
         * Используется ТОЛЬКО при mirror='light'. При mirror='full' игнорируется
         * (full всегда trash + remote на место). При mirror='fetch' используется
         * глобальная conflictStrategy.
         */
        lightConflictStrategy?: LightConflictStrategy;
        language: Locale;               // [i18n] Language setting
        /** [deprecated 4-2] миграционный источник для ManifestCache; после переноса не читается */
        lastSyncShas: Record<string, string>;
        failedQueue: FailedFile[];
        lastSyncTime: number;
        totalSyncCount: number;
        lastCommitSha: string;
        // [overhaul 2-1] Syncthing -> legacy: opaque pass-through, data.json preserved
        syncthing?: Record<string, unknown>;
        /** [POLICY Phase 2] per-source структура-политика (ключ = sourceId);
         * отсутствие записи = нет политики → legacy-режим (deleteMissing-настройка).
         * Записывается Phase 5 (modal Save); вариант A: после первого сохранения
         * политики источника его mirror-флаг становится авторитетным. */
        syncPolicies?: Record<string, SyncPolicy>;
        /** [W2-T06] онбординг пройден (открыт при первом sync, Д8=1). */
        onboarded?: boolean;
        /** [W2-T06] синхронизировать интерфейс (workspace.json). */
        workspaceSync?: boolean;
        /** [W4-T01] интервал авто-синхронизации (планировщик). Дефолт 'off' —
         *  авто-синк отключён до явного выбора пользователя. */
        autoSyncInterval?: 'off' | 'startup-only' | '15m' | '30m' | '1h' | '2h';
        /** [W4-T02] подробные уведомления (А5, Д6=1+2). false по умолчанию —
         *  в auto-режиме дропаются низкоприоритетные Notice (orphan warnings). */
        verboseNotices?: boolean;
        /** [W5-T01] персистентный флаг fail-closed governance (Е4=2, §6 спеки).
         *  Поднимается при первом probe менеджера с authOk=true (или authOk=false);
         *  после этого — fail-closed навсегда (старт в blocked); сброс только
         *  ручной через Диагностику (A4). */
        governanceManagerEverActive?: boolean;
}

const DEFAULT_SETTINGS: GitSyncSettings = {
        repoUrl: '',
        accessToken: '',
        branch: 'main',
        // [W1-T08] свежие установки — сразу 3.0: весь vault, уровень fetch
        // (BUG-3-логика: дефолт «клон хозяйского vault»; онбординг W2-T06).
        syncMode: 'full-vault',
        mirrorLevel: 'fetch',
        migratedV3: true,
        sourceType: 'git',
        mobileArchiveWarnBytes: 200,
        vaultUrl: '',
        allowedFolders: '',
        ignoredFolders: '',
        allowPlugins: false,
        allowSnippets: false,
        deleteMissing: false,
        useTrash: true,
        conflictStrategy: 'keep-both',
        // [overhaul v4 / Этап 3] default 'keep-local' = текущее поведение light-mirror.
        lightConflictStrategy: 'keep-local',
        language: 'en',
        lastSyncShas: {},
        failedQueue: [],
        lastSyncTime: 0,
        totalSyncCount: 0,
        lastCommitSha: '',
        syncPolicies: {},
        autoSyncInterval: 'off',
        verboseNotices: false,
        // [W5-T01] fail-closed по умолчанию выключен: пользователь не пользуется
        // менеджер-плагином — синк свободен с первой установки. Флаг поднимается
        // только при первом probe менеджера с подтверждённой аутентификацией.
        governanceManagerEverActive: false,
};


// --- CLASS: Status Bar Manager ---

class StatusBarManager {
        private statusBarEl: HTMLElement | null = null;
        private state: SyncState = 'idle';
        private lastSyncText: string = '';
        private pendingCount: number = 0;
        private progressText: string = '';
        private clickHandler: (() => void) | null = null;
        private bytesTransferred: number = 0;
        private totalBytes: number = 0;
        // [P2/3.2] фаза конвейера (0..5) для popover-полосы; -1 = вне сессии.
        // Обновляется только setStatus('syncing', {phase}) от Coordinator;
        // любой не-syncing статус сбрасывает в -1 (полоса не рендерится).
        private pipelinePhase = -1;
        // [W2-T02 / Д13=1] уровень зеркала для чипа опасности;
        // display-логика — чистая statusBarView (src/ui/statusbar-view.ts).
        private mirrorLevel: MirrorLevel | undefined = 'fetch';

        setElement(el: HTMLElement) {
                this.statusBarEl = el;
                this.updateDisplay();
        }

        setState(state: SyncState, options?: {
                progressText?: string;
                pendingCount?: number;
                bytesTransferred?: number;
                totalBytes?: number;
                phase?: number;
        }) {
                this.state = state;
                if (options?.progressText !== undefined) this.progressText = options.progressText;
                if (options?.pendingCount !== undefined) this.pendingCount = options.pendingCount;
                if (options?.bytesTransferred !== undefined) this.bytesTransferred = options.bytesTransferred;
                if (options?.totalBytes !== undefined) this.totalBytes = options.totalBytes;
                // [P2/3.2] фаза: живёт только в 'syncing'; любой выход из синка —
                // сброс (popover прячет секцию прогресса по -1).
                if (state === 'syncing' && options?.phase !== undefined) this.pipelinePhase = options.phase;
                if (state !== 'syncing') this.pipelinePhase = -1;
                this.updateDisplay();
        }

        setLastSync(timestamp: number) {
                this.lastSyncText = this.formatTimeAgo(timestamp);
                this.updateDisplay();
        }

        // [W2-T02 / Д13=1] чип уровня зеркала: вызывается при старте (onload
        // после buildEngine) и при каждой смене конфигурации (prepareSession).
        setMirrorLevel(level: MirrorLevel | undefined) {
                this.mirrorLevel = level;
                this.updateDisplay();
        }

        setClickHandler(handler: () => void) {
                this.clickHandler = handler;
                if (this.statusBarEl) this.statusBarEl.onclick = handler;
        }

        private formatTimeAgo(timestamp: number): string {
                if (!timestamp) return i18n.t.timeNever;
                const seconds = Math.floor((Date.now() - timestamp) / 1000);
                if (seconds < 60) return i18n.t.timeJustNow;
                if (seconds < 3600) return i18n.t.timeMinutesAgo(Math.floor(seconds / 60));
                if (seconds < 86400) return i18n.t.timeHoursAgo(Math.floor(seconds / 3600));
                return i18n.t.timeDaysAgo(Math.floor(seconds / 86400));
        }

        // [W2-T02] display-логика (сегменты, чип уровня, tooltip) вынесена в чистую
        // statusBarView — тестируется напрямую (tests/statusbar-view.test.ts);
        // DOM-часть осталась тонкой: создать span-ы по сегментам.
        private updateDisplay() {
                if (!this.statusBarEl) return;
                const view = statusBarView(this.state, {
                        pendingCount: this.pendingCount,
                        progressText: this.progressText,
                        bytesTransferred: this.bytesTransferred,
                        totalBytes: this.totalBytes,
                        lastSyncText: this.lastSyncText,
                        mirrorLevel: this.mirrorLevel,
                        texts: i18n.t,
                });
                this.statusBarEl.empty();
                for (const seg of view.segments) {
                        const span = this.statusBarEl.createSpan({ text: seg.text, cls: seg.cls });
                        // [W2-T02 / Д13=1] чип несёт собственный tooltip (уровень зеркала)
                        if (seg.chip) span.setAttr('aria-label', view.chipTooltip ?? '');
                }
                this.statusBarEl.setAttr('aria-label', view.tooltip);
                this.statusBarEl.className = view.containerCls;
        }

        refresh() { this.updateDisplay(); }
}


// --- CLASS: Settings Manager ---

class SettingsManager {
        private plugin: GitSyncPlugin;
        private saveQueued = false;
        private saveInProgress = false;
        private debouncedSave: ReturnType<typeof debounce>;

        constructor(plugin: GitSyncPlugin) {
                this.plugin = plugin;
                this.debouncedSave = debounce(() => this.doSave(), DEBOUNCE_MS);
        }

        async load(): Promise<GitSyncSettings> {
                // [overhaul S2/M-8] битый data.json (краш в момент записи) раньше
                // валил onload плагина НАВСЕГДА («кирпич»). Теперь: try/catch →
                // попытка data.json.bak (снапшот прошлого успешного старта) → честная
                // деградация до дефолтов с Notice. Секреты при деградации теряются
                // (пользователь перенастроит), но плагин остаётся живым.
                let loadedData: Record<string, unknown>;
                try {
                        loadedData = (await this.plugin.loadData()) || {};
                } catch (e) {
                        console.error('[VaultSync] data.json повреждён, пробуем data.json.bak:', e);
                        const backup = await this.readBackupSnapshot();
                        if (backup !== null) {
                                loadedData = backup;
                                new Notice(i18n.t.noticeSettingsCorruptBackup, 10000);
                        } else {
                                loadedData = {};
                                new Notice(i18n.t.noticeSettingsCorruptDefaults, 12000);
                        }
                }
                const settings = Object.assign({}, DEFAULT_SETTINGS, loadedData) as GitSyncSettings;

                if (!settings.lastSyncShas || typeof settings.lastSyncShas !== 'object' || Array.isArray(settings.lastSyncShas)) {
                        settings.lastSyncShas = {};
                }
                if (!settings.failedQueue || !Array.isArray(settings.failedQueue)) {
                        settings.failedQueue = [];
                }
                if ((loadedData as any).syncMode === 'obsidian') {
                        settings.syncMode = 'config-only';
                } else if ((loadedData as any).syncMode === 'all') {
                        settings.syncMode = 'full-vault';
                }
                for (const f of settings.failedQueue) {
                        if (f.retryCount === undefined) f.retryCount = 0;
                        if (f.nextRetryAt === undefined) f.nextRetryAt = 0;
                }
                if (!settings.language) {
                        settings.language = 'en';
                }
                // [POLICY Phase 2] нормализация syncPolicies (дизайн §2.4): чистый
                // Record<sourceId, SyncPolicy>; битые записи сбрасываются (проще безопаснее
                // угадывания). mirror НЕ наследует старый глобальный deleteMissing
                // (вариант A: legacy-toggle живёт своей жизнью до окна депрекации).
                if (!settings.syncPolicies || typeof settings.syncPolicies !== 'object' || Array.isArray(settings.syncPolicies)) {
                        settings.syncPolicies = {};
                }
                for (const id of Object.keys(settings.syncPolicies)) {
                        const sp = settings.syncPolicies[id];
                        if (!sp || typeof sp !== 'object' || sp.version !== 1 || !Array.isArray(sp.folders)) {
                                delete settings.syncPolicies[id];
                                continue;
                        }
                        sp.mirror = sp.mirror === true;
                }
                // [W4-T01] нормализация авто-синхронизации (А5: дефолт 'off' — явный
                // выбор пользователя включает авто-синк). verboseNotices=false по умолчанию.
                const VALID_INTERVALS = ['off', 'startup-only', '15m', '30m', '1h', '2h'] as const;
                if (!settings.autoSyncInterval || !VALID_INTERVALS.includes(settings.autoSyncInterval)) {
                        settings.autoSyncInterval = 'off';
                }
                if (typeof settings.verboseNotices !== 'boolean') {
                        settings.verboseNotices = false;
                }
                // [overhaul v4 / Этап 3] нормализация lightConflictStrategy:
                // default 'keep-local' (текущее поведение light-mirror, backward compat).
                // Битое значение (мусор в data.json) → 'keep-local' (безопасный дефолт).
                const VALID_LIGHT_STRATEGIES = ['keep-local', 'keep-both'] as const;
                if (!settings.lightConflictStrategy
                        || !VALID_LIGHT_STRATEGIES.includes(settings.lightConflictStrategy)) {
                        settings.lightConflictStrategy = 'keep-local';
                }
                // [overhaul v4 / Этап 4] нормализация syncPolicies.fileExclusions
                // (если прислали не-массив — выкидываем поле; default = absent = никаких исключений).
                for (const sp of Object.values(settings.syncPolicies ?? {})) {
                        if (sp && sp.fileExclusions !== undefined && !Array.isArray(sp.fileExclusions)) {
                                delete sp.fileExclusions;
                        }
                }
                // [W5-T01] нормализация governance-флага: boolean, default false.
                // Если в data.json когда либо записали что-то не-boolean
                // (коррупция файла, ручная правка), сбрасываем в false —
                // fail-closed не должен активироваться от мусора.
                if (typeof settings.governanceManagerEverActive !== 'boolean') {
                        settings.governanceManagerEverActive = false;
                }
                // [overhaul 2-1] Syncthing -> legacy: настройки не нормализуем, pass-through
                // [overhaul S2/M-8] снапшот успешно загруженных/нормализованных настроек:
                // .bak переживает краш в момент СЛЕДУЮЩЕЙ записи data.json. Best-effort.
                void this.writeBackupSnapshot(settings);
                return settings;
        }

        /** [overhaul S2/M-8] Прочитать data.json.bak (null — файла нет или бит).
         *  Снапшот пишет writeBackupSnapshot при каждом успешном старте. */
        private async readBackupSnapshot(): Promise<Record<string, unknown> | null> {
                try {
                        const dir = this.plugin.manifest.dir ?? '';
                        if (!dir) return null;
                        const raw = await this.plugin.app.vault.adapter.read(`${dir}/data.json.bak`);
                        const parsed = JSON.parse(raw);
                        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                                ? parsed as Record<string, unknown>
                                : null;
                } catch {
                        return null;
                }
        }

        /** [overhaul S2/M-8] Записать снапшот настроек в data.json.bak (best-effort). */
        private async writeBackupSnapshot(settings: GitSyncSettings): Promise<void> {
                try {
                        const dir = this.plugin.manifest.dir ?? '';
                        if (!dir) return;
                        const json = JSON.stringify(settings, null, 2);
                        await this.plugin.app.vault.adapter.write(`${dir}/data.json.bak`, json);
                } catch (e) {
                        console.warn('[VaultSync] не удалось записать data.json.bak:', e);
                }
        }

        queueSave() { this.debouncedSave(); }

        async saveImmediate(): Promise<void> {
                this.debouncedSave.cancel();
                await this.doSave();
        }

        private async doSave(): Promise<void> {
                if (this.saveInProgress) { this.saveQueued = true; return; }
                this.saveInProgress = true;
                try {
                        const dataToSave = JSON.parse(JSON.stringify(this.plugin.settings));
                        await this.plugin.saveData(dataToSave);
                } finally {
                        this.saveInProgress = false;
                        if (this.saveQueued) { this.saveQueued = false; await this.doSave(); }
                }
        }
}



// --- [W2-T04] Единый confirm-modal (обёртка Modal + ConfirmModalView) ---
// Раньше тут лежал класс SyncConfirmModal (4 разные html-сборки в main.ts).
// Заменён тонкой обёрткой: ConfirmModalView (src/ui/confirm-modal.ts)
// владеет рендером секций/путей/кнопок, эта обёртка связывает Modal-цикл
// (onOpen→render, onClose→view.close) с Promise-результатом.
// Идемпотентность: ровно один resolve (view.resolved), повторный onClose
// (Modal.close после onProceed) — обрывается флагом.
async function showConfirmModal(
        app: App,
        flow: ConfirmFlow,
        sections: ConfirmSections,
        engine: string,
): Promise<boolean> {
        const modal = new Modal(app);
        const view = new ConfirmModalView({
                contentEl: modal.contentEl,
                flow,
                sections,
                engine,
                onProceed: () => modal.close(),
                onCancel: () => modal.close(),
        });
        modal.onOpen = () => view.render();
        // Esc/фон: трактуем как cancel. После proceed/cancel-клика флаг
        // view.resolved уже выставлен — повторный вызов close() игнор.
        modal.onClose = () => view.close();
        trackModal(modal); // [overhaul S3/M-18]
        modal.open();
        return view.waitForResult();
}

/**
 * [W5-T01] Простой yes/no Modal с warning-текстом — для подтверждения
 * security-relevant действий, не подходящих под типизированные confirm-flows
 * (force/scan) из ConfirmModalView. Например, ручной сброс governance (A4).
 *
 * Возвращает Promise<boolean>: true — подтверждено, false — отменено
 * (включая закрытие по Esc/фону). Идемпотентен: повторный resolve — no-op.
 */
async function showYesNoModal(
        app: App,
        title: string,
        body: string,
        warning: string,
): Promise<boolean> {
        const modal = new Modal(app);
        let resolved = false;
        let _resolve: ((v: boolean) => void) | null = null;
        const done = (v: boolean) => {
                if (resolved) return;
                resolved = true;
                _resolve?.(v);
                modal.close();
        };
        modal.titleEl.setText(title);
        const content = modal.contentEl.createDiv({ cls: 'git-sync-confirm-message' });
        content.createEl('p', { text: body });
        content.createEl('p', { text: warning, cls: 'mod-warning' });
        const btns = content.createDiv({ cls: 'modal-button-container' });
        new Setting(btns)
                .addButton(b => {
                        b.setButtonText(i18n.t.modalConfirm).setCta()
                                .onClick(() => done(true));
                })
                .addButton(b => {
                        b.setButtonText(i18n.t.modalCancel)
                                .onClick(() => done(false));
                });
        modal.onClose = () => { if (!resolved) done(false); };
        trackModal(modal); // [overhaul S3/M-18]
        modal.open();
        return new Promise<boolean>((resolve) => { _resolve = resolve; });
}


// --- CLASS: Conflict Ask Modal (фаза 3-7: ConfirmUI для core/conflict.ts) ---
// Три явных выбора вместо старого yes/no-диалога. Последовательность
// обеспечивает ConflictResolver — один await на конфликт (фикс Б-21).

class ConflictAskModal extends Modal {
        private resolved = false;
        private _resolve: ((choice: ConflictChoice) => void) | null = null;

        constructor(app: App, private info: ConflictInfo) {
                super(app);
        }

        onOpen() {
                const { contentEl } = this;
                const t = i18n.t;
                contentEl.empty();
                contentEl.createEl('h2', { text: t.modalConflictTitle });
                const msgEl = contentEl.createDiv({ cls: 'git-sync-confirm-message' });
                // БЗ-03: путь выводится через DOM-узел, а не innerHTML
                msgEl.createEl('p').createEl('code', { text: this.info.path });
                msgEl.createEl('p', { text: t.modalConflictDesc });
                msgEl.createEl('p', { text: t.modalConflictQuestion });
                const btns = contentEl.createDiv({ cls: 'modal-button-container' });
                new Setting(btns)
                        .addButton(b => {
                                b.setButtonText(t.modalConflictKeepRemote).setCta();
                                b.onClick(() => this.resolve('remote-wins'));
                        })
                        .addButton(b => {
                                b.setButtonText(t.settConflictLocalWins);
                                b.onClick(() => this.resolve('local-wins'));
                        })
                        .addButton(b => {
                                b.setButtonText(t.settConflictKeepBoth).setWarning();
                                b.onClick(() => this.resolve('keep-both'));
                        });
        }

        onClose() {
                if (!this.resolved) this.resolve('keep-both');
        }

        wait(): Promise<ConflictChoice> {
                return new Promise<ConflictChoice>((resolve) => {
                        this._resolve = resolve;
                        this.open();
                });
        }

        private resolve(choice: ConflictChoice) {
                if (this.resolved) return;
                this.resolved = true;
                this._resolve?.(choice);
                this.close();
        }
}


/**
 * [overhaul v4 / Этап 4] Слияние base fileExclusions из пресета с
 * существующими пользовательскими исключениями.
 *
 * Логика: берём base (стандартные machine-specific + global patterns из
 * пресета), затем добавляем кастомные пользовательские (которых нет в
 * base по pattern+scope). Дедуп по pattern+scope.
 *
 * Пример: пресет добавляет `data.json @ .obsidian/plugins/cloud-sync`.
 * Пользователь добавил `*.draft.md` (без scope) и `data.json @ .obsidian/plugins/other-plugin`.
 * Итог: base + `*.draft.md` + `data.json @ .obsidian/plugins/other-plugin`
 * (data.json @ .obsidian/plugins/cloud-sync не дублируется).
 */
function mergeFileExclusions(
        base: readonly FileExclusion[],
        existing: readonly FileExclusion[] | undefined,
): FileExclusion[] {
        const merged: FileExclusion[] = [...base];
        if (!existing || existing.length === 0) return merged;
        const key = (e: FileExclusion): string => `${e.pattern}|${e.scope ?? ''}`;
        const seen = new Set(merged.map(key));
        for (const ex of existing) {
                const k = key(ex);
                if (!seen.has(k)) {
                        seen.add(k);
                        merged.push({ ...ex });
                }
        }
        return merged;
}

// ============================================================
// --- MAIN PLUGIN CLASS ---
// Фаза 4: вся логика конвейера делегирована core/coordinator.ts;
// плагин — каркас: настройки, UI-порты, команды, адаптеры.
// ============================================================

export default class GitSyncPlugin extends Plugin {
        declare settings: GitSyncSettings;

        private settingsManager!: SettingsManager;
        private statusBar!: StatusBarManager;
        private gitSource!: GitSource;
        private coordinator!: Coordinator;
        private sessionOwned = false;
        private builtEngineConfigKey = '';
        private configurationEpoch = 0;
        private configurationKey = '';
        private preparedConfigRevision = 0;
        // [W4-T01] планировщик авто-синхронизации: создается в onload (после buildEngine),
        // интервал из settings.autoSyncInterval; снимается в onunload.
        private scheduler?: Scheduler;
        // [W5-T01] governance — fail-closed state. Инициализируется в onload
        // из персистентного флага; обновляется через applyManagerProbe
        // (вызывается из хука менеджера, когда он появится, или вручную из
        // тестов). Guard в runSession: isSyncAllowed=false → отказ с Notice.
        // Public: SettingsTab читает live-снимок (status/managerEverActive/
        // lastCheckedAt/lastBlockedReason) для чипа и состояния кнопки сброса.
        governance: GovernanceState = initGovernance(false);
        // [VAM] гвард контроля доступа (протокол v4, window.__VAM__). Создаётся
        // в onload (vamGuard), dispose — в onunload. null до onload/после
        // выгрузки: vam-bridge трактует это как fail-closed (работа запрещена).
        // Публичное поле: vam-bridge читает его через структурный порт
        // VamPluginPort, SettingsTab — для чипа Диагностики.
        vam: VamGate | null = null;
        // [VAM] мягкий режим (сессионный; СКРЫТЫЙ жест статусной модалки —
        // 10 ЛКМ по её телу; [overhaul S1/H-2] доступен ЛЮБОМУ пользователю,
        // знающему о нём — осознанное решение владельца, UI о жесте не
        // сообщает): true → работа разрешена без подтверждения VAM. НЕ
        // пишется в data.json — следующая загрузка стартует с честным гейтом.
        vamSoftMode = false;
        // [W5-T02] реестр подписчиков window.vaultSync. Создаётся в onload,
        // выставляется как window.vaultSync = { getState, onChanged },
        // снимается в onunload. Состояние собирается из live plugin state.
        private vaultSyncHook?: SubscriberRegistry;
        // [W2-T05] публичные поля для SettingsTab: очередь и журнал читаются
        // чипами Диагностики (failedQueue.all(), journal.load() — async).
        queue!: FailedQueue;
        // [W2-T08] журнал сессий (кольцо 50 в configDir); единый источник
        // для чипов Диагностики (W2-T05) и popover (W2-T03).
        journal!: FileJournal;
        // [W2-T03] открытый popover (если есть) — обновляется на каждом setStatus
        private popoverView?: SyncPopoverView;
        // [4-review] доступен SettingsTab (статистика Tracked files)
        cache!: ManifestCache;
        private fsAdapter!: FileSystem;
        builtSourceId = '';
        private builtKind: 'git' | 'zip-url' | 'yandex' | 'gdrive' | 'webdav' = 'git';
        private zipDownloader?: ArchiveDownloader;
        // [W3-T04] лёгкий Range-транспорт для ZIP Test Connection; кешируется
        // (как zipDownloader) — не пересоздаём http-агента между вызовами.
        // undefined на мобайле → testConnection идёт fallback full.
        private zipRangeTransport?: ZipRangeTransport;
        // [overhaul 3-7/3-review] доступен SettingsTab (переписывается в фазе 7)
        conflictResolver!: ConflictResolver;

        // [3-review] Б-21 на уровне интеграции: ask-модалки строго по одной
        private askChain: Promise<unknown> = Promise.resolve();

        // [W1-T03/BUG-17] возврат сети больше не затирает error слепым 'idle':
        // при непустой failed-очереди показываем 'error' + pendingCount.
        // queue создаётся в buildEngine() позже onload — отсюда optional-chaining.
        private onlineHandler = () => {
                const r = reconnectStatus(this.queue?.size() ?? 0);
                this.statusBar.setState(r.state, r.state === 'error' ? { pendingCount: r.pendingCount } : undefined);
        };
        private offlineHandler = () => this.statusBar.setState('offline');
        private focusHandler = () => {
                this.statusBar.setLastSync(this.settings.lastSyncTime);
                this.statusBar.refresh();
        };

        async onload() {
                // [overhaul S6] Первая строка любого лога — идентификация сборки:
                // симптом «всё так же останавливается» после фикса почти всегда =
                // исполняется старый main.js. Теперь это видно мгновенно.
                console.info(`[VaultSync] plugin loaded: build=${BUILD_TAG}, id=${this.manifest.id}`);
                // [Phase 4.1] стили зашиты в бандл: работают даже если styles.css
                // не скопирован в папку плагина (idempotent при наличии styles.css)
                injectPluginCss();
                this.settingsManager = new SettingsManager(this);
                this.statusBar = new StatusBarManager();
                this.settings = await this.settingsManager.load();

                // [i18n] Initialize locale from settings
                setLocale(this.settings.language);

                // [W5-T01] governance: старт из персистентного флага. Если true —
                // fail-closed с первой секунды (пользователь вышел с активным
                // менеджером → при следующем запуске синк сразу в blocked, до
                // probe). Probe делает сам менеджер через window.vaultSyncAuth
                // (появится в будущей волне менеджер-плагина); пока — нет probe,
                // статус остаётся стартовым.
                this.governance = initGovernance(this.settings.governanceManagerEverActive ?? false);

                // [VAM] гвард контроля доступа: единая точка решения «разрешена
                // ли работа, требующая входа» (гейт — в runSession). Подписки:
                //   • onChange — ЛЮБОЕ изменение состояния в обе стороны →
                //     пересчёт для подписчиков window.vaultSync (vam-поле снимка)
                //     и свежесть статус-бара;
                //   • onRevoked — mid-session отзыв после granted: внятный Notice;
                //     новые сессии будут отказаны на гейте (§9.4: сигнал читается
                //     в момент использования, не кэшируется);
                //   • onForbidden — политика менеджера запретила ЭТОТ плагин →
                //     полное отключение (штатный disablePlugin, как в доноре).
                // Boot-гонку (менеджер грузится позже) гвард решает сам: pending
                // → опрос до 15 с → blocked('vam-missing') — fail-closed.
                this.vam = vamGuard({
                        pluginId: this.manifest.id,
                        onChange: () => this.onVamStateChanged(),
                        onRevoked: (reason) => this.onVamRevoked(reason),
                        onForbidden: () => {
                                void (this.app as unknown as {
                                        plugins: { disablePlugin: (id: string) => Promise<void> };
                                }).plugins.disablePlugin(this.manifest.id);
                        },
                });

                const statusBarItem = this.addStatusBarItem();
                this.statusBar.setElement(statusBarItem);
                this.statusBar.setLastSync(this.settings.lastSyncTime);

                // [W2-T02 / BUG-6] ОДИН стабильный click-handler на всё время жизни
                // плагина: актуальность конфигурации проверяется в момент клика
                // (openStatusPopover), поэтому лямбда не может «протухнуть» после
                // смены настроек. Клик больше НЕ запускает и НЕ отменяет
                // синхронизацию напрямую (В4): старт/отмена — popover (W2-T03),
                // команды, лента.
                this.statusBar.setClickHandler(() => this.openStatusPopover());
                if (!this.isConfiguredForSource()) this.statusBar.setState('unconfigured');

                this.addRibbonIcon('cloud-download', i18n.t.cmdRibbonTooltip, async () => { await this.syncNow(); });

                // [В3-2] новые ID команд cloud-sync-*; назначенные вручную хоткеи
                // слетают один раз — сознательное решение пользователя
                this.addCommand({ id: 'cloud-sync-now', name: i18n.t.cmdSyncFromGit, callback: () => this.syncNow() });
                this.addCommand({ id: 'cloud-sync-retry-failed', name: i18n.t.cmdRetryFailed, callback: () => this.retryFailedFiles() });
                this.addCommand({ id: 'cloud-sync-force-reset', name: i18n.t.cmdForceReset, callback: () => this.forceResync() });
                this.addCommand({
                        id: 'cloud-sync-cancel', name: i18n.t.cmdCancelSync,
                        checkCallback: (checking) => {
                                if (checking) return this.coordinator?.isRunning() ?? false;
                                if (this.coordinator?.isRunning()) this.cancelSync();
                        }
                });
                this.addCommand({ id: 'cloud-sync-scan-missing', name: i18n.t.cmdScanMissing, callback: () => this.scanAndRestoreMissing() });
                // [VAM] статусная команда: показывает модалку с текущим состоянием
                // гварда (granted/blocked/pending + причина). Не требует входа —
                // это «окно» к причине отказа, доступное всегда (как в доноре:
                // «AI: статус доступа (VAM)»).
                this.addCommand({ id: 'cloud-sync-vam-status', name: i18n.t.vam.cmdStatus, callback: () => this.openVamStatusModal() });

                await this.buildEngine();
                // [W2-T02 / Д13=1] чип уровня зеркала: начальное значение после
                // сборки движка (миграция 3.0 внутри buildEngine могла выставить
                // mirrorLevel из legacy-полей).
                this.statusBar.setMirrorLevel(this.settings.profiles ? undefined : this.currentMirrorLevel());

                // [W4-T01] планировщик авто-синхронизации: интервал из настроек
                // (дефолт 'off' → ничего не планируется до явного выбора).
                this.startAutoSync();

                // [W5-T02] window.vaultSync — read-only pub/sub для сторонних
                // плагинов и будущего менеджер-плагина (Е7=3, Д15). Singleton
                // реестр; провайдер берёт свежее состояние из live plugin state.
                // onChanged возвращает unsub — короткоживущие подписчики
                // должны отписаться сами в onunload своего плагина.
                this.vaultSyncHook = createSubscriberRegistry();
                this.vaultSyncHook.setProvider(() => this.buildVaultSyncState());
                const api = this.vaultSyncHook;
                (window as any).vaultSync = {
                        getState: (): VaultSyncState | null => api.getState(),
                        onChanged: (cb: (s: VaultSyncState) => void): (() => void) => api.subscribe(cb),
                };

                // [W2-T06] онбординг первого запуска (Д8=1): после buildEngine,
                // только если источник настроен; иначе — пропустить до первой конфигурации.
                this.maybeShowOnboarding();

                this.addSettingTab(new GitSyncSettingTab(this.app, this));

                this.registerInterval(window.setInterval(() => {
                        this.statusBar.setLastSync(this.settings.lastSyncTime);
                        this.statusBar.refresh();
                }, 60000));

                window.addEventListener('online', this.onlineHandler);
                window.addEventListener('offline', this.offlineHandler);
                window.addEventListener('focus', this.focusHandler);
        }

        onunload() {
                removePluginCss();
                // [overhaul S3/M-18] живые модалки закрываются ДО dispose'ов —
                // их колбэки больше не стреляют по выгруженному плагину.
                closeAllTrackedModals();
                // [VAM] гвард контроля доступа: отписка/остановка опроса
                // (руководство VAM: «зовите dispose из onunload своего
                // плагина»). Мягкий режим не персистируется — следующая
                // загрузка стартует с честным гейтом.
                this.vam?.dispose();
                this.vam = null;
                window.removeEventListener('online', this.onlineHandler);
                window.removeEventListener('offline', this.offlineHandler);
                window.removeEventListener('focus', this.focusHandler);
                this.coordinator?.cancel();
                this.scheduler?.stop();
                // [W6-T01] Принудительный release ZIP-сессии (минуя TTL): tmp-файл
                // вычищается немедленно при выгрузке плагина, не дожидаясь
                // истечения 5-мин аренды. forceDispose идемпотентен — безопасен
                // даже если сессии нет (zip-source не выбран / не синхронизировался).
                const currentSource = this.coordinator?.getCurrentSource?.();
                if (currentSource && typeof (currentSource as any).forceDispose === 'function') {
                        void (currentSource as any).forceDispose();
                }
                // [W5-T02] снимаем window.vaultSync: сторонние плагины больше не
                // получают обновлений. Их unsub-функции при следующем вызове — no-op
                // (registry выбросил их set). Если они попытаются подписаться снова
                // — им нужно ждать нового onload sync-плагина (стандартный Obsidian lifecycle).
                this.vaultSyncHook?.dispose();
                this.vaultSyncHook = undefined;
                try { delete (window as any).vaultSync; } catch { /* IE-quirk fallback — Obsidian не нужен */ (window as any).vaultSync = undefined; }
                void this.persistEngineState('checkpoint');
        }

        /**
         * [W2-T02] Клик по статус-бару: «дом синхронизации» (popover, В4).
         * [BUG-7] ID вкладки настроек — из manifest.id: хардкод
         * 'obsidian-git-sync' ломался при любом переименовании/форке плагина.
         */
        private openStatusPopover(): void {
                const openPluginSettings = () => {
                        // @ts-ignore
                        (this.app as any).setting.open();
                        // @ts-ignore
                        (this.app as any).setting.openTabById(this.manifest.id);
                };
                if (!this.isConfiguredForSource()) {
                        openPluginSettings();
                        return;
                }
                // [W2-T03 wiring] popover в обёртке Modal (v3.0 interim: будущий
                // polish — позиционированная плавающая панель у статус-бара;
                // пока — работает везде, включая мобильные).
                const modal = new Modal(this.app);
                modal.titleEl.setText(i18n.t.pop.title);
                this.popoverView = new SyncPopoverView({
                        contentEl: modal.contentEl,
                        lastEntry: null,
                        state: this.snapshotPopoverState(),
                        onSync: () => { modal.close(); void this.syncNow(); },
                        onCancel: () => { this.cancelSync(); },
                        onRetry: () => { modal.close(); void this.retryFailedFiles(); },
                        onPauseAuto: () => this.pauseAutoSync(),
                        onOpenJournal: () => { modal.close(); this.openJournalModal(); },
                        onOpenSettings: () => { modal.close(); openPluginSettings(); },
                        onClose: () => modal.close(),
                        formatTime: (ms: number) => new Date(ms).toLocaleString(),
                        formatBytes,
                });
                this.popoverView.render();
                modal.onClose = () => { this.popoverView = undefined; };
                trackModal(modal); // [overhaul S3/M-18]
                modal.open();
                void this.journal.load().then((entries) => {
                        const last = entries[0] ?? null;
                        if (this.popoverView) {
                                (this.popoverView as unknown as { lastEntry: unknown }).lastEntry = last;
                                this.popoverView.update(this.snapshotPopoverState());
                        }
                });
        }

        /** [W2-T03 wiring] снимок состояния StatusBar → PopoverState. */
        private snapshotPopoverState(): PopoverState {
                const sb = this.statusBar as unknown as {
                        state: string; pendingCount: number;
                        bytesTransferred: number; totalBytes: number; pipelinePhase: number;
                };
                const status = sb.state as PopoverState['status'];
                const pending = sb.pendingCount ?? 0;
                return {
                        status,
                        mirrorLevel: this.currentMirrorLevel(),
                        pendingErrorCount: status === 'error' ? pending : this.queue.all().length,
                        conflictsCount: status === 'conflicts' ? pending : 0,
                        // [P2/3.2] живая фаза конвейера из setStatus-потока Coordinator
                        // (раньше хардкод -1 — полоса была декоративной, бэклог 3.2).
                        phase: status === 'syncing' ? (sb.pipelinePhase ?? -1) : -1,
                        bytesTransferred: sb.bytesTransferred ?? 0,
                        totalBytes: sb.totalBytes ?? 0,
                        lastSyncTime: this.settings.lastSyncTime || null,
                        // [W4-T04] снимок планировщика для popover-индикатора.
                        scheduler: this.schedulerSnapshot(),
                };
        }

        /** [P2/B6] Диагностический лог плагина за флагом verboseNotices —
         *  пер-операционный шум (vault-операции, политика, zip-канал) не
         *  пишется в консоль по умолчанию. Ошибки — всегда (console.error). */
        private verboseLog(msg: string): void {
                if (this.settings?.verboseNotices) console.log(`[VaultSync] ${msg}`);
        }

        /** [W2-T08 wiring] модалка журнала сессий. */
        openJournalModal(): void {
                const modal = new Modal(this.app);
                modal.titleEl.setText(i18n.t.jrnl.title);
                let view: JournalModalView | null = null;
                void this.journal.load().then((entries) => {
                        view = new JournalModalView({
                                contentEl: modal.contentEl,
                                entries,
                                labels: i18n.t.jrnl,
                                onClose: () => modal.close(),
                                formatTime: (ms: number) => new Date(ms).toLocaleString(),
                        });
                        view.render();
                });
                modal.onClose = () => { view?.close(); };
                trackModal(modal); // [overhaul S3/M-18]
                modal.open();
        }

        /** [W2-T06 wiring] онбординг первого запуска (Д8=1). */
        private maybeShowOnboarding(): void {
                if (this.settings.onboarded) return;
                if (!this.isConfiguredForSource()) return;
                const modal = new Modal(this.app);
                modal.titleEl.setText(i18n.t.onb.title);
                let view: OnboardingModalView | null = null;
                view = new OnboardingModalView({
                        contentEl: modal.contentEl,
                        manifest: { fileCount: 0, sizeMb: '?', isMobile: Platform.isMobileApp },
                        workspaceSyncDefault: this.settings.workspaceSync ?? true,
                        onChoose: (choice: OnboardingChoice, workspaceSync: boolean) => {
                                this.settings.workspaceSync = workspaceSync;
                                this.settings.onboarded = true;
                                modal.close();
                                void this.saveSettingsImmediate().then(() => {
                                        if (choice === 'cancel') return;
                                        if (choice === 'custom') { this.openVaultTreeModal(); return; }
                                        // [P2/M4] канонические билдеры пресетов + сохранение
                                        // пер-папочного охвата зеркала (как в applyStructurePreset).
                                        // [overhaul S1-review #2] pluginDir() — как в applyStructurePreset: папка
                                        // плагина (data.json с секретами) исключается из пресета и при
                                        // выборе из онбординга, не только из настроек.
                                        const base = choice === 'obsidian' ? obsidianOnlyPolicy(this.pluginDir()) : fullVaultPolicy(this.pluginDir());
                                        if (!this.settings.syncPolicies) this.settings.syncPolicies = {};
                                        const existing = this.settings.vaultPolicy ?? this.settings.syncPolicies[this.builtSourceId];
                                        const policy = {
                                                ...base,
                                                mirror: existing?.mirror ?? false,
                                                mirrorFolders: existing?.mirrorFolders,
                                                fileRules: existing?.fileRules,
                                                assignments: existing?.assignments,
                                                defaultSource:existing?.defaultSource,
                                                // [overhaul v4 / Этап 4] сохраняем кастомные user exclusions
                                                fileExclusions: mergeFileExclusions(
                                                        base.fileExclusions ?? [],
                                                        existing?.fileExclusions,
                                                ),
                                        };
                                        this.settings.syncPolicies[this.builtSourceId] = policy;
                                        if(this.settings.vaultPolicy)this.settings.vaultPolicy=policy;
                                        this.coordinator?.setSyncPolicy(policy);
                                        void this.saveSettingsImmediate().then(() => void this.syncNow());
                                });
                        },
                        onClose: () => { view?.close(); },
                });
                view.render();
                modal.onClose = () => { view?.close(); if (!this.settings.onboarded) { this.settings.onboarded = true; void this.saveSettingsImmediate(); } };
                trackModal(modal); // [overhaul S3/M-18]
                modal.open();
        }

        async saveSettings() { this.settingsManager.queueSave(); }
        async saveSettingsImmediate() { await this.settingsManager.saveImmediate(); }

        // ============================================================
        // --- СБОРКА ДВИГАТЕЛЯ (Coordinator + GitSource + адаптеры) ---
        // ============================================================

        private async buildEngine(): Promise<void> {
                this.fsAdapter = this.makePluginFs();

                // [W3-T03] реестр движков заменяет switch-точку: тип источника
                // выбирается настройкой sourceType, инстанс строится через
                // EngineRegistry.create(kind, values, ctx). sourceId стабилен
                // (golden-тест tests/engines-registry.test.ts — байт-в-байт
                // со старым git_<djb2(repoUrl)> / <kind>_<djb2(vaultUrl)>).
                this.builtKind = this.desiredSourceKind();
                this.builtSourceId = this.makeSourceId(this.builtKind);
                this.builtEngineConfigKey = JSON.stringify(this.engineValues(this.builtKind));
                // [W3-T03] gitSource поле оставлено для migrateLegacyShas (git-only
                // шаг в prepareSession); инстанс строится через реестр как и любой другой.
                const initialSource: import('./src/sources/types').SyncSource =
                        EngineRegistry.create(this.builtKind, this.engineValues(this.builtKind), this.engineCtx());
                if (this.builtKind === 'git') {
                        this.gitSource = initialSource as import('./src/sources/git-source').GitSource;
                }

                // [4-2] кэш манифеста — отдельный файл в каталоге плагина (С-01);
                // sourceId стабилен для URL — смена репозитория = новый файл кэша
                this.cache = new ManifestCache(this.fsAdapter, this.builtSourceId);
                await this.cache.load();
                // [AUDIT A.1 fix] migrateLegacyShas moved to prepareSession:
                // on plugin enable we only LOAD the existing cache (if any);
                // writing manifest-<sourceId>.json must happen on real sync, not on enable.
                // See /home/z/my-project/download/audit-cloud-sync-2026-08.md §A.1.
                // [4-review-fix] дизайн §8.1: кэши чужих sourceId не копятся вечно
                // (в фазе 6 keep расширится: текущий + git при смене источника)
                await gcManifestCaches(this.fsAdapter, this.gcKeepSet(this.builtSourceId));
                // [W1-T08] ОДНОКРАТНАЯ миграция 2.3.3 → 3.0 (§2.4): уровень
                // зеркала из deleteMissing/mirror-флагов; глобальные текстовые
                // фильтры → политика текущего источника один раз; legacy-поля
                // очищаются (BUG-2: новые sourceId больше ничего не наследуют).
                await this.runV3Migration();
                // [overhaul v4 / Этап 4] гранулярная миграция: folder-exclude pluginDir
                // → fileExclusions (data.json и т.п. точечно, main.js/manifest.json в синке).
                await this.runV4Migration();
                await this.ensureProfileSettings();

                this.queue = new FailedQueue();
                this.queue.mergeBack((this.settings.failedQueues ? this.settings.failedQueues[this.cache.namespace] ?? [] : this.settings.failedQueue ?? []));

                // [W2-T08] журнал сессий: IO-адаптер к configDir/vault-sync-journal.json
                // (adapter.read: null = файла нет — первый запуск, НЕ warn).
                const journalPath = `${this.manifest.dir ? `${this.manifest.dir}/` : ''}vault-sync-journal.json`;
                const journalIo: JournalIo = {
                        read: async () => {
                                try {
                                        const data = await this.app.vault.adapter.read(journalPath);
                                        return data ?? null;
                                } catch {
                                        return null; // ENOENT — первый запуск
                                }
                        },
                        write: async (s) => {
                                await this.app.vault.adapter.write(journalPath, s);
                        },
                };
                this.journal = new FileJournal(journalIo);

                this.conflictResolver = new ConflictResolver(this.settings.conflictStrategy, {
                        vault: this.makeVaultAdapter(),
                        sha256: sha256Hex,
                        crc32: crc32Hex,
                        gitSha1: gitBlobSha1Hex,
                        ui: {
                                // [overhaul S4 / S3-review #2] конфликтная модалка — в реестре:
                                // onClose резолвит 'keep-both' — по выгруженному плагину стрелять нельзя.
                                askConflict: (info) => this.serializeAsk(() => {
                                        const m = new ConflictAskModal(this.app, info);
                                        trackModal(m);
                                        return m.wait();
                                }),
                        },
                        // [overhaul v4 / Этап 3] light-стратегия из настроек.
                        lightStrategy: this.settings.lightConflictStrategy ?? 'keep-local',
                });

                this.coordinator = new Coordinator({
                        mutations: new DurableMutations(new OperationStore(this.fsAdapter),
                                new RecoveryStore(this.makeVaultAdapter(), this.recoveryDirectory()), this.makeVaultAdapter()),
                        source: initialSource,
                        vault: this.makeVaultAdapter(),
                        cache: this.cache,
                        queue: this.queue,
                        policy: this.makePolicy(),
                        conflict: this.conflictResolver,
                        ui: this.makeSyncUI(),
                        messages: {
                                alreadyInProgress: i18n.t.noticeSyncInProgress,
                                offline: i18n.t.noticeNoInternet,
                                notConfigured: i18n.t.noticeConfigMissing,
                                upToDate: i18n.t.noticeVaultUpToDate,
                                cancelled: i18n.t.noticeSyncCancelled,
                                syncFailed: (msg) => i18n.t.noticeSyncFailed(msg),
                                deletingFiles: (n) => i18n.t.noticeDeletingFiles(n),
                                orphanWarning: (n) => i18n.t.noticeOrphanFiles(n),
                                syncedWithErrors: (n) => i18n.t.noticeSyncedWithErrors(n),
                                success: (dl, del, conf, dur) => i18n.t.noticeSuccess(dl, del, conf, dur),
                                fileTooLarge: (sz, limit) => i18n.t.errFileTooLarge(sz, limit),
                                conflictKeptLocal: (p) => i18n.t.noticeConflictKeptLocal(p),
                                conflictBoth: (p) => i18n.t.noticeConflictBoth(p),
                                conflictsDeferred: i18n.getLocale()==='ru'?'Конфликты требуют ручного запуска синхронизации':'Conflicts need a manual sync',
                                nothingToRetry: i18n.t.noticeNoFailedFiles,
                                retryNotDue: (n) => i18n.t.noticeRetryNotDue(n),
                                // [overhaul S6 / D-4] припаркованные записи (retry cap):
                                // автоповторы прекращены — внятный путь лечения в Notice.
                                retryParked: (n) => i18n.t.noticeRetryParked(n),
                                deletionsDeferred: (n) => i18n.t.noticeDeletionsDeferred(n),
                                deletionsBlocked: (n) => i18n.t.noticeDeletionsBlocked(n),
                                // [P2/3.2] фазы конвейера — текст статус-бара на границах фаз
                                // (словарь pop.* общий с popover-полосой — единый источник).
                                phaseManifest: i18n.t.pop.phaseManifest,
                                phasePolicy: i18n.t.pop.phasePolicy,
                                phaseDiff: i18n.t.pop.phaseDiff,
                                phaseDeletions: i18n.t.pop.phaseDeletions,
                                phaseDownloads: i18n.t.pop.phaseDownloads,
                                phaseFinalize: i18n.t.pop.phaseFinalize,
                        },
                        options: {
                                configurationRevision: () => this.getConfigurationRevision(),
                                preparedRevision: () => this.preparedConfigRevision,
                                // [W1-T07 / BUG-5] Единый вход модели удалений — уровень
                                // зеркала (deleteMissing-тумблер из логики умер).
                                mirrorLevel: () => this.currentMirrorLevel(),
                                useTrash: () => this.settings.useTrash,
                                isOnline: () => navigator.onLine,
                                isConfigured: () => this.isConfiguredForSource(),
                                // [W4-T02] авто-режим уважает настройку verboseNotices (А5).
                                verboseNotices: () => this.settings.verboseNotices ?? false,
                                // [P2/B6] диагностический лог конвейера за тем же флагом:
                                // «подробность» одна на уведомления и консоль (§5.22).
                                verboseLogs: () => this.settings.verboseNotices ?? false,
                                persistState: (kind) => this.persistEngineState(kind),
                        },
                        // [POLICY Phase 2] политика текущего источника; отсутствует в
                        // data.json = undefined = legacy-режим (ничего не меняется).
                        syncPolicy: this.effectiveProfilePolicy(this.builtSourceId),
                });
                this.preparedConfigRevision = this.getConfigurationRevision();
        }

        /** Разовая миграция lastSyncShas (data.json) в файл кэша (дизайн §8.1). */
        private async migrateLegacyShas(): Promise<void> {
                const legacy = this.settings.lastSyncShas ?? {};
                if (Object.keys(this.cache.entries()).length > 0 || Object.keys(legacy).length === 0) return;
                for (const [path, sha] of Object.entries(legacy)) {
                        this.cache.set(path, { h: sha, s: 0, alg: 'git-sha1' });
                }
                await this.cache.flush();
                // Поле lastSyncShas в data.json не трогаем (обратимость до задачи 7-d)
        }

        private desiredSourceKind(): 'git' | 'zip-url' | 'yandex' | 'gdrive' | 'webdav' {
                // [W3-T03] реестр движков — источник правды: если sourceType
                // соответствует зарегистрированному kind — берём его, иначе 'git'
                // (fallback для повреждённых data.json / будущих удалённых движков).
                const t = this.settings.sourceType;
                return (t === 'zip-url' || t === 'yandex' || t === 'git' || t === 'gdrive' || t === 'webdav') && EngineRegistry.has(t)
                        ? t
                        : 'git';
        }

        // [FIX Windows EINVAL] sourceId separator changed from ':' to '_'
        // (Windows: ':' in filename -> ADS separator -> EINVAL on rename).
        // Older caches with 'git:hash' naming: GC will clean them up on next load
        // (no entry in keep set). The .tmp orphans from failed flushes are GC'd too.
        private makeSourceId(kind: 'git' | 'zip-url' | 'yandex' | 'gdrive' | 'webdav'): string {
                // [W3-T03] реестр — единая sourceId-фабрика. Байт-в-байт совместимо
                // с легаси (djb2 в registry — копия прежней private stableHash).
                // Секреты НЕ входят в хэш (инвариант 3).
                return EngineRegistry.makeSourceId(kind, this.engineValues(kind));
        }

                /**
                 * [W3-T03] Сборка значений полей движка из settings — по схеме
                 * EngineDescriptor.settingsSchema. Цикл по полям схемы движка →
                 * значения из settings[field.key]; неизвестные поля игнорируются
                 * (на случай, когда settings-объект содержит лишние ключи от
                 * удалённых полей — например, миграция 4-го движка с откатом).
                 *
                 * Главное: НЕТ switch-точки по виду движка — добавление движка =
                 * одна строка register() в registry.ts, без правок здесь (§8.1 аудита).
                 */
                private engineValues(kind: string): Record<string, unknown> {
                        const s = this.settings as unknown as Record<string, unknown>;
                        const schema = EngineRegistry.get(kind).settingsSchema;
                        const values: Record<string, unknown> = {};
                        for (const field of schema) {
                                // [W6-T03/T05] Поддержка префиксов: settings может иметь
                                // gitBaseUrl/webdavBaseUrl/gdriveApiKey вместо прямого baseUrl/apiKey.
                                // Сначала пробуем прямой field.key (для обратной совместимости
                                // с existing движками git/yandex/zip-url, у которых поля
                                // лежат как repoUrl/accessToken/branch/vaultUrl без префикса).
                                // Если undefined — пробуем `<kind><Capitalized field.key>`.
                                if (s[field.key] !== undefined) {
                                        values[field.key] = s[field.key];
                                } else {
                                        const cap = field.key[0].toUpperCase() + field.key.slice(1);
                                        const prefixed = `${kind}${cap}`;
                                        values[field.key] = s[prefixed];
                                }
                        }
                        return values;
                }

                /**
                 * [W3-T03] Контекст инстанцирования движка — инъекция зависимостей
                 * (transport, downloader, messages, onProgress, onRateLimitWait).
                 * Реестр передаёт ctx в конструктор движка как есть.
                 */
                private engineCtx(kind = this.builtKind): EngineCtx {
                        const t = i18n.t;
                        if (kind === 'git') {
                                return {
                                        messages: {
                                                branchNotFound: (b: string) => t.errBranchNotFound(b),
                                                fetchBranch: (st: number) => t.errFetchBranch(st),
                                                fetchTree: () => t.errFetchTree,
                                                treeTruncated: () => t.errTreeTruncated,
                                                rateLimitExceedsHour: () => t.errRateLimitExceedsHour,
                                                invalidUrl: () => t.errInvalidUrl,
                                        },
                                        onRateLimitWait: (waitMs: number) => {
                                                new Notice(t.noticeRateLimited(Math.ceil(waitMs / 1000)), 10000);
                                        },
                                };
                        }
                        if (kind === 'yandex') {
                                return {
                                        transport: new FetchTransport({ timeoutMs: REQUEST_TIMEOUT_MS }),
                                        archiveDownloader: this.getArchiveDownloader(),
                                        onRateLimitWait: (waitMs: number) => {
                                                new Notice(t.noticeRateLimitedCloud(Math.ceil(waitMs / 1000)), 10000);
                                        },
                                        messages: {
                                                linkInvalid: () => t.errYandexLinkInvalid,
                                                structureChanged: () => t.errYandexStructureChanged,
                                                rateLimitExceedsHour: () => t.errRateLimitExceedsHourCloud,
                                                // [P2/M10] файл без sha256 — явная ошибка сессии (не тихий пропуск).
                                                fileWithoutHash: (p: string) => t.errYandexFileWithoutHash(p),
                                        },
                                };
                        }
                        // [P0/M1] gdrive: собственный ctx — русские ошибки вместо
                        // английских DEFAULT_MESSAGES, Notice о 429-ожиданиях.
                        // (cast: EngineCtx.messages — общий Record, см. git-ветку.)
                        if (kind === 'gdrive') {
                                return {
                                        transport: new FetchTransport({ timeoutMs: REQUEST_TIMEOUT_MS }),
                                        onRateLimitWait: (waitMs: number) => {
                                                new Notice(t.noticeRateLimitedCloud(Math.ceil(waitMs / 1000)), 10000);
                                        },
                                        messages: {
                                                apiKeyMissing: () => t.errGdriveApiKeyMissing,
                                                listFailed: (st: number) => t.errGdriveListFailed(st),
                                                downloadFailed: (st: number) => t.errGdriveDownloadFailed(st),
                                                rateLimitExceedsHour: () => t.errRateLimitExceedsHourCloud,
                                                fileNotFound: (p: string) => t.errGdriveFileNotFound(p),
                                                invalidResponse: (msg: string) => t.errGdriveInvalidResponse(msg),
                                                manifestTruncated: () => t.errGdriveManifestTruncated,
                                                // [overhaul S1/H-5] fail-closed на файл без size.
                                                fileWithoutSize: (p: string) => t.errGdriveFileWithoutSize(p),
                                        } as EngineCtx['messages'],
                                };
                        }
                        // [P0/M1] webdav: собственный ctx — русские ошибки вместо
                        // английских DEFAULT_MESSAGES. (cast — как в gdrive-ветке.)
                        if (kind === 'webdav') {
                                return {
                                        transport: new FetchTransport({ timeoutMs: REQUEST_TIMEOUT_MS }),
                                        messages: {
                                                credentialsMissing: () => t.errWebdavCredentialsMissing,
                                                propfindFailed: (st: number) => t.errWebdavPropfindFailed(st),
                                                downloadFailed: (st: number) => t.errWebdavDownloadFailed(st),
                                                fileNotFound: (p: string) => t.errWebdavFileNotFound(p),
                                                invalidXml: (msg: string) => t.errWebdavInvalidXml(msg),
                                                manifestTruncated: () => t.errWebdavManifestTruncated,
                                                // [overhaul S1/H-5] fail-closed на файл без size.
                                                fileWithoutSize: (p: string) => t.errWebdavFileWithoutSize(p),
                                        } as EngineCtx['messages'],
                                };
                        }
                        // zip-url
                        return {
                                archiveDownloader: this.getArchiveDownloader(),
                                // [W3-T04] лёгкий транспорт для Test Connection (HEAD + Range-хвост).
                                // undefined на мобайле → ZipUrlSource.testConnection() идёт fallback full.
                                rangeTransport: this.getZipRangeTransport(),
                                // [W6-T01] TTL сессионного архива 5 минут: retry/scan/policy-modal/test
                                // в пределах пользовательского цикла → 1 скачивание вместо до 4× (оптимизация №1).
                                zipSessionTtlMs: 5 * 60 * 1000,
                                onProgress: (p: { bytesTransferred: number; totalBytes: number | null }) => {
                                        this.statusBar.setState('syncing', {
                                                progressText: t.sbSyncing,
                                                bytesTransferred: p.bytesTransferred,
                                                totalBytes: p.totalBytes ?? 0,
                                        });
                                },
                                messages: {
                                        htmlInsteadOfArchive: (url: string) => t.errHtmlInsteadOfArchive(url),
                                        notAnArchive: (url: string) => t.errNotAnArchive(url),
                                },
                                log: (msg: string) => this.verboseLog(msg),
                        };
                }

        // [W1-T03/BUG-16] решение вынесено в чистую функцию config-guards
        // (прямо тестируется): для git токен опционален — публичные репо
        // работают без него, старый guard врал «Настройки не заполнены».
        /**
         * [W1-T07/T08] Глобальный уровень зеркала сессии. После миграции —
         * чтение одного поля settings.mirrorLevel; легаси-подсчёт остаётся
         * страховкой на случай ручной правки data.json.
         */
        // [W2-T05] публичный: 3-позиционный переключатель уровня в SettingsTab
        // читает currentMirrorLevel() для инициализации дропдауна и гаторинга
        // стратегии конфликтов (только fetch; матрица §2.2 для light/full).
        currentMirrorLevel(): MirrorLevel {
                const direct = this.settings.mirrorLevel;
                if (direct === 'fetch' || direct === 'light' || direct === 'full') return direct;
                const legacyMirror = this.settings.deleteMissing === true
                        || Object.values(this.settings.syncPolicies ?? {}).some((p) => p?.mirror === true);
                return legacyMirror ? 'light' : 'fetch';
        }

        /**
         * [W1-T08] Однократная миграция 2.3.3 → 3.0 (чистое ядро —
         * src/core/migration.ts; здесь только применение результата).
         * Вызывается после buildEngine: нужен builtSourceId для конвертации
         * глобальных текстовых фильтров в политику текущего источника.
         */
        private async runV3Migration(): Promise<void> {
                const result = migrateSettingsToV3({
                        settings: this.settings,
                        syncPolicies: this.settings.syncPolicies ?? {},
                        currentSourceId: this.builtSourceId || null,
                        pluginDir: this.pluginDir(),
                });
                if (!result.changed) return;
                this.settings.mirrorLevel = result.mirrorLevel;
                this.settings.migratedV3 = true;
                this.settings.syncMode = result.syncMode;
                this.settings.allowedFolders = result.allowedFolders;
                this.settings.ignoredFolders = result.ignoredFolders;
                this.settings.deleteMissing = result.deleteMissing;
                this.settings.syncPolicies = result.syncPolicies;
                await this.saveSettingsImmediate();
                // Координатор уже построен — политика могла появиться/обновиться.
                this.coordinator?.setSyncPolicy(result.syncPolicies[this.builtSourceId]);
                console.log(`[VaultSync] W1-T08: миграция 3.0 применена (уровень=${result.mirrorLevel}, ` +
                        `политик=${Object.keys(result.syncPolicies).length})`);
        }

        /**
         * [overhaul v4 / Этап 4] Однократная миграция granular plugin exclusion.
         *
         * Старые пресеты (до v4) исключали ВСЮ папку плагина через folder-exclude,
         * что закрывало main.js/manifest.json/styles.css от синка. Новые пресеты —
         * granular: исключают только machine-specific файлы (data.json, journal,
         * manifest-*.json) через fileExclusions, оставляя main.js в синке.
         *
         * Идемпотентна (флаг migratedV4). Вызывается из buildEngine() после v3.
         */
        private async runV4Migration(): Promise<void> {
                if (this.settings.migratedV4) return;
                const pluginDir = this.pluginDir();
                if (!pluginDir) {
                        this.settings.migratedV4 = true;
                        return;
                }
                const current = this.settings.syncPolicies ?? {};
                const { syncPolicies, changed } = migrateAllPluginExclusionsToGranular(
                        current, pluginDir,
                );
                if (changed) {
                        this.settings.syncPolicies = syncPolicies;
                        // обновить coordinator, если он уже построен
                        this.coordinator?.setSyncPolicy(syncPolicies[this.builtSourceId]);
                        console.log(`[VaultSync] v4: гранулярная миграция применена ` +
                                `(политик обновлено, main.js/manifest.json теперь в синке)`);
                }
                this.settings.migratedV4 = true;
                await this.saveSettingsImmediate();
        }


        private isConfiguredForSource(): boolean {
                if(this.settings.vaultPolicy)return (this.settings.connections ?? []).some(c=>isSourceConfigured(c.kind,{repoUrl:'',accessToken:'',vaultUrl:'',...c.values}));
                return isSourceConfigured(this.desiredSourceKind(), {repoUrl:'',accessToken:'',vaultUrl:'',...this.engineValues(this.desiredSourceKind())});
        }

        // [W3-T03] makeGitOptions / makeZipOptions / makeYandexOptions удалены:
        // их содержание поглощено engineCtx() — единый ctx для buildEngine,
        // prepareSession и testConnection. testConnection теперь идёт через
        // EngineRegistry.create(kind, engineValues(kind), engineCtx()) — это
        // даёт реальный инстанс (с rangeTransport для zip-url) вместо ручной
        // сборки через дублирующие методы. Раньше для каждого движка был свой
        // «make*Options» с теми же сообщениями и downloader, что в engineCtx() —
        // это и была точка расширения «новый движок = +1 метод в main.ts»,
        // от которой избавлялся §8.1 аудита.

        /** [5-f] десктоп: Node-стрим в tmp-файл; мобайл: requestUrl в память. */
        private getArchiveDownloader(): ArchiveDownloader {
                if (!this.zipDownloader) {
                        this.zipDownloader = Platform.isMobileApp
                                ? {
                                        // [5-review M2] мобильная «мягкая отмена» (дизайн §7.1):
                                        // requestUrl не прерывается — проверяем signal ПОСЛЕ
                                        // завершения и отбрасываем результат отменённой сессии
                                        download: async (url: string, opts?: { signal?: AbortSignal }) => {
                                                // [P1/BUG-19] Лимит проверяется ДО загрузки: HEAD content-length
                                                // до полного GET — мобильный OOM предотвращается, а не
                                                // фиксируется постфактум. HEAD не сработал (пресайнед-URL
                                                // без HEAD, редирект) — страховочная проверка после GET
                                                // остаётся.
                                                const limitMb = this.settings.mobileArchiveWarnBytes ?? 200;
                                                if (limitMb > 0) {
                                                        let headBytes = 0;
                                                        try {
                                                                const head = await requestUrl({ url, method: 'HEAD' });
                                                                const clHead = head.headers?.['content-length'] ?? head.headers?.['Content-Length'];
                                                                headBytes = Number(clHead ?? 0);
                                                        } catch {
                                                                // HEAD не поддержан — идём на GET, решение по факту.
                                                        }
                                                        if (headBytes > limitMb * 1024 * 1024) {
                                                                throw new Error(i18n.t.errMobileArchiveTooLarge(formatBytes(headBytes), limitMb));
                                                        }
                                                }
                                                // requestUrl сам ведёт редиректы и бросает на не-2xx
                                                const res = await requestUrl({ url, method: 'GET' });
                                                // [7-d] дизайн §7.1: мобильный порог архива (0 = off);
                                                // постфактум-страховка (сервер соврал в HEAD / не дал длину)
                                                const clHeader = res.headers?.['content-length'] ?? res.headers?.['Content-Length'];
                                                const clBytes = Number(clHeader ?? 0);
                                                if (limitMb > 0 && clBytes > limitMb * 1024 * 1024) {
                                                        throw new Error(i18n.t.errMobileArchiveTooLarge(formatBytes(clBytes), limitMb));
                                                }
                                                if (opts?.signal?.aborted) {
                                                        const e: Error & { aborted: boolean } = Object.assign(
                                                                new Error('archive download aborted (mobile)'),
                                                                { aborted: true },
                                                        );
                                                        throw e;
                                                }
                                                return new BufferArchiveReader(res.arrayBuffer);
                                        },
                                }
                                : new NodeArchiveDownloader();
                }
                return this.zipDownloader;
        }

        /** [W3-T04] Лёгкий Range-транспорт для ZIP Test Connection.
         *  Десктоп: NodeZipRangeTransport (lazy require('https')).
         *  Мобайл: undefined — requestUrl не даёт Range/abort нормально; в этом
         *  случае ZipUrlSource.testConnection() идёт fallback full (полное
         *  скачивание, как в 2.3.3). Ленивая инициализация и кеш на this.zipRangeTransport
         *  (как getArchiveDownloader) — переиспользуем транспорт между вызовами
         *  testConnection, чтобы не пересоздавать http-агента. */
        private getZipRangeTransport(): ZipRangeTransport | undefined {
                if (Platform.isMobileApp) return undefined;
                if (!this.zipRangeTransport) {
                        this.zipRangeTransport = new NodeZipRangeTransport(REQUEST_TIMEOUT_MS);
                }
                return this.zipRangeTransport;
        }

        /** [6-review M2] дизайн §8.1: держим текущий источник + git-кэш (возврат к git — без полного resync). */
        private gcKeepSet(currentSourceId: string): Set<string> {
                // [W3-T03] git-кэш держится всегда (возврат к git — без полного resync);
                // sourceId считается через реестр (байт-в-байт с легаси).
                const keep = new Set([currentSourceId,...Object.keys(this.settings.failedQueues ?? {})]);
                if (this.settings.repoUrl.trim().length > 0) {
                        keep.add(EngineRegistry.makeSourceId('git', this.engineValues('git')));
                }
                return keep;
        }

        private makePolicy(): PathPolicy {
                // [Phase 4] Структурные решения (что включено) живут в SyncPolicy
                // (applyPolicy); при наличии политики PathPolicy получает ПУСТЫЕ
                // структурные фильтры и отвечает только за безопасность
                // (zip-slip, расширения, скрипты, .git, конфликт-копии).
                // Нет политики — legacy-режим по настройкам syncMode/folders.
                const hasPolicy = this.settings.vaultPolicy !== undefined || this.settings.syncPolicies?.[this.builtSourceId] !== undefined;
                return new PathPolicy({
                        syncMode: hasPolicy ? 'full-vault' : this.settings.syncMode,
                        allowedFolders: hasPolicy ? '' : this.settings.allowedFolders,
                        ignoredFolders: hasPolicy ? '' : this.settings.ignoredFolders,
                        allowPlugins: this.settings.allowPlugins,
                        allowSnippets: this.settings.allowSnippets,
                        protectedPaths: [this.pluginDir()],
                });
        }

        private recoveryDirectory(): string {
                const directory = this.pluginDir();
                if (!directory) throw new Error('Plugin directory unavailable; operation state cannot be protected');
                return `${directory}/recovery-v2`;
        }

        /** Semantic epoch stays in memory. No credential/fingerprint is written to the ledger. */
        private getConfigurationRevision(): number {
                const kind = this.desiredSourceKind();
                const config = JSON.stringify({ profiles:this.settings.profiles, connections:this.settings.connections, kind, values: this.engineValues(kind), mirror: this.currentMirrorLevel(),
                        policy: this.settings.vaultPolicy ?? this.settings.syncPolicies?.[this.makeSourceId(kind)], syncMode: this.settings.syncMode,
                        allowed: this.settings.allowedFolders, ignored: this.settings.ignoredFolders,
                        plugins: this.settings.allowPlugins, snippets: this.settings.allowSnippets,
                        conflict: this.settings.conflictStrategy, light: this.settings.lightConflictStrategy, trash: this.settings.useTrash });
                if (config !== this.configurationKey) { this.configurationKey = config; this.configurationEpoch++; }
                return this.configurationEpoch;
        }

        async ensureProfileSettings(): Promise<void> {
                const previous = structuredClone({profiles:this.settings.profiles,connections:this.settings.connections,
                        syncPolicies:this.settings.syncPolicies,vaultPolicy:this.settings.vaultPolicy,mirrorLevel:this.settings.mirrorLevel});
                try {
                const before = JSON.stringify([this.settings.profiles, this.settings.syncPolicies,this.settings.vaultPolicy,this.settings.connections]);
                const profiles = this.settings.profiles ??= structuredClone([...STANDARD_PROFILES]);
                this.settings.connections ??= [];
                validateProfiles(profiles, this.settings.connections);
                const policies = this.settings.syncPolicies ??= {};
                const id = this.makeSourceId(this.desiredSourceKind());
                if (!policies[id]) {
                        policies[id] = migrateSettingsToV3({settings:{...this.settings,migratedV3:false},syncPolicies:{},
                                currentSourceId:id,pluginDir:this.pluginDir()}).syncPolicies[id] ?? {version:1,mirror:false,folders:[]};
                }
                for (const [key, policy] of Object.entries(policies)) policies[key] = migrateProfilePolicy(policy, profiles, key,
                        this.currentMirrorLevel(), this.settings.conflictStrategy, this.settings.lightConflictStrategy ?? 'keep-local');
                if(!this.settings.vaultPolicy) {
                        const connectionId='connection_'+id;
                        if(!this.settings.connections.some(c=>c.id===connectionId))this.settings.connections.push({
                                id:connectionId,name:i18n.getLocale()==='ru'?'Основной источник':'Default source',
                                kind:this.desiredSourceKind(),values:this.engineValues(this.desiredSourceKind())});
                        this.settings.vaultPolicy=structuredClone(policies[id]);
                        this.settings.vaultPolicy.defaultSource=connectionId;
                        for(const profile of profiles)if(profile.source==='primary')profile.source=connectionId;
                        for(const assignment of this.settings.vaultPolicy.assignments ?? [])if(assignment.source==='primary')assignment.source=connectionId;
                }
                validateProfiles(profiles,this.settings.connections);
                compileProfiles(this.settings.vaultPolicy,profiles);
                const legacyLevel=this.settings.mirrorLevel;this.settings.mirrorLevel='fetch';
                if (legacyLevel!=='fetch' || before !== JSON.stringify([profiles,policies,this.settings.vaultPolicy,this.settings.connections])) await this.saveSettingsImmediate();
                } catch(e) { Object.assign(this.settings,previous); throw e; }
        }

        private effectiveProfilePolicy(id: string): SyncPolicy {
                const policy = this.settings.vaultPolicy ?? this.settings.syncPolicies?.[id] ?? {version:1 as const,mirror:false,folders:[]};
                return compileProfiles(policy, this.settings.profiles ?? []);
        }

        private async routingContext(preview = false): Promise<{source:RoutedSource; namespace:string}> {
                const kind = this.desiredSourceKind(), id = this.makeSourceId(kind);
                const policy = this.effectiveProfilePolicy(id), rules = policy.fileRules ?? [];
                validateProfiles(this.settings.profiles ?? [], this.settings.connections ?? []);
                const defaultSource=policy.defaultSource ?? (this.settings.vaultPolicy?'unassigned':'primary');
                const needed = new Set(rules.flatMap(r => r.source ? [r.source] : []));
                const all=this.settings.connections ?? [];
                const usesDefault=!rules.some(r=>r.scope==='vault'&&!r.names&&r.source);
                const descriptors = all.filter(c=>preview || needed.has(c.id) || (usesDefault&&c.id===defaultSource));
                if(defaultSource==='primary')descriptors.unshift({id:'primary',name:'Default source',kind,values:this.engineValues(kind)});
                const configured=(c:SourceConnection)=>isSourceConfigured(c.kind,{repoUrl:'',accessToken:'',vaultUrl:'',...c.values});
                for(const id of needed)if(!descriptors.some(c=>c.id===id&&configured(c)))throw Error('Assigned source is not configured');
                if(usesDefault&&defaultSource!=='unassigned'&&!descriptors.some(c=>c.id===defaultSource&&configured(c)))throw Error('Default source is not configured; configure it or remove the vault default');
                const active=descriptors.filter(configured).sort((a,b)=>Number(b.id===defaultSource)-Number(a.id===defaultSource));
                if(!active.length)throw Error('No configured sources');
                const identity = active.map(c=>({id:c.id,kind:c.kind,values:Object.fromEntries(
                        EngineRegistry.get(c.kind).settingsSchema.filter(f=>f.type!=='secret' && !f.secret).map(f=>[f.key,c.values[f.key]]))}));
                const namespace = this.settings.vaultPolicy ? await routedNamespace({defaultSource,connections:identity},rules,policy.folders) : needed.size ? await routedNamespace(identity,rules,policy.folders) : id;
                const mapped = (path:string) => {
                        const r=[...policy.folders].filter(r=>r.target && (path===r.path || !r.path || path.startsWith(r.path+'/')))
                                .sort((a,b)=>b.path.length-a.path.length)[0];
                        return r ? computeLocalPath(path,r.path,r) : path;
                };
                const members=active.map(c=>({id:c.id,name:c.name,source:EngineRegistry.create(c.kind,structuredClone(c.values),this.engineCtx(c.kind))}));
                return {source:new RoutedSource(members,structuredClone(rules),mapped,defaultSource),namespace};
        }

        /** Свежесть движка перед сессией: политика, стратегия, источник, sourceId. */
        private async prepareSession(): Promise<void> {
                if (this.coordinator.isRunning()) return;
                await this.ensureProfileSettings();
                const preparingRevision = this.getConfigurationRevision();
                const kind = this.desiredSourceKind(), sourceId = this.makeSourceId(kind);
                const {source,namespace} = await this.routingContext();
                const nextCache=namespace===this.cache.namespace ? this.cache : new ManifestCache(this.fsAdapter,namespace);
                try {
                        if(nextCache!==this.cache) await nextCache.load();
                        if(preparingRevision!==this.getConfigurationRevision()) throw new Error('Configuration changed while preparing sync');
                } catch(e) { await source.dispose(); throw e; }
                await this.coordinator.setSource(source);
                if (nextCache !== this.cache) {
                        const queues=this.settings.failedQueues ??= {};
                        queues[this.cache.namespace]=this.queue.all();
                        this.queue.clear(); this.queue.mergeBack(queues[namespace] ?? []);
                        this.cache=nextCache;this.coordinator.setCache(this.cache);
                }
                this.builtKind=source.kind;this.builtSourceId=sourceId;
                this.coordinator.setPolicy(this.makePolicy());
                this.conflictResolver.setStrategy(this.settings.conflictStrategy);
                this.conflictResolver.setLightStrategy(this.settings.lightConflictStrategy ?? 'keep-local');
                this.coordinator.setSyncPolicy(this.effectiveProfilePolicy(sourceId));
                if (preparingRevision !== this.getConfigurationRevision()) throw new Error('Configuration changed while preparing sync');
                this.preparedConfigRevision=preparingRevision;
        }

        /** [POLICY Phase 3] Сводка политики текущего источника для кнопки настроек. */
        getPolicySummaryForCurrentSource(): string {
                const policy = this.settings.syncPolicies?.[this.builtSourceId];
                if (!policy || (policy.folders.length === 0 && !policy.mirror)) return '';
                let included = 0, excluded = 0, renames = 0;
                for (const f of policy.folders) {
                        if (f.include === 'include') included++;
                        else if (f.include === 'exclude') excluded++;
                        if (f.target) renames++;
                }
                const parts: string[] = [];
                if (included > 0) parts.push(`${included}+`);
                if (excluded > 0) parts.push(`${excluded}-`);
                if (renames > 0) parts.push(`${renames}→`);
                if (policy.mirror) parts.push('⧉');
                return parts.length > 0 ? `(${parts.join(' ')})` : '';
        }

        /**
         * [overhaul v4 / Этап 5 / F2] Подсчёт unresolved конфликт-копий в vault.
         *
         * Рекурсивный обход vault через adapter.list, счёт файлов с
         * '.conflict-' в имени. Best-effort: ошибки листинга игнорируются,
         * .trash/.archive/.obsidian/plugins/obsidian-file-recovery
         * пропускаются (производительность + эти папки не интересны).
         *
         * Используется чипом Диагностики в SettingsTab.display() —
         * пользователь видит, сколько неразрешённых конфликтов накопилось.
         */
        async countConflictCopies(): Promise<number> {
                const adapter = this.app.vault.adapter;
                let count = 0;
                const visited = new Set<string>();
                const queue: string[] = [''];
                while (queue.length > 0) {
                        const dir = queue.shift()!;
                        if (visited.has(dir)) continue;
                        visited.add(dir);
                        try {
                                const listed = await adapter.list(dir);
                                for (const f of listed.files) {
                                        if (/\.conflict-/.test(f)) count++;
                                }
                                for (const d of listed.folders) {
                                        // d — это базовое имя папки (не полный путь),
                                        // поэтому склейку с текущим dir делаем сами.
                                        const full = dir ? `${dir}/${d}` : d;
                                        // skip .trash, .archive — там конфликтов нет
                                        // (или они не интересны для подсчёта).
                                        // Аналогично .obsidian/plugins/obsidian-file-recovery —
                                        // File Recovery snapshots не нужно считать.
                                        if (full === '.trash'
                                                || full.startsWith('.trash/')
                                                || full === '.archive'
                                                || full.startsWith('.archive/')
                                                || full === '.obsidian/plugins/obsidian-file-recovery'
                                                || full.startsWith('.obsidian/plugins/obsidian-file-recovery/')) {
                                                continue;
                                        }
                                        queue.push(full);
                                }
                        } catch {
                                // ignore — продолжаем обход
                        }
                }
                return count;
        }


        /** [Phase 4] Применить пресет структуры (full/obsidian) для текущего источника.
         *  [P2/M4] Пресет больше НЕ стирает пер-папочный охват зеркала
         *  (mirrorFolders): защитные off-правила (инвариант Е2 «исключение =
         *  защита») переживают смену пресета — как во внутримодальном пути
         *  policy-editor.setPreset. Билдеры — канонические из status.ts. */
        async applyStructurePreset(preset: 'full' | 'obsidian', pluginDir: string): Promise<void> {
                if (!this.builtSourceId) return;
                const base = preset === 'obsidian' ? obsidianOnlyPolicy(pluginDir) : fullVaultPolicy(pluginDir);
                if (!this.settings.syncPolicies) this.settings.syncPolicies = {};
                const existing = this.settings.vaultPolicy ?? this.settings.syncPolicies[this.builtSourceId];
                const presetPolicy:SyncPolicy = {
                        ...base,
                        mirror: existing?.mirror ?? false,
                        // [P2/M4] охват зеркала сохраняется (раньше затирался —
                        // смена пресета снимала защиту off-папок от full-зеркала).
                        mirrorFolders: existing?.mirrorFolders,
                        fileRules: existing?.fileRules,
                        assignments: existing?.assignments,
                        defaultSource:existing?.defaultSource,
                        // [overhaul v4 / Этап 4] fileExclusions: берём из base (новый
                        // пресет со стандартными machine-specific исключениями) И
                        // ДОБАВЛЯЕМ существующие пользовательские исключения, которых
                        // нет в base (по pattern+scope — дедуп). Так смена пресета
                        // не теряет кастомных правил пользователя.
                        fileExclusions: mergeFileExclusions(
                                base.fileExclusions ?? [],
                                existing?.fileExclusions,
                        ),
                };
                await this.saveSettingsImmediate();
                this.settings.syncPolicies[this.builtSourceId]=presetPolicy;
                if(this.settings.vaultPolicy)this.settings.vaultPolicy=presetPolicy;
                this.coordinator?.setSyncPolicy(this.effectiveProfilePolicy(this.builtSourceId));
        }

        async saveFileRules(sourceId: string, rules: FileRule[]): Promise<void> {
                if (!sourceId || sourceId !== this.builtSourceId) throw new Error('Source changed; reopen settings');
                validateFileRules(rules);
                const policies = this.settings.syncPolicies ??= {};
                const previous = policies[sourceId];
                // Introducing rules must not widen a legacy config-only / folder-filtered scope.
                const legacy = previous ?? migrateSettingsToV3({
                        settings: { ...this.settings, migratedV3: false }, syncPolicies: {},
                        currentSourceId: sourceId, pluginDir: this.pluginDir(),
                }).syncPolicies[sourceId] ?? { version: 1 as const, mirror: false, folders: [] };
                const policy: SyncPolicy = { ...legacy, fileRules: structuredClone(rules) };
                policies[sourceId] = policy;
                try { await this.saveSettingsImmediate(); }
                catch (error) {
                        if (previous) policies[sourceId] = previous;
                        else delete policies[sourceId];
                        throw error;
                }
                if (sourceId === this.builtSourceId) this.coordinator?.setSyncPolicy(policy);
        }

        openProfileLibrary(sources:boolean):void {
                void this.ensureProfileSettings().then(()=>{
                        const revision=this.getConfigurationRevision();
                        const modal=new ProfileLibraryModal(this.app,this.settings.profiles ?? [],this.settings.connections ?? [],async(profiles,connections)=>{
                                if(revision!==this.getConfigurationRevision())throw new Error('Settings changed; reopen the profile library');
                                validateProfiles(profiles,connections);
                                for(const policy of this.settings.vaultPolicy?[this.settings.vaultPolicy]:Object.values(this.settings.syncPolicies ?? {}))compileProfiles(policy,profiles);
                                if(this.settings.vaultPolicy){
                                        const compiled=compileProfiles(this.settings.vaultPolicy,profiles);
                                        for(const id of [compiled.defaultSource,...(compiled.fileRules??[]).map(r=>r.source)])if(id&&!connections.some(c=>c.id===id))throw Error('Connection is used by a vault assignment');
                                }
                                const oldProfiles=this.settings.profiles,oldConnections=this.settings.connections;
                                this.settings.profiles=profiles;this.settings.connections=connections;
                                try{await this.saveSettingsImmediate();}catch(e){this.settings.profiles=oldProfiles;this.settings.connections=oldConnections;throw e;}
                        },sources);trackModal(modal);modal.open();
                }).catch(e=>new Notice(String(e)));
        }

        /** [POLICY Phase 3] Модалка структуры-политики: дерево local+remote, чекбоксы, rename/move. */
        openVaultTreeModal(): void {
                void this.openProfileTree().catch(e=>new Notice(String(e)));
        }

        private async openProfileTree(): Promise<void> {
                await this.ensureProfileSettings();
                const revision=this.getConfigurationRevision(),abort=new AbortController();
                const modal=new SyncWorkspaceModal(this.app,{
                        policy:this.settings.vaultPolicy!,profiles:this.settings.profiles ?? [],connections:this.settings.connections ?? [],
                        pathPolicy:this.makePolicy(),pluginDir:this.pluginDir(),
                        isRunning:()=>this.sessionOwned || (this.coordinator?.isRunning() ?? false),
                        local:async()=>{
                                const snapshot=await scanVaultTree(this.makeVaultAdapter(),{signal:abort.signal,
                                        pruneFolder:path=>path==='.git'||path==='.trash'||path===`${this.pluginDir()}/recovery-v2`});
                                return {files:snapshot.files,folders:snapshot.folders};
                        },
                        fetch:async(connection,signal)=>{
                                if(!this.assertNetworkAllowed())throw Error(i18n.getLocale()==='ru'?'Доступ к источнику заблокирован':'Source access blocked');
                                if(!isSourceConfigured(connection.kind,{repoUrl:'',accessToken:'',vaultUrl:'',...connection.values}))throw Error('Source is not configured');
                                const source=EngineRegistry.create(connection.kind,structuredClone(connection.values),this.engineCtx(connection.kind));
                                try{return await source.getManifest(signal);}finally{await source.dispose?.();}
                        },
                        dispose:()=>abort.abort(),
                        save:async(policy,connections)=>{
                                if(revision!==this.getConfigurationRevision()||this.sessionOwned||this.coordinator?.isRunning())throw Error('Settings changed or sync started; reopen the tree');
                                validateProfiles(this.settings.profiles ?? [],connections);
                                const compiled=compileProfiles(policy,this.settings.profiles ?? []);
                                for(const source of [policy.defaultSource,...(compiled.fileRules ?? []).map(r=>r.source)])if(source&&!connections.some(c=>c.id===source))throw Error('Missing source connection');
                                const previous={vaultPolicy:this.settings.vaultPolicy,connections:this.settings.connections};
                                this.settings.vaultPolicy=structuredClone(policy);this.settings.connections=structuredClone(connections);
                                try{await this.saveSettingsImmediate();}catch(e){Object.assign(this.settings,previous);throw e;}
                        },
                });trackModal(modal);modal.open();
        }

        async syncNow(): Promise<void> {
                await this.runSession('manual', async () => {
                        await this.prepareSession();
                        const stats = await this.coordinator.sync();
                        // [7-d] небезопасные пути видны пользователю, не только в консоли
                        const skipped = this.coordinator.getSkippedUnsafeCount();
                        if (skipped > 0) new Notice(i18n.t.noticeSkippedUnsafe(skipped), 10000);
                        return stats;
                });
        }

        // ============================================================
        // --- [W4-T01/W4-T04] Авто-синхронизация (планировщик) ---
        // ============================================================

        /** Старт планировщика: читает autoSyncInterval из настроек и запускает.
         *  Идемпотентен — повторный вызов пересоздаёт экземпляр (старый снимается). */
        startAutoSync(): void {
                if (!this.queue) return; // buildEngine не позван — нет deps.
                const interval = (this.settings.autoSyncInterval ?? 'off') as SchedulerInterval;
                this.scheduler = new Scheduler({
                        // [overhaul S2/M-7] плавающие промосы тиков — под .catch:
                        // scheduler живёт в core/ (без Notice) и глотать отказы не
                        // имеет права; runSession теперь тотален, это страховка.
                        onAutoTick: () => { this.runAutoSession().catch((e) => console.error('[VaultSync] auto-tick failed:', e)); },
                        onAutoRetry: () => { this.retryFailedFiles().catch((e) => console.error('[VaultSync] auto-retry failed:', e)); },
                        queue: this.queue,
                });
                if (interval !== 'off') {
                        this.scheduler.start(interval);
                }
        }

        /** Переконфигурация интервала (вызывается из SettingsTab.onChange). */
        restartAutoSync(): void {
                this.scheduler?.stop();
                this.startAutoSync();
        }

        /** Pause/resume toggle — вызывается из popover actionPauseAuto. */
        pauseAutoSync(): void {
                if (!this.scheduler) return;
                if (this.scheduler.isPaused()) this.scheduler.resume();
                else this.scheduler.pause();
                // [W5-T02] статус авто-синк изменился (paused↔running) — уведомляем подписчиков.
                this.notifyVaultSync();
        }

        /** Снимок состояния для popover. null — scheduler не инициализирован
         *  или интервал 'off' (popover не рендерит scheduler-секцию). */
        schedulerSnapshot(): SchedulerSnapshot | null {
                if (!this.scheduler) return null;
                const s = this.scheduler.snapshot();
                if (s.interval === 'off') return null;
                return s;
        }

        /** Auto-сессия: headless-режим (W4-T02). coordinator.sync с trigger='auto'
         *  идёт без confirm-модалки; mirrorLevel=fetch/light → удаления откладываются,
         *  full → исполняются с trash. Notice-фильтр через verboseNotices. */
        private async runAutoSession(): Promise<void> {
                await this.runSession('auto', async () => {
                        await this.prepareSession();
                        return await this.coordinator.sync({ trigger: 'auto' });
                });
        }

        async retryFailedFiles(): Promise<void> {
                await this.runSession('retry', async () => {
                        await this.prepareSession();
                        return await this.coordinator.retryFailed();
                });
        }

        async forceResync(): Promise<void> {
                const confirmed = await showConfirmModal(
                        this.app, 'force', {}, this.builtKind,
                );
                if (!confirmed) return;
                await this.runSession('force', async () => {
                        await this.prepareSession();
                        return await this.coordinator.forceResync();
                });
        }

        async scanAndRestoreMissing(): Promise<void> {
                await this.runSession('scan', async () => {
                        const t = i18n.t;
                        await this.prepareSession();
                        this.statusBar.setState('syncing', { progressText: '...' });
                        new Notice(t.noticeCheckingSource);
                        const missing = await this.coordinator.collectMissing();
                        if (missing === null || missing.length === 0) {
                                this.statusBar.setState('idle');
                                if (missing?.length === 0) new Notice(t.noticeNoMissingFiles);
                                return null;
                        }
                        const confirmed = await showConfirmModal(this.app, 'scan', { toRestore: missing.length, paths: missing }, this.builtKind);
                        if (!confirmed) { this.statusBar.setState('idle'); return null; }
                        return this.coordinator.sync({ forcedPaths: new Set(missing) });
                });
        }

        /** [overhaul S1/H-3] Гейт внесессионного сетевого трафика: testConnection,
         *  fetchRemote (модалка структуры) и collectMissing уводили манифест/архив
         *  в сеть ДО runSession — заблокированный VAM/governance пользователь
         *  осуществлял полный сетевой обмен (для zip-url на мобайле — скачивание
         *  всего архива). Та же пара гейтов в том же порядке (VAM → governance),
         *  теми же текстами Notice, что в runSession; false = отказ (Notice уже
         *  показан: VAM — троттлинг 3с в vam-bridge, governance — 10с). Мягкий
         *  режим (vamSoftMode) — то же исключение, что и для сессий. */
        private assertNetworkAllowed(): boolean {
                try {
                        assertVamAllowed(this);
                } catch (e) {
                        if (e instanceof Error && e.name === 'VamAccessError') {
                                this.notifyVaultSync();
                                return false;
                        }
                        throw e;
                }
                if (!isSyncAllowed(this.governance)) {
                        const reason = blockReason(this.governance) ?? i18n.t.noticeManagerRequired;
                        new Notice(i18n.t.noticeGovernanceBlocked(reason), 10000);
                        this.notifyVaultSync();
                        return false;
                }
                return true;
        }

        /** [W2-T08] Обёртка сессии: честная запись в журнал (Д7=1).
         *  Coordinator владеет outcome (W1-T01: флаги отмены видны ему);
         *  здесь — только старт/длительность/триггер/движок и top-3 ошибок. */
        private async runSession(trigger: 'manual' | 'auto' | 'retry' | 'scan' | 'force', fn: () => Promise<import('./src/sources/types').SyncStats | null>): Promise<import('./src/sources/types').SyncStats | null> {
                if (this.sessionOwned || this.coordinator?.isRunning()) { new Notice(i18n.t.noticeSyncInProgress); return null; }
                this.sessionOwned = true;
                try { return await this.runOwnedSession(trigger, fn); }
                finally { this.sessionOwned = false; }
        }

        private async runOwnedSession(trigger: 'manual' | 'auto' | 'retry' | 'scan' | 'force', fn: () => Promise<import('./src/sources/types').SyncStats | null>): Promise<import('./src/sources/types').SyncStats | null> {
                // [VAM] гейт «работы, требующей входа» (§5, fail-closed): единая
                // точка для ВСЕХ сессий — manual/auto/retry/scan/force (аналог
                // гейта AI-запросов донора: AIEngine.processText/chat/embeddings).
                // Двойная сверка §9.4: сигнал читается в момент использования,
                // не кэшируется; не-granted → VamAccessError ДО ухода какого-либо
                // трафика (Notice — не чаще раза в 3 с, троттлинг в vam-bridge).
                // Мягкий режим (сессионный; публичный скрытый жест — см. поле
                // vamSoftMode и vam-status-modal.ts) — единственное исключение.
                // Отказ = null без журнала: сессия не началась, записи нет.
                try {
                        assertVamAllowed(this);
                } catch (e) {
                        if (e instanceof Error && e.name === 'VamAccessError') {
                                this.notifyVaultSync();
                                // [overhaul S1/M-4] вызывшая команда могла уже
                                // поставить 'syncing' (scan-путь) — coordinator
                                // не запускался и статус никто не сбросит.
                                this.statusBar.setState('idle');
                                return null;
                        }
                        throw e;
                }
                // [P2 / manager-build-spec §3.5] beforeSession: дать менеджеру
                // аутентификации шанс провести свежий probe ДО guard-решения
                // (pull канала + applyManagerProbe на его стороне). Ошибки и
                // таймаут 10 с не меняют вердикт; vaultSyncAuth отсутствует →
                // поведение прежнее (W5-совместимость, optional chaining).
                await awaitBeforeSession((window as unknown as Record<string, unknown>).vaultSyncAuth, BEFORE_SESSION_TIMEOUT_MS);
                if (!this.assertNetworkAllowed()) { this.statusBar.setState('idle'); return null; }
                // [W5-T01] guard: fail-closed на старте КАЖДОЙ сессии. Если
                // governance.blocked — отказываем с внятным Notice и не идём
                // в prepareSession (сеть/диск/manifest не трогаем). Это
                // ловит и auto, и retry, и scan, и force — единая guard-точка.
                if (!isSyncAllowed(this.governance)) {
                        const reason = blockReason(this.governance) ?? i18n.t.noticeManagerRequired;
                        new Notice(i18n.t.noticeGovernanceBlocked(reason), 10000);
                        this.notifyVaultSync();
                        // [overhaul S1/M-4] симметрично VAM-ветке выше.
                        this.statusBar.setState('idle');
                        return null;
                }
                const startedAt = Date.now();
                let stats: import('./src/sources/types').SyncStats | null = null;
                try {
                        stats = await fn();
                        return stats;
                } catch (e) {
                        // [overhaul S2/M-7] не-VAM ошибки сессии (дисковые ошибки
                        // prepareSession/cache.reset, неожиданные исключения движков)
                        // раньше уходили в unhandled rejection: команды и auto-тики
                        // молча умирали без Notice. Журнал в finally сохраняет прежнюю
                        // семантику (stats=null → записи нет — сессия не началась).
                        console.error('[VaultSync] session error:', e);
                        new Notice(i18n.t.noticeSyncFailed(e instanceof Error ? e.message : String(e)), 10000);
                        this.statusBar.setState('error');
                        return null;
                } finally {
                        await this.recordJournal(trigger, stats, startedAt);
                        // [P1/M13] сессия завершилась — открытый popover получает
                        // свежую lastEntry (журнал только что записан), не снапшот
                        // на момент открытия модалки.
                        if (this.popoverView) {
                                void this.journal.load().then((entries) => {
                                        if (this.popoverView) {
                                                (this.popoverView as unknown as { lastEntry: unknown }).lastEntry = entries[0] ?? null;
                                                this.popoverView.update(this.snapshotPopoverState());
                                        }
                                });
                        }
                        // [W5-T02] уведомляем подписчиков window.vaultSync: статус
                        // мог смениться (syncing → idle/error), pendingCount обновился.
                        this.notifyVaultSync();
                }
        }

        /** [W5-T01] Применить probe менеджера — обновляет this.governance и
         *  персистит флаг при необходимости (только если managerEverActive
         *  перешёл false→true — это односторонний переход до ручного сброса).
         *  Вызывается из будущего хука window.vaultSyncAuth (когда менеджер
         *  загрузится), либо вручную из тестов/диагностики. */
        async applyManagerProbe(probe: ManagerProbe): Promise<void> {
                const before = this.governance.managerEverActive;
                this.governance = probeManager(this.governance, probe, Date.now());
                if (this.governance.managerEverActive !== before) {
                        // Односторонний переход: false → true. Персистируем сразу —
                        // даже если Obsidian крашнет в следующую секунду, при
                        // перезапуске sync-плагин стартует в fail-closed.
                        this.settings.governanceManagerEverActive = this.governance.managerEverActive;
                        await this.saveSettingsImmediate();
                }
                this.notifyVaultSync();
        }

        // ============================================================
        // --- [VAM] КОНТРОЛЬ ДОСТУПА (гвард + мост + статусная модалка) ---
        // ============================================================

        /** [VAM] Статусная модалка (команда cloud-sync-vam-status / кнопка в
         *  Диагностике): granted/blocked/pending + причина отказа; скрытый
         *  бэкдор — 10 ЛКМ по телу модалки → мягкий режим (сессионный, в
         *  data.json не пишется). [overhaul S1/H-2] жест ПУБЛИЧЕН — работает
         *  у любого пользователя, знающего о нём (решение владельца); UI о
         *  нём не сообщает. */
        openVamStatusModal(): void {
                const vamModal = new VamStatusModal(this.app, {
                        granted: vamAllowsWork(this),
                        softMode: this.vamSoftMode === true,
                        reasonText: describeVamStatus(this.vam),
                        onSoftUnlock: () => {
                                this.vamSoftMode = true;
                                new Notice(i18n.t.vam.noticeSoftModeOn, 5000);
                                this.notifyVaultSync();
                        },
                });
                // [overhaul S4 / S3-review #2] модалка доступа тоже в реестре:
                // не переживает выгрузку (onSoftUnlock не стрельнёт по мёртвому плагину).
                trackModal(vamModal);
                vamModal.open();
        }

        /** [VAM] Изменение состояния гварда (в обе стороны — вход/отзыв/смена
         *  причины): пересчёт для подписчиков window.vaultSync (vam-поле в
         *  снимке состояния) + свежесть статус-бара. Колбэк подписан в onload
         *  (onChange гварда); безопасен на любом этапе жизненного цикла
         *  (optional chaining на хуке, refresh молчит без statusBarEl). */
        private onVamStateChanged(): void {
                this.notifyVaultSync();
                this.statusBar?.refresh();
        }

        /** [VAM] Отзыв после granted (mid-session): внятный Notice с причиной.
         *  Идущие сессии не прерываем (гейт читается на старте каждой новой —
         *  двойная сверка §9.4), но все новые сессии будут отказаны до
         *  повторного подтверждения доступа. */
        private onVamRevoked(reason: string | null): void {
                const reasonText = reason ? describeVamReason(reason) : i18n.t.vam.reasonNoCode;
                new Notice(i18n.t.vam.noticeRevoked(reasonText), 8000);
                this.notifyVaultSync();
        }

        /** [W5-T01] Ручной сброс governance (A4) — вызывается из Диагностики
         *  через confirm-модалку. Сбрасывает И персистентный флаг, И runtime. */
        async resetGovernanceState(): Promise<void> {
                this.governance = resetGovernance();
                this.settings.governanceManagerEverActive = false;
                await this.saveSettingsImmediate();
                this.notifyVaultSync();
        }

        /** [W5-T02] Снимок состояния для window.vaultSync.getState(). Берёт
         *  live-значения из плагина; вызывается на каждый notify (см. runSession,
         *  applyManagerProbe, pauseAutoSync, иные точки смены состояния). */
        private buildVaultSyncState(): VaultSyncState {
                const mirrorLevel = this.currentMirrorLevel();
                const syncState = this.coordinator?.isRunning() ? 'syncing' : 'idle';
                return {
                        syncState: syncState as VaultSyncState['syncState'],
                        mirrorLevel,
                        governance: snapshotGovernance(this.governance),
                        sourceId: this.builtSourceId ?? '',
                        engineKind: this.builtKind ?? null,
                        lastSyncAt: this.settings.lastSyncTime ?? 0,
                        pendingCount: this.queue?.size() ?? 0,
                        // [VAM] состояние гварда в публичном снимке (аддитивное
                        // поле — обратно совместимо для сторонних потребителей
                        // window.vaultSync). Гварда нет (до onload/после выгрузки) →
                        // fail-closed-семантика: blocked без причины.
                        vam: {
                                status: this.vam?.status ?? 'blocked',
                                reason: this.vam?.reason ?? null,
                                softMode: this.vamSoftMode === true,
                        },
                };
        }

        /** [W5-T02] Расслать текущее состояние всем подписчикам window.vaultSync.
         *  No-op если реестр ещё не создан (onload не отработал) или подписчиков нет. */
        private notifyVaultSync(): void {
                this.vaultSyncHook?.notify();
        }

        private async recordJournal(
                trigger: 'manual' | 'auto' | 'retry' | 'scan' | 'force',
                stats: import('./src/sources/types').SyncStats | null,
                startedAt: number,
        ): Promise<void> {
                if (!this.journal) return;
                // Сессия могла не дойти до coordinator.sync (отказ confirm/scan-no-missing):
                // stats=null → не записываем — журнал не плодит «пустых» сессий.
                if (!stats) return;
                const entry: JournalEntry = {
                        startedAt,
                        durationMs: stats.duration ?? (Date.now() - startedAt),
                        engine: this.builtKind,
                        mirrorLevel: this.currentMirrorLevel(),
                        trigger,
                        outcome: stats.outcome ?? (stats.failed > 0 ? 'error' : 'ok'),
                        downloaded: stats.downloaded,
                        updated: stats.updated ?? 0,
                        deletedLight: stats.deleteLight ?? 0,
                        deletedFull: stats.deleteFull ?? 0,
                        overwritten: stats.overwritten ?? 0,
                        conflicts: stats.conflicts,
                        skipped: stats.skipped,
                        errors: stats.failed,
                        deferredDeletions: stats.deferredDeletions ?? 0,
                        blockedDeletions: stats.blockedDeletions ?? 0,
                        topErrors: topErrorsFrom(this.queue.all().map((f) => f.reason)),
                };
                try {
                        await this.journal.append(entry);
                } catch (e: any) {
                        // Журнал не должен ронять синхронизацию.
                        console.warn('[VaultSync] journal append failed:', e?.message ?? e);
                }
        }

        private cancelSync(): void {
                this.coordinator.cancel();
                new Notice(i18n.t.noticeCancelling);
        }

        async testConnection(): Promise<void> {
                const t = i18n.t;
                const kind = this.desiredSourceKind();
                // [overhaul S1/H-3] гейт ДО какого-либо трафика (git — ветки API;
                // yandex/gdrive/webdav — полный getManifest; zip-url на мобайле —
                // полное скачивание архива) и ДО setStatus('syncing').
                if (!this.assertNetworkAllowed()) return;
                this.statusBar.setState('syncing', { progressText: '...' });
                try {
                        if (kind === 'git') {
                                // git-specific: GitSource.testConnection(branch) — GitHub branches API.
                                // Не входит в capability.testConnection (это W3-T04-контракт для ZIP);
                                // git имеет собственный метод, оставленный в классе GitSource.
                                if (!this.settings.repoUrl) { new Notice(t.noticeRepoUrlEmpty); return; }
                                if (!GitSource.parseGitUrl(this.settings.repoUrl)) { new Notice(t.noticeInvalidUrl); return; }
                                // [overhaul S2/M-6] СВЕЖИЙ инстанс из ТЕКУЩИХ настроек:
                                // this.gitSource мог быть stale (repoUrl сменили после
                                // последней сессии) или вовсе не создан (переключение на
                                // git до первой сессии — поле объявлено с '!'). Закрыты все
                                // три пути: ложный «Connected», ложный отказ, TypeError.
                                const fresh = EngineRegistry.create('git', this.engineValues('git'), this.engineCtx()) as import('./src/sources/git-source').GitSource;
                                const result = await fresh.testConnection(this.settings.branch);
                                if (result.success) new Notice(t.noticeConnected(result.message));
                                else new Notice(t.noticeConnectionFailed(result.message));
                                return;
                        }
                        // [W3-T03] yandex / zip-url — через реестр (как и buildEngine).
                        // [W3-T04] для zip-url: capability.testConnection=true → лёгкая
                        // проверка через source.testConnection() (HEAD + Range-хвост, без
                        // полного скачивания). rangeTransport инъектируется из engineCtx
                        // (на десктопе — NodeZipRangeTransport; на мобайле → fallback full).
                        // [P0/M2] Guard по required-полям СХЕМЫ движка: раньше стояла
                        // безусловная проверка vaultUrl ДО ветвления — gdrive (apiKey) и
                        // webdav (baseUrl) всегда получали «Ссылка не указана».
                        {
                                const desc = EngineRegistry.get(kind);
                                const values = this.engineValues(kind);
                                for (const field of desc.settingsSchema) {
                                        if (!field.required) continue;
                                        const v = values[field.key];
                                        if (typeof v !== 'string' || v.trim() === '') {
                                                // vaultUrl (yandex/zip-url) — прежний специфичный текст.
                                                new Notice(field.key === 'vaultUrl'
                                                        ? t.noticeVaultUrlEmpty
                                                        : t.noticeRequiredFieldEmpty(resolveLabel(t, field.labelKey)), 10000);
                                                return;
                                        }
                                }
                        }
                        new Notice(t.noticeCheckingSource, 30000);
                        const source = EngineRegistry.create(kind, this.engineValues(kind), this.engineCtx());
                        try {
                                const desc = EngineRegistry.get(kind);
                                if (desc.capabilities.testConnection && typeof (source as ZipUrlSource).testConnection === 'function') {
                                        // [W3-T04] легковесный путь: TestConnectionResult { ok, fileCount, ... }
                                        const result = await (source as ZipUrlSource).testConnection();
                                        if (result.ok) {
                                                new Notice(t.noticeZipTested(result.fileCount));
                                        } else {
                                                // method не показываем в Notice — он в логе; классификатор
                                                // error ('auth' / 'not-found' / 'http-500' / ...) достаточно
                                                // объясняет причину без технических деталей.
                                                new Notice(t.noticeConnectionFailed(result.error), 10000);
                                        }
                                } else {
                                        // yandex/gdrive/webdav: capability.testConnection=false — лёгкого
                                        // варианта нет, проверяем честно через полный getManifest.
                                        // [P0/M2] yandex — свой текст; gdrive/webdav — нейтральный
                                        // (раньше «Яндекс.Диск: …» показывался и для них).
                                        const manifest = await source.getManifest(new AbortController().signal);
                                        const notice = kind === 'yandex'
                                                ? t.noticeYandexTested(manifest.length)
                                                : t.noticeManifestTested(manifest.length);
                                        new Notice(notice);
                                }
                        } finally {
                                await source.dispose?.();
                        }
                } catch (e: any) {
                        new Notice(t.noticeConnectionFailed(e?.message ?? String(e)), 10000);
                } finally {
                        this.statusBar.setState('idle');
                }
        }

        clearFailedQueue(): void {
                this.coordinator?.clearFailed();
                this.settings.failedQueue = [];
                this.saveSettings();
                new Notice(i18n.t.noticeFailedQueueCleared);
                this.statusBar.setState('idle');
        }

        // ============================================================
        // --- АДАПТЕРЫ И UI-ПОРТЫ (В5-1: ядро не знает Obsidian) ---
        // ============================================================

        private makeVaultAdapter(): VaultAdapter {
                const adapter = this.app.vault.adapter;
                const norm = (p: string) => normalizePath(p);
                // [5-логи] каждая операция — с таймингом; ошибка получает контекст
                // (путь/размер/exists) — «destination file already exists» перестаёт
                // быть анонимным.
                const timed = async <T>(op: string, p: string, fn: () => Promise<T>): Promise<T> => {
                        const t0 = performance.now();
                        try {
                                const r = await fn();
                                this.verboseLog(`${op} ok: "${p}" (${Math.round(performance.now() - t0)}ms)`);
                                return r;
                        } catch (e) {
                                const existsNow = await adapter.exists(norm(p)).catch(() => undefined);
                                console.error(
                                        `[VaultSync] ${op} FAILED: "${p}" (after ${Math.round(performance.now() - t0)}ms, ` +
                                        `existsNow=${String(existsNow)}): ${e instanceof Error ? e.message : String(e)}`);
                                throw e;
                        }
                };
                return {
                        exists: (p) => adapter.exists(norm(p)),
                        readBinary: (p) => adapter.readBinary(norm(p)),
                        writeBinary: (p, data) => timed(`write ${data.byteLength}B`, p, () => adapter.writeBinary(norm(p), data)),
                        compareAndWrite: async (p, data, expected, signal) => {
                                let previous: string;
                                let next: string;
                                try {
                                        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
                                        previous = decoder.decode(expected);
                                        next = decoder.decode(data);
                                } catch { return undefined; }
                                const file = this.app.vault.getFileByPath(norm(p));
                                if (!file || file.extension !== 'md') return undefined;
                                const changed = new Error('Local file changed before atomic replacement');
                                try {
                                        await this.app.vault.process(file, current => {
                                                signal?.throwIfAborted();
                                                if (current !== previous) throw changed;
                                                return next;
                                        });
                                        return true;
                                } catch (error) {
                                        if (error === changed) return false;
                                        throw error;
                                }
                        },
                        mkdir: (p) => timed('mkdir', p, () => adapter.mkdir(norm(p))),
                        remove: (p) => timed('remove', p, () => adapter.remove(norm(p))),
                        rename: (from, to) => timed(`rename "${from}" ->`, to, () => adapter.rename(norm(from), norm(to))),
                        stat: async (p) => {
                                const st = await adapter.stat(norm(p));
                                return st ? { mtime: st.mtime, size: st.size } : null;
                        },
                        // [overhaul S5/EEXIST] trash — ЕДИНСТВЕННАЯ операция адаптера
                        // поверх высокоуровневого Vault API (все остальные — DataAdapter,
                        // который нормализует путь и ПЕРЕЗАПИСЫВАЕТ). Vault.trash —
                        // операция ПЕРЕМЕЩЕНИЯ: когда в месте назначения (системная
                        // корзина / .trash) уже лежит файл с тем же именем, рантайм
                        // бросает «Destination file already exists!» — повторные
                        // синхронизации гарантированно воспроизводят конфликт.
                        // Раньше порт не был обёрнут в timed (единственный такой
                        // случай — ошибка не получала контекст-лога) и не имел
                        // фолбэка. Теперь: timed-атрибуция + устойчивый фолбэк
                        // trashWithFallback (.trash/ со штампованным именем).
                        trash: (p) => timed('trash', p, () => this.trashWithFallback(adapter, norm(p))),
                        list: async (p) => {
                                const listed = await adapter.list(norm(p));
                                return { files: listed.files, folders: listed.folders };
                        },
                };
        }

        /** [overhaul S5/EEXIST] Готовность `.trash/` в корне vault: mkdir один
         *  раз, гонка параллельных удалений толерантна (EEXIST → повторная
         *  проверка exists). Неудача НЕ кэшируется — следующая попытка
         *  повторит mkdir. */
        private trashDirReady: Promise<void> | null = null;

        /** [9-accept #1] Сериализатор .trash-фолбэка — закрывает TOCTOU
         *  exists→rename: параллельные trash одного базового имени (одна
         *  секунда + отказавшая системная корзина) раньше могли вычислить
         *  ОДНОГО кандидата до чужого rename — POSIX-rename молча затёр бы
         *  уже уложенную в `.trash/` копию. В сериализованной цепочке
         *  второй вызов ВИДИТ первого (exists=true) и берёт суффикс -2.
         *  Цепочка не отравляется ошибками — каждый вызов начинается своей
         *  итерацией, исход возвращается вызывающему. */
        private trashFallbackChain: Promise<void> = Promise.resolve();

        private runTrashFallbackSerialized(op: () => Promise<void>): Promise<void> {
                const run = this.trashFallbackChain.then(op);
                this.trashFallbackChain = run.catch(() => { /* цепочка живёт дальше */ });
                return run;
        }

        private ensureVaultTrashDir(adapter: DataAdapter): Promise<void> {
                if (!this.trashDirReady) {
                        this.trashDirReady = (async () => {
                                if (await adapter.exists('.trash')) return;
                                try {
                                        await adapter.mkdir('.trash');
                                } catch {
                                        if (!(await adapter.exists('.trash'))) {
                                                throw new Error('VaultSync: cannot create .trash folder in vault root');
                                        }
                                }
                        })().catch((e) => {
                                this.trashDirReady = null;
                                throw e;
                        });
                }
                return this.trashDirReady;
        }

        /** [overhaul S5/EEXIST] Устойчивая корзина — трёхуровневая:
         *  1) системная корзина Obsidian (Vault.trash) — штатный путь;
         *  2) её отказ (конфликт имени в месте назначения, корзина недоступна)
         *     или файл вне индекса Vault → перемещение в `.trash/` корня vault
         *     со ШТАМПОВАННЫМ уникальным именем (общий генератор с
         *     конфликт-копиями — коллизия исключена по построению);
         *  3) не вышло и это — честный throw с ясным сообщением: вызывающие
         *     имеют свои fallback-семантики (safeWrite mirror-full спасает
         *     локаль конфликт-копией; processDeletions логирует). Молчаливая
         *     потеря данных исключена на каждом уровне. */
        private async trashWithFallback(adapter: DataAdapter, p: string): Promise<void> {
                const af = this.app.vault.getAbstractFileByPath(p);
                if (af) {
                        try {
                                await this.app.vault.trash(af, true);
                                return;
                        } catch (e) {
                                console.warn(
                                        `[VaultSync] system trash failed for "${p}" ` +
                                                `(${e instanceof Error ? e.message : String(e)}) — falling back to .trash/`,
                                );
                        }
                }
                await this.ensureVaultTrashDir(adapter);
                // [9-accept #1] вычисление кандидата + rename — атомарная пара
                // относительно других trash-вызовов (закрытие TOCTOU).
                await this.runTrashFallbackSerialized(() => this.renameIntoVaultTrash(adapter, p));
        }

        /** [9-accept #1] Перемещение в `.trash/` со штампованным уникальным
         *  именем — исполняется ТОЛЬКО внутри сериализованной цепочки. */
        private async renameIntoVaultTrash(adapter: DataAdapter, p: string): Promise<void> {
                const basename = p.slice(p.lastIndexOf('/') + 1);
                const stamped = await buildStampedPath(
                        basename,
                        'trash',
                        formatConflictTimestamp(Date.now()),
                        (c) => adapter.exists(`.trash/${c}`),
                );
                const target = `.trash/${stamped}`;
                try {
                        await adapter.rename(p, target);
                } catch (e) {
                        throw new Error(
                                `VaultSync: trash fallback failed "${p}" -> "${target}": ` +
                                        `${e instanceof Error ? e.message : String(e)}`,
                        );
                }
        }

        /** [overhaul S1/H-1] manifest.dir — ПОЛНЫЙ путь папки плагина от корня
         *  vault (контракт Obsidian: '.obsidian/plugins/<id>'). ЕДИНЫЙ источник
         *  правды: раньше 3 из 5 мест трактовали его как ИМЯ папки и строили
         *  '.obsidian/plugins/.obsidian/plugins/<id>' — мёртвое exclusion-правило
         *  собственной папки (data.json с секретами и main.js попадали под
         *  full-зеркало). Публичен: SettingsTab и модалки используют его же. */
        pluginDir(): string {
                return this.manifest.dir ?? '';
        }

        private makePluginFs(): FileSystem {
                const adapter = this.app.vault.adapter;
                const base = this.manifest.dir ?? '';
                const full = (p: string) => normalizePath(base ? `${base}/${p}` : p);
                return {
                        read: async (p) => (await adapter.exists(full(p))) ? adapter.read(full(p)) : null,
                        write: (p, c) => adapter.write(full(p), c),
                        rename: (from, to) => adapter.rename(full(from), full(to)),
                        exists: (p) => adapter.exists(full(p)),
                        remove: (p) => adapter.remove(full(p)),
                        list: async () => {
                                const listed = await adapter.list(normalizePath(base));
                                return listed.files.map((f) => f.split('/').pop() ?? f);
                        },
                };
        }

        private makeSyncUI(): SyncUI {
                return {
                        confirmSync: async (info) => {
                                // [W2-T04] единый confirm-modal (flow='sync'). Секции собираются
                                // из ConfirmSyncInfo: toDownload/Update/New/Restore + уровни
                                // удалений + orphans + downloadBytes + noRecovery (BUG-10: движок
                                // передаётся отдельным аргументом, не хардкод в шаблоне).
                                // paths в ConfirmSyncInfo нет — список будет показан в scan-flow.
                                return await showConfirmModal(this.app, 'sync', {
                                        toDownload: info.toDownload,
                                        toUpdate: info.updatedCount,
                                        newCount: info.newCount,
                                        toRestore: info.restoredCount,
                                        deleteLight: info.deleteLight,
                                        deleteFull: info.deleteFull,
                                        orphans: info.orphans,
                                        downloadBytes: info.downloadBytes,
                                        noRecovery: info.noRecovery,
                                        blockedDeletions: info.blockedDeletions,
                                }, this.builtKind);
                        },
                        confirmRetry: async (count) => {
                                // [W2-T04] retry-flow: единый шаблон, секция toDownload.
                                return await showConfirmModal(
                                        this.app, 'retry', { toDownload: count }, this.builtKind,
                                );
                        },
                        setStatus: (phase, progress) => {
                                this.statusBar.setState(phase, progress);
                                // [P1/M13 + P2/3.2] popover живёт вместе со статус-баром:
                                // тот же setStatus-поток координатора, включая фазу
                                // конвейера (progress.phase → pipelinePhase → полоса).
                                this.popoverView?.update(this.snapshotPopoverState());
                        },
                        notify: (message, timeoutMs) => {
                                if (timeoutMs !== undefined) new Notice(message, timeoutMs);
                                else new Notice(message);
                        },
                        // [W4-T02] verbose-уведомления: дропаются в auto-режиме,
                        // если verboseNotices=false (А5); в manual-режиме показываются.
                        // Coordinator не знает текущего триггера — но SyncUI видит его
                        // через runSession(this._currentTrigger). Простейшая модель:
                        // verboseNotices=true → показывать; иначе — только в manual.
                        notifyVerbose: (message, timeoutMs) => {
                                if (this.settings.verboseNotices) {
                                        if (timeoutMs !== undefined) new Notice(message, timeoutMs);
                                        else new Notice(message);
                                }
                                // verboseNotices=false → дропаем (coordinator в manual-режиме
                                // всё равно покажет основное сообщение через ui.notify).
                        },
                        setLastSyncTime: (ts) => {
                                this.settings.lastSyncTime = ts;
                                this.statusBar.setLastSync(ts);
                        },
                };
        }

        // [3-review] мьютекс ask-модалок: следующая открывается после закрытия предыдущей
        private serializeAsk<T>(fn: () => Promise<T>): Promise<T> {
                const run = this.askChain.then(fn, fn);
                this.askChain = run.then(() => undefined, () => undefined);
                return run;
        }

        // [W3-T03] private stableHash удалён: реестр владеет собственной djb2
                // (src/engines/registry.ts — байт-в-байт с прежней реализацией).

        private async persistEngineState(kind: 'checkpoint' | 'session-end' | 'success-end'): Promise<void> {
                this.settings.failedQueue = this.queue.all();
                (this.settings.failedQueues ??= {})[this.cache.namespace] = this.queue.all();
                if (kind === 'success-end') this.settings.totalSyncCount++;
                await this.saveSettingsImmediate();
        }
}

// ============================================================
// --- SETTINGS TAB (with i18n) ---
// ============================================================

class GitSyncSettingTab extends PluginSettingTab {
        plugin: GitSyncPlugin;

        // [W2-T05] TODO(i18n): в словарях нет отдельных подписей для Behavior-
        // секции и имени поля «Уровень зеркала» (только mln* — названия уровней
        // и их описания). Module-local до консолидации (W2-T06 онбординг /
        // W2-T09 стили чипов Диагностики).

        constructor(app: App, plugin: GitSyncPlugin) {
                super(app, plugin);
                this.plugin = plugin;
        }

        /**
         * [W2-T05 / Д9=1] SettingsTab каркас «Источник → Поведение → Диагностика».
         * display() сделан async: чипы Диагностики читают journal.load() (живые
         * показатели из журнала сессий W2-T08 / В6=3 — единый источник правды).
         */
        async display(): Promise<void> {
                const { containerEl } = this;
                containerEl.empty();
                const t = i18n.t;

                containerEl.createEl('h2', { text: t.settHeading });

                // ════════════════════════════════════════════════════════════════
                // 1. Источник (Source) — движок + реквизиты подключения + mobile limit.
                // ════════════════════════════════════════════════════════════════
                containerEl.createEl('h3', { text: this.plugin.settings.language==='ru'?'Профили и назначения':'Profiles and assignments' });
                new Setting(containerEl).setName(this.plugin.settings.language==='ru'?'Дерево файлов':'File tree')
                        .setDesc(this.plugin.settings.language==='ru'?'Область синхронизации, источники и назначение профилей файлам и папкам.':'Sync scope, sources and profile assignments for files and folders.')
                        .addButton(b=>b.setButtonText(this.plugin.settings.language==='ru'?'Открыть дерево':'Open tree').setCta().onClick(()=>this.plugin.openVaultTreeModal()));
                new Setting(containerEl).setName(this.plugin.settings.language==='ru'?'Стандартные и пользовательские профили':'Standard and custom profiles')
                        .addButton(b=>b.setButtonText(this.plugin.settings.language==='ru'?'Библиотека профилей':'Profile library').onClick(()=>this.plugin.openProfileLibrary(false)));
                new Setting(containerEl).setName(this.plugin.settings.language==='ru'?'Подключения источников':'Source connections')
                        .addButton(b=>b.setButtonText(this.plugin.settings.language==='ru'?'Подключения':'Connections').onClick(()=>this.plugin.openProfileLibrary(true)));
                new Setting(containerEl).setName(t.settUseTrash).setDesc(t.settUseTrashDesc)
                        .addToggle(toggle=>toggle.setValue(this.plugin.settings.useTrash).onChange(v=>{this.plugin.settings.useTrash=v;this.plugin.saveSettings();}));

                // --- Security: плагины/сниппеты ---
                const securityDiv = containerEl.createDiv({ cls: 'callout' });
                securityDiv.createEl('h4', { text: t.settSecurity });
                securityDiv.createEl('p', { text: t.settSecurityDesc, cls: 'setting-item-description' });

                new Setting(securityDiv)
                        .setName(t.settAllowPlugins).setDesc(t.settAllowPluginsDesc)
                        .addToggle(toggle => toggle.setValue(this.plugin.settings.allowPlugins)
                                .onChange(v => { this.plugin.settings.allowPlugins = v; this.plugin.saveSettings(); }));

                new Setting(securityDiv)
                        .setName(t.settAllowSnippets).setDesc(t.settAllowSnippetsDesc)
                        .addToggle(toggle => toggle.setValue(this.plugin.settings.allowSnippets)
                                .onChange(v => { this.plugin.settings.allowSnippets = v; this.plugin.saveSettings(); }));

                // --- Language ---
                new Setting(containerEl)
                        .setName(t.settLanguage).setDesc(t.settLanguageDesc)
                        .addDropdown(dd => dd
                                .addOption('en', 'English')
                                .addOption('ru', 'Русский')
                                .setValue(this.plugin.settings.language)
                                .onChange(async v => {
                                        this.plugin.settings.language = v as Locale;
                                        i18n.setLocale(v as Locale);
                                        await this.plugin.saveSettingsImmediate();
                                        this.display(); // Refresh UI with new language
                                }));

                // --- [W4-T04] Auto-sync (планировщик) ---
                // Интервал авто-синхронизации + тумблер verboseNotices. Дефолт 'off'
                // (А5: авто-синк не включается без явного выбора пользователя).
                containerEl.createEl('h3', { text: t.settAutoSection });
                {
                        const currentInterval = this.plugin.settings.autoSyncInterval ?? 'off';
                        new Setting(containerEl)
                                .setName(t.settAutoInterval).setDesc(t.settAutoIntervalDesc)
                                .addDropdown(dd => dd
                                        .addOption('off', t.autoOff)
                                        .addOption('startup-only', t.autoStartupOnly)
                                        .addOption('15m', t.auto15m)
                                        .addOption('30m', t.auto30m)
                                        .addOption('1h', t.auto1h)
                                        .addOption('2h', t.auto2h)
                                        .setValue(currentInterval)
                                        .onChange(async v => {
                                                const interval = v as GitSyncSettings['autoSyncInterval'];
                                                // [overhaul v4 / Этап 5 / F3] Warning: auto-sync + full mirror.
                                                // mirror='full' + auto-sync — удаления local-only файлов
                                                // исполняются БЕЗ confirm-модалки (coordinator
                                                // trigger='auto' + level='full' = прямой execute).
                                                // Это рискованно — предупреждаем пользователя.
                                                if (interval !== 'off' && interval !== 'startup-only') {
                                                        const level = this.plugin.currentMirrorLevel();
                                                        if (level === 'full') {
                                                                new Notice(t.noticeAutoFullMirrorWarning, 15000);
                                                        }
                                                }
                                                this.plugin.settings.autoSyncInterval = interval;
                                                await this.plugin.saveSettingsImmediate();
                                                this.plugin.restartAutoSync();
                                        }));
                        new Setting(containerEl)
                                .setName(t.settVerboseNotices).setDesc(t.settVerboseNoticesDesc)
                                .addToggle(toggle => toggle.setValue(this.plugin.settings.verboseNotices ?? false)
                                        .onChange(async v => {
                                                this.plugin.settings.verboseNotices = v;
                                                await this.plugin.saveSettingsImmediate();
                                        }));
                }

                // ════════════════════════════════════════════════════════════════
                // 3. Диагностика (Diagnostics) — Sync Now + живые чипы из журнала
                // сессий (W2-T08 / В6=3) + ManifestCache + FailedQueue + Maintenance
                // (Scan/Force) + Auto-секция (W4 placeholder).
                // ════════════════════════════════════════════════════════════════
                containerEl.createEl('h3', { text: t.diag.sectionTitle });

                // --- Sync Now (CTA) ---
                new Setting(containerEl)
                        .setName(t.settSyncNow).setDesc(t.settSyncNowDesc)
                        .addButton(btn => btn.setButtonText(t.settSyncBtn).setCta()
                                .onClick(async () => { await this.plugin.syncNow(); }));

                // --- Чипы статистики (async: journal.load()) ---
                // [W2-T08 / В6=3] единый источник правды — журнал сессий; ManifestCache
                // даёт tracked-files count; FailedQueue — текущую failed-очередь.
                const entries = await this.plugin.journal.load();
                const summary = journalSummary(entries);
                const trackedCount = Object.keys(this.plugin.cache.entries()).length;
                const failedList = this.plugin.queue.all();
                const failedCount = failedList.length;

                const chipsDiv = containerEl.createDiv({ cls: 'git-sync-diag-chips' });

                // lastOutcome + lastTime (один чип-бейдж; класс по outcome для CSS).
                if (summary.lastOutcome !== null && summary.lastTime !== null) {
                        const outcomeText = summary.lastOutcome === 'ok' ? t.jrnl.outcomeOk
                                : summary.lastOutcome === 'cancelled' ? t.jrnl.outcomeCancelled
                                : t.jrnl.outcomeError;
                        const timeStr = new Date(summary.lastTime).toLocaleString();
                        chipsDiv.createEl('span', {
                                cls: `git-sync-chip git-sync-chip-outcome git-sync-chip-outcome-${summary.lastOutcome}`,
                                text: `${t.diag.lastOutcomeLabel}: ${outcomeText} · ${timeStr}`,
                        });
                } else {
                        // Журнал пуст → noLastSession (popover/jrnl общий ключ).
                        chipsDiv.createEl('span', { cls: 'git-sync-chip', text: t.pop.noLastSession });
                }

                chipsDiv.createEl('span', { cls: 'git-sync-chip', text: t.diag.sessionsTotal(summary.totalSessions) });

                // errors24h — кликабельный чип: toggle failed-списка ниже.
                const errorsChip = chipsDiv.createEl('span', {
                        cls: `git-sync-chip git-sync-chip-errors${summary.errors24h > 0 ? ' mod-warning' : ''}`,
                        text: t.diag.errors24h(summary.errors24h),
                });

                chipsDiv.createEl('span', {
                        cls: `git-sync-chip git-sync-chip-conflicts${summary.conflicts24h > 0 ? ' mod-warning' : ''}`,
                        text: t.diag.conflicts24h(summary.conflicts24h),
                });

                chipsDiv.createEl('span', { cls: 'git-sync-chip', text: t.diag.trackedFiles(trackedCount) });

                chipsDiv.createEl('span', {
                        cls: `git-sync-chip git-sync-chip-failed${failedCount > 0 ? ' mod-warning' : ''}`,
                        text: t.diag.failedQueue(failedCount),
                });

                // [overhaul v4 / Этап 5 / F2] Чип unresolved конфликт-копий —
                // считает .conflict-* файлы в vault (не в .trash/.archive).
                // Показывается только если > 0 (иначе визуальный шум).
                {
                        void this.plugin.countConflictCopies().then((conflictCount) => {
                                if (conflictCount > 0) {
                                        chipsDiv.createEl('span', {
                                                cls: `git-sync-chip git-sync-chip-conflicts-pending${conflictCount > 5 ? ' mod-warning' : ''}`,
                                                text: t.diag.unresolvedConflicts(conflictCount),
                                        });
                                }
                        });
                }

                // --- Failed-очередь (toggleable, разворачивается кликом по errors24h) ---
                if (failedCount > 0) {
                        const failedDiv = containerEl.createDiv({ cls: 'callout callout-warning git-sync-failed-panel' });
                        failedDiv.style.display = 'none'; // свёрнут по умолчанию (toggle по чипу)
                        failedDiv.createEl('b', { text: t.settFailedFiles(failedCount) });
                        const ul = failedDiv.createEl('ul', { cls: 'git-sync-failed-list' });
                        const displayLimit = Math.min(failedCount, 10); // топ-10 (бриф W2-T05)
                        for (const failed of failedList.slice(0, displayLimit)) {
                                const li = ul.createEl('li');
                                li.createEl('code', { text: failed.path });
                                const retryInfo = failed.retryCount > 0 ? ` (${failed.retryCount}x)` : '';
                                li.createSpan({ text: ` - ${failed.reason}${retryInfo}` });
                        }
                        if (failedCount > displayLimit) {
                                ul.createEl('li', { text: t.settFailedMore(failedCount - displayLimit) });
                        }
                        new Setting(failedDiv)
                                .addButton(btn => btn.setButtonText(t.settRetryBtn).setCta()
                                        .onClick(async () => { await this.plugin.retryFailedFiles(); this.display(); }))
                                .addButton(btn => btn.setButtonText(t.settClearQueueBtn).setWarning()
                                        .onClick(() => { this.plugin.clearFailedQueue(); this.display(); }));
                        errorsChip.style.cursor = 'pointer';
                        errorsChip.addEventListener('click', () => {
                                failedDiv.style.display = failedDiv.style.display === 'none' ? 'block' : 'none';
                        });
                        // diag.clearFailedQueue — отдельная кнопка-чип (быстрая очистка).
                        new Setting(containerEl)
                                .addButton(btn => btn.setButtonText(t.diag.clearFailedQueue).setWarning()
                                        .onClick(() => { this.plugin.clearFailedQueue(); this.display(); }));
                }

                // --- Open Journal ---
                // [W2-T05] main-агент добавит openJournalModal (W2-T08 JournalModalView
                // wiring). Пока — fallback Notice «журнал через popover» (W2-T03).
                new Setting(containerEl)
                        .addButton(btn => btn.setButtonText(t.diag.openJournal)
                                .onClick(() => {
                                        const anyPlugin = this.plugin as unknown as { openJournalModal?: () => void };
                                        if (typeof anyPlugin.openJournalModal === 'function') {
                                                anyPlugin.openJournalModal();
                                        } else {
                                                this.plugin.openJournalModal();
                                        }
                                }));

                // --- Maintenance: Scan Missing + Force Resync ---
                containerEl.createEl('h4', { text: t.settMaintenance });

                new Setting(containerEl)
                        .setName(t.settScanMissing).setDesc(t.settScanMissingDesc)
                        .addButton(btn => btn.setButtonText(t.settScanBtn)
                                .onClick(async () => { await this.plugin.scanAndRestoreMissing(); }));

                new Setting(containerEl)
                        .setName(t.settForceResync).setDesc(t.settForceResyncDesc)
                        .addButton(btn => btn.setButtonText(t.settForceResyncBtn).setWarning()
                                .onClick(async () => { await this.plugin.forceResync(); }));

                // --- Auto-sync (W4 placeholder; wiring — W4-T01) ---
                // [P1/M19] «Coming in v3.1» при живом авто-синке — ложь доверия:
                // показываем ФАКТИЧЕСКОЕ состояние планировщика (интервал из
                // настроек + «пауза», если активна).
                containerEl.createEl('h4', { text: t.diag.autoSection });
                {
                        const autoDiv = containerEl.createDiv({ cls: 'setting-item-description' });
                        const interval = this.plugin.settings.autoSyncInterval ?? 'off';
                        const intervalText = interval === 'off' ? t.autoOff
                                : interval === 'startup-only' ? t.autoStartupOnly
                                : interval === '15m' ? t.auto15m
                                : interval === '30m' ? t.auto30m
                                : interval === '1h' ? t.auto1h
                                : t.auto2h;
                        const paused = this.plugin.schedulerSnapshot()?.paused ?? false;
                        autoDiv.createEl('span', {
                                cls: paused ? 'mod-warning' : 'mod-muted',
                                text: `${intervalText}${paused ? ` · ${t.autoPausedState}` : ''}`,
                        });
                }

                // --- [W5-T01] Governance (fail-closed manager auth) ---
                // Статус-чип + кнопка ручного сброса (A4). Чип показывает текущий
                // статус; если managerEverActive=true — показываем предупреждение,
                // что синк fail-closed без менеджера. Кнопка сброса — warning,
                // требует подтверждения в модалке (влияние на безопасность).
                containerEl.createEl('h4', { text: t.settGovernanceSection });
                {
                        const gov = this.plugin.governance;
                        const govStatus = gov.status;
                        const statusText = govStatus === 'none' ? t.settGovernanceStatusNone
                                : govStatus === 'ok' ? t.settGovernanceStatusOk
                                : govStatus === 'blocked' ? t.settGovernanceStatusBlocked
                                : t.settGovernanceStatusChecking;
                        const statusCls = govStatus === 'blocked' ? ' mod-warning'
                                : govStatus === 'ok' ? ' mod-success'
                                : '';
                        const govDiv = containerEl.createDiv({ cls: 'setting-item' });
                        govDiv.createDiv({ cls: 'setting-item-info' })
                                .createDiv({ cls: 'setting-item-description' })
                                .createEl('span', {
                                        cls: `git-sync-chip git-sync-chip-governance${statusCls}`,
                                        text: statusText,
                                });
                        if (gov.managerEverActive) {
                                govDiv.createDiv({ cls: 'setting-item-description' })
                                        .createEl('span', { text: t.settGovernanceManagerActive, cls: 'mod-warning' });
                        }
                        if (gov.lastBlockedReason && govStatus === 'blocked') {
                                govDiv.createDiv({ cls: 'setting-item-description' })
                                        .createEl('span', { text: t.settGovernanceBlockedReason(gov.lastBlockedReason) });
                        }
                        if (gov.lastCheckedAt !== null) {
                                const timeStr = new Date(gov.lastCheckedAt).toLocaleString();
                                govDiv.createDiv({ cls: 'setting-item-description' })
                                        .createEl('span', { text: t.settGovernanceLastChecked(timeStr), cls: 'mod-muted' });
                        }
                        new Setting(containerEl)
                                .setName(t.settGovernanceResetBtn).setDesc(t.settGovernanceResetDesc)
                                .addButton(btn => btn.setButtonText(t.settGovernanceResetBtn).setWarning()
                                        .setDisabled(!gov.managerEverActive)
                                        .onClick(async () => {
                                                // A4: подтверждение через простой Modal с двумя кнопками
                                                // (не ConfirmModalView: тот требует typed-секции flow='force',
                                                // здесь — plain yes/no с warning-текстом).
                                                const confirmed = await showYesNoModal(
                                                        this.app,
                                                        t.settGovernanceResetConfirmTitle,
                                                        t.settGovernanceResetConfirmBody,
                                                        t.settGovernanceResetWarning,
                                                );
                                                if (!confirmed) return;
                                                await this.plugin.resetGovernanceState();
                                                new Notice(i18n.t.noticeGovernanceReset);
                                                this.display();
                                        }));
                        // [W5-T02] Disclaimer: warning-текст под кнопкой
                        containerEl.createDiv({ cls: 'setting-item-description' })
                                .createEl('span', { text: t.settGovernanceResetWarning, cls: 'mod-warning' });
                }

                // --- [VAM] Контроль доступа (vam-bridge/vam-guard) ---
                // Статус-чип (granted / blocked / pending + мягкий режим) +
                // причина блокировки + кнопка статусной модалки. Soft-mode
                // бэкдор (10 ЛКМ по телу модалки) живёт в самой модалке —
                // сессионный, в data.json не пишется.
                containerEl.createEl('h4', { text: t.vam.section });
                {
                        const vamGate = this.plugin.vam;
                        const softMode = this.plugin.vamSoftMode === true;
                        const granted = vamAllowsWork(this.plugin);
                        const pending = !granted && vamGate?.status === 'pending';
                        const chipText = granted
                                ? t.vam.chipGranted
                                : pending ? t.vam.chipPending : t.vam.chipBlocked;
                        const chipCls = granted ? ' mod-success' : (pending ? '' : ' mod-warning');
                        const vamDiv = containerEl.createDiv({ cls: 'setting-item' });
                        const vamInfo = vamDiv.createDiv({ cls: 'setting-item-info' });
                        vamInfo.createDiv({ cls: 'setting-item-description' })
                                .createEl('span', {
                                        cls: `git-sync-chip git-sync-chip-vam${chipCls}`,
                                        text: chipText + (softMode ? t.vam.chipSoftSuffix : ''),
                                });
                        if (!granted && !pending && vamGate?.reason) {
                                vamInfo.createDiv({ cls: 'setting-item-description' })
                                        .createEl('span', { text: t.vam.blockedReason(describeVamReason(vamGate.reason)) });
                        }
                        new Setting(containerEl)
                                .setName(t.vam.openStatusBtn)
                                .addButton(btn => btn.setButtonText(t.vam.openStatusBtn)
                                        .onClick(() => this.plugin.openVamStatusModal()));
                }
        }
}
