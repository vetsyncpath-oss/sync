export type Direction = "SourceToTarget";
export type Role = "subscriber" | "publisher";
export type Scope = "content" | "settings";
export type Policy = "source" | "target" | "newer" | "both";
export type Mode = "plan" | "silent";
export type Volatility = "H" | "S" | "V";
export interface Profile {
  id: string;
  name: string;
  enabled: boolean;
  inheritMode: boolean;
  startup: boolean;
  startupSeconds: number;
  intervalMinutes: number;
  onFocus: boolean;
  onOnline: boolean;
  debounceSeconds: number;
  quietSeconds: number;
  maxDeferrals: number;
  include: string;
  exclude: string;
  maxMiB: number;
  maxDeleteCount: number;
  maxDeletePercent: number;
  shrinkPercent: number;
  deleteGrace: number;
  trash: "plugin" | "vault" | "system" | "permanent";
  trashDays: number;
  role: Role;
  scope: Scope;
  access: "local" | "public" | "oauth" | "token";
  local: string;
  reference: string;
  mirror: "full" | "preserve";
  deletions: boolean;
  conflict: Policy;
  backup: boolean;
  emptyGuard: boolean;
  mode: Mode;
  firstPlan: boolean;
  fileEvents: boolean;
  watch: boolean;
  strictDrift: boolean;
}
export const defaults: Profile = {
  id: "local",
  name: "RefSync",
  enabled: true,
  inheritMode: true,
  startup: true,
  startupSeconds: 5,
  intervalMinutes: 5,
  onFocus: true,
  onOnline: true,
  debounceSeconds: 2,
  quietSeconds: 5,
  maxDeferrals: 3,
  include: "",
  exclude: "",
  maxMiB: 0,
  maxDeleteCount: 100,
  maxDeletePercent: 50,
  shrinkPercent: 50,
  deleteGrace: 5,
  trash: "plugin",
  trashDays: 30,
  role: "subscriber",
  scope: "content",
  access: "local",
  local: "RefSync-copy",
  reference: "RefSync-reference",
  mirror: "preserve",
  deletions: false,
  conflict: "source",
  backup: true,
  emptyGuard: true,
  mode: "plan",
  firstPlan: false,
  fileEvents: false,
  watch: false,
  strictDrift: false,
};
export interface FileMeta {
  size: number;
  mtime: number;
}
export interface Entry extends FileMeta {
  hash: string;
  kind: Volatility;
}
export interface Snapshot {
  files: Map<string, Entry>;
  directories: Set<string>;
  complete: boolean;
  skipped?: Map<string, string>;
}
export type Bytes = ArrayBuffer;
export interface StorageProvider {
  readonly id: string;
  readonly capabilities: {
    readOnly: boolean;
    supportsChecksum: boolean;
    supportsChangesFeed: boolean;
    maxFileSize: number;
    rateLimits: number | null;
  };
  list(dir: string): Promise<{ files: string[]; folders: string[] }>;
  stat(path: string): Promise<(FileMeta & { type: "file" | "folder" }) | null>;
  download(path: string): Promise<Bytes>;
  upload(path: string, data: Bytes, mtime?: number): Promise<void>;
  delete(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  getRevision(): Promise<string | null>;
}
export interface RecordState extends FileMeta {
  hash: string;
  applied: string;
  seen: string;
  delivered: boolean;
}
export interface Baseline {
  entries: Record<string, RecordState>;
  size: number;
  lastRun: string;
}
export const fresh = (): Baseline => ({
  entries: Object.create(null),
  size: 0,
  lastRun: "",
});
export const join = (a: string, b: string) => (a && b ? a + "/" + b : a || b);
export const parent = (p: string) =>
  p.slice(0, Math.max(0, p.lastIndexOf("/")));
export const fold = (v: string) => v.normalize("NFC").toLowerCase();
export const under = (p: string, base: string) =>
  !base || p === base || p.startsWith(base + "/");
export function safe(p: string): boolean {
  return (
    p.length < 1024 &&
    p
      .split("/")
      .every(
        (s) =>
          s.length > 0 &&
          s.length <= 255 &&
          !/[<>:"\\|?*\x00-\x1F\x7F]/.test(s) &&
          !/[. ]$/.test(s) &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s),
      )
  );
}
export function checked(p: string): string {
  if (!safe(p)) throw Error("path");
  return p;
}
export async function hash(b: Bytes): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
