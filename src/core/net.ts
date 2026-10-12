// ============================================================
// --- CORE/NET: сетевой слой с ретраями и отменой (фаза 3, задача 3-3) ---
// Дизайн §11.1 (таблица поведения NetLayer); закрывает баги аудита:
//   Б-07 — ожидание rate-limit (до 1 часа по Retry-After) теперь
//          ПРЕРЫВАЕМО сигналом отмены синхронизации;
//   Б-19 — expectedSize/магические байты проверяются, повреждённые
//          и «HTML вместо архива» тела не проходят молча;
//   + лимит попыток: вечный 429 больше не даёт бесконечный цикл.
// Модуль не знает ни про obsidian, ни про Node: HTTP приходит через
// NetTransport (sources/types.ts), ожидания — setTimeout, отмена —
// AbortSignal. 3xx сознательно не обрабатываются: редиректы — зона
// ответственности транспорта.
// ============================================================

import type { NetRequest, NetResponse, NetTransport } from '../sources/types';

/** Настройки одного вызова NetLayer.fetchBuffer (дизайн §11.1). */
export interface NetFetchOptions {
        /** Ожидаемый размер тела, байт: не совпал → ретрай (фикс Б-19). */
        expectedSize?: number;
        /** Сигнал отмены: каскадируется в транспорт и во ВСЕ ожидания (фикс Б-07). */
        signal?: AbortSignal;
        /** Заголовки запроса; передаются транспорту как есть. */
        headers?: Record<string, string>;
        /** Всего попыток, включая первую. Default 5. */
        retries?: number;
        /** Бэкофф между ретраями (сеть / 5xx / усечение тела). Default [1,2,4,8,16] c. */
        retryBackoffMs?: readonly number[];
        /** Пауза при 429 без валидного Retry-After. Default 30000 мс. */
        rateLimitDefaultWaitMs?: number;
        /** Уведомление UI перед ожиданием rate-limit. Вызывается ТОЛЬКО для 429. */
        onRateLimitWait?: (waitMs: number, attempt: number) => void;
        /** Валидатор первых до 8 байт тела (диагностика «HTML вместо архива»). */
        validateMagic?: (firstBytes: Uint8Array) => boolean;
        /**
         * Кастомная классификация rate-limit для НЕ-429 статусов (ревью 3-review:
         * GitHub шлёт 403 + X-RateLimit-Remaining: 0). Возвращает waitMs или null.
         */
        classifyRateLimit?: (status: number, headers: Record<string, string>) => number | null;
        /** Порог ожидания rate-limit: waitMs > порога → немедленный NetError (rateLimitExceeded). */
        maxRateLimitWaitMs?: number;
}

/** Ошибка сетевого слоя: статус / попытка / признак отмены — для UI и очереди ошибок. */
export class NetError extends Error {
        /** HTTP-статус неудачного ответа, если ответ был. */
        readonly status?: number;
        /** Номер неудачной попытки, 1-based. */
        readonly attempt?: number;
        readonly retryAfterMs?:number;
        /** true — операция прервана отменой синхронизации, а не сетевым сбоем. */
        readonly aborted?: boolean;
        /** true — ожидание rate-limit превысило maxRateLimitWaitMs (сразу, без ретраев). */
        readonly rateLimitExceeded?: boolean;

        constructor(message: string, opts?: { retryAfterMs?:number; status?: number; attempt?: number; aborted?: boolean; rateLimitExceeded?: boolean }) {
                super(message);
                this.name = 'NetError';
                this.status = opts?.status;
                this.retryAfterMs=opts?.retryAfterMs;
                this.attempt = opts?.attempt;
                this.aborted = opts?.aborted;
                this.rateLimitExceeded = opts?.rateLimitExceeded;
                // instanceof остаётся корректным даже при понижении цели компиляции
                Object.setPrototypeOf(this, NetError.prototype);
        }
}

const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 16000];
const DEFAULT_RATE_LIMIT_WAIT_MS = 30000;
/** Сколько первых байт тела передаётся в validateMagic. */
const MAGIC_BYTES_LIMIT = 8;

