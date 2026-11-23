import type { TransferPulse } from "./transfer";
import type { ConfigScope } from "./config-scope";
export type Direction = "SourceToTarget";
export type Role = "subscriber" | "publisher";
export type Scope = "content" | "settings";
export type Policy = "source" | "target" | "newer" | "both";
export type Mode = "plan" | "silent";
export type Volatility = "H" | "S" | "V";
export interface Profile {
  localPlace?: string;
  referencePlace?: string;
  dav?: import("./webdav").DavLocation;
  cloud?: import("./private-cloud").CloudLocation;
  remote?: import("./public-location").PublicSource;
  content?: import("./content-scope").ContentScope;
  config?: ConfigScope;
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
  access: "local" | "public" | "oauth" | "webdav" | "token";
  local: string;
  reference: string;
  mirror: "full" | "preserve";
  deletions: boolean;
  conflict: Policy;
  backup: boolean;
  emptyGuard: boolean;
  silentDeletionSafeguard: boolean;
  mode: Mode;
  firstPlan: boolean;
  fileEvents: boolean;
  watch: boolean;
  strictDrift: boolean;
}
export const defaults: Profile = {
  id: "local",
  name: "Sync Studio",
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
  local: "Sync Studio-copy",
  reference: "Sync Studio-source",
  mirror: "preserve",
  deletions: false,
  conflict: "source",
  backup: true,
  emptyGuard: true,
  silentDeletionSafeguard: true,
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
  rawHash?: string;
}
export interface Snapshot {
  files: Map<string, Entry>;
  directories: Set<string>;
  managedDirectories?: Set<string>;
  occupiedDirectories?: Set<string>;
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
    canRemoveEmptyDirs?: boolean;
    maxFileSize: number;
    rateLimits: number | null;
  };
  withFilePaused?: (path: string, write: () => Promise<void>) => Promise<void>;
  reset?: () => void;
  confirmAbsent?: (paths: string[]) => Promise<void>;
  list(
    dir: string,
  ): Promise<{ files: string[]; folders: string[]; skipped?: string[] }>;
  scanStat?: StorageProvider["stat"];
  stat(path: string): Promise<
    | (FileMeta & {
        type: "file" | "folder";
        version?: string;
        sha256?: string;
      })
    | null
  >;
  readDigest?(
    path: string,
    size: number,
    progress: () => void,
  ): Promise<string>;
  chunkSource?(
    path: string,
    size: number,
  ): import("./transfer").ChunkSource | undefined;
  uploadChunks?(
    path: string,
    file: import("./transfer").ChunkSource,
    digest: string,
    mtime: number | undefined,
    progress: TransferPulse,
  ): Promise<void>;
  download(path: string, progress?: TransferPulse): Promise<Bytes>;
  upload(
    path: string,
    data: Bytes,
    mtime?: number,
    progress?: TransferPulse,
  ): Promise<void>;
  delete(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  removeEmptyDir(path: string): Promise<boolean>;
  getRevision(): Promise<string | null>;
}
export interface RecordState extends FileMeta {
  hash: string;
  applied: string;
  seen: string;
  delivered: boolean;
}
export function trackedDirectories(base: Baseline) {
  if (base.folders) return new Set(base.folders);
  const dirs = new Set<string>();
  for (const [path, entry] of Object.entries(base.entries))
    if (entry.delivered)
      for (let dir = parent(path); dir && !dirs.has(dir); dir = parent(dir))
        dirs.add(dir);
  return dirs;
}
export interface Baseline {
  folders?: string[];
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
          !/^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(
            s,
          ),
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
