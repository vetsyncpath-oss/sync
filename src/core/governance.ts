// src/core/governance.ts — fail-closed state machine для контроля
// стороннего менеджера аутентификации (Е4=2, Д14, §6 спеки).
//
// Проблема волны W5 (спека §6): менеджер-плагин (будущий «владелец auth»)
// будет разрабатываться позже, но его «место» в синк-плагине должно
// существовать с 3.0 — иначе потом это будет ретрофит с переделкой guards.
//
// Контракт:
//   • 'none'    — менеджер никогда не работал (managerEverActive=false) → синк свободен.
//   • 'ok'      — менеджер обнаружен И аутентификация подтверждена → синк свободен.
//   • 'blocked' — fail-closed: менеджер когда-то требовал пароль (managerEverActive=true),
//                 а сейчас отсутствует/выключен/пароль не совпал → синк запрещён с внятным отказом.
//   • 'checking' — переходный статус во время probe (крюк для UI).
//
// Стабильность данных: только `managerEverActive` персистируется в data.json
// (boolean). Остальные поля — runtime-only, пересчитываются на старте сессии
// и при событиях менеджера. Это гарантирует, что fail-closed остаётся
// «навсегда» между запусками Obsidian, но детали (последняя причина/время)
// не протекают в storage.
//
// Чистый модуль: state-in, state-out функции, без зависимостей от obsidian/node —
// тестируется напрямую (CONVENTIONS §4.1: src/core/** чист).

/**
 * Статус governance-контура.
 *
 * Порядок переходов (главный инвариант — fail-closed):
 *   none → ok          : менеджер появился и аутентифицирован
 *   none → none        : менеджер всё ещё отсутствует (idempotent)
 *   ok  → ok           : повторный probe с тем же успехом (idempotent)
 *   ok  → blocked      : менеджер исчез ИЛИ пароль перестал совпадать
 *   blocked → ok       : менеджер вернулся с корректным паролем
 *   blocked → blocked  : менеджер всё ещё отсутствует (idempotent, fail-closed)
 *   * → none           : только ручной сброс (resetGovernance, A4)
 */
export type GovernanceStatus = 'none' | 'ok' | 'blocked' | 'checking';

/**
 * Полное состояние контура. State-in/state-out: функции ниже возвращают
 * НОВОЕ состояние, не мутируют текущее — упрощает тестирование и
 * гарантирует идемпотентность подписчиков hook'а (W5-T02).
 */
export interface GovernanceState {
        /** Поставился ли когда-либо флаг менеджера. Персистируется. */
        managerEverActive: boolean;
        /** Текущий статус — runtime-only. */
        status: GovernanceStatus;
        /** Когда последний раз делали probe (ms epoch) — для popover/диагностики.
         *  null означает «probe ни разу не шёл». */
        lastCheckedAt: number | null;
        /** Причина блокировки — для Notice пользователю. null для не-blocked статусов. */
        lastBlockedReason: string | null;
}

/**
 * Результат probe менеджера. Сторона менеджера (future window.vaultSyncAuth)
 * возвращает одну из трёх веток; sync-плагин сводит их к GovernanceState.
 *
 *   present:true  + authOk:true   → менеджер жив, пароль совпал
 *   present:true  + authOk:false  → менеджер жив, но пароль НЕ совпал → fail-closed
 *   present:false                  → менеджер отсутствует/выключен (reason — описание)
 */
export type ManagerProbe =
        | { present: true; authOk: true }
        | { present: true; authOk: false; reason: string }
        | { present: false; reason: string };

/**
 * Стартовое состояние. На старте Obsidian sync-плагин НИЧЕГО не знает про
 * менеджера: он не делал probe. Поэтому:
 *   • managerEverActive=false → status='none' (свободен)
 *   • managerEverActive=true  → status='blocked' (fail-closed до первого probe,
 *     который либо разблокирует, либо подтвердит блокировку)
 *
 * Эта семантика — критична: пользователь закрыл Obsidian с активным менеджером,
 * потом удалил менеджер-плагин. При следующем старте sync-плагин сразу видит
 * 'blocked' (а не 'none'), и синк не пойдёт, даже если авто-синк сработает
 * раньше ручного probe.
 */
export function initGovernance(managerEverActive: boolean = false): GovernanceState {
        return {
                managerEverActive,
                status: managerEverActive ? 'blocked' : 'none',
                lastCheckedAt: null,
                lastBlockedReason: managerEverActive
                        ? 'Manager was active earlier — fail-closed until probe or manual reset'
                        : null,
        };
}

/**
 * Применить результат probe менеджера — обновить состояние.
 *
 * Главный fail-closed инвариант: как только менеджер когда-либо требовал
 * пароля (managerEverActive=true), он остаётся true навсегда — даже если
 * менеджер позже исчез. Только resetGovernance может опустить флаг.
 *
 * Это гарантирует, что цепочка «пользовался менеджером → случайно удалил»
 * НЕ приведёт к тихому разрешению синка без менеджера.
 */
