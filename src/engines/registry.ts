// src/engines/registry.ts — [W3-T02] реестр движков: единый
// источник правды о типах источников (git / yandex / zip-url / будущие).
//
// Каждый движок описывается EngineDescriptor'ом: kind, label, icon,
// capabilities, settingsSchema (SettingField[]), factory create(values, ctx)
// и sourceId-фабрика makeSourceId(values). Реестр — статический Map
// kind→descriptor; регистрация — side-effect при первом импорте этого
// модуля. Главный потребитель — main.ts (W3-T03): он убирает switch-точки
// desiredSourceKind / makeSourceId / buildEngine и спрашивает реестр.
//
// КРИТИЧНЫЙ ИНВАРИНТ (golden-тест): sourceId существующих движков
// байт-в-байт совпадает со старым форматом `kind_<djb2(url)>` — иначе у
// всех пользователей полный re-download. djb2 переиспользована из старой
// private stableHash в main.ts без изменений (>>> 0 → toString(16)).
// Секреты (accessToken / токены) НЕ входят в sourceId — только
// публичный идентификатор (repoUrl для git, vaultUrl для yandex/zip-url).
//
// ЗАВИСИМОСТИ: registry.ts импортирует ТИПЫ из ../sources/types
// (SyncSource/NetTransport/ArchiveDownloader) — чистые type-only, в
// рантайм их нет. Конкретные классы движков (GitSource/YandexSource/
// ZipUrlSource) подключаются TOP-LEVEL import'ом: проверка rg показала,
// что ни один источник не импортирует registry (цикла нет). Если в
// будущем источник начнёт реэкспортить функции реестра — заменить
// top-level import на ленивый `await import('../sources/...')` (create
// станет async, что совместимо с main.ts prepareSession, который и так
// async).
//
// ЧИСТОТА: модуль фундаментальный — БЕЗ top-level импортов obsidian,
// node-API и без рантайм-ссылок на main.ts. Top-level import классов
// источников (GitSource/YandexSource/ZipUrlSource) безопасен: ни один
// источник не импортирует registry (rg-проверка в W3-T02); цикла нет.

import type { SettingField } from './schema';
import type { SyncSource, NetTransport, ArchiveDownloader } from '../sources/types';
// [W3-T03] type-only импорт ZipRangeTransport — нужен только для аннотации поля
// EngineCtx.rangeTransport; в рантайм его нет (testZipConnection принимает
// конкретную реализацию — NodeZipRangeTransport на десктопе / FakeRangeTransport
// в тестах). Цикла импортов нет: zip-test-connection не ссылается на registry.
import type { ZipRangeTransport } from '../sources/zip-test-connection';
// Top-level импорты классов источников (НЕ цикличны: git-source/yandex-source/
// zip-url-source не импортируют registry — см. rg-проверку в W3-T02). Бриф
// упоминал require() как защиту от будущей обратной ссылки, но проверка
// показала: на сегодня цикла нет; прямой import работает в vitest/esbuild
// без чего-либо особенного. Если в будущем источник начнёт реэкспортить
// функции реестра — заменить на ленивый `await import('../sources/...')`
// (create станет async, что совместимо с main.ts prepareSession).
import { GitSource } from '../sources/git-source';
import { YandexSource } from '../sources/yandex-source';
import { ZipUrlSource } from '../sources/zip-url-source';
import { GDriveSource } from '../sources/gdrive-source';
import { WebDavSource } from '../sources/webdav-source';
import type { GitSourceMessages } from '../sources/git-source';
import type { YandexSourceMessages } from '../sources/yandex-source';
import type { ZipUrlSourceMessages } from '../sources/zip-url-source';
import type { GDriveSourceMessages } from '../sources/gdrive-source';
import type { WebDavSourceMessages } from '../sources/webdav-source';

// ────────────────────────────────────────────────────────────────────────
// Контекст создания движка
// ────────────────────────────────────────────────────────────────────────

