import { readManifest, buildManifest, verifyManifest } from "./cloud-manifest";
import { folderIncluded } from "./content-scope";
import { selected } from "./classifier";
import {
  emptyConfigDirectory,
  legacyConfig,
  mobileExcluded,
} from "./config-scope";
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
import {
  scan,
  PathIssue,
  newStats,
  DigestCache,
  type ScanStats,
} from "./scanner";
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
    private cache = new DigestCache(),
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
      thorough?: boolean;
      scanning?: (stats: ScanStats) => void;
      transfer?: import("./transfer").TransferObserver;
      progress?: (done: number, total: number) => void;
      active?: () => boolean;
    } = {},
  ): Promise<{
    plan: Plan;
    changed: number;
    stats: ScanStats;
    operations: { path: string; action: string }[];
  }> {
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
      const stats = newStats(),
        operations: { path: string; action: string }[] = [];
      let last = 0;
      const scanOptions = {
        stats,
        cache: this.cache,
        content: p.content,
        thorough: options.thorough,
        tick: () => {
          if (options.active && !options.active()) throw Error("stopped");
          if (Date.now() - last >= 250) {
            last = Date.now();
            options.scanning?.(stats);
          }
        },
      };
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
        p.access === "webdav" ||
        (p.access === "public" && p.remote?.engine !== "git");
      const manifest = managed
        ? await budget.io(() => readManifest(reference))
        : null;
      const publication =
        (p.access === "oauth" || p.access === "webdav") &&
        p.role === "publisher"
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
                  undefined,
                  scanOptions,
                );
                return buildManifest(snapshot, this.applier.state.device);
              },
            }
          : undefined;
      const scanSource = async () => {
        const revision =
          p.role === "subscriber" && p.access !== "local" && !manifest
            ? await budget.io(() => source.getRevision())
            : null;
        const cacheKey =
          revision &&
          JSON.stringify([
            source.id,
            revision,
            manifest?.revision,
            p.scope,
            cfg,
            p.include,
            p.content,
            p.exclude,
            p.maxMiB,
            projection?.blocked,
          ]);
        if (
          !options.thorough &&
          cacheKey &&
          (!manifest || manifest.directories) &&
          this.lastSource?.key === cacheKey
        ) {
          stats.files += this.lastSource.snapshot.files.size;
          stats.reused += this.lastSource.snapshot.files.size;
          return this.lastSource.snapshot;
        }
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
          scanOptions,
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
                p.content,
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
            (pth) =>
              filter(pth) &&
              selected(
                pth,
                p.scope,
                this.configDir,
                this.self,
                true,
                cfg,
                p.content,
              ) &&
              (p.scope === "content"
                ? !p.content || folderIncluded(pth, p.content)
                : emptyConfigDirectory(pth, cfg)) &&
              !(
                pth.startsWith("plugins/") &&
                projection?.blocked.includes(pth.split("/")[1].toLowerCase())
              ),
          );
        if (
          cacheKey &&
          ![...(snapshot.skipped?.values() ?? [])].includes("locked")
        )
          this.lastSource = { key: cacheKey, snapshot };
        return snapshot;
      };
      await this.cache.load();
      const inputs = await Promise.allSettled([
        scanSource(),
        scan(
          target,
          p.scope,
          this.configDir,
          this.self,
          !p.strictDrift && !options.thorough && p.conflict === "source",
          budget,
          filter,
          p.scope === "content" ? p.maxMiB : 0,
          cfg,
          projection,
          scanOptions,
        ),
      ]);
      await this.cache.flush();
      const [s, t] = inputs.map((i) => {
        if (i.status === "rejected") throw i.reason;
        return i.value;
      });
      if (publication && !preview) {
        for (const [path, reason] of t.skipped ?? [])
          if (reason !== "filter") throw new PathIssue(reason, path);
      }
      if (publication && manifest && p.scope === "content") {
        try {
          verifyManifest(manifest, t, () => true);
        } catch {
          publication.missing = true;
        }
      }
      options.scanning?.(stats);
      let result = plan(
        p,
        s,
        t,
        await this.applier.state.load(key),
        undefined,
        options.mode,
        this.configDir,
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
      if (target.capabilities.canRemoveEmptyDirs === false) {
        const folders = new Set([
          ...(result.heldFolders ?? []),
          ...result.ops
            .filter((op) => op.action === "rmdir")
            .map((op) => op.path),
        ]);
        for (const path of folders)
          result.deferred.push({ path, reason: "folderRetained" });
        result.ops = result.ops.filter((op) => op.action !== "rmdir");
        result.held = result.held.filter((p) => !folders.has(p));
        result.heldFolders = [];
      }
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
              const now = await budget.io(() =>
                source.scanStat
                  ? source.scanStat(op.path)
                  : source.stat(op.path),
              );
              if (
                !now ||
                now.mtime !== op.source.mtime ||
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
          .filter((op) => op.action === "delete" || op.action === "rmdir")
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
          operations,
          this.configDir,
          this.self,
          options.transfer,
        );
      }
      this.status.set(
        result.held.length || result.deferred.length ? "partial" : "done",
      );
      return { plan: result, changed, stats, operations };
    });
  }
}
