/* Sync Studio 0.2.0 — independent synchronization core. See THIRD_PARTY.md. */
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

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SyncStudio
});
module.exports = __toCommonJS(main_exports);

// src/controller.ts
var import_obsidian2 = require("obsidian");

// src/core/model.ts
function newProfile(connectionId = "") {
  return {
    id: crypto.randomUUID(),
    name: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
    connectionId,
    remoteRoot: "",
    localRoot: "",
    branch: "",
    subpath: "",
    direction: "pull",
    scope: "all",
    folders: [],
    categories: ["notes", "attachments"],
    excludePaths: [],
    excludeData: true,
    excludeWorkspace: true,
    maxMB: 50,
    conflict: "both",
    conflictWhen: "both-changed",
    deletion: "ignore",
    deleteConflict: "ask",
    intervalMinutes: 15,
    startup: false,
    onChange: false,
    enabled: false,
    confirmDeletes: true
  };
}

// src/core/paths.ts
var import_node_crypto = require("node:crypto");
var sha = (b) => (0, import_node_crypto.createHash)("sha256").update(b).digest("hex");
function path(value, allowEmpty = false) {
  const v = value.replace(/\/$/, "");
  if (!v && allowEmpty) return "";
  if (!v || v.startsWith("/") || v.includes("\\") || /[\x00-\x1f<>:"|?*]/.test(v) || v.split("/").some(
    (s) => !s || s === "." || s === ".." || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s)
  ))
    throw Error("\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043F\u0443\u0442\u044C: " + value);
  return v;
}
var join = (a, b) => a ? a + "/" + b : b;
var under = (p, root) => !root || p === root || p.startsWith(root + "/");
var PathCollision = class extends Error {
  constructor(message, paths) {
    super(message);
    this.paths = paths;
    this.name = "PathCollision";
  }
};
function uniquePaths(paths) {
  const seen = /* @__PURE__ */ new Map();
  for (const p of paths) {
    path(p);
    const key = p.normalize("NFC").toLowerCase();
    if (seen.has(key)) {
      const first = seen.get(key);
      throw new PathCollision(
        first === p ? `\u041A\u043E\u043B\u043B\u0438\u0437\u0438\u044F: \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u044A\u0435\u043A\u0442\u043E\u0432 \u0438\u043C\u0435\u044E\u0442 \u043E\u0434\u0438\u043D \u043F\u0443\u0442\u044C \xAB${p}\xBB. \u0412 Google Drive \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u044B\u0435 \u0438\u043C\u0435\u043D\u0430, \u0432 vault \u2014 \u043D\u0435\u0442. \u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u0443\u0439\u0442\u0435 \u0434\u0443\u0431\u043B\u044C \u0432 Drive \u0438\u043B\u0438 \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u044D\u0442\u043E\u0442 \u043F\u0443\u0442\u044C \u0438\u0437 \u043F\u0440\u043E\u0444\u0438\u043B\u044F.` : `\u041A\u043E\u043B\u043B\u0438\u0437\u0438\u044F \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430/Unicode: \xAB${first}\xBB \u0438 \xAB${p}\xBB. \u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u0443\u0439\u0442\u0435 \u043E\u0434\u0438\u043D \u0438\u0437 \u043E\u0431\u044A\u0435\u043A\u0442\u043E\u0432 \u0438\u043B\u0438 \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043F\u0443\u0442\u044C \u0438\u0437 \u043F\u0440\u043E\u0444\u0438\u043B\u044F.`,
        [.../* @__PURE__ */ new Set([first, p])]
      );
    }
    seen.set(key, p);
  }
}
function scanRules(profile, config) {
  return {
    file: (p) => selected(p, profile, config),
    folder: (p) => !protectedPath(p, config) && !protectedPath(join(profile.localRoot, p), config) && !profile.excludePaths.some((x) => under(p, x)) && (profile.scope !== "folders" || profile.folders.some((x) => under(p, x) || under(x, p)))
  };
}
function category(p, config) {
  if (under(p, config)) {
    const rel = p.slice(config.length + 1);
    if (/^plugins\/[^/]+\/data\.json$/.test(rel)) return "plugin-settings";
    if (/^plugins\//.test(rel)) return "plugin-code";
    if (/^(themes|snippets)\//.test(rel)) return "themes";
    return "settings";
  }
  return /\.md$/i.test(p) ? "notes" : "attachments";
}
function protectedPath(p, config) {
  return p.split("/").some(
    (s) => [".git", ".trash", ".sync-studio", ".sync-conflicts"].includes(s)
  ) || under(p, config + "/plugins/sync-studio");
}
function selected(p, profile, config, size) {
  const local = join(profile.localRoot, p);
  if (protectedPath(local, config) || protectedPath(p, config)) return false;
  if (profile.scope === "folders" && !profile.folders.some((f) => under(p, f)))
    return false;
  if (profile.excludePaths.some((f) => under(p, f))) return false;
  if (profile.excludeData && /\/plugins\/[^/]+\/data\.json$/.test("/" + local))
    return false;
  if (profile.excludeWorkspace && /(^|\/)workspace(-mobile)?\.json$/.test(local))
    return false;
  if (size !== void 0 && size > profile.maxMB * 1024 * 1024) return false;
  return profile.categories.includes(category(local, config));
}
function validate(p) {
  path(p.localRoot, true);
  for (const v of [...p.folders, ...p.excludePaths]) path(v);
  path(p.subpath, true);
  if (!p.name.trim() || !p.connectionId || !p.remoteRoot.trim())
    throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435, \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043A\u043E\u0440\u0435\u043D\u044C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430.");
  if (!p.categories.length || p.scope === "folders" && !p.folders.length)
    throw Error("\u041E\u0431\u043B\u0430\u0441\u0442\u044C \u0444\u0430\u0439\u043B\u043E\u0432 \u043F\u0443\u0441\u0442\u0430.");
  if (!Number.isFinite(p.maxMB) || p.maxMB <= 0 || !Number.isFinite(p.intervalMinutes) || p.intervalMinutes < 1)
    throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440 \u0438\u043B\u0438 \u0438\u043D\u0442\u0435\u0440\u0432\u0430\u043B.");
}

// src/core/planner.ts
var policyKey = (p) => JSON.stringify([
  p.direction,
  p.conflict,
  p.conflictWhen,
  p.deletion,
  p.deleteConflict
]);
function plan(profile, local, remote, baseline, config = ".obsidian") {
  validate(profile);
  if (!local.complete || !remote.complete)
    throw Error(
      "\u041D\u0435\u043F\u043E\u043B\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u0444\u0430\u0439\u043B\u043E\u0432: \u043F\u043B\u0430\u043D \u043D\u0435 \u043F\u043E\u0441\u0442\u0440\u043E\u0435\u043D, \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u044B."
    );
  const identity = JSON.stringify([local.identity, remote.identity]);
  if (baseline.identity !== identity) baseline = { identity, files: {} };
  const operations = [];
  const add = (p, a, reason, l, r) => operations.push({
    id: crypto.randomUUID(),
    path: p,
    action: a,
    reason,
    local: l,
    remote: r
  });
  for (const p of [
    .../* @__PURE__ */ new Set([
      ...Object.keys(local.files),
      ...Object.keys(remote.files),
      ...Object.keys(baseline.files)
    ])
  ].sort()) {
    const l = Object.hasOwn(local.files, p) ? local.files[p] : void 0, r = Object.hasOwn(remote.files, p) ? remote.files[p] : void 0, b = Object.hasOwn(baseline.files, p) ? baseline.files[p] : void 0;
    if (!selected(p, profile, config, l?.size) || !selected(p, profile, config, r?.size))
      continue;
    const emit = (a, why) => add(p, a, why, l, r);
    if (!l && !r) {
      emit("adopt", "\u041E\u0431\u0435 \u0432\u0435\u0440\u0441\u0438\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442");
      continue;
    }
    if (l && r && l.hash === r.hash) {
      emit("adopt", "\u0421\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442");
      continue;
    }
    const samePair = !!b && l?.hash === b.local && r?.hash === b.remote;
    if (samePair && b.policyKey === policyKey(profile)) {
      emit("adopt", "\u042D\u0442\u0430 \u043F\u0430\u0440\u0430 \u0432\u0435\u0440\u0441\u0438\u0439 \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u0430 \u043F\u0440\u0438 \u0442\u043E\u0439 \u0436\u0435 \u043F\u043E\u043B\u0438\u0442\u0438\u043A\u0435");
      continue;
    }
    const lc = l?.hash !== b?.local, rc = r?.hash !== b?.remote;
    if (!l || !r) {
      const missingSide = !l ? "local" : "remote", hadMissing = !!b?.[missingSide];
      const presentChanged = !l ? rc : lc;
      const propagates = !l && profile.direction !== "pull" || !r && profile.direction !== "push";
      if (hadMissing && propagates) {
        if (profile.deletion === "ignore") {
          emit(
            "skip",
            "\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u0440\u0430\u0441\u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F; \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F"
          );
          continue;
        }
        if (presentChanged && profile.deleteConflict === "ask") {
          emit("conflict", "\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0442\u0438\u0432 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F");
          continue;
        }
        if (presentChanged && profile.deleteConflict === "keep") {
          if (profile.direction === "both")
            emit(
              l ? "upload" : "download",
              "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0439 \u0444\u0430\u0439\u043B: \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0434\u0440\u0443\u0433\u0443\u044E \u0441\u0442\u043E\u0440\u043E\u043D\u0443"
            );
          else
            emit("adopt", "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0439 \u0444\u0430\u0439\u043B \u043D\u0430 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u044E\u0449\u0435\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u0435");
          continue;
        }
        emit(
          l ? "delete-local" : "delete-remote",
          "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0440\u0430\u043D\u0435\u0435 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430"
        );
        continue;
      }
      if (l && profile.direction !== "pull")
        emit(
          "upload",
          hadMissing ? "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u0443\u044E \u043A\u043E\u043F\u0438\u044E \u0438\u0437 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430" : "\u041D\u043E\u0432\u044B\u0439 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0444\u0430\u0439\u043B"
        );
      else if (r && profile.direction !== "push")
        emit(
          "download",
          hadMissing ? "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443\u044E \u043A\u043E\u043F\u0438\u044E \u0438\u0437 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0433\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430" : "\u041D\u043E\u0432\u044B\u0439 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0444\u0430\u0439\u043B"
        );
      else emit("adopt", "\u0424\u0430\u0439\u043B \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u044E\u0449\u0435\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u0435: \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C");
      continue;
    }
    const conflict = !b || samePair || profile.conflictWhen === "any-difference" || lc && rc;
    if (!conflict) {
      if (rc && profile.direction !== "push")
        emit("download", "\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439 \u0444\u0430\u0439\u043B");
      else if (lc && profile.direction !== "pull")
        emit("upload", "\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0444\u0430\u0439\u043B");
      else
        emit(
          "skip",
          "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u043D\u0430 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u044E\u0449\u0435\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u0435: \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435"
        );
      continue;
    }
    let policy = profile.conflict;
    if (policy === "newest") {
      if (!l.mtime || !r.mtime || l.mtime === r.mtime) {
        emit("conflict", "\u041D\u0435\u0442 \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u0438\u043C\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438: \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0435\u0440\u0441\u0438\u044E");
        continue;
      }
      policy = l.mtime > r.mtime ? "local" : "remote";
    }
    if (policy === "ask")
      emit(
        "conflict",
        !b ? "\u041F\u0435\u0440\u0432\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435: \u0440\u0430\u0437\u043D\u044B\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u0444\u0430\u0439\u043B\u044B" : "\u0418\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u043E\u0431\u0435 \u0432\u0435\u0440\u0441\u0438\u0438"
      );
    else if (policy === "both")
      emit("keep-both", "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0438\u0433\u0440\u044B\u0432\u0430\u044E\u0449\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E \u0432 .sync-conflicts");
    else if (policy === "local")
      emit(
        profile.direction === "pull" ? "adopt" : "upload",
        "\u0412\u044B\u0438\u0433\u0440\u044B\u0432\u0430\u0435\u0442 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F"
      );
    else
      emit(
        profile.direction === "push" ? "adopt" : "download",
        "\u0412\u044B\u0438\u0433\u0440\u044B\u0432\u0430\u0435\u0442 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F"
      );
  }
  return {
    id: crypto.randomUUID(),
    created: Date.now(),
    profile: structuredClone(profile),
    identity,
    operations,
    local,
    remote,
    baseline: structuredClone(baseline),
    warnings: [...local.warnings, ...remote.warnings]
  };
}

// src/core/recovery.ts
function recover(pending, identity, local, remote, backupVerified) {
  if (pending.identity !== identity)
    return {
      kind: "blocked",
      reason: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A, \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u0438\u043B\u0438 \u043A\u043E\u0440\u0435\u043D\u044C \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u0440\u0438 \u043D\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u043E\u0439 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438"
    };
  const op = pending.operation;
  if (pending.result) {
    if (op.action === "keep-both" && !backupVerified)
      return {
        kind: "blocked",
        reason: "\u041A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443"
      };
    return { kind: "commit", pair: pending.result };
  }
  const target = op.action === "download" || op.action === "delete-local" || op.action === "keep-both" && pending.direction !== "push" ? "local" : "remote";
  const actual = target === "local" ? local : remote;
  const original = op[target];
  const deleting = op.action === "delete-local" || op.action === "delete-remote";
  const desired = deleting ? void 0 : target === "local" ? op.remote?.hash : op.local?.hash;
  if (actual?.hash === desired) {
    if (op.action === "keep-both" && !backupVerified)
      return {
        kind: "blocked",
        reason: "\u041A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443"
      };
    const pair = {
      local: op.local?.hash,
      remote: op.remote?.hash,
      policyKey: pending.policyKey
    };
    pair[target] = desired;
    return { kind: "commit", pair };
  }
  if (actual?.hash === original?.hash) return { kind: "retry" };
  return {
    kind: "blocked",
    reason: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043E\u0442\u043B\u0438\u0447\u0430\u0435\u0442\u0441\u044F \u0438 \u043E\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439, \u0438 \u043E\u0442 \u043E\u0436\u0438\u0434\u0430\u0435\u043C\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438. \u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0444\u0430\u0439\u043B\u0430 \u0438\u0437 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438"
  };
}

// src/adapters/state-file.ts
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
async function syncDirectory(dir) {
  try {
    const handle = await (0, import_promises.open)(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (e) {
    const code = e.code;
    if (process.platform === "win32" && ["EPERM", "EISDIR", "EINVAL", "EACCES"].includes(code || ""))
      return;
    throw e;
  }
}
var StateFile = class {
  chain = Promise.resolve();
  dir;
  file;
  constructor(vaultRoot) {
    this.dir = (0, import_node_path.join)(vaultRoot, ".sync-studio");
    this.file = (0, import_node_path.join)(this.dir, "state-v1.json");
  }
  async directory() {
    await (0, import_promises.mkdir)(this.dir, { recursive: true });
    if ((await (0, import_promises.lstat)(this.dir)).isSymbolicLink())
      throw Error("\u0421\u043B\u0443\u0436\u0435\u0431\u043D\u0430\u044F \u043F\u0430\u043F\u043A\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0441\u0438\u043C\u0432\u043E\u043B\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0441\u0441\u044B\u043B\u043A\u043E\u0439");
  }
  async read(fallback) {
    await this.directory();
    let raw;
    try {
      if ((await (0, import_promises.lstat)(this.file)).isSymbolicLink())
        throw Error("\u0424\u0430\u0439\u043B \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u043E\u0439");
      raw = await (0, import_promises.readFile)(this.file, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return fallback;
      throw e;
    }
    const envelope = JSON.parse(raw);
    if (envelope.schema !== 1 || typeof envelope.payload !== "string" || sha(Buffer.from(envelope.payload)) !== envelope.sha256)
      throw Error(
        "\u0424\u0430\u0439\u043B \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0451\u043D. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u043F\u0443\u0441\u0442\u043E\u0439 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u043E."
      );
    return JSON.parse(envelope.payload);
  }
  write(data) {
    const payload = JSON.stringify(data);
    const envelope = JSON.stringify({
      schema: 1,
      sha256: sha(Buffer.from(payload)),
      payload
    });
    const run = async () => {
      await this.directory();
      const temp = (0, import_node_path.join)(this.dir, crypto.randomUUID() + ".tmp");
      const handle = await (0, import_promises.open)(temp, "wx", 384);
      try {
        await handle.writeFile(envelope);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await (0, import_promises.rename)(temp, this.file);
        await syncDirectory(this.dir);
      } catch (e) {
        await (0, import_promises.unlink)(temp).catch(() => {
        });
        throw e;
      }
    };
    const result = this.chain.then(run);
    this.chain = result.catch(() => {
    });
    return result;
  }
};

// src/core/executor.ts
var fingerprint = (f) => f ? JSON.stringify([f.id, f.version, f.hash]) : "";
async function execute(plan2, local, remote, ports, signal, onProgress) {
  const state = structuredClone(plan2.baseline), details = [];
  let currentOperation;
  let dirty = false;
  let applied = 0, conflicts = 0, status = "completed", message = "\u0413\u043E\u0442\u043E\u0432\u043E";
  try {
    const ls = await local.scan(signal), rs = await remote.scan(signal);
    if (!ls.complete || !rs.complete || JSON.stringify([ls.identity, rs.identity]) !== plan2.identity)
      throw Error("\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F. \u041F\u043E\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D.");
    for (const op of plan2.operations) {
      signal.throwIfAborted();
      if (fingerprint(
        Object.hasOwn(ls.files, op.path) ? ls.files[op.path] : void 0
      ) !== fingerprint(op.local) || fingerprint(
        Object.hasOwn(rs.files, op.path) ? rs.files[op.path] : void 0
      ) !== fingerprint(op.remote))
        throw Error("\u0424\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u043F\u043B\u0430\u043D\u0430: " + op.path);
    }
    for (const op of plan2.operations) {
      currentOperation = op;
      signal.throwIfAborted();
      let l = op.local, r = op.remote;
      if (op.action === "skip") {
        details.push({
          path: op.path,
          action: op.action,
          status: "\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D: \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435"
        });
        continue;
      }
      if (op.action === "conflict") {
        conflicts++;
        details.push({
          path: op.path,
          action: op.action,
          status: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442 \u0440\u0435\u0448\u0435\u043D\u0438\u044F"
        });
        continue;
      }
      if (op.action !== "adopt") await ports.journal(op, "pending");
      const read = async (s, f) => {
        const bytes2 = await s.read(f, signal);
        if (sha(bytes2) !== f.hash)
          throw Error("\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0430\u0441\u044C: " + op.path);
        return bytes2;
      };
      if (op.action === "download" || op.action === "keep-both" && plan2.profile.direction !== "push") {
        const bytes2 = await read(remote, r);
        if (l) {
          const old = await read(local, l);
          if (op.action === "keep-both")
            await ports.backup(`${plan2.id}/${op.path}`, old);
          else await ports.recovery?.(`${plan2.id}/${op.path}`, old);
        }
        l = await local.write(op.path, bytes2, l, r?.mtime, signal);
      } else if (op.action === "upload" || op.action === "keep-both") {
        const bytes2 = await read(local, l);
        if (r) {
          const old = await read(remote, r);
          if (op.action === "keep-both")
            await ports.backup(`${plan2.id}/${op.path}`, old);
          else await ports.recovery?.(`${plan2.id}/${op.path}`, old);
        }
        r = await remote.write(op.path, bytes2, r, l?.mtime, signal);
      } else if (op.action === "delete-local") {
        const current = await remote.scan(signal);
        if (!current.complete || current.identity !== plan2.remote.identity || Object.hasOwn(current.files, op.path))
          throw Error("\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E: \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F");
        await local.delete(l, plan2.profile.deletion === "trash", signal);
        l = void 0;
      } else if (op.action === "delete-remote") {
        const current = await local.scan(signal);
        if (!current.complete || current.identity !== plan2.local.identity || Object.hasOwn(current.files, op.path))
          throw Error("\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E: \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F");
        await remote.delete(r, plan2.profile.deletion === "trash", signal);
        r = void 0;
      }
      const pair = {
        local: l?.hash,
        remote: r?.hash,
        policyKey: policyKey(plan2.profile)
      };
      if (op.action !== "adopt") {
        applied++;
        await ports.journal(op, "applied", pair);
      }
      Object.defineProperty(state.files, op.path, {
        value: pair,
        enumerable: true,
        writable: true,
        configurable: true
      });
      if (op.action === "adopt") dirty = true;
      else {
        await ports.checkpoint(state);
        dirty = false;
      }
      if (op.action !== "adopt") {
        await ports.journal(op, "done");
        details.push({ path: op.path, action: op.action, status: "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E" });
      }
      onProgress?.(applied, plan2.operations.length);
    }
    if (dirty) await ports.checkpoint(state);
    if (conflicts) {
      status = "partial";
      message = `\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0435\u0448\u0435\u043D\u0438\u044F: ${conflicts}`;
    }
  } catch (e) {
    status = signal.aborted ? "cancelled" : applied ? "partial" : "failed";
    message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F";
    if (currentOperation)
      details.push({
        path: currentOperation.path,
        action: currentOperation.action,
        status: "\u041E\u0448\u0438\u0431\u043A\u0430: " + message
      });
  }
  return {
    id: plan2.id,
    profileId: plan2.profile.id,
    name: plan2.profile.name,
    at: Date.now(),
    status,
    applied,
    conflicts,
    message,
    details
  };
}

// src/adapters/external-folder.ts
var import_promises2 = require("node:fs/promises");
var import_node_path2 = require("node:path");
var ExternalFolder = class {
  constructor(root, limit) {
    this.root = root;
    this.limit = limit;
    if (!(0, import_node_path2.isAbsolute)(root)) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0430\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u0432\u043D\u0435\u0448\u043D\u0435\u0439 \u043F\u0430\u043F\u043A\u0438");
    this.identity = "external-folder:" + root;
  }
  writable = false;
  trashSupported = false;
  identity;
  async safe(p) {
    path(p, true);
    let current = this.root;
    if ((await (0, import_promises2.lstat)(current)).isSymbolicLink())
      throw Error("\u041A\u043E\u0440\u0435\u043D\u044C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0441\u0438\u043C\u0432\u043E\u043B\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0441\u0441\u044B\u043B\u043A\u043E\u0439");
    for (const part of p.split("/").filter(Boolean)) {
      current = (0, import_node_path2.join)(current, part);
      if ((await (0, import_promises2.lstat)(current)).isSymbolicLink())
        throw Error("\u0421\u0438\u043C\u0432\u043E\u043B\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u0430: " + p);
    }
    return current;
  }
  async scan(signal) {
    const files = /* @__PURE__ */ Object.create(null), rootReal = await (0, import_promises2.realpath)(this.root);
    this.identity = "external-folder:" + rootReal;
    const walk = async (base) => {
      signal.throwIfAborted();
      const dir = await this.safe(base);
      for (const item of await (0, import_promises2.readdir)(dir, { withFileTypes: true })) {
        const rel = join(base, item.name);
        if (protectedPath(rel, ".obsidian")) continue;
        path(rel);
        if (item.isSymbolicLink())
          throw Error("\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0441\u0438\u043C\u0432\u043E\u043B\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u0441\u0441\u044B\u043B\u043A\u0443: " + rel);
        if (item.isDirectory()) await walk(rel);
        else if (item.isFile()) {
          const stat = await (0, import_promises2.lstat)(await this.safe(rel));
          if (stat.size > this.limit)
            files[rel] = {
              path: rel,
              hash: "oversize:" + stat.size,
              version: String(stat.mtimeMs),
              size: stat.size
            };
          else {
            const b = await (0, import_promises2.readFile)(await this.safe(rel));
            const after = await (0, import_promises2.lstat)(await this.safe(rel));
            if (stat.mtimeMs !== after.mtimeMs || stat.size !== after.size)
              throw Error("\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u0444\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0432\u043E \u0432\u0440\u0435\u043C\u044F \u0447\u0442\u0435\u043D\u0438\u044F");
            files[rel] = {
              path: rel,
              hash: sha(b),
              version: sha(b),
              size: stat.size,
              mtime: stat.mtimeMs
            };
          }
        } else throw Error("\u041D\u0435\u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043C\u044B\u0439 \u0442\u0438\u043F \u0444\u0430\u0439\u043B\u0430: " + rel);
      }
    };
    await walk("");
    uniquePaths(Object.keys(files));
    return { files, identity: this.identity, complete: true, warnings: [] };
  }
  async read(f, signal) {
    signal.throwIfAborted();
    const file = await this.safe(f.path);
    if ((await (0, import_promises2.lstat)(file)).size > this.limit)
      throw Error("\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u0444\u0430\u0439\u043B \u043F\u0440\u0435\u0432\u044B\u0441\u0438\u043B \u043B\u0438\u043C\u0438\u0442");
    const b = await (0, import_promises2.readFile)(file);
    if (sha(b) !== f.hash) throw Error("\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u0444\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F");
    return b;
  }
  async write() {
    throw Error("\u0412\u043D\u0435\u0448\u043D\u044F\u044F \u043F\u0430\u043F\u043A\u0430 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A");
  }
  async delete() {
    throw Error("\u0412\u043D\u0435\u0448\u043D\u044F\u044F \u043F\u0430\u043F\u043A\u0430 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A");
  }
};

// src/adapters/local.ts
var import_promises3 = require("node:fs/promises");
var import_node_path3 = require("node:path");
var LocalStore = class {
  constructor(app, root, limit, rules) {
    this.app = app;
    this.root = root;
    this.limit = limit;
    this.rules = rules;
    path(root, true);
    this.identity = "vault:" + app.vault.getName() + ":" + root;
  }
  writable = true;
  trashSupported = true;
  identity;
  full(p) {
    return join(this.root, path(p));
  }
  async safe(relative) {
    const a = this.app.vault.adapter;
    if (!a.getBasePath)
      throw Error("\u041D\u0443\u0436\u0435\u043D \u0444\u0430\u0439\u043B\u043E\u0432\u044B\u0439 \u0430\u0434\u0430\u043F\u0442\u0435\u0440 \u043D\u0430\u0441\u0442\u043E\u043B\u044C\u043D\u043E\u0433\u043E Obsidian");
    let current = a.getBasePath();
    for (const part of relative.split("/").filter(Boolean)) {
      current = (0, import_node_path3.join)(current, part);
      try {
        if ((await (0, import_promises3.lstat)(current)).isSymbolicLink())
          throw Error("\u0421\u0438\u043C\u0432\u043E\u043B\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430 \u0432 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C \u043F\u0443\u0442\u0438: " + relative);
      } catch (e) {
        if (e.code === "ENOENT") return;
        throw e;
      }
    }
  }
  async scan(signal) {
    const files = /* @__PURE__ */ Object.create(null), warnings = [];
    const adapter = this.app.vault.adapter;
    const walk = async (folder) => {
      signal.throwIfAborted();
      const full = join(this.root, folder);
      await this.safe(full);
      if (!await adapter.exists(full)) {
        if (!folder) return;
        throw Error("\u041F\u0430\u043F\u043A\u0430 \u0438\u0441\u0447\u0435\u0437\u043B\u0430 \u043F\u0440\u0438 \u043E\u0431\u0445\u043E\u0434\u0435");
      }
      const list = await adapter.list(full);
      for (const f of list.files) {
        const rel = this.root ? f.slice(this.root.length + 1) : f;
        if (protectedPath(f, this.app.vault.configDir) || this.rules && !this.rules.file(rel))
          continue;
        path(rel);
        const stat = await adapter.stat(f);
        if (!stat || stat.type !== "file") throw Error("\u0424\u0430\u0439\u043B \u0438\u0441\u0447\u0435\u0437 \u043F\u0440\u0438 \u043E\u0431\u0445\u043E\u0434\u0435");
        if (stat.size > this.limit) {
          files[rel] = {
            path: rel,
            size: stat.size,
            hash: "oversize:" + stat.size,
            version: `${stat.mtime}:${stat.size}`
          };
          continue;
        }
        files[rel] = await this.inspect(rel, signal);
      }
      for (const f of list.folders)
        if (!protectedPath(f, this.app.vault.configDir) && (!this.rules || this.rules.folder(this.root ? f.slice(this.root.length + 1) : f)))
          await walk(this.root ? f.slice(this.root.length + 1) : f);
    };
    await walk("");
    uniquePaths(Object.keys(files));
    return { files, complete: true, warnings, identity: this.identity };
  }
  async inspect(p, signal) {
    signal.throwIfAborted();
    const full = this.full(p), a = this.app.vault.adapter;
    await this.safe(full);
    const before = await a.stat(full);
    if (!before || before.type !== "file") throw Error("\u0424\u0430\u0439\u043B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: " + p);
    if (before.size > this.limit) throw Error("\u0424\u0430\u0439\u043B \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043B\u0438\u043C\u0438\u0442: " + p);
    const b = new Uint8Array(await a.readBinary(full));
    const after = await a.stat(full);
    if (!after || after.size !== before.size || after.mtime !== before.mtime)
      throw Error("\u0424\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u043F\u0440\u0438 \u0447\u0442\u0435\u043D\u0438\u0438: " + p);
    return {
      path: p,
      hash: sha(b),
      size: b.length,
      mtime: before.mtime,
      version: sha(b)
    };
  }
  async read(f, signal) {
    await this.safe(this.full(f.path));
    const b = new Uint8Array(
      await this.app.vault.adapter.readBinary(this.full(f.path))
    );
    signal.throwIfAborted();
    if (sha(b) !== f.hash) throw Error("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0444\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F: " + f.path);
    return b;
  }
  async check(p, expected, signal) {
    await this.safe(this.full(p));
    const exists = await this.app.vault.adapter.exists(this.full(p));
    if (!expected) {
      if (exists) throw Error("\u0424\u0430\u0439\u043B \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F: " + p);
    } else if (!exists || (await this.inspect(p, signal)).hash !== expected.hash)
      throw Error("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0430\u0441\u044C: " + p);
  }
  async write(p, b, expected, mtime, signal) {
    const full = this.full(p);
    if (protectedPath(full, this.app.vault.configDir))
      throw Error("\u0421\u043B\u0443\u0436\u0435\u0431\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u0437\u0430\u0449\u0438\u0449\u0451\u043D");
    await this.check(p, expected, signal);
    await ensureDir(this.app, full.split("/").slice(0, -1).join("/"));
    const temp = ".sync-studio/stage/" + crypto.randomUUID();
    await this.safe(temp);
    await ensureDir(this.app, ".sync-studio/stage");
    try {
      await this.app.vault.adapter.writeBinary(
        temp,
        Uint8Array.from(b).buffer,
        mtime ? { mtime } : void 0
      );
      if (sha(new Uint8Array(await this.app.vault.adapter.readBinary(temp))) !== sha(b))
        throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430 \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0430");
      const adapter = this.app.vault.adapter;
      const vaultRoot = adapter.getBasePath();
      const staged = await (0, import_promises3.open)((0, import_node_path3.join)(vaultRoot, temp), "r");
      try {
        await staged.sync();
      } finally {
        await staged.close();
      }
      await this.check(p, expected, signal);
      signal.throwIfAborted();
      await (0, import_promises3.rename)((0, import_node_path3.join)(vaultRoot, temp), (0, import_node_path3.join)(vaultRoot, full));
      await syncDirectory(
        (0, import_node_path3.join)(vaultRoot, full.split("/").slice(0, -1).join("/"))
      );
    } finally {
      if (await this.app.vault.adapter.exists(temp))
        await this.app.vault.adapter.remove(temp);
    }
    return this.inspect(p, signal);
  }
  async delete(f, trash, signal) {
    await this.check(f.path, f, signal);
    const full = this.full(f.path);
    if (protectedPath(full, this.app.vault.configDir))
      throw Error("\u0421\u043B\u0443\u0436\u0435\u0431\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u0437\u0430\u0449\u0438\u0449\u0451\u043D");
    const file = this.app.vault.getFileByPath(full);
    if (file) {
      if (trash) await this.app.vault.trash(file, false);
      else await this.app.vault.delete(file);
    } else if (trash) await this.app.vault.adapter.trashLocal(full);
    else await this.app.vault.adapter.remove(full);
  }
};
async function ensureDir(app, p) {
  if (!p) return;
  let at = "";
  for (const part of p.split("/")) {
    at = join(at, part);
    if (!await app.vault.adapter.exists(at))
      await app.vault.adapter.mkdir(at);
  }
}
async function writeBackup(app, destination, bytes2) {
  path(destination);
  const adapter = app.vault.adapter;
  const root = adapter.getBasePath();
  let current = root;
  for (const part of destination.split("/")) {
    current = (0, import_node_path3.join)(current, part);
    try {
      if ((await (0, import_promises3.lstat)(current)).isSymbolicLink())
        throw Error("\u0421\u0441\u044B\u043B\u043A\u0430 \u0432 \u043F\u0443\u0442\u0438 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438");
    } catch (e) {
      if (e.code === "ENOENT") break;
      throw e;
    }
  }
  await ensureDir(app, destination.split("/").slice(0, -1).join("/"));
  if (await adapter.exists(destination)) {
    if (sha(new Uint8Array(await adapter.readBinary(destination))) !== sha(bytes2))
      throw Error("\u041F\u0443\u0442\u044C \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438 \u0437\u0430\u043D\u044F\u0442 \u0434\u0440\u0443\u0433\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0435\u0439");
    return;
  }
  await adapter.writeBinary(destination, Uint8Array.from(bytes2).buffer);
  const file = await (0, import_promises3.open)((0, import_node_path3.join)(root, destination), "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
  await syncDirectory(
    (0, import_node_path3.join)(root, destination.split("/").slice(0, -1).join("/"))
  );
}

// src/adapters/http.ts
var import_node_https = require("node:https");
var Http = class {
  async fetch(url, opts = {}) {
    let current = url;
    let request = { ...opts };
    for (let i = 0; i <= 5; i++) {
      const response = await this.once(current, request);
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      if (opts.redirect !== "follow") return response;
      if ((request.method || "GET") !== "GET" || !response.headers.location || i === 5)
        throw Error("\u041D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F");
      const next = new URL(response.headers.location, current);
      const previous = new URL(current);
      const yandex = (host) => ["yandex.net", "yandex.ru", "yandex.com"].some(
        (d) => host === d || host.endsWith("." + d)
      );
      if (next.protocol !== "https:" || next.username || next.password || next.origin !== previous.origin && !(yandex(next.hostname) && yandex(previous.hostname)))
        throw Error("\u041D\u0435\u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u043F\u0435\u0440\u0435\u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F");
      request = {
        ...request,
        headers: Object.fromEntries(
          Object.entries(request.headers || {}).filter(
            ([key]) => !["authorization", "cookie", "host"].includes(key.toLowerCase())
          )
        )
      };
      current = next.href;
    }
    throw Error("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u0435\u0440\u0435\u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0439");
  }
  async once(url, opts = {}) {
    opts.signal?.throwIfAborted();
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password)
      throw Error("\u041D\u0435\u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0439 \u0441\u0435\u0442\u0435\u0432\u043E\u0439 \u0430\u0434\u0440\u0435\u0441");
    const body = opts.body === void 0 ? void 0 : typeof opts.body === "string" ? Buffer.from(opts.body, "utf8") : Buffer.from(
      opts.body instanceof ArrayBuffer ? new Uint8Array(opts.body) : opts.body
    );
    const headers = { ...opts.headers };
    if (body !== void 0 && !Object.keys(headers).some((k) => k.toLowerCase() === "content-length"))
      headers["Content-Length"] = String(body.byteLength);
    return new Promise((resolve, reject) => {
      const req = (0, import_node_https.request)(
        u,
        {
          method: opts.method || "GET",
          headers,
          signal: opts.signal
        },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > (opts.maxBytes ?? 4 * 1024 * 1024)) {
              req.destroy(new Error("\u041E\u0442\u0432\u0435\u0442 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440"));
              return;
            }
            chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            const bytes2 = Buffer.concat(chunks);
            const headers2 = {};
            for (const [k, v] of Object.entries(res.headers))
              if (v !== void 0)
                headers2[k] = Array.isArray(v) ? v.join(",") : v;
            resolve({
              status: res.statusCode || 0,
              headers: headers2,
              text: async () => bytes2.toString("utf8"),
              arrayBuffer: async () => Uint8Array.from(bytes2).buffer
            });
          });
        }
      );
      req.on(
        "error",
        (e) => reject(
          opts.signal?.aborted ? opts.signal.reason : Object.assign(
            new Error(
              e.message.includes("\u0440\u0430\u0437\u043C\u0435\u0440") || e.message === "\u0422\u0430\u0439\u043C-\u0430\u0443\u0442" ? e.message : "\u0421\u0435\u0442\u0435\u0432\u043E\u0439 \u0437\u0430\u043F\u0440\u043E\u0441 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D" + (e.code ? " (" + e.code + ")" : "")
            ),
            { code: e.code }
          )
        )
      );
      req.setTimeout(6e4, () => req.destroy(new Error("\u0422\u0430\u0439\u043C-\u0430\u0443\u0442")));
      if (body !== void 0) req.write(body);
      req.end();
    });
  }
};
async function json(http, url, opts = {}) {
  const r = await http.fetch(url, opts);
  if (r.status < 200 || r.status >= 300) {
    let reason = "";
    try {
      const body = JSON.parse(await r.text());
      const candidate = typeof body.error === "string" ? body.error : body.error?.errors?.[0]?.reason || body.error?.status;
      if (typeof candidate === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(candidate))
        reason = " (" + candidate + ")";
    } catch {
    }
    const hint = r.status === 401 ? " \u041F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442: \u0442\u043E\u043A\u0435\u043D \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D." : r.status === 403 ? " \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0440\u0430\u0432\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 API \u0441\u0435\u0440\u0432\u0438\u0441\u0430." : r.status === 404 ? " \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0443\u0442\u044C/ID \u043F\u0430\u043F\u043A\u0438 \u0438 \u0434\u043E\u0441\u0442\u0443\u043F \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430." : r.status === 429 ? " \u041B\u0438\u043C\u0438\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u0441\u0435\u0440\u0432\u0438\u0441\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u0437\u0436\u0435." : " \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F.";
    throw Object.assign(
      Error(new URL(url).hostname + ": HTTP " + r.status + reason + hint),
      { status: r.status }
    );
  }
  try {
    return JSON.parse(await r.text());
  } catch {
    throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 JSON API");
  }
}
async function bytes(http, url, opts = {}) {
  const r = await http.fetch(url, opts);
  if (r.status !== 200)
    throw Object.assign(Error("\u0421\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435: HTTP " + r.status), {
      status: r.status
    });
  return new Uint8Array(await r.arrayBuffer());
}

// src/sources/remotes.ts
var import_node_crypto2 = require("node:crypto");
var hashCache = /* @__PURE__ */ new Map();
var FOLDER = "application/vnd.google-apps.folder";
var fields = "id,name,mimeType,size,modifiedTime,version,sha256Checksum,md5Checksum,trashed,capabilities(canEdit,canDownload,canAddChildren)";
function driveRoot(value) {
  const v = value.trim();
  if (!v.startsWith("https://")) {
    if (!/^[\w-]+$/.test(v))
      throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 ID \u043F\u0430\u043F\u043A\u0438 Google Drive \u0438\u043B\u0438 \u0441\u0441\u044B\u043B\u043A\u0443");
    return v;
  }
  const u = new URL(v);
  if (u.hostname !== "drive.google.com")
    throw Error("\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0441\u0441\u044B\u043B\u043A\u0430 drive.google.com");
  const id = u.pathname.match(/\/folders\/([\w-]+)/)?.[1] || u.searchParams.get("id");
  if (!id || !/^[\w-]+$/.test(id)) throw Error("\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 folder ID");
  return id;
}
var DriveStore = class {
  constructor(http, root, limit, publicKey, identityAccount = "", rules) {
    this.http = http;
    this.limit = limit;
    this.rules = rules;
    this.root = driveRoot(root);
    this.key = publicKey;
    this.resourceKey = root.startsWith("https:") ? new URL(root).searchParams.get("resourcekey") || void 0 : void 0;
    this.writable = !publicKey;
    this.trashSupported = !publicKey;
    this.identity = "drive:" + identityAccount + ":" + this.root;
  }
  identity;
  writable;
  trashSupported;
  root;
  folders = /* @__PURE__ */ new Map();
  key;
  resourceKey;
  url(suffix, query = {}, upload = false) {
    const u = new URL(
      "https://www.googleapis.com/" + (upload ? "upload/" : "") + "drive/v3/" + suffix
    );
    for (const [k, v] of Object.entries({
      ...query,
      supportsAllDrives: "true",
      ...this.key ? { key: this.key } : {}
    }))
      u.searchParams.set(k, v);
    return u.href;
  }
  opts(signal, extra = {}) {
    return {
      ...extra,
      signal,
      headers: {
        ...this.resourceKey ? { "X-Goog-Drive-Resource-Keys": `${this.root}/${this.resourceKey}` } : {},
        ...extra.headers
      }
    };
  }
  async inspect(id, signal) {
    return json(
      this.http,
      this.url("files/" + encodeURIComponent(id), { fields }),
      this.opts(signal)
    );
  }
  async info(f, p, signal) {
    if (typeof f.id !== "string" || typeof f.version !== "string" && typeof f.version !== "number")
      throw Error("Drive \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u0432\u0435\u0440\u0441\u0438\u044E \u0444\u0430\u0439\u043B\u0430");
    const size = Number(f.size);
    if (!Number.isSafeInteger(size) || size < 0)
      throw Error("Drive \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u0440\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u0430");
    let hash = f.sha256Checksum;
    if (size > this.limit) hash = "oversize:" + size;
    else if (typeof hash !== "string" || !/^[a-f\d]{64}$/i.test(hash)) {
      const key = f.id + ":" + f.version;
      hash = hashCache.get(key);
      if (!hash) {
        hash = sha(await this.download(f, signal));
        if (hashCache.size > 1e5) hashCache.clear();
        hashCache.set(key, hash);
      }
    }
    return {
      path: p,
      hash: String(hash).toLowerCase(),
      size,
      mtime: Date.parse(f.modifiedTime) || void 0,
      id: f.id,
      version: String(f.version)
    };
  }
  async children(id, signal) {
    const out = [];
    let next = "";
    const pages = /* @__PURE__ */ new Set();
    do {
      if (pages.has(next)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B Drive");
      pages.add(next);
      const d = await json(
        this.http,
        this.url("files", {
          q: `'${id.replace(/'/g, "\\'")}' in parents and trashed=false`,
          fields: `files(${fields}),nextPageToken,incompleteSearch`,
          pageSize: "1000",
          includeItemsFromAllDrives: "true",
          ...next ? { pageToken: next } : {}
        }),
        this.opts(signal)
      );
      if (d.incompleteSearch || !Array.isArray(d.files))
        throw Error("\u041D\u0435\u043F\u043E\u043B\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 Drive");
      out.push(...d.files);
      next = d.nextPageToken || "";
    } while (next);
    return out;
  }
  async scan(signal) {
    const root = await this.inspect(this.root, signal);
    if (root.trashed || root.mimeType !== FOLDER)
      throw Error("\u041F\u0430\u043F\u043A\u0430 Drive \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430");
    const files = /* @__PURE__ */ Object.create(null), warnings = [], seen = /* @__PURE__ */ new Set(), all = [];
    this.folders = /* @__PURE__ */ new Map([["", this.root]]);
    const walk = async (id, base, depth) => {
      signal.throwIfAborted();
      if (depth > 60 || seen.size > 1e5)
        throw Error("\u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D \u043F\u0440\u0435\u0434\u0435\u043B \u043E\u0431\u0445\u043E\u0434\u0430 Drive");
      if (seen.has(id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 ID \u043F\u0430\u043F\u043A\u0438 Drive");
      seen.add(id);
      for (const f of await this.children(id, signal)) {
        if (/[\\/]/.test(f.name))
          throw Error("\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0440\u0430\u0437\u0434\u0435\u043B\u0438\u0442\u0435\u043B\u044C \u0432 \u0438\u043C\u0435\u043D\u0438 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430");
        path(f.name);
        const p = join(base, f.name);
        if (f.mimeType === FOLDER ? this.rules && !this.rules.folder(p) : this.rules && !this.rules.file(p))
          continue;
        all.push(p);
        if (f.mimeType === FOLDER) {
          this.folders.set(p, f.id);
          await walk(f.id, p, depth + 1);
        } else if (String(f.mimeType).startsWith("application/vnd.google-apps.")) {
          warnings.push(
            "\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D Google Docs / shortcut (\u043D\u0443\u0436\u0435\u043D \u044D\u043A\u0441\u043F\u043E\u0440\u0442): " + p
          );
          files[p] = {
            path: p,
            size: Number.MAX_SAFE_INTEGER,
            hash: "unsupported:" + f.mimeType,
            version: String(f.version || ""),
            id: f.id
          };
        } else files[p] = await this.info(f, p, signal);
      }
    };
    await walk(this.root, "", 0);
    uniquePaths(all);
    return { files, complete: true, warnings, identity: this.identity };
  }
  async download(f, signal) {
    const b = await bytes(
      this.http,
      this.url("files/" + encodeURIComponent(f.id), { alt: "media" }),
      this.opts(signal, { maxBytes: this.limit })
    );
    if (b.length !== Number(f.size))
      throw Error("\u0420\u0430\u0437\u043C\u0435\u0440 Drive-\u0444\u0430\u0439\u043B\u0430 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B");
    if (f.sha256Checksum && sha(b) !== f.sha256Checksum.toLowerCase())
      throw Error("SHA-256 Drive \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B");
    if (f.md5Checksum && (0, import_node_crypto2.createHash)("md5").update(b).digest("hex") !== f.md5Checksum.toLowerCase())
      throw Error("MD5 Drive \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B");
    const after = await this.inspect(f.id, signal);
    if (String(after.version) !== String(f.version) || after.trashed)
      throw Error("\u0424\u0430\u0439\u043B Drive \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0432\u043E \u0432\u0440\u0435\u043C\u044F \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F");
    return b;
  }
  async read(f, signal) {
    const current = await this.inspect(f.id, signal);
    if (String(current.version) !== f.version || current.trashed)
      throw Error("\u0424\u0430\u0439\u043B Drive \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F");
    return this.download(current, signal);
  }
  async verifyExpected(p, expected, signal) {
    if (expected) {
      const r = await this.http.fetch(
        this.url("files/" + encodeURIComponent(expected.id), { fields }),
        this.opts(signal)
      );
      if (r.status !== 200) throw Error("Drive-\u0444\u0430\u0439\u043B \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
      const f = JSON.parse(await r.text());
      if (f.trashed || String(f.version) !== expected.version)
        throw Error("Drive-\u0444\u0430\u0439\u043B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F");
      if (!r.headers.etag)
        throw Error("Drive \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B ETag; \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u044C \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u0430");
      return r.headers.etag;
    }
    const parent = p.split("/").slice(0, -1).join("/");
    const id = this.folders.get(parent);
    if (id && (await this.children(id, signal)).some(
      (f) => f.name === p.split("/").at(-1)
    ))
      throw Error("Drive-\u0444\u0430\u0439\u043B \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F");
    return void 0;
  }
  async parent(p, signal) {
    let base = "", id = this.root;
    for (const name of p.split("/").slice(0, -1)) {
      base = join(base, name);
      let next = this.folders.get(base);
      if (!next) {
        const found = (await this.children(id, signal)).filter(
          (f) => f.name === name
        );
        if (found.length > 1 || found[0] && found[0].mimeType !== FOLDER)
          throw Error("\u041A\u043E\u043B\u043B\u0438\u0437\u0438\u044F \u043F\u0430\u043F\u043A\u0438 Drive");
        next = found[0]?.id;
        if (!next) {
          const d = await json(
            this.http,
            this.url("files", { fields: "id" }),
            this.opts(signal, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, mimeType: FOLDER, parents: [id] })
            })
          );
          next = d.id;
        }
        this.folders.set(base, next);
      }
      id = next;
    }
    return id;
  }
  async write(p, b, expected, mtime, signal) {
    if (!this.writable)
      throw Error("\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F \u043F\u0430\u043F\u043A\u0430 Drive \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0447\u0442\u0435\u043D\u0438\u044F");
    path(p);
    const etag = await this.verifyExpected(p, expected, signal), parent = await this.parent(p, signal);
    if (!expected) await this.verifyExpected(p, void 0, signal);
    const boundary = "sync_studio_" + crypto.randomUUID();
    const metadata = {
      name: p.split("/").at(-1),
      ...!expected ? { parents: [parent] } : {},
      ...mtime ? { modifiedTime: new Date(mtime).toISOString() } : {}
    };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}\r
--${boundary}\r
Content-Type: application/octet-stream\r
\r
`
      ),
      Buffer.from(b),
      Buffer.from(`\r
--${boundary}--\r
`)
    ]);
    const f = await json(
      this.http,
      this.url(
        expected ? "files/" + encodeURIComponent(expected.id) : "files",
        { uploadType: "multipart", fields },
        true
      ),
      this.opts(signal, {
        method: expected ? "PATCH" : "POST",
        headers: {
          "Content-Type": "multipart/related; boundary=" + boundary,
          ...etag ? { "If-Match": etag } : {}
        },
        body
      })
    );
    const result = await this.info(f, p, signal);
    if (result.hash !== sha(b)) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0437\u0430\u043F\u0438\u0441\u0438 Drive \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0430");
    return result;
  }
  async delete(f, trash, signal) {
    if (!this.writable) throw Error("\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0447\u0442\u0435\u043D\u0438\u044F");
    const etag = await this.verifyExpected(f.path, f, signal);
    const r = await this.http.fetch(
      this.url(
        "files/" + encodeURIComponent(f.id),
        trash ? { fields: "id" } : {}
      ),
      this.opts(signal, {
        method: trash ? "PATCH" : "DELETE",
        headers: { "If-Match": etag, "Content-Type": "application/json" },
        ...trash ? { body: '{"trashed":true}' } : {}
      })
    );
    if (r.status < 200 || r.status >= 300)
      throw Error("\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 Drive: HTTP " + r.status);
  }
};
var GitHubStore = class {
  constructor(http, repo, ref, prefix, token, limit, rules) {
    this.http = http;
    this.ref = ref;
    this.prefix = prefix;
    this.token = token;
    this.limit = limit;
    this.rules = rules;
    const m = repo.replace(/^https:\/\/github.com\//, "").replace(/\.git$/, "").replace(/\/$/, "").match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!m) throw Error("\u0420\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439: owner/repo");
    path(prefix, true);
    this.base = `https://api.github.com/repos/${m[1]}/${m[2]}`;
    this.identity = `github:${m[1]}/${m[2]}:${ref}:${prefix}`;
  }
  identity;
  writable = false;
  trashSupported = false;
  base;
  options(signal) {
    return {
      signal,
      maxBytes: 16 * 1024 * 1024,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Obsidian-Sync-Studio",
        ...this.token ? { Authorization: "Bearer " + this.token } : {}
      }
    };
  }
  async scan(signal) {
    const c = await json(
      this.http,
      this.base + "/commits/" + encodeURIComponent(this.ref || "HEAD"),
      this.options(signal)
    );
    if (!c.commit?.tree?.sha) throw Error("GitHub \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u0434\u0435\u0440\u0435\u0432\u043E \u043A\u043E\u043C\u043C\u0438\u0442\u0430");
    const tree = await json(
      this.http,
      this.base + "/git/trees/" + c.commit.tree.sha + "?recursive=1",
      this.options(signal)
    );
    if (tree.truncated || !Array.isArray(tree.tree))
      throw Error("\u041D\u0435\u043F\u043E\u043B\u043D\u043E\u0435 \u0434\u0435\u0440\u0435\u0432\u043E GitHub: \u0437\u0430\u043F\u0443\u0441\u043A \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D");
    if (this.prefix && !tree.tree.some((f) => f.type === "tree" && f.path === this.prefix))
      throw Error("\u041A\u0430\u0442\u0430\u043B\u043E\u0433 GitHub \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    const files = /* @__PURE__ */ Object.create(null);
    for (const f of tree.tree) {
      if (f.type === "tree" || !under(f.path, this.prefix)) continue;
      if (f.type !== "blob" || !["100644", "100755"].includes(f.mode))
        throw Error("\u0421\u0441\u044B\u043B\u043A\u0438 \u0438 submodules \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F: " + f.path);
      const p = this.prefix ? f.path.slice(this.prefix.length + 1) : f.path;
      path(p);
      if (this.rules && !this.rules.file(p)) continue;
      if (!Number.isSafeInteger(f.size)) throw Error("GitHub \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u0440\u0430\u0437\u043C\u0435\u0440");
      let hash = "oversize:" + f.size;
      if (f.size <= this.limit) {
        hash = hashCache.get("git:" + f.sha) || sha(await this.blob(f.sha, signal));
        if (hashCache.size > 1e5) hashCache.clear();
        hashCache.set("git:" + f.sha, hash);
      }
      files[p] = { path: p, hash, size: f.size, version: f.sha, id: f.sha };
    }
    uniquePaths(Object.keys(files));
    return {
      files,
      identity: this.identity,
      complete: true,
      warnings: [
        "GitHub: \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435; \u0444\u0430\u0439\u043B\u043E\u0432\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E."
      ]
    };
  }
  async blob(id, signal) {
    const r = await json(this.http, this.base + "/git/blobs/" + id, {
      ...this.options(signal),
      maxBytes: Math.ceil(this.limit * 1.5) + 1024
    });
    if (r.encoding !== "base64" || typeof r.content !== "string")
      throw Error("\u041D\u0435\u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043C\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 GitHub");
    const b = Buffer.from(r.content, "base64");
    if (b.length > this.limit) throw Error("\u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D \u0440\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u0430");
    const hash = (0, import_node_crypto2.createHash)("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
    if (hash !== id) throw Error("GitHub blob checksum mismatch");
    if (b.subarray(0, 80).toString().startsWith("version https://git-lfs.github.com/spec"))
      throw Error("Git LFS \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F");
    return b;
  }
  async read(f, signal) {
    signal.throwIfAborted();
    return this.blob(f.id, signal);
  }
  async write() {
    throw Error("GitHub \u0432 \u044D\u0442\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435");
  }
  async delete() {
    throw Error("GitHub \u0432 \u044D\u0442\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435");
  }
};
var YandexStore = class {
  constructor(http, root, token, limit, rules) {
    this.http = http;
    this.token = token;
    this.limit = limit;
    this.rules = rules;
    this.root = "disk:/" + root.replace(/^disk:\//, "").replace(/^\//, "").replace(/\/$/, "");
    path(this.root.slice(6), true);
    this.identity = "yandex:" + this.root;
  }
  identity;
  writable = true;
  trashSupported = true;
  base = "https://cloud-api.yandex.net/v1/disk";
  root;
  url(endpoint, params) {
    return this.base + endpoint + "?" + new URLSearchParams(params);
  }
  options(signal, extra = {}) {
    return {
      ...extra,
      signal,
      headers: { Authorization: "OAuth " + this.token, ...extra.headers }
    };
  }
  full(p) {
    return p ? this.root.replace(/\/$/, "") + "/" + path(p) : this.root;
  }
  async meta(p, signal) {
    return json(
      this.http,
      this.url("/resources", { path: this.full(p), limit: "200" }),
      this.options(signal)
    );
  }
  async folders(relative, signal) {
    const out = [];
    let offset = 0, total;
    do {
      const d = await json(
        this.http,
        this.url("/resources", {
          path: this.full(relative),
          limit: "200",
          offset: String(offset)
        }),
        this.options(signal)
      );
      const e = d._embedded;
      if (d.type !== "dir" || !e || !Array.isArray(e.items) || !Number.isSafeInteger(e.total) || e.offset !== offset || total !== void 0 && e.total !== total)
        throw Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u043F\u043E\u043B\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u043F\u0430\u043F\u043E\u043A \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430");
      total = e.total;
      for (const f of e.items)
        if (f.type === "dir") {
          if (/[\\/]/.test(f.name)) throw Error("\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E\u0435 \u0438\u043C\u044F \u043F\u0430\u043F\u043A\u0438");
          out.push({ id: join(relative, path(f.name)), name: f.name });
        }
      offset += e.items.length;
      if (!e.items.length && offset < total)
        throw Error("\u041D\u0435\u043F\u043E\u043B\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u043F\u0430\u043F\u043E\u043A");
    } while (offset < total);
    return out;
  }
  info(f, p) {
    if (!Number.isSafeInteger(f.size) || typeof f.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(f.sha256))
      throw Error("\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B checksum/\u0440\u0430\u0437\u043C\u0435\u0440: " + p);
    return {
      path: p,
      hash: f.sha256.toLowerCase(),
      size: f.size,
      mtime: Date.parse(f.modified) || void 0,
      version: f.sha256.toLowerCase(),
      id: f.path
    };
  }
  async scan(signal) {
    const files = /* @__PURE__ */ Object.create(null), paths = [];
    let count = 0;
    const walk = async (p, depth) => {
      if (depth > 60 || ++count > 1e5)
        throw Error("\u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D \u043F\u0440\u0435\u0434\u0435\u043B \u043E\u0431\u0445\u043E\u0434\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430");
      let offset = 0, total;
      const names = /* @__PURE__ */ new Set();
      do {
        signal.throwIfAborted();
        const d = await json(
          this.http,
          this.url("/resources", {
            path: this.full(p),
            limit: "200",
            offset: String(offset)
          }),
          this.options(signal)
        );
        const e = d._embedded;
        if (d.type !== "dir" || !e || !Array.isArray(e.items) || !Number.isSafeInteger(e.total) || e.offset !== offset || total !== void 0 && e.total !== total)
          throw Error("\u041D\u0435\u043F\u043E\u043B\u043D\u044B\u0439 \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u0432\u0448\u0438\u0439\u0441\u044F \u0441\u043F\u0438\u0441\u043E\u043A \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430");
        total = e.total;
        for (const f of e.items) {
          if (/[\\/]/.test(f.name))
            throw Error("\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0440\u0430\u0437\u0434\u0435\u043B\u0438\u0442\u0435\u043B\u044C \u0432 \u0438\u043C\u0435\u043D\u0438 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430");
          path(f.name);
          if (names.has(f.name))
            throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 \u0444\u0430\u0439\u043B\u0430 \u043F\u0440\u0438 \u043E\u0431\u0445\u043E\u0434\u0435 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430");
          names.add(f.name);
          const rel = join(p, f.name);
          if (f.type === "dir" ? this.rules && !this.rules.folder(rel) : this.rules && !this.rules.file(rel))
            continue;
          paths.push(rel);
          if (f.type === "dir") await walk(rel, depth + 1);
          else if (f.type === "file") files[rel] = this.info(f, rel);
          else throw Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0442\u0438\u043F \u0444\u0430\u0439\u043B\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430");
        }
        offset += e.items.length;
        if (!e.items.length && offset < total)
          throw Error("\u041F\u0443\u0441\u0442\u0430\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430");
      } while (offset < total);
    };
    await walk("", 0);
    uniquePaths(paths);
    return {
      files,
      identity: this.identity,
      complete: true,
      warnings: [
        "\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A \u043D\u0435 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u0430\u0442\u043E\u043C\u0430\u0440\u043D\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0432\u0435\u0440\u0441\u0438\u0438 \u043F\u0440\u0438 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0438: \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u044F\u0439\u0442\u0435 \u0444\u0430\u0439\u043B\u044B \u0434\u0440\u0443\u0433\u0438\u043C \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C \u0432\u043E \u0432\u0440\u0435\u043C\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438."
      ]
    };
  }
  trusted(href) {
    const u = new URL(href);
    if (u.protocol !== "https:" || u.username || u.password || !["yandex.net", "yandex.ru", "yandex.com"].some(
      (d) => u.hostname === d || u.hostname.endsWith("." + d)
    ))
      throw Error("\u041D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430");
    return href;
  }
  async read(f, signal) {
    if ((await this.meta(f.path, signal)).sha256.toLowerCase() !== f.hash)
      throw Error("\u0424\u0430\u0439\u043B \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F");
    const d = await json(
      this.http,
      this.url("/resources/download", { path: this.full(f.path) }),
      this.options(signal)
    );
    return bytes(this.http, this.trusted(d.href), {
      signal,
      maxBytes: this.limit,
      redirect: "follow"
    });
  }
  async check(p, expected, signal) {
    try {
      const f = await this.meta(p, signal);
      if (!expected || f.sha256?.toLowerCase() !== expected.hash)
        throw Error("\u0424\u0430\u0439\u043B \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F \u0438\u043B\u0438 \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F");
    } catch (e) {
      if (e.status === 404 && !expected) return;
      throw e;
    }
  }
  async mkdirs(p, signal) {
    let at = "";
    for (const x of p.split("/").slice(0, -1)) {
      at = join(at, x);
      const r = await this.http.fetch(
        this.url("/resources", { path: this.full(at) }),
        this.options(signal, { method: "PUT" })
      );
      if (r.status === 409) {
        const f = await this.meta(at, signal);
        if (f.type !== "dir") throw Error("\u0424\u0430\u0439\u043B \u0431\u043B\u043E\u043A\u0438\u0440\u0443\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u043F\u0430\u043F\u043A\u0438");
      } else if (r.status !== 201)
        throw Error("\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u043F\u0430\u043F\u043A\u0438 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430: HTTP " + r.status);
    }
  }
  async write(p, b, expected, _mtime, signal) {
    await this.mkdirs(p, signal);
    await this.check(p, expected, signal);
    const d = await json(
      this.http,
      this.url("/resources/upload", {
        path: this.full(p),
        overwrite: expected ? "true" : "false"
      }),
      this.options(signal)
    );
    const r = await this.http.fetch(this.trusted(d.href), {
      method: "PUT",
      signal,
      body: b
    });
    if (r.status < 200 || r.status >= 300)
      throw Error("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430: HTTP " + r.status);
    const f = this.info(await this.meta(p, signal), p);
    if (f.hash !== sha(b))
      throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0437\u0430\u043F\u0438\u0441\u0438 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0430");
    return f;
  }
  async delete(f, trash, signal) {
    await this.check(f.path, f, signal);
    const r = await this.http.fetch(
      this.url("/resources", {
        path: this.full(f.path),
        permanently: String(!trash)
      }),
      this.options(signal, { method: "DELETE" })
    );
    if (r.status === 202) {
      const d = JSON.parse(await r.text());
      const url = new URL(this.trusted(d.href));
      if (url.origin !== "https://cloud-api.yandex.net")
        throw Error("\u041D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u044B\u0439 \u0430\u0434\u0440\u0435\u0441 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438");
      for (let i = 0; i < 30; i++) {
        signal.throwIfAborted();
        const op = await json(this.http, url.href, this.options(signal));
        if (op.status === "success") return;
        if (op.status === "failed")
          throw Error("\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E");
        await new Promise((r2) => setTimeout(r2, 1e3));
      }
      throw Error("\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u043F\u043E\u0437\u0436\u0435.");
    }
    if (r.status !== 204)
      throw Error("\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430: HTTP " + r.status);
  }
};

// src/core/send-budget.ts
var SendBudgetError = class extends Error {
};
var SendBudget = class {
  count = 0;
  take() {
    if (++this.count > 3)
      throw new SendBudgetError("\u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D \u043B\u0438\u043C\u0438\u0442 \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u0432 \u0437\u0430\u043F\u0440\u043E\u0441\u0430");
  }
};
function sendWithBudget(transport, url, options) {
  if (!transport.accountsSendBudget) options.sendBudget?.take();
  return transport.fetch(url, options);
}

// src/core/sync-issue.ts
var SyncFault = class extends Error {
  constructor(code, message, scope = "file", retryable = false) {
    super(message);
    this.code = code;
    this.scope = scope;
    this.retryable = retryable;
    this.name = "SyncFault";
  }
};

// src/core/net.ts
var NetError = class extends Error {
};

// src/auth/google-auth.ts
var GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive", "openid"];
var TOKEN_URL = "https://oauth2.googleapis.com/token";
function waitForGoogle(pending, signal, discardLate) {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Google request cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => {
      cleanup();
      if (signal.aborted) {
        discardLate?.(value);
        return;
      }
      resolve(value);
    }, (error) => {
      cleanup();
      reject(error);
    });
    if (signal.aborted) abort();
  });
}
async function withGoogleTimeout(signal, timeoutMs, error, run) {
  signal.throwIfAborted();
  const controller = new AbortController(), abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(error), timeoutMs);
  try {
    return await waitForGoogle(Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return run(controller.signal);
    }), controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
