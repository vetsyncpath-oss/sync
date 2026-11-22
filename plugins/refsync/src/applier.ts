import { legacyConfig } from "./config-scope";
import { deliveryBytes, type Projection } from "./json-overlay";
import { RunBudget, MutationFence, transient } from "./runtime";
import {
  fresh,
  hash,
  type Baseline,
  type Bytes,
  type Profile,
  type StorageProvider,
} from "./model";
import { type Plan } from "./planner";
import {
  ApplyJournal,
  StateStore,
  type Intent,
  type Transaction,
} from "./state";
const decoder = new TextDecoder();
export class Applier {
  needsRecovery = false;
  constructor(
    readonly journal: ApplyJournal,
    readonly state: StateStore,
    readonly fence = new MutationFence(),
  ) {}
  private async restore(
    t: Transaction,
    target: StorageProvider,
    start = 0,
    end = t.steps.length,
  ): Promise<void> {
    const budget = new RunBudget(undefined, undefined, undefined, this.fence);
    for (let i = end - 1; i >= start; i--) {
      const p = t.steps[i].path,
        armed = t.id + "/armed/" + i;
      if (
        !(await this.journal.disk.has(armed)) ||
        (await this.journal.disk.has(t.id + "/skipped/" + i))
      )
        continue;
      const perform = async () => {
        const saved = await this.journal.json<string | null>(armed);
        const stat = await budget.io(() => target.stat(p));
        if (stat?.type === "folder") throw Error("collision");
        if (saved === null) {
          if (stat) await budget.io(() => target.delete(p), false);
        } else {
          const bytes = await this.journal.disk.read(t.id + "/backup/" + i);
          if ((await hash(bytes)) !== saved) throw Error("backup");
          if (
            !stat ||
            (await hash(await budget.io(() => target.download(p)))) !== saved
          )
            await budget.io(() => target.upload(p, bytes), false);
        }
      };
      if (target.withFilePaused) await target.withFilePaused(p, perform);
      else await perform();
    }
  }
  async recover(resolve: (t: Transaction) => StorageProvider): Promise<void> {
    this.fence.check();
    for (const t of await this.journal.transactions()) {
      if (
        (await this.journal.disk.has(t.id + "/undo-start")) &&
        !(await this.journal.disk.has(t.id + "/undo-done"))
      ) {
        await this.restore(t, resolve(t));
        this.state.put(t.key, t.before);
        await this.journal.mark(t.id + "/undo-done");
        continue;
      }
      if (
        (await this.journal.disk.has(t.id + "/done")) ||
        (await this.journal.disk.has(t.id + "/rolled-back"))
      )
        continue;
      if (this.state.get(t.key).lastRun === t.id) {
        await this.journal.mark(t.id + "/done");
        continue;
      }
      await this.restore(t, resolve(t));
      await this.journal.mark(t.id + "/rolled-back");
    }
    this.needsRecovery = false;
  }
  async undo(
    key: string,
    target: StorageProvider,
    resolve?: (t: Transaction) => StorageProvider,
  ) {
    this.fence.check();
    this.needsRecovery = true;
    const last = this.state.get(key).lastRun;
    const t = (await this.journal.transactions()).find(
      (v) => v.key === key && v.id === last,
    );
    if (!t) throw Error("noBackup");
    await this.journal.mark(t.id + "/undo-start");
    await this.restore(t, resolve ? resolve(t) : target);
    this.state.put(key, t.before);
    await this.journal.mark(t.id + "/undo-done");
    this.needsRecovery = false;
  }
  async apply(
    profile: Profile,
    plan: Plan,
    source: StorageProvider,
    target: StorageProvider,
    key: string,
    targetPath: string,
    budget = new RunBudget(undefined, undefined, undefined, this.fence),
    progress?: (done: number, total: number) => void,
    active?: () => boolean,
    projection?: Projection,
  ): Promise<number> {
    this.fence.check();
    if (this.needsRecovery) throw Error("journal");
    const checkpoint = () => {
      budget.check();
      if (active && !active()) throw Error("stopped");
    };
    const cfg = profile.config ?? legacyConfig();
    const batch = profile.scope === "settings" && cfg.strategy === "batch";
    if (batch && plan.deferred.some((x) => x.reason === "locked"))
      throw Error("incomplete");
    const previous = this.state.get(key);
    const next: Baseline = {
      ...fresh(),
      size: plan.held.length ? previous.size : plan.count,
      lastRun: previous.lastRun,
    };
    Object.assign(next.entries, previous.entries);
    for (const path of plan.forgotten) delete next.entries[path];
    const id = crypto.randomUUID(),
      steps: Intent[] = [];
    const stage = async (path: string, bytes: Bytes, mtime?: number) => {
      const digest = await hash(bytes);
      await this.journal.disk.putNew(id + "/stage/" + steps.length, bytes);
      steps.push({ path, action: "write", mtime, digest });
    };
    const stageBatch =
      batch &&
      plan.ops.some((x) => x.action === "write" || x.action === "delete");
    const displaced = new Map<string, string>();
    try {
      for (const op of plan.ops) {
        checkpoint();
        const p = op.path,
          s = op.source,
          b = Object.hasOwn(previous.entries, p)
            ? previous.entries[p]
            : undefined;
        if (op.action === "delete") {
          steps.push({ path: p, action: "delete" });
          delete next.entries[p];
          continue;
        }
        if (!s) throw Error("incomplete");
        if (op.action === "retain") {
          next.entries[p] = {
            size: b?.size ?? 0,
            mtime: b?.mtime ?? 0,
            hash: b?.hash ?? "",
            applied: b?.applied ?? "",
            seen: s.hash,
            delivered: b?.delivered ?? false,
          };
          continue;
        }
        if (stageBatch && op.action === "ack") {
          const bytes = await budget.io(() => source.download(p));
          if ((await hash(bytes)) !== (s.rawHash ?? s.hash))
            throw Error("referenceChanged");
          await this.journal.disk.putNew(
            id +
              "/unchanged/" +
              (await hash(new TextEncoder().encode(p).buffer)),
            projection ? deliveryBytes(p, bytes, projection) : bytes,
          );
        }
        if (op.action === "write" || op.action === "both") {
          let bytes: Bytes;
          try {
            bytes = await budget.io(() => source.download(p));
          } catch (e) {
            if (batch || !transient(e)) throw e;
            plan.deferred.push({ path: p, reason: "locked" });
            continue;
          }
          if (
            bytes.byteLength !== s.size ||
            (await hash(bytes)) !== (s.rawHash ?? s.hash)
          ) {
            if (profile.role === "publisher") {
              plan.deferred.push({ path: p, reason: "unstable" });
              continue;
            }
            throw Error("referenceChanged");
          }
          if (profile.scope === "settings" && p.endsWith(".json"))
            JSON.parse(decoder.decode(bytes));
          if (op.action === "both") {
            const dot = p.lastIndexOf("."),
              cut = dot > p.lastIndexOf("/") + 1 ? dot : p.length;
            const stamp = new Date()
              .toISOString()
              .replace(/[-:]/g, "")
              .replace("T", "-")
              .slice(0, 15);
            const copy =
              p.slice(0, cut) +
              ".conflict-" +
              this.state.device +
              "-" +
              stamp +
              p.slice(cut);
            if (await target.stat(copy)) throw Error("collision");
            // Snapshot the displaced bytes just before the main replacement.
            displaced.set(copy, p);
            steps.push({ path: copy, action: "write" });
          }
          await stage(
            p,
            projection ? deliveryBytes(p, bytes, projection) : bytes,
            s.mtime,
          );
        }
        next.entries[p] = {
          size: s.size,
          mtime: s.mtime,
          hash: s.hash,
          applied: s.hash,
          seen: s.hash,
          delivered: op.action !== "ack" || b?.delivered === true,
        };
      }
    } catch (e) {
      if (!this.fence.pending) await this.journal.disk.removeTree(id);
      throw e;
    }
    if (!steps.length) {
      this.state.put(key, next);
      return 0;
    }
    const t: Transaction = {
      version: 1,
      id,
      key,
      target: targetPath,
      scope: profile.scope,
      settings: projection
        ? {
            config: cfg,
            projection,
            local: profile.role === "subscriber",
            at: Date.now(),
          }
        : undefined,
      before: previous,
      steps,
    };
    checkpoint();
    this.needsRecovery = true;
    await this.journal.begin(t);
    let changed = 0;
    try {
      for (let start = 0; start < steps.length;) {
        const path = displaced.get(steps[start].path) ?? steps[start].path;
        const end = start + (displaced.has(steps[start].path) ? 2 : 1);
        try {
          for (let i = start; i < end; i++) {
            checkpoint();
            const step = steps[i];
            const perform = async () => {
              const stat = await budget.io(() => target.stat(step.path));
              if (stat?.type === "folder") throw Error("collision");
              const old = stat
                ? await budget.io(() => target.download(step.path))
                : null;
              const copy = displaced.get(step.path);
              if (copy && stat) throw Error("collision");
              await this.journal.backup(id, i, old);
              if (step.action === "delete") {
                if (stat)
                  await budget.io(async () => {
                    if (await target.stat(step.path))
                      await target.delete(step.path);
                  }, false);
              } else {
                const bytes = copy
                  ? await budget.io(() => target.download(copy))
                  : await this.journal.disk.read(id + "/stage/" + i);
                if (step.digest && (await hash(bytes)) !== step.digest)
                  throw Error("incomplete");
                await budget.io(
                  () =>
                    target.upload(
                      step.path,
                      projection
                        ? deliveryBytes(step.path, bytes, projection, old)
                        : bytes,
                      step.mtime,
                    ),
                  false,
                );
              }
            };
            if (target.withFilePaused)
              await target.withFilePaused(step.path, perform);
            else await perform();
            await this.journal.mark(id + "/applied/" + i);
          }
          changed += end - start;
        } catch (e) {
          if (batch || !transient(e)) throw e;
          await this.restore(t, target, start, end);
          for (let i = start; i < end; i++)
            await this.journal.mark(id + "/skipped/" + i);
          if (Object.hasOwn(previous.entries, path))
            next.entries[path] = previous.entries[path];
          else delete next.entries[path];
          plan.deferred.push({ path, reason: "locked" });
        }
        progress?.(end, steps.length);
        start = end;
      }
      if (changed) next.lastRun = id;
      this.state.put(key, next);
    } catch (e) {
      budget.fence.check();
      this.fence.check();
      await this.restore(t, target);
      await this.journal.mark(id + "/rolled-back");
      this.needsRecovery = false;
      throw e;
    }
    await this.journal.mark(id + "/done");
    this.needsRecovery = false;
    return changed;
  }
}
