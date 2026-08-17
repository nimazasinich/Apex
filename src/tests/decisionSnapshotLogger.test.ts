import { describe, expect, it } from 'vitest';
import { decisionSnapshotToLog, summarizeShadowComparison } from '../services/decisionSnapshotLogger';
import type { DecisionSnapshot } from '../services/canonicalDecisionAdapter';

function mockSnapshot(overrides: Partial<DecisionSnapshot> = {}): DecisionSnapshot {
  return {
    symbol: 'BTC-USDT',
    direction: 'LONG',
    rankingScore: 72,
    confidence: 0.72,
    supportingSignals: ['momentum'],
    conflictingSignals: [],
    dataQuality: 'live',
    engineVersion: 'canonical_v1',
    createdAt: 1_700_000_000_000,
    expiresAt: 1_700_000_090_000,
    baseline: {
      symbol: 'BTC-USDT',
      lastPrice: 94000,
      priceChange24hPct: 2,
      turnover24h: 500000000,
      direction: 'LONG',
      score: 72,
      readinessTier: 'WATCHLIST',
      guardPass: true,
      guardReasons: [],
      momentumScore: 70,
      orderFlowScore: 55,
      fundingScore: 50,
      structureScore: 80,
      liquidityScore: 90,
      timeframeConfluence: true,
      timeframeConfluenceState: 'ALIGNED',
      timeframeDetails: { tf15m: 'BULLISH', tf1h: 'BULLISH' },
      dataState: 'live',
    },
    shadow: {
      status: 'REJECTED',
      direction: 'LONG',
      reasonCode: 'LOW_CONFIDENCE',
      reasonText: 'Shadow below confidence floor',
      confidence: 0.62,
      rawScore: 0.55,
      smcAvailability: 'INSUFFICIENT_HISTORY',
      engineVersion: 'canonical_v1',
    },
    smcAvailability: 'INSUFFICIENT_HISTORY',
    calibratedProbability: null,
    expectedNetEdge: null,
    modelUncertainty: null,
    featureCompletenessPct: 100,
    mode: 'live',
    ...overrides,
  };
}

describe('decisionSnapshotLogger', () => {
  it('detects baseline/shadow divergence', () => {
    const summary = summarizeShadowComparison(mockSnapshot());
    expect(summary.agreement).toBe(false);
    expect(summary.baselineAccepted).toBe(true);
    expect(summary.shadowAccepted).toBe(false);
    expect(summary.divergenceReason).toContain('shadow rejected');
  });

  it('writes SHADOW_COMPARISON metadata to SignalDecisionLog', () => {
    const log = decisionSnapshotToLog(mockSnapshot(), 'LONG', 'scan-1');
    expect(log.cycleId).toBe('scan-1');
    expect(log.marketSnapshotSummary?.logKind).toBe('SHADOW_COMPARISON');
    expect(log.marketSnapshotSummary?.shadow).toBeTruthy();
    expect(log.decision).toBe('ACCEPTED');
  });
});
