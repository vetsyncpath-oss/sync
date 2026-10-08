// ============================================================
// --- SOURCES/ZIP-TEST-CONNECTION (волна W3, задача W3-T04) ---
// Лёгкая проверка ZIP-соединения без полного скачивания:
// HEAD → Content-Length + Accept-Ranges → Range-запрос хвоста →
// парсинг EOCD + central directory (через core/archive.ts) →
// «Архив корректен: N файлов, X МБ». Если сервер не отдаёт 206 —
// fallback на полный путь через ArchiveDownloader.
//
// АРХИТЕКТУРА:
// Ключевая сложность — central directory в zip хранит смещения
// local-записей ОТ НАЧАЛА файла, а у нас есть только хвост. Решение:
// НЕ дублировать логику парсинга, а реализовать RandomAccessReader
// поверх Range-запросов (RemoteRangeReader) и переиспользовать
// существующий readCentralDirectory. Тогда archive.ts работает как
// обычно: первый read() — последний 65579-байтный хвост (EOCD +
// типичный CD небольших архивов умещается), а если CD большой —
// archive.ts сам сделает reader.read(cdOffset, cdSize), что
// RemoteRangeReader обслужит вторым Range-запросом. Это и есть
// «расширение Range»: один prefetch + 0..1 «докачек» для больших CD.
//
// Модуль НЕ импортирует obsidian/node/сеть — только интерфейсы
// ZipRangeTransport (инъекция) и core/archive. Тесты подменяют
// транспорт фейком с запрограммированными HEAD/Range-ответами.
// ============================================================

import type { RandomAccessReader } from './types';
import { readCentralDirectory } from '../core/archive';
import type { ZipEntry } from '../core/archive';

/**
 * Результат лёгкой проверки ZIP-соединения.
 *
 * - `ok: true`: архив корректен, файлы посчитаны; `method` показывает,
 *   каким путём прошли проверку — 'range' (Range-хвост) или 'full'
 *   (fallback на полное скачивание).
 * - `ok: false`: проверка провалена; `method` показывает этап
 *   ('head' — упали на HEAD, 'range' — упали при Range-парсинге,
 *   'full' — упали при fallback). Никаких исключений наружу —
 *   только этот объект.
 */
export type TestConnectionResult =
        | {
                        ok: true;
                        /** Число файлов в архиве (директории НЕ считаются — паритет с getManifest). */
                        fileCount: number;
                        /** Суммарный объём НЕсжатых файлов, байт (то, что увидит пользователь). */
                        totalSizeBytes: number;
                        /** Размер zip-файла на сервере (Content-Length), байт. */
                        archiveSizeBytes: number;
                        method: 'range' | 'full';
                        message?: string;
          }
        | {
                        ok: false;
                        /** Текст ошибки — стабильный классификатор (auth/not-found/...). */
                        error: string;
                        method: 'range' | 'full' | 'head';
          };

/** HEAD-ответ сервера. */
export interface HeadResponse {
        status: number;
        /** Content-Length, байт; null — сервер не отдал. */
        contentLength: number | null;
        /** accept-ranges в нижнем регистре; 'bytes' = поддержка ranges. */
        acceptRanges: string | null;
        /** Все заголовки (ключи в нижнем регистре) — для диагностики. */
        headers: Record<string, string>;
}

/** Ответ на Range-запрос `Range: bytes=start-end` (end включительно). */
export interface RangeResponse {
        status: number;
        /** Тело ответа: при 206 — ровно end-start+1 байт, при 200 — весь файл. */
        body: Uint8Array;
        /** content-range заголовок при 206 (если отдал). */
        contentRange: string | null;
        headers: Record<string, string>;
}

/**
 * Транспорт для лёгкой ZIP-проверки: HEAD + Range. Десктоп —
 * NodeZipRangeTransport (lazy require('https')); тесты — фейк.
 * НЕ зависит от obsidian/node — чистый интерфейс.
 */
export interface ZipRangeTransport {
        head(url: string, opts: { signal?: AbortSignal }): Promise<HeadResponse>;
        getRange(
                url: string,
                start: number,
                end: number,
                opts: { signal?: AbortSignal },
        ): Promise<RangeResponse>;
}

