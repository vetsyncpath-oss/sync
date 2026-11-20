import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
await build({
  absWorkingDir: dir,
  entryPoints: ["src/plugin.js"],
  outfile: "main.js",
  target: "es2022",
  platform: "browser",
  charset: "utf8",
  format: "cjs",
  bundle: true,
  external: ["obsidian", "node:*", "electron"],
  alias: {
    "node:crypto": "./src/portable-hash.js",
    "node:timers/promises": "./src/portable-timer.js",
  },
});
