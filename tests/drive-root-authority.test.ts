import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDriveRootAuthority } from '../src/core/drive-job-authority';
import { GoogleDriveRoot } from '../src/sources/gdrive-root';
import { DRIVE_FOLDER, type DriveFile, type GoogleDriveClient } from '../src/sources/gdrive-client';
import { SyncFault } from '../src/core/sync-issue';
const folder=(id:string,parent?:string):DriveFile=>({id,name:id,mimeType:DRIVE_FOLDER,parents:parent?[parent]:[],version:'1'});
function client(files:DriveFile[]):GoogleDriveClient {return {inspect:async(id:string)=>{const file=files.find(file=>file.id===id)??(id==='root'?files.find(file=>file.parents.length===0):undefined);if(!file)throw Object.assign(Error('404'),{status:404});return structuredClone(file);}} as unknown as GoogleDriveClient;}
const signal=()=>new AbortController().signal;
test('identical or nested writable Drive roots are blocked across accounts, independently of connection names',async()=>{
    const api=client([folder('root'),folder('child','root')]);
    for(const [own,other] of [['root','root'],['root','child'],['child','root']])await assert.rejects(()=>verifyDriveRootAuthority('A',new GoogleDriveRoot(api,own),[{connectionId:'B',folderId:other}],signal()),(error:any)=>error.code==='remote-ownership');
});
test('verified sibling roots and separate account roots remain disjoint despite a common ancestor or differing clients',async()=>{
    const api=client([folder('root'),folder('left','root'),folder('right','root')]);await verifyDriveRootAuthority('A',new GoogleDriveRoot(api,'left'),[{connectionId:'B',folderId:'right'}],signal());
    await verifyDriveRootAuthority('A',new GoogleDriveRoot(client([folder('private-A')]),'private-A'),[{connectionId:'B',folderId:'root',observed:folder('private-B'),client:client([folder('private-B')])}],signal());
});
test('unselected/unavailable competing roots block Drive writers without attempting another account refresh',async()=>{
    const api=client([folder('root')]),foreign={inspect:async()=>{assert.fail('must not refresh an unobserved foreign account');}} as unknown as GoogleDriveClient;
    await assert.rejects(()=>verifyDriveRootAuthority('A',new GoogleDriveRoot(api,'root'),[{connectionId:'B',folderId:'unavailable',client:foreign}],signal()),(error:any)=>error.code==='remote-ownership');
    await assert.rejects(()=>verifyDriveRootAuthority('A',new GoogleDriveRoot(api,'root'),[{connectionId:'B',folderId:'root',client:foreign}],signal()),(error:any)=>error.code==='remote-ownership');
});
test('a quota failure on the active account keeps its retry classification, and cancellation cannot become a root claim',async()=>{
    const api=client([folder('root')]),inspect=api.inspect;api.inspect=async(id,s)=>{if(id==='other')throw new SyncFault('rate-limit','cooldown','source',true);return inspect(id,s);};
    await assert.rejects(()=>verifyDriveRootAuthority('A',new GoogleDriveRoot(api,'root'),[{connectionId:'B',folderId:'other'}],signal()),(error:any)=>error.code==='rate-limit'&&error.retryable);
    const controller=new AbortController();controller.abort();await assert.rejects(()=>verifyDriveRootAuthority('A',new GoogleDriveRoot(api,'root'),[{connectionId:'B',folderId:'other'}],controller.signal),{name:'AbortError'});
});
