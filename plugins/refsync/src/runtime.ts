import { type Profile, under, join } from "./model";
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export function transient(e: unknown) {
  if (!e || typeof e !== "object") return false;
  const message =
    ("code" in e ? String(e.code) + " " : "") +
    ("message" in e ? String(e.message) : "");
  return /\b(?:EBUSY|EPERM|EACCES|indexPending|readTimeout)\b/.test(message);
}
// The registry survives plugin disable/enable in the same running vault.
const registryKey = Symbol.for("refsync.pending-mutations.v1");
type Registry = WeakMap<object, MutationFence>;
const registryHost = globalThis as typeof globalThis & {
  [registryKey]?: Registry;
};
export class MutationFence {
  pending = false;
  previousInstance: Promise<void> = Promise.resolve();
  static forVault(vault: object) {
    const registry = (registryHost[registryKey] ??= new WeakMap());
    let fence = registry.get(vault);
    if (!fence) {
      fence = new MutationFence();
      registry.set(vault, fence);
    }
    return fence;
  }
  quarantine(operation: Promise<unknown>) {
    this.pending = true;
    const clear = () => {
      this.pending = false;
    };
    void operation.then(clear, clear);
  }
  check() {
    if (this.pending) throw Error("settling");
  }
}
export class RunBudget {
  constructor(
    private deadline = Date.now() + 300000,
    private operationMs = 15000,
    private backoff = [250, 500, 1000],
    readonly fence = new MutationFence(),
  ) {}
  check() {
    this.fence.check();
    if (Date.now() >= this.deadline) throw Error("watchdog");
  }
  async io<T>(work: () => Promise<T>, read = true): Promise<T> {
    for (let i = 0; ; i++) {
      this.check();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const operation = work();
        return await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => {
                if (!read) this.fence.quarantine(operation);
                reject(Error(read ? "readTimeout" : "settling"));
              },
              Math.min(this.operationMs, this.deadline - Date.now()),
            );
          }),
        ]);
      } catch (e) {
        if (!transient(e) || i >= this.backoff.length) throw e;
      } finally {
        clearTimeout(timer);
      }
      await sleep(this.backoff[i]);
    }
  }
}
export class QuietWindow {
  private edits = new Map<string, number>();
  private attempts = new Map<string, number>();
  edited(path: string, now = Date.now()) {
    this.edits.set(path, now);
  }
  check(p: Profile, path: string, open: boolean, now = Date.now()) {
    const key = JSON.stringify([p.id, p.local, path]),
      time = this.edits.get(join(p.local, path));
    if (!open || time === undefined || now - time >= 1000 * p.quietSeconds) {
      this.attempts.delete(key);
      return false;
    }
    const n = this.attempts.get(key) ?? 0;
    if (n >= p.maxDeferrals) {
      return false;
    }
    this.attempts.set(key, n + 1);
    return true;
  }
  clear() {
    this.edits.clear();
    this.attempts.clear();
  }
}
export class NoticeCenter {
  private times = new Map<string, number>();
  constructor(
    private show: (message: string) => void,
    private clock = Date.now,
  ) {}
  send(key: string, message: string) {
    const now = this.clock();
    for (const [k, t] of this.times) if (now - t >= 60000) this.times.delete(k);
    if (this.times.has(key)) return;
    this.times.set(key, now);
    this.show(message);
  }
}
// Coalesce per profile while serializing all work that shares the same vault.
export class Scheduler {
  private tail = Promise.resolve();
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private queued = new Set<string>();
  private stopped = false;
  constructor(
    private run: (id: string) => Promise<void>,
    private failed: (e: unknown) => void,
  ) {}
  serial<T>(job: () => Promise<T>): Promise<T> {
    const next = this.tail.then(() => {
      if (this.stopped) throw Error("stopped");
      return job();
    });
    this.tail = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  schedule(id: string, ms = 0) {
    if (this.stopped) return;
    clearTimeout(this.pending.get(id));
    this.pending.set(
      id,
      setTimeout(() => {
        this.pending.delete(id);
        if (this.queued.has(id)) return;
        this.queued.add(id);
        void this.serial(async () => {
          this.queued.delete(id);
          await this.run(id);
        }).catch((e) => {
          if (!this.stopped) this.failed(e);
        });
      }, ms),
    );
  }
  cancel(id: string) {
    clearTimeout(this.pending.get(id));
    this.pending.delete(id);
  }
  stop() {
    this.stopped = true;
    for (const id of this.pending.keys()) this.cancel(id);
    return this.tail;
  }
}
export function eventPath(p: Profile, path: string): boolean {
  if (
    !p.enabled ||
    p.scope !== "content" ||
    !p.fileEvents ||
    path.split("/").some((s) => s.startsWith("."))
  )
    return false;
  return (p.access === "local" ? [p.reference, p.local] : [p.local]).some(
    (root) => under(path, root === "/" ? "" : root),
  );
}
