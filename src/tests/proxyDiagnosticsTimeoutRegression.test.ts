import { describe, expect, it, vi } from 'vitest';
import { normalizeSocksProxyUrl } from '../services/proxyConfig';
import {
  probeProxyConfiguration,
  type ProxyProviderProbeTarget,
} from '../services/proxyFetch';
import { IntegrationHealthHistory } from '../services/integrationHealthHistory';

describe('Smart Proxy diagnostics timeout budgeting and isolation regression', () => {
  it('normalizes socks:// URLs to socks5h:// for remote DNS authority', () => {
    expect(normalizeSocksProxyUrl('socks://127.0.0.1:10808')).toBe('socks5h://127.0.0.1:10808');
    expect(normalizeSocksProxyUrl('socks5://127.0.0.1:10808')).toBe('socks5h://127.0.0.1:10808');
    expect(normalizeSocksProxyUrl('socks5h://127.0.0.1:10808')).toBe('socks5h://127.0.0.1:10808');
    expect(normalizeSocksProxyUrl('127.0.0.1:10808')).toBe('socks5h://127.0.0.1:10808');
  });

  it('keeps active policy health history separate from draft test results and supports clearing', () => {
    const history = new IntegrationHealthHistory(5);
    history.record({
      checkedAt: 1000,
      state: 'CONNECTED',
      latencyMs: 120,
      summary: 'Active saved policy check passed',
      route: 'direct',
    });

    expect(history.list()).toHaveLength(1);
    expect(history.latest()?.summary).toContain('Active saved policy');

    // On config save/reset, stale diagnostics must be cleared
    history.clear();
    expect(history.list()).toHaveLength(0);
    expect(history.latest()).toBeNull();
  });

  it('allows healthy proxy route to succeed within overall budget when direct hangs in Auto mode', async () => {
    const targets: ProxyProviderProbeTarget[] = [
      { provider: 'Mock Exchange', url: 'https://mock.exchange.test/api/time' },
    ];

    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string }> = [];

    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      fetchCalls.push({ url: String(input) });
      const signal = init?.signal as AbortSignal | undefined;
      // Direct attempt simulates hang until route timeout aborts
      if (fetchCalls.length === 1) {
        return new Promise<Response>((_, reject) => {
          if (signal?.aborted) {
            reject(new Error('direct attempt aborted by route timeout'));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(new Error('direct attempt aborted by route timeout'));
          });
        });
      }
      return new Response(JSON.stringify({ serverTime: Date.now() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as any;

    try {
      const probeResult = await probeProxyConfiguration(
        { mode: 'auto', type: 'socks5', address: '' },
        targets,
        4_000,
      );

      expect(probeResult.results).toHaveLength(1);
      expect(probeResult.config.mode).toBe('auto');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
