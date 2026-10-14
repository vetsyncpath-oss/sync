// ============================================================
// --- SOURCES/TYPES: контракты ядра синхронизации (фаза 3-1) ---
// Optional observation ports preserve compatibility with existing sources and transports.
// Ядро core/ НЕ импортирует obsidian/node — только эти интерфейсы
// и собственные зависимости друг друга (решение В5-1).
// ============================================================

/**
 * Алгоритм/природа хэша записи.
 *
 * [P2/M9] 'weak' и 'etag' — СЛАБАЯ идентичность (не хэш содержимого):
 *   • 'sha256'  — реальный SHA-256 содержимого (yandex, gdrive с sha256Checksum);
 *   • 'crc32'   — CRC32 несжатого содержимого (zip-url);
 *   • 'git-sha1' — git blob SHA-1 (git);
 *   • 'weak'    — синтезированный токен `*-weak:<size_hex>-<mtime_hex>`
 *                 (gdrive без sha256Checksum / webdav без ETag): меняется
 *                 от size+mtime, локально НЕ воспроизводим;
 *   • 'etag'    — серверный ETag-токен (webdav), локально НЕ воспроизводим.
 *
 * Правило (контракт RemoteEntry.hash): для sha256/crc32/git-sha1 hash — hex
 * в нижнем регистре; для weak/etag — непрозрачный токен источника. Diff
 * сравнивает записи только при совпадении alg; конфликт-резолвер для
 * weak/etag НЕ считает локальный хэш (см. conflict.ts computeLocalHash).
 */
export type HashAlg = 'sha256' | 'crc32' | 'git-sha1' | 'weak' | 'etag';

/** Одна запись манифеста источника (файл в облаке / репозитории). */
export interface RemoteEntry {
        connectionId?: string;
        /** Original provider path for preview/results; fetch uses the session locator. */
        sourcePath?: string;
        /** Human-readable provider origin for the tree. */
        provider?: string;
        /** Относительный путь в vault, POSIX-разделители. */
        path: string;
        /** Хэш содержимого: hex, нижний регистр — для контентных alg
         *  (sha256/crc32/git-sha1); непрозрачный токен источника — для
         *  weak/etag ([P2/M9], см. HashAlg). */
        hash: string;
        /** Каким алгоритмом посчитан hash (для weak/etag — вид токена). */
        hashAlg: HashAlg;
        /** Размер несжатого содержимого, байт. */
        size: number;
        /** mtime источника (epoch-ms), только для UI. Опционален. */
        modified?: number;
        /** Internal routing result: path is already the final vault destination. */
        resolvedDestination?: boolean;
}

/**
 * Источник хранилища: Git / Яндекс.Диск / ZIP-ссылка / Google Drive / WebDAV
 * (дизайн §3.2). [W6-T03] добавлен 'gdrive'; [W6-T05] добавлен 'webdav'.
 */
export interface SyncSource {
        /** Optional ID-aware, read-only inventory for UI; never an execution manifest. */
        getBrowseSnapshot?(signal: AbortSignal): Promise<import('./remote-browse').RemoteBrowseSnapshot>;
        readonly sources?: readonly { id: string; name: string; kind: string }[];
        readonly maxConcurrentDownloads?: number;
        readonly kind: 'git' | 'yandex' | 'zip-url' | 'gdrive' | 'webdav';
        /** Only validated immutable inventories may currently authorize mirror deletion. */
        readonly deletionSafety?: 'immutable' | 'unverified';
        /**
         * Движковый лимит размера ОДНОГО файла, байт; undefined — лимита нет.
         * Это свойство хранилища, а не настройка: GitHub жёстко ограничивает
         * blob'ы (~100 МБ — пуш и Blobs API), облачные диски и ZIP-архивы
         * пер-файловых лимитов не имеют. Coordinator консультируется
         * с источником на каждой сессии (в т.ч. после setSource).
         */
        readonly maxFileSizeBytes?: number;
        fileSizeLimit?(entry:RemoteEntry): number|undefined;
        /** Полный список файлов источника с их хэшами. */
        getManifest(signal: AbortSignal, observe?: TransferObserver): Promise<RemoteEntry[]>;
        /** Загрузка содержимого одного файла. */
        fetch(entry: RemoteEntry, signal: AbortSignal, observe?: TransferObserver): Promise<ArrayBuffer>;
        forceDispose?(): void | Promise<void>;
        /** [5-1] Освобождение сессионных ресурсов (tmp-архив ZIP-источника). Coordinator зовёт в finally. */
        dispose?(): Promise<void>;
}

