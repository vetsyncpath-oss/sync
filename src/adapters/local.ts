import type { App } from "obsidian";
import { lstat, open, rename } from "node:fs/promises";
import { join as fsJoin } from "node:path";
import { syncDirectory } from "./state-file";
import type { FileInfo, Snapshot, Store } from "../core/model";
import {
  path,
  join,
  sha,
  protectedPath,
  uniquePaths,
  type ScanRules,
} from "../core/paths";
export class LocalStore implements Store {
  writable = true;
  trashSupported = true;
  identity: string;
  constructor(
    private app: App,
    private root: string,
    private limit: number,
    private rules?: ScanRules,
  ) {
    path(root, true);
    this.identity = "vault:" + app.vault.getName() + ":" + root;
  }
  private full(p: string) {
    return join(this.root, path(p));
  }
  private async safe(relative: string) {
    const a = this.app.vault.adapter as typeof this.app.vault.adapter & {
      getBasePath?(): string;
    };
    if (!a.getBasePath)
      throw Error("Нужен файловый адаптер настольного Obsidian");
    let current = a.getBasePath();
    for (const part of relative.split("/").filter(Boolean)) {
      current = fsJoin(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw Error("Символическая ссылка в локальном пути: " + relative);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
    }
  }
  async scan(signal: AbortSignal): Promise<Snapshot> {
    const files: Record<string, FileInfo> = Object.create(null),
      directories: string[] = [],
      warnings: string[] = [];
    const adapter = this.app.vault.adapter;
    const walk = async (folder: string) => {
      signal.throwIfAborted();
      const full = join(this.root, folder);
      await this.safe(full);
      if (!(await adapter.exists(full))) {
        if (!folder) return;
        throw Error("Папка исчезла при обходе");
      }
      const list = await adapter.list(full);
      for (const f of list.files) {
        const rel = this.root ? f.slice(this.root.length + 1) : f;
        if (
          protectedPath(f, this.app.vault.configDir) ||
          (this.rules && !this.rules.file(rel))
        )
          continue;
        path(rel);
        const stat = await adapter.stat(f);
        if (!stat || stat.type !== "file") throw Error("Файл исчез при обходе");
        if (stat.size > this.limit) {
          files[rel] = {
            path: rel,
            size: stat.size,
            hash: "oversize:" + stat.size,
            version: `${stat.mtime}:${stat.size}`,
          };
          continue;
        }
        files[rel] = await this.inspect(rel, signal);
      }
      for (const f of list.folders)
        if (
          !protectedPath(f, this.app.vault.configDir) &&
          (!this.rules ||
            this.rules.folder(this.root ? f.slice(this.root.length + 1) : f))
        ) {
          const rel = this.root ? f.slice(this.root.length + 1) : f;
          directories.push(rel);
          await walk(rel);
        }
    };
    await walk("");
    uniquePaths([...Object.keys(files), ...directories]);
    return {
      files,
      directories,
      complete: true,
      warnings,
      identity: this.identity,
    };
  }
  async inspect(p: string, signal: AbortSignal): Promise<FileInfo> {
    signal.throwIfAborted();
    const full = this.full(p),
      a = this.app.vault.adapter;
    await this.safe(full);
    const before = await a.stat(full);
    if (!before || before.type !== "file") throw Error("Файл недоступен: " + p);
    if (before.size > this.limit) throw Error("Файл превышает лимит: " + p);
    const b = new Uint8Array(await a.readBinary(full));
    const after = await a.stat(full);
    if (!after || after.size !== before.size || after.mtime !== before.mtime)
      throw Error("Файл изменился при чтении: " + p);
    return {
      path: p,
      hash: sha(b),
      size: b.length,
      mtime: before.mtime,
      version: sha(b),
    };
  }
  async read(f: FileInfo, signal: AbortSignal) {
    await this.safe(this.full(f.path));
    const b = new Uint8Array(
      await this.app.vault.adapter.readBinary(this.full(f.path)),
    );
    signal.throwIfAborted();
    if (sha(b) !== f.hash) throw Error("Локальный файл изменился: " + f.path);
    return b;
  }
  private async check(
    p: string,
    expected: FileInfo | undefined,
    signal: AbortSignal,
  ) {
    await this.safe(this.full(p));
    const exists = await this.app.vault.adapter.exists(this.full(p));
    if (!expected) {
      if (exists) throw Error("Файл появился после планирования: " + p);
    } else if (
      !exists ||
      (await this.inspect(p, signal)).hash !== expected.hash
    )
      throw Error("Локальная версия изменилась: " + p);
  }
  async write(
    p: string,
    b: Uint8Array,
    expected: FileInfo | undefined,
    mtime: number | undefined,
    signal: AbortSignal,
  ) {
    const full = this.full(p);
    if (protectedPath(full, this.app.vault.configDir))
      throw Error("Служебный путь защищён");
    await this.check(p, expected, signal);
    await ensureDir(this.app, full.split("/").slice(0, -1).join("/"));
    const temp = ".sync-studio/stage/" + crypto.randomUUID();
    await this.safe(temp);
    await ensureDir(this.app, ".sync-studio/stage");
    try {
      await this.app.vault.adapter.writeBinary(
        temp,
        Uint8Array.from(b).buffer,
        mtime ? { mtime } : undefined,
      );
      if (
        sha(new Uint8Array(await this.app.vault.adapter.readBinary(temp))) !==
        sha(b)
      )
        throw Error("Проверка временного файла не прошла");
      const adapter = this.app.vault
        .adapter as typeof this.app.vault.adapter & { getBasePath(): string };
      const vaultRoot = adapter.getBasePath();
      const staged = await open(fsJoin(vaultRoot, temp), "r");
      try {
        await staged.sync();
      } finally {
        await staged.close();
      }
      await this.check(p, expected, signal);
      signal.throwIfAborted();
      // DataAdapter.rename is a move API and may reject an existing target.
      // Replace atomically on the same filesystem; Obsidian's filesystem watcher
      // observes the final path, including hidden configuration files.
      await rename(fsJoin(vaultRoot, temp), fsJoin(vaultRoot, full));
      await syncDirectory(
        fsJoin(vaultRoot, full.split("/").slice(0, -1).join("/")),
      );
    } finally {
      if (await this.app.vault.adapter.exists(temp))
        await this.app.vault.adapter.remove(temp);
    }
    return this.inspect(p, signal);
  }
  async delete(f: FileInfo, trash: boolean, signal: AbortSignal) {
    await this.check(f.path, f, signal);
    const full = this.full(f.path);
    if (protectedPath(full, this.app.vault.configDir))
      throw Error("Служебный путь защищён");
    const file = this.app.vault.getFileByPath(full);
    if (file) {
      if (trash) await this.app.vault.trash(file, false);
      else await this.app.vault.delete(file);
    } else if (trash) await this.app.vault.adapter.trashLocal(full);
    else await this.app.vault.adapter.remove(full);
  }
}
export async function ensureDir(app: App, p: string) {
  if (!p) return;
  let at = "";
  for (const part of p.split("/")) {
    at = join(at, part);
    if (!(await app.vault.adapter.exists(at)))
      await app.vault.adapter.mkdir(at);
  }
}
export async function writeBackup(
  app: App,
  destination: string,
  bytes: Uint8Array,
) {
  path(destination);
  const adapter = app.vault.adapter as typeof app.vault.adapter & {
    getBasePath(): string;
  };
  const root = adapter.getBasePath();
  let current = root;
  for (const part of destination.split("/")) {
    current = fsJoin(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw Error("Ссылка в пути резервной копии");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") break;
      throw e;
    }
  }
  await ensureDir(app, destination.split("/").slice(0, -1).join("/"));
  if (await adapter.exists(destination)) {
    if (
      sha(new Uint8Array(await adapter.readBinary(destination))) !== sha(bytes)
    )
      throw Error("Путь резервной копии занят другой версией");
    return;
  }
  await adapter.writeBinary(destination, Uint8Array.from(bytes).buffer);
  const file = await open(fsJoin(root, destination), "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
  await syncDirectory(
    fsJoin(root, destination.split("/").slice(0, -1).join("/")),
  );
}
