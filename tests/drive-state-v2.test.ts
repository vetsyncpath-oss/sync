import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveStateStore, driveRecoveryReferences, type DriveIntent } from '../src/core/drive-state';
import { sha256Hex } from '../src/core/hasher';
import { fsMemory, ab, sha } from './helpers';
import { fixture } from './helpers';
const namespace='migration',filename=(n:number)=>`drive-state-${namespace}-${String(n).padStart(16,'0')}.json`;
const envelope=async(value:unknown)=>{const payload=JSON.stringify(value);return JSON.stringify({payload,sha256:await sha256Hex(ab(payload))});};
async function legacy(){
    const memory=fsMemory(),id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',ref={path:'private/recovery/payload',sha256:sha('mine'),size:4};
    const intent:DriveIntent={id,path:'constructor',remotePath:'Library/constructor',kind:'conflict',local:{kind:'file',sha256:ref.sha256,size:4},
        remoteId:'remote',remoteVersion:'7',remoteHash:sha('base'),bytes:ref,copyBytes:ref,copyId:'reserved-copy',
        copyPath:`constructor.conflict-drive-local-${id}`,copyRemotePath:`Library/constructor.conflict-drive-local-${id}`,copyLocal:{kind:'missing'},
        copyUpload:{url:'https://www.googleapis.com/upload/drive/v3/files?upload_id=secret',offset:262144,size:524288,fileId:'reserved-copy'},
        directories:JSON.parse('{"__proto__":"reserved-parent"}'),reviewRequired:true};
    const state={version:1,sequence:1,baseline:{constructor:{localHash:sha('base'),remoteHash:sha('base'),remoteId:'remote',remoteVersion:'7',remotePath:'Library/constructor'}},
        pending:{constructor:intent},reviews:{other:{copyId:'old-review',copyPath:'other.conflict-old.md',hash:sha('old')}}};
    const original=await envelope(state);memory.files.set(filename(1),original);return {memory,state,intent,original};
}
test('Drive v1 import preserves pending publication identity, offsets, directories and review history without writes',async()=>{
    const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();
    assert.equal(f.memory.files.size,1);assert.equal(f.memory.files.get(filename(1)),f.original);assert.equal(store.snapshot().version,3);
    const pending=store.pending('constructor')!;assert.deepEqual(pending.copyUpload,f.intent.copyUpload);assert.deepEqual(pending.bytes,f.intent.bytes);
    assert.equal(pending.copyId,'reserved-copy');assert.equal(pending.directories!['__proto__'],'reserved-parent');assert.equal(pending.proposalId,f.intent.id);
    assert.equal(store.proposals('constructor')[0].portable,false);assert.equal(store.proposals('other')[0].copyId,'old-review');
    const reload=new DriveStateStore(f.memory.fs,namespace);await reload.load();assert.deepEqual(reload.snapshot(),store.snapshot());
});
test('first current-schema publication verifies a retained v1 backup before retiring generations and fences a v1 reader',async()=>{
    const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();
    await store.save(s=>{delete s.pending[f.intent.path];});await store.save(()=>{});await store.save(()=>{});
    const backup=f.memory.files.get(`drive-state-${namespace}-v1-backup.json`)!;assert(backup);
    const saved=JSON.parse(JSON.parse(backup).payload);assert.equal(saved.checkpoints[0].json,f.original);
    assert.equal(f.memory.files.has(filename(1)),false);
    const latest=JSON.parse(JSON.parse(f.memory.files.get(filename(4))!).payload);assert.equal(latest.version,3);assert.notEqual(latest.version,1,'old reader must reject before effects');
    const refs=await driveRecoveryReferences(f.memory.fs);assert(refs.some(r=>r.sha256===f.intent.bytes!.sha256));
    const reload=new DriveStateStore(f.memory.fs,namespace);await reload.load();assert.equal(reload.proposals('other').length,1);
});
test('backup write failure leaves v1 active and prevents a current-schema checkpoint',async()=>{
    const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();
    const write=f.memory.fs.write;f.memory.fs.write=async(path,data)=>{if(path.includes('v1-backup'))throw Error('disk full');await write(path,data);};
    await assert.rejects(()=>store.save(()=>{}),/disk full/);assert.equal(store.snapshot().sequence,1);assert.equal(f.memory.files.size,1);
});
test('a crash after verified backup resumes with one stable import and no duplicate proposal IDs',async()=>{
    const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();
    const write=f.memory.fs.write;f.memory.fs.write=async(path,data)=>{if(path===filename(2)+'.tmp')throw Error('crash');await write(path,data);};
    await assert.rejects(()=>store.save(()=>{}),/crash/);assert(f.memory.files.has(`drive-state-${namespace}-v1-backup.json`));
    f.memory.fs.write=write;const retry=new DriveStateStore(f.memory.fs,namespace);await retry.load();await retry.save(()=>{});
    assert.equal(Object.keys(retry.snapshot().proposals).length,2);assert.equal(retry.pending('constructor')?.copyId,'reserved-copy');
});
test('unsupported checkpoints and corrupt migration backups block effects or GC rather than resetting history',async()=>{
    const f=await legacy();f.memory.files.set(filename(2),await envelope({...f.state,sequence:2,version:4}));
    await assert.rejects(()=>new DriveStateStore(f.memory.fs,namespace).load(),/Invalid Drive checkpoint/);
    await assert.rejects(()=>driveRecoveryReferences(f.memory.fs),/Invalid Drive checkpoint/);
    f.memory.files.delete(filename(2));f.memory.files.set(`drive-state-${namespace}-v1-backup.json`,'{}');
    const store=new DriveStateStore(f.memory.fs,namespace);await assert.rejects(()=>store.load(),/backup checksum/);
    await assert.rejects(()=>driveRecoveryReferences(f.memory.fs),/backup checksum/);
});
test('migration backups remain GC roots even without current checkpoint files',async()=>{
    const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();await store.save(()=>{});
    for(const name of [...f.memory.files.keys()])if(/-\d{16}\.json$/.test(name))f.memory.files.delete(name);
    const refs=await driveRecoveryReferences(f.memory.fs);assert(refs.some(r=>r.path===f.intent.bytes!.path));
    await assert.rejects(()=>new DriveStateStore(f.memory.fs,namespace).load(),/empty-history writes are blocked/);
});

