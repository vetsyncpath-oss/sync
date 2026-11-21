"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => RefSync
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/model.ts
var defaults = {
  id: "local",
  role: "subscriber",
  scope: "content",
  access: "local",
  local: "RefSync-copy",
  reference: "RefSync-reference",
  mirror: "preserve",
  deletions: false,
  conflict: "source",
  backup: true,
  emptyGuard: true,
  mode: "plan",
  firstPlan: false,
  fileEvents: false,
  watch: false,
  strictDrift: false
};
var fresh = () => ({
  entries: /* @__PURE__ */ Object.create(null),
  size: 0,
  lastRun: ""
});
var join = (a, b) => a && b ? a + "/" + b : a || b;
var parent = (p) => p.slice(0, Math.max(0, p.lastIndexOf("/")));
var fold = (v) => v.normalize("NFC").toLowerCase();
var under = (p, base) => !base || p === base || p.startsWith(base + "/");
function safe(p) {
  return p.length < 1024 && p.split("/").every(
    (s) => s.length > 0 && s.length <= 255 && !/[<>:"\\|?*\x00-\x1F\x7F]/.test(s) && !/[. ]$/.test(s) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)
  );
}
function checked(p) {
  if (!safe(p)) throw Error("path");
  return p;
}
async function hash(b) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
    (v) => v.toString(16).padStart(2, "0")
  ).join("");
}

// src/validator.ts
function profileRules(p, desktop, readOnly) {
  const rules = [];
  const force = (field, forced, code) => rules.push({
    field,
    forced,
    code,
    locked: true,
    invalid: p[field] !== forced
  });
  if (p.access === "public" || readOnly)
    force("role", "subscriber", "readonly");
  if (p.mirror === "full") {
    force("deletions", true, "mirror");
    force("conflict", "source", "mirror");
  }
  if (p.scope === "settings") {
    if (p.conflict === "both") force("conflict", "source", "configConflict");
    rules.push({
      field: "fileEvents",
      visible: false,
      code: "configEvents",
      invalid: p.fileEvents
    });
  }
  if (p.role === "publisher")
    for (const field of ["deletions", "conflict"])
      rules.push({ field, visible: false, code: "publisher" });
  if (!desktop)
    rules.push({
      field: "watch",
      visible: false,
      code: "mobile",
      invalid: p.watch
    });
  if (p.mode === "silent")
    rules.push({ field: "firstPlan", code: "silentDefault" });
  if (p.mirror === "full" && (p.local === "/" || !p.local)) {
    for (const field of ["backup", "emptyGuard"])
      rules.push({ field, code: "guard", invalid: !p[field] });
  }
  return rules;
}
function validate(p, desktop, readOnly, configDir) {
  const errors = profileRules(p, desktop, readOnly).filter((r) => r.invalid);
  const err = (field, code) => errors.push({ field, code, invalid: true });
  const enums = {
    role: ["subscriber", "publisher"],
    scope: ["settings", "content"],
    access: ["local", "public", "oauth", "token"],
    mirror: ["full", "preserve"],
    conflict: ["source", "target", "both", "newer"],
    mode: ["plan", "silent"]
  };
  for (const [k, values] of Object.entries(enums))
    if (!values.includes(String(p[k]))) err(k, "invalid");
  for (const key of ["local", "reference"])
    if (typeof p[key] !== "string" || p[key] !== "/" && p[key] !== "" && !safe(p[key]))
      err(key, "path");
  if (!/^[\w-]+$/.test(p.id)) err("id", "invalid");
  for (const k of [
    "deletions",
    "backup",
    "emptyGuard",
    "firstPlan",
    "fileEvents",
    "watch",
    "strictDrift"
  ])
    if (typeof p[k] !== "boolean") err(k, "invalid");
  if (errors.length) return errors;
  const local = fold(
    p.scope === "settings" ? configDir : p.local === "/" ? "" : p.local
  ), ref = fold(p.reference === "/" ? "" : p.reference);
  if (p.access === "local" && (under(local, ref) || under(ref, local)))
    err("reference", "overlap");
  const hidden = (path) => path.split("/").some((s) => s.startsWith(".") || s === "node_modules");
  if (p.access === "local" && hidden(ref)) err("reference", "protected");
  if (p.scope === "content" && hidden(local)) err("local", "protected");
  if (under(ref, fold(configDir)) || p.scope === "content" && under(local, fold(configDir)))
    err("reference", "protected");
  return errors;
}

