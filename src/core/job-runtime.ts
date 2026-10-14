import type { SyncStats, SyncIssue, SyncSource } from '../sources/types';
import { ResourceGate } from './resource-gate';
import { SyncFault, syncIssue } from './sync-issue';
import type { SchedulerInterval, SchedulerSnapshot } from './scheduler';

export type JobOutcome='success'|'partial'|'needs-attention'|'failed'|'cancelled'|'blocked';
export interface JobRunResult {
    jobId:string;connectionId:string;name:string;kind:SyncSource['kind'];runId:string;
    activity:'observing'|'queued'|'running'|'idle';outcome?:JobOutcome;
    downloaded:number;uploaded:number;deleted:number;failed:number;pending:number;attention:number;
    startedAt:number;completedAt?:number;issues:SyncIssue[];
}
export interface JobDescriptor {id:string;name:string;kind:SyncSource['kind']}
export function awaitJobObservation<T>(pending:Promise<T>,signal:AbortSignal):Promise<T>{
    return new Promise((resolve,reject)=>{const abort=()=>{cleanup();reject(signal.reason??new DOMException('Observation cancelled','AbortError'));};const cleanup=()=>signal.removeEventListener('abort',abort);
        signal.addEventListener('abort',abort,{once:true});pending.then(value=>{cleanup();if(!signal.aborted)resolve(value);},error=>{cleanup();reject(error);});if(signal.aborted)abort();});
}
export interface JobBatchOptions {observeTimeoutMs?:number;observed?(job:JobDescriptor):void}
export interface JobProjection {jobId:string;connectionId:string;name:string;kind:SyncSource['kind'];configuredAuto:SchedulerInterval|'inherit';schedule:SchedulerSnapshot;run?:JobRunResult}
export const emptyStats=():SyncStats=>({totalFiles:0,downloaded:0,uploaded:0,deleted:0,skipped:0,failed:0,bytesTransferred:0,duration:0,conflicts:0,outcome:'ok',problems:[],results:[]});
const COUNTERS=['totalFiles','downloaded','uploaded','updated','received','deleted','deletedDrive','skipped','failed','bytesTransferred','conflicts','deferredConflicts','deferredDeletions','blockedDeletions','notAttempted','networkBytes'] as const;
export function mergeJobStats(target:SyncStats,value:SyncStats):void{
    for(const field of COUNTERS)target[field]=(target[field]??0)+(value[field]??0);
    target.problems=[...target.problems??[],...value.problems??[]];target.results=[...target.results??[],...value.results??[]];target.followUp ||= value.followUp;
    if(value.outcome==='cancelled')target.outcome='cancelled';else if(target.outcome!=='cancelled'&&(value.outcome==='error'||value.failed))target.outcome='error';
    if(value.problem)target.problem=value.problem;
}
/** Only shared integrity/capacity failures stop unrelated writers. Provider failures stay in their job. */
export function sharedJobFailure(issue:SyncIssue):boolean{return issue.domain!=='job'&&['operation-journal','history-quota','checkpoint','checkpoint-cleanup','history-cleanup','recovery-invalid','recovery-quota','settings-save','policy-corrupt','authority-corrupt','authority-blocked','journal-write'].includes(issue.code);}
export function accountedOutcome(stats:SyncStats):JobOutcome{
    if(stats.outcome==='cancelled')return 'cancelled';
    if(stats.failed||stats.problems?.length)return stats.downloaded||(stats.uploaded??0)||stats.deleted?'partial':'failed';
    if(stats.deferredConflicts||stats.deferredDeletions||stats.pendingAfter)return 'needs-attention';return 'success';
}

/** Bounded independent observation, shared ledger and serial apply. A failed observer never lends its scope. */
export class JobBatch {
    private readonly readers=new ResourceGate(2);private applyChain:Promise<void>=Promise.resolve();private stopped=false;
    private readonly states=new Map<string,JobRunResult>();
    constructor(private readonly signal:AbortSignal,private readonly guard:()=>void,private readonly changed?:(states:JobRunResult[])=>void,private readonly options:JobBatchOptions={}){}
    snapshot():JobRunResult[]{return [...this.states.values()].map(state=>structuredClone(state));}
    private emit():void{try{this.changed?.(this.snapshot());}catch(error){console.warn('[VaultSync] job subscriber failed');}}
    async run<T>(jobs:readonly JobDescriptor[],observe:(job:JobDescriptor,signal:AbortSignal)=>Promise<T>,apply:(job:JobDescriptor,observed:T)=>Promise<SyncStats>,admit?:(job:JobDescriptor,observed:T,signal:AbortSignal)=>Promise<void>):Promise<{job:JobDescriptor;stats:SyncStats}[]>{
        const runId=crypto.randomUUID();for(const job of jobs)this.states.set(job.id,{jobId:'job:'+job.id,connectionId:job.id,name:job.name,kind:job.kind,runId,activity:'queued',downloaded:0,uploaded:0,deleted:0,failed:0,pending:0,attention:0,startedAt:Date.now(),issues:[]});this.emit();
        return Promise.all(jobs.map(async job=>{
            const state=this.states.get(job.id)!;let stats=emptyStats(),observationDone=false;
            const observed=()=>{if(!observationDone){observationDone=true;this.options.observed?.(job);}};
            try{
                const release=await this.readers.acquire(1,this.signal);let snapshot:T;
                const controller=new AbortController(),abort=()=>controller.abort(this.signal.reason);this.signal.addEventListener('abort',abort,{once:true});
                const timer=setTimeout(()=>controller.abort(new SyncFault('observe-timeout','Source observation exceeded its deadline','source',true)),this.options.observeTimeoutMs??10*60_000);
                try{
                    try{this.signal.throwIfAborted();this.guard();state.activity='observing';this.emit();snapshot=await awaitJobObservation(Promise.resolve().then(()=>observe(job,controller.signal)),controller.signal);}
                    finally{release();observed();}
                    if(admit)await awaitJobObservation(Promise.resolve().then(()=>admit(job,snapshot,controller.signal)),controller.signal);
                }finally{clearTimeout(timer);this.signal.removeEventListener('abort',abort);}
                state.activity='queued';this.emit();
                const work=this.applyChain.then(async()=>{
                    this.signal.throwIfAborted();this.guard();
                    if(this.stopped){stats.outcome='error';state.outcome='blocked';stats.problems=[{code:'authority-blocked',message:'A shared integrity failure blocks new effects',scope:'session',stage:'preparing',retryable:false}];return;}
                    state.activity='running';this.emit();stats=await apply(job,snapshot);
                    if(stats.problems?.some(sharedJobFailure))this.stopped=true;
                });this.applyChain=work.then(()=>{},()=>{});await work;
            }catch(error){
                observed();if(this.signal.aborted){stats.outcome='cancelled';state.outcome='cancelled';}
                else {const issue=syncIssue(error,state.activity==='running'?'apply':'manifest');stats.failed=1;stats.outcome='error';stats.problem=issue.message;stats.problems=[issue];if(sharedJobFailure(issue))this.stopped=true;}
            }
            stats.problems=stats.problems?.map(issue=>({...issue,jobId:state.jobId,connectionId:job.id}));
            Object.assign(state,{activity:'idle',outcome:state.outcome??accountedOutcome(stats),downloaded:stats.downloaded,uploaded:stats.uploaded??0,deleted:stats.deleted,
                failed:stats.failed,pending:stats.pendingAfter??0,attention:(stats.deferredConflicts??0)+(stats.deferredDeletions??0),completedAt:Date.now(),issues:stats.problems??[]});this.emit();return {job,stats};
        }));
    }
}
