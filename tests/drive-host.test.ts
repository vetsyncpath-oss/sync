import test from 'node:test';
import assert from 'node:assert/strict';
import Plugin from '../main';
import { fixture,entry,ab,str,pathPolicy } from './helpers';
import { RoutedSource } from '../src/sources/routed-source';
import { GDriveOAuthSource } from '../src/sources/gdrive-oauth-source';
import { GoogleDriveClient,DRIVE_FOLDER } from '../src/sources/gdrive-client';
import { compileProfiles,STANDARD_PROFILES,validateProfileConnections } from '../src/core/profiles';
const profiles=structuredClone([...STANDARD_PROFILES]);
const policy={version:1 as const,mirror:false,folders:[],defaultSource:'drive',assignments:[
    {scope:'vault' as const,path:'',profileId:'standard:drive-bidirectional'},
    {scope:'folder' as const,path:'Git',source:'git',profileId:'standard:safe'}]};
const connections=[{id:'drive',name:'Drive',kind:'gdrive' as const,values:{authMode:'oauth-desktop',folderId:'root'}},{id:'git',name:'Git',kind:'git' as const,values:{repoUrl:'https://github.com/test/repo'}}];
async function host(){
    const f=fixture(),compiled=compileProfiles(policy,profiles),plugin=Object.create(Plugin.prototype) as any;
    const file={id:'remote',name:'a.md',mimeType:'text/plain',parents:['root'],version:'1',size:String(ab('REMOTE').byteLength),sha256Checksum:entry('a.md').hash};
    const root={id:'root',name:'root',mimeType:DRIVE_FOLDER,parents:[],version:'1'};let driveDownloads=0;
    const client={maxFileBytes:1024*1024,inventory:async()=>({root,items:[{path:'a.md',file}],excluded:0}),inspect:async(id:string)=>id==='root'?root:file,
        download:async()=>{driveDownloads++;return ab('REMOTE');}} as unknown as GoogleDriveClient;
    const drive=new GDriveOAuthSource(client,'root'),git={...f.source,getManifest:async()=>[entry('Git/b.md')]};
    const routed=new RoutedSource([{id:'drive',name:'Drive',source:drive},{id:'git',name:'Git',source:git}],compiled.fileRules!,p=>p,'drive');
    await f.coordinator.setSource(routed);f.coordinator.setSyncPolicy(compiled);f.coordinator.setPolicy(pathPolicy().forSources(['drive','git'],'drive',compiled.fileRules!,[],['pull']));
    f.vault.createBinary=async(p,data)=>{assert(!f.files.has(p));f.files.set(p,data.slice(0));};
    Object.assign(plugin,{settings:{profiles,connections,vaultPolicy:policy},coordinator:f.coordinator,cache:f.cache,queue:f.queue,mutations:f.mutations,fsAdapter:f.memory.fs,
        preparedConfigRevision:0,getConfigurationRevision:()=>0,effectiveProfilePolicy:()=>compiled,makePolicy:()=>pathPolicy(),makeVaultAdapter:()=>f.vault,
        sessionController:new AbortController(),persistEngineState:async()=>{},makeSyncUI:()=>f.ui,statusBar:{setState:()=>{}}});
    return {plugin,f,git,driveDownloads:()=>driveDownloads};
}
test('real plugin dispatch separates a bidirectional Drive route from a pull child and merges results',async()=>{
    const h=await host(),result=await h.plugin.executeSync('auto');assert.equal(result.problem,undefined);assert.equal(result.failed,0);assert.equal(result.downloaded,2);
    assert.equal(str(h.f.files.get('a.md')!),'REMOTE');assert.equal(str(h.f.files.get('Git/b.md')!),'REMOTE');assert.equal(h.driveDownloads(),1);
    assert(h.f.memory.files.size>0);
});
test('a failed selected inventory stops the combined host pipeline before either engine writes',async()=>{
    const h=await host();h.git.getManifest=async()=>{throw Error('inventory incomplete');};
    await assert.rejects(()=>h.plugin.executeSync('auto'),/inventory incomplete/);assert.equal(h.f.files.size,0);assert.equal(h.driveDownloads(),0);
});
test('profile validation rejects bidirectional inheritance into a Git child without an explicit pull profile',()=>{
    const invalid:import('../src/core/policy').SyncPolicy=structuredClone(policy);delete invalid.assignments![1].profileId;
    assert.throws(()=>validateProfileConnections(invalid,profiles,connections),/OAuth Google Drive/);
    validateProfileConnections(policy,profiles,connections);
});
