import { describe, expect, it } from 'vitest';
import { InProcessEventBus } from '../services/realtime/inProcessEventBus';
import { RealtimeSeriesStore } from '../services/realtime/realtimeSeriesStore';
import { bootstrapFundingOiContext } from '../services/liquidityHunter/restContextBootstrap';
import { evaluateFundingOiEdge } from '../services/liquidityHunter/edges/fundingOiEdge';
import type { ExchangeResult } from '../services/exchangeClient';

const NOW = 1_780_000_000_000;

function ok(data: unknown, route = 'fixture'): ExchangeResult {
  return { ok: true, exchange: 'binance', route, url: `fixture://${route}`, data };
}

function fundingRows(key: 'fundingTime' | 'ts') {
  return Array.from({ length: 16 }, (_, index) => ({
    fundingRate: index === 15 ? '0.0012' : String(0.0001 + ((index % 4) - 1.5) * 0.00001),
    [key]: NOW - (15 - index) * 8 * 60 * 60 * 1000,
  }));
}

function oiRows(valueKey: 'sumOpenInterest' | 'openInterest', timeKey: 'timestamp' | 'ts') {
  return Array.from({ length: 8 }, (_, index) => ({
    [valueKey]: String(1000 + index * 12),
    [timeKey]: NOW - (7 - index) * 5 * 60 * 1000,
  }));
}

describe('multi-source Funding/OI context', () => {
  it('keeps Binance and KuCoin independent and exposes primary-pair evidence', async () => {
    const bus = new InProcessEventBus();
    const series = new RealtimeSeriesStore({ maxAgeMs: 30 * 24 * 60 * 60 * 1000 });
    bus.subscribe((event) => series.append(event, NOW));

    const result = await bootstrapFundingOiContext({
      symbol: 'BTC-USDT',
      eventBus: bus,
      seriesStore: series,
      now: NOW,
      fetchers: {
        fundingHistory: async () => ok(fundingRows('fundingTime'), 'binance-funding-history'),
        fundingCurrent: async () => ok({ lastFundingRate: '0.00125', time: NOW }, 'binance-funding-current'),
        openInterestHistory: async () => ok(oiRows('sumOpenInterest', 'timestamp'), 'binance-oi-history'),
        openInterestCurrent: async () => ok({ openInterest: '1100', time: NOW }, 'binance-oi-current'),
        kucoinFundingHistory: async () => ({ ...ok(fundingRows('ts'), 'kucoin-funding-history'), exchange: 'kucoin' }),
        kucoinOpenInterestHistory: async () => ({ ...ok(oiRows('openInterest', 'ts'), 'kucoin-oi-history'), exchange: 'kucoin' }),
      },
    });

    expect(result.available).toBe(true);
    expect(result.primaryPairAvailable).toBe(true);
    expect(result.sources).toHaveLength(2);
    expect(series.sources('BTC-USDT', 'FUNDING')).toEqual([
      'binance-usdm-rest-context',
      'kucoin-futures-rest-context',
    ]);

    const evidence = evaluateFundingOiEdge({
      symbol: 'BTC-USDT',
      now: NOW,
      seriesStore: series,
      orderBook: {} as never,
      worldState: {} as never,
    });
    expect(evidence.status).toBe('PASS');
    expect(evidence.direction).toBe('SHORT');
    expect(evidence.metadata?.primaryPairActive).toBe(true);
    expect(evidence.metadata?.sourceCount).toBe(2);

    await bus.close();
  });
});
