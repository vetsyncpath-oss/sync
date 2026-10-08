// [W2-T01] Типы словарей вынесены из main.ts (байт-в-байт, 2.3.3).
// Отступы — пробелы (стиль исходного main.ts), не табы (стиль core).

import type { VaultTreeModalLabels } from '../ui/vault-tree-modal';

export type Locale = 'en' | 'ru';

/** [W2-T08] Подписи журнала сессий: модалка из popover + чипы Диагностики
 *  (единый источник данных — core/journal.ts, решение В6=3). */
export interface JournalLabels {
        title: string;
        empty: string;
        colWhen: string;
        colDuration: string;
        colEngine: string;
        colLevel: string;
        colTrigger: string;
        triggerManual: string;
        triggerAuto: string;
        triggerRetry: string;
        triggerScan: string;
        triggerForce: string;
        outcomeOk: string;
        outcomeCancelled: string;
        outcomeError: string;
        statDownloaded: (n: number) => string;
        statUpdated: (n: number) => string;
        statDeletedLight: (n: number) => string;
        statDeletedFull: (n: number) => string;
        statOverwritten: (n: number) => string;
        statConflicts: (n: number) => string;
        statSkipped: (n: number) => string;
        statErrors: (n: number) => string;
        topErrors: string;
        durationSec: (s: number) => string;
        durationMs: (ms: number) => string;
        never: string;
}

/** [W2-T03] Подписи popover «штаб синхронизации» (Д5=1): шапка/фазы/
 *  действия/сводка последней сессии/ссылки. */
export interface PopoverLabels {
        title: string;
        // фазы конвейера (i/6)
        phaseManifest: string;
        phasePolicy: string;
        phaseDiff: string;
        phaseDeletions: string;
        phaseDownloads: string;
        phaseFinalize: string;
        // статус-бейдж idle (короткая подпись, не tooltip)
        statusIdle: string;
        // прогресс
        fileProgress: (i: number, n: number) => string;
        currentPath: (path: string) => string;
        bytesProgress: (transferred: string, total: string) => string;
        // действия
        actionSync: string;
        actionCancel: string;
        actionRetry: string;
        actionPauseAuto: string;
        // сводка
        lastSession: string;
        noLastSession: string;
        conflictsSection: string;
        conflictsHint: string;
        // ссылки
        linkJournal: string;
        linkSettings: string;
        close: string;
}

/** [W2-T04] Единый confirm-modal (В5=1+2): один шаблон для sync/force/
 *  retry/scan; секции по уровням; downloadBytes; список путей топ-10. */
export interface ConfirmLabels {
        titleSync: string;
        titleForce: string;
        titleRetry: string;
        titleScan: string;
        // подпись движка (BUG-10: имя движка подставляется, НЕ хардкод)
        engineLabel: string;
        // секции (рендерятся только ненулевые)
        sectionDownload: (n: number) => string;
        sectionUpdate: (n: number) => string;
        sectionNew: (n: number) => string;
        sectionRestore: (n: number) => string;
        sectionDeleteLight: (n: number) => string;
        sectionDeleteFull: (n: number) => string;
        sectionOverwrite: (n: number) => string;
        sectionOrphan: (n: number) => string;
        bytesLine: (bytes: string) => string;
        pathsTitle: string;
        pathsMore: (n: number) => string;
        dangerWarning: string;
        noRecovery: string;
        proceed: string;
        cancel: string;
}

/** [W2-T05] Чипы Диагностики — живые показатели из журнала (В6=3):
 *  единый источник journal.ts; «N ошибок» кликабелен → failed-список. */
export interface DiagLabels {
        sectionTitle: string;
        lastOutcomeLabel: string;
        lastTimeLabel: string;
        errors24h: (n: number) => string;
        conflicts24h: (n: number) => string;
        sessionsTotal: (n: number) => string;
        trackedFiles: (n: number) => string;
        openJournal: string;
        clearFailedQueue: string;
        failedQueue: (n: number) => string;
        // [overhaul v4 / Этап 5 / F2] unresolved conflict copies count
        unresolvedConflicts: (n: number) => string;
        // W4 placeholder (пока пустые блоки, wiring в W4)
        autoSection: string;
}