/**
 * Контекст, передаваемый в create(): то, что движку нужно для
 * инстанцирования, помимо значений полей настроек (values). Не включает
 * settings — они передаются отдельно как values (Record<string, unknown>).
 *
 * Минимальный набор общих зависимостей: HTTP-транспорт (для git/yandex),
 * архив-даунлоадер (для zip-url и yandex-file-ветки). Если движку нужно
 * больше — расширяй ctx, но не main.ts/Obsidian API: чистый TypeScript.
 *
 * Для тестов: можно передать мок-реализации; для проды (W3-T03) main.ts
 * передаёт реальные FetchTransport / NodeArchiveDownloader /
 * NodeZipRangeTransport.
 */
export interface EngineCtx {
        /** HTTP-транспорт для движков с сетевыми запросами (git/yandex). */
        transport?: NetTransport;
        /** Скачиватель архива для zip-url и file-ветки yandex. */
        archiveDownloader?: ArchiveDownloader;
        /** Колбэк ожидания rate-limit (общий для git/yandex). */
        onRateLimitWait?: (waitMs: number) => void;
        /** Лог наблюдаемости (для testConnection W3-T04). */
        log?: (msg: string) => void;
        /**
         * [W3-T03] i18n-сообщения движка (Partial<...Messages>).
         * Передаётся в конструктор соответствующего источника как `messages`.
         * Тип宽松: каждый движок ожидает свой GitSourceMessages/YandexSourceMessages/
         * ZipUrlSourceMessages; main.ts формирует их через i18n.t.* и type-cast'ит.
         */
        messages?: Partial<GitSourceMessages & YandexSourceMessages & ZipUrlSourceMessages & GDriveSourceMessages & WebDavSourceMessages>;
        /**
         * [W3-T03] Прогресс скачивания архива (только zip-url). В main.ts
         * транслируется в statusBar.setState('syncing', { bytesTransferred, totalBytes }).
         */
        onProgress?: (p: { bytesTransferred: number; totalBytes: number | null }) => void;
        /**
         * [W3-T04] Лёгкий транспорт для ZIP Test Connection (HEAD + Range).
         * Десктоп: NodeZipRangeTransport (lazy require('https')); мобайл:
         * undefined → ZipUrlSource.testConnection() идёт fallback full.
         *
         * КРИТИЧНО: легковесный Range-путь НЕ открывает сессионный архив —
         * повторный getManifest качает заново (инвариант testZipConnection,
         * проверяется в tests/zip-test-connection.test.ts →
         * "с rangeTransport → Range-путь; сессия не тронута").
         */
        rangeTransport?: ZipRangeTransport;
        /**
         * [W6-T01] TTL сессионного архива в мс для zip-url движка (оптимизация №1).
         * 0 (по умолчанию) — eager dispose (старое поведение); >0 — мягкая аренда,
         * переиспользование reader'а в пределах TTL (retry/scan/policy-modal/test
         * в пределах 5 минут → 1 скачивание вместо до 4×). main.ts передаёт 5 минут
         * (300000мс) для продакшна. См. ZipUrlSourceOptions.sessionTtlMs.
         */
        zipSessionTtlMs?: number;
}

// ────────────────────────────────────────────────────────────────────────
// Capabilities и Descriptor
// ────────────────────────────────────────────────────────────────────────

/**
 * Возможности движка — влияют на UI (кнопка Test Connection, индикатор
 * инкрементальности, наличие поля auth-токена). Чистые флаги, без логики.
 */
export interface EngineCapabilities {
        /** Движок требует auth-токен / пароль (необязательный для публичных источников). */
        auth?: boolean;
        /** Поддерживает conditional-запросы (If-None-Match и т.п.). */
        etag?: boolean;
        /** Отдаёт mtime файлов (для UI-сортировки). */
        mtime?: boolean;
        /** Инкрементальный sync (vs полный download каждый раз). */
        incremental?: boolean;
        /** Поддерживает лёгкий Test Connection (W3-T04 — zip-url Range-хвост). */
        testConnection?: boolean;
}