// src/applier.ts
var decoder = new TextDecoder();
var Applier = class {
  constructor(journal, state) {
    this.journal = journal;
    this.state = state;
  }
  async restore(t, target) {
    for (let i = t.steps.length - 1; i >= 0; i--) {
      const p = t.steps[i].path, armed = t.id + "/armed/" + i;
      if (!await this.journal.disk.has(armed)) continue;
      const saved = await this.journal.json(armed);
      const stat = await target.stat(p);
      if (stat?.type === "folder") throw Error("collision");
      if (saved === null) {
        if (stat) await target.delete(p);
      } else {
        const bytes = await this.journal.disk.read(t.id + "/backup/" + i);
        if (await hash(bytes) !== saved) throw Error("backup");
        if (!stat || await hash(await target.download(p)) !== saved)
          await target.upload(p, bytes);
      }
    }
  }
  async recover(resolve) {
    for (const t of await this.journal.transactions()) {
      if (await this.journal.disk.has(t.id + "/undo-start") && !await this.journal.disk.has(t.id + "/undo-done")) {
        await this.restore(t, resolve(t));
        this.state.put(t.key, t.before);
        await this.journal.mark(t.id + "/undo-done");
        continue;
      }
      if (await this.journal.disk.has(t.id + "/done") || await this.journal.disk.has(t.id + "/rolled-back"))
        continue;
      if (this.state.get(t.key).lastRun === t.id) {
        await this.journal.mark(t.id + "/done");
        continue;
      }
      await this.restore(t, resolve(t));
      await this.journal.mark(t.id + "/rolled-back");
    }
  }
  async undo(key, target) {
    const last = this.state.get(key).lastRun;
    const t = (await this.journal.transactions()).find(
      (v) => v.key === key && v.id === last
    );
    if (!t) throw Error("noBackup");
    await this.journal.mark(t.id + "/undo-start");
    await this.restore(t, target);
    this.state.put(key, t.before);
    await this.journal.mark(t.id + "/undo-done");
  }
  async apply(profile, plan2, source, target, key, targetPath) {
    const previous = this.state.get(key);
    const next = {
      ...fresh(),
      size: plan2.held.length ? previous.size : plan2.count,
      lastRun: previous.lastRun
    };
    Object.assign(next.entries, previous.entries);
    for (const path of plan2.forgotten) delete next.entries[path];
    const id = crypto.randomUUID(), steps = [];
    const stage = async (path, bytes, mtime) => {
      const digest = await hash(bytes);
      await this.journal.disk.putNew(id + "/stage/" + steps.length, bytes);
      steps.push({ path, action: "write", mtime, digest });
    };
    const displaced = /* @__PURE__ */ new Map();
    try {
      for (const op of plan2.ops) {
        const p = op.path, s = op.source, b = Object.hasOwn(previous.entries, p) ? previous.entries[p] : void 0;
        if (op.action === "delete") {
          steps.push({ path: p, action: "delete" });
          delete next.entries[p];
          continue;
        }
        if (!s) throw Error("incomplete");
        if (op.action === "retain") {
          next.entries[p] = {
            size: b?.size ?? 0,
            mtime: b?.mtime ?? 0,
            hash: b?.hash ?? "",
            applied: b?.applied ?? "",
            seen: s.hash,
            delivered: b?.delivered ?? false
          };
          continue;
        }
        if (op.action === "write" || op.action === "both") {
          const bytes = await source.download(p);
          if (bytes.byteLength !== s.size || await hash(bytes) !== s.hash)
            throw Error("referenceChanged");
          if (profile.scope === "settings" && p.endsWith(".json"))
            JSON.parse(decoder.decode(bytes));
          if (op.action === "both") {
            const dot = p.lastIndexOf("."), cut = dot > p.lastIndexOf("/") + 1 ? dot : p.length;
            const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
            const copy = p.slice(0, cut) + ".conflict-" + this.state.device + "-" + stamp + p.slice(cut);
            if (await target.stat(copy)) throw Error("collision");
            displaced.set(copy, p);
            steps.push({ path: copy, action: "write" });
          }
          await stage(p, bytes, s.mtime);
        }
        next.entries[p] = {
          size: s.size,
          mtime: s.mtime,
          hash: s.hash,
          applied: s.hash,
          seen: s.hash,
          delivered: op.action !== "ack" || b?.delivered === true
        };
      }
    } catch (e) {
      await this.journal.disk.removeTree(id);
      throw e;
    }
    if (!steps.length) {
      this.state.put(key, next);
      return 0;
    }
    const t = {
      version: 1,
      id,
      key,
      target: targetPath,
      scope: profile.scope,
      before: previous,
      steps
    };
    await this.journal.begin(t);
    try {
      for (const [i, step] of steps.entries()) {
        const stat = await target.stat(step.path);
        if (stat?.type === "folder") throw Error("collision");
        const old = stat ? await target.download(step.path) : null;
        const copy = displaced.get(step.path);
        if (copy && stat) throw Error("collision");
        await this.journal.backup(id, i, old);
        if (step.action === "delete") {
          if (stat) await target.delete(step.path);
        } else {
          const bytes = copy ? await target.download(copy) : await this.journal.disk.read(id + "/stage/" + i);
          if (step.digest && await hash(bytes) !== step.digest)
            throw Error("incomplete");
          await target.upload(step.path, bytes, step.mtime);
        }
        await this.journal.mark(id + "/applied/" + i);
      }
      next.lastRun = id;
      this.state.put(key, next);
    } catch (e) {
      await this.restore(t, target);
      await this.journal.mark(id + "/rolled-back");
      throw e;
    }
    await this.journal.mark(id + "/done");
    return steps.length;
  }
};

