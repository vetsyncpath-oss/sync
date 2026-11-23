import type { Projection } from "./json-overlay";
import type { ConfigScope } from "./config-scope";
import { MutationFence, RunBudget } from "./runtime";
import {
  fresh,
  type Baseline,
  type Bytes,
  hash,
  checked,
  type Scope,
} from "./model";
export interface DeviceStorage {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}
export class StateStore {
  readonly device: string;
  constructor(private readonly port: DeviceStorage) {
    const current = port.get("device");
    this.device =
      typeof current === "string" && /^[a-f0-9-]{36}$/.test(current)
        ? current
        : crypto.randomUUID();
    port.set("device", this.device);
  }
  get(key: string): Baseline {
    const raw = this.port.get("state:" + this.device + ":" + key);
    if (raw == null) return fresh();
    if (
      typeof raw !== "object" ||
      !("entries" in raw) ||
      typeof raw.entries !== "object" ||
      !raw.entries ||
      !("size" in raw) ||
      typeof raw.size !== "number" ||
      !("lastRun" in raw) ||
      typeof raw.lastRun !== "string"
    )
      throw Error("state");
    return structuredClone(raw as Baseline);
  }
  put(key: string, value: Baseline) {
    this.port.set("state:" + this.device + ":" + key, value);
  }
}
export interface ArtifactStore {
  putNew(path: string, data: Bytes): Promise<void>;
  read(path: string): Promise<Bytes>;
  has(path: string): Promise<boolean>;
  dirs(): Promise<string[]>;
  removeTree(path: string): Promise<void>;
}
export class TimedArtifacts implements ArtifactStore {
  constructor(
    private disk: ArtifactStore,
    private fence: MutationFence,
  ) {}
  private io<T>(work: () => Promise<T>, read = true) {
    return new RunBudget(undefined, undefined, [], this.fence).io(work, read);
  }
  putNew(path: string, data: Bytes) {
    return this.io(() => this.disk.putNew(path, data), false);
  }
  read(path: string) {
    return this.io(() => this.disk.read(path));
  }
  has(path: string) {
    return this.io(() => this.disk.has(path));
  }
  dirs() {
    return this.io(() => this.disk.dirs());
  }
  removeTree(path: string) {
    return this.io(() => this.disk.removeTree(path), false);
  }
}
const enc = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).buffer;
export interface Intent {
  path: string;
  action: "write" | "delete" | "mkdir" | "rmdir";
  mtime?: number;
  digest?: string;
}
export interface Transaction {
  cloud?: import("./private-cloud").CloudLocation;
  settings?: {
    config: ConfigScope;
    projection: Projection;
    local: boolean;
    at: number;
  };
  version: 1;
  id: string;
  key: string;
  target: string;
  scope: Scope;
  before: Baseline;
  steps: Intent[];
}
export class ApplyJournal {
  constructor(readonly disk: ArtifactStore) {}
  async json<T>(p: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.disk.read(p))) as T;
  }
  mark(p: string) {
    return this.disk.putNew(p, enc(true));
  }
  async begin(t: Transaction) {
    await this.disk.putNew(t.id + "/intent.json", enc(t));
  }
  async backup(id: string, i: number, bytes: Bytes | null) {
    if (bytes !== null) await this.disk.putNew(id + "/backup/" + i, bytes);
    await this.disk.putNew(
      id + "/armed/" + i,
      enc(bytes === null ? null : await hash(bytes)),
    );
  }
  async transactions(): Promise<Transaction[]> {
    const out: Transaction[] = [];
    for (const id of await this.disk.dirs()) {
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      if (!(await this.disk.has(id + "/intent.json"))) {
        await this.disk.removeTree(id);
        continue;
      }
      const t = await this.json<Transaction>(id + "/intent.json");
      if (
        t.version !== 1 ||
        t.id !== id ||
        !Array.isArray(t.steps) ||
        !["content", "settings"].includes(t.scope)
      )
        throw Error("journal");
      for (const step of t.steps) {
        checked(step.path);
        if (!["write", "delete", "mkdir", "rmdir"].includes(step.action))
          throw Error("journal");
      }
      out.push(t);
    }
    return out;
  }
}
