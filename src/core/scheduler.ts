// ============================================================
// --- CORE/SCHEDULER (W4-T01) ---
// Авто-синхронизация: интервалы 15/30/60/120 мин, «только при
// запуске» и «выкл» (дефолт); стартовая задержка 30–60 с;
// пауза до перезапуска; «следующая через N мин»; авто-ретраи
// failed-очереди не чаще 1/час, уважая существующий backoff
// (FailedQueue.takeDue сам по себе уважает nextRetryAt —
// дополнительный гейт_SCHEDULER_RETRY_MIN_INTERVAL_MS страховки).
//
// Дизайн-принципы:
//   1. Чистое ядро — НЕТ импортов obsidian/node. Время — инъекция
//      через SchedulerDeps.now(); таймеры — через setInterval/
//      clearInterval (инъекция для fake-timers в тестах).
//   2. Идемпотентность: start/setInterval/reconfigure можно звать
//      в любом порядке; текущий таймер снимается перед новой
//      установкой (нет «осиротевших таймеров»).
//   3. Пауза — отдельный флаг; интервал остаётся в настройках,
//      но таймер снят. resume() рестартует с учётом времени,
//      оставшегося до следующего тика (или со стартовой задержкой,
//      если интервал ещё не наработал).
//   4. Триггер 'auto' отличим от 'retry' — coordinator (W4-T02)
//      использует headless-режим только для 'auto'.
//
// Контракт приёмки (план W4-T01):
//   - срабатывание по интервалу (fake-timers: ровно 1 вызов за N мин);
//   - задержка старта (первый тик через startDelayMs, не сразу);
//   - пауза (pause → 0 вызовов, resume → продолжение);
//   - backoff-уважение (retry-тик не вызывает trigger, когда
//     FailedQueue.takeDue пуст — то есть не пришло время повтора).
// ============================================================

import type { FailedQueue } from './queue';

/** Интервалы авто-синхронизации. */
export type SchedulerInterval =
        /** Дефолт: авто-выключено. */
        | 'off'
        /** Один прогон при запуске Obsidian, далее по требованию. */
        | 'startup-only'
        /** Каждые 15 минут. */
        | '15m'
        /** Каждые 30 минут. */
        | '30m'
        /** Каждый час. */
        | '1h'
        /** Каждые 2 часа. */
        | '2h';

/** Минут в интервале (для расчёта следующего тика). 0 для off/startup-only. */
const INTERVAL_MINUTES: Record<SchedulerInterval, number> = {
        'off': 0,
        'startup-only': 0,
        '15m': 15,
        '30m': 30,
        '1h': 60,
        '2h': 120,
};

/** Дефолтная стартовая задержка, мс (30 с — нижняя граница 30–60 с из плана). */
export const DEFAULT_START_DELAY_MS = 30_000;

/**
 * Минимальный интервал между авто-ретраями failed-очереди, мс (1 час
 * по плану W4-T01). Even though FailedQueue.takeDue уже уважает
 * nextRetryAt, этот гейт страхует от частых триггеров retry-сессий
 * на 15-мин авто-интервале (после каждого retry backoff снова растёт
 * — кап 30 с; 4 retry за час = 1+2+4+8 = 15 с от retry-волн, но
 * каждая новая retry-сессия видит более глубокий backoff).
 */
const RETRY_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Инъекция зависимостей: триггер сессии и retry, текущее время, таймеры.
 * Все колбэки — внешние; сам Scheduler не знает про Coordinator/main.
 *
 * ВАЖНО о setTimeout vs setInterval: setInterval(handler, ms) первым тиком
 * приходит через ms (а не сразу), поэтому первый (стартовый) тик Scheduler
 * ставит через setTimeout(handler, startDelayMs) — это даёт честную
 * семантику «первый авто-тик через 30 с, далее каждые N мин». После первого
 * тика включается периодический setInterval(handler, ms).
 */