// src/state.ts
var StateStore = class {
  constructor(port) {
    this.port = port;
    const current = port.get("device");
    this.device = typeof current === "string" && /^[a-f0-9-]{36}$/.test(current) ? current : crypto.randomUUID();
    port.set("device", this.device);
  }
  device;
  get(key) {
    const raw = this.port.get("state:" + this.device + ":" + key);
    if (raw == null) return fresh();
    if (typeof raw !== "object" || !("entries" in raw) || typeof raw.entries !== "object" || !raw.entries || !("size" in raw) || typeof raw.size !== "number" || !("lastRun" in raw) || typeof raw.lastRun !== "string")
      throw Error("state");
    return structuredClone(raw);
  }
  put(key, value) {
    this.port.set("state:" + this.device + ":" + key, value);
  }
};
var enc = (x) => new TextEncoder().encode(JSON.stringify(x)).buffer;
var ApplyJournal = class {
  constructor(disk) {
    this.disk = disk;
  }
  async json(p) {
    return JSON.parse(new TextDecoder().decode(await this.disk.read(p)));
  }
  mark(p) {
    return this.disk.putNew(p, enc(true));
  }
  async begin(t) {
    await this.disk.putNew(t.id + "/intent.json", enc(t));
  }
  async backup(id, i, bytes) {
    if (bytes !== null) await this.disk.putNew(id + "/backup/" + i, bytes);
    await this.disk.putNew(
      id + "/armed/" + i,
      enc(bytes === null ? null : await hash(bytes))
    );
  }
  async transactions() {
    const out = [];
    for (const id of await this.disk.dirs()) {
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      if (!await this.disk.has(id + "/intent.json")) {
        await this.disk.removeTree(id);
        continue;
      }
      const t = await this.json(id + "/intent.json");
      if (t.version !== 1 || t.id !== id || !Array.isArray(t.steps) || !["content", "settings"].includes(t.scope))
        throw Error("journal");
      for (const step of t.steps) {
        checked(step.path);
        if (step.action !== "write" && step.action !== "delete")
          throw Error("journal");
      }
      out.push(t);
    }
    return out;
  }
};

// src/classifier.ts
function volatility(p, scope) {
  if (scope === "content") return "S";
  p = fold(p);
  if (/^(workspace(?:-mobile)?\.json|cache(?:\/|$))$/.test(p) || p.startsWith("cache/") || p.endsWith(".lock") || p.split("/").some((x) => x === ".git" || x === "node_modules"))
    return "V";
  return /^(?:[^/]+\.json|plugins\/[^/]+\/data\.json)$/.test(p) ? "H" : "S";
}
function selected(p, scope, configDir, self, directory) {
  const f = fold(p);
  if (f.split("/").some(
    (s) => [".git", ".trash", ".sync-trash", "node_modules"].includes(s)
  ) || scope === "settings" && under(f, fold("plugins/" + self)) || under(f, fold(join(configDir, "plugins/" + self))))
    return false;
  if (scope === "content")
    return !under(f, fold(configDir)) && !p.split("/").some((s) => s.startsWith(".")) && !/(?:\.tmp$|(?:^|\/)(?:thumbs\.db|desktop\.ini)$)/i.test(p);
  if (volatility(p, scope) === "V" || p.split("/").some((s) => s.startsWith(".")))
    return false;
  if (directory)
    return /^(themes|snippets)(\/|$)|^plugins(?:\/[^/]+)?$/.test(p);
  return /^[^/]+\.json$|^themes\/[^/]+\/(manifest\.json|theme\.css)$|^snippets\/.+\.css$|^plugins\/[^/]+\/data\.json$/.test(
    p
  );
}
var priority = (p) => p === "community-plugins.json" ? 3 : p.includes("/") ? p.endsWith("/data.json") ? 1 : 0 : 2;

