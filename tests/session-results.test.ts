import test from 'node:test';
import assert from 'node:assert/strict';
import Plugin from '../main';
import {emptyStats} from '../src/core/job-runtime';
import {fixture,entry} from './helpers';
import {SyncFault} from '../src/core/sync-issue';

function host(){
    const plugin=Object.create(Plugin.prototype) as any,entries:any[]=[];
    Object.assign(plugin,{vam:{isGranted:()=>true},governance:{status:'ok'},sessionController:new AbortController(),
        settings:{lastSyncTime:0,totalSyncCount:0},statusBar:{setState:()=>{},setLastSync:()=>{}},
        assertNetworkAllowed:()=>true,notifyVaultSync:()=>{},saveSettingsImmediate:async()=>{},
        recordJournal:async(_trigger:string,stats:any)=>{entries.push(structuredClone(stats));}});
    return {plugin,entries};
}
// Real host session wrapper and coordinator; only the host/VAM/IO ports are mocked.
(globalThis as any).window??={};
test('host records declined coordinator confirmation as cancellation, never successful sync',async()=>{
    const h=host(),f=fixture([entry('a.md')]);f.ui.confirmSync=async()=>false;
    const stats=await h.plugin.runOwnedSession('manual',()=>f.coordinator.sync());
    assert.equal(stats.outcome,'cancelled');assert.equal(h.entries[0].outcome,'cancelled');
    assert.equal(h.plugin.settings.totalSyncCount,0);assert(!f.files.has('a.md'));
});
test('cancellation during preparation returns and records a cancelled result',async()=>{
    const h=host();const stats=await h.plugin.runOwnedSession('auto',async()=>{
        h.plugin.sessionController.abort();h.plugin.sessionController.signal.throwIfAborted();
    });
    assert.equal(stats.outcome,'cancelled');assert.equal(h.entries.length,1);assert.equal(h.entries[0].outcome,'cancelled');
    assert.equal(h.plugin.autoBlockedReason,undefined);assert.equal(h.plugin.settings.totalSyncCount,0);
});
test('prepare failure returns a diagnostic result instead of null',async()=>{
    const h=host();const stats=await h.plugin.runOwnedSession('manual',async()=>{throw new SyncFault('configuration-changed','Changed','session');});
    assert.equal(stats.outcome,'error');assert.equal(stats.problems[0].code,'configuration-changed');assert.equal(h.entries.length,1);
});
test('journal failure preserves confirmed counters and blocks automatic replay',async()=>{
    const h=host();let attempts=0;h.plugin.recordJournal=async()=>{attempts++;throw new SyncFault('journal-save','Disk full','session');};
    const stats=await h.plugin.runOwnedSession('auto',async()=>({...emptyStats(),downloaded:2,uploaded:1,bytesTransferred:20}));
    assert.equal(stats.outcome,'error');assert.equal(stats.downloaded,2);assert.equal(stats.uploaded,1);assert.equal(stats.bytesTransferred,20);
    assert.equal(stats.problems[0].code,'journal-save');assert.equal(h.plugin.autoBlockedReason,'Disk full');assert.equal(attempts,1);
});
test('settings failure retains progress and journal receives failure, not prior success',async()=>{
    const h=host();h.plugin.saveSettingsImmediate=async()=>{throw Error('Disk full');};
    const stats=await h.plugin.runOwnedSession('manual',async()=>({...emptyStats(),downloaded:2}));
    assert.equal(stats.outcome,'error');assert.equal(stats.downloaded,2);assert.equal(h.plugin.settings.totalSyncCount,0);
    assert.equal(h.entries.length,1);assert.equal(h.entries[0].problems[0].code,'settings-save');assert.equal(h.entries[0].downloaded,2);
});

test('mandatory VAM cannot be bypassed by the legacy soft mode flag',async()=>{
    const h=host();h.plugin.vam=undefined;h.plugin.vamSoftMode=true;let invoked=false;
    h.plugin.recordBlockedAttempt=async()=>{};
    assert.equal(await h.plugin.runOwnedSession('manual',async()=>{invoked=true;return emptyStats();}),null);
    assert.equal(invoked,false);
});
test('VAM revocation aborts the session and both coordinator paths',()=>{
    const h=host();let cancelled=0;h.plugin.coordinator={cancel:()=>cancelled++};h.plugin.activeJobRunner={cancel:()=>cancelled++};h.plugin.wakeAutoSync=()=>{};
    h.plugin.onVamRevoked('revoked');
    assert(h.plugin.sessionController.signal.aborted);assert.equal(cancelled,2);
});

test('actual automatic host path does not schedule retry or finishing after preparation cancellation',async()=>{
    const h=host();h.plugin.wakeAutoSync=()=>{};
    h.plugin.prepareSession=async()=>{h.plugin.sessionController.abort();h.plugin.sessionController.signal.throwIfAborted();};
    const result=await h.plugin.runAutoSession(['source'],true);
    assert.equal(result.cancelled,true);assert.equal(result.retryAt,undefined);assert.equal(result.followUp,undefined);
    assert.equal(h.entries.length,1);assert.equal(h.entries[0].outcome,'cancelled');
});