function googleNetworkFailure(error, signal) {
  signal?.throwIfAborted();
  if (error instanceof SendBudgetError || error instanceof SyncFault || error instanceof NetError || error?.name === "AbortError") return error;
  const status = error?.status, code = error?.code;
  if (status !== void 0 && Number.isInteger(status) && status >= 400 && status <= 599)
    return Object.assign(new SyncFault(status === 401 ? "auth-required" : "google-api", `Google transport failed: HTTP ${status}`, "source", status === 408 || status === 429 || status >= 500), { status });
  if (code && ["file-too-large", "redirect-policy", "response-format"].includes(code)) return new SyncFault(code, "Google transport rejected the response", "source");
  return new SyncFault("network", "Google connection interrupted; retry required", "source", true);
}
function parseGoogleClient(raw) {
  const value = JSON.parse(raw)?.installed;
  if (!value || typeof value.client_id !== "string" || !value.client_id.endsWith(".apps.googleusercontent.com"))
    throw Error("Import a Google OAuth Desktop app client JSON");
  if (value.client_secret !== void 0 && typeof value.client_secret !== "string") throw Error("Invalid Desktop client configuration");
  return { clientId: value.client_id, clientSecret: value.client_secret };
}
async function googleJson(transport, url, request) {
  request.signal?.throwIfAborted();
  try {
    const response = await waitForGoogle(transport.fetch(url, { ...request, maxBytes: request.maxBytes ?? 1024 * 1024, redirect: "error" }), request.signal, (response2) => response2.discard?.());
    return await googleResponse(response, request.signal);
  } catch (error) {
    throw googleNetworkFailure(error, request.signal);
  }
}
async function googleResponse(response, signal) {
  let raw;
  try {
    raw = await waitForGoogle(response.text(), signal);
  } catch (error) {
    response.discard?.();
    throw googleNetworkFailure(error, signal);
  }
  signal?.throwIfAborted();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = void 0;
  }
  if (response.status < 200 || response.status >= 300) {
    const candidate = typeof data?.error === "string" ? data.error : data?.error?.errors?.[0]?.reason;
    const reason = typeof candidate === "string" && /^[\w.-]{1,80}$/.test(candidate) ? candidate : void 0;
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason ?? "");
    const retry = response.headers["retry-after"];
    const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1e3 : retry ? Math.max(0, Date.parse(retry) - Date.now()) : 0;
    throw Object.assign(new SyncFault(
      reason === "invalid_grant" || response.status === 401 ? "auth-required" : reason ?? "google-api",
      `Google request failed: HTTP ${response.status}${reason ? ` (${reason})` : ""}`,
      "source",
      retryable
    ), { status: response.status, retryAt: retryable && Number.isFinite(delay) && delay > 0 ? Date.now() + delay : void 0 });
  }
  if (!data || typeof data !== "object") throw new SyncFault("response-format", "Invalid Google response", "source");
  return data;
}
function tokenRequest(client, fields2, signal) {
  return {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.clientId, ...client.clientSecret ? { client_secret: client.clientSecret } : {}, ...fields2 }).toString()
  };
}
function validateToken(data) {
  if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0)
    throw new SyncFault("response-format", "Invalid Google token response", "source");
}
async function exchangeGoogleCode(transport, client, code, verifier, redirectUri, signal) {
  const data = await googleJson(transport, TOKEN_URL, tokenRequest(client, {
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  }, signal));
  validateToken(data);
  const scopes = new Set(String(data.scope ?? "").split(" "));
  if (!GOOGLE_SCOPES.every((scope) => scopes.has(scope)) || typeof data.refresh_token !== "string" || !data.refresh_token)
    throw new SyncFault("auth-required", "Google did not grant offline read/write Drive access", "source");
  const user = await googleJson(
    transport,
    "https://openidconnect.googleapis.com/v1/userinfo",
    { signal, headers: { Authorization: `Bearer ${data.access_token}` } }
  );
  if (typeof user.sub !== "string" || !user.sub) throw new SyncFault("response-format", "Google account identity is missing", "source");
  signal.throwIfAborted();
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, subject: user.sub };
}
var GoogleTokenManager = class {
  constructor(client, secretRef, secrets, transport, now = Date.now, expectedSubject, refreshTimeoutMs = 6e4) {
    this.client = client;
    this.secretRef = secretRef;
    this.secrets = secrets;
    this.transport = transport;
    this.now = now;
    this.expectedSubject = expectedSubject;
    this.refreshTimeoutMs = refreshTimeoutMs;
  }
  token;
  expiresAt = 0;
  pending;
  controller = new AbortController();
  epoch = 0;
  disconnected = false;
  get generation() {
    return this.epoch;
  }
  setAccess(token, expiresIn) {
    this.token = token;
    this.expiresAt = this.now() + expiresIn * 1e3;
  }
  invalidateAccess(token) {
    if (this.token === token) this.expiresAt = 0;
  }
  disconnect() {
    this.disconnected = true;
    this.epoch++;
    this.controller.abort();
    this.token = void 0;
    this.expiresAt = 0;
  }
  async getToken(force = false, signal) {
    signal?.throwIfAborted();
    if (this.disconnected) throw new SyncFault("auth-required", "Google account disconnected", "source");
    if (!force && this.token && this.now() < this.expiresAt - 6e4) return this.token;
    if (!this.pending) {
      const epoch = this.epoch;
      const run = this.refresh(epoch);
      this.pending = run;
      void run.finally(() => {
        if (this.pending === run) this.pending = void 0;
      }).catch(() => {
      });
    }
    const token = await waitForToken(this.pending, signal);
    signal?.throwIfAborted();
    if (this.disconnected) throw new SyncFault("auth-required", "Google account disconnected", "source");
    return token;
  }
  async refresh(epoch) {
    return withGoogleTimeout(this.controller.signal, this.refreshTimeoutMs, new SyncFault("network", "Google token refresh timed out; retry required", "source", true), (signal) => this.refreshRequest(epoch, signal));
  }
  async refreshRequest(epoch, signal) {
    const refresh = this.secrets.getSecret(this.secretRef);
    if (!refresh) throw new SyncFault("auth-required", "Connect your Google account", "source");
    const data = await googleJson(this.transport, TOKEN_URL, tokenRequest(
      this.client,
      { refresh_token: refresh, grant_type: "refresh_token" },
      signal
    ));
    validateToken(data);
    if (data.scope !== void 0 && !GOOGLE_SCOPES.every((scope) => String(data.scope).split(" ").includes(scope)))
      throw new SyncFault("auth-required", "Reconnect Google with read/write Drive access", "source");
    if (this.expectedSubject) {
      const user = await googleJson(
        this.transport,
        "https://openidconnect.googleapis.com/v1/userinfo",
        { signal, headers: { Authorization: `Bearer ${data.access_token}` } }
      );
      if (user.sub !== this.expectedSubject) throw new SyncFault("auth-required", "Google account identity changed; reconnect", "source");
    }
    signal.throwIfAborted();
    if (epoch !== this.epoch || this.disconnected) throw new SyncFault("auth-required", "Google account disconnected", "source");
    if (data.refresh_token !== void 0) {
      if (typeof data.refresh_token !== "string" || !data.refresh_token) throw new SyncFault("response-format", "Invalid refresh token", "source");
      this.secrets.setSecret(this.secretRef, data.refresh_token);
    }
    this.setAccess(data.access_token, data.expires_in);
    return data.access_token;
  }
};
function waitForToken(pending, signal) {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => {
      cleanup();
      resolve(value);
    }, (error) => {
      cleanup();
      reject(error);
    });
    if (signal.aborted) abort();
  });
}
var GoogleAuthorizedTransport = class {
  constructor(transport, tokens) {
    this.transport = transport;
    this.tokens = tokens;
  }
  accountsSendBudget = true;
  async fetch(url, options) {
    const parsed = new URL(url);
    if (parsed.origin !== "https://www.googleapis.com" || parsed.username || parsed.password || !/^\/(?:upload\/)?drive\/v3\//.test(parsed.pathname)) throw new SyncFault("redirect-policy", "Untrusted Google API endpoint", "source");
    const generation = this.tokens.generation;
    options = { ...options, sendBudget: options.sendBudget ?? new SendBudget() };
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.tokens.getToken(false, options.signal);
      let response;
      try {
        response = await waitForGoogle(sendWithBudget(this.transport, url, {
          ...options,
          redirect: "error",
          headers: { ...options.headers, Authorization: `Bearer ${token}` }
        }), options.signal, (response2) => response2.discard?.());
      } catch (error) {
        if (generation !== this.tokens.generation) throw new SyncFault("auth-required", "Google account disconnected", "source");
        options.signal?.throwIfAborted();
        if (error?.status === 401 && attempt === 0) {
          this.tokens.invalidateAccess(token);
          continue;
        }
        throw googleNetworkFailure(error, options.signal);
      }
      if (generation !== this.tokens.generation) {
        response.discard?.();
        throw new SyncFault("auth-required", "Google account disconnected", "source");
      }
      if (options.signal?.aborted) {
        response.discard?.();
        options.signal.throwIfAborted();
      }
      if (response.status !== 401 || attempt === 1) {
        const read = async (body) => {
          try {
            const result = await waitForGoogle(body(), options.signal);
            options.signal?.throwIfAborted();
            if (generation !== this.tokens.generation) throw new SyncFault("auth-required", "Google account disconnected", "source");
            return result;
          } catch (error) {
            throw googleNetworkFailure(error, options.signal);
          }
        };
        return { ...response, text: () => read(() => response.text()), arrayBuffer: () => read(() => response.arrayBuffer()), discard: () => response.discard?.() };
      }
      this.tokens.invalidateAccess(token);
      response.discard?.();
    }
    throw new SyncFault("auth-required", "Reconnect Google account", "source");
  }
};

