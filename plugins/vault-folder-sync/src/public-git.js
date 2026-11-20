// Desktop Git reads objects from a temporary bare repository. The vault is never a working tree.
export async function openNativeGit(repo, ref, prefix, included, signal) {
  const fs = require("node:fs/promises"),
    os = require("node:os"),
    path = require("node:path");
  const { execFile } = require("node:child_process");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-public-git-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "https",
  });
  const git = (args, maxBuffer = 64 * 1024 * 1024) =>
    new Promise((resolve, reject) =>
      execFile(
        "git",
        ["-c", "credential.helper=", ...args],
        {
          cwd: dir,
          env,
          signal,
          encoding: "buffer",
          maxBuffer,
          timeout: 120000,
          windowsHide: true,
        },
        (err, out) =>
          err
            ? reject(
                Error(
                  err.code === "ENOENT"
                    ? "Установите Git и добавьте его в PATH."
                    : "Git не смог прочитать репозиторий или версию: " +
                        args[0],
                ),
              )
            : resolve(out),
      ),
    );
  const close = () => fs.rm(dir, { recursive: true, force: true });
  const fetchCommit = async () => {
    await git([
      "fetch",
      "--quiet",
      "--depth=1",
      "--no-tags",
      "--no-recurse-submodules",
      "--",
      repo,
      ref,
    ]);
    return (await git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"]))
      .toString()
      .trim();
  };
  try {
    await git(["init", "--bare", "--template=", "."]);
    const commit = await fetchCommit();
    const tree = async (at) => {
      const treeish = prefix ? at + ":" + prefix : at;
      if (prefix) {
        const type = await git(["cat-file", "-t", treeish]).catch(() => null);
        if (type?.toString().trim() !== "tree")
          throw Error("Подпапка Git отсутствует: " + prefix);
      }
      const data = await git(["ls-tree", "-rzt", treeish]);
      return new TextDecoder("utf-8", { fatal: true })
        .decode(data)
        .split("\0")
        .filter(Boolean);
    };
    const read = async (file) => {
      const data = await git(["cat-file", "blob", file.id]);
      if (
        data
          .subarray(0, 80)
          .toString()
          .startsWith("version https://git-lfs.github.com/spec")
      )
        throw Error("Git LFS не поддерживается: " + file.path);
      return data;
    };
    return {
      close,
      read,
      async scan() {
        const files = Object.create(null),
          directories = [];
        for (const row of await tree(commit)) {
          const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(row);
          if (!match) throw Error("Некорректное дерево Git.");
          const [, mode, type, id, p] = match;
          if (!included(p)) continue;
          if (type === "tree") {
            directories.push(p);
            continue;
          }
          if (type !== "blob" || !["100644", "100755"].includes(mode))
            throw Error("Ссылка или submodule в выбранной папке: " + p);
          const bytes = await read({ id, path: p });
          const hash = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("");
          files[p] = { path: p, id, size: bytes.length, hash };
        }
        return { files, directories, complete: true };
      },
      async confirmAbsent(p) {
        if (
          (await tree(await fetchCommit())).some(
            (line) => line.slice(line.indexOf("\t") + 1) === p,
          )
        )
          throw Error("Путь снова появился в Git: " + p);
      },
    };
  } catch (e) {
    await close();
    throw e;
  }
}
