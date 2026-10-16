import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { md5Hex } from '../src/core/md5';
import { GoogleDriveClient, DRIVE_FOLDER } from '../src/sources/gdrive-client';
import { GDriveOAuthSource } from '../src/sources/gdrive-oauth-source';
import { validateBrowseSnapshot } from '../src/sources/remote-browse';
import { authorizeGoogleDesktop } from '../src/adapters/google-desktop-oauth';
import { NodeHttpTransport } from '../src/adapters/host-transport';
import type { NetResponse, NetTransport } from '../src/sources/types';
const response=(status:number,value:unknown,headers:Record<string,string>={}):NetResponse=>({status,headers,text:async()=>JSON.stringify(value),arrayBuffer:async()=>new ArrayBuffer(0)});
const file=(id:string,name:string,size=4)=>({id,name,size:String(size),version:'1',parents:['root-id'],mimeType:'text/markdown'});
test('public Drive properties are requested, bounded and compared across repeated inventory observations',async()=>{
    let page=0;const client=new GoogleDriveClient({fetch:async url=>{assert(new URL(url).searchParams.get('fields')?.includes('properties'));
        if(new URL(url).pathname.endsWith('/root-id'))return response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'});
        return response(200,{files:[{...file('same','a.md'),properties:{vetsync_artifact:page?'2':'1'}}],...(page++===0?{nextPageToken:'next'}:{})});}});
    const snapshot=await client.inventory('root-id',new AbortController().signal);assert.equal(snapshot.completeness,'unstable');assert.equal(snapshot.diagnostics[0].code,'inconsistent-object');
    for(const properties of [{bad:42},{bad:'x'.repeat(125)},Array(101).fill('x')]){
        const bad=new GoogleDriveClient({fetch:async()=>response(200,{...file('bad','a.md'),properties})});
        await assert.rejects(()=>bad.inspect('bad',new AbortController().signal),(e:any)=>e.code==='response-format');
    }
});

test('empty or missing generated IDs cannot authorize an upload without a stable reservation',async()=>{
    for(const ids of [undefined,[],[''],[' '],[null],['one','two']]){
        const client=new GoogleDriveClient({fetch:async()=>response(200,{ids})});await assert.rejects(()=>client.reserveId(new AbortController().signal),(e:any)=>e.code==='response-format');
    }
});
test('Drive MD5 verification matches independent Node implementation including padding boundaries',()=>{
    for(const size of [0,1,3,55,56,63,64,65,1025]){
        const data=Uint8Array.from({length:size},(_,i)=>i%251);
        assert.equal(md5Hex(data.buffer),createHash('md5').update(data).digest('hex'));
    }
});
test('raw inventory reads all pages; execution rejects ambiguous trees',async()=>{
    let pages=0;
    const transport:NetTransport={fetch:async(url)=>new URL(url).pathname.endsWith('/root-id')?
        response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):
        response(200,{files:[file(String(++pages),pages===1?'a.md':'b.md')],...(pages===1?{nextPageToken:'next'}:{})})};
    const client=new GoogleDriveClient(transport);const result=await client.inventory('root-id',new AbortController().signal);
    assert.equal(result.items.length,2);assert.equal(pages,2);
    const duplicate:NetTransport={fetch:async(url)=>new URL(url).pathname.endsWith('/root-id')?
        response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):response(200,{files:[file('1','a.md'),file('2','A.md')]})};
    const ambiguous=new GoogleDriveClient(duplicate),snapshot=await ambiguous.inventory('root-id',new AbortController().signal);
    assert.equal(snapshot.items.length,2);assert.equal(snapshot.diagnostics[0].code,'target-alias');
    await assert.rejects(()=>new GDriveOAuthSource(ambiguous,'root-id').getManifest(new AbortController().signal),/IDs 1, 2/);
    await assert.rejects(()=>new GoogleDriveClient({fetch:async()=>response(200,{incompleteSearch:true,files:[]})}).listChildren('root-id',new AbortController().signal),/incomplete/);
});

