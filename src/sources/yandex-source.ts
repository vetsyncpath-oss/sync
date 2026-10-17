import type { TransferObserver } from './types';
// ============================================================
// --- SOURCES/YANDEX-SOURCE (фаза 6, задача 6-a) ---
// Источник «Яндекс.Диск» в manifest-режиме (дизайн §5, §6.1):
// публичная ссылка на ПАПКУ → рекурсивный BFS-обход листингов E1
// (постранично, limit=200) с sha256 каждого файла — манифест
// получается БЕЗ скачивания архива; при fetch качаются только
// изменённые файлы через временные download-ссылки E2
// (href-кэш сессии §5.4, TTL 10 минут, инвалидация по 403/404).
// Ссылка на ФАЙЛ → file-ветка: E2-href файла (без path) +
// делегат ZipUrlSource (режим B поверх того же Transport-движка).
//
// Закрываемые риски/баги: №7 — контракт-проверка структуры ответа
// на КАЖДОМ листинге (формат изменился → structureChanged, а не
// мусорный манифест); вечный цикл пагинации — кап суммарного
// offset; Б-19 — expectedSize на каждом скачивании; Б-07 —
// 429-ожидания прерываемы (внутри NetLayer, до 1 часа).
// Модуль ядра: НЕ импортирует obsidian/node; локализуемые тексты
// ошибок инъектируются через messages (решение В5-1, как в
// git-source/zip-url-source).
// ============================================================

import type { ArchiveDownloader, NetTransport, RemoteEntry, SyncSource } from './types';
import { NetLayer, NetError, sleepInterruptible, type NetFetchOptions } from '../core/net';
import { ZipUrlSource } from './zip-url-source';
import { SyncFault } from '../core/sync-issue';

/** База публичного API Яндекс.Диска (дизайн §5.1). */
const API_BASE = 'https://cloud-api.yandex.net/v1/disk';

/** Размер страницы листинга E1 (§5.2: ~5 запросов/с, limit=200). */
const PAGE_SIZE = 200;

/** Кап суммарного offset пагинации одной папки — защита от вечного цикла (§5.3). */
const MAX_TOTAL_OFFSET = 100000;

/** Порог ожидания rate-limit (§5.2): дольше часа — отказ без ретраев. */
const MAX_RATE_LIMIT_WAIT_MS = 3600000;

/** TTL записи href-кэша сессии (§5.4: 10 минут). */
const DEFAULT_HREF_TTL_MS = 600000;

/** Попыток NetLayer на скачивание файла по href (§6.1 fetchOne). */
const DOWNLOAD_RETRIES = 3;

export interface YandexInventoryLimits {
        maxNodes: number;
        maxObservations: number;
        maxFolders: number;
}
/** Provider boundary defaults; the shared schema/UI defaults registry is still pending. */
const INVENTORY_LIMITS: Readonly<YandexInventoryLimits> = Object.freeze({ maxNodes: 100000, maxObservations: 200000, maxFolders: 10000 });
function unstableInventory(): SyncFault {
        return new SyncFault('inventory-unstable', 'Yandex inventory is inconsistent; no complete snapshot is available', 'source');
}
class InventoryTraversal {
        private readonly seen = new Set<string>();
        private observations = 0;
        private folders = 0;
        readonly paths = new Map<string, string>();
        constructor(private readonly limits: Readonly<YandexInventoryLimits>) {}
        visit(path: string, folder: boolean): void {
                if (++this.observations > this.limits.maxObservations) this.exceeded();
                if (this.seen.has(path)) throw unstableInventory();
                if (this.seen.size >= this.limits.maxNodes || (folder && this.folders >= this.limits.maxFolders)) this.exceeded();
                this.seen.add(path);
                if (folder) this.folders++;
        }
        private exceeded(): never { throw new SyncFault('inventory-limit', 'Yandex inventory traversal limit exceeded; no complete snapshot is available', 'source'); }
}

/** Локализуемые сообщения источника (инъекция из main.ts). */
export interface YandexSourceMessages {
        /** 404: ссылка отозвана / ресурс не существует (§5.2). */
        linkInvalid: () => string;
        /** Риск №7: формат ответа API изменился (структура листинга нарушена). */
        structureChanged: () => string;
        rateLimitExceedsHour: () => string;
        /** [P2/M10] Файл без sha256: сессия обязана УПАСТЬ, а не тихо выкинуть
         *  файл из манифеста (иначе diff видит «удалён из источника» → при
         *  зеркале исполняется удаление локального файла — потеря данных). */
        fileWithoutHash: (path: string) => string;
}

