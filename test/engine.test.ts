import { test } from "node:test";
import assert from "node:assert/strict";
import { plan } from "../src/core/planner";
import { execute } from "../src/core/executor";
import {
  newProfile,
  type Baseline,
  type FileInfo,
  type Snapshot,
  type Store,
  type Profile,
} from "../src/core/model";
import { sha, selected, path } from "../src/core/paths";
const signal = () => new AbortController().signal;
const bytes = (s: string) => new TextEncoder().encode(s);
function f(path: string, content: string, mtime = 100): FileInfo {
  return {
    path,
    hash: sha(bytes(content)),
    version: sha(bytes(content)),
    size: bytes(content).length,
    mtime,
  };
}
function snap(files: FileInfo[], id = "local"): Snapshot {
  return {
    files: Object.fromEntries(files.map((f) => [f.path, f])),
    complete: true,
    warnings: [],
    identity: id,
  };
}
const identity = JSON.stringify(["local", "remote"]);
function profile(extra: Partial<Profile> = {}): Profile {
  return { ...newProfile("connection"), remoteRoot: "root", ...extra };
}
function baseline(l?: FileInfo, r?: FileInfo): Baseline {
  return {
    identity,
    files: { "note.md": { local: l?.hash, remote: r?.hash } },
  };
}
function one(
  p: Profile,
  l?: FileInfo,
  r?: FileInfo,
  b: Baseline = { identity, files: {} },
) {
  return plan(p, snap(l ? [l] : []), snap(r ? [r] : [], "remote"), b)
    .operations[0];
}
test("initial remote file downloads, local-only files survive", () => {
  assert.equal(one(profile(), undefined, f("note.md", "a")).action, "download");
  assert.equal(one(profile(), f("note.md", "mine")).action, "adopt");
});
test("same content with different timestamps is never a conflict", () => {
  assert.equal(
    one(profile(), f("note.md", "a", 1), f("note.md", "a", 999)).action,
    "adopt",
  );
});
test("remote change only downloads; local change only preserves original baseline", () => {
  const a = f("note.md", "a"),
    b = f("note.md", "b");
  assert.equal(one(profile(), a, b, baseline(a, a)).action, "download");
  assert.equal(one(profile(), b, a, baseline(a, a)).action, "skip");
});
for (const [policy, action] of Object.entries({
  both: "keep-both",
  local: "adopt",
  remote: "download",
  ask: "conflict",
}))
  test("pull conflict " + policy, () => {
    const a = f("note.md", "a");
    assert.equal(
      one(
        profile({ conflict: policy as Profile["conflict"] }),
        f("note.md", "b"),
        f("note.md", "c"),
        baseline(a, a),
      ).action,
      action,
    );
  });
test("pull never writes remote for any normal conflict policy", () => {
  for (const conflict of [
    "local",
    "remote",
    "both",
    "ask",
    "newest",
  ] as const) {
    const a = one(
      profile({ conflict }),
      f("note.md", "a", 2),
      f("note.md", "b", 1),
    );
    assert.ok(!["upload", "delete-remote"].includes(a.action));
  }
});
test("newest with missing or equal time requires decision", () => {
  const l = f("note.md", "a"),
    r = f("note.md", "b");
  delete r.mtime;
  assert.equal(one(profile({ conflict: "newest" }), l, r).action, "conflict");
  assert.equal(
    one(profile({ conflict: "newest" }), l, f("note.md", "b")).action,
    "conflict",
  );
});
for (const deletion of ["trash", "permanent"] as const)
  test("tracked deletion propagated with " + deletion, () => {
    const a = f("note.md", "a");
    assert.equal(
      one(profile({ deletion }), a, undefined, baseline(a, a)).action,
      "delete-local",
    );
    assert.equal(one(profile({ deletion }), a, undefined).action, "adopt");
  });
