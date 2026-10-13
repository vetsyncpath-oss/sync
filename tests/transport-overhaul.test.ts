import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { NodeHttpTransport, BufferedHostTransport } from '../src/adapters/host-transport';
import { FetchTransport } from '../src/adapters/fetch-transport';
import { NodeArchiveDownloader } from '../src/adapters/archive-downloader';
import { NetLayer } from '../src/core/net';
import { ab, deferred } from './helpers';
import { Inflate, deflateRaw } from 'pako';
import { extractEntry, BufferArchiveReader, type ZipEntry } from '../src/core/archive';

async function server(t:any,handler:(req:IncomingMessage,res:ServerResponse)=>void){
 const instance=createServer(handler);await new Promise<void>((resolve,reject)=>{instance.once('error',reject);instance.listen(0,'127.0.0.1',resolve);});
 t.after(async()=>{instance.closeAllConnections();await new Promise<void>(resolve=>instance.close(()=>resolve()));});
 return `http://127.0.0.1:${(instance.address() as {port:number}).port}`;
}
test('desktop download does not use renderer fetch and reports chunks while a live stream exceeds its idle timeout',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Failed to fetch (renderer CORS)');});let sent=0;
 const url=await server(t,(_req,res)=>{res.writeHead(200,{'content-type':'text/css'});res.flushHeaders();const timer=setInterval(()=>{res.write('a');if(++sent===12){clearInterval(timer);res.end();}},20);res.once('close',()=>clearInterval(timer));});
 const bytes:number[]=[];const response=await new NodeHttpTransport({timeoutMs:500,idleTimeoutMs:100}).fetch(url,{observe:e=>{if(e.bytes)bytes.push(e.bytes);}});const body=await response.arrayBuffer();assert.equal(body.byteLength,12);assert(bytes.length>=8);assert(bytes[0]<body.byteLength);
});
test('desktop cancellation before headers closes the request promptly',async t=>{
 const opened=deferred();const url=await server(t,()=>opened.resolve());const controller=new AbortController(),request=new NodeHttpTransport({timeoutMs:500}).fetch(url,{signal:controller.signal});await opened.promise;const start=Date.now();controller.abort();await assert.rejects(request,{name:'AbortError'});assert(Date.now()-start<250);
});
test('stalled body has a distinct inactivity timeout and is not user cancellation',async t=>{
 const url=await server(t,(_req,res)=>{res.writeHead(200);res.flushHeaders();res.write('a');});const response=await new NodeHttpTransport({idleTimeoutMs:20}).fetch(url,{});await assert.rejects(response.arrayBuffer(),(e:any)=>e.name==='RequestTimeoutError'&&e.phase==='body');
});
test('redirect to a different origin drops credentials and enforces the redirect limit',async t=>{
 let authorization:string|undefined;const target=await server(t,(req,res)=>{authorization=req.headers.authorization;res.end('ok');});const origin=await server(t,(_req,res)=>{res.writeHead(302,{location:target});res.end();});
 const response=await new NodeHttpTransport().fetch(origin,{headers:{Authorization:'Bearer PRIVATE'}});assert.equal(new TextDecoder().decode(await response.arrayBuffer()),'ok');assert.equal(authorization,undefined);
 await assert.rejects(new NodeHttpTransport().fetch(origin,{redirect:'error'}),(e:any)=>e.code==='redirect-policy');
});
test('announced and chunked oversize responses are stopped at the transport buffer cap',async t=>{
 for(const announce of [true,false]){const url=await server(t,(_req,res)=>{res.writeHead(200,announce?{'content-length':'100'}:{});res.end('0123456789');});
  await assert.rejects(new NetLayer(new NodeHttpTransport({maxBytes:5})).fetchBuffer(url,{retries:1}),(e:any)=>e.code==='file-too-large');}
});
test('429 response returns a retry deadline and releases its unread response body',async t=>{
 const url=await server(t,(_req,res)=>{res.writeHead(429,{'retry-after':'3600'});res.end('limited');});await assert.rejects(new NetLayer(new NodeHttpTransport()).fetchBuffer(url,{retries:3,maxElapsedMs:100}),(e:any)=>e.status===429&&e.retryAfterMs===3600000);
});
test('native stream also resets its body inactivity timer on each chunk',async t=>{
 let timer:ReturnType<typeof setInterval>|undefined,count=0;t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(controller){timer=setInterval(()=>{controller.enqueue(new Uint8Array([1]));if(++count===8){clearInterval(timer);controller.close();}},20);}})));t.after(()=>clearInterval(timer));
 const response=await new FetchTransport({bodyTimeoutMs:100}).fetch('https://example.test',{});assert.equal((await response.arrayBuffer()).byteLength,8);
});
test('buffered mobile cancel does not permit overlapping unabortable host downloads',async()=>{
 const response=deferred<{status:number;headers:Record<string,string>;arrayBuffer:ArrayBuffer}>(),controller=new AbortController();let calls=0;
 const transport=new BufferedHostTransport(async()=>{calls++;return response.promise;});const first=transport.fetch('https://example.test',{signal:controller.signal});while(!calls)await Promise.resolve();controller.abort();await assert.rejects(first,{name:'AbortError'});
 const secondController=new AbortController(),second=transport.fetch('https://example.test',{signal:secondController.signal});for(let i=0;i<5;i++)await Promise.resolve();assert.equal(calls,1);secondController.abort();await assert.rejects(second,{name:'AbortError'});response.resolve({status:200,headers:{},arrayBuffer:ab('ok')});
});
test('mobile buffered transfer declares its capability and still enforces the platform cap',async()=>{
 const stages:any[]=[];const transport=new BufferedHostTransport(async()=>({status:200,headers:{'Content-Length':'6'},arrayBuffer:ab('REMOTE')}),{maxBytes:5});await assert.rejects(transport.fetch('https://example.test',{maxBytes:1000,observe:e=>stages.push(e)}),(e:any)=>e.code==='file-too-large');assert(stages.some(e=>e.capability==='buffered'));
});
test('archive cancellation works before response headers too',async t=>{
 const opened=deferred(),url=await server(t,()=>opened.resolve()),controller=new AbortController();const download=new NodeArchiveDownloader(500,undefined,1).download(url,{signal:controller.signal});await opened.promise;const start=Date.now();controller.abort();await assert.rejects(download,(e:any)=>e.aborted||e.name==='AbortError');assert(Date.now()-start<250);
});
function zipEntry(content:string,declared?:number){
 const data=new TextEncoder().encode(content),compressed=deflateRaw(data),bytes=new Uint8Array(30+1+compressed.length),view=new DataView(bytes.buffer);view.setUint32(0,0x04034b50,true);view.setUint16(26,1,true);bytes[30]=97;bytes.set(compressed,31);
 let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
 const entry:ZipEntry={isDir:false,name:'a',rawName:new Uint8Array([97]),flags:0,method:8,crc32:crc,compressedSize:compressed.length,uncompressedSize:declared??data.length,localHeaderOffset:0};return {reader:new BufferArchiveReader(bytes.buffer),entry};
}
test('standard ZIP DEFLATE works without a Node decompressor',async()=>{const zip=zipEntry('PORTABLE ZIP');assert.equal(new TextDecoder().decode(await extractEntry(zip.reader,zip.entry)),'PORTABLE ZIP');});
test('forged ZIP output size fails during bounded inflation',async()=>{const zip=zipEntry('a'.repeat(100000),1);await assert.rejects(extractEntry(zip.reader,zip.entry),/exceeds|размер/);});
test('ZIP extraction honors cancellation before inflating',async()=>{const zip=zipEntry('abc'),controller=new AbortController();controller.abort();await assert.rejects(extractEntry(zip.reader,zip.entry,controller.signal),/abort|cancel|прерван/i);});
