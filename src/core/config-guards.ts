// src/core/config-guards.ts — чистые guards конфигурации и статуса (W1-T03).
// Функции без зависимостей от obsidian/node — тестируются напрямую
// (инвариант §4.1 CONVENTIONS: src/core/** чист).
//
// Тип статуса здесь инлайн 'idle' | 'error', а НЕ SyncState из main.ts:
// SyncState объявлен в main.ts, который импортирует obsidian, — импорт
// типа из main.ts в core нарушил бы чистоту ядра (исторического
// переиспользуемого типа статуса в src/sources/types.ts нет).

/** Minimum supported configuration; network access is verified by the provider.
 * Drive requires a public folder: an API key is not account authorization.
 * WebDAV supports anonymous access; a password requires a username.
 */
export function isSourceConfigured(
        kind: 'git' | 'yandex' | 'zip-url' | 'gdrive' | 'webdav',
        cfg: {
                repoUrl: string;
                accessToken: string;
                vaultUrl: string;
                /** [W6-T03] gdrive: API key (required). */
                apiKey?: string;
                folderId?: string;
                authMode?: string;
                clientId?: string;
                accountSub?: string;
                secretRef?: string;
                /** [W6-T05] webdav: base URL (required). */
                baseUrl?: string;
                /** WebDAV username; optional for anonymous access. */
                username?: string;
                /** [W6-T05] webdav: password (optional — public WebDAV). */
                password?: string;
                /** [W6-T05] webdav: optional root path inside baseUrl. */
                rootPath?: string;
        },
): boolean {
        if (kind === 'git') {
                return Boolean(cfg.repoUrl.trim());
        }
        if (kind === 'gdrive') {
                if(cfg.authMode==='oauth-desktop')return Boolean(cfg.folderId?.trim()&&cfg.clientId?.trim()&&cfg.accountSub?.trim()&&cfg.secretRef?.trim());
                // [W6-T03] gdrive: apiKey обязателен (секрет из настроек).
                return Boolean(cfg.apiKey?.trim() && cfg.folderId?.trim() && cfg.folderId.trim()!=='root');
        }
        if (kind === 'webdav') {
                // Anonymous access is valid; do not silently discard an orphan password.
                return Boolean(cfg.baseUrl && cfg.baseUrl.trim().length > 0
                        && (!cfg.password || Boolean(cfg.username?.trim())));
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
