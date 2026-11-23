import {
  type Transport,
  type Reply,
  GoogleTree,
  check,
  json,
  record,
  digest,
} from "./public-cloud";
import {
  PublicStore,
  type RemoteTree,
  type RemoteItem,
  rootItem,
  fileName,
  sizeOf,
} from "./public-store";
import { hash, checked, parent, join, type Bytes } from "./model";
import type { CloudEngine } from "./accounts";
export interface CloudLocation {
  engine: CloudEngine;
  account: string;
  root: string;
}
export function cloudId(c: CloudLocation, prefix: string) {
  if (
    !c ||
    !["google", "yandex"].includes(c.engine) ||
    !/^([a-f0-9]{64})$/.test(c.account) ||
    typeof c.root !== "string" ||
    (c.engine === "google"
      ? !/^[\w-]+$/.test(c.root)
      : !["app:/", "disk:/"].includes(c.root))
  )
    throw Error("cloudLocation");
  if (prefix && prefix !== "/") checked(prefix);
  return JSON.stringify([
    "oauth",
    c.engine,
    c.account,
    c.root,
    prefix === "/" ? "" : prefix,
  ]);
}
interface MutableTree extends RemoteTree {
  createDir(parent: RemoteItem, name: string): Promise<void>;
  write(
    parent: RemoteItem,
    name: string,
    old: RemoteItem | null,
    bytes: Bytes,
    mtime?: number,
  ): Promise<void>;
  remove(item: RemoteItem): Promise<void>;
  relocate(
    item: RemoteItem,
    from: RemoteItem,
    to: RemoteItem,
    name: string,
  ): Promise<void>;
}
const body = (obj: unknown) =>
  new TextEncoder().encode(JSON.stringify(obj)).buffer;
