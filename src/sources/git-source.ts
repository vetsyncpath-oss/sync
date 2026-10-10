// ============================================================
// --- SOURCES/GIT-SOURCE (фаза 4-1) ---
// Git-источник как реализация SyncSource: перенос GitHubClient
// из main.ts (план 4-1) с чисткой мёртвого (getApiBaseUrl,
// isCancelled, _commitSha — аудит §8). Сетевой уровень —
// core/net.ts (фиксы Б-07/Б-19 + 403-rate-limit-паритет из
// ревью 3-review). Модуль не знает ни obsidian, ни i18n:
// тексты ошибок и нотисы инъектируются (В5-1).
// ============================================================

import type { NetTransport, RemoteEntry, SyncSource } from './types';
import { NetLayer } from '../core/net';
import { FetchTransport } from '../adapters/fetch-transport';

const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRY_ATTEMPTS = 5;
const MAX_RATE_LIMIT_WAIT_MS = 3600000;

/** Элемент git-дерева, как его отдаёт GitHub Trees API. */
export interface GitHubTreeItem {
        path: string;
        mode: string;
        type: 'blob' | 'tree' | 'commit';
        sha: string;
        size: number;
        url: string;
}

export interface RepoInfo {
        owner: string;
        repo: string;
}

/**
 * [W6-T04] API-корень для git-совместимого хоста:
 *   - https://api.github.com (по умолчанию — публичный GitHub)
 *   - https://gh.example.com/api/v3 (GitHub Enterprise)
 *   - https://gitea.example.com/api/v1 (Gitea)
 *
 * Без trailing slash. Пути строятся как `${baseUrl}/repos/...`.
 * Пустая строка / undefined → DEFAULT_API_BASE ('https://api.github.com').
 */
const DEFAULT_API_BASE = 'https://api.github.com';

/** Локализуемые сообщения источника (инъекция из main.ts). */
export interface GitSourceMessages {
        branchNotFound: (branch: string) => string;
        fetchBranch: (status: number) => string;
        fetchTree: () => string;
        treeTruncated: () => string;
        rateLimitExceedsHour: () => string;
        invalidUrl: () => string;
        /** [W6-T04] Базовый URL-валидатор: должен быть http(s)://. */
        invalidBaseUrl: () => string;
}

export interface GitSourceOptions {
        /**
         * Текущая конфигурация репозитория (читается на каждом запросе).
         * [W6-T04] baseUrl — опциональный API-корень; пустой/undefined → DEFAULT_API_BASE.
         */
        repo: () => { repoUrl: string; accessToken: string; branch: string; baseUrl?: string };
        transport?: NetTransport;
        onRateLimitWait?: (waitMs: number) => void;
        messages?: Partial<GitSourceMessages>;
        requestTimeoutMs?: number;
}

const DEFAULT_MESSAGES: GitSourceMessages = {
        branchNotFound: (b) => `Branch '${b}' not found.`,
        fetchBranch: (s) => `Failed to fetch branch: HTTP ${s}`,
        fetchTree: () => 'Failed to fetch file tree.',
        treeTruncated: () => 'Repository too large (tree truncated). Cannot sync safely.',
        rateLimitExceedsHour: () => 'Rate limit wait time exceeds 1 hour. Try again later.',
        invalidUrl: () => 'Invalid repository URL format',
        invalidBaseUrl: () => 'Invalid API base URL: must be http(s):// and not contain trailing slash',
};

export class GitSource implements SyncSource {
        readonly kind = 'git' as const;
        readonly deletionSafety = 'immutable' as const;
        /** GitHub жёстко блокирует blob'ы ~100 МБ (пуш и Blobs API);
         *  99 МБ — защитный запас (паритет прежнего coordinator-лимита). */
        readonly maxFileSizeBytes = 99 * 1024 * 1024;

        private readonly repo: () => { repoUrl: string; accessToken: string; branch: string; baseUrl?: string };
        private readonly net: NetLayer;
        private readonly messages: GitSourceMessages;
        private readonly onRateLimitWait?: (waitMs: number) => void;

