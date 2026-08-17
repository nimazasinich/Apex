import { describe, expect, it } from 'vitest';
import { calculateRsi, evaluateNoTradeGuard, scoreCandidate } from '../../lib/scoring';
import { ScoringInput, SymbolTicker } from '../../types';

describe('Two-Directional Candidate Scoring (REQ-013, 014, 016, 017)', () => {
  const baseTicker: SymbolTicker = {
    symbol: 'BTC-USDT',
    lastPrice: 94000,
    turnover24h: 500000000,
    priceChange24hPct: 3.5,
    volume24h: 5319,
    high24h: 95000,
    low24h: 91000,
    fundingRate: 0.0001,
    openInterest: 1200000000,
    dataState: 'live',
    timestamp: Date.now(),
  };

  const sampleCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: 1700000000000 + i * 3600000,
    open: 93000 + i * 30,
    high: 93200 + i * 35,
    low: 92900 + i * 25,
    close: 93100 + i * 32,
    volume: 1500,
  }));

  const baseInput: ScoringInput = {
    ticker: baseTicker,
    candles: sampleCandles,
    orderBook: {
      symbol: 'BTC-USDT',
      bidDepthUsd: 5000000,
      askDepthUsd: 4500000,
      imbalancePct: 5.2,
      dataState: 'live',
    },
    minLiquidityUsd: 10000000,
  };

  it('computes RSI without NaN or crashing on minimal/empty candles', () => {
    expect(calculateRsi([], 14)).toBe(50);
    expect(calculateRsi(sampleCandles, 14)).toBeGreaterThan(0);
  });

  it('scores a LONG candidate cleanly and assigns readiness tier', () => {
    const result = scoreCandidate(baseInput, 'LONG');
    expect(result.symbol).toBe('BTC-USDT');
    expect(result.direction).toBe('LONG');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['CONFIRMED', 'WATCHLIST', 'CAUTION', 'BLOCKED']).toContain(
      result.readinessTier
    );
  });

  it('scores a SHORT candidate cleanly with mirrored logic', () => {
    const result = scoreCandidate(baseInput, 'SHORT');
    expect(result.direction).toBe('SHORT');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('triggers No-Trade Guard when turnover is below liquidity floor (REQ-016)', () => {
    const illiquidInput: ScoringInput = {
      ...baseInput,
      ticker: { ...baseTicker, turnover24h: 500000 }, // $500k vs $10M floor
    };
    const guard = evaluateNoTradeGuard(illiquidInput, 'LONG', true, 'live');
    expect(guard.guardPass).toBe(false);
    expect(guard.guardReasons[0]).toContain('below liquidity floor');
  });

  it('forces BLOCKED tier when dataState is unavailable', () => {
    const unavInput: ScoringInput = {
      ...baseInput,
      ticker: { ...baseTicker, dataState: 'unavailable' },
    };
    const result = scoreCandidate(unavInput, 'LONG');
    expect(result.readinessTier).toBe('BLOCKED');
  });
});
