// ============================================================
// --- ADAPTERS/ARCHIVE-DOWNLOADER (фаза 5, задача 5-f) ---
// Десктоп-реализация ArchiveDownloader (дизайн §7.1): стрим
// архива в tmp-файл через Node https — память O(1) по чанкам,
// байтовый прогресс из content-length, ручные редиректы ≤ 5,
// destroy() по AbortSignal с удалением tmp в finally.
// Node API — только ленивым require внутри методов (мобильный
// бандл не тянет node-модули; В5-1). Мобильная ветка
// (requestUrl → BufferArchiveReader) живёт в main.ts — там
// доступен obsidian API.
// ============================================================

import type { ArchiveDownloadProgress, ArchiveDownloader, RandomAccessReader } from '../sources/types';
import type { HeadResponse, RangeResponse, ZipRangeTransport } from '../sources/zip-test-connection';
import { FileArchiveReader } from './file-archive-reader';

interface ResumeSnapshot { url?: string; etag?: string; total?: number; }
function archiveError(code: 'archive-response' | 'archive-timeout', message: string): Error & { code: string } {
        return Object.assign(new Error(message), { code });
}
function strongETag(value?: string): string | undefined {
        return value && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value) ? value : undefined;
}
function contentLength(value?: string): number | undefined {
        if (value === undefined) return undefined;
        const length = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(length) || length < 0) throw archiveError('archive-response', 'Invalid archive Content-Length');
        return length;
}
function parseContentRange(value?: string): { start: number; end: number; total: number } | undefined {
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
        if (!match) return undefined;
        const [start, end, total] = match.slice(1).map(Number);
        if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || end >= total) return undefined;
        return { start, end, total };
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

/** Transitional local retry policy: three attempts, 500/1500 ms backoff.
 * Explicit HTTP 429/5xx and Node transport codes may retry. User cancellation,
 * our timeout, invalid ranges and unknown failures do not. Shared RetryBudget,
 * Retry-After and durable resume receipts remain separate overhaul work. */
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS: number[] = [500, 1500];

/**
 * [W6-T02] Классификация ошибок: стоит ли ретраить.
 *
 * Возвращает true для сетевых сбоев (ECONNRESET/EPIPE/etc.) и HTTP 5xx/429.
 * Возвращает false для 4xx (кроме 429), abort, timeout, прочих ошибок.
 *
 * Стратегия: false по умолчанию (не ретраить незнакомые ошибки — лучше
 * упасть честно, чем молотить сервер). Retryable — только явные кандидаты.
 */
