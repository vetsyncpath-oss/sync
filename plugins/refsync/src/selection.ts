import type { Plan, Action } from "./planner";
import type { Profile } from "./model";
export type Choices = ReadonlyMap<string, Action | "skip">;
export function selectPlan(
  profile: Profile,
  fresh: Plan,
  review: Plan,
  choices?: Choices,
  release?: ReadonlySet<string>,
): Plan {
  const seen = new Map(review.ops.map((op) => [op.path, op]));
  const ops = fresh.ops.flatMap((op) => {
    const before = seen.get(op.path);
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
  const held = fresh.held.filter((path) => {
    if (!release?.has(path) || !reviewedHeld.has(path)) return true;
    ops.push({ path, action: "delete", conflict: false });
    return false;
  });
  return { ...fresh, ops, held };
}