export interface YandexSourceOptions {
        /** Публичная ссылка https://disk.yandex.ru/d/<key> — она и есть public_key. */
        publicKey: () => string;
        /** Обязателен: HTTP-транспорт (main.ts — FetchTransport; тесты — мок). */
        transport: NetTransport;
        /** Нужен для file-ветки (ссылка на файл → zip через E2-href). */
        archiveDownloader?: ArchiveDownloader;
        messages?: Partial<YandexSourceMessages>;
        onRateLimitWait?: (waitMs: number) => void;
        /**
         * [зарезервировано] Таймаут запроса — зона ответственности транспорта,
         * который инжектируется уже готовым; поле принято контрактом опций.
         */
        /** Для тестов: TTL href-кэша (default 600000). */
        hrefTtlMs?: number;
        /** Для тестов: инъекция времени (default Date.now). */
        now?(): number;
        /** Explicit provider bounds; includes root and directories, not only files. */
        inventoryLimits?: Partial<YandexInventoryLimits>;
}

const DEFAULT_MESSAGES: YandexSourceMessages = {
        linkInvalid: () => 'Публичная ссылка Яндекс.Диска недействительна или отозвана владельцем.',
        structureChanged: () => 'Формат ответа Яндекс.Диска не соответствует ожидаемому (API изменился?).',
        rateLimitExceedsHour: () => 'Ожидание rate-limit Яндекс.Диска превышает 1 час. Попробуйте позже.',
        fileWithoutHash: (path) => `Яндекс.Диск не вернул sha256 для файла «${path}». Синхронизация остановлена — локальные файлы не тронуты.`,
};

/** Запись href-кэша сессии (§5.4): {href, expiresAt = now()+TTL}. */
interface HrefCacheEntry {
        href: string;
        /** Момент (мс), до которого ссылка считается свежей. */
        expiresAt: number;
}

/** Узел BFS-очереди обхода папок (§5.3): {apiPath?, prefix}. */
interface FolderNode {
        /** item.path подпапки для E1; у корня — undefined. */
        apiPath?: string;
        /** Префикс vault-пути: '' у корня, 'dir/' внутри подпапок. */
        prefix: string;
}

/** item листинга E1 — только читаемые нами поля (остальные игнорируются). */
interface ListingItem {
        name?: unknown;
        type?: unknown;
        path?: unknown;
        size?: unknown;
        sha256?: unknown;
        modified?: unknown;
}

export class YandexSource implements SyncSource {
        readonly kind = 'yandex' as const;
        readonly maxConcurrentDownloads = 2;
        readonly deletionSafety = 'unverified' as const;
        /** [Phase 5.1] пер-файлового лимита нет: облачный диск (см. SyncSource). */
        readonly maxFileSizeBytes?: number;

        private cooldownUntil=0;
        private manifestObserve?: TransferObserver;
        private readonly publicKey: () => string;
        private readonly net: NetLayer;
        private readonly archiveDownloader?: ArchiveDownloader;
        private readonly messages: YandexSourceMessages;
        private readonly onRateLimitWait?: (waitMs: number) => void;
        private readonly hrefTtlMs: number;
        private readonly now: () => number;
        private readonly inventoryLimits: Readonly<YandexInventoryLimits>;
        private observationActive = false;
        private manifestReady = false;
        private generation = 0;

        /** item.path каждой записи манифеста — для E2 при fetch. */
        private apiPaths: Map<string, string> = new Map();

        /** href-кэш сессии: vault-путь → временная download-ссылка (§5.4). */
        private hrefCache: Map<string, HrefCacheEntry> = new Map();

        /** Делегат file-ветки (режим B); null — папочная ветка/ветка не активна. */
        private zipDelegate: ZipUrlSource | null = null;

