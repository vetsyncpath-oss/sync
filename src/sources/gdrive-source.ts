// ============================================================
// --- SOURCES/GDRIVE-SOURCE (W6-T03) ---
// Нативный Google Drive источник: вместо ZIP-движка, который
// качал весь vault архивом на каждый sync, здесь — инкрементальный
// движок через Drive API v3 (список файлов + alt=media скачивание).
//
// Дизайн:
//   - getManifest: [P0/C2] РЕКУРСИВНЫЙ листинг (BFS от folderId или от
//     псевдонима 'root' = корень My Drive): files.list с пагинацией на
//     КАЖДУЮ папку, q = "'<folderId>' in parents and trashed=false".
//     Возвращает { path, hash, hashAlg, size, modified } с путями вида
//     dir/name (раньше листинг был плоским — файлы подпапок терялись,
//     а при живом зеркале это означало удаление локальных подпапок).
//     Заодно наполняет внутренний кэш path→fileId (для fetch без сети).
//   - fetch: GET /files/<id>?alt=media&key=<apiKey> [P0/C1] — ключ
//     обязателен на КАЖДОМ запросе Drive API, включая alt=media
//     (раньше загрузки возвращали 401/403 — все файлы падали в failed).
//     ID берётся из кэша path→id (getManifest обязан быть зван ранее
//     в сессии; Coordinator всегда зовёт getManifest перед fetch).
//   - HashAlg: 'sha256' (Google отдаёт sha256Checksum в метаданных
//     для бинарных файлов; fallback — size+mtime синтезированный хэш,
//     помеченный префиксом 'gdrive-weak:' — конфликт-резолвер будет
//     видеть несоответствие локального sha256 и синтезированного,
//     триггеря conflict на каждое изменение remote для таких файлов;
//     это редкий edge-case — у большинства бинарников есть sha256).
//   - Rate-limit: через NetLayer (классификатор 429 по Retry-After).
//   - Capabilities: auth=true, etag=false, mtime=true, incremental=true,
//     testConnection=false (лёгкой проверки нет; main.ts идёт через
//     полный getManifest — как для yandex).
//
// ЧИСТОТА: модуль не импортирует obsidian/node — только NetTransport
// (инъектируется из main.ts через EngineCtx.transport). Локализуемые
// сообщения — через GDriveSourceMessages-интерфейс.
// ============================================================

import type { NetTransport, RemoteEntry, SyncSource, HashAlg } from './types';
import { NetLayer } from '../core/net';
import { FetchTransport } from '../adapters/fetch-transport';

const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRY_ATTEMPTS = 5;
const MAX_RATE_LIMIT_WAIT_MS = 3600000;
const GDRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Google Drive жёстко ограничивает размер одного файла (через API
 * загрузку — 5 ТБ; но практически для alt=media скачивания и
 * безопасного лимита mirrors — берём 100 МБ, паритет с git-лимитом).
 */
const GDRIVE_MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Локализуемые сообщения источника (инъекция из main.ts). */
export interface GDriveSourceMessages {
        apiKeyMissing: () => string;
        listFailed: (status: number) => string;
        downloadFailed: (status: number) => string;
        rateLimitExceedsHour: () => string;
        fileNotFound: (id: string) => string;
        invalidResponse: (msg: string) => string;
        /** [P0/C3] Листинг превысил лимит (страниц/папок) — манифест неполон. */
        manifestTruncated: () => string;
        /** [overhaul S1/H-5] Обычный файл без size — аномалия метаданных:
         *  fail-closed, сессия обязана упасть (паритет с яндексом [P2/M10]). */
        fileWithoutSize: (path: string) => string;
}

export interface GDriveSourceOptions {
        /**
         * Текущая конфигурация GDrive (читается на каждом запросе):
         *   - apiKey: API key из Google Cloud Console (требуется для auth).
         *   - folderId: ID папки для листинга (опционально — иначе все файлы
         *     пользователя, что может быть медленно на больших Drive).
         *   - includeDocs: true = включать Google Docs/Sheets/Slides (по
         *     умолчанию false — пропускаем, т.к. для alt=media нужен export,
         *     а не сам файл).
         */
        config: () => { apiKey: string; folderId?: string; includeDocs?: boolean };
        transport?: NetTransport;
        onRateLimitWait?: (waitMs: number) => void;
        messages?: Partial<GDriveSourceMessages>;
        requestTimeoutMs?: number;
}

