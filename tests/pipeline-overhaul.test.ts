import test from 'node:test';
import assert from 'node:assert/strict';
import { ab, entry, fixture, deferred, str, fsMemory } from './helpers';
import { NetError, NetLayer } from '../src/core/net';
import { OperationStore } from '../src/core/operation-store';
import { DurableMutations } from '../src/core/durable-mutations';
import { ManifestCache } from '../src/core/manifest-cache';
import { FileJournal, type JournalEntry } from '../src/core/journal';
import { Scheduler } from '../src/core/scheduler';
import { awaitBeforeSession } from '../src/core/governance';
import { ResourceGate } from '../src/core/resource-gate';
import { SyncFault, diagnosticText, syncIssue } from '../src/core/sync-issue';
import type { SyncProgress } from '../src/sources/types';

const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('partial transfer is observable before any file finishes; repeated source failure defers untouched paths',async()=>{
 const entries=Array.from({length:12},(_,i)=>({...entry(`file${i}.md`),size:1024*1024}));const f=fixture(entries);
 f.deps.options.concurrency=2;const started=deferred(),release=deferred();let active=0,fetches=0;
 const liveReported=deferred(),progress:SyncProgress[]=[];f.ui.setStatus=(_s,p)=>{if(p){progress.push(p);if(p.fileIndex===0&&(p.bytesTransferred??0)>0)liveReported.resolve();}};
 f.source.fetch=async(_e,_s,observe)=>{fetches++;observe?.({stage:'download',attempt:1,maxAttempts:3,bytes:2048,byteDelta:2048,capability:'streaming'});if(++active===2)started.resolve();await release.promise;throw new NetError('Failed to fetch',{attempt:3});};
 const run=f.coordinator.sync();await started.promise;await liveReported.promise;
 const live=progress.find(p=>p.fileIndex===0&&(p.bytesTransferred??0)>0);try{assert(live);assert(live.activities?.some(a=>a.path&&a.attempt===1));}finally{release.resolve();}
 const result=await run;assert(result);assert(result.failed>=3&&result.failed<=4);assert(result.notAttempted!>0);assert(fetches<entries.length);assert(result.results?.some(r=>r.issue?.attempt===3));
});
test('source cooldown survives a new automatic session and a targeted manual retry can probe again',async()=>{
 const f=fixture(Array.from({length:8},(_,i)=>entry(`a${i}.md`)));f.deps.options.concurrency=1;
 const circuits:Record<string,{retryAt:number;failures:number}>={};f.deps.options.sourceCircuits=()=>circuits;let calls=0;
 f.source.fetch=async()=>{calls++;throw new NetError('network offline');};await f.coordinator.sync({trigger:'auto'});assert.equal(calls,3);
 await f.coordinator.sync({trigger:'auto'});assert.equal(calls,3);
 f.source.fetch=async()=>{calls++;return ab('REMOTE');};await f.coordinator.retryFailed('manual',['a0.md']);assert.equal(calls,4);assert.equal(str(f.files.get('a0.md')!),'REMOTE');assert(!f.files.has('a3.md'));
});
test('historical failures remain pending but are not new errors',async()=>{
 const files=Array.from({length:35},(_,i)=>entry(`old${i}.md`));const f=fixture(files);for(const file of files){f.own(file.path,'REMOTE');f.queue.add(file,'old write error',0,'blocked');}
 f.source.fetch=async()=>{assert.fail('unchanged file');};const result=await f.coordinator.sync();assert.equal(result?.failed,0);assert.equal(result?.pendingBefore,35);assert.equal(result?.pendingAfter,35);assert.equal(result?.results?.filter(row=>row.status==='error').length,0);
 assert(!f.notices.includes('errors 35'));assert(f.notices.includes('not due 35'));
});
test('excluded failures do not block an unrelated verified deletion',async()=>{
 const f=fixture([entry('Excluded/a.md'),entry('new.md')],'light');f.own('gone.md');f.queue.add(entry('Excluded/a.md'),'old',0,'blocked');
 f.coordinator.setSyncPolicy({version:1,mirror:false,folders:[{path:'Excluded',include:'exclude'}]});const result=await f.coordinator.sync();assert.equal(result?.failed,0);assert.equal(result?.pendingAfter,0);assert.equal(result?.deleted,1);assert.equal(f.queue.size(),1);
});
test('digest failure can be repaired at the same advertised version without Force',async()=>{
 const f=fixture([entry('a.md')]);f.source.fetch=async()=>ab('WRONG!');await f.coordinator.sync({trigger:'auto'});assert.equal(f.queue.all()[0].failureKind,'transient');assert(!f.queue.all()[0].poisoned);
 f.queue.mergeBack(f.queue.all().map(item=>({...item,nextRetryAt:0})));f.source.fetch=async()=>ab('REMOTE');const result=await f.coordinator.sync({trigger:'auto'});assert.equal(result?.failed,0);assert.equal(f.queue.size(),0);assert.equal(str(f.files.get('a.md')!),'REMOTE');
});
test('global history capacity stops before payload fetch rather than producing one failure per file',async()=>{
 const f=fixture([entry('a.md'),entry('b.md')]);await f.store.load();await f.mutations.write('test',{id:'seed',planId:'seed',path:'seed.md',before:{kind:'missing'},guard:()=>{}},ab('seed'));
 const store=new OperationStore(f.memory.fs,1);f.deps.mutations=new DurableMutations(store,f.recovery,f.vault);let calls=0;f.source.fetch=async()=>{calls++;return ab('REMOTE');};
 const result=await f.coordinator.sync();assert.equal(calls,0);assert.equal(result?.failed,0);assert.equal(result?.problems?.[0].code,'history-quota');assert.equal(f.queue.size(),0);assert(!f.files.has('a.md'));
});
test('late final checkpoint error is the final result and is never preceded by success',async()=>{
 const f=fixture();f.deps.options.persistState=async()=>{throw Error('checkpoint cannot be saved');};const result=await f.coordinator.sync();assert.equal(result?.outcome,'error');assert.match(result?.problem??'',/cannot be saved/);assert.equal(result?.problems?.[0].stage,'checkpoint');assert(!f.statuses.includes('idle'));assert(!f.notices.includes('current'));
});
test('Cancel resolves a pending conflict without an answer and preserves current bytes',async()=>{
 const f=fixture([entry('a.md')]);f.files.set('a.md',ab('LOCAL'));const asked=deferred();f.conflict.setStrategy('ask');f.resolverDeps.ui={askConflict:async()=>{asked.resolve();return new Promise(()=>{});}};
 const run=f.coordinator.sync();await asked.promise;f.coordinator.cancel();const result=await run;assert.equal(result?.outcome,'cancelled');assert.equal(str(f.files.get('a.md')!),'LOCAL');assert(!f.coordinator.isRunning());
});
test('Cancel resolves an unanswered preview before any fetch',async()=>{
 const f=fixture([entry('a.md')]),asked=deferred();f.ui.confirmSync=async()=>{asked.resolve();return new Promise(()=>{});};f.source.fetch=async()=>{assert.fail('cancelled preview');};
 const run=f.coordinator.sync();await asked.promise;f.coordinator.cancel();await run;assert(!f.coordinator.isRunning());assert(!f.files.has('a.md'));
});
test('sync probe handles synchronous errors while retaining the existing verdict',async()=>{await awaitBeforeSession({beforeSession(){throw Error('probe broke');}},100);});
test('missing-only restoration obtains one inventory and leaves existing local files alone',async()=>{
 const f=fixture([entry('missing.md'),entry('existing.md')]);f.files.set('existing.md',ab('LOCAL'));let inventories=0;f.source.getManifest=async()=>{inventories++;return [entry('missing.md'),entry('existing.md')];};
 await f.coordinator.sync({missingOnly:true});assert.equal(inventories,1);assert.equal(str(f.files.get('existing.md')!),'LOCAL');assert.equal(str(f.files.get('missing.md')!),'REMOTE');
});
for(const dir of ['plugins','themes'])test(`${dir} package verifies every changed payload before any member is written`,async()=>{
 const names=dir==='plugins'?['main.js','manifest.json','styles.css']:['theme.css','manifest.json'];const root=`.obsidian/${dir}/example`,files=names.map(name=>entry(`${root}/${name}`)),f=fixture(files);
 f.deps.policy=new (await import('../src/core/path-policy')).PathPolicy({syncMode:'full-vault',allowedFolders:'',ignoredFolders:'',allowPlugins:true,allowSnippets:true,protectedPaths:['.obsidian/plugins/sync']});
 f.source.fetch=async file=>file.path.endsWith('manifest.json')?ab('WRONG!'):ab('REMOTE');const result=await f.coordinator.sync();assert.equal(result?.failed,1);assert.equal(result?.downloaded,0);for(const file of files)assert(!f.files.has(file.path));assert(result?.results?.some(row=>row.reason==='package-not-ready'));
});
test('a package and an unrelated file share the bounded staging budget without deadlock',async()=>{
 const f=fixture([entry('.obsidian/themes/theme/theme.css'),entry('other.md'),entry('.obsidian/themes/theme/manifest.json')]);f.deps.options.bufferBudgetBytes=48;f.deps.options.concurrency=2;
 const result=await f.coordinator.sync();assert.equal(result?.downloaded,3);assert.equal(result?.failed,0);
});
test('parent file collision is detected before any fetch and never deletes the local file',async()=>{
 const f=fixture([entry('parent/a.md')]);f.files.set('parent',ab('USER'));const stat=f.vault.stat;f.vault.stat=async p=>{const s=await stat(p);return s?{...s,type:'file'}:null;};let calls=0;f.source.fetch=async()=>{calls++;return ab('REMOTE');};
 const result=await f.coordinator.sync();assert.equal(calls,0);assert.equal(result?.problems?.[0].code,'path-collision');assert.equal(str(f.files.get('parent')!),'USER');
});
test('dirty editor guard prevents replacement even if the saved baseline still matches',async()=>{
 const f=fixture([entry('a.md')]);f.own('a.md','OLD');f.vault.assertWritable=async p=>{if(p==='a.md')throw new SyncFault('unsaved-editor','Save the editor first');};const result=await f.coordinator.sync();assert.equal(result?.outcome,'error');assert.equal(str(f.files.get('a.md')!),'OLD');assert.equal(result?.results?.find(row=>row.path==='a.md')?.issue?.code,'unsaved-editor');
});
test('cache fallback quarantines a corrupt final publication before republishing',async()=>{
 const m=fsMemory(),cache=new ManifestCache(m.fs,'test');cache.set('a',{h:'old',s:1,alg:'sha256'});await cache.flush();await cache.flush();m.files.set('manifest-test.json','BROKEN');const loaded=new ManifestCache(m.fs,'test');await loaded.load();await loaded.flush();assert.equal(loaded.get('a')?.h,'old');assert([...m.files].some(([name,content])=>name.includes('.corrupt-')&&content==='BROKEN'));
});
const journalEntry:JournalEntry={startedAt:1,durationMs:0,engine:'git',mirrorLevel:'fetch',trigger:'manual',outcome:'ok',downloaded:0,updated:0,deletedLight:0,deletedFull:0,overwritten:0,conflicts:0,skipped:0,errors:0,topErrors:[]};
test('corrupt diagnostic journal is backed up before publication, and unreadable history is retained',async()=>{
 let raw='BROKEN',backup='';const journal=new FileJournal({read:async()=>raw,write:async value=>{raw=value;},quarantine:async value=>{backup=value;}});await journal.append(journalEntry);assert.equal(backup,'BROKEN');assert.equal((await journal.load()).length,1);
 const broken=new FileJournal({read:async()=>{throw Error('permission denied');},write:async()=>{assert.fail('must retain');}});await assert.rejects(broken.append(journalEntry),/unreadable/);
});
test('retention preserves current baselines and the newest effect while releasing old terminal history',async()=>{
 const f=fixture();await f.store.load();await f.mutations.write('test',{id:'one',planId:'one',path:'a.md',before:{kind:'missing'},guard:()=>{},effect:{kind:'set',remote:entry('a.md','OLD'),mode:'applied'}},ab('OLD'));
 const before=await import('../src/core/local-version');await f.mutations.write('test',{id:'two',planId:'two',path:'a.md',before:await before.versionOf(ab('OLD')),guard:()=>{},effect:{kind:'set',remote:entry('a.md'),mode:'applied'}},ab('REMOTE'));
 const cutoff=Date.now()+1,ids=f.store.prunable(cutoff).map(r=>r.id);assert.deepEqual(ids,['one']);await f.store.prune(cutoff,ids);assert.equal((await f.store.capacity()).used,1);
 const reopened=new OperationStore(f.memory.fs);await reopened.load();assert.equal(reopened.baseline('test','a.md')?.remote.hash,entry('a.md').hash);assert.deepEqual(reopened.records().map(r=>r.id),['two']);await assert.rejects(reopened.prune(cutoff,['two']),/changed/);
 const cache=new ManifestCache(f.memory.fs,'test');new DurableMutations(reopened,f.recovery,f.vault).projectCache('test',cache);assert.equal(cache.get('a.md')?.h,entry('a.md').hash);
});
test('retention cannot prune a committing or blocked operation',async()=>{
 const f=fixture();await f.store.begin({id:'pending',planId:'p',namespace:'test',path:'a.md',kind:'write',before:{kind:'missing'},after:{kind:'file',size:6,sha256:entry('a.md').hash},createdAt:1,status:'committing'});assert.equal(f.store.prunable(Date.now()).length,0);await assert.rejects(f.store.prune(Date.now(),['pending']),/changed/);
});
test('weighted buffer wait is cancelled without consuming its budget',async()=>{
 const gate=new ResourceGate(2),controller=new AbortController(),release=await gate.acquire(2,controller.signal);const pending=gate.acquire(1,controller.signal);controller.abort();await assert.rejects(pending,{name:'AbortError'});release();const next=await gate.acquire(2,new AbortController().signal);next();
});
test('startup-only pause/resume does not create another startup event',async()=>{
 let timeout=()=>{},calls=0;const f=fixture();const scheduler=new Scheduler({queue:f.queue,onAutoTick:()=>{calls++;},onAutoRetry:()=>{},setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{}});scheduler.start('startup-only',0);timeout();await tick();scheduler.pause();scheduler.resume();scheduler.wake();await tick();assert.equal(calls,1);assert.equal(scheduler.snapshot().nextTickAt,null);scheduler.stop();
});
test('busy or offline tick remains pending and coalesces into one catch-up',async()=>{
 let timeout=()=>{},calls=0,available=false;const f=fixture();const scheduler=new Scheduler({queue:f.queue,onAutoTick:()=>{calls++;},onAutoRetry:()=>{},canRun:()=>available,setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{}});scheduler.start('startup-only',0);timeout();assert(scheduler.snapshot().pending);assert.equal(scheduler.snapshot().lastAutoTickAt,null);available=true;scheduler.wake();scheduler.wake();await tick();assert.equal(calls,1);assert(!scheduler.snapshot().pending);scheduler.stop();
});
test('long rate limit is deferred instead of exhausting multiple hour-long sleeps',async()=>{
 const net=new NetLayer({fetch:async()=>({status:429,headers:{'retry-after':'3600'},arrayBuffer:async()=>ab(''),text:async()=>''})});await assert.rejects(net.fetchBuffer('https://example.test',{maxElapsedMs:100}),(e:any)=>e.status===429&&e.retryAfterMs===3600000);
});
test('diagnostic text removes signed queries, credentials and authorization values',()=>{const message=diagnosticText('Failed https://user:secret@example.test/file?token=secret#fragment Authorization: Bearer SECRET password=secret');assert(!message.includes('secret'));assert(!message.includes('SECRET'));assert(message.includes('https://example.test/file'));});