        // [W4-T03] ETag-кэш по URL: branches (возвращает tree-sha) и сам tree
        // (возвращает список блобов). При совпадении ETag GitHub отдаёт 304 —
        // мы переиспользуем кэшированный JSON, не заново парсим.
        // Кэш НЕ персистентный (in-memory): авто-тик «в той же сессии»
        // умеет давать 304; перезапуск Obsidian не имеет ETag и идёт полным
        // GET'ом (один раз, дальше кэш снова греется).
        private readonly etagCache = new Map<string, { etag: string | null; data: any }>();

        /** [P1/M5] LRU-шапка etagCache: каждая запись — ПОЛНОЕ дерево
         *  (распарсенный JSON на мегабайты); без выселения длинная сессия
         *  с блужданием по веткам раздувала память без предела. 32 записи
         *  с запасом покрывает дерево+refs+блобы одного репо. */
        private static readonly ETAG_CACHE_MAX = 32;

        constructor(opts: GitSourceOptions) {
                this.repo = opts.repo;
                this.messages = { ...DEFAULT_MESSAGES, ...opts.messages };
                this.onRateLimitWait = opts.onRateLimitWait;
                const transport = opts.transport ?? new FetchTransport({ timeoutMs: opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS });
                this.net = new NetLayer(transport);
        }

        // --- SyncSource ---

        /** Полный манифест репозитория: все блобы ветки (фильтрация — зона PathPolicy). */
        async getManifest(signal: AbortSignal): Promise<RemoteEntry[]> {
                const { owner, repo } = this.parseUrlOrThrow();
                const branch = this.repo().branch;
                const tree = await this.fetchRepoTree(owner, repo, branch, signal);
                // [W7/BUG-11] пустые блобы (size === 0) включаются в манифест:
                // единообразие с zip-url/gdrive/webdav (спека §8: «zip-поведение
                // во всех движках»). Старый фильтр `size > 0` пропускал пустые
                // файлы → фантомные diff'ы при миграции между движками и
                // «исчезающие» заметки-заглушки.
                return tree
                        .filter((item) => item.type === 'blob')
                        .map((item) => ({
                                path: item.path,
                                hash: item.sha,
                                hashAlg: 'git-sha1' as const,
                                size: item.size,
                        }));
        }

        /** Скачивание блоба по SHA (проверка expectedSize — фикс Б-19). */
        async fetch(entry: RemoteEntry, signal: AbortSignal): Promise<ArrayBuffer> {
                const { owner, repo } = this.parseUrlOrThrow();
                const apiUrl = `${this.apiBase()}/repos/${owner}/${repo}/git/blobs/${entry.hash}`;
                const buffer = await this.fetchBuffer(apiUrl, true, signal);
                // Raw media type is the contract; a JSON-looking file is still raw content.
                if (buffer.byteLength !== entry.size) {
                        throw new Error(`Blob size mismatch for ${entry.hash}: ${buffer.byteLength} != ${entry.size}`);
                }
                return buffer;
        }

        // --- Публичные утилиты ---