const DEFAULT_MESSAGES: GDriveSourceMessages = {
        apiKeyMissing: () => 'Google Drive API key is required.',
        listFailed: (s) => `Failed to list files: HTTP ${s}`,
        downloadFailed: (s) => `Failed to download file: HTTP ${s}`,
        rateLimitExceedsHour: () => 'Rate limit wait time exceeds 1 hour. Try again later.',
        fileNotFound: (id) => `File not found: ${id}`,
        invalidResponse: (msg) => `Invalid Google Drive API response: ${msg}`,
        manifestTruncated: () => 'Google Drive folder tree too large (listing truncated). Cannot sync safely.',
        fileWithoutSize: (path) => `Google Drive returned no size for file "${path}". Sync stopped — local files untouched.`,
};

/**
 * Тип записи из GDrive files.list API (поля выбираются через ?fields=...).
 * Все поля опциональны (кроме id) — GDrive может не отдать size/mtime
 * для Google Docs.
 */
interface GDriveFile {
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        modifiedTime?: string;
        sha256Checksum?: string;
        md5Checksum?: string;
}

interface GDriveListResponse {
        files: GDriveFile[];
        nextPageToken?: string;
}

/**
 * Классификатор rate-limit для GDrive: 403 с reason=rateLimitExceeded
 * ИЛИ 429. GDrive отдаёт Retry-After в секундах. NetLayer.wait конвертирует.
 */
function classifyGDriveRateLimit(status: number, headers: Record<string, string>): number | null {
        if (status === 429 || (status === 403 && (headers['x-goog-quota-user'] !== undefined || /rateLimit/i.test(headers['x-goog-api-error'] ?? '')))) {
                const ra = headers['retry-after'] ?? headers['x-ratelimit-reset'];
                if (ra !== undefined) {
                        const sec = Number(ra);
                        if (Number.isFinite(sec) && sec > 0) return sec * 1000;
                }
                // Дефолт: 1 секунда (GDrive обычно мягкий лимит).
                return 1000;
        }
        return null;
}

/**
 * Синтезированный "слабый" hash для файлов без sha256Checksum.
 * Формат: `gdrive-weak:<size_hex>-<mtime_ms_hex>` — префикс позволяет
 * отличать от реального sha256 (который 64 hex символа без префикса).
 *
 * ОГРАНИЧЕНИЯ: конфликт-резолвер сравнивает local sha256 с этим
 * синтезированным хэшем → они всегда различаются → для fallback-файлов
 * конфликт срабатывает при КАЖДОМ изменении remote (даже если local
 * не трогали). Это редкий edge-case; для бинарных файлов GDrive
 * отдаёт sha256Checksum — fallback нужен только для очень старых
 * загрузок или Google Docs (которые мы пропускаем по умолчанию).
 */
function synthesizeWeakHash(size: number, modifiedTime: string | undefined): string {
        let mtimeMs = 0;
        if (modifiedTime) {
                const t = Date.parse(modifiedTime);
                if (Number.isFinite(t)) mtimeMs = t;
        }
        return `gdrive-weak:${size.toString(16)}-${mtimeMs.toString(16)}`;
}

/** Ошибка отмены (паритет с core/net.ts). */
function abortedError(): Error & { aborted: boolean } {
        const e = new Error('aborted') as Error & { aborted: boolean };
        e.aborted = true;
        return e;
}

export class GDriveSource implements SyncSource {
        readonly kind = 'gdrive' as const;
        readonly deletionSafety = 'unverified' as const;
        readonly maxFileSizeBytes = GDRIVE_MAX_FILE_SIZE;

        private readonly config: () => { apiKey: string; folderId?: string; includeDocs?: boolean };
        private readonly net: NetLayer;
        private readonly messages: GDriveSourceMessages;
        private readonly onRateLimitWait?: (waitMs: number) => void;

        /**
         * Кэш path → fileId: наполняется в getManifest, используется в fetch.
         * Сессионый — переживает dispose (нет dispose-семантики; cache живет
         * до GC источника). Кэш НЕ персистентный (перезапуск Obsidian
         * греет заново через первый getManifest).
         *
         * Коллизия имён: если в Drive два файла с одинаковым name в одной
         * папке (GDrive это позволяет), последний записанный в кэш побеждает.
         * fetch() возьмет ID последнего — что для sync означает "последний
         * выиграл". Если это проблема — нужен pathPolicy или квантификация
         * пути (но GDrive не имеет настоящих путей, только имена + parents).
         */
        private readonly pathToId = new Map<string, string>();