/**
 * Дескриптор движка: декларативное описание + factory. Регистрируется
 * в EngineRegistry один раз при первом импорте registry.ts.
 *
 * Контракт:
 *   - kind: строковый идентификатор ('git' | 'yandex' | 'zip-url' | будущие).
 *     Равен SyncSource.kind — это связь между дескриптором и инстансом.
 *   - labelKey: путь в i18n для подписи движка в SettingsTab.
 *   - icon: emoji/иконка для UI (visual).
 *   - capabilities: флаги возможностей движка.
 *   - experimental: [P0/P0-6] движок помечен как экспериментальный — UI
 *     показывает предупреждение и суффикс «(экспериментально)» в дропдауне
 *     выбора источника. Снимается после боевой проверки против реальных
 *     серверов.
 *   - settingsSchema: SettingField[] — SettingsTab рендерит UI по схеме
 *     без каскада if'ов (главная боль 2.3.3 — §8.1 аудита).
 *   - create(values, ctx?): по значениям полей схемы + контексту
 *     возвращает инстанс SyncSource. Использует ленивый require() для
 *     класса источника — разрывает цикл импортов.
 *   - makeSourceId(values): стабильный sourceId вида `kind_<djb2(url)>`.
 *     Секреты НЕ входят (инвариант 3 — см. djb2).
 */
export interface EngineDescriptor {
        kind: string;
        labelKey: string;
        icon: string;
        capabilities: EngineCapabilities;
        /** [P0/P0-6] Экспериментальный движок — UI помечает предупреждением. */
        experimental?: boolean;
        settingsSchema: SettingField[];
        create(values: Record<string, unknown>, ctx?: EngineCtx): SyncSource;
        makeSourceId(values: Record<string, unknown>): string;
}

// ────────────────────────────────────────────────────────────────────────
// Реестр
// ────────────────────────────────────────────────────────────────────────

/**
 * Статический реестр движков: kind → EngineDescriptor. Регистрация
 * выполняется side-effect'ом внизу этого файла (при первом импорте).
 * Main.ts (W3-T03) заменит switch-точки desiredSourceKind/makeSourceId/
 * buildEngine вызовами EngineRegistry.get/makeSourceId/create.
 *
 * Контракт:
 *   - register(desc): добавляет дескриптор; throw при дубле kind.
 *   - get(kind): возвращает дескриптор; throw для неизвестного kind.
 *   - all(): снимок всех дескрипторов (порядок = порядок регистрации).
 *   - has(kind): boolean без throw.
 *   - kinds(): массив kind'ов в порядке регистрации.
 *   - makeSourceId(kind, values): утилита — делегирует в дескриптор.
 *   - create(kind, values, ctx?): утилита — делегирует в дескриптор.
 */
export class EngineRegistry {
        private static descriptors = new Map<string, EngineDescriptor>();

        static register(desc: EngineDescriptor): void {
                if (this.descriptors.has(desc.kind)) {
                        throw new Error(`Engine "${desc.kind}" already registered`);
                }
                this.descriptors.set(desc.kind, desc);
        }

        static get(kind: string): EngineDescriptor {
                const d = this.descriptors.get(kind);
                if (!d) throw new Error(`Unknown engine kind: ${kind}`);
                return d;
        }

        static all(): EngineDescriptor[] {
                return Array.from(this.descriptors.values());
        }

        static has(kind: string): boolean {
                return this.descriptors.has(kind);
        }

        static kinds(): string[] {
                return Array.from(this.descriptors.keys());
        }

        /** Утилита для main.ts: построить sourceId по kind+values. */
        static makeSourceId(kind: string, values: Record<string, unknown>): string {
                return this.get(kind).makeSourceId(values);
        }

        /** Утилита: построить инстанс SyncSource. */
        static create(kind: string, values: Record<string, unknown>, ctx?: EngineCtx): SyncSource {
                return this.get(kind).create(values, ctx);
        }
}

