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
            page.evaluate("""async()=>{if(!app.plugins.isEnabled())await app.plugins.setEnable(true);await app.plugins.loadManifests();await app.plugins.enablePlugin('refsync');}""")
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
    finally:
        subprocess.run(["taskkill","/PID",str(app.pid),"/T","/F"],capture_output=True)
