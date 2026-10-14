import type { NetRequest, NetResponse, NetTransport } from '../sources/types';

const DEFAULT_TIMEOUT_MS = 60000;
/** [P1/M6] Дефолтный дедлайн чтения тела после заголовков (5 мин). */
const DEFAULT_BODY_TIMEOUT_MS = 300000;

export interface FetchTransportOptions {
        timeoutMs?: number;
        /** Inactivity timeout; reset after every received chunk. */
        bodyTimeoutMs?: number;
}

export class RequestTimeoutError extends Error {
        constructor(readonly phase:'headers'|'body',readonly timeoutMs:number) {
                super(`Request timeout during ${phase} after ${timeoutMs}ms`);this.name='RequestTimeoutError';
        }
}

export class FetchTransport implements NetTransport {
        private readonly timeoutMs: number;
        private readonly bodyTimeoutMs: number;

        constructor(opts: FetchTransportOptions = {}) {
                this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
                this.bodyTimeoutMs = opts.bodyTimeoutMs ?? Math.max(this.timeoutMs * 4, DEFAULT_BODY_TIMEOUT_MS);
        }

        async fetch(url: string, options: NetRequest = {}): Promise<NetResponse> {
                if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
                const timeoutController = new AbortController();
                let timer: ReturnType<typeof setTimeout> | undefined;
                let timeout:RequestTimeoutError|undefined;
                const arm = (ms: number,phase:'headers'|'body'): void => {
                        timer = setTimeout(() => {timeout=new RequestTimeoutError(phase,ms);timeoutController.abort(timeout);}, ms);
                };
                const disarm = (): void => {
                        if (timer !== undefined) {
                                clearTimeout(timer);
                                timer = undefined;
                        }
                };
                const external = options.signal;
                const onExternalAbort = () => timeoutController.abort();
                external?.addEventListener('abort', onExternalAbort, { once: true });
                // [P1/M6] таймер + внешний listener живут до конца потребления тела.
                const finish = (): void => {
                        disarm();
                        external?.removeEventListener('abort', onExternalAbort);
                };
                try {
                        arm(this.timeoutMs,'headers');
                        const response = await fetch(url, {
                                method: options.method ?? 'GET',
                                headers: options.headers,
                                body: options.body,
                                signal: timeoutController.signal,
                                redirect: options.redirect,
                        });
                        // Заголовки — в нижний регистр (контракт NetResponse).
                        const headers: Record<string, string> = {};
                        response.headers.forEach((value, key) => {
                                headers[key.toLowerCase()] = value;
                        });
                        // [P1/M6] фаза заголовков прошла — перевооружаемся на тело.
                        disarm();
                        arm(this.bodyTimeoutMs,'body');
                        const read = async ():Promise<ArrayBuffer> => {
                                const reader=response.body?.getReader();
                                if(!reader){try{return await response.arrayBuffer();}catch(error){throw external?.aborted?new DOMException('Request aborted','AbortError'):timeout??error;}finally{finish();}}
                                const chunks:Uint8Array[]=[];let size=0;
                                try {
                                        while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
                                                if(size>(options.maxBytes??256*1024*1024)){timeoutController.abort();throw Object.assign(new Error('Response buffer limit exceeded'),{code:'file-too-large'});}
                                                chunks.push(part.value);disarm();arm(this.bodyTimeoutMs,'body');
                                                options.observe?.({stage:'download',bytes:size,byteDelta:part.value.byteLength,capability:'streaming'});
                                        }
                                        const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output.buffer;
                                }catch(error){throw external?.aborted?new DOMException('Request aborted','AbortError'):timeout??error;}
                                finally {reader.releaseLock();finish();}
                        };
                        // [overhaul S3/M-12] discard(): явное освобождение БЕЗ чтения
                        //  тела — для веток, где тело не потребляется (4xx/429/5xx/
                        //  304 в NetLayer): раньше таймер и внешний abort-listener
                        //  жили до bodyTimeout (до 5 мин) на КАЖДОЙ retry-попытке.
                        let discarded = false;
                        return {
                                status: response.status,
                                headers,
                                discard: (): void => {
                                        if (discarded) return;
                                        discarded = true;
                                        timeoutController.abort();
                                        void response.body?.cancel().catch(() => {});
                                        finish();
                                },
                                arrayBuffer: (): Promise<ArrayBuffer> => {
                                        if (discarded) throw new Error('body already discarded');
                                        return read();
                                },
                                text: (): Promise<string> => {
                                        if (discarded) throw new Error('body already discarded');
                                        return read().then(data=>new TextDecoder().decode(data));
                                },
                        };
                } catch (e) {
                        finish();
                        throw external?.aborted?new DOMException('Request aborted','AbortError'):timeout??e;
                }
        }
}