// src/adapters/google-desktop-oauth.ts
var base64url = (bytes2) => btoa(String.fromCharCode(...bytes2)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function authorizeGoogleDesktop(client, transport, signal, openBrowser, options = 3e5) {
  const config = typeof options === "number" ? { timeoutMs: options } : options;
  return withGoogleTimeout(
    signal,
    config.timeoutMs ?? 3e5,
    new SyncFault("oauth-timeout", "Google sign-in did not return to Obsidian within five minutes; check the browser and retry", "source"),
    (attemptSignal) => authorizeAttempt(client, transport, attemptSignal, openBrowser, config)
  );
}
async function authorizeAttempt(client, transport, signal, openBrowser, options) {
  signal.throwIfAborted();
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  signal.throwIfAborted();
  const http = require("node:http");
  let redirectUri = "";
  const code = await new Promise((resolve, reject) => {
    let consumed = false, finished = false;
    const server = http.createServer((request, response) => {
      let url;
      try {
        url = new URL(request.url ?? "/", redirectUri);
      } catch {
        response.writeHead(400);
        response.end("Invalid callback URL");
        return;
      }
      if (request.method !== "GET" || url.origin !== new URL(redirectUri).origin || url.pathname !== "/" || request.headers.host !== new URL(redirectUri).host || url.searchParams.get("state") !== state || consumed) {
        response.writeHead(400);
        response.end("Invalid authorization response");
        return;
      }
      const code2 = url.searchParams.get("code"), error = url.searchParams.get("error");
      if (!code2 && !error) {
        response.writeHead(400);
        response.end("Missing authorization response");
        return;
      }
      consumed = true;
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'",
        "Referrer-Policy": "no-referrer",
        Connection: "close"
      });
      response.once("finish", () => server.closeAllConnections());
      response.end("Google returned the authorization response. Return to Obsidian to check that sign-in completed.");
      finish(error ? new SyncFault("auth-denied", "Google authorization was denied", "source") : void 0, code2 ?? void 0);
    });
    const abort = () => finish(signal.reason instanceof Error ? signal.reason : new DOMException("Google authorization cancelled", "AbortError"));
    function finish(error, value) {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      server.close();
      if (error) server.closeAllConnections();
      else server.closeIdleConnections();
      if (error) reject(error);
      else resolve(value);
    }
    signal.addEventListener("abort", abort, { once: true });
    server.once("error", (error) => finish(error));
    server.listen(0, "127.0.0.1", () => {
      if (finished || signal.aborted) {
        server.close();
        server.closeAllConnections();
        abort();
        return;
      }
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(new Error("OAuth callback unavailable"));
        return;
      }
      redirectUri = `http://127.0.0.1:${address.port}/`;
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      for (const [key, value] of Object.entries({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_SCOPES.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent select_account"
      })) url.searchParams.set(key, value);
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        options.observe?.({ stage: "waiting-browser", authorizationUrl: url.href });
        return openBrowser(url.href);
      }).catch(() => finish(signal.aborted ? signal.reason : new SyncFault("oauth-browser", "Could not open the system browser; retry Google sign-in", "source")));
    });
    if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  options.observe?.({ stage: "exchanging-code" });
  return withGoogleTimeout(
    signal,
    options.exchangeTimeoutMs ?? 6e4,
    new SyncFault("network", "Google token exchange timed out; check connectivity and retry sign-in", "source", true),
    (exchangeSignal) => exchangeGoogleCode(transport, client, code, verifier, redirectUri, exchangeSignal)
  );
}

