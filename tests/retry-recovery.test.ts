import test from 'node:test';
import assert from 'node:assert/strict';
import { ManifestCache } from '../src/core/manifest-cache';
import { FetchTransport } from '../src/adapters/fetch-transport';
import { NetLayer, NetError } from '../src/core/net';
import { FailedQueue } from '../src/core/queue';
import { YandexSource } from '../src/sources/yandex-source';
import { RoutedSource } from '../src/sources/routed-source';
import { Scheduler } from '../src/core/scheduler';
import { ab, str, entry, fixture, fsMemory, deferred } from './helpers';

function noReplace(){const memory=fsMemory(),rename=memory.fs.rename;memory.fs.rename=async(a,b)=>{if(memory.files.has(b))throw Error('Destination file already exists!');await rename(a,b);};return memory;}
test('manifest checkpoints, reset and restore work without rename-overwrite',async()=>{
 const m=noReplace(),c=new ManifestCache(m.fs,'test');c.set('a',{h:'old',s:1,alg:'sha256'});await c.flush();await c.flush();await c.reset();await c.restoreBackup();assert.equal(c.get('a')?.h,'old');await c.reset();await c.restoreBackup();assert.equal(c.get('a')?.h,'old');
});
for(const operation of ['write','remove','rotate','publish'])for(const after of [false,true])test(`cache recovers after interruption ${after?'after':'before'} ${operation}`,async()=>{
 const m=noReplace(),c=new ManifestCache(m.fs,'test');c.set('a',{h:'old',s:1,alg:'sha256'});await c.flush();await c.flush();
 const write=m.fs.write,remove=m.fs.remove,rename=m.fs.rename;let fired=false;
 const interrupt=async(match:boolean,action:()=>Promise<void>)=>{if(match&&!fired){fired=true;if(after)await action();throw Error('interrupted');}await action();};
 m.fs.write=(p,v)=>interrupt(operation==='write',()=>write(p,v));m.fs.remove=p=>interrupt(operation==='remove',()=>remove(p));
 m.fs.rename=(a,b)=>interrupt(operation===(b.endsWith('.previous')?'rotate':'publish'),()=>rename(a,b));
 c.set('a',{h:'new',s:1,alg:'sha256'});await assert.rejects(c.flush(),/interrupted/);assert(fired);
 m.fs.write=write;m.fs.remove=remove;m.fs.rename=rename;
 const reopened=new ManifestCache(m.fs,'test');await reopened.load();assert(['old','new'].includes(reopened.get('a')!.h));await reopened.flush();
});
test('checkpoint failure is session failure, not a failed download of an applied file',async()=>{
 const f=fixture([entry('a.md'),entry('b.md')]);f.deps.options.concurrency=1;f.deps.options.checkpointInterval=1;
 const write=f.memory.fs.write;f.memory.fs.write=async(p,v)=>{if(p.startsWith('manifest-'))throw Error('Destination file already exists!');await write(p,v);};
 const result=await f.coordinator.sync();assert.equal(result?.outcome,'error');assert.equal(str(f.files.get('a.md')!),'REMOTE');assert(!f.files.has('b.md'));assert.equal(f.queue.size(),0);
});
for(const phase of ['headers','body'] as const)test(`internal ${phase} timeout is diagnosed separately from session cancellation`,async t=>{
 let attempts=0;const external=new AbortController();
 t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{
  attempts++;const stalled=()=>new Promise<never>((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  if(phase==='headers')return stalled();
  return {status:200,headers:new Headers(),arrayBuffer:stalled} as any;
 });
 await assert.rejects(new NetLayer(new FetchTransport({timeoutMs:5,bodyTimeoutMs:5})).fetchBuffer('https://example.test',{signal:external.signal,retries:3,retryBackoffMs:[0]}),(e:any)=>e instanceof NetError&&!e.aborted&&e.message.includes(`timeout during ${phase}`));
 assert.equal(attempts,3);assert.equal(external.signal.aborted,false);
});
test('user cancellation makes one attempt and remains cancellation',async t=>{
 let attempts=0;const external=new AbortController();t.mock.method(globalThis,'fetch',async()=>{attempts++;external.abort();throw new DOMException('cancelled','AbortError');});
 await assert.rejects(new NetLayer(new FetchTransport()).fetchBuffer('https://example.test',{signal:external.signal,retries:3,retryBackoffMs:[0]}),(e:any)=>e.aborted===true);assert.equal(attempts,1);
});
test('transient retries spread out, respect server delay and do not become permanently poisoned',()=>{
 const q=new FailedQueue({maxRetries:1}),e=entry('a');let now=0;
 for(const delay of [60000,300000,900000,3600000,21600000,21600000]){q.add(e,'timeout',now,'transient');const item=q.all()[0];assert(!item.poisoned);assert(item.nextRetryAt>=now+delay&&item.nextRetryAt<=now+delay*1.2);now=item.nextRetryAt;}
 q.add(e,'429',now,'transient',30_000_000);assert(q.all()[0].nextRetryAt>=now+30_000_000);
 q.add(e,'write denied',now,'blocked');assert.equal(q.takeDue(Number.MAX_SAFE_INTEGER).length,0);
});
test('Retry-After HTTP-date survives rate-limit exhaustion as deferred retry metadata',async()=>{
 const date=new Date(Date.now()+120000).toUTCString();const net=new NetLayer({fetch:async()=>({status:429,headers:{'retry-after':date},arrayBuffer:async()=>ab(''),text:async()=>''})});
 await assert.rejects(net.fetchBuffer('https://example.test',{retries:1}),(e:any)=>e.status===429&&e.retryAfterMs>118000&&e.retryAfterMs<=120000);
});
test('automatic retry never opens manual confirmation or conflict dialogs',async()=>{
 const f=fixture([entry('a.md')]);f.own('a.md','OLD');f.files.set('a.md',ab('EDIT'));f.queue.add(entry('a.md'),'offline',0);
 f.ui.confirmRetry=async()=>{throw Error('manual retry dialog');};f.ui.confirmSync=async()=>{throw Error('manual sync dialog');};
 f.coordinator.setSyncPolicy({version:1,mirror:false,folders:[],fileRules:[{scope:'vault',path:'',write:'changes',conflict:'ask'}]});
 const result=await f.coordinator.retryFailed('auto');assert.equal(str(f.files.get('a.md')!),'EDIT');assert.equal(result?.deferredConflicts,1);
});
test('scheduler serializes automatic ticks and does not race a second retry session',async()=>{
 let timer=()=>{},interval=()=>{},calls=0,retries=0;const release=deferred();const queue=new FailedQueue();queue.add(entry('a'),'offline',0);
 const scheduler=new Scheduler({queue,onAutoTick:async()=>{calls++;await release.promise;},onAutoRetry:()=>{retries++;},setTimeout:fn=>{timer=fn;return 1;},setInterval:fn=>{interval=fn;return 2;},clearTimeout:()=>{},clearInterval:()=>{}});
 scheduler.start('15m',0);timer();interval();assert.equal(calls,1);assert.equal(retries,0);release.resolve();for(let i=0;i<3;i++)await Promise.resolve();interval();assert.equal(calls,2);scheduler.stop();
});
for(const trigger of ['manual','auto'] as const)for(const mode of ['preserve','create','update','remote','changes'] as const)for(const state of ['missing','unknown','clean','edited'] as const)test(`${trigger} ${mode} protects expected ${state} local state`,async()=>{
 const f=fixture([entry('a.md')]);if(state==='unknown')f.files.set('a.md',ab('LOCAL'));if(state==='clean'||state==='edited')f.own('a.md','OLD');if(state==='edited')f.files.set('a.md',ab('EDIT'));
 f.coordinator.setSyncPolicy({version:1,mirror:false,folders:[],fileRules:[{scope:'vault',path:'',write:mode,conflict:'keep-both',delete:'keep'}]});
 await f.coordinator.sync({trigger});
 const applies=mode!=='preserve'&&(state==='missing'||mode==='remote'||mode==='changes'||(mode==='update'&&state==='clean'));
 const expected=applies?'REMOTE':state==='missing'?undefined:state==='unknown'?'LOCAL':state==='edited'?'EDIT':'OLD';
 assert.equal(f.files.has('a.md')?str(f.files.get('a.md')!):undefined,expected);
});

test('manual retry can recover a blocked file after repair without force-overwrite',async()=>{
 const f=fixture([entry('a.md')]);f.queue.add(entry('a.md'),'write failure',0,'blocked');let asked=0;f.ui.confirmRetry=async()=>{asked++;return true;};
 assert.equal((await f.coordinator.retryFailed())?.outcome,'ok');assert.equal(asked,1);assert.equal(str(f.files.get('a.md')!),'REMOTE');assert.equal(f.queue.size(),0);
});
test('manual retry of blocked files still respects preserve rules',async()=>{
 const f=fixture([entry('a.md')]);f.files.set('a.md',ab('PERSONAL'));f.queue.add(entry('a.md'),'old failure',0,'blocked');
 f.coordinator.setSyncPolicy({version:1,mirror:false,folders:[],fileRules:[{scope:'vault',path:'',write:'preserve'}]});await f.coordinator.retryFailed();assert.equal(str(f.files.get('a.md')!),'PERSONAL');
});

test('Yandex renews an expired download link and routed execution preserves its concurrency cap',async()=>{
 let hrefs=0;const yandex=new YandexSource({publicKey:()=> 'https://disk.yandex.ru/d/example',transport:{fetch:async(url)=>{
  let status=200,body:string;
  if(url.includes('/public/resources/download'))body=JSON.stringify({href:`https://download.example/${++hrefs}`});
  else if(url==='https://download.example/1'){status=403;body='expired';}
  else if(url==='https://download.example/2')body='REMOTE';
  else body=JSON.stringify({type:'dir',_embedded:{total:1,items:[{type:'file',name:'a.md',path:'/a.md',size:6,sha256:entry('a.md').hash}]}});
  return {status,headers:{},arrayBuffer:async()=>ab(body),text:async()=>body};
 }}});
 const source=new RoutedSource([{id:'disk',name:'Disk',source:yandex}],[],p=>p,'disk');assert.equal(source.maxConcurrentDownloads,2);
 const manifest=await source.getManifest(new AbortController().signal);assert.equal(str(await source.fetch(manifest[0],new AbortController().signal)),'REMOTE');assert.equal(hrefs,2);await source.dispose();
});
test('Yandex shared rate-limit cooldown blocks other requests and remains cancellable',async()=>{
 let calls=0;const first=new AbortController(),second=new AbortController();const source=new YandexSource({publicKey:()=> 'https://disk.yandex.ru/d/example',onRateLimitWait:()=>first.abort(),transport:{fetch:async()=>{calls++;return {status:429,headers:{'retry-after':'60'},arrayBuffer:async()=>ab(''),text:async()=>''};}}});
 await assert.rejects(source.getManifest(first.signal),(e:any)=>e.aborted===true);
 const waiting=source.getManifest(second.signal);await Promise.resolve();assert.equal(calls,1);second.abort();await assert.rejects(waiting,(e:any)=>e.aborted===true);assert.equal(calls,1);
});
