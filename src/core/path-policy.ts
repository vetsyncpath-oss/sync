// PathPolicy — политика путей синхронизации (фаза 3, задача 3-8).
//
// ПОРТ из src/main.ts (дословно): функция isPathSafe(), метод isPathAllowed()
// + folderMatch(), константы BLOCKED_EXTENSIONS / SCRIPT_EXTENSIONS. main.ts
// НЕ изменялся (портирование = чтение) — со временем главный агент переключит
// его на этот модуль.
//
// РАСШИРЕНИЯ против main.ts (аудит БЗ-04, дизайн §7.5/§9.4):
//   1) isPathSafe знает Windows-зарезервированные имена (CON, PRN, AUX, NUL,
//      COM1..COM9, LPT1..LPT9) — раньше 'notes/CON' проходил валидацию, а
//      запись на Windows молча падала с невнятной ошибкой файловой системы;
//   2) isPathAllowed первым делом отклоняет конфликт-копии (*.conflict-*):
//      они не синхронизируются ни в одну сторону (§9.4). Как orphan они не
//      удаляются автоматически: diff работает по кэшу, конфликт-копий в нём
//      нет (забота вызывающего — не класть их в кэш);
//   3) obsidian'овский normalizePath заменён локальной normalize (ядро core/
//      не импортирует obsidian/node, решение В5-1). Поведение приведено к
//      normalizePath ПОЛНОСТЬЮ (фикс 3-8а от главного агента): срезает ведущий/
//      хвостовой '/' — иначе 'logs/' в игнор-листе переставал матчиться, а
//      '/.git/config' проходил бизнес-фильтр (отклонение от поведения main.ts,
//      замеченное при ревью волны B).
//
// Инвариант порта: isPathSafe и isPathAllowed НЕ зависят друг от друга —
// как в main.ts, где удалённое дерево фильтруется обоими, а кэш — только
// isPathAllowed.

import { resolveFileRule, type FileRule } from './file-rules';
import { destinationIsRouted } from './source-bindings';
import type { FolderPolicy } from './policy';
/** Опции политики путей (в main.ts — поля settings). */
export interface PathPolicyOptions {
        syncMode: 'config-only' | 'full-vault';
        allowedFolders: string;    // многострочник
        ignoredFolders: string;    // многострочник
        allowPlugins: boolean;
        allowSnippets: boolean;
        /** Local runtime/state directories excluded independently of user presets. */
        protectedPaths?: readonly string[];
        executionSources?: { ids: string[]; defaultSource?: string; rules: FileRule[]; folders?:FolderPolicy[] };
}

/** Расширения, не синхронизируемые никогда (порт из main.ts). */
const BLOCKED_EXTENSIONS: readonly string[] = [
        '.exe', '.dll', '.sh', '.bat', '.cmd',
        '.ps1', '.vbs', '.php', '.jar',
        '.py', '.rb', '.app', '.com', '.scr',
        '.msi', '.cpl', '.wsf', '.hta'
];

/** Скриптовые расширения — только по явному разрешению (порт из main.ts). */
const SCRIPT_EXTENSIONS: readonly string[] = ['.js', '.mjs', '.wasm'];

/**
 * [3-8а] Windows-зарезервированные имена устройств: 'CON.md' или папка
 * 'notes/aux' на Windows либо не создаётся, либо резолвится в устройство —
 * запись падает с невнятной ошибкой. Проверяется базовое имя (до первой
 * точки) КАЖДОГО сегмента пути, без учёта регистра.
 */
