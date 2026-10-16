import { NodeHttpTransport, BufferedHostTransport } from './src/adapters/host-transport';
import { GoogleConnections } from './src/adapters/google-connections';
import { pickGoogleFolder } from './src/ui/gdrive-folder-picker';
import { DriveCoordinator } from './src/core/drive-coordinator';
import { DriveStateStore, driveRecoveryReferences, driveNamespace, driveLifecycleHistory, discoverDriveStates, type DriveResolution } from './src/core/drive-state';
import { localDirectoryBlocks } from './src/core/local-job-authority';
import { JobPolicy } from './src/core/job-policy';
import { JobBatch, awaitJobObservation, emptyStats, mergeJobStats, sharedJobFailure, accountedOutcome, type JobRunResult, type JobProjection } from './src/core/job-runtime';
import { verifyDriveRootAuthority } from './src/core/drive-job-authority';
import { validateManifest } from './src/core/source-validation';
import { GoogleDriveRoot } from './src/sources/gdrive-root';
import { GDriveOAuthSource } from './src/sources/gdrive-oauth-source';
import { effectiveBehavior } from './src/core/profile-policy';
import { sourceCandidates, sourcePathForDestination } from './src/core/source-bindings';
import { applyPolicy, isPolicyPathIncluded } from './src/core/policy';
import { isCovered } from './src/core/mirror';
import { AcknowledgedSave } from './src/core/acknowledged-save';
import { SyncFault, diagnosticText, syncIssue } from './src/core/sync-issue';
import type { SyncProgress } from './src/sources/types';
import { sessionLabel } from './src/ui/session-label';
import { connectionIssues, connectionValues } from './src/engines/connection-validation';
import { jobCards } from './src/ui/job-cards';
import { DriveLifecycleModal } from './src/ui/drive-lifecycle-modal';
import { RecoveryModal } from './src/ui/recovery-modal';
import { observeLocal } from './src/core/local-version';
import { ConflictAskModal } from './src/ui/conflict-modal';
import { validateSettings } from './src/engines/schema';
import { SyncWorkspaceModal } from './src/ui/sync-workspace-modal';
import { ProfileLibraryModal } from './src/ui/profile-library';
import { compileProfiles, migrateProfilePolicy, STANDARD_PROFILES, validateProfiles, validateProfileConnections, type SyncProfile, type SourceConnection } from './src/core/profiles';
import { RoutedSource, routedNamespace } from './src/sources/routed-source';
import { computeLocalPath } from './src/core/policy';
import { scanVaultTree } from './src/core/mirror';
import { validateFileRules, resolveFileRule, type FileRule } from './src/core/file-rules';
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
import { Scheduler, resolveSchedule, type AutoTickContext, type AutoTrigger, type SchedulerInterval, type SchedulerSnapshot } from './src/core/scheduler';
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
// Access status is informational; its UI cannot grant access.
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

type SyncState = 'idle' | 'syncing' | 'error' | 'offline' | 'conflicts' | 'unconfigured' | 'blocked';

