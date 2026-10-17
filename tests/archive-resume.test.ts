import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { NodeArchiveDownloader } from '../src/adapters/archive-downloader';

const original = 'ABCDEFGHIJKL';
async function server(t: any, handler: (req: IncomingMessage, res: ServerResponse) => void) {
 const instance = createServer(handler);
 await new Promise<void>((resolve, reject) => { instance.once('error', reject); instance.listen(0, '127.0.0.1', resolve); });
 t.after(async () => { instance.closeAllConnections(); await new Promise<void>(resolve => instance.close(() => resolve())); });
 return `http://127.0.0.1:${(instance.address() as { port: number }).port}/archive`;
}
async function content(downloader: NodeArchiveDownloader, url: string) {
 const reader = await downloader.download(url);
 try { return Buffer.from(await reader.read(0, await reader.size())).toString(); }
 finally { await reader.dispose?.(); }
}
// Destroy only after the client observed the prefix, avoiding timing assumptions
// about header delivery. A real TCP reset exercises Node response/pipeline teardown.
async function interrupted(t: any, second: (req: IncomingMessage, res: ServerResponse) => void, etag: string | undefined = '"v1"') {
 let calls = 0, first: ServerResponse | undefined;
 const requests: IncomingMessage[] = [];
 const url = await server(t, (req, res) => {
  requests.push(req);
  if (++calls === 1) { first = res; res.writeHead(200, { 'content-length': original.length, ...(etag ? { etag } : {}) }); res.write(original.slice(0, 4)); }
  else second(req, res);
 });
 const downloader = new NodeArchiveDownloader(1000, undefined, 2, [0]);
 const download = downloader.download(url, { onProgress: () => { if (calls === 1 && first) { const response = first; first = undefined; response.destroy(); } } });
 return { download, requests };
}
async function readAndDispose(download: ReturnType<NodeArchiveDownloader['download']>) {
 const reader = await download;
 try { return Buffer.from(await reader.read(0, await reader.size())).toString(); }
 finally { await reader.dispose?.(); }
}
test('resume uses strong If-Range and exact remaining bytes', async t => {
 const { download, requests } = await interrupted(t, (req, res) => {
  const start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] ?? 0);
  res.writeHead(206, { etag: '"v1"', 'content-range': `bytes ${start}-11/12`, 'content-length': 12 - start }); res.end(original.slice(start));
 });
 assert.equal(await readAndDispose(download), original);
 assert.equal(requests.length, 2); assert.equal(requests[1].headers.range, 'bytes=4-');
 assert.equal(requests[1].headers['if-range'], '"v1"'); assert.equal(requests[1].headers['accept-encoding'], 'identity');
});
for (const [label, headers] of Object.entries({
 'wrong start': { 'content-range': 'bytes 3-10/12', etag: '"v1"' },
 'wrong total': { 'content-range': 'bytes 4-11/13', etag: '"v1"' },
 'missing range': { etag: '"v1"' },
 'changed validator': { 'content-range': 'bytes 4-11/12', etag: '"v2"' },
 'missing validator': { 'content-range': 'bytes 4-11/12' },
 'short segment': { 'content-range': 'bytes 4-10/12', etag: '"v1"' },
 'unsafe integer': { 'content-range': 'bytes 4-9007199254740992/9007199254740993', etag: '"v1"' },
})) test(`resume rejects ${label}`, async t => {
 const { download, requests } = await interrupted(t, (_req, res) => { res.writeHead(206, { 'content-length': 8, ...headers }); res.end('XXXXXXXX'); });
 await assert.rejects(readAndDispose(download), (e: any) => e.code === 'archive-response'); assert.equal(requests.length, 2);
});
for (const etag of ['', 'W/"weak"']) test(`resume restarts without strong validator (${etag || 'absent'})`, async t => {
 const replacement = 'new archive!';
 const { download, requests } = await interrupted(t, (_req, res) => { res.writeHead(200, { 'content-length': replacement.length }); res.end(replacement); }, etag);
 assert.equal(await readAndDispose(download), replacement); assert.equal(requests[1].headers.range, undefined); assert.equal(requests[1].headers['if-range'], undefined);
});
test('resume 200 fallback replaces the entire partial file', async t => {
 const { download } = await interrupted(t, (_req, res) => { res.writeHead(200, { 'content-length': 3, etag: '"v2"' }); res.end('new'); });
 assert.equal(await readAndDispose(download), 'new');
});
for (const status of [206, 204]) test(`fresh download rejects unexpected status ${status}`, async t => {
 const url = await server(t, (_req, res) => { res.writeHead(status); res.end(); });
 await assert.rejects(content(new NodeArchiveDownloader(1000, undefined, 1), url), (e: any) => e.code === 'archive-response');
});
test('download rejects encoded representation before publication', async t => {
 const url = await server(t, (_req, res) => { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end('encoded'); });
 await assert.rejects(content(new NodeArchiveDownloader(1000, undefined, 1), url), (e: any) => e.code === 'archive-response');
});
test('fresh chunked download remains supported', async t => {
 const url = await server(t, (_req, res) => { res.write('chunk'); res.end('ed'); });
 assert.equal(await content(new NodeArchiveDownloader(1000, undefined, 1), url), 'chunked');
});
test('body cancellation settles without a retry', async t => {
 let calls = 0; const controller = new AbortController();
 const url = await server(t, (_req, res) => { calls++; res.writeHead(200, { 'content-length': 100 }); res.write('prefix'); });
 await assert.rejects(new NodeArchiveDownloader(1000, undefined, 3, [0]).download(url, { signal: controller.signal, onProgress: () => controller.abort() }), (e: any) => e.aborted);
 assert.equal(calls, 1);
});
test('synchronous request failure releases header timer', async t => {
 const timers = new Set<unknown>(); const set = globalThis.setTimeout, clear = globalThis.clearTimeout;
 t.mock.method(globalThis, 'setTimeout', ((...args: Parameters<typeof set>) => { const timer = set(...args); timers.add(timer); return timer; }) as typeof set);
 t.mock.method(globalThis, 'clearTimeout', ((timer: any) => { timers.delete(timer); return clear(timer); }) as typeof clear);
 // Clear any leaked timer in test cleanup so the old provider fails safely.
 t.after(() => { for (const timer of timers) clear(timer as ReturnType<typeof set>); });
 await assert.rejects(new NodeArchiveDownloader(1000, () => ({ get() { throw new Error('setup failure'); } }), 1).download('http://example.invalid'), /setup failure/);
 assert.equal(timers.size, 0);
});

