import { managerId } from "./vam-gate";
import { chunkSize, processChunks } from "./transfer";
import {
  manifestBytes,
  manifestPath,
  type Publication,
} from "./cloud-manifest";
import { legacyConfig } from "./config-scope";
import { deliveryBytes, type Projection } from "./json-overlay";
import { RunBudget, MutationFence, transient } from "./runtime";
import {
  parent,
  trackedDirectories,
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
  readonly pendingTargets = new Set<string>();
  constructor(
    readonly journal: ApplyJournal,
    readonly state: StateStore,
    readonly fence = new MutationFence(),
    private configDirectory = ".obsidian",
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
        ((t.cloud || t.dav) &&
          (await this.journal.disk.has(t.id + "/restored/" + i))) ||
        !(await this.journal.disk.has(armed)) ||
        (await this.journal.disk.has(t.id + "/skipped/" + i))
      )
        continue;
      // A pre-gate transaction may contain Manager files. These belong to the installed Manager.
      const managerRoot =
        (t.scope === "settings"
          ? ""
          : this.configDirectory.toLowerCase() + "/") +
        "plugins/" +
        managerId;
      if (
        p.toLowerCase() === managerRoot ||
        p.toLowerCase().startsWith(managerRoot + "/")
      )
        continue;
      const perform = async () => {
        const saved = await this.journal.json<string | null>(armed);
        if (t.cloud || t.dav) target.reset?.();
        const stat = await budget.io(() => target.stat(p));
        if (t.steps[i].action === "mkdir" || t.steps[i].action === "rmdir") {
          if (stat && stat.type !== "folder") throw Error("collision");
          if (saved === "folder" && !stat)
            await budget.io(() => target.mkdir(p), false);
          if (saved === null && stat)
            await budget.io(() => target.removeEmptyDir(p), false);
          return;
        }
        if (stat?.type === "folder") throw Error("collision");
        if (t.cloud || t.dav) {
          const expected = t.id + "/after/" + i;
          // A crash before recording the post-image precedes the remote mutation.
          if (!(await this.journal.disk.has(expected))) return;
          const current = stat
            ? await hash(
                await budget.io((progress) => target.download(p, progress)),
              )
            : null;
          if (current === saved) return;
          if (current !== (await this.journal.json<string | null>(expected)))
            throw Error("cloudRecovery");
        }
        const membership =
          t.scope === "settings"
            ? "community-plugins.json"
            : this.configDirectory.toLowerCase() + "/community-plugins.json";
        const keepManager =
          p.toLowerCase() === membership && stat && stat.type === "file";
        const currentList = keepManager
          ? JSON.parse(
              new TextDecoder().decode(
                await budget.io(() => target.download(p)),
              ),
            )
          : null;
        if (saved === null) {
          if (Array.isArray(currentList) && currentList.includes(managerId))
            return;
          if (stat) await budget.io(() => target.delete(p), false);
        } else {
          const backup = await this.journal.disk.read(t.id + "/backup/" + i);
          let bytes = backup;
          if ((await hash(bytes)) !== saved) throw Error("backup");
          if (p.toLowerCase() === membership) {
            const ids: unknown = JSON.parse(new TextDecoder().decode(bytes));
            if (!Array.isArray(ids)) throw Error("backup");
            const wanted =
              Array.isArray(currentList) && currentList.includes(managerId);
            if (wanted !== ids.includes(managerId))
              bytes = manifestBytes(
                wanted
                  ? [...ids, managerId]
                  : ids.filter((id) => id !== managerId),
              );
          }
          if (
            !stat ||
            (await hash(
              await budget.io((progress) => target.download(p, progress)),
            )) !== (bytes === backup ? saved : await hash(bytes))
          )
            await budget.io(
              (progress) => target.upload(p, bytes, undefined, progress),
              false,
            );
        }
      };
      if (target.withFilePaused) await target.withFilePaused(p, perform);
      else await perform();
      if (t.cloud || t.dav) await this.journal.mark(t.id + "/restored/" + i);
    }
  }
  async recover(resolve: (t: Transaction) => StorageProvider): Promise<void> {
    this.fence.check();
    this.pendingTargets.clear();
    for await (const t of this.journal.walk(true)) {
      try {
        await this.recoverTransaction(t, resolve);
      } catch (e) {
        if (!(t.cloud || t.dav)) throw e;
        this.pendingTargets.add(JSON.parse(t.key)[3]);
      }
    }
    this.needsRecovery = false;
  }
  async prune() {
    this.fence.check();
    if (this.needsRecovery) return;
    const latest = new Map<string, string>();
    for await (const t of this.journal.walk()) {
      const has = (marker: string) =>
        this.journal.disk.has(t.id + "/" + marker);
      if ((await has("undo-start")) && !(await has("undo-done"))) continue;
      if (!(await has("rolled-back")) && !(await has("undo-done"))) {
        if (!(await has("done"))) continue;
        if (
          t.settings?.local &&
          !(await has("verified")) &&
          !(await has("verify-failed"))
        )
          continue;
        if (!latest.has(t.key))
          latest.set(t.key, (await this.state.load(t.key)).lastRun);
        if (latest.get(t.key) === t.id) continue;
      }
      await this.journal.disk.removeTree(t.id);
    }
  }
  private async recoverTransaction(
    t: Transaction,
    resolve: (t: Transaction) => StorageProvider,
  ) {
    if (
      (await this.journal.disk.has(t.id + "/undo-start")) &&
      !(await this.journal.disk.has(t.id + "/undo-done"))
    ) {
      await this.restore(t, resolve(t));
      await this.state.commit(t.key, t.before);
      await this.journal.mark(t.id + "/undo-done");
      return;
    }
    if (
      (await this.journal.disk.has(t.id + "/done")) ||
      (await this.journal.disk.has(t.id + "/rolled-back"))
    )
      return;
    if ((await this.state.load(t.key)).lastRun === t.id) {
      await this.journal.mark(t.id + "/done");
      return;
    }
    await this.restore(t, resolve(t));
    await this.journal.mark(t.id + "/rolled-back");
  }
  async undo(
    key: string,
    target: StorageProvider | undefined,
    resolve?: (t: Transaction) => StorageProvider,
  ) {
    this.fence.check();
    this.needsRecovery = true;
    const last = (await this.state.load(key)).lastRun;
    const t = (await this.journal.transactions()).find(
      (v) => v.key === key && v.id === last,
    );
    if (!t) throw Error("noBackup");
    await this.journal.mark(t.id + "/undo-start");
    const store = resolve ? resolve(t) : target;
    if (!store) throw Error("journal");
    await this.restore(t, store);
    await this.state.commit(key, t.before);
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
    publication?: Publication,
    checkReference?: () => Promise<void>,
    operations?: { path: string; action: string }[],
    configDir = ".obsidian",
    self = "refsync",
    transfer?: import("./transfer").TransferObserver,
  ): Promise<number> {
    this.fence.check();
    if (this.needsRecovery || this.pendingTargets.has(target.id))
      throw Error("journal");
    const checkpoint = () => {
      budget.check();
      if (active && !active()) throw Error("stopped");
    };
    const pulseFor =
      (
        path: string,
        direction: "transferUpload" | "transferDownload",
        heartbeat: () => void,
      ): import("./transfer").TransferPulse =>
      (n, total, resumed) => {
        heartbeat();
        checkpoint();
        if (n !== undefined && total !== undefined && total >= 1048576)
          transfer?.(path, direction, n, total, !!resumed);
      };
    const cfg = profile.config ?? legacyConfig();
    const batch = profile.scope === "settings" && cfg.strategy === "batch";
    if (
      batch &&
      plan.deferred.some((x) => ["locked", "invalidConfig"].includes(x.reason))
    )
      throw Error("incomplete");
    const previous = await this.state.load(key);
    const next: Baseline = {
      ...fresh(),
      size: plan.held.length ? previous.size : plan.count,
      lastRun: previous.lastRun,
    };
    const previousFolders = trackedDirectories(previous),
      folders = new Set(previousFolders);
    for (const p of plan.forgottenFolders ?? []) folders.delete(p);
    next.folders = [...folders];
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
    const expectedTarget = new Map<string, string | null>();
    const publish =
      publication &&
      (publication.missing ||
        plan.ops.some((o) =>
          ["write", "both", "delete", "mkdir", "rmdir"].includes(o.action),
        ));
    try {
      if (publish)
        await stage(
          manifestPath,
          manifestBytes({ schemaVersion: 1, publishing: id }),
        );
      for (const op of plan.ops) {
        checkpoint();
        const p = op.path,
          s = op.source,
          b = Object.hasOwn(previous.entries, p)
            ? previous.entries[p]
            : undefined;
        if (op.action === "mkdir" || op.action === "rmdir") {
          steps.push({ path: p, action: op.action });
          continue;
        }
        if (
          (publish || profile.scope === "content") &&
          op.path !== manifestPath
        ) {
          if (op.target?.rawHash || op.target?.hash)
            expectedTarget.set(p, op.target.rawHash ?? op.target.hash);
          else if (!op.target && op.action === "write")
            expectedTarget.set(p, null);
        }
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
          const bytes = await budget.io((progress) =>
            source.download(p, pulseFor(p, "transferDownload", progress)),
          );
          if ((await hash(bytes)) !== (s.rawHash ?? s.hash))
            throw Error("referenceChanged");
        }
        const chunkFile =
          op.action === "write" &&
          profile.scope === "content" &&
          profile.role === "publisher" &&
          target.uploadChunks &&
          this.journal.disk.putChunks &&
          s.size > chunkSize &&
          p.toLowerCase() !==
            configDir.toLowerCase() + "/community-plugins.json"
            ? source.chunkSource?.(p, s.size)
            : undefined;
        if (chunkFile) {
          const stagePath = id + "/stage/" + steps.length;
          const digest = await this.journal.disk.putChunks!(
            stagePath,
            chunkFile,
            checkpoint,
          );
          if (digest !== (s.rawHash ?? s.hash)) throw Error("referenceChanged");
          steps.push({
            path: p,
            action: "write",
            mtime: s.mtime,
            size: s.size,
            digest,
          });
        } else if (op.action === "write" || op.action === "both") {
          let bytes: Bytes;
          try {
            bytes = await budget.io((progress) =>
              source.download(p, pulseFor(p, "transferDownload", progress)),
            );
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
      await checkReference?.();
    } catch (e) {
      if (!this.fence.pending) await this.journal.disk.removeTree(id);
      throw e;
    }
    if (publish) steps.push({ path: manifestPath, action: "write" });
    if (!steps.length) {
      await this.state.commit(key, next);
      return 0;
    }
    const t: Transaction = {
      version: 1,
      id,
      key,
      target: targetPath,
      dav:
        profile.access === "webdav" && profile.role === "publisher"
          ? profile.dav
          : undefined,
      cloud:
        profile.access === "oauth" && profile.role === "publisher"
          ? profile.cloud
          : undefined,
      scope: profile.scope,
      content: profile.content,
      createdAt: Date.now(),
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
            if (step.action === "mkdir" || step.action === "rmdir") {
              target.reset?.();
              const stat = await budget.io(() => target.stat(step.path));
              if (stat && stat.type !== "folder") throw Error("collision");
              const creating = step.action === "mkdir";
              if (creating === !!stat) {
                if (!stat) folders.delete(step.path);
                continue;
              }
              const origin = await budget.io(() => source.stat(step.path));
              if (creating ? origin?.type !== "folder" : !!origin)
                throw Error("referenceChanged");
              await this.journal.disk.putNew(
                id + "/armed/" + i,
                manifestBytes(stat ? "folder" : null),
              );
              if (creating) {
                await budget.io(() => target.mkdir(step.path), false);
                folders.add(step.path);
              } else if (
                await budget.io(() => target.removeEmptyDir(step.path), false)
              )
                folders.delete(step.path);
              else {
                await this.journal.mark(id + "/skipped/" + i);
                plan.deferred.push({
                  path: step.path,
                  reason: "folderRetained",
                });
                continue;
              }
              await this.journal.mark(id + "/applied/" + i);
              operations?.push({ path: step.path, action: step.action });
              changed++;
              continue;
            }
            const perform = async () => {
              if (t.cloud || t.dav) target.reset?.();
              const stat = await budget.io(() => target.stat(step.path));
              if (stat?.type === "folder") throw Error("collision");
              const old = stat
                ? await budget.io((progress) =>
                    target.download(step.path, progress),
                  )
                : null;
              const copy = displaced.get(step.path);
              if (copy && stat) throw Error("collision");
              if (t.cloud || t.dav || profile.scope === "content") {
                const expected =
                  step.path === manifestPath && i === steps.length - 1
                    ? steps[0].digest
                    : expectedTarget.get(step.path);
                if (
                  expected !== undefined &&
                  (old ? await hash(old) : null) !== expected
                )
                  throw Error("referenceChanged");
              }
              if (
                step.action === "delete" &&
                !source.confirmAbsent &&
                (await budget.io(() => source.stat(step.path)))
              )
                throw Error("referenceChanged");
              await this.journal.backup(id, i, old);
              if (step.action === "delete") {
                if (t.cloud || t.dav)
                  await this.journal.disk.putNew(
                    id + "/after/" + i,
                    manifestBytes(null),
                  );
                if (stat)
                  await budget.io(async () => {
                    if (await target.stat(step.path))
                      await target.delete(step.path);
                  }, false);
              } else if (
                step.size !== undefined &&
                target.uploadChunks &&
                step.digest
              ) {
                const file = this.journal.disk.chunkSource?.(
                  id + "/stage/" + i,
                  step.size,
                );
                if (
                  !file ||
                  (await budget.io((progress) =>
                    processChunks(file, undefined, progress),
                  )) !== step.digest
                )
                  throw Error("incomplete");
                if (t.cloud || t.dav)
                  await this.journal.disk.putNew(
                    id + "/after/" + i,
                    manifestBytes(step.digest),
                  );
                await budget.io(
                  (progress) =>
                    target.uploadChunks!(
                      step.path,
                      file,
                      step.digest!,
                      step.mtime,
                      pulseFor(step.path, "transferUpload", progress),
                    ),
                  false,
                );
              } else {
                const bytes = copy
                  ? await budget.io((progress) =>
                      target.download(copy, progress),
                    )
                  : publish && i === steps.length - 1
                    ? await publication!.build()
                    : await this.journal.disk.read(id + "/stage/" + i);
                if (step.digest && (await hash(bytes)) !== step.digest)
                  throw Error("incomplete");
                const outgoing =
                  projection && step.path !== manifestPath
                    ? deliveryBytes(
                        step.path,
                        bytes,
                        projection,
                        old,
                        profile.role === "subscriber",
                      )
                    : profile.scope === "content" &&
                        step.path.toLowerCase() ===
                          configDir.toLowerCase() + "/community-plugins.json"
                      ? deliveryBytes(
                          "community-plugins.json",
                          bytes,
                          { rules: [], blocked: [], self },
                          old,
                          profile.role === "subscriber",
                        )
                      : bytes;
                if (t.cloud || t.dav)
                  await this.journal.disk.putNew(
                    id + "/after/" + i,
                    manifestBytes(await hash(outgoing)),
                  );
                await budget.io(
                  (progress) =>
                    target.upload(
                      step.path,
                      outgoing,
                      step.mtime,
                      pulseFor(step.path, "transferUpload", progress),
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
          if (
            steps[start].path !== manifestPath &&
            !["mkdir", "rmdir"].includes(steps[start].action)
          ) {
            for (let i = start; i < end; i++)
              operations?.push({
                path: steps[i].path,
                action: steps[i].action,
              });
            changed += end - start;
            if (steps[start].action === "write")
              for (let d = parent(path); d && !folders.has(d); d = parent(d))
                folders.add(d);
          }
        } catch (e) {
          if (batch || steps[start].path === manifestPath || !transient(e))
            throw e;
          await this.restore(t, target, start, end);
          for (let i = start; i < end; i++)
            await this.journal.mark(id + "/skipped/" + i);
          if (["mkdir", "rmdir"].includes(steps[start].action)) {
            if (previousFolders.has(path)) folders.add(path);
            else folders.delete(path);
          }
          if (Object.hasOwn(previous.entries, path))
            next.entries[path] = previous.entries[path];
          else delete next.entries[path];
          plan.deferred.push({ path, reason: "locked" });
        }
        progress?.(end, steps.length);
        start = end;
      }
      next.folders = [...folders];
      if (changed || publish) next.lastRun = id;
      await this.state.commit(key, next);
    } catch (e) {
      budget.fence.check();
      this.fence.check();
      await this.restore(t, target);
      await this.journal.mark(id + "/rolled-back");
      this.needsRecovery = false;
      throw e;
    }
    await this.journal.mark(id + "/done");
    if (!t.settings?.local) await this.journal.disk.removeTree(id + "/stage");
    this.needsRecovery = false;
    return changed;
  }
}
