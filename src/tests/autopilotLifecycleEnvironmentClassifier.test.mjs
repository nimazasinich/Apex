import { describe, expect, it } from 'vitest';
import { classifyMarketDataEnvironment } from '../../scripts/qa/lib/classifyMarketDataEnvironment.mjs';

const base = {
  server: 'ok',
  health: {
    server: { status: 'READY' },
    kucoinCore: { status: 'UNAVAILABLE' },
    binanceSentiment: { status: 'UNAVAILABLE' },
  },
};

describe('Autopilot lifecycle environment classification', () => {
  it('runs when a primary market provider is ready', () => {
    const result = classifyMarketDataEnvironment({
      ...base,
      health: { ...base.health, kucoinCore: { status: 'READY' } },
      exchangeConnectivity: {},
    });
    expect(result.disposition).toBe('RUN');
  });

  it('marks proxy/timeout-only outages as skip eligible', () => {
    const result = classifyMarketDataEnvironment({
      ...base,
      exchangeConnectivity: {
        kucoin: { ticker: { ok: false, status: 403, reason: 'forbidden' }, candles: { ok: false, status: 0, message: 'fetch failed: timeout' } },
        binance: { exchangeInfo: { ok: false, status: 0, reason: 'proxy_unreachable' } },
      },
    });
    expect(result.disposition).toBe('SKIP_ELIGIBLE');
    expect(result.transportFailureRate).toBe(1);
  });

  it('does not hide semantic/provider contract failures', () => {
    const result = classifyMarketDataEnvironment({
      ...base,
      exchangeConnectivity: {
        kucoin: { ticker: { ok: false, status: 422, reason: 'invalid_symbol_mapping' } },
        binance: { exchangeInfo: { ok: false, status: 422, reason: 'invalid_payload_shape' } },
      },
    });
    expect(result.disposition).toBe('ASSERT_LOGIC');
  });
});
