import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  rename,
  rm,
  mkdir,
  stat,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { App } from "obsidian";
import { LocalStore } from "../src/adapters/local";
async function vault() {
  const root = await mkdtemp(join(tmpdir(), "studio-vault-"));
  const adapter = {
    getBasePath: () => root,
    exists: async (p: string) =>
      !!(await stat(join(root, p)).catch(() => null)),
    stat: async (p: string) => {
      const s = await stat(join(root, p)).catch(() => null);
      return s
        ? {
            type: s.isDirectory() ? "folder" : "file",
            size: s.size,
            mtime: s.mtimeMs,
            ctime: s.ctimeMs,
          }
        : null;
    },
    list: async (p: string) => {
      const items = await readdir(join(root, p), { withFileTypes: true });
      return {
        files: items
          .filter((x) => x.isFile())
          .map((x) => (p ? p + "/" + x.name : x.name)),
        folders: items
          .filter((x) => x.isDirectory())
          .map((x) => (p ? p + "/" + x.name : x.name)),
      };
    },
    readBinary: async (p: string) =>
      Uint8Array.from(await readFile(join(root, p))).buffer,
    writeBinary: async (
      p: string,
      b: ArrayBuffer,
      options?: { mtime: number },
    ) => {
      await writeFile(join(root, p), new Uint8Array(b));
      if (options)
        await utimes(join(root, p), new Date(), new Date(options.mtime));
    },
    rename: async (a: string, b: string) =>
      rename(join(root, a), join(root, b)),
    remove: async (p: string) => rm(join(root, p)),
    mkdir: async (p: string) => mkdir(join(root, p), { recursive: true }),
    trashLocal: async (p: string) => {
      await mkdir(join(root, ".trash"), { recursive: true });
      await rename(join(root, p), join(root, ".trash", p.replaceAll("/", "_")));
    },
  };
  const app = {
    vault: {
      adapter,
      configDir: ".obsidian",
      getName: () => root,
      getFileByPath: () => null,
    },
  } as unknown as App;
  return {
    root,
    adapter,
    store: new LocalStore(app, "", 1024),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
test("local adapter installs verified temporary content and removes stage files", async () => {
  const v = await vault();
  try {
    await writeFile(join(v.root, "note.md"), "old");
    const s = await v.store.scan(new AbortController().signal);
    await v.store.write(
      "note.md",
      new TextEncoder().encode("new"),
      s.files["note.md"],
      undefined,
      new AbortController().signal,
    );
    assert.equal(await readFile(join(v.root, "note.md"), "utf8"), "new");
    assert.deepEqual(await readdir(join(v.root, ".sync-studio/stage")), []);
  } finally {
    await v.cleanup();
  }
});
test("editing local file while stage is written prevents replacement", async () => {
  const v = await vault();
  try {
    await writeFile(join(v.root, "note.md"), "old");
    const s = await v.store.scan(new AbortController().signal);
    const original = v.adapter.writeBinary;
    v.adapter.writeBinary = async (p, b, o) => {
      await original(p, b, o);
      await writeFile(join(v.root, "note.md"), "user edit");
    };
    await assert.rejects(
      () =>
        v.store.write(
          "note.md",
          new TextEncoder().encode("new"),
          s.files["note.md"],
          undefined,
          new AbortController().signal,
        ),
      /изменилась/,
    );
    assert.equal(await readFile(join(v.root, "note.md"), "utf8"), "user edit");
  } finally {
    await v.cleanup();
  }
});
test("local trash actually moves the file and permanent deletion removes it", async () => {
  const v = await vault();
  try {
    await writeFile(join(v.root, "trash.md"), "a");
    await writeFile(join(v.root, "delete.md"), "b");
    const s = await v.store.scan(new AbortController().signal);
    await v.store.delete(
      s.files["trash.md"],
      true,
      new AbortController().signal,
    );
    await v.store.delete(
      s.files["delete.md"],
      false,
      new AbortController().signal,
    );
    assert.equal(await readFile(join(v.root, ".trash/trash.md"), "utf8"), "a");
    assert.equal(await v.adapter.exists("trash.md"), false);
    assert.equal(await v.adapter.exists("delete.md"), false);
    assert.equal(await v.adapter.exists(".trash/delete.md"), false);
  } finally {
    await v.cleanup();
  }
});