// ────────────────────────────────────────────────────────────────────────
// djb2 — стабильная хэш-функция sourceId
// ────────────────────────────────────────────────────────────────────────

/**
 * djb2 — стабильный хэш (без crypto, детерминированно). ЭКСПОРТИРОВАНА
 * для переиспользования в main.ts (W3-T03 выкинет свою private
 * stableHash и будет звать эту — единая точка).
 *
 * БАЙТ-В-БАЙТ совместима со старой private stableHash в main.ts:
 *   - h0 = 5381
 *   - на каждый символ: h = ((h << 5) + h + charCode) >>> 0
 *   - возврат: h.toString(16)  ← HEX, не base36 (легаси-контракт!)
 *
 * >>> 0 необходимо: битовый сдвиг << в JS 32-битный, при переполнении
 * уходит в отрицательные — >>> 0 возвращает unsigned (как в C/u32).
 *
 * Для пустой строки: h0 = 5381, цикл не выполняется → "1505" (не "0x1505").
 *
 * sourceId-формат: `kind_<djb2(public-identifier)>`. СЕКРЕТЫ (accessToken,
 * токены) НЕ входят в djb2-хэш — это инвариант 3 (CONVENTIONS): иначе
 * sourceId менялся бы при каждой ротации токена → у пользователя полный
 * re-download содержимого. В схемах движков секретные поля помечены
 * `field.secret: true` (deprecated-маркер), но конкретные makeSourceId
 * ниже явно ссылаются только на публичный идентификатор (repoUrl/vaultUrl).
 */
export function djb2(input: string): string {
        let h = 5381;
        for (let i = 0; i < input.length; i++) {
                h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
        }
        return h.toString(16);
}

// ────────────────────────────────────────────────────────────────────────
// Регистрация трёх существующих движков
// ────────────────────────────────────────────────────────────────────────
// Порядок: git, yandex, zip-url — kinds() возвращает массив именно в
// таком порядке (тесты проверяют). Map сохраняет порядок вставки.

