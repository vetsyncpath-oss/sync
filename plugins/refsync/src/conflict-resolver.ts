import type { Entry, Policy } from "./model";
export type ConflictResolver = (
  policy: Policy,
  source: Entry,
  target: Entry,
) => "both" | "write" | "retain";
export const resolveConflict: ConflictResolver = (policy, s, t) => {
  if (policy === "both") return "both";
  if (
    policy === "target" ||
    (policy === "newer" &&
      Number.isFinite(s.mtime) &&
      Number.isFinite(t.mtime) &&
      t.mtime > s.mtime + 2000)
  )
    return "retain";
  return "write";
};
