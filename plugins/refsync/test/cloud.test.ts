import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Accounts,
  authorize,
  callback,
  codeFrom,
  googleClient,
  type Account,
  type Client,
} from "../src/accounts";
import {
  CloudStore,
  DiskTree,
  DriveTree,
  driveRevision,
} from "../src/private-cloud";
import type { Transport } from "../src/public-cloud";
import { hash } from "../src/model";
const bytes = (s: string) => new TextEncoder().encode(s).buffer;
const result = (
  d: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => ({ status, headers, arrayBuffer: bytes(JSON.stringify(d)) });
function memory(http: Transport) {
  let accounts: Account[] = [];
  const secrets = new Map<string, string>();
  const service = new Accounts(
    {
      list: () => accounts,
      save: (v) => {
        accounts = v;
      },
      get: (id) => secrets.get(id) ?? null,
      set: (id, v) => {
        secrets.set(id, v);
      },
    },
    http,
  );
  return { service, secrets };
}
for (const engine of ["google", "yandex"] as const)
  test(
    engine + " PKCE, subject pinning, refresh rotation, pause and sign-in",
    async () => {
      const client: Client = {
        engine,
        clientId: "fixture",
        secret: "example",
        full: false,
        redirect: engine === "google" ? "http://127.0.0.1:1234/" : callback,
      };
      const a = await authorize(client),
        u = new URL(a.url),
        google = engine === "google";
      assert.equal(u.searchParams.get("code_challenge_method"), "S256");
      const challenge = Buffer.from(
        await crypto.subtle.digest("SHA-256", bytes(a.verifier)),
      ).toString("base64url");
      assert.equal(u.searchParams.get("code_challenge"), challenge);
      assert.ok(!u.href.includes(a.verifier));
      const input =
        client.redirect +
        "?" +
        new URLSearchParams({ state: a.state, code: "fixture-code" });
      assert.throws(
        () => codeFrom(a, input.replace(a.state, "bad"), false),
        /oauthResponse/,
      );
      assert.throws(() => codeFrom(a, "fixture-code", false), /oauthResponse/);
      assert.equal(codeFrom(a, "fixture-code", true), "fixture-code");
      let expired = false,
        rotate = 0,
        subject = "42";
      const http: Transport = async (raw, method, headers, payload) => {
        const url = new URL(raw);
        if (url.pathname.endsWith("/token")) {
          assert.equal(method, "POST");
          const form = new URLSearchParams(new TextDecoder().decode(payload));
          assert.equal(form.get("client_id"), "fixture");
          if (form.get("grant_type") === "authorization_code") {
            assert.equal(form.get("code_verifier"), a.verifier);
            return result({
              access_token: "original",
              refresh_token: "r0",
              expires_in: 3600,
            });
          }
          if (expired) return result({ error: "invalid_grant" }, 400);
          rotate++;
          return result({
            access_token: "refreshed",
            refresh_token: "r1",
            expires_in: 3600,
          });
        }
        if (url.pathname.endsWith("/about") || url.pathname === "/v1/disk")
          return result({
            user: google ? { permissionId: subject } : { uid: subject },
          });
        return result(
          {},
          !expired &&
            headers?.Authorization ===
              (google ? "Bearer " : "OAuth ") + "refreshed"
            ? 200
            : 401,
        );
      };
      const { service, secrets } = memory(http);
      const id = await service.connect(a, input, false),
        root = google
          ? "https://www.googleapis.com/drive/v3/files"
          : "https://cloud-api.yandex.net/v1/disk/resources";
      const send = service.transport(id, engine);
      await assert.rejects(send("https://example.org/file"), /publicUrl/);
      assert.deepEqual(
        await Promise.all([send(root), send(root)]).then((v) =>
          v.map((r) => r.status),
        ),
        [200, 200],
      );
      assert.equal(rotate, 1);
      assert.ok(secrets.get(id)?.includes("r1"));
      assert.ok(!JSON.stringify(service.list()).includes("refreshed"));
      expired = true;
      await assert.rejects(send(root), /loginRequired/);
      assert.equal(service.list()[0].needsLogin, true);
      subject = "43";
      await assert.rejects(
        service.connect(a, input, false, id),
        /oauthIdentity/,
      );
      subject = "42";
      await service.connect(a, input, false, id);
      assert.equal(service.list()[0].needsLogin, false);
      service.logout(id);
      assert.equal(secrets.get(id), "");
      await assert.rejects(send(root), /loginRequired/);
    },
  );
test("Google client JSON accepts the desktop and web downloads", () => {
  assert.equal(
    googleClient('{"installed":{"client_id":"client"}}').clientId,
    "client",
  );
  assert.deepEqual(
    googleClient(
      '{"web":{"client_id":"web","redirect_uris":["https://example.org/oauth","ftp://bad"]}}',
    ).redirects,
    ["https://example.org/oauth"],
  );
  assert.throws(() => googleClient('{"web":{}}'), /clientJson/);
});
test("private Yandex reads and publishes under app:/, polls operations and never authorizes signed transfer URLs", async () => {
  const data = new Map<string, ArrayBuffer>(),
    dirs = new Set([""]),
    reads: string[] = [];
  let pending = false,
    job = 0;
  const auth: Transport = async (raw, method = "GET") => {
    const u = new URL(raw);
    assert.equal(u.hostname, "cloud-api.yandex.net");
    if (u.pathname.endsWith("/operations/1")) {
      job++;
      return result({ status: "success" });
    }
    const full = u.searchParams.get("path")!;
    assert.ok(full.startsWith("app:/"));
    const p = full.slice(5);
    const href =
      "https://downloader.disk.yandex.ru/file?path=" + encodeURIComponent(p);
    if (u.pathname.endsWith("/upload") || u.pathname.endsWith("/download"))
      return result({ href });
    if (method === "PUT") {
      dirs.add(p);
      return result({}, 201);
    }
    if (method === "DELETE") {
      assert.equal(u.searchParams.get("permanently"), "false");
      data.delete(p);
      dirs.delete(p);
      pending = true;
      return result(
        { href: "https://cloud-api.yandex.net/v1/disk/operations/1" },
        202,
      );
    }
    if (u.searchParams.has("fields")) return result({ type: "dir" });
    const direct = (s: string) =>
      s !== p && (s.includes("/") ? s.slice(0, s.lastIndexOf("/")) : "") === p;
    const items = [
      ...[...dirs]
        .filter(direct)
        .map((s) => ({ name: s.split("/").at(-1), type: "dir" })),
      ...(await Promise.all(
        [...data]
          .filter(([s]) => direct(s))
          .map(async ([s, b]) => ({
            name: s.split("/").at(-1),
            type: "file",
            size: b.byteLength,
            sha256: await hash(b),
          })),
      )),
    ];
    return result({
      type: "dir",
      _embedded: { items, total: items.length, offset: 0 },
    });
  };
  const transfer: Transport = async (raw, method, h, b) => {
    assert.equal(h?.Authorization, undefined);
    const key = new URL(raw).searchParams.get("path")!;
    if (method === "PUT") {
      data.set(key, b!);
      return result({}, 201);
    }
    reads.push(key);
    return { status: 200, headers: {}, arrayBuffer: data.get(key)! };
  };
  const s = new CloudStore(
    "y",
    new DiskTree(auth, transfer, "app:/"),
    "",
    false,
  );
  await s.upload("Sub/Я.md", bytes("fixture"));
  assert.deepEqual((await s.list("Sub")).files, ["Sub/Я.md"]);
  assert.equal(
    new TextDecoder().decode(await s.download("Sub/Я.md")),
    "fixture",
  );
  assert.equal(await s.removeEmptyDir("Sub"), false);
  await s.delete("Sub/Я.md");
  assert.ok(pending);
  assert.equal(job, 1);
  assert.equal(await s.stat("Sub/Я.md"), null);
  assert.ok(await s.removeEmptyDir("Sub"));
  assert.equal(await s.stat("Sub"), null);
  const ro = new CloudStore(
    "y",
    new DiskTree(auth, transfer, "app:/"),
    "",
    true,
  );
  await assert.rejects(ro.mkdir("x"), /readonly/);
});
test("Drive sends resumable chunks and refuses an off-origin session", async () => {
  let bad = false;
  const lengths: number[] = [];
  const send: Transport = async (url, method, h, b) => {
    if (method === "POST")
      return result({}, 200, {
        location: bad
          ? "https://other.example/upload"
          : "https://www.googleapis.com/upload/drive/v3/files?upload_id=ab",
      });
    assert.equal(method, "PUT");
    lengths.push(b!.byteLength);
    if (lengths.length === 1)
      return result({}, 308, { range: "bytes=0-8388607" });
    return result({ id: "f" });
  };
  const tree = new DriveTree(send, "root");
  const dir = {
    name: "",
    key: "root",
    type: "folder" as const,
    size: 0,
    mtime: 0,
  };
  await tree.write(dir, "blob.bin", null, new ArrayBuffer(8388609));
  assert.deepEqual(lengths, [8388608, 1]);
  bad = true;
  await assert.rejects(tree.write(dir, "x", null, bytes("x")), /publicUrl/);
});
test("Drive changes advance the cursor without invalidating an unchanged scan", async () => {
  const cursor = { token: "", revision: "" };
  let changed = false;
  const http: Transport = async (raw) =>
    new URL(raw).pathname.endsWith("startPageToken")
      ? result({ startPageToken: "1" })
      : result({
          changes: changed ? [{ fileId: "f" }] : [],
          newStartPageToken: "2",
        });
  const first = await driveRevision(http, cursor);
  assert.equal(await driveRevision(http, cursor), first);
  changed = true;
  assert.notEqual(await driveRevision(http, cursor), first);
});

test("Drive folder cleanup lists all children and requires visibility into the whole folder", async () => {
  let child = true,
    trashed = false;
  const http: Transport = async (raw, method = "GET", h, b) => {
    const url = new URL(raw);
    if (method === "PATCH") {
      assert.equal(url.pathname, "/drive/v3/files/sub");
      assert.deepEqual(JSON.parse(new TextDecoder().decode(b)), {
        trashed: true,
      });
      trashed = true;
      return result({});
    }
    if (url.pathname.endsWith("/root"))
      return result({
        id: "root",
        mimeType: "application/vnd.google-apps.folder",
      });
    assert.equal(method, "GET");
    return result({
      files: url.searchParams.get("q")?.includes("'root'")
        ? [
            {
              id: "sub",
              name: "Sub",
              mimeType: "application/vnd.google-apps.folder",
            },
          ]
        : child
          ? [
              {
                id: "doc",
                name: "Doc",
                mimeType: "application/vnd.google-apps.document",
              },
            ]
          : [],
    });
  };
  const tree = new DriveTree(http, "root"),
    limited = new CloudStore("limited", tree, "", false, false),
    full = new CloudStore("full", tree, "", false, true);
  assert.equal(await full.removeEmptyDir("Sub"), false);
  child = false;
  assert.equal(await limited.removeEmptyDir("Sub"), false);
  assert.equal(trashed, false);
  assert.equal(await full.removeEmptyDir("Sub"), true);
  assert.ok(trashed);
});

test("Drive resumes only matching bytes, probes an uncertain PUT and renews expired sessions", async () => {
  const sessions = new Map<string, string>();
  const port = {
    get: (key: string) => sessions.get(key) ?? null,
    set: (key: string, v: string | null) => {
      if (v) sessions.set(key, v);
      else sessions.delete(key);
    },
  };
  const dir = {
    name: "",
    key: "root",
    type: "folder" as const,
    size: 0,
    mtime: 0,
  };
  const data = new Uint8Array(8388609);
  let starts = 0,
    crash = true,
    expired = false,
    acknowledged = 0,
    lost = false;
  const offsets: number[] = [];
  const send: Transport = async (url, method, headers, bytes) => {
    if (method === "POST") {
      starts++;
      acknowledged = 0;
      return result({}, 200, {
        location:
          "https://www.googleapis.com/upload/drive/v3/files?upload_id=" +
          starts,
      });
    }
    assert.equal(method, "PUT");
    const range = headers!["Content-Range"];
    if (range.startsWith("bytes */")) {
      if (expired) {
        expired = false;
        return result({}, 410);
      }
      if (acknowledged === data.length) return result({});
      return result(
        {},
        308,
        acknowledged ? { range: "bytes=0-" + (acknowledged - 1) } : {},
      );
    }
    const offset = Number(/^bytes (\d+)-/.exec(range)![1]);
    offsets.push(offset);
    assert.equal(offset, acknowledged);
    if (crash && offset) throw Error("disconnect");
    acknowledged += bytes!.byteLength;
    if (lost && offset === 0) {
      lost = false;
      throw Error("remoteNetwork");
    }
    return acknowledged === data.length
      ? result({})
      : result({}, 308, { range: "bytes=0-" + (acknowledged - 1) });
  };
  const write = () =>
    new DriveTree(send, "root", undefined, port).write(
      dir,
      "book",
      null,
      data.buffer,
    );
  await assert.rejects(write(), /disconnect/);
  assert.equal(sessions.size, 1);
  crash = false;
  await write();
  assert.equal(starts, 1);
  assert.equal(offsets.at(-1), 8388608);
  assert.equal(sessions.size, 0);
  crash = true;
  await assert.rejects(write(), /disconnect/);
  data[0] = 1;
  crash = false;
  await write();
  assert.equal(starts, 3);
  crash = true;
  await assert.rejects(write(), /disconnect/);
  expired = true;
  crash = false;
  await write();
  assert.equal(starts, 5);
  lost = true;
  await write();
  assert.deepEqual(offsets.slice(-2), [0, 8388608]);
});

test("Drive reads large objects by exact ranges and rejects inconsistent replies", async () => {
  let wrong = false;
  const size = 8388609,
    ranges: string[] = [];
  const send: Transport = async (_url, _method, h) => {
    const span = h!.Range;
    ranges.push(span);
    const [_, start, end] = /^bytes=(\d+)-(\d+)$/.exec(span)!;
    return {
      status: 206,
      headers: {
        "Content-Range":
          "bytes " + (wrong ? "1" : start) + "-" + end + "/" + size,
      },
      arrayBuffer: new ArrayBuffer(Number(end) - Number(start) + 1),
    };
  };
  const tree = new DriveTree(send, "root");
  const item = {
    name: "book",
    key: "f",
    type: "file" as const,
    size,
    mtime: 0,
    sha256: "f".repeat(64),
  };
  assert.equal((await tree.read(item)).byteLength, size);
  assert.deepEqual(ranges, ["bytes=0-8388607", "bytes=8388608-8388608"]);
  wrong = true;
  await assert.rejects(tree.read(item), /incomplete/);
});