// src/ui.ts
var import_obsidian = require("obsidian");
var VIEW_TYPE = "sync-studio-workspace";
var providers = {
  gdrive: "Google Drive \xB7 OAuth",
  "gdrive-public": "Google Drive \xB7 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F \u043F\u0430\u043F\u043A\u0430",
  yandex: "\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A",
  github: "GitHub"
};
function rootLabel(c) {
  return c?.provider === "yandex" ? "\u041F\u0430\u043F\u043A\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430" : c?.provider === "github" ? "\u0420\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439 owner/repo" : "\u0421\u0441\u044B\u043B\u043A\u0430 \u0438\u043B\u0438 ID \u043F\u0430\u043F\u043A\u0438 Google Drive";
}
var directions = {
  pull: "\u041F\u043E\u043B\u0443\u0447\u0430\u0442\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F",
  push: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F",
  both: "\u0412 \u043E\u0431\u0435 \u0441\u0442\u043E\u0440\u043E\u043D\u044B"
};
var policies = {
  both: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0431\u0435 \u0432\u0435\u0440\u0441\u0438\u0438",
  local: "\u0412\u044B\u0438\u0433\u0440\u044B\u0432\u0430\u0435\u0442 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439",
  remote: "\u0412\u044B\u0438\u0433\u0440\u044B\u0432\u0430\u0435\u0442 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439",
  newest: "\u0412\u044B\u0438\u0433\u0440\u044B\u0432\u0430\u0435\u0442 \u043D\u0435\u0434\u0430\u0432\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0439",
  ask: "\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u044C"
};
var categories = {
  notes: "\u0417\u0430\u043C\u0435\u0442\u043A\u0438",
  attachments: "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u044F",
  settings: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 Obsidian",
  "plugin-settings": "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432",
  "plugin-code": "\u041A\u043E\u0434 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432 \u2014 \u043F\u043E\u043A\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043B\u0430\u043D",
  themes: "\u0422\u0435\u043C\u044B \u0438 CSS"
};
var actionLabels = {
  download: "\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C",
  upload: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C",
  "delete-local": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E",
  "delete-remote": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E",
  "keep-both": "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0431\u0435 \u0432\u0435\u0440\u0441\u0438\u0438",
  adopt: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
  skip: "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439",
  conflict: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442 \u0440\u0435\u0448\u0435\u043D\u0438\u044F"
};
function el(at, tag, text2 = "", cls = "") {
  return at.createEl(tag, { text: text2, cls });
}
function button(at, text2, fn, primary = false) {
  const b = el(at, "button", text2, primary ? "mod-cta" : "");
  b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    b.setAttribute("aria-busy", "true");
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      new import_obsidian.Notice(message, 15e3);
      const target = b.closest(".modal-content") || b.closest(".sync-studio") || at;
      let error = target.querySelector(".ss-action-error");
      if (!error)
        error = el(target, "p", "", "ss-banner ss-action-error");
      error.setAttribute("role", "alert");
      error.textContent = message;
    } finally {
      b.disabled = false;
      b.removeAttribute("aria-busy");
    }
  };
  return b;
}
function title(at, text2, sub = "") {
  el(at, "h2", text2);
  if (sub) el(at, "p", sub, "ss-muted");
}
function row(at, text2, description = "") {
  const r = el(at, "div", "", "ss-row"), left = el(r, "div");
  el(left, "strong", text2);
  if (description) el(left, "small", description, "ss-muted");
  return r;
}
function text(at, label, value, fn, type = "text") {
  const wrap = el(at, "label", "", "ss-field");
  el(wrap, "span", label);
  const i = el(wrap, "input");
  i.type = type;
  i.value = value;
  i.oninput = () => fn(i.value);
  return i;
}
function select(at, label, value, options, fn) {
  const wrap = el(at, "label", "", "ss-field");
  el(wrap, "span", label);
  const s = el(wrap, "select");
  for (const [k, v] of Object.entries(options)) {
    const o = el(s, "option", v);
    o.value = k;
  }
  s.value = value;
  s.onchange = () => fn(s.value);
  return s;
}
function check(at, label, value, fn, sub = "") {
  const wrap = el(at, "label", "", "ss-check");
  const i = el(wrap, "input");
  i.type = "checkbox";
  i.checked = value;
  i.onchange = () => fn(i.checked);
  const body = el(wrap, "span", label);
  if (sub) el(body, "small", sub, "ss-muted");
  return i;
}
function card(at) {
  return el(at, "section", "", "ss-card");
}
function badge(at, text2) {
  return el(at, "span", text2, "ss-badge");
}
function grid(at) {
  return el(at, "div", "", "ss-grid");
}
function banner(at, text2) {
  return el(at, "p", text2, "ss-banner");
}
var Dialog = class extends import_obsidian.Modal {
  constructor(app, draw) {
    super(app);
    this.draw = draw;
  }
  onOpen() {
    this.contentEl.addClass("sync-studio");
    this.draw(this.contentEl, this);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var StudioView = class extends import_obsidian.ItemView {
  constructor(leaf, studio) {
    super(leaf);
    this.studio = studio;
  }
  page = "profiles";
  active = "";
  tab = "scope";
  importDraft;
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Sync Studio";
  }
  getIcon() {
    return "refresh-cw";
  }
  async onOpen() {
    this.render();
  }
  selected() {
    return this.studio.data.profiles.find((p) => p.id === this.active) || this.studio.data.profiles[0];
  }
  async save() {
    await this.studio.save();
    this.render();
  }
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("sync-studio");
    const header = el(root, "header", "", "ss-header");
    const b = el(header, "div");
    el(b, "small", "OBSIDIAN / SYNC STUDIO", "ss-kicker");
    el(b, "h1", "\u0412\u0430\u0448\u0438 \u0444\u0430\u0439\u043B\u044B. \u0412\u0430\u0448\u0438 \u043F\u0440\u0430\u0432\u0438\u043B\u0430.");
    const actions = el(header, "div", "", "ss-actions");
    badge(actions, this.studio.manifest.version + " \xB7 Desktop alpha");
    if (this.studio.busy)
      button(actions, "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C", () => this.studio.controller?.abort());
    else badge(actions, this.studio.phase);
    const nav = el(root, "nav", "", "ss-topnav");
    for (const [key, value] of Object.entries({
      profiles: "01 / \u041F\u0440\u043E\u0444\u0438\u043B\u0438",
      connections: "02 / \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
      operations: "03 / \u0426\u0435\u043D\u0442\u0440 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439",
      import: "04 / \u0418\u043C\u043F\u043E\u0440\u0442"
    })) {
      const b2 = button(nav, value, () => {
        this.page = key;
        this.render();
      });
      b2.toggleClass("is-active", this.page === key);
    }
    if (this.studio.busy)
      banner(root, this.studio.phase + "\u2026 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u044B.");
    if (this.studio.lastError) {
      const e = banner(root, this.studio.lastError);
      e.setAttribute("role", "alert");
      const collision = this.studio.collision;
      if (collision)
        button(e, "\u0418\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u0443\u044E\u0449\u0438\u0435 \u043F\u0443\u0442\u0438 \u0438\u0437 \u043F\u0440\u043E\u0444\u0438\u043B\u044F", async () => {
          const p = this.studio.data.profiles.find(
            (p2) => p2.id === collision.profileId
          );
          if (!p) throw Error("\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0443\u0434\u0430\u043B\u0451\u043D");
          p.excludePaths = [
            .../* @__PURE__ */ new Set([...p.excludePaths, ...collision.paths])
          ];
          this.studio.collision = void 0;
          this.studio.lastError = "";
          await this.studio.save();
          this.active = p.id;
          this.page = "profiles";
          this.tab = "scope";
          this.render();
          new import_obsidian.Notice(
            "\u041F\u0443\u0442\u0438 \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u044B. \u0418\u0445 \u0444\u0430\u0439\u043B\u044B \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043D\u0435\u0442\u0440\u043E\u043D\u0443\u0442\u044B\u043C\u0438. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439."
          );
        }).disabled = this.studio.busy;
      button(e, "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0443", async () => {
        await navigator.clipboard.writeText(
          JSON.stringify(
            {
              version: this.studio.manifest.version,
              phase: this.studio.phase,
              error: this.studio.lastError,
              collision: this.studio.collision?.paths,
              recent: this.studio.data.history.slice(0, 5).map((r) => ({
                at: r.at,
                status: r.status,
                applied: r.applied,
                message: r.message
              }))
            },
            null,
            2
          )
        );
        new import_obsidian.Notice("\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430 \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0430. \u0422\u043E\u043A\u0435\u043D\u044B \u0438 \u043A\u043B\u044E\u0447\u0438 \u043D\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B.");
      });
      button(e, "\u0421\u043A\u0440\u044B\u0442\u044C", () => {
        this.studio.lastError = "";
        this.render();
      });
    }
    const content = el(root, "div");
    if (this.page === "profiles") this.profilePage(content);
    else if (this.page === "connections") this.connectionPage(content);
    else if (this.page === "operations") this.operations(content);
    else this.importPage(content);
  }
  profilePage(at) {
    const layout = el(at, "div", "", "ss-layout"), side = el(layout, "aside"), main = el(layout, "main");
    el(side, "small", "\u041F\u0420\u041E\u0424\u0418\u041B\u0418", "ss-kicker");
    for (const p2 of this.studio.data.profiles) {
      const b = button(side, p2.name, () => {
        this.active = p2.id;
        this.render();
      });
      b.toggleClass("is-active", this.selected()?.id === p2.id);
      el(
        b,
        "small",
        (this.studio.data.connections.find((c) => c.id === p2.connectionId)?.name || "\u041D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D") + " \xB7 " + (p2.enabled ? "\u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" : "\u0432\u0440\u0443\u0447\u043D\u0443\u044E")
      );
    }
    button(side, "\uFF0B \u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C", async () => {
      const c = this.studio.data.connections[0];
      if (!c) {
        this.connections();
        return;
      }
      const p2 = await this.studio.createProfile(c);
      this.active = p2.id;
      this.tab = "route";
      await this.save();
    }).disabled = this.studio.busy;
    el(side, "hr");
    button(side, "\u25CE \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F", () => this.connections());
    button(side, "\u25A7 \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438", () => this.capabilities());
    const p = this.selected();
    if (!p) {
      title(
        main,
        "\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u0441 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
        "\u041F\u0440\u043E\u0444\u0438\u043B\u0438 \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u0442\u0430\u0440\u043E\u0433\u043E \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u043D\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u044E\u0442\u0441\u044F."
      );
      button(main, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A", () => this.connections(), true);
      banner(
        main,
        "\u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C. \u041F\u0435\u0440\u0432\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u0432\u0441\u0435\u0433\u0434\u0430 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0441 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u043F\u043B\u0430\u043D\u0430."
      );
      return;
    }
    const head = el(main, "div", "", "ss-between");
    const h = el(head, "div");
    title(
      h,
      p.name,
      `${directions[p.direction]} \xB7 ${p.localRoot || "\u041A\u043E\u0440\u0435\u043D\u044C vault"}`
    );
    const actions = el(head, "div", "", "ss-actions");
    button(actions, "\u0414\u0443\u0431\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C", async () => {
      const next = structuredClone(p);
      next.id = crypto.randomUUID();
      next.name += " \u2014 \u043A\u043E\u043F\u0438\u044F";
      next.enabled = false;
      this.studio.data.profiles.push(next);
      this.active = next.id;
      await this.save();
    }).disabled = this.studio.busy;
    button(
      actions,
      "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
      async () => this.preview(await this.studio.inspect(p)),
      true
    ).disabled = this.studio.busy;
    const nav = el(main, "nav", "", "ss-tabs");
    for (const [key, value] of Object.entries({
      scope: "\u0427\u0442\u043E \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C",
      route: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
      behavior: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
      schedule: "\u0410\u0432\u0442\u043E\u0437\u0430\u043F\u0443\u0441\u043A",
      history: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F"
    })) {
      const b = button(nav, value, () => {
        this.tab = key;
        this.render();
      });
      b.toggleClass("is-active", this.tab === key);
    }
    const body = el(main, "fieldset");
    body.disabled = this.studio.busy;
    if (this.tab === "scope") this.scopePanel(body, p);
    else if (this.tab === "route") this.route(body, p);
    else if (this.tab === "behavior") this.behavior(body, p);
    else if (this.tab === "schedule") this.schedule(body, p);
    else this.history(body, p.id);
    const footer = el(main, "footer", "", "ss-between");
    el(
      footer,
      "small",
      "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438. \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043F\u0430\u043F\u043A\u0443 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0434 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u043C.",
      "ss-muted"
    );
    button(
      footer,
      "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
      () => new Dialog(this.app, (at2, m) => {
        title(at2, "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C?", p.name);
        banner(
          at2,
          "\u0424\u0430\u0439\u043B\u044B \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043D\u0430 \u043C\u0435\u0441\u0442\u0435. \u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044F \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u0431\u0443\u0434\u0435\u0442 \u0443\u0434\u0430\u043B\u0435\u043D\u0430."
        );
        button(at2, "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C", async () => {
          if (this.studio.state.pending[p.id])
            throw Error(
              "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0435\u0437\u0430\u043A\u043E\u043D\u0447\u0435\u043D\u043D\u043E\u0439 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438"
            );
          this.studio.data.profiles = this.studio.data.profiles.filter(
            (x) => x.id !== p.id
          );
          delete this.studio.state.baselines[p.id];
          await this.studio.saveState();
          await this.save();
          m.close();
        });
      }).open()
    ).disabled = this.studio.busy;
  }
  patch(p, key, value) {
    p[key] = value;
    void this.studio.save().catch((e) => this.studio.reportError(e));
    if (["scope", "connectionId", "sourceConnectionId", "direction"].includes(key))
      this.render();
  }
  scopePanel(at, p) {
    title(
      at,
      "\u0427\u0442\u043E \u0432\u0445\u043E\u0434\u0438\u0442 \u0432 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044E",
      "\u041F\u0430\u043F\u043A\u0438 \u0438 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u043F\u0435\u0440\u0435\u0441\u0435\u043A\u0430\u044E\u0442\u0441\u044F; \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0432\u0441\u0435\u0433\u0434\u0430 \u0438\u043C\u0435\u044E\u0442 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442."
    );
    select(
      at,
      "\u041E\u0431\u043B\u0430\u0441\u0442\u044C",
      p.scope,
      {
        all: "\u0412\u0435\u0441\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043A\u043E\u0440\u0435\u043D\u044C",
        folders: "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u043F\u0430\u043F\u043A\u0438",
        categories: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u0444\u0430\u0439\u043B\u043E\u0432"
      },
      (v) => this.patch(p, "scope", v)
    );
    const g = grid(at), folders = card(g), cats = card(g);
    el(folders, "h3", "\u041F\u0430\u043F\u043A\u0438 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430");
    el(
      folders,
      "p",
      p.scope === "folders" ? "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0430\u043F\u043A\u0438 \u0438\u043B\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0442\u043E\u0447\u043D\u044B\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0443\u0442\u0438." : "\u0412\u0441\u0435 \u043F\u0430\u043F\u043A\u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u043A\u043E\u0440\u043D\u044F \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B.",
      "ss-muted"
    );
    if (p.scope === "folders") {
      text(
        folders,
        "\u041F\u0430\u043F\u043A\u0438 \u0447\u0435\u0440\u0435\u0437 ;",
        p.folders.join("; "),
        (v) => this.patch(
          p,
          "folders",
          v.split(";").map((s) => s.trim()).filter(Boolean)
        )
      );
      button(folders, "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432 \u0434\u0435\u0440\u0435\u0432\u0435", () => this.folderScope(p));
    } else
      button(folders, "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0434\u0435\u0440\u0435\u0432\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430", () => this.folderScope(p));
    el(cats, "h3", "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E");
    for (const [key, label] of Object.entries(categories))
      check(
        cats,
        label,
        p.categories.includes(key),
        (v) => this.patch(
          p,
          "categories",
          v ? [...p.categories, key] : p.categories.filter((x) => x !== key)
        )
      );
    const exclusions = card(at);
    el(exclusions, "h3", "\u0418\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F");
    check(
      exclusions,
      "\u041D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C data.json \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432",
      p.excludeData,
      (v) => this.patch(p, "excludeData", v)
    );
    check(
      exclusions,
      "\u041D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043E\u043A\u043E\u043D",
      p.excludeWorkspace,
      (v) => this.patch(p, "excludeWorkspace", v)
    );
    text(
      exclusions,
      "\u0418\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043F\u0443\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 ;",
      p.excludePaths.join("; "),
      (v) => this.patch(
        p,
        "excludePaths",
        v.split(";").map((s) => s.trim()).filter(Boolean)
      )
    );
    text(
      exclusions,
      "\u041C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u0430, \u041C\u0411",
      String(p.maxMB),
      (v) => this.patch(p, "maxMB", Number(v)),
      "number"
    );
    banner(
      at,
      "\u0412\u0441\u0435\u0433\u0434\u0430 \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u044B: .git, .trash, .sync-studio, .sync-conflicts \u0438 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0430\u044F \u043F\u0430\u043F\u043A\u0430 \u043F\u043B\u0430\u0433\u0438\u043D\u0430. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0441\u0442\u0430\u0432\u0430 \u043D\u0435 \u0443\u0434\u0430\u043B\u044F\u0435\u0442 \u0444\u0430\u0439\u043B\u044B."
    );
  }
  route(at, p) {
    title(
      at,
      "\u041E\u0442\u043A\u0443\u0434\u0430 \u0438 \u043A\u0443\u0434\u0430",
      "\u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0430\u044F \u043F\u0430\u043F\u043A\u0430 \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0444\u0430\u0439\u043B\u044B, \u0441\u043E\u0437\u0434\u0430\u043D\u043D\u044B\u0435 \u043B\u044E\u0431\u044B\u043C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u043C."
    );
    if (p.sourceKind) {
      const source = card(at);
      const connection = this.studio.data.connections.find(
        (c2) => c2.id === p.sourceConnectionId
      );
      el(source, "h3", "\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A");
      if (p.sourceKind === "connection")
        select(
          source,
          "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430",
          p.sourceConnectionId || "",
          Object.fromEntries(
            this.studio.data.connections.map((c2) => [c2.id, c2.name])
          ),
          (v) => {
            const c2 = this.studio.data.connections.find((c3) => c3.id === v);
            p.sourceRoot = c2?.root || "";
            this.patch(p, "sourceConnectionId", v);
          }
        );
      text(
        source,
        p.sourceKind === "folder" ? "\u0410\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043F\u0430\u043F\u043A\u0438" : rootLabel(connection),
        p.sourceRoot || "",
        (v) => this.patch(p, "sourceRoot", v)
      );
      if (p.sourceKind === "connection" && connection) {
        if (connection.provider === "github") {
          text(
            source,
            "\u0412\u0435\u0442\u043A\u0430 GitHub (\u043F\u0443\u0441\u0442\u043E = \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E)",
            p.sourceBranch || "",
            (v) => this.patch(p, "sourceBranch", v)
          );
          text(
            source,
            "\u041F\u043E\u0434\u043A\u0430\u0442\u0430\u043B\u043E\u0433 GitHub",
            p.sourceSubpath || "",
            (v) => this.patch(p, "sourceSubpath", v)
          );
        } else
          button(
            source,
            "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430",
            () => this.pickFolder(connection, p.sourceRoot || "", async (root) => {
              this.patch(p, "sourceRoot", root);
              this.render();
            })
          );
      }
    }
    text(at, "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044F", p.name, (v) => this.patch(p, "name", v));
    const g = grid(at), remote = card(g), local = card(g);
    el(remote, "h3", "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u0430\u044F \u0441\u0442\u043E\u0440\u043E\u043D\u0430");
    select(
      remote,
      "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
      p.connectionId,
      Object.fromEntries([
        ["", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435"],
        ...this.studio.data.connections.map((c2) => [c2.id, c2.name])
      ]),
      (v) => {
        const connection = this.studio.data.connections.find((c2) => c2.id === v);
        p.remoteRoot = connection?.root || (connection?.provider === "gdrive" ? "root" : connection?.provider === "yandex" ? "disk:/" : "");
        if (connection?.provider === "github" || connection?.provider === "gdrive-public")
          p.direction = "pull";
        this.patch(p, "connectionId", v);
      }
    );
    const c = this.studio.data.connections.find((c2) => c2.id === p.connectionId);
    text(
      remote,
      c?.provider === "github" ? "\u0420\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439 owner/repo" : c?.provider === "yandex" ? "\u041F\u0443\u0442\u044C \u043D\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0435" : "\u0421\u0441\u044B\u043B\u043A\u0430 \u0438\u043B\u0438 ID \u043F\u0430\u043F\u043A\u0438 Drive",
      p.remoteRoot,
      (v) => this.patch(p, "remoteRoot", v)
    );
    if (c) {
      button(remote, "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435", () => this.editConnection(c));
      if (c.provider !== "github")
        button(
          remote,
          "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443",
          () => this.pickFolder(c, p.remoteRoot, async (root) => {
            this.patch(p, "remoteRoot", root);
            this.render();
          })
        );
      button(remote, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u043F\u0430\u043F\u043A\u0435", async () => {
        const result = await this.studio.exclusive(
          "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430",
          (signal) => this.studio.checkRoot(p, signal)
        );
        new Dialog(
          this.app,
          (at2) => title(at2, "\u0414\u043E\u0441\u0442\u0443\u043F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D", result)
        ).open();
      });
    }
    if (c?.provider === "github") {
      text(
        remote,
        "\u0412\u0435\u0442\u043A\u0430 / \u0442\u0435\u0433 (\u043F\u0443\u0441\u0442\u043E = \u0432\u0435\u0442\u043A\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E)",
        p.branch,
        (v) => this.patch(p, "branch", v)
      );
      text(
        remote,
        "\u041F\u043E\u0434\u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u044F",
        p.subpath,
        (v) => this.patch(p, "subpath", v)
      );
    }
    el(
      local,
      "h3",
      p.sourceKind ? "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0437\u0430\u0449\u0438\u0449\u0451\u043D \u043E\u0442 \u0437\u0430\u043F\u0438\u0441\u0438" : "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0442\u043E\u0440\u043E\u043D\u0430"
    );
    if (!p.sourceKind)
      text(
        local,
        "\u041F\u0430\u043F\u043A\u0430 \u0432\u043D\u0443\u0442\u0440\u0438 vault (\u043F\u0443\u0441\u0442\u043E = \u043A\u043E\u0440\u0435\u043D\u044C)",
        p.localRoot,
        (v) => this.patch(p, "localRoot", v)
      );
    select(
      local,
      "\u041D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435",
      p.direction,
      p.sourceKind ? { push: "\u0418\u043C\u043F\u043E\u0440\u0442 \u0432 \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435" } : c?.provider === "github" || c?.provider === "gdrive-public" ? { pull: directions.pull } : directions,
      (v) => this.patch(p, "direction", v)
    );
    banner(
      at,
      "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u0432 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A. \u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u044F\u0435\u0442 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B. \u0417\u0435\u0440\u043A\u0430\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0445 \u0444\u0430\u0439\u043B\u043E\u0432 \u0432 \u044D\u0442\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442."
    );
  }
  behavior(at, p) {
    title(
      at,
      "\u0427\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C \u0441 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F\u043C\u0438",
      "\u041F\u043E\u043B\u0438\u0442\u0438\u043A\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u043F\u043E\u043B\u0438\u0442\u0438\u043A\u043E\u0439 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u043E\u0432."
    );
    select(
      at,
      "\u0415\u0441\u043B\u0438 \u0432\u0435\u0440\u0441\u0438\u0438 \u0440\u0430\u0437\u043B\u0438\u0447\u0430\u044E\u0442\u0441\u044F",
      p.conflict,
      policies,
      (v) => this.patch(p, "conflict", v)
    );
    select(
      at,
      "\u041A\u043E\u0433\u0434\u0430 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0442\u044C \u043F\u043E\u043B\u0438\u0442\u0438\u043A\u0443",
      p.conflictWhen,
      {
        "both-changed": "\u041E\u0431\u0435 \u0441\u0442\u043E\u0440\u043E\u043D\u044B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C / \u043F\u0435\u0440\u0432\u0438\u0447\u043D\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
        "any-difference": "\u041B\u044E\u0431\u043E\u0435 \u0440\u0430\u0437\u043B\u0438\u0447\u0438\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E"
      },
      (v) => this.patch(p, "conflictWhen", v)
    );
    select(
      at,
      "\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u044F \u0432 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0435",
      p.deletion,
      {
        ignore: "\u041D\u0435 \u0440\u0430\u0441\u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u044F\u0442\u044C",
        trash: "\u041F\u0435\u0440\u0435\u043C\u0435\u0449\u0430\u0442\u044C \u0432 \u043A\u043E\u0440\u0437\u0438\u043D\u0443",
        permanent: "\u0423\u0434\u0430\u043B\u044F\u0442\u044C \u043E\u043A\u043E\u043D\u0447\u0430\u0442\u0435\u043B\u044C\u043D\u043E"
      },
      (v) => this.patch(p, "deletion", v)
    );
    select(
      at,
      "\u0424\u0430\u0439\u043B \u0443\u0434\u0430\u043B\u0451\u043D \u0441 \u043E\u0434\u043D\u043E\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u044B, \u0438\u0437\u043C\u0435\u043D\u0451\u043D \u0441 \u0434\u0440\u0443\u0433\u043E\u0439",
      p.deleteConflict,
      {
        ask: "\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u044C",
        keep: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0439 \u0444\u0430\u0439\u043B",
        delete: "\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435"
      },
      (v) => this.patch(p, "deleteConflict", v)
    );
    banner(
      at,
      "\xAB\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0431\u0430\xBB: \u043F\u0440\u043E\u0438\u0433\u0440\u044B\u0432\u0430\u044E\u0449\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u0432 .sync-conflicts/<\u0437\u0430\u043F\u0443\u0441\u043A>/<\u043F\u0443\u0442\u044C>. \u041F\u0440\u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438 \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F; \u043F\u0440\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u2014 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F."
    );
    if (p.deletion === "permanent")
      banner(
        at,
        "\u041E\u043A\u043E\u043D\u0447\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043D\u0435\u043E\u0431\u0440\u0430\u0442\u0438\u043C\u043E \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043F\u043B\u0430\u0433\u0438\u043D\u0430. \u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u043B\u0430\u043D \u043F\u0435\u0440\u0435\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435\u043C."
      );
  }
  schedule(at, p) {
    title(
      at,
      "\u041A\u043E\u0433\u0434\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C",
      "\u041F\u043E\u043A\u0430 Obsidian \u043E\u0442\u043A\u0440\u044B\u0442. \u041D\u0430 \u0437\u0430\u043A\u0440\u044B\u0442\u043E\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442."
    );
    check(
      at,
      "\u0410\u0432\u0442\u043E\u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430",
      p.enabled,
      (v) => this.patch(p, "enabled", v)
    );
    text(
      at,
      "\u0418\u043D\u0442\u0435\u0440\u0432\u0430\u043B, \u043C\u0438\u043D\u0443\u0442",
      String(p.intervalMinutes),
      (v) => this.patch(p, "intervalMinutes", Number(v)),
      "number"
    );
    check(
      at,
      "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0442\u044C \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430 Obsidian",
      p.startup,
      (v) => this.patch(p, "startup", v)
    );
    check(
      at,
      "\u041F\u043E\u0441\u043B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0444\u0430\u0439\u043B\u043E\u0432",
      p.onChange,
      (v) => this.patch(p, "onChange", v),
      "\u0414\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0438 \u0434\u0432\u0443\u0441\u0442\u043E\u0440\u043E\u043D\u043D\u0435\u0439 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438; \u0437\u0430\u0434\u0435\u0440\u0436\u043A\u0430 10 \u0441\u0435\u043A\u0443\u043D\u0434."
    );
    check(
      at,
      "\u0421\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0442\u044C \u043F\u0435\u0440\u0435\u0434 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u043C \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435\u043C",
      p.confirmDeletes,
      (v) => this.patch(p, "confirmDeletes", v)
    );
    banner(
      at,
      "\u041F\u0440\u0438 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u0435 \u0438\u043B\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E\u0441\u0442\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043F\u043B\u0430\u043D \u043F\u043E\u043F\u0430\u0434\u0451\u0442 \u0432 \u0446\u0435\u043D\u0442\u0440 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439. \u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0436\u0434\u0451\u0442 \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0438 \u043D\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0435\u0442 \u043E\u0434\u0438\u043D\u0430\u043A\u043E\u0432\u044B\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F."
    );
  }
  history(at, id) {
    title(at, "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432");
    const runs = this.studio.data.history.filter(
      (r) => !id || r.profileId === id
    );
    if (!runs.length) {
      el(at, "p", "\u0417\u0430\u043F\u0443\u0441\u043A\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.", "ss-muted");
      return;
    }
    for (const r of runs) {
      const item = card(at);
      const head = el(item, "div", "", "ss-between");
      el(head, "strong", r.name);
      badge(head, r.status);
      el(item, "small", new Date(r.at).toLocaleString());
      el(
        item,
        "p",
        `${r.message} \xB7 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439: ${r.applied} \xB7 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u043E\u0432: ${r.conflicts}`
      );
      button(
        item,
        "\u0414\u0435\u0442\u0430\u043B\u0438",
        () => new Dialog(this.app, (at2) => {
          title(at2, r.name, r.message);
          const table = el(at2, "table");
          for (const d of r.details) {
            const tr = el(table, "tr");
            el(tr, "td", d.path);
            el(tr, "td", actionLabels[d.action]);
            el(tr, "td", d.status);
          }
        }).open()
      );
    }
  }
  operations(at) {
    const main = el(at, "main"), head = el(main, "div", "", "ss-between");
    title(
      head,
      "\u0426\u0435\u043D\u0442\u0440 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439",
      "\u041A\u0430\u0436\u0434\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u0438\u043C\u0435\u0435\u0442 \u043F\u043B\u0430\u043D \u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442."
    );
    button(
      head,
      this.studio.paused ? "\u0412\u043E\u0437\u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u0437\u0430\u043F\u0443\u0441\u043A" : "\u041F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u0437\u0430\u043F\u0443\u0441\u043A",
      () => {
        this.studio.paused = !this.studio.paused;
        this.render();
      }
    );
    const g = grid(main), left = card(g), right = card(g);
    title(left, "\u041E\u0436\u0438\u0434\u0430\u044E\u0442 \u0440\u0435\u0448\u0435\u043D\u0438\u044F");
    const pending = this.studio.getPendingPlans();
    if (!pending.length)
      el(left, "p", "\u041D\u0435\u0442 \u043F\u043B\u0430\u043D\u043E\u0432, \u043E\u0436\u0438\u0434\u0430\u044E\u0449\u0438\u0445 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F.", "ss-muted");
    for (const p of pending) {
      const r = row(left, p.profile.name);
      button(r, "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043B\u0430\u043D", () => this.preview(p));
    }
    title(right, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E");
    for (const p of this.studio.data.profiles) {
      const r = row(right, p.name, directions[p.direction]);
      button(
        r,
        "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C",
        async () => this.preview(await this.studio.inspect(p))
      ).disabled = this.studio.busy;
    }
    this.history(main);
  }
  importPage(at) {
    const main = el(at, "main");
    title(
      main,
      "\u0421\u043E\u0435\u0434\u0438\u043D\u0438\u0442\u0435 \u043D\u0443\u0436\u043D\u044B\u0435 \u043F\u0430\u043F\u043A\u0438",
      "\u0418\u043C\u043F\u043E\u0440\u0442 \u0438\u0434\u0451\u0442 \u0447\u0435\u0440\u0435\u0437 \u044D\u0442\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E. \u041F\u0440\u043E\u043C\u0435\u0436\u0443\u0442\u043E\u0447\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0432 vault."
    );
    const draft = this.importDraft ||= {
      ...newProfile(),
      name: "\u0418\u043C\u043F\u043E\u0440\u0442 \u0432\u043D\u0435\u0448\u043D\u0438\u0445 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432",
      direction: "push",
      sourceKind: "folder",
      sourceRoot: "",
      sourceBranch: ""
    };
    const g = grid(main), left = card(g), right = card(g);
    title(left, "\u041E\u0442\u043A\u0443\u0434\u0430 \u0431\u0440\u0430\u0442\u044C \u0444\u0430\u0439\u043B\u044B");
    select(
      left,
      "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A",
      draft.sourceKind === "folder" ? "folder" : draft.sourceConnectionId || "folder",
      Object.fromEntries([
        ["folder", "\u041F\u0430\u043F\u043A\u0430 \u043D\u0430 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435"],
        ...this.studio.data.connections.map((c) => [c.id, c.name])
      ]),
      (v) => {
        draft.sourceKind = v === "folder" ? "folder" : "connection";
        draft.sourceConnectionId = v === "folder" ? void 0 : v;
        draft.sourceRoot = this.studio.data.connections.find((c) => c.id === v)?.root || "";
        this.render();
      }
    );
    const sourceConnection = this.studio.data.connections.find(
      (c) => c.id === draft.sourceConnectionId
    );
    text(
      left,
      draft.sourceKind === "folder" ? "\u0410\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043F\u0430\u043F\u043A\u0438" : rootLabel(sourceConnection),
      draft.sourceRoot || "",
      (v) => draft.sourceRoot = v
    );
    if (sourceConnection?.provider === "github" && draft.sourceKind === "connection") {
      text(
        left,
        "\u0412\u0435\u0442\u043A\u0430 GitHub (\u043F\u0443\u0441\u0442\u043E = \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E)",
        draft.sourceBranch || "",
        (v) => draft.sourceBranch = v
      );
      text(
        left,
        "\u041F\u043E\u0434\u043A\u0430\u0442\u0430\u043B\u043E\u0433 GitHub",
        draft.sourceSubpath || "",
        (v) => draft.sourceSubpath = v
      );
    } else if (sourceConnection && draft.sourceKind === "connection")
      button(
        left,
        "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430",
        () => this.pickFolder(
          sourceConnection,
          draft.sourceRoot || "",
          async (root) => {
            draft.sourceRoot = root;
            this.render();
          }
        )
      );
    el(
      left,
      "p",
      "\u0412\u043D\u0435\u0448\u043D\u044F\u044F \u043F\u0430\u043F\u043A\u0430 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0447\u0442\u0435\u043D\u0438\u044F. \u0421\u0438\u043C\u0432\u043E\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u043D\u0435 \u043E\u0431\u0445\u043E\u0434\u044F\u0442\u0441\u044F.",
      "ss-muted"
    );
    title(right, "\u041A\u0443\u0434\u0430 \u043F\u043E\u043C\u0435\u0441\u0442\u0438\u0442\u044C");
    const targets = this.studio.data.connections.filter(
      (c) => c.provider === "gdrive" || c.provider === "yandex"
    );
    draft.connectionId ||= targets[0]?.id || "";
    select(
      right,
      "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F",
      draft.connectionId,
      Object.fromEntries(targets.map((c) => [c.id, c.name])),
      (v) => {
        draft.connectionId = v;
        draft.remoteRoot = targets.find((c) => c.id === v)?.root || "";
        this.render();
      }
    );
    text(
      right,
      rootLabel(targets.find((c) => c.id === draft.connectionId)),
      draft.remoteRoot,
      (v) => draft.remoteRoot = v
    );
    const targetConnection = targets.find((c) => c.id === draft.connectionId);
    if (targetConnection)
      button(
        right,
        "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F",
        () => this.pickFolder(targetConnection, draft.remoteRoot, async (root) => {
          draft.remoteRoot = root;
          this.render();
        })
      );
    text(right, "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044F", draft.name, (v) => draft.name = v);
    select(
      right,
      "\u041F\u0440\u0438 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0438 \u0438\u043C\u0451\u043D",
      draft.conflict,
      policies,
      (v) => draft.conflict = v
    );
    if (!targets.length)
      button(right, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435", () => this.connections());
    banner(
      main,
      "\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0438\u043C\u043F\u043E\u0440\u0442 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u0438 \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u044F, \u0431\u0435\u0437 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0439. \u0421\u043E\u0441\u0442\u0430\u0432 \u0438 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0432 \u0441\u043E\u0437\u0434\u0430\u043D\u043D\u043E\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u0435. \u041B\u0438\u043C\u0438\u0442 \u0444\u0430\u0439\u043B\u0430 \u2014 50 \u041C\u0411."
    );
    button(
      main,
      "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B",
      async () => {
        if (!draft.sourceRoot || !draft.remoteRoot || !draft.connectionId)
          throw Error("\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435");
        if (!this.studio.data.profiles.some((p) => p.id === draft.id))
          this.studio.data.profiles.push(draft);
        this.importDraft = void 0;
        this.active = draft.id;
        this.page = "profiles";
        this.tab = "route";
        await this.save();
        this.preview(await this.studio.inspect(draft));
      },
      true
    ).disabled = this.studio.busy;
  }
  capabilities() {
    new Dialog(this.app, (at) => {
      title(
        at,
        "\u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0441\u0442\u0438",
        "\u041E\u0441\u043D\u043E\u0432\u043D\u044B\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0432\u0445\u043E\u0434\u044F\u0442 \u0432 \u0441\u0431\u043E\u0440\u043A\u0443; \u0443\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0442\u044C \u043C\u043E\u0434\u0443\u043B\u0438 \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F."
      );
      for (const [name, desc] of [
        [
          "Google Drive OAuth",
          "\u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u043F\u0430\u043F\u043A\u0438: \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435, \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430, \u0434\u0432\u0443\u0441\u0442\u043E\u0440\u043E\u043D\u043D\u044F\u044F \u0440\u0430\u0431\u043E\u0442\u0430."
        ],
        ["\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 Google Drive", "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u043F\u043E folder ID \u0438 API key."],
        ["\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A", "OAuth-\u0442\u043E\u043A\u0435\u043D; \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430."],
        ["GitHub", "\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0435 \u0438 \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u044B\u0435 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0438; \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435."],
        [
          "\u041F\u0430\u043A\u0435\u0442\u043D\u043E\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432",
          "\u041F\u043E\u043A\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u0438\u0435 \u0432 \u043F\u043B\u0430\u043D\u0435; \u043A\u043E\u0434 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F."
        ],
        ["\u041C\u043E\u0431\u0438\u043B\u044C\u043D\u044B\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430", "\u041D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u044D\u0442\u043E\u0439 desktop alpha."]
      ])
        row(at, name, desc);
    }).open();
  }
  connections() {
    this.page = "connections";
    this.render();
  }
  connectionPage(at) {
    title(
      at,
      "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
      "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0441\u0435\u0440\u0432\u0438\u0441 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0430\u043F\u043A\u0443, \u0437\u0430\u0442\u0435\u043C \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C. \u041B\u044E\u0431\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E."
    );
    for (const c of this.studio.data.connections) {
      const box = card(at);
      title(box, c.name, providers[c.provider]);
      el(box, "p", c.root || "\u041F\u0430\u043F\u043A\u0430 \u0432\u044B\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u0432 \u043F\u0440\u043E\u0444\u0438\u043B\u0435");
      el(
        box,
        "small",
        c.checkedAt ? `\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E ${new Date(c.checkedAt).toLocaleString()}: ${c.accountLabel || "\u0434\u043E\u0441\u0442\u0443\u043F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D"}` : "\u0414\u043E\u0441\u0442\u0443\u043F \u0435\u0449\u0451 \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D",
        "ss-muted"
      );
      button(box, "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C", () => this.editConnection(c)).disabled = this.studio.busy;
      button(box, "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C", () => this.profileFor(c)).disabled = this.studio.busy;
      button(box, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435", async () => {
        c.accountLabel = await this.studio.exclusive(
          "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
          (signal) => this.studio.testConnection(c, signal)
        );
        c.checkedAt = Date.now();
        await this.save();
      }).disabled = this.studio.busy;
    }
    button(
      at,
      "\uFF0B \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
      () => {
        const id = crypto.randomUUID();
        this.editConnection(
          {
            id,
            name: "Google Drive",
            provider: "gdrive",
            secretRef: "sync-studio-" + id,
            root: "root"
          },
          true
        );
      },
      true
    ).disabled = this.studio.busy;
  }
  async profileFor(c) {
    const p = await this.studio.createProfile(c);
    this.active = p.id;
    this.page = "profiles";
    this.tab = "route";
    this.render();
  }
  editConnection(original, isNew = false) {
    const c = structuredClone(original);
    let saved = !isNew, value = "", oauthJSON = "", status = "", running = false;
    let secretDraft = false;
    const isolateSecret = () => {
      if (secretDraft) return;
      const old = this.studio.getSecret(c);
      c.secretRef = "sync-studio-" + crypto.randomUUID();
      if (old) this.studio.setSecret(c, old);
      secretDraft = true;
    };
    let task;
    const modal = new Dialog(this.app, (at, m) => {
      const draw = () => {
        at.empty();
        title(
          at,
          saved ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F" : "\u041D\u043E\u0432\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
          "1. \u0414\u043E\u0441\u0442\u0443\u043F \u2192 2. \u041F\u0430\u043F\u043A\u0430 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u2192 3. \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044C"
        );
        const form = el(at, "fieldset");
        form.disabled = running;
        text(form, "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", c.name, (v) => c.name = v);
        const provider = select(form, "\u0421\u0435\u0440\u0432\u0438\u0441", c.provider, providers, (v) => {
          c.provider = v;
          c.secretRef = "sync-studio-" + crypto.randomUUID();
          secretDraft = true;
          c.clientId = void 0;
          c.clientSecretRef = void 0;
          c.subject = void 0;
          c.checkedAt = void 0;
          c.accountLabel = void 0;
          c.name = providers[c.provider];
          c.root = c.provider === "gdrive" ? "root" : c.provider === "yandex" ? "disk:/" : "";
          value = "";
          status = "";
          draw();
        });
        provider.disabled = saved;
        if (c.provider === "gdrive") {
          el(
            form,
            "p",
            c.clientId && this.studio.getSecret(c) ? "Google \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D. \u041C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0430\u043F\u043A\u0443, \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u043B\u0438 \u0432\u043E\u0439\u0442\u0438 \u0437\u0430\u043D\u043E\u0432\u043E." : "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 JSON \u043A\u043B\u0438\u0435\u043D\u0442\u0430 Desktop app \u0438\u0437 Google Cloud, \u0437\u0430\u0442\u0435\u043C \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435."
          );
          const label = el(form, "label", "", "ss-field");
          el(label, "span", "Google Desktop OAuth client JSON");
          const input = el(label, "textarea");
          input.rows = 4;
          input.value = oauthJSON;
          input.oninput = () => oauthJSON = input.value;
          const file = el(label, "input");
          file.type = "file";
          file.accept = ".json,application/json";
          file.onchange = async () => {
            try {
              if (file.files?.[0]) {
                oauthJSON = await file.files[0].text();
                input.value = oauthJSON;
              }
            } catch (e) {
              status = String(e);
              draw();
            }
          };
          button(
            form,
            c.clientId ? "\u0412\u043E\u0439\u0442\u0438 \u0437\u0430\u043D\u043E\u0432\u043E \u0432 Google" : "\u0412\u043E\u0439\u0442\u0438 \u0432 Google",
            () => run(async () => {
              isolateSecret();
              await this.studio.connectGoogle(c, oauthJSON);
              status = "Google \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0430\u043F\u043A\u0443 \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435.";
            }),
            true
          );
        } else {
          const labels = {
            yandex: "OAuth-\u0442\u043E\u043A\u0435\u043D \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430",
            github: "GitHub token (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u043B\u044F \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0445 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0435\u0432)",
            "gdrive-public": "Google Drive API key"
          };
          const hints = {
            yandex: "\u041D\u0443\u0436\u0435\u043D OAuth-\u0442\u043E\u043A\u0435\u043D \u042F\u043D\u0434\u0435\u043A\u0441\u0430 \u0441 \u0434\u043E\u0441\u0442\u0443\u043F\u043E\u043C \u043A \u0414\u0438\u0441\u043A\u0443. \u0414\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043D\u0443\u0436\u043D\u044B \u043F\u0440\u0430\u0432\u0430 \u0437\u0430\u043F\u0438\u0441\u0438. \u042D\u0442\u043E \u043D\u0435 Google OAuth.",
            github: "\u0414\u043B\u044F \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u043E\u0433\u043E \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u044F \u043D\u0443\u0436\u0435\u043D token \u0441 Contents: read. \u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439 \u043C\u043E\u0436\u043D\u043E \u0447\u0438\u0442\u0430\u0442\u044C \u0431\u0435\u0437 \u0442\u043E\u043A\u0435\u043D\u0430.",
            "gdrive-public": "\u041F\u0430\u043F\u043A\u0430 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u043F\u043E \u0441\u0441\u044B\u043B\u043A\u0435. API key \u2014 \u0438\u0437 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 Google Cloud \u0441 \u0432\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u043C Drive API. \u0422\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u0435\u043D\u0438\u0435."
          };
          text(form, labels[c.provider], value, (v) => value = v, "password");
          el(form, "p", hints[c.provider], "ss-muted");
          if (saved) el(form, "small", "\u041F\u0443\u0441\u0442\u043E\u0435 \u043F\u043E\u043B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442 \u043F\u0440\u0435\u0436\u043D\u0438\u0439 \u0441\u0435\u043A\u0440\u0435\u0442.");
        }
        text(
          form,
          c.provider === "yandex" ? "\u041F\u0430\u043F\u043A\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 (disk:/ = \u0432\u0435\u0441\u044C \u0434\u0438\u0441\u043A)" : c.provider === "github" ? "\u0420\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439 owner/repo" : "\u0421\u0441\u044B\u043B\u043A\u0430 \u0438\u043B\u0438 ID \u043F\u0430\u043F\u043A\u0438 Google Drive",
          c.root || "",
          (v) => {
            c.root = v.trim();
            c.checkedAt = void 0;
            c.accountLabel = void 0;
          }
        );
        el(
          form,
          "small",
          "\u041F\u0430\u043F\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0434\u043B\u044F \u043D\u043E\u0432\u044B\u0445 \u043F\u0440\u043E\u0444\u0438\u043B\u0435\u0439. \u041F\u0430\u043F\u043A\u0443 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u043C\u0435\u043D\u044F\u0439\u0442\u0435 \u043D\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \xAB\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435\xBB.",
          "ss-muted"
        );
        const stageSecret = () => {
          if (value.trim() && value.trim() !== this.studio.getSecret(c)) {
            isolateSecret();
            this.studio.setSecret(c, value.trim());
            c.checkedAt = void 0;
            c.accountLabel = void 0;
          }
        };
        if (c.provider !== "github")
          button(form, "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0430\u043F\u043A\u0443", async () => {
            stageSecret();
            await this.pickFolder(c, c.root || "", async (root) => {
              c.root = root;
              draw();
            });
          });
        button(
          form,
          "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043F\u0430\u043F\u043A\u0443",
          () => run(async () => {
            stageSecret();
            task = new AbortController();
            c.accountLabel = await this.studio.exclusive(
              "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
              (signal) => {
                task.signal.addEventListener(
                  "abort",
                  () => this.studio.controller?.abort(),
                  { once: true }
                );
                return this.studio.testConnection(c, signal);
              }
            );
            c.checkedAt = Date.now();
            status = c.accountLabel + ". \u0422\u0435\u043F\u0435\u0440\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435.";
          })
        );
        const persist = async () => {
          stageSecret();
          await this.studio.saveConnection(c);
          saved = true;
          secretDraft = false;
          value = "";
          this.render();
        };
        button(
          form,
          "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435",
          () => run(async () => {
            await persist();
            status = "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0438\u043B\u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0413\u043E\u0442\u043E\u0432\u043E\xBB.";
          }),
          true
        );
        button(
          form,
          "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438 \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C",
          () => run(async () => {
            await persist();
            await this.profileFor(c);
            m.close();
          }),
          true
        );
        if (saved)
          button(
            form,
            "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442",
            () => run(async () => {
              await this.studio.disconnect(c);
              c.checkedAt = void 0;
              status = "\u0410\u043A\u043A\u0430\u0443\u043D\u0442 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D. \u041F\u0440\u043E\u0444\u0438\u043B\u0438 \u043F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B. \u041C\u043E\u0436\u043D\u043E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F \u0437\u0430\u043D\u043E\u0432\u043E.";
              await this.studio.saveConnectionMetadata(c);
              this.render();
            })
          );
        if (status) {
          const note = banner(at, status);
          note.setAttribute("role", "status");
        }
        if (running) {
          banner(
            at,
            "\u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F\u2026 \u0414\u043B\u044F Google \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0432\u0445\u043E\u0434 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u0438 \u0432\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0441\u044E\u0434\u0430."
          );
          button(at, "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044E", () => {
            task?.abort(new Error("\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E"));
            this.studio.cancelGoogle();
          });
        }
        button(at, "\u0413\u043E\u0442\u043E\u0432\u043E / \u0437\u0430\u043A\u0440\u044B\u0442\u044C", () => m.close()).disabled = running;
      };
      const run = async (fn) => {
        if (running) return;
        running = true;
        status = "";
        draw();
        try {
          await fn();
        } catch (e) {
          status = e instanceof Error ? e.message : String(e);
        } finally {
          running = false;
          task = void 0;
          if (at.isConnected) draw();
        }
      };
      draw();
    });
    const close = modal.onClose.bind(modal);
    modal.onClose = () => {
      task?.abort();
      if (running) this.studio.cancelGoogle();
      close();
    };
    modal.open();
  }
  async folderScope(p) {
    await this.studio.exclusive("\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0434\u0435\u0440\u0435\u0432\u0430 \u043F\u0430\u043F\u043E\u043A", async (signal) => {
      const browse = { ...p, scope: "all", folders: [] };
      const source = p.direction === "push" ? await this.studio.local(browse) : await this.studio.remote(browse);
      const snap = await source.scan(signal);
      if (!snap.complete) throw Error("\u0414\u0435\u0440\u0435\u0432\u043E \u043D\u0435\u043F\u043E\u043B\u043D\u043E");
      const dirs = /* @__PURE__ */ new Set();
      for (const f of Object.keys(snap.files)) {
        const parts = f.split("/");
        parts.pop();
        let at = "";
        for (const part of parts) {
          at = at ? at + "/" + part : part;
          dirs.add(at);
        }
      }
      const chosen = new Set(p.folders);
      new Dialog(this.app, (at, m) => {
        title(
          at,
          "\u041F\u0430\u043F\u043A\u0438 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430",
          "\u0412\u044B\u0431\u043E\u0440 \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0439 \u043F\u0430\u043F\u043A\u0438 \u0432\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0432\u0441\u0451 \u0435\u0451 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435."
        );
        if (!dirs.size)
          el(
            at,
            "p",
            "\u0412 \u043A\u043E\u0440\u043D\u0435 \u043D\u0435\u0442 \u0432\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0445 \u043F\u0430\u043F\u043E\u043A \u0441 \u0444\u0430\u0439\u043B\u0430\u043C\u0438. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u044C \xAB\u0412\u0435\u0441\u044C \u043A\u043E\u0440\u0435\u043D\u044C\xBB."
          );
        for (const d of [...dirs].sort()) {
          const c = check(at, d, chosen.has(d), (on) => {
            if (on) chosen.add(d);
            else chosen.delete(d);
          });
          c.parentElement.style.paddingLeft = (d.split("/").length - 1) * 16 + "px";
        }
        button(
          at,
          "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435",
          async () => {
            if (!chosen.size) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0443 \u043F\u0430\u043F\u043A\u0443");
            p.scope = "folders";
            p.folders = [...chosen];
            await this.save();
            m.close();
          },
          true
        );
      }).open();
    });
  }
  async pickFolder(c, root, chosen) {
    const signal = new AbortController();
    const base = c.provider === "yandex" ? "disk:/" : root || "root";
    const p = { ...newProfile(c.id), remoteRoot: base };
    const store = await this.studio.remote(p, c, signal.signal);
    const stack = [
      {
        id: c.provider === "yandex" ? root.replace(/^disk:\//, "").replace(/^\//, "").replace(/\/$/, "") : driveRoot(base),
        name: root || "\u041A\u043E\u0440\u0435\u043D\u044C"
      }
    ];
    const modal = new Dialog(this.app, (at, m) => {
      const draw = async () => {
        at.empty();
        const current = stack[stack.length - 1];
        title(at, "\u0412\u044B\u0431\u043E\u0440 \u043F\u0430\u043F\u043A\u0438", current.name);
        const status = el(at, "p", "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u0430\u043F\u043E\u043A\u2026");
        try {
          const folders = store instanceof DriveStore ? (await store.children(current.id, signal.signal)).filter(
            (f) => f.mimeType === "application/vnd.google-apps.folder"
          ) : store instanceof YandexStore ? await store.folders(current.id, signal.signal) : [];
          if (!at.isConnected || signal.signal.aborted) return;
          status.textContent = folders.length ? "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0430\u043F\u043A\u0443 \u0438\u043B\u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0435\u043A\u0443\u0449\u0443\u044E." : "\u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0445 \u043F\u0430\u043F\u043E\u043A \u043D\u0435\u0442. \u041C\u043E\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0443\u044E.";
          if (stack.length > 1)
            button(at, "\u2190 \u041D\u0430\u0437\u0430\u0434", async () => {
              stack.pop();
              await draw();
            });
          if (c.provider !== "gdrive-public")
            button(at, "\u0412 \u043A\u043E\u0440\u0435\u043D\u044C \u0434\u0438\u0441\u043A\u0430", async () => {
              stack.splice(0, stack.length, {
                id: c.provider === "yandex" ? "" : "root",
                name: "\u041A\u043E\u0440\u0435\u043D\u044C \u0434\u0438\u0441\u043A\u0430"
              });
              await draw();
            });
          for (const f of folders)
            button(at, "\u{1F4C1} " + f.name, async () => {
              stack.push({ id: f.id, name: f.name });
              await draw();
            });
          button(
            at,
            "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u043F\u0430\u043F\u043A\u0443",
            async () => {
              await chosen(
                c.provider === "yandex" ? "disk:/" + current.id : current.id
              );
              m.close();
            },
            true
          );
        } catch (e) {
          if (!signal.signal.aborted) {
            status.textContent = e instanceof Error ? e.message : String(e);
            button(at, "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C", draw);
          }
        }
      };
      void draw();
    });
    const close = modal.onClose.bind(modal);
    modal.onClose = () => {
      signal.abort();
      close();
    };
    modal.open();
  }
  preview(plan2) {
    new Dialog(this.app, (at, m) => {
      title(
        at,
        "\u041F\u0435\u0440\u0435\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0435\u0439",
        plan2.profile.name + " \xB7 " + directions[plan2.profile.direction]
      );
      const summary = el(at, "div", "", "ss-actions");
      badge(
        summary,
        `\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u0439: ${plan2.operations.filter((o) => !["adopt", "skip"].includes(o.action)).length}`
      );
      badge(summary, "\u0423\u0434\u0430\u043B\u0435\u043D\u0438\u044F: " + plan2.profile.deletion);
      for (const warning of plan2.warnings) banner(at, warning);
      const rows = plan2.operations.filter((o) => o.action !== "adopt");
      if (!rows.length)
        banner(
          at,
          "\u0424\u0430\u0439\u043B\u044B \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B. \u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u0443\u0435\u0442 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E."
        );
      const scroll = el(at, "div", "", "ss-table-scroll"), table = el(scroll, "table"), head = el(table, "tr");
      for (const x of ["\u0424\u0430\u0439\u043B", "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435", "\u041F\u0440\u0438\u0447\u0438\u043D\u0430"]) el(head, "th", x);
      for (const op of rows) {
        const r = el(table, "tr");
        el(r, "td", op.path);
        const cell = el(r, "td");
        el(cell, "span", actionLabels[op.action]);
        el(r, "td", op.reason);
        if (op.action === "conflict" && category(
          join(plan2.profile.localRoot, op.path),
          this.app.vault.configDir
        ) !== "plugin-code")
          button(
            cell,
            "\u0420\u0435\u0448\u0438\u0442\u044C",
            () => this.resolve(plan2, op, () => {
              m.close();
              this.preview(plan2);
            })
          );
      }
      banner(
        at,
        "\u041F\u0435\u0440\u0435\u0434 \u0437\u0430\u043F\u0438\u0441\u044C\u044E \u0432\u0435\u0440\u0441\u0438\u0438 \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E. \u041D\u043E\u0432\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u044E\u0442 \u043D\u043E\u0432\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430. \u041D\u0435\u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0435 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442\u044B \u043E\u0441\u0442\u0430\u043D\u0443\u0442\u0441\u044F \u043D\u0435\u0442\u0440\u043E\u043D\u0443\u0442\u044B\u043C\u0438."
      );
      const actions = el(at, "div", "", "ss-actions");
      button(actions, "\u041E\u0442\u043C\u0435\u043D\u0430", () => m.close());
      button(
        actions,
        "\u0412\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u044D\u0442\u043E\u0442 \u043F\u043B\u0430\u043D",
        async () => {
          const log = await this.studio.apply(plan2);
          if (log.status === "failed" || log.status === "partial") {
            banner(at, log.message);
            button(at, "\u041F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B", async () => {
              const current = this.studio.data.profiles.find(
                (p) => p.id === plan2.profile.id
              );
              if (!current) throw Error("\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0443\u0434\u0430\u043B\u0451\u043D");
              const next = await this.studio.inspect(current);
              m.close();
              this.preview(next);
            });
            return;
          }
          m.close();
          new import_obsidian.Notice(log.message);
          this.page = "operations";
          this.render();
        },
        true
      ).disabled = this.studio.busy;
    }).open();
  }
  resolve(plan2, op, done) {
    new Dialog(this.app, (at, m) => {
      title(at, op.path, op.reason);
      const g = grid(at);
      for (const [label, f] of [
        ["\u041D\u0430 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435", op.local],
        ["\u0412 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0435", op.remote]
      ]) {
        const c = card(g);
        el(c, "h3", label);
        if (f) {
          el(c, "p", `${f.size} \u0431\u0430\u0439\u0442`);
          el(
            c,
            "small",
            f.mtime ? new Date(f.mtime).toLocaleString() : "\u0412\u0440\u0435\u043C\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E"
          );
          el(c, "code", f.hash.slice(0, 24));
        } else el(c, "p", "\u0423\u0434\u0430\u043B\u0451\u043D / \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442");
      }
      const set = (action) => {
        op.action = action;
        op.reason = "\u0420\u0435\u0448\u0435\u043D\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u043F\u0430\u0440\u044B \u0432\u0435\u0440\u0441\u0438\u0439";
        m.close();
        done();
      };
      if (op.local && op.remote) {
        button(at, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0431\u0435", () => set("keep-both"), true);
        button(
          at,
          "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439",
          () => set(plan2.profile.direction === "pull" ? "adopt" : "upload")
        );
        button(
          at,
          "\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u0439",
          () => set(plan2.profile.direction === "push" ? "adopt" : "download")
        );
      } else {
        button(at, "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439", () => set("adopt"));
        if (plan2.profile.deletion !== "ignore")
          button(
            at,
            "\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435",
            () => set(op.local ? "delete-local" : "delete-remote")
          );
      }
    }).open();
  }
};

// src/controller.ts
var SyncStudio = class extends import_obsidian2.Plugin {
  data = { schema: 1, connections: [], profiles: [], history: [] };
  state = { baselines: {}, pending: {} };
  busy = false;
  phase = "\u0413\u043E\u0442\u043E\u0432\u043E";
  paused = false;
  controller;
  authController;
  last = /* @__PURE__ */ new Map();
  failures = /* @__PURE__ */ new Map();
  changed = false;
  changedAt = 0;
  http = new Http();
  tokenManagers = /* @__PURE__ */ new Map();
  status;
  pendingPlans = /* @__PURE__ */ new Map();
  saveChain = Promise.resolve();
  lastError = "";
  collision;
  stateFile;
  async onload() {
    const saved = await this.loadData();
    if (saved) {
      if (saved.schema !== 1 || !Array.isArray(saved.profiles) || !Array.isArray(saved.connections))
        throw Error(
          "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442 Sync Studio. \u0421\u0442\u0430\u0440\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043D\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u044E\u0442\u0441\u044F."
        );
      this.data = saved;
    }
    const adapter = this.app.vault.adapter;
    if (!adapter.getBasePath) throw Error("\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F desktop vault");
    this.stateFile = new StateFile(adapter.getBasePath());
    this.state = await this.stateFile.read(this.state);
    this.registerView(VIEW_TYPE, (leaf) => new StudioView(leaf, this));
    this.addRibbonIcon("refresh-cw", "Sync Studio", () => void this.open());
    this.addCommand({
      id: "open",
      name: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u0438",
      callback: () => void this.open()
    });
    this.addCommand({
      id: "cancel",
      name: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u0437\u0430\u043F\u0443\u0441\u043A",
      callback: () => this.controller?.abort(new Error("\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C"))
    });
    this.addSettingTab(new StudioSettings(this.app, this));
    this.status = this.addStatusBarItem();
    this.refresh();
    this.registerInterval(window.setInterval(() => void this.tick(), 1e4));
    const changed = (f) => {
      if (protectedPath(f.path, this.app.vault.configDir)) return;
      this.changed = true;
      this.changedAt = Date.now();
    };
    this.registerEvent(this.app.vault.on("modify", changed));
    this.registerEvent(this.app.vault.on("create", changed));
    this.registerEvent(this.app.vault.on("delete", changed));
    this.registerEvent(this.app.vault.on("rename", changed));
    this.app.workspace.onLayoutReady(() => {
      for (const p of this.data.profiles)
        this.last.set(p.id, p.startup ? 0 : Date.now());
      void this.tick();
    });
  }
  onunload() {
    this.controller?.abort();
    this.authController?.abort();
    for (const t of this.tokenManagers.values()) t.disconnect();
  }
  async open() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
  refresh() {
    if (this.status) this.status.setText("Sync Studio \xB7 " + this.phase);
    for (const l of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      l.view.render();
  }
  async save() {
    const snapshot = structuredClone(this.data);
    const next = this.saveChain.then(() => this.saveData(snapshot));
    this.saveChain = next.catch(() => {
    });
    await next;
  }
  reportError(error) {
    this.lastError = error instanceof Error ? error.message : String(error);
    new import_obsidian2.Notice("Sync Studio: " + this.lastError, 15e3);
  }
  invalidateGoogle(id) {
    for (const [key, manager] of this.tokenManagers)
      if (key.startsWith(id + ":")) {
        manager.disconnect();
        this.tokenManagers.delete(key);
      }
  }
  cancelGoogle() {
    this.authController?.abort(new Error("\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430"));
  }
  async saveConnection(c, secret) {
    if (this.busy) throw Error("\u0414\u043E\u0436\u0434\u0438\u0442\u0435\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438");
    if (!c.name.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F");
    if (secret !== void 0) this.setSecret(c, secret.trim());
    if (c.provider !== "github" && !this.getSecret(c))
      throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 \u0438\u043B\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043B\u044E\u0447 \u0434\u043E\u0441\u0442\u0443\u043F\u0430");
    const index = this.data.connections.findIndex((x) => x.id === c.id);
    const previous = index < 0 ? void 0 : this.data.connections[index];
    if (index < 0) this.data.connections.push(structuredClone(c));
    else this.data.connections[index] = structuredClone(c);
    try {
      await this.save();
      if (previous?.secretRef !== c.secretRef || previous?.clientId !== c.clientId) {
        this.invalidateGoogle(c.id);
      }
    } catch (error) {
      if (index < 0)
        this.data.connections = this.data.connections.filter(
          (x) => x.id !== c.id
        );
      else this.data.connections[index] = previous;
      throw error;
    }
  }
  async saveConnectionMetadata(c) {
    const index = this.data.connections.findIndex((x) => x.id === c.id);
    if (index < 0) throw Error("\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E");
    this.data.connections[index] = structuredClone(c);
    await this.save();
  }
  async testConnection(c, signal) {
    if (c.provider === "github") {
      const token = this.getSecret(c);
      const info = await json(
        this.http,
        "https://api.github.com/" + (token ? "user" : "rate_limit"),
        {
          signal,
          headers: {
            "User-Agent": "Obsidian-Sync-Studio",
            ...token ? { Authorization: "Bearer " + token } : {}
          }
        }
      );
      if (c.root)
        await this.checkRoot(
          { ...newProfile(c.id), remoteRoot: c.root },
          signal,
          c
        );
      return token ? "GitHub: " + info.login : "GitHub: \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F";
    }
    const store = await this.remote(
      {
        ...newProfile(c.id),
        remoteRoot: c.root || (c.provider === "yandex" ? "disk:/" : "root")
      },
      c,
      signal
    );
    if (store instanceof DriveStore) {
      const meta = await store.inspect(driveRoot(c.root || "root"), signal);
      if (meta.trashed || meta.mimeType !== "application/vnd.google-apps.folder")
        throw Error("\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043E\u0431\u044A\u0435\u043A\u0442 Drive \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0439 \u043F\u0430\u043F\u043A\u043E\u0439");
      await store.children(meta.id, signal);
      return "\u0414\u043E\u0441\u0442\u0443\u043F \u043A \u043F\u0430\u043F\u043A\u0435: " + meta.name;
    }
    if (store instanceof YandexStore) {
      await store.folders("", signal);
      return "\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A: \u0434\u043E\u0441\u0442\u0443\u043F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D";
    }
    throw Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0438\u0441");
  }
  async checkRoot(p, signal, connection) {
    const store = await this.remote(p, connection, signal);
    if (store instanceof DriveStore) {
      const meta = await store.inspect(driveRoot(p.remoteRoot), signal);
      if (meta.trashed || meta.mimeType !== "application/vnd.google-apps.folder")
        throw Error("Drive: \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0443\u044E \u043F\u0430\u043F\u043A\u0443");
      await store.children(meta.id, signal);
      return "\u041F\u0430\u043F\u043A\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430: " + meta.name;
    }
    if (store instanceof YandexStore) {
      await store.folders("", signal);
      return "\u041F\u0430\u043F\u043A\u0430 \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430";
    }
    await store.scan(signal);
    return "\u0420\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u0439 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D";
  }
  async createProfile(c) {
    const p = newProfile(c.id);
    p.name = c.name;
    p.remoteRoot = c.root || (c.provider === "gdrive" ? "root" : c.provider === "yandex" ? "disk:/" : "");
    this.data.profiles.push(p);
    await this.save();
    return p;
  }
  async saveState() {
    await this.stateFile.write(this.state);
  }
  secrets() {
    const app = this.app;
    if (!app.secretStorage)
      throw Error(
        "\u041D\u0443\u0436\u043D\u043E \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C Obsidian: \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 Secret Storage. \u0421\u0435\u043A\u0440\u0435\u0442\u044B \u0432 data.json \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F."
      );
    return app.secretStorage;
  }
  getSecret(c) {
    return this.secrets().getSecret(c.secretRef) || "";
  }
  setSecret(c, value) {
    this.secrets().setSecret(c.secretRef, value);
  }
  async connectGoogle(c, clientJSON) {
    if (!import_obsidian2.Platform.isDesktopApp) throw Error("OAuth \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 desktop");
    if (this.authController) throw Error("\u0414\u043E\u0436\u0434\u0438\u0442\u0435\u0441\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438");
    const client = clientJSON.trim() ? parseGoogleClient(clientJSON) : c.clientId ? {
      clientId: c.clientId,
      clientSecret: c.clientSecretRef ? this.secrets().getSecret(c.clientSecretRef) || void 0 : void 0
    } : parseGoogleClient(clientJSON);
    this.authController = new AbortController();
    try {
      const grant = await authorizeGoogleDesktop(
        client,
        this.http,
        this.authController.signal,
        (url) => {
          window.open(url);
        }
      );
      c.clientId = client.clientId;
      c.clientSecretRef = c.secretRef + "-client";
      if (client.clientSecret)
        this.secrets().setSecret(c.clientSecretRef, client.clientSecret);
      this.setSecret(c, grant.refreshToken);
      c.subject = grant.subject;
      this.invalidateGoogle(c.id);
      new import_obsidian2.Notice("Google Drive \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D. \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435.");
    } finally {
      this.authController = void 0;
    }
  }
  disconnect(c) {
    if (this.busy) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0437\u0430\u043F\u0443\u0441\u043A");
    this.invalidateGoogle(c.id);
    this.setSecret(c, "");
    if (c.clientSecretRef) this.secrets().setSecret(c.clientSecretRef, "");
    for (const p of this.data.profiles)
      if (p.connectionId === c.id || p.sourceConnectionId === c.id)
        p.enabled = false;
    return this.save();
  }
  async remote(p, connection, signal = this.controller?.signal) {
    const c = connection || this.data.connections.find((x) => x.id === p.connectionId);
    if (!c) throw Error("\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E");
    const limit = p.maxMB * 1024 * 1024;
    const token = this.getSecret(c);
    if (c.provider === "gdrive") {
      if (!c.clientId || !token)
        throw Error("\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 Google Drive \u0447\u0435\u0440\u0435\u0437 OAuth");
      const managerKey = c.id + ":" + c.secretRef;
      let manager = this.tokenManagers.get(managerKey);
      if (!manager) {
        const client = {
          clientId: c.clientId,
          clientSecret: c.clientSecretRef ? this.secrets().getSecret(c.clientSecretRef) || void 0 : void 0
        };
        manager = new GoogleTokenManager(
          client,
          c.secretRef,
          this.secrets(),
          this.http,
          Date.now,
          c.subject
        );
        this.tokenManagers.set(managerKey, manager);
      }
      return new DriveStore(
        new GoogleAuthorizedTransport(this.http, manager),
        p.remoteRoot,
        limit,
        void 0,
        c.id + ":" + c.subject,
        scanRules(p, this.app.vault.configDir)
      );
    }
    if (c.provider === "gdrive-public") {
      if (!token) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 Google API key");
      return new DriveStore(
        this.http,
        p.remoteRoot,
        limit,
        token,
        c.id,
        scanRules(p, this.app.vault.configDir)
      );
    }
    if (c.provider === "github")
      return new GitHubStore(
        this.http,
        p.remoteRoot,
        p.branch,
        p.subpath,
        token,
        limit,
        scanRules(p, this.app.vault.configDir)
      );
    if (!token) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 OAuth-\u0442\u043E\u043A\u0435\u043D \u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A\u0430");
    const store = new YandexStore(
      this.http,
      p.remoteRoot,
      token,
      limit,
      scanRules(p, this.app.vault.configDir)
    );
    const disk = await json(this.http, "https://cloud-api.yandex.net/v1/disk", {
      headers: { Authorization: "OAuth " + token },
      signal
    });
    if (!disk.user?.uid)
      throw Error("\u042F\u043D\u0434\u0435\u043A\u0441 \u0414\u0438\u0441\u043A \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430");
    store.identity += ":" + String(disk.user.uid);
    return store;
  }
  async local(p) {
    if (p.sourceKind === "folder")
      return new ExternalFolder(p.sourceRoot || "", p.maxMB * 1024 * 1024);
    if (p.sourceKind === "connection")
      return this.remote({
        ...p,
        connectionId: p.sourceConnectionId || "",
        remoteRoot: p.sourceRoot || "",
        branch: p.sourceBranch || "main",
        subpath: p.sourceSubpath || ""
      });
    return new LocalStore(
      this.app,
      p.localRoot,
      p.maxMB * 1024 * 1024,
      scanRules(p, this.app.vault.configDir)
    );
  }
  validateOverlap(p) {
    if (p.sourceKind) return;
    for (const other of this.data.profiles) {
      if (other.id === p.id || !other.enabled || other.sourceKind) continue;
      if (under(p.localRoot, other.localRoot) || under(other.localRoot, p.localRoot))
        throw Error(
          "\u041F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u0435 \u0441 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u0435\u043C \xAB" + other.name + "\xBB. \u0420\u0430\u0437\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u0430\u043F\u043A\u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u043F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C."
        );
    }
  }
  async inspect(p) {
    try {
      this.collision = void 0;
      return await this.exclusive(
        "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0444\u0430\u0439\u043B\u043E\u0432",
        async (signal) => this.makePlan(p, signal)
      );
    } catch (error) {
      if (error instanceof PathCollision)
        this.collision = { profileId: p.id, paths: error.paths };
      this.data.history.unshift({
        id: crypto.randomUUID(),
        profileId: p.id,
        name: p.name + " \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430",
        at: Date.now(),
        status: "failed",
        applied: 0,
        conflicts: 0,
        message: error instanceof Error ? error.message : String(error),
        details: []
      });
      this.data.history = this.data.history.slice(0, 100);
      await this.save();
      this.refresh();
      throw error;
    }
  }
  async makePlan(p, signal) {
    validate(p);
    this.validateOverlap(p);
    if (p.sourceKind === "connection") {
      const a = this.data.connections.find(
        (c) => c.id === p.sourceConnectionId
      ), b = this.data.connections.find((c) => c.id === p.connectionId);
      if (!a || !b) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0431\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F");
      if (a.provider.replace("-public", "") === b.provider.replace("-public", ""))
        throw Error(
          "\u0412 0.1 \u0432\u043D\u0435\u0448\u043D\u044F\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043C\u0435\u0436\u0434\u0443 \u0440\u0430\u0437\u043D\u044B\u043C\u0438 \u0441\u0435\u0440\u0432\u0438\u0441\u0430\u043C\u0438; \u044D\u0442\u043E \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u043F\u0430\u043F\u043A\u0438 \u0432 \u0441\u0430\u043C\u0443 \u0441\u0435\u0431\u044F"
        );
    }
    if (!p.sourceKind && p.localRoot && Object.keys(this.state.baselines[p.id]?.files || {}).length && !await this.app.vault.adapter.exists(p.localRoot))
      throw Error(
        "\u041A\u043E\u0440\u0435\u043D\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u0438\u0441\u0447\u0435\u0437. \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u043F\u0430\u043F\u043A\u0443; \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0432\u0441\u0435\u0433\u043E \u043A\u043E\u0440\u043D\u044F \u043D\u0435 \u0440\u0430\u0441\u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."
      );
    if (p.sourceKind && (p.direction !== "push" || !p.sourceRoot))
      throw Error("\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u0438\u043C\u043F\u043E\u0440\u0442 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430 \u0438 \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438");
    const local = await this.local(p), remote = await this.remote(p);
    if (local.identity === remote.identity)
      throw Error("\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442");
    if (p.direction !== "pull" && !remote.writable)
      throw Error("\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435");
    if (p.direction !== "pull" && p.deletion === "trash" && !remote.trashSupported)
      throw Error("\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u043A\u043E\u0440\u0437\u0438\u043D\u0443");
    const [l, r] = await Promise.all([local.scan(signal), remote.scan(signal)]);
    const identity = JSON.stringify([l.identity, r.identity]);
    let baseline = this.state.baselines[p.id] || { identity, files: {} };
    const pending = this.state.pending[p.id];
    if (pending) {
      const op = pending.operation, a = Object.hasOwn(l.files, op.path) ? l.files[op.path] : void 0, b = Object.hasOwn(r.files, op.path) ? r.files[op.path] : void 0;
      const backupPath = join(".sync-conflicts", pending.runId + "/" + op.path);
      let backupVerified = false;
      if (op.action === "keep-both" && await this.app.vault.adapter.exists(backupPath)) {
        const old = pending.direction === "push" ? op.remote : op.local;
        backupVerified = sha(
          new Uint8Array(await this.app.vault.adapter.readBinary(backupPath))
        ) === old?.hash;
      }
      const recovery = recover(pending, identity, a, b, backupVerified);
      if (recovery.kind === "blocked")
        throw Error(recovery.reason + ": " + op.path);
      if (recovery.kind === "commit") {
        if (baseline.identity !== identity) baseline = { identity, files: {} };
        Object.defineProperty(baseline.files, op.path, {
          value: recovery.pair,
          writable: true,
          enumerable: true,
          configurable: true
        });
        this.state.baselines[p.id] = baseline;
      }
      delete this.state.pending[p.id];
      await this.saveState();
    }
    const result = plan(p, l, r, baseline, this.app.vault.configDir);
    for (const op of result.operations)
      if (category(join(p.localRoot, op.path), this.app.vault.configDir) === "plugin-code" && !["adopt", "skip"].includes(op.action)) {
        op.action = "conflict";
        op.reason = "\u041A\u043E\u0434 \u043F\u043B\u0430\u0433\u0438\u043D\u0430: \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0430\u043A\u0435\u0442\u043D\u0430\u044F \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430; \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0437\u0430\u043C\u0435\u043D\u0430 \u0432 0.1 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430";
      }
    return result;
  }
  async apply(reviewed) {
    return this.exclusive("\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F", async (signal) => {
      const current = this.data.profiles.find(
        (p) => p.id === reviewed.profile.id
      );
      if (!current || JSON.stringify(current) !== JSON.stringify(reviewed.profile))
        throw Error("\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F: \u043F\u043E\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D");
      this.validateOverlap(current);
      const local = await this.local(current), remote = await this.remote(current);
      const log = await execute(
        reviewed,
        local,
        remote,
        {
          recovery: async (rel, b) => {
            await writeBackup(
              this.app,
              join(".sync-studio/recovery", path(rel)),
              b
            );
          },
          checkpoint: async (baseline) => {
            this.state.baselines[current.id] = structuredClone(baseline);
            await this.saveState();
          },
          backup: async (rel, b) => {
            await writeBackup(this.app, join(".sync-conflicts", path(rel)), b);
          },
          journal: async (operation, status, result) => {
            if (status === "pending")
              this.state.pending[current.id] = {
                runId: reviewed.id,
                identity: reviewed.identity,
                direction: reviewed.profile.direction,
                policyKey: policyKey(reviewed.profile),
                operation
              };
            else if (status === "applied") {
              this.state.pending[current.id].result = result;
            } else delete this.state.pending[current.id];
            await this.saveState();
          }
        },
        signal,
        (n) => {
          this.phase = "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439: " + n;
          this.status.setText("Sync Studio \xB7 " + this.phase);
        }
      );
      if (log.status !== "completed") this.lastError = log.message;
      this.data.history.unshift(log);
      this.data.history = this.data.history.slice(0, 100);
      await this.save();
      this.pendingPlans.delete(current.id);
      if (log.status === "completed") this.failures.delete(current.id);
      return log;
    });
  }
  async exclusive(phase, fn) {
    if (this.busy) throw Error("\u0414\u0440\u0443\u0433\u043E\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u0443\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F");
    this.lastError = "";
    this.busy = true;
    this.phase = phase;
    this.controller = new AbortController();
    this.refresh();
    try {
      return await fn(this.controller.signal);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.busy = false;
      this.phase = "\u0413\u043E\u0442\u043E\u0432\u043E";
      this.controller = void 0;
      this.refresh();
    }
  }
  getPendingPlans() {
    return [...this.pendingPlans.values()];
  }
  async tick() {
    if (this.busy || this.authController || this.paused || !navigator.onLine)
      return;
    const now = Date.now();
    for (const p of this.data.profiles) {
      if (!p.enabled || this.pendingPlans.has(p.id)) continue;
      if (!this.last.has(p.id)) this.last.set(p.id, p.startup ? 0 : now);
      const due = now - (this.last.get(p.id) ?? now) >= Math.max(
        p.intervalMinutes * 6e4,
        Math.min(36e5, 1e4 * 2 ** (this.failures.get(p.id) || 0))
      );
      const onChange = p.onChange && this.changed && now - this.changedAt > 1e4 && p.direction !== "pull" && (this.last.get(p.id) || 0) < this.changedAt;
      if (!due && !onChange) continue;
      this.last.set(p.id, now);
      try {
        const result = await this.inspect(p);
        const needsReview = result.operations.some(
          (o) => o.action === "conflict" || p.confirmDeletes && o.action.startsWith("delete")
        );
        if (needsReview) {
          this.pendingPlans.set(p.id, result);
          new import_obsidian2.Notice("Sync Studio: \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043F\u043B\u0430\u043D\u0430 \xAB" + p.name + "\xBB");
          this.refresh();
        } else await this.apply(result);
      } catch (e) {
        this.failures.set(p.id, (this.failures.get(p.id) || 0) + 1);
        new import_obsidian2.Notice("Sync Studio: " + e.message);
      }
      break;
    }
    if (this.changed && this.data.profiles.filter((p) => p.enabled && p.onChange && p.direction !== "pull").every((p) => (this.last.get(p.id) || 0) >= this.changedAt))
      this.changed = false;
  }
};
var StudioSettings = class extends import_obsidian2.PluginSettingTab {
  constructor(app, studio) {
    super(app, studio);
    this.studio = studio;
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Sync Studio" });
    this.containerEl.createEl("p", {
      text: "\u041F\u0440\u043E\u0444\u0438\u043B\u0438, \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0438 \u043F\u043B\u0430\u043D\u044B \u043D\u0430\u0445\u043E\u0434\u044F\u0442\u0441\u044F \u0432 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435. \u0421\u0442\u0430\u0440\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0434\u0440\u0443\u0433\u0438\u0445 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432 \u043D\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u044E\u0442\u0441\u044F."
    });
    new import_obsidian2.Setting(this.containerEl).setName("\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0435\u0435 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u043E").addButton(
      (b) => b.setButtonText("\u041E\u0442\u043A\u0440\u044B\u0442\u044C Sync Studio").setCta().onClick(() => void this.studio.open())
    );
  }
};
