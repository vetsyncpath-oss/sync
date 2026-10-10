// src/core/journal.ts — журнал сессий синхронизации [W2-T08].
//
// Канон: решения Д7=1 («единый журнал на обе поверхности: popover-модалка
// просмотра + чипы Диагностики»), В6=3 (журнал — единый источник данных
// для статистики), implementation spec §7 (journal.ts, кольцо 50 сессий
// в configDir/vault-sync-journal.json).
//
// ЗАЧЕМ: в 2.3.3 вся «история» — totalSyncs/lastSyncTime в data.json;
// что происходило в последних сессиях (отмены, конфликты, зеркальные
// удаления по уровням) — нигде. Журнал пишет ЧЕСТНУЮ строку на каждую
// сессию: outcome передаёт caller (cancelled/error не приукрашиваются —
// прямая привязка к W1-T01 «честная отмена»), журнал сам ничего не решает.
//
// ЧИСТОТА: модуль ядра — без obsidian/node/DOM (инвариант §4
// CONVENTIONS.md). Весь I/O — тонкий порт JournalIo: main.ts подставит
// адаптер к configDir/vault-sync-journal.json. Формат даты — НЕ здесь:
// UI-слой (ui/journal-modal) получает injected formatTime.
//
// ФАЙЛ-ФОРМАТ: JSON-массив JournalEntry, новые сверху (index 0 =
// последняя сессия), кольцо ёмкостью JOURNAL_LIMIT. Поведение при
// повреждениях: load() НИКОГДА не бросает — битый JSON/не-массив/битые
// записи → [] (+ console.warn; журнал не должен ронять синхронизацию),
// следующая append() перезаписывает файл начисто (повреждённые данные
// всё равно нечитаемы). Ошибки ЗАПИСИ, напротив, пробегают наружу —
// caller решает (main обернёт try/catch: тихая потеря журнала
// недопустима, но и ронять sync из-за журнала нельзя).

import type { MirrorLevel } from './mirror';

/** Триггер сессии: чем она была вызвана (команда/авто/повтор/скан/форс). */
export type JournalTrigger = 'manual' | 'auto' | 'retry' | 'scan' | 'force';

/**
 * Исход сессии [W2-T08 / Д7=1]. Caller передаёт ЧЕСТНЫЙ результат:
 * 'ok' — завершилась; 'cancelled' — пользователь прервал (W1-T01:
 * отмена больше не репортится успехом); 'error' — с ошибками.
 * Журнал НЕ приукрашивает: ни одной ветки «cancel → считать ok».
 */
export type JournalOutcome = 'ok' | 'cancelled' | 'error';

/** Одна завершённая сессия синхронизации (сериализуется в JSON как есть). */
export interface JournalEntry {
        /** Начало сессии, epoch-ms (длительность отдельно — конец-начало). */
        startedAt: number;
        /** Длительность сессии, мс. */
        durationMs: number;
        /** Движок: deps.source.kind ('git' | 'yandex' | 'zip-url'). */
        engine: string;
        /** Уровень зеркала сессии (матрица §2.2). */
        mirrorLevel: MirrorLevel;
        trigger: JournalTrigger;
        outcome: JournalOutcome;
        downloaded: number;
        /** 0 если движок не различает new/updated (git различает, zip — нет). */
        updated: number;
        /** Зеркальные удаления: корзина по orphan (уровень light, §2.2). */
        deletedLight: number;
        /** Зеркальные удаления: local-only + лишние папки (уровень full). */
        deletedFull: number;
        /** Конфликтов, разрешённых перезаписью при full (Е1-а, W1-T06). */
        overwritten: number;
        conflicts: number;
        skipped: number;
        errors: number;
        deferredDeletions?: number;
        blockedDeletions?: number;
        /** Топ-3 частых ошибок сессии (см. topErrorsFrom); чистая сессия → []. */
        topErrors: Array<{ message: string; count: number }>;
}

/**
 * Тонкий IO-порт журнала [W2-T08]. main.ts адаптирует его к
 * configDir/vault-sync-journal.json (adapter.read/write):
 * read() → null означает «файла ещё нет» (первый запуск — норма, НЕ warn).
 */
export interface JournalIo {
        read(): Promise<string | null>;
        write(s: string): Promise<void>;
}

