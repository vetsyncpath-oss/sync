import { build } from 'esbuild';

await build({
  entryPoints: ['main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  external: ['obsidian'],
  sourcemap: true,
  logLevel: 'info',
});