const jsonHeader = { "Content-Type": "application/json" };
const api = "https://www.googleapis.com/drive/v3/files";
export class DriveTree extends GoogleTree implements MutableTree {
  constructor(
    private send: Transport,
    id: string,
    private cursor: DriveCursor = { token: "", revision: "" },
  ) {
    super(send, id, null, "");
  }
  revision() {
    return driveRevision(this.send, this.cursor);
  }
  async createDir(dir: RemoteItem, name: string) {
    check(
      await this.send(
        api + "?supportsAllDrives=true",
        "POST",
        jsonHeader,
        body({
          name,
          parents: [dir.key],
          mimeType: "application/vnd.google-apps.folder",
        }),
      ),
    );
  }
  async write(
    dir: RemoteItem,
    name: string,
    old: RemoteItem | null,
    bytes: Bytes,
    mtime?: number,
  ) {
    const url =
      "https://www.googleapis.com/upload/drive/v3/files" +
      (old ? "/" + old.key : "") +
      "?supportsAllDrives=true&uploadType=resumable";
    const start = check(
      await this.send(
        url,
        old ? "PATCH" : "POST",
        {
          ...jsonHeader,
          "X-Upload-Content-Type": "application/octet-stream",
          "X-Upload-Content-Length": String(bytes.byteLength),
        },
        body({
          name,
          ...(old ? {} : { parents: [dir.key] }),
          ...(Number.isFinite(mtime)
            ? { modifiedTime: new Date(mtime!).toISOString() }
            : {}),
        }),
      ),
    );
    const raw = Object.entries(start.headers).find(
      ([k]) => k.toLowerCase() === "location",
    )?.[1];
    if (!raw) throw Error("incomplete");
    const session = new URL(raw);
    if (
      session.origin !== "https://www.googleapis.com" ||
      !session.pathname.startsWith("/upload/drive/v3/")
    )
      throw Error("publicUrl");
    const size = bytes.byteLength,
      chunk = 8 * 1024 * 1024;
    let offset = 0;
    do {
      const end = Math.min(size, offset + chunk),
        headers: Record<string, string> = {
          "Content-Type": "application/octet-stream",
        };
      if (size) headers["Content-Range"] = `bytes ${offset}-${end - 1}/${size}`;
      const res = await this.send(
        session.href,
        "PUT",
        headers,
        bytes.slice(offset, end),
      );
      if (res.status !== 308) {
        check(res);
        if (end !== size) throw Error("incomplete");
        return;
      }
      const range = Object.entries(res.headers).find(
        ([k]) => k.toLowerCase() === "range",
      )?.[1];
      const last = range && /^bytes=0-(\d+)$/.exec(range);
      const next = last ? Number(last[1]) + 1 : 0;
      if (next <= offset || next > end || next >= size)
        throw Error("incomplete");
      offset = next;
    } while (offset < size);
    throw Error("incomplete");
  }
  async remove(item: RemoteItem) {
    check(
      await this.send(
        api + "/" + item.key + "?supportsAllDrives=true",
        "PATCH",
        jsonHeader,
        body({ trashed: true }),
      ),
    );
  }
  async relocate(
    item: RemoteItem,
    from: RemoteItem,
    to: RemoteItem,
    name: string,
  ) {
    const query = new URLSearchParams({ supportsAllDrives: "true" });
    if (from.key !== to.key) {
      query.set("addParents", to.key);
      query.set("removeParents", from.key);
    }
    check(
      await this.send(
        api + "/" + item.key + "?" + query,
        "PATCH",
        jsonHeader,
        body({ name }),
      ),
    );
  }
}
const ya = "https://cloud-api.yandex.net/v1/disk/";
function link(s: unknown, operation = false) {
  if (typeof s !== "string") throw Error("incomplete");
  const u = new URL(s);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (operation
      ? u.origin !== "https://cloud-api.yandex.net" ||
        !u.pathname.startsWith("/v1/disk/operations/")
      : !/(^|\.)(yandex\.(ru|net|com)|storage\.yandexcloud\.net)$/.test(
          u.hostname,
        ))
  )
    throw Error("publicUrl");
  return u.href;
}
export class DiskTree implements MutableTree {
  constructor(
    private auth: Transport,
    private direct: Transport,
    private base: string,
  ) {}
  private url(path: string, suffix = "", params: Record<string, string> = {}) {
    return (
      ya +
      "resources" +
      suffix +
      "?" +
      new URLSearchParams({ path: this.base + path, ...params })
    );
  }
  async root() {
    const d = await json(this.auth, this.url("", "", { fields: "type" }));
    if (d.type !== "dir") throw Error("missingRoot");
    return rootItem("");
  }
  async children(dir: RemoteItem) {
    const rows: RemoteItem[] = [];
    let total: number | undefined;
    do {
      const d = await json(
          this.auth,
          this.url(dir.key, "", {
            limit: "200",
            offset: String(rows.length),
            sort: "name",
          }),
        ),
        page = record(d._embedded);
      if (
        d.type !== "dir" ||
        !Array.isArray(page.items) ||
        page.offset !== rows.length ||
        typeof page.total !== "number" ||
        !Number.isSafeInteger(page.total) ||
        page.total < 0 ||
        (total !== undefined && total !== page.total) ||
        rows.length + page.items.length > page.total ||
        (!page.items.length && rows.length < page.total)
      )
        throw Error("incomplete");
      total = page.total;
      for (const v of page.items) {
        const f = record(v),
          name = fileName(f.name);
        if (f.type !== "dir" && f.type !== "file") throw Error("incomplete");
        rows.push({
          key: join(dir.key, name),
          name,
          type: f.type === "dir" ? "folder" : "file",
          size: f.type === "file" ? sizeOf(f.size) : 0,
          mtime: typeof f.modified === "string" ? Date.parse(f.modified) : 0,
          sha256: digest(f.sha256, 64),
          md5: digest(f.md5, 32),
        });
      }
    } while (rows.length < total);
    return rows;
  }
  async read(f: RemoteItem) {
    const d = await json(this.auth, this.url(f.key, "/download"));
    return check(await this.direct(link(d.href))).arrayBuffer;
  }
  private async finish(r: Reply) {
    check(r);
    if (r.status !== 202) return;
    const op = link(
      record(JSON.parse(new TextDecoder().decode(r.arrayBuffer))).href,
      true,
    );
    for (let i = 0; i < 90; i++) {
      const d = await json(this.auth, op);
      if (d.status === "success") return;
      if (d.status !== "in-progress") throw Error("remoteHttp");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw Error("remoteHttp");
  }
  async createDir(dir: RemoteItem, name: string) {
    await this.finish(await this.auth(this.url(join(dir.key, name)), "PUT"));
  }
  async write(
    dir: RemoteItem,
    name: string,
    old: RemoteItem | null,
    bytes: Bytes,
  ) {
    const d = await json(
      this.auth,
      this.url(join(dir.key, name), "/upload", { overwrite: String(!!old) }),
    );
    await this.finish(
      await this.direct(
        link(d.href),
        "PUT",
        { "Content-Type": "application/octet-stream" },
        bytes,
      ),
    );
  }
  async remove(f: RemoteItem) {
    await this.finish(
      await this.auth(this.url(f.key, "", { permanently: "false" }), "DELETE"),
    );
  }
  async relocate(
    f: RemoteItem,
    _from: RemoteItem,
    to: RemoteItem,
    name: string,
  ) {
    await this.finish(
      await this.auth(
        this.url(join(to.key, name), "/move", {
          from: this.base + f.key,
          overwrite: "false",
        }),
        "POST",
      ),
    );
  }
}
export class CloudStore extends PublicStore {
  constructor(
    id: string,
    private mutable: MutableTree,
    prefix: string,
    readOnly: boolean,
    private completeFolderAccess = true,
  ) {
    super(id, mutable, prefix);
    this.capabilities.readOnly = readOnly;
    this.capabilities.canRemoveEmptyDirs = !readOnly && completeFolderAccess;
    this.capabilities.supportsChecksum = true;
  }

