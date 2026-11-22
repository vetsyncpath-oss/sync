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
    with ZipFile(root / f"releases/refsync-{version}-m3.zip") as archive:
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
            page.wait_for_function("!!window.app?.vault?.adapter",timeout=65000)
            assert page.evaluate("app.vault.getName()") == vault.name
            # Enable community plugins explicitly for this fresh, test-owned vault.
            page.evaluate("""async()=>{if(!app.plugins.isEnabled())await app.plugins.setEnable(true);await app.plugins.loadManifests();await app.plugins.enablePluginAndSave('refsync');}""")
            page.wait_for_function("!!app.plugins.plugins.refsync")
            print(page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync;await rs.ready;
              const v=app.vault,a=v.adapter,reference='Эталон с пробелом',local='Копия',name='тест.md';
              await v.createFolder(reference);await v.createFolder(local);
              await v.create(reference+'/'+name,'эталон');await v.create(local+'/'+name,'исходный');
              const q={...rs.config.profiles[0],id:'windows-ci',name:'Windows',reference,local,enabled:true,mode:'silent',inheritMode:false};
              await rs.put(q,true);await rs.execute(q.id,'run');if(await a.read(local+'/'+name)!=='эталон')throw Error('content');
              const p={...q,scope:'settings',reference:'Параметры'};
              await v.createFolder(p.reference);await v.create(p.reference+'/ci-settings.json','{"ok":true}');
              await rs.put(p,true);await rs.execute(p.id,'run');const path=v.configDir+'/ci-settings.json';
              if(!JSON.parse(await a.read(path)).ok)throw Error('settings');
              await a.write(path,'{"ok":false}');await app.plugins.disablePlugin('refsync');await app.plugins.enablePlugin('refsync');
              const reloaded=app.plugins.plugins.refsync;await reloaded.ready;if(!JSON.parse(await a.read(path)).ok)throw Error('verify after reload');
              const stores=reloaded.stores(p);await reloaded.engine.applier.undo(JSON.stringify([p.id,p.scope,stores.reference.id,stores.local.id]),stores.local);
              if(await a.exists(path))throw Error('undo');return 'Windows Obsidian: ZIP, Cyrillic paths, content, configDir, verification and undo passed';
            }"""))
            # Deliver a harmless fixture plugin, then let Obsidian itself activate it at startup.
            page.evaluate("""async()=>{
              const rs=app.plugins.plugins.refsync,v=app.vault,a=v.adapter;
              const old=rs.config.profiles.find(p=>p.id==='windows-ci'),id='refsync-ci-fixture',ref='Комплект';
              await v.createFolder(ref+'/plugins/'+id);
              await v.create(ref+'/plugins/'+id+'/main.js',"const {Plugin}=require('obsidian');module.exports=class extends Plugin{async onload(){this.received=await this.loadData();}};");
              await v.create(ref+'/plugins/'+id+'/manifest.json',JSON.stringify({id,name:'RefSync CI Fixture',version:'1.0.0',minAppVersion:'1.8.7',description:'Settings smoke test',author:'RefSync',isDesktopOnly:false}));
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
    finally:
        subprocess.run(["taskkill","/PID",str(app.pid),"/T","/F"],capture_output=True)
