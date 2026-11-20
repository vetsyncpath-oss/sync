const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const { join } = require("node:path");
const { createHash } = require("node:crypto");

test("Desktop JSON login uses PKCE, exchanges the loopback code and returns a renewable grant", async () => {
  const { Window } = await import("happy-dom");
  const win = new Window(),
    doc = win.document;
  const proto = win.HTMLElement.prototype;
  proto.setText = function (text) {
    this.textContent = text;
  };
  proto.empty = function () {
    this.replaceChildren();
  };
  proto.createEl = function (tag, opts = {}) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(opts.attr || {})) el.setAttribute(k, v);
    if (opts.href) el.href = opts.href;
    if (opts.text) el.textContent = opts.text;
    this.appendChild(el);
    return el;
  };
  proto.createDiv = function () {
    return this.createEl("div");
  };
  class Modal {
    constructor() {
      this.contentEl = doc.body.createDiv();
    }
    setTitle() {}
    open() {
      this.onOpen();
    }
    close() {
      this.onClose();
    }
  }
  class Setting {
    constructor(el) {
      this.el = el;
    }
    addButton(fn) {
      const el = this.el.createEl("button");
      fn({
        setButtonText(v) {
          el.textContent = v;
          return this;
        },
        setCta() {
          return this;
        },
        setDisabled(v) {
          el.disabled = v;
          return this;
        },
        onClick(f) {
          el.onclick = f;
          return this;
        },
      });
      return this;
    }
  }
  let challenge,
    tokenRequests = 0;
  const obsidian = {
    Modal,
    Setting,
    async requestUrl({ url, body, headers }) {
      let data;
      if (url === "https://oauth2.googleapis.com/token") {
        const form = new URLSearchParams(body);
        assert.equal(form.get("code"), "test-code");
        assert.equal(form.get("client_id"), "test.apps.googleusercontent.com");
        assert.equal(
          createHash("sha256")
            .update(form.get("code_verifier"))
            .digest("base64url"),
          challenge,
        );
        tokenRequests++;
        data = {
          access_token: "test-access",
          refresh_token: "test-refresh",
          expires_in: 3600,
          scope: "openid https://www.googleapis.com/auth/drive",
        };
      } else {
        assert.equal(url, "https://openidconnect.googleapis.com/v1/userinfo");
        assert.equal(headers.Authorization, "Bearer test-access");
        data = { sub: "test-subject" };
      }
      const text = JSON.stringify(data);
      return {
        status: 200,
        headers: {},
        text,
        arrayBuffer: new TextEncoder().encode(text).buffer,
      };
    },
  };
  const electron = {
    shell: {
      async openExternal(url) {
        const query = new URL(url).searchParams;
        challenge = query.get("code_challenge");
        assert.equal(query.get("code_challenge_method"), "S256");
        const callback = new URL(query.get("redirect_uri"));
        assert.equal(callback.hostname, "127.0.0.1");
        callback.search = new URLSearchParams({
          code: "test-code",
          state: query.get("state"),
        });
        assert.equal((await fetch(callback)).status, 200);
      },
    },
  };
  const source = buildSync({
    entryPoints: [join(__dirname, "../src/google-login.js")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["obsidian", "electron"],
  }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function("module", "exports", "require", source)(
    mod,
    mod.exports,
    (id) =>
      id === "obsidian" ? obsidian : id === "electron" ? electron : require(id),
  );
  let grant;
  const modal = new mod.exports.GoogleLogin(
    {},
    new AbortController().signal,
    (r) => {
      grant = JSON.parse(r);
    },
  );
  try {
    modal.open();
    const input = doc.querySelector("textarea"),
      start = doc.querySelector("button");
    input.value = '{"web":{}}';
    input.oninput();
    assert.equal(start.disabled, true);
    input.value =
      '{"installed":{"client_id":"test.apps.googleusercontent.com"}}';
    input.oninput();
    assert.equal(start.disabled, false);
    await start.onclick();
    assert.equal(tokenRequests, 1);
    assert.equal(grant.refresh, "test-refresh");
    assert.equal(grant.subject, "test-subject");
  } finally {
    modal.close();
    await win.happyDOM.abort();
  }
});