const WINDOWS_RESERVED_NAMES: ReadonlySet<string> = new Set([
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/** [3-8а] Есть ли среди сегментов пути Windows-зарезервированное базовое имя? */
function hasWindowsReservedName(path: string): boolean {
        return path.split('/').some((segment) => {
                if (!segment) return false;
                const dot = segment.indexOf('.');
                const base = dot > 0 ? segment.slice(0, dot) : segment;
                return WINDOWS_RESERVED_NAMES.has(base.toUpperCase());
        });
}

export class PathPolicy {
        /** Алиасы модульных констант (контракт требует static; значения — порт из main.ts). */
        static readonly BLOCKED_EXTENSIONS: readonly string[] = BLOCKED_EXTENSIONS;
        static readonly SCRIPT_EXTENSIONS: readonly string[] = SCRIPT_EXTENSIONS;

        private readonly opts: PathPolicyOptions;

        constructor(opts: PathPolicyOptions) {
                // Защитная копия: политика фиксирует снимок настроек на момент
                // создания (в main.ts isPathAllowed читал живой this.settings).
                this.opts = { ...opts, protectedPaths: [...(opts.protectedPaths ?? [])], executionSources: opts.executionSources && structuredClone(opts.executionSources) };
        }
        snapshot(): PathPolicy { return new PathPolicy(this.opts); }
        forSources(ids: readonly string[], defaultSource: string | undefined, rules: readonly FileRule[],folders:readonly FolderPolicy[]=[]): PathPolicy {
                return new PathPolicy({ ...this.opts, executionSources: { ids: [...ids], defaultSource, rules: structuredClone([...rules]),folders:structuredClone([...folders]) } });
        }

        /**
         * Структурная безопасность: '..', null-byte, абсолютный путь, 'C:',
         * backslash, Windows-зарезервированные имена. Работает с СЫРОЙ строкой
         * (как в main.ts): URI-декодируется, но НЕ нормализуется — обратный
         * слэш здесь сам по себе повод для отказа. Сознательно консервативно:
         *reject'ится любая подстрока '..' (в т.ч. 'ok..fine.md').
         */
        isPathSafe(path: string): boolean {
                let decoded = path;
                try { decoded = decodeURIComponent(path); } catch { /* ignore */ }
                if (decoded.includes('..')) return false;
                if (decoded.includes('\0')) return false;
                if (decoded.startsWith('/')) return false;
                if (decoded.match(/^[A-Za-z]:/)) return false;
                if (decoded.includes('\\')) return false;
                // [3-8а] Windows-зарезервированные имена ('CON', 'con.md', 'notes/aux/...').
                if (hasWindowsReservedName(decoded)) return false;
                return true;
        }

        /**
         * Бизнес-правила: конфликт-копии, расширения, режим, фильтры папок,
         * скрипты. НЕ вызывает isPathSafe (порт: как в main.ts безопасность —
         * отдельная ответственность вызывающего до записи на диск).
         */
        isPathAllowed(rawPath: string): boolean {
                if (!this.isInventoryPathAllowed(rawPath)) return false;
                const run = this.opts.executionSources;
                if (run) {
                        const owner = resolveFileRule(this.normalize(rawPath), run.rules).source ?? run.defaultSource;
                        if (!owner || !run.ids.includes(owner)) return false;
                        if(!destinationIsRouted(this.normalize(rawPath),run.rules,run.defaultSource,run.folders))return false;
                }
                return true;
        }

        /** Raw inventory paths are routed before the final destination's run ownership is checked. */
        isInventoryPathAllowed(rawPath: string): boolean {
                const path = this.normalize(rawPath);
                if (this.isProtectedPath(path)) return false;
                // [3-8б] Конфликт-копии не синхронизируются ни в одну сторону —
                // проверка ПЕРВОЙ, до любых флагов и режимов (дизайн §9.4).
                if (this.isConflictCopy(path)) return false;
                const filename = path.split('/').pop() || '';
                const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
                if (BLOCKED_EXTENSIONS.includes(ext)) return false;
                if (this.opts.syncMode === 'config-only') {
                        if (!path.startsWith('.obsidian/')) return false;
                } else {
                        if (path.startsWith('.git/')) return false;
                        if (this.opts.ignoredFolders) {
                                const ignored = this.opts.ignoredFolders.split('\n').map(p => p.trim()).filter(p => p);
                                if (this.folderMatch(path, ignored)) return false;
                        }
                        if (this.opts.allowedFolders) {
                                const allowed = this.opts.allowedFolders.split('\n').map(p => p.trim()).filter(p => p);
                                if (allowed.length > 0 && !this.folderMatch(path, allowed)) return false;
                        }
                }
                if (SCRIPT_EXTENSIONS.includes(ext)) {
                        const isPluginFolder = path.startsWith('.obsidian/plugins/');
                        const isSnippet = path.startsWith('.obsidian/snippets/');
                        const isTheme = path.startsWith('.obsidian/themes/');
                        if (isPluginFolder && this.opts.allowPlugins) return true;
                        if ((isSnippet || isTheme) && this.opts.allowSnippets) return true;
                        return false;
                }
                return true;
        }

        /** Runtime protection covers case/Unicode aliases on portable vaults. */
        isProtectedPath(rawPath: string): boolean {
                const path = this.normalize(rawPath).normalize('NFC').toLowerCase();
                return (this.opts.protectedPaths ?? []).some(raw => {
                        const protectedPath = this.normalize(raw).normalize('NFC').toLowerCase();
                        return protectedPath !== '' && (path === protectedPath || path.startsWith(protectedPath + '/'));
                });
        }

        /** Конфликт-копия: имя файла (сегмент пути) содержит '.conflict-'. */
        isConflictCopy(path: string): boolean {
                return /(^|\/)[^\/]+\.conflict-/.test(path);
        }

        /**
         * Локальный аналог obsidian'овского normalizePath (адаптация 3-8):
         * обратные слэши → прямые, схлопывание повторных '/', трим.
         */
        private normalize(raw: string): string {
                return raw
                        .replace(/\\/g, '/')
                        .replace(/\/+/g, '/')
                        .replace(/^\/+|\/+$/g, '')
                        .trim();
        }

        /** Порт folderMatch из main.ts (каждая запись списка нормализуется). */
        private folderMatch(path: string, folders: string[]): boolean {
                return folders.some(folder => {
                        const normalizedFolder = this.normalize(folder);
                        return path === normalizedFolder || path.startsWith(normalizedFolder + '/');
                });
        }
}
