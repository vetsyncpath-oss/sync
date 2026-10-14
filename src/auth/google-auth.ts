import type { NetRequest, NetResponse, NetTransport } from '../sources/types';
import { SyncFault } from '../core/sync-issue';
import { NetError } from '../core/net';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive', 'openid'] as const;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export interface GoogleClient { clientId: string; clientSecret?: string }
export interface GoogleGrant { accessToken: string; refreshToken: string; expiresIn: number; subject: string }
export interface SecretPort { getSecret(id: string): string | null; setSecret(id: string, value: string): void }
export type GoogleSignInEvent = {stage:'waiting-browser';authorizationUrl:string} | {stage:'exchanging-code'};

/** Logical cancellation also bounds transports which cannot physically abort a request. */
export function waitForGoogle<T>(pending:Promise<T>,signal?:AbortSignal,discardLate?:(value:T)=>void):Promise<T> {
    if(!signal)return pending;
    return new Promise((resolve,reject)=>{
        const cleanup=()=>signal.removeEventListener('abort',abort);
        const abort=()=>{cleanup();reject(signal.reason??new DOMException('Google request cancelled','AbortError'));};
        signal.addEventListener('abort',abort,{once:true});
        pending.then(value=>{cleanup();if(signal.aborted){discardLate?.(value);return;}resolve(value);},error=>{cleanup();reject(error);});
        if(signal.aborted)abort();
    });
}
export async function withGoogleTimeout<T>(signal:AbortSignal,timeoutMs:number,error:Error,run:(signal:AbortSignal)=>Promise<T>):Promise<T> {
    signal.throwIfAborted();
    const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
    signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(error),timeoutMs);
    try{return await waitForGoogle(Promise.resolve().then(()=>{controller.signal.throwIfAborted();return run(controller.signal);}),controller.signal);}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}

/** Transport errors are network failures, not local IO. Never copy a request URL or body into diagnostics. */
function googleNetworkFailure(error:unknown,signal?:AbortSignal):unknown {
    signal?.throwIfAborted();
    if(error instanceof SyncFault||error instanceof NetError||(error as {name?:string})?.name==='AbortError')return error;
    const status=(error as {status?:number})?.status,code=(error as {code?:string})?.code;
    if(status!==undefined&&Number.isInteger(status)&&status>=400&&status<=599)
        return Object.assign(new SyncFault(status===401?'auth-required':'google-api',`Google transport failed: HTTP ${status}`,'source',status===408||status===429||status>=500),{status});
    if(code&&['file-too-large','redirect-policy','response-format'].includes(code))return new SyncFault(code,'Google transport rejected the response','source');
    return new SyncFault('network','Google connection interrupted; retry required','source',true);
}