        async testConnection(branch: string): Promise<{ success: boolean; message: string }> {
                try {
                        const { owner, repo } = this.parseUrlOrThrow();
                        const res = await this.net.fetchBuffer(
                                `${this.apiBase()}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
                                {
                                        headers: this.getHeaders(false),
                                        retries: 1,
                                        maxRateLimitWaitMs: 1, // тест подключения не ждёт лимиты
                                }
                        );
                        return { success: true, message: `Connected to branch '${branch}'` };
                } catch (e: any) {
                        if (e?.status === 401 || e?.status === 403) {
                                return { success: false, message: `Authentication failed (HTTP ${e.status}). Check token permissions.` };
                        }
                        if (e?.status === 404) return { success: false, message: 'Repository or branch not found (HTTP 404)' };
                        if (e?.aborted) return { success: false, message: 'Connection timed out' };
                        return { success: false, message: `Network error: ${e?.message ?? e}` };
                }
        }

        static parseGitUrl(url: string): RepoInfo | null {
                try {
                        url = url.split('?')[0].replace(/\/+$/, '').replace(/\.git$/, '');
                        // SSH/SCP: git@host:owner/repo — общий паттерн для github.com, GHE, Gitea.
                        const sshMatch = url.match(/^git@([^:\s]+):([^\/]+)\/([^\/]+)/);
                        if (sshMatch) return { owner: sshMatch[2], repo: sshMatch[3] };
                        const urlObj = new URL(url);
                        const parts = urlObj.pathname.split('/').filter(p => p.length > 0);
                        if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
                } catch {
                        // [W6-T04] Fallback: «host.example.com[:/]owner/repo» без схемы.
                        // Старый паттерн был захардкожен под github.com; общий — для self-hosted git.
                        const match = url.match(/^([^\/\s.:]+(?:\.[^\/\s.:]+)+)[\/:]([^\/]+)\/([^\/]+)/);
                        if (match) return { owner: match[2], repo: match[3] };
                }
                return null;
        }

        // --- Внутреннее ---

        /**
         * [W6-T04] API-корень: из настроек пользователя (baseUrl), приведённый
         * к канонической форме (без trailing slash). Пустой/undefined →
         * DEFAULT_API_BASE ('https://api.github.com'). Невалидный — throw.
         */
        private apiBase(): string {
                const raw = this.repo().baseUrl?.trim();
                if (!raw) return DEFAULT_API_BASE;
                // Валидация: должен быть http(s)://, без trailing slash.
                try {
                        const u = new URL(raw);
                        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                                throw new Error(this.messages.invalidBaseUrl());
                        }
                } catch {
                        throw new Error(this.messages.invalidBaseUrl());
                }
                if (raw.endsWith('/')) throw new Error(this.messages.invalidBaseUrl());
                return raw;
        }

        private parseUrlOrThrow(): RepoInfo {
                const repoInfo = GitSource.parseGitUrl(this.repo().repoUrl);
                if (!repoInfo) throw new Error(this.messages.invalidUrl());
                return repoInfo;
        }

        private async fetchBuffer(url: string, isRaw: boolean, signal: AbortSignal): Promise<ArrayBuffer> {
                try {
                        return await this.net.fetchBuffer(url, {
                                headers: this.getHeaders(isRaw),
                                signal,
                                retries: MAX_RETRY_ATTEMPTS,
                                maxRateLimitWaitMs: MAX_RATE_LIMIT_WAIT_MS,
                                // [3-review] паритет со старым кодом: GitHub шлёт 403 с
                                // исчерпанным лимитом (X-RateLimit-Remaining: 0) — ждём
                                // по X-RateLimit-Reset, а не падаем в failedQueue
                                classifyRateLimit: (status: number, headers: Record<string, string>) => {
                                        if (status === 403 && headers['x-ratelimit-remaining'] === '0') {
                                                const reset = Number(headers['x-ratelimit-reset']);
                                                if (Number.isFinite(reset) && reset > 0) {
                                                        return Math.max(0, reset * 1000 - Date.now());
                                                }
                                        }
                                        return null;
                                },
                                onRateLimitWait: (waitMs: number) => this.onRateLimitWait?.(waitMs),
                        });
                } catch (e: any) {
                        if (e?.rateLimitExceeded) throw new Error(this.messages.rateLimitExceedsHour());
                        throw e;
                }
        }

        /** [W4-T03] Условный GET JSON: шлём If-None-Match, на 304 —
         *  возвращаем кэшированный JSON без повторного парсинга/скачивания.
         *  На 200 — обновляем ETag и data в кэше, отдаём свежий JSON. */
        private async fetchJsonConditional(url: string, signal: AbortSignal): Promise<any> {
                const cached = this.etagGet(url);
                const ifNoneMatch = cached?.etag ?? undefined;
                const res = await this.net.fetchBufferConditional(url, {
                        headers: this.getHeaders(false),
                        signal,
                        retries: MAX_RETRY_ATTEMPTS,
                        maxRateLimitWaitMs: MAX_RATE_LIMIT_WAIT_MS,
                        classifyRateLimit: (status: number, headers: Record<string, string>) => {
                                if (status === 403 && headers['x-ratelimit-remaining'] === '0') {
                                        const reset = Number(headers['x-ratelimit-reset']);
                                        if (Number.isFinite(reset) && reset > 0) {
                                                return Math.max(0, reset * 1000 - Date.now());
                                        }
                                }
                                return null;
                        },
                        onRateLimitWait: (waitMs: number) => this.onRateLimitWait?.(waitMs),
                        ifNoneMatch,
                });
                if (res.notModified) {
                        // 304: вернём кэшированный JSON (он уже пережован).
                        return cached!.data;
                }
                // 200: распарсить тело, обновить кэш.
                const data = JSON.parse(new TextDecoder().decode(res.body));
                this.etagSet(url, { etag: res.etag, data });
                return data;
        }

        // ── [P1/M5] LRU-доступ к etagCache ──

        /** Чтение с обновлением recency (Map iteration order = возраст). */
        private etagGet(url: string): { etag: string | null; data: any } | undefined {
                const v = this.etagCache.get(url);
                if (v !== undefined) {
                        this.etagCache.delete(url);
                        this.etagCache.set(url, v);
                }
                return v;
        }

        /** Запись с выселением самых старых при превышении шапки. */
        private etagSet(url: string, value: { etag: string | null; data: any }): void {
                this.etagCache.delete(url);
                this.etagCache.set(url, value);
                while (this.etagCache.size > GitSource.ETAG_CACHE_MAX) {
                        const oldest = this.etagCache.keys().next().value;
                        if (oldest === undefined) break;
                        this.etagCache.delete(oldest);
                }
        }

        private async fetchJson(url: string, signal: AbortSignal): Promise<any> {
                const buffer = await this.fetchBuffer(url, false, signal);
                return JSON.parse(new TextDecoder().decode(buffer));
        }

        private async fetchBranch(owner: string, repo: string, branch: string, signal: AbortSignal): Promise<any> {
                const url = `${this.apiBase()}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`;
                try {
                        // [W4-T03] conditional GET: на 304 — из кэша (включая
                        // tree-sha из branchData.commit.commit.tree.sha).
                        return await this.fetchJsonConditional(url, signal);
                } catch (e: any) {
                        if (e?.status === 404) throw new Error(this.messages.branchNotFound(branch));
                        if (e?.status) throw new Error(this.messages.fetchBranch(e.status));
                        throw e;
                }
        }

        private async fetchRepoTree(owner: string, repo: string, branch: string, signal: AbortSignal): Promise<GitHubTreeItem[]> {
                const branchData = await this.fetchBranch(owner, repo, branch, signal);
                const treeSha = branchData.commit.commit.tree.sha;
                const treeUrl = `${this.apiBase()}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
                let treeData: any;
                try {
                        // [W4-T03] tree тоже conditional: если не было новых
                        // коммитов на ветке — tree-sha совпадает → URL тот же
                        // → ETag кэширован → 304 (один дешёвый запрос вместо
                        // полного дерева ~1–3 МБ JSON).
                        treeData = await this.fetchJsonConditional(treeUrl, signal);
                } catch (e) {
                        // [overhaul S2/M-10] отмена проходит как есть (семантика
                        // отмены не тонет в обёртке); прочее — оборачиваем, СОХРАНЯЯ
                        // исходный текст: abort и rate-limit больше не неотличимы
                        // от «дерево не отдалось».
                        if (e instanceof Error && (e as { aborted?: boolean }).aborted) throw e;
                        throw new Error(this.messages.fetchTree() + (e instanceof Error ? `: ${e.message}` : ''));
                }
                if (treeData.truncated) throw new Error(this.messages.treeTruncated());
                return treeData.tree;
        }

        private getHeaders(isRaw = false): Record<string, string> {
                const headers: Record<string, string> = {
                        'User-Agent': 'Obsidian-Git-Sync',
                        'Accept': isRaw ? 'application/vnd.github.v3.raw' : 'application/vnd.github.v3+json',
                };
                const token = this.repo().accessToken;
                if (token) headers['Authorization'] = `token ${token}`;
                return headers;
        }
}
