// ============================================================
// --- ADAPTERS/FETCH-TRANSPORT (фаза 3-7) ---
// NetTransport поверх globalThis.fetch: пер-запросный таймаут
// (REQUEST_TIMEOUT_MS) + каскад внешнего AbortSignal. Десктоп и
// мобильные Obsidian предоставляют fetch; core/net.ts получает
// транспорт через инъекцию и остаётся свободным от платформенных
// API (решение В5-1). В фазе 4 здесь же появятся vault/fs-адаптеры.
//
// [P1/M6] Таймаут действует и на ЧТЕНИЕ ТЕЛА: fetch() резолвится по
// ЗАГОЛОВКАМ, а прежний код гасил таймер в finally сразу после них —
// подвисшее тело (сервер отдал заголовки и замолчал) читалось вечно.
// Теперь телу назначается отдельный, более щедрый дедлайн
// (bodyTimeoutMs, default 5 мин) — abort рвёт stream, и ошибка
// всплывает как сетевая. Медленные, но живые ссылки не страдают.
//
// ОТКЛОНЕНИЕ от дизайна §11.1 (ревью 3-review, Low): maxRedirects=5 не
// обеспечивается — fetch() следует редиректам автоматически (по умолчанию
// до 20). Принято осознанно: ручной подсчёт требует redirect: 'manual'
// и цикла; облачные провайдеры дают короткие цепочки. Пересмотр — фаза 5.
// ============================================================

import type { NetRequest, NetResponse, NetTransport } from '../sources/types';

const DEFAULT_TIMEOUT_MS = 60000;
/** [P1/M6] Дефолтный дедлайн чтения тела после заголовков (5 мин). */
const DEFAULT_BODY_TIMEOUT_MS = 300000;

export interface FetchTransportOptions {
        timeoutMs?: number;
        /** Дедлайн на чтение тела (после заголовков). Default: max(timeoutMs*4, 5 мин). */
        bodyTimeoutMs?: number;
}

export class FetchTransport implements NetTransport {
        private readonly timeoutMs: number;
        private readonly bodyTimeoutMs: number;

        constructor(opts: FetchTransportOptions = {}) {
                this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
                this.bodyTimeoutMs = opts.bodyTimeoutMs ?? Math.max(this.timeoutMs * 4, DEFAULT_BODY_TIMEOUT_MS);
        }

        async fetch(url: string, options: NetRequest = {}): Promise<NetResponse> {
                const timeoutController = new AbortController();
                let timer: ReturnType<typeof setTimeout> | undefined;
                const arm = (ms: number): void => {
                        timer = setTimeout(() => timeoutController.abort(), ms);
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
                        arm(this.timeoutMs);
                        const response = await fetch(url, {
                                method: options.method ?? 'GET',
                                headers: options.headers,
                                body: options.body,
                                signal: timeoutController.signal,
                        });
                        // Заголовки — в нижний регистр (контракт NetResponse).
                        const headers: Record<string, string> = {};
                        response.headers.forEach((value, key) => {
                                headers[key.toLowerCase()] = value;
                        });
                        // [P1/M6] фаза заголовков прошла — перевооружаемся на тело.
                        disarm();
                        arm(this.bodyTimeoutMs);
                        const guarded = <T>(p: Promise<T>): Promise<T> => p.finally(finish);
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
                                        finish();
                                },
                                arrayBuffer: (): Promise<ArrayBuffer> => {
                                        if (discarded) throw new Error('body already discarded');
                                        return guarded(response.arrayBuffer());
                                },
                                text: (): Promise<string> => {
                                        if (discarded) throw new Error('body already discarded');
                                        return guarded(response.text());
                                },
                        };
                } catch (e) {
                        finish();
                        throw e;
                }
        }
}
