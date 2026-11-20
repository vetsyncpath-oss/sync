import { Platform } from "obsidian";
import { json, bytes } from "../../../src/adapters/http-response";
import {
  DriveStore,
  GitHubStore,
  driveRoot,
} from "../../../src/sources/remotes";
import { path, uniquePaths } from "../../../src/core/paths";
import { openNativeGit } from "./public-git";

export const publicSource = (engine) =>
  ["googlePublic", "yandexPublic", "git"].includes(engine);
const anonymous = (engine) => engine === "yandexPublic" || engine === "git";
export const needsCredential = (s) =>
  !anonymous(s.engine) && (s.engine !== "webdav" || !!s.user);

export function gitLocation(s) {
  const u = new URL(s.url.trim());
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname === "/"
  )
    throw Error("Введите HTTPS URL клонирования публичного репозитория.");
  const repo = u.href.replace(/\/$/, "").replace(/\.git$/, "");
  const ref = (s.gitRef || "").trim() || "HEAD";
  if (
    ref.startsWith("-") ||
    /[\s~^:?*\[\\\x00-\x1f\x7f]|\.\.|@\{|\/\/|\/$/.test(ref)
  )
    throw Error("Проверьте имя ветки, тега или коммита.");
  const prefix = path((s.gitFolder || "").trim().replace(/^\/|\/$/g, ""), true);
  if (
    u.hostname === "github.com" &&
    !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repo)
  )
    throw Error(
      "Укажите URL репозитория GitHub. Ветку и подпапку введите в отдельных полях.",
    );
  return { repo, ref, prefix };
}

export function publicRoot(s) {
  if (s.engine === "git") return gitLocation(s).repo;
  if (s.engine === "googlePublic") return driveRoot(s.url);
  const u = new URL(s.url.trim());
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !/^(?:yadi\.sk|(?:disk(?:\.360)?|360)\.yandex\.(?:ru|com|kz|by))$/.test(
      u.hostname,
    ) ||
    u.pathname === "/"
  )
    throw Error("Укажите публичную ссылку Яндекс Диска на папку.");
  return u.origin + u.pathname.replace(/\/$/, "");
}

class YandexPublic {
  constructor(http, key, included) {
    this.http = http;
    this.key = key;
    this.included = included;
  }
  url(p, download = false, offset = 0) {
    const q = new URLSearchParams({ public_key: this.key, path: "/" + p });
    if (!download) {
      q.set("limit", "200");
      q.set("offset", String(offset));
    }
    return (
      "https://cloud-api.yandex.net/v1/disk/public/resources" +
      (download ? "/download?" : "?") +
      q
    );
  }
  async scan(signal) {
    const files = Object.create(null),
      directories = [],
      paths = [],
      pending = [""];
    while (pending.length) {
      const dir = pending.pop();
      let offset = 0,
        total;
      do {
        const data = await json(this.http, this.url(dir, false, offset), {
          signal,
        });
        const page = data._embedded;
        if (
          data.type !== "dir" ||
          !page ||
          !Array.isArray(page.items) ||
          !Number.isSafeInteger(page.total) ||
          page.total < 0 ||
          page.offset !== offset ||
          (total !== undefined && total !== page.total) ||
          offset + page.items.length > page.total ||
          (!page.items.length && offset < page.total)
        )
          throw Error("Неполный список публичной папки Яндекс Диска.");
        total = page.total;
        for (const item of page.items) {
          if (typeof item.name !== "string" || /[/\\]/.test(item.name))
            throw Error("Некорректное имя на Яндекс Диске.");
          const p = path(dir ? dir + "/" + item.name : item.name);
          if (!this.included(p)) continue;
          paths.push(p);
          if (item.type === "dir") {
            directories.push(p);
            pending.push(p);
          } else if (item.type === "file") {
            if (!Number.isSafeInteger(item.size) || item.size < 0)
              throw Error("Нет размера файла: " + p);
            const f = {
              path: p,
              size: item.size,
              mtime: Date.parse(item.modified),
              hash: item.sha256?.toLowerCase(),
            };
            if (!/^[a-f\d]{64}$/.test(f.hash || "")) {
              const content = await this.read(f, signal);
              f.hash = Array.from(
                new Uint8Array(await crypto.subtle.digest("SHA-256", content)),
                (b) => b.toString(16).padStart(2, "0"),
              ).join("");
            }
            files[p] = f;
          } else throw Error("Неизвестный тип ресурса: " + p);
        }
        offset += page.items.length;
      } while (offset < total);
    }
    uniquePaths(paths);
    return { files, directories, complete: true };
  }
  async read(file, signal) {
    const link = await json(this.http, this.url(file.path, true), { signal });
    const u = new URL(link.href);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !/(^|\.)yandex\.(net|ru|com)$/.test(u.hostname)
    )
      throw Error("Неизвестный адрес загрузки Яндекс Диска.");
    const data = await bytes(this.http, u.href, { signal });
    if (data.length !== file.size) throw Error("Файл изменился: " + file.path);
    return data;
  }
  async confirmAbsent(p, signal) {
    if ((await json(this.http, this.url(""), { signal })).type !== "dir")
      throw Error("Публичная папка недоступна.");
    try {
      await json(this.http, this.url(p), { signal });
    } catch (e) {
      if (e.status === 404) return;
      throw e;
    }
    throw Error("Файл снова появился на Яндекс Диске: " + p);
  }
}

export async function openPublic(s, credential, included, signal, http) {
  const root = publicRoot(s),
    rules = { file: included, folder: included };
  let store,
    identity = [s.engine, root];
  if (s.engine === "git") {
    const { repo, ref, prefix } = gitLocation(s);
    identity.push(ref, prefix);
    if (new URL(repo).hostname === "github.com")
      store = new GitHubStore(
        http,
        repo,
        ref,
        prefix,
        "",
        Number.MAX_SAFE_INTEGER,
        rules,
      );
    else {
      if (!Platform?.isDesktopApp)
        throw Error(
          "На мобильном клиенте используйте публичный репозиторий GitHub.",
        );
      store = await openNativeGit(repo, ref, prefix, included, signal);
    }
  } else if (s.engine === "googlePublic") {
    if (!credential.trim())
      throw Error("Введите API key проекта с включённым Google Drive API.");
    store = new DriveStore(
      http,
      s.url.trim(),
      Number.MAX_SAFE_INTEGER,
      credential.trim(),
      "",
      rules,
    );
  } else store = new YandexPublic(http, root, included);
  try {
    const snapshot = await store.scan(signal);
    return {
      identity,
      snapshot,
      close: () => store.close?.(),
      async read(p) {
        return Uint8Array.from(await store.read(snapshot.files[p], signal))
          .buffer;
      },
      async confirmAbsent(p) {
        await store.confirmAbsent(p, signal);
      },
    };
  } catch (e) {
    await store.close?.();
    throw e;
  }
}
