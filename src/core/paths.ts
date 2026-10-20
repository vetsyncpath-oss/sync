import { createHash } from "node:crypto";
import type { Category, Profile, Snapshot } from "./model";
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
export class PathCollision extends Error {
  constructor(
    message: string,
    public paths: string[],
  ) {
    super(message);
    this.name = "PathCollision";
  }
}
export function uniquePaths(paths: string[]): void {
  const seen = new Map<string, string>();
  for (const p of paths) {
    path(p);
    const key = p.normalize("NFC").toLowerCase();
    if (seen.has(key)) {
      const first = seen.get(key)!;
      throw new PathCollision(
        first === p
          ? `Коллизия: несколько объектов имеют один путь «${p}». В Google Drive допустимы одинаковые имена, в vault — нет. Переименуйте дубль в Drive или исключите этот путь из профиля.`
          : `Коллизия регистра/Unicode: «${first}» и «${p}». Переименуйте один из объектов или исключите путь из профиля.`,
        [...new Set([first, p])],
      );
    }
    seen.set(key, p);
  }
}
export interface ScanRules {
  file(p: string): boolean;
  folder(p: string): boolean;
}
/** Check the combined namespace, including implicit and empty directories. */
export function compatiblePaths(...snapshots: Snapshot[]): void {
  const files = new Set(snapshots.flatMap((s) => Object.keys(s.files)));
  const dirs = new Set(snapshots.flatMap((s) => s.directories || []));
  for (const p of [...files, ...dirs]) {
    const parts = p.split("/");
    while (parts.length > 1) {
      parts.pop();
      dirs.add(parts.join("/"));
    }
  }
  uniquePaths([...new Set([...files, ...dirs])]);
  for (const p of files)
    if (dirs.has(p))
      throw new PathCollision(
        `Коллизия файла и папки: «${p}». Переименуйте объект или исключите путь до синхронизации.`,
        [p],
      );
}
export function scanRules(profile: Profile, config: string): ScanRules {
  return {
    file: (p) => selected(p, profile, config),
    folder: (p) =>
      !protectedPath(p, config) &&
      !protectedPath(join(profile.localRoot, p), config) &&
      configurationFolderSelected(
        join(profile.localRoot, p),
        profile,
        config,
      ) &&
      !profile.excludePaths.some((x) => under(p, x)) &&
      (profile.scope !== "folders" ||
        profile.folders.some((x) => under(p, x) || under(x, p))),
  };
}
function configurationFolderSelected(
  p: string,
  profile: Profile,
  config: string,
): boolean {
  p = p.normalize("NFC").toLowerCase();
  config = config.normalize("NFC").toLowerCase();
  if (!under(p, config)) return true;
  const enabled = new Set(profile.categories);
  const plugins =
    enabled.has("plugin-code") ||
    (enabled.has("plugin-settings") && !profile.excludeData);
  if (p === config)
    return enabled.has("settings") || enabled.has("themes") || plugins;
  const relative = p.slice(config.length + 1);
  if (under(relative, "plugins")) return plugins;
  if (under(relative, "themes") || under(relative, "snippets"))
    return enabled.has("themes");
  return enabled.has("settings");
}
export function category(p: string, config: string): Category {
  p = p.normalize("NFC").toLowerCase();
  config = config.normalize("NFC").toLowerCase();
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
  p = p.normalize("NFC").toLowerCase();
  config = config.normalize("NFC").toLowerCase();
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
  if (profile.excludeData && /\/plugins\/[^/]+\/data\.json$/i.test("/" + local))
    return false;
  if (
    profile.excludeWorkspace &&
    /(^|\/)workspace(-mobile)?\.json$/i.test(local)
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
  if (p.oneWayMode === "mirror" && p.direction === "both")
    throw Error("Зеркало поддерживает только одно направление.");
  if (
    !Number.isFinite(p.maxMB) ||
    p.maxMB <= 0 ||
    !Number.isFinite(p.intervalMinutes) ||
    p.intervalMinutes < 1
  )
    throw Error("Некорректный размер или интервал.");
}
