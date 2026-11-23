import { readManifest, buildManifest, verifyManifest } from "./cloud-manifest";
import { selected } from "./classifier";
import { legacyConfig, mobileExcluded } from "./config-scope";
import { parseOverlay } from "./json-overlay";
import { pathFilter } from "./filters";
import { selectPlan, type Choices } from "./selection";
import { RunBudget, sleep, transient } from "./runtime";
import {
  type Mode,
  type Profile,
  type Snapshot,
  type StorageProvider,
} from "./model";
import { validate } from "./validator";
import { scan } from "./scanner";
import { plan, type Plan } from "./planner";
import { Applier } from "./applier";
export type Phase =
  "idle" | "scan" | "apply" | "recover" | "done" | "partial" | "error";
export class StatusStore {
  phase: Phase = "idle";
  private listeners = new Set<(s: Phase) => void>();
  set(s: Phase) {
    this.phase = s;
    for (const l of this.listeners) l(s);
  }
  subscribe(l: (s: Phase) => void) {
    this.listeners.add(l);
    l(this.phase);
    return () => this.listeners.delete(l);
  }
}
export class SyncEngine {
  private busy = false;
  private lastSource?: { key: string; snapshot: Snapshot };
  constructor(
    readonly applier: Applier,
    readonly status: StatusStore,
    readonly configDir: string,
    readonly self: string,
    readonly desktop: boolean,
  ) {}
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw Error("busy");
    this.busy = true;
    try {
      return await fn();
    } catch (e) {
      this.status.set("error");
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async run(
    p: Profile,
    reference: StorageProvider,
    local: StorageProvider,
    preview: boolean,
    approved?: Plan,
    options: {
      mode?: Mode;
      choices?: Choices;
      release?: ReadonlySet<string>;
      quiet?: (path: string) => boolean;
      budget?: RunBudget;
      progress?: (done: number, total: number) => void;
      active?: () => boolean;
    } = {},
  ): Promise<{ plan: Plan; changed: number }> {
    return this.exclusive(async () => {
      const bad = validate(
        p,
        this.desktop,
        reference.capabilities.readOnly,
        this.configDir,
      );
      if (bad.length) throw Error(bad[0].code);
      const [source, target] =
        p.role === "subscriber" ? [reference, local] : [local, reference];
      const key = JSON.stringify([p.id, p.scope, source.id, target.id]);
      this.status.set("scan");
      const budget =
        options.budget ??
        new RunBudget(
          undefined,
          p.access !== "local" ? 90000 : undefined,
          undefined,
          this.applier.fence,
        );
      const cfg = p.config ?? legacyConfig();
      const projection =
        p.scope === "settings"
          ? {
              rules: parseOverlay(cfg.overlay),
              self: this.self,
              blocked:
                !this.desktop && cfg.platformFilter
                  ? await mobileExcluded(source, target, budget)
                  : [],
            }
          : undefined;
      const filter = p.scope === "content" ? pathFilter(p) : () => true;
      const managed =
        p.access === "oauth" ||
        (p.access === "public" && p.remote?.engine !== "git");
      const manifest = managed
        ? await budget.io(() => readManifest(reference))
        : null;
      const publication =
        p.access === "oauth" && p.role === "publisher"
          ? {
              missing: !manifest,
              build: async () => {
                reference.reset?.();
                const snapshot = await scan(
                  reference,
                  p.scope,
                  this.configDir,
                  this.self,
                  false,
                  budget,
                  filter,
                  p.scope === "content" ? p.maxMiB : 0,
                  cfg,
                );
                return buildManifest(snapshot, this.applier.state.device);
              },
            }
          : undefined;
      const scanSource = async () => {
        const revision =
          p.role === "subscriber" && p.access !== "local"
            ? (manifest?.revision ??
              (await budget.io(() => source.getRevision())))
            : null;
        const cacheKey =
          revision &&
          JSON.stringify([
            source.id,
            revision,
            p.scope,
            cfg,
            p.include,
            p.exclude,
            p.maxMiB,
            projection?.blocked,
          ]);
        if (cacheKey && this.lastSource?.key === cacheKey)
          return this.lastSource.snapshot;
        const snapshot = await scan(
          source,
          p.scope,
          this.configDir,
          this.self,
          false,
          budget,
          filter,
          p.scope === "content" ? p.maxMiB : 0,
          cfg,
          projection,
        );
        if (manifest && p.role === "subscriber")
          verifyManifest(
            manifest,
            snapshot,
            (f) =>
              selected(
                f.path,
                p.scope,
                this.configDir,
                this.self,
                false,
                cfg,
              ) &&
              filter(f.path) &&
              !(
                p.scope === "content" &&
                p.maxMiB > 0 &&
                f.size > p.maxMiB * 1048576
              ) &&
              !(
                f.path.startsWith("plugins/") &&
                projection?.blocked.includes(f.path.split("/")[1].toLowerCase())
              ),
          );
        if (
          cacheKey &&
          ![...(snapshot.skipped?.values() ?? [])].includes("locked")
        )
          this.lastSource = { key: cacheKey, snapshot };
        return snapshot;
      };
      const inputs = await Promise.allSettled([
        scanSource(),
        scan(
          target,
          p.scope,
          this.configDir,
          this.self,
          !p.strictDrift,
          budget,
          filter,
          p.scope === "content" ? p.maxMiB : 0,
          cfg,
          projection,
        ),
      ]);
      const [s, t] = inputs.map((i) => {
        if (i.status === "rejected") throw i.reason;
        return i.value;
      });
      let result = plan(
        p,
        s,
        t,
        this.applier.state.get(key),
        undefined,
        options.mode,
      );
      let changed = 0;
      if (approved)
        result = selectPlan(
          p,
          result,
          approved,
          options.choices,
          options.release,
        );
      if (!preview) {
        if (options.active && !options.active()) throw Error("stopped");
        if (
          p.scope === "content" &&
          p.role === "publisher" &&
          result.ops.some((x) => x.action === "write" || x.action === "both")
        ) {
          await sleep(2000);
          for (const op of result.ops) {
            if (!op.source || !(op.action === "write" || op.action === "both"))
              continue;
            try {
              const now = await budget.io(() => source.stat(op.path));
              if (
                now?.mtime !== op.source.mtime ||
                now?.size !== op.source.size
              )
                result.deferred.push({ path: op.path, reason: "unstable" });
            } catch (e) {
              if (!transient(e)) throw e;
              result.deferred.push({ path: op.path, reason: "locked" });
            }
          }
        }
        const held = new Set(result.deferred.map((x) => x.path));
        result.ops = result.ops.filter((op) => {
          if (held.has(op.path)) return false;
          if (
            p.scope === "content" &&
            p.role === "subscriber" &&
            ["delete", "both", "write"].includes(op.action) &&
            options.quiet?.(op.path)
          ) {
            result.deferred.push({ path: op.path, reason: "editing" });
            return false;
          }
          return true;
        });
        if (options.active && !options.active()) throw Error("stopped");
        const deletes = result.ops
          .filter((op) => op.action === "delete")
          .map((op) => op.path);
        if (deletes.length && source.confirmAbsent)
          await budget.io(() => source.confirmAbsent!(deletes));

        this.status.set("apply");
        changed = await this.applier.apply(
          p,
          result,
          source,
          target,
          key,
          p.role === "subscriber"
            ? p.scope === "settings"
              ? this.configDir
              : p.local
            : p.reference,
          budget,
          options.progress,
          options.active,
          projection,
          publication,
          managed
            ? async () => {
                if (
                  (await budget.io(() => readManifest(reference)))?.revision !==
                  manifest?.revision
                )
                  throw Error("referenceChanged");
              }
            : undefined,
        );
      }
      this.status.set(
        result.held.length || result.deferred.length ? "partial" : "done",
      );
      return { plan: result, changed };
    });
  }
}
