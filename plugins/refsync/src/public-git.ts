import {
  fetch as fetchGit,
  addRemote,
  init,
  readCommit,
  readTree,
  readBlob,
  type FsClient,
  type HttpClient,
} from "isomorphic-git";
import type { Transport } from "./public-cloud";
import { rootItem, type RemoteItem, type RemoteTree } from "./public-store";

function gitHttp(send: Transport): HttpClient {
  return {
    async request({ url, method = "GET", headers = {}, body }) {
      const u = new URL(url);
      if (
        u.protocol !== "https:" ||
        !(
          (method === "GET" &&
            u.pathname.endsWith("/info/refs") &&
            u.searchParams.get("service") === "git-upload-pack") ||
          (method === "POST" && u.pathname.endsWith("/git-upload-pack"))
        )
      )
        throw Error("gitRead");
      let payload: ArrayBuffer | undefined;
      if (body) {
        const chunks: Uint8Array[] = [];
        let n = 0;
        for await (const chunk of body) {
          chunks.push(chunk);
          n += chunk.length;
        }
        const bytes = new Uint8Array(n);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        payload = bytes.buffer;
      }
      const res = await send(url, method, headers, payload);
      return {
        url,
        method,
        statusCode: res.status,
        statusMessage: String(res.status),
        headers: res.headers,
        body: (async function* () {
          yield new Uint8Array(res.arrayBuffer);
        })(),
      };
    },
  };
}
type Snapshot = { fs: FsClient; oid: string; tree: string; mtime: number };
const fetching = new Map<string, Promise<Snapshot>>();
export class GitTree implements RemoteTree {
  private pinned?: Promise<Snapshot>;
  private last?: { key: string; bytes: ArrayBuffer };
  constructor(
    private openFs: () => Promise<FsClient>,
    private send: Transport,
    private url: string,
    private branch: string,
    private cacheKey: string,
  ) {}
  private snapshot() {
    if (!this.pinned) {
      let work = fetching.get(this.cacheKey);
      if (!work) {
        work = this.fetch().finally(() => fetching.delete(this.cacheKey));
        fetching.set(this.cacheKey, work);
      }
      this.pinned = work;
    }
    return this.pinned;
  }
  private async fetch(): Promise<Snapshot> {
    try {
      const fs = await this.openFs(),
        opts = { fs, dir: "/work", gitdir: "/db" };
      await init({ ...opts, defaultBranch: "main" });
      await addRemote({
        ...opts,
        remote: "origin",
        url: this.url,
        force: true,
      });
      const { fetchHead } = await fetchGit({
        ...opts,
        http: gitHttp(this.send),
        url: this.url,
        ref: this.branch || "HEAD",
        remote: "origin",
        singleBranch: true,
        depth: 1,
        tags: false,
      });
      if (!fetchHead) throw Error("gitRead");
      const { commit } = await readCommit({ ...opts, oid: fetchHead });
      return {
        fs,
        oid: fetchHead,
        tree: commit.tree,
        mtime: commit.committer.timestamp * 1000,
      };
    } catch (cause) {
      throw Error("gitRead", { cause });
    }
  }
  async revision() {
    return (await this.snapshot()).oid;
  }
  async root() {
    return rootItem((await this.snapshot()).tree);
  }
  async children(dir: RemoteItem) {
    const { fs, mtime } = await this.snapshot();
    const { tree } = await readTree({
      fs,
      dir: "/work",
      gitdir: "/db",
      oid: dir.key,
    });
    return tree.map((e) => ({
      ...rootItem(e.oid),
      name: e.path,
      mtime,
      size: -1,
      type:
        e.type === "tree"
          ? ("folder" as const)
          : ["100644", "100755"].includes(e.mode)
            ? ("file" as const)
            : ("skip" as const),
    }));
  }
  async read(item: RemoteItem) {
    if (this.last?.key === item.key) return this.last.bytes;
    const { fs } = await this.snapshot();
    const { blob } = await readBlob({
      fs,
      dir: "/work",
      gitdir: "/db",
      oid: item.key,
    });
    const bytes = Uint8Array.from(blob).buffer;
    this.last = { key: item.key, bytes };
    return bytes;
  }
  async size(item: RemoteItem) {
    return (await this.read(item)).byteLength;
  }
}
