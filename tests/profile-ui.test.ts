import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { App, Notice } from 'obsidian';
import { ProfileAssignmentModal } from '../src/ui/profile-assignment-modal';
import { ProfileLibraryModal } from '../src/ui/profile-library';
import { VaultTreeModal } from '../src/ui/vault-tree-modal';
import { PolicyEditor } from '../src/ui/policy-editor';
import { STANDARD_PROFILES, type ProfileAssignment } from '../src/core/profiles';
import Plugin from '../main';
import { i18n } from '../src/i18n';

function dom() {
 const { document, window }=parseHTML('<html><body></body></html>');
 Object.assign(globalThis,{document,window});
 const proto=window.HTMLElement.prototype as any;
 proto.empty=function(){this.replaceChildren();};proto.setText=function(text:string){this.textContent=text;};
 proto.createEl=function(tag:string,opts:{text?:string}={}){const el=document.createElement(tag);el.textContent=opts.text??'';this.append(el);return el;};
 i18n.setLocale('en');return document;
}
function click(root:HTMLElement,label:string) {
 const button=Array.from(root.querySelectorAll('button')).find(b=>b.textContent===label);
 assert(button,`Missing button ${label}`);button.click();
}
test('assignment dialog selects plugin code, commits only to tree draft and cancels safely',()=>{
 dom();let result:ProfileAssignment[]|undefined;
 const options={targets:[{scope:'folder' as const,path:'.obsidian/plugins'}],policy:{version:1 as const,mirror:false,folders:[],assignments:[]},profiles:[...STANDARD_PROFILES],connections:[],apply:(a:ProfileAssignment[])=>{result=a;}};
 const modal=new ProfileAssignmentModal(new App(),options);modal.onOpen();
 const select=modal.contentEl.querySelector('select')!;
 for(const o of Array.from(select.options))o.selected=false;
 Array.from(select.options).find(o=>o.value==='standard:source')!.selected=true;
 select.dispatchEvent(new window.Event('change'));
 click(modal.contentEl,'Plugin code');click(modal.contentEl,'Apply to tree');
 assert.deepEqual(result,[{scope:'folder',path:'.obsidian/plugins',names:['main.js','manifest.json','styles.css'],profileId:'standard:source'}]);
 assert.deepEqual(options.policy.assignments,[]);
 result=undefined;const cancel=new ProfileAssignmentModal(new App(),options);cancel.onOpen();click(cancel.contentEl,'Cancel');assert.equal(result,undefined);
});
test('removing a direct assignment does not silently re-add it',()=>{
 dom();let result:ProfileAssignment[]|undefined;
 const modal=new ProfileAssignmentModal(new App(),{targets:[{scope:'file',path:'x.md'}],policy:{version:1,mirror:false,folders:[],assignments:[{scope:'file',path:'x.md',profileId:'standard:preserve'}]},profiles:[...STANDARD_PROFILES],connections:[],apply:a=>{result=a;}});
 modal.onOpen();click(modal.contentEl,'Remove');assert.deepEqual(result,[]);
});
test('profile library preserves originals when canceled, custom profiles save via callback',async()=>{
 const document=dom(),profiles=[...STANDARD_PROFILES];const saved:{value?:any}={};
 const modal=new ProfileLibraryModal(new App(),profiles,[],async p=>{saved.value=p;});modal.onOpen();
 click(modal.contentEl,'New profile');const editor=document.body.lastElementChild as HTMLElement;
 const name=editor.querySelector('input')!;name.value='Plugin updates';name.dispatchEvent(new window.Event('input'));
 click(editor,'Done');assert.equal(profiles.length,STANDARD_PROFILES.length);assert.equal(saved.value,undefined);
 click(modal.contentEl,'Save library');await Promise.resolve();
 assert.equal((saved.value as any).at(-1).name,'Plugin updates');assert.equal((saved.value as any).at(-1).write,'update');
});
test('tree reload preserves unsaved assignments even when inventory fails',async()=>{
 dom();const policy={version:1 as const,mirror:false,folders:[],assignments:[]};
 const editor=new PolicyEditor({localFiles:['a.md'],localFolders:[],remote:[],cache:new Map(),pluginDir:'.obsidian/plugins/sync',policy});
 editor.assignProfiles([{scope:'file',path:'a.md',profileId:'standard:preserve'}],[...STANDARD_PROFILES]);
 const modal=Object.create(VaultTreeModal.prototype) as any;
 Object.assign(modal,{editor,closed:false,renderFileExclusionsPanel:()=>{},deps:{fetchRemote:async()=>{throw Error('Offline');},getLocalSnapshot:async()=>({files:['a.md'],folders:[]}),getCache:()=>new Map(),pluginDir:'.obsidian/plugins/sync',initialPolicy:policy,labels:{}}});
 await modal.loadTrees();assert.equal(modal.fetchError,'Offline');assert.equal(modal.editor.assignmentCount(),1);assert(modal.editor.isDirty());
 const previous=modal.editor;modal.deps.getLocalSnapshot=async()=>{throw Error('Disk unavailable');};await modal.loadTrees();assert.equal(modal.editor,previous);
});
test('remote tree selection assigns the final mapped vault path',()=>{
 dom();const editor=new PolicyEditor({localFiles:[],localFolders:[],remote:[],cache:new Map(),pluginDir:'.obsidian/plugins/sync',policy:{version:1,mirror:false,folders:[{path:'plugins',include:'include',target:{kind:'move',localPath:'.obsidian/plugins'}}],assignments:[]}});
 const modal=Object.create(VaultTreeModal.prototype) as any;
 Object.assign(modal,{app:new App(),editor,tab:'remote',render:()=>{},deps:{isSyncRunning:()=>false,profiles:[...STANDARD_PROFILES],connections:[]}});
 modal.openProfileAssignment([{scope:'file',path:'plugins/example/main.js'}]);
 const box=document.body.lastElementChild as HTMLElement;
 assert(box.textContent?.includes('.obsidian/plugins/example/main.js'));
 const select=box.querySelector('select')!;for(const o of Array.from(select.options))o.selected=false;
 Array.from(select.options).find(o=>o.value==='standard:source')!.selected=true;select.dispatchEvent(new window.Event('change'));
 click(box,'Apply to tree');assert.equal(editor.getPolicy().assignments?.[0].path,'.obsidian/plugins/example/main.js');
});

