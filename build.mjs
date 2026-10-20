import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";

await build({
  entryPoints: ["main.ts"],
  outfile: "main.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  external: ["obsidian", "electron"],
  sourcemap: false,
  banner: {
    js: "/* Sync Studio 0.3.0 — independent synchronization core. See THIRD_PARTY.md. */",
  },
});
await mkdir("dist/sync-studio/licenses", { recursive: true });
for (const file of [
  "main.js",
  "manifest.json",
  "styles.css",
  "README.md",
  "THIRD_PARTY.md",
  "ARCHITECTURE.md",
  "TROUBLESHOOTING.md",
  "CHANGELOG.md",
  "AUDIT.md",
])
  await copyFile(file, `dist/sync-studio/${file}`);
await copyFile(
  "licenses/sync-engine-MIT.txt",
  "dist/sync-studio/licenses/sync-engine-MIT.txt",
);