export function probeManager(
        state: GovernanceState,
        probe: ManagerProbe,
        now: number,
): GovernanceState {
        if (probe.present && probe.authOk) {
                // Менеджер жив и аутентифицирован. Поднимаем флаг (если ещё не поднят)
                // и разблокируем. lastBlockedReason чистится — Notice больше не нужен.
                return {
                        managerEverActive: true,
                        status: 'ok',
                        lastCheckedAt: now,
                        lastBlockedReason: null,
                };
        }
        if (probe.present && !probe.authOk) {
                // Менеджер жив, но пароль не совпал — это явная блокировка.
                // Флаг поднимается (менеджер точно «когда-либо требовал пароль»).
                return {
                        managerEverActive: true,
                        status: 'blocked',
                        lastCheckedAt: now,
                        lastBlockedReason: probe.reason,
                };
        }
        // probe.present === false — менеджер не обнаружен.
        if (state.managerEverActive) {
                // Был менеджер, исчез → fail-closed навсегда (до ручного сброса).
                return {
                        managerEverActive: true,
                        status: 'blocked',
                        lastCheckedAt: now,
                        lastBlockedReason: probe.reason,
                };
        }
        // Никогда не было менеджера — синк остаётся свободным.
        // Это нормально: пользователь не обязан пользоваться менеджером.
        return {
                managerEverActive: false,
                status: 'none',
                lastCheckedAt: now,
                lastBlockedReason: null,
        };
}

/**
 * Ручной сброс (A4). Владелец устройства явно подтверждает, что менеджер
 * больше не нужен. Сбрасывает И персистентный флаг, И runtime-статус.
 *
 * ВАЖНО: сброс НЕ должен быть автоматическим — иначе любое повреждение
 * data.json или «временное отсутствие» менеджера (например, плагин
 * отключили на период обновления) откроет синк без пароля. Только осознанный
 * акт пользователя через Диагностику.
 */
export function resetGovernance(): GovernanceState {
        return {
                managerEverActive: false,
                status: 'none',
                lastCheckedAt: null,
                lastBlockedReason: null,
        };
}

/**
 * Синк разрешён? Главный guard в runSession.
 *
 * 'blocked' — единственный запрещающий статус. 'checking' НЕ блокирует:
 * он выставляется переходно, и синк идёт с уже подтверждённым предыдущим
 * 'ok' или 'none' (fail-closed контролируется только 'blocked').
 */
export function isSyncAllowed(state: GovernanceState): boolean {
        return state.status !== 'blocked';
}

/**
 * Причина блокировки для Notice. null для всех не-blocked статусов.
 *
 * Это — «внятный отказ» (требование плана W5-T01 приёмка): пользователь
 * видит, ПОЧЕМУ синк запрещён, а не «unknown error».
 */
export function blockReason(state: GovernanceState): string | null {
        return state.status === 'blocked' ? state.lastBlockedReason : null;
}

/**
 * Снимок состояния для hook'а window.vaultSync (W5-T02) и popover/Диагностики.
 * Возвращает только публичные поля — без внутреннего устройства.
 */
export interface GovernanceSnapshot {
        status: GovernanceStatus;
        managerEverActive: boolean;
        lastCheckedAt: number | null;
        lastBlockedReason: string | null;
}

export function snapshotGovernance(state: GovernanceState): GovernanceSnapshot {
        return {
                status: state.status,
                managerEverActive: state.managerEverActive,
                lastCheckedAt: state.lastCheckedAt,
                lastBlockedReason: state.lastBlockedReason,
        };
}

// ────────────────────────────────────────────────────────────────────────
// [P2 / manager-build-spec §3.5] beforeSession — вызов менеджера ДО guard
// ────────────────────────────────────────────────────────────────────────

/**
 * Минимальный контракт менеджера, нужный синк-плагину: опциональный
 * beforeSession(). Полный контракт window.vaultSyncAuth v1 (getState/
 * onChanged/prompt/beforeSession) живёт на стороне менеджера — см.
 * vault-sync-manager-build-spec.md §7.6; синк-плагину достаточно этого
 * среза (structural typing, без зависимости на менеджерские типы).
 */
export interface VaultSyncAuthLike {
        beforeSession?(): Promise<void>;
}

/**
 * [P2 / manager-build-spec §3.5] Дождаться менеджера аутентификации перед
 * guard-решением сессии. Менеджер внутри делает pull credentials-канала и
 * сам применяет вердикт через applyManagerProbe — к моменту возврата
 * this.governance свежий. Контракт:
 *
 *   • vaultSyncAuth отсутствует / beforeSession не функция → мгновенный
 *     возврат (старые менеджеры и их отсутствие не меняют поведение);
 *   • beforeSession reject-ится → ошибка проглатывается: вердикт остаётся
 *     прежним (fail-closed НЕ ослабляется — blocked им и остаётся);
 *   • beforeSession завис → таймаут timeoutMs, вердикт прежний.
 *
 * Таймер чистится в finally: быстрый resolve не оставляет висящий
 * 10-секундный таймер в event loop (важно для vitest и мобильного рантайма).
 *
 * Чистая функция (никаких зависимостей от obsidian/node — только
 * глобальные Promise/setTimeout), тестируется напрямую с fake timers.
 */
export async function awaitBeforeSession(
        authApi: unknown,
        timeoutMs: number,
): Promise<void> {
        if (authApi === null || typeof authApi !== 'object') return;
        const beforeSession = (authApi as Partial<VaultSyncAuthLike>).beforeSession;
        if (typeof beforeSession !== 'function') return;

        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
                await Promise.race([
                        Promise.resolve(beforeSession.call(authApi)).catch(() => {
                                // Ошибка pull-цикла менеджера — не наша проблема:
                                // вердикт остаётся прежним (см. контракт выше).
                        }),
                        new Promise<void>((resolve) => {
                                timer = setTimeout(resolve, timeoutMs);
                        }),
                ]);
        } finally {
                if (timer !== undefined) clearTimeout(timer);
        }
}