export interface SchedulerDeps {
        /** Запустить авто-сессию (headless-режим см. W4-T02). */
        onAutoTick(): void | Promise<void>;
        /** Запустить retry-сессию дозревших записей (см. coordinator.retryFailed).
         *  Scheduler не лезет в очередь — лишь зовёт; если takeDue пуст,
         *  retryFailed сам скажет «nothing to retry». */
        onAutoRetry(): void | Promise<void>;
        /** Доступ к failed-очереди для гейта «есть ли дозревшие». */
        queue: FailedQueue;
        /** Текущее время, epoch-ms. Дефолт — Date.now. */
        now?(): number;
        /** setTimeout override (тесты — fake). Дефолт — глобальный. */
        setTimeout?(handler: () => void, ms: number): unknown;
        /** clearTimeout override (тесты — fake). Дефолт — глобальный. */
        clearTimeout?(timer: unknown): void;
        /** setInterval override (тесты — fake). Дефолт — глобальный. */
        setInterval?(handler: () => void, ms: number): unknown;
        /** clearInterval override (тесты — fake). Дефолт — глобальный. */
        clearInterval?(timer: unknown): void;
}

/** Состояние Scheduler для снапшота/отчётности (popover «следующая через N мин»). */
export interface SchedulerSnapshot {
        interval: SchedulerInterval;
        paused: boolean;
        /** epoch-ms следующего тика, или null если off / paused / startup-only-after-startup. */
        nextTickAt: number | null;
        /** Минут до следующего тика (округление вниз); null если нет следующего. */
        minutesUntilNext: number | null;
        /** Последний зафиксированный тик auto-сессии. */
        lastAutoTickAt: number | null;
        /** Последний зафиксированный retry-тик. */
        lastRetryAt: number | null;
}

/**
 * Планировщик авто-синхронизации. Один экземпляр владеет одним таймером;
 * переинициализация (start/setInterval) идемпотентно снимает прежний.
 */
export class Scheduler {
    private readonly deps: SchedulerDeps;
    private readonly now: () => number;
    private readonly _setTimeout: (handler: () => void, ms: number) => unknown;
    private readonly _clearTimeout: (timer: unknown) => void;
    private readonly _setInterval: (handler: () => void, ms: number) => unknown;
    private readonly _clearInterval: (timer: unknown) => void;

    private interval: SchedulerInterval = 'off';
    private paused = false;
    /** Активный таймер: либо setTimeout (до 1-го тика), либо setInterval
     *  (после 1-го тика в периодическом режиме). Для startup-only — setTimeout. */
    private timer: unknown = null;
    /** true если timer — это setInterval (нужно clearInterval вместо clearTimeout). */
    private timerIsInterval = false;
    private startDelayMs: number = DEFAULT_START_DELAY_MS;

    private nextTickAt: number | null = null;
    private lastAutoTickAt: number | null = null;
    private lastRetryAt: number | null = null;

    constructor(deps: SchedulerDeps) {
        this.deps = deps;
        this.now = deps.now ?? (() => Date.now());
        this._setTimeout = deps.setTimeout ?? ((h, ms) => setTimeout(h, ms));
        this._clearTimeout = deps.clearTimeout ?? ((t) => clearTimeout(t as any));
        this._setInterval = deps.setInterval ?? ((h, ms) => setInterval(h, ms));
        this._clearInterval = deps.clearInterval ?? ((t) => clearInterval(t as any));
    }

    /** Текущий интервал. */
    getInterval(): SchedulerInterval {
        return this.interval;
    }

    /** Пауза активна (до явного resume или restart). */
    isPaused(): boolean {
        return this.paused;
    }