test('a retained prune event replays safely when checkpoint compaction was interrupted',async()=>{
 const f=fixture();await f.store.begin({id:'old',planId:'old',namespace:'test',path:'a.md',kind:'write',before:{kind:'missing'},after:{kind:'file',size:6,sha256:entry('a.md').hash},createdAt:1,status:'committing'});await f.store.finish('old','not-applied');
 const write=f.memory.fs.write;f.memory.fs.write=async(path,data)=>{if(path.includes('checkpoint-')&&!path.includes('0000000000000000'))throw Error('checkpoint interrupted');await write(path,data);};
 await assert.rejects(f.store.prune(Date.now(),['old']),/interrupted/);f.memory.fs.write=write;const reopened=new OperationStore(f.memory.fs);await reopened.load();assert.equal(reopened.records().length,0);assert.equal((await reopened.capacity()).used,0);
});
test('resource limits can be raised without dropping retained history or recovery objects',async()=>{
 const f=fixture();await f.store.load();f.store.setLimit(20000);f.recovery.setLimit(1024*1024*1024);assert.equal((await f.store.capacity()).limit,20000);assert.equal((await f.recovery.usage()).limit,1024*1024*1024);assert.throws(()=>f.store.setLimit(-1));assert.throws(()=>f.recovery.setLimit(NaN));
});

test('inventory source context retains an underlying transient HTTP cause',()=>{
 const issue=syncIssue(Object.assign(Error('Disk: temporary rate limit'),{cause:new NetError('rate limited',{status:429,attempt:3,retryAfterMs:60000,host:'api.example'})}),'manifest');assert(issue.retryable);assert.equal(issue.status,429);assert.equal(issue.attempt,3);assert.equal(issue.host,'api.example');
});
test('manual questions wait until independent nonconflicting downloads have completed',async()=>{
 const manifest=Array.from({length:5},(_,i)=>entry('conflict-'+i+'.md')).concat(entry('ordinary.md'));
 const f=fixture(manifest);for(let i=0;i<5;i++)f.files.set('conflict-'+i+'.md',ab('LOCAL'));
 f.conflict.setStrategy('ask');let questions=0;f.resolverDeps.ui={askConflict:async()=>{questions++;assert.equal(str(f.files.get('ordinary.md')!),'REMOTE');return 'defer';}};
 const result=await f.coordinator.sync();assert.equal(questions,5);assert.equal(result?.failed,0);assert.equal(result?.outcome,'ok');assert.equal(result?.deferredConflicts,5);assert.equal(f.queue.size(),0);
});
