import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEvidence } from '../scripts/audit-evidence.mjs';
const expected=[{id:'one',name:'first'},{id:'two',name:'second'}];
const tap='TAP version 13\nok 1 - first\nok 2 - second\n1..2\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('audit evidence accepts exactly the complete registered scenario set',()=>{
 assert.equal(auditEvidence(tap,expected,0).status,'pass');
});
test('exit zero cannot make missing or truncated evidence pass',()=>{
 for(const text of ['',tap.split('1..2')[0],tap.replace('ok 2 - second\n','')]){
  const result=auditEvidence(text,expected,0);assert.equal(result.status,'fail');assert.equal(result.complete,false);
 }
});
test('same result count cannot hide duplicate or unregistered scenarios',()=>{
 for(const text of [tap.replace('second','first'),tap.replace('second','unregistered')])assert.equal(auditEvidence(text,expected,0).complete,false);
});
test('failed tests can be complete evidence but never passing acceptance',()=>{
 const result=auditEvidence(tap.replace('ok 2','not ok 2').replace('# pass 2','# pass 1').replace('# fail 0','# fail 1'),expected,1);
 assert.equal(result.complete,true);assert.equal(result.status,'fail');assert.equal(result.scenarios[1].status,'fail');
});
test('skip/cancellation/todo and nonzero child exit cannot be accepted',()=>{
 for(const field of ['skipped','cancelled','todo'])assert.equal(auditEvidence(tap.replace(`# ${field} 0`,`# ${field} 1`),expected,0).status,'fail');
 assert.equal(auditEvidence(tap,expected,1).status,'fail');
});
test('duplicate plans, summaries and registry IDs invalidate evidence',()=>{
 for(const extra of ['1..2\n','# tests 2\n'])assert.equal(auditEvidence(tap+extra,expected,0).complete,false);
 assert.equal(auditEvidence(tap,[expected[0],{...expected[1],id:'one'}],0).complete,false);
});
