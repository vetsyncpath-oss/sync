import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { App } from 'obsidian';
import Plugin from '../main';
import { SyncPopoverView, type PopoverState } from '../src/ui/sync-popover';
import { SourceConnectionModal } from '../src/ui/source-connection-modal';
import { ConflictAskModal } from '../src/ui/conflict-modal';
import { i18n } from '../src/i18n';
import { fixture, entry, ab, deferred } from './helpers';
import { RoutedSource } from '../src/sources/routed-source';
import type { JournalEntry } from '../src/core/journal';
import type { SyncSource } from '../src/sources/types';

function dom(){const {document,window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document,window});i18n.setLocale('en');return document;}
const state=():PopoverState=>({status:'syncing',mirrorLevel:'fetch',pendingErrorCount:0,conflictsCount:0,phase:4,fileIndex:0,fileTotal:35,bytesTransferred:2048,totalBytes:1700000000});
const last:JournalEntry={startedAt:1,durationMs:100,engine:'yandex',mirrorLevel:'fetch',trigger:'manual',outcome:'error',downloaded:0,updated:0,deletedLight:0,deletedFull:0,overwritten:0,conflicts:0,skipped:0,errors:1,pendingAfter:35,retryScheduled:30,blocked:5,topErrors:[],results:[{path:'.obsidian/fonts/roboto.css',source:'Disk',status:'error',reason:'network',issue:{code:'network',message:'Failed to fetch',scope:'file',retryable:true,stage:'download',attempt:3,host:'download.example'}}]};
function pop(initial:PopoverState,lastEntry:JournalEntry|null=null){const document=dom(),box=document.createElement('div');document.body.append(box);let retries:readonly string[]|undefined;const view=new SyncPopoverView({contentEl:box,state:initial,lastEntry,onSync:()=>{},onCancel:()=>{},onRetry:paths=>{retries=paths;},onPauseAuto:()=>{},onOpenJournal:()=>{},onOpenSettings:()=>{},onClose:()=>{},formatTime:String,formatBytes:n=>String(n)});view.render();return {view,box,retries:()=>retries};}
test('panel shows active source, attempt, wait and buffered capability without claiming completed files',()=>{
 const s=state();s.activities=[{path:'.obsidian/fonts/roboto.css',source:'Disk',stage:'waiting',attempt:2,maxAttempts:3,retryAt:Date.now()+60000,capability:'buffered',lastActivityAt:Date.now()}];s.currentFailed=1;s.issues=last.results;
 const f=pop(s);assert.match(f.box.textContent??'',/roboto.css/);assert.match(f.box.textContent??'',/2\/3/);assert.match(f.box.textContent??'',/OS request/);assert.match(f.box.textContent??'',/New failures in this run: 1/);assert.match(f.box.textContent??'',/Failed to fetch/);
});
test('refresh retains last-session search and opened error details',()=>{
 const f=pop({...state(),status:'error'},last);const input=f.box.querySelector<HTMLInputElement>('.pop-last-session input')!;input.value='roboto';input.dispatchEvent(new (window as any).Event('input'));const detail=f.box.querySelector<HTMLDetailsElement>('.pop-last-session details')!;detail.open=true;
 f.view.update({...state(),status:'error'});assert.equal(f.box.querySelector('.pop-last-session input'),input);assert.equal(input.value,'roboto');assert(detail.open);assert.match(f.box.textContent??'',/Unresolved files after this run: 35/);
});
test('targeted retry forwards the selected path instead of retrying the entire queue',()=>{
 const f=pop({...state(),status:'error'},last),button=f.box.querySelector<HTMLButtonElement>('.pop-targeted-retries button')!;button.click();assert.deepEqual(f.retries(),['.obsidian/fonts/roboto.css']);
 f.view.update(state());assert(button.disabled);
});
test('conflict modal closes and returns defer when its session is cancelled',async()=>{
 dom();const modal=new ConflictAskModal(new App(),{path:'a.md',localSize:1,remoteSize:1}),controller=new AbortController(),result=modal.wait(controller.signal);controller.abort();assert.equal(await result,'defer');assert(!document.body.contains(modal.contentEl));
});
test('queued question cannot open after session cancellation',async()=>{
 const plugin=new Plugin(new App(),{} as any) as any,first=deferred(),controller=new AbortController();plugin.sessionController=controller;let calls=0;
 const one=plugin.serializeAsk(async()=>{calls++;await first.promise;}),two=plugin.serializeAsk(async()=>{calls++;},controller.signal);await Promise.resolve();controller.abort();first.resolve();await one;await assert.rejects(two,{name:'AbortError'});assert.equal(calls,1);
});
test('source editor persists independent automatic sync selection',async()=>{
 dom();let saved:any;const modal=new SourceConnectionModal(new App(),{id:'disk',name:'Disk',kind:'yandex',values:{vaultUrl:'https://disk.yandex.ru/d/demo'},auto:'off'},value=>{saved=value;});modal.open();const selects=Array.from(modal.contentEl.querySelectorAll<HTMLSelectElement>('select'));
 const schedule=selects.find(select=>Array.from(select.options).some(option=>option.value==='inherit'))!;for(const option of Array.from(schedule.options))option.selected=false;schedule.querySelector<HTMLOptionElement>('option[value="1h"]')!.selected=true;schedule.dispatchEvent(new (window as any).Event('change'));
 const save=Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.textContent==='Apply to draft')!;save.click();for(let i=0;i<3;i++)await Promise.resolve();assert.equal(saved.auto,'1h');
});
test('plugin schedules only assigned sources and manual-only Yandex stays out of the inherited job',async()=>{
 dom();const plugin=new Plugin(new App(),{} as any) as any,f=fixture(),calls:string[][]=[];Object.assign(plugin,{queue:f.queue,settings:{autoSyncInterval:'15m',vaultPolicy:{version:1,mirror:false,folders:[],defaultSource:'git',fileRules:[{scope:'folder',path:'Cloud',source:'disk'},{scope:'folder',path:'Other',source:'other'}]},connections:[{id:'git',auto:'inherit'},{id:'disk',auto:'off'},{id:'other',auto:'1h'}]},builtSourceId:'test',runAutoSession:async(ids:string[])=>{calls.push(ids);return true;}});
 plugin.startAutoSync();try{
  await plugin.autoSchedulers.get('git').deps.onAutoTick();await plugin.autoSchedulers.get('other').deps.onAutoTick();assert.deepEqual(calls,[['git'],['other']]);assert.equal(plugin.autoSchedulers.get('disk').getInterval(),'off');
  let updates=0;plugin.snapshotPopoverState=()=>state();plugin.popoverView={update:()=>updates++};plugin.pauseAutoSync();assert(updates>0);assert(plugin.schedulerSnapshot().paused);plugin.restartAutoSync();assert(plugin.schedulerSnapshot().paused);plugin.pauseAutoSync();assert(!plugin.schedulerSnapshot().paused);
 }finally{for(const scheduler of plugin.autoSchedulers.values())scheduler.stop();}
});
test('Yandex concurrency limit does not throttle independent Git source requests',async()=>{
 const gate=deferred(),started=deferred();let cloudActive=0,gitActive=0;
 const cloud:SyncSource={kind:'yandex',maxConcurrentDownloads:2,getManifest:async()=>[entry('a.md'),entry('b.md'),entry('c.md')],fetch:async()=>{cloudActive++;if(cloudActive===2)started.resolve();await gate.promise;return ab('REMOTE');}};
 const git:SyncSource={kind:'git',maxConcurrentDownloads:4,getManifest:async()=>[entry('x.md'),entry('y.md')],fetch:async()=>{gitActive++;return ab('REMOTE');}};
 const routed=new RoutedSource([{id:'cloud',name:'Disk',source:cloud},{id:'git',name:'Git',source:git}],[{scope:'vault',path:'',source:'git'},{scope:'folder',path:'Cloud',source:'cloud',remotePath:''}],p=>p,'git');
 const manifest=await routed.getManifest(new AbortController().signal),controller=new AbortController(),downloads=manifest.filter(e=>e.connectionId==='cloud').map(e=>routed.fetch(e,controller.signal));await started.promise;
 assert.equal(cloudActive,2);await Promise.all(manifest.filter(e=>e.connectionId==='git').map(e=>routed.fetch(e,controller.signal)));assert.equal(gitActive,2);gate.resolve();await Promise.all(downloads);await routed.dispose();
});
test('a per-source startup-only schedule remains enabled and completed when the global interval is off',async()=>{
 dom();const plugin=new Plugin(new App(),{} as any) as any,f=fixture();Object.assign(plugin,{queue:f.queue,settings:{autoSyncInterval:'off',vaultPolicy:{version:1,mirror:false,folders:[],defaultSource:'drive'},connections:[{id:'drive',name:'Drive',kind:'gdrive',auto:'startup-only'}]},builtSourceId:'test',runAutoSession:async()=>({accepted:true,outcome:'needs-attention'})});
 plugin.startAutoSync();try{const scheduler=plugin.autoSchedulers.get('drive');await scheduler.runTick.call(Object.assign(scheduler,{pending:new Set(['startup'])}));const jobs=plugin.automaticJobSnapshots();assert.equal(jobs[0].schedule.interval,'startup-only');assert.equal(jobs[0].schedule.startupCycle,'completed');assert.equal(jobs[0].schedule.nextPeriodicAt,null);
  const {jobCards}=await import('../src/ui/job-cards'),cards=jobCards(jobs);assert.match(cards.textContent??'',/At startup.*Startup cycle completed/);assert(!/Off/.test(cards.textContent??''));plugin.restartAutoSync();assert.equal(scheduler.snapshot().nextTickAt,null);
 }finally{for(const scheduler of plugin.autoSchedulers.values())scheduler.stop();}
});
test('inheriting sources each keep their own scheduler and pause/resume does not erase a consumed startup',async()=>{
 dom();const plugin=new Plugin(new App(),{} as any) as any,f=fixture();Object.assign(plugin,{queue:f.queue,settings:{autoSyncInterval:'startup-only',vaultPolicy:{version:1,mirror:false,folders:[],defaultSource:'git',fileRules:[{scope:'folder',path:'Cloud',source:'drive'}]},connections:[{id:'git',name:'Git',kind:'git',auto:'inherit'},{id:'drive',name:'Drive',kind:'gdrive',auto:'inherit'}]},builtSourceId:'test',runAutoSession:async()=>({accepted:true})});
 plugin.startAutoSync();try{assert.notEqual(plugin.autoSchedulers.get('git'),plugin.autoSchedulers.get('drive'));const scheduler=plugin.autoSchedulers.get('git');scheduler.pending.add('startup');await scheduler.runTick();plugin.pauseAutoSync();plugin.pauseAutoSync();plugin.restartAutoSync();assert.equal(scheduler.snapshot().startupCycle,'completed');assert.equal(scheduler.snapshot().nextTickAt,null);assert.equal(plugin.autoSchedulers.get('drive').snapshot().startupCycle,'waiting');
 }finally{for(const scheduler of plugin.autoSchedulers.values())scheduler.stop();}
});
test('job cards preserve per-connection expanded details through status updates',async()=>{
 const {Scheduler}=await import('../src/core/scheduler'),base=new Scheduler({queue:fixture().queue,onAutoRetry:()=>{},onAutoTick:()=>{}}).snapshot();const jobs=[{jobId:'job:a',connectionId:'a',name:'A',kind:'git' as const,configuredAuto:'off' as const,schedule:base},{jobId:'job:b',connectionId:'b',name:'B',kind:'gdrive' as const,configuredAuto:'off' as const,schedule:base}];
 const f=pop({...state(),jobs},last),details=Array.from(f.box.querySelectorAll<HTMLDetailsElement>('.sync-job-card'));details[1].open=true;f.view.update({...state(),jobs});assert.equal(Boolean(f.box.querySelector<HTMLDetailsElement>('[data-job-id="a"]')!.open),false);assert.equal(f.box.querySelector<HTMLDetailsElement>('[data-job-id="b"]')!.open,true);
});
test('journal reload retains bounded per-source outcomes and history renders without current automatic settings',async()=>{
 const {FileJournal}=await import('../src/core/journal'),{jobHistory}=await import('../src/ui/job-cards');dom();let raw:string|null=null;
 const jobs=Array.from({length:103},(_,i)=>({jobId:'job:'+i,connectionId:String(i),name:'Source '+i,kind:'git' as const,runId:'run',activity:'idle' as const,outcome:i?'success' as const:'partial' as const,downloaded:i?1:2,uploaded:0,deleted:0,failed:i?0:1,pending:i?0:1,attention:0,startedAt:1,completedAt:2,issues:i?[]:[{code:'network',message:'Offline',scope:'source' as const,stage:'manifest' as const,retryable:true}]}));
 const store=new FileJournal({read:async()=>raw,write:async value=>{raw=value;}});await store.append({...last,jobResults:jobs});assert.equal(JSON.parse(raw!)[0].jobResults.length,100);const history=(await store.load())[0];assert.equal(history.jobResultsTotal,103);assert.equal(history.jobResults![0].outcome,'partial');
 const rendered=jobHistory(history.jobResults!,history.jobResultsTotal);assert.match(rendered.textContent??'',/Source 0.*Partially completed.*Offline/);assert.match(rendered.textContent??'',/100 \/ 103/);assert(!/At startup|Every hour|Automatic/.test(rendered.textContent??''));
 const f=pop({...state(),status:'error'},history);assert(f.box.querySelector('.sync-job-history'));assert.match(f.box.querySelector('.sync-job-history')!.textContent??'',/Source 0/);
});
