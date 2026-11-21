import { selected } from "./classifier";
import { TFile, type DataAdapter, type Vault } from "obsidian";
import {
  checked,
  join,
  parent,
  under,
  fold,
  type Bytes,
  type StorageProvider,
  type Scope,
} from "./model";
import type { ArtifactStore } from "./state";
async function ensure(adapter: DataAdapter, dir: string) {
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
export class VaultArtifacts implements ArtifactStore {
  constructor(
    private adapter: DataAdapter,
    readonly root: string,
  ) {}
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
  ) {
    if (root) checked(root);
    if (under(fold(root), fold(join(vault.configDir, "plugins/" + self))))
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
    return p ? join(this.root, checked(p)) : this.root;
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
      !selected(p, this.scope, this.vault.configDir, this.self, directory)
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
      if (!this.vault.getAbstractFileByPath(path))
        await this.vault.createFolder(path);
    } else await ensure(this.vault.adapter, path);
  }
  async upload(p: string, b: Bytes, mtime?: number) {
    const path = this.writable(p),
      options = Number.isFinite(mtime) ? { mtime } : undefined;
    if (this.indexed(path)) {
      const parts = p.split("/");
      let at = "";
      for (const part of parts.slice(0, -1)) {
        at = join(at, part);
        await this.mkdir(at);
      }
      const file = this.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        await this.vault.modifyBinary(file, b, options);
        return;
      }
      if (file || (await this.vault.adapter.exists(path)))
        throw Error("indexPending");
      await this.vault.createBinary(path, b, options);
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
    if (!this.indexed(path)) {
      await this.vault.adapter.trashLocal(path);
      return;
    }
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw Error("indexPending");
    await this.vault.trash(file, false);
  }
  async move(from: string, to: string) {
    const a = this.writable(from),
      b = this.writable(to);
    if (await this.vault.adapter.exists(b)) throw Error("collision");
    if (this.indexed(a)) {
      const f = this.vault.getAbstractFileByPath(a);
      if (!(f instanceof TFile)) throw Error("indexPending");
      await this.vault.rename(f, b);
    } else await this.vault.adapter.rename(a, b);
  }
  async getRevision() {
    return null;
  }
}
