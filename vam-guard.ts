// vam-guard.ts — ВЕНДОРИМЫЙ файл для кастомных плагинов (VAM hook, протокол v4).
//
// КАК ПОДКЛЮЧИТЬ (один файл, ноль зависимостей):
//   1. Скопируйте этот файл в свой плагин (например, src/vam-guard.ts).
//   2. В onload() первого же init вызовите vamGuard() и не инициализируйте
//      плагин, пока гвард не «granted».
//   3. Подпишитесь на отзыв mid-session (onRevoked) — выключите свой плагин.
//   4. v0.5.8 (v3): «отключать себя полностью или урезать команды»:
//      onForbidden — политика запретила вас; onPermissionChange — вердикт
//      изменился; getAuthState()/isGranted() — прошла ли авторизация.
//   5. v0.5.10 (v4): isOwner() — отдельная точка экспозиции хозяина:
//      «мы в хранилище администратора». НЕ результат входа и не политика —
//      свойство машины. Для «команд администратора» вашего UI.
//
//   import { vamGuard } from './vam-guard';
//   async onload() {
//     this.vam = vamGuard({
//       pluginId: this.manifest.id,        // v0.5.5: менеджер «заметит» плагин
//       // любое изменение состояния в обе стороны (вход/отзыв/смена причины) —
//       // удобно для пересчёта UI и набора команд (v0.5.9)
//       onChange: (status, reason) => this.applyAvailability(),
//       // v3: вас запретили (старт или mid-session) → погасите себя целиком
//       onForbidden: () => {
//         void this.app.plugins.disablePlugin(this.manifest.id);
//       },
//       // v3: отзыв авторизации → команды, требующие входа, недоступны
//       onRevoked: (reason) => this.reregisterCommands(),
//     });
//     if (!this.vam.isGranted()) {
//       // авторизация не прошла: оставьте только ЛОКАЛЬНЫЕ команды (без канала)
//       this.registerLocalCommandsOnly();
//       return;
//     }
//     this.registerAllCommands();  // полный набор
//   }
//   onunload() { this.vam?.dispose(); }
//
// ПАТТЕРН «ПОЛНОСТЬЮ / ЧАСТЬЮ / ВСЁ» (v3): ДВЕ НЕЗАВИСИМЫЕ ОСИ —
//   • permission (ваша политика): forbidden → плагин полностью отключает себя
//     (onForbidden → disablePlugin); regulated/allowed → работаете дальше;
//   • auth (авторизация): granted → все команды; не granted → плагин САМ решает,
//     какие команды оставить (обычно — только не требующие авторизации).
//   Пересобирайте набор команд в onPermissionChange/onChange/onRevoked.
//
// СЕМАНТИКА (требование владельца VAM):
//   • granted  — доступ подтверждён (владелец либо вошедший пользователь);
//   • blocked  — доступ ограничен (kill/отзыв/срок/без пароля/не настроено);
//   • pending  — менеджер ещё не сказал слово (boot-гонка) — плагин инертен;
//   • МЕНЕДЖЕРА НЕТ (не установлен/удалён) → после таймаута blocked('vam-missing')
//     — fail-closed: без VAM кастомный плагин НЕ работает;
//   • менеджер ВЫГРУЖЕН в этой сессии → blocked('vam-unloaded') мгновенно.
//
// ЧЕСТНО (readme-рельс): гвард — кооперативный механизм для СВОИХ кастомных
// плагинов. Враждебный плагин просто не вызовет его; для чужих плагинов
// VAM запирает штатными слоями (disable + community-plugins.json).
//
// Файл автономен: не импортирует ничего из VAM — живёт в бандле вашего плагина.

export type VamGateStatus = 'granted' | 'blocked' | 'pending';

/** Машинные коды причин (локализуйте у себя): 'kill-switch' | 'revoked' |
 *  'expired' | 'ttl' | 'wrong-password' | 'key-mismatch' | 'no-password' |
 *  'unconfigured' | 'awaiting-approval' | 'channel-error' | 'vam-missing' |
 *  'vam-unloaded' | null. */
export type VamGateReason = string | null;