    /**
     * Запустить планировщик с интервалом и стартовой задержкой.
     * Идемпотентен: повторный вызов снимает прежний таймер и ставит новый.
     * startDelayMs < 0 не передаёт первый задержанный тик — это мгновенный старт.
     */
    start(interval: SchedulerInterval, startDelayMs: number = DEFAULT_START_DELAY_MS): void {
        this.stopTimer();
        this.interval = interval;
        this.paused = false;
        this.startDelayMs = Math.max(0, startDelayMs);

        // off: нет таймера, нет следующего тика.
        if (interval === 'off') {
            this.nextTickAt = null;
            return;
        }

        // startup-only: один прогон через startDelayMs, затем стоп.
        // setTimeout (НЕ setInterval) — нам нужен ровно один тик.
        if (interval === 'startup-only') {
            this.nextTickAt = this.now() + this.startDelayMs;
            this.timer = this._setTimeout(() => {
                this.timer = null;
                this.timerIsInterval = false;
                this.nextTickAt = null;
                this.lastAutoTickAt = this.now();
                // [W4-T01] гейт retry активен и в startup-only: пользователь
                // вернулся, например, к неработающему vault — нужны дозревшие
                // ретраи.
                this.tickRetryGate();
                void this.deps.onAutoTick();
            }, this.startDelayMs);
            return;
        }

        // Периодический: первый тик через startDelayMs (setTimeout),
        // далее — каждые N мин (setInterval в handler первого тика).
        const ms = INTERVAL_MINUTES[interval] * 60_000;
        this.nextTickAt = this.now() + this.startDelayMs;
        this.timer = this._setTimeout(() => {
            // 1-й тик сработал — переключаемся на периодический режим.
            this.lastAutoTickAt = this.now();
            this.nextTickAt = this.now() + ms;
            this.tickRetryGate();
            void this.deps.onAutoTick();
            // Дальнейшие тики — каждые ms через setInterval.
            this.timer = this._setInterval(() => {
                this.lastAutoTickAt = this.now();
                this.nextTickAt = this.now() + ms;
                this.tickRetryGate();
                void this.deps.onAutoTick();
            }, ms);
            this.timerIsInterval = true;
        }, this.startDelayMs);
    }

    /**
     * Поставить на паузу «до перезапуска»: таймер снимается,
     * интервал остаётся в настройках, nextTickAt обнуляется.
     * resume() рестартует с полной стартовой задержкой (паритет
     * «новой сессии», без накопленного остатка — простота и
     * предсказуемость для пользователя «я вернусь через час, и тогда
     * первый авто-тик через 30 с после моего возврата»).
     */
    pause(): void {
        if (this.paused || this.interval === 'off') return;
        this.paused = true;
        this.stopTimer();
        this.nextTickAt = null;
    }

    /** Снять паузу: рестарт с тем же интервалом и стартовой задержкой. */
    resume(): void {
        if (!this.paused) return;
        this.paused = false;
        this.start(this.interval, this.startDelayMs);
    }

    /** Полная остановка (interval → off, таймер снят). */
    stop(): void {
        this.stopTimer();
        this.interval = 'off';
        this.paused = false;
        this.nextTickAt = null;
    }

    /** Горячая переконфигурация интервала (сохраняет paused-флаг). */
    setInterval(interval: SchedulerInterval, startDelayMs: number = DEFAULT_START_DELAY_MS): void {
        const wasPaused = this.paused;
        this.start(interval, startDelayMs);
        if (wasPaused && interval !== 'off') {
            this.paused = true;
            this.stopTimer();
            this.nextTickAt = null;
        }
    }

    /** Снимок состояния для popover/статус-бара. */
    snapshot(): SchedulerSnapshot {
        const now = this.now();
        let minutesUntilNext: number | null = null;
        if (this.nextTickAt !== null) {
            const deltaMs = Math.max(0, this.nextTickAt - now);
            minutesUntilNext = Math.floor(deltaMs / 60_000);
        }
        return {
            interval: this.interval,
            paused: this.paused,
            nextTickAt: this.nextTickAt,
            minutesUntilNext,
            lastAutoTickAt: this.lastAutoTickAt,
            lastRetryAt: this.lastRetryAt,
        };
    }

    // ── внутреннее ─

    private stopTimer(): void {
        if (this.timer !== null) {
            if (this.timerIsInterval) {
                this._clearInterval(this.timer);
            } else {
                this._clearTimeout(this.timer);
            }
            this.timer = null;
            this.timerIsInterval = false;
        }
    }

    /**
     * Гейт retry: зовётся на каждом авто-тике. Если очередь непуста И
     * последний retry был ≥ 1 часа назад (или его вообще не было) —
     * зовёт onAutoRetry. Иначе — пропускает (backoff уже растёт).
     *
     * Не лезет в очередь напрямую — лишь консультирует size(). Если
     * takeDue пуст, onAutoRetry (через coordinator.retryFailed) сам
     * сообщит «nothing to retry» — это не ошибка, а штатное поведение.
     */
    private tickRetryGate(): void {
        if (this.deps.queue.size() === 0) return;
        const now = this.now();
        const sinceLast = this.lastRetryAt === null ? Infinity : now - this.lastRetryAt;
        if (sinceLast < RETRY_MIN_INTERVAL_MS) return;
        this.lastRetryAt = now;
        void this.deps.onAutoRetry();
    }
}