function isRetryableError(e: any): boolean {
        // Abort — никогда не ретраится (пользователь явно сказал «стоп»).
        if (e?.aborted) return false;

        // Timeout — см. комментарий выше (НЕ ретраим зависания).
        if (e?.code === 'archive-timeout') return false;

        // HTTP-статусы (от NetError/fetchBuffer).
        const status = typeof e?.status === 'number' ? e.status : null;
        if (status !== null) {
                // 429 (rate limit) — ретраим (backoff даёт серверу остыть).
                if (status === 429) return true;
                // 5xx — server-side transient failure.
                if (status >= 500 && status < 600) return true;
                // 4xx — клиентская ошибка (404/403/401/etc.), ретраи бессмысленны.
                return false;
        }

        // Сетевые коды Node (ECONNRESET/EPIPE/ETIMEDOUT/ECONNABORTED/EAI_AGAIN).
        // Проверяем по имени кода — стабильный контракт Node (libuv).
        const code = e?.code;
        if (typeof code === 'string') {
                if (['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code)) {
                        return true;
                }
        }

        // По умолчанию — не ретраим (fail-closed: лучше упасть, чем молотить).
        return false;
}

/**
 * [W6-T02] Пауза между попытками. Уважает AbortSignal: если пользователь
 * отменил — выходим немедленно (без ожидания). Возвращает false если
 * сигнал отменён во время паузы, true — пауза завершена нормально.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
        if (ms <= 0) return Promise.resolve(!signal?.aborted);
        return new Promise<boolean>((resolve) => {
                const t = setTimeout(() => {
                        signal?.removeEventListener('abort', onAbort);
                        resolve(!signal?.aborted);
                }, ms);
                const onAbort = () => {
                        clearTimeout(t);
                        resolve(false);
                };
                signal?.addEventListener('abort', onAbort, { once: true });
        });
}

function lazyHttps(): typeof import('https') {
        return require('https') as typeof import('https');
}

function lazyFs(): typeof import('fs') {
        return require('fs') as typeof import('fs');
}

function lazyOs(): typeof import('os') {
        return require('os') as typeof import('os');
}

function lazyPath(): typeof import('path') {
        return require('path') as typeof import('path');
}

function lazyHttp(): typeof import('http') {
        return require('http') as typeof import('http');
}

/** Минимальный контур request-объекта (для инъекции в тестах, 5-review M4). */
export interface FakeRequestLike {
        on(event: string, handler: (e: Error) => void): unknown;
        destroy(err?: Error): unknown;
}

/** Ошибка с флагом отмены (паритет с core/net.ts NetError.aborted). */
function abortedError(): Error & { aborted: boolean } {
        const e: Error & { aborted: boolean } = Object.assign(
                new Error('archive download aborted'),
                { aborted: true },
        );
        return e;
}

/** Перепометка сетевых сбоев: если сигнал уже отменён — это отмена, не сбой. */
function mapNetworkError(e: Error, signal?: AbortSignal): Error {
        if (signal?.aborted) {
                const mapped: Error & { aborted: boolean } = Object.assign(
                        new Error(`archive download aborted: ${e.message}`),
                        { aborted: true },
                );
                return mapped;
        }
        return e;
}

/**
 * FileArchiveReader, который при dispose() ещё и УДАЛЯЕТ tmp-файл:
 * downloader — единственный владелец временного файла (дизайн §7.1,
 * «tmp удаляется в finally»; жизненный цикл — через ZipUrlSource.dispose
 * → Coordinator.sync finally).
 */
export class TempFileArchiveReader extends FileArchiveReader {
        private readonly tmpPath: string;

        constructor(tmpPath: string) {
                super(tmpPath);
                this.tmpPath = tmpPath;
        }

        override async dispose(): Promise<void> {
                await super.dispose();
                try {
                        lazyFs().unlinkSync(this.tmpPath);
                } catch {
                        // Файл уже исчез (внешняя чистка tmp) — не ошибка.
                }
        }
}

/**
 * Десктопный ArchiveDownloader: https-стрим → tmp-файл →
 * TempFileArchiveReader (random access без загрузки в память).
 */
export class NodeArchiveDownloader implements ArchiveDownloader {
        private readonly requestTimeoutMs: number;
        /**
         * [5-review M4] Инъекция http(s)-модуля для тестов (фейковые ответы,
         * редиректы, abort). Прод: не задаётся — ленивые require по протоколу.
         */
        private readonly moduleOverride?: (url: string) => { get(url: string, opts: unknown, cb: (res: unknown) => void): FakeRequestLike };
        /** [W6-T02] Максимум попыток скачивания (1 + retries). */
        private readonly maxAttempts: number;
        /** [W6-T02] Бэкофф между попытками (между attempt1..attemptN). */
        private readonly retryBackoffMs: number[];

        constructor(
                requestTimeoutMs = 120000,
                moduleOverride?: (url: string) => { get(url: string, opts: unknown, cb: (res: unknown) => void): FakeRequestLike },
                /** [W6-T02] Максимум попыток скачивания (по умолчанию 3 = 1 + 2 retries). */
                maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
                /** [W6-T02] Паузы между попытками в мс (по умолчанию [500, 1500]). */
                retryBackoffMs: number[] = DEFAULT_RETRY_BACKOFF_MS,
        ) {
                this.requestTimeoutMs = requestTimeoutMs;
                this.moduleOverride = moduleOverride;
                this.maxAttempts = Math.max(1, maxAttempts);
                this.retryBackoffMs = retryBackoffMs.length > 0 ? retryBackoffMs : DEFAULT_RETRY_BACKOFF_MS;
        }

        /** http или https по протоколу URL (L2: http://-серверы без TLS). */
        private getModule(url: string) {
                if (this.moduleOverride) return this.moduleOverride(url);
                return url.startsWith('http://') ? lazyHttp() : lazyHttps();
        }

        async download(
                url: string,
                opts: { signal?: AbortSignal; onProgress?: (p: ArchiveDownloadProgress) => void } = {},
        ): Promise<RandomAccessReader> {
                const fs = lazyFs();
                const os = lazyOs();
                const pathMod = lazyPath();
                const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
                const tmpPath = pathMod.join(os.tmpdir(), `vaultsync-${unique}.zip`);

                const snapshot: ResumeSnapshot = {};
                let lastError: unknown = null;
                for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
                        // Abort перед попыткой — выходим без wait.
                        if (opts.signal?.aborted) {
                                try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
                                throw abortedError();
                        }
                        // Пауза перед попыткой 2+ (не перед первой).
                        if (attempt > 1) {
                                const backoffIdx = Math.min(attempt - 2, this.retryBackoffMs.length - 1);
                                const backoffMs = this.retryBackoffMs[backoffIdx];
                                const ok = await sleep(backoffMs, opts.signal);
                                if (!ok) {
                                        // Abort во время паузы — выходим.
                                        try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
                                        throw abortedError();
                                }
                        }

                        // Перед попыткой — определим размер tmp-файла (для Range-resume).
                        let resumeFromByte = 0;
                        try {
                                const st = fs.statSync(tmpPath);
                                if (st.size > 0) resumeFromByte = st.size;
                        } catch {
                                // файла нет — fresh download (resumeFromByte = 0).
                        }

                        try {
                                await this.downloadToFile(url, tmpPath, opts, 0, resumeFromByte, snapshot);
                                return new TempFileArchiveReader(tmpPath);
                        } catch (e) {
                                lastError = e;
                                // Abort — никогда не ретраится, выходим немедленно.
                                if (opts.signal?.aborted) {
                                        try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
                                        throw abortedError();
                                }
                                // Неретраимая ошибка — выходим без ожидания.
                                if (!isRetryableError(e)) {
                                        try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
                                        throw e;
                                }
                                // Ретраимая ошибка — продолжаем цикл (если есть ещё попытки).
                                // tmp-файл НЕ удаляем: при следующей попытке downloadToFile
                                // попытается Range-resume, а если сервер 200 вместо 206 —
                                // truncate и начнёт заново. Если это последняя попытка —
                                // выйдем из цикла и удалим tmp в finally ниже.
                        }
                }
                // Все попытки исчерпаны. Tmp вычищаем, выбрасываем последнюю ошибку.
                try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
                throw lastError;
        }

        /** Resume is invocation-local and requires a strong validator and known total.
         * Pipeline settlement owns the file until it is closed, including failures. */
        private downloadToFile(
                url: string,
                tmpPath: string,
                opts: { signal?: AbortSignal; onProgress?: (p: ArchiveDownloadProgress) => void },
                depth: number,
                resumeFromByte: number,
                snapshot: ResumeSnapshot,
        ): Promise<void> {
                return new Promise<void>((resolve, reject) => {
                        if (opts.signal?.aborted) { reject(abortedError()); return; }
                        const { pipeline, Transform } = require('stream') as typeof import('stream');
                        const resume = resumeFromByte > 0 && snapshot.url === url && snapshot.etag !== undefined
                                && snapshot.total !== undefined && resumeFromByte < snapshot.total;
                        const headers: Record<string, string> = { 'accept-encoding': 'identity' };
                        if (resume) { headers.range = `bytes=${resumeFromByte}-`; headers['if-range'] = snapshot.etag!; }
                        let req: FakeRequestLike | undefined;
                        let response: import('http').IncomingMessage | undefined;
                        let streaming = false, settled = false;
                        let failure: Error | undefined;
                        let headerTimer: ReturnType<typeof setTimeout> | undefined;
                        const cleanup = () => {
                                clearTimeout(headerTimer);
                                opts.signal?.removeEventListener('abort', onAbort);
                        };
                        const finish = (error?: Error | null) => {
                                if (settled) return;
                                settled = true;
                                cleanup();
                                if (error) reject(mapNetworkError(error, opts.signal)); else resolve();
                        };
                        const fail = (error: Error) => {
                                if (settled || failure) return;
                                failure = error;
                                // Once piping starts only its callback may settle: destroying the
                                // request alone does not prove the file descriptor has closed.
                                if (streaming) response?.destroy(error);
                                else { response?.destroy(); finish(error); }
                                req?.destroy(error);
                        };
                        const onAbort = () => fail(abortedError());
                        try {
                                headerTimer = setTimeout(() => fail(archiveError('archive-timeout', 'Archive response headers timed out')), this.requestTimeoutMs);
                                req = this.getModule(url).get(url, { timeout: this.requestTimeoutMs, headers }, (raw: unknown) => {
                                        const res = raw as import('http').IncomingMessage;
                                        if (settled) { res.destroy(); return; }
                                        response = res;
                                        clearTimeout(headerTimer);
                                        const status = res.statusCode ?? 0;
                                        try {
                                                if (REDIRECT_STATUSES.includes(status)) {
                                                        const location = headerStr(res.headers, 'location');
                                                        if (!location || depth >= MAX_REDIRECTS) throw archiveError('archive-response', 'Invalid archive redirect');
                                                        const nextUrl = new URL(location, url).toString();
                                                        // Conservative restart on every redirect; do not forward validators.
                                                        res.destroy();
                                                        settled = true;
                                                        cleanup();
                                                        this.downloadToFile(nextUrl, tmpPath, opts, depth + 1, 0, snapshot).then(resolve, reject);
                                                        return;
                                                }
                                                if (status !== 200 && status !== 206) {
                                                        throw Object.assign(archiveError('archive-response', `HTTP ${status} for archive download`), { status });
                                                }
                                                const encoding = headerStr(res.headers, 'content-encoding');
                                                if (encoding && encoding.toLowerCase() !== 'identity') throw archiveError('archive-response', 'Encoded archive representation is unsupported');
                                                const length = contentLength(headerStr(res.headers, 'content-length'));
                                                const etag = strongETag(headerStr(res.headers, 'etag'));
                                                const partial = status === 206;
                                                if (partial) {
                                                        const range = parseContentRange(headerStr(res.headers, 'content-range'));
                                                        if (!resume || !range || range.start !== resumeFromByte || range.total !== snapshot.total
                                                                || range.end !== range.total - 1 || etag !== snapshot.etag
                                                                || (length !== undefined && length !== range.end - range.start + 1)) {
                                                                throw archiveError('archive-response', 'Archive resume range or validator mismatch');
                                                        }
                                                } else {
                                                        if (headerStr(res.headers, 'content-range') !== undefined) throw archiveError('archive-response', 'Unexpected Content-Range on full archive');
                                                        snapshot.url = url; snapshot.etag = etag; snapshot.total = length;
                                                }
                                                const totalBytes = (partial ? snapshot.total : length) ?? null;
                                                let received = partial ? resumeFromByte : 0;
                                                const counter = new Transform({
                                                        transform(chunk: Buffer, _encoding, callback) {
                                                                received += chunk.length;
                                                                if (!Number.isSafeInteger(received) || (totalBytes !== null && received > totalBytes)) {
                                                                        callback(archiveError('archive-response', 'Archive body exceeds declared length')); return;
                                                                }
                                                                try { opts.onProgress?.({ bytesTransferred: received, totalBytes }); }
                                                                catch (error) { callback(error instanceof Error ? error : new Error(String(error))); return; }
                                                                callback(null, chunk);
                                                        },
                                                        flush(callback) {
                                                                callback(totalBytes !== null && received !== totalBytes
                                                                        ? archiveError('archive-response', 'Archive body length mismatch') : undefined);
                                                        },
                                                });
                                                const out = lazyFs().createWriteStream(tmpPath, { flags: partial ? 'a' : 'w' });
                                                streaming = true;
                                                pipeline(res, counter, out, error => finish(failure ?? error));
                                        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
                                });
                                req.on('error', (error: Error) => fail(error));
                                req.on('timeout', () => fail(archiveError('archive-timeout', `archive download timeout after ${this.requestTimeoutMs}ms`)));
                                if (!settled) {
                                        opts.signal?.addEventListener('abort', onAbort, { once: true });
                                        if (opts.signal?.aborted) onAbort();
                                }
                        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
                });
        }

}

// ============================================================
// --- [W3-T04] ADAPTERS/NODE-ZIP-RANGE-TRANSPORT ---
// Десктопный ZipRangeTransport поверх node:https: HEAD + Range
// (lazy require — паритет с NodeArchiveDownloader, решение В5-1).
// Используется testZipConnection для лёгкой проверки без полного
// скачивания. Редиректы ≤ MAX_REDIRECTS, тот же стиль abort/timeout.
// ============================================================

/** Универсальный «стрим → буфер»: дотягивает тело ответа в Buffer. */
function drainBody(res: { on(event: 'data', cb: (c: Buffer) => void): unknown; on(event: 'end', cb: () => void): unknown; on(event: 'error', cb: (e: Error) => void): unknown; resume?(): unknown }): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', (e: Error) => reject(e));
        });
}

