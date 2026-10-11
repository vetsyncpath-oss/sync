import test from 'node:test';
import assert from 'node:assert/strict';
import Plugin from '../main';

function host(mode = 'full-vault') {
    const p: any = Object.create(Plugin.prototype);
    p.builtSourceId = 'source-a';
    p.settings = { syncMode: mode, syncPolicies: {}, allowedFolders: '', ignoredFolders: '', mirrorLevel: 'fetch' };
    p.pluginDir = () => '.obsidian/plugins/sync';
    p.saveSettingsImmediate = async () => {};
    p.coordinator = { setSyncPolicy: () => {} };
    return p;
}
const rules = [{scope:'vault',path:'',write:'preserve',delete:'keep'}] as const;
test('saving new rules retains config-only scope and leaves defaults untouched',async()=>{
    const p = host('config-only');
    await p.saveFileRules('source-a', structuredClone(rules));
    const policy = p.settings.syncPolicies['source-a'];
    assert(policy.folders.some((f:any)=>f.path===''&&f.include==='exclude'));
    assert(policy.folders.some((f:any)=>f.path==='.obsidian'&&f.include==='include'));
    assert.equal(p.settings.mirrorLevel,'fetch');
    assert.equal(p.settings.allowPlugins,undefined);assert.equal(p.settings.autoSyncInterval,undefined);
});
test('save failure restores previous policy, cross-source save is rejected',async()=>{
    const p = host();const previous={version:1,mirror:false,folders:[],fileRules:[]};p.settings.syncPolicies['source-a']=previous;
    p.saveSettingsImmediate=async()=>{throw new Error('disk full');};
    await assert.rejects(()=>p.saveFileRules('source-a', structuredClone(rules)),/disk full/);
    assert.equal(p.settings.syncPolicies['source-a'],previous);
    await assert.rejects(()=>p.saveFileRules('source-b', structuredClone(rules)),/Source changed/);
});
test('saving source rules retains other sources and structure presets retain rules',async()=>{
    const p=host();p.settings.syncPolicies['source-b']={version:1,mirror:false,folders:[]};
    const other=structuredClone(p.settings.syncPolicies['source-b']);
    await p.saveFileRules('source-a', structuredClone(rules));
    await p.applyStructurePreset('obsidian',p.pluginDir());
    assert.deepEqual(p.settings.syncPolicies['source-a'].fileRules,rules);
    assert.deepEqual(p.settings.syncPolicies['source-b'],other);
});
