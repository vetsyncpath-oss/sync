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
    assert.equal(f.memory.files.size,1);assert.equal(f.memory.files.get(filename(1)),f.original);assert.equal(store.snapshot().version,2);
    const pending=store.pending('constructor')!;assert.deepEqual(pending.copyUpload,f.intent.copyUpload);assert.deepEqual(pending.bytes,f.intent.bytes);
    assert.equal(pending.copyId,'reserved-copy');assert.equal(pending.directories!['__proto__'],'reserved-parent');assert.equal(pending.proposalId,f.intent.id);
    assert.equal(store.proposals('constructor')[0].portable,false);assert.equal(store.proposals('other')[0].copyId,'old-review');
    const reload=new DriveStateStore(f.memory.fs,namespace);await reload.load();assert.deepEqual(reload.snapshot(),store.snapshot());
});
test('first v2 publication verifies a retained v1 backup before retiring generations and fences a v1 reader',async()=>{
    const f=await legacy(),store=new DriveStateStore(f.memory.fs,namespace);await store.load();
    await store.save(s=>{delete s.pending[f.intent.path];});await store.save(()=>{});await store.save(()=>{});
    const backup=f.memory.files.get(`drive-state-${namespace}-v1-backup.json`)!;assert(backup);
    const saved=JSON.parse(JSON.parse(backup).payload);assert.equal(saved.checkpoints[0].json,f.original);
    assert.equal(f.memory.files.has(filename(1)),false);
    const latest=JSON.parse(JSON.parse(f.memory.files.get(filename(4))!).payload);assert.equal(latest.version,2);assert.notEqual(latest.version,1,'old reader must reject before effects');
    const refs=await driveRecoveryReferences(f.memory.fs);assert(refs.some(r=>r.sha256===f.intent.bytes!.sha256));
    const reload=new DriveStateStore(f.memory.fs,namespace);await reload.load();assert.equal(reload.proposals('other').length,1);
});
test('backup write failure leaves v1 active and prevents a v2 checkpoint',async()=>{
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
    const f=await legacy();f.memory.files.set(filename(2),await envelope({...f.state,sequence:2,version:3}));
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

test('a legacy writer advancing after backup and before the v2 fence cannot silently reuse an incomplete import backup',async()=>{
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
