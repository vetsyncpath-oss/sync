import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
await mkdir(".test-cache", { recursive: true });
try {
  await build({
    entryPoints: ["test/lifecycle.test.ts"],
    outfile: ".test-cache/lifecycle.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "obsidian-harness",
        setup(b) {
          b.onResolve({ filter: /^obsidian$/ }, () => ({
            path: process.cwd() + "/test/obsidian-stub.ts",
          }));
        },
      },
    ],
  });
  process.exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, [".test-cache/lifecycle.mjs"], {
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
} finally {
  await rm(".test-cache", { recursive: true, force: true });
}