/** Контракт хранилища журнала (реализация — FileJournal; фэйки — в тестах). */
export interface JournalStore {
        /** Новые сверху: index 0 = последняя сессия. Никогда не бросает. */
        load(): Promise<JournalEntry[]>;
        /** Добавляет запись в голову кольца; ошибка записи ПРОБРАСЫВАЕТСЯ. */
        append(entry: JournalEntry): Promise<void>;
        clear(): Promise<void>;
}

/** Ёмкость кольца: сколько последних сессий храним (спека §7: 50). */
export const JOURNAL_LIMIT = 50;

/** Допустимые значения enum-полей при чтении (защита от битых файлов). */
const TRIGGERS: ReadonlySet<string> = new Set(['manual', 'auto', 'retry', 'scan', 'force']);
const OUTCOMES: ReadonlySet<string> = new Set(['ok', 'cancelled', 'error']);
const LEVELS: ReadonlySet<string> = new Set(['fetch', 'light', 'full']);

/**
 * Санитизация одной записи при чтении [W2-T08]: ядро (startedAt/
 * durationMs/engine/уровень/триггер/outcome) обязано быть валидным,
 * иначе запись отбрасывается; счётчики при пропусках добираются нулями.
 * Гарантия модалке: JournalEntry из load() всегда безопасна к рендеру.
 */
function coerceEntry(raw: unknown): JournalEntry | null {
        if (typeof raw !== 'object' || raw === null) return null;
        const r = raw as Record<string, unknown>;
        const fin = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
        if (!fin(r.startedAt) || !fin(r.durationMs)) return null;
        if (typeof r.engine !== 'string') return null;
        if (typeof r.mirrorLevel !== 'string' || !LEVELS.has(r.mirrorLevel)) return null;
        if (typeof r.trigger !== 'string' || !TRIGGERS.has(r.trigger)) return null;
        if (typeof r.outcome !== 'string' || !OUTCOMES.has(r.outcome)) return null;
        const num = (v: unknown): number => (fin(v) ? (v as number) : 0);
        const topErrors: Array<{ message: string; count: number }> = [];
        if (Array.isArray(r.topErrors)) {
                for (const e of r.topErrors) {
                        if (typeof e !== 'object' || e === null) continue;
                        const m = (e as Record<string, unknown>).message;
                        const c = (e as Record<string, unknown>).count;
                        if (typeof m === 'string' && fin(c)) topErrors.push({ message: m, count: c as number });
                }
        }
        return {
                startedAt: r.startedAt as number,
                durationMs: r.durationMs as number,
                engine: r.engine,
                mirrorLevel: r.mirrorLevel as MirrorLevel,
                trigger: r.trigger as JournalTrigger,
                outcome: r.outcome as JournalOutcome,
                downloaded: num(r.downloaded),
                updated: num(r.updated),
                deletedLight: num(r.deletedLight),
                deletedFull: num(r.deletedFull),
                overwritten: num(r.overwritten),
                conflicts: num(r.conflicts),
                skipped: num(r.skipped),
                errors: num(r.errors),
                deferredDeletions: num(r.deferredDeletions),
                blockedDeletions: num(r.blockedDeletions),
                topErrors,
        };
}

/**
 * Кольцевое JSON-хранилище журнала поверх injected IO-порта [W2-T08].
 *
 * Контракт ошибок (задокументирован для caller'а — main.ts):
 *  - load(): НЕ бросает никогда. Битый JSON / не-массив / IO-ошибка
 *    чтения → [] + console.warn («журнал не должен ронять синхронизацию»);
 *  - append()/clear(): ошибка ЗАПИСИ пробрасывается наружу — caller
 *    решает (main обернёт try/catch: молча глотать потерю журнала
 *    нельзя, но и ронять sync нельзя).
 */
export class FileJournal implements JournalStore {
        private readonly io: JournalIo;

        constructor(io: JournalIo) {
                this.io = io;
        }