// src/vault.ts
var import_obsidian = require("obsidian");
async function ensure(adapter, dir) {
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
var VaultArtifacts = class {
  constructor(adapter, root) {
    this.adapter = adapter;
    this.root = root;
  }
  path(p) {
    return join(this.root, checked(p));
  }
  async putNew(p, b) {
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
  read(p) {
    return this.adapter.readBinary(this.path(p));
  }
  has(p) {
    return this.adapter.exists(this.path(p));
  }
  async dirs() {
    if (!await this.adapter.exists(this.root)) return [];
    return (await this.adapter.list(this.root)).folders.map(
      (p) => p.slice(this.root.length + 1)
    );
  }
  async removeTree(p) {
    if (await this.has(p)) await this.adapter.rmdir(this.path(p), true);
  }
};
var LocalProvider = class {
  constructor(vault, root, self, scope, readOnly = false) {
    this.vault = vault;
    this.root = root;
    this.self = self;
    this.scope = scope;
    if (root) checked(root);
    if (under(fold(root), fold(join(vault.configDir, "plugins/" + self))))
      throw Error("protected");
    this.id = "vault:" + root;
    this.capabilities = {
      readOnly,
      supportsChecksum: false,
      supportsChangesFeed: false,
      maxFileSize: Infinity,
      rateLimits: null
    };
  }
  id;
  capabilities;
  path(p) {
    return p ? join(this.root, checked(p)) : this.root;
  }
  indexed(path) {
    return !under(fold(path), fold(this.vault.configDir)) && !path.split("/").some((s) => s.startsWith("."));
  }
  writable(p, directory = false) {
    if (this.capabilities.readOnly || !selected(p, this.scope, this.vault.configDir, this.self, directory))
      throw Error("protected");
    const path = this.path(p);
    if (under(
      fold(path),
      fold(join(this.vault.configDir, "plugins/" + this.self))
    ))
      throw Error("protected");
    return path;
  }
  async list(p) {
    const data = await this.vault.adapter.list(this.path(p) || "/");
    const rel = (f) => {
      if (this.root && !f.startsWith(this.root + "/")) throw Error("path");
      return this.root ? f.slice(this.root.length + 1) : f;
    };
    return { files: data.files.map(rel), folders: data.folders.map(rel) };
  }
  async stat(p) {
    if (!this.root && !p) return { type: "folder", size: 0, mtime: 0 };
    return this.vault.adapter.stat(this.path(p));
  }
  async download(p) {
    const path = this.path(p), file = this.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian.TFile && this.indexed(path) ? this.vault.readBinary(file) : this.vault.adapter.readBinary(path);
  }
  async mkdir(p) {
    const path = this.writable(p, true);
    if (this.indexed(path)) {
      if (!this.vault.getAbstractFileByPath(path))
        await this.vault.createFolder(path);
    } else await ensure(this.vault.adapter, path);
  }
  async upload(p, b, mtime) {
    const path = this.writable(p), options = Number.isFinite(mtime) ? { mtime } : void 0;
    if (this.indexed(path)) {
      const parts = p.split("/");
      let at = "";
      for (const part of parts.slice(0, -1)) {
        at = join(at, part);
        await this.mkdir(at);
      }
      const file = this.vault.getAbstractFileByPath(path);
      if (file instanceof import_obsidian.TFile) {
        await this.vault.modifyBinary(file, b, options);
        return;
      }
      if (file || await this.vault.adapter.exists(path))
        throw Error("indexPending");
      await this.vault.createBinary(path, b, options);
      return;
    }
    await ensure(this.vault.adapter, parent(path));
    if (await this.vault.adapter.exists(path)) {
      await this.vault.adapter.writeBinary(path, b, options);
      return;
    }
    const staging = join(
      this.vault.configDir,
      "plugins/" + this.self + "/runtime/tmp"
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
  async delete(p) {
    const path = this.writable(p);
    if ((await this.stat(p))?.type !== "file") throw Error("collision");
    if (!this.indexed(path)) {
      await this.vault.adapter.trashLocal(path);
      return;
    }
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian.TFile)) throw Error("indexPending");
    await this.vault.trash(file, false);
  }
  async move(from, to) {
    const a = this.writable(from), b = this.writable(to);
    if (await this.vault.adapter.exists(b)) throw Error("collision");
    if (this.indexed(a)) {
      const f = this.vault.getAbstractFileByPath(a);
      if (!(f instanceof import_obsidian.TFile)) throw Error("indexPending");
      await this.vault.rename(f, b);
    } else await this.vault.adapter.rename(a, b);
  }
  async getRevision() {
    return null;
  }
};

// src/scanner.ts
async function scan(provider, scope, configDir, self, skipHotTarget = false) {
  const snap = {
    files: /* @__PURE__ */ new Map(),
    directories: /* @__PURE__ */ new Set(),
    complete: false
  };
  const todo = [""], seen = /* @__PURE__ */ new Set();
  if ((await provider.stat(""))?.type !== "folder") throw Error("missingRoot");
  while (todo.length) {
    const dir = todo.pop();
    const list = await provider.list(dir);
    for (const [paths, isDir] of [
      [list.files, false],
      [list.folders, true]
    ]) {
      for (const p of paths) {
        if (parent(p) !== dir) throw Error("path");
        if (!selected(p, scope, configDir, self, isDir)) continue;
        checked(p);
        if (seen.has(fold(p))) throw Error("collision");
        seen.add(fold(p));
        if (isDir) {
          snap.directories.add(p);
          todo.push(p);
          continue;
        }
        const stat = await provider.stat(p);
        if (stat?.type !== "file") throw Error("incomplete");
        const kind = volatility(p, scope);
        if (kind === "H" && skipHotTarget) {
          snap.files.set(p, {
            hash: "",
            size: stat.size,
            mtime: stat.mtime,
            kind
          });
          continue;
        }
        const bytes = await provider.download(p);
        if (bytes.byteLength !== stat.size) throw Error("incomplete");
        snap.files.set(p, {
          hash: await hash(bytes),
          size: stat.size,
          mtime: stat.mtime,
          kind
        });
      }
    }
  }
  snap.complete = true;
  return snap;
}

// src/conflict-resolver.ts
var resolveConflict = (policy, s, t) => {
  if (policy === "both") return "both";
  if (policy === "target" || policy === "newer" && Number.isFinite(s.mtime) && Number.isFinite(t.mtime) && t.mtime > s.mtime + 2e3)
    return "retain";
  return "write";
};

// src/planner.ts
function plan(p, src, dst, base, resolve = resolveConflict) {
  if (!src.complete || !dst.complete) throw Error("incomplete");
  const names = /* @__PURE__ */ new Map();
  for (const snap of [src, dst])
    for (const [paths, kind] of [
      [snap.files.keys(), "file"],
      [snap.directories.keys(), "folder"]
    ])
      for (const path of paths) {
        const key = fold(path), sig = kind + " " + path;
        if (names.has(key) && names.get(key) !== sig) throw Error("collision");
        names.set(key, sig);
      }
  const ops = [], deletes = [];
  for (const path of /* @__PURE__ */ new Set([...src.files.keys(), ...dst.files.keys()])) {
    const s = src.files.get(path), t = dst.files.get(path), b = Object.hasOwn(base.entries, path) ? base.entries[path] : void 0;
    if (!s) {
      if (t && (p.mirror === "full" || p.deletions && b?.delivered))
        deletes.push({ path, action: "delete", conflict: false });
      continue;
    }
    if (s.kind === "V") continue;
    if (s.hash === t?.hash) {
      ops.push({ path, action: "ack", source: s, conflict: false });
      continue;
    }
    const strict = p.strictDrift || p.scope === "content" && p.mirror === "full";
    if (!strict && b?.seen === s.hash) continue;
    const conflict = !!t && s.kind === "S" && (!b || t.hash !== b.hash && s.hash !== b.applied);
    const action = conflict && t && p.mirror !== "full" ? resolve(p.conflict, s, t) : "write";
    ops.push({ path, action, source: s, conflict });
  }
  const protect = p.emptyGuard && (src.files.size === 0 || base.size > 0 && src.files.size < base.size * 0.5) || deletes.length > 100 || deletes.length > Math.max(5, dst.files.size * 0.5);
  if (!protect) ops.push(...deletes);
  ops.sort(
    (a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path)
  );
  return {
    ops,
    forgotten: Object.keys(base.entries).filter(
      (path) => !src.files.has(path) && !dst.files.has(path)
    ),
    held: protect ? deletes.map((d) => d.path) : [],
    count: src.files.size,
    direction: "SourceToTarget"
  };
}

// src/engine.ts
var StatusStore = class {
  phase = "idle";
  listeners = /* @__PURE__ */ new Set();
  set(s) {
    this.phase = s;
    for (const l of this.listeners) l(s);
  }
  subscribe(l) {
    this.listeners.add(l);
    l(this.phase);
    return () => this.listeners.delete(l);
  }
};
var SyncEngine = class {
  constructor(applier, status, configDir, self, desktop) {
    this.applier = applier;
    this.status = status;
    this.configDir = configDir;
    this.self = self;
    this.desktop = desktop;
  }
  busy = false;
  async exclusive(fn) {
    if (this.busy) throw Error("busy");
    this.busy = true;
    try {
      return await fn();
    } catch (e) {
      this.status.set("error");
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async run(p, reference, local, preview, approved) {
    return this.exclusive(async () => {
      const bad = validate(
        p,
        this.desktop,
        reference.capabilities.readOnly,
        this.configDir
      );
      if (bad.length) throw Error(bad[0].code);
      const [source, target] = p.role === "subscriber" ? [reference, local] : [local, reference];
      const key = JSON.stringify([p.id, p.scope, source.id, target.id]);
      this.status.set("scan");
      const [s, t] = await Promise.all([
        scan(source, p.scope, this.configDir, this.self),
        scan(target, p.scope, this.configDir, this.self, !p.strictDrift)
      ]);
      const result = plan(p, s, t, this.applier.state.get(key));
      let changed = 0;
      const signature = (v) => JSON.stringify([
        v.held,
        v.ops.filter((x) => x.action !== "ack").map((x) => [x.path, x.action, x.source?.hash])
      ]);
      if (approved && signature(approved) !== signature(result))
        throw Error("referenceChanged");
      if (!preview) {
        this.status.set("apply");
        changed = await this.applier.apply(
          p,
          result,
          source,
          target,
          key,
          p.role === "subscriber" ? p.scope === "settings" ? this.configDir : p.local : p.reference
        );
      }
      this.status.set(result.held.length ? "partial" : "done");
      return { plan: result, changed };
    });
  }
};

// src/i18n.ts
var ru = {
  idle: "Готов",
  scan: "Сравнение",
  apply: "Применение",
  recover: "Восстановление",
  done: "Готово",
  partial: "Удаления отложены",
  error: "Ошибка",
  title: "RefSync · локальный профиль",
  preview: "Показать план",
  sync: "Применить эталон",
  undo: "Откатить последнюю доставку",
  cancel: "Отмена",
  confirm: "Откатить",
  reference: "Папка эталона",
  target: "Локальная папка",
  scope: "Охват",
  content: "Контент",
  settings: "Настройки",
  save: "Сохранить",
  role: "Роль",
  subscriber: "Подписчик",
  publisher: "Издатель",
  saved: "Сохранено",
  instructions: "Создайте две отдельные папки. Для настроек локальным корнем служит каталог конфигурации Obsidian. Исходные папки должны существовать.",
  init: "Создать недостающие папки",
  none: "Изменений нет",
  held: "Защита отложила удаления",
  undoText: "Восстановить файлы из резервной копии последней доставки этого профиля?",
  write: "Доставить",
  delete: "В корзину",
  retain: "Оставить версию цели",
  both: "Сохранить обе версии",
  log: "Журнал",
  conflict: "Конфликт",
  invalid: "Недопустимое значение",
  readonly: "Источник доступен только для чтения",
  mirror: "Полное зеркало требует доставки эталона и удалений",
  configConflict: "Для настроек используется эталон с бэкапом",
  configEvents: "События файлов отключены для настроек",
  mobile: "Недоступно на мобильном устройстве",
  guard: "Требуются бэкап и защита от пустого эталона",
  overlap: "Папки пересекаются",
  protected: "Служебный путь исключён",
  path: "Непереносимый или некорректный путь",
  missingRoot: "Папка не найдена",
  incomplete: "Неполное чтение файлов",
  collision: "Коллизия путей",
  indexPending: "Файл ещё не готов в индексе",
  referenceChanged: "Эталон изменился, повторите сравнение",
  busy: "Выполняется другой запуск",
  noBackup: "Нет завершённой доставки для отката",
  backup: "Повреждён бэкап",
  state: "Ошибка локального состояния",
  journal: "Повреждён журнал",
  failed: "Операция не завершена",
  previewFirst: "Сначала проверьте список. Применение повторно сверяет эталон.",
  dry: "Пробный план",
  unknown: "Неизвестное состояние"
};
var en = {
  idle: "Ready",
  scan: "Scanning",
  apply: "Applying",
  recover: "Recovering",
  done: "Done",
  partial: "Deletions held",
  error: "Error",
  title: "RefSync · local profile",
  preview: "Show plan",
  sync: "Apply reference",
  undo: "Roll back last delivery",
  cancel: "Cancel",
  confirm: "Restore",
  reference: "Reference folder",
  target: "Local folder",
  scope: "Scope",
  content: "Content",
  settings: "Settings",
  save: "Save",
  role: "Role",
  subscriber: "Subscriber",
  publisher: "Publisher",
  saved: "Saved",
  instructions: "Create two separate folders. For settings, the local root is the Obsidian configuration folder. Both roots must exist.",
  init: "Create missing folders",
  none: "No changes",
  held: "Deletions held by safeguards",
  undoText: "Restore files from the last delivery of this profile?",
  write: "Deliver",
  delete: "Trash",
  retain: "Keep target",
  both: "Keep both",
  log: "Log",
  conflict: "Conflict",
  invalid: "Invalid value",
  readonly: "Read-only source",
  mirror: "Full mirror requires source preference and deletions",
  configConflict: "Settings use source and backup",
  configEvents: "File events disabled for settings",
  mobile: "Unavailable on mobile",
  guard: "Backup and empty-source guard required",
  overlap: "Folders overlap",
  protected: "Protected path",
  path: "Invalid or non-portable path",
  missingRoot: "Folder missing",
  incomplete: "Incomplete listing or read",
  collision: "Path collision",
  indexPending: "File not ready in vault index",
  referenceChanged: "Reference changed, scan again",
  busy: "Another run is active",
  noBackup: "No completed delivery to restore",
  backup: "Damaged backup",
  state: "Invalid local state",
  journal: "Invalid journal",
  failed: "Operation failed",
  previewFirst: "Review the list first. Apply checks the reference again.",
  dry: "Dry run",
  unknown: "Unknown state"
};
function translator(locale) {
  const dict = locale.startsWith("ru") ? ru : en;
  return (k) => Object.hasOwn(dict, k) ? dict[k] : dict.failed;
}

// src/main.ts
var icons = {
  idle: "refresh-cw",
  scan: "search",
  apply: "download",
  recover: "history",
  done: "check",
  partial: "shield-alert",
  error: "circle-alert"
};
var StatusController = class {
  constructor(plugin, store, tr, open) {
    const ribbon = plugin.addRibbonIcon("refresh-cw", "RefSync", open);
    const bar = import_obsidian2.Platform.isDesktopApp ? plugin.addStatusBarItem() : null;
    if (bar) {
      bar.tabIndex = 0;
      bar.setAttribute("role", "button");
      bar.onclick = open;
      bar.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          bar.click();
        }
      };
    }
    plugin.register(
      store.subscribe((phase) => {
        (0, import_obsidian2.setIcon)(ribbon, icons[phase]);
        ribbon.setAttribute("aria-label", "RefSync · " + tr(phase));
        bar?.setText("RefSync · " + tr(phase));
      })
    );
  }
};
var Review = class extends import_obsidian2.Modal {
  constructor(app, plugin, plan2, apply) {
    super(app);
    this.plugin = plugin;
    this.plan = plan2;
    this.apply = apply;
  }
  onOpen() {
    const t = this.plugin.t;
    this.titleEl.setText("RefSync · " + t(this.apply ? "preview" : "dry"));
    if (this.apply) this.contentEl.createEl("p", { text: t("previewFirst") });
    const list = this.contentEl.createEl("ul");
    const items = this.plan.ops.filter((op) => op.action !== "ack");
    for (const op of items)
      list.createEl("li", {
        text: t(op.action) + " · " + op.path + (op.conflict ? " · " + t("conflict") : "")
      });
    if (!items.length) this.contentEl.createEl("p", { text: t("none") });
    if (this.plan.held.length)
      this.contentEl.createEl("p", {
        text: t("held") + " · " + this.plan.held.join(", ")
      });
    if (this.apply)
      new import_obsidian2.Setting(this.contentEl).addButton(
        (b) => b.setButtonText(t("sync")).setCta().onClick(() => {
          this.close();
          this.apply?.();
        })
      );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var Confirm = class extends import_obsidian2.Modal {
  constructor(app, plugin, run) {
    super(app);
    this.plugin = plugin;
    this.run = run;
  }
  onOpen() {
    const t = this.plugin.t;
    this.contentEl.createEl("p", { text: t("undoText") });
    new import_obsidian2.Setting(this.contentEl).addButton(
      (b) => b.setButtonText(t("cancel")).onClick(() => this.close())
    ).addButton(
      (b) => b.setButtonText(t("confirm")).onClick(() => {
        this.close();
        this.run();
      })
    );
  }
};
var RefSync = class extends import_obsidian2.Plugin {
  profile = { ...defaults };
  t = translator(navigator.language);
  engine;
  logDir = "";
  ready;
  async onload() {
    const data = await this.loadData();
    if (data && typeof data === "object" && "profile" in data && data.profile && typeof data.profile === "object")
      this.profile = { ...defaults, ...data.profile };
    const deviceKey = (k) => this.manifest.id + ":" + k;
    const state = new StateStore({
      get: (k) => this.app.loadLocalStorage(deviceKey(k)),
      set: (k, v) => this.app.saveLocalStorage(deviceKey(k), v)
    });
    const selfDir = join(
      this.app.vault.configDir,
      "plugins/" + this.manifest.id
    );
    this.logDir = join(selfDir, "runtime");
    const disk = new VaultArtifacts(
      this.app.vault.adapter,
      join(this.logDir, "journal/" + state.device)
    );
    const status = new StatusStore();
    this.engine = new SyncEngine(
      new Applier(new ApplyJournal(disk), state),
      status,
      this.app.vault.configDir,
      this.manifest.id,
      import_obsidian2.Platform.isDesktopApp
    );
    this.ready = new Promise(
      (resolve, reject) => this.app.workspace.onLayoutReady(() => {
        status.set("recover");
        this.engine.exclusive(
          () => this.engine.applier.recover((t) => this.recoveryTarget(t))
        ).then(() => {
          status.set("idle");
          resolve();
        }, reject);
      })
    );
    void this.ready.catch((e) => this.report(e));
    new StatusController(this, status, this.t, (e) => {
      const menu = new import_obsidian2.Menu();
      for (const [id, fn] of [
        ["preview", () => this.review(false)],
        ["sync", () => this.review(true)],
        ["undo", () => this.confirmUndo()]
      ])
        menu.addItem((item) => item.setTitle(this.t(id)).onClick(fn));
      menu.showAtMouseEvent(e);
    });
    this.addSettingTab(new Editor(this.app, this));
    this.addCommand({
      id: "dry-run",
      name: this.t("dry"),
      callback: () => this.review(false)
    });
    this.addCommand({
      id: "deliver",
      name: this.t("sync"),
      callback: () => this.review(true)
    });
    this.addCommand({
      id: "undo",
      name: this.t("undo"),
      callback: () => this.confirmUndo()
    });
  }
  recoveryTarget(t) {
    const root = t.target;
    return new LocalProvider(
      this.app.vault,
      root === "/" ? "" : root,
      this.manifest.id,
      t.scope
    );
  }
  stores(p) {
    if (p.access !== "local") throw Error("invalid");
    const local = p.scope === "settings" ? this.app.vault.configDir : p.local === "/" ? "" : p.local;
    return {
      reference: new LocalProvider(
        this.app.vault,
        p.reference === "/" ? "" : p.reference,
        this.manifest.id,
        p.scope,
        p.role === "subscriber"
      ),
      local: new LocalProvider(
        this.app.vault,
        local,
        this.manifest.id,
        p.scope,
        p.role === "publisher"
      )
    };
  }
  async log(event, count) {
    const a = this.app.vault.adapter;
    if (!await a.exists(this.logDir)) await a.mkdir(this.logDir);
    const f = join(this.logDir, "events.jsonl"), prev = f + ".1";
    if (((await a.stat(f))?.size ?? 0) > 262144) {
      if (await a.exists(prev)) await a.remove(prev);
      await a.rename(f, prev);
    }
    await a.append(
      f,
      JSON.stringify({
        at: Date.now(),
        profile: this.profile.id,
        event,
        count
      }) + "\n"
    );
  }
  report(e) {
    new import_obsidian2.Notice(
      "RefSync · " + this.t(e instanceof Error ? e.message : "failed")
    );
    void this.log("error", 0).catch(() => {
    });
  }
  async review(apply) {
    try {
      await this.ready;
      const p = { ...this.profile }, v = this.stores(p), result = await this.engine.run(p, v.reference, v.local, true);
      new Review(
        this.app,
        this,
        result.plan,
        apply ? () => void this.deliver(p, result.plan) : void 0
      ).open();
    } catch (e) {
      this.report(e);
    }
  }
  async deliver(p, approved) {
    try {
      await this.ready;
      const v = this.stores(p);
      const r = await this.engine.run(p, v.reference, v.local, false, approved);
      await this.log(r.plan.held.length ? "partial" : "done", r.changed);
      if (r.plan.held.length) new import_obsidian2.Notice(this.t("held"));
    } catch (e) {
      this.report(e);
    }
  }
  confirmUndo() {
    new Confirm(this.app, this, () => void this.undo()).open();
  }
  async undo() {
    try {
      await this.ready;
      const p = this.profile, v = this.stores(p);
      const [source, target] = p.role === "subscriber" ? [v.reference, v.local] : [v.local, v.reference];
      const key = JSON.stringify([p.id, p.scope, source.id, target.id]);
      await this.engine.exclusive(() => this.engine.applier.undo(key, target));
      await this.log("undo", 1);
    } catch (e) {
      this.report(e);
    }
  }
};
var Editor = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const el = this.containerEl, p = { ...this.plugin.profile }, t = this.plugin.t;
    el.empty();
    el.createEl("h2", { text: t("title") });
    el.createEl("p", { text: t("instructions") });
    const scope = new import_obsidian2.Setting(el).setName(t("scope"));
    let localInput;
    scope.addDropdown((d) => {
      for (const k of ["content", "settings"]) d.addOption(k, t(k));
      d.setValue(p.scope).onChange((v) => {
        p.scope = v === "content" ? "content" : "settings";
        localInput.disabled = p.scope === "settings";
        localInput.value = p.scope === "settings" ? this.app.vault.configDir : p.local;
        refresh();
      });
    });
    const role = new import_obsidian2.Setting(el).setName(t("role"));
    role.addDropdown((d) => {
      for (const k of ["subscriber", "publisher"])
        d.addOption(k, t(k));
      d.setValue(p.role).onChange((v) => {
        p.role = v === "subscriber" ? "subscriber" : "publisher";
        refresh();
      });
    });
    new import_obsidian2.Setting(el).setName(t("reference")).addText(
      (x) => x.setValue(p.reference).onChange((v) => {
        p.reference = v.trim();
        refresh();
      })
    );
    new import_obsidian2.Setting(el).setName(t("target")).addText((x) => {
      localInput = x.inputEl;
      localInput.disabled = p.scope === "settings";
      x.setValue(
        p.scope === "settings" ? this.app.vault.configDir : p.local
      ).onChange((v) => {
        p.local = v.trim();
        refresh();
      });
    });
    const error = el.createEl("p", { attr: { role: "status" } });
    const actions = new import_obsidian2.Setting(el);
    const refresh = () => {
      const bad = validate(
        p,
        import_obsidian2.Platform.isDesktopApp,
        false,
        this.app.vault.configDir
      );
      error.setText(bad.map((r) => r.field + " · " + t(r.code)).join("\n"));
      actions.components.forEach((c) => c.setDisabled(bad.length > 0));
    };
    actions.addButton(
      (b) => b.setButtonText(t("save")).onClick(async () => {
        refresh();
        if (error.textContent) return;
        this.plugin.profile = { ...p };
        await this.plugin.saveData({ profile: p });
        this.display();
      })
    );
    actions.addButton(
      (b) => b.setButtonText(t("init")).onClick(async () => {
        try {
          refresh();
          if (error.textContent) return;
          for (const dir of [
            p.reference,
            p.scope === "settings" ? this.app.vault.configDir : p.local
          ]) {
            if (!dir || dir === "/" || await this.app.vault.adapter.exists(dir))
              continue;
            checked(dir);
            await this.app.vault.createFolder(dir);
          }
        } catch (e) {
          this.plugin.report(e);
        }
      })
    );
    refresh();
  }
};
