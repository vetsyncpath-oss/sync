"use strict";

import { ENGINES, cloudRoot, openCloud, signInGoogle } from "./cloud";
const { Platform, Plugin, PluginSettingTab, Setting, Notice, Modal, TFile, TFolder, requestUrl } = require("obsidian");

const DIRECTIONS = { both: "В обе стороны", upload: "Из Obsidian в WebDAV", download: "Из WebDAV в Obsidian" };
const DELETIONS = { restore: "Восстанавливать копию", ignore: "Оставлять удалённым", propagate: "Передавать удаление" };
const CONFLICTS = { skip: "Пропускать с записью в отчёт", local: "Предпочитать Obsidian", remote: "Предпочитать WebDAV", newer: "Предпочитать более новую версию" };
const DEFAULTS = { name: "Основная", engine: "webdav", url: "", user: "", folder: "", secret: "", direction: "both", deletion: "restore",
  conflict: "skip", interval: 0, startup: false, onEdit: false, delay: 15, onReconnect: false };
const EMPTY_STATE = () => ({ scope: "", files: {} });
const LABELS = {
  upload: "Локально → WebDAV", download: "WebDAV → локально", deleteRemote: "Удалить на WebDAV",
  deleteLocal: "Переместить в корзину Obsidian", conflict: "Конфликт, требуется решение",
  ignore: "Пропущено по правилам пары", editDelete: "Конфликт: файл удалён с одной стороны и изменён с другой",
  unguarded: "Пропущено: сервер не дал строгий ETag"
};

// Missing hashes represent absent files. A deletion requires a previous common version.
function decide(config, local, remote, base, localTime, remoteTime) {
  if (local === remote) return "equal";
  const canUpload = config.direction !== "download";
  const canDownload = config.direction !== "upload";
  if (!local || !remote) {
    const transfer = local ? "upload" : "download";
    const mayCopy = local ? canUpload : canDownload;
    const mayDelete = local ? canDownload : canUpload;
    if (base && config.deletion === "ignore") return "ignore";
    if (base && config.deletion === "propagate" && mayDelete) {
      if ((local || remote) !== base.hash) return "editDelete";
      return local ? "deleteLocal" : "deleteRemote";
    }
    return mayCopy ? transfer : "ignore";
  }
  if (base && remote === base.hash && canUpload) return "upload";
  if (base && local === base.hash && canDownload) return "download";
  let winner = config.conflict;
  if (winner === "newer") {
    // HTTP dates have one-second precision.
    const l = Math.floor(localTime / 1000), r = Math.floor(remoteTime / 1000);
    if (!Number.isFinite(l) || !Number.isFinite(r) || l === r) return "conflict";
    winner = l > r ? "local" : "remote";
  }
  if (winner === "local" && canUpload) return "upload";
  if (winner === "remote" && canDownload) return "download";
  return "conflict";
}

const DAV = "DAV:";
const xmlBody = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getlastmodified/></d:prop></d:propfind>';
const child = (node, name) => Array.from(node.children).find(el => el.localName === name && el.namespaceURI === DAV);
const statusOK = text => /^HTTP\/\S+ 2\d\d(?:\s|$)/i.test(text.trim());
const strong = tag => typeof tag === "string" && /^"[^"\r\n]*"$/.test(tag);
const message = error => error instanceof Error ? error.message : String(error);
const parts = p => p ? p.split("/") : [];
const prefix = (a, b) => a ? a + "/" + b : b;