/** Запись кэша манифеста (последнее применённое состояние). */
export interface CacheEntry {
        /** Хэш применённой версии, hex нижний регистр. */
        h: string;
        /** Размер, байт. */
        s: number;
        /** Алгоритм хэша. */
        alg: HashAlg;
        /** [REV-P4] Дата применения (epoch-ms), только для отображения в UI
         *  («синхронизировано 24.08»). Опционально: старые записи без поля
         *  валидатор пропускает, отображаются без даты. НЕ участвует в diff. */
        t?: number;
}

/** Кэш манифеста: путь → последняя синхронизированная версия. */
export type CacheEntries = Record<string, CacheEntry>;

/** Параметры сравнения (дизайн §8.2). */
export interface DiffOptions {
        deleteMissing: boolean;
        isAllowed: (path: string) => boolean;
        /** Проверка существования локального файла (для MISSING_LOCAL). */
        exists: (path: string) => Promise<boolean>;
}

/** Результат сравнения кэша с удалённым манифестом (дизайн §8.2). */
export interface DiffResult {
        /** Файлы к загрузке: NEW / MODIFIED / MISSING_LOCAL. */
        toDownload: RemoteEntry[];
        /** Локальные пути к удалению (deleteMissing=true). */
        toDelete: string[];
        /** Локальные пути, удалённые в источнике, но оставляемые (orphan-режим). */
        orphans: string[];
        /** Ключи кэша, подлежащие чистке (удалённые из источника + вне политики). */
        cacheCleanup: string[];
        /** Число файлов без изменений. */
        upToDate: number;
}

/** Файловые операции над vault, изолирующие core/ от Obsidian API. */
export interface VaultAdapter {
        /** Create a new file without replacing an existing destination. */
        createBinary?(path: string, data: ArrayBuffer): Promise<void>;
        exists(path: string): Promise<boolean>;
        readBinary(path: string): Promise<ArrayBuffer>;
        writeBinary(path: string, data: ArrayBuffer): Promise<void>;
        /** Optional host atomic text replacement; undefined means unsupported binary/path. */
        compareAndWrite?(path: string, data: ArrayBuffer, expected: ArrayBuffer, signal?: AbortSignal): Promise<boolean | undefined>;
        mkdir(path: string): Promise<void>;
        remove(path: string): Promise<void>;
        rename(from: string, to: string): Promise<void>;
        assertWritable?(path: string): void | Promise<void>;
        stat(path: string): Promise<{ mtime: number; size: number; type?: string } | null>;
        /** [4-1] Системная корзина; реализация опциональна (платформа/тесты). */
        trash?(path: string): Promise<void>;
        /** [4-1] Листинг каталога (чистка пустых папок); опционально. */
        list?(path: string): Promise<{ files: string[]; folders: string[] }>;
}

/** HTTP-транспорт, изолирующий core/ от requestUrl / Node https. */
export interface NetTransport {
        fetch(url: string, options: NetRequest): Promise<NetResponse>;
}

export type PipelineStage = 'preparing' | 'recovery' | 'manifest' | 'observe-local' | 'confirm' | 'download-link' | 'download' | 'waiting' | 'verify' | 'prepare-directory' | 'apply' | 'checkpoint' | 'finalize' | 'cancelling';
export interface TransferEvent {
        source?:string;items?:number;
        stage: PipelineStage;
        attempt?: number; maxAttempts?: number;
        bytes?: number; totalBytes?: number; byteDelta?: number;
        retryAt?: number; status?: number; host?: string;
        capability?: 'streaming' | 'buffered';
}
export type TransferObserver = (event: TransferEvent) => void;
export interface SyncIssue {
        code: string; message: string; stage: PipelineStage;
        retryable: boolean; scope: 'file' | 'source' | 'session';
        status?: number; attempt?: number; retryAt?: number; host?: string;
}
export interface FileActivity extends TransferEvent { path: string; source?: string; lastActivityAt: number }

export interface NetRequest {
        observe?: TransferObserver;
        maxBytes?: number;
        method?: string;
        headers?: Record<string, string>;
        signal?: AbortSignal;
        /**
         * [W6-T05] Тело запроса для POST/PUT/PROPFIND (для WebDAV).
         * FetchTransport проксирует в globalThis.fetch. Отсутствует для GET
         * (по умолчанию — undefined = нет тела, как в 2.3.3).
         */
        body?: BodyInit;
        redirect?: RequestRedirect;
}

