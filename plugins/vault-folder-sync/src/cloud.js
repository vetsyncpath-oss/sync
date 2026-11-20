import { openPublic, publicSource } from "./public-sources";
import { requestUrl } from "obsidian";
import {
  DriveStore,
  driveRoot,
  YandexStore,
} from "../../../src/sources/remotes";
import { json } from "../../../src/adapters/http-response";
import {
  GoogleAuthorizedTransport,
  GoogleTokenManager,
  parseGoogleClient,
} from "../../../src/auth/google-auth";
import { authorizeGoogleDesktop } from "../../../src/adapters/google-desktop-oauth";
import { path as relativePath } from "../../../src/core/paths";

export const ENGINES = {
  webdav: "WebDAV",
  google: "Google Drive",
  googlePublic: "Google Drive · публичная папка",
  yandexPublic: "Яндекс Диск · публичная папка",
  git: "Git · публичный репозиторий",
  yandex: "Яндекс Диск",
};

export function cloudRoot(engine, input) {
  if (engine === "google") return driveRoot(input);
  if (engine !== "yandex") throw Error("Неизвестный сервис");
  const folder = input
    .trim()
    .replace(/^(?:disk:)?\//, "")
    .replace(/\/$/, "");
  return "disk:/" + relativePath(folder, true);
}

const transport = {
  async fetch(url, opts = {}) {
    opts.signal?.throwIfAborted();
    const body =
      opts.body instanceof Uint8Array
        ? Uint8Array.from(opts.body).buffer
        : opts.body;
    let r;
    try {
      r = await requestUrl({
        url,
        method: opts.method || "GET",
        headers: opts.headers,
        body,
        throw: false,
      });
    } catch {
      throw Error("Не удалось получить ответ облачного сервиса.");
    }
    opts.signal?.throwIfAborted();
    if (opts.maxBytes && r.arrayBuffer.byteLength > opts.maxBytes)
      throw Error("Ответ превышает допустимый размер.");
    const headers = Object.fromEntries(
      Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
      status: r.status,
      headers,
      text: async () => r.text,
      arrayBuffer: async () => r.arrayBuffer,
    };
  },
};

export async function signInGoogle(clientJSON, signal, openBrowser) {
  const client = parseGoogleClient(clientJSON);
  const grant = await authorizeGoogleDesktop(
    client,
    transport,
    signal,
    openBrowser,
  );
  return JSON.stringify({
    client,
    refresh: grant.refreshToken,
    subject: grant.subject,
  });
}

function googleTransport(credential, rotate) {
  if (credential.startsWith("{")) {
    let data;
    try {
      data = JSON.parse(credential);
    } catch {
      throw Error("Некорректные данные входа Google.");
    }
    if (!data.client?.clientId || !data.refresh || !data.subject)
      throw Error("Повторите вход в Google.");
    const port = {
      getSecret: () => data.refresh,
      setSecret: (_, token) => {
        data.refresh = token;
        rotate(JSON.stringify(data));
      },
    };
    return new GoogleAuthorizedTransport(
      transport,
      new GoogleTokenManager(
        data.client,
        "refresh",
        port,
        transport,
        Date.now,
        data.subject,
      ),
    );
  }
  return {
    fetch(url, options) {
      const u = new URL(url);
      if (
        u.origin !== "https://www.googleapis.com" ||
        !/^\/(?:upload\/)?drive\/v3\//.test(u.pathname)
      )
        throw Error("Неизвестный адрес Google Drive.");
      return transport.fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: "Bearer " + credential },
      });
    },
  };
}

export async function openCloud(
  settings,
  credential,
  included,
  signal,
  rotate,
) {
  if (publicSource(settings.engine)) return openPublic(settings, credential, included, signal, transport);
  credential = credential.trim();
  if (!credential) throw Error("Укажите OAuth-токен или подключите аккаунт.");
  const root = cloudRoot(settings.engine, settings.url);
  let store, account;
  const rules = { file: included, folder: included };
  if (settings.engine === "google") {
    const http = googleTransport(credential, rotate);
    const about = await json(
      http,
      "https://www.googleapis.com/drive/v3/about?fields=user(permissionId)",
      { signal },
    );
    account = about.user?.permissionId;
    store = new DriveStore(
      http,
      settings.url,
      Number.MAX_SAFE_INTEGER,
      undefined,
      account,
      rules,
    );
  } else {
    const about = await json(
      transport,
      "https://cloud-api.yandex.net/v1/disk?fields=user.uid",
      {
        signal,
        headers: { Authorization: "OAuth " + credential },
      },
    );
    account = about.user?.uid;
    store = new YandexStore(
      transport,
      root,
      credential,
      Number.MAX_SAFE_INTEGER,
      rules,
    );
  }
  if (!["number", "string"].includes(typeof account) || !String(account).trim())
    throw Error("Сервис не подтвердил идентификатор аккаунта.");
  const snapshot = await store.scan(signal);
  if (!snapshot.complete) throw Error("Получен неполный список файлов.");
  return {
    identity: [settings.engine, String(account), root],
    snapshot,
    async read(path) {
      const bytes = await store.read(snapshot.files[path], signal);
      return Uint8Array.from(bytes).buffer;
    },
    async write(path, bytes, expected, mtime) {
      const result = await store.write(
        path,
        new Uint8Array(bytes),
        expected,
        mtime,
        signal,
      );
      return result.version;
    },
    async remove(path) {
      await store.delete(snapshot.files[path], true, signal);
    },
    async confirmAbsent(path) {
      await store.confirmAbsent(path, signal);
    },
  };
}