/** [W2-T06] Онбординг первого запуска (Д8=1): три карточки с живыми
 *  счётчиками из манифеста; workspace-чекбокс; mobile-предупреждение. */
export interface OnboardingLabels {
        title: string;
        subtitle: string;
        cardFull: (files: number, sizeMb: string) => string;
        /** [P1/M18] Подпись карточки «весь vault», когда размер/число файлов
         *  источника ещё не известны (первый запуск). */
        cardFullUnknown: string;
        cardFullDesc: string;
        cardObsidian: string;
        cardObsidianDesc: string;
        cardCustom: string;
        cardCustomDesc: string;
        workspaceSync: string;
        workspaceSyncDesc: string;
        mobileWarn: string;
        changeLater: string;
        levelHint: string;
        confirm: string;
        cancel: string;
}

/** [W3-T01] Общие подписи для рендера полей настроек движков
 *  (SettingsTab по SettingField[], единый для всех движков).
 *  Заполняется в en/ru.ts — контракт обязательный (как у jrnl/pop/cfm). */
export interface EngineFieldLabels {
        // индикатор «обязательное поле» (звёздочка или текст «required»)
        required: string;
        // универсальная подпись ошибки валидации (параметризуется путём поля)
        invalid: (fieldLabel: string) => string;
        // кнопка «Apply» (сохранить значение поля)
        apply: string;
        // кнопка «Test Connection» (W3-T04 — лёгкая проверка соединения)
        test: string;
}

/** [W3-T03] Подписи движков и полей настроек по схеме.
 *  Каждый движок имеет labelKey в дескрипторе, который ссылается сюда.
 *  Заполняется в en/ru.ts — контракт обязательный. */
export interface EngineLabels {
        // git
        git: {
                label: string;
                repoUrl: string;
                repoUrlHelp: string;
                repoUrlPlaceholder: string;
                accessToken: string;
                accessTokenHelp: string;
                branch: string;
                branches: { all: string; default: string };
                /** [W6-T04] GitHub Enterprise / Gitea API root */
                baseUrl: string;
                baseUrlHelp: string;
                baseUrlPlaceholder: string;
        };
        // yandex
        yandex: {
                label: string;
                vaultUrl: string;
                token: string;
        };
        // zip-url
        zipurl: {
                label: string;
                vaultUrl: string;
                placeholder: string;
        };
        // [W6-T03] Google Drive native
        gdrive: {
                label: string;
                apiKey: string;
                apiKeyHelp: string;
                folderId: string;
                folderIdHelp: string;
                folderIdPlaceholder: string;
                includeDocs: string;
                includeDocsHelp: string;
        };
        // [W6-T05] WebDAV native
        webdav: {
                label: string;
                baseUrl: string;
                baseUrlHelp: string;
                baseUrlPlaceholder: string;
                username: string;
                usernameHelp: string;
                password: string;
                passwordHelp: string;
                rootPath: string;
                rootPathHelp: string;
                rootPathPlaceholder: string;
        };
}

/** [VAM] Контроль доступа (src/vam/vam-bridge + src/vam/vam-guard):
 *  гейт сессий синка (§5 донора — «работа, требующая входа»), статусная
 *  модалка, локализация машинных кодов причин протокола VAM v4 (§7 —
 *  «локализуйте у себя, не сравнивайте с UI-строками»). */