        constructor(opts: GDriveSourceOptions) {
                this.config = opts.config;
                this.messages = { ...DEFAULT_MESSAGES, ...opts.messages };
                this.onRateLimitWait = opts.onRateLimitWait;
                const transport = opts.transport ?? new FetchTransport({ timeoutMs: opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS });
                this.net = new NetLayer(transport);
        }

        async getManifest(signal: AbortSignal): Promise<RemoteEntry[]> {
                if (signal.aborted) throw abortedError();
                const { apiKey, folderId, includeDocs } = this.config();
                if (!apiKey) throw new Error(this.messages.apiKeyMissing());

                // Очищаем кэш перед ре-листингом (старые ID могли стать невалидными).
                this.pathToId.clear();

                const entries: RemoteEntry[] = [];

                // [P0/C2] BFS от корня: folderId (если задан) или 'root' —
                // псевдоним корневой папки My Drive (Drive API v3 поддерживает
                // 'root' как валидный parent в q). Каждый уровень — отдельный
                // files.list-запрос; папки попадают в очередь, файлы — в манифест
                // с путями вида dir/name.
                const rootId = folderId && folderId.trim() !== '' ? folderId.trim() : 'root';
                const queue: { id: string; path: string }[] = [{ id: rootId, path: '' }];
                const visited = new Set<string>([rootId]);

                // [P0/C3] Лимиты — паритет с git treeTruncated: молчаливое
                // усечение манифеста при живом зеркале = «файлы исчезли из
                // источника» → корзина. Поэтому — throw, а не тихий выход.
                const MAX_FOLDERS = 1000;          // папок в дереве (защита от гигантских Drive)
                const MAX_PAGES_PER_FOLDER = 10;   // 2000 файлов на папку (pageSize=200)

                while (queue.length > 0) {
                        if (signal.aborted) throw abortedError();
                        const folder = queue.shift()!;

                        let pageToken: string | undefined = undefined;
                        for (let page = 0; page < MAX_PAGES_PER_FOLDER; page++) {
                                if (signal.aborted) throw abortedError();

                                const url = this.buildListUrl(apiKey, folder.id, includeDocs ?? false, pageToken);
                                const json = await this.fetchJson(url, signal);
                                const list = this.parseListResponse(json);

                                for (const f of list.files) {
                                        // Папка → в очередь обхода; path детей = dir/name.
                                        if (f.mimeType === 'application/vnd.google-apps.folder') {
                                                if (visited.has(f.id)) continue; // защита от циклов
                                                visited.add(f.id);
                                                if (visited.size > MAX_FOLDERS) {
                                                        throw new Error(this.messages.manifestTruncated());
                                                }
                                                queue.push({ id: f.id, path: folder.path ? `${folder.path}/${f.name}` : f.name });
                                                continue;
                                        }

                                        // [overhaul S1/H-5] Google Docs/Sheets/Slides — «виртуальные»
                                        // файлы: alt=media их НЕ отдаёт (нужен /export endpoint,
                                        // не реализован). Пропускаем ВСЕГДА: это осознанное
                                        // ограничение типа, а не аномалия метаданных. Если
                                        // includeDocs=true — честно предупреждаем в консоль:
                                        // раньше такие файлы тихо выпадали и на NaN-size ниже.
                                        if (this.isGoogleDoc(f.mimeType)) {
                                                if (includeDocs ?? false) {
                                                        console.warn(`[VaultSync] gdrive: Google Doc не поддерживается (alt=media вместо /export), пропущен: ${folder.path ? folder.path + '/' : ''}${f.name}`);
                                                }
                                                continue;
                                        }

                                        // Полный путь (dir/name) — вычисляем ДО size-проверки:
                                        // сообщение об аномалии должно назвать путь.
                                        const path = folder.path ? `${folder.path}/${f.name}` : f.name;

                                        // [overhaul S1/H-5] Размер обязателен для RemoteEntry.
                                        // РАНЬШЕ NaN-size (не-док!) молчаливо пропускался → файл
                                        // «невидим» → дифф считал его удалённым → зеркальное
                                        // удаление локали. Паритет с яндексом [P2/M10]:
                                        // fail-closed сессией целиком. (Для Google Docs ветка
                                        // выше уже отработала — сюда доходят только обычные
                                        // файлы, у которых size обязателен.)
                                        const size = f.size !== undefined ? Number(f.size) : NaN;
                                        if (!Number.isFinite(size)) {
                                                throw new Error(this.messages.fileWithoutSize(path));
                                        }
                                        // [overhaul S1/H-5] oversize-файлы НЕ выбрасываем из
                                        // манифеста (паритет с git, где лимит не участвует в
                                        // фильтрации манифеста): координатор в фазе загрузок сам
                                        // положит их в failed-очередь с видимой причиной
                                        // (fileTooLarge). «Невидимых» удалений больше нет.

                                        // Hash: sha256Checksum (если есть), fallback — синтезированный.
                                        // [P2/M9] hashAlg ЧЕСТНЫЙ: реальный sha256 — 'sha256',
                                        // синтезированный токен — 'weak'. Ложный 'sha256' у weak-
                                        // токена ломал кэш (diff считает alg совпавшим и сравнивал
                                        // токен с hex) и конфликт-резолвер (localHash-sha256 никогда
                                        // не равен 'gdrive-weak:...' → конфликт на каждое изменение).
                                        const sha = typeof f.sha256Checksum === 'string' && f.sha256Checksum !== ''
                                                ? f.sha256Checksum
                                                : undefined;
                                        const hash = sha ?? synthesizeWeakHash(size, f.modifiedTime);
                                        const hashAlg: HashAlg = sha !== undefined ? 'sha256' : 'weak';

                                        // mtime — для UI-сортировки.
                                        let modified: number | undefined;
                                        if (f.modifiedTime) {
                                                const t = Date.parse(f.modifiedTime);
                                                if (Number.isFinite(t)) modified = t;
                                        }

                                        // Кэш path→id для fetch().
                                        this.pathToId.set(path, f.id);

                                        entries.push({
                                                path,
                                                hash,
                                                hashAlg,
                                                size,
                                                modified,
                                        });
                                }

                                if (!list.nextPageToken) break;
                                pageToken = list.nextPageToken;
                                // [P0/C3] страницы исчерпаны, nextPageToken жив → манифест неполон.
                                if (page === MAX_PAGES_PER_FOLDER - 1) {
                                        throw new Error(this.messages.manifestTruncated());
                                }
                        }
                }

                return entries;
        }

