import { describe, expect, it } from 'vitest';
import type { ScannerConfig, SignalDecisionLog } from '../types';
import { buildFastAdaptiveShadowRecommendation } from '../services/fastAdaptiveShadowController';

const config: ScannerConfig = {
  intervalMs: 6005,
  obiThreshold: -0.15,
  volumeThreshold: 0,
  qStructThreshold: -0.30,
  fundingThreshold: 0.0001,
  oiExpansionThresholdPct: 0.30,
  atrExpansionThreshold: 0.005,
  maxSqueezeRisk: 0.46,
  minEvidenceAgreement: 0.64,
  minSmartMoneyScore: 0.52,
  smcHardRejectThreshold: 0.22,
  thresholdMode: 'ADAPTIVE_GUARDRAILS',
  adaptiveLearningRate: 0.04,
  adaptiveMinSamples: 24,
  scoreWeights: {
    obi: 0.19,
    qStruct: 0.24,
    volume: 0.17,
    funding: 0.08,
    openInterest: 0.08,
    atr: 0.06,
    microstructure: 0.08,
    liquidity: 0.05,
    smc: 0.05,
  },

  minConfidence: 0.78,
  directionBias: 'SHORT_ONLY',
  topRankSkip: 10,
  minVolume24hUsd: 5_000_000,
};

function row(index: number, now: number, overrides: Partial<SignalDecisionLog> = {}): SignalDecisionLog {
  return {
    id: `row-${index}`,
    cycleId: `cycle-${Math.floor(index / 4)}`,
    timestamp: now - index * 1000,
    isoTime: new Date(now - index * 1000).toISOString(),
    ticker: 'BTC-USDT',
    direction: 'SHORT',
    decision: 'REJECTED',
    reasonCode: 'HIGH_SQUEEZE_RISK',
    reasonText: 'test',
    confidence: 0.65,
    qStructDirectional: -0.1,
    squeezeRiskScore: 0.74,
    evidenceAgreementScore: 0.55,
    liquidityQualityScore: 0.58,
    ...overrides,
  };
}

describe('fast adaptive shadow controller', () => {
  it('stays inactive when the short horizon has insufficient samples', () => {
    const now = 1_800_000_000_000;
    const result = buildFastAdaptiveShadowRecommendation(config, [row(0, now)], { now, minSamples: 8 });
    expect(result.shadowOnly).toBe(true);
    expect(result.sourceHorizon).toBe('none');
    expect(result.active).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it('tightens squeeze controls in the one-minute shadow horizon', () => {
    const now = 1_800_000_000_000;
    const logs = Array.from({ length: 24 }, (_, index) => row(index, now));
    const before = structuredClone(config);
    const result = buildFastAdaptiveShadowRecommendation(config, logs, { now, minSamples: 24 });
    expect(result.sourceHorizon).toBe('1m');
    expect(result.active).toBe(true);
    expect(result.recommendedConfig.maxSqueezeRisk).toBeLessThan(config.maxSqueezeRisk);
    expect(result.recommendedConfig.scoreWeights.microstructure).toBeGreaterThan(config.scoreWeights.microstructure);
    expect(result.recommendedConfig.scoreWeights.liquidity).toBeGreaterThan(config.scoreWeights.liquidity);
    expect(config).toEqual(before);
    const weightTotal = Object.values(result.recommendedConfig.scoreWeights).reduce((sum, value) => sum + value, 0);
    expect(weightTotal).toBeCloseTo(1, 7);
  });

  it('never recommends a numeric change beyond its per-cycle shadow limit', () => {
    const now = 1_800_000_000_000;
    const logs = Array.from({ length: 30 }, (_, index) => row(index, now, {
      decision: index < 10 ? 'ACCEPTED' : 'REJECTED',
      reasonCode: index < 10 ? 'ACCEPTED_BEST_CANDIDATE' : 'HIGH_SQUEEZE_RISK',
      laterOutcome: index < 10 ? 'LOSS' : undefined,
      laterPnl: index < 10 ? -1 : undefined,
    }));
    const result = buildFastAdaptiveShadowRecommendation(config, logs, { now, minSamples: 24 });
    for (const change of result.changes) {
      expect(Math.abs(change.delta)).toBeLessThanOrEqual(0.0160001);
    }
  });
});
