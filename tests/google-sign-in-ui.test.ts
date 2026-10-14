import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {App} from 'obsidian';
import {SourceConnectionModal} from '../src/ui/source-connection-modal';
import type {GoogleConnectionActions} from '../src/ui/gdrive-folder-picker';
import {waitForGoogle,type GoogleSignInEvent} from '../src/auth/google-auth';
import {SyncFault} from '../src/core/sync-issue';
import {i18n} from '../src/i18n';

const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function editor(actions:GoogleConnectionActions){
    const {document,window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document,window});i18n.setLocale('en');
    const source={id:'drive',name:'Drive',kind:'gdrive' as const,values:{authMode:'oauth-desktop',clientId:'test.apps.googleusercontent.com',folderId:'folder'}};
    const modal=new SourceConnectionModal(new App(),source,()=>{},actions);modal.open();return {modal,source};
}
function click(modal:SourceConnectionModal,label:string){
    const button=Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.textContent===label);
    assert(button,`Missing button: ${label}`);assert(!button.disabled);button.click();
}
test('browser waiting offers a transferable URL, cancels without discarding the editor, and accepts a fresh attempt',async()=>{
    let calls=0,signal!:AbortSignal,late!:(event:GoogleSignInEvent)=>void;
    const {modal,source}=editor({signIn:async(_values,current,observe)=>{calls++;signal=current;late=observe!;
        observe?.({stage:'waiting-browser',authorizationUrl:`https://accounts.google.com/o/oauth2/v2/auth?state=attempt-${calls}`});
        return waitForGoogle(new Promise<Record<string,unknown>>(()=>{}),current);},pickFolder:async()=>undefined});
    click(modal,'Sign in with Google');await flush();
    assert.match(modal.contentEl.textContent??'',/Synchronization has not started/);
    assert.match(modal.contentEl.textContent??'',/accounts.google.ru\/SetSID/);
    assert.equal(modal.contentEl.querySelector<HTMLInputElement>('input[readonly]')!.value,'https://accounts.google.com/o/oauth2/v2/auth?state=attempt-1');
    const old=late;click(modal,'Cancel sign-in');await flush();assert(signal.aborted);assert(document.body.contains(modal.contentEl));
    assert.match(modal.contentEl.textContent??'',/Sign-in cancelled/);assert.equal(modal.contentEl.querySelector('input[readonly]'),null);
    click(modal,'Sign in with Google');await flush();assert.equal(calls,2);
    old({stage:'exchanging-code'});assert.match(modal.contentEl.textContent??'',/Waiting for browser sign-in/);
    assert.equal((source.values as any).secretRef,undefined);modal.close();await flush();assert(signal.aborted);
});
test('callback progress clears the browser URL and only a completed grant authorizes the draft',async()=>{
    let progress!:(event:GoogleSignInEvent)=>void,complete!:(values:Record<string,unknown>)=>void;
    const {modal,source}=editor({signIn:async(_values,signal,observe)=>{progress=observe!;
        observe?.({stage:'waiting-browser',authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state=current'});
        return waitForGoogle(new Promise<Record<string,unknown>>(resolve=>complete=resolve),signal);},pickFolder:async()=>undefined});
    click(modal,'Sign in with Google');await flush();progress({stage:'exchanging-code'});
    assert.match(modal.contentEl.textContent??'',/Completing sign-in/);assert.equal(modal.contentEl.querySelector('input[readonly]'),null);
    complete({accountSub:'subject',secretRef:'ref'});await flush();assert.match(modal.contentEl.textContent??'',/Account authorized/);
    assert.equal((source.values as any).secretRef,undefined);modal.onClose();
});
test('sign-in timeout shows a persistent actionable error and enables another attempt',async()=>{
    const {modal}=editor({signIn:async()=>{throw new SyncFault('oauth-timeout','Timeout','source');},pickFolder:async()=>undefined});
    click(modal,'Sign in with Google');await flush();assert.match(modal.contentEl.textContent??'',/within 5 minutes/);
    const sign=Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.textContent==='Sign in with Google')!;
    assert(!sign.disabled);assert.equal(modal.contentEl.querySelector('input[readonly]'),null);modal.close();
});
