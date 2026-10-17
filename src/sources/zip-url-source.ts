import type { TransferObserver } from './types';
// ============================================================
// --- SOURCES/ZIP-URL-SOURCE (фаза 5, задача 5-e) ---
// Универсальный источник синхронизации: zip-архив по прямой
// ссылке — Dropbox / Google Drive / Nextcloud / свой сервер
// (дизайн §4, режим B §7). Провайдер распознаётся ЧИСТОЙ
// функцией detectProvider (таблица трансформаций §4.1),
// скачивание — через инъектируемый ArchiveDownloader (десктоп:
// tmp-файл; мобайл: память — реализация 5-f; в тестах — фейк),
// разбор central directory — core/archive.ts (5-ab), извлечение
// записей — extractEntry (5-c).
//
// Семантика сессии (§7.3): getManifest скачивает архив ОДИН раз
// и держит reader до dispose(); fetch берёт байты из кэша записей
// без повторных скачиваний; после dispose() всё качается заново.
// Валидация магических байт (§7.1) отличает zip от HTML-заглушки
// (GDrive >100 МБ и confirm-токен — §4.2) и от мусора.
//
// Модуль ядра: НЕ импортирует obsidian/node/сеть; локализуемые
// тексты ошибок инъектируются через messages (решение В5-1).
// ============================================================

import type { ArchiveDownloadProgress, ArchiveDownloader, RandomAccessReader, RemoteEntry, SyncSource } from './types';
import { SyncFault } from '../core/sync-issue';
import { readCentralDirectory, extractEntry, type ZipEntry } from '../core/archive';
import { testZipConnection, runFullFallback, type TestConnectionResult, type ZipRangeTransport } from './zip-test-connection';

export type ZipProviderKind = 'yandex' | 'dropbox' | 'gdrive' | 'nextcloud' | 'direct' | 'generic';

export interface ProviderDetection {
        provider: ZipProviderKind;
        downloadUrl: string;
}

/** Хосты Яндекс.Диска (§4.1); host у URL уже в нижнем регистре. */
const YANDEX_HOSTS: ReadonlySet<string> = new Set([
        'disk.yandex.ru',
        'disk.yandex.com',
        'yadi.sk',
        '360.yandex.ru',
]);

/** Минимальная длина буквенно-цифрового токена шары Nextcloud. */
const NEXTCLOUD_TOKEN_MIN_LEN = 8;

/** Окно проверки «HTML вместо архива»: первые байты ответа. */
const HTML_HEAD_WINDOW = 256;

/** [overhaul S3/M-11] Грейс-период аренды при активной операции (см. armTtl):
 *  TTL выстрелил, но extractEntry ещё держит reader — release откладывается
 *  на 30 с вместо «reader disposed» под ногами. */
const RELEASE_GRACE_MS = 30_000;

// ── Таблица трансформаций ссылок (дизайн §4.1, приоритет сверху вниз) ──

/** Скачать-ссылка Google Drive: единый формат uc?export=download&id=<ID>. */
function gdriveDownloadUrl(id: string): string {
        return `https://drive.google.com/uc?export=download&id=${id}`;
}

/**
 * Распознавание провайдера по ссылке из настроек. Чистая функция:
 * сетевых запросов нет, вход не мутируется. Нераспознанное (в т.ч.
 * не разбираемое URL) → 'generic': валидация магическими байтами при
 * скачивании даст пользователю диагностику (§4.1).
 */
