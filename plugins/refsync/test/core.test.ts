import { selected, volatility } from "../src/classifier";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  fresh,
  hash,
  type Bytes,
  type Entry,
  type Profile,
  type Snapshot,
  type StorageProvider,
} from "../src/model";
import { profileRules, validate } from "../src/validator";
import { scan } from "../src/scanner";
import { plan } from "../src/planner";
import {
  ApplyJournal,
  StateStore,
  type ArtifactStore,
  type Transaction,
} from "../src/state";
import { Applier } from "../src/applier";
import { StatusStore, SyncEngine } from "../src/engine";
const bytes = (s: string) => new TextEncoder().encode(s).buffer;
const text = (b: Bytes) => new TextDecoder().decode(b);
class Memory implements StorageProvider {
  capabilities = {
    readOnly: false,
    supportsChecksum: false,
    supportsChangesFeed: false,
    maxFileSize: Infinity,
    rateLimits: null,
  };
  data = new Map<string, Bytes>();
  folders = new Set([""]);
  fail = "";
  constructor(readonly id: string) {}
  async list(d: string) {
    const prefix = d ? d + "/" : "";
    const direct = (p: string) =>
      p !== d && p.startsWith(prefix) && !p.slice(prefix.length).includes("/");
    return {
      files: [...this.data.keys()].filter(direct),
      folders: [...this.folders].filter(direct),
    };
  }
  async stat(p: string) {
    if (this.folders.has(p))
      return { type: "folder" as const, size: 0, mtime: 0 };
    const b = this.data.get(p);
    return b ? { type: "file" as const, size: b.byteLength, mtime: 0 } : null;
  }
  async download(p: string) {
    const b = this.data.get(p);
    if (!b) throw Error("missing");
    return b;
  }
  async upload(p: string, b: Bytes) {
    if (this.fail === p) {
      this.fail = "";
      throw Error("fixture");
    }
    this.data.set(p, b);
  }
  async delete(p: string) {
    this.data.delete(p);
  }
  async mkdir(p: string) {
    this.folders.add(p);
  }
  async move(a: string, b: string) {
    await this.upload(b, await this.download(a));
    await this.delete(a);
  }
  async getRevision() {
    return null;
  }
}
class Artifacts implements ArtifactStore {
  data = new Map<string, Bytes>();
  async putNew(p: string, b: Bytes) {
    assert.ok(!this.data.has(p));
    this.data.set(p, b);
  }
  async read(p: string) {
    const b = this.data.get(p);
    if (!b) throw Error("missing");
    return b;
  }
  async has(p: string) {
    return this.data.has(p);
  }
  async dirs() {
    return [...new Set([...this.data.keys()].map((k) => k.split("/")[0]))];
  }
  async removeTree(p: string) {
    for (const k of this.data.keys())
      if (k.startsWith(p + "/")) this.data.delete(k);
  }
}
function fixture() {
  const device = new Map<string, unknown>(),
    state = new StateStore({
      get: (k) => device.get(k),
      set: (k, v) => {
        device.set(k, v);
      },
    });
  const disk = new Artifacts(),
    journal = new ApplyJournal(disk),
    applier = new Applier(journal, state),
    source = new Memory("reference"),
    target = new Memory("target");
  const status = new StatusStore(),
    engine = new SyncEngine(applier, status, ".custom", "refsync", true);
  return { state, journal, disk, applier, source, target, engine, status };
}
const snap = (rows: Record<string, string>): Snapshot => ({
  complete: true,
  directories: new Set(),
  files: new Map(
    Object.entries(rows).map(([path, h]) => [
      path,
      { hash: h, mtime: 100, size: 1, kind: "S" as const },
    ]),
  ),
});
test("validator shares the UI matrix and checks malformed saved profiles", () => {
  assert.ok(
    validate(
      { ...defaults, access: "public", role: "publisher" },
      true,
      true,
      ".custom",
    ).some((e) => e.field === "role"),
  );
  for (const field of ["conflict", "deletions"])
    assert.ok(
      validate(
        { ...defaults, mirror: "full", conflict: "target" },
        true,
        false,
        ".custom",
      ).some((e) => e.field === field),
    );
  assert.ok(
    validate(
      { ...defaults, scope: "settings", fileEvents: true, conflict: "both" },
      true,
      false,
      ".custom",
    ).some((e) => e.field === "fileEvents"),
  );
  assert.ok(
    validate({ ...defaults, watch: true }, false, false, ".custom").some(
      (e) => e.field === "watch",
    ),
  );
  assert.ok(
    validate(
      {
        ...defaults,
        local: "/",
        mirror: "full",
        backup: false,
        emptyGuard: false,
      },
      true,
      false,
      ".custom",
    ).some((e) => e.code === "guard"),
  );
  assert.ok(
    validate(
      { ...defaults, reference: "REFSYNC-COPY/sub" },
      true,
      false,
      ".custom",
    ).some((e) => e.code === "overlap"),
  );
  assert.ok(
    validate(
      { ...defaults, reference: "folder/../secret" },
      true,
      false,
      ".custom",
    ).length,
  );
  assert.ok(
    profileRules(
      { ...defaults, role: "publisher", mode: "silent" },
      true,
      false,
    ).some((e) => e.field === "conflict" && e.visible === false),
  );
  assert.deepEqual(validate(defaults, true, false, ".custom"), []);
});
test("scanner reconciles direct filesystem changes, custom settings root and hard exclusions", async () => {
  const fs = new Memory("vault");
  fs.folders.add("plugins");
  fs.folders.add("plugins/other");
  fs.folders.add("plugins/refsync");
  fs.folders.add("snippets");
  for (const p of [
    "app.json",
    "workspace.json",
    "plugins/other/data.json",
    "plugins/refsync/data.json",
    "snippets/one.css",
  ])
    fs.data.set(p, bytes("{}"));
  const result = await scan(fs, "settings", ".custom", "refsync");
  assert.deepEqual([...result.files.keys()].sort(), [
    "app.json",
    "plugins/other/data.json",
    "snippets/one.css",
  ]);
  assert.equal(volatility("plugins/other/data.json", "settings"), "H");
  assert.equal(volatility("workspace-mobile.json", "settings"), "V");
  fs.data.set("core-plugins.json", bytes("[]"));
  assert.ok(
    (await scan(fs, "settings", ".custom", "refsync")).files.has(
      "core-plugins.json",
    ),
  );
  assert.equal(
    selected(".custom/app.json", "content", ".custom", "refsync", false),
    false,
  );
});
test("planner conflict matrix, new/tie timestamps and seen versions", () => {
  const s = snap({ p: "new" }),
    t = snap({ p: "local" });
  for (const [policy, want] of [
    ["source", "write"],
    ["target", "retain"],
    ["newer", "write"],
    ["both", "both"],
  ] as const) {
    assert.equal(
      plan({ ...defaults, conflict: policy }, s, t, fresh()).ops[0].action,
      want,
    );
  }
  t.files.get("p")!.mtime += 4000;
  assert.equal(
    plan({ ...defaults, conflict: "newer" }, s, t, fresh()).ops[0].action,
    "retain",
  );
  const b = fresh();
  b.entries.p = {
    hash: "old",
    seen: "new",
    applied: "old",
    size: 1,
    mtime: 0,
    delivered: true,
  };
  assert.equal(plan(defaults, s, t, b).ops.length, 0);
  assert.equal(
    plan({ ...defaults, mirror: "full", deletions: true }, s, t, b).ops[0]
      .action,
    "write",
  );
  s.files.get("p")!.kind = "H";
  b.entries.p.seen = "older";
  assert.equal(
    plan({ ...defaults, scope: "settings", conflict: "target" }, s, t, b).ops[0]
      .conflict,
    false,
  );
});
test("preserve/mirror deletions, empty and truncated source protections", () => {
  const b = fresh();
  b.entries.old = {
    hash: "a",
    applied: "a",
    seen: "a",
    mtime: 0,
    size: 1,
    delivered: true,
  };
  const s = snap({ keep: "x" }),
    t = snap({ keep: "x", old: "a", private: "b" });
  const removals = (p: Profile) =>
    plan(p, s, t, b)
      .ops.filter((x) => x.action === "delete")
      .map((x) => x.path);
  assert.deepEqual(removals(defaults), []);
  assert.deepEqual(removals({ ...defaults, deletions: true }), ["old"]);
  assert.deepEqual(removals({ ...defaults, mirror: "full", deletions: true }), [
    "old",
    "private",
  ]);
  assert.equal(
    plan({ ...defaults, deletions: true }, snap({}), t, b).held.length,
    1,
  );
  b.size = 10;
  assert.equal(plan({ ...defaults, deletions: true }, s, t, b).held.length, 1);
  assert.throws(
    () => plan(defaults, { ...s, complete: false }, t, b),
    /incomplete/,
  );
});
test("scoped dry run, one-way delivery, hash verification, idempotence and undo", async () => {
  const { engine, source, target, applier, disk, status } = fixture();
  source.data.set("a.md", bytes("reference"));
  target.data.set("a.md", bytes("local"));
  const dry = await engine.run(defaults, source, target, true);
  assert.equal(dry.changed, 0);
  assert.equal(disk.data.size, 0);
  await engine.run(defaults, source, target, false, dry.plan);
  assert.equal(text(await target.download("a.md")), "reference");
  assert.equal((await engine.run(defaults, source, target, false)).changed, 0);
  await applier.undo(
    JSON.stringify(["local", "content", "reference", "target"]),
    target,
  );
  assert.equal(text(await target.download("a.md")), "local");
  assert.equal(status.phase, "done");
});
test("mismatched staged source never writes, mid-apply exception rolls prior writes back", async () => {
  const { source, target, engine, applier, disk } = fixture();
  source.data.set("a", bytes("one"));
  source.data.set("b", bytes("two"));
  target.data.set("a", bytes("original"));
  const { plan: dry } = await engine.run(defaults, source, target, true);
  source.data.set("b", bytes("changed"));
  await assert.rejects(
    applier.apply(defaults, dry, source, target, "key", "target"),
    /referenceChanged/,
  );
  assert.equal(disk.data.size, 0);
  assert.equal(text(await target.download("a")), "original");
  target.fail = "b";
  await assert.rejects(engine.run(defaults, source, target, false), /fixture/);
  assert.equal(text(await target.download("a")), "original");
  assert.ok(!target.data.has("b"));
});
test("crash between mutation and completion marker restores before-image on restart", async () => {
  const { journal, applier, target, disk } = fixture();
  const id = crypto.randomUUID();
  const t: Transaction = {
    version: 1,
    id,
    key: "k",
    target: "target",
    scope: "content",
    before: fresh(),
    steps: [{ path: "a", action: "write" }],
  };
  await journal.begin(t);
  await journal.backup(id, 0, bytes("before"));
  target.data.set("a", bytes("interrupted"));
  await applier.recover(() => target);
  await applier.recover(() => target);
  assert.equal(text(await target.download("a")), "before");
  assert.ok(await disk.has(id + "/rolled-back"));
});
test("publisher uses the same source-to-target algorithm with endpoints exchanged", async () => {
  const { engine, source, target } = fixture();
  target.data.set("note", bytes("from publisher"));
  await engine.run({ ...defaults, role: "publisher" }, source, target, false);
  assert.equal(text(await source.download("note")), "from publisher");
});
test("live hot settings can change after preview and undo restores their actual before-image", async () => {
  const { engine, source, target, applier } = fixture();
  const p: Profile = { ...defaults, scope: "settings" };
  source.data.set("appearance.json", bytes('{"theme":"new"}'));
  target.data.set("appearance.json", bytes("{}"));
  const dry = await engine.run(p, source, target, true);
  target.data.set(
    "appearance.json",
    bytes('{"theme":"changed during review"}'),
  );
  await engine.run(p, source, target, false, dry.plan);
  target.data.set("appearance.json", bytes('{"theme":"local drift"}'));
  assert.equal((await engine.run(p, source, target, false)).changed, 0);
  await applier.undo(
    JSON.stringify([p.id, p.scope, source.id, target.id]),
    target,
  );
  assert.equal(
    text(await target.download("appearance.json")),
    '{"theme":"changed during review"}',
  );
});
test("an overlapping run cannot enter scanning or application", async () => {
  const { engine, source, target } = fixture();
  await engine.exclusive(async () => {
    await assert.rejects(engine.run(defaults, source, target, false), /busy/);
  });
  assert.equal((await engine.run(defaults, source, target, true)).changed, 0);
});
test("settings scanner ignores workspace variants and never reads hot target files for drift", async () => {
  const store = new Memory("target");
  store.data.set("Workspace.json", bytes("{}"));
  store.data.set("app.json", bytes("{}"));
  store.download = async () => {
    throw Error("unexpected content read");
  };
  const result = await scan(store, "settings", ".custom", "refsync", true);
  assert.deepEqual([...result.files.keys()], ["app.json"]);
});
test("the content scope cannot be pointed inside a hidden service directory", () => {
  for (const local of [".git", "folder/.sync-trash", "node_modules/demo"])
    assert.ok(
      validate({ ...defaults, local }, true, false, "custom-config").some(
        (e) => e.code === "protected",
      ),
    );
});
test("a file removed on both sides no longer owns a new local file at the same path", async () => {
  const { engine, source, target } = fixture();
  const profile = { ...defaults, deletions: true };
  source.data.set("keep", bytes("keep"));
  source.data.set("old", bytes("delivered"));
  await engine.run(profile, source, target, false);
  source.data.delete("old");
  target.data.delete("old");
  await engine.run(profile, source, target, false);
  target.data.set("old", bytes("private"));
  const result = await engine.run(profile, source, target, false);
  assert.equal(result.changed, 0);
  assert.equal(text(await target.download("old")), "private");
});
