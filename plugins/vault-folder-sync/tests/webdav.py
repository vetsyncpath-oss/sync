from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote, quote
from xml.sax.saxutils import escape
import hashlib, shutil, threading
from playwright.sync_api import sync_playwright

files = {}
dirs = {""}
log = []
race = set()
weak = set()
restored = set()
dates = {}


def tag(data):
    return '"' + hashlib.sha256(data).hexdigest() + '"'

class Server(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def reply(self, status, data=b'', headers=None):
        self.send_response(status)
        for key, value in (headers or {}).items(): self.send_header(key,value)
        self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def pathkey(self): return unquote(urlparse(self.path).path.removeprefix('/dav/')).rstrip('/')
    def do_PROPFIND(self):
        p = self.pathkey()
        log.append(('PROPFIND',p))
        if self.headers['Depth']=='0':
            if p in restored:
                files[p] = b'reappeared'
                restored.remove(p)
            return self.reply(207 if p in files or p in dirs else 404)
        if p not in dirs: return self.reply(404)
        assert self.headers['Depth'] == '1'
        items = []
        for name in [p] + sorted(n for n in set(files) | dirs if n != p and n.rpartition('/')[0] == p):
            href = '/dav/' + quote(name) + ('/' if name in dirs and name else '')
            isdir = '<D:collection/>' if name in dirs else ''
            etag = '' if name in dirs else escape(tag(files[name]))
            if name in weak: etag = 'W/'+etag
            date = dates.get(name,'Wed, 18 Nov 2026 12:00:00 GMT')
            items.append(f'<D:response><D:href>{href}</D:href><D:propstat><D:prop><D:resourcetype>{isdir}</D:resourcetype><D:getetag>{etag}</D:getetag><D:getlastmodified>{date}</D:getlastmodified></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>')
        self.reply(207, ('<D:multistatus xmlns:D="DAV:">'+''.join(items)+'</D:multistatus>').encode())
    def do_DELETE(self):
        p = self.pathkey()
        log.append(('DELETE',p))
        if p in race:
            race.remove(p)
            files[p] = b'concurrent'
        if p not in files: return self.reply(404)
        if self.headers.get('If-Match') != tag(files[p]): return self.reply(412)
        del files[p]
        self.reply(204)
    def do_GET(self):
        if self.path == '/': return self.reply(200,b'<!doctype html><title>Obsidian API test</title>', {'Content-Type':'text/html'})
        p = self.pathkey()
        log.append(('GET',p))
        if p not in files: return self.reply(404)
        if self.headers.get('If-Match') not in [None,tag(files[p])]: return self.reply(412)
        self.reply(200, files[p])
    def do_MKCOL(self):
        p = self.pathkey()
        assert p.rpartition('/')[0] in dirs
        dirs.add(p)
        log.append(('MKCOL',p))
        self.reply(201)
    def do_PUT(self):
        p = self.pathkey()
        if p in race:
            race.remove(p)
            files[p] = b'concurrent'
        log.append(('PUT',p))
        if self.headers.get('If-None-Match') == '*' and p in files: return self.reply(412)
        if p in files and self.headers.get('If-Match') != tag(files[p]): return self.reply(412)
        assert p.rpartition('/')[0] in dirs
        files[p] = self.rfile.read(int(self.headers['Content-Length']))
        self.reply(201, headers={'ETag':tag(files[p])})

server = ThreadingHTTPServer(('127.0.0.1',0),Server)
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    page = browser.new_page()
    page.goto('http://127.0.0.1:'+str(server.server_port))
    page.add_script_tag(content=Path(__file__).with_name('mock-obsidian.js').read_text())
    page.add_script_tag(content='(function(){' + (Path(__file__).resolve().parents[1] / 'main.js').read_text() + '})()')
    page.evaluate('''async () => { window.plugin = new module.exports(); plugin.app = {...app,vault}; await plugin.onload(); plugin.pair().settings.url = "https://mock.example/dav/"; plugin.pair().settings.folder="Работа"; }''')
    ev = page.evaluate
    run = lambda dry=False: ev('(dry) => plugin.run(dry,true).then(()=>plugin.reports.get(plugin.selected).rows)',dry)
    read = lambda path: ev('(p)=> Array.from(new Uint8Array(map.get(p).bytes))',path)
    write = lambda path,data: ev('([p,s]) => setfile(p,new TextEncoder().encode(s))',[path,data])
    contents = lambda path: bytes(read(path)).decode()
    write('Работа/Локально #1.md','hello')
    write('Другая/невидимый.md','outside')
    write('Работа/.секрет/тайна.md','hidden')
    write('Работа/папка/заметка.md','nested')
    dirs.update(['фото','.secret'])
    files['.secret/x'] = b'secret'
    files['фото/100%.png'] = bytes(range(256))
    before = dict(files)
    assert len(run(True)) == 3 and files == before and not ev('map.has("Работа/фото/100%.png")')
    assert not [x for x in log if x[0] in ('PUT','MKCOL')]
    print('PASS preview is read-only; exclusions, scope and unicode paths')
    assert len(run()) == 3 and files['папка/заметка.md'] == b'nested'
    assert bytes(read('Работа/фото/100%.png')) == bytes(range(256))
    log.clear()
    assert run() == [] and all(op=='PROPFIND' for op,p in log)
    print('PASS nested upload, exact binary download and unchanged repeat')
    write('Работа/Локально #1.md','second')
    files['фото/100%.png'] = b'changed-image'
    assert len(run()) == 2 and files['Локально #1.md'] == b'second' and contents('Работа/фото/100%.png')=='changed-image'
    files['папка/заметка.md'] = 'правка с сервера'.encode()
    assert len(run()) == 1 and contents('Работа/папка/заметка.md') == 'правка с сервера'
    files['папка/заметка.md'] = b'server racing'
    ev("""() => { const original = vault.process; vault.process = async (f,cb) => {
      vault.process = original; setfile(f.path, new TextEncoder().encode('local during sync')); return original(f,cb);
    }; }""")
    assert 'изменился во время загрузки' in run()[-1] and contents('Работа/папка/заметка.md')=='local during sync'
    write('Работа/папка/заметка.md','server racing')
    assert run()==[]
    print('PASS Markdown download and concurrent local edit protection')
    write('Работа/Локально #1.md','local edit')
    files['Локально #1.md'] = b'remote edit'
    rows = run()
    assert len(rows)==1 and 'Конфликт' in rows[0] and contents('Работа/Локально #1.md')=='local edit' and files['Локально #1.md']==b'remote edit'
    write('Работа/Локально #1.md','remote edit')
    assert run()==[]
    print('PASS bidirectional edits, conflict preservation and resolution')
    del files['Локально #1.md']
    ev('map.delete("Работа/фото/100%.png")')
    assert len(run()) == 2 and files['Локально #1.md']==b'remote edit' and contents('Работа/фото/100%.png')=='changed-image'
    write('Работа/Локально #1.md','racing')
    race.add('Локально #1.md')
    assert '412' in run()[-1] and files['Локально #1.md']==b'concurrent'
    assert 'Конфликт' in run()[0]
    print('PASS restoration of deleted files and conditional write race')
    files['ПАПКА'] = b'collision'
    assert 'Несовместимые пути' in run()[-1]
    del files['ПАПКА']
    ev('plugin.pair().settings.folder = "Другая"')
    write('Другая/Локально #1.md','other folder')
    assert any('Конфликт' in r for r in run(True))
    print('PASS file/folder collision and baseline isolation')
    # Reset the test data to one pair and exercise each rule through the plugin command.
    def reset(local=None, remote=None, **opts):
        files.clear(); dirs.clear(); dirs.add(""); weak.clear(); dates.clear(); log.clear()
        ev("""(opts) => {map.clear(); plugin.pair().state={scope:'',files:{}};
            Object.assign(plugin.pair().settings,{folder:'',direction:'both',deletion:'restore',conflict:'skip'},opts);}""",opts)
        if local is not None: write('x.md',local)
        if remote is not None: files['x.md']=remote.encode()
    for direction in ['upload','download','both']:
        for deletion in ['restore','propagate','ignore']:
            for missing in ['local','remote']:
                reset('base','base',direction=direction,deletion=deletion)
                assert run()==[]
                if missing=='local': ev("map.delete('x.md')")
                else: del files['x.md']
                log.clear()
                planned=run(True)
                assert all(op in ('GET','PROPFIND') for op,_ in log)
                assert run()==planned
                can_copy = direction in ('both','download' if missing=='local' else 'upload')
                can_delete = direction in ('both','upload' if missing=='local' else 'download')
                if deletion=='propagate' and can_delete:
                    assert not ev("map.has('x.md')") and not files
                elif can_copy and deletion!='ignore':
                    assert contents('x.md')=='base' and files['x.md']==b'base'
                else:
                    assert ev("map.has('x.md')") == (missing=='remote')
                    assert bool(files) == (missing=='local')
    print('PASS 18 direction/deletion combinations and preview parity')
    for direction,side in [('upload','remote'),('download','local'),('both','remote'),('both','local')]:
        reset('only' if side=='local' else None,'only' if side=='remote' else None,direction=direction,deletion='propagate')
        run()
        assert not any(op=='DELETE' for op,p in log)
        assert side!='local' or contents('x.md')=='only'
        assert side!='remote' or files['x.md']==b'only'
    for side in ['local','remote']:
        reset('v','v',deletion='propagate',conflict='local')
        run()
        if side=='local': del files['x.md']; write('x.md','new')
        else: ev("map.delete('x.md')"); files['x.md']=b'new'
        assert 'Конфликт' in run()[0] and (contents('x.md')=='new' if side=='local' else files['x.md']==b'new')
    reset('v','v',deletion='propagate')
    run(); ev("map.delete('x.md')"); race.add('x.md')
    assert '412' in run()[-1] and files['x.md']==b'concurrent'
    reset('v','v',deletion='propagate')
    run(); del files['x.md']; restored.add('x.md')
    assert 'Остановлено' in run()[-1] and contents('x.md')=='v'
    reset('v','v',deletion='propagate')
    run(); ev("map.delete('x.md')"); weak.add('x.md')
    assert 'ETag' in run()[0] and files['x.md']==b'v'
    print('PASS first discovery, delete/edit conflicts, ETag and reappearing files')
    for direction in ['upload','download','both']:
        for policy in ['skip','local','remote','newer']:
            reset('local','remote',direction=direction,conflict=policy)
            ev("map.get('x.md').stat={mtime:Date.parse('2026-11-18T14:00:00Z')}")
            planned=run(True); assert run()==planned
            if policy in ['local','newer'] and direction!='download': assert files['x.md']==b'local'
            elif policy=='remote' and direction!='upload': assert contents('x.md')=='remote'
            else: assert 'Конфликт' in planned[0] and files['x.md']==b'remote' and contents('x.md')=='local'
    reset('local','remote',conflict='newer')
    for stamp in ['2026-11-18T12:00:00.500Z','bad']:
        ev("stamp => map.get('x.md').stat = {mtime: Date.parse(stamp)}",stamp)
        assert 'Конфликт' in run()[0]
    ev("map.get('x.md').stat={mtime:0}")
    assert 'WebDAV →' in run()[0] and contents('x.md')=='remote'
    print('PASS 12 direction/conflict combinations, timestamps and ties')
    # Real plugin lifecycle with saved 0.1 data and a deterministic browser clock.
    ev("""async () => {plugin.onunload(); window.initialData={settings:{url:'https://mock.example/dav/',user:'alice',folder:'',interval:15},state:plugin.pair().state};
        window.plugin=new module.exports(); plugin.app={...app,vault}; await plugin.onload();}""")
    assert ev("plugin.pair().settings.interval===15 && plugin.disk.pairs[0].settings.conflict==='skip' && plugin.pair().state.files['x.md']!==undefined")
    assert ev("!('password' in plugin.disk.pairs[0].settings)")
    print('PASS 0.1 migration of settings, history and interval')
    page.clock.install()
    ev("""() => {
      window.autoRuns=[]; plugin.sync=async (pair)=>{autoRuns.push(pair.id);};
      Object.assign(plugin.pair().settings,{onEdit:true,delay:5,folder:'notes',onReconnect:true,interval:5});
      plugin.passwords.set('main','session'); plugin.schedule(plugin.pair());
      plugin.pairs.push({id:'second',settings:{...plugin.pair().settings, folder:'else',user:'',interval:0,onReconnect:false},state:{scope:'',files:{}}});
      listeners.get('modify')({path:'elsewhere/a.md'});
      listeners.get('rename')({path:'out/x.md'},'notes/old.md');
      listeners.get('modify')({path:'notes/x.md'});
      listeners.get('modify')({path:'notes/.obsidian/data.json'});
    }""")
    page.clock.fast_forward(5500)
    assert ev('autoRuns')==['main']
    ev("listeners.get('modify')({path:'else/a.md'})"); page.clock.fast_forward(5500)
    assert ev('autoRuns')==['main','second']
    ev("plugin.editingSettings=true;window.dispatchEvent(new Event('online'))")
    assert ev('autoRuns.length')==2
    ev("plugin.editingSettings=false;plugin.drain()")
    assert ev('autoRuns.length')==3
    page.clock.fast_forward(300000)
    assert ev('autoRuns.length')==4
    ev("plugin.passwords.clear();window.dispatchEvent(new Event('online'))")
    assert ev('autoRuns.length')==4
    ev("plugin.passwords.set('main','session');plugin.drain()")
    assert ev('autoRuns.length')==5
    ev("""() => {plugin.onunload();window.dispatchEvent(new Event('online'))}""")
    page.clock.fast_forward(300000)
    assert ev('autoRuns.length')==5
    ev("""async () => {window.initialData={...plugin.disk,pairs:[{id:'a',settings:{url:'https://mock.example/dav/',startup:true},state:{scope:'',files:{}}}]};
      plugin=new module.exports();plugin.app={...app,vault}; plugin.sync=async p=>autoRuns.push(p.id);await plugin.onload();}""")
    assert ev('autoRuns.at(-1)')=='a'
    print('PASS startup, interval, reconnect, rename, debounce, session unlock, queue and unload')
    browser.close()
server.shutdown()