// 1. GIT ─────────────────────────────────────────────────────────────────
EngineRegistry.register({
        kind: 'git',
        labelKey: 'eng.git.label',
        icon: '🐱', // W3-T03 подберёт визуал (GitHub-иконка / emoji)
        capabilities: {
                auth: true,        // accessToken поддерживается (не required — публичные репо)
                etag: true,        // GitHub API отдаёт ETag (условно — см. core/net.ts)
                incremental: true, // git-tree API → манифест без полного скачивания
                // testConnection: false — git уже имеет testConnection-метод
                // (HEAD к branches API), но он не зарегистрирован как легковесная
                // Test Connection в смысле W3-T04. Может быть добавлен позже.
                testConnection: false,
        },
        settingsSchema: [
                {
                        key: 'repoUrl',
                        type: 'url',
                        labelKey: 'eng.git.repoUrl',
                        helpKey: 'eng.git.repoUrlHelp',
                        required: true,
                        placeholderKey: 'eng.git.repoUrlPlaceholder',
                },
                {
                        key: 'accessToken',
                        type: 'secret',
                        labelKey: 'eng.git.accessToken',
                        helpKey: 'eng.git.accessTokenHelp',
                        // required: false — публичные репозитории работают без токена.
                        // secret: true — deprecated-маркер для sourceId-фабрики
                        // (accessToken ИСКЛЮЧЁН из djb2-хэша — инвариант 3).
                        secret: true,
                },
                {
                        key: 'branch',
                        type: 'select',
                        labelKey: 'eng.git.branch',
                        options: [
                                { value: 'all', labelKey: 'eng.git.branches.all' },
                                { value: 'default', labelKey: 'eng.git.branches.default' },
                        ],
                        // default — для инициализации пустых настроек / миграции.
                        // Реальное значение (main/master/develop) — за пользователем.
                        default: 'default',
                },
                // [W6-T04] baseUrl — опциональный API-корень для GitHub Enterprise
                // и Gitea. Пустой/undefined → DEFAULT_API_BASE ('https://api.github.com').
                // ВАЖНО для sourceId: пользователь с baseUrl != default получает
                // ОТДЕЛЬНЫЙ кэш (см. makeSourceId ниже) — иначе GHE-репо и github-репо
                // с тем же owner/repo залили бы друг другу кэш.
                {
                        key: 'baseUrl',
                        type: 'url',
                        labelKey: 'eng.git.baseUrl',
                        helpKey: 'eng.git.baseUrlHelp',
                        placeholderKey: 'eng.git.baseUrlPlaceholder',
                        // required: false — пустой = публичный GitHub.
                        // pattern: валидация уже требует ^https?://; этот pattern
                        // дублирует тот же контроль (безопасный — никогда не блокирует
                        // пустое поле, т.к. validateField для 'url' с !required пропускает
                        // пустое значение).
                },
        ],
        create: (values, ctx) => {
                // Прямой import класса (без require — пути резолвятся esbuild/vitest).
                // [W3-T03] messages + onRateLimitWait инъектируются через ctx
                // (main.ts формирует их из i18n.t.*).
                // [W6-T04] baseUrl читается из values (опционально; валидируется в apiBase()).
                return new GitSource({
                        repo: () => ({
                                repoUrl: String(values.repoUrl ?? ''),
                                accessToken: String(values.accessToken ?? ''),
                                branch: String(values.branch ?? 'main'),
                                baseUrl: typeof values.baseUrl === 'string' ? values.baseUrl : undefined,
                        }),
                        transport: ctx?.transport,
                        onRateLimitWait: ctx?.onRateLimitWait,
                        messages: ctx?.messages as Partial<import('../sources/git-source').GitSourceMessages> | undefined,
                });
        },
        makeSourceId: (values) => {
                // Только публичный идентификатор (repoUrl). accessToken НЕ входит —
                // инвариант 3 (ротация токена не меняет sourceId).
                // [W6-T04] baseUrl НЕ входит в sourceId, ЕСЛИ он пустой/равен дефолту
                // (https://api.github.com) — это сохраняет golden-тесты W3 (байт-в-байт
                // с легаси git_<djb2(repoUrl)>). При явном baseUrl (GHE/Gitea) —
                // sourceId учитывает baseUrl, чтобы self-hosted git получил отдельный
                // кэш (иначе GHE-репо и github-репо с тем же owner/repo конфликтуют).
                // [overhaul S1 / H-6+M-9] branch входит в sourceId, ЕСЛИ задан явно и
                // ≠ 'main': смена ветки = другой контент источника, а кэш был один →
                // дифф двух веток → массовые фантомные «изменения» + зеркальные
                // удаления. Дефолт (''/main) сохраняет легаси-формат байт-в-байт —
                // кэш подавляющего большинства пользователей не мигрирует; master/
                // feature-ветки получают отдельный кэш (одноразовый re-download —
                // честная цена корректности).
                const repoUrl = String(values.repoUrl ?? '');
                const baseUrl = typeof values.baseUrl === 'string' ? values.baseUrl.trim() : '';
                const branch = typeof values.branch === 'string' ? values.branch.trim() : '';
                const DEFAULT_API_BASE = 'https://api.github.com';
                const repoPart = !baseUrl || baseUrl === DEFAULT_API_BASE
                        ? repoUrl
                        : `${baseUrl}|${repoUrl}`;
                if (branch && branch !== 'main') {
                        return `git_${djb2(`${repoPart}|${branch}`)}`;
                }
                return `git_${djb2(repoPart)}`;
        },
});