        async fetch(entry: RemoteEntry, signal: AbortSignal): Promise<ArrayBuffer> {
                if (signal.aborted) throw abortedError();
                // [P0/C1] Drive API требует ключ на КАЖДОМ запросе, включая alt=media.
                const { apiKey } = this.config();
                if (!apiKey) throw new Error(this.messages.apiKeyMissing());
                const id = this.pathToId.get(entry.path);
                if (!id) {
                        // Кэш не содержит ID — getManifest не зван или файл удалён.
                        // Coordinator обязан звать getManifest перед fetch, так что
                        // это либо кейс "файл удалён в source между getManifest и fetch",
                        // либо ошибка интеграции.
                        throw new Error(this.messages.fileNotFound(entry.path));
                }

                const url = `${GDRIVE_API_BASE}/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(apiKey)}`;
                // [overhaul S1/H-4] В 404-ошибку уходит ТОЛЬКО id файла: раньше
                // передавался весь url — с `key=<apiKey>` — и секрет персистился
                // в FailedFile.reason → data.json → topErrors журнала → UI.
                const buffer = await this.fetchBuffer(url, signal, id);
                if (buffer.byteLength !== entry.size) {
                        throw new Error(`GDrive: size mismatch for ${entry.path}: ${buffer.byteLength} != ${entry.size}`);
                }
                return buffer;
        }

        async dispose(): Promise<void> {
                // Состояния сессии нет (нет tmp-файлов); dispose — no-op.
                // Кэш pathToId НЕ чистим (переживает dispose — последующий sync
                // может reuse без повторного getManifest, хотя Coordinator обычно
                // всё равно зовёт getManifest для diff).
        }

        // --- Внутреннее ---