export interface VamLabels {
        /** Команда палитры: «Статус доступа (VAM)». */
        cmdStatus: string;
        /** Notice при отказе в работе (assertVamAllowed, троттлинг 3 с). */
        noticeDenied: string;
        /** Текст VamAccessError (err.message; err.name стабилен — машинный). */
        errorDenied: string;
        /** Notice при mid-session отзыве (onRevoked); параметр — причина. */
        noticeRevoked: (reason: string) => string;
        /** Notice при активации мягкого режима (10-кликовый бэкдор модалки). */
        noticeSoftModeOn: string;
        /** Секция Диагностики настроек. */
        section: string;
        /** Чип статуса в Диагностике. */
        chipGranted: string;
        chipBlocked: string;
        chipPending: string;
        /** Суффикс чипа при активном мягком режиме. */
        chipSoftSuffix: string;
        /** Кнопка «Статус доступа…» в Диагностике. */
        openStatusBtn: string;
        /** Причина блокировки в Диагностике. */
        blockedReason: (reason: string) => string;
        /** Статусная модалка (VamStatusModal). */
        modalGranted: string;
        modalGrantedSoft: string;
        modalDenied: string;
        modalOkBtn: string;
        /** describeVamStatus: служебные строки (статус-команда/логи). */
        statusNoGuard: string;
        statusHeadGranted: string;
        statusHeadPending: string;
        statusHeadBlocked: string;
        statusReasonPrefix: string;
        /** Локализация машинных кодов причин (стабильные коды, §7). */
        reasonKillSwitch: string;
        reasonRevoked: string;
        reasonExpired: string;
        reasonTtl: string;
        reasonWrongPassword: string;
        reasonKeyMismatch: string;
        reasonNoPassword: string;
        reasonUnconfigured: string;
        reasonAwaitingApproval: string;
        reasonChannelError: string;
        reasonVamMissing: string;
        reasonVamUnloaded: string;
        reasonNoCode: string;
}

export interface Translations {
        // --- Status Bar ---
        sbSyncing: string;
        sbSyncInProgress: string;
        sbError: string;
        sbErrorCount: (n: number) => string;
        sbSyncFailed: string;
        sbConflicts: (n: number) => string;
        sbConflictsTooltip: string;
        sbOffline: string;
        sbOfflineTooltip: string;
        sbUnconfigured: string;
        sbUnconfiguredTooltip: string;
        sbIdleTooltip: (lastSync: string) => string;

        // --- Time formatting ---
        timeJustNow: string;
        timeMinutesAgo: (n: number) => string;
        timeHoursAgo: (n: number) => string;
        timeDaysAgo: (n: number) => string;
        timeNever: string;

        // --- Notices ---
        noticeSyncInProgress: string;
        noticeNoInternet: string;
        noticeConfigMissing: string;
        noticeCancelling: string;

        noticeVaultUpToDate: string;
        noticeSyncCancelled: string;
        noticeDeletingFiles: (n: number) => string;
        noticeSyncedWithErrors: (n: number) => string;
        noticeSuccess: (downloaded: number, deleted: number, conflicts: number, duration: string) => string;
        noticeSyncFailed: (msg: string) => string;
        noticeRateLimited: (sec: number) => string;
        noticeNoFailedFiles: string;
        noticeRetryNotDue: (n: number) => string;
        /** [overhaul S6 / D-4] N записей очереди припаркованы (retry cap):
         *  автоповторы прекращены, нужно вмешательство (Force Resync / Clear Queue). */
        noticeRetryParked: (n: number) => string;
        noticeFailedQueueCleared: string;
        noticeConflictKeptLocal: (path: string) => string;
        noticeConflictBoth: (path: string) => string;
        noticeOrphanFiles: (n: number) => string;
        noticeScanFailed: (msg: string) => string;
        /** [overhaul S2/M-8] data.json повреждён; восстановлено из .bak. */
        noticeSettingsCorruptBackup: string;
        /** [overhaul S2/M-8] data.json повреждён безвозвратно; сброс к дефолтам. */
        noticeSettingsCorruptDefaults: string;
        noticeNoMissingFiles: string;
        /** [W4-T02] Auto-сессия отложила N опасных удалений. */
        noticeDeletionsDeferred: (n: number) => string;
        noticeRepoUrlEmpty: string;
        noticeInvalidUrl: string;
        noticeConnected: (msg: string) => string;
        noticeConnectionFailed: (msg: string) => string;

        // --- Orphan notification ---

        // --- Commands ---
        cmdSyncFromGit: string;
        cmdRetryFailed: string;
        cmdForceReset: string;
        cmdCancelSync: string;
        cmdScanMissing: string;
        cmdRibbonTooltip: string;

