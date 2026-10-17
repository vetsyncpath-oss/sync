// node scripts/audit-archive-resume.mjs OUTPUT.json [BASELINE_GIT_REF]
// Optional baseline substitutes only the provider source; fixtures remain identical.
import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { auditEvidence } from './audit-evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw Error('An output JSON path is required');
const destination=resolve(process.argv[2]);
// Invalidate stale evidence before any setup that can fail, including Git resolution.
await writeFile(destination,JSON.stringify({status:'incomplete',complete:false,startedAt:new Date().toISOString()})+'\n');
const directory=await mkdtemp(join(tmpdir(),'zip-audit-'));
const sourcePath=join(root,'src/adapters/archive-downloader.ts');
const hash=text=>createHash('sha256').update(text).digest('hex');
try {
 const baseline=process.argv[3]?execFileSync('git',['rev-parse','--verify','--end-of-options',`${process.argv[3]}^{commit}`],{cwd:root,encoding:'utf8'}).trim():undefined;
 const source=baseline?execFileSync('git',['show',`${baseline}:src/adapters/archive-downloader.ts`],{cwd:root,encoding:'utf8'}):await readFile(sourcePath,'utf8');
 const expected=JSON.parse(await readFile(join(root,'scripts/archive-resume-cases.json'),'utf8'));
 const bundle=join(directory,'tests.cjs');
 await build({entryPoints:[join(root,'tests/archive-resume.test.ts')],outfile:bundle,bundle:true,platform:'node',format:'cjs',target:'node18',
  plugins:[{name:'provider-snapshot',setup(build){build.onLoad({filter:/[/\\]archive-downloader\.ts$/},args=>args.path===sourcePath?{contents:source,loader:'ts',resolveDir:dirname(sourcePath)}:undefined);}}]});
 const child=spawn(process.execPath,[...(Number(process.versions.node.split('.')[0])<19?['--experimental-global-webcrypto']:[]),'--test-reporter=tap',bundle],{cwd:root,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',bytes=0,timedOut=false,overflow=false;
 const collect=target=>chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024){overflow=true;child.kill('SIGKILL');return;}if(target==='stdout')stdout+=chunk;else stderr+=chunk;};
 child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
 // Referenced watchdog: unresolved promises must not let the evidence process silently exit.
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},30000);
 let exitCode;
 try {exitCode=await new Promise((resolveExit,reject)=>{child.once('error',reject);child.once('close',code=>resolveExit(code??1));});}
 finally {clearTimeout(timer);}
 const result=auditEvidence(stdout,expected,exitCode);
 if(timedOut||overflow){result.complete=false;result.status='fail';result.errors.push(timedOut?'watchdog-timeout':'output-limit');}
 const evidence={...result,baselineCommit:baseline??null,providerSha256:hash(source),fixtureSha256:hash(await readFile(join(root,'tests/archive-resume.test.ts'),'utf8')),tapSha256:hash(stdout),node:process.version,
  limitations:['Real loopback HTTP; no live remote provider/Obsidian','B43 partial: desktop download only; diagnostic range reader remains open']};
 await writeFile(destination+'.tap',stdout);await writeFile(destination+'.stderr.log',stderr);
 await writeFile(destination,JSON.stringify(evidence,null,2)+'\n');
 // Read back and check the report rather than treating publication as implied by exit status.
 const published=JSON.parse(await readFile(destination,'utf8'));
 if(published.tapSha256!==hash(stdout)||published.scenarios.length!==expected.length)throw Error('Evidence publication verification failed');
 console.log(JSON.stringify({status:result.status,complete:result.complete,passed:result.scenarios.filter(s=>s.status==='pass').length,total:expected.length,output:destination}));
 process.exitCode=result.status==='pass'?0:1;
} finally {await rm(directory,{recursive:true,force:true});}
