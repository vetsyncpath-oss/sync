import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DataAdapter } from "obsidian";
import { GoogleTree, YandexTree, type Transport } from "../src/public-cloud";
import { PublicStore } from "../src/public-store";
import { GitTree } from "../src/public-git";
import { gitFs } from "../src/git-fs";
import { location, referenceId } from "../src/public-location";
import { defaults } from "../src/model";

const bytes = (s: string) => new TextEncoder().encode(s).buffer;
const response = (data: unknown, status = 200) => ({
  status,
  headers: {},
  arrayBuffer: bytes(JSON.stringify(data)),
});
const folder = "application/vnd.google-apps.folder";
test("Drive verifies the link key, reads all pages, and protects native Docs", async () => {
  let pages = 0;
  const http: Transport = async (raw, method, h) => {
    const u = new URL(raw);
    assert.equal(u.hostname, "www.googleapis.com");
    assert.equal(h?.["X-Goog-Api-Key"], "key");
    assert.equal(method, "GET");
    if (u.pathname.endsWith("/root"))
      return response({ id: "root", mimeType: folder });
    if (u.pathname.endsWith("/f")) {
      assert.equal(h?.["X-Goog-Drive-Resource-Keys"], "f/filekey");
      return { status: 200, headers: {}, arrayBuffer: bytes("abc") };
    }
    pages++;
    assert.equal(h?.["X-Goog-Drive-Resource-Keys"], "root/linkkey");
    return u.searchParams.has("pageToken")
      ? response({
          files: [
            {
              id: "g",
              name: "Doc",
              mimeType: "application/vnd.google-apps.document",
            },
          ],
        })
      : response({
          nextPageToken: "more",
          files: [
            {
              id: "f",
              name: "notes.md",
              mimeType: "text/plain",
              size: "3",
              md5Checksum: "900150983cd24fb0d6963f7d28e17f72",
              resourceKey: "filekey",
            },
          ],
        });
  };
  const store = new PublicStore(
    "google",
    new GoogleTree(http, "root", "key", "linkkey"),
  );
  assert.deepEqual(await store.list(""), {
    files: ["notes.md"],
    folders: [],
    skipped: ["Doc"],
  });
  assert.equal(
    new TextDecoder().decode(await store.download("notes.md")),
    "abc",
  );
  assert.equal(pages, 2);
  await assert.rejects(store.upload(), /readonly/);
  await assert.rejects(store.confirmAbsent(["Doc"]), /referenceChanged/);
});
test("Drive aborts on incomplete or ambiguous listings and reports API quota", async () => {
  for (const [answer, err] of [
    [{ files: [], incompleteSearch: true }, /incomplete/],
    [{ files: [], nextPageToken: "same" }, /incomplete/],
    [
      {
        files: ["a", "b"].map((id) => ({ id, name: "same", mimeType: folder })),
      },
      /collision/,
    ],
  ] as const) {
    const store = new PublicStore(
      "d",
      new GoogleTree(
        async (u) =>
          u.includes("/files/")
            ? response({ id: "root", mimeType: folder })
            : response(answer),
        "root",
        "key",
        "",
      ),
    );
    await assert.rejects(store.list(""), err);
  }
  const tree = new GoogleTree(
    async () => response({ error: "rateLimitExceeded" }, 403),
    "root",
    "key",
    "",
  );
  await assert.rejects(tree.root(), /publicQuota/);
});
test("Yandex resolves nested paths, validates pagination and checks download hashes", async () => {
  const name = "Заметка.md";
  const offsets: string[] = [];
  const http: Transport = async (raw) => {
    const u = new URL(raw);
    if (u.hostname === "downloader.disk.yandex.ru")
      return { status: 200, headers: {}, arrayBuffer: bytes("abc") };
    assert.equal(u.searchParams.get("public_key"), "share");
    if (u.pathname.endsWith("/download")) {
      assert.ok(
        ["/Копия/" + name, "/Копия/bad.md"].includes(
          u.searchParams.get("path")!,
        ),
      );
      return response({ href: "https://downloader.disk.yandex.ru/file" });
    }
    const offset = u.searchParams.get("offset")!;
    offsets.push(offset);
    if (u.searchParams.get("path") === "/")
      return response({
        type: "dir",
        _embedded: {
          items: [{ name: "Копия", type: "dir" }],
          offset: 0,
          total: 1,
        },
      });
    const item = {
      name: offset === "0" ? name : "bad.md",
      type: "file",
      size: 3,
      md5:
        offset === "0"
          ? "900150983cd24fb0d6963f7d28e17f72"
          : "00000000000000000000000000000000",
    };
    return response({
      type: "dir",
      _embedded: { items: [item], offset: Number(offset), total: 2 },
    });
  };
  const s = new PublicStore("y", new YandexTree(http, "share"), "Копия");
  assert.deepEqual((await s.list("")).files, [name, "bad.md"]);
  assert.deepEqual(offsets, ["0", "0", "1"]);
  assert.equal(new TextDecoder().decode(await s.download(name)), "abc");
  await assert.rejects(s.download("bad.md"), /referenceChanged/);
  const incomplete = new YandexTree(
    async () =>
      response({ type: "dir", _embedded: { items: [], offset: 0, total: 1 } }),
    "share",
  );
  await assert.rejects(
    incomplete.children(await incomplete.root()),
    /incomplete/,
  );
});
test("public source identities distinguish remote folders and branches", () => {
  const g = {
    engine: "google",
    url: "https://drive.google.com/drive/u/0/folders/root?resourcekey=key",
    branch: "",
  } as const;
  assert.deepEqual(location(g), { root: "root", resourceKey: "key" });
  const p = {
    ...defaults,
    access: "public" as const,
    remote: g,
    reference: "/",
  };
  assert.notEqual(referenceId(p), referenceId({ ...p, reference: "sub" }));
  for (const url of [
    "http://example.org/repo",
    "https://me:pw@example.org/repo",
    "https://example.org/repo?token=abc",
  ])
    assert.throws(() => location({ engine: "git", url, branch: "" }));
  assert.throws(() =>
    location({
      engine: "git",
      url: "https://example.org/repo",
      branch: "../x",
    }),
  );
});
test("smart Git fetch pins each run, supports the default branch, and uses the vault adapter cache", async (t) => {
  const tmp = await fs.mkdtemp(join(tmpdir(), "refsync-git-"));
  t.after(() => fs.rm(tmp, { force: true, recursive: true }));
  const repo = join(tmp, "repo"),
    cache = join(tmp, "cache");
  await fs.mkdir(repo);
  await fs.mkdir(cache);
  const git = (args: string[], input?: Buffer) =>
    execFileSync("git", args, {
      cwd: repo,
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });
  git(["init", "-b", "main"]);
  await fs.mkdir(join(repo, "sub"));
  await fs.writeFile(join(repo, "sub", "note.md"), "one");
  const commit = () => {
    git(["add", "."]);
    git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ]);
  };
  commit();
  const adapter = {
    stat: async (p: string) => {
      const s = await fs.stat(p).catch(() => null);
      return (
        s && {
          type: s.isFile() ? "file" : "folder",
          mtime: s.mtimeMs,
          ctime: s.ctimeMs,
          size: s.size,
        }
      );
    },
    exists: async (p: string) => !!(await fs.stat(p).catch(() => null)),
    mkdir: (p: string) => fs.mkdir(p),
    rmdir: (p: string) => fs.rmdir(p),
    remove: (p: string) => fs.unlink(p),
    write: (p: string, s: string) => fs.writeFile(p, s),
    writeBinary: (p: string, b: ArrayBuffer) =>
      fs.writeFile(p, new Uint8Array(b)),
    read: (p: string) => fs.readFile(p, "utf8"),
    readBinary: async (p: string) =>
      Uint8Array.from(await fs.readFile(p)).buffer,
    list: async (p: string) => {
      const rows = await fs.readdir(p, { withFileTypes: true });
      return {
        files: rows.filter((r) => r.isFile()).map((r) => p + "/" + r.name),
        folders: rows
          .filter((r) => r.isDirectory())
          .map((r) => p + "/" + r.name),
      };
    },
  } as unknown as DataAdapter;
  const transport: Transport = async (url, method, headers, body) => {
    const adv = method === "GET";
    assert.ok(
      adv
        ? url.endsWith("/info/refs?service=git-upload-pack")
        : method === "POST" && url.endsWith("/git-upload-pack"),
    );
    const output = git(
      [
        "upload-pack",
        "--stateless-rpc",
        ...(adv ? ["--advertise-refs"] : []),
        ".",
      ],
      body ? Buffer.from(body) : undefined,
    );
    return {
      status: 200,
      headers: {
        "content-type":
          "application/x-git-upload-pack-" + (adv ? "advertisement" : "result"),
      },
      arrayBuffer: Uint8Array.from(
        adv
          ? Buffer.concat([
              Buffer.from("001e# service=git-upload-pack\n0000"),
              output,
            ])
          : output,
      ).buffer,
    };
  };
  const open = (branch: string) =>
    new PublicStore(
      "git",
      new GitTree(
        async () => gitFs(adapter, cache),
        transport,
        "https://git.example/repo",
        branch,
        cache,
      ),
      "sub",
    );
  const first = open("");
  assert.deepEqual((await first.list("")).files, ["note.md"]);
  const original = await first.getRevision();
  await fs.writeFile(join(repo, "sub", "note.md"), "two");
  commit();
  const next = open("main");
  assert.equal(
    await next.getRevision(),
    git(["rev-parse", "HEAD"]).toString().trim(),
  );
  assert.notEqual(await next.getRevision(), original);
  assert.equal(
    new TextDecoder().decode(await first.download("note.md")),
    "one",
  );
  assert.equal(new TextDecoder().decode(await next.download("note.md")), "two");
  await assert.rejects(open("missing").list(""), /gitRead/);
});