test('a legacy writer advancing after backup and before the current-schema fence cannot silently reuse an incomplete import backup',async()=>{
    const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();const write=f.memory.fs.write;
    f.memory.fs.write=async(path,data)=>{if(path===filename(2)+'.tmp')throw Error('crash before fence');await write(path,data);};
    await assert.rejects(()=>store.ensureWriterVersion(),/crash before fence/);f.memory.fs.write=write;
    const advanced={...f.state,sequence:2,pending:{constructor:{...f.intent,bytes:{path:'private/recovery/later',sha256:sha('later'),size:5}}}};
    f.memory.files.set(filename(2),await envelope(advanced));const reload=new DriveStateStore(f.memory.fs,namespace);
    await assert.rejects(()=>reload.load(),/legacy writer advanced/);assert.equal(f.memory.files.has(filename(3)),false);
    const refs=await driveRecoveryReferences(f.memory.fs);assert(refs.some(r=>r.sha256===sha('later')));assert(refs.some(r=>r.sha256===f.intent.bytes!.sha256));
});

test('legacy review hashes protect existing recovery blobs even without a payload pointer or retained operation record',async()=>{
    const f=await legacy(),host=fixture(),ref=await host.recovery.save(ab('old'));
    await host.recovery.save(ab('unreferenced'));const refs=await driveRecoveryReferences(f.memory.fs,host.recovery);
    assert(refs.some(r=>r.path===ref.path&&r.size===3));await host.recovery.collectUnreferenced(refs,Date.now()+1);
    assert(host.files.has(ref.path));assert.equal([...host.files.keys()].filter(p=>p.endsWith('.bin')).length,1);
});

test('invalid locator types and missing mandatory proposal payloads are rejected at load before any runner can act',async()=>{
    const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();await store.ensureWriterVersion();const valid=store.snapshot();
    const malformed:any[]=[{...valid,baseline:{constructor:{...valid.baseline.constructor,remoteId:42}}},
        {...valid,proposals:{[f.intent.id]:{...valid.proposals[f.intent.id],path:42}}},
        {...valid,proposals:{[f.intent.id]:{...valid.proposals[f.intent.id],portable:true,payload:undefined}}}];
    for(const value of malformed){f.memory.files.set(filename(2),await envelope(value));await assert.rejects(()=>new DriveStateStore(f.memory.fs,namespace).load(),/Invalid Drive/);}
});

async function v2(){const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();
    const {inbox,tombstones,...state}=store.snapshot();const previous={...state,version:2,artifacts:{received:{id:'received',proposalId:'peer-proposal',originId:'remote',path:'peer-copy',originPath:'constructor',remotePath:'peer-copy',hash:sha('peer'),remoteVersion:'8',issue:'artifact-local-edited',localHash:sha('edit')}}};const original=await envelope(previous);f.memory.files.set(filename(1),original);return {...f,state:previous,original};}
