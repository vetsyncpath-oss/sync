import { ResourceGate } from '../core/resource-gate';
import type { NetRequest, NetResponse, NetTransport } from '../sources/types';
import { RequestTimeoutError } from './fetch-transport';

export interface HostTransportOptions { timeoutMs?:number; idleTimeoutMs?:number; totalTimeoutMs?:number; maxBytes?:number }
const abortError=()=>new DOMException('Request cancelled','AbortError');

/** Desktop HTTP bypasses the renderer's CORS policy and reports real response chunks. */
export class NodeHttpTransport implements NetTransport {
    constructor(private readonly opts:HostTransportOptions={}) {}
    fetch(url:string, options:NetRequest={}):Promise<NetResponse> { return this.request(url,options,0); }
    private async request(url:string, options:NetRequest, redirects:number):Promise<NetResponse> {
        options.signal?.throwIfAborted();const parsed=new URL(url);
        if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Object.assign(new Error('Unsupported download URL'),{code:'redirect-policy'});
        const http:typeof import('node:http')=require(parsed.protocol==='https:'?'https':'http');
        return new Promise((resolve,reject)=>{
            let response:import('node:http').IncomingMessage|undefined, settled=false, done=false;
            let timeout:ReturnType<typeof setTimeout>|undefined;
            const total=setTimeout(()=>fail(Object.assign(new Error('Request total time budget exhausted'),{code:'timeout'})),this.opts.totalTimeoutMs??30*60_000);
            let bodyResolve!:(data:ArrayBuffer)=>void, bodyReject!:(error:unknown)=>void;
            const body=new Promise<ArrayBuffer>((yes,no)=>{bodyResolve=yes;bodyReject=no;});void body.catch(()=>{});
            const cleanup=()=>{if(timeout)clearTimeout(timeout);clearTimeout(total);options.signal?.removeEventListener('abort',onAbort);};
            const fail=(error:Error)=>{if(done)return;done=true;cleanup();response?.destroy();request.destroy();if(!settled)reject(error);bodyReject(error);};
            const arm=(phase:'headers'|'body')=>{if(timeout)clearTimeout(timeout);const ms=phase==='headers'?(this.opts.timeoutMs??60_000):(this.opts.idleTimeoutMs??60_000);timeout=setTimeout(()=>fail(new RequestTimeoutError(phase,ms)),ms);};
            const onAbort=()=>fail(abortError());
            const request=http.request(parsed,{method:options.method??'GET',headers:{'user-agent':'VaultSync','accept-encoding':'identity',...options.headers}},res=>{
                response=res;const status=res.statusCode??0;
                const headers:Record<string,string>={};for(const [key,value]of Object.entries(res.headers))if(value!==undefined)headers[key]=Array.isArray(value)?value.join(', '):String(value);
                if(status>=300&&status<400&&status!==304&&headers.location){
                    res.destroy();done=true;cleanup();
                    if(options.redirect==='error'||redirects>=5){reject(Object.assign(new Error('Redirect policy or redirect limit exceeded'),{code:'redirect-policy'}));return;}
                    if(options.redirect==='manual'){resolve({status,headers,arrayBuffer:async()=>new ArrayBuffer(0),text:async()=>''});return;}
                    let target:URL;try{target=new URL(headers.location,parsed);}catch{reject(new Error('Invalid redirect'));return;}
                    if(parsed.protocol==='https:'&&target.protocol!=='https:'){reject(Object.assign(new Error('HTTPS downgrade blocked'),{code:'redirect-policy'}));return;}
                    const nextHeaders={...options.headers};if(target.origin!==parsed.origin)for(const key of Object.keys(nextHeaders))if(/authorization|cookie|token|api.key/i.test(key))delete nextHeaders[key];
                    const method=status===303||(status===301||status===302)&&options.method==='POST'?'GET':options.method;
                    resolve(this.request(target.href,{...options,headers:nextHeaders,method,body:method==='GET'?undefined:options.body},redirects+1));return;
                }
                const max=Math.min(options.maxBytes??Infinity,this.opts.maxBytes??256*1024*1024);
                const announced=Number(headers['content-length']);
                if(Number.isFinite(announced)&&announced>max){fail(Object.assign(new Error('Response exceeds buffer limit'),{code:'file-too-large'}));return;}
                arm('body');res.pause();const chunks:Uint8Array[]=[];let bytes=0;
                res.on('data',(chunk:Buffer)=>{
                    bytes+=chunk.length;if(bytes>max){fail(Object.assign(new Error('Response exceeds buffer limit'),{code:'file-too-large'}));return;}
                    chunks.push(chunk);arm('body');try{options.observe?.({stage:'download',bytes,byteDelta:chunk.length,totalBytes:Number.isFinite(announced)?announced:undefined,host:parsed.host,capability:'streaming'});}catch(error){fail(error as Error);}
                });
                res.on('error',error=>fail(error));res.on('aborted',()=>fail(new Error('Response body interrupted')));
                res.on('end',()=>{if(done)return;done=true;cleanup();const out=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}bodyResolve(out.buffer);});
                settled=true;let consumed=false;
                const read=()=>{if(consumed)throw Error('Response already consumed');consumed=true;res.resume();return body;};
                resolve({status,headers,arrayBuffer:read,text:()=>read().then(data=>new TextDecoder().decode(data)),discard:()=>{if(done)return;done=true;cleanup();res.destroy();request.destroy();bodyReject(abortError());}});
            });
            request.on('error',error=>fail(error));options.signal?.addEventListener('abort',onAbort,{once:true});arm('headers');
            if(options.signal?.aborted){onAbort();return;}
            if(options.body!==undefined){if(typeof options.body!=='string'){fail(new Error('Unsupported HTTP request body'));return;}request.write(options.body);}
            request.end();
        });
    }
}

