import { defaults, safe, type Profile } from "./model";
import { cloudId } from "./private-cloud";
import { location } from "./public-location";
import { validConfig, legacyConfig, preset } from "./config-scope";
import { validContent } from "./content-scope";
import { validate } from "./validator";
type Side = "local" | "reference";
export type Endpoint = Pick<
  Profile,
  "access" | "reference" | "remote" | "cloud"
>;
export interface Place {
  id: string;
  name: string;
  endpoint: Endpoint;
}
const scopeKeys = [
  "scope",
  "config",
  "content",
  "maxMiB",
  "include",
  "exclude",
] as const;
const taskKeys = [
  ...scopeKeys,
  "role",
  "mirror",
  "deletions",
  "conflict",
  "trash",
  "trashDays",
  "maxDeleteCount",
  "maxDeletePercent",
  "shrinkPercent",
  "deleteGrace",
  "backup",
  "emptyGuard",
  "silentDeletionSafeguard",
  "inheritMode",
  "mode",
  "firstPlan",
  "startup",
  "startupSeconds",
  "intervalMinutes",
  "onFocus",
  "onOnline",
  "fileEvents",
  "debounceSeconds",
  "quietSeconds",
  "maxDeferrals",
  "strictDrift",
] as const;
type Rules = Partial<Pick<Profile, (typeof taskKeys)[number]>>;
export interface TaskTemplate {
  id: string;
  name: string;
  kind: "task" | "scope";
  rules: Rules;
}
export interface Library {
  places: Place[];
  templates: TaskTemplate[];
}
export const emptyLibrary = (): Library => ({ places: [], templates: [] });
export function loadLibrary(raw: unknown): Library {
  const result = emptyLibrary();
  if (raw == null) return result;
  if (
    typeof raw !== "object" ||
    !("places" in raw) ||
    !("templates" in raw) ||
    !Array.isArray(raw.places) ||
    !Array.isArray(raw.templates)
  )
    throw Error("invalid");
  for (const [rows, target] of [
    [raw.places, "places"],
    [raw.templates, "templates"],
  ] as const) {
    const ids = new Set<string>();
    for (const v of rows) {
      if (
        typeof v?.id !== "string" ||
        !/^[\w-]+$/.test(v.id) ||
        ids.has(v.id) ||
        typeof v.name !== "string" ||
        !v.name.trim()
      )
        throw Error("invalid");
      ids.add(v.id);
      if (target === "places") {
        validEndpoint(v.endpoint);
        result.places.push({ id: v.id, name: v.name, endpoint: v.endpoint });
      } else {
        const t = readTemplate(serializeTemplate(v));
        result.templates.push({ ...t, id: v.id });
      }
    }
  }
  return result;
}
export function endpoint(p: Profile, s: Side): Endpoint {
  if (s === "local" || p.access === "local")
    return { access: "local", reference: p[s] || "/" };
  return p.access === "oauth"
    ? {
        access: "oauth",
        reference: p.reference,
        cloud: structuredClone(p.cloud),
      }
    : {
        access: "public",
        reference: p.reference,
        remote: structuredClone(p.remote),
      };
}
export function validEndpoint(e: Endpoint) {
  if (
    !e ||
    typeof e.reference !== "string" ||
    (e.reference !== "/" && !safe(e.reference))
  )
    throw Error("path");
  if (e.access === "oauth" && e.cloud) cloudId(e.cloud, e.reference);
  else if (e.access === "public" && e.remote) location(e.remote);
  else if (e.access !== "local") throw Error("invalid");
}
export const linkField = (s: Side) =>
  s === "local" ? "localPlace" : "referencePlace";
export function bindPlace(p: Profile, s: Side, place: Place) {
  const e = place.endpoint;
  validEndpoint(e);
  if (s === "local") {
    if (e.access !== "local" || p.scope === "settings") throw Error("invalid");
    p.local = e.reference;
  } else {
    delete p.remote;
    delete p.cloud;
    Object.assign(p, structuredClone(e));
    if (p.access === "public") p.role = "subscriber";
  }
  p[linkField(s)] = place.id;
}
export function detachEdited(p: Profile, library: Library) {
  for (const side of ["local", "reference"] as const) {
    const k = linkField(side),
      match = library.places.find((a) => a.id === p[k]);
    if (
      !match ||
      (side === "local" && p.scope === "settings") ||
      JSON.stringify(endpoint(p, side)) !== JSON.stringify(match.endpoint)
    )
      delete p[k];
  }
}
export const deletionPolicy = (p: Profile) =>
  p.mirror === "full" ? "full" : p.deletions ? "tracked" : "copyOnly";
