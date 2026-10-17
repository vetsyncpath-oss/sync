import test from 'node:test';
import assert from 'node:assert/strict';
import {SendBudget,SendBudgetError,sendWithBudget} from '../src/core/send-budget';
import {NetLayer} from '../src/core/net';
import {GoogleAuthorizedTransport} from '../src/auth/google-auth';
import {syncIssue} from '../src/core/sync-issue';
const response=(status:number)=>({status,headers:{},arrayBuffer:async()=>new ArrayBuffer(0),text:async()=>'',discard:()=>{}});
test('transport retries and Google 401 replay spend one five-send budget',async()=>{
 let sent=0;const tokens={generation:0,getToken:async()=> 'TOKEN',invalidateAccess:()=>{}};
 const transport=new GoogleAuthorizedTransport({fetch:async()=>response(++sent%2?401:500)},tokens as any);
 const budget=new SendBudget();
 await assert.rejects(new NetLayer(transport).fetchBuffer('https://www.googleapis.com/drive/v3/files/a',{sendBudget:budget,retryBackoffMs:[0]}),SendBudgetError);
 assert.equal(sent,5);assert.equal(budget.attempts,5);
 await assert.rejects(new NetLayer(transport).fetchBuffer('https://www.googleapis.com/drive/v3/files/a',{sendBudget:budget,retryBackoffMs:[0]}),SendBudgetError);assert.equal(sent,5);
});
test('parallel requests cannot overdraw a shared step',async()=>{
 const budget=new SendBudget();let sent=0;
 const results=await Promise.allSettled(Array.from({length:20},()=>sendWithBudget({fetch:async()=>{sent++;return response(200);}},'https://example.com',{sendBudget:budget})));
 assert.equal(sent,5);assert.equal(results.filter(x=>x.status==='fulfilled').length,5);
});
test('persist failure spends conservatively and never dispatches, including a second caller',async()=>{
 let sent=0,writes=0;const budget=new SendBudget(5,0,async()=>{writes++;throw Error('disk');});
 for(let i=0;i<2;i++)await assert.rejects(sendWithBudget({fetch:async()=>{sent++;return response(200);}},'https://example.com',{sendBudget:budget}),error=>syncIssue(error,'apply').code==='retry-budget-persist');
 assert.equal(sent,0);assert.equal(writes,1);assert.equal(budget.attempts,1);
});
test('restart restores charged attempts; a different step has independent capacity',async()=>{
 let persisted=0;const first=new SendBudget(5,0,async n=>{persisted=n;});await first.consume();await first.consume();
 const resumed=new SendBudget(5,persisted);await resumed.consume();await resumed.consume();await resumed.consume();await assert.rejects(resumed.consume(),SendBudgetError);
 assert.equal(await new SendBudget().consume(),1);
});
test('already cancelled request does not spend or dispatch',async()=>{
 const signal=AbortSignal.abort(),budget=new SendBudget();let sent=0;
 await assert.rejects(sendWithBudget({fetch:async()=>{sent++;return response(200);}},'https://example.com',{signal,sendBudget:budget}));assert.equal(sent,0);assert.equal(budget.attempts,0);
});
