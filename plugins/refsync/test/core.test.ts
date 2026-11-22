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
test("settings category, code/data filters, semantic baseline, restart repair and raw undo", async () => {
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
  assert.equal(fix[0].repaired, 1);
  assert.deepEqual(JSON.parse(text(await target.download(data))), {
    value: 2,
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

test("a fresh subscriber keeps RefSync enabled when the community plugin list has not yet been saved", async () => {
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
