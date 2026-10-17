import type {NetRequest,NetResponse,NetTransport} from '../sources/types';

export class SendBudgetError extends Error {
    constructor(readonly code='retry-budget-exhausted'){super(code==='retry-budget-persist'?'Request budget could not be persisted; dispatch blocked':'Request step send budget exhausted; explicit continuation is required');this.name='SendBudgetError';}
}
/** One logical request step. Spend before dispatch; serialization prevents concurrent overdraw. */
export class SendBudget {
    private chain:Promise<void>=Promise.resolve();private failure:unknown;
    private used:number;
    constructor(readonly limit=5,used=0,private readonly persist?:(used:number)=>Promise<void>){
        if(!Number.isSafeInteger(limit)||limit<1||limit>5||!Number.isSafeInteger(used)||used<0||used>limit)throw Error('Invalid send budget');
        this.used=used;
    }
    get attempts():number{return this.used;}
    consume(signal?:AbortSignal):Promise<number>{
        const work=this.chain.then(async()=>{
            signal?.throwIfAborted();if(this.failure)throw this.failure;
            if(this.used>=this.limit)throw new SendBudgetError();
            const attempt=++this.used;
            try{await this.persist?.(attempt);}catch(error){this.failure=new SendBudgetError('retry-budget-persist');signal?.throwIfAborted();throw this.failure;}
            signal?.throwIfAborted();return attempt;
        });this.chain=work.then(()=>{},()=>{});return work;
    }
}
/** Wrappers advertising this capability charge each physical send, including authentication replay. */
export async function sendWithBudget(transport:NetTransport,url:string,request:NetRequest):Promise<NetResponse>{
    if(!transport.accountsSendBudget)await request.sendBudget?.consume(request.signal);
    return transport.fetch(url,request);
}
