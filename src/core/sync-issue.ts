import { NetError } from './net';
import type { PipelineStage, SyncIssue } from '../sources/types';

/** Diagnostic strings must never persist signed download URLs or credentials. */
export function diagnosticText(value: unknown): string {
    const text = value instanceof Error ? value.message : String(value);
    return text.replace(/https?:\/\/[^\s<>"']+/g, raw => {
        try { const url = new URL(raw); return url.origin + url.pathname; } catch { return '[URL]'; }
    }).replace(/(Bearer|Basic)\s+[A-Za-z0-9+/=_-]+/gi,'$1 [redacted]').replace(/(authorization|password|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').slice(0, 1000);
}
export class SyncFault extends Error {
    constructor(readonly code: string, message: string, readonly scope: SyncIssue['scope'] = 'file', readonly retryable = false,readonly domain?:'job'|'shared') {
        super(message); this.name = 'SyncFault';
    }
}
export function syncIssue(error: unknown, stage: PipelineStage,seen=new Set<unknown>()): SyncIssue {
    const message = diagnosticText(error);
    const cause=(error as {cause?:unknown})?.cause;
    if(!(error instanceof NetError)&&!(error instanceof SyncFault)&&cause instanceof Error&&!seen.has(cause)){
        seen.add(error);return {...syncIssue(cause,stage,seen),message};
    }
    if (error instanceof SyncFault) return { code:error.code, message, stage, scope:error.scope, retryable:error.retryable,domain:error.domain,
        status:(error as SyncFault&{status?:number}).status,retryAt:(error as SyncFault&{retryAt?:number}).retryAt };
    if (error instanceof NetError) return {
        code: error.code ?? (error.status === 429 ? 'rate-limit' : error.status === 401 || error.status === 403 ? 'access-denied' : error.status === 404 ? 'remote-missing' : 'network'),
        message, stage, status:error.status, attempt:error.attempt, host:error.host,
        retryAt:error.retryAfterMs === undefined ? undefined : Date.now() + error.retryAfterMs,
        scope:'file', retryable:!error.aborted && !['file-too-large','redirect-policy','response-format'].includes(error.code??'') && (error.code === 'integrity' || error.status === undefined || error.status === 429 || error.status === 408 || error.status >= 500),
    };
    return { code:/changed|stale/i.test(message)?'local-changed':/exist|directory/i.test(message)?'path-collision':'io', message, stage, retryable:/changed|stale/i.test(message), scope:'file' };
}
