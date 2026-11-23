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
  async removeEmptyDir(p: string) {
    const l = await this.list(p);
    if (l.files.length || l.folders.length) return false;
    return this.folders.delete(p);
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
      { ...defaults, reference: defaults.local.toUpperCase() + "/sub" },
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
      .action,
    "retain",
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

import { loadProfiles, newProfile } from "../src/profiles";
import {
  QuietWindow,
  RunBudget,
  NoticeCenter,
  Scheduler,
  sleep,
  eventPath,
} from "../src/runtime";
test("M1 migration retains the baseline key, endpoints and manual settings; new IDs are distinct", () => {
  const {
    profiles: [p],
    current,
  } = loadProfiles({
    profile: {
      id: "old",
      local: "vault-copy",
      reference: "vault-source",
      role: "publisher",
    },
  });
  assert.equal(p.id, current);
  assert.equal(current, "old");
  assert.equal(p.role, "publisher");
  assert.equal(p.local, "vault-copy");
  assert.equal(p.intervalMinutes, 0);
  assert.equal(p.startup, false);
  const clone = newProfile(p);
  assert.notEqual(clone.id, p.id);
  assert.equal(clone.enabled, false);
  const config = loadProfiles({
    profiles: [clone, p],
    current: p.id,
    mode: "silent",
    paused: true,
  });
  assert.deepEqual(loadProfiles(config), config);
  assert.throws(() => loadProfiles({ profiles: [p, p] }));
});
test("selected conflict action, unchecked path and unreviewed addition survive a later run", async () => {
  const { engine, source, target } = fixture();
  const p = { ...defaults };
  for (const path of ["a", "b"]) source.data.set(path, bytes("reference"));
  target.data.set("a", bytes("local"));
  const dry = await engine.run(p, source, target, true);
  source.data.set("c", bytes("new"));
  await engine.run(p, source, target, false, dry.plan, {
    choices: new Map([
      ["a", "retain"],
      ["b", "skip"],
    ]),
  });
  assert.equal(text(await target.download("a")), "local");
  assert.ok(!target.data.has("b") && !target.data.has("c"));
  const later = await engine.run(p, source, target, false);
  assert.equal(later.changed, 2);
});
test("held deletions require explicit confirmation per path even in full mirror", async () => {
  const { engine, source, target } = fixture(),
    p = { ...defaults, mirror: "full" as const, deletions: true };
  target.data.set("one", bytes("1"));
  target.data.set("two", bytes("2"));
  const dry = await engine.run(p, source, target, true);
  assert.equal(dry.plan.held.length, 2);
  const run = await engine.run(p, source, target, false, dry.plan, {
    release: new Set(["one"]),
  });
  assert.equal(run.changed, 1);
  assert.ok(target.data.has("two"));
  assert.deepEqual(run.plan.held, ["two"]);
});
test("failed reads, content filters and large files never turn into mirror deletions", async () => {
  const { engine, source, target } = fixture();
  for (const path of ["ok.md", "locked.md", "large.md", "private.txt"]) {
    source.data.set(path, bytes("source"));
    target.data.set(path, bytes("local"));
  }
  source.data.set("large.md", new ArrayBuffer(1048577));
  const get = source.download.bind(source);
  source.download = async (p) => {
    if (p === "locked.md") throw Error("EBUSY");
    return get(p);
  };
  const run = await engine.run(
    {
      ...defaults,
      mirror: "full",
      deletions: true,
      include: "**/*.md",
      maxMiB: 1,
    },
    source,
    target,
    false,
    undefined,
    { budget: new RunBudget(undefined, 100, []) },
  );
  assert.equal(run.changed, 1);
  assert.deepEqual(run.plan.deferred, [
    { path: "locked.md", reason: "locked" },
  ]);
  for (const p of ["locked.md", "large.md", "private.txt"])
    assert.equal(text(await target.download(p)), "local");
});
test("a busy destination has bounded retries while unrelated files commit and undo independently", async () => {
  const { engine, source, target, applier } = fixture();
  for (const path of ["a", "b"]) {
    source.data.set(path, bytes("updated"));
    target.data.set(path, bytes("old"));
  }
  let attempts = 0;
  const put = target.upload.bind(target);
  target.upload = async (p, b) => {
    if (p === "a") {
      attempts++;
      throw Error("EACCES");
    }
    return put(p, b);
  };
  const result = await engine.run(defaults, source, target, false, undefined, {
    budget: new RunBudget(undefined, 50, [1, 1]),
  });
  assert.equal(attempts, 3);
  assert.equal(result.changed, 1);
  assert.deepEqual(result.plan.deferred, [{ path: "a", reason: "locked" }]);
  assert.equal(text(await target.download("a")), "old");
  target.data.set("a", bytes("later edit"));
  await applier.undo(
    JSON.stringify(["local", "content", "reference", "target"]),
    target,
  );
  assert.equal(text(await target.download("a")), "later edit");
  assert.equal(text(await target.download("b")), "old");
});
test("a timed-out write fences new mutations until it settles and recovery restores its before-image", async () => {
  const { engine, source, target, applier } = fixture();
  source.data.set("one", bytes("source"));
  target.data.set("one", bytes("old"));
  const put = target.upload.bind(target);
  let release!: () => void;
  target.upload = async (p, b) => {
    await new Promise<void>((ok) => {
      release = ok;
    });
    await put(p, b);
  };
  await assert.rejects(
    engine.run(defaults, source, target, false, undefined, {
      budget: new RunBudget(undefined, 15, [], applier.fence),
    }),
    /settling/,
  );
  await assert.rejects(
    applier.recover(() => target),
    /settling/,
  );
  target.upload = put;
  release();
  await sleep(5);
  await applier.recover(() => target);
  assert.equal(text(await target.download("one")), "old");
});
test("quiet editor rules defer only that file and force it after the configured limit", async () => {
  const { engine, source, target } = fixture(),
    window = new QuietWindow();
  const p = { ...defaults, maxDeferrals: 2, quietSeconds: 10 };
  for (const path of ["editing", "other"]) source.data.set(path, bytes("v1"));
  window.edited(p.local + "/editing", 100);
  const opts = { quiet: (path: string) => window.check(p, path, true, 110) };
  const first = await engine.run(p, source, target, false, undefined, opts);
  assert.equal(first.changed, 1);
  assert.equal(first.plan.deferred[0].path, "editing");
  assert.equal(
    (await engine.run(p, source, target, false, undefined, opts)).changed,
    0,
  );
  assert.equal(
    (await engine.run(p, source, target, false, undefined, opts)).changed,
    1,
  );
});
test("events match only eligible roots, coalesce repeated requests and preserve cross-profile serialization", async () => {
  assert.ok(
    eventPath({ ...defaults, fileEvents: true }, defaults.reference + "/a.md"),
  );
  assert.ok(
    !eventPath(
      { ...defaults, fileEvents: true },
      defaults.reference + "2/a.md",
    ),
  );
  assert.ok(
    !eventPath(
      { ...defaults, fileEvents: true, scope: "settings" },
      "app.json",
    ),
  );
  const log: string[] = [];
  let completed!: () => void;
  const bothFinished = new Promise<void>((resolve) => {
    completed = resolve;
  });
  const scheduler = new Scheduler(
    async (id) => {
      log.push(id + "+");
      await sleep(2);
      log.push(id + "-");
      if (id === "b") completed();
    },
    (e) => assert.fail(String(e)),
  );
  scheduler.schedule("a", 1);
  scheduler.schedule("a", 1);
  scheduler.schedule("b", 1);
  await bothFinished;
  assert.deepEqual(log, ["a+", "a-", "b+", "b-"]);
  scheduler.schedule("c", 10);
  scheduler.stop();
  await sleep(15);
  assert.equal(log.length, 4);
});
test("notices are deduplicated by reason and profile until the notification window expires", () => {
  let now = 0;
  const messages: string[] = [],
    center = new NoticeCenter(
      (s) => messages.push(s),
      () => now,
    );
  center.send("p:busy", "p");
  center.send("p:busy", "p");
  center.send("q:busy", "q");
  now = 60001;
  center.send("p:busy", "p");
  assert.deepEqual(messages, ["p", "q", "p"]);
});

import {
  legacyConfig,
  preset,
  inScope,
  mobileExcluded,
} from "../src/config-scope";
import {
  deliveryBytes,
  settingsHash,
  project,
  parseOverlay,
} from "../src/json-overlay";
import { verifySettings } from "../src/verify-settings";
import { safe } from "../src/model";
import { canAutoReload } from "../src/reload-manager";
test("Windows reserved device aliases, alternate streams, drive paths, trailing dots and spaces", () => {
  for (const name of [
    "aux.txt",
    "notes/COM¹.md",
    "LPT²",
    "CONOUT$",
    "CONIN$.md",
    "vault/C:/n",
    "a:stream",
    "file. ",
    "foo/bar.",
    "C:\\Notes",
  ])
    assert.equal(safe(name), false, name);
  for (const name of ["Книга/Заметка  №1.md", "notes/COM10.md", "foo.bar/baz"])
    assert.ok(safe(name), name);
});
test("case and Unicode collisions protect both sides of a full mirror; other files proceed", async () => {
  const { engine, source, target } = fixture();
  source.data.set("A.md", bytes("one"));
  source.data.set("ok", bytes("safe"));
  target.data.set("a.md", bytes("local"));
  source.data.set("é", bytes("one"));
  source.data.set("e\u0301", bytes("two"));
  source.data.set("CON.txt", bytes("invalid"));
  const r = await engine.run(
    { ...defaults, mirror: "full", deletions: true },
    source,
    target,
    false,
  );
  assert.equal(r.changed, 1);
  assert.equal(text(await target.download("a.md")), "local");
  assert.equal(text(await target.download("ok")), "safe");
  assert.ok(r.plan.deferred.length >= 3);
});
test("semantic JSON overlays preserve device-specific fields including wildcard array members", async () => {
  const rules = parseOverlay(
    "plugins/*/data.json => $.accounts[*].token\nplugins/*/data.json => local.device",
  );
  const projection = { rules, self: "refsync", blocked: [] },
    p = "plugins/demo/data.json";
  const source = bytes(
      '{"accounts":[{"label":"new","token":"remote"}],"view":2}',
    ),
    local = bytes(
      '{"accounts":[{"token":"local"}],"local":{"device":"PC","unused":true}}',
    );
  const payload = JSON.parse(text(deliveryBytes(p, source, projection, local)));
  assert.deepEqual(payload, {
    accounts: [{ label: "new", token: "local" }],
    view: 2,
    local: { device: "PC" },
  });
  assert.equal(
    await settingsHash(p, source, projection),
    await settingsHash(p, bytes(JSON.stringify(payload)), projection),
  );
  assert.ok(!text(project(p, source, projection)).includes("remote"));
  assert.throws(() => parseOverlay("x => a..b"));
  const a = bytes('\uFEFF{ "b":2,\r\n"a":1}'),
    b = bytes('{"a":1,"b":2}');
  assert.equal(
    await settingsHash("app.json", a, projection),
    await settingsHash("app.json", b, projection),
  );
  assert.deepEqual(
    JSON.parse(
      text(
        deliveryBytes(
          "community-plugins.json",
          bytes('["pc","sample"]'),
          { ...projection, blocked: ["pc"] },
          bytes('["refsync"]'),
        ),
      ),
    ),
    ["refsync", "sample"],
  );
});
test("M2 migration retains the old settings scope and manual triggers", () => {
  const m = loadProfiles({ profiles: [{ ...defaults, scope: "settings" }] });
  const cfg = m.profiles[0].config!;
  assert.ok(!cfg.categories.includes("code"));
  assert.ok(!inScope("themes/theme/other.css", cfg, false));
  assert.equal(m.profiles[0].intervalMinutes, 0);
  assert.ok(!m.profiles[0].startup);
});
test("settings category, code/data filters, semantic baseline, read-only restart check and raw undo", async () => {
  const { source, target, engine, applier, journal } = fixture();
  const config = {
    ...legacyConfig(),
    categories: preset("full"),
    strategy: "batch" as const,
    codeAllow: "fixture",
    overlay: "plugins/*/data.json => device",
  };
  for (const fs of [source, target])
    for (const dir of [
      "plugins",
      "plugins/fixture",
      "plugins/refsync",
      "plugins/other",
    ])
      fs.folders.add(dir);
  const data = "plugins/fixture/data.json",
    code = "plugins/fixture/main.js";
  for (const [p, v] of [
    [data, '{"value":2,"device":"foreign"}'],
    [code, "// sample"],
    ["plugins/refsync/main.js", "self"],
    ["plugins/other/main.js", "other"],
  ])
    source.data.set(p, bytes(v));
  target.data.set(data, bytes('{"value":1,"device":"Windows"}'));
  const p: Profile = { ...defaults, scope: "settings", config };
  const r = await engine.run(p, source, target, false);
  assert.equal(r.changed, 2);
  assert.ok(
    !target.data.has("plugins/refsync/main.js") &&
      !target.data.has("plugins/other/main.js"),
  );
  assert.deepEqual(JSON.parse(text(await target.download(data))), {
    value: 2,
    device: "Windows",
  });
  target.data.set(data, bytes('{"value":1,"device":"updated"}'));
  const fix = await verifySettings(
    journal,
    () => target,
    () => config,
  );
  assert.equal(fix[0].repaired, 0);
  assert.deepEqual(fix[0].unresolved, [data]);
  assert.deepEqual(JSON.parse(text(await target.download(data))), {
    value: 1,
    device: "updated",
  });
  assert.deepEqual(
    await verifySettings(
      journal,
      () => target,
      () => config,
    ),
    [],
  );
  await applier.undo(
    JSON.stringify([p.id, p.scope, source.id, target.id]),
    target,
  );
  assert.equal(
    text(await target.download(data)),
    '{"value":1,"device":"Windows"}',
  );
  assert.ok(!target.data.has(code));
});
test("mobile source and installed manifests exclude desktop-only plugins; automatic reloads are limited", async () => {
  const { source, target } = fixture();
  source.folders.add("plugins");
  source.folders.add("plugins/desktop");
  source.data.set(
    "plugins/desktop/manifest.json",
    bytes('{"isDesktopOnly":true}'),
  );
  assert.deepEqual(await mobileExcluded(source, target, new RunBudget()), [
    "desktop",
  ]);
  const now = 10_000_000;
  assert.equal(canAutoReload([now - 100], now), false);
  assert.ok(canAutoReload([now - 600000], now));
  assert.ok(!canAutoReload([now - 600000, now - 900000], now));
});

test("a fresh subscriber keeps Sync Studio enabled when the community plugin list has not yet been saved", async () => {
  const { source, target, engine } = fixture(),
    path = "community-plugins.json";
  source.data.set(path, bytes('["fixture"]'));
  const p: Profile = {
    ...defaults,
    scope: "settings",
    mirror: "full",
    deletions: true,
  };
  await engine.run(p, source, target, false);
  assert.deepEqual(JSON.parse(text(await target.download(path))), [
    "fixture",
    "refsync",
  ]);
  source.data.delete(path);
  source.data.set("app.json", bytes("{}"));
  const dry = await engine.run(p, source, target, true);
  assert.ok(
    !dry.plan.ops.some((o) => o.path === path && o.action === "delete"),
  );
  assert.ok(!dry.plan.held.includes(path));
});

import { GoogleTree } from "../src/public-cloud";
import { PublicStore } from "../src/public-store";
test("public mirror aborts before any mutation on a broken page, or if a deletion candidate reappears", async () => {
  const { engine, target, disk } = fixture();
  const p: Profile = {
    ...defaults,
    access: "public",
    remote: { engine: "google", url: "root", branch: "" },
    reference: "/",
    mirror: "full",
    deletions: true,
    maxDeletePercent: 100,
    deleteGrace: 100,
  };
  target.data.set("keep.md", bytes("original"));
  for (const incomplete of [true, false]) {
    let visits = 0;
    const store = new PublicStore(
      "drive",
      new GoogleTree(
        async (url) => {
          let obj = {};
          if (url.includes("/files/root"))
            obj = {
              id: "root",
              mimeType: "application/vnd.google-apps.folder",
            };
          else if (url.includes("/files/a?"))
            return { status: 200, headers: {}, arrayBuffer: bytes("A") };
          else if (url.includes("pageToken="))
            obj = { incompleteSearch: true, files: [] };
          else {
            visits++;
            const files = [
              {
                id: "a",
                name: "new.md",
                size: "1",
                mimeType: "text/plain",
                modifiedTime: "2025-01-01T00:00:00Z",
              },
            ];
            if (visits > 1)
              files.push({ ...files[0], id: "b", name: "keep.md" });
            obj = { files, ...(incomplete ? { nextPageToken: "more" } : {}) };
          }
          return {
            status: 200,
            headers: {},
            arrayBuffer: bytes(JSON.stringify(obj)),
          };
        },
        "root",
        "key",
        "",
      ),
    );
    await assert.rejects(
      engine.run(p, store, target, false),
      incomplete ? /incomplete/ : /referenceChanged/,
    );
    assert.equal(text(target.data.get("keep.md")!), "original");
    assert.equal(target.data.size, 1);
    assert.equal(disk.data.size, 0);
  }
});

test("the silent deletion safeguard defaults on for new and upgraded profiles", () => {
  assert.equal(newProfile().silentDeletionSafeguard, true);
  for (const raw of [
    { profile: { id: "old" } },
    { profiles: [{ id: "old" }] },
  ]) {
    assert.equal(loadProfiles(raw).profiles[0].silentDeletionSafeguard, true);
  }
  const p = { ...defaults, silentDeletionSafeguard: false };
  assert.equal(
    loadProfiles({ profiles: [p] }).profiles[0].silentDeletionSafeguard,
    false,
  );
  assert.equal(newProfile(p).silentDeletionSafeguard, false);
});

test("silent opt-out releases every eligible deletion for each mass deletion trigger", () => {
  const source = snap({ a: "a" }),
    target = snap({ a: "a", b: "b", c: "c" });
  const profile = {
    ...defaults,
    mirror: "full" as const,
    deletions: true,
    maxDeleteCount: 10,
    maxDeletePercent: 100,
    deleteGrace: 0,
  };
  for (const [src, priorSize, settings] of [
    [source, 1, { maxDeleteCount: 1 }],
    [source, 1, { maxDeletePercent: 25 }],
    [source, 5, { shrinkPercent: 40 }],
    [snap({}), 0, {}],
  ] as const) {
    const base = { ...fresh(), size: priorSize };
    const p = { ...profile, ...settings };
    const eligible = [...target.files.keys()].filter(
      (path) => !src.files.has(path),
    );
    for (const mode of ["silent", "plan"] as const) {
      for (const safeguard of [true, false]) {
        const result = plan(
          { ...p, silentDeletionSafeguard: safeguard },
          src,
          target,
          base,
          undefined,
          mode,
        );
        const guarded = mode === "plan" || safeguard;
        assert.deepEqual(result.held, guarded ? eligible : []);
        assert.deepEqual(
          result.ops
            .filter((op) => op.action === "delete")
            .map((op) => op.path),
          guarded ? [] : eligible,
        );
      }
    }
  }
});

test("silent deletion opt-out honors preserve mode, filters, and incomplete sources", async () => {
  const { engine, source, target } = fixture();
  const profile = {
    ...defaults,
    deletions: true,
    silentDeletionSafeguard: false,
    exclude: "keep.*",
    maxDeleteCount: 0,
    maxDeletePercent: 0,
    deleteGrace: 0,
  };
  const silent = { mode: "silent" as const };
  source.data.set("delivered.md", bytes("delivered"));
  target.data.set("local.md", bytes("local"));
  target.data.set("keep.md", bytes("keep"));
  await engine.run(profile, source, target, false, undefined, silent);
  source.data.clear();
  const disabled = await engine.run(
    { ...profile, deletions: false },
    source,
    target,
    true,
    undefined,
    silent,
  );
  assert.equal(disabled.plan.ops.length, 0);
  const dry = await engine.run(
    profile,
    source,
    target,
    true,
    undefined,
    silent,
  );
  assert.deepEqual(
    dry.plan.ops.map((op) => [op.action, op.path]),
    [["delete", "delivered.md"]],
  );
  assert.equal(target.data.size, 3);
  await engine.run(profile, source, target, false, undefined, silent);
  assert.deepEqual([...target.data.keys()].sort(), ["keep.md", "local.md"]);
  const bad = fixture();
  bad.target.data.set("local.md", bytes("local"));
  bad.source.list = async () => {
    throw Error("incomplete");
  };
  await assert.rejects(
    bad.engine.run(
      { ...profile, mirror: "full" },
      bad.source,
      bad.target,
      false,
      undefined,
      silent,
    ),
    /incomplete/,
  );
  assert.equal(bad.target.data.size, 1);
  assert.equal(bad.disk.data.size, 0);
});

import {
  readManifest,
  manifestPath,
  buildManifest,
  manifestBytes,
} from "../src/cloud-manifest";
test("cloud publication journals both manifest writes, verifies a subscription and undoes the cloud target", async () => {
  const { engine, source: remote, target: local, state } = fixture();
  const cloud = {
    engine: "yandex" as const,
    account: "a".repeat(64),
    root: "app:/",
  };
  const p: Profile = {
    ...defaults,
    access: "oauth",
    cloud,
    scope: "settings",
    role: "publisher",
    reference: "Settings",
  };
  local.data.set("app.json", bytes('{"font":1}'));
  const events: string[] = [];
  const put = remote.upload.bind(remote);
  remote.upload = async (path, data) => {
    events.push(path);
    await put(path, data);
  };
  await engine.run(p, remote, local, false);
  assert.deepEqual(events, [manifestPath, "app.json", manifestPath]);
  const manifest = await readManifest(remote);
  assert.deepEqual(
    manifest?.files.map((f) => f.path),
    ["app.json"],
  );
  assert.equal(manifest?.files[0].hash, await hash(bytes('{"font":1}')));
  const key = JSON.stringify([p.id, p.scope, local.id, remote.id]);
  assert.ok(state.get(key).lastRun);
  const t = (await engine.applier.journal.transactions()).find(
    (t) => t.key === key,
  )!;
  assert.deepEqual(t.cloud, cloud);
  assert.equal(t.target, p.reference);
  const copy = new Memory("another-vault");
  const subscriber = { ...p, role: "subscriber" as const };
  await engine.run(subscriber, remote, copy, false);
  assert.equal(text(copy.data.get("app.json")!), '{"font":1}');
  await engine.applier.undo(key, remote);
  assert.equal(remote.data.size, 0);
});
test("a failed publication restores its original cloud files and manifest", async () => {
  const { engine, source: remote, target: local } = fixture();
  const p: Profile = {
    ...defaults,
    access: "oauth",
    cloud: { engine: "google", account: "0".repeat(64), root: "root" },
    scope: "settings",
    role: "publisher",
    reference: "Settings",
  };
  remote.data.set("app.json", bytes('{"old":true}'));
  local.data.set("app.json", bytes('{"new":true}'));
  const old = await buildManifest(
    await scan(remote, "settings", ".obsidian", "refsync"),
    "other",
  );
  remote.data.set(manifestPath, old);
  const put = remote.upload.bind(remote);
  let fail = true;
  remote.upload = async (path, data) => {
    if (path === manifestPath && JSON.parse(text(data)).files && fail) {
      fail = false;
      throw Error("quota");
    }
    await put(path, data);
  };
  await assert.rejects(engine.run(p, remote, local, false), /quota/);
  assert.equal(text(remote.data.get("app.json")!), '{"old":true}');
  assert.deepEqual(remote.data.get(manifestPath), old);
});
test("an interrupted, incomplete or changing manifest aborts a silent unguarded mirror", async () => {
  const { engine, source: remote, target: local } = fixture();
  const p: Profile = {
    ...defaults,
    access: "oauth",
    cloud: { engine: "google", account: "0".repeat(64), root: "root" },
    reference: "/",
    mirror: "full",
    deletions: true,
    silentDeletionSafeguard: false,
  };
  remote.data.set("new.md", bytes("new"));
  local.data.set("keep.md", bytes("keep"));
  const incomplete = await buildManifest(
    await scan(new Memory("empty"), "content", ".obsidian", "refsync"),
    "a",
  );
  for (const content of [
    manifestBytes({ schemaVersion: 1, publishing: true }),
    incomplete,
  ]) {
    remote.data.set(manifestPath, content);
    await assert.rejects(
      engine.run(p, remote, local, false, undefined, { mode: "silent" }),
      /manifestInvalid|manifestMismatch/,
    );
    assert.deepEqual([...local.data.keys()], ["keep.md"]);
  }
  remote.data.delete(manifestPath);
  const good = await buildManifest(
    await scan(remote, "content", ".obsidian", "refsync"),
    "a",
  );
  remote.data.set(manifestPath, good);
  const get = remote.download.bind(remote);
  let hits = 0;
  remote.download = async (path) => {
    if (path === "new.md" && ++hits === 2)
      remote.data.set(manifestPath, incomplete);
    return get(path);
  };
  await assert.rejects(
    engine.run(p, remote, local, false, undefined, { mode: "silent" }),
    /referenceChanged/,
  );
  assert.deepEqual([...local.data.keys()], ["keep.md"]);
});

test("an unavailable cloud account defers only its own recovery and resumes with the same journal", async () => {
  const { engine, target, journal } = fixture(),
    id = crypto.randomUUID(),
    cloud = {
      engine: "yandex" as const,
      root: "app:/",
      account: "0".repeat(64),
    };
  const t: Transaction = {
    id,
    scope: "content",
    version: 1,
    target: "Published",
    key: JSON.stringify(["p", "content", "vault:notes", "account-bound-cloud"]),
    cloud,
    before: fresh(),
    steps: [{ path: "one.md", action: "write" }],
  };
  await journal.begin(t);
  await journal.backup(id, 0, bytes("before"));
  await journal.disk.putNew(
    id + "/after/0",
    manifestBytes(await hash(bytes("after"))),
  );
  target.data.set("one.md", bytes("after"));
  await engine.applier.recover(() => {
    throw Error("loginRequired");
  });
  assert.deepEqual([...engine.applier.pendingTargets], ["account-bound-cloud"]);
  assert.equal(await journal.disk.has(id + "/rolled-back"), false);
  assert.equal(text(target.data.get("one.md")!), "after");
  await engine.applier.recover((tx) => {
    assert.deepEqual(tx.cloud, cloud);
    return target;
  });
  assert.equal(engine.applier.pendingTargets.size, 0);
  assert.equal(text(target.data.get("one.md")!), "before");
  assert.ok(await journal.disk.has(id + "/rolled-back"));
});
test("cloud rollback preserves a concurrent edit and remains resumable", async () => {
  const { engine, target, journal } = fixture(),
    id = crypto.randomUUID(),
    cloud = {
      engine: "google" as const,
      root: "root",
      account: "0".repeat(64),
    };
  const t: Transaction = {
    id,
    scope: "content",
    version: 1,
    target: "Notes",
    key: JSON.stringify(["p", "content", "vault:notes", "private"]),
    cloud,
    before: fresh(),
    steps: [{ path: "note.md", action: "write" }],
  };
  await journal.begin(t);
  await journal.backup(id, 0, bytes("before"));
  await journal.disk.putNew(
    id + "/after/0",
    manifestBytes(await hash(bytes("published"))),
  );
  target.data.set("note.md", bytes("concurrent"));
  await engine.applier.recover(() => target);
  assert.equal(text(target.data.get("note.md")!), "concurrent");
  assert.ok(engine.applier.pendingTargets.has("private"));
  target.data.set("note.md", bytes("published"));
  await engine.applier.recover(() => target);
  assert.equal(text(target.data.get("note.md")!), "before");
  assert.ok(await journal.disk.has(id + "/rolled-back"));
});

test("folder-only plans, nested mass deletion and undo restore the directory tree", async () => {
  const { engine, source, target } = fixture(),
    p = {
      ...defaults,
      mirror: "full" as const,
      deletions: true,
      silentDeletionSafeguard: false,
    },
    silent = { mode: "silent" as const };
  for (const dir of [
    "Old",
    "Old/Sub",
    "Old/Empty",
    "Shared",
    "OnlyLocalEmpty",
    "Hidden",
  ])
    target.folders.add(dir);
  target.data.set("Old/Sub/a.md", bytes("old"));
  target.data.set("Shared/extra.md", bytes("extra"));
  target.data.set("Hidden/.local", bytes("protected"));
  for (const dir of ["Shared", "New", "New/Empty"]) source.folders.add(dir);
  const before = [...target.folders].sort();
  const dry = await engine.run(p, source, target, true, undefined, silent);
  const actions = dry.plan.ops.map((o) => o.action + " " + o.path);
  for (const d of ["Old", "Old/Sub", "Old/Empty", "OnlyLocalEmpty"])
    assert.ok(actions.includes("rmdir " + d));
  assert.ok(
    actions.indexOf("delete Old/Sub/a.md") < actions.indexOf("rmdir Old/Sub"),
  );
  assert.ok(actions.indexOf("rmdir Old/Sub") < actions.indexOf("rmdir Old"));
  assert.ok(!actions.includes("rmdir Hidden"));
  assert.deepEqual([...target.folders].sort(), before);
  await engine.run(p, source, target, false, undefined, silent);
  assert.deepEqual([...target.folders].sort(), [
    "",
    "Hidden",
    "New",
    "New/Empty",
    "Shared",
  ]);
  assert.deepEqual([...target.data.keys()], ["Hidden/.local"]);
  assert.equal(
    (await engine.run(p, source, target, false, undefined, silent)).changed,
    0,
  );
  await engine.applier.undo(
    JSON.stringify([p.id, p.scope, source.id, target.id]),
    target,
  );
  assert.deepEqual([...target.folders].sort(), before);
  assert.equal(text(target.data.get("Old/Sub/a.md")!), "old");
});
test("preserve profiles clean owned directories, including pre-upgrade file baselines, and keep unrelated empty directories", async () => {
  const { engine, source, target, state } = fixture(),
    p = { ...defaults, deletions: true, silentDeletionSafeguard: false },
    silent = { mode: "silent" as const };
  target.folders.add("Personal");
  source.folders.add("Owned");
  source.data.set("Owned/n.md", bytes("n"));
  await engine.run(p, source, target, false, undefined, silent);
  const key = JSON.stringify([p.id, p.scope, source.id, target.id]);
  const legacy = state.get(key);
  assert.deepEqual(legacy.folders, ["Owned"]);
  delete legacy.folders;
  state.put(key, legacy);
  source.data.clear();
  source.folders.delete("Owned");
  await engine.run(
    { ...p, deletions: false },
    source,
    target,
    false,
    undefined,
    silent,
  );
  assert.ok(target.folders.has("Owned"));
  await engine.run(p, source, target, false, undefined, silent);
  assert.deepEqual([...target.folders].sort(), ["", "Personal"]);
});
test("directory holds, review selection and a late local child never cause recursive removal", async () => {
  const { engine, source, target } = fixture(),
    p = { ...defaults, mirror: "full" as const, deletions: true };
  target.folders.add("Gone");
  target.data.set("Gone/a.md", bytes("a"));
  const dry = await engine.run(p, source, target, true);
  assert.ok(dry.plan.held.includes("Gone"));
  assert.deepEqual(dry.plan.heldFolders, ["Gone"]);
  const r = await engine.run(p, source, target, false, dry.plan, {
    release: new Set(["Gone"]),
  });
  assert.ok(r.plan.deferred.some((d) => d.path === "Gone"));
  assert.ok(target.data.has("Gone/a.md"));
  assert.ok(target.folders.has("Gone"));
  const remove = target.removeEmptyDir.bind(target);
  target.removeEmptyDir = async (d) => {
    target.data.set("Gone/new.md", bytes("user"));
    return remove(d);
  };
  await engine.run(p, source, target, false, dry.plan, {
    release: new Set(dry.plan.held),
  });
  assert.ok(target.folders.has("Gone"));
  assert.deepEqual([...target.data.keys()], ["Gone/new.md"]);
});
test("excluded paths remain intact; unchecking a new folder skips its subtree", async () => {
  const { engine, source, target } = fixture(),
    p = {
      ...defaults,
      mirror: "full" as const,
      deletions: true,
      exclude: "Keep/**",
      silentDeletionSafeguard: false,
    },
    silent = { mode: "silent" as const };
  for (const d of ["Add", "Add/Nested"]) source.folders.add(d);
  source.data.set("Add/Nested/t.md", bytes("note"));
  target.folders.add("Keep");
  target.folders.add("Keep/Sub");
  target.data.set("Keep/Sub/image.png", bytes("protected"));
  const dry = await engine.run(p, source, target, true, undefined, silent);
  assert.ok(!dry.plan.ops.some((o) => o.path.startsWith("Keep")));
  await engine.run(p, source, target, false, dry.plan, {
    ...silent,
    choices: new Map([["Add", "skip"]]),
  });
  assert.ok(!target.folders.has("Add"));
  assert.ok(target.folders.has("Keep/Sub"));
});
test("a folder-only cloud publication changes the manifest revision and can be undone", async () => {
  const { engine, source: remote, target: local } = fixture(),
    p: Profile = {
      ...defaults,
      access: "oauth",
      role: "publisher",
      reference: "Settings",
      scope: "settings",
      cloud: { engine: "google", account: "a".repeat(64), root: "root" },
    };
  local.folders.add("snippets");
  local.folders.add("snippets/Empty");
  await engine.run(p, remote, local, false);
  const first = await readManifest(remote);
  assert.deepEqual(first?.directories, ["snippets", "snippets/Empty"]);
  const sub = new Memory("sub");
  await engine.run({ ...p, role: "subscriber" }, remote, sub, false);
  assert.ok(sub.folders.has("snippets/Empty"));
  local.folders.delete("snippets/Empty");
  await engine.run(
    { ...p, deletions: true, silentDeletionSafeguard: false },
    remote,
    local,
    false,
    undefined,
    { mode: "silent" },
  );
  const after = await readManifest(remote);
  assert.notEqual(first?.revision, after?.revision);
  assert.deepEqual(after?.directories, ["snippets"]);
  await engine.applier.undo(
    JSON.stringify([p.id, p.scope, local.id, remote.id]),
    remote,
  );
  assert.ok(remote.folders.has("snippets/Empty"));
  assert.equal((await readManifest(remote))?.revision, first?.revision);
});
test("crash recovery rebuilds removed directories and keeps later user contents in newly created ones", async () => {
  const { engine, target, journal } = fixture(),
    id = crypto.randomUUID();
  const t: Transaction = {
    version: 1,
    id,
    key: JSON.stringify(["id", "content", "ref", "target"]),
    scope: "content",
    target: "copy",
    before: fresh(),
    steps: [
      { action: "mkdir", path: "New" },
      { action: "rmdir", path: "Old/Child" },
      { action: "rmdir", path: "Old" },
    ],
  };
  await journal.begin(t);
  for (const [index, value] of [null, "folder", "folder"].entries())
    await journal.disk.putNew(id + "/armed/" + index, manifestBytes(value));
  target.folders.add("New");
  target.data.set("New/personal.md", bytes("keep"));
  await engine.applier.recover(() => target);
  assert.deepEqual([...target.folders].sort(), ["", "New", "Old", "Old/Child"]);
  assert.equal(text(target.data.get("New/personal.md")!), "keep");
  await engine.applier.recover(() => target);
  assert.ok(await journal.disk.has(id + "/rolled-back"));
});

import { plainContent, setFolders, folderIncluded } from "../src/content-scope";
test("content settings, hidden files and bulk folder/plugin exclusions in full mirror", async () => {
  const { engine, source, target } = fixture(),
    cfg = engine.configDir,
    plugins = cfg + "/plugins";
  let content = { ...plainContent(), config: true, hidden: true };
  content = setFolders(content, ["Local", plugins + "/private"], false);
  for (const side of [source, target])
    for (const path of [
      cfg,
      plugins,
      plugins + "/private",
      plugins + "/shared",
      plugins + "/refsync",
      "Local",
      ".hidden",
      ".git",
    ])
      side.folders.add(path);
  for (const path of [
    "note.md",
    ".env",
    ".hidden/a",
    cfg + "/app.json",
    plugins + "/shared/main.js",
  ])
    source.data.set(path, bytes("copy"));
  for (const path of [
    plugins + "/refsync/main.js",
    plugins + "/private/data.json",
    "Local/keep",
    ".git/config",
    cfg + "/workspace.json",
    cfg + "/community-plugins.json",
  ])
    target.data.set(path, bytes("keep"));
  const p: Profile = {
    ...defaults,
    content,
    mirror: "full",
    deletions: true,
    silentDeletionSafeguard: false,
  };
  const r = await engine.run(p, source, target, false, undefined, {
    mode: "silent",
  });
  assert.equal(r.operations.length, r.changed);
  for (const path of source.data.keys())
    assert.equal(text(target.data.get(path)!), "copy");
  for (const [path, b] of target.data)
    if (!source.data.has(path)) assert.equal(text(b), "keep");
  assert.ok(!folderIncluded(plugins + "/private", content));
  assert.ok(
    folderIncluded(
      plugins + "/private",
      setFolders(content, [plugins + "/private"], true),
    ),
  );
  assert.deepEqual(loadProfiles(null).profiles, []);
});
test("large disjoint mirror, warm comparison, same-size edit and full diagnosis", async () => {
  const { engine, source, target } = fixture(),
    n = 3000;
  const versions = new WeakMap<Bytes, string>();
  for (const store of [source, target]) {
    const stat = store.stat.bind(store);
    store.stat = async (path: string) => {
      const s = await stat(path),
        b = store.data.get(path);
      if (!s || !b) return s;
      if (!versions.has(b)) versions.set(b, crypto.randomUUID());
      return { ...s, version: versions.get(b) };
    };
  }
  for (let i = 0; i < n; i++) {
    source.data.set("new" + i, bytes("aaa"));
    target.data.set("old" + i, bytes("bbb"));
  }
  const p: Profile = {
    ...defaults,
    mirror: "full",
    deletions: true,
    silentDeletionSafeguard: false,
  };
  const check = (thorough = false) =>
    engine.run(p, source, target, true, undefined, {
      mode: "silent",
      thorough,
    });
  const cold = await check();
  assert.equal(cold.plan.ops.length, 2 * n);
  assert.equal(cold.stats.read, 2 * n);
  const warm = await check();
  assert.equal(warm.stats.read, 0);
  assert.equal(warm.stats.reused, 2 * n);
  source.data.set("new0", bytes("ccc"));
  assert.equal((await check()).stats.read, 1);
  assert.equal((await check(true)).stats.read, 2 * n);
});
test("keeping content configuration in a renamed folder preserves Sync Studio membership", async () => {
  const { engine, source, target } = fixture(),
    cfg = engine.configDir;
  for (const s of [source, target]) s.folders.add(cfg);
  source.data.set(cfg + "/community-plugins.json", bytes('["reader"]'));
  const p = { ...defaults, content: { ...plainContent(), config: true } };
  await engine.run(p, source, target, false);
  assert.deepEqual(
    JSON.parse(text(target.data.get(cfg + "/community-plugins.json")!)),
    ["reader", "refsync"],
  );
  assert.equal((await engine.run(p, source, target, false)).changed, 0);
});
test("journal housekeeping keeps latest undo and incomplete recovery", async () => {
  const { engine, source, target, journal, applier } = fixture();
  source.data.set("a", bytes("one"));
  await engine.run(defaults, source, target, false);
  const first = (await journal.transactions())[0].id;
  source.data.set("a", bytes("two"));
  await engine.run(defaults, source, target, false);
  const tx = (await journal.transactions()).find((t) => t.id !== first)!;
  const pending = { ...tx, id: crypto.randomUUID() };
  await journal.begin(pending);
  await applier.prune();
  assert.deepEqual(
    (await journal.transactions()).map((t) => t.id).sort(),
    [tx.id, pending.id].sort(),
  );
});

test("a healthy run continues after five minutes and a stalled read identifies the path", async () => {
  const now = Date.now,
    start = now(),
    budget = new RunBudget(undefined, 15, []);
  try {
    Date.now = () => start + 600000;
    assert.equal(await budget.io(async () => 42), 42);
  } finally {
    Date.now = now;
  }
  const { source } = fixture();
  source.data.set("stalled.md", bytes("data"));
  source.download = () => new Promise(() => {});
  await assert.rejects(
    scan(source, "content", ".obsidian", "refsync", false, budget),
    (e) =>
      e instanceof Error &&
      e.message === "readTimeout" &&
      "path" in e &&
      e.path === "stalled.md",
  );
});
