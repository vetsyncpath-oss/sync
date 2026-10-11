import type { WriteMode } from './file-rules';
// src/core/conflict.ts — разрешитель конфликтов «локаль vs облако»
// (фаза 3-5, дизайн §9.1 — матрица решений, реализована дословно).
//
// АУДИТ Б-01: старый safeWrite при ОТСУТСТВИИ записи в кэше SHA молча
// перезаписывал локально изменённый файл удалённой версией — без
// предупреждения и без копии. Здесь пустой cacheHash = КОНФЛИКТ:
// нетронутость локали со времён прошлой синхронизации НЕ доказана,
// а «не доказана» ≠ «перезапиши и забудь».
//
// АУДИТ Б-02: старый keep-both сохранял локальную версию в конфликт-копию,
// но УДАЛЁННУЮ версию не записывал вообще, при этом кэш обновлялся хэшем
// НЕвписанной версии — все последующие синхронизации считали файл
// «Up to date» навсегда. Здесь keep-both пишет ОБЕ версии: локальную —
// в конфликт-копию, облачную — в основной файл; кэш получает хэш
// реально записанной облачной версии (который вернула запись манифеста).
//
// 'ask' awaits the injected UI; the host owns question serialization.
// Cancellation is checked again after the answer, before any write.
//
// [W1-T06] Уровни зеркала (матрица §2.2 спеки, решения Е1-а + A3):
// safeWrite принимает опциональный уровень зеркала файла.
//  - 'light' (A3 «Лёгкое зеркало»): локальная версия ОСТАЁТСЯ на месте,
//    версия источника кладётся РЯДОМ как .conflict-копия (зеркально
//    наоборот относительно fetch-keep-both, который спасает локаль
//    копией и пишет remote на место).
//  - 'full': preserve the latest saved local bytes in a recovery copy,
//    then replace only if the original still matches. 'remote-wins'
//    has the same recovery requirement. No trash-before-write gap.
// Конфликт-ветка матрицы §2.2 имеет ПРИОРИТЕТ над стратегией настроек
// (spec §2.4): в light/full стратегия (в т.ч. ask) игнорируется.
// undefined/'fetch' — прежняя семантика §9.1 по стратегии ДОСЛОВНО.
//
// Модуль ядра (решение В5-1): НЕ импортирует obsidian/node и даже
// hasher — функции хэширования инъектируются через deps, резолвер
// не знает, откуда они пришли. Каталоги НЕ создаются: mkdir —
// зона ответственности вызывающего. Никаких кэшей хэшей (анти-паттерн
// Б-06): localHash вычисляется лениво и только для текущего вызова.

import type {
        ConflictInfo,
        ConflictStrategy,
        ConfirmUI,
        LightConflictStrategy,
        RemoteEntry,
        VaultAdapter,
        WriteOutcome,
} from '../sources/types';

import type { MirrorLevel } from './mirror';
// [overhaul v4 / Этап 5 / F1] extractConflictTimestamp — для auto-cleanup конфликт-копий.
import { extractConflictTimestamp } from './file-glob';

/**
 * [P2/M9] Побайтовое равенство двух буферов — замена хэш-сравнению для
 * слабой идентичности (weak/etag), где локальный хэш невычислим. Сначала
 * длины (быстрый отказ), затем DataView-сравнение 4-байтовыми словами.
 */
export function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
        if (a === b) return true;
        if (a.byteLength !== b.byteLength) return false;
        const wa = new DataView(a);
        const wb = new DataView(b);
        const words = a.byteLength >> 2;
        for (let i = 0; i < words; i++) {
                if (wa.getUint32(i * 4) !== wb.getUint32(i * 4)) return false;
        }
        const tail = a.byteLength & 3;
        if (tail > 0) {
                const off = words * 4;
                for (let i = 0; i < tail; i++) {
                        if (wa.getUint8(off + i) !== wb.getUint8(off + i)) return false;
                }
        }
        return true;
}