export interface NetResponse {
        status: number;
        /** Заголовки с ключами в НИЖНЕМ регистре. */
        headers: Record<string, string>;
        arrayBuffer(): Promise<ArrayBuffer>;
        text(): Promise<string>;
        /** [overhaul S3/M-12] Явно освободить ответ БЕЗ чтения тела (снятие
         *  таймаут-таймеров/abort-листенеров транспорта). Звать, когда тело
         *  точно не будет читаться (4xx/429/5xx/304-ветки); опционально —
         *  транспорт без ресурсного состояния может не реализовывать. */
        discard?(): void;
}

/** Файловая система для кэшей (каталог плагина), изолирует core/ от Node fs. */
export interface FileSystem {
        read(path: string): Promise<string | null>;
        write(path: string, content: string): Promise<void>;
        rename(from: string, to: string): Promise<void>;
        assertWritable?(path: string): void | Promise<void>;
        exists(path: string): Promise<boolean>;
        remove(path: string): Promise<void>;
        /** Список имён файлов каталога (для GC старых кэшей). */
        list(): Promise<string[]>;
}

// --- Конфликты (дизайн §9) ---

export type ConflictStrategy = 'remote-wins' | 'local-wins' | 'keep-both' | 'ask';

/**
 * [overhaul v4 / Этап 3] Стратегия конфликтов для Light mirror.
 *  - 'keep-local' (default, текущее поведение): локальная версия ОСТАЁТСЯ
 *    на месте, remote кладётся в .conflict-<ts> копию РЯДОМ. Кэш
 *    обновляется remote-хэшем — diff перестаёт видеть расхождение;
 *    пользователь разбирает конфликт вручную.
 *  - 'keep-both': локальная версия в .conflict-<ts> копию, remote —
 *    на место (как fetch-keep-both). Симметрично с fetch, но активна
 *    на уровне light.
 *
 * Не включает 'remote-overwrites' и 'ask' (упрощённое предложение A):
 * full mirror перезаписывает после создания восстановительной копии; ask добавляет
 * модалки и сложность — отложено до будущих волн.
 */
export type LightConflictStrategy = 'keep-local' | 'keep-both';

/**
 * [overhaul v4 / Этап 2] Per-file/per-glob исключение из синхронизации.
 *
 * Файлы, попадающие под паттерн:
 *  - НЕ скачиваются из источника (applyPolicy пропускает их на этапе
 *    формирования transformedManifest);
 *  - НЕ удаляются при mirror='light'/'full' (planMirrorDeletions
 *    защищает их от orphan/local-only удалений);
 *  - кэш НЕ чистится как orphan (если кэш-ключ попадает под exclusion,
 *    mirror.ts оставляет его в skippedExcluded, не в cacheCleanup).
 *
 * Паттерн — минималистичный glob (src/core/file-glob.ts):
 *  - '*'   → любой сегмент имени (без '/');
 *  - '**'  → любые символы включая '/';
 *  - '?'   → один любой символ (без '/');
 *  - литералы экранируются.
 *
 * Примеры:
 *  - { pattern: 'data.json' }              — любой data.json на любой глубине
 *  - { pattern: '*.log' }                  — все .log файлы по basename
 *  - { pattern: 'notes/*.tmp' }             — .tmp только в notes/
 *  - { pattern: 'workspace.json', scope: '.obsidian' } — workspace.json
 *    только внутри .obsidian
 */
export interface FileExclusion {
        /** Glob-паттерн (см. src/core/file-glob.ts). */
        pattern: string;
        /** Ограничить действие конкретной папкой (нормализованный путь). */
        scope?: string;
        /** Зачем исключено — для UI (не влияет на логику). */
        note?: string;
}

/** Информация о конфликте для UI. */
export interface ConflictInfo {
        path: string;
        localSize: number;
        remoteSize: number;
        localModified?: number;
        remoteModified?: number;
}

export type ConflictChoice = 'remote-wins' | 'local-wins' | 'keep-both' | 'incoming' | 'defer';

/** Последовательный вопрос пользователю (модалка; фикс Б-21). */
export interface ConfirmUI {
        askConflict(info: ConflictInfo, signal?: AbortSignal): Promise<ConflictChoice>;
}

/**
 * Результат safeWrite: kind + обязанность вызывающего обновить кэш.
 *
 * [W1-T06] Конфликт-вариант расширен под уровни зеркала (матрица §2.2):
 * fetch-семантика возвращает ровно прежнюю форму { kind, updateCache,
 * conflictPath }; light/full добавляют поля ниже. Coordinator читает
 * только kind/updateCache — расширение обратно совместимо.
 */
