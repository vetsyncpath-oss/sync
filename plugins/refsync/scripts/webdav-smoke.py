"""Run the installed desktop plugin against an authenticated WebDAV server."""
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from cheroot.wsgi import Server

from wsgidav.wsgidav_app import WsgiDAVApp


def run(page, vault):
    with TemporaryDirectory() as tmp:
        remote = Path(tmp)
        (remote / "obsolete").mkdir()
        (remote / "obsolete/extra.md").write_bytes(b"old")
        (remote / "preserved").mkdir()
        (remote / "preserved/keep.md").write_bytes(b"excluded child")
        (remote / "update.md").write_bytes(b"initial")
        dav = WsgiDAVApp({
            "provider_mapping": {"/dav": str(remote)},
            "simple_dc": {"user_mapping": {"*": {"tester": {"password": "fixture-only"}}}},
            "http_authenticator": {"accept_basic": True, "accept_digest": False,
                                   "default_to_digest": False},
            "lock_storage": True, "verbose": 0, "logging": {"enable": False},
        })

        def application(env, start):
            if env["REQUEST_METHOD"] == "LOCK" and env["PATH_INFO"].rstrip("/").endswith("/retain"):
                start("405 Method Not Allowed", [("Content-Length", "0")])
                return [b""]
            return dav(env, start)

        server = Server(("127.0.0.1", 0), application)
        server.prepare()
        thread = Thread(target=server.serve, daemon=True)
        thread.start()
        try:
            exercise(page, vault, remote, f"http://127.0.0.1:{server.bind_addr[1]}/dav/")
        finally:
            server.stop()
            thread.join()


def exercise(page, vault, remote, url):
    source = vault / "DAV source"
    (source / "новая папка").mkdir(parents=True)
    (source / "update.md").write_bytes(b"new contents")
    payload = bytes(range(251)) * 42000
    large = "новая папка/данные.bin"
    (source / large).write_bytes(payload)
    (vault / "DAV copy").mkdir()
    page.evaluate("""async url => {
      const rs=app.plugins.plugins.refsync;
      await rs.ready;
      const p={...rs.newProfile(), id:'webdav-pub', dav:{url,user:'tester'}, access:'webdav',
        reference:'/', local:'DAV source', role:'publisher', enabled:true, startup:false,
        onFocus:false, onOnline:false, fileEvents:false, intervalMinutes:0, quietSeconds:0,
        inheritMode:false, mode:'silent', firstPlan:false, mirror:'full', deletions:true,
        silentDeletionSafeguard:false, content:{base:'all',config:false,hidden:false,
        rules:[{path:'preserved/keep.md',include:false}]}};
      await rs.saveDavPassword(p.dav,'incorrect');
      const denied=await rs.probeConnection(p,false);
      if(denied.failed!=='probeList')throw Error('denied '+JSON.stringify(denied));
      await rs.put(p,true);
      app.setting.open();app.setting.openTabById('refsync');
      const el=app.setting.pluginTabs.find(tab=>tab.id==='refsync').containerEl;
      const button=(area,k)=>[...area.querySelectorAll('button')].find(b=>b.textContent===rs.t(k));
      const row=name=>[...el.querySelectorAll('.setting-item')].find(r=>r.querySelector('.setting-item-name')?.textContent===name);
      async function until(fn){for(let n=0;n<300;n++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('WebDAV UI timeout '+el.textContent.slice(-500));}
      button(el,'profiles')?.click();button(row(p.name),'edit').click();
      const password=row(rs.t('davPasswordLabel')), input=password.querySelector('input[type=password]');
      input.value='fixture-only';input.dispatchEvent(new Event('input'));
      button(password,'savePassword').click();await until(()=>button(password,'saved'));
      button(el,'diagnostics').click();
      for(const [key,last] of [['checkAccess','probeList'],['probeWriteButton','probeDelete']]){
        button(el,key).click();await until(()=>el.textContent.includes('✓ '+rs.t(last)));
      }
      button(el,'cancel').click();app.setting.close();
      await rs.execute(p.id,'run');
    }""", url)
    assert not list(remote.glob("sync-studio-check-*"))
    assert (remote / large).read_bytes() == payload
    assert (remote / "update.md").read_bytes() == b"new contents"
    assert not (remote / "obsolete").exists()
    assert (remote / "preserved/keep.md").read_bytes() == b"excluded child"
    manifest = json.loads((remote / ".sync-manifest.json").read_bytes())
    assert next(e["hash"] for e in manifest["files"] if e["path"] == large) == hashlib.sha256(payload).hexdigest()
    page.evaluate(r"""async large=>{
      const rs=app.plugins.plugins.refsync;
      const p=rs.config.profiles.find(x=>x.id==='webdav-pub');
      const sub={...p,id:'webdav-sub',role:'subscriber',local:'DAV copy'};
      await rs.put(sub,true);await rs.execute(sub.id,'run');
      const entries=(await rs.historyFiles()).flatMap(s=>s.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)));
      for(const ev of ['transferDownload','transferUpload'])
        if(!entries.some(e=>e.event===ev && e.path===large && e.bytes===e.totalBytes && e.bytes>8*1024*1024))throw Error('missing '+ev);
      const stores=rs.stores(p);
      await rs.engine.applier.undo(JSON.stringify([p.id,p.scope,stores.local.id,stores.reference.id]),stores.reference,t=>rs.recoveryTarget(t));
    }""", large)
    assert (vault / "DAV copy" / large).read_bytes() == payload
    assert not (vault / "DAV copy/preserved/keep.md").exists()
    assert not (remote / large).exists()
    assert not (remote / ".sync-manifest.json").exists()
    assert (remote / "obsolete/extra.md").read_bytes() == b"old"
    assert (remote / "preserved/keep.md").read_bytes() == b"excluded child"
    assert (remote / "update.md").read_bytes() == b"initial"
    (remote / "retain").mkdir()
    page.evaluate("""async()=>{
      const rs=app.plugins.plugins.refsync;
      const p=rs.config.profiles.find(x=>x.id==='webdav-pub');
      const store=rs.accountReference(p);
      if(await store.removeEmptyDir('retain'))throw Error('removed without lock');
      await store.stat('update.md');
      const second=rs.accountReference(p);
      await second.upload('update.md',new TextEncoder().encode('another writer').buffer);
      try {await store.delete('update.md');}catch(e){if(e.message==='referenceChanged')return;throw e;}
      throw Error('stale precondition accepted');
    }""")
    assert (remote / "retain").is_dir()
    assert (remote / "update.md").read_bytes() == b"another writer"
    print("Desktop WebDAV: authenticated probes, publish, subscribe, byte progress, full mirror, locks, stale ETag and undo passed")
