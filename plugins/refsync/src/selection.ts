import { sortOps, type Plan, type Action } from "./planner";
import { parent, type Profile } from "./model";
export type Choices = ReadonlyMap<string, Action | "skip">;
export function selectPlan(
  profile: Profile,
  fresh: Plan,
  review: Plan,
  choices?: Choices,
  release?: ReadonlySet<string>,
): Plan {
  const seen = new Map(review.ops.map((op) => [op.path, op]));
  const skippedFolders = new Set(
    review.ops
      .filter((o) => o.action === "mkdir" && choices?.get(o.path) === "skip")
      .map((o) => o.path),
  );
  const ops = fresh.ops.flatMap((op) => {
    const before = seen.get(op.path);
    for (let d = parent(op.path); d; d = parent(d))
      if (skippedFolders.has(d)) return [];
    if (!before || choices?.get(op.path) === "skip") return [];
    if (op.action === "ack") return [op];
    if (
      before.source?.hash !== op.source?.hash ||
      before.action !== op.action ||
      before.conflict !== op.conflict
    )
      throw Error("referenceChanged");
    const decision = choices?.get(op.path);
    if (!decision || decision === op.action) return [op];
    if (
      !op.conflict ||
      profile.mirror === "full" ||
      !(
        decision === "write" ||
        decision === "retain" ||
        (decision === "both" && profile.scope === "content")
      )
    )
      throw Error("invalid");
    return [{ ...op, action: decision }];
  });
  const reviewedHeld = new Set(review.held);
  const folders = new Set(fresh.heldFolders),
    reviewedFolders = new Set(review.heldFolders);
  const held = fresh.held.filter((path) => {
    if (!release?.has(path) || !reviewedHeld.has(path)) return true;
    if (folders.has(path) !== reviewedFolders.has(path))
      throw Error("referenceChanged");
    ops.push({
      path,
      action: folders.has(path) ? "rmdir" : "delete",
      conflict: false,
    });
    return false;
  });
  return {
    ...fresh,
    ops: sortOps(ops),
    held,
    heldFolders: held.filter((p) => folders.has(p)),
  };
}