        async load(): Promise<JournalEntry[]> {
                let raw: string | null;
                try {
                        raw = await this.io.read();
                } catch (e: unknown) {
                        console.warn('[VaultSync] journal: read failed, treating as empty', e);
                        return [];
                }
                // null = файла ещё нет (первый запуск) — норма, без warn.
                if (raw === null || raw === '') return [];
                let parsed: unknown;
                try {
                        parsed = JSON.parse(raw);
                } catch (e: unknown) {
                        console.warn('[VaultSync] journal: broken JSON, treating as empty', e);
                        return [];
                }
                if (!Array.isArray(parsed)) {
                        console.warn('[VaultSync] journal: unexpected format (not an array), treating as empty');
                        return [];
                }
                const entries = parsed.map(coerceEntry).filter((e): e is JournalEntry => e !== null);
                if (entries.length !== parsed.length) {
                        console.warn(`[VaultSync] journal: dropped ${parsed.length - entries.length} invalid entries`);
                }
                // Инвариант кольца держим и на чтении: файл мог быть написан
                // вручную или старой версией с большей ёмкостью — лишнее снизу.
                return entries.slice(0, JOURNAL_LIMIT);
        }

        async append(entry: JournalEntry): Promise<void> {
                // Битый файл → load() уже отработал warn'ом и вернул []: эта
                // запись «лечит» файл, перезаписывая его начисто.
                const prev = await this.load();
                const next = [entry, ...prev].slice(0, JOURNAL_LIMIT);
                // Ошибка записи ПРОБРАСЫВАЕТСЯ (см. контракт класса). Единственный
                // бросок журнала — намеренно: main решает, как реагировать.
                await this.io.write(JSON.stringify(next));
        }

        async clear(): Promise<void> {
                await this.io.write('[]');
        }
}

// ────────────────────────────────────────────────────────────────────────
// Чистые агрегаторы (чипы Диагностики, В6=3)
// ────────────────────────────────────────────────────────────────────────

/** Сводка журнала для чипов Диагностики [W2-T08 / В6=3]. */
export interface JournalSummary {
        /** Исход последней сессии; null — сессий ещё не было (UI: labels.never). */
        lastOutcome: JournalOutcome | null;
        /** startedAt последней сессии, epoch-ms; null — пусто (UI: labels.never). */
        lastTime: number | null;
        /** Всего записей в журнале (≤ JOURNAL_LIMIT — кольцо). */
        totalSessions: number;
        /** Суммарный счётчик errors сессий за окно 24h по startedAt. */
        errors24h: number;
        /** Суммарный счётчик conflicts сессий за окно 24h по startedAt. */
        conflicts24h: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Агрегатор журнала для чипов Диагностики [W2-T08 / В6=3]: последняя
 * сессия + суммы ошибок/конфликтов за окно 24h от `now`.
 *
 * @param entries как вернул load() (новые сверху); вход принят и
 *   несортированным — «последняя» = максимальный startedAt.
 * @param now точка отсчёта окна (инжектится для тестов; по умолчанию
 *   Date.now()). Граница окна включительно: startedAt >= now-24h.
 */
export function journalSummary(entries: JournalEntry[], now: number = Date.now()): JournalSummary {
        let lastOutcome: JournalOutcome | null = null;
        let lastTime: number | null = null;
        let errors24h = 0;
        let conflicts24h = 0;
        const since = now - DAY_MS;
        for (const e of entries) {
                if (lastTime === null || e.startedAt > lastTime) {
                        lastTime = e.startedAt;
                        lastOutcome = e.outcome;
                }
                if (e.startedAt >= since) {
                        errors24h += e.errors;
                        conflicts24h += e.conflicts;
                }
        }
        return { lastOutcome, lastTime, totalSessions: entries.length, errors24h, conflicts24h };
}

/** Нормализация сообщения ошибки: первые TOP_ERROR_MAX_LEN символов. */
export const TOP_ERROR_MAX_LEN = 120;

/**
 * Топ-3 частых ошибок сессии [W2-T08]: сообщения нормализуются усечением
 * до TOP_ERROR_MAX_LEN символов (разные хвосты одного класса ошибок —
 * один бакет), сортировка по убыванию счётчика, ничьи — в порядке
 * первого появления (устойчивый sort). Пустой вход → [].
 */
export function topErrorsFrom(messages: string[]): Array<{ message: string; count: number }> {
        const counts = new Map<string, number>();
        for (const raw of messages) {
                const msg = raw.slice(0, TOP_ERROR_MAX_LEN);
                counts.set(msg, (counts.get(msg) ?? 0) + 1);
        }
        return [...counts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([message, count]) => ({ message, count }));
}
