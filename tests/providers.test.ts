import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMultiStatus, resolveDavResource } from '../src/sources/webdav-xml';
import { WebDavSource } from '../src/sources/webdav-source';
import { GDriveSource } from '../src/sources/gdrive-source';
import { YandexSource } from '../src/sources/yandex-source';
import { GitSource } from '../src/sources/git-source';
import { ZipUrlSource } from '../src/sources/zip-url-source';
import { BufferArchiveReader } from '../src/core/archive';
import { FetchTransport } from '../src/adapters/fetch-transport';
import type { NetRequest } from '../src/sources/types';
import { ab, entry, str } from './helpers';

const signal = () => new AbortController().signal;
const wrap = (s: string) => `<D:multistatus xmlns:D="DAV:" xmlns:X="DAV:">${s}</D:multistatus>`;
const resource = (href: string, collection = false, extras = '') => `<D:response><D:href>${href}</D:href><D:propstat><D:prop><D:resourcetype>${collection ? '<D:collection/>' : ''}</D:resourcetype>${collection ? '' : '<D:getcontentlength>1</D:getcontentlength><D:getetag>&quot;v1&quot;</D:getetag>'}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>${extras}</D:response>`;
const self = resource('/root/', true);
function dav(xml: string, getContent = 'x') {
  const calls: Array<{ url: string; req: NetRequest }> = [];
  const source = new WebDavSource({ config: () => ({ baseUrl: 'https://dav.example/root/', username: 'test', password: 'fake-test-password' }),
    transport: { fetch: async (url, req) => { calls.push({ url, req }); return {
      status: req.method === 'GET' ? 200 : 207, headers: {}, arrayBuffer: async () => ab(req.method === 'GET' ? getContent : xml), text: async () => xml,
    }; } } });
  return { source, calls };
}
test('WebDAV accepts equivalent prefixes, entities and unavailable optional properties', () => {
  const unavailable = '<D:propstat><D:prop><D:getlastmodified/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>';
  const xml = wrap(self + resource('/root/a&amp;b.md', false, unavailable).replaceAll('D:', 'X:'));
  const parsed = parseMultiStatus(xml); assert.equal(parsed.length, 2); assert.equal(parsed[1].href, '/root/a&b.md'); assert.equal(parsed[1].etag, '"v1"');
});
test('WebDAV malformed, partial, foreign namespace and failed responses are rejected', () => {
  for (const xml of [wrap(self) + '<broken>', wrap(self + resource('/root/a').replace('HTTP/1.1 200 OK', 'HTTP/1.1 403 Forbidden')),
    wrap(self + resource('/root/a').replace('<D:getcontentlength>1', '<D:getcontentlength>NaN')),
    wrap(self + resource('/root/a').replaceAll('D:', 'bad:')).replace('xmlns:X="DAV:"', 'xmlns:bad="urn:foreign"'),
    '<!DOCTYPE a [<!ENTITY x "x">]>' + wrap(self), '<D:multistatus xmlns:D="DAV:"/>']) {
    assert.throws(() => parseMultiStatus(xml));
  }
});
test('WebDAV confines decoded paths to the trusted origin and root boundary', () => {
  const root = 'https://dav.example/root/';
  assert.equal(resolveDavResource('https://dav.example/root/a%20b.md', root, root).path, 'a b.md');
  for (const href of ['https://evil.example/root/a', '//evil.example/root/a', '/root-other/a', '/outside/a', '/root/a%2Fb', '/root/a%5Cb', 'https://user@dav.example/root/a', '/root/a#fragment']) {
    assert.throws(() => resolveDavResource(href, root, root));
  }
});
test('WebDAV fetch uses the resolved href, strong If-Match and rejects redirects', async () => {
  const f = dav(wrap(self + resource('https://dav.example/root/a.md')));
  const manifest = await f.source.getManifest(signal()); assert.equal(manifest[0].path, 'a.md');
  assert.equal(str(await f.source.fetch(manifest[0], signal())), 'x');
  assert.equal(f.calls[1].url, 'https://dav.example/root/a.md'); assert.equal(f.calls[1].req.headers?.['if-match'], '"v1"');
  assert(f.calls.every(c => c.req.redirect === 'error'));
});
test('an untrusted WebDAV collection href never receives an authenticated follow-up', async () => {
  const f = dav(wrap(self + resource('https://evil.example/root/sub/', true)));
  await assert.rejects(f.source.getManifest(signal()), /trusted origin/); assert.equal(f.calls.length, 1);
});
test('WebDAV requires a successful self collection response', async () => {
  await assert.rejects(dav(wrap(resource('/root/a.md'))).source.getManifest(signal()), /collection response is missing/);
});
test('Drive incompleteSearch cannot become a partial authoritative manifest', async () => {
  const source = new GDriveSource({ config: () => ({ apiKey: 'fake-test-key', folderId: 'folder' }),
    transport: { fetch: async () => ({ status: 200, headers: {}, arrayBuffer: async () => ab(JSON.stringify({ files: [], incompleteSearch: true })), text: async () => '' }) } });
  await assert.rejects(source.getManifest(signal()));
});
test('Yandex lists valid files and rejects unknown item types rather than omitting them', async () => {
  const listing = (type: string) => new YandexSource({ publicKey: () => 'fake-test-link', transport: { fetch: async () => ({
    status: 200, headers: {}, text: async () => '', arrayBuffer: async () => ab(JSON.stringify({ type: 'dir', _embedded: {
      total: 1, items: [{ name: 'a.md', path: '/a.md', type, size: 6, sha256: entry('a.md').hash }],
    } })),
  }) } });
  const manifest = await listing('file').getManifest(signal()); assert.equal(manifest[0].path, 'a.md'); assert.equal(manifest[0].hash, entry('a.md').hash);
  await assert.rejects(listing('unexpected').getManifest(signal()));
});
test('a raw Git file resembling a JSON API envelope remains literal content', async () => {
  const content = '{"content":"eA==","encoding":"base64"}';
  const source = new GitSource({ repo: () => ({ repoUrl: 'https://github.com/test/repo', branch: 'main', accessToken: '' }),
    transport: { fetch: async () => ({ status: 200, headers: {}, arrayBuffer: async () => ab(content), text: async () => content }) } });
  assert.equal(str(await source.fetch(entry('a.json', content), signal())), content);
  await assert.rejects(source.fetch(entry('empty', ''), signal()), /size mismatch/);
});
const zipBytes = (base64: string): ArrayBuffer => Uint8Array.from(Buffer.from(base64, 'base64')).buffer;
const one = zipBytes('UEsDBBQAAAAAACWrSF3xCA2bBAAAAAQAAAAEAAAAYS5tZEFBQUFQSwECFAMUAAAAAAAlq0hd8QgNmwQAAAAEAAAABAAAAAAAAAAAAAAAgAEAAAAAYS5tZFBLBQYAAAAAAQABADIAAAAmAAAAAAA=');
const two = zipBytes('UEsDBBQAAAAAACWrSF0/G9o5BAAAAAQAAAAEAAAAYS5tZEJCQkJQSwECFAMUAAAAAAAlq0hdPxvaOQQAAAAEAAAABAAAAAAAAAAAAAAAgAEAAAAAYS5tZFBLBQYAAAAAAQABADIAAAAmAAAAAAA=');
test('ZIP lease retains resources but cannot return a stale inventory on the next session', async () => {
  let current = one, downloads = 0;
  const source = new ZipUrlSource({ url: () => 'https://archive.example/v.zip', sessionTtlMs: 60000,
    downloader: { download: async () => { downloads++; return new BufferArchiveReader(current); } } });
  try {
    const first = await source.getManifest(signal()); await source.dispose(); current = two;
    const second = await source.getManifest(signal()); assert.notEqual(first[0].hash, second[0].hash); assert.equal(downloads, 2);
    assert.equal(str(await source.fetch(second[0], signal())), 'BBBB');
  } finally { await source.forceDispose(); }
});
test('duplicate ZIP entries are rejected rather than silently collapsed', async () => {
  const bytes = zipBytes('UEsDBBQAAAAAAO+0SF3nLCVlBQAAAAUAAAAEAAAAYS5tZEZJUlNUUEsDBBQAAAAAAO+0SF3qZc2EBQAAAAUAAAAEAAAAYS5tZExBU1QhUEsBAhQDFAAAAAAA77RIXecsJWUFAAAABQAAAAQAAAAAAAAAAAAAAIABAAAAAGEubWRQSwECFAMUAAAAAADvtEhd6mXNhAUAAAAFAAAABAAAAAAAAAAAAAAAgAEnAAAAYS5tZFBLBQYAAAAAAgACAGQAAABOAAAAAAA=');
  const source = new ZipUrlSource({ url: () => 'https://archive.example/v.zip', downloader: { download: async () => new BufferArchiveReader(bytes) } });
  try { await assert.rejects(source.getManifest(signal()), /Archive path collision/); } finally { await source.forceDispose(); }
});
test('an already aborted transport request makes no network call', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected'); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(new FetchTransport().fetch('https://example.test', { signal: controller.signal }), { name: 'AbortError' }); assert.equal(calls, 0);
});
test('discard cancels the body and propagates the redirect restriction', async t => {
  let cancelled = false; let mode: RequestRedirect | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string, req: RequestInit) => {
    mode = req.redirect; return new Response(new ReadableStream({ cancel: () => { cancelled = true; } }));
  });
  const response = await new FetchTransport().fetch('https://example.test', { redirect: 'error' });
  response.discard?.(); await Promise.resolve(); assert(cancelled); assert.equal(mode, 'error');
  assert.throws(() => response.text(), /discarded/);
});
