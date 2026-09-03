import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { connect, createServer as createTcpServer } from 'node:net';
import { gzipSync } from 'node:zlib';
import { normalizeProxyConfig } from '../services/proxyConfig';
import { applyRuntimeProxyConfig, blockInvalidProxyConfig, getProxyPoolInfo, smartFetchJson } from '../services/proxyFetch';

// Real local HTTP and CONNECT servers; no upstream or operator credentials.
let origin: Server;
let proxy: Server;
let originUrl: string;
let proxyAddress: string;
let hops = 0;
let originHits = 0;
let socks: import('node:net').Server;
let socksAddress: string;
let socksHops = 0;
const sockets = new Set<import('node:stream').Duplex>();
const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as import('node:net').AddressInfo).port)));
beforeAll(async () => {
  origin = createServer((req, res) => { originHits++; if (req.url === '/redirect') { res.writeHead(302, { Location: '/compressed' }); res.end(); return; } res.writeHead(req.url === '/fail' ? 451 : 200, { 'Content-Type': 'application/json', ...(req.url === '/compressed' ? { 'Content-Encoding': 'gzip' } : {}) }); res.end(req.url === '/compressed' ? gzipSync('{"fixture":true}') : '{"fixture":true}'); });
  const port = await listen(origin);
  originUrl = `http://127.0.0.1:${port}`;
  proxy = createServer();
  proxy.on('connect', (_req, client, head) => {
    hops++;
    const upstream = connect(port, '127.0.0.1', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client); });
    sockets.add(client); sockets.add(upstream);
    client.on('error', () => upstream.destroy()); upstream.on('error', () => client.destroy());
  });
  proxyAddress = `http://127.0.0.1:${await listen(proxy)}`;
  socks = createTcpServer((client) => {
    sockets.add(client);
    let stage = 0;
    let buffer = Buffer.alloc(0);
    const handshake = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 0) {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
        buffer = buffer.subarray(2 + buffer[1]); client.write(Buffer.from([5, 0])); stage = 1;
      }
      if (stage === 1) {
        if (buffer.length < 4) return;
        const length = buffer[3] === 1 ? 10 : buffer[3] === 4 ? 22 : 7 + buffer[4];
        if (buffer.length < length) return;
        socksHops++; client.removeListener('data', handshake);
        const extra = buffer.subarray(length);
        const upstream = connect(port, '127.0.0.1', () => {
          client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
          if (extra.length) upstream.write(extra);
          client.pipe(upstream); upstream.pipe(client);
        });
        sockets.add(upstream);
        client.on('error', () => upstream.destroy()); upstream.on('error', () => client.destroy());
      }
    };
    client.on('data', handshake);
  });
  socksAddress = `socks5h://127.0.0.1:${await new Promise<number>(resolve => socks.listen(0, '127.0.0.1', () => resolve((socks.address() as import('node:net').AddressInfo).port)))}`;
});
afterAll(async () => { for (const socket of sockets) socket.destroy(); origin.closeAllConnections(); proxy.closeAllConnections(); await Promise.all([new Promise<void>(r => origin.close(() => r())), new Promise<void>(r => proxy.close(() => r())), new Promise<void>(r => socks.close(() => r()))]); });
const request = (path = '') => smartFetchJson(`${originUrl}${path}`, { cacheMode: 'none', timeoutMs: 2000 });