// 2. YANDEX ─────────────────────────────────────────────────────────────
EngineRegistry.register({
        kind: 'yandex',
        labelKey: 'eng.yandex.label',
        icon: '☁️',
        capabilities: {
                auth: true,         // accessToken опциональный — публичные ссылки работают
                incremental: true,  // manifest-режим без полного скачивания (BFS листингов)
                // testConnection: false — нет лёгкой проверки (требуется E1/E2 запрос).
                testConnection: false,
        },
        settingsSchema: [
                {
                        key: 'vaultUrl',
                        type: 'url',
                        labelKey: 'eng.yandex.vaultUrl',
                        required: true,
                },
                {
                        key: 'accessToken',
                        type: 'secret',
                        labelKey: 'eng.yandex.token',
                        // required: false — публичные ссылки работают без токена.
                        // secret: true — маркер для sourceId-фабрики.
                        secret: true,
                },
        ],
        create: (values, ctx) => {
                // publicKey — это и есть публичная ссылка (vaultUrl), см. конструктор.
                // transport — обязательное поле YandexSourceOptions; берём из ctx.
                // archiveDownloader — нужен только для file-ветки (ссылка на файл);
                // для папочных ссылок не требуется, но передаём если есть.
                // [W3-T03] messages инъектируется через ctx (i18n.t.errYandex*).
                return new YandexSource({
                        publicKey: () => String(values.vaultUrl ?? ''),
                        transport: ctx?.transport!, // main.ts (W3-T03) передаст реальный transport
                        archiveDownloader: ctx?.archiveDownloader,
                        onRateLimitWait: ctx?.onRateLimitWait,
                        messages: ctx?.messages as Partial<import('../sources/yandex-source').YandexSourceMessages> | undefined,
                });
        },
        makeSourceId: (values) => {
                // vaultUrl — публичная ссылка (https://disk.yandex.ru/d/<key>).
                // accessToken не входит (инвариант 3).
                return `yandex_${djb2(String(values.vaultUrl ?? ''))}`;
        },
});

// 3. ZIP-URL ────────────────────────────────────────────────────────────
EngineRegistry.register({
        kind: 'zip-url',
        labelKey: 'eng.zipurl.label',
        icon: '📦',
        capabilities: {
                // incremental: false — каждый sync скачивает архив целиком
                // (хотя manifest берётся без распаковки — но объем не отличается).
                incremental: false,
                // testConnection: true — W3-T04 реализован: HEAD + Range-хвост →
                // парсинг EOCD/central directory без полного скачивания.
                testConnection: true,
        },
        settingsSchema: [
                {
                        key: 'vaultUrl',
                        type: 'url',
                        labelKey: 'eng.zipurl.vaultUrl',
                        required: true,
                        placeholderKey: 'eng.zipurl.placeholder',
                },
        ],
        create: (values, ctx) => {
                // url — публичная ссылка на архив (Dropbox/GDrive/Nextcloud/прямая).
                // downloader — обязательное поле ZipUrlSourceOptions; берём из ctx.
                // [W3-T03] onProgress + messages инъектируются через ctx
                // (main.ts передаёт колбэк для statusBar.setState + i18n-ошибки).
                // [W3-T04] rangeTransport инъектируется через ctx — для лёгкой
                // проверки соединения (HEAD + Range-хвост). main.ts передаёт
                // NodeZipRangeTransport на десктопе; undefined на мобайле →
                // ZipUrlSource.testConnection() идёт fallback full (полное скачивание).
                return new ZipUrlSource({
                        url: () => String(values.vaultUrl ?? ''),
                        downloader: ctx!.archiveDownloader!, // main.ts (W3-T03) передаст реальный
                        onProgress: ctx?.onProgress,
                        messages: ctx?.messages as Partial<import('../sources/zip-url-source').ZipUrlSourceMessages> | undefined,
                        log: ctx?.log,
                        rangeTransport: ctx?.rangeTransport,
                        // [W6-T01] TTL сессионного архива для мягкого dispose. main.ts передаёт
                        // 5 минут в engineCtx(); 0 по умолчанию = eager dispose (старое поведение).
                        sessionTtlMs: ctx?.zipSessionTtlMs ?? 0,
                });
        },
        makeSourceId: (values) => {
                return `zip-url_${djb2(String(values.vaultUrl ?? ''))}`;
        },
});