export interface HostRequest { (request:{url:string;method:string;headers?:Record<string,string>;body?:string;throw:boolean}):Promise<{status:number;headers:Record<string,string>;arrayBuffer:ArrayBuffer}> }
/** Mobile requestUrl bypasses CORS but exposes neither streaming nor physical abort.
 * The UI reports that capability; cancelled responses cannot reach file application.
 */
export class BufferedHostTransport implements NetTransport {
    private readonly gate=new ResourceGate(1);
    constructor(private readonly request:HostRequest,private readonly opts:HostTransportOptions={}) {}
    async fetch(url:string,options:NetRequest={}):Promise<NetResponse> {
        options.signal?.throwIfAborted();
        options.observe?.({stage:'download',host:new URL(url).host,capability:'buffered'});
        if(options.redirect==='error')throw Object.assign(new Error('This platform cannot enforce a no-redirect authenticated request'),{code:'redirect-policy'});
        options.observe?.({stage:'waiting',capability:'buffered'});
        const release=await this.gate.acquire(1,options.signal??new AbortController().signal);
        options.observe?.({stage:'download',host:new URL(url).host,capability:'buffered'});
        let timer:ReturnType<typeof setTimeout>|undefined;
        const response=await new Promise<Awaited<ReturnType<HostRequest>>>((resolve,reject)=>{
            const abort=()=>{cleanup();reject(abortError());};
            const cleanup=()=>{if(timer)clearTimeout(timer);options.signal?.removeEventListener('abort',abort);};
            options.signal?.addEventListener('abort',abort,{once:true});
            timer=setTimeout(()=>{cleanup();reject(new RequestTimeoutError('body',this.opts.totalTimeoutMs??120_000));},this.opts.totalTimeoutMs??120_000);
            Promise.resolve().then(()=>this.request({url,method:options.method??'GET',headers:options.headers,body:options.body as string|undefined,throw:false})).finally(release).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
        });
        options.signal?.throwIfAborted();
        if(response.arrayBuffer.byteLength>Math.min(options.maxBytes??Infinity,this.opts.maxBytes??32*1024*1024))throw Object.assign(new Error('Response exceeds mobile buffer limit'),{code:'file-too-large'});
        const headers:Record<string,string>={};for(const [key,value]of Object.entries(response.headers))headers[key.toLowerCase()]=value;
        options.observe?.({stage:'download',bytes:response.arrayBuffer.byteLength,byteDelta:response.arrayBuffer.byteLength,capability:'buffered'});
        return {status:response.status,headers,arrayBuffer:async()=>response.arrayBuffer,text:async()=>new TextDecoder().decode(response.arrayBuffer)};
    }
}
