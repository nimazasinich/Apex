import { describe, expect, it } from 'vitest';
import type { HistoricalTopOfBookTick } from '../services/research/historicalMicrostructure';
import { simulateCrossVenueMarketMaking, simulateFundingAwareAvellaneda } from '../services/research/marketMakingSimulator';

function tick(venue: string, timestamp: number, bid: number, ask: number, bidSize = 10, askSize = 10): HistoricalTopOfBookTick {
  return { symbol: 'BTC-USDT', venue, timestamp, sequence: timestamp, bid, ask, bidSize, askSize, spreadPct: ((ask - bid) / ((ask + bid) / 2)) * 100 };
}

describe('research market-making simulator', () => {
  it('models maker fills, hedge latency, fees, and keeps execution disabled', () => {
    const maker = [
      tick('binance', 1_000, 100, 101, 10, 10),
      tick('binance', 1_100, 99, 101, 1, 10),
      tick('binance', 1_200, 99, 102, 1, 1),
    ];
    const hedge = [
      tick('kucoin', 990, 100.1, 100.3),
      tick('kucoin', 1_180, 100.2, 100.4),
      tick('kucoin', 1_300, 100.25, 100.45),
    ];
    const result = simulateCrossVenueMarketMaking(maker, hedge, {
      makerVenue: 'binance', hedgeVenue: 'kucoin', orderSizeBase: 2, maxInventoryBase: 5,
      queueAheadFraction: 0, quoteLatencyMs: 50, hedgeLatencyMs: 50, maxSyncSkewMs: 50,
      maxBookGapMs: 500, maxHedgeSlippageBps: 100, makerFeeBps: 1, takerFeeBps: 2,
    });
    expect(result.simulationOnly).toBe(true);
    expect(result.executionAuthorized).toBe(false);
    expect(result.metrics.makerFills).toBeGreaterThan(0);
    expect(result.metrics.hedgedFills).toBeGreaterThan(0);
    expect(result.fills.every((row) => row.reason === 'hedged' || row.hedged === false)).toBe(true);
    expect(result.metrics.feesUsd).toBeGreaterThan(0);
  });

  it('fails closed on unsynchronized hedge venues and enforces a hard inventory/slippage boundary', () => {
    const maker = [tick('binance', 1_000, 100, 101, 10, 10), tick('binance', 1_100, 99, 102, 0, 0)];
    const hedge = [tick('kucoin', 100, 80, 81)];
    const result = simulateCrossVenueMarketMaking(maker, hedge, {
      makerVenue: 'binance', hedgeVenue: 'kucoin', orderSizeBase: 1, maxInventoryBase: 1,
      queueAheadFraction: 0, maxSyncSkewMs: 20, quoteLatencyMs: 10, hedgeLatencyMs: 10,
    });
    expect(result.metrics.skippedUnsynchronized).toBeGreaterThan(0);
    expect(result.metrics.hedgedFills).toBe(0);
    expect(result.executionAuthorized).toBe(false);
  });

  it('models inventory-aware and funding-aware Avellaneda quote skew without creating orders', () => {
    const rows = Array.from({ length: 32 }, (_, index) => {
      const mid = 100 + Math.sin(index / 3) * 0.4;
      const shift = index === 20 ? -1.5 : index === 21 ? 1.5 : 0;
      return tick('binance', 10_000 + index * 100, mid - 0.05 + shift, mid + 0.05 + shift, 5, 5);
    });
    const positiveFunding = simulateFundingAwareAvellaneda(rows, [{ timestamp: 10_000, rate: 0.001 }], {
      orderSizeBase: 1, maxInventoryBase: 3, queueAheadFraction: 0, quoteLatencyMs: 50, cancelLatencyMs: 200,
      fundingSkewMultiplier: 5_000, makerFeeBps: 1,
    });
    const zeroFunding = simulateFundingAwareAvellaneda(rows, [{ timestamp: 10_000, rate: 0 }], {
      orderSizeBase: 1, maxInventoryBase: 3, queueAheadFraction: 0, quoteLatencyMs: 50, cancelLatencyMs: 200,
      fundingSkewMultiplier: 5_000, makerFeeBps: 1,
    });
    expect(positiveFunding.simulationOnly).toBe(true);
    expect(positiveFunding.executionAuthorized).toBe(false);
    expect(positiveFunding.quotes.length).toBeGreaterThan(10);
    expect(positiveFunding.quotes[0].reservationPrice).toBeLessThan(zeroFunding.quotes[0].reservationPrice);
    expect(Math.abs(positiveFunding.metrics.endingInventoryBase)).toBeLessThanOrEqual(3);
    expect(Number.isFinite(positiveFunding.metrics.netPnlUsd)).toBe(true);
  });
});
