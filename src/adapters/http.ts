import { request as httpsRequest } from "node:https";
import type { NetRequest, NetResponse, NetTransport } from "../sources/types";
export class Http implements NetTransport {
  async fetch(url: string, opts: NetRequest = {}): Promise<NetResponse> {
    let current = url;
    let request = { ...opts };
    for (let i = 0; i <= 5; i++) {
      const response = await this.once(current, request);
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      if (opts.redirect !== "follow") return response;
      if (
        (request.method || "GET") !== "GET" ||
        !response.headers.location ||
        i === 5
      )
        throw Error("Невозможно завершить перенаправление скачивания");
      const next = new URL(response.headers.location, current);
      const previous = new URL(current);
      const yandex = (host: string) =>
        ["yandex.net", "yandex.ru", "yandex.com"].some(
          (d) => host === d || host.endsWith("." + d),
        );
      if (
        next.protocol !== "https:" ||
        next.username ||
        next.password ||
        (next.origin !== previous.origin &&
          !(yandex(next.hostname) && yandex(previous.hostname)))
      )
        throw Error("Небезопасный адрес перенаправления");
      request = {
        ...request,
        headers: Object.fromEntries(
          Object.entries(request.headers || {}).filter(
            ([key]) =>
              !["authorization", "cookie", "host"].includes(key.toLowerCase()),
          ),
        ),
      };
      current = next.href;
    }
    throw Error("Слишком много перенаправлений");
  }
  private async once(url: string, opts: NetRequest = {}): Promise<NetResponse> {
    opts.signal?.throwIfAborted();
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password)
      throw Error("Небезопасный сетевой адрес");
    const body =
      opts.body === undefined
        ? undefined
        : typeof opts.body === "string"
          ? Buffer.from(opts.body, "utf8")
          : Buffer.from(
              opts.body instanceof ArrayBuffer
                ? new Uint8Array(opts.body)
                : opts.body,
            );
    const headers = { ...opts.headers };
    if (
      body !== undefined &&
      !Object.keys(headers).some((k) => k.toLowerCase() === "content-length")
    )
      headers["Content-Length"] = String(body.byteLength);
    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        u,
        {
          method: opts.method || "GET",
          headers,
          signal: opts.signal,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > (opts.maxBytes ?? 4 * 1024 * 1024)) {
              req.destroy(new Error("Ответ превышает разрешённый размер"));
              return;
            }
            chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            const bytes = Buffer.concat(chunks);
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers))
              if (v !== undefined)
                headers[k] = Array.isArray(v) ? v.join(",") : v;
            resolve({
              status: res.statusCode || 0,
              headers,
              text: async () => bytes.toString("utf8"),
              arrayBuffer: async () => Uint8Array.from(bytes).buffer,
            });
          });
        },
      );
      req.on("error", (e) =>
        reject(
          opts.signal?.aborted
            ? opts.signal.reason
            : Object.assign(
                new Error(
                  (e as Error).message.includes("размер") ||
                    (e as Error).message === "Тайм-аут"
                    ? (e as Error).message
                    : "Сетевой запрос не выполнен" +
                        ((e as NodeJS.ErrnoException).code
                          ? " (" + (e as NodeJS.ErrnoException).code + ")"
                          : ""),
                ),
                { code: (e as NodeJS.ErrnoException).code },
              ),
        ),
      );
      req.setTimeout(60000, () => req.destroy(new Error("Тайм-аут")));
      if (body !== undefined) req.write(body);
      req.end();
    });
  }
}
export async function json(
  http: NetTransport,
  url: string,
  opts: NetRequest = {},
): Promise<any> {
  const r = await http.fetch(url, opts);
  if (r.status < 200 || r.status >= 300) {
    let reason = "";
    try {
      const body = JSON.parse(await r.text());
      const candidate =
        typeof body.error === "string"
          ? body.error
          : body.error?.errors?.[0]?.reason || body.error?.status;
      if (
        typeof candidate === "string" &&
        /^[a-zA-Z0-9_.-]{1,100}$/.test(candidate)
      )
        reason = " (" + candidate + ")";
    } catch {
      /* Do not include raw responses, keys or signed URLs in diagnostics. */
    }
    const hint =
      r.status === 401
        ? " Переподключите аккаунт: токен недействителен."
        : r.status === 403
          ? " Проверьте права доступа и включение API сервиса."
          : r.status === 404
            ? " Проверьте путь/ID папки и доступ аккаунта."
            : r.status === 429
              ? " Лимит запросов сервиса. Повторите позже."
              : " Повторите проверку подключения.";
    throw Object.assign(
      Error(new URL(url).hostname + ": HTTP " + r.status + reason + hint),
      { status: r.status },
    );
  }
  try {
    return JSON.parse(await r.text());
  } catch {
    throw Error("Некорректный JSON API");
  }
}
export async function bytes(
  http: NetTransport,
  url: string,
  opts: NetRequest = {},
): Promise<Uint8Array> {
  const r = await http.fetch(url, opts);
  if (r.status !== 200)
    throw Object.assign(Error("Скачивание: HTTP " + r.status), {
      status: r.status,
    });
  return new Uint8Array(await r.arrayBuffer());
}