export type WriteOutcome =
        | { kind: 'written'; updateCache: true; primaryChanged?: boolean }
        | { kind: 'skipped'; updateCache: false; requiresDecision?: boolean }
        | {
                        kind: 'conflict';
                        updateCache: true;
                        /** Recovery/conflict copy path; optional for legacy callers. */
                        conflictPath?: string;
                        primaryChanged?: boolean;
                        /** [W1-T06] Уровень зеркала, породивший конфликт (матрица §2.2);
                         *  отсутствует = fetch — конфликт по стратегии настроек (§9.1). */
                        mirror?: 'light' | 'full';
                        /** @deprecated Replacement now uses a recovery copy before writing. */
                        trashedLocal?: boolean;
                };

// --- Очередь неудачных загрузок (перенос FailedFile из main.ts) ---

export interface FailedFile {
        failureKind?:'transient'|'blocked';
        issue?: SyncIssue;
        path: string;
        hash: string;
        size: number;
        reason: string;
        timestamp: number;
        retryCount: number;
        nextRetryAt: number;
        /** [overhaul S6 / D-4] Запись прекратила автоматические повторы:
         *  retryCount достиг maxRetries FailedQueue, nextRetryAt = MAX_SAFE_INTEGER
         *  (takeDue/retryFailed её больше не извлекают). Реабилитация —
         *  самолечение при удачной записи (queue.delete), Clear Queue или
         *  Force Resync. Опционально: записи старых версий (data.json)
         *  поля не имеют — «не parked» — прежняя семантика. */
        poisoned?: boolean;
}

// ============================================================
// --- Ревизия 4-1 (между фазами 3→4; владелец контрактов — главный
// агент, протокол §2.5 плана): конвейер синхронизации Coordinator ---
// ============================================================

/** Статистика одной сессии синхронизации (перенос из main.ts). */
export interface SyncStats {
        uploaded?: number;
        /** Confirmed trash operations on Google Drive, separate from local deletions. */
        deletedDrive?: number;
        followUp?: boolean;
        trace?:Array<TransferEvent & {at:number;path?:string;source?:string}>;traceDropped?:number;
        sessionId?: string;
        problems?: SyncIssue[];
        pendingBefore?: number; pendingAfter?: number; retryScheduled?: number; blocked?: number;
        networkBytes?: number; notAttempted?: number;
        problem?: string;
        results?: SyncFileResult[];
        received?: number;
        totalFiles: number;
        downloaded: number;
        deleted: number;
        skipped: number;
        failed: number;
        bytesTransferred: number;
        duration: number;
        conflicts: number;
        /** Full-level conflict replacements; local bytes are saved in a recovery copy. */
        overwritten?: number;
        /** [W1-T07] Лишние папки, удалённые целиком (только full). */
        extraFoldersDeleted?: number;
        /** [W2-T08] ИСПОЛНЕННЫЕ зеркальные удаления по уровням — для журнала
         *  (план — в ConfirmSyncInfo; здесь только реально удалённые). */
        deleteLight?: number;
        /** [W2-T08] full-уровень: local-only файлы + лишние папки. */
        deleteFull?: number;
        /** [W2-T08] Из загрузок — обновлений существующих (для журнала;
         *  0 при forced/scan, где классификация неприменима). */
        updated?: number;
        /** [W2-T08] Исход сессии для журнала: 'ok' | 'cancelled' | 'error'.
         *  Coordinator — единственный честный свидетель (W1-T01: флаги
         *  отмены видны ему; main.ts после return их не достаёт). */
        outcome?: 'ok' | 'cancelled' | 'error';
        /** All deferred file deletions, including unverified-inventory blocks. */
        deferredDeletions?: number;
        deferredConflicts?: number;
        blockedDeletions?: number;
}

