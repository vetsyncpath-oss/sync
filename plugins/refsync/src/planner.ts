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
}
export interface Plan {
  ops: Op[];
  held: string[];
  count: number;
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
  const names = new Map<string, string>();
  for (const snap of [src, dst])
    for (const [paths, kind] of [
      [snap.files.keys(), "file"],
      [snap.directories.keys(), "folder"],
    ] as const)
      for (const path of paths) {
        const key = fold(path),
          sig = kind + " " + path;
        if (names.has(key) && names.get(key) !== sig) throw Error("collision");
        names.set(key, sig);
      }
  const ops: Op[] = [],
    deletes: Op[] = [];
  for (const path of new Set([...src.files.keys(), ...dst.files.keys()])) {
    const s = src.files.get(path),
      t = dst.files.get(path),
      b = Object.hasOwn(base.entries, path) ? base.entries[path] : undefined;
    if (!s) {
      if (t && (p.mirror === "full" || (p.deletions && b?.delivered)))
        deletes.push({ path, action: "delete", conflict: false });
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
    const conflict =
      !!t &&
      s.kind === "S" &&
      (!b || (t.hash !== b.hash && s.hash !== b.applied));
    const action =
      conflict && t && p.mirror !== "full"
        ? resolve(p.conflict, s, t)
        : "write";
    ops.push({ path, action, source: s, conflict });
  }
  const protect =
    (p.emptyGuard &&
      (src.files.size === 0 ||
        (base.size > 0 && src.files.size < base.size * 0.5))) ||
    deletes.length > 100 ||
    deletes.length > Math.max(5, dst.files.size * 0.5);
  if (!protect) ops.push(...deletes);
  ops.sort(
    (a, b) =>
      priority(a.path) - priority(b.path) || a.path.localeCompare(b.path),
  );
  return {
    ops,
    forgotten: Object.keys(base.entries).filter(
      (path) => !src.files.has(path) && !dst.files.has(path),
    ),
    held: protect ? deletes.map((d) => d.path) : [],
    count: src.files.size,
    direction: "SourceToTarget",
  };
}
