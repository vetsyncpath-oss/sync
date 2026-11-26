import { managerId } from "./vam-gate";
import { processChunks, type ChunkSource } from "./transfer";
import type { ConfigScope } from "./config-scope";
import { selected } from "./classifier";
import {
  FileSystemAdapter,
  TFile,
  type DataAdapter,
  type Vault,
} from "obsidian";
import {
  checked,
  hash,
  type Profile,
  join,
  parent,
  under,
  fold,
  type Bytes,
  type StorageProvider,
  type Scope,
} from "./model";
import type { ArtifactStore } from "./state";
export async function ensure(adapter: DataAdapter, dir: string) {
  if (!dir) return;
  const stat = await adapter.stat(dir);
  if (stat?.type === "folder") return;
  if (stat) throw Error("collision");
  await ensure(adapter, parent(dir));
  try {
    await adapter.mkdir(dir);
  } catch (e) {
    if ((await adapter.stat(dir))?.type !== "folder") throw e;
  }
}
function desktopFile(
  adapter: DataAdapter,
  path: string,
  size: number,
): ChunkSource | undefined {
  if (!(adapter instanceof FileSystemAdapter)) return undefined;
  const fs: typeof import("node:fs/promises") = require("node:fs/promises");
  const full = adapter.getFullPath(path);
  return {
    size,
    async read(offset, length) {
      const h = await fs.open(full, "r");
      try {
        if ((await h.stat()).size !== size) throw Error("referenceChanged");
        const buffer = new Uint8Array(length);
        let done = 0;
        while (done < length) {
          const { bytesRead } = await h.read(
            buffer,
            done,
            length - done,
            offset + done,
          );
          if (!bytesRead) throw Error("incomplete");
          done += bytesRead;
        }
        return buffer.buffer;
      } finally {
        await h.close();
      }
    },
  };
}
export class VaultArtifacts implements ArtifactStore {
  constructor(
    private adapter: DataAdapter,
    readonly root: string,
  ) {
    if (adapter instanceof FileSystemAdapter) {
      this.putChunks = async (p, file, progress) => {
        const path = this.path(p);
        await ensure(adapter, parent(path));
        const fs: typeof import("node:fs/promises") = require("node:fs/promises");
        const full = adapter.getFullPath(path);
        const tmp = full + ".tmp-" + crypto.randomUUID();
        const space = await fs.statfs(adapter.getFullPath(parent(path)));
        if (space.bavail * space.bsize < file.size) throw Error("diskSpace");
        const h = await fs.open(tmp, "wx");
        try {
          let digest;
          try {
            digest = await processChunks(
              file,
              async (bytes) => {
                await h.writeFile(new Uint8Array(bytes));
              },
              progress,
            );
          } finally {
            await h.close();
          }
          if (await adapter.exists(path)) throw Error("state");
          await fs.rename(tmp, full);
          return digest;
        } finally {
          await fs.rm(tmp, { force: true });
        }
      };
    }
  }
  readonly putChunks?: ArtifactStore["putChunks"];
  chunkSource(p: string, size: number) {
    return desktopFile(this.adapter, this.path(p), size);
  }
  private path(p: string) {
    return join(this.root, checked(p));
  }
  async putNew(p: string, b: Bytes) {
    const path = this.path(p);
    await ensure(this.adapter, parent(path));
    if (await this.adapter.exists(path)) throw Error("state");
    const tmp = path + ".tmp-" + crypto.randomUUID();
    await this.adapter.writeBinary(tmp, b);
    try {
      await this.adapter.rename(tmp, path);
    } finally {
      if (await this.adapter.exists(tmp)) await this.adapter.remove(tmp);
    }
  }
  read(p: string) {
    return this.adapter.readBinary(this.path(p));
  }
  has(p: string) {
    return this.adapter.exists(this.path(p));
  }
  async dirs() {
    if (!(await this.adapter.exists(this.root))) return [];
    return (await this.adapter.list(this.root)).folders.map((p) =>
      p.slice(this.root.length + 1),
    );
  }
  async removeTree(p: string) {
    if (await this.has(p)) await this.adapter.rmdir(this.path(p), true);
  }
}
export class LocalProvider implements StorageProvider {
  readonly id: string;
  readonly capabilities;
  constructor(
    private vault: Vault,
    readonly root: string,
    private self: string,
    private scope: Scope,
    readOnly = false,
    private policy: Pick<Profile, "trash" | "trashDays"> = {
      trash: "vault",
      trashDays: 30,
    },
    private ownWrite?: (path: string, digest: string | null) => void,
    private config?: ConfigScope,
    readonly withFilePaused?: StorageProvider["withFilePaused"],
    private content?: Profile["content"],
    private systemCall?: (method:string,args:unknown[])=>Promise<unknown>,
  ) {
    if (root) checked(root);
    if (
      [managerId, self].some((id) =>
        under(fold(root), fold(join(vault.configDir, "plugins/" + id))),
      )
    )
      throw Error("protected");
    this.id = "vault:" + root;
    this.capabilities = {
      readOnly,
      supportsChecksum: false,
      supportsChangesFeed: false,
      maxFileSize: Infinity,
      rateLimits: null,
    };
  }
  private path(p: string) {
    const full = p ? join(this.root, checked(p)) : this.root;
    if (
      under(
        fold(full),
        fold(join(this.vault.configDir, "plugins/" + managerId)),
      )
    )
      throw Error("protected");
    return full;
  }
  private indexed(path: string) {
    return (
      !under(fold(path), fold(this.vault.configDir)) &&
      !path.split("/").some((s) => s.startsWith("."))
    );
  }
  private writable(p: string, directory = false) {
    if (
      this.capabilities.readOnly ||
      !selected(
        p,
        this.scope,
        this.vault.configDir,
        this.self,
        directory,
        this.config,
        this.content,
      )
    )
      throw Error("protected");
    const path = this.path(p);
    if (
      under(
        fold(path),
        fold(join(this.vault.configDir, "plugins/" + this.self)),
      )
    )
      throw Error("protected");
    return path;
  }
  private call(method:"createFolder"|"modifyBinary"|"createBinary"|"rename"|"delete"|"trash", ...args:unknown[]) {
    return this.systemCall ? this.systemCall(method,args) : Reflect.apply(this.vault[method],this.vault,args);
  }
  async list(p: string) {
    const data = await this.vault.adapter.list(this.path(p) || "/");
    const rel = (f: string) => {
      if (this.root && !f.startsWith(this.root + "/")) throw Error("path");
      return this.root ? f.slice(this.root.length + 1) : f;
    };
    return { files: data.files.map(rel), folders: data.folders.map(rel) };
  }
  async stat(p: string) {
    if (!this.root && !p) return { type: "folder" as const, size: 0, mtime: 0 };
    return this.vault.adapter.stat(this.path(p));
  }
  chunkSource(p: string, size: number) {
    return desktopFile(this.vault.adapter, this.path(p), size);
  }
  async scanStat(p: string) {
    const a = this.vault.adapter;
    if (!(a instanceof FileSystemAdapter)) return this.stat(p);
    const fs: typeof import("node:fs/promises") = require("node:fs/promises");
    const s = await fs.stat(a.getFullPath(this.path(p)), { bigint: true });
    return {
      type: s.isDirectory() ? ("folder" as const) : ("file" as const),
      size: Number(s.size),
      mtime: Number(s.mtimeMs),
      version: [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join("/"),
    };
  }
  async download(p: string) {
    const path = this.path(p),
      file = this.vault.getAbstractFileByPath(path);
    return file instanceof TFile && this.indexed(path)
      ? this.vault.readBinary(file)
      : this.vault.adapter.readBinary(path);
  }
  async mkdir(p: string) {
    const path = this.writable(p, true);
    if (this.indexed(path)) {
      const stat = await this.vault.adapter.stat(path);
      if (stat?.type === "folder") return;
      if (stat) throw Error("collision");
      if (this.vault.getAbstractFileByPath(path)) throw Error("indexPending");
      await this.call("createFolder",path);
    } else await ensure(this.vault.adapter, path);
  }
  async upload(p: string, b: Bytes, mtime?: number) {
    const path = this.writable(p),
      options = Number.isFinite(mtime) ? { mtime } : undefined;
    if (this.ownWrite) this.ownWrite(path, await hash(b));
    if (this.indexed(path)) {
      const parts = p.split("/");
      let at = "";
      for (const part of parts.slice(0, -1)) {
        at = join(at, part);
        await this.mkdir(at);
      }
      const file = this.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        await this.call("modifyBinary",file, b, options);
        return;
      }
      if (file || (await this.vault.adapter.exists(path)))
        throw Error("indexPending");
      await this.call("createBinary",path, b, options);
      return;
    }
    await ensure(this.vault.adapter, parent(path));
    // Obsidian adapters reject rename onto an existing destination. The journal
    // already holds its before-image, including for a partially completed write.
    if (await this.vault.adapter.exists(path)) {
      await this.vault.adapter.writeBinary(path, b, options);
      return;
    }
    const staging = join(
      this.vault.configDir,
      "plugins/" + this.self + "/runtime/tmp",
    );
    await ensure(this.vault.adapter, staging);
    const tmp = join(staging, crypto.randomUUID());
    await this.vault.adapter.writeBinary(tmp, b, options);
    try {
      await this.vault.adapter.rename(tmp, path);
    } finally {
      if (await this.vault.adapter.exists(tmp))
        await this.vault.adapter.remove(tmp);
    }
  }
  async delete(p: string) {
    const path = this.writable(p);
    if ((await this.stat(p))?.type !== "file") throw Error("collision");
    const a = this.vault.adapter;
    this.ownWrite?.(path, null);
    const file = this.indexed(path)
      ? this.vault.getAbstractFileByPath(path)
      : null;
    if (this.indexed(path) && !(file instanceof TFile))
      throw Error("indexPending");
    switch (this.policy.trash) {
      case "plugin": {
        const expires = Date.now() + this.policy.trashDays * 86400000;
        const dest = join(
          join(this.vault.configDir, "plugins/" + this.self + "/runtime/trash"),
          expires + "-" + crypto.randomUUID() + "/" + path,
        );
        await ensure(a, parent(dest));
        if (file) await this.call("rename",file, dest);
        else await a.rename(path, dest);
        break;
      }
      case "permanent":
        if (file) await this.call("delete",file);
        else await a.remove(path);
        break;
      case "system":
        if (!(await a.trashSystem(path))) throw Error("trashUnavailable");
        break;
      case "vault":
        if (file) await this.call("trash",file, false);
        else await a.trashLocal(path);
        break;
    }
  }
  async removeEmptyDir(p: string) {
    checked(p);
    const path = this.writable(p, true),
      a = this.vault.adapter;
    const listed = await a.list(path);
    if (listed.files.length || listed.folders.length) return false;
    try {
      if (a instanceof FileSystemAdapter) {
        // Desktop adapters may implement rmdir(false) via fs.rm, which rejects
        // even empty directories. The native rmdir checks emptiness atomically.
        const fs: typeof import("node:fs/promises") = require("node:fs/promises");
        const paths: typeof import("node:path") = require("node:path");
        const full = a.getFullPath(path),
          base = await fs.realpath(a.getBasePath());
        if (
          paths.relative(paths.join(base, path), await fs.realpath(full)) !== ""
        )
          return false;
        await fs.rmdir(full);
      } else await a.rmdir(path, false);
    } catch (e) {
      if (e instanceof Error && /\b(ENOTEMPTY|EEXIST)\b/.test(e.message))
        return false;
      const s = await a.stat(path);
      if (!s) return true;
      if (s.type === "folder") {
        const now = await a.list(path);
        if (now.files.length || now.folders.length) return false;
      }
      throw e;
    }
    this.ownWrite?.(path, null);
    return true;
  }
  async move(from: string, to: string) {
    const a = this.writable(from),
      b = this.writable(to);
    if (await this.vault.adapter.exists(b)) throw Error("collision");
    if (this.indexed(a)) {
      const f = this.vault.getAbstractFileByPath(a);
      if (!(f instanceof TFile)) throw Error("indexPending");
      await this.call("rename",f, b);
    } else await this.vault.adapter.rename(a, b);
  }
  async getRevision() {
    return null;
  }
}
