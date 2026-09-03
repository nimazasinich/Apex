import { describe, expect, it } from 'vitest';
import type { CandidateScore } from '../types';
import {
  canonicalCandidateState,
  compareCanonicalCandidates,
  withCandidateExpectedNetEdge,
  withCanonicalCandidateAuthority,
} from '../services/canonicalCandidateDecision';

function candidate(overrides: Partial<CandidateScore> = {}): CandidateScore {
  return {
    symbol: 'BTC-USDT', lastPrice: 100, priceChange24hPct: 1, turnover24h: 50_000_000,
    direction: 'LONG', score: 80, readinessTier: 'CONFIRMED', guardPass: true, guardReasons: [],
    momentumScore: 80, orderFlowScore: 75, fundingScore: 70, structureScore: 80, liquidityScore: 90,
    timeframeConfluence: true, timeframeDetails: { tf15m: 'BULLISH', tf1h: 'BULLISH' }, dataState: 'live',
    featureCompletenessPct: 90,
    lifecycleContext: { smoothedObi: 0.2, confluence1M: 0.5, confluenceAvailable: true, dataState: 'live', entryPrice: 100, stopLoss: 98, takeProfit: 104 },
    canonicalDecision: {
      confidence: 0.8, calibratedProbability: 0.62, expectedNetEdge: null, modelUncertainty: 0.06,
      featureCompletenessPct: 90, engineVersion: 'test', createdAt: 1_000, expiresAt: 99_999,
    },
    ...overrides,
  };
}

describe('canonical candidate authority', () => {
  it('emits a signal only after calibrated positive net edge is derived from real geometry and costs', () => {
    const enriched = withCandidateExpectedNetEdge(candidate(), { spread: 0.02, fundingRate: 0.0001 });
    expect(enriched.canonicalDecision?.expectedNetEdge).toBeGreaterThan(0);
    expect(canonicalCandidateState(enriched, 2_000)).toBe('SIGNAL');
  });

  it('fails closed when calibration or observable costs are missing', () => {
    expect(withCandidateExpectedNetEdge(candidate(), { spread: null, fundingRate: 0.0001 }).canonicalDecision?.expectedNetEdge).toBeNull();
    expect(canonicalCandidateState(candidate(), 2_000)).toBe('QUALIFIED_SETUP');
  });

  it('does not promote positive edge without aligned, high-coverage evidence', () => {
    const enriched = withCandidateExpectedNetEdge(candidate({
      timeframeConfluence: false,
      timeframeConfluenceState: 'CONFLICTING',
    }), { spread: 0.02, fundingRate: 0.0001 });
    expect(canonicalCandidateState(enriched, 2_000)).toBe('WATCH');
  });

  it('requires a meaningful cost-adjusted edge margin for SIGNAL', () => {
    expect(canonicalCandidateState(candidate({
      canonicalDecision: { ...candidate().canonicalDecision!, expectedNetEdge: 0.01 },
    }), 2_000)).toBe('QUALIFIED_SETUP');
  });

  it('ranks qualification before a larger raw score', () => {
    const rejected = withCanonicalCandidateAuthority(candidate({ score: 99, guardPass: false, readinessTier: 'BLOCKED' }), 2_000);
    const setup = withCanonicalCandidateAuthority(candidate({ score: 70, canonicalDecision: { ...candidate().canonicalDecision!, calibratedProbability: null } }), 2_000);
    expect([rejected, setup].sort(compareCanonicalCandidates)[0].decisionState).toBe('QUALIFIED_SETUP');
  });
});