/** Зависимости резолвера: vault, инъекции хэшей/UI/времени. */
export interface ConflictResolverDeps {
        vault: VaultAdapter;
        sha256(data: ArrayBuffer): Promise<string>;
        crc32(data: ArrayBuffer): string;
        /** Хэшер git-источника (контракт-ревизия 3-7): git-blob SHA-1. */
        gitSha1?(data: ArrayBuffer): Promise<string>;
        /** Нужен для стратегии 'ask'; при отсутствии — фолбэк на keep-both. */
        ui?: ConfirmUI;
        /** Инъекция времени для детерминизма тестов (default: Date.now). */
        now?(): number;
        /**
         * [overhaul v4 / Этап 3] Стратегия light-конфликтов.
         *  - 'keep-local' (default, текущее поведение): локаль остаётся, remote в .conflict-<ts>
         *  - 'keep-both': локаль в .conflict-<ts>, remote на место (как fetch-keep-both)
         *
         * Default (undefined) = 'keep-local' для backward compatibility.
         * Меняется через setLightStrategy без пересоздания резолвера.
         */
        lightStrategy?: LightConflictStrategy;
}

export interface WriteTransaction {
        /** Durable write of the primary path or an incoming conflict copy. */
        write(path: string, data: ArrayBuffer, expected: ArrayBuffer | null, incoming?: boolean): Promise<void>;
        appliedLocalSha256?: string;
}

/** Максимум кандидатов имени штампованной копии (без суффикса + -2…-100). */
const MAX_NAME_CANDIDATES = 100;

/**
 * [overhaul S5 + v4/Этап 5-F1] Свободное имя штампованной копии:
 * `base.<marker>-<timestamp>[-N]<ext>`, где ext — по последней точке
 * в ИМЕНИ файла (точки в каталогах не считаются; нет точки — ext пустой).
 * При коллизии — суффиксы -2, -3, … (лимит 100 кандидатов).
 *
 * [overhaul v4 / Этап 5 / F1] AUTO-CLEANUP: при достижении лимита, если
 * предоставлены колбэки `listExisting` + `remove`, найти самую старую
 * копию (по timestamp в имени) и удалить её, затем повторить попытку.
 * Без колбэков — прежнее поведение (throw после 100 кандидатов).
 *
 * Общий генератор для двух потребителей (один источник правды об
 * уникальности имён):
 *  - ConflictResolver.buildConflictPath (marker='conflict', каталог тот же,
 *    копия «рядом» с оригиналом);
 *  - .trash-фолбэк адаптера vault в main.ts (marker='trash', вызывается с
 *    БАЗОВЫМ ИМЕНЕМ файла, кандидат проверяется в `.trash/` через
 *    замыкание exists — коллизия с уже лежащими в корзине копиями
 *    исключена).
 *
 * @param path Полный путь к базовому файлу (например, 'notes/draft.md').
 * @param marker 'conflict' или 'trash'.
 * @param timestamp Строка timestamp формата YYYY-MM-DDTHH-mm-ss.
 * @param exists Колбэк проверки существования кандидата (для коллизий).
 * @param listExisting [optional] Колбэк для поиска существующих копий в каталоге
 *   для auto-cleanup. Возвращает массив полных путей существующих копий.
 * @param remove [optional] Колбэк удаления (для auto-cleanup).trash.
 */
