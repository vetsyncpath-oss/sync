import { fold, join, type StorageProvider } from "./model";
import { RunBudget } from "./runtime";

// Read only ancestor directories. The spelling returned by list() is significant
// even when the Windows adapter's stat() accepts a case-insensitive path.
export async function collisionNames(
  stores: StorageProvider[],
  path: string,
  budget: RunBudget,
) {
  let parents: (string | null)[] = stores.map(() => "");
  for (const component of path.split("/")) {
    const matches = await Promise.all(
      stores.map(async (store, i) => {
        const dir = parents[i];
        if (dir === null) return [];
        const listing = await budget.io(() => store.list(dir));
        const key = fold(join(dir, component));
        return [
          ...listing.folders.map((path) => ({ path, folder: true })),
          ...listing.files.map((path) => ({ path, folder: false })),
        ].filter((entry) => fold(entry.path) === key);
      }),
    );
    const distinct = new Set(
      matches.flat().map((entry) => entry.path + (entry.folder ? "/" : "")),
    );
    if (distinct.size > 1) return [...distinct];
    parents = matches.map((entries) =>
      entries[0]?.folder ? entries[0].path : null,
    );
    if (parents.every((p) => p === null)) break;
  }
  return [];
}