export function detectProvider(rawUrl: string): ProviderDetection {
        let u: URL;
        try {
                u = new URL(rawUrl);
        } catch {
                return { provider: 'generic', downloadUrl: rawUrl };
        }

        // Хост case-insensitive (URL уже нормализует в нижний регистр,
        // но дублирующая защита не мешает).
        const host = u.hostname.toLowerCase();
        // Сегменты пути без ведущего пустого элемента: '/s/abc' → ['s', 'abc'].
        const seg = u.pathname.split('/').slice(1);

        // 1. Яндекс.Диск: диск-хосты + путь /d/<key>. Ссылку не трансформируем:
        //    собственный manifest-режим (API) — фаза 6, здесь только распознавание.
        if (YANDEX_HOSTS.has(host) && seg[0] === 'd' && seg.length >= 2 && seg[1] !== '') {
                return { provider: 'yandex', downloadUrl: rawUrl };
        }

        // 2. Dropbox: хост содержит dropbox.com, путь /s/* или /sh/*;
        //    dl=1 заставляет отдавать файл (папку — zip'ом), а не страницу.
        if (
                (host === 'dropbox.com' || host.endsWith('.dropbox.com')) &&
                (seg[0] === 's' || seg[0] === 'sh' || (seg[0] === 'scl' && (seg[1] === 'fi' || seg[1] === 'fo') && Boolean(seg[2]))) &&
                seg.length >= 2 &&
                seg[1] !== ''
        ) {
                const params = new URLSearchParams(u.search);
                if (params.get('dl') !== '1') {
                        // dl=0 → dl=1; отсутствует → добавляется; прочие параметры сохраняются.
                        params.set('dl', '1');
                }
                const search = params.toString();
                return {
                        provider: 'dropbox',
                        downloadUrl: u.origin + u.pathname + (search ? '?' + search : '') + u.hash,
                };
        }

        // 3. Google Drive: /file/d/<ID>/... | /open?id=<ID> | /uc?id=<ID>.
        if (host === 'drive.google.com') {
                if (seg[0] === 'file' && seg[1] === 'd' && seg.length >= 3 && seg[2] !== '') {
                        return { provider: 'gdrive', downloadUrl: gdriveDownloadUrl(seg[2]) };
                }
                if ((seg[0] === 'open' || seg[0] === 'uc') && seg.length === 1) {
                        const id = u.searchParams.get('id');
                        if (id !== null && id !== '') {
                                return { provider: 'gdrive', downloadUrl: gdriveDownloadUrl(id) };
                        }
                }
        }

        // 4. Nextcloud/ownCloud: /s/<token> — ровно один буквенно-цифровой
        //    токен длиной ≥ 8 (короткий '/s/xx' — не шар), опционально уже
        //    с суффиксом /download.
        if (seg[0] === 's' && seg.length >= 2 && /^[a-z0-9_-]+$/i.test(seg[1]) && seg[1].length >= NEXTCLOUD_TOKEN_MIN_LEN) {
                const rest = seg.slice(2);
                if (rest.length === 0 || (rest.length === 1 && rest[0] === 'download')) {
                        if (!u.pathname.endsWith('/download')) u.pathname += '/download';
                        const downloadUrl = u.toString();
                        return { provider: 'nextcloud', downloadUrl };
                }
        }

        // 5. Прямая ссылка: путь оканчивается на .zip (до query).
        if (u.pathname.toLowerCase().endsWith('.zip')) {
                return { provider: 'direct', downloadUrl: rawUrl };
        }

        // 6. Всё остальное — generic ZIP-URL.
        return { provider: 'generic', downloadUrl: rawUrl };
}

// ── Сообщения и опции ──

export interface ZipUrlSourceMessages {
        htmlInsteadOfArchive: (url: string) => string;
        notAnArchive: (url: string) => string;
}

// ── Реэкспорт контрактов лёгкой проверки (W3-T04) ──
// SettingsTab (W3-T03 main.ts) зовёт src.testConnection() и получает
// TestConnectionResult; ZipRangeTransport инъектируется десктопом
// (NodeZipRangeTransport) или мобайлом/тестами.
export type { TestConnectionResult, ZipRangeTransport } from './zip-test-connection';

