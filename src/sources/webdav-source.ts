import { NetLayer } from '../core/net';
import type { TransferObserver } from './types';
// ============================================================
// --- SOURCES/WEBDAV-SOURCE (W6-T05) ---
// Нативный WebDAV движок: PROPFIND + GET для self-hosted vault
// без GitHub. Самый частый сценарий "хозяйский vault без GitHub"
// (план §8.4 аудита, решение Д11).
//
// Дизайн:
//   - getManifest: PROPFIND (Depth=1) с рекурсивным обходом.
//     Многие WebDAV-серверы не поддерживают Depth=infinity (RFC 4918
//     разрешает); поэтому идём через Depth=1 + явный обход коллекций.
//     [P0/C4] href из XML хранится RAW (percent-encoded, как отдал
//     сервер) и декодируется РОВНО ОДИН раз в resolveDavResource;
//     URL для GET/очереди строится из raw-href — имена
//     с '#'/'?' не разваливаются на fragment/query.
//     [P0/C3] при исчерпании бюджета коллекций — throw (паритет с
//     git treeTruncated): молчаливое усечение манифеста при живом
//     зеркале = потеря данных.
//   - fetch: GET with If-Match for a strong ETag; redirects are forbidden.
//   - HashAlg: 'etag' or 'weak'; neither claims a content digest.
//   - Auth: Basic (user:pass) из схемы; capabilities.auth=true.
//   - Capabilities: auth=true, etag=true, mtime=true, incremental=true,
//     testConnection=false.
//   - sourceId: webdav_<djb2(baseUrl + username)>. password НЕ входит.
//
// ЧИСТОТА: модуль не импортирует obsidian/node — только NetTransport
// (инъектируется из main.ts через EngineCtx.transport). PROPFIND идёт
// напрямую через transport.fetch (NetLayer.fetchBuffer — GET-only);
// ретраи/бэкофф — свой простой цикл.
// ============================================================

import type { NetTransport, RemoteEntry, SyncSource, HashAlg, NetRequest, NetResponse } from './types';
import { FetchTransport } from '../adapters/fetch-transport';
import { parseMultiStatus, resolveDavResource, type WebDavResource } from './webdav-xml';

const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [1000, 3000, 9000, 27000]; // экспоненциальный
const WEBDAV_MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 МБ (нет серверного лимита, берём безопасный)

/** Локализуемые сообщения источника (инъекция из main.ts). */
export interface WebDavSourceMessages {
        credentialsMissing: () => string;
        propfindFailed: (status: number) => string;
        downloadFailed: (status: number) => string;
        fileNotFound: (path: string) => string;
        invalidXml: (msg: string) => string;
        /** [P0/C3] Обход превысил бюджет коллекций — манифест неполон. */
        manifestTruncated: () => string;
        /** [overhaul S1/H-5] Файл без валидного getcontentlength — аномалия
         *  метаданных: fail-closed, сессия обязана упасть (паритет с яндексом
         *  [P2/M10]): молчаливый пропуск делал файл «невидимым» → дифф считал
         *  его удалённым из источника → зеркальное удаление локали. */
        fileWithoutSize: (path: string) => string;
}

export interface WebDavSourceOptions {
        /**
         * Текущая конфигурация WebDAV (читается на каждом запросе):
         *   - baseUrl: корень WebDAV (например, https://example.com/dav/).
         *   - username: для Basic auth.
         *   - password: для Basic auth (НЕ входит в sourceId).
         *   - rootPath: относительный путь от baseUrl для синхронизации
         *     (например, 'vault/'). Пусто = весь baseUrl.
         */
        config: () => { baseUrl: string; username: string; password: string; rootPath?: string };
        transport?: NetTransport;
        messages?: Partial<WebDavSourceMessages>;
        requestTimeoutMs?: number;
}

const DEFAULT_MESSAGES: WebDavSourceMessages = {
        credentialsMissing: () => 'WebDAV URL is required; a password requires a username.',
        propfindFailed: (s) => `PROPFIND failed: HTTP ${s}`,
        downloadFailed: (s) => `Download failed: HTTP ${s}`,
        fileNotFound: (path) => `WebDAV file not found: ${path}`,
        invalidXml: (msg) => `Invalid WebDAV XML response: ${msg}`,
        manifestTruncated: () => 'WebDAV tree too large (collection budget exhausted). Cannot sync safely.',
        fileWithoutSize: (path) => `WebDAV server returned no valid size for file "${path}". Sync stopped — local files untouched.`,
};

