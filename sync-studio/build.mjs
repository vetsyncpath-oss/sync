import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist/sync-studio',{recursive:true});
await build({entryPoints:['src/main.ts'],outfile:'dist/sync-studio/main.js',bundle:true,platform:'node',format:'cjs',target:'es2022',external:['obsidian','electron'],sourcemap:false,banner:{js:'/* Sync Studio 0.1.0 — independent synchronization core. See THIRD_PARTY.md. */'}});
for(const f of ['manifest.json','styles.css','README.md','THIRD_PARTY.md','ARCHITECTURE.md'])await copyFile(f,'dist/sync-studio/'+f);
await mkdir('dist/sync-studio/licenses',{recursive:true});await copyFile('licenses/sync-engine-MIT.txt','dist/sync-studio/licenses/sync-engine-MIT.txt');
