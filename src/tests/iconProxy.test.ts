import { describe, expect, it, vi } from 'vitest';
import {
  buildIconUpstreamUrls,
  ICON_UPSTREAM_HOSTS,
  IconProxy,
  isValidIconAsset,
} from '../services/iconProxy';

function imageResponse(bytes = new Uint8Array([1, 2, 3, 4]), type = 'image/png'): Response {
  return new Response(bytes, { status: 200, headers: { 'content-type': type } });
}

describe('icon asset validation', () => {
  it('accepts lowercase alphanumeric + hyphen asset names', () => {
    expect(isValidIconAsset('btc')).toBe(true);
    expect(isValidIconAsset('bitcoin-cash')).toBe(true);
    expect(isValidIconAsset('trust-wallet-token')).toBe(true);
  });

  it('rejects anything that could escape the URL template', () => {
    for (const bad of ['', 'BTC', '../etc/passwd', 'a/b', 'a.b', 'a b', 'x'.repeat(41), 'evil?q=1']) {
      expect(isValidIconAsset(bad)).toBe(false);
    }
  });
});

describe('icon upstream URL construction', () => {
  it('only ever targets the closed host allowlist', () => {
    const urls = buildIconUpstreamUrls('sol');
    expect(urls.length).toBeGreaterThan(0);
    for (const raw of urls) {
      expect((ICON_UPSTREAM_HOSTS as readonly string[]).includes(new URL(raw).hostname)).toBe(true);
      expect(new URL(raw).protocol).toBe('https:');
    }
  });

  it('emits no URLs for an invalid asset', () => {
    expect(buildIconUpstreamUrls('../evil')).toEqual([]);
  });
});

describe('IconProxy', () => {
  it('returns the first upstream image and reports a miss on cold fetch', async () => {
    const fetchImpl = vi.fn(async () => imageResponse());
    const proxy = new IconProxy({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await proxy.get('btc');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe('image/png');
    expect(result.cached).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('serves the second cache read from memory without re-fetching', async () => {
    const fetchImpl = vi.fn(async () => imageResponse());
    const proxy = new IconProxy({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await proxy.get('eth');
    const second = await proxy.get('eth');
    expect(second.cached).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next upstream when one fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      .mockResolvedValueOnce(imageResponse());
    const proxy = new IconProxy({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await proxy.get('sol');
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects non-image content types', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const proxy = new IconProxy({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await proxy.get('btc');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('rejects oversized payloads', async () => {
    const huge = new Uint8Array(64);
    const fetchImpl = vi.fn(async () => imageResponse(huge));
    const proxy = new IconProxy({ fetchImpl: fetchImpl as unknown as typeof fetch, maxBytes: 16 });
    const result = await proxy.get('btc');
    expect(result.ok).toBe(false);
  });

  it('negatively caches a total miss and stops re-fetching until TTL expires', async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    const proxy = new IconProxy({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
      missTtlMs: 1_000,
    });
    const first = await proxy.get('nosuchcoin');
    expect(first.ok).toBe(false);
    const callsAfterFirst = fetchImpl.mock.calls.length;
    const second = await proxy.get('nosuchcoin');
    expect(second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(callsAfterFirst); // served from negative cache
    now = 1_001;
    await proxy.get('nosuchcoin');
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(callsAfterFirst); // TTL expired -> retried
  });

  it('rejects invalid asset names without any network call', async () => {
    const fetchImpl = vi.fn(async () => imageResponse());
    const proxy = new IconProxy({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await proxy.get('../secret');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('coalesces concurrent requests for the same asset into one fetch', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const proxy = new IconProxy({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const a = proxy.get('btc');
    const b = proxy.get('btc');
    resolveFetch(imageResponse());
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