/** Текст исключения транспортного слоя для сообщений NetError. */
/** [overhaul S1/H-4 hardening] URL без query-строки для сообщений об ошибках:
 *  query может нести секреты (?key=<apiKey> у gdrive, ?token=… у прочих
 *  API) — в текст ошибки (журнал/failed-очередь/data.json/UI) идёт только
 *  origin+path. Defense-in-depth поверх движковых перехватов.
 */
function urlForLog(url: string): string {
        const q = url.indexOf('?');
        return q >= 0 ? url.slice(0, q) : url;
}

function errText(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
}

/**
 * Ожидание, прерываемое отменой: резолв по таймеру, reject
 * NetError({aborted: true}) — если signal уже отменён к моменту старта
 * или отменяется во время ожидания. Листенер сигнала честно снимается
 * по завершению в обоих путях (нет «таймеров-сирот», аналог Б-03).
 */
export function sleepInterruptible(ms: number, signal?: AbortSignal): Promise<void> {
        return new Promise<void>((resolve, reject) => {
                if (signal?.aborted) {
                        reject(new NetError('aborted before wait started', { aborted: true }));
                        return;
                }
                if (!signal) {
                        setTimeout(resolve, ms);
                        return;
                }
                let done = false;
                let timer: ReturnType<typeof setTimeout> | null = null;
                const onAbort = () => {
                        if (done) return;
                        done = true;
                        if (timer !== null) clearTimeout(timer);
                        signal.removeEventListener('abort', onAbort);
                        reject(new NetError('aborted while waiting (retry/rate-limit pause)', { aborted: true }));
                };
                timer = setTimeout(() => {
                        if (done) return;
                        done = true;
                        signal.removeEventListener('abort', onAbort);
                        resolve();
                }, ms);
                signal.addEventListener('abort', onAbort);
        });
}

/** Бэкофф после провальной попытки N (1-based), с капом по длине массива. */
function backoffFor(backoffs: readonly number[], failedAttempt: number): number {
        if (backoffs.length === 0) return 0;
        return backoffs[Math.min(failedAttempt - 1, backoffs.length - 1)];
}

/**
 * Пауза при 429: Retry-After трактуется как СЕКУНДЫ (×1000);
 * заголовок отсутствует / не парсится / отрицателен → defaultWaitMs.
 * (HTTP-date форма Retry-After не поддерживается: Number(date) = NaN → дефолт.)
 */
function rateLimitWaitMs(response: NetResponse, defaultWaitMs: number): number {
        const raw = response.headers['retry-after'];
        if (raw === undefined || raw.trim() === '') return defaultWaitMs;
        const seconds = Number(raw);
        if (!Number.isFinite(seconds)) {const date=Date.parse(raw);return Number.isFinite(date)?Math.max(0,date-Date.now()):defaultWaitMs;}
        if(seconds<0)return defaultWaitMs;
        return seconds * 1000;
}

/**
 * Единая точка сетевых загрузок ядра: ретраи с бэкоффом, rate-limit,
 * прерываемая отмена, проверка размера и магических байт тела.
 */
export class NetLayer {
        private readonly transport: NetTransport;

        constructor(transport: NetTransport) {
                this.transport = transport;
        }

