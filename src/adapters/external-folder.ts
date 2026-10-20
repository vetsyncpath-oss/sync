import { readdir, lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join as fsJoin } from "node:path";
import type { Store, FileInfo, Snapshot } from "../core/model";
import {
  path,
  join,
  sha,
  uniquePaths,
  protectedPath,
  type ScanRules,
} from "../core/paths";
/** An explicitly selected external folder is strictly read-only. Symlinks are never followed. */
export class ExternalFolder implements Store {
  writable = false;
  trashSupported = false;
  identity: string;
  constructor(
    private root: string,
    private limit: number,
    private rules?: ScanRules,
  ) {
    if (!isAbsolute(root)) throw Error("Укажите абсолютный путь внешней папки");
    this.identity = "external-folder:" + root;
  }
  private async safe(p: string) {
    path(p, true);
    let current = this.root;
    if ((await lstat(current)).isSymbolicLink())
      throw Error("Корень источника не может быть символической ссылкой");
    for (const part of p.split("/").filter(Boolean)) {
      current = fsJoin(current, part);
      if ((await lstat(current)).isSymbolicLink())
        throw Error("Символическая ссылка пропущена: " + p);
    }
    return current;
  }
  async scan(signal: AbortSignal): Promise<Snapshot> {
    const files: Record<string, FileInfo> = Object.create(null),
      rootReal = await realpath(this.root),
      directories: string[] = [];
    this.identity = "external-folder:" + rootReal;
    const walk = async (base: string) => {
      signal.throwIfAborted();
      const dir = await this.safe(base);
      for (const item of await readdir(dir, { withFileTypes: true })) {
        const rel = join(base, item.name);
        if (protectedPath(rel, ".obsidian")) continue;
        if (
          item.isDirectory()
            ? this.rules && !this.rules.folder(rel)
            : this.rules && !this.rules.file(rel)
        )
          continue;
        path(rel);
        if (item.isSymbolicLink())
          throw Error("Источник содержит символическую ссылку: " + rel);
        if (item.isDirectory()) {
          directories.push(rel);
          await walk(rel);
        } else if (item.isFile()) {
          const stat = await lstat(await this.safe(rel));
          if (stat.size > this.limit)
            files[rel] = {
              path: rel,
              hash: "oversize:" + stat.size,
              version: String(stat.mtimeMs),
              size: stat.size,
            };
          else {
            const b = await readFile(await this.safe(rel));
            const after = await lstat(await this.safe(rel));
            if (stat.mtimeMs !== after.mtimeMs || stat.size !== after.size)
              throw Error("Внешний файл изменился во время чтения");
            files[rel] = {
              path: rel,
              hash: sha(b),
              version: sha(b),
              size: stat.size,
              mtime: stat.mtimeMs,
            };
          }
        } else throw Error("Неподдерживаемый тип файла: " + rel);
      }
    };
    await walk("");
    uniquePaths([...Object.keys(files), ...directories]);
    return {
      files,
      directories,
      identity: this.identity,
      complete: true,
      warnings: [],
    };
  }
  async read(f: FileInfo, signal: AbortSignal) {
    signal.throwIfAborted();
    const file = await this.safe(f.path);
    if ((await lstat(file)).size > this.limit)
      throw Error("Внешний файл превысил лимит");
    const b = await readFile(file);
    if (sha(b) !== f.hash) throw Error("Внешний файл изменился");
    return b;
  }
  async write(): Promise<FileInfo> {
    throw Error("Внешняя папка — только источник");
  }
  async delete(): Promise<void> {
    throw Error("Внешняя папка — только источник");
  }
}
