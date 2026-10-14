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
    target: 'node18',
    alias: { obsidian: resolve('tests/obsidian-stub.ts') },
    external: ['electron'],
    logLevel: 'warning',
  });
  const child = spawn(process.execPath, [
    ...(Number(process.versions.node.split('.')[0]) < 19 ? ['--experimental-global-webcrypto'] : []),
    '--test', ...files.map(name => join(directory, name.replace(/\.ts$/, '.cjs'))),
  ], { stdio: 'inherit' });
  const watchdog = setTimeout(() => { console.error('Tests exceeded 30 seconds'); child.kill('SIGKILL'); }, 30000);
  watchdog.unref();
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolveExit(code ?? 1));
  });
  clearTimeout(watchdog);
  process.exitCode = exitCode;
} finally {
  await rm(directory, { recursive: true, force: true });
}
