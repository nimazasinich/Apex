import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetProviderRouterState,
  routeBinanceSentiment,
  storeLkg,
  SYMBOL_NOT_SUPPORTED,
  type FetchJson,
} from '../services/providerRouter';

const EXCHANGE_INFO = { symbols: [{ symbol: 'BTCUSDT', status: 'TRADING' }] };

function sequence(...results: Array<{ ok: boolean; status: number; json: any; error?: string }>): FetchJson {
  let index = 0;
  return async () => results[Math.min(index++, results.length - 1)];
}

describe('provider degradation envelope contract', () => {
  beforeEach(() => __resetProviderRouterState());

  it('labels a verified fresh provider response live', async () => {
    const fetchJson = sequence(
      { ok: true, status: 200, json: EXCHANGE_INFO },
      { ok: true, status: 200, json: [{ longShortRatio: '1.2' }] },
    );
    const result = await routeBinanceSentiment('longShortRatio', 'ratio', 'BTCUSDT', 'https://example.test/ratio', fetchJson);
    expect(result.status).toBe('live');
    expect(result.provider).toBe('binance');
    expect(result.value).toEqual([{ longShortRatio: '1.2' }]);
    expect(result.reason).toBeUndefined();
  });

  it('labels last-known-good fallback degraded after a fresh provider failure', async () => {
    storeLkg('longShortRatio', 'BTCUSDT', 'binance', [{ longShortRatio: '1.1' }]);
    const fetchJson = sequence(
      { ok: true, status: 200, json: EXCHANGE_INFO },
      { ok: false, status: 504, json: null, error: 'timeout' },
    );
    const result = await routeBinanceSentiment('longShortRatio', 'ratio', 'BTCUSDT', 'https://example.test/ratio', fetchJson);
    expect(result.status).toBe('degraded');
    expect(result.value).toEqual([{ longShortRatio: '1.1' }]);
    expect(result.reason).toBe('fresh_failed_lkg');
  });

  it('fails closed when the symbol gate cannot be established and there is no LKG', async () => {
    const fetchJson = sequence({ ok: false, status: 503, json: null, error: 'network_unavailable' });
    const result = await routeBinanceSentiment('longShortRatio', 'ratio', 'BTCUSDT', 'https://example.test/ratio', fetchJson);
    expect(result.status).toBe('unavailable');
    expect(result.value).toBeNull();
    expect(result.reason).toBe('symbol_gate_unavailable');
  });

  it('does not call a sentiment endpoint for a definitively unsupported symbol', async () => {
    let calls = 0;
    const fetchJson: FetchJson = async () => {
      calls += 1;
      return { ok: true, status: 200, json: EXCHANGE_INFO };
    };
    const result = await routeBinanceSentiment('longShortRatio', 'ratio', 'ETHUSDT', 'https://example.test/ratio', fetchJson);
    expect(calls).toBe(1);
    expect(result).toMatchObject({ status: 'unavailable', value: null, reason: SYMBOL_NOT_SUPPORTED });
  });
});