test('repeated body interruption never publishes a truncated reader and closes files', async t => {
 const paths: string[] = [], outputs: fs.WriteStream[] = [];
 const create = fs.createWriteStream;
 t.mock.method(fs, 'createWriteStream', ((path: any, options: any) => {
  assert(outputs.every(stream => stream.closed), 'previous attempt must be closed before replacement');
  const stream = create(path, options); paths.push(String(path)); outputs.push(stream); return stream;
 }) as typeof create);
 let response: ServerResponse | undefined, calls = 0;
 const url = await server(t, (req, res) => {
  response = res; calls++;
  const start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] ?? 0);
  res.writeHead(start ? 206 : 200, { 'content-length': 12 - start, etag: '"v1"', ...(start ? { 'content-range': `bytes ${start}-11/12` } : {}) });
  res.write(original.slice(start, start + 4));
 });
 await assert.rejects(new NodeArchiveDownloader(1000, undefined, 2, [0]).download(url, { onProgress: () => { response?.destroy(); response = undefined; } }));
 assert.equal(calls, 2); assert.equal(outputs.length, 2); assert(outputs.every(stream => stream.closed));
 assert(paths.every(path => !fs.existsSync(path)), 'failure must remove temporary file');
});
test('redirect after interruption restarts without forwarding validator', async t => {
 let targetRange: string | undefined, targetValidator: string | undefined;
 const target = await server(t, (req, res) => { targetRange = req.headers.range; targetValidator = req.headers['if-range'] as string | undefined; res.end('replacement'); });
 const { download } = await interrupted(t, (_req, res) => { res.writeHead(302, { location: target }); res.end(); });
 assert.equal(await readAndDispose(download), 'replacement'); assert.equal(targetRange, undefined); assert.equal(targetValidator, undefined);
});
test('header timeout is typed and never retried', async t => {
 let calls = 0; const url = await server(t, () => { calls++; });
 await assert.rejects(new NodeArchiveDownloader(30, undefined, 3, [0]).download(url), (e: any) => e.code === 'archive-timeout');
 assert.equal(calls, 1);
});
test('retry classification does not trust error message text', async () => {
 const { EventEmitter } = await import('node:events');
 let calls = 0;
 await assert.rejects(new NodeArchiveDownloader(1000, () => ({ get() {
  calls++; const request = Object.assign(new EventEmitter(), { destroy() {} });
  queueMicrotask(() => request.emit('error', new Error('network error in local setup'))); return request;
 } }), 3, [0]).download('http://example.invalid'));
 assert.equal(calls, 1);
});
test('controlled reset rejects shifted range even when body length matches', async () => {
 const { PassThrough } = await import('node:stream');
 const { EventEmitter } = await import('node:events');
 let calls = 0;
 const downloader = new NodeArchiveDownloader(1000, () => ({ get(_url, _opts, callback) {
  const request = Object.assign(new EventEmitter(), { destroy(error?: Error) { if (error) queueMicrotask(() => request.emit('error', error)); } });
  queueMicrotask(() => {
   const first = ++calls === 1;
   const response = Object.assign(new PassThrough(), { statusCode: first ? 200 : 206, headers: first
    ? { 'content-length': '12', etag: '"v1"' }
    : { 'content-length': '8', etag: '"v1"', 'content-range': 'bytes 3-10/12' } });
   callback(response);
   if (first) { response.write('ABCD'); setImmediate(() => response.destroy(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))); }
   else response.end('XXXXXXXX');
  });
  return request;
 } }), 2, [10]);
 await assert.rejects(readAndDispose(downloader.download('http://example.invalid')), (e: any) => e.code === 'archive-response');
 assert.equal(calls, 2);
});
