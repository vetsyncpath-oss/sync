import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuthorizedTransport, GoogleTokenManager, parseGoogleClient } from '../src/auth/google-auth';
import type { NetTransport } from '../src/sources/types';
const response=(status:number,data:unknown)=>({status,headers:{},text:async()=>JSON.stringify(data),arrayBuffer:async()=>new ArrayBuffer(0)});
const secrets={getSecret:()=> 'REFRESH',setSecret:()=>{}};
test('refresh requests coalesce and disconnected late responses never resurrect access',async()=>{
    let release!:(v:any)=>void,calls=0;
    const transport:NetTransport={fetch:async()=>{calls++;return new Promise(r=>release=r);}};
    const manager=new GoogleTokenManager({clientId:'test'},'ref',secrets,transport);
    const a=manager.getToken(),b=manager.getToken();await Promise.resolve();assert.equal(calls,1);
    manager.disconnect();const outcomes=Promise.allSettled([a,b]);release(response(200,{access_token:'OLD',expires_in:3600}));
    assert((await outcomes).every(r=>r.status==='rejected'));await assert.rejects(()=>manager.getToken(),/disconnected/);
});
test('returned 401 refreshes once, without replaying a second 401 forever',async()=>{
    let refreshes=0,sends=0,discarded=0;
    const manager=new GoogleTokenManager({clientId:'test'},'ref',secrets,{fetch:async()=>{refreshes++;return response(200,{access_token:'NEW',expires_in:3600});}});
    manager.setAccess('OLD',3600);
    const transport=new GoogleAuthorizedTransport({fetch:async()=>{sends++;return {...response(401,{}),discard:()=>discarded++};}},manager);
    const result=await transport.fetch('https://www.googleapis.com/drive/v3/files',{});
    assert.equal(result.status,401);assert.equal(sends,2);assert.equal(refreshes,1);assert.equal(discarded,1);
    await assert.rejects(()=>transport.fetch('https://example.com/drive/v3/files',{}),/Untrusted/);
});
test('desktop import rejects web-app clients rather than accepting a wrong OAuth flow',()=>{
    assert.throws(()=>parseGoogleClient('{"web":{"client_id":"test.apps.googleusercontent.com"}}'),/Desktop/);
    assert.equal(parseGoogleClient('{"installed":{"client_id":"test.apps.googleusercontent.com"}}').clientId,'test.apps.googleusercontent.com');
});
test('refresh cannot rotate credentials or cache access for a different account',async()=>{
    let writes=0;
    const manager=new GoogleTokenManager({clientId:'test'},'ref',{getSecret:()=> 'REFRESH',setSecret:()=>writes++},
        {fetch:async url=>response(200,url.includes('/userinfo')?{sub:'WRONG'}:{access_token:'NEW',expires_in:3600,refresh_token:'ROTATED'})},Date.now,'EXPECTED');
    await assert.rejects(()=>manager.getToken(),/identity changed/);assert.equal(writes,0);
});
