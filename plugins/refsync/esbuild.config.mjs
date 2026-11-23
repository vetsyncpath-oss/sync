import { build } from "esbuild";
await build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  platform: "browser",
  inject: ["src/git-buffer.ts"],
  format: "cjs",
  target: "es2022",
  external: [
    "obsidian",
    "electron",
    "node:http",
    "node:https",
    "node:crypto",
    "node:fs/promises",
    "node:path",
  ],
  charset: "utf8",
});
