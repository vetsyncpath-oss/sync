import { legacyConfig } from "./config-scope";
import { defaults, type Mode, type Profile } from "./model";
export interface Configuration {
  version: 2;
  profiles: Profile[];
  current: string;
  mode: Mode;
  paused: boolean;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function loadProfiles(raw: unknown): Configuration {
  let profiles: Profile[] = [];
  let current = "",
    mode: Mode = "plan",
    paused = false;
  if (object(raw) && Array.isArray(raw.profiles)) {
    const ids = new Set<string>();
    for (const entry of raw.profiles) {
      if (!object(entry) || typeof entry.id !== "string" || ids.has(entry.id))
        throw Error("invalid");
      ids.add(entry.id);
      profiles.push({ ...defaults, ...entry });
    }
    current = String(raw.current);
    mode = raw.mode === "silent" ? "silent" : "plan";
    paused = raw.paused === true;
  } else if (object(raw) && object(raw.profile)) {
    // Existing manual profiles must not start writing after installing an update.
    profiles = [
      {
        ...defaults,
        startup: false,
        onFocus: false,
        onOnline: false,
        intervalMinutes: 0,
        inheritMode: false,
        trash: "vault",
        ...raw.profile,
      },
    ];
  }
  for (const p of profiles) {
    if (p.scope === "settings" && p.config === undefined) {
      p.config = legacyConfig();
      p.startup = false;
      p.intervalMinutes = 0;
      p.onFocus = false;
      p.onOnline = false;
    }
  }
  return {
    version: 2,
    profiles,
    current: profiles.some((p) => p.id === current)
      ? current
      : (profiles[0]?.id ?? ""),
    mode,
    paused,
  };
}
export function newProfile(copy?: Profile): Profile {
  const id = crypto.randomUUID(),
    tag = id.slice(0, 6);
  return copy
    ? { ...structuredClone(copy), id, name: copy.name + " (2)", enabled: false }
    : {
        ...defaults,
        id,
        name: "Sync Studio " + tag,
        local: "Sync Studio-copy-" + tag,
        reference: "Sync Studio-source-" + tag,
        enabled: false,
        fileEvents: true,
      };
}
