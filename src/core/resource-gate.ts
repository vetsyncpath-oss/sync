/** A cancellable weighted semaphore. The active budget accounts for buffer copies. */
export class ResourceGate {
    private used = 0;
    private waiting: Array<() => void> = [];
    constructor(readonly limit: number) {}
    async acquire(weight: number, signal: AbortSignal): Promise<() => void> {
        weight = Math.min(this.limit, Math.max(1, weight));
        while (this.used + weight > this.limit) {
            await new Promise<void>((resolve, reject) => {
                const done = () => { signal.removeEventListener('abort', abort); resolve(); };
                const abort = () => { this.waiting = this.waiting.filter(item => item !== done); signal.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); };
                signal.throwIfAborted(); this.waiting.push(done); signal.addEventListener('abort', abort, {once:true});
            });
        }
        signal.throwIfAborted(); this.used += weight;
        let released = false;
        return () => { if(released)return;released=true;this.used-=weight;const wake=this.waiting.splice(0);wake.forEach(fn=>fn()); };
    }
}
