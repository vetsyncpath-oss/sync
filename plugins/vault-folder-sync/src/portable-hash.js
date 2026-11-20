// The shared stores use SHA-256 for file equality and MD5 for Drive download verification.
import { sha256 } from "@noble/hashes/sha256";
import { sha1 } from "@noble/hashes/sha1";
import { md5 } from "@noble/hashes/legacy";
import { bytesToHex } from "@noble/hashes/utils";
export function createHash(name) {
  const algorithm = { sha256, md5, sha1 }[name];
  if (!algorithm) throw new Error("Unsupported hash: " + name);
  const state = algorithm.create();
  return {
    update(bytes) {
      state.update(bytes);
      return this;
    },
    digest(encoding) {
      if (encoding !== "hex") throw new Error("Unsupported digest encoding");
      return bytesToHex(state.digest());
    },
  };
}
