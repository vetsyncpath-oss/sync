import { type Profile } from "./model";
export interface PublicSource {
  engine: "google" | "yandex" | "git";
  url: string;
  branch: string;
}
export function location(remote: PublicSource) {
  if (
    !remote ||
    typeof remote.url !== "string" ||
    typeof remote.branch !== "string"
  )
    throw Error("publicUrl");
  const value = remote.url.trim();
  if (remote.engine === "yandex" && /^[a-zA-Z0-9+/=_-]{20,512}$/.test(value))
    return { root: value, resourceKey: "" };
  if (remote.engine === "google" && /^[A-Za-z0-9_-]+$/.test(value))
    return { root: value, resourceKey: "" };
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw Error("publicUrl");
  }
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error("publicUrl");
  if (remote.engine === "google") {
    if (u.host !== "drive.google.com") throw Error("publicUrl");
    const id =
      /^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)\/?$/.exec(u.pathname)?.[1] ??
      (u.pathname === "/open" ? u.searchParams.get("id") : null);
    const resourceKey = u.searchParams.get("resourcekey") ?? "";
    if (
      !id ||
      !/^[-\w]+$/.test(id) ||
      (resourceKey && !/^[-\w]+$/.test(resourceKey))
    )
      throw Error("publicUrl");
    return { root: id, resourceKey };
  }
  if (
    remote.engine === "yandex" &&
    /^(?:yadi\.sk|disk(?:\.360)?\.yandex\.(?:ru|com|kz|by))$/.test(u.host) &&
    /^\/(?:d|i)\/[\w-]+\/?$/.test(u.pathname)
  )
    return { root: u.origin + u.pathname.replace(/\/$/, ""), resourceKey: "" };
  if (remote.engine === "git" && !u.search && !u.hash && u.pathname !== "/") {
    const ref = remote.branch;
    if (
      ref &&
      (ref.startsWith("-") ||
        ref.startsWith("/") ||
        ref.endsWith("/") ||
        ref.endsWith(".") ||
        ref.split("/").some((s) => s.startsWith(".") || s.endsWith(".lock")) ||
        /[\s~^:?*\[\\\x00-\x1f\x7f]|\.\.|@\{|\/\//.test(ref))
    )
      throw Error("gitBranch");
    return { root: u.href.replace(/\/$/, ""), resourceKey: "" };
  }
  throw Error("publicUrl");
}
export function referenceId(p: Profile) {
  if (p.access === "local")
    return "vault:" + (p.reference === "/" ? "" : p.reference);
  if (p.access !== "public" || !p.remote) throw Error("publicUrl");
  return JSON.stringify([
    p.remote.engine,
    location(p.remote).root,
    p.remote.engine === "git" ? p.remote.branch : "",
    p.reference === "/" ? "" : p.reference,
  ]);
}