        /**
         * Построение URL для files.list с fields, q, pageToken.
         *
         * [P0/C2] q ВСЕГДА содержит родителя: `trashed=false and '<folderId>'
         * in parents`. folderId здесь — конкретная папка BFS-обхода
         * (или 'root' — псевдоним корня My Drive для листинга без folderId).
         */
        private buildListUrl(apiKey: string, folderId: string, _includeDocs: boolean, pageToken: string | undefined): string {
                const params = new URLSearchParams();
                params.set('key', apiKey);
                params.set('fields', 'files(id,name,mimeType,size,modifiedTime,sha256Checksum,md5Checksum),nextPageToken,incompleteSearch');
                params.set('pageSize', '200');
                params.set('q', `trashed=false and '${folderId}' in parents`);
                if (pageToken) {
                        params.set('pageToken', pageToken);
                }
                // includeDocs не фильтруется на уровне q (GDrive mimeType-фильтр
                // громоздкий: mimeType != 'application/vnd.google-apps.document' AND ...).
                // Фильтр выполним на клиенте после листинга.
                return `${GDRIVE_API_BASE}/files?${params.toString()}`;
        }

        /**
         * GET files.list. Безусловный (GDrive не отдаёт ETag для listings —
         * использует changedSince, но это требует timestamp последнего sync'а,
         * чего у нас нет на уровне движка). Каждый getManifest — полный листинг.
         * Incremental sync достигается за счёт того, что Coordinator.fetch
         * дёргается только для изменившихся файлов (diff по hash).
         */
        private async fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
                try {
                        const buffer = await this.net.fetchBuffer(url, {
                                headers: { 'Accept': 'application/json' },
                                signal,
                                retries: MAX_RETRY_ATTEMPTS,
                                maxRateLimitWaitMs: MAX_RATE_LIMIT_WAIT_MS,
                                classifyRateLimit: classifyGDriveRateLimit,
                                onRateLimitWait: (waitMs: number) => this.onRateLimitWait?.(waitMs),
                        });
                        return JSON.parse(new TextDecoder().decode(buffer));
                } catch (e: any) {
                        if (e?.rateLimitExceeded) throw new Error(this.messages.rateLimitExceedsHour());
                        if (e?.status) throw new Error(this.messages.listFailed(e.status));
                        throw e;
                }
        }

        private parseListResponse(json: unknown): GDriveListResponse {
                if (!json || typeof json !== 'object') {
                        throw new Error(this.messages.invalidResponse('not an object'));
                }
                const obj = json as Record<string, unknown>;
                if (obj.incompleteSearch === true) throw new Error(this.messages.manifestTruncated());
                if (!Array.isArray(obj.files)) {
                        throw new Error(this.messages.invalidResponse('files is not an array'));
                }
                const files = obj.files as GDriveFile[];
                // Валидация: каждый файл обязан иметь id, name и mimeType.
                for (const f of files) {
                        if (typeof f.id !== 'string' || typeof f.name !== 'string' || typeof f.mimeType !== 'string') {
                                throw new Error(this.messages.invalidResponse('file missing id/name/mimeType'));
                        }
                }
                return { files, nextPageToken: typeof obj.nextPageToken === 'string' ? obj.nextPageToken : undefined };
        }

        /**
         * GDoc/Sheets/Slides — это "виртуальные" файлы; alt=media их не отдаёт
         * (нужен /export endpoint с выбранным форматом). По умолчанию
         * includeDocs=false → пропускаем.
         */
        private isGoogleDoc(mimeType: string): boolean {
                return mimeType.startsWith('application/vnd.google-apps.');
        }

        /**
         * Download file content via alt=media. GDrive отдаёт бинарный поток.
         * [overhaul S1/H-4] notFoundLabel — ЧТО называть в 404-сообщении
         * (id файла или путь): НИКОГДА не url с ключом (утечка секрета).
         */
        private async fetchBuffer(url: string, signal: AbortSignal, notFoundLabel: string): Promise<ArrayBuffer> {
                try {
                        return await this.net.fetchBuffer(url, {
                                headers: { 'Accept': 'application/octet-stream' },
                                signal,
                                retries: MAX_RETRY_ATTEMPTS,
                                maxRateLimitWaitMs: MAX_RATE_LIMIT_WAIT_MS,
                                classifyRateLimit: classifyGDriveRateLimit,
                                onRateLimitWait: (waitMs: number) => this.onRateLimitWait?.(waitMs),
                        });
                } catch (e: any) {
                        if (e?.rateLimitExceeded) throw new Error(this.messages.rateLimitExceedsHour());
                        if (e?.status === 404) throw new Error(this.messages.fileNotFound(notFoundLabel));
                        if (e?.status) throw new Error(this.messages.downloadFailed(e.status));
                        throw e;
                }
        }
}
