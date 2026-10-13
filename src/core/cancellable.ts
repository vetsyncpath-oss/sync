/** Cancellation of an asynchronous UI decision also guards legacy UI ports. */
export async function cancellable<T>(work:Promise<T>,signal?:AbortSignal):Promise<T> {
    signal?.throwIfAborted();if(!signal)return work;
    let abort:(()=>void)|undefined;
    try{return await Promise.race([work,new Promise<T>((_resolve,reject)=>{
        abort=()=>reject(signal.reason??new DOMException('Cancelled','AbortError'));
        signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    })]);}finally{if(abort)signal.removeEventListener('abort',abort);}
}
