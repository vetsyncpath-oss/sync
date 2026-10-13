import test from 'node:test';
import assert from 'node:assert/strict';
import { AcknowledgedSave } from '../src/core/acknowledged-save';
import { effectiveBehavior } from '../src/core/profile-policy';
import { compileProfiles, migrateProfilePolicy, STANDARD_PROFILES, validateProfiles } from '../src/core/profiles';
import { resolveFileRule } from '../src/core/file-rules';

test('an immediate save waits for its snapshot and surfaces its own failure', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => release = r), writes: number[] = [];
    const writer = new AcknowledgedSave<{ value: number }>(async s => { writes.push(s.value); if (s.value === 1) await gate; if (s.value === 2) throw Error('disk full'); });
    const first = writer.save({ value: 1 });
    const value = { value: 2 }; let settled = false;
    const second = writer.save(value); const rejected = assert.rejects(second, /disk full/);
    void second.then(() => settled = true, () => settled = true); value.value = 99;
    await Promise.resolve(); assert.equal(settled, false); assert.deepEqual(writes, [1]);
    release(); await first; await rejected; assert.deepEqual(writes, [1, 2]);
    await writer.save({ value: 3 }); assert.deepEqual(writes, [1, 2, 3]);
});
test('existing profiles preserve creation, deletion and automatic conflict semantics', () => {
    const values = new Map(STANDARD_PROFILES.map(p => [p.id, effectiveBehavior(p)]));
    assert.equal(values.get('standard:preserve')!.protected, true);
    assert.equal(values.get('standard:seed')!.updates, 'none');
    assert.equal(values.get('standard:safe')!.deletions, 'keep');
    assert.deepEqual(values.get('standard:safe')!.conflict, { action: 'keep-local', keepOther: false });
    assert.equal(values.get('standard:source')!.updates, 'enforce-source');
    assert.deepEqual(values.get('standard:conflicts')!.conflict, { action: 'keep-remote', keepOther: true });
    for (const [id,p] of values)if(id!=='standard:drive-bidirectional')assert.equal(p.direction, 'pull');
});
test('migration retains exact file identity and source locator across repeated conversion', () => {
    const profiles = structuredClone([...STANDARD_PROFILES]);
    const policy = {version: 1 as const,mirror:false,folders:[{path:'Private',include:'exclude' as const}],
        mirrorFolders:{'Protected':{state:'off' as const}},fileRules:[{scope:'file' as const,path:'Notes/a.md',write:'remote' as const,source:'docs',remotePath:'source/a.md'}]};
    const next=migrateProfilePolicy(policy,profiles,'test','fetch','keep-both','keep-local');
    const rule=resolveFileRule('Notes/a.md',compileProfiles(next,profiles).fileRules);
    assert.equal(rule.source,'docs');assert.equal(rule.remotePath,'source/a.md');assert.equal(rule.write,'remote');
    assert.deepEqual(next.folders,policy.folders);assert.deepEqual(next.mirrorFolders,policy.mirrorFolders);
    assert.deepEqual(migrateProfilePolicy(next,profiles,'test','full','ask','keep-both'),next);
});
test('bidirectional behavior is explicit and protected children still disable all mutations', () => {
    const p={id:'drive',name:'Drive',direction:'bidirectional' as const,write:'changes' as const,delete:'tracked' as const,conflict:'keep-both' as const};
    validateProfiles([p]);assert.equal(effectiveBehavior(p).deletions,'propagate-trash');
    const rules=compileProfiles({version:1,mirror:false,folders:[],assignments:[{scope:'vault',path:'',profileId:p.id},{scope:'file',path:'secret.json',profileId:'standard:preserve'}]},[...STANDARD_PROFILES,p]).fileRules;
    assert.equal(effectiveBehavior(resolveFileRule('secret.json',rules)).protected,true);
    assert.throws(()=>validateProfiles([{...p,delete:'mirror'}]),/Incompatible/);
});
