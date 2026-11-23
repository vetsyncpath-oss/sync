import { hash, join, fold, type Bytes, type StorageProvider } from "./model";
import { md5 } from "@noble/hashes/legacy";
import { bytesToHex } from "@noble/hashes/utils";
export interface RemoteItem {
  key: string;
  name: string;
  type: "file" | "folder" | "skip";
  size: number;
  mtime: number;
  md5?: string;
  sha256?: string;
  resourceKey?: string;
}
export interface RemoteTree {
  root: () => Promise<RemoteItem>;
  children: (dir: RemoteItem) => Promise<RemoteItem[]>;
  read: (item: RemoteItem, progress?: () => void) => Promise<Bytes>;
  revision?: () => Promise<string | null>;
  size?: (item: RemoteItem) => Promise<number>;
}
export const rootItem = (key: string): RemoteItem => ({
  key,
  name: "",
  type: "folder",
  size: 0,
  mtime: 0,
});
export function fileName(v: unknown): string {
  if (
    typeof v !== "string" ||
    !v ||
    v === "." ||
    v === ".." ||
    /[/\\\0]/.test(v)
  )
    throw Error("remoteName");
  return v;
}
export function sizeOf(v: unknown) {
  if (!(typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))))
    throw Error("incomplete");
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw Error("incomplete");
  return n;
}
// An instance represents one listing pass. Pages only become visible after the
// entire directory succeeds. A new run gets a new tree and metadata cache.
export class PublicStore implements StorageProvider {
  readonly capabilities = {
    readOnly: true,
    canRemoveEmptyDirs: false,
    supportsChecksum: false,
    supportsChangesFeed: false,
    maxFileSize: Infinity,
    rateLimits: null,
  };
  protected dirs = new Map<string, Promise<Map<string, RemoteItem>>>();
  private root?: Promise<RemoteItem>;
  constructor(
    readonly id: string,
    private tree: RemoteTree,
    private prefix = "",
  ) {}
  reset() {
    this.dirs.clear();
    this.root = undefined;
  }
  private entries(dir: RemoteItem) {
    let reading = this.dirs.get(dir.key);
    if (!reading) {
      reading = this.tree.children(dir).then((items) => {
        const out = new Map<string, RemoteItem>();
        for (const item of items) {
          const name = fileName(item.name);
          if (out.has(name)) throw Error("collision");
          out.set(name, item);
        }
        return out;
      });
      this.dirs.set(dir.key, reading);
      reading.catch(() => this.dirs.delete(dir.key));
    }
    return reading;
  }
  protected async find(path: string) {
    this.root ??= this.tree.root().catch((e) => {
      this.root = undefined;
      throw e;
    });
    let dir = await this.root;
    const ancestors = new Set([dir.key]);
    for (const name of join(this.prefix, path).split("/").filter(Boolean)) {
      if (dir.type !== "folder") return null;
      const node = (await this.entries(dir)).get(name);
      if (!node) return null;
      if (node.type === "folder" && ancestors.has(node.key))
        throw Error("collision");
      ancestors.add(node.key);
      dir = node;
    }
    return dir;
  }
  async list(path: string) {
    const dir = await this.find(path);
    if (dir?.type !== "folder") throw Error("missingRoot");
    const files: string[] = [],
      folders: string[] = [],
      skipped: string[] = [];
    for (const v of (await this.entries(dir)).values())
      (v.type === "folder"
        ? folders
        : v.type === "file"
          ? files
          : skipped
      ).push(join(path, v.name));
    return { files, folders, skipped };
  }
  async stat(path: string) {
    const v = await this.find(path);
    if (!v || v.type === "skip") return null;
    if (v.type === "file" && v.size === -1 && this.tree.size)
      v.size = await this.tree.size(v);
    return {
      type: v.type,
      size: v.size,
      mtime: v.mtime,
      sha256: v.sha256,
      version: v.sha256 ?? v.md5,
    };
  }
  async download(path: string, progress?: () => void) {
    const v = await this.find(path);
    if (v?.type !== "file") throw Error("incomplete");
    const bytes = await this.tree.read(v, progress);
    if (
      (v.size >= 0 && bytes.byteLength !== v.size) ||
      (v.sha256 && (await hash(bytes)) !== v.sha256) ||
      (v.md5 && bytesToHex(md5(new Uint8Array(bytes))) !== v.md5)
    )
      throw Error("referenceChanged");
    return bytes;
  }
  async confirmAbsent(paths: string[]) {
    // Re-list cloud parents immediately before applying deletes. An ambiguous
    // Windows spelling or an unsupported ancestor may hide the original path.
    const fresh = new PublicStore(this.id, this.tree, this.prefix);
    const indices = new Map<string, Map<string, RemoteItem[]>>();
    const base = await fresh.find("");
    for (const path of paths) {
      if (base?.type !== "folder") throw Error("missingRoot");
      let dir = base;
      const parts = path.split("/");
      for (const [position, name] of parts.entries()) {
        if (dir.type !== "folder") throw Error("referenceChanged");
        let index = indices.get(dir.key);
        if (!index) {
          index = new Map();
          indices.set(dir.key, index);
          for (const node of (await fresh.entries(dir)).values()) {
            const key = fold(node.name).replace(/[. ]+$/, ""),
              matches = index.get(key);
            if (matches) matches.push(node);
            else index.set(key, [node]);
          }
        }
        const matches = index.get(fold(name)) ?? [];
        if (!matches.length) break;
        if (matches.length !== 1 || matches[0].name !== name)
          throw Error("referenceChanged");
        dir = matches[0];
        if (dir.type !== "folder" || position === parts.length - 1)
          throw Error("referenceChanged");
      }
    }
  }
  async getRevision() {
    return this.tree.revision?.() ?? null;
  }
  async upload(_path?: string, _bytes?: Bytes, _mtime?: number): Promise<void> {
    throw Error("readonly");
  }
  async delete(_path?: string): Promise<void> {
    throw Error("readonly");
  }
  async mkdir(_path?: string): Promise<void> {
    throw Error("readonly");
  }
  async removeEmptyDir(_path: string): Promise<boolean> {
    throw Error("readonly");
  }
  async move(_from?: string, _to?: string): Promise<void> {
    throw Error("readonly");
  }
}
