import { managerId } from "./vam-gate";
import picomatch from "picomatch/posix";
import { fold, hash, type Bytes } from "./model";
type Json = null | boolean | string | number | Json[] | { [key: string]: Json };
export interface OverlayRule {
  file: string;
  keys: string[];
}
export interface Projection {
  rules: OverlayRule[];
  blocked: string[];
  self: string;
}
export function parseOverlay(text: string): OverlayRule[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const split = line.indexOf("=>");
      if (split < 1) throw Error("overlaySyntax");
      const file = line.slice(0, split).trim(),
        expr = line
          .slice(split + 2)
          .trim()
          .replace(/^\$\./, "")
          .replace(/\[(\*|[0-9]+)\]/g, ".$1");
      const keys = expr.split(".");
      if (
        !file ||
        keys.some((k) => !k || (k !== "*" && !/^[\p{L}\p{N}_$-]+$/u.test(k)))
      )
        throw Error("overlaySyntax");
      return { file, keys };
    });
}
const record = (x: Json | undefined): x is Record<string, Json> =>
  !!x && typeof x === "object" && !Array.isArray(x);
function combine(
  source: Json | undefined,
  local: Json | undefined,
  rules: string[][],
): Json | undefined {
  if (rules.some((r) => !r.length)) return local;
  const obj = record(source) || (source === undefined && record(local)),
    array =
      Array.isArray(source) || (source === undefined && Array.isArray(local));
  if (!obj && !array) return source;
  const result: Record<string, Json> = Object.create(null);
  const a = (
    (obj && record(source)) || (array && Array.isArray(source)) ? source : {}
  ) as Record<string, Json>;
  const b = (
    (obj && record(local)) || (array && Array.isArray(local)) ? local : {}
  ) as Record<string, Json>;
  for (const key of [
    ...new Set([...Object.keys(a), ...Object.keys(b)]),
  ].sort()) {
    const next = rules
      .filter((r) => r[0] === key || r[0] === "*")
      .map((r) => r.slice(1));
    const value = combine(
      Object.hasOwn(a, key) ? a[key] : undefined,
      next.length && Object.hasOwn(b, key) ? b[key] : undefined,
      next,
    );
    if (value !== undefined) result[key] = value;
  }
  if (
    !Object.keys(result).length &&
    (source === undefined ||
      (rules.length && Object.keys(a).length > 0 && !local))
  )
    return undefined;
  if (array) {
    const out: Json[] = [];
    for (const k of Object.keys(result)) out[Number(k)] = result[k];
    return out;
  }
  return result;
}
const decode = (b: Bytes): Json =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b));
const encode = (v: Json) =>
  new TextEncoder().encode(JSON.stringify(v) + "\n").buffer;
export function project(
  path: string,
  bytes: Bytes,
  policy: Projection,
  local?: Bytes | null,
  keepSelf = false,
): Bytes {
  if (!path.toLowerCase().endsWith(".json")) return bytes;
  const src = decode(bytes),
    rules = policy.rules
      .filter((r) => picomatch.isMatch(path, r.file, { nocase: true }))
      .map((r) => r.keys);
  if (fold(path) === "community-plugins.json") {
    if (!Array.isArray(src) || src.some((id) => typeof id !== "string"))
      throw Error("invalidConfig");
    const ids = (src as string[]).filter(
      (id) =>
        fold(id) !== managerId &&
        fold(id) !== fold(policy.self) &&
        !policy.blocked.includes(fold(id)),
    );
    const old = local ? decode(local) : null;
    if (Array.isArray(old) && old.includes(managerId)) ids.push(managerId);
    if (keepSelf || (Array.isArray(old) && old.includes(policy.self)))
      ids.push(policy.self);
    return encode([...new Set(ids)].sort());
  }
  const old = rules.length && local ? decode(local) : undefined;
  return encode(
    combine(src, old, rules) ??
      (Array.isArray(src) ? [] : record(src) ? {} : src),
  );
}
export const settingsHash = (path: string, bytes: Bytes, policy: Projection) =>
  hash(project(path, bytes, policy));
export function deliveryBytes(
  path: string,
  bytes: Bytes,
  policy: Projection,
  local?: Bytes | null,
  keepSelf = false,
): Bytes {
  if (
    fold(path) !== "community-plugins.json" &&
    !policy.rules.some((r) => picomatch.isMatch(path, r.file, { nocase: true }))
  )
    return bytes;
  return project(path, bytes, policy, local, keepSelf);
}