interface GitSyncSettings {
        vaultPolicy?: SyncPolicy;
        profiles?: SyncProfile[];
        connections?: SourceConnection[];
        failedQueues?: Record<string, FailedFile[]>;
        maxPayloadMiB?:number;recoveryLimitMiB?:number;historyLimit?:number;
        sourceCircuits?:Record<string,{retryAt:number;failures:number}>;
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
        workspaceSyncApplied?: boolean;
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
        private attention?:'deletions'|'conflicts';
        private fileIndex=0;private fileTotal=0;private currentPath='';
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
                attention?:'deletions'|'conflicts';fileIndex?:number;fileTotal?:number;currentPath?:string;
        }) {
                if(options?.phase!==undefined&&options.phase!==this.pipelinePhase){this.bytesTransferred=0;this.totalBytes=0;}
                this.state = state;
                this.attention=options?.attention;
                if(options?.fileIndex!==undefined)this.fileIndex=options.fileIndex;
                if(options?.fileTotal!==undefined)this.fileTotal=options.fileTotal;
                if(options?.currentPath!==undefined)this.currentPath=options.currentPath;
                if(state!=='syncing'||(options?.phase!==undefined&&options.phase!==4)){this.fileIndex=0;this.fileTotal=0;this.currentPath='';}
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
                        attention:this.attention,
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
        private readonly writer: AcknowledgedSave<GitSyncSettings>;
        private debouncedSave: ReturnType<typeof debounce>;

        constructor(plugin: GitSyncPlugin) {
                this.plugin = plugin;
                this.writer = new AcknowledgedSave(snapshot => plugin.saveData(snapshot));
                this.debouncedSave = debounce(() => {void this.doSave().catch(error=>{const message=diagnosticText(error);console.error('[VaultSync] settings save failed',message);new Notice((i18n.getLocale()==='ru'?'Настройки не сохранены: ':'Settings were not saved: ')+message,10000);});}, DEBOUNCE_MS);
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
                await this.writer.save(this.plugin.settings);
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
        signal?:AbortSignal,
): Promise<boolean> {
        if(signal?.aborted)return false;
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
        const abort=()=>modal.close();
        signal?.addEventListener('abort',abort,{once:true});
        modal.onClose = () => {signal?.removeEventListener('abort',abort);view.close();};
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
        private mutations!: DurableMutations;
        private lastBlockReason?: string;
        private requestedSources?: string[];
        private currentTrigger: 'manual'|'auto'|'retry'|'scan'|'force'='manual';
        private sessionOwned = false;
        private sessionController?: AbortController;
        private statusModal?: Modal;
        private builtEngineConfigKey = '';
        private configurationEpoch = 0;
        private configurationKey = '';
        private preparedConfigRevision = 0;
        private proposedLastSync?:number;
        private combinedSession=false;
        private activeJobRunner?:Coordinator;
        private jobRuns:JobRunResult[]=[];
        private jobSubscribers=new Set<()=>void>();
        private autoJobBlocks=new Map<string,string>();
        private autoReady=false;private unloading=false;
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
        // Deprecated integration flag; ignored by access checks and UI.
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
        private sessionProgress?:SyncProgress;
        private hostTransportLimit=0;
        private googleConnections?:GoogleConnections;
        private autoPaused=false;
        private autoBlockedReason?:string;
        private hostTransport?:import('./src/sources/types').NetTransport;
        private autoSchedulers=new Map<string,Scheduler>();

        // [W1-T03/BUG-17] возврат сети больше не затирает error слепым 'idle':
        // при непустой failed-очереди показываем 'error' + pendingCount.
        // queue создаётся в buildEngine() позже onload — отсюда optional-chaining.
        private onlineHandler = () => {
                this.wakeAutoSync();
                if(this.sessionOwned||this.coordinator?.isRunning())return;
                const r = reconnectStatus(this.queue?.size() ?? 0);
                this.statusBar.setState(r.state, r.state === 'error' ? { pendingCount: r.pendingCount } : undefined);
        };
        private offlineHandler = () => {if(!this.sessionOwned&&!this.coordinator?.isRunning())this.statusBar.setState('offline');};
        private focusHandler = () => {
                this.statusBar.setLastSync(this.settings.lastSyncTime);
                this.statusBar.refresh();this.wakeAutoSync();this.popoverView?.update(this.snapshotPopoverState());
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
                this.addCommand({id:'cloud-sync-workspace',name:i18n.getLocale()==='ru'?'Открыть рабочее окно синхронизации':'Open sync workspace',callback:()=>this.openVaultTreeModal()});
                this.addCommand({id:'cloud-sync-drive-inbox',name:i18n.getLocale()==='ru'?'Drive: неизвестные состояния и удаления':'Drive: unknown states and deletions',callback:()=>this.openDriveInboxModal()});
                this.addCommand({id:'cloud-sync-recovery',name:i18n.getLocale()==='ru'?'Восстановительные копии':'Recovery copies',callback:()=>this.openRecoveryModal()});
                this.addCommand({ id: 'cloud-sync-retry-failed', name: i18n.t.cmdRetryFailed, callback: () => this.retryFailedFiles() });
                this.addCommand({ id: 'cloud-sync-force-reset', name: i18n.t.cmdForceReset, callback: () => this.forceResync() });
                this.addCommand({
                        id: 'cloud-sync-cancel', name: i18n.t.cmdCancelSync,
                        checkCallback: (checking) => {
                                if (checking) return Boolean(this.sessionController) || (this.coordinator?.isRunning() ?? false);
                                if (this.sessionController || this.coordinator?.isRunning()) this.cancelSync();
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
                this.app.workspace.onLayoutReady(()=>{if(this.unloading)return;this.autoReady=true;this.startAutoSync();this.notifyVaultSync();});

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
                        this.statusBar.refresh();this.popoverView?.update(this.snapshotPopoverState());
                }, 1000));

                window.addEventListener('online', this.onlineHandler);
                window.addEventListener('offline', this.offlineHandler);
                window.addEventListener('focus', this.focusHandler);
        }

        onunload() {
                this.unloading=true;this.activeJobRunner?.cancel();this.jobSubscribers?.clear();
                removePluginCss();
                this.sessionController?.abort();
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
                for(const scheduler of this.autoSchedulers.values())scheduler.stop();
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
                this.googleConnections?.disconnect();
                void this.persistEngineState('checkpoint').catch(error=>console.error('[vault-sync] unload checkpoint failed',diagnosticText(error)));
        }

        /**
         * [W2-T02] Клик по статус-бару: «дом синхронизации» (popover, В4).
         * [BUG-7] ID вкладки настроек — из manifest.id: хардкод
         * 'obsidian-git-sync' ломался при любом переименовании/форке плагина.
         */
        private openStatusPopover(): void {
                if (this.statusModal) { this.popoverView?.update(this.snapshotPopoverState()); return; }
                const openPluginSettings = () => {
                        // @ts-ignore
                        (this.app as any).setting.open();
                        // @ts-ignore
                        (this.app as any).setting.openTabById(this.manifest.id);
                };
                // [W2-T03 wiring] popover в обёртке Modal (v3.0 interim: будущий
                // polish — позиционированная плавающая панель у статус-бара;
                // пока — работает везде, включая мобильные).
                const modal = new Modal(this.app); this.statusModal = modal;
                modal.titleEl.setText(i18n.t.pop.title);
                this.popoverView = new SyncPopoverView({
                        contentEl: modal.contentEl,
                        lastEntry: null,
                        state: this.snapshotPopoverState(),
                        onSync: () => { modal.close(); void this.syncNow(); },
                        onCancel: () => { this.cancelSync(); },
                        onRetry: paths => { modal.close(); void this.retryFailedFiles('manual',paths); },
                        onExportDiagnostics:()=>void this.exportSyncDiagnostics(),
                        onPauseAuto: () => this.pauseAutoSync(),
                        onOpenJournal: () => { modal.close(); this.openJournalModal(); },
                        onOpenSettings: () => { modal.close(); openPluginSettings(); },
                        onOpenWorkspace:()=>{modal.close();this.openVaultTreeModal();},
                        onRecovery:()=>{modal.close();this.openRecoveryModal();},
                        onClose: () => modal.close(),
                        formatTime: (ms: number) => new Date(ms).toLocaleString(),
                        formatBytes,
                });
                this.popoverView.render();
                modal.onClose = () => { if (this.statusModal === modal) { this.popoverView = undefined; this.statusModal = undefined; } };
                trackModal(modal); // [overhaul S3/M-18]
                modal.open();
                void this.journal.load().then((entries) => {
                        const last = entries[0] ?? null;
                        if (this.statusModal === modal && this.popoverView) {
                                this.popoverView.setLastEntry(last);
                                this.popoverView.update(this.snapshotPopoverState());
                        }
                });
        }

        /** [W2-T03 wiring] снимок состояния StatusBar → PopoverState. */
        private snapshotPopoverState(): PopoverState {
                const sb = this.statusBar as unknown as {
                        state: string; pendingCount: number;
                        bytesTransferred: number; totalBytes: number; pipelinePhase: number;attention?:'deletions'|'conflicts';fileIndex:number;fileTotal:number;currentPath:string;
                };
                const status = sb.state as PopoverState['status'];
                const pending = sb.pendingCount ?? 0;
                return {
                        status,
                        mirrorLevel: this.currentMirrorLevel(),
                        profilesMode:Boolean(this.settings.profiles?.length),
                        attention:sb.attention,fileIndex:sb.fileIndex,fileTotal:sb.fileTotal,currentPath:sb.currentPath,
                        blockedReason:status==='blocked'?this.lastBlockReason:undefined,
                        pendingErrorCount:this.queue.all().length,
                        ...(status==='syncing'?this.sessionProgress:{}),
                        conflictsCount: status === 'conflicts' ? pending : 0,
                        // [P2/3.2] живая фаза конвейера из setStatus-потока Coordinator
                        // (раньше хардкод -1 — полоса была декоративной, бэклог 3.2).
                        phase: status === 'syncing' ? (sb.pipelinePhase ?? -1) : -1,
                        bytesTransferred: sb.bytesTransferred ?? 0,
                        totalBytes: sb.totalBytes ?? 0,
                        lastSyncTime: this.settings.lastSyncTime || null,
                        // [W4-T04] снимок планировщика для popover-индикатора.
                        scheduler: this.schedulerSnapshot(),jobs:this.automaticJobSnapshots(),
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
                if(this.settings.onboarded)return;
                const modal=new Modal(this.app),ru=i18n.getLocale()==='ru';
                modal.contentEl.createEl('h2',{text:ru?'Настройте синхронизацию':'Set up synchronization'});
                modal.contentEl.createEl('p',{text:ru?'Файлы загружаются из источников в этот vault. Добавьте подключение, выберите область и профиль поведения в рабочем окне. Запускайте синхронизацию кнопкой или задайте расписание для источников.':'Files are downloaded from sources into this vault. Add a connection, choose its scope and behaviour in the workspace. Run synchronization with the button or choose a schedule for each source.'});
                new Setting(modal.contentEl).addButton(button=>button.setButtonText(ru?'Настроить':'Set up').setCta().onClick(()=>{modal.close();this.openVaultTreeModal();}))
                        .addButton(button=>button.setButtonText(ru?'Позже':'Later').onClick(()=>modal.close()));
                trackModal(modal);modal.open();
        }

        async saveSettings() { this.settingsManager.queueSave(); }
        async saveSettingsImmediate() { await this.settingsManager.saveImmediate();this.autoBlockedReason=undefined; }

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
                        pending:{
                                read:async()=>await this.app.vault.adapter.exists(journalPath+'.pending')?this.app.vault.adapter.read(journalPath+'.pending'):null,
                                write:async raw=>{await this.app.vault.adapter.write(journalPath+'.pending',raw);},
                        },
                        read: async () => (await this.app.vault.adapter.exists(journalPath))?this.app.vault.adapter.read(journalPath):null,
                        quarantine:async raw=>{const path=journalPath+'.corrupt-'+crypto.randomUUID();await this.app.vault.adapter.write(path,raw);if(await this.app.vault.adapter.read(path)!==raw)throw Error('Diagnostic backup verification failed');},
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
                                askConflict: (info,signal) => this.serializeAsk(() => {
                                        const m = new ConflictAskModal(this.app, info);
                                        trackModal(m);
                                        return m.wait(signal);
                                },signal),
                        },
                        // [overhaul v4 / Этап 3] light-стратегия из настроек.
                        lightStrategy: this.settings.lightConflictStrategy ?? 'keep-local',
                });

                this.mutations = new DurableMutations(new OperationStore(this.fsAdapter),new RecoveryStore(this.makeVaultAdapter(),this.recoveryDirectory()),this.makeVaultAdapter());
                const pluginForLimits=this;
                this.coordinator = new Coordinator({
                        mutations: this.mutations,
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
                                success: (dl, del, conf, dur) => this.combinedSession?'':i18n.t.noticeSuccess(dl, del, conf, dur),
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
                                get maxFileSizeBytes(){return pluginForLimits.maxPayloadBytes();},get bufferBudgetBytes(){return pluginForLimits.maxPayloadBytes()*4;},
                                sourceCircuits:()=>this.settings.sourceCircuits??= {},
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
                private maxPayloadBytes():number {
                        const configured=this.settings.maxPayloadMiB;
                        return (Platform.isDesktopApp&&Number.isFinite(configured)&&configured!>=4&&configured!<=256?configured!:Platform.isDesktopApp?64:16)*1024*1024;
                }
                private networkTransport(kind:string):import('./src/sources/types').NetTransport {
                        if(!Platform.isDesktopApp&&kind==='webdav')return new FetchTransport({timeoutMs:REQUEST_TIMEOUT_MS,bodyTimeoutMs:REQUEST_TIMEOUT_MS});
                        const limit=this.maxPayloadBytes();
                        if(!this.hostTransport||this.hostTransportLimit!==limit){this.hostTransportLimit=limit;this.hostTransport=Platform.isDesktopApp?
                                new NodeHttpTransport({timeoutMs:REQUEST_TIMEOUT_MS,idleTimeoutMs:REQUEST_TIMEOUT_MS,maxBytes:limit}):new BufferedHostTransport(requestUrl,{maxBytes:limit});}
                        return this.hostTransport;
                }

                private googleService():GoogleConnections {
                        if(!this.googleConnections)this.googleConnections=new GoogleConnections({
                                transport:()=>this.networkTransport('gdrive'),
                                secrets:()=>{if(!Platform.isDesktopApp||!this.app.secretStorage)throw Error('Google OAuth requires Obsidian desktop with SecretStorage (1.11.4+)');return this.app.secretStorage;},
                                guard:()=>{if(!Platform.isDesktopApp||!this.app.secretStorage)throw Error('Google OAuth requires Obsidian desktop with SecretStorage (1.11.4+)');if(!this.assertNetworkAllowed())throw Error('Source access blocked');},
                                connections:()=>this.settings.connections??[],maxBytes:()=>this.maxPayloadBytes(),
                                openBrowser:url=>require('electron').shell.openExternal(url),
                                pick:(client,signal)=>pickGoogleFolder(this.app,client,signal),
                        });return this.googleConnections;
                }

                private engineCtx(kind = this.builtKind): EngineCtx {
                        const t = i18n.t;
                        if (kind === 'git') {
                                return {transport:this.networkTransport(kind),
                                        messages: {
                                                unsupportedBranches: () => i18n.getLocale()==='ru'?'Синхронизация всех веток не поддерживается. Укажите одну ветку или оставьте поле пустым для ветки репозитория по умолчанию.':'All-branches sync is unsupported. Enter one branch or leave it empty for the repository default.',
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
                                        transport: this.networkTransport(kind),
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
                                        googleTransport:values=>this.googleService().transport(values),maxPayloadBytes:this.maxPayloadBytes(),
                                        transport: this.networkTransport(kind),
                                        onRateLimitWait: (waitMs: number) => {
                                                new Notice(t.noticeRateLimitedCloud(Math.ceil(waitMs / 1000)), 10000);
                                        },
                                        messages: {
                                                folderRequired: () => i18n.getLocale()==='ru'?'Укажите ID публичной папки Drive. API-ключ не предоставляет доступ к личному диску.':'Specify a public Drive folder ID. An API key does not grant access to your private Drive.',
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
                                        transport: this.networkTransport(kind),
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
                                // TTL bounds resource retention; every new manifest obtains a fresh archive.
                                zipSessionTtlMs: 0,
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
                if(this.settings.vaultPolicy){
                        try{
                                const policy=compileProfiles(this.settings.vaultPolicy,this.settings.profiles??[]),rules=policy.fileRules??[];
                                const required=new Set(rules.flatMap(rule=>rule.source?[rule.source]:[]));
                                if(policy.defaultSource&&!rules.some(rule=>rule.scope==='vault'&&!rule.names&&rule.source))required.add(policy.defaultSource);
                                const running=this.sessionOwned?this.coordinator?.getCurrentSource().sources:undefined;
                                const ids=running?.length?running.map(source=>source.id):[...required];
                                return ids.length>0&&ids.some(id=>{const connection=this.settings.connections?.find(c=>c.id===id);if(!connection)return false;
                                        return connectionIssues(connection).length===0;
                                });
                        }catch{return false;}
                }
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
                                        download:async(url,opts)=>{
                                                const configured=(this.settings.mobileArchiveWarnBytes??200)*1024*1024;
                                                const limit=Math.min(configured>0?configured:32*1024*1024,32*1024*1024);
                                                const transport=new BufferedHostTransport(requestUrl,{maxBytes:limit});
                                                const head=await transport.fetch(url,{method:'HEAD',signal:opts.signal});
                                                const size=Number(head.headers['content-length']);
                                                if(!Number.isSafeInteger(size)||size<=0)throw new SyncFault('mobile-archive-size','Mobile archive download requires a known Content-Length; use desktop for this link','source');
                                                if(size>limit)throw new SyncFault('file-too-large',i18n.t.errMobileArchiveTooLarge(formatBytes(size),limit/1024/1024),'source');
                                                opts.onProgress?.({bytesTransferred:0,totalBytes:size,capability:'buffered'});
                                                const res=await transport.fetch(url,{signal:opts.signal,maxBytes:limit});
                                                if(res.status!==200)throw new SyncFault('archive-http',`Archive download HTTP ${res.status}`,'source');
                                                const data=await res.arrayBuffer();opts.signal?.throwIfAborted();opts.onProgress?.({bytesTransferred:data.byteLength,totalBytes:size,capability:'buffered'});
                                                return new BufferArchiveReader(data);
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
                const keep = new Set([currentSourceId,...Object.entries(this.settings.failedQueues ?? {}).filter(([,files])=>files.length>0).map(([id])=>id)]);
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
                const config = JSON.stringify({maxPayload:this.settings.maxPayloadMiB,recoveryBudget:this.settings.recoveryLimitMiB,historyBudget:this.settings.historyLimit, profiles:this.settings.profiles, connections:this.settings.connections, kind, values: this.engineValues(kind), mirror: this.currentMirrorLevel(),
                        policy: this.settings.vaultPolicy ?? this.settings.syncPolicies?.[this.makeSourceId(kind)], syncMode: this.settings.syncMode,
                        allowed: this.settings.allowedFolders, ignored: this.settings.ignoredFolders,
                        plugins: this.settings.allowPlugins, snippets: this.settings.allowSnippets,
                        conflict: this.settings.conflictStrategy, light: this.settings.lightConflictStrategy, trash: this.settings.useTrash });
                if (config !== this.configurationKey) { this.configurationKey = config; this.configurationEpoch++; }
                return this.configurationEpoch;
        }

        async ensureProfileSettings(): Promise<void> {
                const previous = structuredClone({profiles:this.settings.profiles,connections:this.settings.connections,
                        syncPolicies:this.settings.syncPolicies,vaultPolicy:this.settings.vaultPolicy,mirrorLevel:this.settings.mirrorLevel,workspaceSyncApplied:this.settings.workspaceSyncApplied});
                try {
                const before = JSON.stringify([this.settings.profiles, this.settings.syncPolicies,this.settings.vaultPolicy,this.settings.connections,this.settings.workspaceSyncApplied]);
                const profiles = this.settings.profiles ??= structuredClone([...STANDARD_PROFILES]);
                for(const builtin of STANDARD_PROFILES)if(!profiles.some(p=>p.id===builtin.id))profiles.push(structuredClone(builtin));
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
                        const configured=isSourceConfigured(this.desiredSourceKind(),{repoUrl:'',accessToken:'',vaultUrl:'',...this.engineValues(this.desiredSourceKind())});
                        const referenced=profiles.some(p=>p.source==='primary')||policies[id].assignments?.some(a=>a.source==='primary');
                        if((configured||referenced)&&!this.settings.connections.some(c=>c.id===connectionId))this.settings.connections.push({
                                id:connectionId,name:i18n.getLocale()==='ru'?'Основной источник':'Default source',
                                kind:this.desiredSourceKind(),values:this.engineValues(this.desiredSourceKind())});
                        this.settings.vaultPolicy=structuredClone(policies[id]);
                        this.settings.vaultPolicy.defaultSource=configured?connectionId:undefined;
                        for(const profile of profiles)if(profile.source==='primary')profile.source=connectionId;
                        for(const assignment of this.settings.vaultPolicy.assignments ?? [])if(assignment.source==='primary')assignment.source=connectionId;
                }
                for(const policy of [...Object.values(policies),this.settings.vaultPolicy])for(const assignment of policy.assignments??[]){
                    const inherited=profiles.find(profile=>profile.id===assignment.profileId)?.source;
                    if(!assignment.source&&inherited)assignment.source=inherited;
                }
                for(const profile of profiles)delete profile.source;
                validateProfiles(profiles,this.settings.connections);
                if(!this.settings.workspaceSyncApplied && this.settings.workspaceSync===false){
                        this.settings.vaultPolicy.fileExclusions??=[];
                        for(const pattern of ['workspace.json','workspace-mobile.json'])if(!this.settings.vaultPolicy.fileExclusions.some(e=>e.pattern===pattern&&e.scope==='.obsidian'))this.settings.vaultPolicy.fileExclusions.push({pattern,scope:'.obsidian',note:'Workspace layout is device-specific'});
                }
                this.settings.workspaceSyncApplied=true;
                compileProfiles(this.settings.vaultPolicy,profiles);
                const legacyLevel=this.settings.mirrorLevel;this.settings.mirrorLevel='fetch';
                if (legacyLevel!=='fetch' || before !== JSON.stringify([profiles,policies,this.settings.vaultPolicy,this.settings.connections,this.settings.workspaceSyncApplied])) await this.saveSettingsImmediate();
                } catch(e) { Object.assign(this.settings,previous); throw e; }
        }

        private effectiveProfilePolicy(id: string): SyncPolicy {
                const policy = this.settings.vaultPolicy ?? this.settings.syncPolicies?.[id] ?? {version:1 as const,mirror:false,folders:[]};
                return compileProfiles(policy, this.settings.profiles ?? []);
        }

        private async routingContext(preview = false, selectedIds?: readonly string[]): Promise<{source:RoutedSource; namespace:string}> {
                const kind = this.desiredSourceKind(), id = this.makeSourceId(kind);
                const policy = this.effectiveProfilePolicy(id), rules = policy.fileRules ?? [];
                validateProfiles(this.settings.profiles ?? [], this.settings.connections ?? []);
                const defaultSource=policy.defaultSource ?? (this.settings.vaultPolicy?'unassigned':'primary');
                const needed = new Set(rules.flatMap(r => r.source ? [r.source] : []));
                const all=this.settings.connections ?? [];
                const usesDefault=!rules.some(r=>r.scope==='vault'&&!r.names&&r.source);
                const descriptors = all.filter(c=>preview || needed.has(c.id) || (usesDefault&&c.id===defaultSource));
                if(defaultSource==='primary')descriptors.unshift({id:'primary',name:'Default source',kind,values:this.engineValues(kind)});
                const configured=(c:SourceConnection)=>connectionIssues(c).length===0;
                if(selectedIds?.some(id=>!descriptors.some(c=>c.id===id)))throw Error(i18n.getLocale()==='ru'?'Выбранному источнику не назначены области. Настройте их в дереве.':'Selected source has no assigned scope. Assign it in the tree.');
                for(const id of needed)if(!descriptors.some(c=>c.id===id))throw Error('Missing assigned source; ownership configuration needs repair');
                const active=descriptors.sort((a,b)=>Number(b.id===defaultSource)-Number(a.id===defaultSource));
                if(!active.length)throw Error(i18n.getLocale()==='ru'?'Не выбран источник синхронизации. Откройте «Подключения → Источник для хранилища» и выберите подключение либо назначьте его папке в дереве.':'No sync source selected. Open Connections → Vault source and select a connection, or assign one to a folder in the tree.');
                const identity = active.map(c=>({id:c.id,kind:c.kind,values:Object.fromEntries(
                        [...EngineRegistry.get(c.kind).settingsSchema.filter(f=>f.type!=='secret' && !f.secret).map(f=>[f.key,c.values[f.key]]),...(c.kind==='gdrive'?[['authMode',c.values.authMode],['accountSub',c.values.accountSub]]:[])])}));
                const namespace = this.settings.vaultPolicy ? await routedNamespace({defaultSource,connections:identity},rules,policy.folders) : needed.size ? await routedNamespace(identity,rules,policy.folders) : id;
                const mapped = (path:string) => {
                        const r=[...policy.folders].filter(r=>r.target && (path===r.path || !r.path || path.startsWith(r.path+'/')))
                                .sort((a,b)=>b.path.length-a.path.length)[0];
                        return r ? computeLocalPath(path,r.path,r) : path;
                };
                const members=active.map(c=>({id:c.id,name:c.name,source:selectedIds&&!selectedIds.includes(c.id)?
                        {kind:c.kind,getManifest:async()=>{throw Error('Source outside this run');},fetch:async()=>{throw Error('Source outside this run');}}:
                        (()=>{try{if(!configured(c))throw new SyncFault('source-unavailable',`Source ${c.name} is not configured`,'source');return EngineRegistry.create(c.kind,structuredClone(c.values),this.engineCtx(c.kind));}
                            catch(error){return {kind:c.kind,getManifest:async()=>{throw error;},fetch:async()=>{throw error;}};}})()}));
                return {source:new RoutedSource(members,structuredClone(rules),mapped,defaultSource,selectedIds),namespace};
        }

        /** Свежесть движка перед сессией: политика, стратегия, источник, sourceId. */
        private async prepareSession(selectedIds?: readonly string[]): Promise<void> {
                this.mutations?.recovery.setLimit((this.settings.recoveryLimitMiB??512)*1024*1024);this.mutations?.store.setLimit(this.settings.historyLimit??10000);
                if (this.coordinator.isRunning()) return;
                this.sessionController?.signal.throwIfAborted();
                await this.ensureProfileSettings();
                this.sessionController?.signal.throwIfAborted();
                const preparingRevision = this.getConfigurationRevision();
                const kind = this.desiredSourceKind(), sourceId = this.makeSourceId(kind);
                const {source,namespace} = await this.routingContext(false,selectedIds);
                const nextCache=namespace===this.cache.namespace ? this.cache : new ManifestCache(this.fsAdapter,namespace);
                try {
                        if(nextCache!==this.cache) await nextCache.load();
                        this.sessionController?.signal.throwIfAborted();
                        if(preparingRevision!==this.getConfigurationRevision()) throw new SyncFault('configuration-changed','Configuration changed while preparing sync','session',false,'job');
                } catch(e) { await source.dispose(); throw e; }
                await this.coordinator.setSource(source);
                if (nextCache !== this.cache) {
                        const queues=this.settings.failedQueues ??= {};
                        queues[this.cache.namespace]=this.queue.all();
                        this.queue.clear(); this.queue.mergeBack(queues[namespace] ?? []);
                        this.cache=nextCache;this.coordinator.setCache(this.cache);
                }
                this.builtKind=source.kind;this.builtSourceId=sourceId;
                const compiled=this.effectiveProfilePolicy(sourceId);
                const runIds=selectedIds??source.sources?.map(connection=>connection.id);
                this.coordinator.setPolicy(runIds?this.makePolicy().forSources(runIds,compiled.defaultSource,compiled.fileRules??[],compiled.folders,['pull']):this.makePolicy());
                this.conflictResolver.setStrategy(this.settings.conflictStrategy);
                this.conflictResolver.setLightStrategy(this.settings.lightConflictStrategy ?? 'keep-local');
                this.coordinator.setSyncPolicy(this.effectiveProfilePolicy(sourceId));
                if (preparingRevision !== this.getConfigurationRevision()) throw new SyncFault('configuration-changed','Configuration changed while preparing sync','session',false,'job');
                await gcManifestCaches(this.fsAdapter,this.gcKeepSet(this.cache.namespace));
                this.preparedConfigRevision=preparingRevision;
                this.sessionController?.signal.throwIfAborted();
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
                        const revision=this.getConfigurationRevision();const google=this.googleService().actions();
                        const modal=new ProfileLibraryModal(this.app,this.settings.profiles ?? [],this.settings.connections ?? [],async(profiles,connections,defaultSource)=>{
                                if(revision!==this.getConfigurationRevision())throw new Error('Settings changed; reopen the profile library');
                                validateProfiles(profiles,connections);
                                for(const policy of this.settings.vaultPolicy?[{...this.settings.vaultPolicy,defaultSource}]:Object.values(this.settings.syncPolicies ?? {}))validateProfileConnections(policy,profiles,connections);
                                if(this.settings.vaultPolicy){
                                        const compiled=compileProfiles({...this.settings.vaultPolicy,defaultSource},profiles);
                                        for(const id of [compiled.defaultSource,...(compiled.fileRules??[]).map(r=>r.source)])if(id&&!connections.some(c=>c.id===id))throw Error('Connection is used by a vault assignment');
                                }
                                const oldProfiles=this.settings.profiles,oldConnections=this.settings.connections,oldPolicy=this.settings.vaultPolicy;
                                this.settings.profiles=profiles;this.settings.connections=connections;
                                if(oldPolicy)this.settings.vaultPolicy={...oldPolicy,defaultSource};
                                try{await this.saveSettingsImmediate();this.restartAutoSync();}catch(e){this.settings.profiles=oldProfiles;this.settings.connections=oldConnections;this.settings.vaultPolicy=oldPolicy;throw e;}
                        },sources,this.settings.vaultPolicy?.defaultSource,this.settings.vaultPolicy,false,google);trackModal(modal);modal.open();
                }).catch(e=>new Notice(String(e)));
        }

        /** [POLICY Phase 3] Модалка структуры-политики: дерево local+remote, чекбоксы, rename/move. */
        openVaultTreeModal(): void {
                void this.openProfileTree().catch(e=>new Notice(String(e)));
        }

        private async openProfileTree(): Promise<void> {
                await this.ensureProfileSettings();
                let revision=this.getConfigurationRevision();const abort=new AbortController();const google=this.googleService().actions();
                const modal=new SyncWorkspaceModal(this.app,{
                        policy:this.settings.vaultPolicy!,profiles:this.settings.profiles ?? [],connections:this.settings.connections ?? [],google,
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
                                try{return source.getBrowseSnapshot?await source.getBrowseSnapshot(signal):await source.getManifest(signal);}finally{await source.dispose?.();}
                        },
                        check:(connection,signal)=>this.checkSourceConnection(connection,signal),
                        checkDownload:(connection,signal)=>this.checkSourceConnection(connection,signal,true),
                        run:ids=>this.syncNow(ids),
                        recovery:()=>this.openRecoveryModal(),jobs:()=>this.automaticJobSnapshots(),subscribeJobs:listener=>this.subscribeJobs(listener),
                        dispose:()=>{abort.abort();google.releaseDraft?.();},
                        save:async(policy,connections,profiles=this.settings.profiles??[])=>{
                                if(revision!==this.getConfigurationRevision()||this.sessionOwned||this.coordinator?.isRunning())throw Error('Settings changed or sync started; reopen the tree');
                                validateProfiles(profiles,connections);validateProfileConnections(policy,profiles,connections);
                                const compiled=compileProfiles(policy,profiles);
                                for(const source of [policy.defaultSource,...(compiled.fileRules ?? []).map(r=>r.source)])if(source&&!connections.some(c=>c.id===source))throw Error('Missing source connection');
                                const previous={vaultPolicy:this.settings.vaultPolicy,connections:this.settings.connections,profiles:this.settings.profiles,onboarded:this.settings.onboarded};
                                this.settings.vaultPolicy=structuredClone(policy);this.settings.connections=structuredClone(connections);this.settings.profiles=structuredClone(profiles);this.settings.onboarded=true;
                                try{await this.saveSettingsImmediate();revision=this.getConfigurationRevision();this.restartAutoSync();this.statusBar.setState(this.isConfiguredForSource()?'idle':'unconfigured');}catch(e){Object.assign(this.settings,previous);throw e;}
                        },
                });trackModal(modal);modal.open();
        }

        private async executeSync(mode:'manual'|'auto'|'retry'|'force'|'scan'='manual',paths?:readonly string[],autoRetry=false,driveControl?:{namespace:string;resolution?:DriveResolution},automaticTrigger?:AutoTrigger):Promise<import('./src/sources/types').SyncStats|null> {
                const source=this.coordinator.getCurrentSource();
                if(driveControl||!(source instanceof RoutedSource))return this.executeLegacySync(mode,paths,autoRetry,driveControl);
                const started=Date.now(),signal=this.sessionController!.signal,guard=()=>{signal.throwIfAborted();if(this.preparedConfigRevision!==this.getConfigurationRevision())throw new SyncFault('configuration-changed','Settings changed during synchronization','session');};
                guard();const compiled=this.effectiveProfilePolicy(this.builtSourceId),rules=compiled.fileRules??[],defaultSource=compiled.defaultSource??(this.settings.vaultPolicy?'unassigned':'primary'),basePolicy=this.makePolicy(),vault=this.makeVaultAdapter();
                validateProfileConnections(this.settings.vaultPolicy??compiled,this.settings.profiles??[],this.settings.connections??[]);
                try{await this.mutations.store.load();}catch(error){throw new SyncFault('operation-journal',`Shared mutation state is unreadable: ${diagnosticText(error)}`,'session');}
                let stores:DriveStateStore[];try{stores=await discoverDriveStates(this.fsAdapter);}catch(error){throw new SyncFault('authority-corrupt',`Retained Drive ownership cannot be read: ${diagnosticText(error)}`,'session');}
                const authority=new JobPolicy(compiled,defaultSource,JobPolicy.history(stores)),stateByNamespace=new Map(stores.map(store=>[store.namespace,store]));
                const members=source.executionMembers(),byId=new Map(members.map(member=>[member.id,member])),aggregate=emptyStats();this.combinedSession=true;
                const pullQuestions:{id:string;runner:Coordinator;paths:string[]}[]=[],driveQuestions:{id:string;driver:DriveCoordinator;paths:string[]}[]=[];
                const observedSignals=new Map(members.filter(member=>authority.bidirectionalOwners.has(member.id)).map(member=>{let complete!:()=>void;const promise=new Promise<void>(resolve=>complete=resolve);return [member.id,{promise,complete}] as const;}));
                const observedRoots=new Map<string,import('./src/sources/gdrive-client').DriveFile>();
                const batch=new JobBatch(signal,guard,states=>{this.publishJobs(states);this.popoverView?.update(this.snapshotPopoverState());},{observed:job=>observedSignals.get(job.id)?.complete()});
                const map=(path:string)=>{const folder=compiled.folders.filter(folder=>folder.target&&(!folder.path||path===folder.path||path.startsWith(folder.path+'/'))).sort((a,b)=>b.path.length-a.path.length)[0];return folder?computeLocalPath(path,folder.path,folder):path;};
                type Observation={view:RoutedSource;state?:DriveStateStore;remoteBlock?:import('./src/sources/types').SyncIssue;localBlocks?:import('./src/core/path-policy').PathBlock[]};
                const results=await batch.run<Observation>(members.map(member=>({id:member.id,name:member.name,kind:member.source.kind})),async(job,observeSignal)=>{
                        const member=byId.get(job.id)!;
                        try{const entries=await member.source.getManifest(observeSignal,event=>this.makeSyncUI().setStatus('syncing',{stage:event.stage,progressText:job.name,lastActivityAt:Date.now()}));observeSignal.throwIfAborted();guard();validateManifest(entries);
                                const observation:Observation={view:source.executionView(job.id,entries)};
                                if(member.source instanceof GDriveOAuthSource){const snapshot=member.source.inventorySnapshot;if(!snapshot)throw new SyncFault('response-format','Drive run snapshot is missing','source');observedRoots.set(job.id,structuredClone(snapshot.root));
                                        const connection=this.settings.connections?.find(connection=>connection.id===job.id),namespace=await driveNamespace(String(connection?.values.accountSub??''),snapshot.root.id,job.id,compiled);
                                        observation.state=stateByNamespace.get(namespace)??new DriveStateStore(this.fsAdapter,namespace);await observation.state.load();}
                                const projected=await observation.view.getManifest(observeSignal);
                                const initial=basePolicy.withBlockedTargets(authority.blocksFor(job.id,observation.state?.namespace)).forSources([job.id],compiled.defaultSource,rules,compiled.folders);
                                const participating=projected.filter(entry=>{const local=entry.resolvedDestination?entry.path:map(entry.path);return initial.isPathSafe(local)&&initial.isPathAllowed(local)&&isPolicyPathIncluded(entry.sourcePath??entry.path,local,compiled);});
                                const targets=participating.map(entry=>entry.resolvedDestination?entry.path:map(entry.path)),directories=targets.map(local=>{return local.split('/').slice(0,-1).join('/');});
                                observation.localBlocks=await localDirectoryBlocks(vault,directories,observeSignal,targets);
                                const cached=new Map<string,string[]>();for(const path of Object.keys(this.cache.entries())){const key=path.normalize('NFC').toLowerCase(),paths=cached.get(key)??[];paths.push(path);cached.set(key,paths);}for(const target of targets)if(cached.get(target.normalize('NFC').toLowerCase())?.some(path=>path!==target))observation.localBlocks.push({path:target,reason:'cached-path-alias'});
                                return observation;
                        }finally{observedSignals.get(job.id)?.complete();}
                },async(job,observation,stats)=>{
                        guard();const member=byId.get(job.id)!,blockedRows=new Map<string,import('./src/sources/types').SyncFileResult>();
                        // Probe owned effects before admitting directory creation. Unsettled targets remain reserved.
                        const namespaces=new Set([this.cache.namespace,...observation.state?[observation.state.namespace]:[]]);
                        for(const record of this.mutations.store.records().filter(record=>['committing','blocked'].includes(record.status)&&namespaces.has(record.namespace))){
                                const origin=record.effect?.kind==='set'?record.effect.remote.path:record.path;if(authority.owner(origin)!==job.id)continue;
                                try{const recovered=await this.mutations.recover(record.namespace,signal,candidate=>candidate.id===record.id);
                                        for(const settled of recovered){const effect=settled.effect;if(effect?.kind==='set'&&this.queue.all().some(file=>file.path===effect.remote.path&&file.hash===effect.remote.hash))this.queue.delete(effect.remote.path);}}
                                catch(error){signal.throwIfAborted();const issue=syncIssue(error,'recovery');if(sharedJobFailure(issue))throw error;blockedRows.set(origin,{path:origin,source:job.name,status:'pending',reason:'recovery-review',issue});}
                        }
                        const pendingBlocks=this.mutations.store.records().filter(record=>['committing','blocked'].includes(record.status)).flatMap(record=>[record.path,...record.from?[record.from]:[]].map(path=>({path,descendants:true,ancestors:true,reason:'recovery-overlap'})));
                        const policy=basePolicy.withBlockedTargets([...pendingBlocks,...authority.blocksFor(job.id,observation.state?.namespace),...observation.localBlocks??[]]),pathPolicy=policy.forSources([job.id],compiled.defaultSource,rules,compiled.folders);
                        const eligible=(path:string)=>{const reason=pathPolicy.blockReason(path);if(reason){blockedRows.set(path,{path,source:job.name,status:'pending',reason});return false;}return pathPolicy.isPathSafe(path)&&pathPolicy.isPathAllowed(path);};
                        observation.view.setExecutionFilter(eligible);observation.view.setExecutionDirections(['pull']);
                        if(observation.state&&(authority.bidirectionalOwners.has(job.id)||stateByNamespace.has(observation.state.namespace)))try{await observation.state.ensureWriterVersion();}catch(error){throw new SyncFault('checkpoint',`Drive writer fence failed: ${diagnosticText(error)}`,'session',false,'job');}
                        const pullPolicy=policy.forSources([job.id],compiled.defaultSource,rules,compiled.folders,['pull']),runner=this.coordinator.executionContext(observation.view,pullPolicy);
                        const cancel=()=>runner.cancel();signal.addEventListener('abort',cancel,{once:true});this.activeJobRunner=runner;
                        try{const pull=mode==='retry'?await runner.retryFailed(autoRetry?'auto':'manual',paths,true):mode==='force'?await runner.forceResync(true):await runner.sync({trigger:mode==='auto'?'auto':'manual',missingOnly:mode==='scan',deferQuestions:true,finishing:automaticTrigger==='finishing'});
                                if(pull){mergeJobStats(stats,pull);const asks=pull.results?.filter(row=>row.reason==='decision-required').map(row=>row.path)??[];if(asks.length)pullQuestions.push({id:job.id,runner,paths:asks});}
                        }finally{signal.removeEventListener('abort',cancel);this.activeJobRunner=undefined;}
                        if(signal.aborted||stats.outcome==='cancelled'||stats.problems?.some(sharedJobFailure))return stats;
                        if(member.source instanceof GDriveOAuthSource&&authority.bidirectionalOwners.has(job.id)){
                                if(observation.remoteBlock||authority.writerBlocked(job.id)){
                                        const issue=observation.remoteBlock??{code:'binding-inverse',message:'Bidirectional mapping is ambiguous; Drive writes are blocked',scope:'source' as const,stage:'preparing' as const,retryable:false};
                                        stats.failed++;stats.outcome='error';stats.problem=issue.message;stats.problems!.push(issue);
                                }else{
                                        const snapshot=member.source.inventorySnapshot!,drivePolicy=policy.forSources([job.id],compiled.defaultSource,rules,compiled.folders,['bidirectional']);
                                        const localForRemote=(path:string)=>sourceCandidates(path,job.id,rules,defaultSource,map).map(candidate=>resolveFileRule(candidate,rules).remotePath!==undefined?candidate:map(candidate))
                                                .filter(local=>eligible(local)&&drivePolicy.isPathAllowed(local)&&isPolicyPathIncluded(path,local,compiled));
                                        const remoteForLocal=(path:string)=>{if(paths&&!paths.includes(path)||!eligible(path))return undefined;const remote=sourcePathForDestination(path,job.id,rules,defaultSource,compiled.folders);return remote&&localForRemote(remote).includes(path)?remote:undefined;};
                                        const driver=new DriveCoordinator({vault,mutations:this.mutations,state:observation.state!,root:new GoogleDriveRoot(member.source.client,snapshot.root.id,guard),queue:this.queue,signal,auto:mode==='auto'||autoRetry,restoreOnly:mode==='scan',allowQuestions:false,skipQueued:automaticTrigger==='finishing',guard,
                                                localPaths:async()=>{const scan=await scanVaultTree(vault,{signal,pruneFolder:path=>path==='.git'||path==='.trash'||basePolicy.isProtectedPath(path)});return scan.files.filter(path=>remoteForLocal(path)!==undefined);},
                                                localForRemote,remoteForLocal,behavior:path=>{const behavior=effectiveBehavior(resolveFileRule(path,rules));return isCovered({level:'fetch',folders:compiled.mirrorFolders??{}},path)?behavior:{...behavior,deletions:'keep'};},
                                                allowArtifact:(origin,path,remote)=>{const originRemote=sourcePathForDestination(origin,job.id,rules,defaultSource,compiled.folders);return (!paths||paths.includes(origin)||paths.includes(path))&&!!originRemote&&localForRemote(originRemote).includes(origin)
                                                        &&isPolicyPathIncluded(originRemote,origin,compiled)&&drivePolicy.isArtifactPathAllowed(origin,path)&&isPolicyPathIncluded(remote,path,compiled);},
                                                ask:(path,localSize,remoteSize)=>this.serializeAsk(()=>{const modal=new ConflictAskModal(this.app,{path,localSize,remoteSize},true);trackModal(modal);return modal.wait(signal);},signal),
                                                observe:event=>this.makeSyncUI().setStatus('syncing',{stage:event.stage,lastActivityAt:Date.now(),progressText:job.name,bytesTransferred:event.bytes,totalBytes:event.totalBytes}),
                                        });
                                        let drive:import('./src/sources/types').SyncStats;try{drive=await driver.run(snapshot.items.filter(item=>!item.file.mimeType.startsWith('application/vnd.google-apps.')));}catch(error){const issue=syncIssue(error,'recovery');drive={...emptyStats(),outcome:signal.aborted?'cancelled':'error',failed:signal.aborted?0:1,problems:signal.aborted?[]:[issue],problem:issue.message};}
                                        drive.problems=drive.problems?.map(issue=>['checkpoint','checkpoint-cleanup'].includes(issue.code)?{...issue,domain:'job'}:issue);mergeJobStats(stats,drive);
                                        const asks=drive.results?.filter(row=>row.reason==='decision-required').map(row=>row.path)??[];if(asks.length)driveQuestions.push({id:job.id,driver,paths:asks});
                                }
                        }
                        stats.results!.push(...blockedRows.values());stats.deferredDeletions=(stats.deferredDeletions??0)+blockedRows.size;
                        stats.pendingAfter=this.queue.all().filter(file=>authority.owner(file.originPath??file.path)===job.id).length;return stats;
                },async(job,observation,admitSignal)=>{
                        if(!authority.bidirectionalOwners.has(job.id)||!(byId.get(job.id)!.source instanceof GDriveOAuthSource))return;
                        await awaitJobObservation(Promise.all([...observedSignals.values()].map(entry=>entry.promise)),admitSignal);guard();
                        const current=byId.get(job.id)!.source as GDriveOAuthSource;
                        const claims=[...authority.bidirectionalOwners].map(id=>{const source=byId.get(id)?.source,connection=this.settings.connections?.find(connection=>connection.id===id);
                                return {connectionId:id,folderId:String(connection?.values.folderId??''),...(source instanceof GDriveOAuthSource?{observed:observedRoots.get(id),client:source.client}:{})};});
                        try{await verifyDriveRootAuthority(job.id,new GoogleDriveRoot(current.client,current.inventorySnapshot!.root.id,guard),claims,admitSignal);}
                        catch(error){admitSignal.throwIfAborted();observation.remoteBlock=syncIssue(error,'preparing');}
                });
                const statsById=new Map(results.map(result=>[result.job.id,result.stats]));
                try{
                        const answer=async(id:string,paths:string[],run:()=>Promise<import('./src/sources/types').SyncStats|null>)=>{
                                if(signal.aborted||results.some(result=>result.stats.problems?.some(sharedJobFailure)))return;guard();const old=statsById.get(id)!,fresh=await run();if(!fresh)return;
                                for(const field of ['downloaded','uploaded','updated','deleted','deletedDrive','bytesTransferred','failed'] as const)old[field]=(old[field]??0)+(fresh[field]??0);
                                old.results=old.results?.filter(row=>row.reason!=='decision-required'||!paths.includes(row.path));old.results!.push(...fresh.results??[]);
                                old.problems!.push(...fresh.problems??[]);old.deferredConflicts=Math.max(0,(old.deferredConflicts??0)-paths.length)+(fresh.deferredConflicts??0);if(fresh.outcome!=='ok')old.outcome=fresh.outcome;
                        };
                        if(mode!=='auto'&&!autoRetry){for(const question of pullQuestions){const cancel=()=>question.runner.cancel();signal.addEventListener('abort',cancel,{once:true});this.activeJobRunner=question.runner;
                                try{await answer(question.id,question.paths,()=>question.runner.sync({trigger:'manual',forcedPaths:new Set(question.paths),onlyForcedPaths:true}));}finally{signal.removeEventListener('abort',cancel);this.activeJobRunner=undefined;}}
                                for(const question of driveQuestions)await answer(question.id,question.paths,()=>question.driver.resolveQuestions(question.paths));}
                        for(const result of results){result.stats.problems=result.stats.problems?.map(issue=>({...issue,jobId:'job:'+result.job.id,connectionId:result.job.id}));mergeJobStats(aggregate,result.stats);}
                        aggregate.pendingAfter=this.queue.all().filter(file=>members.some(member=>member.id===authority.owner(file.originPath??file.path))).length;aggregate.jobResults=batch.snapshot();
                        for(const job of aggregate.jobResults){const stats=statsById.get(job.connectionId)!;job.downloaded=stats.downloaded;job.uploaded=stats.uploaded??0;job.deleted=stats.deleted;job.failed=stats.failed;job.attention=(stats.deferredConflicts??0)+(stats.deferredDeletions??0);job.issues=stats.problems??[];job.pending=this.queue.all().filter(file=>authority.owner(file.originPath??file.path)===job.connectionId).length;
                                if(job.outcome!=='blocked')job.outcome=accountedOutcome({...stats,pendingAfter:job.pending});}
                        this.publishJobs(aggregate.jobResults);aggregate.duration=Date.now()-started;
                        if(signal.aborted)aggregate.outcome='cancelled';else if(aggregate.problems?.length||aggregate.deferredDeletions)aggregate.outcome='error';
                        await this.finalizeEngineResult(aggregate);
                        this.statusBar.setState(aggregate.outcome==='error'?'error':aggregate.deferredConflicts||aggregate.deferredDeletions?'conflicts':'idle');return aggregate;
                }finally{this.activeJobRunner=undefined;try{await source.dispose();}catch(error){console.warn('[VaultSync] Job provider cleanup deferred:',diagnosticText(error));}}
        }

        private async executeLegacySync(mode:'manual'|'auto'|'retry'|'force'|'scan'='manual',paths?:readonly string[],autoRetry=false,driveControl?:{namespace:string;resolution?:DriveResolution}):Promise<import('./src/sources/types').SyncStats|null> {
                const source=this.coordinator.getCurrentSource(),compiled=this.effectiveProfilePolicy(this.builtSourceId);
                const rules=compiled.fileRules??[],hasDrive=rules.some(r=>r.direction==='bidirectional');this.combinedSession=hasDrive;
                if(!hasDrive&&driveControl)throw new SyncFault('configuration-changed','This Drive binding is no longer active');
                if(!hasDrive)return mode==='retry'?this.coordinator.retryFailed(autoRetry?'auto':'manual',paths):mode==='force'?this.coordinator.forceResync():this.coordinator.sync({trigger:mode==='auto'?'auto':'manual',missingOnly:mode==='scan'});
                validateProfileConnections(this.settings.vaultPolicy!,this.settings.profiles??[],this.settings.connections??[]);
                if(!(source instanceof RoutedSource))throw new SyncFault('routing','Drive requires a routed source','session');
                source.setExecutionDirections(['pull']);
                const signal=this.sessionController!.signal;signal.throwIfAborted();
                // Every selected source inventory must succeed before either engine changes vault/Drive files.
                await source.getManifest(signal);
                const members=source.executionMembers().filter(member=>member.source instanceof GDriveOAuthSource)
                        .map(member=>({...member,source:member.source as GDriveOAuthSource,inventory:(member.source as GDriveOAuthSource).inventorySnapshot!}));
                const states=new Map<string,DriveStateStore>();
                for(const member of members){const connection=this.settings.connections?.find(c=>c.id===member.id);const namespace=await driveNamespace(String(connection?.values.accountSub??''),member.inventory.root.id,member.id,compiled);
                        const state=new DriveStateStore(this.fsAdapter,namespace);await state.load();await state.ensureWriterVersion();if(!driveControl)await this.mutations.recover(namespace,signal);states.set(member.id,state);}
                if(driveControl&&![...states.values()].some(state=>state.namespace===driveControl.namespace))throw new SyncFault('configuration-changed','This Drive history belongs to an inactive account, root or mapping; effects are blocked');
                const stats=driveControl?null:mode==='retry'?await this.coordinator.retryFailed(autoRetry?'auto':'manual',paths,true):mode==='force'?await this.coordinator.forceResync(true):await this.coordinator.sync({trigger:mode==='auto'?'auto':'manual',missingOnly:mode==='scan',deferQuestions:true});
                if(signal.aborted||stats?.outcome==='cancelled'||stats?.problems?.some(issue=>issue.scope==='session'))return stats;
                const aggregate:import('./src/sources/types').SyncStats=stats?structuredClone(stats):{totalFiles:0,downloaded:0,deleted:0,skipped:0,failed:0,bytesTransferred:0,duration:0,conflicts:0,outcome:'ok'};
                const started=Date.now(),vault=this.makeVaultAdapter(),basePolicy=this.makePolicy(),defaultSource=compiled.defaultSource??'primary';
                const questions:{driver:DriveCoordinator;paths:string[]}[]=[];
                const map=(path:string)=>{const f=compiled.folders.filter(f=>f.target&&(!f.path||path===f.path||path.startsWith(f.path+'/'))).sort((a,b)=>b.path.length-a.path.length)[0];return f?computeLocalPath(path,f.path,f):path;};
                for(const member of members){
                        if(driveControl&&states.get(member.id)!.namespace!==driveControl.namespace)continue;
                        signal.throwIfAborted();const pathPolicy=basePolicy.forSources([member.id],compiled.defaultSource,rules,compiled.folders,['bidirectional']);
                        const localForRemote=(path:string)=>sourceCandidates(path,member.id,rules,defaultSource,map).flatMap(candidate=>applyPolicy([{path:candidate,hash:'route',hashAlg:'weak',size:0,resolvedDestination:resolveFileRule(candidate,rules).remotePath!==undefined}],compiled,pathPolicy,[]).transformedManifest.map(entry=>entry.path)).filter(local=>isPolicyPathIncluded(path,local,compiled));
                        const remoteForLocal=(path:string)=>{if(paths&&!paths.includes(path))return undefined;
                                const remote=sourcePathForDestination(path,member.id,rules,defaultSource,compiled.folders);return remote&&localForRemote(remote).includes(path)?remote:undefined;};
                        const driver=new DriveCoordinator({vault,mutations:this.mutations,state:states.get(member.id)!,root:new GoogleDriveRoot(member.source.client,member.inventory.root.id,()=>{signal.throwIfAborted();if(this.preparedConfigRevision!==this.getConfigurationRevision())throw new SyncFault('configuration-changed','Settings changed during Drive synchronization','session');}),queue:this.queue,
                                signal,auto:mode==='auto'||autoRetry,restoreOnly:mode==='scan',allowQuestions:false,probeOnly:!!driveControl&&!driveControl.resolution,resolution:driveControl?.resolution,
                                guard:()=>{signal.throwIfAborted();if(this.preparedConfigRevision!==this.getConfigurationRevision())throw new SyncFault('configuration-changed','Settings changed during Drive synchronization','session');},
                                localPaths:async()=>{const scan=await scanVaultTree(vault,{signal,pruneFolder:p=>p==='.git'||p==='.trash'||basePolicy.isProtectedPath(p)});return scan.files.filter(p=>remoteForLocal(p)!==undefined);},
                                localForRemote,remoteForLocal,behavior:path=>{const behavior=effectiveBehavior(resolveFileRule(path,rules));
                                        return isCovered({level:'fetch',folders:compiled.mirrorFolders??{}},path)?behavior:{...behavior,deletions:'keep'};},
                                allowArtifact:(origin,path,remote)=>{
                                        const originRemote=sourcePathForDestination(origin,member.id,rules,defaultSource,compiled.folders);
                                        return (!paths||paths.includes(origin)||paths.includes(path))&&!!originRemote&&localForRemote(originRemote).includes(origin)
                                                &&isPolicyPathIncluded(originRemote,origin,compiled)&&pathPolicy.isArtifactPathAllowed(origin,path)&&isPolicyPathIncluded(remote,path,compiled);
                                },
                                ask:(path,localSize,remoteSize)=>this.serializeAsk(()=>{const modal=new ConflictAskModal(this.app,{path,localSize,remoteSize},true);trackModal(modal);return modal.wait(signal);},signal),
                                observe:event=>this.makeSyncUI().setStatus('syncing',{stage:event.stage,lastActivityAt:Date.now(),progressText:member.name,bytesTransferred:event.bytes,totalBytes:event.totalBytes}),
                        });
                        this.makeSyncUI().setStatus('syncing',{stage:'apply',progressText:member.name,lastActivityAt:Date.now()});
                        const result=await driver.run(member.inventory.items.filter(item=>!item.file.mimeType.startsWith('application/vnd.google-apps.')));
                        const questionPaths=result.results?.filter(row=>row.reason==='decision-required').map(row=>row.path)??[];if(questionPaths.length)questions.push({driver,paths:questionPaths});
                        for(const field of ['totalFiles','downloaded','uploaded','deleted','deletedDrive','skipped','failed','bytesTransferred','conflicts','deferredConflicts','deferredDeletions'] as const)aggregate[field]=(aggregate[field]??0)+(result[field]??0);
                        aggregate.problems=[...aggregate.problems??[],...result.problems??[]];aggregate.results=[...aggregate.results??[],...result.results??[]];aggregate.followUp ||= result.followUp;
                        if(result.outcome!=='ok'){aggregate.outcome=result.outcome;aggregate.problem=result.problem;}
                        if(result.problems?.some(issue=>issue.scope==='session')||result.outcome==='cancelled')break;
                }
                if(mode!=='auto'&&!autoRetry&&mode!=='scan'&&!signal.aborted&&!aggregate.problems?.some(issue=>issue.scope==='session')){
                        const mergeAnswers=(answer:import('./src/sources/types').SyncStats|null,oldDeferred:number)=>{
                                if(!answer)return;for(const field of ['downloaded','uploaded','deleted','deletedDrive','failed','bytesTransferred','conflicts'] as const)aggregate[field]=(aggregate[field]??0)+(answer[field]??0);
                                aggregate.deferredConflicts=Math.max(0,(aggregate.deferredConflicts??0)-oldDeferred)+(answer.deferredConflicts??0);
                                aggregate.problems?.push(...answer.problems??[]);aggregate.results?.push(...answer.results??[]);
                                if(answer.outcome==='error'||answer.outcome==='cancelled'){aggregate.outcome=answer.outcome;aggregate.problem=answer.problem;}
                        };
                        if(stats?.deferredConflicts){const before=stats.deferredConflicts,oldDeletes=stats.deferredDeletions??0;
                                const answer=await this.coordinator.sync({trigger:'manual'});mergeAnswers(answer,before);
                                if(answer)aggregate.deferredDeletions=Math.max(0,(aggregate.deferredDeletions??0)-oldDeletes)+(answer.deferredDeletions??0);
                        }
                        for(const question of questions){if(signal.aborted||aggregate.problems?.some(issue=>issue.scope==='session'))break;
                                aggregate.results=aggregate.results?.filter(row=>row.reason!=='decision-required'||!question.paths.includes(row.path));
                                mergeAnswers(await question.driver.resolveQuestions(question.paths),question.paths.length);
                        }
                }
                aggregate.duration+=Date.now()-started;
                const runIds=source.executionMembers().map(member=>member.id),runPolicy=basePolicy.forSources(runIds,compiled.defaultSource,rules,compiled.folders);
                aggregate.pendingAfter=this.queue.all().filter(file=>(file.originPath?runPolicy.isArtifactPathAllowed(file.originPath,file.path):runPolicy.isPathAllowed(file.path))&&!effectiveBehavior(resolveFileRule(file.originPath??file.path,rules)).protected).length;
                if(signal.aborted)aggregate.outcome='cancelled';
                else if(!aggregate.failed&&!aggregate.pendingAfter&&!aggregate.notAttempted&&!aggregate.problems?.length)aggregate.outcome=aggregate.deferredDeletions?'error':'ok';
                await this.finalizeEngineResult(aggregate);this.statusBar.setState(aggregate.outcome==='error'?'error':aggregate.deferredConflicts||aggregate.deferredDeletions?'conflicts':'idle');
                return aggregate;
        }

        async syncNow(selectedIds?: readonly string[]): Promise<void> {
                if(!selectedIds && !this.isConfiguredForSource()){this.openVaultTreeModal();return;}
                await this.runSession('manual', async () => {
                        await this.prepareSession(selectedIds);
                        const stats = await this.executeSync();
                        // [7-d] небезопасные пути видны пользователю, не только в консоли
                        const skipped = this.coordinator.getSkippedUnsafeCount();
                        if (skipped > 0) new Notice(i18n.t.noticeSkippedUnsafe(skipped), 10000);
                        return stats;
                },selectedIds);
        }

        // ============================================================
        // --- [W4-T01/W4-T04] Авто-синхронизация (планировщик) ---
        // ============================================================

        /** Старт планировщика: читает autoSyncInterval из настроек и запускает.
         *  Идемпотентен — сохраняет экземпляры и потреблённый startup cycle. */
        private wakeAutoSync():void {for(const scheduler of this.autoSchedulers?.values()??[])scheduler.wake();}
        private automaticSourceIds():string[]{
                const policy=this.effectiveProfilePolicy(this.builtSourceId),rules=policy.fileRules??[];
                const ids=new Set(rules.flatMap(rule=>rule.source?[rule.source]:[]));
                if(!rules.some(rule=>rule.scope==='vault'&&!rule.names&&rule.source))ids.add(policy.defaultSource??(this.settings.vaultPolicy?'unassigned':'primary'));
                ids.delete('unassigned');return [...ids];
        }
        startAutoSync(): void {
                if(!this.queue||this.unloading||this.app?.workspace&&!this.autoReady)return;
                this.autoSchedulers??=new Map();this.autoJobBlocks??=new Map();
                const ids=this.automaticSourceIds(),selected=new Set(ids);
                for(const [id,scheduler] of this.autoSchedulers)if(!selected.has(id))scheduler.stop();
                for(const id of ids){
                        const connection=this.settings.connections?.find(connection=>connection.id===id),interval=resolveSchedule(connection?.auto,this.settings.autoSyncInterval??'off');
                        let scheduler=this.autoSchedulers.get(id);const reenable=!!scheduler&&scheduler.getInterval()==='off'&&interval!=='off';
                        if(!scheduler){scheduler=new Scheduler({queue:this.queue,onAutoRetry:()=>{},
                                canRun:()=>!this.unloading&&!this.autoBlockedReason&&!this.autoJobBlocks?.has(id)&&!this.sessionOwned&&!this.coordinator?.isRunning()&&navigator.onLine&&isSyncAllowed(this.governance)&&vamAllowsWork(this),
                                onAutoTick:context=>this.runAutoSession([id],context?.initialCheck??scheduler!.snapshot().lastAutoTickAt===null,context),
                                onStateChange:()=>{this.emitJobProjection();this.popoverView?.update(this.snapshotPopoverState());}});this.autoSchedulers.set(id,scheduler);}
                        scheduler.start(interval,undefined,reenable);if(this.autoPaused)scheduler.pause();
                }
                this.scheduler=[...this.autoSchedulers.values()].find(scheduler=>scheduler.getInterval()!=='off');
        }

        private publishJobs(states:JobRunResult[]):void{const known=new Set([...(this.settings.connections??[]).map(connection=>connection.id),...states.map(state=>state.connectionId),'primary']);
                const merged=new Map((this.jobRuns??[]).filter(state=>known.has(state.connectionId)).map(state=>[state.connectionId,state]));for(const state of states)merged.set(state.connectionId,structuredClone(state));this.jobRuns=[...merged.values()];this.emitJobProjection();}
        private emitJobProjection():void{this.notifyVaultSync();for(const listener of this.jobSubscribers??[]){try{listener();}catch{console.warn('[VaultSync] job view listener failed');}}}
        subscribeJobs(listener:()=>void):()=>void{this.jobSubscribers??=new Set();this.jobSubscribers.add(listener);return()=>this.jobSubscribers.delete(listener);}

        automaticJobSnapshots():JobProjection[]{
                return this.automaticSourceIds().map(id=>{
                        const connection=this.settings.connections?.find(connection=>connection.id===id),configuredAuto=connection?.auto??'inherit',scheduler=this.autoSchedulers?.get(id);
                        const interval=resolveSchedule(configuredAuto,this.settings.autoSyncInterval??'off'),fallback=new Scheduler({queue:this.queue,onAutoRetry:()=>{},onAutoTick:()=>{}}).snapshot();
                        const schedule=scheduler?.snapshot()??{...fallback,interval};
                        return {jobId:'job:'+id,connectionId:id,name:connection?.name??id,kind:connection?.kind??this.builtKind??'git',configuredAuto,
                                schedule:{...schedule,blockedReason:this.autoBlockedReason??this.autoJobBlocks?.get(id)??schedule.blockedReason},run:this.jobRuns?.find(run=>run.connectionId===id)&&structuredClone(this.jobRuns.find(run=>run.connectionId===id)!)};
                });
        }

        /** Переконфигурация интервала (вызывается из SettingsTab.onChange). */
        restartAutoSync(): void {
                this.startAutoSync();
        }

        /** Pause/resume toggle — вызывается из popover actionPauseAuto. */
        pauseAutoSync(): void {
                const active=[...this.autoSchedulers.values()].filter(s=>s.getInterval()!=='off');
                if(!active.length)return;
                const resume=active.every(s=>s.isPaused());this.autoPaused=!resume;for(const scheduler of active)resume?scheduler.resume():scheduler.pause();
                // [W5-T02] статус авто-синк изменился (paused↔running) — уведомляем подписчиков.
                this.notifyVaultSync();this.popoverView?.update(this.snapshotPopoverState());
        }

        /** Снимок состояния для popover. null — scheduler не инициализирован
         *  или интервал 'off' (popover не рендерит scheduler-секцию). */
        schedulerSnapshot(): SchedulerSnapshot | null {
                const states=this.automaticJobSnapshots().map(job=>job.schedule).filter(schedule=>schedule.interval!=='off');
                if(!states.length)return null;
                const state=states.sort((a,b)=>(a.nextTickAt??Infinity)-(b.nextTickAt??Infinity))[0];
                return {...state,blockedReason:this.autoBlockedReason,paused:states.every(s=>s.paused),pending:states.some(s=>s.pending),running:states.some(s=>s.running)};
        }

        /** Background pull keeps its existing deletion guards. The explicitly
         *  bidirectional Drive profile propagates confirmed tracked deletions through trash. */
        private async runAutoSession(sourceIds?:readonly string[],initialCheck=false,context?:AutoTickContext): Promise<import('./src/core/scheduler').AutoTickResult> {
                if(!sourceIds?.length)return {accepted:true};
                const stats=await this.runSession('auto', async () => {
                        await this.prepareSession(sourceIds);
                        return await this.executeSync('auto',undefined,false,undefined,context?.trigger);
                },sourceIds);
                if(stats?.outcome==='cancelled')return {accepted:true,cancelled:true,outcome:'cancelled'};
                const compiled=this.effectiveProfilePolicy(this.builtSourceId),due=this.queue.all().filter(file=>!file.poisoned&&sourceIds.includes(resolveFileRule(file.originPath??file.path,compiled.fileRules).source??compiled.defaultSource??''));
                const retryAt=due.length?Math.min(...due.map(file=>file.nextRetryAt)):undefined;
                const retryableFailure=stats?.problems?.some(issue=>issue.retryable&&(issue.scope==='source'||issue.scope==='session'));
                const transferred=Boolean(stats&&(stats.downloaded||stats.uploaded||stats.updated||stats.deleted));
                const job=stats?.jobResults?.find(job=>sourceIds.includes(job.connectionId)),fatal=stats?.problems?.some(sharedJobFailure);
                const block=job?.issues.find(issue=>!issue.retryable&&['auth-required','root-unavailable','source-unavailable','checkpoint','checkpoint-cleanup'].includes(issue.code));
                if(block){this.autoJobBlocks??=new Map();this.autoJobBlocks.set(job!.connectionId,block.message);}
                const retryHint=job?.issues.filter(issue=>issue.retryable).reduce<number|undefined>((at,issue)=>Math.min(at??Infinity,issue.retryAt??Date.now()+60_000),undefined);
                return {accepted:stats!==null,retryAt:block||fatal?undefined:retryAt??retryHint??((retryableFailure||!stats&&!this.autoBlockedReason)?Date.now()+60_000:undefined),
                        followUp:!fatal&&!block&&Boolean(stats&&(stats.followUp||transferred||initialCheck&&!stats.failed)),retryableFailure,
                        outcome:job?.outcome??stats?.outcome,blockedReason:block?.message};
        }

        async retryFailedFiles(trigger:'manual'|'auto'='manual',paths?:readonly string[]): Promise<void> {
                await this.runSession(trigger==='auto'?'auto':'retry', async () => {
                        await this.prepareSession();
                        return await this.executeSync('retry',paths,trigger==='auto');
                });
        }

        async forceResync(): Promise<void> {
                await this.runSession('force', async () => {
                        await this.prepareSession();
                        return await this.executeSync('force');
                });
        }

        async scanAndRestoreMissing(): Promise<void> {
                await this.runSession('scan', async () => {
                        await this.prepareSession();
                        return this.executeSync('scan');
                });
        }

        /** [overhaul S1/H-3] Гейт внесессионного сетевого трафика: testConnection,
         *  fetchRemote (модалка структуры) и collectMissing уводили манифест/архив
         *  в сеть ДО runSession — заблокированный VAM/governance пользователь
         *  осуществлял полный сетевой обмен (для zip-url на мобайле — скачивание
         *  всего архива). Та же пара гейтов в том же порядке (VAM → governance),
         *  теми же текстами Notice, что в runSession; false = отказ (Notice уже
         *  показан: VAM — троттлинг 3с в vam-bridge, governance — 10с). VAM обязателен для сессий и проверок подключения. */
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
        private async runSession(trigger: 'manual' | 'auto' | 'retry' | 'scan' | 'force', fn: () => Promise<import('./src/sources/types').SyncStats | null>, sourceIds?: readonly string[]): Promise<import('./src/sources/types').SyncStats | null> {
                if (this.sessionOwned || this.coordinator?.isRunning()) { new Notice(i18n.t.noticeSyncInProgress); return null; }
                if(trigger!=='auto'){this.autoBlockedReason=undefined;this.autoJobBlocks?.clear();}
                this.proposedLastSync=undefined;this.sessionOwned = true; this.currentTrigger = trigger; this.lastBlockReason = undefined;
                this.sessionController = new AbortController();
                this.requestedSources = sourceIds?.map(id => this.settings.connections?.find(c => c.id === id)?.name ?? id);
                const startedAt = Date.now();
                this.statusBar?.setState('syncing', { phase: -1, pendingCount: 0, bytesTransferred: 0, totalBytes: 0, progressText: i18n.getLocale() === 'ru' ? 'Подготовка запуска…' : 'Preparing run…' });
                if (trigger !== 'auto' && this.app && this.statusBar && this.queue && this.journal) this.openStatusPopover();
                try {const stats=await this.runOwnedSession(trigger, fn);if(stats?.problems?.some(issue=>!issue.retryable&&(stats.jobResults?sharedJobFailure(issue):issue.scope==='session'||issue.code==='auth-required')))this.autoBlockedReason=stats.problem;return stats;}
                catch (error) {
                        if(!this.sessionController.signal.aborted){this.lastBlockReason=diagnosticText(error);this.statusBar?.setState('error');new Notice(i18n.t.noticeSyncFailed(this.lastBlockReason),10000);}
                        else this.statusBar?.setState('idle');
                        const stats=emptyStats();stats.duration=Date.now()-startedAt;
                        if(this.sessionController.signal.aborted)stats.outcome='cancelled';
                        else {const issue=syncIssue(error,'preparing');stats.outcome='error';stats.problem=issue.message;stats.problems=[issue];}
                        this.autoBlockedReason=this.lastBlockReason;try{await this.recordJournal(trigger,stats,startedAt);}catch(journalError){const issue=syncIssue(journalError,'finalize');stats.problems!.push(issue);stats.problem=issue.message;stats.outcome='error';this.autoBlockedReason=issue.message;}
                        return stats;
                }
                finally {
                        this.sessionOwned = false; this.sessionController = undefined;this.sessionProgress=undefined;this.combinedSession=false;this.wakeAutoSync();
                        this.popoverView?.update(this.snapshotPopoverState());
                        const modal = this.statusModal;
                        if (modal) void this.journal.load().then(entries => {
                                if (this.statusModal === modal) this.popoverView?.setLastEntry(entries[0] ?? null);
                        });
                        this.notifyVaultSync();
                }
        }

        private async runOwnedSession(trigger: 'manual' | 'auto' | 'retry' | 'scan' | 'force', fn: () => Promise<import('./src/sources/types').SyncStats | null>): Promise<import('./src/sources/types').SyncStats | null> {
                // [VAM] гейт «работы, требующей входа» (§5, fail-closed): единая
                // точка для ВСЕХ сессий — manual/auto/retry/scan/force (аналог
                // гейта AI-запросов донора: AIEngine.processText/chat/embeddings).
                // Двойная сверка §9.4: сигнал читается в момент использования,
                // не кэшируется; не-granted → VamAccessError ДО ухода какого-либо
                // трафика (Notice — не чаще раза в 3 с, троттлинг в vam-bridge).
                // Denied attempts are recorded separately from executed sessions.
                try {
                        assertVamAllowed(this);
                } catch (e) {
                        if (e instanceof Error && e.name === 'VamAccessError') {
                                this.notifyVaultSync();
                                // [overhaul S1/M-4] вызывшая команда могла уже
                                // поставить 'syncing' (scan-путь) — coordinator
                                // не запускался и статус никто не сбросит.
                                await this.recordBlockedAttempt(trigger,describeVamStatus(this.vam)??i18n.t.vam.modalDenied);
                                return null;
                        }
                        throw e;
                }
                // [P2 / manager-build-spec §3.5] beforeSession: дать менеджеру
                // аутентификации шанс провести свежий probe ДО guard-решения
                // (pull канала + applyManagerProbe на его стороне). Ошибки и
                // таймаут 10 с не меняют вердикт; vaultSyncAuth отсутствует →
                // поведение прежнее (W5-совместимость, optional chaining).
                await awaitBeforeSession((window as unknown as Record<string, unknown>).vaultSyncAuth, BEFORE_SESSION_TIMEOUT_MS, this.sessionController?.signal);
                if (!this.assertNetworkAllowed()) { await this.recordBlockedAttempt(trigger,blockReason(this.governance)??describeVamStatus(this.vam)??i18n.t.noticeManagerRequired); return null; }
                // [W5-T01] guard: fail-closed на старте КАЖДОЙ сессии. Если
                // governance.blocked — отказываем с внятным Notice и не идём
                // в prepareSession (сеть/диск/manifest не трогаем). Это
                // ловит и auto, и retry, и scan, и force — единая guard-точка.
                if (!isSyncAllowed(this.governance)) {
                        const reason = blockReason(this.governance) ?? i18n.t.noticeManagerRequired;
                        new Notice(i18n.t.noticeGovernanceBlocked(reason), 10000);
                        this.notifyVaultSync();
                        // [overhaul S1/M-4] симметрично VAM-ветке выше.
                        await this.recordBlockedAttempt(trigger,reason);
                        return null;
                }
                const startedAt = Date.now();
                let stats: import('./src/sources/types').SyncStats | null = null;
                try {
                        await this.journal?.recover?.();
                        stats = await fn();
                        // A cancellation during preparation must reach the scheduler as cancellation.
                        if(this.sessionController?.signal.aborted){stats??=emptyStats();stats.outcome='cancelled';}
                        if(stats&&stats.outcome==='ok'&&!stats.failed&&!stats.deferredConflicts&&!stats.deferredDeletions&&!stats.pendingAfter){
                                const previous={lastSyncTime:this.settings.lastSyncTime,totalSyncCount:this.settings.totalSyncCount};
                                this.settings.lastSyncTime=this.proposedLastSync??Date.now();this.settings.totalSyncCount++;
                                try{await this.saveSettingsImmediate();}catch{Object.assign(this.settings,previous);throw new SyncFault('settings-save','Successful sync state could not be saved','session');}
                                this.statusBar.setLastSync(this.settings.lastSyncTime);
                        }
                } catch (error) {
                        stats??=emptyStats();
                        if(this.sessionController?.signal.aborted){stats.outcome='cancelled';this.statusBar.setState('idle');}
                        else {
                                const issue=syncIssue(error,'preparing');stats.outcome='error';stats.problem=issue.message;stats.problems=[...stats.problems??[],issue];
                                this.lastBlockReason=issue.message;
                                if(!issue.retryable&&(issue.scope==='session'||issue.code==='auth-required'||issue.code==='io'))this.autoBlockedReason=issue.message;
                                this.statusBar.setState('error');new Notice(i18n.t.noticeSyncFailed(issue.message),10000);
                        }
                }
                // Final reporting cannot erase confirmed transfers or replace the result with null.
                if(stats)stats.duration=Date.now()-startedAt;
                try {await this.recordJournal(trigger,stats,startedAt);}
                catch(error){
                        stats??=emptyStats();const issue=syncIssue(error,'finalize');
                        stats.outcome='error';stats.problem=issue.message;stats.problems=[...stats.problems??[],issue];
                        this.lastBlockReason=issue.message;this.autoBlockedReason=issue.message;
                        this.statusBar.setState('error');new Notice(i18n.t.noticeSyncFailed(issue.message),10000);
                }
                this.notifyVaultSync();
                return stats;
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

        /** Access status and reason. This modal does not change permissions. */
        openVamStatusModal(): void {
                const vamModal = new VamStatusModal(this.app, {
                        granted: vamAllowsWork(this),
                        softMode: false,
                        reasonText: describeVamStatus(this.vam),
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

        /** Revocation cancels active work; in-flight effects still require normal recovery. */
        private onVamRevoked(reason: string | null): void {
                this.sessionController?.abort(new DOMException('VAM access revoked','AbortError'));
                this.coordinator?.cancel();this.activeJobRunner?.cancel();
                const reasonText = reason ? describeVamReason(reason) : i18n.t.vam.reasonNoCode;
                new Notice(i18n.t.vam.noticeRevoked(reasonText), 8000);
                this.notifyVaultSync();this.wakeAutoSync();
        }

        /** [W5-T01] Ручной сброс governance (A4) — вызывается из Диагностики
         *  через confirm-модалку. Сбрасывает И персистентный флаг, И runtime. */
        async resetGovernanceState(): Promise<void> {
                this.governance = resetGovernance();
                this.settings.governanceManagerEverActive = false;
                await this.saveSettingsImmediate();
                this.notifyVaultSync();this.wakeAutoSync();
        }

        /** [W5-T02] Снимок состояния для window.vaultSync.getState(). Берёт
         *  live-значения из плагина; вызывается на каждый notify (см. runSession,
         *  applyManagerProbe, pauseAutoSync, иные точки смены состояния). */
        private buildVaultSyncState(): VaultSyncState {
                const mirrorLevel = this.currentMirrorLevel();
                const syncState = this.sessionOwned || this.coordinator?.isRunning() ? 'syncing' : 'idle';
                return {
                        syncState: syncState as VaultSyncState['syncState'],
                        mirrorLevel,
                        governance: snapshotGovernance(this.governance),
                        sourceId: this.builtSourceId ?? '',
                        engineKind: this.builtKind ?? null,
                        lastSyncAt: this.settings.lastSyncTime ?? 0,
                        pendingCount: this.queue?.size() ?? 0,
                        jobs:{version:1,items:this.automaticJobSnapshots()},
                        // [VAM] состояние гварда в публичном снимке (аддитивное
                        // поле — обратно совместимо для сторонних потребителей
                        // window.vaultSync). Гварда нет (до onload/после выгрузки) →
                        // fail-closed-семантика: blocked без причины.
                        vam: {
                                status: this.vam?.status ?? 'blocked',
                                reason: this.vam?.reason ?? null,
                                softMode: false,
                        },
                };
        }

        /** [W5-T02] Расслать текущее состояние всем подписчикам window.vaultSync.
         *  No-op если реестр ещё не создан (onload не отработал) или подписчиков нет. */
        private notifyVaultSync(): void {
                this.vaultSyncHook?.notify();
        }

        private async recordBlockedAttempt(trigger:'manual'|'auto'|'retry'|'scan'|'force',reason:string):Promise<void>{
                this.lastBlockReason=reason;this.statusBar.setState('blocked',{progressText:reason});await this.recordJournal(trigger,null,Date.now());
        }
        private async recordJournal(trigger:'manual'|'auto'|'retry'|'scan'|'force',stats:import('./src/sources/types').SyncStats|null,startedAt:number):Promise<void>{
                if(!this.journal || (!stats&&!this.lastBlockReason&&!this.sessionController?.signal.aborted))return;
                const activeIds=this.coordinator?.getCurrentSource().sources?.map(source=>source.id);
                const compiled=stats&&activeIds?this.effectiveProfilePolicy(this.builtSourceId):undefined;
                const failures=stats&&stats.failed>0?this.queue.all().filter(file=>!activeIds||activeIds.includes(resolveFileRule(file.originPath??file.path,compiled?.fileRules).source??compiled?.defaultSource??'')):[];
                const entry:JournalEntry={
                        startedAt,durationMs:stats?.duration??Date.now()-startedAt,
                        engine:this.builtKind,mirrorLevel:this.currentMirrorLevel(),trigger,
                        outcome:stats?.outcome??(this.sessionController?.signal.aborted?'cancelled':'error'),sources:stats?this.coordinator?.getCurrentSource().sources?.map(source=>source.name):this.requestedSources,
                        profilesMode:Boolean(this.settings.profiles?.length),blockedReason:stats?.problem??(stats?undefined:this.lastBlockReason),attemptOnly:!stats,
                        downloaded:stats?.downloaded??0,uploaded:stats?.uploaded??0,deletedDrive:stats?.deletedDrive??0,updated:stats?.updated??0,received:stats?.received??0,
                        jobResults:stats?.jobResults,trace:stats?.trace,traceDropped:stats?.traceDropped,sessionId:stats?.sessionId,build:BUILD_TAG,platform:Platform.isDesktopApp?'desktop':'mobile',pendingBefore:stats?.pendingBefore,pendingAfter:stats?.pendingAfter,retryScheduled:stats?.retryScheduled,blocked:stats?.blocked,networkBytes:stats?.networkBytes,problems:stats?.problems,notAttempted:stats?.notAttempted,
                        deletedLight:stats?.deleteLight??0,deletedFull:stats?.deleteFull??0,overwritten:stats?.overwritten??0,
                        conflicts:stats?.conflicts??0,skipped:stats?.skipped??0,errors:stats?.failed??0,
                        deferredDeletions:stats?.deferredDeletions??0,blockedDeletions:stats?.blockedDeletions??0,deferredConflicts:stats?.deferredConflicts??0,
                        results:stats?.results?.slice(0,500),resultsTotal:stats?.results?.length??0,
                        topErrors:stats?.problem?[{message:stats.problem,count:1}]:!stats&&this.lastBlockReason?[{message:this.lastBlockReason,count:1}]:topErrorsFrom(stats?.results?.filter(row=>row.status==='error').map(row=>row.issue?.message??row.reason)??[]),
                };
                try{await this.journal.append(entry);}catch{throw new SyncFault('journal-save','Sync journal could not be saved','session');}
        }

        private cancelSync(): void {
                this.sessionController?.abort();
                this.coordinator?.cancel();this.activeJobRunner?.cancel();
                this.sessionProgress={...this.sessionProgress,stage:'cancelling'};this.popoverView?.update(this.snapshotPopoverState());
                new Notice(i18n.t.noticeCancelling);
        }

        private async checkSourceConnection(connection:SourceConnection,signal:AbortSignal,sample=false):Promise<void> {
                if(!this.assertNetworkAllowed())throw Error(i18n.getLocale()==='ru'?'Доступ к источнику заблокирован':'Source access blocked');
                const descriptor=EngineRegistry.get(connection.kind),values=connectionValues(connection);
                if(connectionIssues(connection).length)throw Error(i18n.getLocale()==='ru'?'Проверьте поля подключения':'Check the connection fields');
                signal.throwIfAborted();const source=EngineRegistry.create(connection.kind,values,this.engineCtx(connection.kind));
                try{
                        if(connection.kind==='git'){const result=await (source as GitSource).testConnection(String(values.branch??'default'));if(!result.success)throw Error(result.message);}
                        else if(descriptor.capabilities.testConnection){const result=await (source as ZipUrlSource).testConnection();if(!result.ok)throw Error(String(result.error));}
                        else if(!sample)await source.getManifest(signal);
                        if(sample){const inventory=await source.getManifest(signal);const file=inventory.filter(entry=>entry.size<=2*1024*1024).sort((a,b)=>Number(!a.path.endsWith('.css'))-Number(!b.path.endsWith('.css'))||a.size-b.size)[0];
                                if(!file)throw Error(i18n.getLocale()==='ru'?'В источнике нет файла до 2 МБ для пробной загрузки':'No file below 2 MiB available for a sample download');
                                const data=await source.fetch(file,signal);await (await import('./src/core/source-validation')).verifyRemoteData(file,data);
                        }
                        signal.throwIfAborted();
                }finally{await source.dispose?.();}
        }

        openDriveInboxModal():void {
                const control=async(namespace:string,path:string,resolution?:DriveResolution)=>{
                        const stats=await this.runSession('retry',async()=>{await this.prepareSession();return this.executeSync('retry',[path],false,{namespace,resolution});});
                        if(!stats||stats.failed||stats.outcome==='cancelled'||!stats.results?.some(row=>row.path===path&&(!resolution||row.reason==='drive-restored-known')))
                                throw Error(stats?.problem??'Drive state changed or the binding is unavailable; refresh before continuing');
                };
                const modal=new DriveLifecycleModal(this.app,{load:()=>driveLifecycleHistory(this.fsAdapter),
                        probe:(namespace,path)=>control(namespace,path),restore:resolution=>control(resolution.namespace,resolution.entry.path,resolution),
                        isRunning:()=>this.sessionOwned||this.coordinator.isRunning()});trackModal(modal);modal.open();
        }

        openRecoveryModal():void {
                const vault=this.makeVaultAdapter();
                const withOwnership=async<T>(fn:(guard:()=>void)=>Promise<T>):Promise<T>=>{
                        if(this.sessionOwned||this.coordinator.isRunning())throw Error(i18n.getLocale()==='ru'?'Дождитесь завершения синхронизации':'Wait for synchronization to finish');
                        this.sessionOwned=true;const revision=this.getConfigurationRevision();
                        try{return await fn(()=>{if(revision!==this.getConfigurationRevision())throw Error('Settings changed during recovery; retry');});}
                        finally{this.sessionOwned=false;this.wakeAutoSync();}
                };
                const modal=new RecoveryModal(this.app,{
                        driveInbox:()=>this.openDriveInboxModal(),
                        load:async()=>{await this.mutations.store.load();const usage=await this.mutations.recovery.usage();return {records:this.mutations.store.records(),used:usage.used,limit:usage.limit};},
                        retention:async()=>{await this.mutations.store.load();const before=Date.now()-30*24*60*60*1000,ids=this.mutations.store.prunable(before).map(record=>record.id),refs=[...this.mutations.store.records().filter(record=>!ids.includes(record.id)).flatMap(record=>record.recovery?[record.recovery]:[]),...await driveRecoveryReferences(this.fsAdapter,this.mutations.recovery)];return {before,ids,objects:await this.mutations.recovery.unreferencedUsage(refs,before)};},
                        prune:preview=>withOwnership(async guard=>{guard();await this.mutations.store.prune(preview.before,preview.ids);guard();const refs=[...this.mutations.store.records().flatMap(record=>record.recovery?[record.recovery]:[]),...await driveRecoveryReferences(this.fsAdapter,this.mutations.recovery)];await this.mutations.recovery.collectUnreferenced(refs,preview.before);}),
                        verify:async id=>{await this.mutations.store.load();const record=this.mutations.store.records().find(r=>r.id===id);if(!record?.recovery)throw Error('Copy unavailable');await this.mutations.recovery.verify(record.recovery);},
                        export:async id=>{
                                await this.mutations.store.load();const record=this.mutations.store.records().find(r=>r.id===id);if(!record?.recovery)throw Error('Copy unavailable');
                                const bytes=await this.mutations.recovery.read(record.recovery),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
                                const anchor=document.createElement('a');anchor.href=url;anchor.download=(record.from??record.path).split('/').pop()??'recovered-file';document.body.append(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
                        },
                        restore:id=>withOwnership(guard=>this.mutations.restoreCopy(id,path=>this.makePolicy().isPathSafe(path)&&this.makePolicy().isPathAllowed(path),guard)),
                        inspect:async record=>({current:await observeLocal(vault,record.path),from:record.from?await observeLocal(vault,record.from):undefined}),
                        keep:(id,current,from)=>withOwnership(guard=>this.mutations.keepCurrent(id,current,from,guard)),
                        open:path=>{void this.app.workspace.openLinkText(path,'',true);},
                        isRunning:()=>this.sessionOwned||this.coordinator.isRunning(),
                });trackModal(modal);modal.open();
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
                        createBinary:typeof this.app.vault.createBinary==='function'?async(p,data)=>timed(`create ${data.byteLength}B`,p,async()=>{
                                await this.assertEditorSaved(p);if(await adapter.exists(norm(p)))throw new SyncFault('local-changed',`Destination was created after planning: ${p}`);
                                // Hidden config files are absent from Vault's indexed file map.
                                if(p.startsWith(this.app.vault.configDir+'/')&&Platform.isDesktopApp&&typeof (adapter as unknown as {getBasePath?:()=>string}).getBasePath==='function'){
                                        const fs:typeof import('node:fs/promises')=require('fs/promises');
                                        const nodePath:typeof import('node:path')=require('path');
                                        const base=(adapter as unknown as {getBasePath:()=>string}).getBasePath();
                                        await fs.writeFile(nodePath.join(base,norm(p)),new Uint8Array(data),{flag:'wx'});
                                }
                                else await this.app.vault.createBinary(norm(p),data);
                        }):undefined,
                        assertWritable:p=>this.assertEditorSaved(p),
                        compareAndWrite: async (p, data, expected, signal) => {
                                let previous: string;
                                let next: string;
                                try {
                                        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
                                        previous = decoder.decode(expected);
                                        next = decoder.decode(data);
                                } catch { return undefined; }
                                const file = this.app.vault.getFileByPath(norm(p));
                                if ((!file||file.extension!=='md')&&typeof adapter.process!=='function')return undefined;
                                const changed = new Error('Local file changed before atomic replacement');
                                try {
                                        const replace=(current:string)=>{signal?.throwIfAborted();if(current!==previous)throw changed;return next;};
                                        if(file?.extension==='md')await this.app.vault.process(file,replace);else await adapter.process(norm(p),replace);
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
                                return st ? { mtime: st.mtime, size: st.size,type:st.type } : null;
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

        private async assertEditorSaved(path:string):Promise<void> {
                const leaves=this.app.workspace?.getLeavesOfType('markdown')??[];
                for(const leaf of leaves){const view=leaf.view as unknown as {file?:{path:string};editor?:{getValue():string};data?:string};
                        if(view.file?.path.normalize('NFC').toLowerCase()!==normalizePath(path).normalize('NFC').toLowerCase()||!view.editor)continue;
                        if(!(await this.app.vault.adapter.exists(normalizePath(path))))throw new SyncFault('unsaved-editor',`Close or restore the missing file's editor before syncing: ${path}`);
                        let saved:string;try{saved=await this.app.vault.adapter.read(normalizePath(path));}
                        catch{throw new SyncFault('local-read',`The saved editor version cannot be read; original retained: ${path}`);}
                        if(view.editor.getValue()!==saved)throw new SyncFault('unsaved-editor',`Save or close the editor before syncing: ${path}`);
                }
        }
        private async exportSyncDiagnostics():Promise<void>{
                const data={build:BUILD_TAG,platform:Platform.isDesktopApp?'desktop':'mobile',exportedAt:new Date().toISOString(),
                        scheduler:this.schedulerSnapshot(),sessions:await this.journal.load(),pending:this.queue.all().map(file=>({...file,reason:diagnosticText(file.reason)}))};
                const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
                const link=document.createElement('a');link.href=url;link.download='vault-sync-diagnostics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
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
                        confirmSync: async (info,signal) => {
                                const accepted = await showConfirmModal(this.app, ['force','retry','scan'].includes(this.currentTrigger)?this.currentTrigger as ConfirmFlow:'sync', {
                                        operations:info.operations,
                                        sources:info.sources,
                                        movedCount:info.movedCount,
                                        deferredDeletions:info.deferredDeletions,
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
                                }, this.builtKind,signal??this.sessionController?.signal);
                                if (accepted) this.openStatusPopover();
                                else this.sessionController?.abort();
                                return accepted;
                        },
                        confirmRetry: async (count) => {
                                // [W2-T04] retry-flow: единый шаблон, секция toDownload.
                                return await showConfirmModal(
                                        this.app, 'retry', { toDownload: count }, this.builtKind,this.sessionController?.signal,
                                );
                        },
                        setStatus: (phase, progress) => {
                                this.sessionProgress=phase==='syncing'?progress:undefined;
                                this.statusBar.setState(phase, progress);
                                // [P1/M13 + P2/3.2] popover живёт вместе со статус-баром:
                                // тот же setStatus-поток координатора, включая фазу
                                // конвейера (progress.phase → pipelinePhase → полоса).
                                this.popoverView?.update(this.snapshotPopoverState());
                        },
                        notify: (message, timeoutMs) => {
                                if(!message||this.combinedSession&&message===i18n.t.noticeVaultUpToDate)return;
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
                                this.proposedLastSync = ts;
                        },
                };
        }

        // [3-review] мьютекс ask-модалок: следующая открывается после закрытия предыдущей
        private serializeAsk<T>(fn: () => Promise<T>,signal:AbortSignal|undefined=this.sessionController?.signal): Promise<T> {
                const invoke=()=>{signal?.throwIfAborted();return fn();};
                const run = this.askChain.then(invoke, invoke);
                this.askChain = run.then(() => undefined, () => undefined);
                return run;
        }

        // [W3-T03] private stableHash удалён: реестр владеет собственной djb2
                // (src/engines/registry.ts — байт-в-байт с прежней реализацией).

        /** Preserve confirmed effects if the final shared queue/settings checkpoint fails. */
        private async finalizeEngineResult(stats: import('./src/sources/types').SyncStats): Promise<void> {
                try {await this.persistEngineState('session-end');}
                catch(error){
                        const issue=syncIssue(new SyncFault('settings-save',`Final sync state could not be saved: ${diagnosticText(error)}`,'session',false,'shared'),'checkpoint');
                        stats.problems=[...stats.problems??[],issue];stats.problem=issue.message;stats.outcome='error';
                }
        }

        private async persistEngineState(kind: 'checkpoint' | 'session-end' | 'success-end'): Promise<void> {
                this.settings.failedQueue = this.queue.all();
                (this.settings.failedQueues ??= {})[this.cache.namespace] = this.queue.all();
                for(const [id,files] of Object.entries(this.settings.failedQueues))if(id!==this.cache.namespace&&!files.length)delete this.settings.failedQueues[id];
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
                new Setting(containerEl).setName(t.settSyncNow).setDesc(t.settSyncNowDesc)
                        .addButton(btn => btn.setButtonText(t.settSyncBtn).setCta().onClick(() => this.plugin.syncNow()));
                new Setting(containerEl).setName(i18n.getLocale() === 'ru' ? 'Восстановительные копии' : 'Recovery copies')
                        .setDesc(i18n.getLocale() === 'ru' ? 'Проверить сохранённую версию, скачать её или восстановить отдельным файлом.' : 'Verify a saved version, download it or restore it as a separate file.')
                        .addButton(btn => btn.setButtonText(i18n.getLocale() === 'ru' ? 'Открыть восстановление' : 'Open recovery').onClick(() => this.plugin.openRecoveryModal()));
                if(Platform.isMobileApp)new Setting(containerEl).setName(i18n.getLocale()==='ru'?'Максимальный размер мобильного архива, МБ':'Maximum mobile archive size, MiB').setDesc(i18n.getLocale()==='ru'?'От 1 до 32 МБ; требуется известный размер ответа. Платформа получает архив целиком в память.':'1–32 MiB; response size must be known. The platform buffers the whole archive.').addText(text=>text.setValue(String(Math.min(this.plugin.settings.mobileArchiveWarnBytes||32,32))).onChange(raw=>{const limit=Number(raw);if(Number.isSafeInteger(limit)&&limit>=1&&limit<=32){this.plugin.settings.mobileArchiveWarnBytes=limit;void this.plugin.saveSettings();}}));
                new Setting(containerEl).setName(t.settUseTrash).setDesc(t.settUseTrashDesc)
                        .addToggle(toggle=>toggle.setValue(this.plugin.settings.useTrash).onChange(v=>{this.plugin.settings.useTrash=v;this.plugin.saveSettings();}));

                const resourceSetting=(name:string,description:string,value:number,min:number,max:number,save:(value:number)=>void)=>new Setting(containerEl).setName(name).setDesc(description).addText(text=>text.setValue(String(value)).onChange(raw=>{const number=Number(raw);if(Number.isSafeInteger(number)&&number>=min&&number<=max){save(number);void this.plugin.saveSettings();}}));
                if(Platform.isDesktopApp)resourceSetting(i18n.getLocale()==='ru'?'Максимальный размер загружаемого файла, МБ':'Maximum downloaded file size, MiB',i18n.getLocale()==='ru'?'От 4 до 256 МБ. Повышение требует больше памяти; ZIP-запись ограничена 64 МБ.':'4–256 MiB. Raising this requires more memory; each ZIP entry remains limited to 64 MiB.',this.plugin.settings.maxPayloadMiB??64,4,256,value=>this.plugin.settings.maxPayloadMiB=value);
                resourceSetting(i18n.getLocale()==='ru'?'Место для восстановительных копий, МБ':'Recovery storage limit, MiB',i18n.getLocale()==='ru'?'При исчерпании запись останавливается. Можно увеличить лимит или удалить старую историю в окне восстановления.':'Writes stop when capacity is exhausted. Raise the limit or remove old history in Recovery.',this.plugin.settings.recoveryLimitMiB??512,1,32768,value=>this.plugin.settings.recoveryLimitMiB=value);
                resourceSetting(i18n.getLocale()==='ru'?'Лимит операций в истории':'Operation history limit',i18n.getLocale()==='ru'?'От 100 до 100000. Увеличение сохраняет существующую историю; очистка выполняется отдельно в окне восстановления.':'100–100000. Raising this retains existing history; cleanup is a separate action in Recovery.',this.plugin.settings.historyLimit??10000,100,100000,value=>this.plugin.settings.historyLimit=value);

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
                        const fallback = summary.lastOutcome === 'ok' ? t.jrnl.outcomeOk
                                : summary.lastOutcome === 'cancelled' ? t.jrnl.outcomeCancelled : t.jrnl.outcomeError;
                        const outcomeText = entries[0] ? sessionLabel(entries[0], fallback) : fallback;
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
                        autoDiv.append(jobCards(this.plugin.automaticJobSnapshots()));
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
                        const softMode = false;
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
