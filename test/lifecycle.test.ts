import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import SyncStudio from "../src/controller";
import { StudioView } from "../src/ui";
import { vault } from "./fixture-vault";
import { sha } from "../src/core/paths";
import { newProfile } from "../src/core/model";
import type { NetRequest } from "../src/sources/types";

function dom() {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document });
  const proto = window.HTMLElement.prototype as any;
  proto.createEl = function (tag: string, options: any = {}) {
    const e = window.document.createElement(tag);
    if (options.text) e.textContent = options.text;
    if (options.cls) e.className = options.cls;
    this.append(e);
    return e;
  };
  proto.empty = function () {
    this.replaceChildren();
  };
  proto.addClass = function (c: string) {
    this.classList.add(c);
  };
  proto.toggleClass = function (c: string, on: boolean) {
    this.classList.toggle(c, on);
  };
  proto.setText = function (t: string) {
    this.textContent = t;
  };
  return window;
}
async function click(label: string, scope: ParentNode = document) {
  const target = [...scope.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;
  assert.ok(target, "Button missing: " + label);
  assert.equal(target.disabled, false, "Button disabled: " + label);
  await target.onclick!(new window.MouseEvent("click") as any);
  await new Promise((r) => setTimeout(r, 0));
}
function input(label: string, value: string, scope: ParentNode = document) {
  const wrap = [...scope.querySelectorAll("label")].find(
    (e) => e.querySelector("span")?.textContent === label,
  );
  assert.ok(wrap, "Field missing: " + label);
  const e = wrap.querySelector("input,select,textarea") as HTMLInputElement;
  e.value = value;
  e.dispatchEvent(
    new window.Event(e.tagName === "SELECT" ? "change" : "input", {
      bubbles: true,
    }),
  );
  return e;
}
const modal = () => [...document.querySelectorAll(".modal-content")].at(-1)!;
function response(data: any, status = 200, headers = {}) {
  const b =
    data instanceof Uint8Array ? data : Buffer.from(JSON.stringify(data));
  return {
    status,
    headers,
    text: async () => Buffer.from(b).toString(),
    arrayBuffer: async () => Uint8Array.from(b).buffer,
  };
}
class Cloud {
  content: string | undefined = "first note";
  version = 1;
  deny = false;
  duplicate = false;
  calls: string[] = [];
  meta() {
    return {
      id: "note",
      name: "note.md",
      mimeType: "text/markdown",
      size: String(Buffer.byteLength(this.content || "")),
      version: String(this.version),
      sha256Checksum: sha(Buffer.from(this.content || "")),
      modifiedTime: "2026-01-01T00:00:00Z",
    };
  }
  async fetch(url: string, req: NetRequest = {}) {
    this.calls.push(url);
    const u = new URL(url);
    if (u.hostname === "oauth2.googleapis.com")
      return response({ access_token: "access", expires_in: 3600 });
    if (u.hostname === "openidconnect.googleapis.com")
      return response({ sub: "account" });
    if (this.deny)
      return response(
        { error: { errors: [{ reason: "insufficientPermissions" }] } },
        403,
      );
    if (u.hostname === "www.googleapis.com") {
      assert.equal(req.headers?.Authorization, "Bearer access");
      if (u.pathname.endsWith("/files/root"))
        return response({
          id: "root",
          name: "My folder",
          mimeType: "application/vnd.google-apps.folder",
        });
      if (u.pathname.endsWith("/files") && req.method === "POST") {
        const raw = Buffer.from(req.body as Uint8Array).toString();
        this.content = raw
          .split("Content-Type: application/octet-stream\r\n\r\n")[1]
          .split("\r\n--")[0];
        this.version++;
        return response(this.meta());
      }
      if (u.pathname.endsWith("/files"))
        return response({
          files:
            this.content === undefined
              ? []
              : this.duplicate
                ? [this.meta(), { ...this.meta(), id: "duplicate" }]
                : [this.meta()],
        });
      if (u.pathname.endsWith("/files/note")) {
        if (u.searchParams.get("alt") === "media")
          return response(Buffer.from(this.content!));
        if (req.method === "PATCH") {
          assert.equal(req.headers?.["If-Match"], '"' + this.version + '"');
          if (typeof req.body === "string" && req.body.includes("trashed")) {
            this.content = undefined;
            return response({ id: "note" });
          }
          const raw = Buffer.from(req.body as Uint8Array).toString();
          this.content = raw
            .split("Content-Type: application/octet-stream\r\n\r\n")[1]
            .split("\r\n--")[0];
          this.version++;
        }
        return response(this.meta(), 200, { etag: '"' + this.version + '"' });
      }
    }
    if (u.hostname === "api.github.com") {
      const b = Buffer.from(this.content || "");
      const id = createHash("sha1")
        .update(Buffer.from(`blob ${b.length}\0`))
        .update(b)
        .digest("hex");
      if (u.pathname === "/rate_limit")
        return response({ rate: { remaining: 60 } });
      if (u.pathname.includes("/commits/"))
        return response({ commit: { tree: { sha: "tree" } } });
      if (u.pathname.includes("/git/trees/"))
        return response({
          tree: [
            {
              type: "blob",
              mode: "100644",
              path: "note.md",
              sha: id,
              size: b.length,
            },
          ],
        });
      if (u.pathname.includes("/git/blobs/"))
        return response({ encoding: "base64", content: b.toString("base64") });
    }
    if (u.hostname === "cloud-api.yandex.net") {
      assert.equal(req.headers?.Authorization, "OAuth yandex-token");
      if (u.pathname === "/v1/disk")
        return response({ user: { uid: "ya-account" } });
      const path = u.searchParams.get("path");
      assert.ok(
        path === "disk:/" || path === "disk:/note.md",
        "Incorrect Yandex root: " + path,
      );
      if (u.pathname.endsWith("/upload"))
        return response({ href: "https://uploader.disk.yandex.net/upload" });
      if (req.method === "DELETE") {
        this.content = undefined;
        return response({}, 204);
      }
      if (u.pathname.endsWith("/download"))
        return response({ href: "https://downloader.disk.yandex.ru/bytes" });
      if (path === "disk:/")
        return response({
          type: "dir",
          _embedded: {
            items:
              this.content === undefined
                ? []
                : [
                    {
                      name: "note.md",
                      type: "file",
                      path: "disk:/note.md",
                      size: Buffer.byteLength(this.content),
                      sha256: sha(Buffer.from(this.content)),
                      modified: "2026-01-01T00:00:00Z",
                    },
                  ],
            total: this.content === undefined ? 0 : 1,
            offset: 0,
          },
        });
      if (this.content === undefined)
        return response({ error: "DiskNotFoundError" }, 404);
      return response({
        type: "file",
        sha256: sha(Buffer.from(this.content!)),
        size: Buffer.byteLength(this.content!),
        path: "disk:/note.md",
      });
    }
    if (u.hostname === "uploader.disk.yandex.net") {
      assert.equal(req.method, "PUT");
      this.content = Buffer.from(req.body as Uint8Array).toString();
      return response({}, 201);
    }
    if (u.hostname === "downloader.disk.yandex.ru") {
      assert.equal(req.redirect, "follow");
      return response(Buffer.from(this.content!));
    }
    throw Error("Unexpected HTTP request: " + u.pathname);
  }
}
async function harness() {
  const window = dom();
  const v = await vault();
  const app = v.app as any;
  const secrets = new Map<string, string>();
  app.secretStorage = {
    getSecret: (id: string) => secrets.get(id) || null,
    setSecret: (id: string, value: string) => secrets.set(id, value),
  };
  let view: StudioView;
  app.workspace = {
    getLeavesOfType: () => (view ? [{ view }] : []),
    onLayoutReady: () => {},
  };
  app.vault.on = () => ({});
  const studio = new SyncStudio(app, {
    id: "sync-studio",
    version: "0.1.1",
  } as any);
  const cloud = new Cloud();
  (studio as any).http = cloud;
  await studio.onload();
  view = new StudioView({ app } as any, studio);
  await view.onOpen();
  return {
    studio,
    view,
    cloud,
    v,
    cleanup: async () => {
      studio.onunload();
      await v.cleanup();
      await window.happyDOM.abort();
    },
  };
}

test("UI: Yandex setup, save, edit, profile, pull, update, delete-to-trash and recheck", async () => {
  const h = await harness();
  try {
    await click("02 / Подключения");
    await click("＋ Добавить подключение");
    input("Сервис", "yandex", modal());
    assert.ok(!modal().textContent?.includes("Google Desktop OAuth"));
    assert.ok(!modal().textContent?.includes("Войти в Google"));
    input("OAuth-токен Яндекс Диска", "yandex-token", modal());
    await click("Проверить подключение и папку", modal());
    assert.match(modal().textContent!, /доступ подтверждён/);
    await click("Сохранить подключение", modal());
    assert.equal(h.studio.data.connections.length, 1);
    assert.ok(modal().textContent?.includes("Подключение сохранено"));
    await click("Готово / закрыть", modal());
    await click("Редактировать");
    input("Название", "Мой Диск", modal());
    await click("Сохранить и создать профиль", modal());
    let p = h.studio.data.profiles[0];
    assert.equal(p.remoteRoot, "disk:/");
    assert.equal(p.name, "Мой Диск");
    await click("Изменить");
    const field = input("Название профиля", "Заметки");
    field.focus();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(
      document.activeElement,
      field,
      "editing must preserve the focused input",
    );
    await click("Сохранить");
    p = h.studio.data.profiles[0];
    await click("Проверить изменения");
    await click("Выполнить этот план", modal());
    assert.equal(
      await readFile(join(h.v.root, "note.md"), "utf8"),
      "first note",
    );
    h.cloud.content = "remote changed";
    // Obsidian's move API is not required to overwrite existing paths.
    h.v.adapter.rename = async () => {
      throw Error("Destination already exists");
    };
    await h.studio.apply(await h.studio.inspect(p));
    assert.equal(
      await readFile(join(h.v.root, "note.md"), "utf8"),
      "remote changed",
    );
    p.deletion = "trash";
    h.cloud.content = undefined;
    const deletion = await h.studio.inspect(p);
    assert.equal(deletion.operations[0].action, "delete-local");
    const result = await h.studio.apply(deletion);
    assert.equal(result.status, "completed");
    assert.equal(await h.v.adapter.exists("note.md"), false);
    assert.equal(
      await readFile(join(h.v.root, ".trash/note.md"), "utf8"),
      "remote changed",
    );
    assert.equal(
      (await h.studio.inspect(p)).operations.filter((o) => o.action !== "adopt")
        .length,
      0,
    );
  } finally {
    await h.cleanup();
  }
});

test("UI: Google authorization stays open, edits persist, Drive pull/push work and failed apply stays visible", async () => {
  const h = await harness();
  try {
    // Simulate successful browser grant. Token refresh and Drive transport below use real controller code.
    h.studio.connectGoogle = async (c) => {
      c.clientId = "desktop.apps.googleusercontent.com";
      c.subject = "account";
      h.studio.setSecret(c, "refresh");
    };
    await click("02 / Подключения");
    await click("＋ Добавить подключение");
    await click("Войти в Google", modal());
    assert.ok(modal().textContent?.includes("Google авторизован"));
    await click("Проверить подключение и папку", modal());
    assert.match(modal().textContent!, /My folder/);
    await click("Сохранить и создать профиль", modal());
    await click("Проверить изменения");
    await click("Выполнить этот план", modal());
    assert.equal(
      await readFile(join(h.v.root, "note.md"), "utf8"),
      "first note",
    );
    const p = h.studio.data.profiles[0];
    p.direction = "push";
    await writeFile(join(h.v.root, "note.md"), "local change");
    const pushed = await h.studio.apply(await h.studio.inspect(p));
    assert.equal(pushed.status, "completed");
    assert.equal(h.cloud.content, "local change");
    p.direction = "pull";
    h.cloud.content = "next revision";
    h.cloud.version++;
    await click("01 / Профили");
    await click("Проверить изменения");
    h.cloud.deny = true;
    await click("Выполнить этот план", modal());
    assert.match(modal().textContent!, /HTTP 403/);
    assert.match(modal().textContent!, /Перепроверить файлы/);
    assert.equal(
      await readFile(join(h.v.root, "note.md"), "utf8"),
      "local change",
    );
  } finally {
    await h.cleanup();
  }
});

test("Drive collision names the blocked path; excluded duplicates do not abort an unrelated profile", async () => {
  const h = await harness();
  try {
    const c = {
      id: "drive",
      name: "Drive",
      provider: "gdrive" as const,
      secretRef: "drive-secret",
      clientId: "desktop.apps.googleusercontent.com",
      subject: "account",
      root: "root",
    };
    h.studio.setSecret(c, "refresh");
    await h.studio.saveConnection(c);
    const p = await h.studio.createProfile(c);
    h.cloud.duplicate = true;
    await assert.rejects(() => h.studio.inspect(p), /Коллизия.*note.md/);
    assert.match(h.studio.lastError, /note.md/);
    await click("Исключить конфликтующие пути из профиля");
    assert.deepEqual(p.excludePaths, ["note.md"]);
    assert.equal((await h.studio.inspect(p)).operations.length, 0);
  } finally {
    await h.cleanup();
  }
});

test("UI: public GitHub setup needs no Google fields or token and completes a pull", async () => {
  const h = await harness();
  try {
    await click("02 / Подключения");
    await click("＋ Добавить подключение");
    input("Сервис", "github", modal());
    assert.ok(!modal().textContent?.includes("Google Desktop OAuth"));
    input("Репозиторий owner/repo", "owner/repo", modal());
    await click("Проверить подключение и папку", modal());
    assert.match(modal().textContent!, /публичный доступ/);
    await click("Сохранить и создать профиль", modal());
    await click("Проверить изменения");
    await click("Выполнить этот план", modal());
    assert.equal(
      await readFile(join(h.v.root, "note.md"), "utf8"),
      "first note",
    );
  } finally {
    await h.cleanup();
  }
});

test("UI: testing an edited token does not replace the saved credential until Save", async () => {
  const h = await harness();
  try {
    const c = {
      id: "ya",
      name: "Disk",
      provider: "yandex" as const,
      secretRef: "old",
      root: "disk:/",
    };
    h.studio.setSecret(c, "old-token");
    await h.studio.saveConnection(c);
    await click("02 / Подключения");
    await click("Редактировать");
    input("OAuth-токен Яндекс Диска", "yandex-token", modal());
    await click("Проверить подключение и папку", modal());
    assert.equal(h.studio.getSecret(h.studio.data.connections[0]), "old-token");
    await click("Сохранить подключение", modal());
    assert.equal(
      h.studio.getSecret(h.studio.data.connections[0]),
      "yandex-token",
    );
  } finally {
    await h.cleanup();
  }
});

test("controller reload preserves connections, profile and baseline so second pull is a no-op", async () => {
  const h = await harness();
  let reloaded: SyncStudio | undefined;
  try {
    const c = {
      id: "ya",
      name: "Disk",
      provider: "yandex" as const,
      secretRef: "key",
      root: "disk:/",
    };
    h.studio.setSecret(c, "yandex-token");
    await h.studio.saveConnection(c);
    const p = await h.studio.createProfile(c);
    await h.studio.apply(await h.studio.inspect(p));
    reloaded = new SyncStudio(h.studio.app, h.studio.manifest);
    (reloaded as any).persisted = structuredClone((h.studio as any).persisted);
    (reloaded as any).http = h.cloud;
    await reloaded.onload();
    assert.equal(reloaded.data.connections[0].id, "ya");
    const plan = await reloaded.inspect(reloaded.data.profiles[0]);
    assert.equal(plan.operations.filter((o) => o.action !== "adopt").length, 0);
  } finally {
    reloaded?.onunload();
    await h.cleanup();
  }
});

for (const provider of ["gdrive", "yandex"] as const)
  test(`${provider}: create a remote file, update it and propagate local deletion`, async () => {
    const h = await harness();
    try {
      const c = {
        id: provider,
        name: provider,
        provider,
        secretRef: provider,
        root: provider === "gdrive" ? "root" : "disk:/",
        clientId: "desktop.apps.googleusercontent.com",
        subject: "account",
      };
      h.studio.setSecret(c, provider === "gdrive" ? "refresh" : "yandex-token");
      await h.studio.saveConnection(c);
      const p = await h.studio.createProfile(c);
      p.direction = "push";
      p.deletion = "trash";
      h.cloud.content = undefined;
      await writeFile(join(h.v.root, "note.md"), "new local");
      let log = await h.studio.apply(await h.studio.inspect(p));
      assert.equal(log.status, "completed", log.message);
      assert.equal(h.cloud.content, "new local");
      await writeFile(join(h.v.root, "note.md"), "edited local");
      log = await h.studio.apply(await h.studio.inspect(p));
      assert.equal(log.status, "completed", log.message);
      assert.equal(h.cloud.content, "edited local");
      await h.v.adapter.remove("note.md");
      log = await h.studio.apply(await h.studio.inspect(p));
      assert.equal(log.status, "completed", log.message);
      assert.equal(h.cloud.content, undefined);
    } finally {
      await h.cleanup();
    }
  });

test("Drive keep-both preserves the user copy and does not generate repeated conflicts on recheck", async () => {
  const h = await harness();
  try {
    const c = {
      id: "drive",
      name: "Drive",
      provider: "gdrive" as const,
      secretRef: "drive",
      root: "root",
      clientId: "desktop.apps.googleusercontent.com",
      subject: "account",
    };
    h.studio.setSecret(c, "refresh");
    await h.studio.saveConnection(c);
    const p = await h.studio.createProfile(c);
    await writeFile(join(h.v.root, "note.md"), "user copy");
    const plan = await h.studio.inspect(p);
    assert.equal(plan.operations[0].action, "keep-both");
    const log = await h.studio.apply(plan);
    assert.equal(log.status, "completed", log.message);
    assert.equal(
      await readFile(
        join(h.v.root, ".sync-conflicts", plan.id, "note.md"),
        "utf8",
      ),
      "user copy",
    );
    assert.equal(
      (await h.studio.inspect(p)).operations.filter((o) => o.action !== "adopt")
        .length,
      0,
    );
  } finally {
    await h.cleanup();
  }
});

for (const provider of ["gdrive", "yandex"] as const)
  test(`UI: ${provider} folder picker navigates and saves the selected folder`, async () => {
    const h = await harness();
    try {
      const c = {
        id: provider,
        name: provider,
        provider,
        secretRef: provider,
        root: provider === "gdrive" ? "root" : "disk:/",
        clientId: "desktop.apps.googleusercontent.com",
        subject: "account",
      };
      h.studio.setSecret(c, provider === "gdrive" ? "refresh" : "yandex-token");
      await h.studio.saveConnection(c);
      const original = h.cloud.fetch.bind(h.cloud);
      h.cloud.fetch = async (url, request) => {
        const u = new URL(url);
        if (
          u.hostname === "www.googleapis.com" &&
          u.pathname.endsWith("/files")
        ) {
          return response({
            files: u.searchParams.get("q")?.includes("'root'")
              ? [
                  {
                    id: "notes-folder",
                    name: "Notes",
                    mimeType: "application/vnd.google-apps.folder",
                  },
                ]
              : [],
          });
        }
        if (
          u.hostname === "cloud-api.yandex.net" &&
          u.pathname.endsWith("/resources")
        ) {
          const root = u.searchParams.get("path") === "disk:/";
          return response({
            type: "dir",
            _embedded: {
              items: root ? [{ type: "dir", name: "Notes" }] : [],
              total: root ? 1 : 0,
              offset: 0,
            },
          });
        }
        return original(url, request);
      };
      await click("02 / Подключения");
      await click("Редактировать");
      await click("Выбрать папку", modal());
      await click("📁 Notes", modal());
      await click("Выбрать текущую папку", modal());
      await click("Сохранить подключение", modal());
      assert.equal(
        h.studio.data.connections[0].root,
        provider === "gdrive" ? "notes-folder" : "disk:/Notes",
      );
    } finally {
      await h.cleanup();
    }
  });

test("UI: external-folder import keeps its draft across tabs and uploads without changing the source", async () => {
  const h = await harness();
  try {
    const c = {
      id: "ya",
      name: "Disk",
      provider: "yandex" as const,
      secretRef: "ya",
      root: "disk:/",
    };
    h.studio.setSecret(c, "yandex-token");
    await h.studio.saveConnection(c);
    const source = join(h.v.root, "external");
    await mkdir(source);
    await writeFile(join(source, "note.md"), "external source");
    h.cloud.content = undefined;
    await click("04 / Импорт");
    input("Абсолютный путь папки", source);
    input("Папка Яндекс Диска", "disk:/");
    await click("02 / Подключения");
    await click("04 / Импорт");
    assert.ok(!document.body.textContent?.includes("Ветка GitHub"));
    await click("Создать профиль и проверить файлы");
    await click("Выполнить этот план", modal());
    assert.equal(h.cloud.content, "external source");
    assert.equal(
      await readFile(join(source, "note.md"), "utf8"),
      "external source",
    );
  } finally {
    await h.cleanup();
  }
});

test("UI: profile Edit/Save/Cancel isolates drafts across tabs and persists only on Save", async () => {
  const h = await harness();
  try {
    const c = {
      id: "ya",
      name: "Disk",
      provider: "yandex" as const,
      secretRef: "ya",
      root: "disk:/",
    };
    h.studio.setSecret(c, "yandex-token");
    await h.studio.saveConnection(c);
    await h.studio.createProfile(c);
    h.view.render();
    assert.equal(
      (document.querySelector("main fieldset") as HTMLFieldSetElement).disabled,
      true,
    );
    await click("Изменить");
    await click("Подключение");
    input("Название профиля", "Draft name");
    input("Папка внутри vault (пусто = корень)", "Notes");
    await click("Изменения");
    input("Удаления в источнике", "trash");
    await click("Автозапуск");
    input("Интервал, минут", "30");
    assert.equal(h.studio.data.profiles[0].name, "Disk");
    assert.equal(h.studio.data.profiles[0].deletion, "ignore");
    assert.equal(h.studio.data.profiles[0].intervalMinutes, 15);
    await click("02 / Подключения");
    await click("01 / Профили");
    await click("Подключение");
    assert.ok(
      [...document.querySelectorAll("input")].some(
        (i) => i.value === "Draft name",
      ),
    );
    await click("Отмена");
    assert.equal(h.studio.data.profiles[0].name, "Disk");
    assert.ok(
      ![...document.querySelectorAll("input")].some(
        (i) => i.value === "Draft name",
      ),
    );
    await click("Изменить");
    input("Название профиля", "Saved name");
    input("Папка внутри vault (пусто = корень)", "Notes");
    await click("Изменения");
    input("Удаления в источнике", "trash");
    await click("Сохранить");
    assert.equal(h.studio.data.profiles[0].name, "Saved name");
    assert.equal(h.studio.data.profiles[0].localRoot, "Notes");
    assert.equal(h.studio.data.profiles[0].deletion, "trash");
    assert.equal((h.studio as any).persisted.profiles[0].name, "Saved name");
    assert.equal(
      (document.querySelector("main fieldset") as HTMLFieldSetElement).disabled,
      true,
    );
  } finally {
    await h.cleanup();
  }
});

test("UI: invalid profile stays editable; failed storage keeps the draft and original settings", async () => {
  const h = await harness();
  try {
    const c = {
      id: "ya",
      name: "Disk",
      provider: "yandex" as const,
      secretRef: "ya",
      root: "disk:/",
    };
    h.studio.setSecret(c, "yandex-token");
    await h.studio.saveConnection(c);
    await h.studio.createProfile(c);
    h.view.render();
    await click("Изменить");
    await click("Подключение");
    input("Название профиля", "");
    await click("Сохранить");
    assert.match(document.body.textContent!, /Укажите название/);
    assert.equal(h.studio.data.profiles[0].name, "Disk");
    input("Название профиля", "Valid name");
    const save = h.studio.saveData.bind(h.studio);
    h.studio.saveData = async () => {
      throw Error("Storage unavailable");
    };
    await click("Сохранить");
    assert.match(document.body.textContent!, /Storage unavailable/);
    assert.equal(h.studio.data.profiles[0].name, "Disk");
    assert.ok(
      [...document.querySelectorAll("input")].some(
        (i) => i.value === "Valid name",
      ),
    );
    h.studio.saveData = save;
    await click("Сохранить");
    assert.equal((h.studio as any).persisted.profiles[0].name, "Valid name");
  } finally {
    await h.cleanup();
  }
});
