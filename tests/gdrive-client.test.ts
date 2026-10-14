import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { md5Hex } from '../src/core/md5';
import { GoogleDriveClient, DRIVE_FOLDER } from '../src/sources/gdrive-client';
import { authorizeGoogleDesktop } from '../src/adapters/google-desktop-oauth';
import { NodeHttpTransport } from '../src/adapters/host-transport';
import type { NetResponse, NetTransport } from '../src/sources/types';
const response=(status:number,value:unknown,headers:Record<string,string>={}):NetResponse=>({status,headers,text:async()=>JSON.stringify(value),arrayBuffer:async()=>new ArrayBuffer(0)});
const file=(id:string,name:string,size=4)=>({id,name,size:String(size),version:'1',parents:['root-id'],mimeType:'text/markdown'});
test('Drive MD5 verification matches independent Node implementation including padding boundaries',()=>{
    for(const size of [0,1,3,55,56,63,64,65,1025]){
        const data=Uint8Array.from({length:size},(_,i)=>i%251);
        assert.equal(md5Hex(data.buffer),createHash('md5').update(data).digest('hex'));
    }
});
test('inventory reads all pages and rejects incomplete or ambiguous trees',async()=>{
    let pages=0;
    const transport:NetTransport={fetch:async(url)=>new URL(url).pathname.endsWith('/root-id')?
        response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):
        response(200,{files:[file(String(++pages),pages===1?'a.md':'b.md')],...(pages===1?{nextPageToken:'next'}:{})})};
    const client=new GoogleDriveClient(transport);const result=await client.inventory('root-id',new AbortController().signal);
    assert.equal(result.items.length,2);assert.equal(pages,2);
    const duplicate:NetTransport={fetch:async(url)=>new URL(url).pathname.endsWith('/root-id')?
        response(200,{id:'root-id',name:'Root',mimeType:DRIVE_FOLDER,version:'1'}):response(200,{files:[file('1','a.md'),file('2','A.md')]})};
    await assert.rejects(()=>new GoogleDriveClient(duplicate).inventory('root-id',new AbortController().signal),/collision/);
    await assert.rejects(()=>new GoogleDriveClient({fetch:async()=>response(200,{incompleteSearch:true,files:[]})}).listChildren('root-id',new AbortController().signal),/incomplete/);
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
    assert.deepEqual(states,[0,4194304]);assert.equal(ranges[1],`bytes 4194304-${size-1}/${size}`);
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