        /**
         * [W4-T03] Условный GET: если есть etag, шлём `If-None-Match`. На
         * 304 — не тянем тело (оно пустое), возвращаем notModified=true и
         * тот же etag. На 200 — забираем тело как обычно, обновляем etag
         * из response.headers['etag']. Ретраи на 5xx сохраняются (как в
         * fetchBuffer); 4xx → NetError (как в fetchBuffer).
         *
         * Возвращает объект, а не ArrayBuffer, чтобы caller (git-source)
         * отличал 304 от 200 без инспекции заголовков.
         */
        async fetchBufferConditional(url: string, opts?: NetFetchOptions & {
                ifNoneMatch?: string;
        }): Promise<{ body: ArrayBuffer; etag: string | null; notModified: boolean; status: number }> {
                const options = opts ?? {};
                const retries = options.retries ?? DEFAULT_RETRIES;
                const backoffs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
                const rateLimitDefaultWaitMs = options.rateLimitDefaultWaitMs ?? DEFAULT_RATE_LIMIT_WAIT_MS;
                const signal = options.signal;

                if (retries < 1) {
                        throw new NetError(`retries must be >= 1, got ${retries}`);
                }

                // If-None-Match добавляется в заголовки (не перетирая caller'ские).
                const headers: Record<string, string> = { ...options.headers };
                if (options.ifNoneMatch) {
                        headers['if-none-match'] = options.ifNoneMatch;
                }

                for (let attempt = 1; attempt <= retries; attempt++) {
                        if (signal?.aborted) {
                                throw new NetError(`aborted before attempt ${attempt}`, { aborted: true });
                        }
                        let response: NetResponse;
                        try {
                                response = await this.transport.fetch(url, { headers, signal });
                        } catch (err) {
                                if (signal?.aborted) {
                                        throw new NetError(`aborted during fetch: ${errText(err)}`, {
                                                aborted: true, attempt,
                                        });
                                }
                                if (attempt >= retries) {
                                        throw new NetError(`network error after ${attempt} attempt(s): ${errText(err)}`, { attempt });
                                }
                                await sleepInterruptible(backoffFor(backoffs, attempt), signal);
                                continue;
                        }

                        const status = response.status;
                        // [overhaul S3/M-12] ветки, где тело НЕ потребляется — явный
                        // discard (снятие body-таймера и abort-листенера транспорта);
                        // раньше они удерживались до bodyTimeout (до 5 мин) на КАЖДОЙ
                        // retry-попытке. 2xx-ветка читает тело — там finish срабатывает
                        // сам (guarded в транспорте).
                        const discardBody = (): void => {
                                try { response.discard?.(); } catch { /* best-effort */ }
                        };

                        // Rate-limit (429 или кастомная классификация).
                        const customRateWait = status === 429
                                ? null
                                : (options.classifyRateLimit ? options.classifyRateLimit(status, response.headers) : null);
                        if (status === 429 || customRateWait !== null) {
                                const waitMs = status === 429
                                        ? rateLimitWaitMs(response, rateLimitDefaultWaitMs)
                                        : (customRateWait as number);
                                if (options.maxRateLimitWaitMs !== undefined && waitMs > options.maxRateLimitWaitMs) {
                                        discardBody();
                                        throw new NetError(
                                                `rate limit wait ${waitMs}ms exceeds cap ${options.maxRateLimitWaitMs}ms`,
                                                { status, attempt, rateLimitExceeded: true, retryAfterMs:waitMs }
                                        );
                                }
                                if (attempt >= retries) {
                                        discardBody();
                                        throw new NetError(`rate limit (HTTP ${status}) persisted after ${attempt} attempt(s)`, {
                                                retryAfterMs:waitMs, status, attempt,
                                        });
                                }
                                options.onRateLimitWait?.(waitMs, attempt);
                                discardBody();
                                await sleepInterruptible(waitMs, signal);
                                continue;
                        }

                        if (status >= 500 || status === 408) {
                                if (attempt >= retries) {
                                        discardBody();
                                        throw new NetError(`server error (HTTP ${status}) after ${attempt} attempt(s)`, {
                                                status, attempt,
                                        });
                                }
                                discardBody();
                                await sleepInterruptible(backoffFor(backoffs, attempt), signal);
                                continue;
                        }

                        if (status >= 400) {
                                discardBody();
                                throw new NetError(`HTTP ${status} for ${urlForLog(url)} (client error, not retryable)`, { status });
                        }

                        // 304 — not modified: etag прежний, тело пустое, notModified=true.
                        if (status === 304) {
                                discardBody();
                                return {
                                        body: new ArrayBuffer(0),
                                        etag: options.ifNoneMatch ?? null,
                                        notModified: true,
                                        status,
                                };
                                // NB: validateMagic/expectedSize к 304 не применяются —
                                // тела нет по определению.
                        }

                        // 2xx (включая 200): забираем тело, проверки размера/магии.
                        let body: ArrayBuffer;
                        try {
                                body = await response.arrayBuffer();
                        } catch (err) {
                                if (signal?.aborted) {
                                        throw new NetError(`aborted while reading body: ${errText(err)}`, {
                                                aborted: true, attempt,
                                        });
                                }
                                if (attempt >= retries) {
                                        throw new NetError(`failed to read body after ${attempt} attempt(s): ${errText(err)}`, { attempt });
                                }
                                await sleepInterruptible(backoffFor(backoffs, attempt), signal);
                                continue;
                        }
                        if (options.expectedSize !== undefined && body.byteLength !== options.expectedSize) {
                                if (attempt >= retries) {
                                        throw new NetError(
                                                `size mismatch: expected ${options.expectedSize} bytes, received ${body.byteLength}`,
                                                { attempt }
                                        );
                                }
                                await sleepInterruptible(backoffFor(backoffs, attempt), signal);
                                continue;
                        }
                        if (options.validateMagic) {
                                const n = Math.min(MAGIC_BYTES_LIMIT, body.byteLength);
                                const firstBytes = new Uint8Array(body, 0, n);
                                if (!options.validateMagic(firstBytes)) {
                                        throw new NetError(
                                                `magic-byte check failed (HTTP ${status}, first ${n} byte(s)): body does not look like expected binary format`,
                                                { status, attempt }
                                        );
                                }
                        }

                        return {
                                body,
                                etag: response.headers['etag'] ?? null,
                                notModified: false,
                                status,
                        };
                }
                throw new NetError('retries exhausted without result');
        }