  private async change(fn: () => Promise<void>) {
    if (this.capabilities.readOnly) throw Error("readonly");
    this.reset();
    try {
      await fn();
    } finally {
      this.reset();
    }
  }
  private async ensureDir(path: string): Promise<RemoteItem> {
    const node = await this.find(path);
    if (node?.type === "folder") return node;
    if (node || !path) throw Error(node ? "collision" : "missingRoot");
    const dir = await this.ensureDir(parent(path));
    await this.mutable.createDir(dir, path.split("/").at(-1)!);
    this.dirs.delete(dir.key);
    const made = await this.find(path);
    if (made?.type !== "folder") throw Error("incomplete");
    return made;
  }
  override async mkdir(path: string) {
    checked(path);
    await this.change(async () => {
      await this.ensureDir(path);
    });
  }
  override async upload(path: string, bytes: Bytes, mtime?: number) {
    checked(path);
    await this.change(async () => {
      const dir = await this.ensureDir(parent(path)),
        old = await this.find(path);
      if (old && old.type !== "file") throw Error("collision");
      await this.mutable.write(dir, path.split("/").at(-1)!, old, bytes, mtime);
      this.reset();
      const saved = await this.find(path);
      if (
        saved?.type !== "file" ||
        saved.size !== bytes.byteLength ||
        (saved.sha256 ?? (await hash(await this.download(path)))) !==
          (await hash(bytes))
      )
        throw Error("referenceChanged");
    });
  }
  override async removeEmptyDir(path: string) {
    checked(path);
    let removed = false;
    await this.change(async () => {
      if (!this.completeFolderAccess) return;
      const dir = await this.find(path);
      if (!dir) {
        removed = true;
        return;
      }
      if (dir.type !== "folder") throw Error("collision");
      // Inspect all children, including unsupported native documents and shortcuts.
      if ((await this.mutable.children(dir)).length) return;
      await this.mutable.remove(dir);
      removed = true;
    });
    return removed;
  }
  override async delete(path: string) {
    checked(path);
    await this.change(async () => {
      const node = await this.find(path);
      if (!node) return;
      if (node.type !== "file") throw Error("collision");
      await this.mutable.remove(node);
    });
  }
  override async move(from: string, to: string) {
    checked(from);
    checked(to);
    await this.change(async () => {
      const f = await this.find(from),
        src = await this.find(parent(from)),
        dst = await this.ensureDir(parent(to));
      if (f?.type !== "file" || !src || (await this.find(to)))
        throw Error("collision");
      await this.mutable.relocate(f, src, dst, to.split("/").at(-1)!);
    });
  }
}

// Drive cursors cover the account. A change outside the profile can cause an
// extra scan, but cannot suppress a change inside its configured folder.
export interface DriveCursor {
  token: string;
  revision: string;
}
export async function driveRevision(http: Transport, cursor: DriveCursor) {
  const base = "https://www.googleapis.com/drive/v3/changes";
  if (cursor.token) {
    let token = cursor.token,
      changed = false;
    const seen = new Set<string>();
    while (!seen.has(token)) {
      seen.add(token);
      const res = await http(
        base +
          "?" +
          new URLSearchParams({
            pageToken: token,
            spaces: "drive",
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
            fields: "nextPageToken,newStartPageToken,changes(fileId,removed)",
            pageSize: "1000",
          }),
      );
      if (res.status === 410) break;
      const d = record(
        JSON.parse(new TextDecoder().decode(check(res).arrayBuffer)),
      );
      if (!Array.isArray(d.changes)) throw Error("incomplete");
      changed ||= d.changes.length > 0;
      if (typeof d.nextPageToken === "string" && d.nextPageToken) {
        token = d.nextPageToken;
        continue;
      }
      if (typeof d.newStartPageToken !== "string" || !d.newStartPageToken)
        throw Error("incomplete");
      cursor.token = d.newStartPageToken;
      if (changed) cursor.revision = crypto.randomUUID();
      return cursor.revision;
    }
  }
  const start = await json(
    http,
    base + "/startPageToken?supportsAllDrives=true",
  );
  if (typeof start.startPageToken !== "string" || !start.startPageToken)
    throw Error("incomplete");
  cursor.token = start.startPageToken;
  cursor.revision = crypto.randomUUID();
  return cursor.revision;
}