export function parseGoogleClient(raw: string): GoogleClient {
    const value = JSON.parse(raw)?.installed;
    if (!value || typeof value.client_id !== 'string' || !value.client_id.endsWith('.apps.googleusercontent.com'))
        throw Error('Import a Google OAuth Desktop app client JSON');
    if (value.client_secret !== undefined && typeof value.client_secret !== 'string') throw Error('Invalid Desktop client configuration');
    return { clientId: value.client_id, clientSecret: value.client_secret };
}
export async function googleJson(transport: NetTransport, url: string, request: NetRequest): Promise<any> {
    request.signal?.throwIfAborted();
    try{const response = await waitForGoogle(transport.fetch(url, { ...request, maxBytes: request.maxBytes ?? 1024 * 1024, redirect: 'error' }),request.signal,response=>response.discard?.());
        return await googleResponse(response,request.signal);
    }catch(error){throw googleNetworkFailure(error,request.signal);}
}
export async function googleResponse(response:NetResponse,signal?:AbortSignal):Promise<any> {
    let raw:string;try{raw=await waitForGoogle(response.text(),signal);}catch(error){response.discard?.();throw googleNetworkFailure(error,signal);}signal?.throwIfAborted();
    let data: any;
    try { data = JSON.parse(raw); } catch { data=undefined; }
    if (response.status < 200 || response.status >= 300) {
        const candidate = typeof data?.error === 'string' ? data.error : data?.error?.errors?.[0]?.reason;
        const reason = typeof candidate === 'string' && /^[\w.-]{1,80}$/.test(candidate) ? candidate : undefined;
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500 || ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason ?? '');
        const retry=response.headers['retry-after'];const delay=retry&&/^\d+$/.test(retry)?Number(retry)*1000:retry?Math.max(0,Date.parse(retry)-Date.now()):0;
        throw Object.assign(new SyncFault(reason === 'invalid_grant' || response.status === 401 ? 'auth-required' : reason ?? 'google-api',
            `Google request failed: HTTP ${response.status}${reason ? ` (${reason})` : ''}`, 'source', retryable), { status: response.status,retryAt:retryable&&Number.isFinite(delay)&&delay>0?Date.now()+delay:undefined });
    }
    if(!data||typeof data!=='object')throw new SyncFault('response-format','Invalid Google response','source');
    return data;
}
function tokenRequest(client: GoogleClient, fields: Record<string, string>, signal?: AbortSignal): NetRequest {
    return { method: 'POST', signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: client.clientId, ...(client.clientSecret ? { client_secret: client.clientSecret } : {}), ...fields }).toString() };
}
function validateToken(data: any): void {
    if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0)
        throw new SyncFault('response-format', 'Invalid Google token response', 'source');
}
export async function exchangeGoogleCode(transport: NetTransport, client: GoogleClient,
    code: string, verifier: string, redirectUri: string, signal: AbortSignal): Promise<GoogleGrant> {
    const data = await googleJson(transport, TOKEN_URL, tokenRequest(client, { code, code_verifier: verifier,
        redirect_uri: redirectUri, grant_type: 'authorization_code' }, signal));
    validateToken(data);
    const scopes = new Set(String(data.scope ?? '').split(' '));
    if (!GOOGLE_SCOPES.every(scope => scopes.has(scope)) || typeof data.refresh_token !== 'string' || !data.refresh_token)
        throw new SyncFault('auth-required', 'Google did not grant offline read/write Drive access', 'source');
    const user = await googleJson(transport, 'https://openidconnect.googleapis.com/v1/userinfo',
        { signal, headers: { Authorization: `Bearer ${data.access_token}` } });
    if (typeof user.sub !== 'string' || !user.sub) throw new SyncFault('response-format', 'Google account identity is missing', 'source');
    signal.throwIfAborted();
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, subject: user.sub };
}

/** Single-flight refresh. A disconnected generation can never repopulate the cache. */
export class GoogleTokenManager {
    private token?: string;
    private expiresAt = 0;
    private pending?: Promise<string>;
    private controller = new AbortController();
    private epoch = 0;
    private disconnected = false;
    constructor(private readonly client: GoogleClient, private readonly secretRef: string,
        private readonly secrets: SecretPort, private readonly transport: NetTransport, private readonly now = Date.now,
        private readonly expectedSubject?: string,private readonly refreshTimeoutMs=60_000) {}
    get generation(): number { return this.epoch; }
    setAccess(token: string, expiresIn: number): void { this.token = token; this.expiresAt = this.now() + expiresIn * 1000; }
    invalidateAccess(token:string):void{if(this.token===token)this.expiresAt=0;}
    disconnect(): void {
        this.disconnected = true; this.epoch++; this.controller.abort(); this.token = undefined; this.expiresAt = 0;
    }
    async getToken(force = false, signal?: AbortSignal): Promise<string> {
        signal?.throwIfAborted();
        if (this.disconnected) throw new SyncFault('auth-required', 'Google account disconnected', 'source');
        if (!force && this.token && this.now() < this.expiresAt - 60_000) return this.token;
        if (!this.pending) {
            const epoch = this.epoch;
            const run = this.refresh(epoch);
            this.pending = run;
            void run.finally(() => { if (this.pending === run) this.pending = undefined; }).catch(() => {});
        }
        const token = await waitForToken(this.pending, signal);
        signal?.throwIfAborted();
        if (this.disconnected) throw new SyncFault('auth-required', 'Google account disconnected', 'source');
        return token;
    }
    private async refresh(epoch: number): Promise<string> {
        return withGoogleTimeout(this.controller.signal,this.refreshTimeoutMs,new SyncFault('network','Google token refresh timed out; retry required','source',true),signal=>this.refreshRequest(epoch,signal));
    }
    private async refreshRequest(epoch:number,signal:AbortSignal):Promise<string> {
        const refresh = this.secrets.getSecret(this.secretRef);
        if (!refresh) throw new SyncFault('auth-required', 'Connect your Google account', 'source');
        const data = await googleJson(this.transport, TOKEN_URL, tokenRequest(this.client,
            { refresh_token: refresh, grant_type: 'refresh_token' }, signal));
        validateToken(data);
        if(data.scope!==undefined&&!GOOGLE_SCOPES.every(scope=>String(data.scope).split(' ').includes(scope)))
            throw new SyncFault('auth-required','Reconnect Google with read/write Drive access','source');
        if(this.expectedSubject){
            const user=await googleJson(this.transport,'https://openidconnect.googleapis.com/v1/userinfo',
                {signal,headers:{Authorization:`Bearer ${data.access_token}`}});
            if(user.sub!==this.expectedSubject)throw new SyncFault('auth-required','Google account identity changed; reconnect','source');
        }
        signal.throwIfAborted();
        if (epoch !== this.epoch || this.disconnected) throw new SyncFault('auth-required', 'Google account disconnected', 'source');
        if (data.refresh_token !== undefined) {
            if (typeof data.refresh_token !== 'string' || !data.refresh_token) throw new SyncFault('response-format', 'Invalid refresh token', 'source');
            this.secrets.setSecret(this.secretRef, data.refresh_token);
        }
        this.setAccess(data.access_token, data.expires_in); return data.access_token;
    }
}

