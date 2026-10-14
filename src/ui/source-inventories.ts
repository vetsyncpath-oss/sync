import type { RemoteEntry } from '../sources/types';
import { validateManifest } from '../core/source-validation';
import { validateBrowseSnapshot, type RemoteBrowseSnapshot, type SourceBrowseResult } from '../sources/remote-browse';
export interface InventoryState {
    status: 'idle'|'loading'|'ready'|'error'; entries: RemoteEntry[]; loadedAt?: number; error?: string;
    browse?: RemoteBrowseSnapshot;
}
/** Independent previews. Failed refresh retains the last successful snapshot. */
export class SourceInventories {
    private states = new Map<string, InventoryState>();
    private requests = new Map<string, AbortController>();
    state(id:string):InventoryState { return this.states.get(id) ?? {status:'idle',entries:[]}; }
    async load(id:string,fetch:(signal:AbortSignal)=>Promise<SourceBrowseResult>):Promise<void> {
        this.requests.get(id)?.abort(); const controller=new AbortController();this.requests.set(id,controller);
        const previous=this.state(id);this.states.set(id,{...previous,status:'loading',error:undefined});
        try {
            const result=await fetch(controller.signal);
            if(Array.isArray(result))validateManifest(result);else validateBrowseSnapshot(result);
            if(this.requests.get(id)!==controller || controller.signal.aborted)return;
            const browse=Array.isArray(result)?undefined:structuredClone(result);
            const entries=Array.isArray(result)?structuredClone(result):browse!.nodes.flatMap(n=>n.entry&&!n.blocked?[n.entry]:[]);
            this.states.set(id,{status:'ready',entries,browse,loadedAt:Date.now()});
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
