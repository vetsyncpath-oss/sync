import {
  hash,
  safe,
  fold,
  parent,
  type Bytes,
  type Snapshot,
  type StorageProvider,
} from "./model";
export const manifestPath = ".sync-manifest.json";
export const manifestBytes = (v: unknown) =>
  new TextEncoder().encode(JSON.stringify(v)).buffer;
export interface ManifestEntry {
  path: string;
  size: number;
  hash: string;
  mtime: number;
}
interface Manifest {
  schemaVersion: 1;
  revision: string;
  generatedAt: string;
  publisherDevice: string;
  files: ManifestEntry[];
}
export async function buildManifest(snapshot: Snapshot, device: string) {
  if (
    !snapshot.complete ||
    [...(snapshot.skipped?.values() ?? [])].some((x) => x !== "filter")
  )
    throw Error("incomplete");
  const files = [...snapshot.files]
    .map(([path, v]) => ({
      path,
      size: v.size,
      hash: v.rawHash ?? v.hash,
      mtime: Number.isFinite(v.mtime) ? v.mtime : 0,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const revision = await hash(manifestBytes(files));
  return manifestBytes({
    schemaVersion: 1,
    revision,
    filesHash: revision,
    generatedAt: new Date().toISOString(),
    publisherDevice: device,
    files,
  });
}
export async function readManifest(
  store: StorageProvider,
): Promise<Manifest | null> {
  store.reset?.();
  const stat = await store.stat(manifestPath);
  if (!stat) return null;
  if (stat.type !== "file") throw Error("manifestInvalid");
  const raw = await store.download(manifestPath);
  let m: Manifest;
  try {
    m = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw Error("manifestInvalid");
  }
  if (
    !m ||
    m.schemaVersion !== 1 ||
    !Array.isArray(m.files) ||
    !(
      (typeof m.revision === "string" && m.revision.length) ||
      Number.isSafeInteger(m.revision)
    ) ||
    typeof m.publisherDevice !== "string" ||
    typeof m.generatedAt !== "string"
  )
    throw Error("manifestInvalid");
  const checksum = await hash(manifestBytes(m.files));
  if ("filesHash" in m && m.filesHash !== checksum)
    throw Error("manifestInvalid");
  m.revision = JSON.stringify([m.revision, checksum]);
  const seen = new Set<string>();
  for (const f of m.files) {
    if (
      !f ||
      typeof f.path !== "string" ||
      !safe(f.path) ||
      fold(f.path) === manifestPath ||
      seen.has(fold(f.path)) ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      !Number.isFinite(f.mtime) ||
      !/^([a-f0-9]{64})$/.test(f.hash)
    )
      throw Error("manifestInvalid");
    seen.add(fold(f.path));
  }
  return m;
}
export function verifyManifest(
  m: Manifest,
  snap: Snapshot,
  accept: (f: ManifestEntry) => boolean,
) {
  if (
    !snap.complete ||
    [...(snap.skipped?.values() ?? [])].some((reason) => reason !== "filter")
  )
    throw Error("manifestMismatch");
  const entries = new Map(m.files.map((f) => [f.path, f]));
  for (const [p, item] of snap.files) {
    const f = entries.get(p);
    if (f?.hash !== (item.rawHash ?? item.hash) || f.size !== item.size)
      throw Error("manifestMismatch");
  }
  for (const f of m.files) {
    if (snap.files.has(f.path) || !accept(f)) continue;
    let p = f.path;
    while (p && !snap.skipped?.has(p)) p = parent(p);
    if (!p) throw Error("manifestMismatch");
  }
}
export interface Publication {
  missing: boolean;
  build: () => Promise<Bytes>;
}
