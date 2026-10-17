import test from 'node:test';
import assert from 'node:assert/strict';
import {FileJournal,type JournalEntry} from '../src/core/journal';
import {deferred} from './helpers';
const entry:JournalEntry={startedAt:1,durationMs:2,engine:'gdrive',mirrorLevel:'fetch',trigger:'auto',outcome:'ok',downloaded:2,uploaded:1,updated:0,deletedLight:0,deletedFull:0,overwritten:0,conflicts:0,skipped:0,errors:0,topErrors:[]};
function memory(){
 let ring:string|null=null,pending:string|null=null,failRing=false,failAck=false;
 const io={read:async()=>ring,write:async(raw:string)=>{if(failRing)throw Error('disk full');ring=raw;},pending:{read:async()=>pending,write:async(raw:string)=>{if(failAck&&raw==='null')throw Error('ack failure');pending=raw;}}};
 return {io,ring:()=>ring,pending:()=>pending,setFailRing:(v:boolean)=>{failRing=v;},setFailAck:(v:boolean)=>{failAck=v;},corruptPending:()=>{pending='BROKEN';}};
}
test('restart publishes a durable report after journal write failure without running effects',async()=>{
 const f=memory();f.setFailRing(true);await assert.rejects(new FileJournal(f.io).append(entry));assert(f.pending());assert.equal(f.ring(),null);
 f.setFailRing(false);const restarted=new FileJournal(f.io);await restarted.recover();const rows=await restarted.load();
 assert.equal(rows.length,1);assert.equal(rows[0].downloaded,2);assert.equal(rows[0].uploaded,1);assert.equal(f.pending(),'null');
});
test('lost acknowledgement replays publication idempotently',async()=>{
 const f=memory();f.setFailAck(true);await assert.rejects(new FileJournal(f.io).append(entry));assert.equal(JSON.parse(f.ring()!).length,1);
 f.setFailAck(false);const restarted=new FileJournal(f.io);await restarted.recover();assert.equal((await restarted.load()).length,1);
});
test('clear after failed acknowledgement cannot resurrect the recovered report',async()=>{
 const f=memory();f.setFailAck(true);await assert.rejects(new FileJournal(f.io).append(entry));f.setFailAck(false);
 await new FileJournal(f.io).clear();assert.deepEqual(await new FileJournal(f.io).load(),[]);assert.equal(f.pending(),'null');
});
test('clear intent survives crash before acknowledgement',async()=>{
 const f=memory();const journal=new FileJournal(f.io);await journal.append(entry);f.setFailAck(true);await assert.rejects(journal.clear());
 f.setFailAck(false);assert.deepEqual(await new FileJournal(f.io).load(),[]);
});
test('corrupt pending report blocks new publication instead of silently dropping it',async()=>{
 const f=memory();await new FileJournal(f.io).append(entry);const ring=f.ring();f.corruptPending();
 await assert.rejects(new FileJournal(f.io).append({...entry,downloaded:9}));assert.equal(f.ring(),ring);assert.equal(f.pending(),'BROKEN');
});
test('append and clear share serialization, including async publication',async()=>{
 const f=memory(),ready=deferred(),release=deferred();const write=f.io.write;let calls=0;
 f.io.write=async raw=>{if(calls++===0){ready.resolve();await release.promise;}await write(raw);};
 const journal=new FileJournal(f.io),append=journal.append(entry);await ready.promise;const clear=journal.clear();release.resolve();await Promise.all([append,clear]);assert.deepEqual(await journal.load(),[]);
});
test('unverified pending write cannot publish a report',async()=>{
 const f=memory();f.io.pending.write=async()=>{};
 await assert.rejects(new FileJournal(f.io).append(entry));assert.equal(f.ring(),null);
});