/**
 * Минимальный контракт полного скачивания — урезанный ArchiveDownloader,
 * нужный только для fallback. Полный ArchiveDownloader ему удовлетворяет.
 */
export interface FallbackDownloader {
        download(
                url: string,
                opts: { signal?: AbortSignal; onProgress?: (p: { bytesTransferred: number; totalBytes: number | null }) => void },
        ): Promise<RandomAccessReader>;
}

/**
 * Окно prefetch хвоста. Берем с запасом: EOCDScanWindow из archive.ts
 * равен 65579 (22 + 65535 + 22 запас). Не экспортируется из archive.ts —
 * локальная константа того же порядка (округлённая до 64 КБ + запас).
 *
 * RemoteRangeReader на самом деле prefetch не делает — он реагирует на
 * read() из archive.ts. archive.ts сам просит min(size, 65579) байт с
 * конца. Эта константа нужна только для probe-запроса последнего байта
 * (чтобы убедиться, что сервер реально отдаёт 206, а не 200 на Range).
 */
const PROBE_TAIL_BYTES = 1;

/**
 * RandomAccessReader поверх Range-запросов с кешем по диапазонам.
 *
 * - `size()` = Content-Length из HEAD (фиксированное значение).
 * - `read(offset, length)` ищет запрошенный диапазон в кеше; если не
 *   найден целиком — делает новый Range-запрос `bytes=offset-(offset+length-1)`
 *   и кеширует результат.
 *
 * Кеш — простой список закешированных чанков с их абсолютными
 * смещениями; lookup линеен. Для test-connection этого достаточно:
 * archive.ts делает 1 (tail) + 0..1 (CD) + 0..2 (ZIP64 locator/EOCD64)
 * чтений, итого ≤ 4 Range-запросов на проверку.
 *
 * Возвращает независимые копии — паритет с BufferArchiveReader/FileArchiveReader
 * (контракт RandomAccessReader).
 */
export class RemoteRangeReader implements RandomAccessReader {
        private readonly url: string;
        private readonly transport: ZipRangeTransport;
        private readonly sizeBytes: number;
        private readonly signal?: AbortSignal;
        /** Закешированные диапазоны: пары (абсолютное смещение, байты). */
        private cache: Array<{ offset: number; data: Uint8Array }> = [];

        constructor(url: string, transport: ZipRangeTransport, sizeBytes: number, signal?: AbortSignal) {
                if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
                        throw new Error(`RemoteRangeReader: sizeBytes должен быть неотрицательным целым, получил ${sizeBytes}`);
                }
                this.url = url;
                this.transport = transport;
                this.sizeBytes = sizeBytes;
                this.signal = signal;
        }

        size(): number {
                return this.sizeBytes;
        }

        async read(offset: number, length: number): Promise<Uint8Array> {
                // Валидация — паритет с BufferArchiveReader (единый контракт
                // RandomAccessReader): целые неотрицательные, затем границы.
                if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0) {
                        throw new RangeError(
                                `RemoteRangeReader.read: некорректные аргументы offset=${offset}, length=${length}`,
                        );
                }
                if (offset + length > this.sizeBytes) {
                        throw new RangeError(
                                `RemoteRangeReader.read: выход за пределы размера: offset=${offset} + length=${length} > size=${this.sizeBytes}`,
                        );
                }
                // Пустой диапазон — пустой Uint8Array (как в BufferArchiveReader).
                if (length === 0) {
                        return new Uint8Array(0);
                }

                const cached = this.findInCache(offset, length);
                if (cached) {
                        // subarray — view; .slice() — независимая копия (контракт).
                        return cached.slice();
                }

                // Не нашли целиком — тянем [offset, offset+length-1] новым Range.
                const data = await this.transport.getRange(this.url, offset, offset + length - 1, {
                        signal: this.signal,
                });
                if (data.status !== 206 || data.body.length !== length) {
                        throw new Error(
                                `RemoteRangeReader.read: Range-запрос вернул неожиданный ответ ` +
                                        `status=${data.status}, body.length=${data.body.length} (ожидалось 206 и ${length} байт, ` +
                                        `диапазон bytes=${offset}-${offset + length - 1})`,
                        );
                }
                this.cache.push({ offset, data: data.body });
                // data.body — это то, что вернул транспорт; .slice() даёт независимую копию.
                return data.body.slice();
        }

        /** Поиск [offset, offset+length) в кеше. Возвращает view в кеш или null. */
        private findInCache(offset: number, length: number): Uint8Array | null {
                for (const c of this.cache) {
                        const cEnd = c.offset + c.data.length;
                        if (c.offset <= offset && offset + length <= cEnd) {
                                const start = offset - c.offset;
                                return c.data.subarray(start, start + length);
                        }
                }
                return null;
        }

        async dispose(): Promise<void> {
                // Чистим кеш — пусть GC соберёт байты. Повторный dispose — no-op.
                this.cache = [];
        }

        /** Для тестов/диагностики: сколько Range-запросов сделал ридер. */
        get rangeFetchCount(): number {
                return this.cache.length;
        }
}