        constructor(opts: YandexSourceOptions) {
                const limits = { ...INVENTORY_LIMITS, ...opts.inventoryLimits };
                if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1)) throw new Error('Invalid Yandex inventory limit');
                this.inventoryLimits = Object.freeze(limits);
                this.publicKey = opts.publicKey;
                this.net = new NetLayer({fetch:async(url,request)=>{
                        while(this.cooldownUntil>Date.now()){request.observe?.({stage:'waiting',retryAt:this.cooldownUntil});await sleepInterruptible(this.cooldownUntil-Date.now(),request?.signal);}
                        return opts.transport.fetch(url,request);
                }});
                this.archiveDownloader = opts.archiveDownloader;
                this.messages = { ...DEFAULT_MESSAGES, ...opts.messages };
                this.onRateLimitWait = opts.onRateLimitWait;
                this.hrefTtlMs = opts.hrefTtlMs ?? DEFAULT_HREF_TTL_MS;
                this.now = opts.now ?? Date.now;
        }

        // ── SyncSource ──

        /**
         * Манифест папочной ссылки: корневой E1 → BFS по подпапкам с
         * пагинацией; sha256 → RemoteEntry (без скачивания архива).
         * Для файловой ссылки — file-ветка (делегат ZipUrlSource).
         */
        async getManifest(signal: AbortSignal, observe?: TransferObserver): Promise<RemoteEntry[]> {
                if (this.observationActive) throw new SyncFault('observation-busy', 'Yandex source already has an active observation', 'source');
                this.observationActive = true;
                this.manifestReady = false;
                this.apiPaths.clear();
                this.hrefCache.clear();
                const generation = ++this.generation;
                try {
                        signal.throwIfAborted();
                        const entries = await this.observeManifest(signal, observe);
                        signal.throwIfAborted();
                        if (generation !== this.generation) throw new SyncFault('inventory-unavailable', 'Yandex observation was disposed before publication', 'source');
                        this.manifestReady = true;
                        return entries;
                } catch (error) {
                        this.apiPaths.clear();
                        this.hrefCache.clear();
                        throw error;
                } finally {
                        this.observationActive = false;
                        this.manifestObserve = undefined;
                }
        }

        private async observeManifest(signal: AbortSignal, observe?: TransferObserver): Promise<RemoteEntry[]> {
                this.manifestObserve=observe;observe?.({stage:'manifest'});
                // Повторный getManifest в file-ветке: старый делегат утилизируем,
                // href файловой ссылки будет перевыпрошен заново (семантика п.3).
                if (this.zipDelegate !== null) {
                        const old = this.zipDelegate;
                        this.zipDelegate = null;
                        await old.dispose();
                }

                // Корневой E1 (без path): сам публичный ресурс — папка или файл.
                const root = await this.fetchListing(undefined, 0, signal);

                if (root?.type === 'file') {
                        return this.fileBranchManifest(signal);
                }
                if (root?.type !== 'dir') {
                        // Не dir и не file (в т.ч. отсутствующий type) — риск №7.
                        throw new Error(this.messages.structureChanged());
                }

                // Папочная ветка: первая страница корня уже получена выше,
                // её пагинацию продолжаем, подпапки уходим в BFS-очередь.
                const traversal = new InventoryTraversal(this.inventoryLimits);
                traversal.visit(typeof root.path === 'string' && root.path ? root.path : '/', true);
                const entries: RemoteEntry[] = [];
                const queue: FolderNode[] = [];
                await this.consumeFolderPages(undefined, '', root, entries, queue, signal, traversal);
                for (let cursor = 0; cursor < queue.length; cursor++) {
                        signal.throwIfAborted();
                        const node = queue[cursor];
                        const firstPage = await this.fetchListing(node.apiPath, 0, signal);
                        await this.consumeFolderPages(node.apiPath, node.prefix, firstPage, entries, queue, signal, traversal);
                }
                this.manifestObserve?.({stage:'manifest',items:entries.length});
                signal.throwIfAborted();
                this.apiPaths = traversal.paths;
                return entries;
        }

        /**
         * Скачивание одного файла папочной ссылки: свежий href из кэша
         * (§5.4) либо E2 → загрузка с проверкой expectedSize (Б-19).
         * 403/404 → инвалидация кэша + РОВНО один повтор (E2 → скачать).
         */
        async fetch(entry: RemoteEntry, signal: AbortSignal, observe?: TransferObserver): Promise<ArrayBuffer> {
                if (!this.manifestReady) throw new SyncFault('inventory-unavailable', 'Yandex download requires a complete current manifest', 'source');
                // File-ветка: байты отдаёт делегат (zip-сессия режима B).
                if (this.zipDelegate !== null) {
                        return this.zipDelegate.fetch(entry, signal, observe);
                }
                const apiPath = this.apiPaths.get(entry.path);
                if (apiPath === undefined) {
                        throw new Error(`entry not in manifest: ${entry.path}`);
                }
                try {
                        return await this.fetchEntryOnce(entry, apiPath, signal, observe);
                } catch (err) {
                        // Протухший/отозванный href (403/404 на E2 или на скачивании):
                        // запись href-кэша даинвалидирована, повтор — один (семантика п.4).
                        if (err instanceof NetError && (err.status === 403 || err.status === 404)) {
                                this.hrefCache.delete(entry.path);
                                return await this.fetchEntryOnce(entry, apiPath, signal, observe);
                        }
                        throw err;
                }
        }

        /** Конец сессии: href-кэш очищен, делегат file-ветки утилизирован. */
        fileSizeLimit():number|undefined{return this.zipDelegate?.maxFileSizeBytes;}
        private invalidateManifest(): void { this.generation++; this.manifestReady = false; this.apiPaths.clear(); this.hrefCache.clear(); }
        async forceDispose():Promise<void>{this.invalidateManifest();await this.zipDelegate?.forceDispose();this.zipDelegate=null;}
        async dispose(): Promise<void> {
                // §5.4: href живёт только в рамках сессии синхронизации.
                this.invalidateManifest();
                if (this.zipDelegate !== null) {
                        const delegate = this.zipDelegate;
                        this.zipDelegate = null;
                        await delegate.dispose();
                }
        }

        // ── file-ветка (ссылка на файл: E2-href → ZipUrlSource, режим B) ──

        private async fileBranchManifest(signal: AbortSignal): Promise<RemoteEntry[]> {
                if (!this.archiveDownloader) {
                        throw new Error('archiveDownloader required for file links');
                }
                // E2 БЕЗ path: href указывает на сам файл (§5.1); для файловой
                // ссылки-корня path не передаётся. 404 — ссылка мертва.
                let href: string;
                try {
                        href = await this.fetchDownloadHref(undefined, signal);
                } catch (err) {
                        if (err instanceof NetError && err.status === 404) {
                                throw new Error(this.messages.linkInvalid());
                        }
                        throw err;
                }
                this.zipDelegate = new ZipUrlSource({ url: () => href, downloader: this.archiveDownloader });
                return this.zipDelegate.getManifest(signal,this.manifestObserve);
        }

        // ── папочная ветка: обход листингов ──

        /**
         * Обработка ОДНОЙ папки: firstPage уже скачана; пагинация
         * продолжается (offset += 200), пока набрано меньше total.
         * Файлы → entries (BFS-порядок сохраняется), подпапки → queue.
         */
        private async consumeFolderPages(
                apiPath: string | undefined,
                prefix: string,
                firstPage: any,
                entries: RemoteEntry[],
                queue: FolderNode[],
                signal: AbortSignal,
                traversal: InventoryTraversal,
        ): Promise<void> {
                let page: any = firstPage;
                let offset = 0;
                let collected = 0;
                let expectedTotal: number | undefined;
                for (;;) {
                        signal.throwIfAborted();
                        // Контракт-проверка (риск №7) — на КАЖДОЙ странице листинга.
                        const embedded = page?._embedded;
                        if (!embedded || !Array.isArray(embedded.items)) {
                                throw unstableInventory();
                        }
                        const total = embedded.total;
                        if (!Number.isSafeInteger(total) || total < 0 || (expectedTotal !== undefined && total !== expectedTotal)
                                || embedded.items.length > PAGE_SIZE || collected + embedded.items.length > total
                                || (embedded.items.length === 0 && collected < total)
                                || (embedded.offset !== undefined && embedded.offset !== offset)
                                || (embedded.limit !== undefined && embedded.limit !== PAGE_SIZE)) throw unstableInventory();
                        expectedTotal = total;

                        for (const raw of embedded.items as ListingItem[]) {
                                signal.throwIfAborted();
                                const item: ListingItem = raw ?? {};
                                if (typeof item.name !== 'string' || item.name === '' || typeof item.type !== 'string') {
                                        throw new Error(this.messages.structureChanged());
                                }
                                if (item.type === 'dir') {
                                        // path подпапки обязателен: без него спуск превратится
                                        // в повторное листинг корня и зациклит обход.
                                        if (typeof item.path !== 'string' || item.path === '') {
                                                throw new Error(this.messages.structureChanged());
                                        }
                                        traversal.visit(item.path, true);
                                        queue.push({ apiPath: item.path, prefix: prefix + item.name + '/' });
                                } else if (item.type === 'file') {
                                        if (typeof item.path !== 'string' || item.path === '') throw unstableInventory();
                                        traversal.visit(item.path, false);
                                        this.appendFileEntry(item, prefix, entries, traversal.paths);
                                } else {
                                        throw new Error(this.messages.structureChanged());
                                }
                        }

                        this.manifestObserve?.({stage:'manifest',items:entries.length});
                        collected += embedded.items.length;
                        if (collected === total) break;
                        if (embedded.items.length !== PAGE_SIZE) throw unstableInventory();
                        offset += PAGE_SIZE;
                        if (offset > MAX_TOTAL_OFFSET) {
                                // total лжёт о размере — вечная пагинация (§5.3, риск №7).
                                throw new SyncFault('inventory-limit', 'Yandex folder pagination limit exceeded', 'source');
                        }
                        page = await this.fetchListing(apiPath, offset, signal);
                }
        }

        /** Один item-файл → запись манифеста. [P2/M10] деградация ответа API —
         *  ЯВНАЯ ошибка, не тихий пропуск: файл без sha256, выпавший из
         *  манифеста, диффом трактуется как «удалён из источника», и при живом
         *  зеркале локальный файл удаляется — недопустимая потеря данных.
         *  Аналогично item без path (E2-контракт листинга). */
        private appendFileEntry(item: ListingItem, prefix: string, entries: RemoteEntry[], paths: Map<string, string>): void {
                // [W7/BUG-11] пустые файлы (size === 0) синхронизируются —
                // единообразие с zip-url/gdrive/webdav (спека §8: «zip-поведение
                // во всех движках»). Старый skip `size > 0` давал фантомные
                // diff'ы при миграции между движками.
                if(!Number.isSafeInteger(item.size)||Number(item.size)<0)throw new Error('Yandex inventory has no valid file size');
                const size = item.size as number;

                const relPath = prefix + item.name;
                const sha256 = typeof item.sha256 === 'string' && item.sha256 !== '' ? item.sha256 : undefined;
                const apiPath = typeof item.path === 'string' && item.path !== '' ? item.path : undefined;
                if (apiPath === undefined) {
                        // path — контракт листинга E1 (без него файл даже не скачать);
                        // паритет с dir-веткой выше: structureChanged.
                        throw new Error(this.messages.structureChanged());
                }
                if (sha256 === undefined) {
                        // [P2/M10] manifest-режим живёт sha256-диффом; без него файл
                        // «невидим» — fail-closed сессией целиком, NOTHING не удаляется.
                        throw new Error(this.messages.fileWithoutHash(relPath));
                }

                const entry: RemoteEntry = {
                        path: relPath,
                        // §5.1: sha256 приходит в ВЕРХНЕМ регистре — нормализуем вниз.
                        hash: sha256.toLowerCase(),
                        hashAlg: 'sha256',
                        size,
                };
                if (typeof item.modified === 'string') {
                        const ts = Date.parse(item.modified);
                        // mtime — только для UI (§5.3); мусорная строка → без поля.
                        if (!Number.isNaN(ts)) entry.modified = ts;
                }
                entries.push(entry);
                if (paths.has(relPath)) throw unstableInventory();
                paths.set(relPath, apiPath);
        }

        // ── fetch: href-кэш и скачивание ──

        /** Одна попытка fetch: свежий href из кэша либо E2 → скачивание. */
        private async fetchEntryOnce(
                entry: RemoteEntry,
                apiPath: string,
                signal: AbortSignal,
                observe?: TransferObserver,
        ): Promise<ArrayBuffer> {
                observe?.({stage:'download-link'});
                const href = await this.obtainHref(entry.path, apiPath, signal, observe);
                // §6.1 fetchOne: expectedSize обязателен (фикс Б-19).
                return this.netFetch(href, { expectedSize: entry.size, signal, retries: DOWNLOAD_RETRIES, observe });
        }

        /** Свежий href из кэша; иначе E2 + запись в кэш с TTL (§5.4). */
        private async obtainHref(
                vaultPath: string,
                apiPath: string,
                signal: AbortSignal,
                observe?: TransferObserver,
        ): Promise<string> {
                const cached = this.hrefCache.get(vaultPath);
                if (cached !== undefined && this.now() < cached.expiresAt) {
                        return cached.href;
                }
                const href = await this.fetchDownloadHref(apiPath, signal, observe);
                this.hrefCache.set(vaultPath, { href, expiresAt: this.now() + this.hrefTtlMs });
                return href;
        }

        // ── HTTP: URL-билдеры и маппинг ошибок ──

        /** E1 (§5.1): public_key + limit/offset/sort; path — только для подпапок. */
        private listingUrl(apiPath: string | undefined, offset: number): string {
                let url =
                        API_BASE +
                        '/public/resources' +
                        `?public_key=${encodeURIComponent(this.publicKey())}` +
                        `&limit=${PAGE_SIZE}&offset=${offset}&sort=name`;
                if (apiPath !== undefined) {
                        url += `&path=${encodeURIComponent(apiPath)}`;
                }
                return url;
        }

        /** E2 (§5.1): public_key + опциональный path (для файлового корня НЕ передаётся). */
        private downloadUrl(apiPath: string | undefined): string {
                let url =
                        API_BASE +
                        '/public/resources/download' +
                        `?public_key=${encodeURIComponent(this.publicKey())}`;
                if (apiPath !== undefined) {
                        url += `&path=${encodeURIComponent(apiPath)}`;
                }
                return url;
        }

        /**
         * E1-листинг: 404/403 → linkInvalid (§5.2: ссылка отозвана либо
         * ресурс недоступен); rate-limit-отказ и parse-ошибки — свои тексты.
         */
        private async fetchListing(
                apiPath: string | undefined,
                offset: number,
                signal: AbortSignal,
        ): Promise<any> {
                try {
                        return await this.fetchApiJson(this.listingUrl(apiPath, offset), signal);
                } catch (err) {
                        // [6-review L2] 400 = некорректный public_key (фатальная конфигурация, §5.2)
                        if (err instanceof NetError && (err.status === 404 || err.status === 403 || err.status === 400)) {
                                const root = apiPath === undefined;
                                throw Object.assign(new SyncFault(root ? 'public-link-invalid' : 'inventory-unavailable',
                                        root ? this.messages.linkInvalid() : 'Yandex subfolder is unavailable; inventory is incomplete', 'source'), { status: err.status });
                        }
                        throw err;
                }
        }

        /**
         * E2-download-href: {href, method, templated}. Статусы НЕ маппятся
         * в linkInvalid — 403/404 здесь означает «href/файл протух» и
         * обрабатывается ретраем fetch (семантика п.4); href-контракт
         * (не-пустая строка) — риск №7.
         */
        private async fetchDownloadHref(apiPath: string | undefined, signal: AbortSignal, observe?: TransferObserver): Promise<string> {
                const data: any = await this.fetchApiJson(this.downloadUrl(apiPath), signal, observe);
                if (!data || typeof data.href !== 'string' || data.href === '') {
                        throw new Error(this.messages.structureChanged());
                }
                return data.href;
        }

        /** GET JSON: Accept: application/json (§5.1); не-JSON тело — риск №7. */
        private async fetchApiJson(url: string, signal: AbortSignal, observe?: TransferObserver): Promise<any> {
                const buffer = await this.netFetch(url, {
                        headers: { Accept: 'application/json' },
                        signal, maxBytes:16*1024*1024, observe:event=>(observe??this.manifestObserve)?.({...event,stage:event.stage==='waiting'?'waiting':observe?'download-link':'manifest',byteDelta:undefined,bytes:undefined,totalBytes:undefined}),
                });
                try {
                        return JSON.parse(new TextDecoder().decode(buffer));
                } catch {
                        // 200 с не-JSON телом — формат ответа изменился.
                        throw new Error(this.messages.structureChanged());
                }
        }

        /** Единая точка сетевых вызовов: rate-limit-политика источника. */
        private async netFetch(url: string, opts: NetFetchOptions): Promise<ArrayBuffer> {
                try {
                        return await this.net.fetchBuffer(url, {
                                ...opts,
                                // §5.2: ожидание дольше часа — сразу понятный отказ (п.6).
                                maxRateLimitWaitMs: MAX_RATE_LIMIT_WAIT_MS,
                                onRateLimitWait: (waitMs: number) => {this.cooldownUntil=Math.max(this.cooldownUntil,Date.now()+waitMs);this.onRateLimitWait?.(waitMs);},
                        });
                } catch (err) {
                        if(err instanceof NetError&&err.retryAfterMs)this.cooldownUntil=Math.max(this.cooldownUntil,Date.now()+err.retryAfterMs);
                        if (err instanceof NetError && err.rateLimitExceeded) {
                                throw new NetError(this.messages.rateLimitExceedsHour(),{status:err.status,attempt:err.attempt,rateLimitExceeded:true,retryAfterMs:err.retryAfterMs});
                        }
                        throw err;
                }
        }
}
