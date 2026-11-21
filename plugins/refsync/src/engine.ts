import { type Profile, type StorageProvider } from "./model";
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
      const [s, t] = await Promise.all([
        scan(source, p.scope, this.configDir, this.self),
        scan(target, p.scope, this.configDir, this.self, !p.strictDrift),
      ]);
      const result = plan(p, s, t, this.applier.state.get(key));
      let changed = 0;
      const signature = (v: Plan) =>
        JSON.stringify([
          v.held,
          v.ops
            .filter((x) => x.action !== "ack")
            .map((x) => [x.path, x.action, x.source?.hash]),
        ]);
      if (approved && signature(approved) !== signature(result))
        throw Error("referenceChanged");
      if (!preview) {
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
        );
      }
      this.status.set(result.held.length ? "partial" : "done");
      return { plan: result, changed };
    });
  }
}
