const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const source = readFileSync(join(__dirname, "../main.js"), "utf8");
const encode = (bytes) => Uint8Array.from(Buffer.from(bytes)).buffer;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const result = (status, data, headers = {}) => {
  const binary = Buffer.isBuffer(data)
    ? data
    : Buffer.from(JSON.stringify(data));
  return {
    status,
    headers,
    arrayBuffer: encode(binary),
    text: binary.toString(),
  };
};

class Provider {
  constructor(engine) {
    this.engine = engine;
    this.account = "first";
    this.files = new Map();
    this.pending = new Map();
    this.mutations = 0;
    this.refreshCount = 0;
    this.token = "access";
    this.revision = 0;
  }
  put(name, content) {
    const bytes = Buffer.from(content);
    this.files.set(name, {
      bytes,
      version: String(++this.revision),
      id: name,
      name,
      mimeType: "application/octet-stream",
      size: bytes.length,
      sha256Checksum: sha(bytes),
      path: "disk:/Notes/" + name,
      type: "file",
      sha256: sha(bytes),
      modified: "2026-01-20T00:00:00Z",
    });
  }
  request({ url, method = "GET", headers = {}, body }) {
    const u = new URL(url),
      q = u.searchParams;
    if (u.hostname === "oauth2.googleapis.com") {
      assert.equal(new URLSearchParams(body).get("refresh_token"), "refresh");
      this.refreshCount++;
      return result(200, {
        access_token: this.token,
        expires_in: 3600,
        refresh_token: "rotated",
      });
    }
    if (u.hostname === "openidconnect.googleapis.com") {
      assert.equal(headers.Authorization, "Bearer " + this.token);
      return result(200, { sub: "subject" });
    }
    if (u.hostname === "transfer.yandex.net") {
      assert.equal(headers.Authorization, undefined);
      const name = q.get("name");
      if (method === "PUT") {
        this.put(name, Buffer.from(body));
        this.mutations++;
        return result(201, {});
      }
      return result(200, this.files.get(name).bytes);
    }
    if (this.engine === "google") {
      assert.equal(u.origin, "https://www.googleapis.com");
      assert.equal(headers.Authorization, "Bearer " + this.token);
      if (u.pathname.endsWith("/about"))
        return result(200, { user: { permissionId: this.account } });
      if (u.pathname.startsWith("/upload/")) {
        const boundary = headers["Content-Type"].split("boundary=")[1];
        const segments = Buffer.from(body)
          .toString("latin1")
          .split("--" + boundary);
        const meta = JSON.parse(segments[1].split("\r\n\r\n")[1]);
        if (method === "PATCH")
          assert.equal(
            headers["If-Match"],
            '"' + this.files.get(meta.name).version + '"',
          );
        const content = segments[2].slice(
          segments[2].indexOf("\r\n\r\n") + 4,
          -2,
        );
        this.put(meta.name, Buffer.from(content, "latin1"));
        this.mutations++;
        return result(200, this.files.get(meta.name));
      }
      const name = decodeURIComponent(u.pathname.split("/").at(-1));
      if (name === "root")
        return result(200, {
          id: "root",
          mimeType: "application/vnd.google-apps.folder",
        });
      if (name === "files")
        return result(200, { files: [...this.files.values()] });
      const f = this.files.get(name);
      if (!f) return result(404, {});
      if (method === "PATCH") {
        assert.deepEqual(JSON.parse(body), { trashed: true });
        assert.equal(headers["If-Match"], '"' + f.version + '"');
        this.files.delete(name);
        this.mutations++;
        return result(200, { id: name });
      }
      return result(200, q.get("alt") === "media" ? f.bytes : f, {
        ETag: '"' + f.version + '"',
      });
    }
    assert.equal(u.origin, "https://cloud-api.yandex.net");
    assert.equal(headers.Authorization, "OAuth " + this.token);
    if (u.pathname.endsWith("/disk"))
      return result(200, { user: { uid: this.account } });
    const path = q.get("path"),
      name = path.slice("disk:/Notes/".length);
    if (path === "disk:/Notes")
      return result(200, {
        type: "dir",
        _embedded: {
          items: [...this.files.values()],
          total: this.files.size,
          offset: 0,
        },
      });
    if (/\/(upload|download)$/.test(u.pathname)) {
      if (u.pathname.endsWith("/upload"))
        assert.equal(q.get("overwrite"), String(this.files.has(name)));
      return result(200, {
        href:
          "https://transfer.yandex.net/bytes?name=" + encodeURIComponent(name),
      });
    }
    if (method === "DELETE") {
      assert.equal(q.get("permanently"), "false");
      this.files.delete(name);
      this.mutations++;
      return result(204, {});
    }
    return this.files.has(name)
      ? result(200, this.files.get(name))
      : result(404, {});
  }
}

