import test from 'node:test';
import assert from 'node:assert/strict';
import { JobBatch, emptyStats } from '../src/core/job-runtime';
import { JobPolicy, overlapsPhysical } from '../src/core/job-policy';
import { symbolicRulePaths } from '../src/core/file-rules';
import { compileProfiles, STANDARD_PROFILES, validateProfileConnections } from '../src/core/profiles';
import { PathPolicy } from '../src/core/path-policy';
import { fixture, deferred, ab, entry, pathPolicy } from './helpers';
import { MISSING, versionOf } from '../src/core/local-version';
import { SyncFault } from '../src/core/sync-issue';
const jobs=[{id:'drive',name:'Drive',kind:'gdrive' as const},{id:'git',name:'Git',kind:'git' as const},{id:'other',name:'Other',kind:'webdav' as const}];
test('batch observers are bounded, ready jobs apply independently, and effects never overlap',async()=>{
    const waiting=deferred(),firstTwo=deferred(),finish=deferred();let reads=0,maxReads=0,writes=0,maxWrites=0;const applied:string[]=[];
    const batch=new JobBatch(new AbortController().signal,()=>{}),run=batch.run(jobs,async job=>{reads++;maxReads=Math.max(maxReads,reads);if(reads===2)firstTwo.resolve();if(job.id==='drive')await waiting.promise;reads--;return job.id;},async(job)=>{writes++;maxWrites=Math.max(maxWrites,writes);applied.push(job.id);if(job.id==='git')await finish.promise;writes--;return emptyStats();});
    await firstTwo.promise;for(let i=0;i<10&&!applied.length;i++)await Promise.resolve();assert.equal(applied[0],'git');finish.resolve();waiting.resolve();await run;assert.equal(maxReads,2);assert.equal(maxWrites,1);assert.equal(batch.snapshot().every(job=>job.outcome==='success'),true);
});
test('only shared integrity failures block queued writers; a provider/auth failure retains its job identity',async()=>{
    for(const shared of [false,true]){const batch=new JobBatch(new AbortController().signal,()=>{}),applied:string[]=[];
        const result=await batch.run(jobs,async job=>job.id,async job=>{applied.push(job.id);if(job.id==='drive')throw new SyncFault(shared?'operation-journal':'auth-required','blocked',shared?'session':'source');return emptyStats();});
        assert.equal(applied.includes('git'),!shared);assert.equal(result[0].stats.problems![0].connectionId,'drive');assert.equal(batch.snapshot().find(job=>job.connectionId==='git')?.outcome,shared?'blocked':'success');}
});
test('job observers and projection listeners cannot turn a provider failure into foreign writes or stop healthy work',async()=>{
    const applied:string[]=[];const batch=new JobBatch(new AbortController().signal,()=>{},()=>{throw Error('listener failed');});
    const result=await batch.run(jobs,async job=>{if(job.id==='drive')throw new SyncFault('network','offline','source',true);return job.id;},async job=>{applied.push(job.id);return emptyStats();});assert.deepEqual(applied,['git','other']);assert.equal(result[0].stats.failed,1);
});
test('symbolic direction checking covers filtered descendants hidden by an exact-file override',()=>{
    const profiles=[...STANDARD_PROFILES],policy={version:1 as const,mirror:false,folders:[],defaultSource:'drive',assignments:[{scope:'vault' as const,path:'',profileId:'standard:drive-bidirectional'},
        {scope:'folder' as const,path:'Notes',source:'git',names:['a.md']},{scope:'file' as const,path:'Notes/a.md',source:'drive',profileId:'standard:preserve'}]};
    const connections=[{id:'drive',name:'Drive',kind:'gdrive' as const,values:{authMode:'oauth-desktop'}},{id:'git',name:'Git',kind:'git' as const,values:{}}];
    assert.throws(()=>validateProfileConnections(policy,profiles,connections),/Bidirectional profiles require/);assert(symbolicRulePaths(compileProfiles(policy,profiles).fileRules!).some(path=>path.startsWith('Notes/')&&path.split('/').length>2&&path.endsWith('/a.md')));
});
test('inverse collisions are found before inventory, while disjoint exact-name mounts remain writable',()=>{
    const base={version:1 as const,mirror:false,folders:[],defaultSource:'drive',fileRules:[{scope:'vault' as const,path:'',source:'drive',direction:'bidirectional' as const,write:'preserve' as const},
        {scope:'folder' as const,path:'Notes',source:'drive',remotePath:'Library',direction:'bidirectional' as const,write:'changes' as const},
        {scope:'folder' as const,path:'Archive',source:'drive',remotePath:'Library',direction:'bidirectional' as const,write:'changes' as const}]};
    assert(new JobPolicy(base,'drive').writerBlocked('drive'));const disjoint={...base,fileRules:base.fileRules.map((rule,i)=>i===0?rule:{...rule,names:[i===1?'a.md':'b.md']})};assert(!new JobPolicy(disjoint,'drive').writerBlocked('drive'));
});
test('plugin package ownership and required directory boundaries include future packages and absent files',()=>{
    const policy={version:1 as const,mirror:false,folders:[],defaultSource:'git',fileRules:[{scope:'vault' as const,path:'',source:'git'},{scope:'folder' as const,path:'.obsidian/plugins',source:'drive',names:['main.js']}]};
    const authority=new JobPolicy(policy,'git');assert(authority.issues.some(issue=>issue.code==='package-ownership'));assert(authority.directoryPaths.has('.obsidian/plugins'));
    const path=authority.issues.find(issue=>issue.code==='package-ownership')!.path+'/main.js';assert(pathPolicy().withBlockedTargets(authority.blocksFor('git')).blockReason(path));
});
test('mapped directory reservations apply to final local paths and protect case/NFC aliases without taking sibling scope',()=>{
    const authority=new JobPolicy({version:1,mirror:false,defaultSource:'git',folders:[{path:'Remote',include:'inherit',target:{kind:'move',localPath:'Vault'}},{path:'Remote/Deep',include:'include'}]},'git');
    assert(authority.directoryPaths.has('Vault'));assert(authority.directoryPaths.has('Vault/Deep'));assert(!authority.directoryPaths.has('Remote'));
    const blocks=[{path:'É/held.md',ancestors:true,descendants:true,reason:'held'}],policy=pathPolicy().withBlockedTargets(blocks),snapshot=policy.snapshot().forSources(['git'],'git',[]);blocks[0].path='elsewhere';
    assert.equal(snapshot.blockReason('e\u0301'),'held');assert.equal(snapshot.blockReason('é/HELD.MD/new'),'held');assert.equal(snapshot.blockReason('É/other.md'),undefined);assert(overlapsPhysical('A','a/child'));
});
test('shared pending mutations reserve ancestors across namespaces, while disjoint targets remain writable',async()=>{
    const f=fixture();await f.store.begin({id:'old',planId:'old',namespace:'retired',path:'Parent',kind:'write',before:MISSING,after:await versionOf(ab('old')),status:'committing',createdAt:1});
    await assert.rejects(()=>f.mutations.write('new',{id:'new',planId:'new',path:'parent/child.md',before:MISSING,guard:()=>{}},ab('new')),(error:any)=>error.code==='recovery-overlap');
    await f.mutations.write('new',{id:'independent',planId:'independent',path:'other.md',before:MISSING,guard:()=>{}},ab('safe'));assert(f.files.has('other.md'));assert(!f.files.has('parent/child.md'));
});
test('scoped recovery cannot close or fail another owner unresolved local effect',async()=>{
    const f=fixture();await f.store.begin({id:'foreign',planId:'foreign',namespace:'test',path:'Other/held.md',kind:'write',before:MISSING,after:await versionOf(ab('planned')),status:'committing',createdAt:1});f.files.set('Other/held.md',ab('user changed'));
    await f.mutations.recover('test',undefined,record=>record.path.startsWith('Mine/'));assert.equal(f.store.records()[0].status,'committing');assert.equal(new TextDecoder().decode(f.files.get('Other/held.md')),'user changed');
});

