import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DriveStore,
  GitHubStore,
  YandexStore,
  driveRoot,
} from "../src/sources/remotes";
import type { NetRequest, NetTransport } from "../src/sources/types";
import { sha } from "../src/core/paths";
import { ExternalFolder } from "../src/adapters/external-folder";
import {
  GoogleTokenManager,
  GoogleAuthorizedTransport,
  parseGoogleClient,
} from "../src/auth/google-auth";
const signal = () => new AbortController().signal;
class Mock implements NetTransport {
  calls: { url: string; request: NetRequest }[] = [];
  constructor(private handler: (url: string, request: NetRequest) => any) {}
  async fetch(url: string, request: NetRequest) {
    this.calls.push({ url, request });
    const value = await this.handler(url, request);
    const content = Buffer.from(JSON.stringify(value.data ?? value));
    return {
      status: value.status || 200,
      headers: value.headers || {},
      text: async () => content.toString(),
      arrayBuffer: async () => Uint8Array.from(content).buffer,
    };
  }
}
const data = new TextEncoder().encode("hello");
const file = {
  id: "f1",
  name: "note.md",
  mimeType: "text/markdown",
  size: "5",
  version: "1",
  sha256Checksum: sha(data),
  modifiedTime: "2026-01-01T00:00:00Z",
};
test("Drive enumerates external ordinary files without appProperties filter", async () => {
  const h = new Mock((u) =>
    u.includes("/files/root?")
      ? { id: "root", mimeType: "application/vnd.google-apps.folder" }
      : { files: [file] },
  );
  const s = await new DriveStore(h, "root", 1024).scan(signal());
  assert.equal(s.files["note.md"].hash, sha(data));
  const request = h.calls.find((c) =>
    new URL(c.url).pathname.endsWith("/files"),
  )!;
  assert.ok(
    new URL(request.url).searchParams.get("q")?.includes("'root' in parents"),
  );
  assert.ok(!request.url.includes("appProperties"));
});
test("Drive incomplete search fails closed", async () => {
  const h = new Mock((u) =>
    u.includes("/files/root?")
      ? { id: "root", mimeType: "application/vnd.google-apps.folder" }
      : { files: [], incompleteSearch: true },
  );
  await assert.rejects(
    () => new DriveStore(h, "root", 1024).scan(signal()),
    /Неполный/,
  );
});
test("Drive duplicate names cannot silently overwrite inventory entries", async () => {
  const h = new Mock((u) =>
    u.includes("/files/root?")
      ? { id: "root", mimeType: "application/vnd.google-apps.folder" }
      : { files: [file, { ...file, id: "f2" }] },
  );
  await assert.rejects(
    () => new DriveStore(h, "root", 1024).scan(signal()),
    /Коллизия/,
  );
});
test("public Drive cannot write", async () => {
  const store = new DriveStore(new Mock(() => ({})), "root", 1024, "api-key");
  await assert.rejects(
    () => store.write("note.md", data, undefined, undefined, signal()),
    /только для чтения/,
  );
});
test("Drive refuses overwrite without conditional version protection", async () => {
  const h = new Mock(() => file);
  const store = new DriveStore(h, "root", 1024);
  await assert.rejects(
    () =>
      store.write(
        "note.md",
        data,
        { path: "note.md", id: "f1", hash: sha(data), size: 5, version: "1" },
        undefined,
        signal(),
      ),
    /ETag/,
  );
  assert.equal(h.calls.length, 1);
});
test("Drive root URL parser rejects unrelated hosts", () => {
  assert.equal(
    driveRoot("https://drive.google.com/drive/folders/abc-123"),
    "abc-123",
  );
  assert.throws(() => driveRoot("https://example.org/folders/abc"));
});
test("GitHub pins blob to tree SHA, validates git hash, does not invent mtime", async () => {
  const id = createHash("sha1")
    .update(Buffer.from("blob 5\0"))
    .update(data)
    .digest("hex");
  const h = new Mock((u) =>
    u.includes("/commits/")
      ? { commit: { tree: { sha: "tree1" } } }
      : u.includes("/git/trees/")
        ? {
            tree: [
              {
                path: "note.md",
                type: "blob",
                mode: "100644",
                size: 5,
                sha: id,
              },
            ],
          }
        : { encoding: "base64", content: Buffer.from(data).toString("base64") },
  );
  const s = await new GitHubStore(h, "owner/repo", "main", "", "", 1024).scan(
    signal(),
  );
  assert.equal(s.files["note.md"].hash, sha(data));
  assert.equal(s.files["note.md"].mtime, undefined);
  assert.ok(h.calls.some((c) => c.url.includes("/git/trees/tree1")));
});
test("truncated GitHub tree cannot be interpreted as deletion", async () => {
  const h = new Mock((u) =>
    u.includes("/commits/")
      ? { commit: { tree: { sha: "tree1" } } }
      : { tree: [], truncated: true },
  );
  await assert.rejects(
    () => new GitHubStore(h, "owner/repo", "main", "", "", 1024).scan(signal()),
    /Неполное/,
  );
});
test("Yandex empty page before total fails closed", async () => {
  const h = new Mock(() => ({
    type: "dir",
    _embedded: { items: [], total: 2, offset: 0 },
  }));
  await assert.rejects(
    () => new YandexStore(h, "Notes", "token", 1024).scan(signal()),
    /Пустая страница/,
  );
});
test("Yandex trash and permanent are transmitted explicitly", async () => {
  for (const trash of [true, false]) {
    const h = new Mock((_u, r) =>
      r.method === "DELETE" ? { status: 204 } : { sha256: sha(data) },
    );
    await new YandexStore(h, "Notes", "token", 1024).delete(
      { path: "note.md", hash: sha(data), version: sha(data), size: 5 },
      trash,
      signal(),
    );
    assert.equal(
      new URL(h.calls.at(-1)!.url).searchParams.get("permanently"),
      String(!trash),
    );
  }
});
test("external folder can be imported without any write capability", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-"));
  try {
    await writeFile(join(root, "a.md"), "hello");
    const s = new ExternalFolder(root, 1024);
    const snapshot = await s.scan(signal());
    assert.equal(snapshot.files["a.md"].hash, sha(data));
    assert.equal(s.writable, false);
    await assert.rejects(() => s.write(), /только источник/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("external symlink is not followed outside the selected root", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-"));
  try {
    await symlink("/tmp", join(root, "escape"));
    await assert.rejects(
      () => new ExternalFolder(root, 1024).scan(signal()),
      /ссылк/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Google client parser only accepts Desktop configuration", () => {
  assert.throws(() => parseGoogleClient('{"web":{"client_id":"a"}}'));
  assert.equal(
    parseGoogleClient(
      '{"installed":{"client_id":"x.apps.googleusercontent.com"}}',
    ).clientId,
    "x.apps.googleusercontent.com",
  );
});
test("Google refresh is single-flight and checks the expected account", async () => {
  let refreshes = 0;
  const h = new Mock((u) => {
    if (u.includes("/token")) {
      refreshes++;
      return { access_token: "access", expires_in: 3600 };
    }
    return { sub: "account" };
  });
  const manager = new GoogleTokenManager(
    { clientId: "test" },
    "refresh",
    { getSecret: () => "stored", setSecret: () => {} },
    h,
    Date.now,
    "account",
  );
  await Promise.all([manager.getToken(), manager.getToken()]);
  assert.equal(refreshes, 1);
  manager.disconnect();
  await assert.rejects(() => manager.getToken(), /disconnected/);
});
test("Google bearer token never goes to an arbitrary host", async () => {
  const h = new Mock(() => ({}));
  const manager = new GoogleTokenManager(
    { clientId: "test" },
    "refresh",
    { getSecret: () => null, setSecret: () => {} },
    h,
  );
  const auth = new GoogleAuthorizedTransport(h, manager);
  await assert.rejects(
    () => auth.fetch("https://example.org/drive/v3/files", {}),
    /Untrusted/,
  );
  assert.equal(h.calls.length, 0);
});

test("Drive ignores duplicates in paths excluded by the profile before collision detection", async () => {
  const h = new Mock((u) =>
    u.includes("/files/root?")
      ? { id: "root", mimeType: "application/vnd.google-apps.folder" }
      : { files: [file, { ...file, id: "f2" }] },
  );
  const result = await new DriveStore(h, "root", 1024, undefined, "account", {
    file: () => false,
    folder: () => true,
  }).scan(signal());
  assert.deepEqual(Object.keys(result.files), []);
});
test("Drive does not descend into unrelated folders outside the scope", async () => {
  const h = new Mock((u) => {
    if (u.includes("/files/root?"))
      return { id: "root", mimeType: "application/vnd.google-apps.folder" };
    assert.ok(new URL(u).searchParams.get("q")?.includes("'root'"));
    return {
      files: [
        {
          id: "ignored",
          name: "Other",
          mimeType: "application/vnd.google-apps.folder",
        },
      ],
    };
  });
  const result = await new DriveStore(h, "root", 1024, undefined, "account", {
    file: () => true,
    folder: () => false,
  }).scan(signal());
  assert.deepEqual(Object.keys(result.files), []);
  assert.equal(h.calls.length, 2);
});
test("Google native documents remain present but ineligible and do not block ordinary files", async () => {
  const h = new Mock((u) =>
    u.includes("/files/root?")
      ? { id: "root", mimeType: "application/vnd.google-apps.folder" }
      : {
          files: [
            file,
            {
              id: "doc",
              name: "Document",
              mimeType: "application/vnd.google-apps.document",
            },
          ],
        },
  );
  const result = await new DriveStore(h, "root", 1024).scan(signal());
  assert.equal(result.files["note.md"].hash, sha(data));
  assert.equal(result.files.Document.size, Number.MAX_SAFE_INTEGER);
  assert.match(result.warnings[0], /Document/);
});
test("Yandex root path is disk:/ and folder picker follows pagination", async () => {
  const h = new Mock((u) => {
    const params = new URL(u).searchParams;
    assert.equal(params.get("path"), "disk:/");
    const offset = Number(params.get("offset"));
    return {
      type: "dir",
      _embedded: {
        offset,
        total: 2,
        items: [{ type: "dir", name: offset ? "B" : "A" }],
      },
    };
  });
  const folders = await new YandexStore(h, "disk:/", "token", 1024).folders(
    "",
    signal(),
  );
  assert.deepEqual(folders, [
    { id: "A", name: "A" },
    { id: "B", name: "B" },
  ]);
});
