import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { FileInfo, Snapshot, Store, Profile } from "../core/model";
import type { NetTransport, NetRequest } from "./types";
import { json, bytes } from "../adapters/http";
import { driveUpload, driveMime } from "./drive-upload";
import {
  path,
  join,
  sha,
  uniquePaths,
  under,
  type ScanRules,
  PathCollision,
} from "../core/paths";
const hashCache = new Map<string, string>();
const FOLDER = "application/vnd.google-apps.folder";
const fields =
  "id,name,mimeType,size,modifiedTime,version,sha256Checksum,md5Checksum,trashed,capabilities(canEdit,canDownload,canAddChildren)";
export function driveRoot(value: string): string {
  const v = value.trim();
  if (!v.startsWith("https://")) {
    if (!/^[\w-]+$/.test(v))
      throw Error("Укажите ID папки Google Drive или ссылку");
    return v;
  }
  const u = new URL(v);
  if (u.hostname !== "drive.google.com")
    throw Error("Ожидается ссылка drive.google.com");
  const id =
    u.pathname.match(/\/folders\/([\w-]+)/)?.[1] || u.searchParams.get("id");
  if (!id || !/^[\w-]+$/.test(id)) throw Error("Ссылка не содержит folder ID");
  return id;
}
export class DriveStore implements Store {
  identity: string;
  writable: boolean;
  trashSupported: boolean;
  private root: string;
  private folders = new Map<string, string>();
  private key?: string;
  private resourceKey?: string;
  constructor(
    private http: NetTransport,
    root: string,
    private limit: number,
    publicKey?: string,
    identityAccount = "",
    private rules?: ScanRules,
    private duplicates: "error" | "newest" = "error",
  ) {
    this.root = driveRoot(root);
    this.key = publicKey;
    this.resourceKey = root.startsWith("https:")
      ? new URL(root).searchParams.get("resourcekey") || undefined
      : undefined;
    this.writable = !publicKey && duplicates === "error";
    this.trashSupported = this.writable;
    this.identity = "drive:" + identityAccount + ":" + this.root;
  }
  private url(
    suffix: string,
    query: Record<string, string> = {},
    upload = false,
  ) {
    const u = new URL(
      "https://www.googleapis.com/" +
        (upload ? "upload/" : "") +
        "drive/v3/" +
        suffix,
    );
    for (const [k, v] of Object.entries({
      ...query,
      supportsAllDrives: "true",
      ...(this.key ? { key: this.key } : {}),
    }))
      u.searchParams.set(k, v);
    return u.href;
  }
  private opts(signal: AbortSignal, extra: NetRequest = {}): NetRequest {
    return {
      ...extra,
      signal,
      headers: {
        ...(this.resourceKey
          ? { "X-Goog-Drive-Resource-Keys": `${this.root}/${this.resourceKey}` }
          : {}),
        ...extra.headers,
      },
    };
  }
  async inspect(id: string, signal: AbortSignal) {
    return json(
      this.http,
      this.url("files/" + encodeURIComponent(id), { fields }),
      this.opts(signal),
    );
  }
  private async info(
    f: any,
    p: string,
    signal: AbortSignal,
  ): Promise<FileInfo> {
    if (
      typeof f.id !== "string" ||
      (typeof f.version !== "string" && typeof f.version !== "number")
    )
      throw Error("Drive не вернул версию файла");
    const size = Number(f.size);
    if (!Number.isSafeInteger(size) || size < 0)
      throw Error("Drive не вернул размер файла");
    let hash = f.sha256Checksum;
    if (size > this.limit) hash = "oversize:" + size;
    else if (typeof hash !== "string" || !/^[a-f\d]{64}$/i.test(hash)) {
      const key = f.id + ":" + f.version;
      hash = hashCache.get(key);
      if (!hash) {
        hash = sha(await this.download(f, signal));
        if (hashCache.size > 100000) hashCache.clear();
        hashCache.set(key, hash);
      }
    }
    return {
      path: p,
      hash: String(hash).toLowerCase(),
      size,
      mtime: Date.parse(f.modifiedTime) || undefined,
      id: f.id,
      version: String(f.version),
    };
  }
  async children(id: string, signal: AbortSignal): Promise<any[]> {
    const out: any[] = [];
    let next = "";
    const pages = new Set<string>();
    do {
      if (pages.has(next)) throw Error("Повтор страницы Drive");
      pages.add(next);
      const d = await json(
        this.http,
        this.url("files", {
          q: `'${id.replace(/'/g, "\\'")}' in parents and trashed=false`,
          fields: `files(${fields}),nextPageToken,incompleteSearch`,
          pageSize: "1000",
          includeItemsFromAllDrives: "true",
          ...(next ? { pageToken: next } : {}),
        }),
        this.opts(signal),
      );
      if (d.incompleteSearch || !Array.isArray(d.files))
        throw Error("Неполный ответ Drive");
      if (d.nextPageToken !== undefined && typeof d.nextPageToken !== "string")
        throw Error("Некорректная страница Drive");
      out.push(...d.files);
      next = d.nextPageToken || "";
    } while (next);
    return out;
  }
  private choose(entries: any[], p: string, warnings?: string[]): any {
    if (entries.length <= 1) return entries[0];
    // Sync Engine picks the latest duplicate file. Make this explicit/read-only;
    // never choose a folder or collapse names that only match by case/Unicode.
    if (
      this.duplicates !== "newest" ||
      entries.some(
        (f) =>
          f.mimeType === FOLDER ||
          f.name !== entries[0].name ||
          !Number.isFinite(Date.parse(f.modifiedTime)),
      )
    )
      throw new PathCollision(
        "Коллизия: несколько объектов Drive имеют путь «" +
          p +
          "». Переименуйте дубль, исключите путь или для файлов включите выбор новейшего при получении.",
        [p],
      );
    const sorted = [...entries].sort(
      (a, b) =>
        Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime) ||
        String(a.id).localeCompare(String(b.id)),
    );
    warnings?.push(
      `Drive: из ${entries.length} файлов «${p}» выбран новейший (ID ${sorted[0].id}); остальные остаются в источнике.`,
    );
    return sorted[0];
  }
  async scan(signal: AbortSignal): Promise<Snapshot> {
    const root = await this.inspect(this.root, signal);
    if (root.trashed || root.mimeType !== FOLDER)
      throw Error("Папка Drive недоступна");
    const files: Record<string, FileInfo> = Object.create(null),
      directories: string[] = [],
      warnings: string[] = [],
      seen = new Set<string>(),
      all: string[] = [];
    this.folders = new Map([["", this.root]]);
    const walk = async (id: string, base: string, depth: number) => {
      signal.throwIfAborted();
      if (depth > 60 || seen.size > 100000)
        throw Error("Превышен предел обхода Drive");
      if (seen.has(id)) throw Error("Повтор ID папки Drive");
      seen.add(id);
      const groups = new Map<string, any[]>();
      for (const f of await this.children(id, signal)) {
        if (/[\\/]/.test(f.name))
          throw Error("Недопустимый разделитель в имени удалённого файла");
        path(f.name);
        const p = join(base, f.name);
        if (
          f.mimeType === FOLDER
            ? this.rules && !this.rules.folder(p)
            : this.rules && !this.rules.file(p)
        )
          continue;
        const group = groups.get(f.name) || [];
        group.push(f);
        groups.set(f.name, group);
      }
      for (const group of groups.values()) {
        const p = join(base, group[0].name);
        const f = this.choose(group, p, warnings);
        all.push(p);
        if (f.mimeType === FOLDER) {
          directories.push(p);
          this.folders.set(p, f.id);
          await walk(f.id, p, depth + 1);
        } else if (
          String(f.mimeType).startsWith("application/vnd.google-apps.")
        ) {
          warnings.push(
            "Пропущен Google Docs / shortcut (нужен экспорт): " + p,
          );
          // Keep the path present but out of scope, so unsupported content is never a deletion.
          files[p] = {
            path: p,
            size: Number.MAX_SAFE_INTEGER,
            hash: "unsupported:" + f.mimeType,
            version: String(f.version || ""),
            id: f.id,
          };
        } else files[p] = await this.info(f, p, signal);
      }
    };
    await walk(this.root, "", 0);
    uniquePaths(all);
    return {
      files,
      directories,
      complete: true,
      warnings,
      identity: this.identity,
    };
  }
  private async download(f: any, signal: AbortSignal) {
    const b = await bytes(
      this.http,
      this.url("files/" + encodeURIComponent(f.id), { alt: "media" }),
      this.opts(signal, { maxBytes: this.limit }),
    );
    if (b.length !== Number(f.size))
      throw Error("Размер Drive-файла не совпал");
    if (f.sha256Checksum && sha(b) !== f.sha256Checksum.toLowerCase())
      throw Error("SHA-256 Drive не совпал");
    if (
      f.md5Checksum &&
      createHash("md5").update(b).digest("hex") !== f.md5Checksum.toLowerCase()
    )
      throw Error("MD5 Drive не совпал");
    const after = await this.inspect(f.id, signal);
    if (String(after.version) !== String(f.version) || after.trashed)
      throw Error("Файл Drive изменился во время скачивания");
    return b;
  }
  async read(f: FileInfo, signal: AbortSignal) {
    const current = await this.inspect(f.id!, signal);
    if (String(current.version) !== f.version || current.trashed)
      throw Error("Файл Drive изменился");
    await this.verifyPath(f.path, f.id, signal);
    return this.download(current, signal);
  }
  /** Sync Engine's fresh path-chain lookup, adapted to reject ambiguous names. */
  private async verifyPath(
    p: string,
    expectedId: string | undefined,
    signal: AbortSignal,
  ) {
    let id = this.root;
    const parts = p.split("/");
    for (let i = 0; i < parts.length; i++) {
      const matches = (await this.children(id, signal)).filter(
        (f) =>
          f.name.normalize("NFC").toLowerCase() ===
          parts[i].normalize("NFC").toLowerCase(),
      );
      const f = this.choose(matches, p);
      if (!f) {
        if (expectedId)
          throw Error("Путь Drive исчез после планирования: " + p);
        return;
      }
      if (i === parts.length - 1) {
        if (!expectedId || f.id !== expectedId || f.name !== parts[i])
          throw Error(
            "Путь Drive изменился или появился после планирования: " + p,
          );
      } else if (f.mimeType !== FOLDER || f.name !== parts[i])
        throw Error("Папка Drive изменилась после планирования: " + p);
      id = f.id;
    }
  }
  private async verifyExpected(
    p: string,
    expected: FileInfo | undefined,
    signal: AbortSignal,
  ) {
    if (expected) {
      const r = await this.http.fetch(
        this.url("files/" + encodeURIComponent(expected.id!), { fields }),
        this.opts(signal),
      );
      if (r.status !== 200) throw Error("Drive-файл недоступен");
      const f = JSON.parse(await r.text());
      if (f.trashed || String(f.version) !== expected.version)
        throw Error("Drive-файл изменился");
      if (!r.headers.etag)
        throw Error("Drive не вернул ETag; безопасная перезапись запрещена");
      await this.verifyPath(p, expected.id, signal);
      return r.headers.etag;
    }
    await this.verifyPath(p, undefined, signal);
    return undefined;
  }
  private async parent(p: string, signal: AbortSignal) {
    let base = "",
      id = this.root;
    for (const name of p.split("/").slice(0, -1)) {
      base = join(base, name);
      const cached = this.folders.get(base);
      let next: string | undefined;
      {
        const found = (await this.children(id, signal)).filter(
          (f) =>
            f.name.normalize("NFC").toLowerCase() ===
            name.normalize("NFC").toLowerCase(),
        );
        if (
          found.length > 1 ||
          (found[0] && (found[0].mimeType !== FOLDER || found[0].name !== name))
        )
          throw Error("Коллизия папки Drive");
        next = found[0]?.id;
        if (cached && next !== cached)
          throw Error(
            "Папка Drive перемещена или заменена после планирования: " + base,
          );
        if (!next) {
          const d = await json(
            this.http,
            this.url("files", { fields: "id" }),
            this.opts(signal, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, mimeType: FOLDER, parents: [id] }),
            }),
          );
          next = d.id;
          if (typeof next !== "string" || !next)
            throw Error("Drive не вернул ID созданной папки");
        }
        this.folders.set(base, next!);
      }
      id = next!;
    }
    return id;
  }
  async write(
    p: string,
    b: Uint8Array,
    expected: FileInfo | undefined,
    mtime: number | undefined,
    signal: AbortSignal,
  ) {
    if (!this.writable)
      throw Error(
        "Drive доступен только для чтения: публичный доступ или выбор новейшего дубля",
      );
    path(p);
    const etag = await this.verifyExpected(p, expected, signal);
    const root = await this.inspect(this.root, signal);
    if (root.trashed || root.mimeType !== FOLDER)
      throw Error("Корень Drive недоступен перед записью");
    const parent = await this.parent(p, signal);
    if (!expected) await this.verifyExpected(p, undefined, signal);
    const boundary = "sync_studio_" + crypto.randomUUID();
    const metadata = {
      name: p.split("/").at(-1),
      mimeType: driveMime(p),
      ...(!expected ? { parents: [parent] } : {}),
      ...(mtime ? { modifiedTime: new Date(mtime).toISOString() } : {}),
    };
    const body =
      b.length > 5 * 1024 * 1024
        ? undefined
        : Buffer.concat([
            Buffer.from(
              `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${driveMime(p)}\r\n\r\n`,
            ),
            Buffer.from(b),
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ]);
    const f =
      b.length > 5 * 1024 * 1024
        ? await driveUpload(
            this.http,
            this.url(
              expected ? "files/" + encodeURIComponent(expected.id!) : "files",
              { uploadType: "resumable", fields },
              true,
            ),
            expected ? "PATCH" : "POST",
            metadata,
            b,
            this.opts(signal, { headers: etag ? { "If-Match": etag } : {} }),
          )
        : await json(
            this.http,
            this.url(
              expected ? "files/" + encodeURIComponent(expected.id!) : "files",
              { uploadType: "multipart", fields },
              true,
            ),
            this.opts(signal, {
              method: expected ? "PATCH" : "POST",
              headers: {
                "Content-Type": "multipart/related; boundary=" + boundary,
                ...(etag ? { "If-Match": etag } : {}),
              },
              body,
            }),
          );
    const result = await this.info(f, p, signal);
    if (result.hash !== sha(b)) throw Error("Проверка записи Drive не прошла");
    return result;
  }
  async delete(f: FileInfo, trash: boolean, signal: AbortSignal) {
    if (!this.writable) throw Error("Источник только для чтения");
    const etag = await this.verifyExpected(f.path, f, signal);
    const root = await this.inspect(this.root, signal);
    if (root.trashed || root.mimeType !== FOLDER)
      throw Error("Корень Drive недоступен перед удалением");
    const r = await this.http.fetch(
      this.url(
        "files/" + encodeURIComponent(f.id!),
        trash ? { fields: "id" } : {},
      ),
      this.opts(signal, {
        method: trash ? "PATCH" : "DELETE",
        headers: { "If-Match": etag!, "Content-Type": "application/json" },
        ...(trash ? { body: '{"trashed":true}' } : {}),
      }),
    );
    if (r.status < 200 || r.status >= 300)
      throw Error("Удаление Drive: HTTP " + r.status);
  }
}

