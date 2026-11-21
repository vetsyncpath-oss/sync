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
export function selected(
  p: string,
  scope: Scope,
  configDir: string,
  self: string,
  directory: boolean,
): boolean {
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
    return false;
  if (scope === "content")
    return (
      !under(f, fold(configDir)) &&
      !p.split("/").some((s) => s.startsWith(".")) &&
      !/(?:\.tmp$|(?:^|\/)(?:thumbs\.db|desktop\.ini)$)/i.test(p)
    );
  if (
    volatility(p, scope) === "V" ||
    p.split("/").some((s) => s.startsWith("."))
  )
    return false;
  if (directory)
    return /^(themes|snippets)(\/|$)|^plugins(?:\/[^/]+)?$/.test(p);
  return /^[^/]+\.json$|^themes\/[^/]+\/(manifest\.json|theme\.css)$|^snippets\/.+\.css$|^plugins\/[^/]+\/data\.json$/.test(
    p,
  );
}
export const priority = (p: string) =>
  p === "community-plugins.json"
    ? 3
    : p.includes("/")
      ? p.endsWith("/data.json")
        ? 1
        : 0
      : 2;