        async fetchBuffer(url: string, opts?: NetFetchOptions): Promise<ArrayBuffer> {
                const options = opts ?? {};
                const retries = options.retries ?? DEFAULT_RETRIES;
                const backoffs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
                const rateLimitDefaultWaitMs = options.rateLimitDefaultWaitMs ?? DEFAULT_RATE_LIMIT_WAIT_MS;
                const signal = options.signal;

                if (retries < 1) {
                        throw new NetError(`retries must be >= 1, got ${retries}`);
                }

                for (let attempt = 1; attempt <= retries; attempt++) {
                        // Отмена до начала попытки (включая самую первую — semantics п.6).
                        if (signal?.aborted) {
                                throw new NetError(`aborted before attempt ${attempt}`, { aborted: true });
                        }

                        let response: NetResponse;
                        try {
                                response = await this.transport.fetch(url, {
                                        headers: options.headers,
                                        signal,
                                });
                        } catch (err) {
                                // Отмена во время активного запроса: транспорт бросил по signal —
                                // это НЕ сетевой сбой, ретраить нельзя (semantics п.8).
                                if (signal?.aborted) {
                                        throw new NetError(`aborted during fetch: ${errText(err)}`, {
                                                aborted: true,
                                                attempt,
                                        });
                                }
                                // Сетевая ошибка — ретрайable с бэкоффом.
                                if (attempt >= retries) {
                                        throw new NetError(`network error after ${attempt} attempt(s): ${errText(err)}`, {
                                                attempt,
                                        });
                                }
                                await sleepInterruptible(backoffFor(backoffs, attempt), signal);
                                continue;
                        }

                        const status = response.status;
                        // [overhaul S3/M-12] непотреблённые тела — явный discard (см. fetchBuffer).
                        const discardBody = (): void => {
                                try { response.discard?.(); } catch { /* best-effort */ }
                        };

                        // Rate-limit: явный 429 ИЛИ кастомная классификация не-429 статуса
                        // (ревью 3-review: GitHub 403 + X-RateLimit-Remaining: 0 — старый код
                        // ждал по X-RateLimit-Reset; паритет поведения восстановлен).
                        // Ожидание ПРЕРЫВАЕМО отменой (фикс Б-07); лимит попыток распространяется
                        // и на rate-limit — вечное ожидание не зацикливает.
                        const customRateWait = status === 429
                                ? null
                                : (options.classifyRateLimit ? options.classifyRateLimit(status, response.headers) : null);
                        if (status === 429 || customRateWait !== null) {
                                const waitMs = status === 429
                                        ? rateLimitWaitMs(response, rateLimitDefaultWaitMs)
                                        : (customRateWait as number);
                                // Слишком долгое ожидание — сразу отказ, без ретраев
                                // (паритет errRateLimitExceedsHour старого кода).
                                if (options.maxRateLimitWaitMs !== undefined && waitMs > options.maxRateLimitWaitMs) {
                                        discardBody();
                                        throw new NetError(
                                                `rate limit wait ${waitMs}ms exceeds cap ${options.maxRateLimitWaitMs}ms`,
                                                { status, attempt, rateLimitExceeded: true, retryAfterMs:waitMs }
                                        );
                                }
                                if (attempt >= retries) {
                                        discardBody();
                                        throw new NetError(`rate limit (HTTP ${status}) persisted after ${attempt} attempt(s)`, {
                                                retryAfterMs:waitMs, status,
                                                attempt,
                                        });
                                }
                                options.onRateLimitWait?.(waitMs, attempt);
                                discardBody();
                                await sleepInterruptible(waitMs, signal);
                                continue;
                        }

                        // 5xx — серверный сбой, ретраится с бэкоффом.
                        if (status >= 500 || status === 408) {
                                if (attempt >= retries) {
                                        discardBody();
                                        throw new NetError(`server error (HTTP ${status}) after ${attempt} attempt(s)`, {
                                                status,
                                                attempt,
                                        });
                                }
                                discardBody();
                                await sleepInterruptible(backoffFor(backoffs, attempt), signal);
                                continue;
                        }

                        // Прочие 4xx (403, 404, …) — НЕ ретраятся (semantics п.3).
                        if (status >= 400) {
                                discardBody();
                                throw new NetError(`HTTP ${status} for ${urlForLog(url)} (client error, not retryable)`, { status });
                        }

                        // 2xx (3xx не обрабатываются — semantics п.7: редиректы на совести
                        // транспорта; сюда 3xx может попасть только как «протечка» и
                        // проходит те же проверки тела, что и 2xx).

                        let body: ArrayBuffer;
                        try {
                                body = await response.arrayBuffer();
                        } catch (err) {
                                if (signal?.aborted) {
                                        throw new NetError(`aborted while reading body: ${errText(err)}`, {
                                                aborted: true,
                                                attempt,
                                        });
                                }
                                if (attempt >= retries) {
                                        throw new NetError(`failed to read body after ${attempt} attempt(s): ${errText(err)}`, {
                                                attempt,
                                        });
                                }
                                await sleepInterruptible(backoffFor(backoffs, attempt), signal);
                                continue;
                        }

                        // Размер: усечение лечится повторной загрузкой (фикс Б-19).
                        if (options.expectedSize !== undefined && body.byteLength !== options.expectedSize) {
                                if (attempt >= retries) {
                                        throw new NetError(
                                                `size mismatch: expected ${options.expectedSize} bytes, received ${body.byteLength}`,
                                                { attempt }
                                        );
                                }
                                await sleepInterruptible(backoffFor(backoffs, attempt), signal);
                                continue;
                        }

                        // Магические байты: HTML-заглушка вместо бинарника — ошибка СРАЗУ,
                        // без ретрая: сервер честно вернул «не то», повтор бессмысленен.
                        if (options.validateMagic) {
                                const n = Math.min(MAGIC_BYTES_LIMIT, body.byteLength);
                                const firstBytes = new Uint8Array(body, 0, n);
                                if (!options.validateMagic(firstBytes)) {
                                        throw new NetError(
                                                `magic-byte check failed (HTTP ${status}, first ${n} byte(s)): body does not look like expected binary format`,
                                                { status, attempt }
                                        );
                                }
                        }

                        return body;
                }

                // Недостижимо при retries >= 1: последняя попытка всегда бросает или возвращает тело.
                throw new NetError('retries exhausted without result');
        }
}
