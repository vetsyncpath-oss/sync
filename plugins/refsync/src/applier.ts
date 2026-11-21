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
  constructor(
    readonly journal: ApplyJournal,
    readonly state: StateStore,
  ) {}
  private async restore(
    t: Transaction,
    target: StorageProvider,
  ): Promise<void> {
    for (let i = t.steps.length - 1; i >= 0; i--) {
      const p = t.steps[i].path,
        armed = t.id + "/armed/" + i;
      if (!(await this.journal.disk.has(armed))) continue;
      const saved = await this.journal.json<string | null>(armed);
      const stat = await target.stat(p);
      if (stat?.type === "folder") throw Error("collision");
      if (saved === null) {
        if (stat) await target.delete(p);
      } else {
        const bytes = await this.journal.disk.read(t.id + "/backup/" + i);
        if ((await hash(bytes)) !== saved) throw Error("backup");
        if (!stat || (await hash(await target.download(p))) !== saved)
          await target.upload(p, bytes);
      }
    }
  }
  async recover(resolve: (t: Transaction) => StorageProvider): Promise<void> {
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
  }
  async undo(key: string, target: StorageProvider) {
    const last = this.state.get(key).lastRun;
    const t = (await this.journal.transactions()).find(
      (v) => v.key === key && v.id === last,
    );
    if (!t) throw Error("noBackup");
    await this.journal.mark(t.id + "/undo-start");
    await this.restore(t, target);
    this.state.put(key, t.before);
    await this.journal.mark(t.id + "/undo-done");
  }
  async apply(
    profile: Profile,
    plan: Plan,
    source: StorageProvider,
    target: StorageProvider,
    key: string,
    targetPath: string,
  ): Promise<number> {
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
    const displaced = new Map<string, string>();
    try {
      for (const op of plan.ops) {
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
        if (op.action === "write" || op.action === "both") {
          const bytes = await source.download(p);
          if (bytes.byteLength !== s.size || (await hash(bytes)) !== s.hash)
            throw Error("referenceChanged");
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
          await stage(p, bytes, s.mtime);
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
      await this.journal.disk.removeTree(id);
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
      before: previous,
      steps,
    };
    await this.journal.begin(t);
    try {
      for (const [i, step] of steps.entries()) {
        const stat = await target.stat(step.path);
        if (stat?.type === "folder") throw Error("collision");
        const old = stat ? await target.download(step.path) : null;
        const copy = displaced.get(step.path);
        if (copy && stat) throw Error("collision");
        await this.journal.backup(id, i, old);
        if (step.action === "delete") {
          if (stat) await target.delete(step.path);
        } else {
          const bytes = copy
            ? await target.download(copy)
            : await this.journal.disk.read(id + "/stage/" + i);
          if (step.digest && (await hash(bytes)) !== step.digest)
            throw Error("incomplete");
          await target.upload(step.path, bytes, step.mtime);
        }
        await this.journal.mark(id + "/applied/" + i);
      }
      next.lastRun = id;
      this.state.put(key, next);
    } catch (e) {
      await this.restore(t, target);
      await this.journal.mark(id + "/rolled-back");
      throw e;
    }
    await this.journal.mark(id + "/done");
    return steps.length;
  }
}