        // --- Settings Tab ---
        settHeading: string;
        // --- [7-a] Источник хранилища ---
        settSourceSection: string;
        settSourceType: string;
        settSourceTypeDesc: string;
        srcGit: string;
        srcYandex: string;
        srcZip: string;
        settVaultUrl: string;
        settVaultUrlDescYandex: string;
        settVaultUrlDescZip: string;
        settVaultUrlPlaceholderYandex: string;
        settVaultUrlPlaceholderZip: string;
        noticeVaultUrlEmpty: string;
        noticeCheckingSource: string;
        noticeYandexTested: (n: number) => string;
        noticeZipTested: (n: number) => string;
        /** [P0/M2] Test Connection для gdrive/webdav — полный getManifest. */
        noticeManifestTested: (n: number) => string;
        /** [P0/M2] Guard required-поля схемы движка при Test Connection. */
        noticeRequiredFieldEmpty: (field: string) => string;
        /** [P0/P0-6] Суффикс «(экспериментально)» в дропдауне движков. */
        experimentalTag: string;
        /** [P0/P0-6] Предупреждение над полями экспериментального движка. */
        noticeExperimentalEngine: string;
        noticeSourceSwitched: string;
        noticeSkippedUnsafe: (n: number) => string;
        settMobileWarn: string;
        settMobileWarnDesc: string;
        errMobileArchiveTooLarge: (size: string, limitMb: number) => string;
        settConnection: string;
        settRepoUrl: string;
        settRepoUrlDesc: string;
        settRepoUrlPlaceholder: string;
        settAccessToken: string;
        settAccessTokenDesc: string;
        settAccessTokenPlaceholder: string;
        settBranch: string;
        settBranchPlaceholder: string;
        settTestConnection: string;
        settTestConnectionDesc: string;
        settTestConnectionBtn: string;
        settOptions: string;
        settUseTrash: string;
        settUseTrashDesc: string;
        settConflictStrategy: string;
        settConflictStrategyDesc: string;
        settConflictKeepBoth: string;
        settConflictRemoteWins: string;
        settConflictLocalWins: string;
        settConflictAsk: string;
        // [overhaul v4 / Этап 3] Light mirror conflict strategy
        settLightConflictStrategy: string;
        settLightConflictStrategyDesc: string;
        lcsKeepLocal: string;
        lcsKeepBoth: string;
        // [overhaul v4 / Этап 5] Warnings
        noticeAutoFullMirrorWarning: string;
        noticeFullMirrorConfigOnlyWarning: string;
        settSecurity: string;
        settSecurityDesc: string;
        settAllowPlugins: string;
        settAllowPluginsDesc: string;
        settAllowSnippets: string;
        settAllowSnippetsDesc: string;
        settActions: string;
        settFailedFiles: (n: number) => string;
        settFailedMore: (n: number) => string;
        settRetryBtn: string;
        settClearQueueBtn: string;
        settSyncNow: string;
        settSyncNowDesc: string;
        settSyncBtn: string;
        settMaintenance: string;
        settScanMissing: string;
        settScanMissingDesc: string;
        settScanBtn: string;
        settForceResync: string;
        settForceResyncDesc: string;
        settForceResyncBtn: string;
        settStatistics: string;
        // [W2-T05] каркас SettingsTab: Behavior-секция (Д9=1) + уровень зеркала
        settBehaviorSection: string;
        settMirrorLevelLabel: string;
        settLastSync: (time: string) => string;
        settTotalSyncs: (n: number) => string;
        settTrackedFiles: (n: number) => string;
        settFailedCount: (n: number) => string;
        settLanguage: string;
        settLanguageDesc: string;

        // --- [W4-T04] Авто-синхронизация (планировщик) — секция в Behavior ---
        settAutoSection: string;
        settAutoInterval: string;
        settAutoIntervalDesc: string;
        autoOff: string;
        autoStartupOnly: string;
        auto15m: string;
        auto30m: string;
        auto1h: string;
        auto2h: string;
        settVerboseNotices: string;
        settVerboseNoticesDesc: string;
        autoPause: string;
        autoResume: string;
        autoNextIn: (n: number) => string;
        autoOffState: string;
        autoPausedState: string;

        // --- [W5-T01] Governance (fail-closed manager auth) ---
        noticeGovernanceBlocked: (reason: string) => string;
        noticeManagerRequired: string;
        noticeGovernanceReset: string;
        settGovernanceSection: string;
        settGovernanceStatusNone: string;
        settGovernanceStatusOk: string;
        settGovernanceStatusBlocked: string;
        settGovernanceStatusChecking: string;
        settGovernanceManagerActive: string;
        settGovernanceLastChecked: (time: string) => string;
        settGovernanceResetBtn: string;
        settGovernanceResetDesc: string;
        settGovernanceResetConfirmTitle: string;
        settGovernanceResetConfirmBody: string;
        settGovernanceResetWarning: string;
        settGovernanceBlockedReason: (reason: string) => string;