export class GitHubStore implements Store {
  identity: string;
  writable = false;
  trashSupported = false;
  private base: string;
  constructor(
    private http: NetTransport,
    repo: string,
    private ref: string,
    private prefix: string,
    private token: string,
    private limit: number,
    private rules?: ScanRules,
  ) {
    const m = repo
      .replace(/^https:\/\/github.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "")
      .match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!m) throw Error("Репозиторий: owner/repo");
    path(prefix, true);
    this.base = `https://api.github.com/repos/${m[1]}/${m[2]}`;
    this.identity = `github:${m[1]}/${m[2]}:${ref}:${prefix}`;
  }
  private options(signal: AbortSignal): NetRequest {
    return {
      signal,
      maxBytes: 16 * 1024 * 1024,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Obsidian-Sync-Studio",
        ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
      },
    };
  }
  async scan(signal: AbortSignal): Promise<Snapshot> {
    const c = await json(
      this.http,
      this.base + "/commits/" + encodeURIComponent(this.ref || "HEAD"),
      this.options(signal),
    );
    if (!c.commit?.tree?.sha) throw Error("GitHub не вернул дерево коммита");
    const tree = await json(
      this.http,
      this.base + "/git/trees/" + c.commit.tree.sha + "?recursive=1",
      this.options(signal),
    );
    if (tree.truncated || !Array.isArray(tree.tree))
      throw Error("Неполное дерево GitHub: запуск остановлен");
    if (
      this.prefix &&
      !tree.tree.some((f: any) => f.type === "tree" && f.path === this.prefix)
    )
      throw Error("Каталог GitHub не найден");
    const files: Record<string, FileInfo> = Object.create(null);
    const directories: string[] = [];
    for (const f of tree.tree) {
      if (!under(f.path, this.prefix) || f.path === this.prefix) continue;
      const p = this.prefix ? f.path.slice(this.prefix.length + 1) : f.path;
      if (f.type === "tree") {
        if (!this.rules || this.rules.folder(p)) directories.push(path(p));
        continue;
      }
      if (this.rules && !this.rules.file(p)) continue;
      path(p);
      if (f.type !== "blob" || !["100644", "100755"].includes(f.mode))
        throw Error("Ссылки и submodules не поддерживаются: " + f.path);
      if (!Number.isSafeInteger(f.size) || f.size < 0)
        throw Error("GitHub не вернул размер");
      let hash = "oversize:" + f.size;
      if (f.size <= this.limit) {
        hash =
          hashCache.get("git:" + f.sha) || sha(await this.blob(f.sha, signal));
        if (hashCache.size > 100000) hashCache.clear();
        hashCache.set("git:" + f.sha, hash);
      }
      files[p] = { path: p, hash, size: f.size, version: f.sha, id: f.sha };
    }
    uniquePaths([...Object.keys(files), ...directories]);
    return {
      files,
      directories,
      identity: this.identity,
      complete: true,
      warnings: [
        "GitHub: только получение; файловое время изменения недоступно.",
      ],
    };
  }
  private async blob(id: string, signal: AbortSignal) {
    const r = await json(this.http, this.base + "/git/blobs/" + id, {
      ...this.options(signal),
      maxBytes: Math.ceil(this.limit * 1.5) + 1024,
    });
    if (r.encoding !== "base64" || typeof r.content !== "string")
      throw Error("Неподдерживаемый ответ GitHub");
    const b = Buffer.from(r.content, "base64");
    if (b.length > this.limit) throw Error("Превышен размер файла");
    const hash = createHash("sha1")
      .update(Buffer.from(`blob ${b.length}\0`))
      .update(b)
      .digest("hex");
    if (hash !== id) throw Error("GitHub blob checksum mismatch");
    if (
      b
        .subarray(0, 80)
        .toString()
        .startsWith("version https://git-lfs.github.com/spec")
    )
      throw Error("Git LFS требует отдельного скачивания");
    return b;
  }
  async read(f: FileInfo, signal: AbortSignal) {
    signal.throwIfAborted();
    return this.blob(f.id!, signal);
  }
  async write(): Promise<FileInfo> {
    throw Error("GitHub в этой версии — только получение");
  }
  async delete(): Promise<void> {
    throw Error("GitHub в этой версии — только получение");
  }
}