/** Сводка изменений для модалки подтверждения (дизайн §16). */
export interface ConfirmSyncInfo {
        operations?: readonly SyncPlanRow[];
        sources?: readonly string[];
        deferredDeletions?: number;
        /** Deletions suppressed because this source cannot prove a complete snapshot. */
        blockedDeletions?: number;
        toDownload: number;
        toDelete: number;
        /** Previously synced files absent remotely that will be retained locally. */
        orphans: number;
        /** Суммарный объём скачивания, байт (для тяжёлых мобильных кейсов). */
        downloadBytes: number;
        /** [REV-P4] Разбивка скачивания: файлов без кэша (NEW). */
        newCount?: number;
        /** [REV-P4] Разбивка: изменившихся с последнего sync (MODIFIED). */
        updatedCount?: number;
        /** [REV-P4] Разбивка: отсутствующих локально (MISSING_LOCAL). */
        restoredCount?: number;
        /** [REV-P4] Переименований/перемещений по политике. */
        movedCount?: number;
        /** [W1-T07] Зеркальные удаления по уровням — секции confirm-модалки
         *  (матрица §2.2; «Удалено (Лёгкое): N · (Полное): M»). */
        deleteLight?: number;
        /** [W1-T07] Полное зеркало: файловые full-удаления + лишние папки. */
        deleteFull?: number;
        /** [W1-T07] Лишние local-only папки к удалению целиком (full). */
        extraFolders?: number;
        /** [W1-T07 / Д3] Корзина выключена: удаление БЕЗ возможности
         *  восстановления — confirm обязан это явно сказать. */
        noRecovery?: boolean;
}

/** Фазы конвейера для статус-бара. */
export type SyncPhase = 'syncing' | 'idle' | 'error' | 'offline' | 'unconfigured' | 'conflicts';

export interface SyncPlanRow {
        action: 'add' | 'restore' | 'update' | 'check' | 'move' | 'delete' | 'skip' | 'defer' | 'blocked';
        path: string; remotePath?: string; source?: string;
        reason: 'missing' | 'source-changed' | 'match-source' | 'baseline-check' | 'mapping' | 'absent' | 'preserve' | 'create-only' | 'background' | 'unverified' | 'file-too-large';
}
export interface SyncFileResult { path: string; remotePath?:string; source?: string; status: 'applied' | 'unchanged' | 'skipped' | 'pending' | 'error'; reason: string; issue?: SyncIssue; conflictPath?: string }

/** Прогресс для статус-бара. */
export interface SyncProgress {
        stage?: PipelineStage;
        activities?: readonly FileActivity[];
        currentFailed?: number;
        issues?: readonly SyncFileResult[];
        lastActivityAt?: number;
        networkBytes?: number;
        attention?: 'deletions' | 'conflicts';
        fileIndex?:number;fileTotal?:number;currentPath?:string;
        progressText?: string;
        bytesTransferred?: number;
        totalBytes?: number;
        pendingCount?: number;
        /** [P2/3.2] Фаза конвейера (0=manifest, 1=policy, 2=diff, 3=deletions,
         *  4=downloads, 5=finalize) — индекс фазы для popover-полосы;
         *  имеет смысл только при setStatus('syncing'). UI вне сессии
         *  обязан трактовать отсутствие/− 1 как «полоса не рендерится». */
        phase?: number;
}

/** UI-порты Coordinator'а: модалки, статус-бар, нотисы. Тексты — на стороне UI. */
export interface SyncUI {
        confirmSync(info: ConfirmSyncInfo, signal?: AbortSignal): Promise<boolean>;
        /** Подтверждение retry-сессии (N дозревших файлов); опционально. */
        confirmRetry?(count: number): Promise<boolean>;
        setStatus(phase: SyncPhase, progress?: SyncProgress): void;
        notify(message: string, timeoutMs?: number): void;
        /** [W4-T02] Низкоприоритетное уведомление: в auto-режиме дропается,
         *  если verboseNotices=false (А5); в manual-режиме — показывается как
         *  обычное notify (т.к. пользователь сам инициировал синк). */
        notifyVerbose?(message: string, timeoutMs?: number): void;
        setLastSyncTime(ts: number): void;
}

// ============================================================
// --- Ревизия 5-1 (между фазами 4→5): архивный канал ---
// ============================================================

/** Произвольный доступ к байтам архива (десктоп: tmp-файл; мобайл: память). */
export interface RandomAccessReader {
        /** Общее число байт. */
        size(): number;
        /** length байт с offset; возвращается НЕЗАВИСИМАЯ копия. */
        read(offset: number, length: number): Promise<Uint8Array>;
        /** Освобождение ресурсов (удаление tmp-файла). Опционально. */
        dispose?(): Promise<void>;
}

/** Прогресс скачивания архива. */
export interface ArchiveDownloadProgress {
        capability?:'streaming'|'buffered';
        bytesTransferred: number;
        /** content-length отсутствует / chunked → null. */
        totalBytes: number | null;
}

/** Скачивание архива в сессионное хранилище с байтовым прогрессом. */
export interface ArchiveDownloader {
        download(url: string, opts: {
                signal?: AbortSignal;
                onProgress?: (p: ArchiveDownloadProgress) => void;
        }): Promise<RandomAccessReader>;
}
