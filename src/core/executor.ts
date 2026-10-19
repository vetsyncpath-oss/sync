import type {
  Baseline,
  FileInfo,
  Operation,
  Pair,
  Plan,
  RunLog,
  Store,
} from "./model";
import { sha } from "./paths";
import { policyKey } from "./planner";
export interface ExecutorPorts {
  checkpoint(baseline: Baseline): Promise<void>;
  backup(path: string, bytes: Uint8Array): Promise<void>;
  recovery?(path: string, bytes: Uint8Array): Promise<void>;
  journal(
    operation: Operation,
    status: "pending" | "applied" | "done",
    result?: Pair,
  ): Promise<void>;
}
const fingerprint = (f: FileInfo | undefined) =>
  f ? JSON.stringify([f.id, f.version, f.hash]) : "";
export async function execute(
  plan: Plan,
  local: Store,
  remote: Store,
  ports: ExecutorPorts,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<RunLog> {
  const state = structuredClone(plan.baseline),
    details: RunLog["details"] = [];
  let currentOperation: Operation | undefined;
  let dirty = false;
  let applied = 0,
    conflicts = 0,
    status: RunLog["status"] = "completed",
    message = "Готово";
  // The immutable reviewed plan is never silently rebuilt at execution time.
  try {
    const ls = await local.scan(signal),
      rs = await remote.scan(signal);
    if (
      !ls.complete ||
      !rs.complete ||
      JSON.stringify([ls.identity, rs.identity]) !== plan.identity
    )
      throw Error("Источник недоступен или изменился. Постройте новый план.");
    for (const op of plan.operations) {
      signal.throwIfAborted();
      if (
        fingerprint(
          Object.hasOwn(ls.files, op.path) ? ls.files[op.path] : undefined,
        ) !== fingerprint(op.local) ||
        fingerprint(
          Object.hasOwn(rs.files, op.path) ? rs.files[op.path] : undefined,
        ) !== fingerprint(op.remote)
      )
        throw Error("Файл изменился после просмотра плана: " + op.path);
    }
    for (const op of plan.operations) {
      currentOperation = op;
      signal.throwIfAborted();
      let l = op.local,
        r = op.remote;
      if (op.action === "skip") {
        details.push({
          path: op.path,
          action: op.action,
          status: "Пропущен: локальное отклонение",
        });
        continue;
      }
      if (op.action === "conflict") {
        conflicts++;
        details.push({
          path: op.path,
          action: op.action,
          status: "Требует решения",
        });
        continue;
      }
      if (op.action !== "adopt") await ports.journal(op, "pending");
      const read = async (s: Store, f: FileInfo) => {
        const bytes = await s.read(f, signal);
        if (sha(bytes) !== f.hash)
          throw Error("Контрольная сумма изменилась: " + op.path);
        return bytes;
      };
      if (
        op.action === "download" ||
        (op.action === "keep-both" && plan.profile.direction !== "push")
      ) {
        const bytes = await read(remote, r!);
        if (l) {
          const old = await read(local, l);
          if (op.action === "keep-both")
            await ports.backup(`${plan.id}/${op.path}`, old);
          else await ports.recovery?.(`${plan.id}/${op.path}`, old);
        }
        l = await local.write(op.path, bytes, l, r?.mtime, signal);
      } else if (op.action === "upload" || op.action === "keep-both") {
        const bytes = await read(local, l!);
        if (r) {
          const old = await read(remote, r);
          if (op.action === "keep-both")
            await ports.backup(`${plan.id}/${op.path}`, old);
          else await ports.recovery?.(`${plan.id}/${op.path}`, old);
        }
        r = await remote.write(op.path, bytes, r, l?.mtime, signal);
      } else if (op.action === "delete-local") {
        const current = await remote.scan(signal);
        if (
          !current.complete ||
          current.identity !== plan.remote.identity ||
          Object.hasOwn(current.files, op.path)
        )
          throw Error("Удаление отменено: источник изменился");
        await local.delete(l!, plan.profile.deletion === "trash", signal);
        l = undefined;
      } else if (op.action === "delete-remote") {
        const current = await local.scan(signal);
        if (
          !current.complete ||
          current.identity !== plan.local.identity ||
          Object.hasOwn(current.files, op.path)
        )
          throw Error("Удаление отменено: локальный источник изменился");
        await remote.delete(r!, plan.profile.deletion === "trash", signal);
        r = undefined;
      }
      const pair: Pair = {
        local: l?.hash,
        remote: r?.hash,
        policyKey: policyKey(plan.profile),
      };
      if (op.action !== "adopt") {
        applied++;
        await ports.journal(op, "applied", pair);
      }
      Object.defineProperty(state.files, op.path, {
        value: pair,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      // A failed checkpoint stops the run; never proceed with an unrecorded mutation.
      if (op.action === "adopt") dirty = true;
      else {
        await ports.checkpoint(state);
        dirty = false;
      }
      if (op.action !== "adopt") {
        await ports.journal(op, "done");
        details.push({ path: op.path, action: op.action, status: "Выполнено" });
      }
      onProgress?.(applied, plan.operations.length);
    }
    if (dirty) await ports.checkpoint(state);
    if (conflicts) {
      status = "partial";
      message = `Требуют решения: ${conflicts}`;
    }
  } catch (e) {
    status = signal.aborted ? "cancelled" : applied ? "partial" : "failed";
    message = e instanceof Error ? e.message : "Ошибка выполнения";
    if (currentOperation)
      details.push({
        path: currentOperation.path,
        action: currentOperation.action,
        status: "Ошибка: " + message,
      });
  }
  return {
    id: plan.id,
    profileId: plan.profile.id,
    name: plan.profile.name,
    at: Date.now(),
    status,
    applied,
    conflicts,
    message,
    details,
  };
}
