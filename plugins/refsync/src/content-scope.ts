import { fold, parent, safe, under } from "./model";
export interface ContentScope {
  base?: "all" | "selected";
  config: boolean;
  hidden: boolean;
  rules: { path: string; include: boolean }[];
}
export const plainContent = (): ContentScope => ({
  config: false,
  hidden: false,
  rules: [],
});
export function validContent(c: ContentScope) {
  return (
    c &&
    (c.base === undefined || c.base === "all" || c.base === "selected") &&
    typeof c.config === "boolean" &&
    typeof c.hidden === "boolean" &&
    Array.isArray(c.rules) &&
    c.rules.every(
      (r) =>
        r &&
        typeof r.path === "string" &&
        safe(r.path) &&
        typeof r.include === "boolean",
    )
  );
}
const compiled = new WeakMap<
  ContentScope,
  { rules: Map<string, boolean>; parents: Set<string> }
>();
function index(c: ContentScope) {
  let i = compiled.get(c);
  if (!i) {
    i = { rules: new Map(), parents: new Set() };
    for (const r of c.rules) {
      const key = fold(r.path);
      i.rules.set(key, r.include);
      if (r.include)
        for (let d = parent(key); d; d = parent(d)) i.parents.add(d);
    }
    compiled.set(c, i);
  }
  return i;
}
export function folderIncluded(path: string, c: ContentScope) {
  const { rules } = index(c);
  for (let d = fold(path); d; d = parent(d)) {
    const included = rules.get(d);
    if (included !== undefined) return included;
  }
  return c.base !== "selected";
}
export function contentReason(
  path: string,
  configDir: string,
  self: string,
  directory: boolean,
  c?: ContentScope,
) {
  const f = fold(path),
    cfg = fold(configDir);
  if (
    f
      .split("/")
      .some((x) =>
        [
          ".git",
          ".trash",
          ".sync-trash",
          "node_modules",
          ".sync-manifest.json",
        ].includes(x),
      ) ||
    /(?:\.tmp$|(?:^|\/)(?:thumbs\.db|desktop\.ini)$)/i.test(f) ||
    under(f, cfg + "/plugins/" + fold(self))
  )
    return "protected";
  const settings = under(f, cfg);
  if (settings && !c?.config) return "configOff";
  const relative = settings ? f.slice(cfg.length + 1) : f;
  if (
    settings &&
    /^(?:workspace(?:-mobile)?\.json$|cache(?:\/|$))|\.lock$/.test(relative)
  )
    return "protected";
  if (!c?.hidden && relative.split("/").some((s) => s.startsWith(".")))
    return "hiddenOff";
  if (!c) return "included";
  // A partial plugin selection must leave the device's enabled-plugin list intact.
  if (
    settings &&
    relative === "community-plugins.json" &&
    ((c.base === "selected" && !folderIncluded(cfg + "/plugins", c)) ||
      c.rules.some(
        (r) =>
          !r.include &&
          (under(fold(r.path), cfg + "/plugins") ||
            under(cfg + "/plugins", fold(r.path))),
      ))
  )
    return "protectedList";
  return folderIncluded(f, c) || (directory && index(c).parents.has(f))
    ? "included"
    : "folderRule";
}
export function contentPath(...args: Parameters<typeof contentReason>) {
  return contentReason(...args) === "included";
}
export function setFolders(
  c: ContentScope,
  paths: string[],
  include: boolean,
): ContentScope {
  const targets = new Set(paths.map(fold));
  const rules = c.rules.filter((r) => {
    for (let d = fold(r.path); d; d = parent(d))
      if (targets.has(d)) return false;
    return true;
  });
  const base = { ...c, rules };
  return {
    ...base,
    rules: [
      ...rules,
      ...paths
        .filter((p) => folderIncluded(p, base) !== include)
        .map((path) => ({ path, include })),
    ],
  };
}
