import test from 'node:test';
import assert from 'node:assert/strict';
import { YandexSource, type YandexSourceOptions } from '../src/sources/yandex-source';
import { SyncFault, syncIssue } from '../src/core/sync-issue';
import { ab, deferred, entry, fixture } from './helpers';

const folder = (path:string, name=path.split('/').pop() || 'root') => ({type:'dir',path,name});
const file = (path:string, name=path.split('/').pop()!) => ({type:'file',path,name,size:6,sha256:entry(name).hash});
const page = (items:unknown[], total=items.length, extra:Record<string,unknown>={}) => ({type:'dir',path:'/',_embedded:{items,total,...extra}});
function provider(list:(path:string|null, offset:number, calls:number)=>unknown|Promise<unknown>, options:Partial<YandexSourceOptions>={}) {
  const calls:Array<{path:string|null;offset:number}>=[];
  const source = new YandexSource({publicKey:()=> 'fixture-public-key',...options,transport:{fetch:async url=>{
    const u=new URL(url),path=u.searchParams.get('path'),offset=Number(u.searchParams.get('offset')||0);calls.push({path,offset});
    // Bound regressions independently of the production traversal: no hanging test on old code.
    const body=calls.length>20?{status:400}:await list(path,offset,calls.length);
    const status=(body as {status?:number})?.status??200;
    return {status,headers:{},arrayBuffer:async()=>ab(JSON.stringify(body)),text:async()=>JSON.stringify(body)};
  }}});
  return {source,calls};
}
const code=(expected:string)=>(error:unknown)=>error instanceof SyncFault && error.code===expected;
const signal=()=>new AbortController().signal;

for(const rootPath of [true,false]) test(`B44 traversal rejects directory-only cycle (root path advertised=${rootPath})`,async()=>{
  const p=provider(path=>path===null?{...page([folder('/loop')]),...(rootPath?{path:'/'}:{path:undefined})}:page([folder('/loop')]));
  await assert.rejects(p.source.getManifest(signal()),code('inventory-unstable'));
  assert.equal(p.calls.length,2);
});
test('B44 root back-edge cannot be treated as an empty successful subtree',async()=>{
  const p=provider(()=>page([folder('/','again')]));
  await assert.rejects(p.source.getManifest(signal()),code('inventory-unstable'));assert.equal(p.calls.length,1);
});
for(const type of ['file','dir'] as const) test(`B44 duplicate ${type} identity is unstable, not first/last wins`,async()=>{
  const item=type==='dir'?folder('/same'):file('/same');
  const p=provider(path=>path===null?page([item,{...item,name:'alias'}]):page([]));
  await assert.rejects(p.source.getManifest(signal()),code('inventory-unstable'));assert.equal(p.calls.length,1);
});
for(const limit of ['maxNodes','maxFolders','maxObservations'] as const) test(`B44 ${limit} counts root and directories before expansion`,async()=>{
  const p=provider(path=>path===null?page([folder('/a'),folder('/b')]):page([]),{inventoryLimits:{[limit]:2}});
  await assert.rejects(p.source.getManifest(signal()),code('inventory-limit'));assert.equal(p.calls.length,1);
});
test('B44 file-only root is bounded even when there is no folder queue',async()=>{
  const p=provider(()=>page([file('/a'),file('/b')]),{inventoryLimits:{maxNodes:2}});
  await assert.rejects(p.source.getManifest(signal()),code('inventory-limit'));assert.equal(p.calls.length,1);
});
for(const value of [0,-1,1.5,Infinity,NaN]) test(`B44 invalid inventory limit ${value} is rejected before requests`,()=>{
  assert.throws(()=>provider(()=>page([]),{inventoryLimits:{maxNodes:value}}),/inventory limit/i);
});
for(const bad of [page([],1),page([file('/a')],0),page([],0.5),page([],NaN),page(Array.from({length:201},(_,i)=>file('/'+i))),page([],0,{offset:200}),page([],0,{limit:1})]) {
  test(`B44 invalid pagination cannot produce a complete manifest: ${JSON.stringify(bad._embedded).slice(0,90)}`,async()=>{
    const p=provider(()=>bad);
    await assert.rejects(p.source.getManifest(signal()),code('inventory-unstable'));assert.equal(p.calls.length,1);
  });
}
test('B44 changed total across pages rejects the entire observation',async()=>{
  const p=provider((_path,offset)=>offset===0?page(Array.from({length:200},(_,i)=>file('/'+i)),201):page([file('/last')],202));
  await assert.rejects(p.source.getManifest(signal()),code('inventory-unstable'));assert.equal(p.calls.length,2);
});
test('B44 stable pagination and exact budgets preserve complete BFS inventory',async()=>{
  const p=provider((path,offset)=>path===null?(offset===0?page(Array.from({length:200},(_,i)=>file('/'+i)),201,{offset:0,limit:200}):page([folder('/sub')],201,{offset:200,limit:200})):page([file('/sub/child')]),{inventoryLimits:{maxNodes:203,maxFolders:2,maxObservations:203}});
  const result=await p.source.getManifest(signal());assert.equal(result.length,201);assert.equal(result.at(-1)?.path,'sub/child');
  assert.deepEqual(p.calls,[{path:null,offset:0},{path:null,offset:200},{path:'/sub',offset:0}]);
});
test('B44 failed refresh exposes neither previous nor partial provider path maps to fetch',async()=>{
  let attempt=0;
  const p=provider(path=>{if(path===null){attempt++;return attempt===1?page([file('/old')]):page([file('/partial'),folder('/bad')]);}return {status:403};});
  const old=(await p.source.getManifest(signal()))[0];
  await assert.rejects(p.source.getManifest(signal()));const count=p.calls.length;
  await assert.rejects(p.source.fetch(old,signal()),code('inventory-unavailable'));
  await assert.rejects(p.source.fetch(entry('partial'),signal()),code('inventory-unavailable'));
  assert.equal(p.calls.length,count);
});
for(const nested of [false,true]) test(`B44 access error preserves status and identifies ${nested?'nested folder':'root'}`,async()=>{
  const p=provider(path=>nested&&path===null?page([folder('/private')]):{status:403});
  await assert.rejects(p.source.getManifest(signal()),error=>{
    const issue=syncIssue(error,'manifest');return issue.code===(nested?'inventory-unavailable':'public-link-invalid')&&issue.status===403&&issue.scope==='source';
  });
});
test('B44 concurrent manifest call is explicit and cannot reset first observation',async()=>{
  const held=deferred<unknown>(),entered=deferred();
  const p=provider(()=>{entered.resolve();return held.promise;});
  const first=p.source.getManifest(signal());await entered.promise;
  const second=assert.rejects(p.source.getManifest(signal()),code('observation-busy'));
  held.resolve(page([file('/a')]));await second;
  assert.equal((await first)[0].path,'a');assert.equal(p.calls.length,1);
});
test('B44 cancellation observed while consuming a page prevents publication',async()=>{
  const controller=new AbortController();let calls=0;
  const p=provider(()=>page([file('/a')])) ;
  await assert.rejects(p.source.getManifest(controller.signal,()=>{if(++calls>1)controller.abort();}));
  const count=p.calls.length;await assert.rejects(p.source.fetch(entry('a'),signal()));assert.equal(p.calls.length,count);
});
test('B44 coordinator performs no local effects when provider inventory is cyclic',async()=>{
  const p=provider(path=>path===null?page([file('/new'),folder('/loop')]):page([folder('/loop')]));
  const f=fixture([], 'full');f.own('old.md');f.deps.source=p.source;
  const result=await f.coordinator.sync();
  assert.equal(result?.outcome,'error');assert.equal(result?.downloaded,0);assert.equal(result?.deleted,0);
  assert(result?.problems?.some(issue=>issue.code==='inventory-unstable'));
  assert(f.files.has('old.md'));assert(!f.files.has('new'));assert.deepEqual(f.operations,[]);
});

