// src/core/queue.ts — очередь неудачных загрузок (фаза 3, задача 3-9).
// Порт addToFailedQueue/calculateBackoff из main.ts в тестируемое ядро
// с исправлением багов аудита Б-10:
//   (1) nextRetryAt вычислялся, но НИКОГДА не проверялся — «отложенный
//       повтор» не работал. Теперь takeDue(now) извлекает (и удаляет)
//       только дозревшие записи (nextRetryAt <= now);
//   (2) при retry старая очередь слепо заменялась бэкапом, затирая ошибки,
//       накопленные за время retry-сессии. Теперь mergeBack(items) СЛИВАЕТ
//       результаты: совпадающие path заменяются, отсутствующие добавляются,
//       записи, не затронутые retry-сессией, СОХРАНЯЮТСЯ;
//   (3) фильтр перед retry был no-op. Извлечение на retry — это takeDue
//       по факту дозревания, а не «снять всё подряд».
// calculateBackoff из main.ts возвращал Date.now() + задержку, смешивая
// длительность и абсолютный момент; здесь время передаётся явно (now),
// backoffMs — чистая функция длительности, nextRetryAt — абсолютный epoch-ms.
// Ядро не импортирует obsidian/node — только FailedFile из sources/types.

import type { FailedFile } from '../sources/types';

/** Параметры экспоненциального бэкоффа очереди. */
export interface FailedQueueOptions {
        /** Верхняя граница бэкоффа, мс. Default 30000. */
        maxBackoffMs?: number;
        /** База экспоненты, мс. Default 1000. */
        baseBackoffMs?: number;
        /** [overhaul S6 / D-4] Потолок ПОПЫТОК (retryCount) на один путь.
        *  Достигнув его, запись «паркуется» (poisoned): nextRetryAt =
        *  MAX_SAFE_INTEGER — takeDue/retryFailed её больше не извлекают,
        *  очередь перестаёт крутиться вечно. Реабилитация: самолечение
        *  queue.delete при удачной записи, Clear Queue, Force Resync.
        *  Default 10 — детерминированный сетевой сбой исчерпывает попытки
        *  за ~минуту бэкоффа (1+2+4+…до 30с), временные лечатся, стойкие
        *  честно паркуются с console.warn. */
        maxRetries?: number;
}

const DEFAULT_MAX_BACKOFF_MS = 30000;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_RETRIES = 10;

/**
 * Очередь неудачных загрузок с отложенным повтором.
 * Хранит не более одной записи на путь; порядок — порядок вставки.
 */
export class FailedQueue {
        private readonly maxBackoffMs: number;
        private readonly baseBackoffMs: number;
        private readonly maxRetries: number;
        /** path → запись. Map сохраняет порядок вставки ключей. */
        private readonly entries = new Map<string, FailedFile>();

        constructor(opts?: FailedQueueOptions) {
                this.maxBackoffMs = opts?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
                this.baseBackoffMs = opts?.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
                this.maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
        }