test('identical repeated IDs across pages are one object; differing versions remain unstable',async()=>{
    for(const unstable of [false,true]){
        let pages=0;const client=new GoogleDriveClient({fetch:async url=>new URL(url).pathname.endsWith('/root-id')?
            response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):
            response(200,{files:[{...file('only','a.md'),version:unstable&&pages?'2':'1'}],...(pages++===0?{nextPageToken:'next'}:{})})});
        const source=new GDriveOAuthSource(client,'root-id'),snapshot=await source.getBrowseSnapshot(new AbortController().signal);
        validateBrowseSnapshot(snapshot);assert.equal(snapshot.nodes.length,1);assert.equal(snapshot.completeness,unstable?'unstable':'complete');
        assert.equal(snapshot.diagnostics[0].code,unstable?'inconsistent-object':'repeated-object');
        if(unstable)await assert.rejects(()=>source.getManifest(new AbortController().signal),(e:any)=>e.code==='inventory-unstable');
        else assert.equal((await source.getManifest(new AbortController().signal)).length,1);
    }
});

test('duplicate folders retain different children and unsafe names remain browsable',async()=>{
    const children:any={
        'root-id':[{...file('one','Shared'),mimeType:DRIVE_FOLDER},{...file('two','Shared'),mimeType:DRIVE_FOLDER},file('unsafe','literal/slash.md')],
        one:[{...file('a','a.md'),parents:['one']}],two:[{...file('b','b.md'),parents:['two']}],
    };
    const client=new GoogleDriveClient({fetch:async url=>{
        const u=new URL(url);return u.pathname.endsWith('/root-id')?response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):
            response(200,{files:children[u.searchParams.get('q')!.match(/'([^']+)' in parents/)![1]]});
    }});
    const source=new GDriveOAuthSource(client,'root-id'),snapshot=await source.getBrowseSnapshot(new AbortController().signal);
    validateBrowseSnapshot(snapshot);assert.equal(snapshot.nodes.length,5);assert.notEqual(snapshot.nodes[0].key,snapshot.nodes[1].key);
    assert(snapshot.nodes.find(n=>n.objectId==='unsafe')?.blocked);assert(snapshot.nodes.find(n=>n.objectId==='b')?.blocked);
    assert.equal(snapshot.nodes.find(n=>n.objectId==='b')?.parentKey,snapshot.nodes.find(n=>n.objectId==='two')?.key);
    await assert.rejects(()=>source.getManifest(new AbortController().signal),/IDs one, two/);
});

test('excluded Google-native duplicate does not collide with a supported execution file',async()=>{
    const client=new GoogleDriveClient({fetch:async url=>new URL(url).pathname.endsWith('/root-id')?
        response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):
        response(200,{files:[file('binary','a.md'),{...file('doc','a.md'),mimeType:'application/vnd.google-apps.document'}]})});
    const source=new GDriveOAuthSource(client,'root-id'),snapshot=await source.getBrowseSnapshot(new AbortController().signal);
    assert.equal(snapshot.nodes.length,2);assert(snapshot.nodes.find(n=>n.objectId==='doc')?.unsupported);
    assert.equal(snapshot.nodes.find(n=>n.objectId==='binary')?.blocked,undefined);
    assert.equal((await source.getManifest(new AbortController().signal)).length,1);
});

test('a disposed Drive run cannot keep an indefinitely stale inventory',async()=>{
    let version='1',lists=0;const client=new GoogleDriveClient({fetch:async url=>new URL(url).pathname.endsWith('/root-id')?
        response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):
        response(200,{files:[{...file('one','a.md'),version}],counter:++lists})});
    const source=new GDriveOAuthSource(client,'root-id');await source.getManifest(new AbortController().signal);assert.equal(lists,1);
    await source.dispose();version='2';await source.getManifest(new AbortController().signal);assert.equal(lists,2);assert.equal(source.inventorySnapshot!.items[0].file.version,'2');
});

