import type { FileInfo, Pair, PendingOperation } from "./model";
export type RecoveryDecision =
  | { kind: "commit"; pair: Pair }
  | { kind: "retry" }
  | { kind: "blocked"; reason: string };
/** Reconstruct only the operation's confirmed pair. Never acknowledge current, unrelated edits. */
export function recover(
  pending: PendingOperation,
  identity: string,
  local: FileInfo | undefined,
  remote: FileInfo | undefined,
  backupVerified: boolean,
): RecoveryDecision {
  if (pending.identity !== identity)
    return {
      kind: "blocked",
      reason:
        "Источник, аккаунт или корень изменился при незавершённой операции",
    };
  const op = pending.operation;

  // A durable result receipt records what the mutation actually produced, not what is visible now.
  if (pending.result) {
    if (op.action === "keep-both" && !backupVerified)
      return {
        kind: "blocked",
        reason: "Конфликтная копия не прошла проверку",
      };
    return { kind: "commit", pair: pending.result };
  }
  const target =
    op.action === "download" ||
    op.action === "delete-local" ||
    (op.action === "keep-both" && pending.direction !== "push")
      ? "local"
      : "remote";
  const actual = target === "local" ? local : remote;
  const original = op[target];
  const deleting =
    op.action === "delete-local" || op.action === "delete-remote";
  const desired = deleting
    ? undefined
    : target === "local"
      ? op.remote?.hash
      : op.local?.hash;
  if (actual?.hash === desired) {
    if (op.action === "keep-both" && !backupVerified)
      return {
        kind: "blocked",
        reason: "Конфликтная копия не прошла проверку",
      };
    const pair: Pair = {
      local: op.local?.hash,
      remote: op.remote?.hash,
      policyKey: pending.policyKey,
    };
    pair[target] = desired;
    return { kind: "commit", pair };
  }
  if (actual?.hash === original?.hash) return { kind: "retry" };
  return {
    kind: "blocked",
    reason:
      "Назначение отличается и от исходной, и от ожидаемой версии. Требуется восстановление файла из резервной копии",
  };
}