        // --- Modals ---
        modalCancel: string;
        modalConfirm: string;
        settPresetLabel: string;
        settPresetDesc: string;
        presetFullOpt: string;
        presetObsidianOpt: string;
        presetCustomOpt: string;
        modalConflictTitle: string;
        modalConflictDesc: string;
        modalConflictQuestion: string;
        modalConflictKeepRemote: string;

        // --- Errors ---
        errInvalidUrl: string;
        errBranchNotFound: (branch: string) => string;
        errFetchBranch: (status: number) => string;
        errFetchTree: string;
        errTreeTruncated: string;
        errHtmlInsteadOfArchive: (url: string) => string;
        errYandexLinkInvalid: string;
        noticeRateLimitedCloud: (sec: number) => string;
        errRateLimitExceedsHourCloud: string;
        errYandexStructureChanged: string;
        /** [P2/M10] Файл без sha256 в листинге — сессия остановлена (не тихий пропуск). */
        errYandexFileWithoutHash: (path: string) => string;
        errNotAnArchive: (url: string) => string;
        errFileTooLarge: (size: string, limit: string) => string;
        errRateLimitExceedsHour: string;

        // --- [P0/M1] Ошибки движков gdrive/webdav (инъектируются через engineCtx) ---
        errGdriveApiKeyMissing: string;
        errGdriveListFailed: (status: number) => string;
        errGdriveDownloadFailed: (status: number) => string;
        errGdriveFileNotFound: (path: string) => string;
        errGdriveInvalidResponse: (msg: string) => string;
        errGdriveManifestTruncated: string;
        /** [overhaul S1/H-5] Обычный файл без size — fail-closed (паритет с яндексом). */
        errGdriveFileWithoutSize: (path: string) => string;
        errWebdavCredentialsMissing: string;
        errWebdavPropfindFailed: (status: number) => string;
        errWebdavDownloadFailed: (status: number) => string;
        errWebdavFileNotFound: (path: string) => string;
        errWebdavInvalidXml: (msg: string) => string;
        errWebdavManifestTruncated: string;
        /** [overhaul S1/H-5] Файл без валидного getcontentlength — fail-closed. */
        errWebdavFileWithoutSize: (path: string) => string;

        // --- [W2-T02] Названия уровней зеркала (общие: чип, настройки, модалки) ---
        mlnFetch: string;
        mlnLight: string;
        mlnFull: string;
        mlnFetchDesc: string;
        mlnLightDesc: string;
        mlnFullDesc: string;

        // --- [W2-T02] Чип уровня в статус-баре (Д13=1) ---
        mcChipFetch: string;
        mcChipLight: string;
        mcChipFull: string;
        mcTipFetch: string;
        mcTipLight: string;
        mcTipFull: string;

        // --- [W2-T08] Журнал сессий (Д7=1) ---
        jrnl: JournalLabels;

        // --- [W2-T03] Popover «штаб синхронизации» (Д5=1) ---
        pop: PopoverLabels;

        // --- [W2-T04] Единый confirm-modal (В5=1+2) ---
        cfm: ConfirmLabels;

        // --- [W2-T05] Чипы Диагностики ---
        diag: DiagLabels;

        // --- [W2-T06] Онбординг первого запуска ---
        onb: OnboardingLabels;

        // --- [W3-T01] Подписи полей настроек движков (заполняется в en/ru.ts) ---
        efl: EngineFieldLabels;

        // --- [W3-T03] Подписи движков + полей настроек по схеме ---
        eng: EngineLabels;

        // --- Vault Structure Policy (Phase 3) ---
        settPolicySection: string;
        settPolicyButton: string;
        settPolicyButtonDesc: string;
        noticePolicyModalBlocked: string;
        vts: VaultTreeModalLabels;

        // --- [VAM] Контроль доступа (vam-bridge/vam-guard) ---
        vam: VamLabels;
}
