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
        observe?: import('../sources/types').TransferObserver;
        maxElapsedMs?: number; maxBytes?: number; method?: string; body?: BodyInit; redirect?: RequestRedirect;
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
        readonly code?: string; readonly host?: string;
        /** Номер неудачной попытки, 1-based. */
        readonly attempt?: number;
        readonly retryAfterMs?:number;
        /** true — операция прервана отменой синхронизации, а не сетевым сбоем. */
        readonly aborted?: boolean;
        /** true — ожидание rate-limit превысило maxRateLimitWaitMs (сразу, без ретраев). */
        readonly rateLimitExceeded?: boolean;

        constructor(message: string, opts?: { code?:string;host?:string;retryAfterMs?:number; status?: number; attempt?: number; aborted?: boolean; rateLimitExceeded?: boolean }) {
                super(message);
                this.name = 'NetError';
                this.status = opts?.status; this.code=opts?.code;this.host=opts?.host;
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
        constructor(private readonly transport: NetTransport) {}
        async fetchBuffer(url: string, opts: NetFetchOptions = {}): Promise<ArrayBuffer> {
                return (await this.fetchBufferConditional(url, opts)).body;
        }
        async fetchBufferConditional(url: string, opts: NetFetchOptions & {ifNoneMatch?: string} = {}): Promise<{body:ArrayBuffer;etag:string|null;notModified:boolean;status:number}> {
                const retries=opts.retries??DEFAULT_RETRIES, backoffs=opts.retryBackoffMs??DEFAULT_RETRY_BACKOFF_MS, signal=opts.signal;
                if(!Number.isSafeInteger(retries)||retries<1)throw new NetError('retries must be >= 1');
                const headers={...opts.headers,...(opts.ifNoneMatch?{'if-none-match':opts.ifNoneMatch}:{})};
                const started=Date.now(), host=new URL(url).host;
                const wait=async(ms:number,attempt:number,status?:number)=>{
                        const remaining=(opts.maxElapsedMs??120_000)-(Date.now()-started);
                        if(ms>remaining)throw new NetError('Retry deferred: request wait budget exhausted',{code:status===429?'rate-limit':'network',status,attempt,retryAfterMs:ms,host});
                        opts.observe?.({stage:'waiting',attempt,maxAttempts:retries,retryAt:Date.now()+ms,status,host});
                        await sleepInterruptible(ms,signal);
                };
                for(let attempt=1;attempt<=retries;attempt++) {
                        if(signal?.aborted)throw new NetError('Request cancelled',{aborted:true,attempt,host});
                        opts.observe?.({stage:'download',attempt,maxAttempts:retries,bytes:0,host});
                        let response:NetResponse;
                        try { response=await this.transport.fetch(url,{method:opts.method,body:opts.body,redirect:opts.redirect,headers,signal,maxBytes:opts.maxBytes??(opts.expectedSize===undefined?undefined:Math.max(opts.expectedSize+1024,Math.ceil(opts.expectedSize*1.1))),observe:event=>opts.observe?.({...event,attempt,maxAttempts:retries,host:event.host??host})}); }
                        catch(error) {
                                if(signal?.aborted)throw new NetError('Request cancelled',{aborted:true,attempt,host});
                                const code=(error as {code?:string})?.code??((error as Error)?.name==='RequestTimeoutError'?'timeout':'network');
                                if(code==='file-too-large'||code==='redirect-policy'||attempt===retries)throw new NetError(`network error after ${attempt} attempt(s): ${errText(error)}`,{attempt,code,host});
                                await wait(backoffFor(backoffs,attempt),attempt);continue;
                        }
                        const status=response.status, discard=()=>{try{response.discard?.();}catch{/* release best effort */}};
                        const custom=status===429?null:opts.classifyRateLimit?.(status,response.headers)??null;
                        if(status===429||custom!==null) {
                                const ms=status===429?rateLimitWaitMs(response,opts.rateLimitDefaultWaitMs??DEFAULT_RATE_LIMIT_WAIT_MS):custom!;
                                discard();
                                if(opts.maxRateLimitWaitMs!==undefined&&ms>opts.maxRateLimitWaitMs)throw new NetError(`rate limit wait ${ms}ms exceeds cap ${opts.maxRateLimitWaitMs}ms`,{status,attempt,rateLimitExceeded:true,retryAfterMs:ms,host,code:'rate-limit'});
                                opts.onRateLimitWait?.(ms,attempt);
                                if(attempt===retries)throw new NetError(`rate limit (HTTP ${status}) persisted after ${attempt} attempt(s)`,{status,attempt,retryAfterMs:ms,host,code:'rate-limit'});
                                await wait(ms,attempt,status);continue;
                        }
                        if(status>=500||status===408) {
                                discard();if(attempt===retries)throw new NetError(`server error (HTTP ${status}) after ${attempt} attempt(s)`,{status,attempt,host});
                                await wait(backoffFor(backoffs,attempt),attempt,status);continue;
                        }
                        if(status>=400) {discard();throw new NetError(`HTTP ${status} for ${urlForLog(url)}`,{status,attempt,host});}
                        if(status===304) {discard();return {body:new ArrayBuffer(0),etag:opts.ifNoneMatch??null,notModified:true,status};}
                        if(status>=300) {discard();throw new NetError('Unexpected redirect response',{status,attempt,host,code:'redirect-policy'});}
                        let body:ArrayBuffer;
                        try {body=await response.arrayBuffer();}
                        catch(error) {
                                if(signal?.aborted)throw new NetError('Cancelled while reading body',{aborted:true,attempt,host});
                                const code=(error as {code?:string})?.code??((error as Error)?.name==='RequestTimeoutError'?'timeout':'network');
                                if(code==='file-too-large'||attempt===retries)throw new NetError(`failed to read body after ${attempt} attempt(s): ${errText(error)}`,{attempt,host,code});
                                await wait(backoffFor(backoffs,attempt),attempt);continue;
                        }
                        if(opts.expectedSize!==undefined&&body.byteLength!==opts.expectedSize) {
                                if(attempt===retries)throw new NetError(`size mismatch: expected ${opts.expectedSize} bytes, received ${body.byteLength}`,{attempt,host,code:'integrity'});
                                await wait(backoffFor(backoffs,attempt),attempt);continue;
                        }
                        if(opts.validateMagic&&!opts.validateMagic(new Uint8Array(body,0,Math.min(MAGIC_BYTES_LIMIT,body.byteLength))))throw new NetError('magic-byte check failed: unexpected response format',{status,attempt,host,code:'response-format'});
                        return {body,etag:response.headers.etag??null,notModified:false,status};
                }
                throw new NetError('retries exhausted without result');
        }
}