export async function buildStampedPath(
        path: string,
        marker: string,
        timestamp: string,
        exists: (p: string) => Promise<boolean>,
        listExisting?: (dir: string, baseName: string) => Promise<string[]>,
        remove?: (p: string) => Promise<void>,
): Promise<string> {
        const slashIdx = path.lastIndexOf('/');
        const dotIdx = path.lastIndexOf('.');
        const hasExt = dotIdx > slashIdx; // точка внутри имени файла
        const base = hasExt ? path.slice(0, dotIdx) : path;
        const ext = hasExt ? path.slice(dotIdx) : '';
        const dir = slashIdx > 0 ? path.slice(0, slashIdx) : '';
        const baseName = base.slice(slashIdx > 0 ? slashIdx + 1 : 0);

        for (let i = 1; i <= MAX_NAME_CANDIDATES; i++) {
                const suffix = i === 1 ? '' : `-${i}`;
                const candidate = `${base}.${marker}-${timestamp}${suffix}${ext}`;
                if (!(await exists(candidate))) {
                        return candidate;
                }
        }

        // [overhaul v4 / Этап 5 / F1] Auto-cleanup: лимит кандидатов исчерпан,
        // но caller дал нам listExisting + remove — найти самую старую копию
        // и удалить её, освободив слот для нового имени.
        if (listExisting && remove) {
                try {
                        const existing = await listExisting(dir, baseName);
                        if (existing.length > 0) {
                                // Сортировать по timestamp в имени (от старого к новому).
                                // extractConflictTimestamp импортирован выше.
                                existing.sort((a, b) => {
                                        const ta = extractConflictTimestamp(a);
                                        const tb = extractConflictTimestamp(b);
                                        // файлы без timestamp — самые старые (в начало списка)
                                        if (!ta && !tb) return 0;
                                        if (!ta) return -1;
                                        if (!tb) return 1;
                                        return ta.localeCompare(tb);
                                });
                                const oldest = existing[0];
                                if (oldest) {
                                        try {
                                                await remove(oldest);
                                                // Рекурсивно попробовать снова — теперь слот должен быть свободен.
                                                return buildStampedPath(path, marker, timestamp, exists, listExisting, remove);
                                        } catch (e) {
                                                // не получилось удалить — fall through к throw
                                                console.warn(`[VaultSync] auto-cleanup: failed to remove oldest ${marker}-copy "${oldest}":`, e);
                                        }
                                }
                        }
                } catch (e) {
                        // listExisting упал — fall through к throw
                        console.warn(`[VaultSync] auto-cleanup: listExisting failed for ${marker}-copy:`, e);
                }
        }

        throw new Error(
                `ConflictResolver: no free ${marker}-copy name for "${path}" ` +
                        `after ${MAX_NAME_CANDIDATES} candidates`,
        );
}

/**
 * Локальное время в формате `YYYY-MM-DDTHH-mm-ss`.
 * Двоеточия заменены дефисами: имена с ':' недопустимы на Windows.
 * [overhaul S5] экспортирована: тот же формат штампов использует
 * .trash-фолбэк адаптера vault (main.ts) — единый вид уникальных имён.
 */
export function formatConflictTimestamp(now: number): string {
        const d = new Date(now);
        const p2 = (n: number): string => String(n).padStart(2, '0');
        return (
                String(d.getFullYear()).padStart(4, '0') +
                '-' +
                p2(d.getMonth() + 1) +
                '-' +
                p2(d.getDate()) +
                'T' +
                p2(d.getHours()) +
                '-' +
                p2(d.getMinutes()) +
                '-' +
                p2(d.getSeconds())
        );
}

/**
 * Разрешитель конфликтов по матрице §9.1. Один экземпляр — одна
 * стратегия (меняется через setStrategy, например из настроек).
 */
export class ConflictResolver {
        private strategy: ConflictStrategy;
        private lightStrategy: LightConflictStrategy;
        private readonly deps: ConflictResolverDeps;

        constructor(strategy: ConflictStrategy, deps: ConflictResolverDeps) {
                this.strategy = strategy;
                // [overhaul v4 / Этап 3] default 'keep-local' = текущее поведение light-mirror.
                this.lightStrategy = deps.lightStrategy ?? 'keep-local';
                this.deps = deps;
        }

        /** Сменить стратегию (без пересоздания резолвера). */
        setStrategy(strategy: ConflictStrategy): void {
                this.strategy = strategy;
        }

        /**
         * [overhaul v4 / Этап 3] Сменить light-стратегию (без пересоздания резолвера).
         * Вызывается из main.ts prepareSession() при смене настройки.
         */
        setLightStrategy(strategy: LightConflictStrategy): void {
                this.lightStrategy = strategy;
        }
        snapshot(): ConflictResolver {
                return new ConflictResolver(this.strategy, { ...this.deps, lightStrategy: this.lightStrategy });
        }