test("deletion ignore preserves baseline so enabling deletions later works", () => {
  const a = f("note.md", "a");
  assert.equal(
    one(profile({ deletion: "ignore" }), a, undefined, baseline(a, a)).action,
    "skip",
  );
  assert.equal(
    one(profile({ deletion: "trash" }), a, undefined, baseline(a, a)).action,
    "delete-local",
  );
});
test("modified local versus remote deletion asks unless explicitly configured", () => {
  const a = f("note.md", "a"),
    b = f("note.md", "b");
  assert.equal(
    one(profile({ deletion: "trash" }), b, undefined, baseline(a, a)).action,
    "conflict",
  );
  assert.equal(
    one(
      profile({ deletion: "trash", deleteConflict: "delete" }),
      b,
      undefined,
      baseline(a, a),
    ).action,
    "delete-local",
  );
  assert.equal(
    one(
      profile({ deletion: "trash", deleteConflict: "keep" }),
      b,
      undefined,
      baseline(a, a),
    ).action,
    "adopt",
  );
});
test("two-way local deletion propagates to remote", () => {
  const a = f("note.md", "a");
  assert.equal(
    one(
      profile({ direction: "both", deletion: "trash" }),
      undefined,
      a,
      baseline(a, a),
    ).action,
    "delete-remote",
  );
});
test("push ignores remote-only files and restores removed destinations", () => {
  const a = f("note.md", "a");
  assert.equal(
    one(profile({ direction: "push" }), undefined, a).action,
    "adopt",
  );
  assert.equal(
    one(profile({ direction: "push" }), a, undefined, baseline(a, a)).action,
    "upload",
  );
});
test("incomplete listing fails before any operation", () => {
  const l = snap([]),
    r = snap([], "remote");
  r.complete = false;
  assert.throws(
    () => plan(profile(), l, r, { identity, files: {} }),
    /Неполный/,
  );
});
test("new endpoint never inherits deletions from old endpoint", () => {
  const a = f("note.md", "a");
  const b = baseline(a, a);
  b.identity = "different";
  assert.equal(
    one(profile({ deletion: "permanent" }), a, undefined, b).action,
    "adopt",
  );
});
test("scope exclusion cannot trigger deletions", () => {
  const a = f("note.md", "a");
  assert.equal(
    plan(
      profile({ excludePaths: ["note.md"], deletion: "permanent" }),
      snap([a]),
      snap([], "remote"),
      baseline(a, a),
    ).operations.length,
    0,
  );
});
test("nested categories, explicit data exclusions and protected paths", () => {
  const p = profile({ categories: ["plugin-settings"], excludeData: false });
  assert.equal(
    selected(".obsidian/plugins/example/data.json", p, ".obsidian"),
    true,
  );
  p.excludeData = true;
  assert.equal(
    selected(".obsidian/plugins/example/data.json", p, ".obsidian"),
    false,
  );
  assert.equal(
    selected(
      ".obsidian/plugins/sync-studio/data.json",
      { ...p, excludeData: false },
      ".obsidian",
    ),
    false,
  );
  assert.equal(
    selected(".sync-conflicts/note.md", profile(), ".obsidian"),
    false,
  );
});
test("paths reject traversal and Windows aliases", () => {
  for (const v of ["../a", "/a", "a/../b", "a\\b", "CON.txt", "a.", "a//b"])
    assert.throws(() => path(v));
});
class Memory implements Store {
  writable = true;
  trashSupported = true;
  files = new Map<string, string>();
  deletes: boolean[] = [];
  writes = 0;
  constructor(
    public identity: string,
    items: Record<string, string> = {},
  ) {
    for (const [k, v] of Object.entries(items)) this.files.set(k, v);
  }
  async scan() {
    return snap(
      [...this.files].map(([k, v]) => f(k, v)),
      this.identity,
    );
  }
  async read(file: FileInfo) {
    const b = bytes(this.files.get(file.path)!);
    if (sha(b) !== file.hash) throw Error("changed");
    return b;
  }
  async write(p: string, b: Uint8Array, expected?: FileInfo) {
    const old = this.files.get(p);
    if (
      expected
        ? old === undefined || sha(bytes(old)) !== expected.hash
        : old !== undefined
    )
      throw Error("changed");
    this.files.set(p, new TextDecoder().decode(b));
    this.writes++;
    return f(p, this.files.get(p)!);
  }
  async delete(file: FileInfo, trash: boolean) {
    if (sha(bytes(this.files.get(file.path)!)) !== file.hash)
      throw Error("changed");
    this.files.delete(file.path);
    this.deletes.push(trash);
  }
}
async function run(p: Profile, l: Memory, r: Memory, b: Baseline) {
  const planned = plan(p, await l.scan(), await r.scan(), b);
  let state = b;
  const backups: string[] = [];
  const result = await execute(
    planned,
    l,
    r,
    {
      checkpoint: async (s) => {
        state = structuredClone(s);
      },
      backup: async (p) => {
        backups.push(p);
      },
      journal: async () => {},
    },
    signal(),
  );
  return { state, backups, result };
}
test("keep-both creates exactly one conflict copy across repeated runs", async () => {
  const l = new Memory("local", { "note.md": "local" }),
    r = new Memory("remote", { "note.md": "remote" });
  const first = await run(profile(), l, r, { identity, files: {} });
  assert.equal(first.backups.length, 1);
  assert.equal(l.files.get("note.md"), "remote");
  const second = await run(profile(), l, r, first.state);
  assert.equal(second.backups.length, 0);
  assert.equal(second.result.applied, 0);
});
test("acknowledged divergent pair does not re-open the same conflict", async () => {
  const l = new Memory("local", { "note.md": "local" }),
    r = new Memory("remote", { "note.md": "remote" });
  const first = await run(profile({ conflict: "local" }), l, r, {
    identity,
    files: {},
  });
  const op = plan(
    profile({ conflict: "local" }),
    await l.scan(),
    await r.scan(),
    first.state,
  ).operations[0];
  assert.equal(op.action, "adopt");
  const updated = plan(
    profile({ conflict: "remote" }),
    await l.scan(),
    await r.scan(),
    first.state,
  ).operations[0];
  assert.equal(updated.action, "download");
});
for (const [deletion, trash] of [
  ["trash", true],
  ["permanent", false],
] as const)
  test("executor forwards " + deletion + " to local adapter", async () => {
    const l = new Memory("local", { "note.md": "a" }),
      r = new Memory("remote");
    const a = f("note.md", "a");
    const out = await run(profile({ deletion }), l, r, baseline(a, a));
    assert.equal(out.result.status, "completed");
    assert.deepEqual(l.deletes, [trash]);
    assert.equal(out.state.files["note.md"].local, undefined);
  });