test('connection library exposes and saves vault source, including assignments-only mode',async()=>{
 dom();let saved:any;
 const connections=[{id:'old',name:'Empty old source',kind:'git' as const,values:{}},{id:'disk',name:'Yandex documents',kind:'yandex' as const,values:{vaultUrl:'https://disk.yandex.ru/d/example'}}];
 const modal=new ProfileLibraryModal(new App(),[...STANDARD_PROFILES],connections,async(p,c,source)=>{saved={p,c,source};},true,'old');modal.onOpen();
 assert.match(modal.contentEl.textContent!,/Vault source/);
 const select=modal.contentEl.querySelector('select')!;
 for(const o of Array.from(select.options))o.selected=false;Array.from(select.options).find(o=>o.value==='disk')!.selected=true;select.dispatchEvent(new window.Event('change'));
 assert.equal(saved,undefined);click(modal.contentEl,'Save library');await Promise.resolve();assert.equal((saved as any).source,'disk');assert.deepEqual((saved as any).c,connections);
 const second=new ProfileLibraryModal(new App(),[...STANDARD_PROFILES],connections,async(p,c,source)=>{saved={source};},true,'disk');second.onOpen();
 const choice=second.contentEl.querySelector('select')!;for(const o of Array.from(choice.options))o.selected=false;Array.from(choice.options).find(o=>o.value==='')!.selected=true;choice.dispatchEvent(new window.Event('change'));
 click(second.contentEl,'Save library');await Promise.resolve();assert.equal((saved as any).source,undefined);
});

test('plugin connection form persists source selection atomically and rolls back failed saves',async()=>{
 const document=dom(),plugin=Object.create(Plugin.prototype) as any;
 const initial={version:1,mirror:false,folders:[],assignments:[],defaultSource:'old'};
 const settings={profiles:[...STANDARD_PROFILES],connections:[{id:'old',name:'Old',kind:'git',values:{}},{id:'disk',name:'Yandex',kind:'yandex',values:{vaultUrl:'https://disk.yandex.ru/d/example'}}],vaultPolicy:initial};
 let fail=true,saves=0;
 Object.assign(plugin,{app:new App(),settings,ensureProfileSettings:async()=>{},getConfigurationRevision:()=>1,saveSettingsImmediate:async()=>{saves++;if(fail)throw Error('Disk full');}});
 plugin.openProfileLibrary(true);await Promise.resolve();await Promise.resolve();
 const modal=document.body.lastElementChild as HTMLElement,select=modal.querySelector('select')!;
 for(const o of Array.from(select.options))o.selected=false;Array.from(select.options).find(o=>o.value==='disk')!.selected=true;select.dispatchEvent(new window.Event('change'));
 click(modal,'Save library');for(let i=0;i<5;i++)await Promise.resolve();assert.equal(settings.vaultPolicy,initial);assert.equal(settings.vaultPolicy.defaultSource,'old');
 fail=false;click(modal,'Save library');for(let i=0;i<5;i++)await Promise.resolve();assert.equal(settings.vaultPolicy.defaultSource,'disk');assert.equal(saves,2);
});
