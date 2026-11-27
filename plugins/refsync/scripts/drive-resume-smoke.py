"""Publish a 300 MiB book with the installed plugin; restart Obsidian between attempts."""
import hashlib
from pathlib import Path
import tempfile

SIZE = 300 * 1024 * 1024
CHUNK = 8 * 1024 * 1024

# Only the authenticated Drive transport and account list are substituted. The
# renderer uses the packaged engine, vault adapter, journal and session storage.
def attempt(page, folder, retry, delay_ms):
    page.wait_for_function("!!window.app?.plugins?.plugins?.refsync", timeout=65000)
    return page.evaluate("""async ({folder,retry,delay}) => {
      const rs = app.plugins.plugins.refsync; await rs.ready;
      const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
      const account = 'a'.repeat(64), book = 'book.pdf', prefix = 'Drive upload fixture';
      rs.accounts.list = () => [{id:account,engine:'google',full:true,label:'Drive fixture'}];
      const metaPath = path.join(folder,'meta.json');
      const meta = retry ? JSON.parse(await fs.readFile(metaPath,'utf8')) : {sessions:[],files:{}};
      let firstOffset = -1, queried = false, starts = 0;
      const persist = () => fs.writeFile(metaPath,JSON.stringify(meta));
      const reply = (value={},status=200,headers={}) => ({arrayBuffer:new TextEncoder().encode(JSON.stringify(value)).buffer,status,headers});
      async function digestFile(name){
        const digest=crypto.createHash('sha256');
        for await (const chunk of require('node:fs').createReadStream(name)) digest.update(chunk);
        return digest.digest('hex');
      }
      rs.accounts.transport = () => async (url,method='GET',headers={},data) => {
        const u=new URL(url), id=u.pathname.split('/').pop();
        if (u.searchParams.has('upload_id')){
          const n=Number(u.searchParams.get('upload_id')),s=meta.sessions[n],span=headers['Content-Range'];
          if(span?.startsWith('bytes */')){ queried=true;return reply({},308,{range:'bytes=0-'+(s.offset-1)}); }
          if (s.name===book) {
            const start=Number(/^bytes (\\d+)-/.exec(span)[1]);
            if (firstOffset===-1) firstOffset=start;
            if (start!==s.offset) throw Error('incorrect range '+start);
            if (!retry && start===16777216) throw Error('fixtureDisconnect');
            if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
          }
          const dest=path.join(folder,'upload-'+n);
          await fs.appendFile(dest,new Uint8Array(data));s.offset+=data.byteLength;
          if(s.offset===s.size){
            meta.files[s.id]={id:s.id,name:s.name,size:s.size,mimeType:'application/octet-stream',modifiedTime:'2025-01-01T00:00:00Z',sha256Checksum:await digestFile(dest),disk:dest};
            await persist();return reply({id:s.id});
          }
          await persist();return reply({},308,{range:'bytes=0-'+(s.offset-1)});
        }
        if(u.searchParams.get('uploadType')==='resumable'){
          const {name}=JSON.parse(new TextDecoder().decode(data)), n=meta.sessions.length;
          if(name===book) starts++;
          meta.sessions.push({name,id:method==='PATCH'?id:'file-'+n,size:Number(headers['X-Upload-Content-Length']),offset:0});
          await persist();
          return reply({},200,{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id='+n});
        }
        if (method==='PATCH') {delete meta.files[id];await persist();return reply();}
        if (u.searchParams.get('alt')==='media'){
          const bytes=await fs.readFile(meta.files[id].disk);
          return {status:200,headers:{},arrayBuffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
        }
        if(id==='root') return reply({id:'root',mimeType:'application/vnd.google-apps.folder'});
        if(id==='files') return reply({files:Object.values(meta.files)});
        throw Error('unexpected fixture request '+method+' '+u.pathname);
      };
      const p={...rs.newProfile(),id:'drive-large-smoke',scope:'content',access:'oauth',role:'publisher',reference:'/',local:prefix,cloud:{engine:'google',root:'root',account},enabled:true,startup:false,onFocus:false,onOnline:false,fileEvents:false,intervalMinutes:0,inheritMode:false,mode:'silent'};
      const store=rs.stores(p);
      let lookup='unset',saved='unset';
      const port=store.reference.mutable.sessions;
      const fingerprint=v=>v?crypto.createHash('sha256').update(JSON.parse(v).signature).digest('hex').slice(0,12):'missing';
      const get=port.get,set=port.set;
      port.get=async id=>{const v=await get(id);lookup=fingerprint(v);return v;};
      port.set=async (id,v)=>{if(v)saved=fingerprint(v);await set(id,v);};
      // Fail the test if source staging or scanning downloads the entire book.
      const download=store.local.download.bind(store.local);
      store.local.download=(p,...args)=>{if(p===book)throw Error('full-book read');return download(p,...args);};
      try {
        await rs.engine.run(p,store.reference,store.local,false,undefined,{mode:'silent'});
        if(!retry) throw Error('disconnect missing');
      } catch(e){if(retry || e.message!=='fixtureDisconnect')throw e;}
      const uploaded=Object.values(meta.files).find(f=>f.name===book);
      return {firstOffset,queried,starts,lookup,saved,sha:uploaded?.sha256Checksum??'',offset:meta.sessions.find(s=>s.name===book)?.offset};
    }""", {"folder":str(folder), "retry":retry, "delay":delay_ms})


def run(page, vault, restart, delay_ms=0):
    with tempfile.TemporaryDirectory() as cloud:
        local = vault / "Drive upload fixture"
        local.mkdir()
        book = local / "book.pdf"
        digest = hashlib.sha256()
        block = bytes(range(256)) * 4096
        with book.open("wb") as stream:
            for _ in range(SIZE // len(block)):
                digest.update(block)
                stream.write(block)
        first = attempt(page, cloud, False, 0)
        assert first["offset"] == 2 * CHUNK and first["starts"] == 1, first
        assert first["saved"] != "unset", first
        page = restart()
        result = attempt(page, cloud, True, delay_ms)
        assert result["lookup"] == first["saved"] and result["queried"] and result["starts"] == 0, (first,result)
        assert result["firstOffset"] == 2 * CHUNK and result["sha"] == digest.hexdigest(), result
        with book.open('rb') as stream:
            assert hashlib.file_digest(stream,'sha256').hexdigest() == digest.hexdigest()
        print("Drive: 300 MiB, restart, resumed at 16 MiB, source and destination SHA-256 verified")
        return page