/** Заголовок ответа как строка (lowercase ключ); undefined если нет. */
function headerStr(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
        const v = headers[key.toLowerCase()];
        if (Array.isArray(v)) return v[0];
        return v;
}

/**
 * Десктопный ZipRangeTransport: https HEAD + Range. Lazy require —
 * мобильный бандл не тянет node:https. В тестах используется
 * FakeRangeTransport (см. tests/zip-test-connection.test.ts).
 */
export class NodeZipRangeTransport implements ZipRangeTransport {
        private readonly requestTimeoutMs: number;
        /** [5-review M4] Инъекция http(s)-модуля для тестов. */
        private readonly moduleOverride?: (url: string) => { request(opts: unknown, cb: (res: unknown) => void): { on(event: string, handler: (e: Error) => void): void; destroy(err?: Error): void } };

        constructor(
                requestTimeoutMs = 60000,
                moduleOverride?: (url: string) => { request(opts: unknown, cb: (res: unknown) => void): { on(event: string, handler: (e: Error) => void): void; destroy(err?: Error): void } },
        ) {
                this.requestTimeoutMs = requestTimeoutMs;
                this.moduleOverride = moduleOverride;
        }

        private getModule(url: string) {
                if (this.moduleOverride) return this.moduleOverride(url);
                return url.startsWith('http://') ? lazyHttp() : lazyHttps();
        }