// 4. GDRIVE — [W6-T03] нативный движок Google Drive ───────────────────
// Раньше GDrive ходил через ZIP-движок = полное перекачивание на каждый
// sync. Теперь — нативный инкрементальный движок через Drive API v3
// (files.list + alt=media). Д11: порядок новых движков по priority —
// Google Drive нативный → git-семья → WebDAV.
EngineRegistry.register({
        kind: 'gdrive',
        labelKey: 'eng.gdrive.label',
        icon: '📁',
        // [P0/P0-6] экспериментальный: движок добавлен в W6, не прошёл
        // боевого smoke-теста против реального Drive API (пост-аудит §3).
        experimental: true,
        capabilities: {
                auth: true,         // apiKey required
                etag: false,        // GDrive не отдаёт ETag для listings
                mtime: true,        // modifiedTime в метаданных
                incremental: true,  // files.list + alt=media — без полного скачивания
                testConnection: false, // пока не реализовано (можно добавить позже)
        },
        settingsSchema: [
                {
                        key: 'apiKey',
                        type: 'secret',
                        labelKey: 'eng.gdrive.apiKey',
                        helpKey: 'eng.gdrive.apiKeyHelp',
                        required: true,
                        // secret: true — accessToken-like маркер для sourceId-фабрики
                        // (apiKey НЕ входит в djb2-хэш sourceId — иначе ротация ключа
                        // = у пользователя полный re-download, инвариант 3).
                        secret: true,
                },
                {
                        key: 'folderId',
                        type: 'text',
                        labelKey: 'eng.gdrive.folderId',
                        helpKey: 'eng.gdrive.folderIdHelp',
                        // required: false — пустой = весь Drive пользователя (медленно на больших).
                        placeholderKey: 'eng.gdrive.folderIdPlaceholder',
                },
                {
                        key: 'includeDocs',
                        type: 'toggle',
                        labelKey: 'eng.gdrive.includeDocs',
                        helpKey: 'eng.gdrive.includeDocsHelp',
                        // default: false — Google Docs/Sheets/Slides пропускаются по умолчанию.
                        default: false,
                },
        ],
        create: (values, ctx) => {
                return new GDriveSource({
                        config: () => ({
                                apiKey: String(values.apiKey ?? ''),
                                folderId: typeof values.folderId === 'string' ? values.folderId : undefined,
                                includeDocs: values.includeDocs === true,
                        }),
                        transport: ctx?.transport,
                        onRateLimitWait: ctx?.onRateLimitWait,
                        messages: ctx?.messages as Partial<import('../sources/gdrive-source').GDriveSourceMessages> | undefined,
                });
        },
        makeSourceId: (values) => {
                // Публичный идентификатор: apiKey НЕ входит (инвариант 3 — ротация
                // ключа не должна менять sourceId → у пользователя не должен быть
                // re-download). folderId входит (разные папки = разные кэши).
                // [overhaul S1 / H-6+M-9] ИСКЛЮЧЕНИЕ: пустой folderId («весь Drive»)
                // раньше давал КОНСТАНТНЫЙ sourceId для всех аккаунтов → при смене
                // apiKey дифф шёл против ЧУЖОГО кэша. Идентичность аккаунта в этом
                // случае несёт djb2(apiKey): сам ключ уже лежит в data.json plaintext
                // (норма Obsidian-плагинов) — 8 hex-символов хэша новой экспозиции
                // не добавляют, а ротация ключа при пустом folderId = одноразовый
                // re-download вместо тихой порчи. folderId непустой → глобально
                // уникален в рамках аккаунта, apiKey по-прежнему НЕ входит.
                const folderId = typeof values.folderId === 'string' && values.folderId.trim() !== ''
                        ? values.folderId.trim()
                        : '';
                const apiKey = typeof values.apiKey === 'string' ? values.apiKey.trim() : '';
                const accountPart = folderId === '' && apiKey !== '' ? djb2(apiKey) : '';
                return `gdrive_${djb2(`${accountPart}|${folderId}`)}`;
        },
});

