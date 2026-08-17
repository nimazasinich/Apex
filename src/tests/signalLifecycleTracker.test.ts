import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { updateSignalLifecycles } from '../services/signalLifecycleTracker';
import { resetSignalIdSerialForTests } from '../utils/signalId';
import type { CandidateScore } from '../types';

class MemoryStorage {
  private readonly rows = new Map<string, string>();
  getItem(key: string) { return this.rows.get(key) ?? null; }
  setItem(key: string, value: string) { this.rows.set(key, String(value)); }
  removeItem(key: string) { this.rows.delete(key); }
  clear() { this.rows.clear(); }
  key(index: number) { return [...this.rows.keys()][index] ?? null; }
  get length() { return this.rows.size; }
}

function candidate(price = 100): CandidateScore {
  return {
    symbol: 'BTC-USDT',
    lastPrice: price,
    priceChange24hPct: 1,
    turnover24h: 100_000_000,
    direction: 'LONG',
    score: 82,
    readinessTier: 'WATCHLIST',
    guardPass: true,
    guardReasons: [],
    momentumScore: 80,
    orderFlowScore: 80,
    fundingScore: 70,
    structureScore: 80,
    liquidityScore: 90,
    timeframeConfluence: true,
    timeframeDetails: { tf15m: 'BULLISH', tf1h: 'BULLISH' },
    dataState: 'live',
    canonicalDecision: {
      confidence: 0.82,
      calibratedProbability: null,
      expectedNetEdge: null,
      modelUncertainty: null,
      featureCompletenessPct: 100,
      engineVersion: 'test',
      createdAt: 1,
      expiresAt: 2,
    },
    lifecycleContext: {
      smoothedObi: 0.5,
      confluence1M: 0.5,
      confluenceAvailable: true,
      dataState: 'live',
      entryPrice: 100,
      stopLoss: 90,
      takeProfit: 110,
    },
  };
}

beforeEach(() => {
  resetSignalIdSerialForTests();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: new MemoryStorage() },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('signal lifecycle tracker', () => {
  it('preserves one signal id through candidate, confirmed, active and closure states', () => {
    const first = updateSignalLifecycles([candidate()], [], 1_000);
    expect(first.longCandidates[0].signalLifecycle?.state).toBe('CANDIDATE');
    const signalId = first.longCandidates[0].signalId;

    const confirmed = updateSignalLifecycles([candidate()], [], 2_000);
    expect(confirmed.longCandidates[0].signalLifecycle?.state).toBe('CONFIRMED');
    expect(confirmed.longCandidates[0].signalId).toBe(signalId);

    const active = updateSignalLifecycles([candidate()], [], 3_000);
    expect(active.longCandidates[0].signalLifecycle?.state).toBe('ACTIVE');

    const closed = updateSignalLifecycles([candidate(111)], [], 4_000);
    expect(closed.longCandidates[0].signalLifecycle?.state).toBe('EXPIRED');
    expect(closed.closures).toEqual([
      expect.objectContaining({ signalId, ticker: 'BTC-USDT', direction: 'LONG', outcome: 'WIN' }),
    ]);
  });

  it('does not assign an identity to a blocked candidate', () => {
    const blocked = { ...candidate(), guardPass: false, readinessTier: 'BLOCKED' as const };
    const result = updateSignalLifecycles([blocked], [], 1_000);
    expect(result.longCandidates[0].signalId).toBeUndefined();
    expect(result.records).toHaveLength(0);
  });
});
