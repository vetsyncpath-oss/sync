import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DriveStore, GitHubStore, YandexStore } from "../src/sources/remotes";
import { driveUpload } from "../src/sources/drive-upload";
import { ExternalFolder } from "../src/adapters/external-folder";
import { plan, policyKey } from "../src/core/planner";
import { execute } from "../src/core/executor";
import { compatiblePaths, scanRules, sha, selected } from "../src/core/paths";
import {
  newProfile,
  type Snapshot,
  type FileInfo,
  type Store,
} from "../src/core/model";
import type {
  NetRequest,
  NetResponse,
  NetTransport,
} from "../src/sources/types";

const signal = () => new AbortController().signal;
const f = (path: string, content = "a", mtime = 100): FileInfo => ({
  path,
  size: content.length,
  hash: sha(Buffer.from(content)),
  version: content,
  mtime,
});
const snapshot = (
  files: FileInfo[],
  identity = "local",
  directories: string[] = [],
): Snapshot => ({
  files: Object.fromEntries(files.map((f) => [f.path, f])),
  identity,
  directories,
  complete: true,
  warnings: [],
});
const profile = () => ({ ...newProfile("c"), remoteRoot: "root" });
const response = (
  data: unknown = {},
  status = 200,
  headers: Record<string, string> = {},
): NetResponse => ({
  status,
  headers,
  text: async () => JSON.stringify(data),
  arrayBuffer: async () => new Uint8Array().buffer,
});
class Mock implements NetTransport {
  calls: { url: string; request: NetRequest }[] = [];
  constructor(
    private handler: (
      u: URL,
      r: NetRequest,
    ) => NetResponse | Promise<NetResponse>,
  ) {}
  async fetch(url: string, request: NetRequest) {
    this.calls.push({ url, request });
    return this.handler(new URL(url), request);
  }
}
test("combined namespace catches case-only files, parent spelling, file-directory and empty-directory clashes", () => {
  for (const [l, r] of [
    [snapshot([f("Note.md")]), snapshot([f("note.md")])],
    [snapshot([f("A/x.md")]), snapshot([f("a/y.md")])],
    [snapshot([f("a")]), snapshot([f("a/x.md")])],
    [snapshot([f("a")]), snapshot([], "remote", ["a"])],
    [snapshot([f("é.md")]), snapshot([f("e\u0301.md")])],
  ])
    assert.throws(() => compatiblePaths(l, r), /Коллизия/);
  assert.doesNotThrow(() =>
    compatiblePaths(
      snapshot([f("a/x.md")]),
      snapshot([f("a/x.md")], "remote", ["a"]),
    ),
  );
});
test("tracked policy key remains compatible with 0.2.1 baselines", () => {
  const p = profile();
  assert.equal(
    policyKey(p),
    JSON.stringify([
      p.direction,
      p.conflict,
      p.conflictWhen,
      p.deletion,
      p.deleteConflict,
    ]),
  );
});
test("configuration and own-plugin protection cannot be bypassed by case variants", () => {
  const p = {
    ...profile(),
    categories: [
      "notes",
      "attachments",
      "plugin-settings",
      "plugin-code",
    ] as const,
  };
  for (const path of [
    ".OBSIDIAN/plugins/SYNC-STUDIO/main.js",
    ".SYNC-STUDIO/state-v1.json",
    ".OBSIDIAN/plugins/test/DATA.JSON",
  ])
    assert.equal(
      selected(path, { ...p, categories: [...p.categories] }, ".obsidian"),
      false,
    );
});
test("mirror removes untracked target extras only with explicit deletion policy and ignores content conflict policy", () => {
  for (const direction of ["pull", "push"] as const)
    for (const deletion of ["ignore", "trash", "permanent"] as const) {
      const p = {
        ...profile(),
        direction,
        deletion,
        oneWayMode: "mirror" as const,
        conflict: "local" as const,
      };
      const source = [f("note.md", "source")],
        target = [f("note.md", "target"), f("extra.md")];
      const l = snapshot(direction === "pull" ? target : source);
      const r = snapshot(direction === "pull" ? source : target, "remote");
      const result = plan(p, l, r, { identity: "new", files: {} });
      assert.equal(
        result.operations.find((o) => o.path === "note.md")?.action,
        direction === "pull" ? "download" : "upload",
      );
      assert.equal(
        result.operations.find((o) => o.path === "extra.md")?.action,
        deletion === "ignore"
          ? "skip"
          : direction === "pull"
            ? "delete-local"
            : "delete-remote",
      );
    }
  assert.throws(
    () =>
      plan(
        { ...profile(), direction: "both", oneWayMode: "mirror" },
        snapshot([]),
        snapshot([], "remote"),
        { identity: "", files: {} },
      ),
    /одно направление/,
  );
});
test("timestamp-only change after newest preview invalidates the reviewed plan", async () => {
  const l = snapshot([f("note.md", "a", 100)]);
  const r = snapshot([f("note.md", "b", 200)], "remote");
  const p = plan({ ...profile(), conflict: "newest" }, l, r, {
    identity: "",
    files: {},
  });
  const store = (s: Snapshot): Store => ({
    identity: s.identity,
    writable: true,
    trashSupported: true,
    scan: async () => s,
    read: async () => {
      throw Error("must not read");
    },
    write: async () => {
      throw Error("must not write");
    },
    delete: async () => {
      throw Error("must not delete");
    },
  });
  l.files["note.md"].mtime = 300;
  // Real scans produce new objects; don't mutate the reviewed references.
  p.operations[0].local = f("note.md", "a", 100);
  const log = await execute(
    p,
    store(l),
    store(r),
    {
      checkpoint: async () => {},
      backup: async () => {},
      journal: async () => {},
    },
    signal(),
  );
  assert.equal(log.status, "failed");
  assert.match(log.message, /после просмотра/);
});
test("rename fallback transfers new path before deleting old path; failed transfer preserves the old copy", async () => {
  const l = snapshot([f("a.md")]),
    r = snapshot([f("z.md")], "remote");
  const p = plan({ ...profile(), deletion: "permanent" }, l, r, {
    identity: JSON.stringify(["local", "remote"]),
    files: { "a.md": { local: f("a.md").hash, remote: f("a.md").hash } },
  });
  assert.deepEqual(
    p.operations.map((o) => o.action),
    ["download", "delete-local"],
  );
  let deleted = false;
  const local: Store = {
    identity: "local",
    writable: true,
    trashSupported: true,
    scan: async () => l,
    read: async () => Buffer.from("a"),
    write: async () => {
      throw Error("disk full");
    },
    delete: async () => {
      deleted = true;
    },
  };
  const remote: Store = { ...local, identity: "remote", scan: async () => r };
  const log = await execute(
    p,
    local,
    remote,
    {
      checkpoint: async () => {},
      backup: async () => {},
      journal: async () => {},
    },
    signal(),
  );
  assert.equal(log.status, "failed");
  assert.equal(deleted, false);
});
test("excluded external subtrees are pruned before symlinks and case collisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-audit-"));
  try {
    await mkdir(join(root, "ignored"));
    await symlink("/tmp", join(root, "ignored", "link"));
    await writeFile(join(root, "ignored", "A.md"), "a");
    await writeFile(join(root, "ignored", "a.md"), "b");
    await writeFile(join(root, "note.md"), "a");
    const rules = scanRules(
      { ...profile(), excludePaths: ["ignored"] },
      ".obsidian",
    );
    const s = await new ExternalFolder(root, 1024, rules).scan(signal());
    assert.deepEqual(Object.keys(s.files), ["note.md"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("GitHub exclusions precede unsupported submodule validation", async () => {
  const h = new Mock((u) =>
    response(
      u.pathname.includes("/commits/")
        ? { commit: { tree: { sha: "tree" } } }
        : {
            tree: [
              {
                path: "vendor",
                type: "commit",
                mode: "160000",
                sha: "submodule",
              },
            ],
          },
    ),
  );
  const rules = scanRules(
    { ...profile(), excludePaths: ["vendor"] },
    ".obsidian",
  );
  const s = await new GitHubStore(
    h,
    "owner/repo",
    "main",
    "",
    "",
    1024,
    rules,
  ).scan(signal());
  assert.deepEqual(Object.keys(s.files), []);
});
test("Yandex 202 upload waits for the expected hash instead of accepting a delayed old version", async () => {
  let uploaded = false,
    checks = 0;
  const b = Buffer.from("new");
  const h = new Mock((u, req) => {
    if (u.hostname === "uploader.disk.yandex.net") {
      uploaded = true;
      return response({}, 202);
    }
    if (u.pathname.endsWith("/upload"))
      return response({ href: "https://uploader.disk.yandex.net/file" });
    if (!uploaded) return response({}, 404);
    checks++;
    return response({
      size: 3,
      sha256: sha(checks === 1 ? Buffer.from("old") : b),
      modified: "2026-01-01T00:00:00Z",
      path: "disk:/note.md",
    });
  });
  const result = await new YandexStore(h, "disk:/", "token", 1024).write(
    "note.md",
    b,
    undefined,
    undefined,
    signal(),
  );
  assert.equal(result.hash, sha(b));
  assert.equal(checks, 2);
  assert.equal(h.calls.filter((c) => c.request.method === "PUT").length, 1);
});

const folder = (id: string, name = id) => ({
  id,
  name,
  mimeType: "application/vnd.google-apps.folder",
});
const driveFile = {
  id: "f",
  name: "note.md",
  mimeType: "text/markdown",
  version: "1",
  size: "1",
  sha256Checksum: sha(Buffer.from("a")),
  modifiedTime: "2026-01-01T00:00:00Z",
};
test("Drive refuses cached parent moved outside root after scan", async () => {
  let moved = false;
  const h = new Mock((u, req) => {
    assert.ok(!req.method || req.method === "GET", "no mutations allowed");
    if (u.pathname.endsWith("/files/root")) return response(folder("root"));
    if (u.searchParams.get("q")?.includes("'root'"))
      return response({ files: moved ? [] : [folder("dir", "Notes")] });
    return response({ files: [] });
  });
  const store = new DriveStore(h, "root", 1024);
  await store.scan(signal());
  moved = true;
  await assert.rejects(
    () =>
      store.write(
        "Notes/new.md",
        Buffer.from("a"),
        undefined,
        undefined,
        signal(),
      ),
    /перемещена/,
  );
});
test("Drive rejects a moved file before overwrite even if ID and version still exist", async () => {
  const h = new Mock((u, req) => {
    assert.ok(!req.method || req.method === "GET");
    return u.pathname.endsWith("/files/f")
      ? response(driveFile, 200, { etag: '"1"' })
      : response({ files: [] });
  });
  await assert.rejects(
    () =>
      new DriveStore(h, "root", 1024).write(
        "note.md",
        Buffer.from("b"),
        { ...f("note.md"), id: "f", version: "1" },
        undefined,
        signal(),
      ),
    /Путь Drive исчез/,
  );
});
test("Drive checks all paginated children and does not create a duplicate discovered on page two", async () => {
  const h = new Mock((u, req) => {
    assert.ok(!req.method || req.method === "GET");
    return response(
      u.searchParams.has("pageToken")
        ? { files: [driveFile] }
        : { files: [], nextPageToken: "page2" },
    );
  });
  await assert.rejects(
    () =>
      new DriveStore(h, "root", 1024).write(
        "note.md",
        Buffer.from("b"),
        undefined,
        undefined,
        signal(),
      ),
    /появился/,
  );
});
test("Drive opt-in newest duplicate is deterministic, read-only and never merges duplicate folders", async () => {
  let folders = false;
  const h = new Mock((u) =>
    u.pathname.endsWith("/files/root")
      ? response(folder("root"))
      : response({
          files: folders
            ? [folder("d1", "Notes"), folder("d2", "Notes")]
            : [
                driveFile,
                {
                  ...driveFile,
                  id: "new",
                  modifiedTime: "2026-02-01T00:00:00Z",
                },
              ],
        }),
  );
  const s = new DriveStore(
    h,
    "root",
    1024,
    undefined,
    "account",
    undefined,
    "newest",
  );
  const snap = await s.scan(signal());
  assert.equal(snap.files["note.md"].id, "new");
  assert.equal(snap.warnings.length, 1);
  assert.equal(s.writable, false);
  await assert.rejects(
    () => s.delete(snap.files["note.md"], true, signal()),
    /только для чтения/,
  );
  folders = true;
  await assert.rejects(() => s.scan(signal()), /Коллизия/);
});
const uploadUrl =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
const sessionUrl = uploadUrl + "&upload_id=session";
test("Drive resumable upload follows acknowledged partial ranges and recovers an interrupted final response", async () => {
  const data = new Uint8Array(9 * 1024 * 1024);
  let step = 0;
  const h = new Mock((_u, req) => {
    step++;
    if (step === 1) return response({}, 200, { location: sessionUrl });
    if (step === 2) {
      assert.equal(
        req.headers?.["Content-Range"],
        `bytes 0-8388607/${data.length}`,
      );
      return response({}, 308, { range: "bytes=0-4194303" });
    }
    if (step === 3) {
      assert.equal(
        req.headers?.["Content-Range"],
        `bytes 4194304-${data.length - 1}/${data.length}`,
      );
      throw Error("lost final response");
    }
    assert.equal(req.headers?.["Content-Range"], `bytes */${data.length}`);
    return response({ id: "f", sha256Checksum: sha(data) }, 201);
  });
  const result = await driveUpload(
    h,
    uploadUrl,
    "POST",
    { name: "large.bin" },
    data,
    { signal: signal() },
  );
  assert.equal(result.id, "f");
  assert.equal(h.calls.filter((c) => c.request.method === "POST").length, 1);
  assert.equal(step, 4);
});
test("Drive resumable upload rejects hostile session URLs before sending bytes", async () => {
  const h = new Mock(() =>
    response({}, 200, { location: "https://evil.example/upload" }),
  );
  await assert.rejects(
    () =>
      driveUpload(h, uploadUrl, "POST", {}, new Uint8Array(10), {
        signal: signal(),
      }),
    /Недоверенный/,
  );
  assert.equal(h.calls.length, 1);
});
test("Drive resumable upload refuses impossible Range and stops on precondition failure", async () => {
  for (const bad of [
    response({}, 308, { range: "bytes=1-5" }),
    response({}, 412),
  ]) {
    const h = new Mock((_u, r) =>
      r.method === "POST" ? response({}, 200, { location: sessionUrl }) : bad,
    );
    await assert.rejects(() =>
      driveUpload(h, uploadUrl, "POST", {}, new Uint8Array(10), {
        signal: signal(),
      }),
    );
    assert.equal(h.calls.length, 2);
  }
});
test("Drive resumable upload honours cancellation without retrying a mutation", async () => {
  const c = new AbortController();
  const h = new Mock((_u, r) => {
    if (r.method === "POST") return response({}, 200, { location: sessionUrl });
    c.abort(new Error("cancel"));
    throw Error("socket closed");
  });
  await assert.rejects(
    () =>
      driveUpload(h, uploadUrl, "POST", {}, new Uint8Array(10), {
        signal: c.signal,
      }),
    /cancel/,
  );
  assert.equal(h.calls.length, 2);
});
