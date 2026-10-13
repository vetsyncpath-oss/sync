import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/core/scheduler';
import { FailedQueue } from '../src/core/queue';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('startup-only continues the same job after a transient failure and stops once reconciled',async()=>{
    let now=0,calls=0,next=0;const timers=new Map<number,{run:()=>void;at:number}>();
    const scheduler=new Scheduler({queue:new FailedQueue(),now:()=>now,onAutoRetry:()=>{},onAutoTick:()=>{calls++;return calls===1?{accepted:true,retryAt:60_000}:{accepted:true};},
        setTimeout:(run,ms)=>{timers.set(++next,{run,at:now+ms});return next;},clearTimeout:id=>{timers.delete(id as number);}});
    scheduler.start('startup-only',0);let timer=timers.get(1)!;timers.delete(1);timer.run();await flush();
    assert.equal(calls,1);assert.equal(scheduler.snapshot().interval,'startup-only');assert.equal(scheduler.snapshot().nextTickAt,60_000);
    now=60_000;timer=timers.get(2)!;timers.delete(2);timer.run();await flush();assert.equal(calls,2);assert.equal(scheduler.snapshot().nextTickAt,null);
    scheduler.pause();scheduler.resume();scheduler.wake();await flush();assert.equal(calls,2);scheduler.stop();
});
test('follow-up after editing during transfer is bounded and does not turn startup-only into a periodic job',async()=>{
    let now=0,calls=0,timer:(()=>void)|undefined;
    const scheduler=new Scheduler({queue:new FailedQueue(),now:()=>now,onAutoRetry:()=>{},onAutoTick:()=>{calls++;return {accepted:true,followUp:true};},
        setTimeout:run=>{timer=run;return 1;},clearTimeout:()=>{timer=undefined;}});
    scheduler.start('startup-only',0);for(let i=0;i<7&&timer;i++){const run=timer;timer=undefined;now+=1000;run();await flush();}
    assert.equal(calls,4);assert.equal(scheduler.snapshot().nextTickAt,null);scheduler.stop();
});
test('pause cancels a scheduled retry without losing the pending startup job',async()=>{
    let calls=0,timer=()=>{};const scheduler=new Scheduler({queue:new FailedQueue(),onAutoRetry:()=>{},onAutoTick:()=>{calls++;return calls===1?{accepted:true,retryAt:Date.now()+60_000}:{accepted:true};},
        setTimeout:run=>{timer=run;return 1;},clearTimeout:()=>{}});
    scheduler.start('startup-only',0);timer();await flush();scheduler.pause();assert.equal(scheduler.snapshot().nextTickAt,null);scheduler.resume();timer();await flush();assert.equal(calls,2);scheduler.stop();
});
