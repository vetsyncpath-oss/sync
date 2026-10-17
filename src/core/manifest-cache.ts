// src/core/manifest-cache.ts — кэш манифеста источника (фаза 3, задача 3-6).
// Фикс С-01 аудита: кэш «путь→хэш» тысяч файлов живёт в отдельном файле
// manifest-<sourceId>.json с проверенной публикацией и сохранением предыдущей версии, а НЕ в
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
        return Object.assign(Object.create(null), entries) as CacheEntries;
}

/** Выделить id источника из имени файла кэша; null — если файл не кэш. */
function parseCacheFileId(name: string): string | null {
        if (!name.startsWith(FILE_PREFIX)) return null;
        if(name.endsWith('.previous'))return parseCacheFileId(name.slice(0,-9));
        if(name.endsWith('.bak.tmp'))return parseCacheFileId(name.slice(0,-4));
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

/** In-memory кэш с сериализованной восстанавливаемой публикацией. */
export class ManifestCache {
        private readonly fs: FileSystem;
        private readonly sourceId: string;
        private cache: CacheEntries = Object.create(null);
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

        /**
         * Загрузка с диска; битый/отсутствующий JSON → пустой кэш (in-memory).
         * Полностью заменяет текущее in-memory состояние. Возвращает копию.
         */
        async load(): Promise<CacheEntries> {
                const raw = await this.readPublished(this.finalPath);
                this.cache=raw===null?Object.create(null):parseCacheFile(raw,this.sourceId);
                return this.entries();
        }

        private async readPublished(path:string):Promise<string|null> {
                for(const candidate of [path,path+'.previous']) {
                        const raw=await this.fs.read(candidate);
                        if(raw!==null) { try {parseCacheFile(raw,this.sourceId);return raw;} catch { /* Try the last verified publication. */ } }
                }
                return null;
        }

        /** No rename-overwrite assumption. At every interruption a verified old or new
         * publication survives. Only cache metadata rotates; vault files are untouched. */
        private async publish(path:string,json:string):Promise<void> {
                const temp=path+'.tmp',previous=path+'.previous';
                await this.fs.write(temp,json);
                if(await this.fs.read(temp)!==json)throw new Error('Manifest cache temporary write verification failed');
                parseCacheFile(json,this.sourceId);
                if(await this.fs.exists(path)) {
                        const raw=await this.fs.read(path);
                        if(raw===null)throw new Error('Manifest cache disappeared during publication');
                        try {parseCacheFile(raw,this.sourceId);}
                        catch { const quarantine=path+'.corrupt-'+crypto.randomUUID();await this.fs.rename(path,quarantine);
                                await this.fs.rename(temp,path);if(await this.fs.read(path)!==json)throw Error('Manifest cache publication verification failed');return; }
                        if(await this.fs.exists(previous))await this.fs.remove(previous);
                        await this.fs.rename(path,previous);
                }
                await this.fs.rename(temp,path);
                if(await this.fs.read(path)!==json)throw new Error('Manifest cache publication verification failed');
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
                        // Preserve a normal snapshot object without invoking the __proto__ setter.
                        Object.defineProperty(copy, path, { value: { ...this.cache[path] }, enumerable: true, writable: true, configurable: true });
                }
                return copy;
        }

        /** Publish a snapshot while retaining the previous verified version. */
        async flush(): Promise<void> {
                const file: ManifestCacheFile = {
                        version: CACHE_VERSION,
                        sourceId: this.sourceId,
                        generatedAt: Date.now(),
                        entries: this.entries(),
                };
                const json = JSON.stringify(file);
                await this.serialize(async () => {
                        await this.publish(this.finalPath,json);
                });
        }

        /** Serialize backup and reset using the same recoverable publication protocol. */
        async reset(): Promise<void> {
                await this.serialize(async()=>{
                        const raw=await this.readPublished(this.finalPath);
                        if(raw!==null)await this.publish(this.bakPath,raw);
                        await this.publish(this.finalPath,JSON.stringify({version:CACHE_VERSION,sourceId:this.sourceId,generatedAt:Date.now(),entries:{}}));
                        this.cache=Object.create(null);
                });
        }

        async restoreBackup(): Promise<boolean> {
                return this.serialize(async()=>{
                        const raw=await this.readPublished(this.bakPath);
                        if(raw===null)return false;
                        await this.publish(this.finalPath,raw);
                        this.cache=parseCacheFile(raw,this.sourceId);
                        return true;
                });
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
