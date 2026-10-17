import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { App } from 'obsidian';
import { DriveLifecycleModal } from '../src/ui/drive-lifecycle-modal';
import type { DriveInboxEntry, DriveResolution } from '../src/core/drive-state';
import { sha } from './helpers';
const entry=(path='a.md',reason:DriveInboxEntry['reason']='drive-unavailable'):DriveInboxEntry=>({id:'inbox',path,remotePath:path,originId:'original',candidateId:'replacement',reason,local:{kind:'missing'},revision:1,createdAt:1,updatedAt:1,remoteVersion:'2',remoteHash:sha('base'),remoteTrashed:true,canRestore:true});
const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
const setup=()=>{const {document,window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document,window});return document;};
const find=(root:HTMLElement,pattern:RegExp)=>{const button=Array.from(root.querySelectorAll('button')).find(b=>pattern.test(b.textContent??''));assert(button);return button;};
test('Drive history shows original and replacement IDs as text and never probes or resolves merely by opening',async()=>{
    setup();let probes=0,resolutions=0;const modal=new DriveLifecycleModal(new App(),{load:async()=>[{namespace:'pair',inbox:[entry('<img src=x>')],tombstones:[]}],probe:async()=>{probes++;},restore:async()=>{resolutions++;},isRunning:()=>false});
    modal.open();await tick();assert(modal.contentEl.textContent?.includes('original'));assert(modal.contentEl.textContent?.includes('replacement'));assert.equal(modal.contentEl.querySelector('img'),null);assert.equal(probes,0);assert.equal(resolutions,0);assert(!Array.from(modal.contentEl.querySelectorAll('button')).some(b=>/Restore original|Восстановить прежний/.test(b.textContent??'')));modal.close();
});
test('a read-only probe is scoped by retained namespace and path, with duplicate actions disabled while pending',async()=>{
    setup();let resolve!:()=>void;const probes:[string,string][]=[];const modal=new DriveLifecycleModal(new App(),{load:async()=>[{namespace:'inactive-pair',inbox:[entry()],tombstones:[]}],probe:async(...args)=>{probes.push(args);await new Promise<void>(r=>resolve=r);},restore:async()=>{throw Error('unexpected restore');},isRunning:()=>false});
    modal.open();await tick();find(modal.contentEl,/Check access|Проверить доступ/).click();await tick();assert.deepEqual(probes,[['inactive-pair','a.md']]);assert(find(modal.contentEl,/Check access|Проверить доступ/).disabled);resolve();await tick();assert(!find(modal.contentEl,/Check access|Проверить доступ/).disabled);modal.close();
});
test('restore preview freezes the displayed evidence, requires an explicit click and retains failed decisions',async()=>{
    const document=setup(),observed=entry('a.md','drive-deleted-review');let resolution:DriveResolution|undefined;
    const modal=new DriveLifecycleModal(new App(),{load:async()=>[{namespace:'pair',inbox:[observed],tombstones:[]}],probe:async()=>{},restore:async r=>{resolution=r;throw Error('decision-stale');},isRunning:()=>false});modal.open();await tick();
    find(modal.contentEl,/Restore original|Восстановить прежний/).click();assert.equal(resolution,undefined);observed.revision=2;
    const confirm=Array.from(document.querySelectorAll('button')).find(b=>/Confirm restore|Подтвердить восстановление/.test(b.textContent??''))!;assert(confirm);confirm.click();await tick();
    assert.equal(resolution!.entry.revision,1);assert.equal(resolution!.namespace,'pair');assert(modal.contentEl.textContent?.includes('decision-stale'));assert(document.body.textContent?.includes('Confirm restore')||document.body.textContent?.includes('Подтвердить восстановление'));modal.close();
});
test('quiet tombstone becomes a restore preview only after explicit fresh probing; missing permissions disable restore',async()=>{
    setup();let inbox:DriveInboxEntry[]=[];const tombstone={id:'deletion',path:'a.md',baseline:{localHash:sha('base'),remoteHash:sha('base'),remoteId:'original',remoteVersion:'1',remotePath:'a.md'},remoteVersion:'2',deletedAt:1,evidence:'explicit-trash' as const,localMissing:true as const};
    const modal=new DriveLifecycleModal(new App(),{load:async()=>[{namespace:'pair',inbox,tombstones:[tombstone]}],probe:async()=>{inbox=[entry('a.md','drive-deleted-review')];inbox[0].canRestore=false;},restore:async()=>{throw Error('unexpected restore');},isRunning:()=>false});modal.open();await tick();assert(modal.contentEl.textContent?.includes('original'));
    find(modal.contentEl,/Check access|Проверить доступ/).click();await tick();assert(!Array.from(modal.contentEl.querySelectorAll('button')).some(b=>/Restore original|Восстановить прежний/.test(b.textContent??'')));modal.close();
});
test('history read failure preserves visible history and reports the failure; closing never acknowledges inbox entries',async()=>{
    setup();let fail=false,probes=0;const modal=new DriveLifecycleModal(new App(),{load:async()=>{if(fail)throw Error('corrupt checkpoint');return [{namespace:'pair',inbox:[entry()],tombstones:[]}];},probe:async()=>{probes++;},restore:async()=>{},isRunning:()=>false});modal.open();await tick();fail=true;
    find(modal.contentEl,/Refresh history|Обновить историю/).click();await tick();assert(modal.contentEl.textContent?.includes('corrupt checkpoint'));assert(modal.contentEl.textContent?.includes('original'));modal.close();assert.equal(probes,0);
});
test('proposal-only history displays retained original and copy IDs without implicit actions',async()=>{
 setup();let actions=0;
 const proposal={id:'p',proposalId:'p',originId:'origin-id',path:'a.md',remotePath:'a.md',copyPath:'<img src=x>.md',copyRemotePath:'copy.md',copyId:'copy-id',hash:sha('local'),baseHash:sha('remote'),baseVersion:'1',kind:'gated-upload' as const,portable:true,status:'published' as const,needsReview:true};
 const modal=new DriveLifecycleModal(new App(),{load:async()=>[{namespace:'pair',inbox:[],tombstones:[],proposals:[proposal]}],probe:async()=>{actions++;},restore:async()=>{actions++;},isRunning:()=>false});
 modal.open();await tick();assert(modal.contentEl.textContent?.includes('origin-id'));assert(modal.contentEl.textContent?.includes('copy-id'));assert(modal.contentEl.textContent?.includes(proposal.copyPath));assert.equal(modal.contentEl.querySelector('img'),null);assert.equal(actions,0);modal.close();assert.equal(actions,0);
});