        /**
         * Безопасная запись удалённой версии файла с учётом локальных правок.
         *
         * Матрица §9.1 (дословно):
         * 1. локального файла нет            → записать remote (NEW);
         * 2. local bytes === remote bytes    → update the baseline without writing;
         * 3. cacheHash отсутствует           → КОНФЛИКТ (фикс Б-01:
         *    нетронутость локали не доказана);
         * 4. localHash !== cacheHash         → КОНФЛИКТ (фикс Б-02-контекст:
         *    локаль меняли после последней синхронизации);
         * 5. localHash === cacheHash ≠ remote → штатное обновление (remote
         *    изменился, локаль нетронута с прошлой синхронизации).
         *
         * Контракт кэша: updateCache=true только когда удалённая версия
         * реально легла на диск; 'local-wins' → updateCache=false, иначе
         * потеряем повторную попытку на следующем sync (§9.3).
         *
         * [W1-T06] 4-й параметр — уровень зеркала файла (MirrorLevel,
         * per-call от координатора). 'light'/'full' включают конфликт-ветки
         * зеркала с приоритетом над стратегией (spec §2.4); undefined/'fetch'
         * — матрица §9.1 по стратегии настроек (2.3.3 дословно,
         * регресс-гарантия: существующие тесты не меняются).
         */
        async safeWrite(
                entry: RemoteEntry,
                remoteData: ArrayBuffer,
                cacheHash: string | undefined,
                mirror?: MirrorLevel,
                signal?: AbortSignal,
                transaction?: WriteTransaction,
                writeMode?: WriteMode,
        ): Promise<WriteOutcome> {
                signal?.throwIfAborted();
                const { vault } = this.deps;
                if (writeMode === 'preserve') return { kind: 'skipped', updateCache: false };
                if (!(await vault.exists(entry.path))) {
                        await this.writeIfUnchanged(entry.path, remoteData, null, signal, transaction);
                        return { kind: 'written', updateCache: true };
                }
                if (writeMode === 'create') return { kind: 'skipped', updateCache: false };
                const local = await vault.readBinary(entry.path);
                const localHash = await this.computeLocalHash(entry.hashAlg, local);
                signal?.throwIfAborted();
                // Equal bytes need no write, avoiding a race with a subsequent edit.
                if (bytesEqual(local, remoteData)) {
                        if (transaction) await this.writeIfUnchanged(entry.path, remoteData, local, signal, transaction);
                        return { kind: 'written', updateCache: true };
                }
                const conflict = transaction?.appliedLocalSha256 !== undefined
                        ? await this.deps.sha256(local) !== transaction.appliedLocalSha256
                        : cacheHash === undefined || localHash === null || localHash !== cacheHash;
                if (!conflict) {
                        await this.writeIfUnchanged(entry.path, remoteData, local, signal, transaction);
                        return { kind: 'written', updateCache: true };
                }
                if (writeMode === 'update') return { kind: 'skipped', updateCache: false };
                return this.resolveConflict(entry, remoteData, local, writeMode === 'remote' ? 'full' : mirror, signal, transaction);
        }

        private async writeIfUnchanged(path: string, data: ArrayBuffer, expected: ArrayBuffer | null, signal?: AbortSignal, transaction?: WriteTransaction): Promise<void> {
                signal?.throwIfAborted();
                if (transaction) { await transaction.write(path, data, expected); return; }
                const exists = await this.deps.vault.exists(path);
                if (expected === null ? exists : !exists || !bytesEqual(await this.deps.vault.readBinary(path), expected)) {
                        throw new Error(`Local file changed before replacement: ${path}`);
                }
                signal?.throwIfAborted();
                if (expected && this.deps.vault.compareAndWrite) {
                        const replaced = await this.deps.vault.compareAndWrite(path, data, expected, signal);
                        if (replaced === false) throw new Error(`Local file changed before replacement: ${path}`);
                        if (replaced === true) return;
                }
                signal?.throwIfAborted();
                await this.deps.vault.writeBinary(path, data);
        }

