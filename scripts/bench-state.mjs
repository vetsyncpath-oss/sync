import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'cloud-vault-sync-bench-'));
try {
  const outfile = join(directory, 'bench.mjs');
  await build({ entryPoints: ['tests/bench-state.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning' });
  const child = spawn(process.execPath, [outfile], { stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
} finally {
  await rm(directory, { recursive: true, force: true });
}