        /**
         * Добавить/обновить запись о неудачной загрузке.
         * Существующая (по path): reason/hash/size/timestamp обновляются,
         * retryCount++, nextRetryAt = now + backoffMs(retryCount).
         * Новая: retryCount=0, nextRetryAt=0 (доступна для retry немедленно).
         *
         * [overhaul S6 / D-4] Достигнув maxRetries, запись ПАРКУЕТСЯ:
         * poisoned=true, nextRetryAt=MAX_SAFE_INTEGER — вечная карусель
         * ретраев (детерминированный отказ: EEXIST-класс, битые креды,
         * отсутствующий файл) превращается в честный финал с console.warn.
         * Паркинг идемпотентен: повторные add() на parked-запись не растят
         * retryCount дальше потолка и не снимают паркинг.
         */
        add(f: { path: string; hash: string; size: number; originPath?:string }, reason: string, now: number, failureKind?:'transient'|'blocked',minimumDelayMs=0,issue?:import('../sources/types').SyncIssue): void {
                const existing = this.entries.get(f.path);
                if(failureKind){
                        const changed=existing?.hash!==f.hash;
                        const retryCount=Math.min((changed?-1:existing?.retryCount??-1)+1,this.maxRetries);
                        const poisoned=failureKind==='blocked'||retryCount>=this.maxRetries;
                        const delays=[60_000,300_000,900_000,3_600_000,21_600_000];
                        const delay=delays[Math.min(retryCount,delays.length-1)]*(1+Math.random()*0.2);
                        this.entries.set(f.path,{...f,reason,timestamp:now,retryCount,failureKind,issue,
                                nextRetryAt:poisoned?Number.MAX_SAFE_INTEGER:now+Math.max(Math.round(delay),Number.isFinite(minimumDelayMs)?Math.max(0,minimumDelayMs):0),
                                poisoned});
                        return;
                }

                if (existing) {
                        const capped = existing.poisoned === true || existing.retryCount >= this.maxRetries;
                        const retryCount = capped
                                ? existing.retryCount
                                : Math.min(existing.retryCount + 1, this.maxRetries);
                        const poisoned = capped || retryCount >= this.maxRetries;
                        this.entries.set(f.path, {
                                path: f.path,
                                hash: f.hash,
                                size: f.size,
                                reason,
                                timestamp: now,
                                retryCount,
                                nextRetryAt: poisoned ? Number.MAX_SAFE_INTEGER : now + this.backoffMs(retryCount),
                                ...(poisoned ? { poisoned: true } : {}),
                        });
                        if (poisoned && existing.poisoned !== true) {
                                console.warn(
                                        `[VaultSync] retry cap (${this.maxRetries}) reached for "${f.path}": ` +
                                                `${reason} — attempts parked; use targeted Retry after fixing the cause`,
                                );
                        }
                } else {
                        this.entries.set(f.path, {
                                path: f.path,
                                hash: f.hash,
                                size: f.size,
                                reason,
                                timestamp: now,
                                retryCount: 0,
                                nextRetryAt: 0,
                        });
                }
        }

        /**
         * Извлечь (удалив из очереди) записи, дозревшие для повтора
         * (nextRetryAt <= now). Порядок результата — порядок вставки.
         * Возвращает копии: состояние очереди не подменяется извне.
         *
         * [overhaul S6 / D-4] parked-записи НЕ извлекаются НИ ПРИ КАКОМ now
         * (включая Number.MAX_SAFE_INTEGER): эксклюзия явная, а не только
         * через «недозревший» nextRetryAt — защита от скачка часов и от
         * логики, берущей now=∞. Реабилитация — delete/clear/Force Resync.
         */
        takeDue(now: number): FailedFile[] {
                const due: FailedFile[] = [];
                for (const [path, entry] of this.entries) {
                        if (entry.nextRetryAt <= now && entry.poisoned !== true) {
                                due.push({ ...entry });
                                this.entries.delete(path);
                        }
                }
                return due;
        }

        /** Число записей в очереди. */
        /** [4-1] Полная очистка (кнопка Clear Queue в настройках). */
        clear(): void {
                this.entries.clear();
        }

        /** [4-2] Точечное удаление (retry-сессия убирает удавшиеся). */
        delete(path: string): void {
                this.entries.delete(path);
        }

        size(): number {
                return this.entries.size;
        }

        /** [overhaul S6 / D-4] Число «припаркованных» записей
         *  (достигнут потолок попыток, автоповторы прекращены). */
        poisonedCount(): number {
                let n = 0;
                for (const e of this.entries.values()) if (e.poisoned === true) n++;
                return n;
        }

        /** Снимок (глубокая копия записей) всех элементов очереди. */
        all(): FailedFile[] {
                return structuredClone([...this.entries.values()]);
        }

        /**
         * Слияние после retry-сессии (фикс Б-10): для совпадающих path элемент
         * items ЗАМЕНЯЕТ текущую запись; отсутствующие добавляются; текущие
         * записи, которых нет в items, СОХРАНЯЮТСЯ. Позиция заменяемой записи
         * в порядке очереди не меняется.
         */
        mergeBack(items: FailedFile[]): void {
                for (const item of items) {
                        this.entries.set(item.path, { ...item });
                }
        }

        /** Длительность бэкоффа: min(maxBackoffMs, base * 2^retryCount). */
        backoffMs(retryCount: number): number {
                return Math.min(this.maxBackoffMs, this.baseBackoffMs * Math.pow(2, retryCount));
        }
}
