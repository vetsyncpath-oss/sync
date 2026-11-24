"""SDK 6 test double for the disposable Windows integration vault."""
import json


def install(vault):
    folder = vault / ".obsidian/plugins/vault-access-manager"
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text(json.dumps({
        "id": "vault-access-manager", "name": "Test fixture for VAM SDK 6",
        "version": "0.0.1", "minAppVersion": "1.8.7", "description": "CI only",
        "author": "Sync Studio tests", "isDesktopOnly": True,
    }), encoding="utf-8")
    (folder / "main.js").write_text("""
const {Plugin}=require('obsidian');
module.exports=class extends Plugin {
  onload(){
    this.state=this.app.loadLocalStorage('vam-ci-state') || 'blocked';
    this.listeners=new Set();this.accessV4={build:{tenantId:'ci-org',bundleId:'ci-bundle'}};
    this.auth={};globalThis.vaultSyncAuth=this.auth;
    globalThis.__VAM__={version:'6',register:id=>{this.consumer=id;},
      access:q=>({status:q.tenantId==='ci-org' && q.bundleId==='ci-bundle'?this.state:'blocked',
        validUntil:Date.now()+60000,reason:this.state==='pending'?'device-not-approved':'signed-out'}),
      subscribe:fn=>{this.listeners.add(fn);fn();return ()=>this.listeners.delete(fn);}};
  }
  set(state){this.state=state;this.app.saveLocalStorage('vam-ci-state',state);for(const fn of this.listeners)fn();}
  onunload(){delete globalThis.__VAM__;delete globalThis.vaultSyncAuth;}
};
""", encoding="utf-8")