// ── Внутренние хелперы ──

/** Поддерживает ли HEAD-ответ HTTP Range-запросы? */
function supportsRanges(head: HeadResponse): boolean {
        // 2xx + Accept-Ranges: bytes (точное совпадение, не «none»/«none»).
        if (head.status >= 200 && head.status < 300 && head.acceptRanges === 'bytes') {
                return true;
        }
        return false;
}

/** Классификация HTTP-ошибки HEAD в стабильный error-класс. */
function classifyHttpError(status: number): string {
        if (status === 401 || status === 403) return 'auth';
        if (status === 404) return 'not-found';
        if (status >= 400 && status < 500) return `http-${status}`;
        if (status >= 500) return `http-${status}`;
        return `http-${status}`;
}

/** Префикс лога — единый стиль наблюдаемости (см. CONVENTIONS §3). */
function log(logFn: ((m: string) => void) | undefined, msg: string): void {
        logFn?.(`[VaultSync] testConnection: ${msg}`);
}

/**
 * Главная точка входа: лёгкая проверка ZIP-соединения.
 *
 * Алгоритм:
 * 1. HEAD-запрос → status / Content-Length / Accept-Ranges.
 *    Сетевой сбой → ok:false method:'head' error 'head-network-error: ...'.
 *    401/403 → 'auth', 404 → 'not-found', прочие 4xx/5xx → 'http-N'.
 * 2. Нет Content-Length ИЛИ нет Accept-Ranges:bytes → fallback на полный
 *    путь (download + parse), method:'full'.
 * 3. Probe-Range на последний байт: если статус ≠ 206 (сервер отдал 200
 *    или ошибся) → fallback на полный путь, method:'full'. Probe одним
 *    байтом — самый дешёвый способ отличить «настоящий 206» от «200 на
 *    Range» (некоторые CDN игнорируют Range и отдают весь файл).
 * 4. RemoteRangeReader + readCentralDirectory. Успех → ok:true method:'range'.
 *    Сбой парсинга → ok:false method:'range' error 'range-parse: ...'.
 *
 * Все этапы обёрнуты в try/catch — наружу exceptions не уходят.
 */
