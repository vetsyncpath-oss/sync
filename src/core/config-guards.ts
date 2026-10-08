// src/core/config-guards.ts — чистые guards конфигурации и статуса (W1-T03).
// Функции без зависимостей от obsidian/node — тестируются напрямую
// (инвариант §4.1 CONVENTIONS: src/core/** чист).
//
// Тип статуса здесь инлайн 'idle' | 'error', а НЕ SyncState из main.ts:
// SyncState объявлен в main.ts, который импортирует obsidian, — импорт
// типа из main.ts в core нарушил бы чистоту ядра (исторического
// переиспользуемого типа статуса в src/sources/types.ts нет).

/**
 * Источник сконфигурирован достаточно для синхронизации?
 *
 * [W1-T03/BUG-16] git: достаточно repoUrl — accessToken опционален для
 * публичных репозиториев (git-source при пустом токене просто не шлёт
 * заголовок Authorization). Старый guard в main.ts требовал
 * `repoUrl && accessToken` и врал «Настройки не заполнены» для публичных репо.
 *
 * yandex / zip-url: нужен непустой vaultUrl (пробелы не считаются).
 *
 * [W6-T03] gdrive: apiKey обязателен (секрет из настроек — лежит в
 * отдельном поле, не в `cfg.vaultUrl`); в config-guards передаётся через
 * `cfg.apiKey` (см. main.ts isConfiguredForSource).
 * [W6-T05] webdav: нужен непустой baseUrl + username (password опционален
 * для публичных серверов). Передаётся через `cfg.baseUrl` + `cfg.username`.
 */
export function isSourceConfigured(
        kind: 'git' | 'yandex' | 'zip-url' | 'gdrive' | 'webdav',
        cfg: {
                repoUrl: string;
                accessToken: string;
                vaultUrl: string;
                /** [W6-T03] gdrive: API key (required). */
                apiKey?: string;
                /** [W6-T05] webdav: base URL (required). */
                baseUrl?: string;
                /** [W6-T05] webdav: username (required). */
                username?: string;
                /** [W6-T05] webdav: password (optional — public WebDAV). */
                password?: string;
                /** [W6-T05] webdav: optional root path inside baseUrl. */
                rootPath?: string;
        },
): boolean {
        if (kind === 'git') {
                return Boolean(cfg.repoUrl);
        }
        if (kind === 'gdrive') {
                // [W6-T03] gdrive: apiKey обязателен (секрет из настроек).
                return Boolean(cfg.apiKey && cfg.apiKey.trim().length > 0);
        }
        if (kind === 'webdav') {
                // [W6-T05] webdav: baseUrl + username обязательны (Basic auth).
                return Boolean(cfg.baseUrl && cfg.baseUrl.trim().length > 0
                        && cfg.username && cfg.username.trim().length > 0);
        }
        // yandex / zip-url: vaultUrl (пробелы не считаются).
        return cfg.vaultUrl.trim().length > 0;
}

/**
 * Какой статус показать в статус-баре при возврате сети.
 *
 * [W1-T03/BUG-17] Старый onlineHandler слепо ставил 'idle' — при непустой
 * failed-очереди ошибки становились невидимыми до следующего sync.
 * Теперь: непустая очередь → 'error' + pendingCount (StatusBarManager
 * рендерит счётчик), пустая → 'idle'.
 */
export function reconnectStatus(queueSize: number):
        { state: 'idle' } | { state: 'error'; pendingCount: number } {
        return queueSize > 0
                ? { state: 'error', pendingCount: queueSize }
                : { state: 'idle' };
}