/**
 * Синтезированный "слабый" hash для файлов без ETag.
 * Формат: `webdav-weak:<size_hex>-<mtime_ms_hex>`.
 * Аналогично gdrive-weak — конфликт-резолвер видит несоответствие,
 * триггерит conflict при remote change. Для серверов с ETag всё работает
 * корректно (cache hit при совпадении ETag).
 */
function synthesizeWeakHash(size: number, mtime: string | null): string {
        let mtimeMs = 0;
        if (mtime) {
                const t = Date.parse(mtime);
                if (Number.isFinite(t)) mtimeMs = t;
        }
        return `webdav-weak:${size.toString(16)}-${mtimeMs.toString(16)}`;
}

/** Ошибка отмены (паритет с core/net.ts). */
function abortedError(): Error & { aborted: boolean } {
        const e = new Error('aborted') as Error & { aborted: boolean };
        e.aborted = true;
        return e;
}

/** Basic-auth header: base64(user:pass).
 *  [overhaul S1/H-7] UTF-8-safe: btoa принимает только Latin1 — пароль с
 *  кириллицей/CJK ранее бросал InvalidCharacterError и движок был полностью
 *  неработоспособен (Buffer-fallback в Electron недостижим). Кодируем
 *  СИМВОЛЫ в UTF-8 байты (RFC 7617, charset=UTF-8 — так ждут серверы),
 *  байты — в бинарную строку для btoa. Экспорт — для юнит-теста. */
export function basicAuthHeader(user: string, pass: string): string {
        const cred = `${user}:${pass}`;
        let encoded: string;
        if (typeof TextEncoder !== 'undefined') {
                const bytes = new TextEncoder().encode(cred);
                let bin = '';
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                // btoa определён во всех Electron/браузерных средах; для
                // симметрии — fallback-цепочка ниже на случай экзотики.
                encoded = typeof btoa !== 'undefined'
                        ? btoa(bin)
                        : Buffer.from(bin, 'binary').toString('base64');
        } else if (typeof btoa !== 'undefined') {
                // Среда без TextEncoder: честный Latin1-путь (не-Latin1 пароль
                // бросит — лучше явная ошибка, чем тихо неверный заголовок).
                encoded = btoa(cred);
        } else {
                encoded = Buffer.from(cred, 'utf-8').toString('base64');
        }
        return `Basic ${encoded}`;
}

/** [overhaul S1-review #1] URL для сообщений об ошибках: без query-строки и
 *  БЕЗ userinfo (https://user:pass@host/ в baseUrl — пароль не должен
 *  попадать в текст ошибки → журнал → failed-очередь → data.json → UI).
 *  Defense-in-depth, паритет с urlForLog в core/net.ts. */
function urlForLog(url: string): string {
        try {
                const u = new URL(url);
                return u.origin + u.pathname;
        } catch {
                const q = url.indexOf('?');
                return q >= 0 ? url.slice(0, q) : url;
        }
}

/** HTTP error with retry classification. XML parsing lives in webdav-xml.ts. */
class WebDavError extends Error {
        constructor(public status: number, message: string) {
                super(message);
        }
}

/** Классификация: ретраим 5xx/429/503; НЕ ретраим 4xx (кроме 429). */
function isRetryableStatus(status: number): boolean {
        return status === 429 || status === 503 || (status >= 500 && status < 600);
}

