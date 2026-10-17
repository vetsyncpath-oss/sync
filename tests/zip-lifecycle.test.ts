import test from 'node:test';
import assert from 'node:assert/strict';
import { ZipUrlSource } from '../src/sources/zip-url-source';
import { BufferArchiveReader } from '../src/core/archive';
import { crc32Hex } from '../src/core/hasher';
import { SyncFault } from '../src/core/sync-issue';
import { ab, deferred, str } from './helpers';
import type { RandomAccessReader, RemoteEntry } from '../src/sources/types';
const bytes=()=>Uint8Array.from(Buffer.from('UEsDBBQAAAAAACWrSF3xCA2bBAAAAAQAAAAEAAAAYS5tZEFBQUFQSwECFAMUAAAAAAAlq0hd8QgNmwQAAAAEAAAABAAAAAAAAAAAAAAAgAEAAAAAYS5tZFBLBQYAAAAAAQABADIAAAAmAAAAAAA=','base64')).buffer;
const remote:RemoteEntry={path:'a.md',size:4,hashAlg:'crc32',hash:crc32Hex(ab('AAAA'))};
const signal=()=>new AbortController().signal;
const code=(expected:string)=>(e:unknown)=>e instanceof SyncFault&&e.code===expected;
function reader(){const inner=new BufferArchiveReader(bytes());let disposals=0;return {reader:{size:()=>inner.size(),read:(o:number,l:number)=>{assert.equal(disposals,0,'reader already disposed');return inner.read(o,l);},dispose:async()=>{disposals++;}} as RandomAccessReader,disposals:()=>disposals};}

test('B43 concurrent cold fetch shares exactly one archive opening',async()=>{
 const held=deferred(),entered=deferred();let downloads=0;const readers:ReturnType<typeof reader>[]=[];
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>{downloads++;entered.resolve();await held.promise;const r=reader();readers.push(r);return r.reader;}}});
 const a=source.fetch(remote,signal()),b=source.fetch(remote,signal());await entered.promise;held.resolve();
 assert.deepEqual((await Promise.all([a,b])).map(str),['AAAA','AAAA']);await source.forceDispose();
 assert.equal(downloads,1);assert(readers.every(r=>r.disposals()===1));
});
for(const ttl of [0,60000])test(`B43 dispose during opening rejects late publication (TTL=${ttl})`,async()=>{
 const held=deferred<RandomAccessReader>(),entered=deferred();const r=reader();
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',sessionTtlMs:ttl,downloader:{download:async()=>{entered.resolve();return held.promise;}}});
 const pending=source.getManifest(signal());const rejection=assert.rejects(pending);await entered.promise;await source.dispose();held.resolve(r.reader);await rejection;
 assert.equal(r.disposals(),1);assert.equal(source.hasActiveSessionLease,false);await source.forceDispose();assert.equal(r.disposals(),1);
});
test('B43 concurrent manifest is explicitly busy and does not invalidate first observer',async()=>{
 const held=deferred<RandomAccessReader>(),entered=deferred();let downloads=0;const r=reader();
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>{downloads++;entered.resolve();return held.promise;}}});
 const first=source.getManifest(signal());await entered.promise;const second=assert.rejects(source.getManifest(signal()),code('observation-busy'));held.resolve(r.reader);
 await second;assert.equal((await first).length,1);await source.forceDispose();assert.equal(downloads,1);assert.equal(r.disposals(),1);
});
test('B43 cancelled waiter does not cancel the shared download for another waiter',async()=>{
 const held=deferred(),entered=deferred();let downloads=0;let downloadSignal:AbortSignal|undefined;const r=reader();
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async(_url,opts)=>{downloads++;downloadSignal=opts.signal;entered.resolve();await held.promise;return r.reader;}}});
 const cancelled=new AbortController(),a=source.fetch(remote,cancelled.signal),b=source.fetch(remote,signal());const rejection=assert.rejects(a);
 await entered.promise;cancelled.abort();await Promise.resolve();held.resolve();await rejection;assert.equal(str(await b),'AAAA');
 assert.equal(downloads,1);assert.equal(downloadSignal?.aborted,false);await source.forceDispose();assert.equal(r.disposals(),1);
});
test('B43 changed URL invalidates cached snapshot rather than returning its bytes',async()=>{
 let url='https://example.test/a.zip';const r=reader();const source=new ZipUrlSource({url:()=>url,downloader:{download:async()=>r.reader}});
 await source.getManifest(signal());url='https://example.test/b.zip';await assert.rejects(source.fetch(remote,signal()),code('source-changed'));
 await source.forceDispose();assert.equal(r.disposals(),1);
});
test('B43 changed URL during opening prevents publication and disposes reader',async()=>{
 let url='https://example.test/a.zip';const held=deferred<RandomAccessReader>(),entered=deferred(),r=reader();
 const source=new ZipUrlSource({url:()=>url,downloader:{download:async()=>{entered.resolve();return held.promise;}}});
 const pending=source.getManifest(signal()),rejection=assert.rejects(pending,code('source-changed'));await entered.promise;url='https://example.test/b.zip';held.resolve(r.reader);await rejection;assert.equal(r.disposals(),1);
});
test('B43 manifest fingerprint is checked even when expected size matches',async()=>{
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>reader().reader}});
 await source.getManifest(signal());await assert.rejects(source.fetch({...remote,hash:crc32Hex(ab('BBBB'))},signal()),code('source-changed'));await source.forceDispose();
});
test('B43 classifier read failure releases its downloaded reader exactly once',async()=>{
 let disposed=0;const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>({size:()=>100,read:async()=>{throw Error('read failed');},dispose:async()=>{disposed++;}})}});
 await assert.rejects(source.getManifest(signal()),/read failed/);await source.forceDispose();assert.equal(disposed,1);
});
test('B43 forceDispose during extraction defers reader cleanup until extraction settles',async()=>{
 const r=reader(),held=deferred(),entered=deferred();let pause=false;
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>({...r.reader,read:async(o,l)=>{if(pause){pause=false;entered.resolve();await held.promise;}return r.reader.read(o,l);}})}});
 await source.getManifest(signal());pause=true;const pending=source.fetch(remote,signal());const rejection=assert.rejects(pending,code('source-changed'));
 await entered.promise;await source.forceDispose();assert.equal(r.disposals(),0);held.resolve();await rejection;assert.equal(r.disposals(),1);
});