interface VamGuardOptions {
        /** v0.5.5: id вашего плагина (this.manifest.id) — гвард зарегистрируется
         *  в реестре менеджера: хозяин увидит в настройках, что плагин с hook
         *  замечен. Блокировка по-прежнему на стороне вашего гварда. */
        pluginId?: string;
        /** Сколько ждать менеджера, загрузившегося ПОЗЖЕ нас (boot-гонка).
         *  Default 15000 мс; 0 = не ждать вовсе (менеджера нет → сразу blocked). */
        timeoutMs?: number;
        /** Каденс опроса появления менеджера (default 1000 мс). */
        pollMs?: number;
        /** Вызывается при переходе в blocked (в т.ч. стартовом). */
        onBlocked?: (reason: VamGateReason) => void;
        /** Вызывается ТОЛЬКО при отзыве после granted (mid-session). */
        onRevoked?: (reason: VamGateReason) => void;
        /** v0.5.9: вызывается при КАЖДОМ изменении состояния в обе стороны
         *  (status или reason). Если менеджер уже стоит при создании гварда —
         *  первое событие приедет немедленно (adopt); стартовое 'pending'
         *  событием не считается. Удобная точка для пересчёта UI/доступности
         *  команд — симметрична для входа и отзыва. */
        onChange?: (status: VamGateStatus, reason: VamGateReason) => void;
        /** v3 (v0.5.8): политика менеджера запретила ЭТОТ плагин (при появлении
         *  моста, если уже запрещён, и при mid-session-запрещении). Плагин должен
         *  полностью отключить себя (disablePlugin). Мосты протокола v2 события
         *  не дают — гвард просто молчит (деградация без ошибок). */
        onForbidden?: (info: VamPermissionInfo) => void;
        /** v3 (v0.5.8): вердикт политики для ЭТОГО плагина изменился
         *  (allowed/regulated/forbidden). Приготовьтесь пересобрать набор команд
         *  или погасить себя. */
        onPermissionChange?: (permission: VamPermissionAction, info: VamPermissionInfo) => void;
}

/** v3: разрешение конкретного плагина (permission-ось). */
export type VamPermissionAction = 'allowed' | 'regulated' | 'forbidden';

export interface VamPermissionInfo {
        /** Какой файл дал вердикт: 'channel' (политика канала) | 'builtin' |
         *  'none' (нет политики / мост v2). */
        source: string;
        /** Пометка хозяина из записи политики (если есть). */
        note: string | null;
}

/** v3: состояние авторизации (auth-ось), как его видит менеджер. */
export interface VamAuthInfo {
        role: 'owner' | 'user' | 'unconfigured' | 'unknown';
        /** true ⇔ авторизация прошла (машина хозяина или вошедший пользователь). */
        authenticated: boolean;
        gate: VamGateStatus;
        reason: VamGateReason;
        managerVersion: string;
}

export interface VamGate {
        readonly status: VamGateStatus;
        readonly reason: VamGateReason;
        /** true ⇔ доступ подтверждён сейчас. */
        isGranted(): boolean;
        /** v4 (v0.5.10): true ⇔ мы в хранилище администратора (машина хозяина).
         *  Отдельная точка экспозиции — НЕ результат входа: пользовательский
         *  vault с правами даёт isGranted() true, но isOwner() false. До слова
         *  менеджера (pending, мост v2/v3 без метода) — false (fail-closed).
         *  Выгрузка менеджера ответ сохраняет — чья машина, не меняется. */
        isOwner(): boolean;
        /** Подписка на изменения статуса; отписка — возврат. */
        onChange(cb: (status: VamGateStatus, reason: VamGateReason) => void): () => void;
        /** v3: разрешение ЭТОГО плагина (permission-ось); null — мост протокола
         *  v2 (метода нет): опирайтесь на гейт, как раньше. */
        getPermission(): { permission: VamPermissionAction } & VamPermissionInfo | null;
        /** v3: состояние авторизации (auth-ось); null — мост v2. */
        getAuthState(): VamAuthInfo | null;
        /** Остановить опрос/отписаться (зовите из onunload своего плагина). */
        dispose(): void;
}

interface VamPublicApi {
        version: string;
        getStatus(): VamGateStatus;
        getReason(): VamGateReason;
    subscribe(cb: (status: VamGateStatus, reason: VamGateReason) => void): () => void;
    /** v2 (v0.5.5): опционально у гвардов v1 — presence-регистрация. */
    register?(pluginId: string): void;
    /** v3 (v0.5.8): опционально — состояние авторизации и пер-плагинная политика. */
    getAuthState?(): VamAuthInfo;
    getPermission?(pluginId: string): { permission: VamPermissionAction } & VamPermissionInfo;
    subscribeAuth?(cb: (auth: VamAuthInfo) => void): () => void;
    /** v4 (v0.5.10): опционально — «это хранилище администратора». */
    isOwner?(): boolean;
}

