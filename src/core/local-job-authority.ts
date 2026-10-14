import type { VaultAdapter } from '../sources/types';
import type { PathBlock } from './path-policy';
import { physicalKey } from './job-policy';
import { SyncFault } from './sync-issue';
interface DirectoryNode {path:string;children:Map<string,DirectoryNode>;targets:Set<string>}
/** Inspect only required parents and target aliases. Never read bytes or walk unrelated subtrees. */
export async function localDirectoryBlocks(vault:VaultAdapter,paths:readonly string[],signal:AbortSignal,targets:readonly string[]=[]):Promise<PathBlock[]>{
    if(!vault.list&&(paths.some(Boolean)||targets.length))throw new SyncFault('local-directory-proof','Local identity cannot be inspected; affected writes are blocked');
    const root:DirectoryNode={path:'',children:new Map(),targets:new Set()},blocks:PathBlock[]=[];
    const directory=(path:string)=>{let node=root;for(const segment of path.split('/').filter(Boolean)){const key=physicalKey(segment),prefix=[node.path,segment].filter(Boolean).join('/');
        const child=node.children.get(key)??{path:prefix,children:new Map(),targets:new Set<string>()};node.children.set(key,child);node=child;}return node;};
    for(const path of paths)directory(path);for(const target of targets)directory(target.split('/').slice(0,-1).join('/')).targets.add(target);
    const inspect=async(node:DirectoryNode):Promise<void>=>{
        signal.throwIfAborted();if(!node.children.size&&!node.targets.size)return;
        let listing:Awaited<ReturnType<NonNullable<VaultAdapter['list']>>>;
        try{listing=await vault.list!(node.path);}catch(error){signal.throwIfAborted();for(const target of node.targets)blocks.push({path:target,reason:'local-directory-unavailable'});
            for(const child of node.children.values())blocks.push({path:child.path,descendants:true,reason:'local-directory-unavailable'});return;}
        const files=new Map<string,string[]>(),folders=new Map<string,string[]>();
        for(const file of listing.files){const key=physicalKey(file),matches=files.get(key)??[];matches.push(file);files.set(key,matches);}
        for(const folder of listing.folders){const key=physicalKey(folder),matches=folders.get(key)??[];matches.push(folder);folders.set(key,matches);}
        for(const target of node.targets){const key=physicalKey(target),matches=files.get(key)??[];
            if(folders.has(key))blocks.push({path:target,reason:'local-target-directory'});
            else if(matches.length>1||matches.length===1&&matches[0]!==target&&!(await vault.exists(target)))blocks.push({path:target,reason:'local-file-alias'});
        }
        for(const child of node.children.values()){
            const key=physicalKey(child.path),matches=folders.get(key)??[];
            if(files.has(key)){blocks.push({path:child.path,descendants:true,reason:'local-parent-collision'});continue;}
            if(matches.length>1||matches.length===1&&matches[0]!==child.path){blocks.push({path:child.path,descendants:true,reason:'local-directory-alias'});continue;}
            if(matches.length===1)await inspect(child);
        }
    };
    if(root.children.size||root.targets.size)await inspect(root);return blocks;
}