// 5. WEBDAV — [W6-T05] нативный движок WebDAV ────────────────────────
// Самый частый self-hosted сценарий «хозяйский vault без GitHub» (план
// §8.4 аудита). PROPFIND + GET с Basic auth. Д11: порядок новых движков
// по priority — Google Drive нативный → git-семья → WebDAV.
EngineRegistry.register({
        kind: 'webdav',
        labelKey: 'eng.webdav.label',
        icon: '🌐',
        // [P0/P0-6] экспериментальный: движок добавлен в W6, не прошёл
        // боевого smoke-теста против реальных WebDAV-серверов (пост-аудит §3).
        experimental: true,
        capabilities: {
                auth: true,         // Basic auth required (user+pass)
                etag: true,         // ETag в PROPFIND-ответе (если сервер отдаёт)
                mtime: true,        // getlastmodified в метаданных
                incremental: true,  // PROPFIND + GET — без полного скачивания
                testConnection: false, // пока не реализовано
        },
        settingsSchema: [
                {
                        key: 'baseUrl',
                        type: 'url',
                        labelKey: 'eng.webdav.baseUrl',
                        helpKey: 'eng.webdav.baseUrlHelp',
                        required: true,
                        placeholderKey: 'eng.webdav.baseUrlPlaceholder',
                },
                {
                        key: 'username',
                        type: 'text',
                        labelKey: 'eng.webdav.username',
                        helpKey: 'eng.webdav.usernameHelp',
                        required: true,
                },
                {
                        key: 'password',
                        type: 'secret',
                        labelKey: 'eng.webdav.password',
                        helpKey: 'eng.webdav.passwordHelp',
                        required: false, // public WebDAV (без auth) возможен
                        secret: true,
                },
                {
                        key: 'rootPath',
                        type: 'text',
                        labelKey: 'eng.webdav.rootPath',
                        helpKey: 'eng.webdav.rootPathHelp',
                        placeholderKey: 'eng.webdav.rootPathPlaceholder',
                },
        ],
        create: (values, ctx) => {
                return new WebDavSource({
                        config: () => ({
                                baseUrl: String(values.baseUrl ?? ''),
                                username: String(values.username ?? ''),
                                password: String(values.password ?? ''),
                                rootPath: typeof values.rootPath === 'string' ? values.rootPath : undefined,
                        }),
                        transport: ctx?.transport,
                        messages: ctx?.messages as Partial<import('../sources/webdav-source').WebDavSourceMessages> | undefined,
                });
        },
        makeSourceId: (values) => {
                // Публичный идентификатор: baseUrl + username + [overhaul S1/H-6] rootPath.
                // password НЕ входит (инвариант 3 — ротация пароля не меняет sourceId).
                // [overhaul S1/H-6] rootPath ОБЯЗАН входить: он определяет, ЧЬИ данные
                // качаются; раньше смена rootPath оставляла старый кэш → дифф против
                // чужого множества файлов → массовые «изменения» + зеркальные удаления.
                // Цена: одноразовый полный re-download у пользователей с настроенным
                // rootPath (честнее молчаливой порчи). Пустой rootPath — прежний формат
                // (двухкомпонентный) — кэш пользователей без rootPath не мигрирует.
                const baseUrl = String(values.baseUrl ?? '').trim().replace(/\/+$/, '');
                const username = String(values.username ?? '').trim();
                const rootPath = typeof values.rootPath === 'string'
                        ? values.rootPath.trim().replace(/^[\/]+|[\/]+$/g, '')
                        : '';
                return `webdav_${djb2(rootPath ? `${baseUrl}|${username}|${rootPath}` : `${baseUrl}|${username}`)}`;
        },
});
