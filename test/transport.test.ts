import { test } from "node:test";
import assert from "node:assert/strict";
import { Http, json } from "../src/adapters/http";
import type { NetRequest } from "../src/sources/types";
const response = (status: number, headers = {}, body = "") => ({
  status,
  headers,
  text: async () => body,
  arrayBuffer: async () => new ArrayBuffer(0),
});
test("signed Yandex downloads follow HTTPS redirects without forwarding credentials", async () => {
  const http = new Http();
  const calls: { url: string; opts: NetRequest }[] = [];
  (http as any).once = async (url: string, opts: NetRequest) => {
    calls.push({ url, opts });
    return calls.length === 1
      ? response(302, { location: "https://storage.yandex.net/content" })
      : response(200);
  };
  await http.fetch("https://downloader.disk.yandex.ru/file", {
    redirect: "follow",
    headers: { Authorization: "secret", Cookie: "session" },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].opts.headers, {});
});
test("download redirect refuses unrelated hosts and insecure destinations", async () => {
  for (const location of [
    "https://attacker.test/file",
    "http://storage.yandex.net/file",
  ]) {
    const http = new Http();
    (http as any).once = async () => response(302, { location });
    await assert.rejects(
      () =>
        http.fetch("https://downloader.disk.yandex.ru/file", {
          redirect: "follow",
        }),
      /Небезопасный/,
    );
  }
});
test("OAuth requests never follow redirects implicitly", async () => {
  const http = new Http();
  let calls = 0;
  (http as any).once = async () => {
    calls++;
    return response(302, { location: "https://example.test" });
  };
  const r = await http.fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: "private",
  });
  assert.equal(calls, 1);
  assert.equal(r.status, 302);
});
test("API diagnostics expose status and reason but never signed URLs or raw secrets", async () => {
  const http = {
    fetch: async () =>
      response(
        403,
        {},
        JSON.stringify({
          error: {
            message: "private signed-token",
            errors: [{ reason: "insufficientPermissions" }],
          },
        }),
      ),
  };
  await assert.rejects(
    () =>
      json(http, "https://www.googleapis.com/drive/v3/files?key=private-key"),
    (e) => {
      assert.match(String(e), /403.*insufficientPermissions/);
      assert.ok(!String(e).includes("private"));
      return true;
    },
  );
});