export interface ZipUrlSourceOptions {
        /** Текущая ссылка из настроек (читается на каждую загрузку архива). */
        url: () => string;
        /** Скачивание архива: десктоп/мобайл-реализация (фаза 5-f; тесты — фейк). */
        downloader: ArchiveDownloader;
        onProgress?: (p: { bytesTransferred: number; totalBytes: number | null }) => void;
        messages?: Partial<ZipUrlSourceMessages>;
        /**
         * [W3-T04] Транспорт для лёгкой проверки соединения (HEAD + Range).
         * Отсутствует → testConnection() сразу идёт fallback-путём.
         * В проде — NodeZipRangeTransport (lazy require('https')) или
         * мобайл-реализация поверх requestUrl.
         */
        rangeTransport?: ZipRangeTransport;
        /** [W3-T04] Лог наблюдаемости для testConnection (по умолчанию — no-op). */
        log?: (msg: string) => void;
        /**
         * [W6-T01] TTL сессионного архива в миллисекундах (оптимизация №1 аудита).
         *
         * 0 (по умолчанию) — СТАРОЕ поведение: dispose() освобождает reader
         * немедленно, следующая сессия скачивает архив заново. Это сохраняет
         * существующие тесты (золотая семантика dispose = «новый sync → новая
         * загрузка»).
         *
         * >0 — «аренда» сессии: dispose() становится мягким, ставит таймер
         * на TTL мс. fetch может использовать reader текущего снимка;
         * getManifest всегда открывает свежий снимок. После
         * истечения таймера — реальный release reader (tmp-файл удаляется).
         *
         * A subsequent listing needs a fresh archive, including retry/scan/policy
         * previews. Downloads within the current snapshot share its reader.
         *
         * Реальный release (без ожидания таймера) — forceDispose(), который
         * main.ts вызывает в onunload (плагин выключается → tmp вычищается).
         *
         * Диапазон 5–15 минут рекомендован аудитом (§7.1): меньше — польза
         * мала, больше — tmp-файл «зависает» в системе, занимая диск.
         */
        sessionTtlMs?: number;
        /** Deadline for each waiter; timed-out physical openings remain accounted until settled. */
        sessionOpenTimeoutMs?: number;
        /**
         * [W6-T01] Инъекция таймеров для тестов: setTimeout/clearTimeout/now.
         * По умолчанию — глобальные. В тестах — FakeClock для детерминированности.
         */
        timer?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout; now: () => number };
}

const DEFAULT_MESSAGES: ZipUrlSourceMessages = {
        htmlInsteadOfArchive: (url) =>
                `Получена HTML-страница вместо архива (${url}). Проверьте публичность ссылки и параметры скачивания.`,
        notAnArchive: (url) => `Ответ не является zip-архивом (${url})`,
};

/** Ошибка отмены: Error с полем aborted=true (стиль core/net.ts). */
function abortedError(): Error & { aborted: boolean } {
        const e = new Error('aborted') as Error & { aborted: boolean };
        e.aborted = true;
        return e;
}

/** crc32 (u32) → hex из 8 символов нижнего регистра — ключ кэша манифеста. */
function crc32Hex8(crc: number): string {
        return (crc >>> 0).toString(16).padStart(8, '0');
}

/** Результат классификации первых байт ответа (§7.1). */
type MagicKind = 'zip' | 'html' | 'other';

/** Первые 4 байта — zip: локальный заголовок (обычный архив) или EOCD (пустой). */
function isZipMagic(b: Uint8Array): boolean {
        return (
                b[0] === 0x50 &&
                b[1] === 0x4b &&
                ((b[2] === 0x03 && b[3] === 0x04) || (b[2] === 0x05 && b[3] === 0x06))
        );
}

/** Извлечённые байты → независимый ArrayBuffer (контракт SyncSource.fetch). */
function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
        if (data instanceof ArrayBuffer) {
                return data;
        }
        const ab = new ArrayBuffer(data.byteLength);
        new Uint8Array(ab).set(data);
        return ab;
}

interface ArchiveSession { reader: RandomAccessReader; cache: Map<string, ZipEntry>; url: string; generation: number }
interface ArchiveOpening { url: string; controller: AbortController; promise: Promise<ArchiveSession>; waiters: number; settled: boolean }