test('Drive normalizes checksum case before exposing metadata',async()=>{
    const hash='AB'.repeat(32),client=new GoogleDriveClient({fetch:async()=>response(200,{...file('id','a.md'),sha256Checksum:hash,md5Checksum:'CD'.repeat(16)})});
    const metadata=await client.inspect('id',new AbortController().signal);assert.equal(metadata.sha256Checksum,hash.toLowerCase());assert.equal(metadata.md5Checksum,'cd'.repeat(16));
});
test('checksum normalization preserves legacy opaque MD5 pull tokens',async()=>{
    const token='AB'.repeat(16),client=new GoogleDriveClient({fetch:async url=>new URL(url).pathname.endsWith('/root-id')?
        response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):response(200,{files:[{...file('id','a.md'),md5Checksum:token}]})});
    const source=new GDriveOAuthSource(client,'root-id'),entries=await source.getManifest(new AbortController().signal);
    assert.equal(entries[0].hashAlg,'weak');assert.equal(entries[0].hash,'gdrive:'+token);
    assert.equal(source.inventorySnapshot?.items[0].file.md5Checksum,token.toLowerCase());
});

test('literal separators remain browsable without becoming executable vault paths',async()=>{
    const client=new GoogleDriveClient({fetch:async url=>new URL(url).pathname.endsWith('/root-id')?
        response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):response(200,{files:[file('bad','literal/slash.md')]})});
    const source=new GDriveOAuthSource(client,'root-id'),snapshot=await source.getBrowseSnapshot(new AbortController().signal);
    validateBrowseSnapshot(snapshot);assert.equal(snapshot.nodes[0].name,'literal/slash.md');
    await assert.rejects(()=>source.getManifest(new AbortController().signal),(e:any)=>e.code==='unsafe-name');
});

