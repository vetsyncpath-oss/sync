// Run: node reproduce-new-audit.mjs /path/to/repository [results.json]
// Requires the repository's installed dev dependencies. No network or vault access.
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=resolve(process.argv[2]||'.');
const destination=resolve(process.argv[3]||'new-audit-results.json');
const require=createRequire(join(root,'package.json'));
const {build}=require('esbuild');
const temp=await mkdtemp(join(tmpdir(),'sync-audit-'));
try {
 const source="import {PathPolicy} from '/workspace/work/sync-drive-integration/src/core/path-policy';\nimport {fixture,ab} from '/workspace/work/sync-drive-integration/tests/helpers';\nimport {versionOf} from '/workspace/work/sync-drive-integration/src/core/local-version';\nimport {writeFile} from 'node:fs/promises';\nconst opts={syncMode:'full-vault' as const,allowedFolders:'',ignoredFolders:'',allowPlugins:true,allowSnippets:true};\nasync function main(){const p=new PathPolicy(opts);const results:any[]=[{id:'N1-paths',result:['Wait...md','v1..2.md','100%25.md','%2e%2e.md','a:b.md','note:one.md','a?.md','CON.md','a.md.','a.md '].map(path=>({path,safe:p.isPathSafe(path),allowed:p.isPathAllowed(path)}))},{id:'N2-configDir',result:new PathPolicy({...opts,syncMode:'config-only'}).isPathAllowed('.custom/app.json')},{id:'N3-blockReason',result:['a/b','a//b','/a/b'].map(path=>({path,reason:new PathPolicy({...opts,blockedTargets:[{path:'a/b',reason:'reserved'}]}).blockReason(path)??null}))},{id:'N4-conflict-name',result:{allowed:p.isPathAllowed('notes.conflict-resolution.md')}}];\nconst f=fixture();f.files.set('a.md',ab('LOCAL'));await f.mutations.delete('test',{id:'trash-unavailable',planId:'p',path:'a.md',before:await versionOf(ab('LOCAL')),guard:()=>{}},true);results.push({id:'N5-trash-fallback',result:{trashAvailable:typeof f.vault.trash==='function',originalExists:f.files.has('a.md'),operations:f.operations,recoveryFiles:[...f.files.keys()].filter(x=>x.includes('recovery'))}});\nawait writeFile(process.env.REVIEW_RESULTS!,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}\nmain().catch(e=>{console.error(e);process.exitCode=1;});\n".replaceAll('/workspace/work/sync-drive-integration/',root.replaceAll('\\','/')+'/');
 const entry=join(temp,'probes.ts'), bundle=join(temp,'probes.cjs');
 await writeFile(entry,source);
 await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'cjs',target:'node18'});
 const result=spawnSync(process.execPath,[bundle],{stdio:'inherit',env:{...process.env,REVIEW_RESULTS:destination},timeout:30000});
 if(result.error) throw result.error;
 if(result.status!==0) throw new Error(`Probe exit ${result.status}`);
} finally {await rm(temp,{recursive:true,force:true});}
