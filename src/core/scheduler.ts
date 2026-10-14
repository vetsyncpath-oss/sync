import type { FailedQueue } from './queue';
export type SchedulerInterval='off'|'startup-only'|'15m'|'30m'|'1h'|'2h';
export type AutoTrigger='startup'|'interval'|'retry'|'finishing';
export const DEFAULT_START_DELAY_MS=30_000;
export const FINISHING_DELAY_MS=5_000;
export const MAX_FINISHING_RUNS=2;
export const MAX_AUTO_RETRIES=4;
export const STARTUP_RETRY_WINDOW_MS=30*60_000;
const MINUTES:Record<SchedulerInterval,number>={off:0,'startup-only':0,'15m':15,'30m':30,'1h':60,'2h':120};
export function resolveSchedule(input:SchedulerInterval|'inherit'|undefined,global:SchedulerInterval='off'):SchedulerInterval{
    const resolved=input===undefined||input==='inherit'?global:input;
    if(!Object.prototype.hasOwnProperty.call(MINUTES,resolved))throw Error('Invalid automatic schedule');return resolved;
}
export interface AutoTickResult {accepted:boolean;retryAt?:number;followUp?:boolean;retryableFailure?:boolean;cancelled?:boolean;outcome?:string;blockedReason?:string}
export interface AutoTickContext {trigger:AutoTrigger;initialCheck:boolean}
export interface SchedulerDeps {
    onAutoTick(context?:AutoTickContext):void|boolean|AutoTickResult|Promise<void|boolean|AutoTickResult>;
    canRun?():boolean;onStateChange?():void;onAutoRetry():void|Promise<void>;queue:FailedQueue;
    now?():number;setTimeout?(handler:()=>void,ms:number):unknown;clearTimeout?(timer:unknown):void;
    setInterval?(handler:()=>void,ms:number):unknown;clearInterval?(timer:unknown):void;
}
export interface SchedulerSnapshot {
    blockedReason?:string;interval:SchedulerInterval;paused:boolean;pending?:boolean;running?:boolean;
    nextTickAt:number|null;minutesUntilNext:number|null;lastAutoTickAt:number|null;lastRetryAt:number|null;
    nextPeriodicAt:number|null;nextRetryAt:number|null;nextFinishingAt:number|null;
    startupCycle:'waiting'|'running'|'retrying'|'finishing'|'completed'|'continuation-required'|'cancelled';
    finishingRuns:number;retryAttempts:number;continuationRequired:boolean;lastOutcome?:string;
}
type Slot='regular'|'retry'|'finishing';
/** One scheduler per connection; continued work belongs to its current automatic cycle. */
export class Scheduler {
    private interval:SchedulerInterval='off';private paused=false;private ticking=false;private generation=0;
    private activationConsumed=false;private cycleActive=false;private startDelayMs=DEFAULT_START_DELAY_MS;
    private pending=new Set<AutoTrigger>();private timers:Partial<Record<Slot,{id:unknown;interval:boolean}>>={};
    private tokens:Record<Slot,number>={regular:0,retry:0,finishing:0};
    private periodicAt:number|null=null;private retryAt:number|null=null;private finishingAt:number|null=null;
    private lastAutoTickAt:number|null=null;private lastRetryAt:number|null=null;private finishingRuns=0;private retryAttempts=0;
    private firstFailureAt?:number;private rejected=0;private continuationRequired=false;private lastOutcome?:string;private blockedReason?:string;
    private startupCycle:SchedulerSnapshot['startupCycle']='waiting';
    private readonly now:()=>number;
    constructor(private readonly deps:SchedulerDeps){this.now=deps.now??Date.now;}
    getInterval():SchedulerInterval{return this.interval;}
    isPaused():boolean{return this.paused;}
    /** Reconfiguration preserves the activation already consumed. Explicit re-enable may start a new cycle. */
    start(interval:SchedulerInterval,delay=DEFAULT_START_DELAY_MS,newActivation=false):void{
        resolveSchedule(interval);if(this.interval===interval&&!newActivation&&this.startDelayMs===Math.max(0,delay))return;
        this.generation++;this.clearTimers();this.pending.clear();this.interval=interval;this.startDelayMs=Math.max(0,delay);
        if(newActivation){this.paused=false;this.activationConsumed=false;this.cycleActive=false;this.resetCycle();}
        if(interval==='off'){this.paused=false;this.cycleActive=false;this.retryAt=this.finishingAt=this.periodicAt=null;this.changed();return;}
        this.retryAt=this.finishingAt=null;
        if(interval==='startup-only'&&this.activationConsumed&&!this.cycleActive){this.periodicAt=null;this.changed();return;}
        this.armInitial();this.changed();
    }
    setInterval(interval:SchedulerInterval,delay=DEFAULT_START_DELAY_MS):void{this.start(interval,delay);}
    pause():void{if(this.paused||this.interval==='off')return;this.paused=true;this.clearTimers();this.changed();}
    resume():void{if(!this.paused)return;this.paused=false;
        if(this.interval!=='off'){
            if(!this.activationConsumed&&!this.cycleActive&&!this.pending.size)this.armInitial();
            else if(this.interval!=='startup-only')this.armPeriodic();
            this.armContinuation('retry');this.armContinuation('finishing');this.wake();
        }this.changed();
    }
    stop():void{this.generation++;this.clearTimers();this.interval='off';this.paused=false;this.pending.clear();this.periodicAt=this.retryAt=this.finishingAt=null;this.cycleActive=false;this.changed();}
    snapshot():SchedulerSnapshot{
        const times=this.paused?[]:[this.periodicAt,this.retryAt,this.finishingAt].filter((at):at is number=>at!==null);
        const next=times.length?Math.min(...times):null;
        return {interval:this.interval,paused:this.paused,pending:this.pending.size>0,running:this.ticking,blockedReason:this.blockedReason,
            nextTickAt:next,minutesUntilNext:next===null?null:Math.floor(Math.max(0,next-this.now())/60_000),lastAutoTickAt:this.lastAutoTickAt,lastRetryAt:this.lastRetryAt,
            nextPeriodicAt:this.paused?null:this.periodicAt,nextRetryAt:this.paused?null:this.retryAt,nextFinishingAt:this.paused?null:this.finishingAt,
            startupCycle:this.startupCycle,finishingRuns:this.finishingRuns,retryAttempts:this.retryAttempts,continuationRequired:this.continuationRequired,lastOutcome:this.lastOutcome};
    }
    wake():void{if(this.pending.size&&!this.ticking&&!this.paused&&this.interval!=='off'&&(this.deps.canRun?.()??true))void this.runTick();}
    private changed():void{this.deps.onStateChange?.();}
    private clear(slot:Slot):void{this.tokens[slot]++;const timer=this.timers[slot];if(timer){if(timer.interval)(this.deps.clearInterval??(id=>clearInterval(id as any)))(timer.id);else(this.deps.clearTimeout??(id=>clearTimeout(id as any)))(timer.id);delete this.timers[slot];}}
    private clearTimers():void{for(const slot of ['regular','retry','finishing'] as const)this.clear(slot);}
    private arm(slot:Slot,at:number,run:()=>void,interval=false):void{
        this.clear(slot);if(this.paused||this.interval==='off')return;const token=this.tokens[slot],generation=this.generation;
        const callback=()=>{if(generation!==this.generation||token!==this.tokens[slot]||this.paused||this.interval==='off')return;if(!interval)delete this.timers[slot];run();};
        const ms=Math.max(0,at-this.now()),id=interval?(this.deps.setInterval??((fn,delay)=>setInterval(fn,delay)))(callback,ms):(this.deps.setTimeout??((fn,delay)=>setTimeout(fn,delay)))(callback,ms);
        this.timers[slot]={id,interval};
    }
    private armInitial():void{this.periodicAt=this.now()+this.startDelayMs;this.startupCycle='waiting';this.arm('regular',this.periodicAt,()=>{
        this.periodicAt=null;this.request('startup');if(this.interval!=='startup-only'&&this.interval!=='off')this.armPeriodic();
    });}
    private armPeriodic():void{const ms=MINUTES[this.interval]*60_000;if(!ms)return;this.periodicAt=this.now()+ms;this.arm('regular',this.periodicAt,()=>{this.periodicAt=this.now()+ms;this.request('interval');},true);}
    private request(trigger:AutoTrigger):void{this.pending.add(trigger);this.changed();this.wake();}
    private armContinuation(slot:'retry'|'finishing'):void{const at=slot==='retry'?this.retryAt:this.finishingAt;if(at===null)return;
        this.arm(slot,Math.max(this.now()+1000,at),()=>{if(slot==='retry')this.retryAt=null;else this.finishingAt=null;this.request(slot);});}
    private resetCycle():void{this.finishingRuns=0;this.retryAttempts=0;this.firstFailureAt=undefined;this.rejected=0;this.continuationRequired=false;this.blockedReason=undefined;}
    private choose():AutoTrigger|undefined{return (['startup','retry','finishing','interval'] as const).find(trigger=>this.pending.has(trigger));}
    private async runTick():Promise<void>{
        if(this.ticking||this.paused||this.interval==='off'||!(this.deps.canRun?.()??true))return;
        const trigger=this.choose();if(!trigger)return;
        if(trigger==='startup'&&this.activationConsumed&&!this.cycleActive){this.pending.delete(trigger);this.changed();return;}
        if(trigger==='retry'&&this.interval==='startup-only'&&this.firstFailureAt!==undefined&&this.now()>this.firstFailureAt+STARTUP_RETRY_WINDOW_MS){this.pending.delete(trigger);this.continuationRequired=true;this.cycleActive=false;this.activationConsumed=true;this.startupCycle='continuation-required';this.changed();return;}
        this.pending.delete(trigger);if(trigger==='startup'||trigger==='interval'){
            if(trigger==='startup'&&this.interval==='startup-only'){this.clear('regular');this.periodicAt=null;}
            if(!this.cycleActive){this.resetCycle();this.cycleActive=true;}else if(trigger==='interval'){this.pending.add(trigger);return;}
            this.pending.delete('interval');
        }
        if(trigger==='finishing')this.finishingRuns++;
        if(trigger==='retry'){this.retryAttempts++;this.lastRetryAt=this.now();}
        this.ticking=true;this.startupCycle=trigger==='retry'?'retrying':trigger==='finishing'?'finishing':'running';const generation=this.generation;let catchup=true;this.changed();
        try{
            const outcome=await this.deps.onAutoTick({trigger,initialCheck:trigger==='startup'}),result:AutoTickResult=typeof outcome==='object'?outcome:{accepted:outcome!==false};
            if(generation!==this.generation)return;
            if(!result.accepted){catchup=false;if(++this.rejected<=MAX_AUTO_RETRIES&&result.retryAt!==undefined){this.firstFailureAt??=this.now();this.retryAt=result.retryAt;this.armContinuation('retry');}
                else {this.continuationRequired=true;this.pending.add(trigger);this.blockedReason=result.blockedReason;}return;}
            this.activationConsumed=true;this.lastAutoTickAt=this.now();this.lastOutcome=result.outcome;this.blockedReason=result.blockedReason;
            if(result.cancelled){this.clear('retry');this.clear('finishing');this.pending.clear();this.retryAt=this.finishingAt=null;this.cycleActive=false;this.startupCycle='cancelled';return;}
            if(result.retryAt!==undefined){this.firstFailureAt??=this.now();const withinWindow=this.interval!=='startup-only'||result.retryAt<=this.firstFailureAt+STARTUP_RETRY_WINDOW_MS;
                if(this.retryAttempts<MAX_AUTO_RETRIES&&withinWindow){this.retryAt=Math.max(this.now()+1000,result.retryAt);this.armContinuation('retry');}else this.continuationRequired=true;}
            if(result.followUp){if(this.finishingRuns<MAX_FINISHING_RUNS&&this.finishingAt===null&&!this.pending.has('finishing')){this.finishingAt=this.now()+FINISHING_DELAY_MS;this.armContinuation('finishing');}
                else if(this.finishingRuns>=MAX_FINISHING_RUNS)this.continuationRequired=true;}
            if(this.retryAt===null&&this.finishingAt===null&&!this.pending.has('retry')&&!this.pending.has('finishing')){this.cycleActive=false;this.startupCycle=this.continuationRequired?'continuation-required':'completed';}
        }catch(error){if(generation!==this.generation)return;console.error('[VaultSync] automatic sync failed:',error);this.firstFailureAt??=this.now();
            if(this.retryAttempts<MAX_AUTO_RETRIES&&(this.interval!=='startup-only'||this.now()+60_000<=this.firstFailureAt+STARTUP_RETRY_WINDOW_MS)){this.retryAt=this.now()+60_000;this.armContinuation('retry');}else{this.continuationRequired=true;this.cycleActive=false;this.activationConsumed=true;this.startupCycle='continuation-required';}}
        finally{this.ticking=false;this.changed();if(generation!==this.generation||catchup&&(this.choose()!=='interval'||!this.cycleActive))this.wake();}
    }
}
