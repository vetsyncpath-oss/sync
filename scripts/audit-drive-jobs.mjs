// One-off architectural probes; no Google account or real vault is used.
// This is separate from verify: several probes deliberately demonstrate current defects.
import {build} from 'esbuild';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=await mkdtemp(join(tmpdir(),'vault-sync-audit-'));
try{
  const fixture=await readFile(join(root,'tests/drive-coordinator.test.ts'),'utf8');
  const end=fixture.indexOf("test('bootstrap");
  if(end<0)throw Error('Audit fixture changed; update this probe before using its results');
  const prefix=fixture.slice(0,end).replace(/from\s+(['"])\.\.\/src\/([^'"]+)\1/g,(_match,_quote,path)=>`from ${JSON.stringify(join(root,'src',path))}`);
  const fixturePath=join(directory,'fixture.ts');
  await writeFile(fixturePath,prefix+'\nexport {Fixture,bytes};\n');
  const outfile=join(directory,'probes.cjs');
  await build({entryPoints:[join(root,'scripts/audit-drive-jobs.ts')],outfile,bundle:true,platform:'node',format:'cjs',target:'node18',
    alias:{obsidian:join(root,'tests/obsidian-stub.ts'),'@audit/fixture':fixturePath},external:['electron'],logLevel:'warning'});
  const result=spawnSync(process.execPath,[...(Number(process.versions.node.split('.')[0])<19?['--experimental-global-webcrypto']:[]),outfile],
    {cwd:root,stdio:'inherit',timeout:30_000});
  if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{await rm(directory,{recursive:true,force:true});}
