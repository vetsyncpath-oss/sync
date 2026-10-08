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

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

/**
 * [W6-T02] Число попыток скачивания архива. Старое поведение = 1 попытка
 * (zero-retry), что является асимметрией надёжности: git/yandex имеют
 * 5 ретраев, zip — ноль. Сетевой чих на 500 МБ архив = провал сессии.
 *
 * 3 попытки с бэкоффом 500ms/1500ms: между попытками 1 + 2 = 2 паузы
 * (поэтому attempts = 1 + retries = 3). Бэкофф экспоненциальный, но
 * capped — иначе на 4-й попытке была бы 13.5s пауза.
 *
 * НЕ ретраятся (isRetryableError возвращает false):
 *   - 4xx (кроме 429) — серверная ошибка, повтор не поможет
 *   - abort (signal.aborted) — намеренная отмена пользователем
 *   - timeout — см. ниже
 *   - "too many redirects" / "redirect without Location"
 *
 * Ретраятся:
 *   - 5xx — временный сбой сервера
 *   - 429 — rate limit (backoff даёт серверу время остыть)
 *   - ECONNRESET/EPIPE/ETIMEDOUT/ECONNABORTED — типичный "сетевой чих"
 *   - stream 'error' mid-download — обрыв связи
 *
 * Timeout НЕ ретраится: timeout означает зависший сервер (req.destroy
 * по таймеру). При ретраях мы бы продолжали стучаться в тот же висяк,
 * расходуя лимит попыток. Пользователь может перезапустить sync вручную.
 * Это также сохраняет существующий тест «timeout → req.destroy + ошибка».
 */
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
        const msg = String(e?.message ?? e ?? '');
        if (/timeout/i.test(msg)) return false;

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
                if (['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
                        return true;
                }
        }

        // Прочие ошибки: regex по сообщению (fallback для случаев, когда code
        // не выставлен — стрим-ошибка без явного errno).
        if (/ECONNRESET|EPIPE|ETIMEDOUT|ECONNABORTED|socket hang up|network error/i.test(msg)) {
                return true;
        }

        // "redirect" / "Location" — серверная/логическая ошибка, не ретраим.
        if (/redirect/i.test(msg)) return false;

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
                                await this.downloadToFile(url, tmpPath, opts, 0, resumeFromByte);
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

        /**
         * Один заход стрима (рекурсивно — по редиректам, ≤ MAX_REDIRECTS).
         *
         * [W6-T02] resumeFromByte: 0 = fresh download (truncate tmp); >0 =
         * продолжить с этой позиции, добавив Range: bytes=N-. Если сервер
         * отдал 206 (Partial Content) → append к tmp; если 200 (Range ignored)
         * → truncate + start fresh. 200 на fresh start = overwrite (по умолчанию
         * fs.createWriteStream truncate'ит).
         */
        private downloadToFile(
                url: string,
                tmpPath: string,
                opts: { signal?: AbortSignal; onProgress?: (p: ArchiveDownloadProgress) => void },
                depth: number,
                resumeFromByte: number = 0,
        ): Promise<void> {
                return new Promise<void>((resolve, reject) => {
                        if (opts.signal?.aborted) {
                                reject(abortedError());
                                return;
                        }

                        const httpMod: any = this.getModule(url);
                        const fs = lazyFs();
                        // [W6-T02] Range header для resume (пустой объект для fresh download).
                        const reqOpts: any = { timeout: this.requestTimeoutMs };
                        if (resumeFromByte > 0) {
                                reqOpts.headers = { range: `bytes=${resumeFromByte}-` };
                        }
                        const req = httpMod.get(url, reqOpts, (res: any) => {
                                const status = res.statusCode ?? 0;

                                // Редирект: резолвим Location относительно текущего URL
                                if (REDIRECT_STATUSES.includes(status)) {
                                        res.resume(); // слить тело
                                        const location = res.headers.location;
                                        if (!location || depth >= MAX_REDIRECTS) {
                                                reject(new Error(
                                                        `archive download: ${location ? 'too many redirects' : 'redirect without Location'} (HTTP ${status})`,
                                                ));
                                                return;
                                        }
                                        const nextUrl = new URL(location, url).toString();
                                        // На редиректе resumeFromByte сбрасывается: новый URL —
                                        // нечего продолжать, стартуем с нуля.
                                        this.downloadToFile(nextUrl, tmpPath, opts, depth + 1, 0).then(resolve, reject);
                                        return;
                                }

                                // [W6-T02] 206 Partial Content: сервер поддержал Range → append.
                                // 200 на fresh (resumeFromByte=0): обычный write (truncate default).
                                // 200 на resume (resumeFromByte>0): сервер проигнорировал Range →
                                // truncate + start fresh.
                                let out: any;
                                const partialHonored = status === 206 && resumeFromByte > 0;
                                if (partialHonored) {
                                        out = fs.createWriteStream(tmpPath, { flags: 'a' });
                                } else if (status === 200 && resumeFromByte > 0) {
                                        // Сервер не понял Range — начать заново, truncate tmp.
                                        try { fs.unlinkSync(tmpPath); } catch { /* не критично */ }
                                        out = fs.createWriteStream(tmpPath);
                                } else if (status < 200 || status >= 300) {
                                        res.resume();
                                        const err: Error & { status?: number } = Object.assign(
                                                new Error(`HTTP ${status} for archive download`),
                                                { status },
                                        );
                                        reject(err);
                                        return;
                                } else {
                                        // 200 на fresh (resumeFromByte == 0): обычный truncate-write.
                                        out = fs.createWriteStream(tmpPath);
                                }

                                const cl = Number(res.headers['content-length']);
                                // [W6-T02] Для 206 content-length — это размер ЧАСТИ, не всего.
                                // totalBytes для прогресса: resumeFromByte + cl (если знаем) или null.
                                const totalBytes = Number.isFinite(cl) && cl > 0
                                        ? (partialHonored ? resumeFromByte + cl : cl)
                                        : null;
                                let received = partialHonored ? resumeFromByte : 0;
                                let settled = false;

                                const onAbort = () => {
                                        // destroy с ошибкой → 'error' на res/out ниже → reject
                                        req.destroy(abortedError());
                                };
                                opts.signal?.addEventListener('abort', onAbort, { once: true });
                                const cleanup = () => {
                                        opts.signal?.removeEventListener('abort', onAbort);
                                };
                                const fail = (e: Error) => {
                                        if (settled) return;
                                        settled = true;
                                        cleanup();
                                        out.destroy();
                                        reject(mapNetworkError(e, opts.signal));
                                };

                                res.on('data', (chunk: Buffer) => {
                                        received += chunk.length;
                                        opts.onProgress?.({ bytesTransferred: received, totalBytes });
                                });
                                res.on('error', fail);
                                out.on('error', fail);
                                out.on('finish', () => {
                                        if (settled) return;
                                        // [overhaul S3/M-13] Усечённый ответ: раньше обрезанный
                                        // поток «успешно» завершался и диагностика откладывалась
                                        // до EOCD/CRC на этапе чтения архива. Сверяем полученные
                                        // байты с Content-Length (для 206 — totalBytes уже
                                        // учитывает resumeFromByte).
                                        if (totalBytes !== null && received !== totalBytes) {
                                                fail(new Error(
                                                        `усечённый ответ: получено ${received} из ${totalBytes} байт (Content-Length)`,
                                                ));
                                                return;
                                        }
                                        settled = true;
                                        cleanup();
                                        resolve();
                                });
                                res.pipe(out);
                        });

                        req.on('error', (e: Error) => reject(mapNetworkError(e, opts.signal)));
                        // [5-review M1] Node-опция timeout только ЭМИТИТ событие —
                        // без обработчика зависший сервер вешает стрим навсегда
                        req.on('timeout', () => {
                                req.destroy(new Error(`archive download timeout after ${this.requestTimeoutMs}ms`));
                        });
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
