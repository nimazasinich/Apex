import { describe, expect, it } from 'vitest';
import type { Candle, CandidateScore, SignalDecisionLog, SymbolTicker } from '../types';
import { attachOpportunityShadowComparison } from '../services/shadowComparisonPersistence';
import {
  buildOpportunityShortlist,
  buildOpportunityShortlistComparison,
  discoverOpportunity,
} from '../services/strategyCommander/opportunity/opportunityDiscovery';

const start = Date.parse('2026-08-12T00:00:00.000Z');

function history(count: number, direction = 1): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const acceleration = index > 30 ? (index - 30) ** 2 * 0.025 : 0;
    const close = 100 + direction * (index * 0.12 + acceleration);
    const range = 0.35 + (index > 38 ? (index - 38) * 0.05 : 0);
    return {
      timestamp: start + index * 60_000,
      open: close - direction * 0.06,
      high: close + range,
      low: close - range,
      close,
      volume: 1000 + index * 60,
    };
  });
}

function ticker(symbol: string, dataState: SymbolTicker['dataState'] = 'live'): SymbolTicker {
  return {
    symbol, lastPrice: 112, turnover24h: 90_000_000, priceChange24hPct: 4.2,
    volume24h: 800_000, high24h: 114, low24h: 98, fundingRate: 0.0002,
    fundingQuality: 'VALID', openInterest: 20_000_000, dataState, timestamp: start + 60 * 60_000,
  };
}

function candidate(symbol: string, direction: 'LONG' | 'SHORT', score: number): CandidateScore {
  return {
    symbol, lastPrice: 100, priceChange24hPct: 1, turnover24h: 50_000_000,
    direction, score, readinessTier: 'WATCHLIST', guardPass: true, guardReasons: [],
    momentumScore: 60, orderFlowScore: 55, fundingScore: 50, structureScore: 58,
    liquidityScore: 80, timeframeConfluence: true,
    timeframeDetails: { tf15m: direction === 'LONG' ? 'BULLISH' : 'BEARISH', tf1h: direction === 'LONG' ? 'BULLISH' : 'BEARISH' },
    dataState: 'live',
  };
}

describe('Plan C Phase 3 Opportunity Discovery shadow', () => {
  it('is deterministic and ignores bars after the explicit closed-candle timestamp', () => {
    const rows = history(60);
    const asOfTimestamp = rows[44].timestamp;
    const input = {
      ticker: ticker('BTC-USDT'), candles1h: rows, candles15m: rows,
      timestamp: start + 90 * 60_000, asOfTimestamp, minLiquidityUsd: 10_000_000,
    };
    const first = discoverOpportunity(input);
    const futureShock = history(8, -1).map((candle, index) => ({ ...candle, timestamp: start + (100 + index) * 60_000, close: 25 - index }));
    const second = discoverOpportunity({ ...input, candles1h: [...rows, ...futureShock], candles15m: [...rows, ...futureShock] });
    expect(second).toEqual(first);
    expect(first.momentumState).toBe('BULLISH_ACCELERATING');
    expect(first.possibleDirections).toContain('LONG');
    expect(Number.isFinite(first.opportunityScore)).toBe(true);
  });

  it('fails closed to unavailable feature states when history is missing', () => {
    const result = discoverOpportunity({
      ticker: { ...ticker('ETH-USDT', 'degraded'), fundingQuality: 'MISSING' },
      timestamp: start, minLiquidityUsd: 10_000_000,
    });
    expect(result.momentumState).toBe('UNAVAILABLE');
    expect(result.volumeState).toBe('UNAVAILABLE');
    expect(result.volatilityState).toBe('UNAVAILABLE');
    expect(result.possibleDirections).toEqual([]);
    expect(result.evidenceCompleteness).toBeLessThan(0.3);
    expect(result.reasons).toContain('open_interest_change_unavailable');
    expect(Number.isFinite(result.opportunityScore)).toBe(true);
  });

  it('ranks a separate opportunity shortlist without mutating authoritative candidates', () => {
    const longCandidates = [candidate('BTC-USDT', 'LONG', 72), candidate('ETH-USDT', 'LONG', 84)];
    const shortCandidates = [candidate('BTC-USDT', 'SHORT', 76)];
    const originalLong = structuredClone(longCandidates);
    const originalShort = structuredClone(shortCandidates);
    const opportunityShortlist = buildOpportunityShortlist([
      { ticker: ticker('BTC-USDT'), candles1h: history(50), candles15m: history(50), timestamp: start, minLiquidityUsd: 10_000_000 },
      { ticker: ticker('SOL-USDT'), candles1h: history(50, -1), candles15m: history(50, -1), timestamp: start, minLiquidityUsd: 10_000_000 },
    ]);
    const comparison = buildOpportunityShortlistComparison({
      longCandidates, shortCandidates, opportunityShortlist, timestamp: start, dataState: 'live',
    });
    expect(longCandidates).toEqual(originalLong);
    expect(shortCandidates).toEqual(originalShort);
    expect(comparison.authoritativeSelection).toBe('CURRENT_APEX_CANDIDATES');
    expect(comparison.shadowOnly).toBe(true);
    expect(comparison.currentShortlist[0].symbol).toBe('ETH-USDT');
    expect(comparison.overlapSymbols).toContain('BTC-USDT');
    expect(comparison.opportunityOnlySymbols).toContain('SOL-USDT');
  });

  it('stores one comparison per scan through the existing decision-memory row shape', () => {
    const opportunityShortlist = buildOpportunityShortlist([
      { ticker: ticker('BTC-USDT'), candles1h: history(50), candles15m: history(50), timestamp: start, minLiquidityUsd: 10_000_000 },
    ]);
    const comparison = buildOpportunityShortlistComparison({
      longCandidates: [candidate('BTC-USDT', 'LONG', 72)], shortCandidates: [],
      opportunityShortlist, timestamp: start, dataState: 'live',
    });
    const logs: SignalDecisionLog[] = ['one', 'two'].map((id) => ({
      id, cycleId: 'cycle-1', timestamp: start, isoTime: new Date(start).toISOString(), ticker: 'BTC-USDT',
      direction: 'LONG', decision: 'ACCEPTED', reasonCode: 'ACCEPTED_BEST_CANDIDATE', reasonText: 'fixture',
    }));
    const attached = attachOpportunityShadowComparison(logs, comparison);
    expect(attached[0].marketSnapshotSummary?.opportunityDiscovery).toEqual(comparison);
    expect(attached[1].marketSnapshotSummary?.opportunityDiscovery).toBeUndefined();
    expect(logs[0].marketSnapshotSummary).toBeUndefined();
  });
});
