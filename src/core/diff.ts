// DiffEngine — сравнение кэша манифеста с текущим манифестом источника
// (фаза 3, задача 3-4; дизайн §8.2, аудит Б-09).
//
// ФИКС Б-09: в старом syncFromGit обнаружение удалений и чистка кэша шли
// ДВУМЯ проходами по одному множеству с РАЗНОЙ фильтрацией — после смены
// фильтров папок записи SHA выпадали из кэша, и следующая синхронизация
// молча перезаписывала локально изменённые файлы. Здесь ОДИН проход по
// кэшу с ЕДИНОЙ фильтрацией isAllowed: ключ, не прошедший политику,
// попадает ТОЛЬКО в cacheCleanup и никогда в toDelete/orphans.
//
// Нюанс: пути remote-записей добавляются в remotePaths ДО фильтра
// isAllowed — поэтому кэш-ключ файла, который ещё есть в источнике, но
// стал не-allowed, НЕ считается «удалённым» и не чистится: смена политики
// не должна трогать кэш файлов, присутствующих в источнике.
//
// Чистая функция: без наблюдаемых событий/стримов, только opts-коллбэки.
// Ядро core/ не импортирует obsidian/node (решение В5-1) — только
// type-only импорт замороженных контрактов из sources/types.

import type { CacheEntries, DiffOptions, DiffResult, RemoteEntry } from '../sources/types';
import { pMap } from '../utils/concurrency';

/**
 * Сравнить кэш последнего применённого состояния с манифестом источника.
 *
 * Классификация remote-записей (в порядке проверки):
 * - не-allowed                → полностью игнорируется;
 * - нет в кэше                → NEW (download);
 * - смена алгоритма хэша      → download (полный resync записи);
 * - хэш отличается            → MODIFIED (download);
 * - локальный файл отсутствует → MISSING_LOCAL (download);
 * - иначе                     → UP_TO_DATE.
 *
 * Классификация ключей кэша, отсутствующих в remotePaths:
 * - в cacheCleanup всегда (чистка кэша);
 * - allowed + deleteMissing   → toDelete;
 * - allowed + !deleteMissing  → orphans;
 * - не-allowed                → только cacheCleanup (фикс Б-09).
 */
export async function diff(
        cache: CacheEntries,
        remote: RemoteEntry[],
        opts: DiffOptions
): Promise<DiffResult> {
        const toDownload: RemoteEntry[] = [];
        const toDelete: string[] = [];
        const orphans: string[] = [];
        const cacheCleanup: string[] = [];
        let upToDate = 0;

        // Пути источника. Добавляются ДО фильтра isAllowed: кэш-ключ
        // не-allowed файла, ещё присутствующего в источнике, не должен
        // попасть в cleanup/удаления.
        const remotePaths = new Set<string>();

        // [overhaul S3/M-2] exists-проверки — ДВА прохода: сначала чистая
        // классификация без IO (хэш-совпадения копятся в needsExists), затем
        // pMap(8) по адаптеру — последовательный await на КАЖДОЙ up-to-date
        // записи превращал фазу диффа большого vault без изменений в десятки
        // тысяч последовательных round-trips (чистая латентность адаптера —
        // сеть уже ни при чём, манифест получен). Паритет с collectMissing
        // (там — pMap(8)). Ошибка exists пробрасывается первой — прежняя
        // семантика «дифф валится» сохранена.
        const needsExists: RemoteEntry[] = [];
        for (const r of remote) {
                remotePaths.add(r.path);
                if (!opts.isAllowed(r.path)) {
                        continue; // полностью игнорируем
                }
                const c = cache[r.path];
                if (!c) {
                        toDownload.push(r); // NEW
                } else if (c.alg !== r.hashAlg) {
                        // Смена алгоритма = хэши несравнимы → полный resync записи.
                        toDownload.push(r);
                } else if (c.h !== r.hash) {
                        toDownload.push(r); // MODIFIED
                } else {
                        needsExists.push(r); // хэш совпал — есть ли файл локально?
                }
        }
        const existsFlags: Array<boolean | Error> = await pMap(
                needsExists,
                async (r) => opts.exists(r.path),
                8,
        );
        for (let i = 0; i < needsExists.length; i++) {
                const flag = existsFlags[i]!;
                if (flag instanceof Error) throw flag;
                if (!flag) {
                        toDownload.push(needsExists[i]!); // MISSING_LOCAL
                } else {
                        upToDate++;
                }
        }

        // ЕДИНЫЙ проход по кэшу (фикс Б-09): одна фильтрация и для
        // обнаружения удалений, и для чистки кэша.
        for (const path of Object.keys(cache)) {
                if (remotePaths.has(path)) {
                        continue; // файл ещё есть в источнике
                }
                cacheCleanup.push(path);
                if (opts.isAllowed(path)) {
                        if (opts.deleteMissing) {
                                toDelete.push(path);
                        } else {
                                orphans.push(path);
                        }
                }
        }

        return { toDownload, toDelete, orphans, cacheCleanup, upToDate };
}
