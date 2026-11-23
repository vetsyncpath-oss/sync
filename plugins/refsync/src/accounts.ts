import { hash } from "./model";
import { type Transport, json, record } from "./public-cloud";
export type CloudEngine = "google" | "yandex";
export interface Client {
  engine: CloudEngine;
  clientId: string;
  secret: string;
  full: boolean;
  redirect: string;
}
export interface Account {
  id: string;
  engine: CloudEngine;
  subject: string;
  label: string;
  full: boolean;
  needsLogin: boolean;
  expires: number;
}
interface Grant {
  client: Client;
  refresh: string;
  access: string;
}
interface Port {
  list: () => Account[];
  save: (a: Account[]) => void;
  get: (id: string) => string | null;
  set: (id: string, data: string) => void;
}
export const callback = "obsidian://refsync-oauth";
const endpoints = {
  google: [
    "https://accounts.google.com/o/oauth2/v2/auth",
    "https://oauth2.googleapis.com/token",
  ],
  yandex: [
    "https://oauth.yandex.ru/authorize",
    "https://oauth.yandex.ru/token",
  ],
};
const encode = (s: string) => new TextEncoder().encode(s).buffer;
const base64 = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export function googleClient(raw: string) {
  try {
    const doc = JSON.parse(raw),
      c = doc.installed ?? doc.web;
    if (typeof c?.client_id !== "string" || !c.client_id.trim()) throw Error();
    return {
      clientId: c.client_id as string,
      secret: typeof c.client_secret === "string" ? c.client_secret : "",
      web: !doc.installed,
      redirects: Array.isArray(c.redirect_uris)
        ? c.redirect_uris.filter(
            (x: unknown): x is string =>
              typeof x === "string" && x.startsWith("https://"),
          )
        : ([] as string[]),
    };
  } catch {
    throw Error("clientJson");
  }
}
export async function authorize(client: Client) {
  if (!client.clientId.trim()) throw Error("clientId");
  let uri: URL;
  try {
    uri = new URL(client.redirect);
  } catch {
    throw Error("redirect");
  }
  if (
    !(
      uri.protocol === "https:" ||
      (client.engine === "google" &&
        uri.origin === `http://127.0.0.1:${uri.port}` &&
        uri.port) ||
      (client.engine === "yandex" && uri.href === callback)
    ) ||
    uri.username ||
    uri.password ||
    uri.search ||
    uri.hash
  )
    throw Error("redirect");
  const state = base64(crypto.getRandomValues(new Uint8Array(32))),
    verifier = base64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encode(verifier))),
  );
  const scope =
    client.engine === "google"
      ? "https://www.googleapis.com/auth/drive" + (client.full ? "" : ".file")
      : client.full
        ? "cloud_api:disk.read cloud_api:disk.write cloud_api:disk.info"
        : "cloud_api:disk.app_folder cloud_api:disk.info";
  const query = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirect,
    response_type: "code",
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (client.engine === "google") {
    query.set("access_type", "offline");
    query.set("prompt", "consent select_account");
  } else query.set("force_confirm", "yes");
  return {
    url: endpoints[client.engine][0] + "?" + query,
    state,
    verifier,
    client: { ...client },
    expires: Date.now() + 600000,
  };
}
export type Attempt = Awaited<ReturnType<typeof authorize>>;
export function codeFrom(a: Attempt, input: string, manual: boolean) {
  if (Date.now() > a.expires) throw Error("oauthExpired");
  const s = input.trim();
  if (manual && /^[\w./=-]+$/.test(s) && !s.includes(":")) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw Error("oauthResponse");
  }
  const dest = new URL(a.client.redirect);
  if (
    u.protocol !== dest.protocol ||
    u.host !== dest.host ||
    u.pathname !== dest.pathname ||
    u.searchParams.get("state") !== a.state
  )
    throw Error("oauthResponse");
  if (u.searchParams.has("error")) throw Error("oauthDenied");
  const code = u.searchParams.get("code");
  if (!code) throw Error("oauthResponse");
  return code;
}
async function token(
  http: Transport,
  client: Client,
  fields: Record<string, string>,
) {
  const form = new URLSearchParams({ ...fields, client_id: client.clientId });
  if (client.secret) form.set("client_secret", client.secret);
  const res = await http(
    endpoints[client.engine][1],
    "POST",
    { "Content-Type": "application/x-www-form-urlencoded" },
    encode(form.toString()),
  );
  let d: Record<string, unknown>;
  try {
    d = record(JSON.parse(new TextDecoder().decode(res.arrayBuffer)));
  } catch {
    throw Error("remoteHttp");
  }
  if (d.error === "invalid_grant") throw Error("oauthExpired");
  if (
    res.status !== 200 ||
    typeof d.access_token !== "string" ||
    !d.access_token
  )
    throw Error("oauthExchange");
  const ttl = Number(d.expires_in ?? 3600);
  if (!Number.isFinite(ttl) || ttl <= 0) throw Error("oauthExchange");
  return {
    access: d.access_token,
    refresh: typeof d.refresh_token === "string" ? d.refresh_token : "",
    expires: Date.now() + ttl * 1000,
  };
}
export class Accounts {
  private refreshing = new Map<string, Promise<string>>();
  constructor(
    private port: Port,
    private http: Transport,
  ) {}
  list() {
    return this.port.list();
  }
  private put(a: Account) {
    this.port.save([...this.list().filter((v) => v.id !== a.id), a]);
  }
  private grant(id: string): Grant {
    const raw = this.port.get(id);
    if (!raw) throw Error("loginRequired");
    return JSON.parse(raw);
  }
  async connect(
    a: Attempt,
    input: string,
    manual: boolean,
    expected?: string,
    active = () => true,
  ) {
    const code = codeFrom(a, input, manual),
      client = a.client;
    const t = await token(this.http, client, {
      grant_type: "authorization_code",
      code,
      redirect_uri: client.redirect,
      code_verifier: a.verifier,
    });
    const g = client.engine === "google";
    const about = await json(
      this.http,
      g
        ? "https://www.googleapis.com/drive/v3/about?fields=user(permissionId,displayName)"
        : "https://cloud-api.yandex.net/v1/disk?fields=user.uid,user.display_name",
      { Authorization: (g ? "Bearer " : "OAuth ") + t.access },
    );
    const u = record(about.user),
      sub = g ? u.permissionId : u.uid;
    if ((typeof sub !== "string" && typeof sub !== "number") || !String(sub))
      throw Error("oauthIdentity");
    const subject = String(sub),
      id = await hash(
        encode(
          JSON.stringify([
            client.engine,
            client.clientId,
            client.full,
            subject,
          ]),
        ),
      );
    if (expected && expected !== id) throw Error("oauthIdentity");
    if (!active()) throw Error("stopped");
    const refresh =
      t.refresh || (this.port.get(id) ? this.grant(id).refresh : "");
    if (!refresh) throw Error("oauthExchange");
    this.port.set(id, JSON.stringify({ client, refresh, access: t.access }));
    const name = g ? u.displayName : u.display_name;
    this.put({
      id,
      engine: client.engine,
      subject,
      label: typeof name === "string" ? name : subject,
      full: client.full,
      needsLogin: false,
      expires: t.expires,
    });
    return id;
  }
  client(id: string) {
    return this.grant(id).client;
  }
  logout(id: string) {
    const a = this.list().find((v) => v.id === id);
    if (a) {
      this.port.set(id, "");
      this.put({ ...a, needsLogin: true, expires: 0 });
    }
  }
  private async access(id: string, engine: CloudEngine, rejected?: string) {
    const a = this.list().find((v) => v.id === id && v.engine === engine);
    if (!a || a.needsLogin) throw Error("loginRequired");
    if (!this.port.get(id)) {
      this.put({ ...a, needsLogin: true });
      throw Error("loginRequired");
    }
    const g = this.grant(id);
    if (g.access !== rejected && a.expires > Date.now() + 60000)
      return g.access;
    const running = this.refreshing.get(id);
    if (running) return running;
    const work = (async () => {
      try {
        const t = await token(this.http, g.client, {
          grant_type: "refresh_token",
          refresh_token: g.refresh,
        });
        if (this.port.get(id) !== JSON.stringify(g))
          throw Error("loginRequired");
        this.port.set(
          id,
          JSON.stringify({
            ...g,
            access: t.access,
            refresh: t.refresh || g.refresh,
          }),
        );
        this.put({ ...a, expires: t.expires });
        return t.access;
      } catch (e) {
        if (
          e instanceof Error &&
          e.message === "oauthExpired" &&
          this.port.get(id) === JSON.stringify(g)
        ) {
          this.put({ ...a, needsLogin: true });
          throw Error("loginRequired");
        }
        throw e;
      }
    })().finally(() => this.refreshing.delete(id));
    this.refreshing.set(id, work);
    return work;
  }
  transport(id: string, engine: CloudEngine): Transport {
    return async (url, method, headers, body) => {
      const u = new URL(url),
        google = engine === "google";
      if (
        u.origin !==
          (google
            ? "https://www.googleapis.com"
            : "https://cloud-api.yandex.net") ||
        !(google ? /^\/(upload\/)?drive\/v3\// : /^\/v1\/disk(?:\/|$)/).test(
          u.pathname,
        )
      )
        throw Error("publicUrl");
      const send = (access: string) =>
        this.http(
          url,
          method,
          {
            ...headers,
            Authorization: (google ? "Bearer " : "OAuth ") + access,
          },
          body,
        );
      const first = await this.access(id, engine);
      let r = await send(first);
      if (r.status === 401) {
        const refreshed = await this.access(id, engine, first);
        r = await send(refreshed);
        if (r.status === 401) {
          const a = this.list().find((a) => a.id === id);
          if (a && this.grant(id).access === refreshed)
            this.put({ ...a, needsLogin: true });
          throw Error("loginRequired");
        }
      }
      return r;
    };
  }
}
