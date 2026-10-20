export type Provider = "gdrive" | "gdrive-public" | "yandex" | "github";
export interface Connection {
  id: string;
  name: string;
  provider: Provider;
  secretRef: string;
  clientId?: string;
  clientSecretRef?: string;
  subject?: string;
  root?: string;
  checkedAt?: number;
  accountLabel?: string;
}
export type Category =
  | "notes"
  | "attachments"
  | "settings"
  | "plugin-settings"
  | "plugin-code"
  | "themes";
export type Direction = "pull" | "push" | "both";
export type Conflict = "local" | "remote" | "newest" | "both" | "ask";
export interface Profile {
  id: string;
  name: string;
  connectionId: string;
  remoteRoot: string;
  localRoot: string;
  branch: string;
  subpath: string;
  direction: Direction;
  oneWayMode?: "tracked" | "mirror";
  driveDuplicates?: "error" | "newest";
  scope: "all" | "folders" | "categories";
  folders: string[];
  categories: Category[];
  excludePaths: string[];
  excludeData: boolean;
  excludeWorkspace: boolean;
  maxMB: number;
  conflict: Conflict;
  conflictWhen: "both-changed" | "any-difference";
  deletion: "ignore" | "trash" | "permanent";
  deleteConflict: "ask" | "keep" | "delete";
  intervalMinutes: number;
  startup: boolean;
  onChange: boolean;
  enabled: boolean;
  confirmDeletes: boolean;
  sourceKind?: "connection" | "folder";
  sourceConnectionId?: string;
  sourceRoot?: string;
  sourceBranch?: string;
  sourceSubpath?: string;
}
export interface FileInfo {
  path: string;
  hash: string;
  size: number;
  mtime?: number;
  version: string;
  id?: string;
}
export interface Snapshot {
  files: Record<string, FileInfo>;
  directories?: string[];
  complete: boolean;
  warnings: string[];
  identity: string;
}
export interface Store {
  identity: string;
  writable: boolean;
  trashSupported: boolean;
  scan(signal: AbortSignal): Promise<Snapshot>;
  read(file: FileInfo, signal: AbortSignal): Promise<Uint8Array>;
  write(
    path: string,
    bytes: Uint8Array,
    expected: FileInfo | undefined,
    mtime: number | undefined,
    signal: AbortSignal,
  ): Promise<FileInfo>;
  delete(file: FileInfo, trash: boolean, signal: AbortSignal): Promise<void>;
}
export interface Pair {
  local?: string;
  remote?: string;
  policyKey?: string;
}
export interface PendingOperation {
  runId: string;
  identity: string;
  direction: Direction;
  policyKey: string;
  operation: Operation;
  result?: Pair;
}
export interface Baseline {
  identity: string;
  files: Record<string, Pair>;
}
export type Action =
  | "download"
  | "upload"
  | "delete-local"
  | "delete-remote"
  | "keep-both"
  | "adopt"
  | "skip"
  | "conflict";
export interface Operation {
  path: string;
  action: Action;
  reason: string;
  local?: FileInfo;
  remote?: FileInfo;
  id: string;
}
export interface Plan {
  id: string;
  created: number;
  profile: Profile;
  identity: string;
  operations: Operation[];
  local: Snapshot;
  remote: Snapshot;
  warnings: string[];
  baseline: Baseline;
}
export interface RunLog {
  id: string;
  profileId: string;
  name: string;
  at: number;
  status: "completed" | "partial" | "failed" | "cancelled";
  applied: number;
  conflicts: number;
  message: string;
  details: { path: string; action: Action; status: string }[];
}
export interface Persisted {
  schema: 1;
  connections: Connection[];
  profiles: Profile[];
  history: RunLog[];
}
export function newProfile(connectionId = ""): Profile {
  return {
    id: crypto.randomUUID(),
    name: "Новый профиль",
    connectionId,
    remoteRoot: "",
    localRoot: "",
    branch: "",
    subpath: "",
    direction: "pull",
    scope: "all",
    folders: [],
    categories: ["notes", "attachments"],
    excludePaths: [],
    excludeData: true,
    excludeWorkspace: true,
    maxMB: 50,
    conflict: "both",
    conflictWhen: "both-changed",
    deletion: "ignore",
    deleteConflict: "ask",
    intervalMinutes: 15,
    startup: false,
    onChange: false,
    enabled: false,
    confirmDeletes: true,
  };
}
