import type { NetRequest, NetTransport } from "../sources/types";

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
