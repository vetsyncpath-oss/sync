import type { TransferPulse } from "./transfer";
import { chunkSize } from "./transfer";
import {
  fileName,
  rootItem,
  sizeOf,
  type RemoteItem,
  type RemoteTree,
} from "./public-store";
import { join, type Bytes } from "./model";
export interface Reply {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: Bytes;
}
export type Transport = (
  url: string,
  method?: string,
  headers?: Record<string, string>,
  body?: Bytes,
) => Promise<Reply>;
const decoder = new TextDecoder();
export function check(res: Reply) {
  if (
    res.status === 429 ||
    (res.status === 403 &&
      /quota|rateLimit|dailyLimit/i.test(decoder.decode(res.arrayBuffer)))
  )
    throw Error("publicQuota");
  if (res.status === 401 || res.status === 403) throw Error("publicDenied");
  if (res.status === 404) throw Error("missingRoot");
  if (res.status < 200 || res.status >= 300) throw Error("remoteHttp");
  return res;
}
export function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("incomplete");
  return v as Record<string, unknown>;
}
export function digest(v: unknown, length: number) {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || v.length !== length || !/^[a-f0-9]+$/i.test(v))
    throw Error("incomplete");
  return v.toLowerCase();
}
export async function json(
  http: Transport,
  url: string,
  headers?: Record<string, string>,
) {
  const data = check(await http(url, "GET", headers)).arrayBuffer;
  try {
    return record(JSON.parse(decoder.decode(data)));
  } catch {
    throw Error("incomplete");
  }
}
const date = (v: unknown) => (typeof v === "string" ? Date.parse(v) : NaN);
export class GoogleTree implements RemoteTree {
  constructor(
    private http: Transport,
    private folder: string,
    private apiKey: string | null,
    private linkKey: string,
  ) {}
  private headers(id: string, key?: string): Record<string, string> {
    if (this.apiKey !== null && !this.apiKey.trim()) throw Error("googleKey");
    return {
      ...(this.apiKey ? { "X-Goog-Api-Key": this.apiKey } : {}),
      ...(key ? { "X-Goog-Drive-Resource-Keys": id + "/" + key } : {}),
    };
  }
  async root() {
    const data = await json(
      this.http,
      "https://www.googleapis.com/drive/v3/files/" +
        this.folder +
        "?fields=id,mimeType,trashed&supportsAllDrives=true",
      this.headers(this.folder, this.linkKey),
    );
    if (
      typeof data.id !== "string" ||
      !/^[\w-]+$/.test(data.id) ||
      (this.folder !== "root" && data.id !== this.folder) ||
      data.mimeType !== "application/vnd.google-apps.folder" ||
      data.trashed === true
    )
      throw Error("missingRoot");
    return { ...rootItem(data.id), resourceKey: this.linkKey };
  }
  async children(folder: RemoteItem) {
    const result: RemoteItem[] = [],
      tokens = new Set<string>();
    let token = "";
    do {
      const params = new URLSearchParams({
        q: "'" + folder.key + "' in parents and trashed = false",
        fields:
          "nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,md5Checksum,sha256Checksum,resourceKey)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (token) params.set("pageToken", token);
      const d = await json(
        this.http,
        "https://www.googleapis.com/drive/v3/files?" + params,
        this.headers(folder.key, folder.resourceKey),
      );
      if (!Array.isArray(d.files) || d.incompleteSearch)
        throw Error("incomplete");
      for (const raw of d.files) {
        const f = record(raw);
        if (
          typeof f.id !== "string" ||
          !/^[-\w]+$/.test(f.id) ||
          typeof f.mimeType !== "string" ||
          (f.resourceKey !== undefined &&
            (typeof f.resourceKey !== "string" ||
              !/^[-\w]+$/.test(f.resourceKey)))
        )
          throw Error("incomplete");
        const type =
          f.mimeType === "application/vnd.google-apps.folder"
            ? "folder"
            : f.mimeType.startsWith("application/vnd.google-apps.")
              ? "skip"
              : "file";
        result.push({
          name: fileName(f.name),
          key: f.id,
          type,
          size: type === "file" ? sizeOf(f.size) : 0,
          mtime: date(f.modifiedTime),
          md5: digest(f.md5Checksum, 32),
          sha256: digest(f.sha256Checksum, 64),
          resourceKey: f.resourceKey,
        });
      }
      const next = d.nextPageToken ?? "";
      if (typeof next !== "string" || tokens.has(next))
        throw Error("incomplete");
      token = next;
      tokens.add(token);
    } while (token);
    return result;
  }
  async read(f: RemoteItem, progress?: TransferPulse) {
    const url =
      "https://www.googleapis.com/drive/v3/files/" +
      f.key +
      "?alt=media&supportsAllDrives=true";
    const headers = this.headers(f.key, f.resourceKey);
    if (f.size <= chunkSize || !(f.sha256 || f.md5))
      return check(await this.http(url, "GET", headers)).arrayBuffer;
    let result: Uint8Array<ArrayBuffer> | undefined;
    for (let start = 0; start < f.size; start += chunkSize) {
      const end = Math.min(start + chunkSize, f.size) - 1;
      const reply = check(
        await this.http(url, "GET", {
          ...headers,
          Range: "bytes=" + start + "-" + end,
        }),
      );
      if (
        reply.status === 200 &&
        !start &&
        reply.arrayBuffer.byteLength === f.size
      )
        return reply.arrayBuffer;
      const range = Object.entries(reply.headers).find(
        ([k]) => k.toLowerCase() === "content-range",
      )?.[1];
      if (
        reply.status !== 206 ||
        range !== "bytes " + start + "-" + end + "/" + f.size ||
        reply.arrayBuffer.byteLength !== end - start + 1
      )
        throw Error("incomplete");
      result ??= new Uint8Array(f.size);
      result.set(new Uint8Array(reply.arrayBuffer), start);
      progress?.(end + 1, f.size);
    }
    return result!.buffer;
  }
}
export class YandexTree implements RemoteTree {
  constructor(
    private http: Transport,
    private key: string,
  ) {}
  private url(path: string, download = false, offset = 0) {
    const q = new URLSearchParams({ public_key: this.key, path: "/" + path });
    if (!download) {
      q.set("offset", String(offset));
      q.set("limit", "200");
    }
    return (
      "https://cloud-api.yandex.net/v1/disk/public/resources" +
      (download ? "/download" : "") +
      "?" +
      q
    );
  }
  async root() {
    return rootItem("");
  }
  async children(dir: RemoteItem) {
    let offset = 0,
      total: number | undefined;
    const result: RemoteItem[] = [];
    do {
      const d = await json(this.http, this.url(dir.key, false, offset)),
        page = record(d._embedded);
      if (
        d.type !== "dir" ||
        !page ||
        !Array.isArray(page.items) ||
        page.offset !== offset ||
        typeof page.total !== "number" ||
        !Number.isSafeInteger(page.total) ||
        page.total < 0 ||
        (total !== undefined && total !== page.total) ||
        offset + page.items.length > page.total ||
        (!page.items.length && offset < page.total)
      )
        throw Error("incomplete");
      total = page.total;
      for (const raw of page.items) {
        const item = record(raw);
        if (item.type !== "dir" && item.type !== "file")
          throw Error("incomplete");
        const name = fileName(item.name);
        result.push({
          name,
          key: join(dir.key, name),
          type: item.type === "dir" ? "folder" : "file",
          size: item.type === "dir" ? 0 : sizeOf(item.size),
          mtime: date(item.modified),
          sha256: digest(item.sha256, 64),
          md5: digest(item.md5, 32),
        });
      }
      offset += page.items.length;
    } while (offset < total);
    return result;
  }
  async read(file: RemoteItem) {
    const d = await json(this.http, this.url(file.key, true));
    if (typeof d.href !== "string") throw Error("incomplete");
    let u: URL;
    try {
      u = new URL(d.href);
    } catch {
      throw Error("publicUrl");
    }
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !/(^|\.)(yandex\.(net|ru|com)|storage\.yandexcloud\.net)$/.test(
        u.hostname,
      )
    )
      throw Error("publicUrl");
    return check(await this.http(u.href)).arrayBuffer;
  }
}
