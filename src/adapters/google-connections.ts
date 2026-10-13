import { GoogleAuthorizedTransport, GoogleTokenManager, type GoogleClient, type SecretPort } from '../auth/google-auth';
import { authorizeGoogleDesktop } from './google-desktop-oauth';
import { GoogleDriveClient } from '../sources/gdrive-client';
import type { NetTransport } from '../sources/types';
import type { SourceConnection } from '../core/profiles';
import type { GoogleConnectionActions } from '../ui/gdrive-folder-picker';

export interface GoogleConnectionHost {
    transport(): NetTransport;
    secrets(): SecretPort;
    guard(): void;
    connections(): readonly SourceConnection[];
    openBrowser(url: string): Promise<void> | void;
    pick(client: GoogleDriveClient, signal: AbortSignal): ReturnType<GoogleConnectionActions['pickFolder']>;
    maxBytes(): number;
}
/** Credentials live in host SecretStorage; connection drafts contain references only. */
export class GoogleConnections {
    private readonly pool = new Map<string, { manager: GoogleTokenManager; transport: NetTransport; fingerprint: string }>();
    constructor(private readonly host: GoogleConnectionHost) {}
    transport(values: Record<string, unknown>): NetTransport {
        this.host.guard();
        const client=this.client(values), ref=String(values.secretRef??''), subject=String(values.accountSub??'');
        if(!ref||!subject)throw Error('Connect a Google account first');
        const fingerprint=JSON.stringify([client,subject]);let entry=this.pool.get(ref);
        if(entry&&entry.fingerprint!==fingerprint)throw Error('Google credential reference belongs to another client or account');
        if(!entry){const manager=new GoogleTokenManager(client,ref,this.host.secrets(),this.host.transport(),Date.now,subject);
            entry={manager,transport:new GoogleAuthorizedTransport(this.host.transport(),manager),fingerprint};this.pool.set(ref,entry);}
        return entry.transport;
    }
    disconnect(): void { for(const entry of this.pool.values())entry.manager.disconnect();this.pool.clear(); }
    private client(values: Record<string,unknown>): GoogleClient {
        if(typeof values.clientId!=='string'||!values.clientId.endsWith('.apps.googleusercontent.com'))throw Error('Import an OAuth Desktop client JSON');
        return {clientId:values.clientId,clientSecret:typeof values.clientSecret==='string'?values.clientSecret:undefined};
    }
    actions(): GoogleConnectionActions {
        const created=new Set<string>();
        const discard=(ref:string)=>{if(!created.has(ref)||this.host.connections().some(c=>c.values.secretRef===ref))return;
            this.pool.get(ref)?.manager.disconnect();this.pool.delete(ref);this.host.secrets().setSecret(ref,'');created.delete(ref);};
        return {
            signIn:async(values,signal)=>{
                this.host.guard();const client=this.client(values);
                const grant=await authorizeGoogleDesktop(client,this.host.transport(),signal,url=>this.host.openBrowser(url));
                signal.throwIfAborted();this.host.guard();
                const ref='vault-sync-google-'+crypto.randomUUID();created.add(ref);
                try {this.host.secrets().setSecret(ref,grant.refreshToken);
                    const next={...client,accountSub:grant.subject,secretRef:ref};this.transport(next);
                    this.pool.get(ref)!.manager.setAccess(grant.accessToken,grant.expiresIn);return next;
                }catch(error){discard(ref);throw error;}
            },
            pickFolder:async(values,signal)=>{signal.throwIfAborted();return this.host.pick(new GoogleDriveClient(this.transport(values),this.host.maxBytes()),signal);},
            accounts:()=>{
                const seen=new Set<string>();return this.host.connections().filter(c=>c.kind==='gdrive'&&c.values.authMode==='oauth-desktop'
                    &&typeof c.values.secretRef==='string'&&!seen.has(c.values.secretRef)&&!!seen.add(c.values.secretRef))
                    .map(c=>({name:c.name,values:{...c.values}}));
            },
            discardSecret:discard,
            releaseDraft:()=>{for(const ref of [...created])discard(ref);},
        };
    }
}
