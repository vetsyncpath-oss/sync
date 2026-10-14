import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuthorizedTransport, GoogleTokenManager, parseGoogleClient,googleJson } from '../src/auth/google-auth';
import { syncIssue } from '../src/core/sync-issue';
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
test('thrown 401 refreshes once and a second thrown 401 is an authentication failure',async()=>{
    let refreshes=0,sends=0;
    const manager=new GoogleTokenManager({clientId:'test'},'ref',secrets,{fetch:async()=>{refreshes++;return response(200,{access_token:'NEW',expires_in:3600});}});
    manager.setAccess('OLD',3600);
    const transport=new GoogleAuthorizedTransport({fetch:async()=>{sends++;throw Object.assign(Error('HTTP 401'),{status:401});}},manager);
    await assert.rejects(()=>transport.fetch('https://www.googleapis.com/drive/v3/files',{}),error=>{
        const issue=syncIssue(error,'download');return issue.code==='auth-required'&&!issue.retryable;});
    assert.equal(sends,2);assert.equal(refreshes,1);
});
test('Google transport and body interruptions remain retryable and do not expose upload session credentials',async()=>{
    const secret='https://www.googleapis.com/upload/drive/v3/files?upload_id=PRIVATE_SESSION';
    await assert.rejects(()=>googleJson({fetch:async()=>{throw Object.assign(Error(secret),{code:'ECONNRESET'});}},secret,{}),error=>{
        const issue=syncIssue(error,'manifest');return issue.code==='network'&&issue.retryable&&issue.scope==='source'&&!issue.message.includes('PRIVATE_SESSION');});
    const manager=new GoogleTokenManager({clientId:'test'},'ref',secrets,{fetch:async()=>response(200,{access_token:'NEW',expires_in:3600})});manager.setAccess('OLD',3600);
    const transport=new GoogleAuthorizedTransport({fetch:async()=>({...response(200,{}),arrayBuffer:async()=>{throw Error('Response body interrupted');}})},manager);
    const result=await transport.fetch('https://www.googleapis.com/drive/v3/files',{});
    await assert.rejects(()=>result.arrayBuffer(),error=>{const issue=syncIssue(error,'download');return issue.code==='network'&&issue.retryable;});
});
test('refresh cannot rotate credentials or cache access for a different account',async()=>{
    let writes=0;
    const manager=new GoogleTokenManager({clientId:'test'},'ref',{getSecret:()=> 'REFRESH',setSecret:()=>writes++},
        {fetch:async url=>response(200,url.includes('/userinfo')?{sub:'WRONG'}:{access_token:'NEW',expires_in:3600,refresh_token:'ROTATED'})},Date.now,'EXPECTED');
    await assert.rejects(()=>manager.getToken(),/identity changed/);assert.equal(writes,0);
});
test('refresh timeout releases the shared request and ignores a late credential rotation',async()=>{
    let release!:(value:any)=>void,calls=0,writes=0,discarded=0;
    const manager=new GoogleTokenManager({clientId:'test'},'ref',{getSecret:()=> 'REFRESH',setSecret:()=>writes++},
        {fetch:async()=>{calls++;if(calls===1)return new Promise(resolve=>release=resolve);return response(200,{access_token:'FRESH',expires_in:3600});}},Date.now,undefined,25);
    await assert.rejects(()=>manager.getToken(),error=>{const issue=syncIssue(error,'preparing');return issue.code==='network'&&issue.retryable;});
    assert.equal(await manager.getToken(),'FRESH');
    release({...response(200,{access_token:'LATE',refresh_token:'LATE_ROTATION',expires_in:3600}),discard:()=>discarded++});
    for(let i=0;i<8;i++)await Promise.resolve();
    assert.equal(writes,0);assert.equal(discarded,1);assert.equal(await manager.getToken(),'FRESH');assert.equal(calls,2);
});
test('Google body cancellation completes even when the underlying response ignores abort',async()=>{
    const controller=new AbortController();let reading!:()=>void;const started=new Promise<void>(resolve=>reading=resolve);
    const result=googleJson({fetch:async()=>({...response(200,{}),text:async()=>{reading();return new Promise<string>(()=>{});}})},'https://oauth2.googleapis.com/token',{signal:controller.signal});
    await started;controller.abort();await assert.rejects(result,{name:'AbortError'});
});