        /** Один заход request с возможностью ручных редиректов ≤ MAX_REDIRECTS. */
        private request(url: string, method: 'HEAD' | 'GET', headers: Record<string, string>, signal?: AbortSignal, depth: number = 0): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer | null }> {
                return new Promise((resolve, reject) => {
                        const onAbort = () => req.destroy(abortedError());
                        const cleanup = () => signal?.removeEventListener('abort', onAbort);

                        const settled = (fn: () => void) => {
                                cleanup();
                                fn();
                        };

                        const httpMod: any = this.getModule(url);
                        const req = httpMod.request({ ...parseUrl(url), method, headers, timeout: this.requestTimeoutMs }, (res: any) => {
                                const status: number = res.statusCode ?? 0;
                                // Редирект
                                if (REDIRECT_STATUSES.includes(status)) {
                                        res.resume();
                                        const location = headerStr(res.headers, 'location');
                                        if (!location) {
                                                settled(() => reject(new Error(`redirect without Location (HTTP ${status})`)));
                                                return;
                                        }
                                        // [P1/M7] лимит глубины: без него зацикленный сервер
                                        // (A→B→A…) вешал Range-запрос бесконечной рекурсией —
                                        // паритет с NodeArchiveDownloader (depth >= MAX_REDIRECTS).
                                        if (depth >= MAX_REDIRECTS) {
                                                settled(() => reject(new Error(`too many redirects (> ${MAX_REDIRECTS})`)));
                                                return;
                                        }
                                        const nextUrl = new URL(location, url).toString();
                                        this.request(nextUrl, method, headers, signal, depth + 1).then(
                                                (r) => settled(() => resolve(r)),
                                                (e) => settled(() => reject(e)),
                                        );
                                        return;
                                }
                                if (method === 'HEAD') {
                                        res.resume();
                                        settled(() => resolve({ status, headers: res.headers, body: null }));
                                } else {
                                        drainBody(res).then(
                                                (body) => settled(() => resolve({ status, headers: res.headers, body })),
                                                (e) => settled(() => reject(e)),
                                        );
                                }
                        });
                        req.on('error', (e: Error) => settled(() => reject(mapNetworkError(e, signal))));
                        req.on('timeout', () => req.destroy(new Error(`zip range timeout after ${this.requestTimeoutMs}ms`)));
                        signal?.addEventListener('abort', onAbort, { once: true });
                        req.end();
                });
        }

        async head(url: string, opts: { signal?: AbortSignal } = {}): Promise<HeadResponse> {
                const r = await this.request(url, 'HEAD', {}, opts.signal);
                const headers: Record<string, string> = {};
                for (const [k, v] of Object.entries(r.headers)) {
                        if (v === undefined) continue;
                        headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
                }
                const clStr = headerStr(r.headers, 'content-length');
                let contentLength: number | null = null;
                if (clStr !== undefined) {
                        const cl = Number(clStr);
                        if (Number.isFinite(cl) && cl > 0) contentLength = cl;
                }
                const acceptRanges = headerStr(r.headers, 'accept-ranges') ?? null;
                return {
                        status: r.status,
                        contentLength,
                        acceptRanges: acceptRanges !== null ? acceptRanges.toLowerCase() : null,
                        headers,
                };
        }

        async getRange(url: string, start: number, end: number, opts: { signal?: AbortSignal } = {}): Promise<RangeResponse> {
                if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
                        throw new RangeError(`getRange: некорректный диапазон start=${start}, end=${end}`);
                }
                const r = await this.request(url, 'GET', { range: `bytes=${start}-${end}` }, opts.signal);
                const headers: Record<string, string> = {};
                for (const [k, v] of Object.entries(r.headers)) {
                        if (v === undefined) continue;
                        headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
                }
                const contentRange = headerStr(r.headers, 'content-range') ?? null;
                return {
                        status: r.status,
                        body: r.body ?? new Uint8Array(0),
                        contentRange,
                        headers,
                };
        }
}

/** Минимальный парсер URL в опции http.request (без query-обработки). */
function parseUrl(url: string): { protocol: string; hostname: string; port?: number; path: string } {
        const u = new URL(url);
        const out: { protocol: string; hostname: string; port?: number; path: string } = {
                protocol: u.protocol,
                hostname: u.hostname,
                path: u.pathname + u.search,
        };
        if (u.port !== '') out.port = Number(u.port);
        return out;
}
