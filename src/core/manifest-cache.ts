// src/core/manifest-cache.ts — кэш манифеста источника (фаза 3, задача 3-6).
// Фикс С-01 аудита: кэш «путь→хэш» тысяч файлов живёт в отдельном файле
// manifest-<sourceId>.json с атомарной записью (tmp → rename), а НЕ в
// data.json настроек плагина (формат и размещение — дизайн §8.1).
// Ядро не импортирует obsidian/node — только FileSystem из sources/types.

import type { CacheEntries, CacheEntry, FileSystem } from '../sources/types';

/** Версия формата файла кэша (дизайн §8.1). */
const CACHE_VERSION = 1;

const FILE_PREFIX = 'manifest-';
const FILE_SUFFIX = '.json';
const BAK_SUFFIX = '.json.bak';
const TMP_SUFFIX = '.json.tmp';

/** Содержимое файла manifest-<sourceId>.json (дизайн §8.1). */
export interface ManifestCacheFile {
        version: 1;
        sourceId: string;
        generatedAt: number;
        entries: CacheEntries;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
        return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidCacheEntry(v: unknown): v is CacheEntry {
        if (!isPlainObject(v)) return false;
        // Контракт-ревизия 3-7: 'git-sha1' тоже валиден (ревью 3-review: ISSUE C1).
        // [P2/M9] 'weak'/'etag' валидны: слабая идентичность gdrive/webdav
        // кэшируется честно. Старые кэши 3.x с ложным 'sha256' у weak-токенов
        // НЕ инвалидируются схемой: diff увидит alg-мисматч с новым честным
        // 'weak' → одна повторная загрузка записи → кэш самоисцеляется.
        return typeof v.h === 'string' && typeof v.s === 'number'
                && (v.alg === 'sha256' || v.alg === 'crc32' || v.alg === 'git-sha1'
                        || v.alg === 'weak' || v.alg === 'etag');
}

/**
 * Строгий разбор содержимого файла кэша. Бросает исключение на любом
 * отклонении от формата (битый JSON, чужая версия, чужой sourceId,
 * кривая запись) — вызывающие стороны решают, чем это заменить.
 */
function parseCacheFile(raw: string, expectedSourceId: string): CacheEntries {
        const parsed: unknown = JSON.parse(raw); // SyntaxError на битом JSON
        if (!isPlainObject(parsed)) {
                throw new Error('manifest cache: root is not an object');
        }
        if (parsed.version !== CACHE_VERSION) {
                throw new Error(`manifest cache: unsupported version ${JSON.stringify(parsed.version)}`);
        }
        if (parsed.sourceId !== expectedSourceId) {
                throw new Error('manifest cache: sourceId mismatch');
        }
        const entries: unknown = parsed.entries;
        if (!isPlainObject(entries)) {
                throw new Error('manifest cache: entries is not an object');
        }
        for (const path of Object.keys(entries)) {
                if (!isValidCacheEntry(entries[path])) {
                        throw new Error(`manifest cache: invalid entry "${path}"`);
                }
        }
        return entries as CacheEntries;
}

/** Выделить id источника из имени файла кэша; null — если файл не кэш. */
function parseCacheFileId(name: string): string | null {
        if (!name.startsWith(FILE_PREFIX)) return null;
        if (name.endsWith(BAK_SUFFIX)) {
                return name.slice(FILE_PREFIX.length, name.length - BAK_SUFFIX.length) || null;
        }
        // [W1-T03/BUG-14] .tmp-остаток аварийно прерванного flush — тоже файл
        // кэша: распознаём id, чтобы GC мог его собрать (раньше такие файлы
        // копились в configDir вечно).
        if (name.endsWith(TMP_SUFFIX)) {
                return name.slice(FILE_PREFIX.length, name.length - TMP_SUFFIX.length) || null;
        }
        if (name.endsWith(FILE_SUFFIX)) {
                return name.slice(FILE_PREFIX.length, name.length - FILE_SUFFIX.length) || null;
        }
        return null;
}

/** In-memory кэш манифеста одного источника с атомарной записью на диск. */
export class ManifestCache {
        private readonly fs: FileSystem;
        private readonly sourceId: string;
        private cache: CacheEntries = {};
        private ioChain: Promise<void> = Promise.resolve();

        private serialize<T>(operation: () => Promise<T>): Promise<T> {
                const result = this.ioChain.then(operation);
                this.ioChain = result.then(() => {}, () => {});
                return result;
        }

