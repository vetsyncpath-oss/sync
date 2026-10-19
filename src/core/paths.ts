import { createHash } from "node:crypto";
import type { Category, Profile } from "./model";
export const sha = (b: Uint8Array) =>
  createHash("sha256").update(b).digest("hex");
export function path(value: string, allowEmpty = false): string {
  const v = value.replace(/\/$/, "");
  if (!v && allowEmpty) return "";
  if (
    !v ||
    v.startsWith("/") ||
    v.includes("\\") ||
    /[\x00-\x1f<>:"|?*]/.test(v) ||
    v
      .split("/")
      .some(
        (s) =>
          !s ||
          s === "." ||
          s === ".." ||
          /[. ]$/.test(s) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s),
      )
  )
    throw Error("Недопустимый относительный путь: " + value);
  return v;
}
export const join = (a: string, b: string) => (a ? a + "/" + b : b);
export const under = (p: string, root: string) =>
  !root || p === root || p.startsWith(root + "/");
export function uniquePaths(paths: string[]): void {
  const seen = new Set<string>();
  for (const p of paths) {
    path(p);
    const key = p.normalize("NFC").toLowerCase();
    if (seen.has(key)) throw Error("Коллизия имён или регистра: " + p);
    seen.add(key);
  }
}
export function category(p: string, config: string): Category {
  if (under(p, config)) {
    const rel = p.slice(config.length + 1);
    if (/^plugins\/[^/]+\/data\.json$/.test(rel)) return "plugin-settings";
    if (/^plugins\//.test(rel)) return "plugin-code";
    if (/^(themes|snippets)\//.test(rel)) return "themes";
    return "settings";
  }
  return /\.md$/i.test(p) ? "notes" : "attachments";
}
export function protectedPath(p: string, config: string): boolean {
  return (
    p
      .split("/")
      .some((s) =>
        [".git", ".trash", ".sync-studio", ".sync-conflicts"].includes(s),
      ) || under(p, config + "/plugins/sync-studio")
  );
}
export function selected(
  p: string,
  profile: Profile,
  config: string,
  size?: number,
): boolean {
  const local = join(profile.localRoot, p);
  if (protectedPath(local, config) || protectedPath(p, config)) return false;
  if (profile.scope === "folders" && !profile.folders.some((f) => under(p, f)))
    return false;
  if (profile.excludePaths.some((f) => under(p, f))) return false;
  if (profile.excludeData && /\/plugins\/[^/]+\/data\.json$/.test("/" + local))
    return false;
  if (
    profile.excludeWorkspace &&
    /(^|\/)workspace(-mobile)?\.json$/.test(local)
  )
    return false;
  if (size !== undefined && size > profile.maxMB * 1024 * 1024) return false;
  return profile.categories.includes(category(local, config));
}
export function validate(p: Profile): void {
  path(p.localRoot, true);
  for (const v of [...p.folders, ...p.excludePaths]) path(v);
  path(p.subpath, true);
  if (!p.name.trim() || !p.connectionId || !p.remoteRoot.trim())
    throw Error("Укажите название, подключение и корень источника.");
  if (!p.categories.length || (p.scope === "folders" && !p.folders.length))
    throw Error("Область файлов пуста.");
  if (
    !Number.isFinite(p.maxMB) ||
    p.maxMB <= 0 ||
    !Number.isFinite(p.intervalMinutes) ||
    p.intervalMinutes < 1
  )
    throw Error("Некорректный размер или интервал.");
}
