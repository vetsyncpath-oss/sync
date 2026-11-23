"""Exercise the packaged plugin with a disposable vault in native Windows Obsidian."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.request import urlopen
from zipfile import ZipFile
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "manifest.json").read_text())["version"]
with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp:
    home = Path(temp)
    vault = home / "Хранилище Windows"
    (vault / ".obsidian").mkdir(parents=True)
    with ZipFile(root / f"releases/sync-studio-{version}.zip") as archive:
        archive.extractall(vault / ".obsidian/plugins")
    settings = home / "config"
    settings.mkdir()
    (settings / "obsidian.json").write_text(json.dumps({"vaults":{"aa85e42ab56da909":{"path":str(vault),"ts":int(time.time()*1000),"open":True}}}))
    # The installer and its hash are from the same pinned official Obsidian release.
    installer = home / "Obsidian.exe"
    import shutil
    with urlopen("https://github.com/obsidianmd/obsidian-releases/releases/download/v1.15.1/Obsidian-1.15.1.exe",timeout=120) as res, installer.open("wb") as out:
        shutil.copyfileobj(res,out)
    with installer.open("rb") as stream:
        assert hashlib.file_digest(stream,"sha256").hexdigest()=="218c7d30acc065355ce94719dd996d5e2a2347cde3811ea5dc29380583f02b58"
    appdir = home / "app"
    subprocess.run(["7z","x",str(installer),"-o"+str(home/"installer"),"-y"],check=True,stdout=subprocess.DEVNULL)
    payload = next((home/"installer").rglob("app-64.7z"))
    subprocess.run(["7z","x",str(payload),"-o"+str(appdir),"-y"],check=True,stdout=subprocess.DEVNULL)
    env = dict(os.environ,APPDATA=str(home/"roaming"),LOCALAPPDATA=str(home/"local"))
    app = subprocess.Popen([str(appdir/"Obsidian.exe"),"--user-data-dir="+str(settings),"--remote-debugging-address=127.0.0.1","--remote-debugging-port=19224","--disable-gpu"],env=env)
    try:
        with sync_playwright() as playwright:
            until=time.monotonic()+80
            while True:
                try:
                    browser=playwright.chromium.connect_over_cdp("http://127.0.0.1:19224",timeout=2000)
                    break
                except Exception:
                    if time.monotonic()>until:raise
                    time.sleep(1)
            page=browser.contexts[0].pages[0]
            page.wait_for_function("!!window.app?.vault?.adapter && !!window.app?.plugins?.enablePluginAndSave",timeout=65000)
            assert page.evaluate("app.vault.getName()") == vault.name
            # Enable community plugins explicitly for this fresh, test-owned vault.
            page.evaluate("""async()=>{if(!app.plugins.isEnabled())await app.plugins.setEnable(true);await app.plugins.loadManifests();await app.plugins.enablePluginAndSave('refsync');}""")
            page.wait_for_function("!!app.plugins.plugins.refsync")
            print(page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync;await rs.ready;
              const v=app.vault,a=v.adapter,reference='Эталон с пробелом',local='Копия',name='тест.md';
              await v.createFolder(reference);await v.createFolder(local);
              await v.create(reference+'/'+name,'эталон');await v.create(local+'/'+name,'исходный');
              if(rs.config.profiles.length)throw Error('unexpected initial profiles');
              const q={...rs.newProfile(),startup:false,onFocus:false,onOnline:false,intervalMinutes:0,fileEvents:false,id:'windows-ci' ,name:'Windows',reference,local,enabled:true,mode:'silent',inheritMode:false};
              await rs.put(q,true);await rs.execute(q.id,'run');if(await a.read(local+'/'+name)!=='эталон')throw Error('content');
              const p={...q,scope:'settings',reference:'Параметры'};
              await v.createFolder(p.reference);await v.create(p.reference+'/ci-settings.json','{"ok":true}');
              await rs.put(p,true);await rs.execute(p.id,'run');const path=v.configDir+'/ci-settings.json';
              if(!JSON.parse(await a.read(path)).ok)throw Error('settings');
              await a.write(path,'{"ok":false}');await app.plugins.disablePlugin('refsync');await app.plugins.enablePlugin('refsync');
              const reloaded=app.plugins.plugins.refsync;await reloaded.ready;if(JSON.parse(await a.read(path)).ok)throw Error('startup overwrote edit');
              const stores=reloaded.stores(p);await reloaded.engine.applier.undo(JSON.stringify([p.id,p.scope,stores.reference.id,stores.local.id]),stores.local);
              if(await a.exists(path))throw Error('undo');return 'Windows Obsidian: ZIP, Cyrillic paths, content, configDir, verification and undo passed';
            }"""))
            print(page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync, v=app.vault;
              const local='Подписка Git';await v.createFolder(local);
              const q={...rs.config.profiles.find(p=>p.id==='windows-ci'),id:'public-git',scope:'content',access:'public',
                local,reference:'/',remote:{engine:'git',url:'https://github.com/octocat/Hello-World.git',branch:'master'}};
              await rs.put(q,true);
              const stores=rs.stores(q),before=await rs.engine.run(q,stores.reference,stores.local,true);
              if(!before.plan.ops.some(op=>op.path==='README'&&op.action==='write')||await v.adapter.exists(local+'/README'))throw Error('Git preview');
              await rs.execute(q.id,'run');if(!(await v.adapter.read(local+'/README')).includes('Hello World'))throw Error('Git apply');
              return 'Public GitHub HTTPS: preview, shallow fetch and delivery in Windows Obsidian passed';
            }"""))
            print(page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync,v=app.vault,a=v.adapter;
              const reference='Пустой эталон',local='Проверка удалений';
              await v.createFolder(reference);await v.createFolder(local);
              const path=local+'/тест.md';await v.create(path,'keep until silent opt-out');
              const p={...rs.config.profiles[0],id:'silent-deletions',scope:'content',access:'local',
                reference,local,enabled:true,inheritMode:true,mode:'plan',mirror:'full',deletions:true,
                conflict:'source',maxDeleteCount:0,maxDeletePercent:0,deleteGrace:0,firstPlan:false,
                fileEvents:false,startup:false,intervalMinutes:0,onFocus:false,onOnline:false};
              await rs.save({...rs.config,mode:'silent'});await rs.put(p);
              await rs.execute(p.id,'auto');if(!await a.exists(path))throw Error('default safeguard');
              const off={...p,silentDeletionSafeguard:false};await rs.put(off);
              await rs.execute(p.id,'dry');
              if(!rs.activeReview?.plan.ops.some(o=>o.action==='delete')||!await a.exists(path))throw Error('dry preview');
              rs.activeReview.close();
              for(const q of [{...off,inheritMode:false,mode:'plan'},{...off,firstPlan:true,id:'review-first'}]){
                await rs.put(q);await rs.execute(q.id,'run');
                if(!rs.activeReview?.plan.held.includes('тест.md')||!await a.exists(path))throw Error('review safeguard');
                rs.activeReview.close();
              }
              await rs.put(off);await rs.execute(off.id,'auto');if(await a.exists(path))throw Error('inherited silent safeguard off');
              await v.create(path,'manual silent');
              await rs.save({...rs.config,mode:'plan'});await rs.put({...off,inheritMode:false,mode:'silent'});
              await rs.execute(off.id,'run');if(await a.exists(path))throw Error('explicit silent safeguard off');
              return 'Windows Obsidian: silent safeguard default, preview, inheritance, reviewed runs and unlimited silent deletes passed';
            }"""))
            print(page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync,v=app.vault,a=v.adapter;
              if(rs.manifest.name!=='Sync Studio'||rs.manifest.id!=='refsync')throw Error('upgrade identity');
              const local='Дерево копии',reference='Дерево эталона';
              await v.createFolder(local+'/Старое/Вложенное');await v.createFolder(local+'/Осталось пустым');
              await v.create(local+'/Старое/Вложенное/файл.md','before');await v.createFolder(local+'/Личное');
              await a.write(local+'/Личное/.hidden','keep');
              await v.createFolder(reference+'/Новое/Пустое');
              const p={...rs.config.profiles[0],id:'dir-ci',scope:'content',access:'local',local,reference,enabled:true,
                role:'subscriber',mirror:'full',deletions:true,conflict:'source',inheritMode:false,mode:'silent',silentDeletionSafeguard:false,
                fileEvents:false,startup:false,onFocus:false,onOnline:false,intervalMinutes:0,firstPlan:false};
              await rs.put(p);await rs.execute(p.id,'dry');
              const plan=rs.activeReview.plan;rs.activeReview.close();
              if(!plan.ops.some(o=>o.action==='rmdir'&&o.path==='Осталось пустым')||!plan.ops.some(o=>o.action==='mkdir'&&o.path==='Новое/Пустое'))throw Error('folder dry run');
              await rs.execute(p.id,'run');
              if(await a.exists(local+'/Старое')||await a.exists(local+'/Осталось пустым')||!await a.exists(local+'/Новое/Пустое')||!await a.exists(local+'/Личное/.hidden'))throw Error('folder delivery');
              const stores=rs.stores(p),key=JSON.stringify([p.id,p.scope,stores.reference.id,stores.local.id]);
              await rs.engine.applier.undo(key,stores.local,t=>rs.recoveryTarget(t));
              if(await a.exists(local+'/Новое')||!await a.exists(local+'/Осталось пустым')||await a.read(local+'/Старое/Вложенное/файл.md')!=='before')throw Error('folder undo');
              return 'Sync Studio: Windows folder cleanup, empty directory delivery, hidden contents and undo passed';
            }"""))
            print(page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync,v=app.vault,a=v.adapter;
              const reference='Переезд источник',local='Переезд цель',n=256;
              for(const d of [reference,local])await v.createFolder(d);
              for(let i=0;i<n;i++){
                await v.create(reference+'/новый-'+i+'.md','источник');
                await v.create(local+'/старый-'+i+'.md','цель');
              }
              const p={...rs.newProfile(),id:'migration',name:'Переезд',reference,local,enabled:true,inheritMode:false,mode:'silent',mirror:'full',deletions:true,silentDeletionSafeguard:false,startup:false,onOnline:false,onFocus:false,intervalMinutes:0,fileEvents:false};
              await rs.put(p,true);
              const check=async()=>{const s=rs.stores(p);return (await rs.engine.run(p,s.reference,s.local,true,undefined,{mode:'silent'})).stats};
              const cold=await check(),warm=await check();
              if(cold.read!==2*n||warm.read!==0||warm.reused!==2*n)throw Error('digest reuse '+JSON.stringify([cold,warm]));
              await rs.execute(p.id,'run');
              if((await a.list(local)).files.length!==n||await a.exists(local+'/старый-0.md')||await a.read(local+'/новый-0.md')!=='источник')throw Error('migration');
              if(rs.activeReview || rs.openIds.size)throw Error('silent mode opened review');
              await rs.openHistory();
              const leaf=app.workspace.getLeavesOfType('sync-studio-history')[0];
              if(!leaf?.view.contentEl.textContent.includes('Переезд'))throw Error('history view');
              const field=leaf.view.contentEl.querySelector('input');field.value='старый-0.md';field.dispatchEvent(new Event('input'));
              if(!leaf.view.contentEl.textContent.includes('старый-0.md'))throw Error('history path');
              leaf.detach();
              return 'Native disjoint migration: '+JSON.stringify({cold,warm,created:n,deleted:n});
            }"""))
            print(page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync, v=app.vault, a=v.adapter;
              const p=rs.config.profiles.find(p=>p.id==='migration');
              for(const d of ['.obsidian','.obsidian/plugins','.obsidian/plugins/reader','.obsidian/plugins/personal','.obsidian/plugins/refsync','.hidden','Private'])await a.mkdir(p.reference+'/'+d);
              for(const path of ['.obsidian/plugins/reader/main.js','.obsidian/plugins/personal/data.json','.obsidian/plugins/refsync/main.js','.hidden/entry','Private/a'])await a.write(p.reference+'/'+path,'fixture');
              app.setting.open();app.setting.openTabById('refsync');
              const editor=app.setting.pluginTabs.find(tab=>tab.id==='refsync');
              const button=(el,label)=>[...el.querySelectorAll('button')].find(x=>x.textContent===rs.t(label));
              const rows=[...editor.containerEl.querySelectorAll('.setting-item')];
              button(rows.find(el=>el.querySelector('.setting-item-name')?.textContent==='Переезд'),'edit').click();
              button(editor.containerEl,'composition').click();
              const row=[...editor.containerEl.querySelectorAll('.setting-item')].find(el=>el.querySelector('.setting-item-name')?.textContent===rs.t('everything'));
              row.querySelector('.checkbox-container').click();
              await new Promise(r=>setTimeout(r,50));
              const pickerButton=button(editor.containerEl,'pluginsPicker');if(pickerButton.disabled)throw Error('disabled picker '+JSON.stringify(editor.draft?.content));pickerButton.click();
              const doc=editor.containerEl.ownerDocument;
              await new Promise((resolve,reject)=>{let n=0;const i=setInterval(()=>{const m=[...new Set([...doc.querySelectorAll('.modal'),...document.querySelectorAll('.modal')])].find(m=>button(m,'uncheckMatches'));if(m){clearInterval(i);resolve();}else if(n++>200){clearInterval(i);reject(Error('picker timeout '+[...doc.querySelectorAll('.modal'),...document.querySelectorAll('.modal')].map(m=>m.textContent.slice(0,250))));}},30);});
              const m=[...new Set([...doc.querySelectorAll('.modal'),...document.querySelectorAll('.modal')])].find(m=>button(m,'uncheckMatches'));
              if(m.textContent.includes('refsync')||!m.textContent.includes('reader'))throw Error('plugin picker scope '+m.textContent);
              const search=m.querySelector('input[type=search],input[type=text]');search.value='personal';search.dispatchEvent(new Event('input'));button(m,'uncheckMatches').click();button(m,'useSelection').click();
              button(editor.containerEl,'save').click();
              await rs.saves;app.setting.close();
              const saved=rs.config.profiles.find(x=>x.id===p.id);
              if(!saved.content.config||!saved.content.hidden||!saved.content.rules.some(r=>r.path==='.obsidian/plugins/personal'&&!r.include))throw Error('scope persistence');
              await rs.execute(p.id,'run');
              const exists=path=>a.exists(p.local+'/'+path);
              if(!await exists('.obsidian/plugins/reader/main.js')||!await exists('.hidden/entry')||await exists('.obsidian/plugins/personal/data.json')||await exists('.obsidian/plugins/refsync/main.js'))throw Error('scoped delivery');
              return 'Native settings: bulk checkbox selection, config and hidden folder delivery, excluded plugins and self protected';
            }"""))
            import runpy
            runpy.run_path(str(root/"scripts/overhaul-smoke.py"))["run"](page)
            # Deliver a harmless fixture plugin, then let Obsidian itself activate it at startup.
            page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync,v=app.vault,a=v.adapter;
              const old=rs.config.profiles.find(p=>p.id==='windows-ci'),id='refsync-ci-fixture',ref='Комплект';
              await v.createFolder(ref+'/plugins/'+id);
              await v.create(ref+'/plugins/'+id+'/main.js',"const {Plugin}=require('obsidian');module.exports=class extends Plugin{async onload(){this.received=await this.loadData();}};");
              await v.create(ref+'/plugins/'+id+'/manifest.json',JSON.stringify({id,name:'Sync Studio CI Fixture',version:'1.0.0',minAppVersion:'1.8.7',description:'Settings smoke test',author:'Sync Studio',isDesktopOnly:false}));
              await v.create(ref+'/plugins/'+id+'/data.json','{"setting":1,"device":"source"}');
              await v.create(ref+'/community-plugins.json',JSON.stringify([id]));
              const p={...old,id:'windows-install',reference:ref,config:{...old.config,categories:['code','data','community'],reload:'never',strategy:'batch',legacyThemes:false,overlay:'plugins/*/data.json => device'}};
              await rs.put(p,true);await rs.execute(p.id,'run');
              const ids=JSON.parse(await a.read(v.configDir+'/community-plugins.json'));
              if(!ids.includes('refsync')||!ids.includes(id))throw Error('delivered membership');
            }""")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("window.app?.plugins?.plugins?.['refsync-ci-fixture']?.received?.setting===1",timeout=45000)
            print(page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync;await rs.ready;
              const p=rs.config.profiles.find(p=>p.id==='windows-install'),v=app.vault,a=v.adapter,id='refsync-ci-fixture';
              const relative='/plugins/'+id+'/data.json';
              await a.write(v.configDir+relative,'{"setting":1,"device":"this PC"}');
              const file=v.getAbstractFileByPath(p.reference+relative);
              await v.modify(file,'{"setting":2,"device":"another PC"}');
              await rs.execute(p.id,'run');
              const active=app.plugins.plugins[id];if(active?.received?.setting!==2||active.received.device!=='this PC')throw Error('hot data overlay');
              return 'Windows Obsidian: activation after app reload, hot data update and per-device JSON overlay passed';
            }"""))
            import runpy
            runpy.run_path(str(root / "scripts/oauth-smoke.py"))["run"](page,browser)
    finally:
        subprocess.run(["taskkill","/PID",str(app.pid),"/T","/F"],capture_output=True)
