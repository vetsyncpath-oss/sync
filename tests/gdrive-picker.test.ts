import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { App } from 'obsidian';
import { pickGoogleFolder } from '../src/ui/gdrive-folder-picker';
import { DRIVE_FOLDER, type GoogleDriveClient, type DriveFile } from '../src/sources/gdrive-client';
import { i18n } from '../src/i18n';
import { deferred } from './helpers';

function setup(){const {document,window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document,window});i18n.setLocale('en');return document;}
const folder=(id:string,name:string,parent?:string):DriveFile=>({id,name,parents:parent?[parent]:[],version:'1',mimeType:DRIVE_FOLDER});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function click(box:HTMLElement,label:string){const b=Array.from(box.querySelectorAll('button')).find(node=>node.textContent===label);assert(b,`Missing ${label}`);b.click();}
const box=()=>document.body.lastElementChild as HTMLElement;

test('Drive folder navigation commits forward/back history only after successful loading',async()=>{
    setup();const files=new Map([['my-root',folder('my-root','My Drive')],['first',folder('first','First','my-root')],['second',folder('second','Second','first')]]);
    let fail='first';const client={inspect:async(id:string)=>{if(id===fail)throw Error('Unavailable');return structuredClone(files.get(id==='root'?'my-root':id)!);},
        listChildren:async(id:string)=>[...files.values()].filter(f=>f.parents.includes(id))} as unknown as GoogleDriveClient;
    const result=pickGoogleFolder(new App(),client,new AbortController().signal);await tick();click(box(),'First');await tick();
    assert(box().textContent?.includes('Unavailable'));click(box(),'Return to current folder');await tick();
    assert(!Array.from(box().querySelectorAll('button')).some(b=>b.textContent==='Back'));
    fail='';click(box(),'First');await tick();click(box(),'Second');await tick();
    fail='first';click(box(),'Back');await tick();assert(box().textContent?.includes('Unavailable'));
    fail='';click(box(),'Retry');await tick();assert.equal(box().querySelector('p')?.textContent,'First');click(box(),'Back');await tick();
    assert.equal(box().querySelector('p')?.textContent,'My Drive');assert(!Array.from(box().querySelectorAll('button')).some(b=>b.textContent==='Back'));
    click(box(),'Select this folder');assert.equal((await result)?.id,'my-root');
});

test('same-name Drive folders expose IDs and selecting the second keeps its identity',async()=>{
    setup();const root=folder('my-root','My Drive'),one=folder('one','Shared','my-root'),two=folder('two','Shared','my-root');
    const client={inspect:async(id:string)=>id==='root'||id==='my-root'?root:id==='one'?one:two,
        listChildren:async(id:string)=>id==='my-root'?[one,two]:[]} as unknown as GoogleDriveClient;
    const result=pickGoogleFolder(new App(),client,new AbortController().signal);await tick();click(box(),'Shared · ID two');await tick();click(box(),'Select this folder');assert.equal((await result)?.id,'two');
});

test('cancelling a loading picker discards late metadata and settles selection once',async()=>{
    setup();const pending=deferred<DriveFile>();const client={inspect:async()=>pending.promise,listChildren:async()=>[]} as unknown as GoogleDriveClient;
    const result=pickGoogleFolder(new App(),client,new AbortController().signal);click(box(),'Cancel');assert.equal(await result,undefined);
    pending.resolve(folder('late','Late'));await tick();assert.equal(document.body.children.length,0);
});
