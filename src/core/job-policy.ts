import type { SyncPolicy } from './policy';
import { computeLocalPath, isPolicyPathIncluded } from './policy';
import { resolveFileRule, symbolicRulePaths, PLUGIN_CODE_FILES, validateFileRules } from './file-rules';
import { effectiveBehavior } from './profile-policy';
import { sourcePathForDestination, destinationIsRouted } from './source-bindings';
import type { PathBlock } from './path-policy';
import type { DriveStateStore } from './drive-state';
export const physicalKey=(path:string)=>path.normalize('NFC').toLowerCase();
export const overlapsPhysical=(a:string,b:string)=>{a=physicalKey(a);b=physicalKey(b);return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');};
export interface HistoricalClaim {namespace:string;path:string}
export interface JobPolicyIssue {code:string;path:string;connections:string[];message:string}

/** The complete settings remain authority; selected/failed sources never change ownership. */
export class JobPolicy {
    readonly policy:SyncPolicy;readonly issues:JobPolicyIssue[]=[];readonly directoryPaths=new Set<string>();readonly bidirectionalOwners=new Set<string>();
    private readonly blocks:PathBlock[]=[];private readonly blockedWriters=new Set<string>();
    constructor(policy:SyncPolicy,readonly defaultSource:string,readonly history:readonly HistoricalClaim[]=[]){
        this.policy=structuredClone(policy);validateFileRules(this.policy.fileRules);const rules=this.policy.fileRules??[];
        for(const rule of rules){const directory=rule.scope==='file'?rule.path.split('/').slice(0,-1).join('/'):rule.path;
            this.reserveDirectory(directory);}
        for(const folder of this.policy.folders){const target=this.policy.folders.filter(rule=>rule.target&&(!rule.path||folder.path===rule.path||folder.path.startsWith(rule.path+'/'))).sort((a,b)=>b.path.length-a.path.length)[0];this.reserveDirectory(target?computeLocalPath(folder.path,target.path,target):folder.path);}
        const extra=[...this.directoryPaths],witnesses=symbolicRulePaths(rules,extra),inverse=new Map<string,string>();
        for(const path of witnesses){const resolved=resolveFileRule(path,rules),behavior=effectiveBehavior(resolved),owner=resolved.source??defaultSource;
            if(behavior.protected||behavior.direction!=='bidirectional'||!owner||owner==='unassigned'||!destinationIsRouted(path,rules,defaultSource,this.policy.folders))continue;
            this.bidirectionalOwners.add(owner);
            let remote:string|undefined;try{remote=sourcePathForDestination(path,owner,rules,defaultSource,this.policy.folders);}catch{remote=undefined;}
            if(!remote){this.blockWriter(owner,path,'Bidirectional binding has no unambiguous inverse');continue;}
            if(!isPolicyPathIncluded(remote,path,this.policy))continue;
            const key=JSON.stringify([owner,physicalKey(remote)]),previous=inverse.get(key);
            if(previous&&physicalKey(previous)!==physicalKey(path))this.blockWriter(owner,path,`Two local targets refer to one remote path: ${previous}`);
            else inverse.set(key,path);
        }
        const packages=new Set<string>();
        for(const path of [...witnesses,...extra]){const parts=path.split('/');if(physicalKey(parts.slice(0,2).join('/'))==='.obsidian/plugins'&&parts[2])packages.add(parts.slice(0,3).join('/'));}
        for(const root of packages){const owners=[...new Set(PLUGIN_CODE_FILES.map(name=>this.owner(root+'/'+name)).filter((id):id is string=>!!id))];
            if(owners.length>1){this.blocks.push({path:root,descendants:true,ancestors:true,reason:'package-ownership'});this.issues.push({code:'package-ownership',path:root,connections:owners,message:'Plugin package files have different owners'});}}
    }
    private reserveDirectory(path:string):void{const parts=path.split('/').filter(Boolean);for(let i=1;i<=parts.length;i++)this.directoryPaths.add(parts.slice(0,i).join('/'));}
    private blockWriter(owner:string,path:string,message:string):void{if(this.blockedWriters.has(owner))return;this.blockedWriters.add(owner);this.issues.push({code:'binding-inverse',path,connections:[owner],message});}
    owner(path:string):string|undefined{const owner=resolveFileRule(path,this.policy.fileRules).source??this.defaultSource;return owner==='unassigned'?undefined:owner;}
    writerBlocked(id:string):boolean{return this.blockedWriters.has(id);}
    blocksFor(id:string,namespace?:string):PathBlock[]{return [
        ...[...this.directoryPaths].map(path=>({path,reason:'directory-reservation'})),...this.blocks,
        ...this.history.filter(claim=>claim.namespace!==namespace).map(claim=>({path:claim.path,descendants:true,ancestors:true,reason:'retained-drive-identity'})),
    ];}
    /** Pending local effects hold ancestors as well as exact paths across namespaces. */
    static history(stores:readonly DriveStateStore[]):HistoricalClaim[]{const claims:HistoricalClaim[]=[];
        for(const store of stores)for(const path of store.paths()){
            if(store.baseline(path)||store.inbox(path)||store.tombstone(path)||store.pending(path)||store.proposals(path).length)claims.push({namespace:store.namespace,path});
            const pending=store.pending(path);if(pending?.copyPath)claims.push({namespace:store.namespace,path:pending.copyPath});
            for(const proposal of store.proposals(path))if(proposal.status==='prepared')claims.push({namespace:store.namespace,path:proposal.copyPath});
        }return claims;
    }
}