export class YandexStore implements Store {
  identity: string;
  writable = true;
  trashSupported = true;
  private base = "https://cloud-api.yandex.net/v1/disk";
  private root: string;
  constructor(
    private http: NetTransport,
    root: string,
    private token: string,
    private limit: number,
    private rules?: ScanRules,
  ) {
    this.root =
      "disk:/" +
      root
        .replace(/^disk:\//, "")
        .replace(/^\//, "")
        .replace(/\/$/, "");
    path(this.root.slice(6), true);
    this.identity = "yandex:" + this.root;
  }
  private url(endpoint: string, params: Record<string, string>) {
    return this.base + endpoint + "?" + new URLSearchParams(params);
  }
  private options(signal: AbortSignal, extra: NetRequest = {}): NetRequest {
    return {
      ...extra,
      signal,
      headers: { Authorization: "OAuth " + this.token, ...extra.headers },
    };
  }
  private full(p: string) {
    return p ? this.root.replace(/\/$/, "") + "/" + path(p) : this.root;
  }
  private async meta(p: string, signal: AbortSignal) {
    return json(
      this.http,
      this.url("/resources", { path: this.full(p), limit: "200" }),
      this.options(signal),
    );
  }
  async folders(
    relative: string,
    signal: AbortSignal,
  ): Promise<{ id: string; name: string }[]> {
    const out: { id: string; name: string }[] = [];
    let offset = 0,
      total: number | undefined;
    do {
      const d = await json(
        this.http,
        this.url("/resources", {
          path: this.full(relative),
          limit: "200",
          offset: String(offset),
        }),
        this.options(signal),
      );
      const e = d._embedded;
      if (
        d.type !== "dir" ||
        !e ||
        !Array.isArray(e.items) ||
        !Number.isSafeInteger(e.total) ||
        e.offset !== offset ||
        (total !== undefined && e.total !== total)
      )
        throw Error("Не удалось прочитать полный список папок Яндекс Диска");
      total = e.total;
      for (const f of e.items)
        if (f.type === "dir") {
          if (/[\\/]/.test(f.name)) throw Error("Недопустимое имя папки");
          out.push({ id: join(relative, path(f.name)), name: f.name });
        }
      offset += e.items.length;
      if (!e.items.length && offset < total!)
        throw Error("Неполный список папок");
    } while (offset < total!);
    return out;
  }
  private info(f: any, p: string): FileInfo {
    if (
      !Number.isSafeInteger(f.size) ||
      typeof f.sha256 !== "string" ||
      !/^[a-f\d]{64}$/i.test(f.sha256)
    )
      throw Error("Яндекс Диск не вернул checksum/размер: " + p);
    return {
      path: p,
      hash: f.sha256.toLowerCase(),
      size: f.size,
      mtime: Date.parse(f.modified) || undefined,
      version: f.sha256.toLowerCase(),
      id: f.path,
    };
  }
  async scan(signal: AbortSignal): Promise<Snapshot> {
    const files: Record<string, FileInfo> = Object.create(null),
      directories: string[] = [],
      paths: string[] = [];
    let count = 0;
    const walk = async (p: string, depth: number) => {
      if (depth > 60 || ++count > 100000)
        throw Error("Превышен предел обхода Яндекс Диска");
      let offset = 0,
        total: number | undefined;
      const names = new Set<string>();
      do {
        signal.throwIfAborted();
        const d = await json(
          this.http,
          this.url("/resources", {
            path: this.full(p),
            limit: "200",
            offset: String(offset),
          }),
          this.options(signal),
        );
        const e = d._embedded;
        if (
          d.type !== "dir" ||
          !e ||
          !Array.isArray(e.items) ||
          !Number.isSafeInteger(e.total) ||
          e.offset !== offset ||
          (total !== undefined && e.total !== total)
        )
          throw Error("Неполный или изменившийся список Яндекс Диска");
        total = e.total;
        for (const f of e.items) {
          if (/[\\/]/.test(f.name))
            throw Error("Недопустимый разделитель в имени удалённого файла");
          path(f.name);
          if (names.has(f.name))
            throw Error("Повтор файла при обходе Яндекс Диска");
          names.add(f.name);
          const rel = join(p, f.name);
          if (
            f.type === "dir"
              ? this.rules && !this.rules.folder(rel)
              : this.rules && !this.rules.file(rel)
          )
            continue;
          paths.push(rel);
          if (f.type === "dir") {
            directories.push(rel);
            await walk(rel, depth + 1);
          } else if (f.type === "file") files[rel] = this.info(f, rel);
          else throw Error("Неизвестный тип файла Яндекс Диска");
        }
        offset += e.items.length;
        if (!e.items.length && offset < total!)
          throw Error("Пустая страница Яндекс Диска");
      } while (offset < total!);
    };
    await walk("", 0);
    uniquePaths(paths);
    return {
      files,
      directories,
      identity: this.identity,
      complete: true,
      warnings: [
        "Яндекс Диск не предоставляет атомарную проверку версии при перезаписи: не изменяйте файлы другим клиентом во время отправки.",
      ],
    };
  }
  private trusted(href: string) {
    const u = new URL(href);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !["yandex.net", "yandex.ru", "yandex.com"].some(
        (d) => u.hostname === d || u.hostname.endsWith("." + d),
      )
    )
      throw Error("Неожиданный адрес передачи Яндекс Диска");
    return href;
  }
  async read(f: FileInfo, signal: AbortSignal) {
    if ((await this.meta(f.path, signal)).sha256.toLowerCase() !== f.hash)
      throw Error("Файл Яндекс Диска изменился");
    const d = await json(
      this.http,
      this.url("/resources/download", { path: this.full(f.path) }),
      this.options(signal),
    );
    return bytes(this.http, this.trusted(d.href), {
      signal,
      maxBytes: this.limit,
      redirect: "follow",
    });
  }
  private async check(
    p: string,
    expected: FileInfo | undefined,
    signal: AbortSignal,
  ) {
    try {
      const f = await this.meta(p, signal);
      if (!expected || f.sha256?.toLowerCase() !== expected.hash)
        throw Error("Файл Яндекс Диска изменился или появился");
    } catch (e) {
      if ((e as { status?: number }).status === 404 && !expected) return;
      throw e;
    }
  }
  private async mkdirs(p: string, signal: AbortSignal) {
    let at = "";
    for (const x of p.split("/").slice(0, -1)) {
      at = join(at, x);
      const r = await this.http.fetch(
        this.url("/resources", { path: this.full(at) }),
        this.options(signal, { method: "PUT" }),
      );
      if (r.status === 409) {
        const f = await this.meta(at, signal);
        if (f.type !== "dir") throw Error("Файл блокирует создание папки");
      } else if (r.status !== 201)
        throw Error("Создание папки Яндекс Диска: HTTP " + r.status);
    }
  }
  async write(
    p: string,
    b: Uint8Array,
    expected: FileInfo | undefined,
    _mtime: number | undefined,
    signal: AbortSignal,
  ) {
    await this.mkdirs(p, signal);
    await this.check(p, expected, signal);
    const d = await json(
      this.http,
      this.url("/resources/upload", {
        path: this.full(p),
        overwrite: expected ? "true" : "false",
      }),
      this.options(signal),
    );
    const r = await this.http.fetch(this.trusted(d.href), {
      method: "PUT",
      signal,
      body: b,
    });
    if (r.status < 200 || r.status >= 300)
      throw Error("Загрузка Яндекс Диска: HTTP " + r.status);
    const attempts = r.status === 202 ? 20 : 1;
    const expectedHash = sha(b);
    for (let i = 0; i < attempts; i++) {
      signal.throwIfAborted();
      try {
        const f = this.info(await this.meta(p, signal), p);
        if (f.hash === expectedHash) return f;
      } catch (e) {
        if ((e as { status?: number }).status !== 404) throw e;
      }
      if (i + 1 < attempts) await delay(500, undefined, { signal });
    }
    throw Error(
      "Запись Яндекс Диска ещё не подтверждена ожидаемой checksum. Перепроверьте файлы; незавершённая операция сохранена.",
    );
  }
  async delete(f: FileInfo, trash: boolean, signal: AbortSignal) {
    await this.check(f.path, f, signal);
    const r = await this.http.fetch(
      this.url("/resources", {
        path: this.full(f.path),
        permanently: String(!trash),
      }),
      this.options(signal, { method: "DELETE" }),
    );
    if (r.status === 202) {
      const d = JSON.parse(await r.text());
      const url = new URL(this.trusted(d.href));
      if (url.origin !== "https://cloud-api.yandex.net")
        throw Error("Неожиданный адрес операции");
      for (let i = 0; i < 30; i++) {
        signal.throwIfAborted();
        const op = await json(this.http, url.href, this.options(signal));
        if (op.status === "success") return;
        if (op.status === "failed")
          throw Error("Удаление Яндекс Диска не выполнено");
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error("Удаление ещё выполняется. Повторите проверку позже.");
    }
    if (r.status !== 204)
      throw Error("Удаление Яндекс Диска: HTTP " + r.status);
  }
}
