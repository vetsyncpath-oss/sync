import { RunBudget, transient } from "./runtime";
import { selected, volatility } from "./classifier";
import {
  checked,
  fold,
  hash,
  parent,
  type Scope,
  type Snapshot,
  type StorageProvider,
} from "./model";
export async function scan(
  provider: StorageProvider,
  scope: Scope,
  configDir: string,
  self: string,
  skipHotTarget = false,
  budget = new RunBudget(),
  accept = (path: string) => true,
  maxMiB = 0,
): Promise<Snapshot> {
  const snap: Snapshot = {
    files: new Map(),
    directories: new Set(),
    complete: false,
    skipped: new Map(),
  };
  const todo = [""],
    seen = new Set<string>();
  if ((await budget.io(() => provider.stat("")))?.type !== "folder")
    throw Error("missingRoot");
  while (todo.length) {
    const dir = todo.pop()!;
    const list = await budget.io(() => provider.list(dir));
    for (const [paths, isDir] of [
      [list.files, false],
      [list.folders, true],
    ] as const) {
      for (const p of paths) {
        if (parent(p) !== dir) throw Error("path");
        if (!selected(p, scope, configDir, self, isDir)) continue;
        checked(p);
        if (seen.has(fold(p))) throw Error("collision");
        seen.add(fold(p));
        if (isDir) {
          snap.directories.add(p);
          todo.push(p);
          continue;
        }
        if (!accept(p)) {
          snap.skipped!.set(p, "filter");
          continue;
        }
        try {
          const stat = await budget.io(() => provider.stat(p));
          if (stat?.type !== "file") throw Error("incomplete");
          if (maxMiB > 0 && stat.size > maxMiB * 1048576) {
            snap.skipped!.set(p, "filter");
            continue;
          }
          const kind = volatility(p, scope);
          if (kind === "H" && skipHotTarget) {
            snap.files.set(p, {
              hash: "",
              size: stat.size,
              mtime: stat.mtime,
              kind,
            });
            continue;
          }
          const bytes = await budget.io(() => provider.download(p));
          if (bytes.byteLength !== stat.size) throw Error("incomplete");
          snap.files.set(p, {
            hash: await hash(bytes),
            size: stat.size,
            mtime: stat.mtime,
            kind,
          });
        } catch (e) {
          if (!transient(e)) throw e;
          snap.skipped!.set(p, "locked");
        }
      }
    }
  }
  snap.complete = true;
  return snap;
}
