import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import type { Bytes } from "./model";

export type TransferPulse = (
  done?: number,
  total?: number,
  resumed?: boolean,
) => void;
export type TransferObserver = (
  path: string,
  direction: "transferUpload" | "transferDownload",
  done: number,
  total: number,
  resumed: boolean,
) => void;
export function byteCount(done: number, total: number) {
  const format = (v: number) =>
    (v / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return format(done) + " / " + format(total) + " MiB";
}
export const chunkSize = 8 * 1024 * 1024;
export interface ChunkSource {
  size: number;
  read(offset: number, length: number): Promise<Bytes>;
}
export function fromBuffer(bytes: Bytes): ChunkSource {
  return {
    size: bytes.byteLength,
    read: async (offset, length) => bytes.slice(offset, offset + length),
  };
}
// Hash exactly the bytes handed to the consumer. A short file is never published.
export async function processChunks(
  file: ChunkSource,
  consume?: (bytes: Bytes) => Promise<void>,
  progress?: () => void,
) {
  const digest = sha256.create();
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const length = Math.min(chunkSize, file.size - offset);
    const bytes = await file.read(offset, length);
    if (bytes.byteLength !== length) throw Error("referenceChanged");
    digest.update(new Uint8Array(bytes));
    await consume?.(bytes);
    progress?.();
  }
  return bytesToHex(digest.digest());
}
