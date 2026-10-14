// src/core/vault-sync-hook.ts — read-only publish/subscribe реестр для
// глобального объекта `window.vaultSync` (W5-T02, Д15, Е7=3).
//
// Контракт: сторонний (или кастомный пользовательский) плагин подписывается
// на изменения состояния синка через `window.vaultSync.onChanged(cb)` и
// читает текущее состояние через `window.vaultSync.getState()`. Возврат
// из onChanged — функция отписки.
//
// Инстанс-fallback (Е7=3): также exposes инстанс sync-плагина через
// `app.plugins.plugins[id]` для продвинутых потребителей (но это —
// ответственность main.ts, не этого модуля; модуль только реестр).
//
// Чистый модуль: SubscriberRegistry — без зависимостей от obsidian/node.
// main.ts владеет singleton-инстансом и подключает window.vaultSync к нему.

/**
 * Снимок состояния синка — публичный контракт window.vaultSync.getState().
 *
 * Поля специально минимальны (read-only): сторонний потребитель не должен
 * управлять синком, только наблюдать. Управление — через команды Obsidian
 * (cloud-sync-*), как у пользователя.
 */
export interface VaultSyncState {
        jobs?:{version:1;items:import('./job-runtime').JobProjection[]};
        /** Текущий статус синка (см. SyncState в main.ts). */
        syncState: 'idle' | 'syncing' | 'error' | 'offline' | 'conflicts' | 'unconfigured';
        /** Уровень зеркала текущего источника (fetch/light/full). */
        mirrorLevel: 'fetch' | 'light' | 'full';
        /** Governance-статус (W5-T01). */
        governance: {
                status: 'none' | 'ok' | 'blocked' | 'checking';
                managerEverActive: boolean;
                lastCheckedAt: number | null;
                lastBlockedReason: string | null;
        };
        /** sourceId текущего источника (пусто, если движок не собран). */
        sourceId: string;
        /** Тип движка текущего источника (null, если не собран).
         *  [W7-T01] union расширен gdrive/webdav (W6): main.ts кладёт сюда
         *  this.builtKind, который с W6 — 5-движковый union; до W7 тип здесь
         *  был уже, чем фактический — расширение поля публичного контракта
         *  обратно совместимо (потребители switch'атся по значению). */
        engineKind: 'git' | 'yandex' | 'zip-url' | 'gdrive' | 'webdav' | null;
        /** Timestamp последнего sync (ms epoch; 0 = никогда). */
        lastSyncAt: number;
        /** Размер failed-очереди (если 0 — ошибок нет). */
        pendingCount: number;
        /** [VAM] Состояние гварда контроля доступа (протокол v4). Аддитивное
         *  опциональное поле — обратная совместимость публичного контракта:
         *  потребители старой версии его не читают, отсутствует только в
         *  снимках плагинов без VAM-интеграции. Статусы — как у VamGate;
         *  гварда нет → 'blocked' без причины (fail-closed-семантика). */
        vam?: {
                status: 'granted' | 'blocked' | 'pending';
                reason: string | null;
                /** Сессионный мягкий режим (скрытый жест статусной модалки,
                 *  [overhaul S1/H-2] доступен любому знающему; не персистится). */
                softMode: boolean;
        };
}

/**
 * Функция, возвращающая текущий снимок состояния. main.ts предоставляет
 * её из live plugin state; реестр дёргает её при notify.
 */
export type StateProvider = () => VaultSyncState;

/**
 * Подписчик на изменения. Получает свежий снимок. Подписчик не должен
    * бросать — реестр оборачивает в try/catch, чтобы один сломанный слушатель
        * не ронял остальных (контракт стабильности API).
        */
export type StateSubscriber = (state: VaultSyncState) => void;

/**
 * Чистый pub/sub реестр: subscribe/unsubscribe/notify.
 *
 * Идемпотентность: повторная подписка той же функцией —
 * no-op (вторая subscribe той же функции не добавляет подписчика; первая
 * unsub удаляет). Стандартная emitter-семантика, совместимая с ES-observer.
 *
 * Безопасность: notify не мутирует подписчиков во время итерации —
 * копируем set перед вызовом. Иначе подписчик, отпишущий себя внутри
 * колбэка, сломал бы итератор.
 */
export class SubscriberRegistry {
        private subscribers = new Set<StateSubscriber>();
        private provider: StateProvider | null = null;

        /** Зарегистрировать провайдера состояния (вызывается один раз в main.ts). */
        setProvider(provider: StateProvider): void {
                this.provider = provider;
        }

        /**
         * Подписаться на изменения. Возвращает функцию отписки —
         * вызов которой удаляет подписчика из реестра.
         */
        subscribe(cb: StateSubscriber): () => void {
                this.subscribers.add(cb);
                return () => { this.subscribers.delete(cb); };
        }

        /**
         * Разослать текущее состояние всем подписчикам.
         *
         * Если провайдер не установлен — no-op (плагин ещё не загрузился,
         * хук никто не дёргает). Если подписчиков нет — тоже no-op.
         */
        notify(): void {
                if (!this.provider || this.subscribers.size === 0) return;
                const state = this.provider();
                // Копируем set: подписчик может отписаться внутри колбэка.
                const snapshot = new Set(this.subscribers);
                for (const cb of snapshot) {
                        try {
                                cb(state);
                        } catch (e) {
                                // Один сломанный слушатель не должен ронять остальных
                                // и не должен ронять синк. Логируем в консоль.
                                console.warn('[VaultSync] window.vaultSync subscriber failed:', e);
                        }
                }
        }

        /** Текущее состояние из провайдера. null если провайдер не установлен. */
        getState(): VaultSyncState | null {
                return this.provider ? this.provider() : null;
        }

        /** Тестовый доступ: число подписчиков. */
        size(): number {
                return this.subscribers.size;
        }

        /** Очистка при onunload. Удаляет всех подписчиков и провайдера. */
        dispose(): void {
                this.subscribers.clear();
                this.provider = null;
        }
}

/**
 * Создать новый реестр. main.ts хранит один экземпляр на время жизни плагина.
 * В тестах — отдельный экземпляр на тест (изоляция).
 */
export function createSubscriberRegistry(): SubscriberRegistry {
        return new SubscriberRegistry();
}
