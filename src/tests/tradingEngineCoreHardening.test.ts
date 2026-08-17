import { beforeEach, describe, expect, it } from 'vitest';
import type { Candlestick, OrderBook, RankedContract } from '../types';
import { MathEngine } from '../services/mathEngine';
import { selectScanSlice } from '../services/scannerCore';
import { smcAlignmentForDirection } from '../services/smartMoneyContextEngine';
import {
  __resetProviderRouterState,
  backoffDelayMs,
  clearProviderRouterSymbol,
  readLkg,
  storeLkg,
  PROVIDER_CAPABILITIES,
  PROVIDER_PRIORITY,
  assertProviderPriorityIntegrity,
} from '../services/providerRouter';

function makeBook(bids: Array<[number, number]>, asks: Array<[number, number]>): OrderBook {
  let bidCumulative = 0;
  let askCumulative = 0;
  return {
    bids: bids.map(([price, volume]) => ({
      price,
      volume,
      cumulative: (bidCumulative += volume),
      percentage: 0,
    })),
    asks: asks.map(([price, volume]) => ({
      price,
      volume,
      cumulative: (askCumulative += volume),
      percentage: 0,
    })),
  };
}

function candle(open: number, high: number, low: number, close: number, index = 0): Candlestick {
  return { time: String(index), open, high, low, close, volume: 1_000 + index };
}

function contractPool(size: number): RankedContract[] {
  return Array.from({ length: size }, (_, index) => ({
    ticker: `T${index}-USDT`,
    kuCoinSymbol: `T${index}USDTM`,
    turnover24hUsd: 10_000_000,
    rank: index + 1,
  }));
}

describe('trading engine core hardening', () => {
  beforeEach(() => {
    __resetProviderRouterState();
  });

  it('keeps OBI bounded and micro-price inside the top-of-book spread', () => {
    const book = makeBook([[100, 900], [99, 100]], [[101, 100], [102, 50]]);
    const obi = MathEngine.calculateOBI(book);
    const microPrice = MathEngine.calculateMicroPrice(book);

    expect(obi).toBeGreaterThan(0);
    expect(obi).toBeLessThanOrEqual(1);
    expect(microPrice).toBeGreaterThanOrEqual(100);
    expect(microPrice).toBeLessThanOrEqual(101);
  });

  it('produces non-negative ATR and reacts to higher candle volatility', () => {
    const lowVol = Array.from({ length: 15 }, (_, index) => candle(100, 101, 99, 100, index));
    const highVol = Array.from({ length: 15 }, (_, index) => candle(100, 120, 80, 100, index));

    expect(MathEngine.calculateATR(lowVol)).toBeGreaterThanOrEqual(0);
    expect(MathEngine.calculateATR(highVol)).toBeGreaterThan(MathEngine.calculateATR(lowVol));
  });

  it('keeps Platt calibration finite, bounded, and monotonic', () => {
    const values = [-10, -2, 0, 2, 10].map((score) => MathEngine.plattCalibration(score));
    values.forEach((value) => {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    });
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
  });

  it('does not fabricate structural zones for flat or insufficient candles', () => {
    expect(MathEngine.summarizeStructuralZones([])).toEqual({ zonesCount: 0, averageZoneScore: 0 });
    const flat = Array.from({ length: 12 }, (_, index) => candle(100, 100.05, 99.95, 100, index));
    expect(MathEngine.summarizeStructuralZones(flat)).toEqual({ zonesCount: 0, averageZoneScore: 0 });
  });

  it('rotates the scan universe within the per-cycle batch budget', () => {
    const eligible = contractPool(10);
    const seen = new Set<string>();
    let cursor = 0;

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const result = selectScanSlice(eligible, cursor, 4, new Set(['T1-USDT']));
      expect(result.slice.length).toBeLessThanOrEqual(4);
      expect(result.slice.some((item) => item.ticker === 'T1-USDT')).toBe(false);
      result.slice.forEach((item) => seen.add(item.ticker));
      cursor = result.nextCursor;
    }

    expect(seen.size).toBe(9);
  });

  it('keeps long and short SMC alignment symmetric and neutral on invalid input', () => {
    for (const directional of [-0.8, -0.2, 0, 0.4, 0.9]) {
      const long = smcAlignmentForDirection(directional, 'LONG');
      const short = smcAlignmentForDirection(directional, 'SHORT');
      expect(long + short).toBeCloseTo(1, 8);
    }
    expect(smcAlignmentForDirection(Number.NaN, 'LONG')).toBeCloseTo(0.5, 8);
  });



  it('keeps Binance and KuCoin as the canonical first two public Futures providers', () => {
    for (const category of ['ticker', 'orderbook', 'candles', 'trades', 'funding', 'openInterest', 'instruments'] as const) {
      expect(PROVIDER_PRIORITY[category].slice(0, 2)).toEqual(['binance', 'kucoin']);
    }
    expect(PROVIDER_PRIORITY.longShortRatio).toEqual(['binance']);
    expect(PROVIDER_PRIORITY.takerBuySellRatio).toEqual(['binance']);
    expect(assertProviderPriorityIntegrity()).toBe(true);
    expect(PROVIDER_CAPABILITIES.bybit).toMatchObject({ registered: true, transport: 'WEBSOCKET', role: 'REALTIME_EVIDENCE' });
    expect(PROVIDER_CAPABILITIES.bitget.registered).toBe(false);
    expect(PROVIDER_CAPABILITIES.okx.registered).toBe(false);
    expect(Object.values(PROVIDER_PRIORITY).flat()).not.toContain('bitget');
    expect(Object.values(PROVIDER_PRIORITY).flat()).not.toContain('okx');
  });

  it('keeps Last-Known-Good state scoped by category and symbol', () => {
    storeLkg('ticker', 'BTC-USDT', 'kucoin', { price: 100 });
    storeLkg('ticker', 'ETH-USDT', 'kucoin', { price: 200 });

    expect(readLkg('ticker', 'BTC-USDT')?.value).toEqual({ price: 100 });
    expect(readLkg('orderbook', 'BTC-USDT')).toBeNull();

    clearProviderRouterSymbol('BTC-USDT');
    expect(readLkg('ticker', 'BTC-USDT')).toBeNull();
    expect(readLkg('ticker', 'ETH-USDT')?.value).toEqual({ price: 200 });
  });

  it('bounds provider cooldown backoff and preserves exponential growth', () => {
    const first = backoffDelayMs(0);
    const later = backoffDelayMs(5);
    const capped = backoffDelayMs(100);

    expect(first).toBeGreaterThanOrEqual(500);
    expect(first).toBeLessThan(750);
    expect(later).toBeGreaterThanOrEqual(16_000);
    expect(later).toBeLessThan(16_250);
    expect(capped).toBeGreaterThanOrEqual(30_000);
    expect(capped).toBeLessThan(30_250);
  });
});
