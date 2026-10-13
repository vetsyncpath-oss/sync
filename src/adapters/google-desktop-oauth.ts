import { exchangeGoogleCode, GOOGLE_SCOPES, type GoogleClient, type GoogleGrant } from '../auth/google-auth';
import type { NetTransport } from '../sources/types';

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function authorizeGoogleDesktop(client: GoogleClient, transport: NetTransport, signal: AbortSignal,
    openBrowser: (url: string) => void | Promise<void>, timeoutMs = 300_000): Promise<GoogleGrant> {
    signal.throwIfAborted();
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    signal.throwIfAborted();
    // Desktop-only adapter. No Node imports enter the pure provider/core modules.
    const http: typeof import('node:http') = require('node:http');
    let redirectUri = '';
    const code = await new Promise<string>((resolve, reject) => {
        let consumed = false, finished = false;
        const server = http.createServer((request, response) => {
            let url:URL;try{url=new URL(request.url??'/',redirectUri);}catch{response.writeHead(400);response.end('Invalid callback URL');return;}
            if (request.method !== 'GET' || url.origin !== new URL(redirectUri).origin || url.pathname !== '/' || request.headers.host !== new URL(redirectUri).host
                || url.searchParams.get('state') !== state || consumed) {
                response.writeHead(400); response.end('Invalid authorization response'); return;
            }
            const code = url.searchParams.get('code'), error = url.searchParams.get('error');
            if (!code && !error) { response.writeHead(400); response.end('Missing authorization response'); return; }
            consumed = true;
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
                'Content-Security-Policy': "default-src 'none'", 'Referrer-Policy': 'no-referrer', Connection: 'close' });
            response.once('finish', () => server.closeAllConnections());
            response.end('You may close this page and return to Obsidian.');
            finish(error ? new Error('Google authorization was denied') : undefined, code ?? undefined);
        });
        const abort = () => finish(new DOMException('Google authorization cancelled', 'AbortError'));
        const timer = setTimeout(() => finish(new Error('Google authorization timed out')), timeoutMs);
        function finish(error?: Error, value?: string) {
            if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
            server.close(); if (error) server.closeAllConnections(); else server.closeIdleConnections();
            if (error) reject(error); else resolve(value!);
        }
        signal.addEventListener('abort', abort, { once: true });
        server.once('error', error => finish(error));
        server.listen(0, '127.0.0.1', () => {
            if (finished || signal.aborted) { server.close(); server.closeAllConnections(); abort(); return; }
            const address = server.address();
            if (!address || typeof address === 'string') { finish(new Error('OAuth callback unavailable')); return; }
            redirectUri = `http://127.0.0.1:${address.port}/`;
            const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            for (const [key, value] of Object.entries({ client_id: client.clientId, redirect_uri: redirectUri,
                response_type: 'code', scope: GOOGLE_SCOPES.join(' '), state, code_challenge: challenge,
                code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account' })) url.searchParams.set(key, value);
            Promise.resolve().then(() => openBrowser(url.href)).catch(error => finish(error));
        });
        if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    return exchangeGoogleCode(transport, client, code, verifier, redirectUri, signal);
}