export function applyPolicy(p: Profile, value: string) {
  p.mirror = value === "full" ? "full" : "preserve";
  p.deletions = value !== "copyOnly";
  if (p.mirror === "full") p.conflict = "source";
}
export function makeTemplate(
  p: Profile,
  name: string,
  kind: TaskTemplate["kind"],
): TaskTemplate {
  const rules: Rules = {};
  for (const k of kind === "task" ? taskKeys : scopeKeys)
    if (p[k] !== undefined)
      Object.assign(rules, { [k]: structuredClone(p[k]) });
  return { id: crypto.randomUUID(), name, kind, rules };
}
export function applyTemplate(p: Profile, t: TaskTemplate) {
  delete p.config;
  delete p.content;
  Object.assign(p, structuredClone(t.rules));
  if (p.access === "public") p.role = "subscriber";
  if (p.scope === "settings") {
    p.fileEvents = p.onFocus = p.onOnline = false;
    if (p.conflict === "both") p.conflict = "source";
    delete p.localPlace;
  }
}
export function readTemplate(text: string): TaskTemplate {
  if (text.length > 1000000) throw Error("invalid");
  const v = JSON.parse(text);
  if (
    v?.format !== "sync-studio-template/1" ||
    !["task", "scope"].includes(v.kind) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    !v.rules ||
    typeof v.rules !== "object" ||
    Array.isArray(v.rules)
  )
    throw Error("invalid");
  const keys: readonly string[] = v.kind === "task" ? taskKeys : scopeKeys;
  const r = v.rules;
  if (
    Object.keys(r).some((k) => !keys.includes(k)) ||
    keys.some((k) => !["config", "content"].includes(k) && !Object.hasOwn(r, k))
  )
    throw Error("invalid");
  if (
    r.content !== undefined &&
    (!validContent(r.content) ||
      Object.keys(r.content).some(
        (k) => !["config", "hidden", "rules", "base"].includes(k),
      ) ||
      r.content.rules.some((v: object) =>
        Object.keys(v).some((k) => k !== "path" && k !== "include"),
      ))
  )
    throw Error("invalid");
  if (
    r.config !== undefined &&
    (!validConfig(r.config) ||
      Object.keys(r.config).some(
        (k) => !Object.hasOwn(legacyConfig(), k) && k !== "pluginLimits",
      ))
  )
    throw Error("invalidConfig");
  const p = { ...defaults, ...r };
  if (p.scope === "settings" && v.kind === "scope") p.fileEvents = false;
  if (validate(p, true, false, ".obsidian").length) throw Error("invalid");
  return makeTemplate(p, v.name.trim(), v.kind);
}
export function serializeTemplate(t: TaskTemplate) {
  return JSON.stringify(
    {
      format: "sync-studio-template/1",
      name: t.name,
      kind: t.kind,
      rules: t.rules,
    },
    null,
    2,
  );
}
export const scenarios = [
  "copyNotes",
  "publishSelection",
  "mirrorTask",
  "appearanceTask",
  "pluginDataTask",
  "manualTask",
] as const;
export function scenario(p: Profile, id: string) {
  p.startup = p.onFocus = p.onOnline = p.fileEvents = false;
  p.intervalMinutes = 0;
  if (id === "copyNotes") p.include = "**/*.md";
  if (id === "publishSelection") {
    p.role = "publisher";
    p.content = { base: "selected", config: false, hidden: false, rules: [] };
  }
  if (id === "mirrorTask") applyPolicy(p, "full");
  if (id === "appearanceTask" || id === "pluginDataTask") {
    p.scope = "settings";
    p.config = {
      ...legacyConfig(),
      legacyThemes: false,
      categories: id === "appearanceTask" ? preset("look") : ["data"],
    };
  }
}
