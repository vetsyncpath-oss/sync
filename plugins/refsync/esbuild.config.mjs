import { build } from "esbuild";
await build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  platform: "browser",
  inject: ["src/git-buffer.ts"],
  format: "cjs",
  target: "es2022",
  external: ["obsidian"],
  charset: "utf8",
});