/** Пауза с уважением к AbortSignal. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
        return new Promise<void>((resolve, reject) => {
                const t = setTimeout(() => {
                        signal?.removeEventListener('abort', onAbort);
                        resolve();
                }, ms);
                const onAbort = () => {
                        clearTimeout(t);
                        reject(abortedError());
                };
                signal?.addEventListener('abort', onAbort, { once: true });
        });
}

export class WebDavSource implements SyncSource {
        readonly kind = 'webdav' as const;
        readonly deletionSafety = 'unverified' as const;
        readonly maxFileSizeBytes = WEBDAV_MAX_FILE_SIZE;

        private readonly config: () => { baseUrl: string; username: string; password: string; rootPath?: string };
        private readonly transport: NetTransport;
        private manifestObserve?:TransferObserver;
        private readonly messages: WebDavSourceMessages;
        private readonly requestTimeoutMs: number;

        /**
         * Кэш path → { etag, fullPath }: наполняется в getManifest, используется
         * в fetch для URL. НЕ персистентный.
         */
        private readonly pathToMeta = new Map<string, { etag: string | null; fullPath: string }>();

        constructor(opts: WebDavSourceOptions) {
                this.config = opts.config;
                this.messages = { ...DEFAULT_MESSAGES, ...opts.messages };
                this.requestTimeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
                this.transport = opts.transport ?? new FetchTransport({ timeoutMs: this.requestTimeoutMs });
        }

        async getManifest(signal: AbortSignal,observe?:TransferObserver): Promise<RemoteEntry[]> {
                this.manifestObserve=event=>observe?.({...event,stage:event.stage==='waiting'?'waiting':'manifest',bytes:undefined,totalBytes:undefined,byteDelta:undefined});
                if (signal.aborted) throw abortedError();
                const { baseUrl, username, password: _password, rootPath } = this.config();
                if (!baseUrl.trim() || (_password && !username.trim())) throw new Error(this.messages.credentialsMissing());

                this.pathToMeta.clear();
                const entries: RemoteEntry[] = [];

                const startUrl = this.normalizeUrl(baseUrl, rootPath);
                // [P0/C3] Бюджет УНИКАЛЬНЫХ коллекций: при живом зеркале молчаливое
                // усечение = «файлы исчезли из источника» → корзина → throw
                // (паритет с git treeTruncated / yandex structureChanged).
                // Счётчик — только уникальные URL (раньше depthCount++ стоял ДО
                // проверки visited — повторные URL сжигали бюджет впустую).
                const MAX_COLLECTIONS = 3200;
                const queue: string[] = [startUrl];
                const visited = new Set<string>();
                let collections = 0;

                while (queue.length > 0) {
                        if (signal.aborted) throw abortedError();
                        const url = queue.shift()!;
                        if (visited.has(url)) continue;
                        visited.add(url);
                        collections++;
                        if (collections > MAX_COLLECTIONS) {
                                throw new Error(this.messages.manifestTruncated());
                        }

                        const resources = await this.propfind(url, signal);
                        if (!resources.some(resource => resource.isCollection && this.isSelfRef(resource.href, url))) {
                                throw new Error(this.messages.invalidXml('collection response is missing'));
                        }
                        let skippedSelf = false;
                        for (const r of resources) {
                                const resolved = resolveDavResource(r.href, url, startUrl);
                                if (!skippedSelf && this.isSelfRef(r.href, url)) {
                                        skippedSelf = true;
                                        continue;
                                }

                                const path = resolved.path;
                                if (!path) continue;

                                if (r.isCollection) {
                                        // [P0/C4] URL из RAW-href: percent-encoding сервера
                                        // сохраняется, '#'/'?' в именах не разваливаются.
                                        queue.push(resolved.url);
                                        continue;
                                }

                                // [overhaul S1/H-5] Файл без валидного getcontentlength —
                                // аномалия метаданных: РАНЬШЕ молчаливый continue делал файл
                                // «невидимым» для манифеста → дифф считал его удалённым из
                                // источника → при light/full зеркальное удаление локали.
                                // Паритет с яндексом [P2/M10]: fail-closed, сессия падает
                                // ЦЕЛИКОМ, удаления не исполняются.
                                if (r.size === null || !Number.isFinite(r.size)) {
                                        throw new Error(this.messages.fileWithoutSize(path));
                                }
                                // [overhaul S1/H-5] oversize-файлы НЕ выбрасываем из манифеста
                                // (паритет с git, где maxFileSizeBytes не участвует в фильтрации
                                // манифеста): запись остаётся — координатор в фазе загрузок сам
                                // положит её в failed-очередь с видимой причиной (fileTooLarge).
                                // «Невидимых» удалений больше нет.

                                // [P2/M9] hashAlg ЧЕСТНЫЙ: ETag-токен — 'etag', синтезированный
                                // size+mtime — 'weak'. Ложный 'sha256' ломал кэш и конфликт-резолвер
                                // (localHash-sha256 никогда не равен ETag/weak-токену → конфликты
                                // на каждое remote-изменение).
                                const hash = r.etag ?? synthesizeWeakHash(r.size, r.lastModified);
                                const hashAlg: HashAlg = r.etag ? 'etag' : 'weak';

                                let modified: number | undefined;
                                if (r.lastModified) {
                                        const t = Date.parse(r.lastModified);
                                        if (Number.isFinite(t)) modified = t;
                                }

                                if (this.pathToMeta.has(path)) throw new Error(`WebDAV path collision: ${path}`);
                                this.pathToMeta.set(path, { etag: r.etag, fullPath: resolved.url });
                                entries.push({ path, hash, hashAlg, size: r.size, modified });
                        }
                }

                return entries;
        }

        async fetch(entry: RemoteEntry, signal: AbortSignal, observe?: TransferObserver): Promise<ArrayBuffer> {
                if (signal.aborted) throw abortedError();
                const cached = this.pathToMeta.get(entry.path);
                if (!cached) {
                        throw new Error(this.messages.fileNotFound(entry.path));
                }
                const headers: Record<string, string> = { 'accept': 'application/octet-stream' };
                this.applyAuth(headers);
                if (cached.etag && !/^W\//i.test(cached.etag)) headers['if-match'] = cached.etag;
                const buffer = await this.fetchWithRetry(cached.fullPath, 'GET', headers, undefined, signal, observe, entry.size);
                if (buffer.byteLength !== entry.size) {
                        throw new Error(`WebDAV: size mismatch for ${entry.path}: ${buffer.byteLength} != ${entry.size}`);
                }
                return buffer;
        }

        async dispose(): Promise<void> {
                // Нет состояния сессии (нет tmp); dispose — no-op.
        }

        // --- Внутреннее ---

        /**
         * PROPFIND Depth=1 к коллекции с retry-циклом.
         */
        private async propfind(url: string, signal: AbortSignal): Promise<WebDavResource[]> {
                const headers: Record<string, string> = {
                        'depth': '1',
                        'content-type': 'application/xml; charset=utf-8',
                };
                this.applyAuth(headers);
                const body = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:getetag/>
  </D:prop>
</D:propfind>`;
                const buffer = await this.fetchWithRetry(url, 'PROPFIND', headers, body, signal);
                const xml = new TextDecoder().decode(buffer);
                const resources = parseMultiStatus(xml);
                if (resources.length === 0) {
                        throw new Error(this.messages.invalidXml('no <response> elements'));
                }
                return resources;
        }

        /**
         * Базовый retry-цикл для PROPFIND/GET. Простой — без classifyRateLimit
         * (WebDAV редко отдаёт Retry-After); ретраим 5xx/429/503 с экспоненциальным
         * бэкоффом. 4xx — fail-fast (клиентская ошибка).
         */
        private async fetchWithRetry(url:string,method:string,headers:Record<string,string>,body:string|undefined,signal:AbortSignal,observe?:TransferObserver,expectedSize?:number):Promise<ArrayBuffer> {
                try {return await new NetLayer(this.transport).fetchBuffer(url,{method,headers,body,signal,observe:observe??(method==='PROPFIND'?this.manifestObserve:undefined),expectedSize,redirect:'error',retries:MAX_RETRY_ATTEMPTS,retryBackoffMs:RETRY_BACKOFF_MS});}
                catch(error){if((error as {status?:number}).status)(error as Error).message=this.messagesFor(method,(error as {status:number}).status);throw error;}
        }

        private messagesFor(method: string, status: number): string {
                if (method === 'PROPFIND') return this.messages.propfindFailed(status);
                return this.messages.downloadFailed(status);
        }

        private applyAuth(headers: Record<string, string>): void {
                const { username, password } = this.config();
                if (username) {
                        // lowercase per NetResponse convention (all header keys lowercase).
                        headers['authorization'] = basicAuthHeader(username, password);
                }
        }

        private normalizeUrl(baseUrl: string, rootPath?: string): string {
                const url = new URL(baseUrl);
                if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
                        throw new Error('Invalid WebDAV root URL');
                }
                let path = url.pathname.replace(/\/+$/, '');
                if (rootPath && rootPath.trim() !== '') {
                        const relative = rootPath.trim().replace(/^\/+|\/+$/g, '');
                        if (relative.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('Invalid WebDAV root path');
                        path += '/' + relative;
                }
                url.pathname = path + '/';
                return url.toString();
        }

        private isSelfRef(href: string, url: string): boolean {
                try {
                        const hrefUrl = new URL(href, url).toString().replace(/\/+$/, '');
                        const reqUrl = url.replace(/\/+$/, '');
                        return hrefUrl === reqUrl;
                } catch {
                        return false;
                }
        }
}