// ── Источник ──

export class ZipUrlSource implements SyncSource {
        readonly kind = 'zip-url' as const;
        readonly maxFileSizeBytes=64*1024*1024;
        readonly deletionSafety = 'immutable' as const;
        /** Bounded portable extraction; the archive itself uses separate staging. */

        private manifestObserve?: TransferObserver;
        private readonly opts: ZipUrlSourceOptions;
        private readonly messages: ZipUrlSourceMessages;

        /** Сессионный ридер (tmp-файл/память); null — сессия закрыта (forceDispose). */
        private reader: RandomAccessReader | null = null;

        /** Кэш записей central directory: имя → запись (только файлы, без директорий). */
        private zipEntries: Map<string, ZipEntry> | null = null;

        /** [W6-T01] TTL сессионного архива (мс). 0 — старое поведение (eager dispose). */
        private readonly sessionTtlMs: number;
        /** [W6-T01] Инъекция таймеров (прод — глобальные; тесты — FakeClock). */
        private readonly timer: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout; now: () => number };
        /** [W6-T01] Активный таймер мягкого dispose. null — нет активной аренды. */
        private ttlTimer: ReturnType<typeof setTimeout> | null = null;
        /** [W6-T01] Абсолютное время (ms) когда таймер аренды сработает. 0 — нет активной аренды. */
        private ttlExpiresAt: number = 0;

        /** [overhaul S3/M-11] Счётчик АКТИВНЫХ операций над reader'ом: TTL-колбэк
         *  мог уже стоять в очереди задач, когда ensureSession «снЯл» таймер —
         *  forceDispose выполнялся ПОСЛЕ возврата reader'а операции →
         *  «reader disposed» под ногами у extractEntry. Инкремент — синхронно
         *  в продолжении ensureSession (микрозадача раньше любого макротаска). */
        private activeOps = 0;
        private generation = 0;
        private sessionUrl: string | null = null;
        private opening: ArchiveOpening | null = null;
        private manifestActive = false;
        private readonly openTimeoutMs: number;
        private readonly readersInUse = new Map<RandomAccessReader, number>();
        private readonly retiredReaders = new Set<RandomAccessReader>();
        private readonly cleanup = new Map<RandomAccessReader, Promise<void>>();

        constructor(opts: ZipUrlSourceOptions) {
                this.openTimeoutMs = opts.sessionOpenTimeoutMs ?? 30 * 60000;
                if (!Number.isSafeInteger(this.openTimeoutMs) || this.openTimeoutMs < 1 || this.openTimeoutMs > 2147483647) throw Error('Invalid archive opening deadline');
                this.opts = opts;
                this.messages = { ...DEFAULT_MESSAGES, ...(opts.messages ?? {}) };
                this.sessionTtlMs = Math.max(0, Math.floor(opts.sessionTtlMs ?? 0));
                this.timer = opts.timer ?? { setTimeout, clearTimeout, now: () => Date.now() };
        }

        async getManifest(signal: AbortSignal,observe?:TransferObserver): Promise<RemoteEntry[]> {
                if (signal.aborted) {
                        throw abortedError();
                }
                if (this.manifestActive || this.activeOps > 0 || this.opening) throw new SyncFault('observation-busy', 'Archive snapshot is already in use or opening', 'source');
                this.manifestActive = true;
                this.manifestObserve = observe;
                try {
                        // A retained reader is not proof of freshness for a new manifest.
                        const release = this.forceDispose();
                        const generation = this.generation;
                        await release;
                        if (generation !== this.generation) throw new SyncFault('source-changed', 'Archive observation was disposed before opening', 'source');
                        const session = await this.ensureSession(signal);
                        this.assertSession(session, signal);
                        return [...session.cache.values()].map(e => ({ path: e.name, hash: crc32Hex8(e.crc32), hashAlg: 'crc32' as const, size: e.uncompressedSize }));
                } finally {
                        this.manifestActive = false;
                        this.manifestObserve = undefined;
                }
        }

        async fetch(entry: RemoteEntry, signal: AbortSignal,observe?:TransferObserver): Promise<ArrayBuffer> {
                if (signal.aborted) {
                        throw abortedError();
                }
                const session = await this.ensureSession(signal);
                this.assertSession(session, signal);
                const { reader, cache } = session;
                this.readersInUse.set(reader, (this.readersInUse.get(reader) ?? 0) + 1);
                // [overhaul S3/M-11] держим reader на всё время extractEntry.
                this.activeOps++;
                try {
                        const zipEntry = cache.get(entry.path);
                        if (!zipEntry) {
                                throw new Error(`entry not in archive: ${entry.path}`);
                        }
                        if (entry.hashAlg !== 'crc32' || entry.hash.toLowerCase() !== crc32Hex8(zipEntry.crc32) || entry.size !== zipEntry.uncompressedSize) throw new SyncFault('source-changed', 'Archive entry no longer matches the requested manifest', 'file');
                        // Отмена могла прийти, пока архив докачивался заново.
                        if (signal.aborted) {
                                throw abortedError();
                        }
                        observe?.({stage:'verify'});
                        const data = await extractEntry(reader, zipEntry,signal);
                        if (data.byteLength !== entry.size) {
                                throw new Error(
                                        `размер распакованной записи не совпал с манифестом: ${entry.path} ` +
                                                `(получено ${data.byteLength} байт, ожидалось ${entry.size})`,
                                );
                        }
                        this.assertSession(session, signal);
                        return toArrayBuffer(data);
                } finally {
                        this.activeOps--;
                        const remaining = this.readersInUse.get(reader)! - 1;
                        if (remaining) this.readersInUse.set(reader, remaining);
                        else {
                                this.readersInUse.delete(reader);
                                if (this.retiredReaders.has(reader)) {
                                        try { await this.cleanupReader(reader); }
                                        catch { this.opts.log?.('Retired archive cleanup failed; new openings remain blocked'); }
                                }
                        }
                }
        }

        /**
         * [W6-T01] Освобождение сессии.
         *
         * При sessionTtlMs=0 (СТАРОЕ поведение, по умолчанию) — EAGER release:
         * tmp-файл удаляется немедленно. Сохраняет существующие тесты и семантику
         * «dispose = следующая сессия скачивает заново».
         *
         * При sessionTtlMs>0 — SOFT release: ставит таймер на TTL мс. В пределах
         * TTL fetch может переиспользовать reader текущего снимка.
         * Новый getManifest всегда скачивает архив заново: аренда ресурсов
         * не доказывает свежесть списка файлов.
         *
         * Реальный release (без ожидания таймера) — forceDispose(), который
         * main.ts вызывает в onunload.
         *
         * Идемпотентна: повторный dispose() продлевает аренду (повторный таймер).
         */
        async dispose(): Promise<void> {
                if (this.sessionTtlMs <= 0 || this.opening) {
                        await this.forceDispose();
                        return;
                }
                // SOFT release: ставим/продлеваем таймер аренды.
                if (this.reader === null || this.zipEntries === null) {
                        // Сессии и так нет — нечего арендовать. На всякий случай
                        // сбросим возможный остаточный таймер.
                        this.clearTtlTimer();
                        return;
                }
                this.clearTtlTimer();
                this.armTtl(this.sessionTtlMs);
        }

        /** [overhaul S3/M-11] Постановка/продление аренды: колбэк проверяет
         *  activeOps — активная операция продлевает аренду (release отложен),
         *  вместо «reader disposed» под ногами. */
        private armTtl(ms: number): void {
                this.clearTtlTimer();
                this.ttlExpiresAt = this.timer.now() + ms;
                this.ttlTimer = this.timer.setTimeout(() => {
                        if (this.activeOps > 0 && this.reader !== null) {
                                this.armTtl(RELEASE_GRACE_MS);
                                return;
                        }
                        void this.forceDispose().catch(() => this.opts.log?.('Archive reader cleanup failed'));
                }, ms);
        }

        /**
         * [W6-T01] Принудительный release сессии (минуя TTL).
         *
         * Удаляет таймер аренды (если есть), освобождает reader (tmp-файл),
         * сбрасывает кэш central directory. Следующая сессия скачивает заново.
         *
         * ВАЖНО: reader/zipEntries обнуляются СИНХРОННО до await — иначе при
         * истечении TTL таймер зовёт forceDispose через `void`, и пока await
         * не разрешится, следующий ensureSession видит «живой» reader и
         * переиспользует кэш (хотя release уже идёт).
         *
         * Вызывается:
         *   - main.ts onunload (плагин выключается → tmp вычищается);
         *   - dispose() при sessionTtlMs=0 (старое поведение);
         *   - тестами, проверяющими жёсткую семантику release.
         *   - таймером аренды по истечении TTL (через `void`).
         */
        async forceDispose(): Promise<void> {
                this.clearTtlTimer();
                this.generation++;
                this.opening?.controller.abort();
                const reader = this.reader;
                // СИНХРОННО обнуляем кэш ДО await — иначе гонка с ensureSession.
                this.reader = null;
                this.zipEntries = null;
                this.sessionUrl = null;
                if (reader) this.retiredReaders.add(reader);
                for (const retired of this.retiredReaders) if (!this.readersInUse.has(retired)) await this.cleanupReader(retired);
        }

        private cleanupReader(reader: RandomAccessReader): Promise<void> {
                const existing = this.cleanup.get(reader);
                if (existing) return existing;
                this.retiredReaders.add(reader);
                const work = Promise.resolve().then(() => reader.dispose?.()).then(() => {
                        this.retiredReaders.delete(reader);
                }).finally(() => { this.cleanup.delete(reader); });
                this.cleanup.set(reader, work);
                return work;
        }

        /** [W6-T01] Внутренняя: снять активный таймер аренды. */
        private clearTtlTimer(): void {
                if (this.ttlTimer !== null) {
                        this.timer.clearTimeout(this.ttlTimer);
                        this.ttlTimer = null;
                }
                this.ttlExpiresAt = 0;
        }

        /**
         * [W6-T01] Снимок состояния аренды (для тестов/наблюдаемости).
         * Возвращает ttlExpiresAt (абсолютное ms, 0 если нет активной аренды).
         */
        get sessionTtlExpiresAt(): number {
                return this.ttlExpiresAt;
        }

        /** [W6-T01] Активна ли аренда (таймер выставлен и не сработал). */
        get hasActiveSessionLease(): boolean {
                return this.ttlTimer !== null && this.reader !== null;
        }

        // ── [W3-T04] Лёгкая проверка соединения ──

        /**
         * Лёгкая проверка ZIP-соединения без полного скачивания: HEAD + Range-чтение
         * хвоста архива → парсинг EOCD + central directory → «Архив корректен:
         * N файлов, X МБ». Если сервер не поддерживает ranges (нет Accept-Ranges
         * или 200 на Range) → fallback на полный путь через this.opts.downloader.
         *
         * Не бросает исключений — все ошибки возвращаются как { ok: false, error }.
         * Не трогает сессионный кэш (this.reader/this.zipEntries) — проверка
         * независима от последующего getManifest/fetch и наоборот.
         *
         * Если `rangeTransport` в опциях нет — метод сразу идёт fallback-путём
         * (method:'full'); это полезно для мобайла/тестов, где Range-транспорт
         * ещё не зарегистрирован.
         */
        async testConnection(signal?: AbortSignal): Promise<TestConnectionResult> {
                const url = this.opts.url();
                const det = detectProvider(url);
                // detectProvider трансформирует ссылку (dl=1, gdrive→uc, nextcloud→/download).
                // Проверка идёт по ВИРТУАЛЬНОМУ downloadUrl — тому же, что качает downloader.
                const downloadUrl = det.downloadUrl;

                // Без rangeTransport — нет Range-пути, сразу fallback на полный.
                if (!this.opts.rangeTransport) {
                        return runFullFallback({
                                url: downloadUrl,
                                fallbackDownloader: this.opts.downloader,
                                signal,
                                log: this.opts.log,
                        });
                }

                return testZipConnection({
                        url: downloadUrl,
                        rangeTransport: this.opts.rangeTransport,
                        fallbackDownloader: this.opts.downloader,
                        signal,
                        log: this.opts.log,
                });
        }

        // ── внутреннее ──

        /**
         * Гарантирует открытую сессию: при живом ридере переиспользует его,
         * иначе скачивает архив заново (первый вызов или после dispose).
         * Возвращает ридер и кэш записей central directory.
         */
        private assertSession(session: ArchiveSession, signal: AbortSignal): void {
                signal.throwIfAborted();
                if (session.generation !== this.generation || session.reader !== this.reader || session.url !== this.opts.url())
                        throw new SyncFault('source-changed', 'Archive snapshot changed or was disposed', 'source');
        }

        private async ensureSession(signal: AbortSignal): Promise<ArchiveSession> {
                signal.throwIfAborted();
                const url = this.opts.url();
                if (this.retiredReaders.size) throw new SyncFault('observation-busy', 'A retired archive reader is still in use', 'source');
                if (this.reader !== null && this.zipEntries !== null) {
                        if (this.sessionUrl !== url) {
                                await this.forceDispose();
                                throw new SyncFault('source-changed', 'Archive URL changed; a fresh manifest is required', 'source');
                        }
                        this.clearTtlTimer();
                        return { reader: this.reader, cache: this.zipEntries, url, generation: this.generation };
                }
                if (this.opening && this.opening.url !== url) {
                        await this.forceDispose();
                        throw new SyncFault('source-changed', 'Archive URL changed while opening', 'source');
                }
                if (this.opening?.controller.signal.aborted) throw new SyncFault('observation-busy', 'Cancelled physical archive opening has not settled', 'source');
                if (!this.opening) {
                        const controller = new AbortController();
                        const opening: ArchiveOpening = { url, controller, promise: undefined!, waiters: 0, settled: false };
                        this.opening = opening;
                        opening.promise = this.openSession(url, this.generation, controller.signal).finally(() => {
                                opening.settled = true;
                                if (this.opening === opening) this.opening = null;
                        });
                }
                return this.waitForOpening(this.opening, signal);
        }

        private waitForOpening(opening: ArchiveOpening, signal: AbortSignal): Promise<ArchiveSession> {
                opening.waiters++;
                return new Promise((resolve, reject) => {
                        let finished = false;
                        const finish = (error?: unknown, session?: ArchiveSession) => {
                                if (finished) return;
                                finished = true;
                                clearTimeout(deadline);
                                signal.removeEventListener('abort', cancelled);
                                opening.controller.signal.removeEventListener('abort', invalidated);
                                opening.waiters--;
                                if (!opening.waiters && !opening.settled) opening.controller.abort();
                                if (session) resolve(session); else reject(error);
                        };
                        const cancelled = () => finish(signal.reason ?? abortedError());
                        const invalidated = () => finish(abortedError());
                        const deadline = setTimeout(() => finish(new SyncFault('archive-open-timeout', 'Archive opening exceeded its deadline; physical request may still be active', 'source')), this.openTimeoutMs);
                        signal.addEventListener('abort', cancelled, { once: true });
                        opening.controller.signal.addEventListener('abort', invalidated, { once: true });
                        opening.promise.then(session => finish(undefined, session), error => finish(error));
                        if (signal.aborted) cancelled(); else if (opening.controller.signal.aborted) invalidated();
                });
        }

        private async openSession(url: string, generation: number, signal: AbortSignal): Promise<ArchiveSession> {
                const reader = await this.downloadAndValidate(detectProvider(url), url, signal);
                try {
                        signal.throwIfAborted();
                        const entries = await readCentralDirectory(reader);
                        const cache = new Map<string, ZipEntry>();
                        for (const e of entries) {
                                signal.throwIfAborted();
                                if (!e.isDir) {
                                        if (cache.has(e.name)) throw new Error(`Archive path collision: ${e.name}`);
                                        cache.set(e.name, e);
                                }
                        }
                        signal.throwIfAborted();
                        if (generation !== this.generation || url !== this.opts.url()) throw new SyncFault('source-changed', 'Archive URL or generation changed before publication', 'source');
                        this.reader = reader;
                        this.zipEntries = cache;
                        this.sessionUrl = url;
                        return { reader, cache, url, generation };
                } catch (error) {
                        try { await this.cleanupReader(reader); } catch { this.opts.log?.('Unpublished archive reader cleanup failed'); }
                        throw error;
                }
        }

        /**
         * Скачивание + валидация магических байт (§7.1). GDrive для больших
         * файлов отдаёт HTML с confirm-токеном (§4.2): один повтор с
         * '&confirm=t'; если и тогда HTML — диагностика htmlInsteadOfArchive.
         */
        private async downloadAndValidate(
                det: ProviderDetection,
                rawUrl: string,
                signal: AbortSignal,
        ): Promise<RandomAccessReader> {
                let url = det.downloadUrl;
                let reader: RandomAccessReader | undefined;
                const generation = this.generation;
                const progress = (p: ArchiveDownloadProgress) => {
                        if (signal.aborted || generation !== this.generation || this.opts.url() !== rawUrl) return;
                        this.opts.onProgress?.(p);
                        this.manifestObserve?.({stage:'manifest',bytes:p.bytesTransferred,totalBytes:p.totalBytes??undefined,capability:p.capability??'streaming'});
                };
                try {
                        reader = await this.opts.downloader.download(url, { signal, onProgress: progress });
                        signal.throwIfAborted();
                        let kind = await this.classify(reader);
                        if (kind === 'html' && det.provider === 'gdrive' && !url.includes('confirm=t')) {
                                const htmlReader = reader;
                                reader = undefined;
                                await this.cleanupReader(htmlReader);
                                signal.throwIfAborted();
                                url += '&confirm=t';
                                reader = await this.opts.downloader.download(url, { signal, onProgress: progress });
                                signal.throwIfAborted();
                                kind = await this.classify(reader);
                        }
                        signal.throwIfAborted();
                        if (kind === 'html') throw new Error(this.messages.htmlInsteadOfArchive(rawUrl));
                        if (kind !== 'zip') throw new Error(this.messages.notAnArchive(rawUrl));
                        return reader;
                } catch (error) {
                        try { if (reader) await this.cleanupReader(reader); } catch { this.opts.log?.('Downloaded archive reader cleanup failed'); }
                        throw error;
                }
        }

        /**
         * Классификация ответа по первым байтам: zip (50 4B 03 04 / 50 4B 05 06),
         * HTML-страница (первый байт '<' или doctype/html в первых 256 байтах,
         * регэксп — по формулировке §7.1) либо прочий мусор.
         */
        private async classify(reader: RandomAccessReader): Promise<MagicKind> {
                const size = reader.size();
                const headLen = Math.min(HTML_HEAD_WINDOW, size);
                const head = headLen > 0 ? await reader.read(0, headLen) : new Uint8Array(0);

                if (head.length >= 4 && isZipMagic(head)) {
                        return 'zip';
                }
                if (head.length > 0 && head[0] === 0x3c) {
                        return 'html';
                }
                let text = '';
                for (let i = 0; i < head.length; i++) {
                        text += String.fromCharCode(head[i]);
                }
                if (/<!doctype html|<html/i.test(text)) {
                        return 'html';
                }
                return 'other';
        }
}