function safePart(name) {
  // Use names portable between the desktop and mobile vault adapters.
  return name.length > 0 && !/^[.]|[. ]$|[<>:"/\\|?*\x00-\x1f\x7f]/.test(name)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}

function isExcluded(vault, p) {
  return p === vault.configDir || p.startsWith(vault.configDir + "/") || parts(p).some(x => x.startsWith("."));
}

function localRoot(vault, value) {
  const root = value.trim().replace(/^\/+|\/+$/g, "");
  if (parts(root).some(x => !safePart(x)) || isExcluded(vault, root)) throw new Error("Проверьте путь к локальной папке.");
  if (root && !(vault.getAbstractFileByPath(root) instanceof TFolder)) throw new Error("Локальная папка не найдена: " + root);
  return root;
}

function endpoint(value) {
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error("Введите полный HTTPS-адрес папки WebDAV."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Нужен HTTPS-адрес папки без логина, пароля и параметров в URL.");
  url.pathname = url.pathname.replace(/\/*$/, "/");
  return url;
}

async function hash(buffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

class WebDav {
  constructor(url, user, password) {
    this.base = url;
    this.auth = "";
    if (user || password) {
      if (user.includes(":")) throw new Error("Логин WebDAV содержит двоеточие.");
      const bytes = new TextEncoder().encode(user + ":" + password);
      this.auth = "Basic " + btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
    }
  }

  url(path) {
    return this.base.href + parts(path).map(encodeURIComponent).join("/");
  }

  async request(method, path, headers = {}, body, directory = false) {
    const url = this.url(path) + (directory && path ? "/" : "");
    if (this.auth) headers.Authorization = this.auth;
    return await requestUrl({ url, method, headers, body, throw: false });
  }

  check(response, codes, method, path) {
    if (!codes.includes(response.status)) {
      const reason = response.status === 412 ? " — файл успел измениться. Повторите проверку."
        : response.status === 401 || response.status === 403 ? " — проверьте пароль приложения и права доступа." : "";
      throw new Error(method + " " + (path || "/") + " · HTTP " + response.status + reason);
    }
  }

  async list(path) {
    const response = await this.request("PROPFIND", path, { Depth: "1", "Content-Type": "application/xml; charset=utf-8" }, xmlBody, true);
    this.check(response, [207], "PROPFIND", path);
    const doc = new DOMParser().parseFromString(response.text, "application/xml");
    if (doc.documentElement.localName !== "multistatus" || doc.documentElement.namespaceURI !== DAV)
      throw new Error("Сервер не вернул список WebDAV.");
    const folder = new URL(this.url(path) + (path ? "/" : ""));
    const decode = pathname => pathname.replace(/\/$/, "").split("/").map(decodeURIComponent);
    const parent = decode(folder.pathname);
    const entries = [];
    let foundFolder = false;
    for (const item of Array.from(doc.documentElement.children).filter(el => el.localName === "response" && el.namespaceURI === DAV)) {
      const href = child(item, "href")?.textContent;
      if (!href) throw new Error("В ответе WebDAV отсутствует href.");
      const target = new URL(href, folder);
      const segments = decode(target.pathname);
      if (target.origin !== folder.origin || !parent.every((s, i) => segments[i] === s) || segments.length > parent.length + 1)
        throw new Error("Сервер вернул путь за пределами запрошенной папки.");
      const props = Array.from(item.children).filter(el => el.namespaceURI === DAV && el.localName === "propstat"
        && statusOK(child(el, "status")?.textContent || "")).map(el => child(el, "prop")).filter(Boolean);
      const type = props.map(p => child(p, "resourcetype")).find(Boolean);
      if (!type) throw new Error("Сервер не сообщил тип объекта: " + (target.pathname));
      const directory = Boolean(child(type, "collection"));
      if (segments.length === parent.length) { foundFolder = directory; continue; }
      const name = segments.at(-1);
      if (name.startsWith(".")) continue;
      if (!safePart(name)) throw new Error("Неподдерживаемое имя в WebDAV: " + name);
      if (type.children.length && !directory) throw new Error("Неподдерживаемый тип WebDAV: " + name);
      const tag = props.map(p => child(p, "getetag")?.textContent.trim()).find(Boolean) || "";
      const stamp = props.map(p => child(p, "getlastmodified")?.textContent.trim()).find(Boolean);
      entries.push({ path: prefix(path, name), directory, tag, mtime: Date.parse(stamp || "") });
    }
    if (!foundFolder) throw new Error("Укажите адрес существующей папки WebDAV.");
    return entries;
  }

  async read(path, tag) {
    const response = await this.request("GET", path, strong(tag) ? { "If-Match": tag } : {});
    this.check(response, [200], "GET", path);
    return response.arrayBuffer;
  }

  async write(path, bytes, entry) {
    if (entry && !strong(entry.tag)) throw new Error("Для перезаписи сервер должен вернуть строгий ETag: " + path);
    const condition = entry ? { "If-Match": entry.tag } : { "If-None-Match": "*" };
    const response = await this.request("PUT", path, { ...condition, "Content-Type": "application/octet-stream" }, bytes);
    this.check(response, [200, 201, 204], "PUT", path);
    return Object.entries(response.headers).find(([name]) => name.toLowerCase() === "etag")?.[1] || "";
  }

  async remove(path, tag) {
    if (!strong(tag)) throw new Error("Невозможно проверить версию перед удалением: " + path);
    const response = await this.request("DELETE", path, { "If-Match": tag });
    this.check(response, [200, 204], "DELETE", path);
  }

  async confirmAbsent(path) {
    const response = await this.request("PROPFIND", path, { Depth: "0", "Content-Type": "application/xml" }, xmlBody);
    this.check(response, [404, 410], "Проверка удаления", path);
  }

  async mkdir(path) {
    const response = await this.request("MKCOL", path, { "If-None-Match": "*" }, undefined, true);
    if ([405, 412].includes(response.status)) { await this.list(path); return; }
    this.check(response, [201], "MKCOL", path);
  }
}

class Report extends Modal {
  constructor(app, title, rows) { super(app); this.title = title; this.rows = rows; }
  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    if (!this.rows.length) this.contentEl.createEl("p", { text: "Действий не требуется." });
    const list = this.contentEl.createEl("ul");
    for (const row of this.rows) list.createEl("li", { text: row });
  }
  onClose() { this.contentEl.empty(); }
}

class VaultFolderSync extends Plugin {
  async onload() {
    const saved = await this.loadData() || {};
    const pairs = Array.isArray(saved.pairs) && saved.pairs.length ? saved.pairs
      : [{ id: "main", settings: saved.settings, state: saved.state }];
    this.pairs = pairs.map(pair => ({ id: pair.id, settings: { ...DEFAULTS, ...pair.settings }, state: pair.state || EMPTY_STATE() }));
    this.selected = this.pairs.find(pair => pair.id === saved.selected)?.id || this.pairs[0].id;
    this.advanced = saved.advanced === true;
    this.passwords = new Map();
    this.reports = new Map();
    this.pending = new Set();
    this.intervals = new Map();
    this.timeouts = new Map();
    this.active = true;
    this.lifetime = new AbortController();
    this.saves = Promise.resolve();
    this.settingsTab = new SettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.addRibbonIcon("refresh-cw", "Синхронизировать выбранную пару", () => this.run(false, true));
    this.addCommand({ id: "preview", name: "Предпросмотр выбранной пары", callback: () => this.run(true, true) });
    this.addCommand({ id: "sync", name: "Синхронизировать выбранную пару", callback: () => this.run(false, true) });
    this.addCommand({ id: "report", name: "Последний отчёт выбранной пары", callback: () => this.showReport(this.selected) });
    await this.persist();
    this.app.workspace.onLayoutReady(() => {
      if (!this.active) return;
      this.ready = true;
      for (const event of ["create", "modify", "delete", "rename"]) {
        this.registerEvent(this.app.vault.on(event, (file, oldPath) => this.localEvent(file.path, oldPath)));
      }
      this.registerDomEvent(window, "online", () => {
        for (const pair of this.pairs) if (pair.settings.onReconnect) this.enqueue(pair.id);
        this.drain();
      });
      for (const pair of this.pairs) {
        this.schedule(pair);
        if (pair.settings.startup) this.enqueue(pair.id);
      }
    });
  }

  pair(id = this.selected) { return this.pairs.find(pair => pair.id === id); }

  onunload() {
    this.active = false;
    this.lifetime.abort();
    for (const timer of this.intervals.values()) clearInterval(timer);
    for (const timer of this.timeouts.values()) clearTimeout(timer);
    this.pending.clear();
    this.passwords.clear();
  }

  persist() {
    const snapshot = { version: 2, selected: this.selected, advanced: this.advanced,
      pairs: this.pairs.map(({ id, settings, state }) => ({ id, settings: { ...settings }, state })) };
    this.saves = this.saves.catch(() => {}).then(() => this.saveData(snapshot));
    return this.saves;
  }

  schedule(pair) {
    clearInterval(this.intervals.get(pair.id));
    clearTimeout(this.timeouts.get(pair.id));
    this.intervals.delete(pair.id);
    this.timeouts.delete(pair.id);
    if (this.ready && pair.settings.interval > 0) {
      this.intervals.set(pair.id, setInterval(() => this.enqueue(pair.id), pair.settings.interval * 60000));
    }
  }

  localEvent(path, oldPath) {
    const configDir = this.app.vault.configDir;
    for (const { id, settings } of this.pairs) {
      const root = settings.folder.trim().replace(/^\/+|\/+$/g, "");
      const relevant = p => typeof p === "string" && p !== configDir && !p.startsWith(configDir + "/")
        && !parts(p).some(x => x.startsWith(".")) && (!root || p === root || p.startsWith(root + "/") || root.startsWith(p + "/"));
      if (!settings.onEdit || !(relevant(path) || relevant(oldPath))) continue;
      clearTimeout(this.timeouts.get(id));
      this.timeouts.set(id, setTimeout(() => { this.timeouts.delete(id); this.enqueue(id); }, settings.delay * 1000));
    }
  }

  password(pair) {
    const s = pair.settings;
    return this.passwords.get(pair.id) || (s.secret && this.app.secretStorage?.getSecret(s.secret)) || "";
  }

  enqueue(id) { this.pending.add(id); this.drain(); }

  drain() {
    if (!this.active || this.busy || this.editingSettings || navigator.onLine === false) return;
    for (const id of this.pending) {
      const pair = this.pair(id);
      if (!pair || !pair.settings.url) { this.pending.delete(id); continue; }
      if ((pair.settings.engine !== "webdav" || pair.settings.user) && !this.password(pair)) continue;
      this.pending.delete(id);
      void this.run(false, false, id);
      break;
    }
  }

  showReport(id) {
    const report = this.reports.get(id);
    if (!report) { new Notice("Проверка ещё не запускалась."); return; }
    new Report(this.app, report.title, report.rows).open();
  }

  async run(preview, manual, id = this.selected) {
    if (this.busy) { if (manual) new Notice("Другая синхронизация уже выполняется."); return; }
    const pair = this.pair(id);
    if (!pair || !this.active) return;
    this.busy = true;
    const rows = [];
    let title = preview ? "Предпросмотр" : "Результат синхронизации";
    try {
      const summary = await this.sync(pair, preview, rows);
      if (this.active && !manual && summary) new Notice(pair.settings.name + " · " + summary);
    } catch (error) {
      rows.push("Остановлено: " + message(error));
      title = "Синхронизация прервана";
      if (this.active && !manual) new Notice(pair.settings.name + " · " + rows.at(-1), 8000);
    } finally {
      this.busy = false;
      this.reports.set(id, { title: title + " · " + pair.settings.name, rows });
      if (manual && this.active) this.showReport(id);
      queueMicrotask(() => this.drain());
    }
  }
  async sync(pair, preview, rows) {
    const config = { ...pair.settings };
    const webdav = config.engine === "webdav";
    const vault = this.app.vault;
    const root = localRoot(vault, config.folder);
    const excluded = p => isExcluded(vault, p);
    const full = p => prefix(root, p);
    const credential = this.password(pair);
    const rotate = value => {
      if (this.passwords.get(pair.id)) {
        this.passwords.set(pair.id, value);
        if (this.settingsTab.draftId === pair.id && this.settingsTab.pass === credential) this.settingsTab.pass = value;
      }
      else if (config.secret) this.app.secretStorage.setSecret(config.secret, value);
    };
    const backend = webdav ? new WebDav(endpoint(config.url), config.user.trim(), credential)
      : await openCloud(config, credential, path => !excluded(full(path)), this.lifetime.signal, rotate);
    const scope = JSON.stringify(webdav ? [backend.base.href, config.user.trim(), root] : [...backend.identity, root]);
    const label = action => LABELS[action].replace("WebDAV", ENGINES[config.engine]);
    const baseline = new Map(pair.state.scope === scope ? Object.entries(pair.state.files) : []);
    const next = new Map(baseline);
    const files = new Map(), remote = new Map(), dirs = new Set([""]);
    const names = new Map();
    const track = (p, directory) => {
      const key = p.normalize("NFC").toLowerCase();
      const other = names.get(key);
      if (other && (other.path !== p || other.directory !== directory))
        throw new Error("Несовместимые пути: " + other.path + " и " + p);
      names.set(key, { path: p, directory });
    };
    for (const file of vault.getAllLoadedFiles()) {
      if (file.path === "/" || !file.path || (root && !file.path.startsWith(root + "/")) || excluded(file.path)) continue;
      const path = root ? file.path.slice(root.length + 1) : file.path;
      if (parts(path).some(x => !safePart(x))) throw new Error("Неподдерживаемый локальный путь: " + path);
      track(path, file instanceof TFolder);
      if (file instanceof TFile) files.set(path, file);
    }
    const ensureActive = () => {
      if (!this.active) throw new Error("Плагин выключен.");
    };
    const addEntry = entry => {
      if (excluded(full(entry.path))) return;
      if (parts(entry.path).some(part => !safePart(part))) throw Error("Неподдерживаемый путь: " + entry.path);
      track(entry.path, Boolean(entry.directory));
      if (entry.directory) dirs.add(entry.path);
      else remote.set(entry.path, entry);
    };
    if (webdav) {
      const pending = [""];
      while (pending.length) {
        ensureActive();
        for (const entry of await backend.list(pending.pop())) {
          if (excluded(full(entry.path))) continue;
          if (entry.directory && !dirs.has(entry.path)) pending.push(entry.path);
          addEntry(entry);
        }
      }
    } else {
      for (const path of backend.snapshot.directories) addEntry({ path, directory: true });
      for (const entry of Object.values(backend.snapshot.files)) addEntry(entry);
    }
    const getLocal = async (p, file) => {
      if (vault.getAbstractFileByPath(full(p)) !== file) throw new Error("Локальный путь изменился: " + p);
      return await vault.readBinary(file);
    };
    const parents = async (path, onServer) => {
      let dir = "";
      for (const part of parts(path).slice(0, -1)) {
        dir = prefix(dir, part);
        if (onServer) {
          if (!dirs.has(dir)) { await backend.mkdir(dir); dirs.add(dir); }
        } else if (!vault.getAbstractFileByPath(full(dir))) await vault.createFolder(full(dir));
      }
    };
    let changed = 0, conflicts = 0;
    try {
      for (const path of new Set([...files.keys(), ...remote.keys()])) {
        ensureActive();
        const file = files.get(path), entry = remote.get(path), base = baseline.get(path);
        if (entry?.hash?.startsWith("unsupported:")) {
          rows.push("Пропущен документ Google или ярлык · " + path);
          next.delete(path);
          continue;
        }
        const localBytes = file && await getLocal(path, file);
        const localHash = file && await hash(localBytes);
        let remoteBytes, remoteHash;
        if (entry) {
          if (!webdav) remoteHash = entry.hash;
          else if (strong(entry.tag) && base?.tag === entry.tag) remoteHash = base.hash;
          else { remoteBytes = await backend.read(path, entry.tag); remoteHash = await hash(remoteBytes); }
        }
        if (file && entry && localHash === remoteHash) {
          next.set(path, { hash: localHash, tag: entry.tag });
          continue;
        }
        let action = decide(config, localHash, remoteHash, base, file?.stat?.mtime, entry?.mtime);
        if ((action === "upload" || action === "deleteRemote") && webdav && entry && !strong(entry.tag)) action = "unguarded";
        if (["ignore", "conflict", "editDelete", "unguarded"].includes(action)) {
          if (action !== "ignore") conflicts++;
          rows.push(label(action) + " · " + path);
          continue;
        }
        if (!preview) {
          ensureActive();
          if (action === "deleteRemote") {
            if ((root && !(vault.getAbstractFileByPath(root) instanceof TFolder)) || await vault.adapter.exists(full(path)))
              throw new Error("Локальный путь изменился: " + path);
            await backend.remove(path, entry.tag);
            next.delete(path);
          } else if (action === "deleteLocal") {
            await backend.confirmAbsent(path);
            if (await hash(await getLocal(path, file)) !== localHash) throw new Error("Локальный файл изменился: " + path);
            await vault.trash(file, false);
            next.delete(path);
          } else if (action === "upload") {
            if (webdav) await parents(path, true);
            const tag = await backend.write(path, localBytes, entry, file.stat?.mtime);
            next.set(path, { hash: localHash, tag });
          } else {
            if (!remoteBytes) remoteBytes = await backend.read(path, entry.tag);
            if (!webdav && await hash(remoteBytes) !== remoteHash) throw Error("Содержимое облачного файла изменилось: " + path);
            ensureActive();
            await parents(path, false);
            if (file) {
              const changedDuringRead = () => new Error("Файл изменился во время загрузки: " + path);
              if (/\.md$/i.test(path)) {
                // Vault.process holds Obsidian's text edit lock through the comparison and write.
                const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
                const expected = decoder.decode(localBytes);
                const incoming = decoder.decode(remoteBytes);
                await vault.process(file, current => {
                  if (current !== expected) throw changedDuringRead();
                  return incoming;
                });
              } else {
                if (await hash(await getLocal(path, file)) !== localHash) throw changedDuringRead();
                await vault.modifyBinary(file, remoteBytes);
              }
            } else {
              if (vault.getAbstractFileByPath(full(path))) throw new Error("Локальный файл уже появился: " + path);
              await vault.createBinary(full(path), remoteBytes);
            }
            next.set(path, { hash: remoteHash, tag: entry.tag });
          }
        }
        changed++;
        rows.push(label(action) + " · " + path);
      }
      for (const path of baseline.keys()) if (!files.has(path) && !remote.has(path)) next.delete(path);
    } finally {
      if (!preview) {
        pair.state = { scope, files: Object.fromEntries(next) };
        await this.persist();
      }
    }
    return changed || conflicts ? "Выполнено: " + changed + ", требуют внимания: " + conflicts : "";
  }
}

class RemovePair extends Modal {
  constructor(app, name, remove) { super(app); this.name = name; this.remove = remove; }
  onOpen() {
    this.contentEl.createEl("h3", { text: "Убрать пару «" + this.name + "»?" });
    this.contentEl.createEl("p", { text: "Будут удалены настройки пары и история сравнения. Файлы останутся в обеих папках." });
    new Setting(this.contentEl)
      .addButton(b => b.setButtonText("Отмена").onClick(() => this.close()))
      .addButton(b => b.setButtonText("Убрать пару").setWarning().onClick(async () => { this.close(); await this.remove(); }));
  }
}

class SettingsTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  hide() { this.plugin.editingSettings = false; this.draft = null; this.pass = ""; this.keepSecret = false; this.plugin.drain(); }
  display() {
    const plugin = this.plugin, pair = plugin.pair(), el = this.containerEl;
    plugin.editingSettings = true;
    if (!this.draft || this.draftId !== pair.id) {
      this.draft = { ...pair.settings };
      this.draftId = pair.id;
      this.keepSecret = false;
      this.pass = plugin.passwords.get(pair.id) || "";
    }
    const s = this.draft;
    el.empty();
    el.createEl("h2", { text: "Vault Folder Sync" });
    const unlocked = () => {
      if (plugin.busy) { new Notice("Дождитесь завершения синхронизации."); return false; }
      return true;
    };
    const select = async id => {
      plugin.selected = id; this.draft = null;
      await plugin.persist(); this.display();
    };
    new Setting(el).setName("Пара папок").setDesc("Команды и кнопка на ленте работают с выбранной парой.")
      .addDropdown(d => {
        for (const p of plugin.pairs) d.addOption(p.id, p.settings.name);
        d.setValue(pair.id).onChange(select);
      })
      .addButton(b => b.setButtonText("Добавить").onClick(async () => {
        if (!unlocked()) return;
        const id = crypto.randomUUID();
        plugin.pairs.push({ id, settings: { ...DEFAULTS, name: "Пара " + (plugin.pairs.length + 1) }, state: EMPTY_STATE() });
        await select(id);
      }))
      .addButton(b => b.setButtonText("Убрать").setDisabled(plugin.pairs.length < 2).onClick(() => {
        if (!unlocked()) return;
        new RemovePair(this.app, pair.settings.name, async () => {
          if (!unlocked() || plugin.pairs.length < 2) return;
          clearInterval(plugin.intervals.get(pair.id)); clearTimeout(plugin.timeouts.get(pair.id));
          plugin.intervals.delete(pair.id); plugin.timeouts.delete(pair.id); plugin.pending.delete(pair.id);
          plugin.passwords.delete(pair.id); plugin.reports.delete(pair.id);
          plugin.pairs = plugin.pairs.filter(p => p.id !== pair.id);
          await select(plugin.pairs[0].id);
        }).open();
      }));
    new Setting(el).setName("Режим настроек").addDropdown(d => d.addOption("basic", "Основные").addOption("advanced", "Расширенные")
      .setValue(plugin.advanced ? "advanced" : "basic").onChange(async v => {
        plugin.advanced = v === "advanced"; await plugin.persist(); this.display();
      }));
    let passwordText, secretText;
    const field = (key, label, desc, placeholder = "") => new Setting(el).setName(label).setDesc(desc)
      .addText(t => {
        if (key === "secret") secretText = t;
        t.setValue(s[key]).setPlaceholder(placeholder).onChange(v => {
          if (s.engine === "webdav" && (key === "url" || key === "user") && s[key] !== v) {
            this.pass = ""; s.secret = ""; passwordText?.setValue(""); secretText?.setValue("");
          }
          s[key] = v;
        });
      });
    const choice = (key, label, desc, options) => new Setting(el).setName(label).setDesc(desc)
      .addDropdown(d => { for (const [k,v] of Object.entries(options)) d.addOption(k, v);
        d.setValue(String(s[key])).onChange(v => { s[key] = typeof DEFAULTS[key] === "number" ? Number(v) : v; });
      });
    const toggle = (key, label, desc) => new Setting(el).setName(label).setDesc(desc)
      .addToggle(t => t.setValue(s[key]).onChange(v => { s[key] = v; }));
    field("name", "Название пары", "Отображается в списке пар и в отчёте.");
    field("folder", "Папка в Obsidian", "Путь от корня хранилища. Пустое поле включает всё хранилище.", "Заметки/Работа");
    new Setting(el).setName("Сервис").addDropdown(d => {
      for (const [key, name] of Object.entries(ENGINES)) d.addOption(key, name);
      d.setValue(s.engine).onChange(engine => {
        Object.assign(s, { engine, url: "", user: "", secret: "" });
        this.pass = ""; this.keepSecret = false; this.display();
      });
    });
    if (s.engine === "webdav") {
      field("url", "Адрес папки WebDAV", "Полный HTTPS-адрес существующей папки.", "https://cloud.example/dav/Notes/");
      field("user", "Имя пользователя", "Логин WebDAV.");
    } else if (s.engine === "google") {
      field("url", "Папка Google Drive", "Ссылка или ID существующей папки. Для корня используйте root.", "https://drive.google.com/drive/folders/…");
    } else {
      field("url", "Папка Яндекс Диска", "Путь к существующей папке. Для корня используйте disk:/.", "disk:/Заметки");
    }
    const isCloud = s.engine !== "webdav";
    new Setting(el).setName(isCloud ? "OAuth-токен" : "Пароль приложения")
      .setDesc(isCloud ? "Токен аккаунта с доступом к выбранной папке." : "Хранится в памяти до выключения плагина.")
      .addText(t => { passwordText = t; t.inputEl.type = "password"; t.inputEl.autocomplete = "off";
        t.setValue(this.pass).onChange(v => { this.pass = v; });
      });
    if (s.engine === "google" && Platform?.isDesktopApp) {
      new Setting(el).setName("Войти через Google").setDesc("Выберите JSON OAuth-клиента типа Desktop app. Вход откроется в браузере.")
        .addButton(b => b.setButtonText("Выбрать JSON и войти").onClick(() => {
          const input = document.createElement("input");
          input.type = "file"; input.accept = ".json,application/json";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file || plugin.signingIn) return;
            plugin.signingIn = true;
            try {
              const grant = await signInGoogle(await file.text(), plugin.lifetime.signal,
                url => require("electron").shell.openExternal(url));
              if (this.draft !== s || s.engine !== "google") return;
              this.pass = grant;
              this.display();
              new Notice("Аккаунт подключён. Сохраните настройки пары.");
            } catch (e) { if (plugin.active) new Notice(message(e), 8000); }
            finally { plugin.signingIn = false; }
          };
          input.click();
        }));
    }
    if (isCloud && this.app.secretStorage) {
      new Setting(el).setName("Сохранить введённый токен в связке ключей Obsidian")
        .setDesc("Позволяет выполнять автообмен после перезапуска. Применяется при сохранении пары.")
        .addToggle(t => t.setValue(this.keepSecret).onChange(v => { this.keepSecret = v; }));
    }
    choice("direction", "Направление обмена", "Односторонний режим разрешает изменения только в папке назначения.", Object.fromEntries(Object.entries(DIRECTIONS).map(([k,v]) => [k, v.replace("WebDAV", ENGINES[s.engine])])));
    if (plugin.advanced) {
      if (this.app.secretStorage) field("secret", "Имя секрета Obsidian", "Для запуска после перезапуска укажите имя существующего секрета с паролем. Пароль сеанса имеет приоритет.");
      choice("deletion", "Удаление файлов", "Удаление передаётся только для ранее синхронизированного файла. Изменённая оставшаяся копия попадёт в отчёт.", DELETIONS);
      choice("conflict", "Разрешение конфликтов", "Применяется и при первом сравнении разных версий. Если выбор противоречит направлению обмена, файл будет пропущен.", { ...CONFLICTS, remote: "Предпочитать " + ENGINES[s.engine] });
      el.createEl("h3", { text: "Автосинхронизация" });
      toggle("startup", "При открытии хранилища", "После загрузки хранилища и получения доступа к сервису.");
      toggle("onEdit", "При изменении в Obsidian", "Создание, правка, перемещение или удаление внутри локальной папки.");
      choice("delay", "Пауза после правки", "Отсчитывается от последнего события.", { 5: "5 секунд", 15: "15 секунд", 30: "30 секунд", 60: "1 минута" });
      toggle("onReconnect", "При восстановлении сети", "Запуск при получении события подключения от системы.");
    } else {
      el.createEl("p", { text: "Удаления: " + DELETIONS[s.deletion] + ". Конфликты: " + CONFLICTS[s.conflict].replace("WebDAV", ENGINES[s.engine]) + "." });
    }
    choice("interval", "Повторять по таймеру", "Для автоматического обмена Obsidian должен быть запущен.", {
      0: "Выключено", 5: "Каждые 5 минут", 15: "Каждые 15 минут", 30: "Каждые 30 минут", 60: "Каждый час", 360: "Каждые 6 часов", 1440: "Каждые 24 часа"
    });
    const save = async () => {
      if (!unlocked()) return false;
      try {
        if (s.engine === "webdav") endpoint(s.url);
        else {
          if (!s.url.trim()) throw Error("Укажите удалённую папку.");
          cloudRoot(s.engine, s.url);
        }
        const folder = localRoot(this.app.vault, s.folder);
        if (!s.name.trim()) throw new Error("Введите название пары.");
        const old = pair.settings;
        if (this.keepSecret && this.pass && s.engine !== "webdav") {
          const ref = "vault-folder-sync-" + pair.id + "-" + s.engine;
          this.app.secretStorage.setSecret(ref, this.pass);
          s.secret = ref; this.pass = ""; this.keepSecret = false;
          passwordText?.setValue(""); secretText?.setValue(ref);
        }
        pair.settings = { ...s, name: s.name.trim(), folder, url: s.url.trim(), user: s.user.trim(), secret: s.secret.trim() };
        plugin.passwords.set(pair.id, this.pass);
        if (old.engine !== s.engine || old.url !== pair.settings.url || old.user !== pair.settings.user || old.folder !== folder) {
          pair.state = EMPTY_STATE();
          plugin.pending.delete(pair.id);
        }
        if (!pair.settings.onEdit && !pair.settings.interval && !pair.settings.onReconnect && !pair.settings.startup) plugin.pending.delete(pair.id);
        plugin.schedule(pair);
        await plugin.persist();
        return true;
      } catch (e) { new Notice(message(e), 8000); return false; }
    };
    new Setting(el).setName("Применить настройки пары").setDesc("Сохраните изменения перед переключением пары. Предпросмотр и запуск также сохраняют форму.")
      .addButton(b => b.setButtonText("Сохранить").onClick(async () => { if (await save()) { this.display(); new Notice("Пара сохранена."); } }))
      .addButton(b => b.setButtonText("Предпросмотр").onClick(async () => { if (await save()) await plugin.run(true, true, pair.id); }))
      .addButton(b => b.setButtonText("Синхронизировать").setCta().onClick(async () => { if (await save()) await plugin.run(false, true, pair.id); }));
  }
}

module.exports = VaultFolderSync;