def run(page):
    print(page.evaluate("""async()=>{
      let rs=app.plugins.plugins.refsync;await rs.ready;
      // Consent to sync in 0.8.0 did not include reports.
      app.saveLocalStorage(rs.bindingKey.replace('refsync:dispatch:', 'refsync:vam:'), {tenantId:'ci-org',bundleId:'ci-bundle'});
      await app.plugins.disablePlugin('refsync');await app.plugins.enablePlugin('refsync');
      rs=app.plugins.plugins.refsync;await rs.ready;
      const api=app.plugins,v=app.vault,a=v.adapter;
      const src='VAM smoke source',dst='VAM smoke target',id='vam-gate-smoke';
      await v.createFolder(src);await v.createFolder(dst);await v.create(src+'/note.md','allowed');
      const p={...rs.newProfile(),id,enabled:true,inheritMode:false,mode:'silent',local:dst,reference:src,
        quietSeconds:0,firstPlan:false,startup:false,fileEvents:false,onFocus:false,onOnline:false,intervalMinutes:0};
      await rs.put(p,true);
      async function denied(fn,reason){try{await fn();}catch(e){if(e.message===reason)return;throw e;}throw Error('expected '+reason);}
      await denied(()=>rs.execute(id,'run'),'vamMissing');
      await rs.execute(id,'auto');await rs.historyFiles();
      await denied(()=>rs.probeConnection(p,true),'vamMissing');
      await denied(()=>rs.previewDraft(p),'vamMissing');
      if(await a.exists(dst+'/note.md'))throw Error('delivery without manager');
      await api.enablePluginAndSave('vault-access-manager');
      const manager=api.plugins['vault-access-manager'];
      await denied(()=>rs.execute(id,'run'),'vamLogin');
      const signal={protocol:1,component:'refsync',version:'1.2.3'};
      if(rs.dispatchPaired||rs.getDispatchStatus(manager)!==null||rs.receiveUpdateSignal(manager,signal))throw Error('exchange without pairing');
      manager.set('pending');await denied(()=>rs.previewDraft(p),'vamDevice');
      manager.set('granted');await rs.execute(id,'run');
      if(await a.read(dst+'/note.md')!=='allowed'||manager.consumer!=='refsync')throw Error('delivery without pairing');
      manager.set('blocked');await denied(()=>rs.execute(id,'run'),'vamLogin');
      manager.set('granted');
      app.setting.open();app.setting.openTabById('refsync');
      const el=app.setting.pluginTabs.find(x=>x.id==='refsync').containerEl;
      const button=(area,key)=>[...area.querySelectorAll('button')].find(b=>b.textContent===rs.t(key));
      const lease=rs.gate.lease();
      button(el,'vamBind').click();
      let confirm;for(let n=0;n<100&&!confirm;n++){await new Promise(r=>setTimeout(r,20));confirm=[...el.ownerDocument.querySelectorAll('.modal'),...document.querySelectorAll('.modal')].find(m=>button(m,'confirmAction'));}
      if(!confirm?.textContent.includes('ci-org'))throw Error('missing vault scope confirmation '+rs.gate.label+' '+[...el.ownerDocument.querySelectorAll('.modal')].map(m=>m.textContent.slice(0,90)));
      button(confirm,'confirmAction').click();await Promise.resolve();lease();
      if(rs.getDispatchStatus(manager)?.version!==rs.manifest.version||rs.getDispatchStatus({})!==null)throw Error('report caller');
      const before=rs.getDispatchStatus(manager);
      if(before.events.length||before.lastSuccessAt||before.gate!=='granted')throw Error('historical data crossed pairing boundary');
      let notifications=0;const off=rs.subscribeDiagnostics(manager,()=>{notifications++;});
      if(typeof off!=='function'||rs.subscribeDiagnostics({},()=>{})!==null)throw Error('diagnostics listener');
      await rs.execute(id,'run');await Promise.resolve();
      const summary=rs.getDispatchStatus(manager);
      if(summary.pluginId!=='refsync'||summary.events.map(e=>e.code).join()!=='started,completed'||
        summary.failedProfiles!==0||!summary.lastSuccessAt||!notifications||summary.recoveryPending||
        [src,dst,id,'note.md'].some(x=>JSON.stringify(summary).includes(x)))throw Error('paired diagnostic report');
      for(const component of ['refsync','vault-access-manager']){
        if(!rs.receiveUpdateSignal(manager,{...signal,component})||!el.textContent.includes('1.2.3'))throw Error('update notice '+component);
      }
      if(rs.receiveUpdateSignal({},signal)||rs.receiveUpdateSignal(manager,{...signal,component:'other'})||
        rs.receiveUpdateSignal(manager,{...signal,version:'https://invalid.test'})||rs.receiveUpdateSignal(manager,{...signal,protocol:2}))throw Error('invalid update notice');
      const scope=manager.accessV4.build;manager.accessV4.build={...scope,bundleId:'other'};
      if(rs.getDispatchStatus(manager)!==null||rs.receiveUpdateSignal(manager,signal))throw Error('cross-scope exchange');
      manager.accessV4.build=scope;
      manager.set('blocked');
      await denied(()=>rs.execute(id,'run'),'vamLogin');
      manager.set('granted');const beforeUnpair=rs.gate.lease();
      button(el,'vamUnbind').click();beforeUnpair();
      if(rs.getDispatchStatus(manager)!==null||rs.receiveUpdateSignal(manager,signal)||el.textContent.includes('1.2.3'))throw Error('exchange after unpair');
      const countAfterUnpair=notifications;await rs.execute(id,'run');await Promise.resolve();off();
      if(countAfterUnpair!==notifications)throw Error('diagnostic notification after unpair');
      app.setting.close();await v.create(src+'/stale.md','stale');
      const plan={...p,mode:'plan'};await rs.put(plan,true);await rs.execute(id,'run');
      const review=rs.activeReview;if(!review?.apply)throw Error('expected executable plan');
      const store=rs.browseStore(p,'reference');
      manager.set('blocked');
      if(rs.activeReview)throw Error('revoked plan still open');
      await denied(()=>store.list(''),'vamLogin');
      manager.set('granted');review.apply(new Map(),new Set());await rs.scheduler.serial(async()=>{});
      if(await a.exists(dst+'/stale.md'))throw Error('stale plan applied after relogin');
      await rs.put(p,true);await rs.execute(id,'run');
      if(await a.read(dst+'/note.md')!=='allowed'||manager.consumer!=='refsync')throw Error('valid SDK 6 delivery');
      await api.disablePlugin('vault-access-manager');await denied(()=>rs.execute(id,'run'),'vamMissing');
      await api.enablePlugin('vault-access-manager');await rs.execute(id,'run');
      // Revoke after the first real destination write returns and before the next file.
      await v.create(src+'/two.md','second');await v.create(src+'/three.md','third');
      const original=v.createBinary, touched=[];
      v.createBinary=async function(path,...args){
        const file=await original.call(this,path,...args);
        if(path.startsWith(dst+'/')){touched.push(path);if(touched.length===1)app.plugins.plugins['vault-access-manager'].set('blocked');}
        return file;
      };
      try{await denied(()=>rs.scheduler.serial(()=>rs.execute(id,'run')),'vamLogin');}
      finally{v.createBinary=original;}
      await rs.scheduler.serial(async()=>{});
      if(touched.length!==1||await a.exists(dst+'/two.md')||await a.exists(dst+'/three.md'))throw Error('in-flight revoke or local rollback');
      app.plugins.plugins['vault-access-manager'].set('granted');
      await rs.put({...p,startup:true,startupSeconds:0},true);
      await api.disablePlugin('vault-access-manager');
      await api.disablePlugin('refsync');await api.enablePlugin('refsync');
      const reopened=api.plugins.refsync;await reopened.ready;
      if(await a.exists(dst+'/two.md'))throw Error('startup without manager');
      await api.enablePlugin('vault-access-manager');
      for(let i=0;i<200 && !await a.exists(dst+'/two.md');i++)await new Promise(r=>setTimeout(r,30));
      await reopened.scheduler.serial(async()=>{});
      if(!await a.exists(dst+'/three.md'))throw Error('startup with late manager');
      await reopened.save({...reopened.config,profiles:[],current:''});
      return 'VAM: missing/denied/pending, unpaired sync, optional reports and update notices, revocation, stale plan and restart passed';
    }"""))