async function fixture(engine) {
  const api = new Provider(engine),
    files = new Map();
  class TFile {
    constructor(path, data) {
      this.path = path;
      this.data = encode(data);
      this.stat = { mtime: 1 };
    }
  }
  const vault = {
    configDir: ".obsidian",
    getAllLoadedFiles: () => [...files.values()],
    getAbstractFileByPath: (path) => files.get(path),
    readBinary: async (f) => f.data,
    createBinary: async (p, b) => files.set(p, new TFile(p, b)),
    modifyBinary: async (f, b) => {
      f.data = b;
    },
    adapter: { exists: async (p) => files.has(p) },
    trash: async (f) => files.delete(f.path),
  };
  const obsidian = {
    Plugin: class {
      addSettingTab() {}
      addRibbonIcon() {}
      addCommand() {}
      async loadData() {}
      async saveData(s) {
        this.disk = s;
      }
    },
    PluginSettingTab: class {},
    Modal: class {},
    TFile,
    TFolder: class {},
    requestUrl: async (req) => api.request(req),
  };
  const module = { exports: {} };
  new Function("module", "require", source)(module, (id) => {
    assert.equal(id, "obsidian");
    return obsidian;
  });
  const pl = new module.exports();
  pl.app = { vault, workspace: { onLayoutReady() {} } };
  await pl.onload();
  const pair = pl.pair();
  Object.assign(pair.settings, {
    engine,
    url: engine === "google" ? "root" : "disk:/Notes",
    deletion: "propagate",
  });
  pl.passwords.set(pair.id, api.token);
  const sync = async (preview) => {
    const rows = [];
    await pl.sync(pair, !!preview, rows);
    return rows;
  };
  return {
    api,
    pl,
    pair,
    sync,
    files,
    put: (p, b) => files.set(p, new TFile(p, b)),
  };
}

for (const engine of ["google", "yandex"])
  test(
    engine + " — transfers, conflicts, trash, account change, preview",
    async () => {
      const { api, pl, pair, sync, files, put } = await fixture(engine);
      api.put("remote.bin", [9, 0, 255]);
      put("local.bin", [255, 0, 8]);
      const preview = await sync(true);
      assert.equal(api.mutations, 0);
      assert.equal(files.size, 1);
      assert.deepEqual(pair.state.files, {});
      assert.deepEqual(await sync(), preview);
      assert.deepEqual(
        Buffer.from(files.get("remote.bin").data),
        Buffer.from([9, 0, 255]),
      );
      assert.deepEqual(
        api.files.get("local.bin").bytes,
        Buffer.from([255, 0, 8]),
      );
      assert.deepEqual(await sync(), []);
      put("local.bin", [1]);
      await sync();
      assert.deepEqual(api.files.get("local.bin").bytes, Buffer.from([1]));
      api.put("local.bin", [2]);
      put("local.bin", [3]);
      assert.match((await sync())[0], /Конфликт/);
      pair.settings.conflict = "remote";
      await sync();
      assert.deepEqual(
        Buffer.from(files.get("local.bin").data),
        Buffer.from([2]),
      );
      files.delete("local.bin");
      api.files.delete("remote.bin");
      await sync();
      assert.equal(api.files.size + files.size, 0);
      api.put("account.bin", [7]);
      await sync();
      files.delete("account.bin");
      api.account = "second";
      await sync();
      assert.ok(files.has("account.bin"));
      assert.ok(api.files.has("account.bin"));
      assert.ok(!JSON.stringify(pl.disk).includes('"access"'));
    },
  );

test("Google refresh credentials, subject check and rotation stay out of data.json", async () => {
  const { pl, pair, api, sync } = await fixture("google");
  const data = {
    client: { clientId: "unit.apps.googleusercontent.com" },
    refresh: "refresh",
    subject: "subject",
  };
  pl.passwords.set(pair.id, JSON.stringify(data));
  await sync();
  assert.equal(api.refreshCount, 1);
  assert.equal(JSON.parse(pl.passwords.get(pair.id)).refresh, "rotated");
  assert.ok(!JSON.stringify(pl.disk).includes("rotated"));
  pl.passwords.set(pair.id, JSON.stringify({ ...data, subject: "other" }));
  await assert.rejects(sync, /identity changed/);
});
