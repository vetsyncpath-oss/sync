import type { RemoteEntry } from '../sources/types';
import { validateManifest } from '../core/source-validation';
export interface InventoryState {
    status: 'idle'|'loading'|'ready'|'error'; entries: RemoteEntry[]; loadedAt?: number; error?: string;
}
/** Independent previews. Failed refresh retains the last successful snapshot. */
export class SourceInventories {
    private states = new Map<string, InventoryState>();
    private requests = new Map<string, AbortController>();
    state(id:string):InventoryState { return this.states.get(id) ?? {status:'idle',entries:[]}; }
    async load(id:string,fetch:(signal:AbortSignal)=>Promise<RemoteEntry[]>):Promise<void> {
        this.requests.get(id)?.abort(); const controller=new AbortController();this.requests.set(id,controller);
        const previous=this.state(id);this.states.set(id,{...previous,status:'loading',error:undefined});
        try {
            const entries=await fetch(controller.signal);validateManifest(entries);
            if(this.requests.get(id)!==controller || controller.signal.aborted)return;
            this.states.set(id,{status:'ready',entries:structuredClone(entries),loadedAt:Date.now()});
        }catch(e){
            if(this.requests.get(id)!==controller || controller.signal.aborted)return;
            this.states.set(id,{...previous,status:'error',error:e instanceof Error?e.message:String(e)});
        }finally{if(this.requests.get(id)===controller)this.requests.delete(id);}
    }
    invalidate(id:string):void {this.requests.get(id)?.abort();this.requests.delete(id);this.states.delete(id);}
    cancel(id:string):void {
        this.requests.get(id)?.abort(); this.requests.delete(id);
        const previous=this.state(id); this.states.set(id,{...previous,status:previous.loadedAt?'ready':'idle',error:undefined});
    }
    dispose():void {for(const c of this.requests.values())c.abort();this.requests.clear();}
}