test('local directory proof catches file/dir case and NFC aliases without walking unrelated folders or reading bytes',async()=>{
    const {localDirectoryBlocks}=await import('../src/core/local-job-authority');const f=fixture(),visited:string[]=[];f.files.set('Git',ab('private'));f.dirs.add('Other');const list=f.vault.list!;
    f.vault.list=async path=>{visited.push(path);return list(path);};f.vault.readBinary=async()=>{assert.fail('directory proof must not read content');};
    const blocks=await localDirectoryBlocks(f.vault,['git/Deep'],new AbortController().signal);assert.equal(blocks[0].reason,'local-parent-collision');assert.deepEqual(visited,['']);
    f.files.delete('Git');f.dirs.add('É');const alias=await localDirectoryBlocks(f.vault,['e\u0301/Deep'],new AbortController().signal);assert.equal(alias[0].reason,'local-directory-alias');
});
test('indexed block snapshots do not share caller mutations and protect deep descendants without taking sibling directories',()=>{
    const blocks=Array.from({length:5000},(_,i)=>({path:`Scope${i}/held.md`,descendants:true,ancestors:true,reason:'held'}));const policy=pathPolicy().withBlockedTargets(blocks),fork=policy.forSources(['mine'],'mine',[]);blocks[4999].path='mutated';
    assert.equal(fork.blockReason('Scope4999'),'held');assert.equal(fork.blockReason('scope4999/HELD.md/a'),'held');assert.equal(fork.blockReason('Scope4999/other.md'),undefined);assert.equal(fork.blockReason('Scope5000/a.md'),undefined);
});
test('failed local directory metadata blocks its own group while readable siblings and root files retain usable proofs',async()=>{
    const {localDirectoryBlocks}=await import('../src/core/local-job-authority');const f=fixture();f.dirs.add('Private');f.dirs.add('Other');const list=f.vault.list!;f.vault.list=async path=>{if(path==='Private')throw Error('EACCES');return list(path);};
    const blocks=await localDirectoryBlocks(f.vault,['Private','Other'],new AbortController().signal,['Private/a.md','Other/b.md','root.md']);assert(blocks.some(block=>block.path==='Private/a.md'&&block.reason==='local-directory-unavailable'));assert(!blocks.some(block=>block.path==='Other/b.md'||block.path==='root.md'));
});
test('read observation deadlines settle a noncooperative source, release slots and ignore late data',async()=>{
    const late=deferred<string>(),applied:string[]=[],observed:string[]=[];const batch=new JobBatch(new AbortController().signal,()=>{},undefined,{observeTimeoutMs:10,observed:job=>observed.push(job.id)});
    const result=await batch.run(jobs,async job=>job.id==='drive'?late.promise:job.id,async job=>{applied.push(job.id);return emptyStats();});assert.equal(result[0].stats.problems![0].code,'observe-timeout');assert.deepEqual(applied,['git','other']);assert.equal(observed.length,3);late.resolve('late');await Promise.resolve();assert(!applied.includes('drive'));
});
test('cancellation releases both queued observers and inter-job metadata dependencies without applying late results',async()=>{
    const controller=new AbortController(),hold=deferred(),all=deferred();let observed=0,applied=0;const batch=new JobBatch(controller.signal,()=>{},undefined,{observed:()=>{if(++observed===3)all.resolve();}});
    const run=batch.run(jobs,async job=>{if(job.id!=='git')await hold.promise;return job.id;},async()=>{applied++;return emptyStats();},async(_job,_snapshot,signal)=>{const {awaitJobObservation}=await import('../src/core/job-runtime');await awaitJobObservation(all.promise,signal);});
    await Promise.resolve();controller.abort();const result=await run;assert.equal(applied,0);assert(result.every(job=>job.stats.outcome==='cancelled'));hold.resolve();
});