test('Drive v2 import preserves every proposal, receipt and pending reservation; v3 fencing pins a verified v2 backup',async()=>{
    const f=await v2(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();assert.equal(f.memory.files.size,1);assert.equal(store.snapshot().version,3);
    assert.deepEqual(store.pending('constructor')!.copyUpload,f.intent.copyUpload);assert.equal(store.proposals('constructor')[0].copyId,'reserved-copy');assert.equal(store.artifact('received')!.issue,'artifact-local-edited');
    await store.ensureWriterVersion();const raw=f.memory.files.get(`drive-state-${namespace}-v2-backup.json`)!;const backup=JSON.parse(JSON.parse(raw).payload);assert.equal(backup.checkpoints[0].json,f.original);
    assert.equal(JSON.parse(JSON.parse(f.memory.files.get(filename(2))!).payload).version,3);await store.save(()=>{});await store.save(()=>{});
    assert.equal(f.memory.files.has(filename(1)),false);assert.equal(f.memory.files.get(`drive-state-${namespace}-v2-backup.json`),raw);
    const refs=await driveRecoveryReferences(f.memory.fs);assert(refs.some(r=>r.path===f.intent.copyBytes!.path));
});
test('v2 backup failure and a legacy writer advancing after a pre-fence crash cannot reset or retire old state',async()=>{
    const f=await v2(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();const write=f.memory.fs.write;
    f.memory.fs.write=async(path,raw)=>{if(path.includes('v2-backup'))throw Error('backup full');await write(path,raw);};await assert.rejects(()=>store.ensureWriterVersion(),/backup full/);assert.equal(store.snapshot().sequence,1);
    f.memory.fs.write=async(path,raw)=>{if(path===filename(2)+'.tmp')throw Error('crash');await write(path,raw);};await assert.rejects(()=>store.ensureWriterVersion(),/crash/);f.memory.fs.write=write;
    f.memory.files.set(filename(2),await envelope({...f.state,sequence:2}));await assert.rejects(()=>new DriveStateStore(f.memory.fs,namespace).load(),/legacy writer advanced/);
});
test('v2-only migration backup remains a GC root and blocks empty active history; corrupt v2 backup blocks collection',async()=>{
    const f=await v2(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();await store.ensureWriterVersion();
    for(const name of [...f.memory.files.keys()])if(/-\d{16}\.json$/.test(name))f.memory.files.delete(name);
    assert((await driveRecoveryReferences(f.memory.fs)).some(r=>r.path===f.intent.copyBytes!.path));await assert.rejects(()=>new DriveStateStore(f.memory.fs,namespace).load(),/empty-history writes/);
    f.memory.files.set(`drive-state-${namespace}-v2-backup.json`,'{}');await assert.rejects(()=>driveRecoveryReferences(f.memory.fs),/backup checksum/);
});
test('a checkpoint version regression after a current-schema writer is rejected even without an earlier v2 backup',async()=>{
    const memory=fsMemory(),store=new DriveStateStore(memory.fs,namespace);await store.load();await store.ensureWriterVersion();
    memory.files.set(filename(2),await envelope({version:2,sequence:2,baseline:{},pending:{},proposals:{},artifacts:{}}));await assert.rejects(()=>new DriveStateStore(memory.fs,namespace).load(),/schema regressed/);
});
test('tombstone recovery payloads remain physical GC roots after pending intent and baseline are retired',async()=>{
    const host=fixture(),ref=await host.recovery.save(ab('deleted content')),store=new DriveStateStore(host.memory.fs,namespace);await store.load();
    await store.save(s=>{s.tombstones['constructor']={id:'deletion',path:'constructor',baseline:{localHash:sha('base'),remoteHash:sha('base'),remoteId:'original',remoteVersion:'1',remotePath:'constructor'},
        remoteVersion:'2',deletedAt:1,evidence:'explicit-trash',localMissing:true,payload:ref};});await store.save(()=>{});await store.save(()=>{});
    const reload=new DriveStateStore(host.memory.fs,namespace);await reload.load();assert.equal(reload.tombstone('constructor')!.baseline.remoteId,'original');assert.equal(reload.baseline('constructor'),undefined);
    await host.recovery.save(ab('unreferenced'));const refs=await driveRecoveryReferences(host.memory.fs,host.recovery);await host.recovery.collectUnreferenced(refs,Date.now()+1);
    assert(host.files.has(ref.path));assert.equal(strBytes(await host.recovery.read(ref)),'deleted content');
});
function strBytes(bytes:ArrayBuffer){return new TextDecoder().decode(bytes);}
test('corrupt lifecycle evidence cannot enable a restore or conflicting baseline',async()=>{
    const memory=fsMemory(),store=new DriveStateStore(memory.fs,namespace);await store.load();await store.ensureWriterVersion();const state=store.snapshot();
    const entry={id:'unknown',path:'constructor',remotePath:'constructor',originId:'original',reason:'drive-unavailable',local:{kind:'missing'},revision:1,createdAt:1,updatedAt:1};
    for(const corrupt of [{...entry,revision:0},{...entry,originId:42},{...entry,remoteHash:'md5'},{...entry,remoteTrashed:'true'}]){
        memory.files.set(filename(1),await envelope({...state,inbox:{constructor:corrupt}}));await assert.rejects(()=>new DriveStateStore(memory.fs,namespace).load(),/Invalid Drive inbox/);
    }
});