interface VamGlobalHost {
        __VAM__?: VamPublicApi;
        __VAM_PENDING__?: Array<(status: VamGateStatus, reason: VamGateReason) => void>;
}

function host(): VamGlobalHost {
        return globalThis as unknown as VamGlobalHost;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 1_000;

/**
 * Создать гвард. Статус считается сразу (см. VamGateStatus); опрос появления
 * менеджера идёт до timeoutMs, после чего — fail-closed blocked('vam-missing').
 */
export function vamGuard(options: VamGuardOptions = {}): VamGate {
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
        const onBlocked = options.onBlocked;
        const onRevoked = options.onRevoked;
        const onStateChange = options.onChange;

        const listeners = new Set<(status: VamGateStatus, reason: VamGateReason) => void>();
        let status: VamGateStatus = 'pending';
        let reason: VamGateReason = null;
        let unsub: (() => void) | null = null;
        let unsubAuth: (() => void) | null = null;
        // v4: живая ссылка на мост — isOwner() читает отдельную точку напрямую
        let currentApi: VamPublicApi | null = null;
        let timer: ReturnType<typeof setInterval> | null = null;
        let startedAt = Date.now();
        let wasGranted = false;
        let disposed = false;
        // v3: последняя известная auth-ось и вердикт политики для НАШЕГО id
        let authInfo: VamAuthInfo | null = null;
        let permission: ({ permission: VamPermissionAction } & VamPermissionInfo) | null = null;
        let wasForbidden = false;
        let onForbidden = options.onForbidden;
        let onPermissionChange = options.onPermissionChange;

        const emit = (next: VamGateStatus, nextReason: VamGateReason): void => {
                if (disposed) return;
                const revoked = wasGranted && next === 'blocked';
                const becameBlocked = status !== 'blocked' && next === 'blocked';
                const changed = status !== next || reason !== nextReason;
                status = next;
                reason = nextReason;
                if (next === 'granted') wasGranted = true;
                if (changed) {
                        try { onStateChange?.(status, reason); } catch { /* потребитель */ }
                }
                for (const cb of [...listeners]) {
                        try {
                                cb(status, reason);
                        } catch {
                                // чужой слушатель не должен ронять гвард
                        }
                }
                if (becameBlocked) {
                        try { onBlocked?.(reason ?? null); } catch { /* потребитель */ }
                }
                if (revoked) {
                        try { onRevoked?.(reason ?? null); } catch { /* потребитель */ }
                }
        };

        const adopt = (api: VamPublicApi): void => {
                stopPoll();
                currentApi = api;
                // v0.5.5: заявляем о себе менеджеру (реестр замеченных hook-плагинов
                // в настройках). Опционально: старый мост (протокол v1) метода не
                // имеет — молча пропускаем; на блокировку это не влияет.
                if (options.pluginId) {
                        try { api.register?.(options.pluginId); } catch { /* регистрация не критична */ }
                }
                unsub = api.subscribe((s, r) => emit(s, r));
                // v3: подписка на auth-ось + пер-плагинный вердикт (мост v2 метода
                // не имеет — деградируем молча: гейт работает как раньше).
                if (typeof api.subscribeAuth === 'function') {
                        unsubAuth = api.subscribeAuth((a) => syncAuth(api, a));
                }
                // subscribe сразу дёргает колбэк с текущим состоянием → emit уже
                // прошёл; но на случай молчаливой подписки — синхронизируем явно:
                emit(api.getStatus(), api.getReason());
                // v3: первичная сверка политики — если нас УЖЕ запретили, onForbidden
                // стреляет здесь (плагин ещё не успел ничего включить лишнего)
                resyncPermission(api);
        };

        /** v3: событие auth-оси — обновляем authInfo и сверяем политику
         *  (подпись изменилась → вердикт мог перевернуться). */
        const syncAuth = (api: VamPublicApi, a: VamAuthInfo): void => {
                if (disposed) return;
                authInfo = a;
                resyncPermission(api);
        };

        /** v3: перечитать вердикт для нашего pluginId; при изменении — события. */
        const resyncPermission = (api: VamPublicApi): void => {
                if (disposed) return;
                if (typeof api.getPermission !== 'function') return; // мост v2
                if (!options.pluginId) return;                         // id не заявлен
                let next: ({ permission: VamPermissionAction } & VamPermissionInfo) | null;
                try {
                        next = api.getPermission(options.pluginId) ?? null;
                } catch {
                        return; // сломанный мост: гейт-ось всё равно скажет своё
                }
                const changed =
                        (permission === null) !== (next === null) ||
                        (permission !== null && next !== null &&
                                (permission.permission !== next.permission || permission.source !== next.source || permission.note !== next.note));
                permission = next;
                if (!changed || next === null) return;
                if (typeof api.getAuthState === 'function') {
                        try { authInfo = api.getAuthState(); } catch { /* не критично */ }
                }
                try { onPermissionChange?.(next.permission, { source: next.source, note: next.note }); } catch { /* потребитель */ }
                if (next.permission === 'forbidden' && !wasForbidden) {
                        wasForbidden = true;
                        try { onForbidden?.({ source: next.source, note: next.note }); } catch { /* потребитель */ }
                } else if (next.permission !== 'forbidden') {
                        wasForbidden = false;
                }
        };

        const stopPoll = (): void => {
                if (timer !== null) {
                        clearInterval(timer);
                        timer = null;
                }
        };

        const checkForManager = (): void => {
                if (disposed) return;
                const api = host().__VAM__;
                if (api && typeof api.subscribe === 'function') {
                        adopt(api);
                        return;
                }
                // менеджера всё ещё нет; таймаут → fail-closed
                if (timeoutMs > 0 && Date.now() - startedAt >= timeoutMs) {
                        stopPoll();
                        emit('blocked', 'vam-missing');
                }
        };

        const api = host().__VAM__;
        if (api && typeof api.subscribe === 'function') {
                adopt(api); // менеджер уже стоит (обычный порядок)
        } else {
                // boot-гонка: менеджер грузится позже — регистрируемся в очередь
                // (мост дренирует при установке) + дублируем опросом (надёжность)
                const h = host();
                if (typeof h.__VAM_PENDING__ === 'undefined' || !Array.isArray(h.__VAM_PENDING__)) {
                        h.__VAM_PENDING__ = [];
                }
                h.__VAM_PENDING__!.push((s, r) => {
                        if (status === 'pending') {
                                const fresh = host().__VAM__;
                                if (fresh && typeof fresh.subscribe === 'function') adopt(fresh);
                                else emit(s, r); // мост ещё не выставлен, но слово уже есть
                        }
                });
                if (pollMs > 0) {
                        timer = setInterval(() => checkForManager(), pollMs);
                } else if (timeoutMs === 0) {
                    emit('blocked', 'vam-missing');
                }
                if (timeoutMs === 0) emit('blocked', 'vam-missing');
        }

        return {
                get status(): VamGateStatus { return status; },
                get reason(): VamGateReason { return reason; },
                isGranted(): boolean { return status === 'granted'; },
                // v4: точка хозяина — живой запрос к мосту (если умеет), иначе
                // вывод из auth-оси; до слова менеджера — false (fail-closed)
                isOwner(): boolean {
                        const api = currentApi;
                        if (api !== null && typeof api.isOwner === 'function') {
                                try { return api.isOwner() === true; } catch { return false; }
                        }
                        return authInfo !== null && authInfo.role === 'owner';
                },
                // v3: permission-ось (наш pluginId; кэш обновляют события моста)
                getPermission(): ({ permission: VamPermissionAction } & VamPermissionInfo) | null {
                        return permission === null ? null : { ...permission };
                },
                // v3: auth-ось (последнее слово менеджера; null — мост v2)
                getAuthState(): VamAuthInfo | null {
                        return authInfo === null ? null : { ...authInfo };
                },
                onChange(cb): () => void {
                        listeners.add(cb);
                        try {
                                cb(status, reason);
                        } catch {
                                // немедленный вызов с текущим состоянием
                        }
                        return () => {
                                listeners.delete(cb);
                        };
                },
                dispose(): void {
                        disposed = true;
                        stopPoll();
                        try { unsub?.(); } catch { /* мост уже ушёл */ }
                        try { unsubAuth?.(); } catch { /* см. выше */ }
                        unsub = null;
                        unsubAuth = null;
                        currentApi = null;
                        listeners.clear();
                },
        };
}