test("changed reviewed snapshot is rejected without mutation", async () => {
  const l = new Memory("local"),
    r = new Memory("remote", { "note.md": "a" });
  const p = plan(profile(), await l.scan(), await r.scan(), {
    identity,
    files: {},
  });
  r.files.set("note.md", "b");
  const result = await execute(
    p,
    l,
    r,
    {
      checkpoint: async () => {},
      backup: async () => {},
      journal: async () => {},
    },
    signal(),
  );
  assert.equal(result.status, "failed");
  assert.equal(l.writes, 0);
});
test("journal failure prevents write", async () => {
  const l = new Memory("local"),
    r = new Memory("remote", { "note.md": "a" });
  const p = plan(profile(), await l.scan(), await r.scan(), {
    identity,
    files: {},
  });
  const result = await execute(
    p,
    l,
    r,
    {
      checkpoint: async () => {},
      backup: async () => {},
      journal: async () => {
        throw Error("disk full");
      },
    },
    signal(),
  );
  assert.equal(result.status, "failed");
  assert.equal(l.writes, 0);
});
test("checkpoint failure stops subsequent mutations", async () => {
  const l = new Memory("local"),
    r = new Memory("remote", { "a.md": "a", "b.md": "b" });
  const p = plan(profile(), await l.scan(), await r.scan(), {
    identity,
    files: {},
  });
  const result = await execute(
    p,
    l,
    r,
    {
      checkpoint: async () => {
        throw Error("disk full");
      },
      backup: async () => {},
      journal: async () => {},
    },
    signal(),
  );
  assert.notEqual(result.status, "completed");
  assert.equal(l.writes, 1);
});
test("prototype-like filename is preserved without prototype mutation", async () => {
  const l = new Memory("local"),
    r = new Memory("remote", Object.fromEntries([["__proto__", "file"]]));
  const result = await run(profile(), l, r, { identity, files: {} });
  assert.equal(result.result.status, "completed");
  assert.ok(Object.hasOwn(result.state.files, "__proto__"));
});