test('root cycles remain diagnostic browse data and block execution',async()=>{
    const root={id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1',parents:[]};
    const client=new GoogleDriveClient({fetch:async url=>response(200,new URL(url).pathname.endsWith('/root-id')?root:{files:[root]})});
    const source=new GDriveOAuthSource(client,'root-id'),snapshot=await source.getBrowseSnapshot(new AbortController().signal);
    validateBrowseSnapshot(snapshot);assert.equal(snapshot.nodes.length,0);assert.equal(snapshot.diagnostics[0].code,'cycle');
    await assert.rejects(()=>source.getManifest(new AbortController().signal),(e:any)=>e.code==='inventory-unstable');
});
test('few distinct IDs cannot hide an excessive repeated-observation tree',async()=>{
    const root={id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'},one={...file('folder','Folder'),mimeType:DRIVE_FOLDER};
    const client=new GoogleDriveClient({fetch:async url=>{const u=new URL(url);return response(200,u.pathname.endsWith('/root-id')?root:
        {files:u.searchParams.get('q')!.includes("'root-id'")?[one]:Array.from({length:4},()=>({...file('same','a.md'),parents:['folder']}))});}},64*1024*1024,4);
    await assert.rejects(()=>client.inventory('root-id',new AbortController().signal),(e:any)=>e.code==='inventory-incomplete'&&/observation/.test(e.message));
});
test('metadata reads and writes reject a different returned ID; My Drive alias resolves normally',async()=>{
    const client=new GoogleDriveClient({fetch:async()=>response(200,file('different','a.md'))}),signal=new AbortController().signal;
    for(const request of [()=>client.inspect('expected',signal),()=>client.metadata('expected',{trashed:true},signal),()=>client.mkdir('expected','Folder','parent',signal)])
        await assert.rejects(request,(e:any)=>e.code==='response-format');
    assert.equal((await client.inspect('root',signal)).id,'different');
});
test('resumable transfer follows a partial acknowledgement, not bytes sent',async()=>{
    const size=8*1024*1024+1,bytes=new ArrayBuffer(size),ranges:string[]=[],states:number[]=[];
    const transport:NetTransport={fetch:async(_url,request)=>{
        if(request.method==='POST')return response(200,{}, {location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'});
        ranges.push(request.headers!['Content-Range']);
        if(ranges.length===1)return response(308,{}, {range:'bytes=0-4194303'});
        return response(200,{...file('reserved','a.md',size),md5Checksum:md5Hex(bytes)});
    }};
    await new GoogleDriveClient(transport).upload('reserved',{id:'reserved'},bytes,true,new AbortController().signal,async state=>{states.push(state.offset);});
    assert.deepEqual(states,[0,0,4194304,4194304]);assert.equal(ranges[1],`bytes 4194304-${size-1}/${size}`);
});
test('unknown completed upload is queried before replaying bytes',async()=>{
    let requests=0;const headers:string[]=[];
    const client=new GoogleDriveClient({fetch:async(_url,request)=>{requests++;headers.push(request.headers!['Content-Range']);return response(200,file('reserved','a.md',0));}});
    await client.upload('reserved',{},new ArrayBuffer(0),true,new AbortController().signal,async()=>{},
        {url:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',offset:0,size:0,fileId:'reserved'});
    assert.equal(requests,1);assert.deepEqual(headers,['bytes */0']);
});
test('desktop callback ignores wrong state and exchanges the accepted code with PKCE',async()=>{
    let verifier='',redirect='';const controller=new AbortController();
    const transport:NetTransport={fetch:async(url,request)=>{
        if(url.includes('/token')){const fields=new URLSearchParams(String(request.body));verifier=fields.get('code_verifier')!;redirect=fields.get('redirect_uri')!;
            return response(200,{access_token:'ACCESS',refresh_token:'REFRESH',expires_in:3600,scope:'openid https://www.googleapis.com/auth/drive'});}
        return response(200,{sub:'account'});
    }};
    const local=new NodeHttpTransport();
    const grant=await authorizeGoogleDesktop({clientId:'test'},transport,controller.signal,async auth=>{
        const url=new URL(auth),callback=url.searchParams.get('redirect_uri')!,state=url.searchParams.get('state')!;
        const bad=await local.fetch(callback+'?state=wrong&code=bad',{});assert.equal(bad.status,400);await bad.text();
        const good=await local.fetch(callback+`?state=${state}&code=accepted`,{});assert.equal(good.status,200);await good.text();
    },5000);
    assert.equal(grant.subject,'account');assert.equal(verifier.length,43);assert.match(redirect,/^http:\/\/127\.0\.0\.1:\d+\/$/);
});
test('desktop cancellation after token response cannot return a grant',async()=>{
    const controller=new AbortController();
    const transport:NetTransport={fetch:async()=>{controller.abort();return response(200,{access_token:'OLD',refresh_token:'OLD',expires_in:3600,scope:'openid https://www.googleapis.com/auth/drive'});}};
    const local=new NodeHttpTransport();
    await assert.rejects(()=>authorizeGoogleDesktop({clientId:'test'},transport,controller.signal,async auth=>{
        const url=new URL(auth);const result=await local.fetch(url.searchParams.get('redirect_uri')+`?state=${url.searchParams.get('state')}&code=accepted`,{});await result.text();
    },5000),/cancelled|aborted/i);
});
test('unreturned browser sign-in times out and releases its callback listener',async()=>{
    let callback='';const local=new NodeHttpTransport();
    await assert.rejects(()=>authorizeGoogleDesktop({clientId:'test'},{fetch:async()=>{throw Error('No code should be exchanged');}},new AbortController().signal,
        auth=>{const url=new URL(auth);assert.equal(url.origin,'https://accounts.google.com');callback=url.searchParams.get('redirect_uri')!;},500),
        (error:any)=>error.code==='oauth-timeout');
    assert(callback);await assert.rejects(()=>local.fetch(callback,{}));
});
test('token exchange timeout ends sign-in despite a noncancellable network request',async()=>{
    let release!:(value:NetResponse)=>void,userinfo=0;const stages:string[]=[],local=new NodeHttpTransport();
    const transport:NetTransport={fetch:async url=>{if(url.includes('/token'))return new Promise(resolve=>release=resolve);userinfo++;return response(200,{sub:'account'});}};
    await assert.rejects(()=>authorizeGoogleDesktop({clientId:'test'},transport,new AbortController().signal,async auth=>{
        const url=new URL(auth),result=await local.fetch(url.searchParams.get('redirect_uri')+`?state=${url.searchParams.get('state')}&code=accepted`,{});await result.text();
    },{timeoutMs:5000,exchangeTimeoutMs:25,observe:event=>stages.push(event.stage)}),(error:any)=>error.code==='network'&&error.retryable);
    release(response(200,{access_token:'LATE',refresh_token:'LATE',expires_in:3600,scope:'openid https://www.googleapis.com/auth/drive'}));
    for(let i=0;i<8;i++)await Promise.resolve();assert.equal(userinfo,0);assert.deepEqual(stages,['waiting-browser','exchanging-code']);
});
test('cancelling browser sign-in releases the listener so a fresh attempt has a new state',async()=>{
    const local=new NodeHttpTransport(),states:string[]=[];
    for(let i=0;i<2;i++){
        const controller=new AbortController();let callback='';
        await assert.rejects(()=>authorizeGoogleDesktop({clientId:'test'},{fetch:async()=>{throw Error('Unexpected exchange');}},controller.signal,auth=>{
            const url=new URL(auth);callback=url.searchParams.get('redirect_uri')!;states.push(url.searchParams.get('state')!);controller.abort();
        },5000),{name:'AbortError'});
        await assert.rejects(()=>local.fetch(callback,{}));
    }
    assert.notEqual(states[0],states[1]);
});
test('Drive restore capabilities are requested as booleans and inconsistent repeat permissions invalidate a snapshot',async()=>{
    for(const capabilities of [[],null,{canUntrash:'true'},{canDownload:0}]){const client=new GoogleDriveClient({fetch:async()=>response(200,{...file('one','a.md'),capabilities})});await assert.rejects(()=>client.inspect('one',new AbortController().signal),(e:any)=>e.code==='response-format');}
    let pages=0;const client=new GoogleDriveClient({fetch:async url=>{assert(new URL(url).searchParams.get('fields')?.includes('canUntrash'));if(new URL(url).pathname.endsWith('/root-id'))return response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'});
        return response(200,{files:[{...file('one','a.md'),capabilities:{canUntrash:pages>0}}],...(pages++===0?{nextPageToken:'next'}:{})});}});
    assert.equal((await client.inventory('root-id',new AbortController().signal)).completeness,'unstable');
});

test('persisted exhausted chunk budget permits a status probe but never replays bytes after restart',async()=>{
 let requests=0;const ranges:string[]=[];const client=new GoogleDriveClient({fetch:async(_url,request)=>{requests++;ranges.push(request.headers!['Content-Range']);return response(308,{});}});
 await assert.rejects(client.upload('reserved',{},new ArrayBuffer(8),true,new AbortController().signal,async()=>{},
  {url:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',offset:0,size:8,fileId:'reserved',sendAttempts:{'chunk:0:8':5}}),(error:any)=>error.code==='retry-budget-exhausted');
 assert.equal(requests,1);assert.deepEqual(ranges,['bytes */8']);
});
test('persisted exhausted status probe is not reset on restart',async()=>{
 let requests=0;const client=new GoogleDriveClient({fetch:async()=>{requests++;return response(308,{});}});
 await assert.rejects(client.upload('reserved',{},new ArrayBuffer(8),true,new AbortController().signal,async()=>{},
  {url:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',offset:0,size:8,fileId:'reserved',sendAttempts:{'probe:0':5}}),(error:any)=>error.code==='retry-budget-exhausted');assert.equal(requests,0);
});
test('more than five advancing upload steps are valid and each is charged before dispatch',async()=>{
 const data=new ArrayBuffer(8);let sent=0;let latest:import('../src/sources/gdrive-client').DriveUploadState|undefined;
 const client=new GoogleDriveClient({fetch:async(_url,request)=>{
  if(request.method==='POST')return response(200,{}, {location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'});
  assert.equal(latest?.sendAttempts?.[`chunk:${sent}:${8-sent}`],1);sent++;
  return sent<8?response(308,{}, {range:`bytes=0-${sent-1}`}):response(200,{...file('reserved','a.md',8),md5Checksum:md5Hex(data)});
 }});
 await client.upload('reserved',{},data,true,new AbortController().signal,async state=>{latest=structuredClone(state);});assert.equal(sent,8);
});
test('upload budget persistence failure prevents even the status probe',async()=>{
 let sent=0;const client=new GoogleDriveClient({fetch:async()=>{sent++;return response(308,{});}});
 await assert.rejects(client.upload('reserved',{},new ArrayBuffer(8),true,new AbortController().signal,async()=>{throw Error('disk');},
  {url:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',offset:0,size:8,fileId:'reserved'}),(error:any)=>error.code==='retry-budget-persist');assert.equal(sent,0);
});