describe('runtime proxy transport boundaries', () => {
  it('uses the supplied HTTP CONNECT proxy only in Manual', async () => {
    applyRuntimeProxyConfig({ mode: 'manual', type: 'http', address: proxyAddress });
    const before = hops;
    const result = await request();
    expect(result.ok).toBe(true); expect(result.route).toBe(proxyAddress); expect(hops).toBeGreaterThan(before);
    expect(getProxyPoolInfo()).toMatchObject({ mode: 'manual', poolSize: 1, smartProxyDiscovery: false, discoveryRoutes: 0 });
  });
  it('completes a real SOCKS5 handshake and reads the upstream response', async () => {
    applyRuntimeProxyConfig({ mode: 'manual', type: 'socks5', address: socksAddress });
    const before = socksHops;
    const result = await request();
    expect(result.ok).toBe(true); expect(result.json).toEqual({ fixture: true }); expect(result.route).toBe(socksAddress); expect(socksHops).toBeGreaterThan(before);
  });
  it('handles redirects and compressed JSON through SOCKS without changing route', async () => {
    applyRuntimeProxyConfig({ mode: 'manual', type: 'socks5', address: socksAddress });
    const result = await request('/redirect');
    expect(result.ok).toBe(true); expect(result.json).toEqual({ fixture: true }); expect(result.route).toBe(socksAddress);
  });
  it('does not reuse a cached proxy response after switching Off', async () => {
    applyRuntimeProxyConfig({ mode: 'manual', type: 'http', address: proxyAddress });
    const first = await smartFetchJson(originUrl, { cacheMode: 'fresh', cacheTtlMs: 60000 });
    expect(first.route).toBe(proxyAddress);
    applyRuntimeProxyConfig({ mode: 'off', type: 'http', address: proxyAddress });
    const before = originHits;
    const second = await smartFetchJson(originUrl, { cacheMode: 'fresh', cacheTtlMs: 60000 });
    expect(second.route).toBe('direct'); expect(originHits).toBeGreaterThan(before);
  });
  it('does not escape to direct or discovered routes after a Manual proxy fails', async () => {
    applyRuntimeProxyConfig({ mode: 'manual', type: 'http', address: '127.0.0.1:1' });
    const hits = originHits;
    const result = await request();
    expect(result.ok).toBe(false); expect(result.route).toBe('http://127.0.0.1:1'); expect(originHits).toBe(hits);
  });
  it('Off never uses a proxy even for a geo failure and proxyOnly request', async () => {
    applyRuntimeProxyConfig({ mode: 'off', type: 'http', address: proxyAddress });
    const before = hops;
    const result = await smartFetchJson(`${originUrl}/fail`, { proxyOnly: true, cacheMode: 'none', timeoutMs: 2000 });
    expect(result.status).toBe(451); expect(result.route).toBe('direct'); expect(hops).toBe(before);
    expect(getProxyPoolInfo()).toMatchObject({ mode: 'off', poolSize: 0, discoveryRoutes: 0 });
  });
  it('Auto returns via direct when direct works', async () => {
    applyRuntimeProxyConfig({ mode: 'auto', type: 'http', address: proxyAddress });
    const before = hops; const result = await request();
    expect(result.ok).toBe(true); expect(result.route).toBe('direct'); expect(hops).toBe(before);
  });
  it('invalid saved settings block all routes until corrected', async () => {
    blockInvalidProxyConfig(); const before = originHits;
    const result = await request(); expect(result.ok).toBe(false); expect(result.error).toBe('invalid_proxy_configuration'); expect(originHits).toBe(before);
    applyRuntimeProxyConfig({ mode: 'off', type: 'http', address: '' }); expect((await request()).ok).toBe(true);
  });
  it('normalizes the same SOCKS shorthand as the environment path', () => {
    expect(normalizeProxyConfig({ mode: 'manual', type: 'socks5', address: '127.0.0.1:10808' }).address).toBe('socks5h://127.0.0.1:10808');
  });
  it.each(['', 'ftp://proxy:21', 'http://user:secret@proxy:80', 'http://proxy:80/path', 'http://proxy:0', 'http://proxy:99999'])('rejects invalid manual address %s without changing active mode', (address) => {
    const before = getProxyPoolInfo().mode;
    expect(() => applyRuntimeProxyConfig({ mode: 'manual', type: 'http', address })).toThrow(); expect(getProxyPoolInfo().mode).toBe(before);
  });
});
