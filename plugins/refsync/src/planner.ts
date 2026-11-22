import { resolveConflict, type ConflictResolver } from "./conflict-resolver";
import { priority } from "./classifier";
import {
  type Snapshot,
  type Profile,
  type Baseline,
  type Entry,
  type Direction,
  fold,
} from "./model";
export type Action = "write" | "delete" | "retain" | "ack" | "both";
export interface Op {
  path: string;
  action: Action;
  source?: Entry;
  conflict: boolean;
  target?: Entry;
}
export interface Plan {
  ops: Op[];
  held: string[];
  count: number;
  deferred: { path: string; reason: string }[];
  forgotten: string[];
  direction: Direction;
}
export function plan(
  p: Profile,
  src: Snapshot,
  dst: Snapshot,
  base: Baseline,
  resolve: ConflictResolver = resolveConflict,
): Plan {
  if (!src.complete || !dst.complete) throw Error("incomplete");
  const skipped = new Map([...(src.skipped ?? []), ...(dst.skipped ?? [])]);
  const names = new Map<string, string>();
  for (const snap of [src, dst])
    for (const [paths, kind] of [
      [snap.files.keys(), "file"],
      [snap.directories.keys(), "folder"],
    ] as const)
      for (const path of paths) {
        const key = fold(path),
          sig = kind + " " + path;
        if (names.has(key) && names.get(key) !== sig)
          skipped.set(path, "collision");
        names.set(key, sig);
      }
  const alias = (s: string) =>
    fold(s)
      .split("/")
      .map((k) => k.replace(/[. ]+$/, ""))
      .join("/");
  const blocked = new Set([...skipped.keys()].map(alias));
  const protectedPath = (path: string) => {
    const parts = alias(path).split("/");
    while (parts.length) {
      if (blocked.has(parts.join("/"))) return true;
      parts.pop();
    }
    return false;
  };
  const deferred = [...skipped]
    .filter(([, reason]) => reason !== "filter")
    .map(([path, reason]) => ({ path, reason }));
  const ops: Op[] = [],
    deletes: Op[] = [];
  for (const path of new Set([...src.files.keys(), ...dst.files.keys()])) {
    if (protectedPath(path)) continue;
    const s = src.files.get(path),
      t = dst.files.get(path),
      b = Object.hasOwn(base.entries, path) ? base.entries[path] : undefined;
    if (!s) {
      if (
        p.scope === "settings" &&
        p.role === "subscriber" &&
        fold(path) === "community-plugins.json"
      )
        continue;
      if (t && (p.mirror === "full" || (p.deletions && b?.delivered)))
        deletes.push({ path, action: "delete", conflict: false, target: t });
      continue;
    }
    if (s.kind === "V") continue;
    if (s.hash === t?.hash) {
      ops.push({ path, action: "ack", source: s, conflict: false });
      continue;
    }
    const strict =
      p.strictDrift || (p.scope === "content" && p.mirror === "full");
    if (!strict && b?.seen === s.hash) continue;
    if (
      !strict &&
      p.scope === "settings" &&
      s.rawHash &&
      b?.seen === s.rawHash &&
      s.rawHash !== s.hash
    )
      continue;
    const conflict =
      !!t &&
      s.kind === "S" &&
      (!b || (t.hash !== b.hash && s.hash !== b.applied));
    const action =
      conflict && t && p.mirror !== "full"
        ? resolve(p.conflict, s, t)
        : "write";
    ops.push({ path, action, source: s, target: t, conflict });
  }
  const protect =
    (p.emptyGuard &&
      (src.files.size === 0 ||
        (base.size > 0 &&
          src.files.size < base.size * (1 - p.shrinkPercent / 100)))) ||
    deletes.length > p.maxDeleteCount ||
    deletes.length >
      Math.max(p.deleteGrace, (dst.files.size * p.maxDeletePercent) / 100);
  if (!protect) ops.push(...deletes);
  ops.sort(
    (a, b) =>
      priority(a.path) - priority(b.path) || a.path.localeCompare(b.path),
  );
  return {
    ops,
    deferred,
    forgotten: Object.keys(base.entries).filter(
      (path) =>
        !protectedPath(path) && !src.files.has(path) && !dst.files.has(path),
    ),
    held: protect ? deletes.map((d) => d.path) : [],
    count: src.files.size,
    direction: "SourceToTarget",
  };
}