export async function testZipConnection(opts: {
        url: string;
        rangeTransport: ZipRangeTransport;
        fallbackDownloader: FallbackDownloader;
        signal?: AbortSignal;
        /** Лог в stdout (Observability); по умолчанию no-op. */
        log?: (msg: string) => void;
}): Promise<TestConnectionResult> {
        const logFn = opts.log;
        const url = opts.url;
        const signal = opts.signal;

        // ── 1. HEAD-запрос ──
        let head: HeadResponse;
        try {
                head = await opts.rangeTransport.head(url, { signal });
        } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                log(logFn, `HEAD network error: ${msg}`);
                return { ok: false, error: `head-network-error: ${msg}`, method: 'head' };
        }

        // 4xx/5xx на HEAD — диагностика без fallback. Даже если сервер не отдал
        // ranges, но HEAD красный — это не «можно скачать целиком», это «нет доступа».
        if (head.status === 401 || head.status === 403) {
                log(logFn, `HEAD ${head.status} → auth`);
                return { ok: false, error: 'auth', method: 'head' };
        }
        if (head.status === 404) {
                log(logFn, `HEAD 404 → not-found`);
                return { ok: false, error: 'not-found', method: 'head' };
        }
        if (head.status < 200 || head.status >= 300) {
                const err = classifyHttpError(head.status);
                log(logFn, `HEAD ${head.status} → ${err}`);
                return { ok: false, error: err, method: 'head' };
        }

        const archiveSize = head.contentLength;
        if (archiveSize === null) {
                // Content-Length неизвестен — не можем вычислить смещение Range.
                // (Бриф: «всё ещё пытаемся Range с хвоста 64КБ ИЛИ fallback на полный».
                // Выбираем fallback — он надёжнее и не требует суффикс-Range.)
                log(logFn, `HEAD без Content-Length → fallback full`);
                return fullFallback(opts, logFn, signal);
        }

        if (!supportsRanges(head)) {
                log(logFn, `HEAD без Accept-Ranges: bytes → fallback full`);
                return fullFallback(opts, logFn, signal);
        }

        // ── 2. Probe-Range на последний байт: убеждаемся, что сервер реально 206. ──
        let probe: RangeResponse;
        try {
                probe = await opts.rangeTransport.getRange(url, archiveSize - 1, archiveSize - 1, { signal });
        } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                log(logFn, `probe Range network error → fallback full: ${msg}`);
                return fullFallback(opts, logFn, signal);
        }
        if (probe.status !== 206) {
                // Сервер заявил Accept-Ranges: bytes, но на реальный Range отдал 200 —
                // brain-dead CDN. Скачиваем целиком.
                log(logFn, `probe Range status=${probe.status} (не 206) → fallback full`);
                return fullFallback(opts, logFn, signal);
        }

        // ── 3. Range-путь: RemoteRangeReader + readCentralDirectory. ──
        log(logFn, `Range-путь (size=${archiveSize})`);
        const reader = new RemoteRangeReader(url, opts.rangeTransport, archiveSize, signal);
        try {
                const entries = await readCentralDirectory(reader);
                const files = entries.filter((e: ZipEntry) => !e.isDir);
                const totalSizeBytes = files.reduce((s, e) => s + e.uncompressedSize, 0);
                return {
                        ok: true,
                        fileCount: files.length,
                        totalSizeBytes,
                        archiveSizeBytes: archiveSize,
                        method: 'range',
                };
        } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                log(logFn, `Range-парсинг упал: ${msg}`);
                return { ok: false, error: `range-parse: ${msg}`, method: 'range' };
        } finally {
                await reader.dispose?.();
        }
}

/**
 * Прямой запуск fallback-пути (полное скачивание + parse). Экспортирован,
 * чтобы вызывающий код (ZipUrlSource) мог сразу пойти этим путём, если
 * Range-транспорт не зарегистрирован (мобайл/тесты без Range).
 */
export async function runFullFallback(opts: {
        url: string;
        fallbackDownloader: FallbackDownloader;
        signal?: AbortSignal;
        log?: (msg: string) => void;
}): Promise<TestConnectionResult> {
        return fullFallback(opts, opts.log, opts.signal);
}

/** Fallback на полный путь: ArchiveDownloader.download + readCentralDirectory. */
async function fullFallback(
        opts: { url: string; fallbackDownloader: FallbackDownloader; signal?: AbortSignal; log?: (m: string) => void },
        logFn: ((m: string) => void) | undefined,
        signal?: AbortSignal,
): Promise<TestConnectionResult> {
        log(logFn, `fallback full`);
        let reader: RandomAccessReader;
        try {
                reader = await opts.fallbackDownloader.download(opts.url, { signal });
        } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                log(logFn, `fallback download failed: ${msg}`);
                return { ok: false, error: `full-download: ${msg}`, method: 'full' };
        }
        try {
                const entries = await readCentralDirectory(reader);
                const files = entries.filter((e: ZipEntry) => !e.isDir);
                const totalSizeBytes = files.reduce((s, e) => s + e.uncompressedSize, 0);
                return {
                        ok: true,
                        fileCount: files.length,
                        totalSizeBytes,
                        archiveSizeBytes: reader.size(),
                        method: 'full',
                };
        } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                log(logFn, `fallback parse failed: ${msg}`);
                return { ok: false, error: `full-parse: ${msg}`, method: 'full' };
        } finally {
                await reader.dispose?.();
        }
}

/** Export probe-tail constant для тестов (не покрывает публичный API). */
export const _PROBE_TAIL_BYTES = PROBE_TAIL_BYTES;
