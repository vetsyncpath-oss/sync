import {
  checked,
  fold,
  hash,
  join,
  type Bytes,
  type StorageProvider,
} from "./model";
import {
  chunkSize,
  fromBuffer,
  type ChunkSource,
  type TransferPulse,
} from "./transfer";

export interface DavLocation {
  url: string;
  user: string;
}
export function davRoot(d: DavLocation) {
  if (
    !d ||
    typeof d.user !== "string" ||
    /[:\r\n]/.test(d.user) ||
    typeof d.url !== "string"
  )
    throw Error("davLocation");
  let u: URL;
  try {
    u = new URL(d.url);
  } catch {
    throw Error("davLocation");
  }
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(u.hostname);
  if (
    !(u.protocol === "https:" || (loopback && u.protocol === "http:")) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw Error("davLocation");
  u.pathname = u.pathname.replace(/\/*$/, "/");
  return u.href;
}
export function davId(d: DavLocation, prefix: string) {
  return JSON.stringify([
    "webdav",
    davRoot(d),
    d.user,
    prefix && prefix !== "/" ? checked(prefix) : "",
  ]);
}

type Meta = {
  path: string;
  type: "file" | "folder";
  size: number;
  mtime: number;
  etag?: string;
};
const ns = "DAV:";
const child = (el: Element, name: string) =>
  Array.from(el.children).filter(
    (c) => c.namespaceURI === ns && c.localName === name,
  );
const propfind = fromBuffer(
  new TextEncoder().encode(
    '<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/><D:getcontentlength/><D:getlastmodified/><D:getetag/></D:prop></D:propfind>',
  ).buffer,
);
function segments(url: URL) {
  return url.pathname
    .replace(/\/$/, "")
    .split("/")
    .map((s) => {
      const v = decodeURIComponent(s);
      if (/[/\\\0]/.test(v) || v === "." || v === "..")
        throw Error("remoteName");
      return v;
    });
}
function multistatus(xml: Bytes, url: URL, path: string, depth: number) {
  const doc = new DOMParser().parseFromString(
    new TextDecoder().decode(xml),
    "application/xml",
  );
  const root = doc.documentElement;
  if (
    doc.doctype ||
    root.namespaceURI !== ns ||
    root.localName !== "multistatus"
  )
    throw Error("incomplete");
  const prefix = segments(url),
    found = new Map<string, Meta>();
  for (const entry of child(root, "response")) {
    const href = child(entry, "href")[0]?.textContent;
    if (!href) throw Error("incomplete");
    const u = new URL(href, url);
    const parts = segments(u);
    if (
      u.origin !== url.origin ||
      u.search ||
      u.hash ||
      prefix.some((s, i) => parts[i] !== s) ||
      parts.length < prefix.length ||
      parts.length > prefix.length + depth
    )
      throw Error("incomplete");
    const relative = join(path, parts.slice(prefix.length).join("/"));
    if (found.has(relative)) throw Error("collision");
    const props = child(entry, "propstat")
      .filter((e) =>
        /^HTTP\/\S+ 200\b/.test(
          child(e, "status")[0]?.textContent?.trim() ?? "",
        ),
      )
      .flatMap((e) => child(e, "prop"));
    const prop = (k: string) => props.flatMap((p) => child(p, k))[0];
    const kind = prop("resourcetype");
    if (
      !kind ||
      child(entry, "status").some(
        (s) => !/^HTTP\/\S+ 2\d\d\b/.test(s.textContent?.trim() ?? ""),
      )
    )
      throw Error("incomplete");
    const folder = child(kind, "collection").length > 0;
    if (kind.children.length && !folder) throw Error("incomplete");
    const length = prop("getcontentlength")?.textContent?.trim();
    if (
      !folder &&
      (!length ||
        !/^\d+$/.test(length) ||
        !Number.isSafeInteger(Number(length)))
    )
      throw Error("incomplete");
    const raw = prop("getetag")?.textContent?.trim();
    // Some DAV servers send an unquoted opaque tag in the XML property.
    const etag =
      raw &&
      /^[!#-~]+$/.test(raw) &&
      !/["\\]/.test(raw) &&
      !raw.startsWith("W/")
        ? '"' + raw + '"'
        : raw;
    found.set(relative, {
      path: relative,
      type: folder ? "folder" : "file",
      size: folder ? 0 : Number(length),
      mtime: Date.parse(prop("getlastmodified")?.textContent ?? "") || 0,
      etag,
    });
  }
  if (!found.has(path)) throw Error("incomplete");
  return found;
}
function lockDeadline(xml: Bytes, token: string, start: number) {
  const doc = new DOMParser().parseFromString(
    new TextDecoder().decode(xml),
    "application/xml",
  );
  const root = doc.documentElement;
  if (doc.doctype || root.namespaceURI !== ns || root.localName !== "prop")
    return 0;
  for (const discovery of child(root, "lockdiscovery"))
    for (const lock of child(discovery, "activelock")) {
      const has = (outer: string, inner: string) =>
        child(lock, outer).some((el) => child(el, inner).length > 0);
      const own = child(lock, "locktoken").some((el) =>
        child(el, "href").some(
          (h) => "<" + h.textContent?.trim() + ">" === token,
        ),
      );
      if (
        !own ||
        !has("lockscope", "exclusive") ||
        !has("locktype", "write") ||
        child(lock, "depth")[0]?.textContent?.trim().toLowerCase() !==
          "infinity"
      )
        continue;
      const timeout = child(lock, "timeout")[0]?.textContent?.trim() ?? "";
      if (timeout.toLowerCase() === "infinite") return Infinity;
      const seconds = /^Second-(\d+)$/i.exec(timeout);
      if (seconds) return start + 1000 * Number(seconds[1]);
    }
  return 0;
}
function success(status: number, allowed: number[]) {
  if (allowed.includes(status)) return;
  if (status === 401 || status === 403) throw Error("publicDenied");
  if (status === 404) throw Error("missingRoot");
  if (status === 412 || status === 409) throw Error("referenceChanged");
  if (status === 423) throw Error("locked");
  if (status === 507) throw Error("diskSpace");
  throw Error("remoteHttp");
}
export class DavStore implements StorageProvider {
  readonly id: string;
  readonly capabilities;
  private meta = new Map<string, Meta>();
  private observed = new Map<string, Meta | null>();
  private base: URL;
  constructor(
    private location: DavLocation,
    prefix: string,
    readOnly: boolean,
    private password: () => Promise<string | null>,
  ) {
    this.id = davId(location, prefix);
    this.base = new URL(davRoot(location));
    if (prefix && prefix !== "/")
      this.base.pathname +=
        prefix.split("/").map(encodeURIComponent).join("/") + "/";
    this.capabilities = {
      readOnly,
      supportsChecksum: false,
      supportsChangesFeed: false,
      maxFileSize: Infinity,
      rateLimits: null,
    };
  }
  private url(path: string, folder = false) {
    const u = new URL(this.base);
    if (path)
      u.pathname +=
        checked(path).split("/").map(encodeURIComponent).join("/") +
        (folder ? "/" : "");
    return u;
  }
  private async request(
    method: string,
    u: URL,
    headers: Record<string, string> = {},
    body?: ChunkSource,
    pulse?: TransferPulse,
    hashOnly = false,
  ) {
    // Native transport never follows redirects or forwards credentials to another host.
    const http: typeof import("node:http") =
      u.protocol === "https:" ? require("node:https") : require("node:http");
    const password = this.location.user ? await this.password() : null;
    if (this.location.user && !password) throw Error("davPassword");
    if (this.location.user)
      headers = {
        ...headers,
        Authorization:
          "Basic " +
          Buffer.from(this.location.user + ":" + password, "utf8").toString(
            "base64",
          ),
      };
    if (body || ["MKCOL", "UNLOCK", "DELETE", "MOVE"].includes(method))
      headers["Content-Length"] = String(body?.size ?? 0);
    return new Promise<{
      status: number;
      headers: import("node:http").IncomingHttpHeaders;
      bytes: Bytes;
      length: number;
      digest?: string;
    }>((resolve, reject) => {
      let replied = false;
      const req = http.request(u, { method, headers }, async (res) => {
        replied = true;
        try {
          const chunks: Buffer[] = [];
          const hasher = hashOnly
            ? (
                require("node:crypto") as typeof import("node:crypto")
              ).createHash("sha256")
            : undefined;
          let done = 0;
          const total = Number(res.headers["content-length"]);
          for await (const chunk of res) {
            done += chunk.length;
            if (method !== "GET" && done > 16 * 1024 * 1024)
              throw Error("incomplete");
            if (hasher) hasher.update(chunk);
            else chunks.push(chunk);
            if (method === "GET")
              pulse?.(done, Number.isFinite(total) ? total : undefined);
          }
          if (!res.complete) throw Error("incomplete");
          const data = Buffer.concat(chunks);
          const bytes =
            data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
              ? (data.buffer as ArrayBuffer)
              : Uint8Array.from(data).buffer;
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            bytes,
            length: done,
            digest: hasher?.digest("hex"),
          });
        } catch (e) {
          req.destroy();
          reject(e);
        }
      });
      req.setTimeout(90000, () => req.destroy(Error("readTimeout")));
      req.on("error", () => reject(Error("remoteNetwork")));
      void (async () => {
        if (body)
          for (let offset = 0; offset < body.size; offset += chunkSize) {
            const n = Math.min(chunkSize, body.size - offset),
              bytes = await body.read(offset, n);
            if (replied || req.destroyed) break;
            if (bytes.byteLength !== n) throw Error("referenceChanged");
            await new Promise<void>((ok, fail) =>
              req.write(new Uint8Array(bytes), (e) => (e ? fail(e) : ok())),
            );
            if (method === "PUT") pulse?.(offset + n, body.size);
          }
        req.end();
      })().catch((e) => {
        req.destroy();
        reject(e);
      });
    });
  }
  private async properties(path: string, depth: 0 | 1) {
    const url = this.url(path, depth === 1);
    const get = (u: URL) =>
      this.request(
        "PROPFIND",
        u,
        {
          Depth: String(depth),
          "Content-Type": "application/xml; charset=utf-8",
        },
        propfind,
      );
    let response = await get(url);
    if (
      [301, 307, 308].includes(response.status) &&
      response.headers.location &&
      !url.pathname.endsWith("/")
    ) {
      const canonical = new URL(response.headers.location, url);
      if (canonical.href !== url.href + "/") throw Error("davLocation");
      url.pathname += "/";
      response = await get(url);
    }
    if (response.status === 404 && !depth) return null;
    success(response.status, [207]);
    return multistatus(response.bytes, url, path, depth);
  }
  reset() {
    this.meta.clear();
    this.observed.clear();
  }
  async list(path: string) {
    const rows = await this.properties(path, 1);
    if (rows?.get(path)?.type !== "folder") throw Error("missingRoot");
    const files: string[] = [],
      folders: string[] = [];
    for (const row of rows.values()) {
      this.meta.set(row.path, row);
      if (row.path !== path)
        (row.type === "folder" ? folders : files).push(row.path);
    }
    return { files, folders };
  }
  async stat(path: string) {
    const meta = (await this.properties(path, 0))?.get(path) ?? null;
    this.observed.set(path, meta);
    return meta && { ...meta, version: this.strong(meta) };
  }
  async scanStat(path: string) {
    const meta = this.meta.get(path);
    return meta ? { ...meta, version: this.strong(meta) } : this.stat(path);
  }
  private strong(meta: Meta) {
    return meta.etag && /^"[^"\r\n]*"$/.test(meta.etag) ? meta.etag : undefined;
  }
  private async readFile(
    path: string,
    pulse?: TransferPulse,
    hashOnly = false,
  ) {
    const known = this.observed.get(path) ?? this.meta.get(path);
    const tag = known && this.strong(known);
    const reply = await this.request(
      "GET",
      this.url(path),
      tag ? { "If-Match": tag } : {},
      undefined,
      pulse,
      hashOnly,
    );
    success(reply.status, [200]);
    if (known && reply.length !== known.size) throw Error("referenceChanged");
    return reply;
  }
  async download(path: string, pulse?: TransferPulse) {
    return (await this.readFile(path, pulse)).bytes;
  }
  async readDigest(path: string, size: number, pulse: () => void) {
    const reply = await this.readFile(path, pulse, true);
    if (reply.length !== size || !reply.digest) throw Error("incomplete");
    return reply.digest;
  }
  private writable(path: string) {
    if (this.capabilities.readOnly || !path) throw Error("readonly");
    checked(path);
  }
  private async condition(path: string) {
    const current = this.observed.has(path)
      ? this.observed.get(path)
      : await this.stat(path);
    if (!current) return { "If-None-Match": "*" } as Record<string, string>;
    const etag = this.strong(current);
    if (current.type !== "file" || !etag) throw Error("davCondition");
    return { "If-Match": etag } as Record<string, string>;
  }
  async uploadChunks(
    path: string,
    file: ChunkSource,
    digest: string,
    _mtime?: number,
    pulse?: TransferPulse,
  ) {
    this.writable(path);
    const url = this.url(path);
    const response = await this.request(
      "PUT",
      url,
      {
        ...(await this.condition(path)),
        "Content-Type": "application/octet-stream",
      },
      file,
      pulse,
    );
    success(response.status, [200, 201, 204]);
    this.reset();
    const saved = await this.stat(path);
    if (!saved || saved.size !== file.size) throw Error("referenceChanged");
    if ((await this.readDigest(path, file.size, () => pulse?.())) !== digest)
      throw Error("referenceChanged");
  }
  async upload(
    path: string,
    data: Bytes,
    mtime?: number,
    pulse?: TransferPulse,
  ) {
    await this.uploadChunks(
      path,
      fromBuffer(data),
      await hash(data),
      mtime,
      pulse,
    );
  }
  async mkdir(path: string) {
    this.writable(path);
    const url = this.url(path, true);
    const response = await this.request("MKCOL", url);
    this.reset();
    if (response.status === 409 && path.includes("/")) {
      await this.mkdir(path.slice(0, path.lastIndexOf("/")));
      const retry = await this.request("MKCOL", url);
      if (retry.status === 201) return;
      if (retry.status === 405 && (await this.stat(path))?.type === "folder")
        return;
      success(retry.status, [201]);
    }
    if (response.status === 405 && (await this.stat(path))?.type === "folder")
      return;
    success(response.status, [201]);
  }
  async delete(path: string) {
    this.writable(path);
    const condition = await this.condition(path);
    if (!condition["If-Match"]) throw Error("referenceChanged");
    success(
      (await this.request("DELETE", this.url(path), condition)).status,
      [200, 204],
    );
    this.reset();
  }
  async removeEmptyDir(path: string) {
    this.writable(path);
    // DAV DELETE on a collection is recursive. Protect the check and delete
    // with an exclusive subtree lock. Servers without locks retain the folder.
    const url = this.url(path, true);
    const xml =
      '<D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>';
    const start = performance.now();
    const locked = await this.request(
      "LOCK",
      url,
      {
        "If-Match": "*",
        Depth: "infinity",
        Timeout: "Second-300",
        "Content-Type": "application/xml",
      },
      fromBuffer(new TextEncoder().encode(xml).buffer),
    );
    if ([403, 404, 405, 412, 423, 501].includes(locked.status)) return false;
    success(locked.status, [200, 201]);
    const header = locked.headers["lock-token"];
    const token =
      typeof header === "string" && /^[a-z][a-z0-9+.-]*:[^<>\s]+$/i.test(header)
        ? "<" + header + ">"
        : header;
    if (typeof token !== "string" || !/^<[^<>\s]+>$/.test(token))
      throw Error("incomplete");
    let removed = false;
    try {
      if (locked.status !== 200) return false;
      const until = lockDeadline(locked.bytes, token, start);
      if (performance.now() >= until) return false;
      const list = await this.list(path);
      if (
        list.files.length ||
        list.folders.length ||
        performance.now() >= until
      )
        return false;
      success(
        (await this.request("DELETE", url, { If: "(" + token + ")" })).status,
        [200, 204],
      );
      removed = true;
      this.reset();
      return true;
    } finally {
      if (!removed) await this.request("UNLOCK", url, { "Lock-Token": token });
    }
  }
  async move(from: string, to: string) {
    this.writable(from);
    this.writable(to);
    const condition = await this.condition(from);
    if (!condition["If-Match"]) throw Error("referenceChanged");
    success(
      (
        await this.request("MOVE", this.url(from), {
          ...condition,
          Destination: this.url(to).href,
          Overwrite: "F",
        })
      ).status,
      [201, 204],
    );
    this.reset();
  }
  async confirmAbsent(paths: string[]) {
    const listings = new Map<string, Map<string, string[]>>();
    for (const p of paths) {
      let dir = "";
      for (const part of checked(p).split("/")) {
        let names = listings.get(dir);
        if (!names) {
          names = new Map();
          const listing = await this.list(dir);
          for (const path of [...listing.files, ...listing.folders]) {
            const key = fold(path).replace(/[. ]+$/, "");
            const found = names.get(key);
            if (found) found.push(path);
            else names.set(key, [path]);
          }
          listings.set(dir, names);
        }
        const next = join(dir, part);
        const matches = names.get(fold(next)) ?? [];
        if (!matches.length) break;
        if (matches.length !== 1 || matches[0] !== next || next === p)
          throw Error("referenceChanged");
        dir = next;
      }
    }
  }
  async getRevision() {
    return null;
  }
}