        constructor(fs: FileSystem, sourceId: string) {
                this.fs = fs;
                this.sourceId = sourceId;
        }
        get namespace(): string { return this.sourceId; }

        /** manifest-<sourceId>.json */
        private get finalPath(): string {
                return `${FILE_PREFIX}${this.sourceId}${FILE_SUFFIX}`;
        }

        /** manifest-<sourceId>.json.bak */
        private get bakPath(): string {
                return `${FILE_PREFIX}${this.sourceId}${BAK_SUFFIX}`;
        }

        /** manifest-<sourceId>.json.tmp (временный файл атомарной записи) */
        private get tmpPath(): string {
                return `${FILE_PREFIX}${this.sourceId}${TMP_SUFFIX}`;
        }

        /**
         * Загрузка с диска; битый/отсутствующий JSON → пустой кэш (in-memory).
         * Полностью заменяет текущее in-memory состояние. Возвращает копию.
         */
        async load(): Promise<CacheEntries> {
                const raw = await this.fs.read(this.finalPath);
                if (raw === null) {
                        this.cache = {};
                } else {
                        try {
                                this.cache = parseCacheFile(raw, this.sourceId);
                        } catch {
                                this.cache = {};
                        }
                }
                return this.entries();
        }

        get(path: string): CacheEntry | undefined {
                const entry = this.cache[path];
                return entry === undefined ? undefined : { ...entry };
        }

        set(path: string, entry: CacheEntry): void {
                this.cache[path] = { ...entry };
        }

        delete(path: string): void {
                delete this.cache[path];
        }

        /** Текущее in-memory состояние (копия; ссылку наружу не отдаём). */
        entries(): CacheEntries {
                const copy: CacheEntries = {};
                for (const path of Object.keys(this.cache)) {
                        copy[path] = { ...this.cache[path] };
                }
                return copy;
        }

        /**
         * Атомарная запись на диск: write(tmp) → rename(tmp, final).
         * Если процесс умрёт между write и rename — останется только tmp,
         * финальный файл не повреждён. generatedAt = Date.now().
         */
        async flush(): Promise<void> {
                const file: ManifestCacheFile = {
                        version: CACHE_VERSION,
                        sourceId: this.sourceId,
                        generatedAt: Date.now(),
                        entries: this.entries(),
                };
                const json = JSON.stringify(file);
                await this.serialize(async () => {
                        await this.fs.write(this.tmpPath, json);
                        await this.fs.rename(this.tmpPath, this.finalPath);
                });
        }

        /**
         * Бэкап текущего файла в .bak (если существует; rename заменяет старый
         * .bak), затем очистка in-memory + flush пустого кэша.
         */
        async reset(): Promise<void> {
                if (await this.fs.exists(this.finalPath)) {
                        await this.fs.rename(this.finalPath, this.bakPath);
                }
                this.cache = {};
                await this.flush();
        }

        /**
         * Восстановление из .bak, если есть; true — если восстановлен.
         * Битый .bak → false, ничего не ломаем (файл и in-memory не трогаем).
         */
        async restoreBackup(): Promise<boolean> {
                const raw = await this.fs.read(this.bakPath);
                if (raw === null) return false;
                let restored: CacheEntries;
                try {
                        restored = parseCacheFile(raw, this.sourceId);
                } catch {
                        return false;
                }
                this.cache = restored;
                await this.fs.rename(this.bakPath, this.finalPath);
                return true;
        }
}

/**
 * GC старых кэшей: удаляет manifest-<id>.json (и их .bak), чей id НЕ входит
 * в keep. Возвращает число удалённых кэшей (по одному на устаревший id).
 * Посторонние файлы не трогаются. [W1-T03/BUG-14] .tmp-остатки аварийных
 * flush тоже собираются: tmp чужих/устаревших id удаляется, tmp текущего
 * источника (id в keep) остаётся — безопасно, следующий flush перезапишет
 * его (write(tmp) идёт до rename).
 */
export async function gcManifestCaches(fs: FileSystem, keep: ReadonlySet<string>): Promise<number> {
        const names = await fs.list();
        const staleIds = new Set<string>();
        const staleFiles: string[] = [];
        for (const name of names) {
                const id = parseCacheFileId(name);
                if (id === null || keep.has(id)) continue;
                staleIds.add(id);
                staleFiles.push(name);
        }
        for (const name of staleFiles) {
                await fs.remove(name);
        }
        return staleIds.size;
}
