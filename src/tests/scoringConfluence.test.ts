import { describe, expect, it } from 'vitest';
import {
  computeRocMomentumSignal,
  evaluateTimeframeConfluence,
  scoreCandidate,
} from '../lib/scoring';
import type { ScoringInput, SymbolTicker } from '../types';

const baseTicker: SymbolTicker = {
  symbol: 'ETH-USDT',
  lastPrice: 3200,
  turnover24h: 200000000,
  priceChange24hPct: 1.2,
  volume24h: 10000,
  high24h: 3250,
  low24h: 3100,
  fundingRate: 0.0001,
  openInterest: 500000000,
  dataState: 'live',
  timestamp: Date.now(),
};

const rising = Array.from({ length: 30 }, (_, i) => ({
  timestamp: 1700000000000 + i * 3600000,
  open: 3000 + i * 20,
  high: 3010 + i * 20,
  low: 2990 + i * 20,
  close: 3005 + i * 20,
  volume: 1000,
}));

const baseInput: ScoringInput = {
  ticker: baseTicker,
  candles: rising,
  orderBook: {
    symbol: 'ETH-USDT',
    bidDepthUsd: 2000000,
    askDepthUsd: 1800000,
    imbalancePct: 4,
    dataState: 'live',
  },
  minLiquidityUsd: 10000000,
};

describe('scoring confluence and ROC momentum', () => {
  it('computeRocMomentumSignal matches legacy computeMacdSignal behavior', () => {
    expect(computeRocMomentumSignal(rising)).toBe('BULLISH');
  });

  it('marks ALIGNED only when both timeframes support direction', () => {
    const candles15m = rising.map((c, i) => ({ ...c, timestamp: c.timestamp + i * 1000 }));
    const result = scoreCandidate({ ...baseInput, candles15m }, 'LONG');
    expect(result.timeframeConfluenceState).toBe('ALIGNED');
    expect(result.timeframeConfluence).toBe(true);
  });

  it('marks PARTIAL when 15m series is missing', () => {
    const result = scoreCandidate(baseInput, 'LONG');
    expect(result.timeframeConfluenceState).toBe('PARTIAL');
    expect(result.timeframeConfluence).toBe(false);
    expect(result.guardPass).toBe(false);
  });

  it('evaluateTimeframeConfluence detects CONFLICTING signals', () => {
    const confluence = evaluateTimeframeConfluence(
      'LONG',
      'BEARISH',
      'BULLISH',
      { state: 'VALID' },
      { state: 'VALID' },
    );
    expect(confluence.state).toBe('CONFLICTING');
  });
});
