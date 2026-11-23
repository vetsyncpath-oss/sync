import { chunkSize, processChunks } from "./transfer";
import {
  type ConfigScope,
  legacyConfig,
  emptyConfigDirectory,
} from "./config-scope";
import { settingsHash, type Projection } from "./json-overlay";
import { RunBudget, transient } from "./runtime";
import { folderIncluded } from "./content-scope";
import { selected, volatility } from "./classifier";
import {
  safe,
  fold,
  hash,
  parent,
  type Scope,
  type Snapshot,
  type StorageProvider,
} from "./model";
export class PathIssue extends Error {
  constructor(
    code: string,
    readonly path: string,
  ) {
    super(code);
  }
}
export interface ScanStats {
  files: number;
  read: number;
  reused: number;
  folders: number;
}
export const newStats = (): ScanStats => ({
  files: 0,
  read: 0,
  reused: 0,
  folders: 0,
});
export class DigestCache {
  private dirty = new Map<string, { version: string; hash: string } | null>();
  private loaded = false;
  constructor(
    private db?: import("./device-database").DeviceDatabase,
    private device = "",
  ) {}
  async load() {
    if (!this.db || this.loaded) return;
    this.loaded = true;
    try {
      for (const [k, v] of await this.db.readDigests(this.device))
        if (
          typeof k === "string" &&
          v &&
          typeof v.version === "string" &&
          /^[0-9a-f]{64}$/.test(v.hash)
        )
          this.items.set(k, v);
    } catch {
      /* Cache availability never gates synchronization. */
    }
  }
  async flush() {
    if (!this.db || !this.dirty.size) return;
    const changes = this.dirty;
    this.dirty = new Map();
    try {
      await this.db.writeDigests(this.device, changes);
    } catch {
      /* A later cold scan safely rebuilds missing entries. */
    }
  }
  private items = new Map<string, { version: string; hash: string }>();
  get(key: string, version: string) {
    const v = this.items.get(key);
    return v?.version === version ? v.hash : undefined;
  }
  put(key: string, version: string, digest: string) {
    if (this.items.size >= 100000 && !this.items.has(key)) {
      const oldest = this.items.keys().next().value!;
      this.items.delete(oldest);
      if (this.db) this.dirty.set(oldest, null);
    }
    const value = { version, hash: digest };
    this.items.set(key, value);
    if (this.db) this.dirty.set(key, value);
  }
}
export async function scan(
  provider: StorageProvider,
  scope: Scope,
  configDir: string,
  self: string,
  skipHotTarget = false,
  budget = new RunBudget(),
  accept: ((path: string) => boolean) & {
    directory?: (path: string) => boolean;
  } = () => true,
  maxMiB = 0,
  config?: ConfigScope,
  projection?: Projection,
  options: {
    content?: import("./content-scope").ContentScope;
    stats?: ScanStats;
    tick?: () => void;
    cache?: DigestCache;
    thorough?: boolean;
  } = {},
): Promise<Snapshot> {
  const managedDirectories = new Set<string>(),
    occupiedDirectories = new Set<string>();
  const snap: Snapshot = {
    managedDirectories,
    occupiedDirectories,
    files: new Map(),
    directories: new Set(),
    complete: false,
    skipped: new Map(),
  };
  let processed = 0;
  const todo = [""],
    seen = new Map<string, string>();
  if ((await budget.io(() => provider.stat("")))?.type !== "folder")
    throw Error("missingRoot");
  while (todo.length) {
    options.tick?.();
    if (options.stats) options.stats.folders++;
    const dir = todo.pop()!;
    const list = await budget
      .io(() => provider.list(dir))
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === "readTimeout")
          throw new PathIssue("readTimeout", dir || "/");
        throw e;
      });
    if (
      dir &&
      !list.files.length &&
      !list.folders.length &&
      !list.skipped?.length &&
      accept(dir) &&
      (scope === "content"
        ? !options.content || folderIncluded(dir, options.content)
        : emptyConfigDirectory(dir, config ?? legacyConfig()))
    )
      managedDirectories.add(dir);
    for (const path of list.skipped ?? []) {
      if (parent(path) !== dir) throw Error("path");
      snap.skipped!.set(path, "filter");
    }
    for (const [paths, isDir] of [
      [list.files, false],
      [list.folders, true],
    ] as const) {
      for (const p of paths) {
        if (++processed % 256 === 0)
          await new Promise<void>((r) => setTimeout(r, 0));
        options.tick?.();
        if (parent(p) !== dir) throw Error("path");
        if (isDir && accept.directory && !accept.directory(p)) {
          snap.skipped!.set(p, "filter");
          continue;
        }
        if (
          !selected(p, scope, configDir, self, isDir, config, options.content)
        ) {
          occupiedDirectories.add(dir);
          snap.skipped!.set(p, "filter");
          continue;
        }
        if (
          projection?.blocked.includes(fold(p.split("/")[1] ?? "")) &&
          p.startsWith("plugins/")
        ) {
          occupiedDirectories.add(dir);
          snap.skipped!.set(p, "filter");
          continue;
        }
        if (!safe(p)) {
          snap.skipped!.set(p, "badPath");
          continue;
        }
        const alias = seen.get(fold(p));
        if (alias !== undefined) {
          snap.skipped!.set(alias, "collision");
          snap.skipped!.set(p, "collision");
          continue;
        }
        seen.set(fold(p), p);
        if (isDir) {
          snap.directories.add(p);
          todo.push(p);
          continue;
        }
        if (!accept(p)) {
          snap.skipped!.set(p, "filter");
          continue;
        }
        try {
          if (options.stats) options.stats.files++;
          const stat = await budget.io(() =>
            provider.scanStat ? provider.scanStat(p) : provider.stat(p),
          );
          if (stat?.type !== "file") throw Error("incomplete");
          if (maxMiB > 0 && stat.size > maxMiB * 1048576) {
            snap.skipped!.set(p, "filter");
            continue;
          }
          const kind = volatility(p, scope);
          if (kind === "H" && skipHotTarget) {
            snap.files.set(p, {
              hash: "",
              size: stat.size,
              mtime: stat.mtime,
              kind,
            });
            continue;
          }
          const cacheKey = JSON.stringify([provider.id, p]);
          const community =
            scope === "content" &&
            p.toLowerCase() ===
              configDir.toLowerCase() + "/community-plugins.json";
          const policy = community
            ? { rules: [], blocked: [], self }
            : projection;
          const name = community ? "community-plugins.json" : p;
          // Only raw hashes are shared. Semantic settings projections depend on the profile.
          const known =
            !options.thorough &&
            !policy &&
            (stat.sha256 ||
              (stat.version && options.cache?.get(cacheKey, stat.version)));
          if (known) {
            snap.files.set(p, {
              rawHash: known,
              hash: known,
              size: stat.size,
              mtime: stat.mtime,
              kind,
            });
            if (options.stats) options.stats.reused++;
            continue;
          }
          if (options.stats) options.stats.read++;
          const file =
            !policy && stat.size > chunkSize
              ? provider.chunkSource?.(p, stat.size)
              : undefined;
          let rawHash, semantic;
          if (!policy && provider.readDigest)
            rawHash = await budget.io((progress) =>
              provider.readDigest!(p, stat.size, progress),
            );
          else if (file)
            rawHash = await budget.io((progress) =>
              processChunks(file, undefined, progress),
            );
          else {
            const bytes = await budget.io((progress) =>
              provider.download(p, progress),
            );
            if (bytes.byteLength !== stat.size) throw Error("incomplete");
            rawHash = await hash(bytes);
            if (policy) semantic = await settingsHash(name, bytes, policy);
          }
          if (!policy && stat.version)
            options.cache?.put(cacheKey, stat.version, rawHash);
          snap.files.set(p, {
            rawHash,
            hash: semantic ?? rawHash,
            size: stat.size,
            mtime: stat.mtime,
            kind,
          });
        } catch (e) {
          if (
            (projection ||
              p.toLowerCase() ===
                configDir.toLowerCase() + "/community-plugins.json") &&
            (e instanceof SyntaxError ||
              e instanceof TypeError ||
              (e instanceof Error && e.message === "invalidConfig"))
          ) {
            snap.skipped!.set(p, "invalidConfig");
            continue;
          }
          if (
            e &&
            typeof e === "object" &&
            "code" in e &&
            e.code === "ENOENT"
          ) {
            snap.skipped!.set(p, "unstable");
            continue;
          }
          if (e instanceof Error && e.message === "readTimeout")
            throw new PathIssue("readTimeout", p);
          if (!transient(e)) throw e;
          snap.skipped!.set(p, "locked");
        }
      }
    }
  }
  for (const p of [...managedDirectories, ...snap.files.keys()]) {
    for (let d = parent(p); d; d = parent(d)) managedDirectories.add(d);
  }
  for (const p of snap.skipped!.keys()) occupiedDirectories.add(parent(p));
  snap.complete = true;
  return snap;
}
