import { contentReason, type ContentScope } from "./content-scope";
import { configReason, legacyConfig, type ConfigScope } from "./config-scope";
import { fold, join, under, type Scope, type Volatility } from "./model";
export function volatility(p: string, scope: Scope): Volatility {
  if (scope === "content") return "S";
  p = fold(p);
  if (
    /^(workspace(?:-mobile)?\.json|cache(?:\/|$))$/.test(p) ||
    p.startsWith("cache/") ||
    p.endsWith(".lock") ||
    p.split("/").some((x) => x === ".git" || x === "node_modules")
  )
    return "V";
  return /^(?:[^/]+\.json|plugins\/[^/]+\/data\.json)$/.test(p) ? "H" : "S";
}
export function selectionReason(
  p: string,
  scope: Scope,
  configDir: string,
  self: string,
  directory: boolean,
  config: ConfigScope = legacyConfig(),
  content?: ContentScope,
) {
  const f = fold(p);
  if (
    f
      .split("/")
      .some((s) =>
        [".git", ".trash", ".sync-trash", "node_modules"].includes(s),
      ) ||
    (scope === "settings" && under(f, fold("plugins/" + self))) ||
    under(f, fold(join(configDir, "plugins/" + self)))
  )
    return "protected";
  if (scope === "content")
    return contentReason(p, configDir, self, directory, content);
  if (
    volatility(p, scope) === "V" ||
    p.split("/").some((s) => s.startsWith("."))
  )
    return "protected";
  return configReason(p, config, directory);
}
export function selected(...args: Parameters<typeof selectionReason>) {
  return selectionReason(...args) === "included";
}
export const priority = (p: string) =>
  p === "community-plugins.json"
    ? 3
    : p.includes("/")
      ? p.endsWith("/data.json")
        ? 1
        : 0
      : 2;
