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
    assert.equal(calls,3);assert.equal(scheduler.snapshot().finishingRuns,2);assert(scheduler.snapshot().continuationRequired);assert.equal(scheduler.snapshot().nextTickAt,null);scheduler.stop();
});
test('pause cancels a scheduled retry without losing the pending startup job',async()=>{
    let calls=0,timer=()=>{};const scheduler=new Scheduler({queue:new FailedQueue(),onAutoRetry:()=>{},onAutoTick:()=>{calls++;return calls===1?{accepted:true,retryAt:Date.now()+60_000}:{accepted:true};},
        setTimeout:run=>{timer=run;return 1;},clearTimeout:()=>{}});
    scheduler.start('startup-only',0);timer();await flush();scheduler.pause();assert.equal(scheduler.snapshot().nextTickAt,null);scheduler.resume();timer();await flush();assert.equal(calls,2);scheduler.stop();
});
test('an old running job cannot consume the startup task selected during its execution',async()=>{
    let complete!:(result:{accepted:boolean})=>void,calls=0,timer=()=>{};
    const scheduler=new Scheduler({queue:new FailedQueue(),onAutoRetry:()=>{},onAutoTick:()=>{calls++;return calls===1?new Promise(r=>complete=r):{accepted:true};},
        setTimeout:run=>{timer=run;return 1;},clearTimeout:()=>{},setInterval:()=>2,clearInterval:()=>{}});
    scheduler.start('15m',0);timer();scheduler.start('startup-only',0);timer();assert.equal(calls,1);
    complete({accepted:true});await flush();assert.equal(calls,2);assert.equal(scheduler.snapshot().interval,'startup-only');assert.equal(scheduler.snapshot().nextTickAt,null);scheduler.stop();
});

function clock(onAutoTick:any){let now=0,id=0;const timers=new Map<number,{run:()=>void;at:number;period?:number}>();const history:(()=>void)[]=[];
    const add=(run:()=>void,ms:number,period?:number)=>{history.push(run);timers.set(++id,{run,at:now+ms,period});return id;};
    const scheduler=new Scheduler({queue:new FailedQueue(),now:()=>now,onAutoRetry:()=>{},onAutoTick,setTimeout:(run,ms)=>add(run,ms),clearTimeout:key=>{timers.delete(key as number);},setInterval:(run,ms)=>add(run,ms,ms),clearInterval:key=>{timers.delete(key as number);}});
    const next=async()=>{const pair=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!pair)return false;now=Math.max(now,pair[1].at);if(pair[1].period)pair[1].at=now+pair[1].period;else timers.delete(pair[0]);pair[1].run();await flush();return true;};
    return {scheduler,timers,history,next,advance:(ms:number)=>{now+=ms;},now:()=>now};
}
test('startup-only schedules finishing at five seconds despite attention, then remains configured and completed after hot reload',async()=>{
    const contexts:any[]=[];const f=clock((context:any)=>{contexts.push(context);return {accepted:true,followUp:contexts.length===1,outcome:'needs-attention'};});f.scheduler.start('startup-only',0);await f.next();assert.equal(f.scheduler.snapshot().nextFinishingAt,5000);assert.equal(f.scheduler.snapshot().nextPeriodicAt,null);
    await f.next();assert.deepEqual(contexts.map(c=>c.trigger),['startup','finishing']);assert.equal(f.scheduler.snapshot().startupCycle,'completed');assert.equal(f.scheduler.snapshot().interval,'startup-only');assert.equal(f.scheduler.snapshot().lastOutcome,'needs-attention');f.scheduler.start('startup-only',0);assert.equal(f.timers.size,0);
});
test('one initial and at most four retries exhaust the automatic cycle, without resetting the finishing budget',async()=>{
    let calls=0;const f=clock(()=>{calls++;return {accepted:true,retryAt:f.now()+1000,retryableFailure:true};});f.scheduler.start('startup-only',0);while(await f.next()){}assert.equal(calls,5);assert.equal(f.scheduler.snapshot().retryAttempts,4);assert.equal(f.scheduler.snapshot().startupCycle,'continuation-required');assert.equal(f.timers.size,0);
});
test('a Retry-After beyond the startup retry window stays visible without installing a timer or retrying immediately',async()=>{
    const f=clock(()=>({accepted:true,retryAt:31*60_000,retryableFailure:true}));f.scheduler.start('startup-only',0);await f.next();assert.equal(f.timers.size,0);assert(f.scheduler.snapshot().continuationRequired);assert.equal(f.scheduler.snapshot().nextRetryAt,null);
});
test('cancelled automatic work does not resurrect queued retry or finishing work',async()=>{
    const f=clock(()=>({accepted:true,cancelled:true,followUp:true,retryAt:1000}));f.scheduler.start('startup-only',0);await f.next();assert.equal(f.timers.size,0);assert.equal(f.scheduler.snapshot().startupCycle,'cancelled');f.scheduler.wake();await flush();assert.equal(f.timers.size,0);
});
test('paused finishing work resumes at its recorded due point, and stale cancelled timers cannot run',async()=>{
    let calls=0;const f=clock(()=>({accepted:true,followUp:++calls===1}));f.scheduler.start('startup-only',0);await f.next();const old=f.history[1];f.scheduler.pause();f.advance(2000);f.scheduler.resume();old();await flush();assert.equal(calls,1);await f.next();assert.equal(calls,2);assert.equal(f.now(),5000);assert.equal(f.scheduler.snapshot().startupCycle,'completed');
});
test('two ready ticks coalesce behind a running job and do not create parallel effects',async()=>{
    let release!:(value:any)=>void,calls=0;const f=clock(()=>{calls++;return calls===1?new Promise(resolve=>release=resolve):{accepted:true};});f.scheduler.start('15m',0);await f.next();assert.equal(calls,1);await f.next();assert.equal(calls,1);await f.next();assert.equal(calls,1);release({accepted:true});await flush();assert.equal(calls,2);f.scheduler.stop();
});
test('explicit re-enable creates one fresh activation, while no-op settings reload does not create another startup',async()=>{
    let calls=0;const f=clock(()=>{calls++;return {accepted:true};});f.scheduler.start('startup-only',0);await f.next();f.scheduler.start('startup-only',0);assert.equal(f.timers.size,0);f.scheduler.stop();f.scheduler.start('startup-only',0,true);await f.next();assert.equal(calls,2);f.scheduler.stop();
});
test('an offline delayed startup retry beyond its window is not admitted after returning online',async()=>{
    let available=true,calls=0;const f=clock(()=>{calls++;return {accepted:true,retryAt:f.now()+1000};});(f.scheduler as any).deps.canRun=()=>available;f.scheduler.start('startup-only',0);await f.next();available=false;await f.next();f.advance(31*60_000);available=true;f.scheduler.wake();await flush();assert.equal(calls,1);assert(f.scheduler.snapshot().continuationRequired);
});
