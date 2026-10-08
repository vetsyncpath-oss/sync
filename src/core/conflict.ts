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
// АУДИТ Б-21 (в пределах этого модуля): стратегия 'ask' делает ровно
// один последовательный await deps.ui.askConflict на конфликт. Никаких
// параллельных модалок из батчей Promise.allSettled быть не может по
// построению; внешняя очередь вызовов — зона ответственности
// Coordinator'а.
//
// [W1-T06] Уровни зеркала (матрица §2.2 спеки, решения Е1-а + A3):
// safeWrite принимает опциональный уровень зеркала файла.
//  - 'light' (A3 «Лёгкое зеркало»): локальная версия ОСТАЁТСЯ на месте,
//    версия источника кладётся РЯДОМ как .conflict-копия (зеркально
//    наоборот относительно fetch-keep-both, который спасает локаль
//    копией и пишет remote на место).
//  - 'full' (правка Е1-а «Полное зеркало»): источник НА МЕСТО, локаль —
//    В КОРЗИНУ («откат всегда возможен» — принцип №3 спеки); без
//    trash-адаптера — fallback-конфликт-копия вместо молчаливой потери.
//    [overhaul S5] отказ КОРЗИНЫ приравнен к отсутствию trash-адаптера:
//    локаль спасается конфликт-копией, загрузка НЕ падает (ветка
//    mirror === 'full' в resolveConflict — фикс вечного ретрая
//    «Destination file already exists!»).
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
function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
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

        /**
         * Безопасная запись удалённой версии файла с учётом локальных правок.
         *
         * Матрица §9.1 (дословно):
         * 1. локального файла нет            → записать remote (NEW);
         * 2. localHash === remoteHash        → записать remote поверх
         *    (идентичный контент; самовосстановление кэша, кейс 5);
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
        ): Promise<WriteOutcome> {
                const { vault } = this.deps;

                // Кейс 1: локального файла нет — обычный NEW, конфликтов не бывает.
                if (!(await vault.exists(entry.path))) {
                        await vault.writeBinary(entry.path, remoteData);
                        return { kind: 'written', updateCache: true };
                }

                // Ленивое вычисление localHash — только когда файл существует.
                const local = await vault.readBinary(entry.path);
                const localHash = await this.computeLocalHash(entry.hashAlg, local);

                // Кейс 5 (и «2» с точки зрения контента): локаль идентична remote —
                // пишем поверх (no-op по содержимому) и чиним кэш.
                // [P2/M9] Для слабой идентичности (weak/etag) локальный хэш
                // НЕВЫЧИСЛИМ (null) — идентичность проверяем прямым сравнением
                // байтов local vs remoteData: это убирает конфликты/копии на
                // ETag-churn и повторные добавления идентичного содержимого.
                const identical = localHash !== null
                        ? localHash === entry.hash
                        : bytesEqual(local, remoteData);
                if (identical) {
                        await vault.writeBinary(entry.path, remoteData);
                        return { kind: 'written', updateCache: true };
                }

                // Определение КОНФЛИКТА: локаль отличается от remote И не является
                // нетронутой с прошлой синхронизации.
                // - cacheHash === undefined → КОНФЛИКТ (фикс Б-01);
                // - localHash !== cacheHash → КОНФЛИКТ (локаль меняли);
                // - иначе — штатное обновление (remote изменился, локаль чистая).
                // [P2/M9] weak/etag: localHash === null — «нетронутость» НЕДОКАЗУЕМА
                // → fail-closed через resolveConflict. Стратегия/mirror решают:
                // remote-wins перезапишет ТИХО (kind='written', без конфликт-шума),
                // local-wins сохранит локаль, keep-both/ask — копия/модалка,
                // light/full — корзина/копия. Ни фантомных конфликтов на
                // идентичное содержимое (ветка identical выше), ни новых
                // путей молчаливой потери локальных правок.
                const conflict = cacheHash === undefined || localHash === null || localHash !== cacheHash;
                if (!conflict) {
                        await vault.writeBinary(entry.path, remoteData);
                        return { kind: 'written', updateCache: true };
                }

                return this.resolveConflict(entry, remoteData, local, mirror);
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
        ): Promise<WriteOutcome> {
                // [W1-T06 / A3 + overhaul v4/Этап 3] «Лёгкое зеркало» — две опции:
                //
                // 'keep-local' (default, текущее поведение): локальная версия
                //   ОСТАЁТСЯ на месте (entry.path не трогаем), версия источника
                //   скачивается и кладётся РЯДОМ как .conflict-копия. Это НЕ
                //   fetch-keep-both (тот спасает ЛОКАЛЬ в копию и пишет remote
                //   на место) — light зеркально наоборот. Стратегия (в т.ч.
                //   ask) игнорируется: уровень выше стратегии.
                //
                //   updateCache=true — осознанно: кэш получит хэш remote,
                //   diff перестанет видеть расхождение, конфликт не зациклится
                //   на каждом sync. Цена: рассинхрон «кэш = remote, диск = local»
                //   — локаль живёт на месте до ручного разбора, версия источника —
                //   рядом в копии.
                //
                // 'keep-both' [overhaul v4/Этап 3]: симметрично с fetch-keep-both —
                //   локаль в .conflict-копию, remote на место. Удобно, когда
                //   пользователь хочет, чтобы remote-версия была «основной», а
                //   локальные правки — в копии для архива. Кэш обновляется remote
                //   hash, так как на месте entry.path лежит remote.
                //
                //   Выбор между ними — пользовательский (dropdown в SettingsTab,
                //   только при mirror='light'). full mirror не зависит (всегда
                //   trash + remote на место).
                if (mirror === 'light') {
                        const now = this.deps.now?.() ?? Date.now();
                        const conflictPath = await this.buildConflictPath(entry.path, now);

                        if (this.lightStrategy === 'keep-both') {
                                // Сначала спасаем локаль в копию, ПОТОМ пишем remote
                                // в основной файл: при обрыве между записями локальные
                                // правки не теряются (симметрия с fetch-keep-both).
                                await this.deps.vault.writeBinary(conflictPath, local);
                                await this.deps.vault.writeBinary(entry.path, remoteData);
                                return { kind: 'conflict', updateCache: true, conflictPath, mirror: 'light' };
                        }

                        // 'keep-local' (default): remote в копию, локаль не трогаем.
                        await this.deps.vault.writeBinary(conflictPath, remoteData);
                        return { kind: 'conflict', updateCache: true, conflictPath, mirror: 'light' };
                }

                // [W1-T06 / Е1-а] «Полное зеркало»: источник НА МЕСТО;
                // локальная версия — В КОРЗИНУ (НЕ .conflict-копия — именно
                // корзина: «откат всегда возможен» — принцип №3 спеки).
                // Стратегия (в т.ч. ask) игнорируется, как и в light.
                // [overhaul S5 / EEXIST] отказ корзины НЕ равен отказу
                // загрузки: рантайм Obsidian бросает «Destination file
                // already exists!», когда в месте назначения корзины уже
                // лежит файл с тем же именем (типично после повторных
                // синхронизаций). Раньше такой throw пробрасывался наружу:
                // файл падал в очередь неудач, ретраи бились об ту же
                // ошибку бесконечно, сессия не сходилась. Теперь отказ
                // корзины обрабатывается РОВНО как отсутствие trash-порта
                // (ветка ниже): локаль спасается конфликт-копией, remote
                // ложится на место, кэш обновляется — сходимость
                // гарантирована, откат возможен (принцип №3 сохранён).
                if (mirror === 'full') {
                        let trashedLocal = false;
                        if (this.deps.vault.trash) {
                                try {
                                        // Сначала корзина, ПОТОМ remote на место: при обрыве
                                        // между шагами локаль уже в корзине — откат возможен.
                                        await this.deps.vault.trash(entry.path);
                                        trashedLocal = true;
                                } catch (e) {
                                        // Адаптер уже залогировал контекст (timed-обёртка в
                                        // main.ts; ядро не знает об этом — тут только
                                        // семантика: корзина недоступна → копия вместо
                                        // потери).
                                        console.warn(
                                                `[VaultSync] mirror-full: trash failed for "${entry.path}" ` +
                                                        `(${e instanceof Error ? e.message : String(e)}) — local will be saved as conflict copy`,
                                        );
                                }
                        }
                        if (trashedLocal) {
                                await this.deps.vault.writeBinary(entry.path, remoteData);
                                // Копии нет → conflictPath отсутствует (опционален
                                // с W1-T06): истинная судьба локали — trashedLocal.
                                return {
                                        kind: 'conflict',
                                        updateCache: true,
                                        mirror: 'full',
                                        trashedLocal: true,
                                };
                        }
                        // Fallback без trash-адаптера ИЛИ при отказе корзины: без
                        // корзины мы НЕ уничтожаем локаль молча (принцип №3
                        // «откат всегда возможен») — спасаем её конфликт-копией,
                        // как в fetch-keep-both, а remote кладём на место.
                        const now = this.deps.now?.() ?? Date.now();
                        const conflictPath = await this.buildConflictPath(entry.path, now);
                        await this.deps.vault.writeBinary(conflictPath, local);
                        await this.deps.vault.writeBinary(entry.path, remoteData);
                        return {
                                kind: 'conflict',
                                updateCache: true,
                                mirror: 'full',
                                trashedLocal: false,
                                conflictPath,
                        };
                }

                // fetch / mirror не подан: матрица §9.1 ДОСЛОВНО (регресс-гарантия
                // W1-T06 — семантика 2.3.3 не меняется ни на йоту).
                let choice: ConflictStrategy = this.strategy;
                if (this.strategy === 'ask') {
                        if (this.deps.ui) {
                                // Б-21: одна последовательная модалка, просто await.
                                const info: ConflictInfo = {
                                        path: entry.path,
                                        localSize: local.byteLength,
                                        remoteSize: remoteData.byteLength,
                                };
                                choice = await this.deps.ui.askConflict(info);
                        } else {
                                // UI не подан (headless/тесты) — безопасный фолбэк: обе версии.
                                choice = 'keep-both';
                        }
                }

                if (choice === 'local-wins') {
                        // Ничего не пишем; кэш НЕ обновляем — иначе потеряем
                        // повторную попытку загрузки (§9.3).
                        return { kind: 'skipped', updateCache: false };
                }
                if (choice === 'remote-wins') {
                        await this.deps.vault.writeBinary(entry.path, remoteData);
                        return { kind: 'written', updateCache: true };
                }

                // keep-both (дефолт; сюда же падает 'ask' без ui):
                // ОБЕ версии обязаны выжить (фикс Б-02).
                const now = this.deps.now?.() ?? Date.now();
                const conflictPath = await this.buildConflictPath(entry.path, now);
                // Сначала спасаем локаль в копию, ПОТОМ пишем remote в основной
                // файл: при обрыве между записями локальные правки не теряются.
                await this.deps.vault.writeBinary(conflictPath, local);
                await this.deps.vault.writeBinary(entry.path, remoteData);
                return { kind: 'conflict', updateCache: true, conflictPath };
        }

        /**
         * Свободное имя конфликт-копии — делегирует общему генератору
         * [overhaul S5] buildStampedPath (marker='conflict', проверка
         * коллизий — через exists порта vault).
         */
        private async buildConflictPath(path: string, now: number): Promise<string> {
                // [overhaul v4 / Этап 5 / F1] auto-cleanup: при достижении лимита
                // кандидатов (100 конфликт-копий для одного базового имени),
                // найти самую старую копию в каталоге и удалить её, освободив
                // слот. Без этого sync hard-fails при >100 копий; с auto-cleanup —
                // продолжает работать, сохраняя только последние 100 версий.
                return buildStampedPath(
                        path,
                        'conflict',
                        formatConflictTimestamp(now),
                        (p) => this.deps.vault.exists(p),
                        // listExisting: найти все .conflict-* файлы в каталоге,
                        // которые начинаются с того же baseName. Использует
                        // vault.list (опциональный в VaultAdapter) — если нет,
                        // auto-cleanup недоступен, и sync упадёт после 100 копий
                        // (прежнее поведение).
                        async (dir, baseName) => {
                                if (!this.deps.vault.list) return [];
                                try {
                                        const listed = await this.deps.vault.list(dir);
                                        return listed.files
                                                .filter((f) => f.includes('.conflict-') && f.startsWith(baseName))
                                                .map((f) => (dir ? `${dir}/${f}` : f));
                                } catch {
                                        return [];
                                }
                        },
                        // remove: удалить старую копию (через trash, если есть).
                        async (p) => {
                                if (this.deps.vault.trash) await this.deps.vault.trash(p);
                                else await this.deps.vault.remove(p);
                        },
                );
        }
}