test('B44 recovery after an invalid observation starts with a fresh traversal',async()=>{
  let broken=true;
  const p=provider(()=>broken?page([folder('/')]):page([file('/a')]));
  await assert.rejects(p.source.getManifest(signal()),code('inventory-unstable'));
  broken=false;
  assert.equal((await p.source.getManifest(signal()))[0].path,'a');
  assert.equal((await p.source.getManifest(signal()))[0].path,'a');
});
for(const force of [false,true]) test(`B44 late observation cannot publish after ${force?'forceDispose':'dispose'}`,async()=>{
  const held=deferred<unknown>(),entered=deferred();let wait=true;
  const p=provider(()=>{entered.resolve();return wait?held.promise:page([file('/a')]);});
  const pending=p.source.getManifest(signal());await entered.promise;
  if(force)await p.source.forceDispose();else await p.source.dispose();
  held.resolve(page([file('/a')]));await assert.rejects(pending,code('inventory-unavailable'));
  const count=p.calls.length;await assert.rejects(p.source.fetch(entry('a'),signal()),code('inventory-unavailable'));assert.equal(p.calls.length,count);
  wait=false;assert.equal((await p.source.getManifest(signal()))[0].path,'a');
});
test('B44 new manifest clears prior download href even for the same local path',async()=>{
  let hrefRequests=0;
  const downloads:string[]=[];
  const source=new YandexSource({publicKey:()=> 'fixture-public-key',transport:{fetch:async url=>{
    const u=new URL(url);let body:ArrayBuffer;
    if(u.hostname==='content.example'){downloads.push(url);body=ab('REMOTE');}
    else if(u.pathname.endsWith('/download')){hrefRequests++;body=ab(JSON.stringify({href:`https://content.example/${hrefRequests}`}));}
    else body=ab(JSON.stringify(page([file('/a')])));
    return {status:200,headers:{},arrayBuffer:async()=>body,text:async()=>''};
  }}});
  let manifest=await source.getManifest(signal());await source.fetch(manifest[0],signal());
  manifest=await source.getManifest(signal());await source.fetch(manifest[0],signal());
  assert.equal(hrefRequests,2);assert.deepEqual(downloads,['https://content.example/1','https://content.example/2']);
});
