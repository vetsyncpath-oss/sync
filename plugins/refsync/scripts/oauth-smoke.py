"""Exercise real Obsidian UI, PKCE callback and secret storage with a synthetic Drive account."""
import json
import time
from urllib.parse import urlparse, parse_qs, urlencode
from urllib.request import urlopen

def run(page, browser):
    labels = page.evaluate("""async()=>{
      const rs=app.plugins.plugins.refsync;await rs.ready;
      const names=['accounts','google','addAccount','clientImport','clientReady','signIn','accountActive'];
      window.m5Restore=require('electron').shell.openExternal;
      require('electron').shell.openExternal=async url=>{window.m5Authorize=url;};
      const original=rs.accounts.http;const connect=rs.accounts.connect.bind(rs.accounts);rs.accounts.connect=async(...args)=>{try{return await connect(...args);}catch(e){window.m5FixtureError=e.name+" "+e.message;throw e;}};
      const files=new Map(),sessions=new Map();let seq=0;
      const enc=new TextEncoder(),dec=new TextDecoder();
      const reply=(obj={},status=200,headers={})=>({status,headers,arrayBuffer:enc.encode(JSON.stringify(obj)).buffer});
      rs.accounts.http=async(raw,method='GET',h={},body)=>{
        const u=new URL(raw);
        if(u.hostname==='oauth2.googleapis.com'){
          const f=new URLSearchParams(dec.decode(body));if(f.get('code')!=='fixture-code'||!f.get('code_verifier'))throw Error('exchange');
          return reply({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});
        }
        if(h.Authorization!=='Bearer fixture-access')throw Error('bearer');
        if(u.pathname.endsWith('/about'))return reply({user:{permissionId:'test-subject',displayName:'Sync Studio fixture'}});
        if(u.pathname==='/upload/drive/v3/files'||u.pathname.startsWith('/upload/drive/v3/files/')){
          if(method==='PUT'){
            const id=u.searchParams.get('upload_id'),record=sessions.get(id);if(!record)throw Error('session');
            files.set(record.id,{...record,bytes:body.slice(0)});return reply({id:record.id});
          }
          const info=JSON.parse(dec.decode(body)),id=method==='PATCH'?u.pathname.split('/').pop():String(++seq);
          sessions.set(id,{id,name:info.name});return reply({},200,{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id='+id});
        }
        if(u.pathname.endsWith('/files/root'))return reply({id:'root',mimeType:'application/vnd.google-apps.folder'});
        if(u.pathname.endsWith('/files'))return reply({files:[...files.values()].map(f=>({id:f.id,name:f.name,size:String(f.bytes.byteLength),mimeType:'text/plain',modifiedTime:'2026-01-01T00:00:00Z'}))});
        const id=u.pathname.split('/').pop();
        if(method==='PATCH'&&JSON.parse(dec.decode(body)).trashed){files.delete(id);return reply({});}
        if(u.searchParams.get('alt')==='media'&&files.has(id))return {status:200,headers:{},arrayBuffer:files.get(id).bytes};
        throw Error('unexpected fixture request');
      };
      window.m5Cleanup=()=>{rs.accounts.connect=connect;rs.accounts.http=original;require('electron').shell.openExternal=window.m5Restore;};
      window.m5Files=files;
      app.setting.open();app.setting.openTabById('refsync');
      return Object.fromEntries(names.map(k=>[k,rs.t(k)]));}""")
    def surface(locator):
        until = time.monotonic() + 16
        while time.monotonic() < until:
            for pg in browser.contexts[0].pages:
                if locator(pg).count():
                    pg.set_viewport_size({"width":1280,"height":900})
                    return pg
            time.sleep(.1)
        raise RuntimeError("OAuth control missing")
    try:
        by_button=lambda pg,name: pg.get_by_role('button',name=labels[name],exact=True)
        ui=surface(lambda pg: by_button(pg,'accounts'))
        by_button(ui,'accounts').first.click()
        def google(pg):
            return pg.locator('.modal .setting-item').filter(has=pg.get_by_text(labels['google'],exact=True)).get_by_role('button',name=labels['addAccount'],exact=True)
        modal=surface(google)
        google(modal).click()
        picker=lambda pg:pg.get_by_label(labels['clientImport'],exact=True)
        login=surface(picker)
        with login.expect_file_chooser() as choose:
            picker(login).click()
        choose.value.set_files({'name':'desktop.json','mimeType':'application/json','buffer':json.dumps({'installed':{'client_id':'fixture.apps.googleusercontent.com','client_secret':'fixture-secret'}}).encode()})
        login.get_by_text(labels['clientReady'],exact=True).wait_for()
        by_button(login,'signIn').last.click()
        page.wait_for_function("typeof window.m5Authorize==='string'")
        u=urlparse(page.evaluate("window.m5Authorize"));q=parse_qs(u.query)
        assert u.hostname=="accounts.google.com" and q['code_challenge_method']==['S256'] and q['scope']==['https://www.googleapis.com/auth/drive.file']
        assert urlparse(q['redirect_uri'][0]).hostname=="127.0.0.1"
        with urlopen(q['redirect_uri'][0]+'?'+urlencode({'code':'fixture-code','state':q['state'][0]}),timeout=8) as response:
            assert response.status==200
        page.wait_for_function("window.m5FixtureError || app.plugins.plugins.refsync.accounts.list().some(a=>a.subject==='test-subject'&&!a.needsLogin)")
        assert not page.evaluate("window.m5FixtureError"),page.evaluate("window.m5FixtureError")
        print(page.evaluate("""async()=>{
          const rs=app.plugins.plugins.refsync,v=app.vault,dir='Облачная публикация',to='Подписка OAuth',name='заметка.md';
          const a=rs.accounts.list().find(a=>a.subject==='test-subject');
          const p={...rs.config.profiles[0],id:'oauth-fixture',scope:'content',role:'publisher',access:'oauth',cloud:{account:a.id,engine:'google',root:'root'},
            reference:'/',local:dir,enabled:true,inheritMode:false,mode:'silent',startup:false,firstPlan:false,intervalMinutes:0,onFocus:false,onOnline:false,fileEvents:false};
          await v.createFolder(dir);await v.createFolder(to);await v.create(dir+'/'+name,'fixture');await rs.put(p);await rs.execute(p.id,'run');
          if(![...window.m5Files.values()].some(f=>f.name==='.sync-manifest.json'&&JSON.parse(new TextDecoder().decode(f.bytes)).files.length===1))throw Error('manifest');
          const sub={...p,id:'oauth-sub',role:'subscriber',local:to};await rs.put(sub);await rs.execute(sub.id,'run');
          if(await v.adapter.read(to+'/'+name)!=='fixture')throw Error('subscription');
          const stores=rs.stores(p),key=JSON.stringify([p.id,p.scope,stores.local.id,stores.reference.id]);
          await rs.engine.applier.undo(key,stores.reference,t=>rs.recoveryTarget(t));if(window.m5Files.size)throw Error('cloud undo');
          const saved=JSON.stringify(await rs.loadData());if(['fixture-secret','fixture-access','fixture-refresh'].some(x=>saved.includes(x)))throw Error('profile credential leak');
          rs.accounts.logout(a.id);if(!rs.accounts.list().some(x=>x.id===a.id&&x.needsLogin))throw Error('sign-out');
          return 'OAuth JSON picker, PKCE loopback, device credentials, private Drive fixture publication, subscription and undo passed';
        }"""))
    finally:
        page.evaluate("()=>{window.m5Cleanup();app.setting.close();}")
