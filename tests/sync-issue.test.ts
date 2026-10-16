import test from 'node:test';
import assert from 'node:assert/strict';
import {syncIssue,SyncFault} from '../src/core/sync-issue';
import {StalePlanError} from '../src/core/local-version';
import {sharedJobFailure} from '../src/core/job-runtime';
for(const message of ['directory service unavailable','exchange rate changed','object exists','stale credential','обычная ошибка'])test(`message never determines retry or collision: ${message}`,()=>{
 const issue=syncIssue(new Error(message),'apply');
 assert.equal(issue.code,'internal-error');assert.equal(issue.retryable,false);assert.equal(issue.scope,'session');assert.equal(sharedJobFailure(issue),false);
});
test('typed stale precondition retains retry without inspecting its diagnostic text',()=>{
 const fault=new StalePlanError('a.md');fault.message='Different localized diagnostic';
 const issue=syncIssue(fault,'apply');assert.equal(issue.code,'local-changed');assert.equal(issue.retryable,true);assert.equal(issue.scope,'file');
});
test('typed cause survives wrapping and recursive cause does not loop',()=>{
 const cause=new SyncFault('io','Disk read unavailable','file');
 assert.equal(syncIssue(Object.assign(new Error('directory changed'),{cause}),'apply').code,'io');
 const loop=new Error('exists');(loop as any).cause=loop;assert.equal(syncIssue(loop,'apply').code,'internal-error');
});
test('failed mkdir is not a fabricated path collision',async()=>{
 const {DirLock}=await import('../src/core/dirlock');
 try{await new DirLock().ensure({exists:async()=>false,mkdir:async()=>{throw Error('directory service changed');}},'a/b.md');assert.fail('must reject');}
 catch(error){const issue=syncIssue(error,'prepare-directory');assert.equal(issue.code,'mkdir-failed');assert.equal(issue.retryable,false);}
});
