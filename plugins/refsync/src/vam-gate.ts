// SDK 6 subscriptions announce changes. The live scoped decision authorizes I/O.
export const managerId = "vault-access-manager";
export interface Scope {
  tenantId: string;
  bundleId: string;
}
interface Decision {
  status: "granted" | "pending" | "blocked";
  reason: string | null;
  validUntil: number | null;
}
export interface VamBridge {
  version: string;
  access(query: Scope & { capability: "use" }): Decision;
  register(id: string): void;
  subscribe(listener: () => void): () => void;
}
export interface ManagerContext {
  scope?: Scope;
  bridge?: VamBridge;
  manager?: object;
}
export const sameScope = (a?: Scope, b?: Scope) =>
  !!a && !!b && a.tenantId === b.tenantId && a.bundleId === b.bundleId;
export function readScope(value: unknown): Scope | undefined {
  const v = value as Partial<Scope> | null;
  const valid = (s: unknown): s is string =>
    typeof s === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(s);
  if (v && valid(v.tenantId) && valid(v.bundleId))
    return { tenantId: v.tenantId, bundleId: v.bundleId };
}
export class VamGate {
  private manager?: object;
  private bridge?: VamBridge;
  private off?: () => void;
  private observedScope?: Scope;
  private generation = 0;
  private disposed = false;
  private last = "vamMissing";
  constructor(
    private context: () => ManagerContext,
    private changed: () => void,
  ) {}
  refresh() {
    if (this.disposed) return "vamMissing";
    let reason = "vamMissing";
    try {
      const context = this.context();
      const { manager, bridge } = context;
      const scope = readScope(context.scope);
      if (
        this.observedScope !== scope &&
        !sameScope(scope, this.observedScope)
      ) {
        this.observedScope = scope;
        this.generation++;
      }
      if (this.manager !== manager || this.bridge !== bridge) {
        this.generation++;
        this.off?.();
        this.off = undefined;
        this.manager = manager;
        this.bridge = bridge;
        if (manager && bridge?.version === "6") {
          bridge.register("refsync");
          // Subscriptions may notify synchronously while being attached.
          const off = bridge.subscribe(() => {
            if (this.off) this.refresh();
          });
          if (typeof off === "function") this.off = off;
        }
      }
      if (manager) {
        if (!bridge || bridge.version !== "6" || !this.off)
          reason = "vamProtocol";
        else if (!scope) reason = "vamScope";
        else {
          const d = bridge.access({ ...scope, capability: "use" });
          if (d.status === "granted")
            reason =
              typeof d.validUntil === "number" &&
              Number.isFinite(d.validUntil) &&
              d.validUntil > Date.now()
                ? "vamGranted"
                : "vamExpired";
          else if (d.status === "pending")
            reason =
              d.reason === "device-not-approved" || d.reason === "device-limit"
                ? "vamDevice"
                : "vamPending";
          else
            reason =
              d.reason === "signed-out"
                ? "vamLogin"
                : d.reason === "connection-unavailable"
                  ? "vamOffline"
                  : "vamBlocked";
        }
      }
    } catch {
      reason = "vamBlocked";
    }
    if (reason !== this.last) {
      if (this.last === "vamGranted") this.generation++;
      this.last = reason;
      this.changed();
    }
    return reason;
  }
  get label() {
    return this.last;
  }
  require() {
    const reason = this.refresh();
    if (reason !== "vamGranted") throw Error(reason);
  }
  lease() {
    this.require();
    const generation = this.generation;
    return () => {
      this.require();
      if (generation !== this.generation) throw Error("vamSessionChanged");
    };
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.off?.();
    this.off = undefined;
    this.bridge = undefined;
    this.manager = undefined;
  }
}

// A browser, review window, or transaction can retain its provider across a login change.
export function guardedStore(
  store: import("./model").StorageProvider,
  check: () => void,
): import("./model").StorageProvider {
  return new Proxy(store, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      if (key === "chunkSource")
        return (p: string, size: number) => {
          check();
          const file = target.chunkSource?.(p, size);
          return (
            file && {
              size: file.size,
              read: (offset: number, length: number) => {
                check();
                return file.read(offset, length);
              },
            }
          );
        };
      return (...args: unknown[]) => {
        check();
        return Reflect.apply(value, target, args);
      };
    },
  });
}
