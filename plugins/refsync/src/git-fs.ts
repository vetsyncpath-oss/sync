import type { DataAdapter } from "obsidian";
import { join, safe } from "./model";

const failure = (code: string) => Object.assign(new Error(code), { code });
// Git paths are virtual and must stay inside this repository's private cache.
export function gitFs(adapter: DataAdapter, cacheRoot: string) {
  const path = (p: string) => {
    if (p === "/") return cacheRoot;
    const rel = p.replace(/^\//, "");
    if (!safe(rel) || !["db", "work"].includes(rel.split("/")[0]))
      throw failure("EINVAL");
    return join(cacheRoot, rel);
  };
  const info = async (p: string) => {
    const s = await adapter.stat(path(p));
    if (!s) throw failure("ENOENT");
    return s;
  };
  const stat = async (p: string) => {
    const s = await info(p);
    return {
      ...s,
      mtimeMs: s.mtime,
      ctimeMs: s.ctime,
      mtime: new Date(s.mtime),
      ctime: new Date(s.ctime),
      mode: s.type === "folder" ? 0o40755 : 0o100644,
      isDirectory: () => s.type === "folder",
      isFile: () => s.type === "file",
      isSymbolicLink: () => false,
    };
  };
  const unsupported = async () => {
    throw failure("ENOSYS");
  };
  return {
    promises: {
      stat,
      lstat: stat,
      readlink: unsupported,
      symlink: unsupported,
      chmod: unsupported,
      async readFile(p: string, opts?: string | { encoding?: string }) {
        if ((await info(p)).type !== "file") throw failure("EISDIR");
        return (typeof opts === "string" ? opts : opts?.encoding)
          ? adapter.read(path(p))
          : new Uint8Array(await adapter.readBinary(path(p)));
      },
      async writeFile(p: string, data: string | Uint8Array) {
        if (typeof data === "string") await adapter.write(path(p), data);
        else await adapter.writeBinary(path(p), Uint8Array.from(data).buffer);
      },
      async mkdir(p: string) {
        if (await adapter.exists(path(p))) throw failure("EEXIST");
        await adapter.mkdir(path(p));
      },
      async readdir(p: string) {
        if ((await info(p)).type !== "folder") throw failure("ENOTDIR");
        const list = await adapter.list(path(p));
        return [...list.files, ...list.folders].map((s) =>
          s.slice(path(p).length + 1),
        );
      },
      async rmdir(p: string) {
        await info(p);
        await adapter.rmdir(path(p), false);
      },
      async unlink(p: string) {
        await info(p);
        await adapter.remove(path(p));
      },
    },
  };
}
