import picomatch from "picomatch/posix";
import { fold, type StorageProvider } from "./model";
import { RunBudget } from "./runtime";
export const categories = [
  "core",
  "appearance",
  "themes",
  "snippets",
  "community",
  "code",
  "data",
  "extras",
] as const;
export type Category = (typeof categories)[number];
export interface ConfigScope {
  categories: Category[];
  codeAllow: string;
  codeDeny: string;
  dataAllow: string;
  dataDeny: string;
  include: string;
  exclude: string;
  overlay: string;
  platformFilter: boolean;
  strategy: "batch" | "changes";
  reload: "next" | "now" | "idle" | "never";
  idleSeconds: number;
  legacyThemes: boolean;
}
export function preset(name: string): Category[] {
  switch (name) {
    case "look":
      return ["appearance", "themes", "snippets"];
    case "plugins":
      return ["code", "community"];
    case "noData":
      return categories.filter((c) => c !== "data" && c !== "extras");
    case "full":
      return categories.filter((c) => c !== "extras");
    default:
      return ["core", "appearance", "themes", "snippets", "community", "data"];
  }
}
export const legacyConfig = (): ConfigScope => ({
  categories: preset("legacy"),
  codeAllow: "",
  codeDeny: "",
  dataAllow: "",
  dataDeny: "",
  include: "",
  exclude: "",
  overlay: "",
  platformFilter: true,
  strategy: "changes",
  reload: "next",
  idleSeconds: 30,
  legacyThemes: true,
});
export function category(path: string): Category | undefined {
  const [dir, id, ...tail] = fold(path).split("/");
  if (!id && dir.endsWith(".json"))
    return dir === "appearance.json"
      ? "appearance"
      : dir === "community-plugins.json"
        ? "community"
        : "core";
  if (dir === "themes" && tail.length) return "themes";
  if (dir === "snippets" && path.endsWith(".css")) return "snippets";
  if (dir !== "plugins" || !id || !tail.length) return;
  const file = tail.join("/");
  return file === "data.json"
    ? "data"
    : ["main.js", "manifest.json", "styles.css"].includes(file)
      ? "code"
      : "extras";
}
const terms = (s: string) =>
  s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
const matches = (path: string, patterns: string) =>
  terms(patterns).some((pattern) =>
    picomatch.isMatch(path, pattern, {
      nonegate: true,
      noextglob: true,
      nobrace: true,
      nocase: true,
    }),
  );
export function inScope(path: string, c: ConfigScope, directory: boolean) {
  path = fold(path);
  if (directory)
    return /^(themes|snippets|plugins)(\/|$)/.test(path) || !!c.include;
  const cat = category(path),
    custom = matches(path, c.include);
  if (!custom && (!cat || !c.categories.includes(cat))) return false;
  if (
    c.legacyThemes &&
    cat === "themes" &&
    !custom &&
    !/^themes\/[^/]+\/(manifest\.json|theme\.css)$/.test(path)
  )
    return false;
  if (matches(path, c.exclude)) return false;
  const id = path.startsWith("plugins/") ? path.split("/")[1] : undefined;
  if (!id) return true;
  const [allow, deny] =
    cat === "data" ? [c.dataAllow, c.dataDeny] : [c.codeAllow, c.codeDeny];
  return (!allow.trim() || matches(id, allow)) && !matches(id, deny);
}
export async function mobileExcluded(
  source: StorageProvider,
  target: StorageProvider,
  budget: RunBudget,
) {
  const blocked = new Set<string>();
  for (const store of [source, target]) {
    if (!(await budget.io(() => store.stat("plugins")))) continue;
    const dirs = await budget.io(() => store.list("plugins"));
    for (const folder of dirs.folders) {
      if (!/^plugins\/[^/]+$/.test(folder)) throw Error("path");
      const path = folder + "/manifest.json";
      if (!(await budget.io(() => store.stat(path)))) continue;
      const m = JSON.parse(
        new TextDecoder().decode(await budget.io(() => store.download(path))),
      );
      if (m.isDesktopOnly === true) blocked.add(fold(folder.split("/")[1]));
    }
  }
  return [...blocked];
}
export function validConfig(c: ConfigScope): boolean {
  return (
    !!c &&
    Array.isArray(c.categories) &&
    c.categories.every((k) => categories.includes(k)) &&
    [
      "codeAllow",
      "codeDeny",
      "dataAllow",
      "dataDeny",
      "include",
      "exclude",
      "overlay",
    ].every(
      (k) =>
        typeof c[k as keyof ConfigScope] === "string" &&
        String(c[k as keyof ConfigScope]).length <= 8192,
    ) &&
    typeof c.platformFilter === "boolean" &&
    typeof c.legacyThemes === "boolean" &&
    ["batch", "changes"].includes(c.strategy) &&
    ["now", "next", "idle", "never"].includes(c.reload) &&
    Number.isInteger(c.idleSeconds) &&
    c.idleSeconds >= 1 &&
    c.idleSeconds <= 3600
  );
}