        /**
         * Маршрутизация хэшера по алгоритму записи (контракт-ревизия 3-7:
         * HashAlg += 'git-sha1' для git-источника).
         *
         * [P2/M9] 'weak'/'etag' — НЕ контентные хэши: локальный хэш
         * невычислим → null (safeWrite переходит на прямое сравнение байтов
         * и fail-closed конфликт-ветку). Неизвестный alg — по-прежнему throw
         * (контрактная ошибка, не рантайм-деградация).
         */
        private async computeLocalHash(alg: RemoteEntry['hashAlg'], data: ArrayBuffer): Promise<string | null> {
                if (alg === 'sha256') return this.deps.sha256(data);
                if (alg === 'crc32') return this.deps.crc32(data);
                if (alg === 'git-sha1') {
                        if (!this.deps.gitSha1) {
                                throw new Error('ConflictResolver: gitSha1 hasher not injected for git-sha1 entries');
                        }
                        return this.deps.gitSha1(data);
                }
                if (alg === 'weak' || alg === 'etag') return null;
                throw new Error(`ConflictResolver: unknown hashAlg ${alg}`);
        }

        /**
         * Разрешение конфликта. [W1-T06] Сначала — уровень зеркала
         * (конфликт-ветка матрицы §2.2 имеет приоритет над стратегией,
         * spec §2.4): 'light'/'full' обслуживаются здесь и НЕ доходят
         * до стратегии/ask. mirror undefined/'fetch' — матрица §9.1 по
         * активной стратегии (дословно, как до W1-T06).
         */
        private async resolveConflict(
                entry: RemoteEntry,
                remoteData: ArrayBuffer,
                local: ArrayBuffer,
                mirror?: MirrorLevel,
                signal?: AbortSignal,
                transaction?: WriteTransaction,
        ): Promise<WriteOutcome> {
                let choice: ConflictStrategy = this.strategy;
                if (mirror !== 'light' && mirror !== 'full' && choice === 'ask') {
                        choice = this.deps.ui ? await this.deps.ui.askConflict({
                                path: entry.path, localSize: local.byteLength, remoteSize: remoteData.byteLength,
                        }) : 'keep-both';
                }
                signal?.throwIfAborted();
                if ((mirror === undefined || mirror === 'fetch') && choice === 'local-wins') {
                        return { kind: 'skipped', updateCache: false };
                }
                const now = this.deps.now?.() ?? Date.now();
                const conflictPath = await this.buildConflictPath(entry.path, now);
                signal?.throwIfAborted();
                if (mirror === 'light' && this.lightStrategy === 'keep-local') {
                        if (transaction) await transaction.write(conflictPath, remoteData, null, true);
                        else await this.deps.vault.writeBinary(conflictPath, remoteData);
                        return { kind: 'conflict', updateCache: true, conflictPath, mirror: 'light' };
                }
                // Re-read AFTER any question/path allocation; preserve the latest saved version.
                local = await this.deps.vault.readBinary(entry.path);
                signal?.throwIfAborted();
                await this.deps.vault.writeBinary(conflictPath, local);
                // A failed recovery write or a concurrent edit must leave the original intact.
                await this.writeIfUnchanged(entry.path, remoteData, local, signal, transaction);
                return { kind: 'conflict', updateCache: true, conflictPath,
                        ...(mirror === 'light' || mirror === 'full' ? { mirror } : {}) };
        }

        /**
         * Свободное имя конфликт-копии — делегирует общему генератору
         * [overhaul S5] buildStampedPath (marker='conflict', проверка
         * коллизий — через exists порта vault).
         */
        private async buildConflictPath(path: string, now: number): Promise<string> {
                // Never reclaim the sole recovery version just to make room for a new copy.
                return buildStampedPath(path, 'conflict', formatConflictTimestamp(now), p => this.deps.vault.exists(p));
        }
}
