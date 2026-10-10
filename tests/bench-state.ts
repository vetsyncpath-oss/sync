import { performance } from 'node:perf_hooks';
import { fixture, ab, entry } from './helpers';
import { MISSING } from '../src/core/local-version';

// Same no-effect workload as the 2a measurement, plus realistic applied effects.
for (const appliedEffects of [false, true]) for (const operations of [100, 500, 5000]) {
  const f = fixture(); let metadataBytes = 0, publications = 0;
  const write = f.memory.fs.write, rename = f.memory.fs.rename;
  f.memory.fs.write = async (path, value) => { metadataBytes += Buffer.byteLength(value); await write(path, value); };
  f.memory.fs.rename = async (a, b) => { publications++; await rename(a, b); };
  const started = performance.now();
  for (let n = 0; n < operations; n++) {
    const path = `file-${n}.md`;
    await f.mutations.write('bench', { id: `w${n}`, planId: 'plan', path, before: MISSING, guard: () => {},
      ...(appliedEffects ? { effect: { kind: 'set' as const, remote: entry(path, 'x'), mode: 'applied' as const } } : {}),
    }, ab('x'));
  }
  process.stdout.write(JSON.stringify({ operations, appliedEffects, metadataBytes, publications,
    retainedMetadataFiles: f.memory.files.size, elapsedMs: Math.round(performance.now() - started) }) + '\n');
}
