import { location } from "./public-location";
import { validConfig } from "./config-scope";
import { parseOverlay } from "./json-overlay";
import { type Profile, safe, under, fold } from "./model";
type Field = keyof Profile;
export interface Rule {
  field: Field;
  code: string;
  visible?: false;
  locked?: boolean;
  forced?: string | boolean;
  invalid?: boolean;
}
export function profileRules(
  p: Profile,
  desktop: boolean,
  readOnly: boolean,
): Rule[] {
  const rules: Rule[] = [];
  const force = (field: Field, forced: string | boolean, code: string) =>
    rules.push({
      field,
      forced,
      code,
      locked: true,
      invalid: p[field] !== forced,
    });
  if (p.access === "public" || readOnly)
    force("role", "subscriber", "readonly");
  if (p.mirror === "full") {
    force("deletions", true, "mirror");
    force("conflict", "source", "mirror");
  }
  if (p.scope === "settings") {
    if (p.conflict === "both") force("conflict", "source", "configConflict");
    rules.push({
      field: "fileEvents",
      visible: false,
      code: "configEvents",
      invalid: p.fileEvents,
    });
  }
  if (p.role === "publisher")
    for (const field of ["deletions", "conflict"] as const)
      rules.push({ field, visible: false, code: "publisher" });
  if (!desktop)
    rules.push({
      field: "watch",
      visible: false,
      code: "mobile",
      invalid: p.watch,
    });
  if (p.mode === "silent")
    rules.push({ field: "firstPlan", code: "silentDefault" });
  if (p.mirror === "full" && (p.local === "/" || !p.local)) {
    for (const field of ["backup", "emptyGuard"] as const)
      rules.push({ field, code: "guard", invalid: !p[field] });
  }
  return rules;
}
export function validate(
  p: Profile,
  desktop: boolean,
  readOnly: boolean,
  configDir: string,
): Rule[] {
  const errors = profileRules(p, desktop, readOnly).filter((r) => r.invalid);
  const err = (field: Field, code: string) =>
    errors.push({ field, code, invalid: true });
  const enums = {
    trash: ["plugin", "vault", "system", "permanent"],
    role: ["subscriber", "publisher"],
    scope: ["settings", "content"],
    access: ["local", "public", "oauth", "token"],
    mirror: ["full", "preserve"],
    conflict: ["source", "target", "both", "newer"],
    mode: ["plan", "silent"],
  };
  for (const [k, values] of Object.entries(enums))
    if (!values.includes(String(p[k as Field]))) err(k as Field, "invalid");
  for (const key of ["local", "reference"] as const)
    if (
      typeof p[key] !== "string" ||
      (p[key] !== "/" && p[key] !== "" && !safe(p[key]))
    )
      err(key, "path");
  if (p.access === "public") {
    try {
      if (!p.remote) throw Error("publicUrl");
      location(p.remote);
    } catch (e) {
      err("remote", e instanceof Error ? e.message : "publicUrl");
    }
  }
  if (!/^[\w-]+$/.test(p.id)) err("id", "invalid");
  for (const k of [
    "enabled",
    "inheritMode",
    "startup",
    "onFocus",
    "onOnline",
    "deletions",
    "backup",
    "emptyGuard",
    "silentDeletionSafeguard",
    "firstPlan",
    "fileEvents",
    "watch",
    "strictDrift",
  ] as const)
    if (typeof p[k] !== "boolean") err(k, "invalid");
  for (const [field, max] of [
    ["maxDeleteCount", 1000000],
    ["maxDeletePercent", 100],
    ["shrinkPercent", 100],
    ["deleteGrace", 1000],
    ["startupSeconds", 3600],
    ["intervalMinutes", 10080],
    ["quietSeconds", 600],
    ["debounceSeconds", 600],
    ["maxDeferrals", 100],
    ["maxMiB", 1048576],
    ["trashDays", 3650],
  ] as const) {
    if (!Number.isInteger(p[field]) || p[field] < 0 || p[field] > max)
      err(field, "invalid");
  }
  if (typeof p.name !== "string" || !p.name.trim()) err("name", "invalid");
  for (const field of ["include", "exclude"] as const)
    if (typeof p[field] !== "string" || p[field].length > 4096)
      err(field, "invalid");
  if (p.config !== undefined) {
    if (!validConfig(p.config)) err("config", "invalidConfig");
    else
      try {
        parseOverlay(p.config.overlay);
      } catch {
        err("config", "overlaySyntax");
      }
  }
  if (errors.length) return errors;
  const local = fold(
      p.scope === "settings" ? configDir : p.local === "/" ? "" : p.local,
    ),
    ref = fold(p.reference === "/" ? "" : p.reference);
  if (p.access === "local" && (under(local, ref) || under(ref, local)))
    err("reference", "overlap");
  const hidden = (path: string) =>
    path.split("/").some((s) => s.startsWith(".") || s === "node_modules");
  if (p.access === "local" && hidden(ref)) err("reference", "protected");
  if (p.scope === "content" && hidden(local)) err("local", "protected");
  if (
    (p.access === "local" && under(ref, fold(configDir))) ||
    (p.scope === "content" && under(local, fold(configDir)))
  )
    err("reference", "protected");
  return errors;
}