function waitForToken(pending: Promise<string>, signal?: AbortSignal): Promise<string> {
    if (!signal) return pending;
    return new Promise((resolve, reject) => {
        const abort = () => { cleanup(); reject(new DOMException('Request cancelled', 'AbortError')); };
        const cleanup = () => signal.removeEventListener('abort', abort);
        signal.addEventListener('abort', abort, { once: true });
        pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
        if (signal.aborted) abort();
    });
}

export class GoogleAuthorizedTransport implements NetTransport {
    constructor(private readonly transport: NetTransport, private readonly tokens: GoogleTokenManager) {}
    async fetch(url: string, options: NetRequest): Promise<NetResponse> {
        const parsed = new URL(url);
        if (parsed.origin !== 'https://www.googleapis.com' || parsed.username || parsed.password
            || !/^\/(?:upload\/)?drive\/v3\//.test(parsed.pathname)) throw new SyncFault('redirect-policy', 'Untrusted Google API endpoint', 'source');
        const generation = this.tokens.generation;
        for (let attempt = 0; attempt < 2; attempt++) {
            const token = await this.tokens.getToken(false, options.signal);
            let response:NetResponse;
            try{response = await waitForGoogle(this.transport.fetch(url, { ...options, redirect: 'error',
                headers: { ...options.headers, Authorization: `Bearer ${token}` } }),options.signal,response=>response.discard?.());}
            catch(error){
                if(generation!==this.tokens.generation)throw new SyncFault('auth-required','Google account disconnected','source');
                options.signal?.throwIfAborted();
                if((error as {status?:number})?.status===401&&attempt===0){this.tokens.invalidateAccess(token);continue;}
                throw googleNetworkFailure(error,options.signal);
            }
            if (generation !== this.tokens.generation) { response.discard?.(); throw new SyncFault('auth-required', 'Google account disconnected', 'source'); }
            if(options.signal?.aborted){response.discard?.();options.signal.throwIfAborted();}
            if (response.status !== 401 || attempt === 1) {
                const read=async<T>(body:()=>Promise<T>):Promise<T>=>{
                    try{const result=await waitForGoogle(body(),options.signal);options.signal?.throwIfAborted();
                        if(generation!==this.tokens.generation)throw new SyncFault('auth-required','Google account disconnected','source');return result;
                    }catch(error){throw googleNetworkFailure(error,options.signal);}
                };
                return {...response,text:()=>read(()=>response.text()),arrayBuffer:()=>read(()=>response.arrayBuffer()),discard:()=>response.discard?.()};
            }
            this.tokens.invalidateAccess(token);response.discard?.();
        }
        throw new SyncFault('auth-required', 'Reconnect Google account', 'source');
    }
}
