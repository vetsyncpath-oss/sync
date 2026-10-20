import type { NetRequest, NetResponse, NetTransport } from "./types";

// Based on the sequential 8 MiB session approach in Sync Engine (MIT).
// Unlike a blind chunk retry, acknowledge only the Range returned by Drive.
const CHUNK = 8 * 1024 * 1024;
export function driveMime(p: string): string {
  const types: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    canvas: "application/json",
    base: "application/json",
    css: "text/css",
    js: "text/javascript",
    html: "text/html",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    gif: "image/gif",
    webp: "image/webp",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
  };
  return (
    types[p.split(".").at(-1)!.toLowerCase()] || "application/octet-stream"
  );
}
function failure(r: NetResponse): never {
  throw Object.assign(Error("Загрузка Drive: HTTP " + r.status), {
    status: r.status,
  });
}
function offset(r: NetResponse, total: number): number {
  if (!r.headers.range) return 0;
  const m = /^bytes=0-(\d+)$/.exec(r.headers.range);
  const n = m ? Number(m[1]) + 1 : NaN;
  if (!Number.isSafeInteger(n) || n < 0 || n >= total)
    throw Error("Некорректное подтверждение диапазона Drive");
  return n;
}
export async function driveUpload(
  http: NetTransport,
  url: string,
  method: "POST" | "PATCH",
  metadata: Record<string, unknown>,
  data: Uint8Array,
  options: NetRequest,
): Promise<any> {
  const total = data.length;
  const start = await http.fetch(url, {
    ...options,
    method,
    body: JSON.stringify(metadata),
    headers: {
      ...options.headers,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(total),
      "X-Upload-Content-Type": String(
        metadata.mimeType || "application/octet-stream",
      ),
    },
  });
  if (start.status < 200 || start.status >= 300) failure(start);
  if (!start.headers.location)
    throw Error("Drive не вернул адрес сессии загрузки");
  const session = new URL(start.headers.location);
  if (
    session.origin !== "https://www.googleapis.com" ||
    session.username ||
    session.password ||
    !session.pathname.startsWith("/upload/drive/v3/files")
  )
    throw Error("Недоверенный адрес сессии Drive");
  const send = (body: Uint8Array, range: string) =>
    http.fetch(session.href, {
      ...options,
      method: "PUT",
      body,
      redirect: "error",
      headers: {
        ...options.headers,
        "Content-Type": "application/octet-stream",
        "Content-Range": range,
      },
    });
  // An interrupted PUT may have committed; query that session, never create a new file.
  const query = async (): Promise<NetResponse> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      options.signal?.throwIfAborted();
      try {
        const r = await send(new Uint8Array(), `bytes */${total}`);
        if (r.status < 500 && r.status !== 429) return r;
      } catch (e) {
        options.signal?.throwIfAborted();
        if (attempt === 2) throw e;
      }
    }
    throw Error(
      "Не удалось проверить сессию Drive. Перепроверьте файлы перед повторным запуском.",
    );
  };
  let at = 0,
    stalls = 0,
    interruptions = 0;
  while (true) {
    options.signal?.throwIfAborted();
    const end = Math.min(at + CHUNK, total);
    let r: NetResponse;
    try {
      r = await send(
        data.subarray(at, end),
        total ? `bytes ${at}-${end - 1}/${total}` : "bytes */0",
      );
      if (r.status >= 500 || r.status === 429) {
        if (++interruptions > 3) failure(r);
        r = await query();
      }
    } catch (e) {
      options.signal?.throwIfAborted();
      if (++interruptions > 3) throw e;
      r = await query();
    }
    if (r.status === 200 || r.status === 201) return JSON.parse(await r.text());
    if (r.status !== 308) failure(r);
    const next = offset(r, total);
    if (next < at || next > end)
      throw Error("Drive подтвердил неожиданный диапазон загрузки");
    if (next === at) {
      if (++stalls > 3) throw Error("Загрузка Drive не продвигается");
    } else stalls = 0;
    at = next;
  }
}
