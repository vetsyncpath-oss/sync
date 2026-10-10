import { build } from 'esbuild';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'cloud-vault-sync-tests-'));
try {
  const files = (await readdir('tests')).filter(name => name.endsWith('.test.ts')).sort();
  if (files.length === 0) throw new Error('No test files found');
  await build({
    entryPoints: files.map(name => join('tests', name)),
    outdir: directory,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    alias: { obsidian: resolve('tests/obsidian-stub.ts') },
    logLevel: 'warning',
  });
  const child = spawn(process.execPath, [
    '--test', '--test-timeout=30000', ...files.map(name => join(directory, name.replace(/\.ts$/, '.cjs'))),
  ], { stdio: 'inherit' });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  await rm(directory, { recursive: true, force: true });
}