async function settleUntil(predicate:()=>boolean){for(let i=0;i<100&&!predicate();i++)await Promise.resolve();assert(predicate(),'background opening did not settle');}
test('B43 timeout retains unabortable opening and bounds replacement attempts',async()=>{
 const held=deferred<RandomAccessReader>();const old=reader(),fresh=reader();let downloads=0;
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',sessionOpenTimeoutMs:5,downloader:{download:async()=>++downloads===1?held.promise:fresh.reader}});
 const fallback=setTimeout(()=>held.resolve(old.reader),50);
 try {await assert.rejects(source.fetch(remote,signal()),code('archive-open-timeout'));}finally{clearTimeout(fallback);}
 await assert.rejects(source.fetch(remote,signal()),code('observation-busy'));assert.equal(downloads,1);
 held.resolve(old.reader);await settleUntil(()=>old.disposals()===1);for(let i=0;i<15;i++)await Promise.resolve();
 assert.equal(str(await source.fetch(remote,signal())),'AAAA');await source.forceDispose();assert.equal(downloads,2);assert.equal(fresh.disposals(),1);
});
test('B43 immediate forceDispose invalidates manifest before physical opening',async()=>{
 let downloads=0;const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>{downloads++;return reader().reader;}}});
 const pending=source.getManifest(signal()),rejection=assert.rejects(pending,code('source-changed'));await source.forceDispose();await rejection;assert.equal(downloads,0);
});
test('B43 cleanup failure keeps reader accounted and explicit dispose retries cleanup',async()=>{
 let attempts=0,downloads=0;const r=reader();
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>{downloads++;return {...r.reader,dispose:async()=>{if(++attempts===1)throw Error('cleanup failed');await r.reader.dispose!();}};}}});
 await source.getManifest(signal());await assert.rejects(source.forceDispose(),/cleanup failed/);
 await assert.rejects(source.fetch(remote,signal()),code('observation-busy'));assert.equal(downloads,1);
 await source.forceDispose();assert.equal(attempts,2);assert.equal(r.disposals(),1);
});
test('B43 failed opening can be retried without a cached rejected promise',async()=>{
 let calls=0;const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>{if(++calls===1)throw Error('download failed');return reader().reader;}}});
 await assert.rejects(source.getManifest(signal()),/download failed/);assert.equal((await source.getManifest(signal())).length,1);await source.forceDispose();assert.equal(calls,2);
});
test('B43 progress from disposed opening cannot update later observation',async()=>{
 const held=deferred<RandomAccessReader>(),entered=deferred();let progress:((p:{bytesTransferred:number;totalBytes:number|null})=>void)|undefined,calls=0,events=0;
 const old=reader(),fresh=reader();
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async(_url,options)=>{if(++calls===1){progress=options.onProgress;entered.resolve();return held.promise;}return fresh.reader;}}});
 const pending=source.getManifest(signal()),rejection=assert.rejects(pending);await entered.promise;await source.forceDispose();held.resolve(old.reader);await rejection;
 await settleUntil(()=>old.disposals()===1);for(let i=0;i<15;i++)await Promise.resolve();
 await source.getManifest(signal(),()=>{events++;});const before=events;progress?.({bytesTransferred:999,totalBytes:999});assert.equal(events,before);await source.forceDispose();
});
test('B43 concurrent forceDispose shares one physical reader cleanup',async()=>{
 const r=reader(),held=deferred(),entered=deferred();let disposals=0;
 const source=new ZipUrlSource({url:()=> 'https://example.test/a.zip',downloader:{download:async()=>({...r.reader,dispose:async()=>{disposals++;entered.resolve();await held.promise;await r.reader.dispose!();}})}});
 await source.getManifest(signal());const first=source.forceDispose();await entered.promise;const second=source.forceDispose();held.resolve();await Promise.all([first,second]);assert.equal(disposals,1);assert.equal(r.disposals(),1);
});
