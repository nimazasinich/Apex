import { describe, expect, it } from 'vitest';
import type { SignalDecisionLog } from '../types';
import { prepareMlDataset, validatePreparedMlDataset } from '../services/mlDatasetPreparation';
import { ML_FEATURE_NAMES } from '../services/mlFeatureExtractor';

function makeLog(index: number, outcome: 'WIN' | 'LOSS'): SignalDecisionLog {
  const base = structuredClone((globalThis as any).__never ?? {}) as any;
  return {
    id: `row-${index}`, cycleId: `cycle-${index}`, timestamp: 1_700_000_000_000 + index * 60_000,
    isoTime: new Date(1_700_000_000_000 + index * 60_000).toISOString(), ticker: 'BTC-USDT', direction: 'SHORT', decision: 'ACCEPTED',
    reasonCode: 'TEST', reasonText: 'fixture', confidence: 0.8, rawScore: 0.7, qStructDirectional: -0.5,
    squeezeRiskScore: 0.1, evidenceAgreementScore: 0.8, liquidityQualityScore: 0.9, microPriceSkewScore: -0.2,
    fundingBiasScore: -0.1, oiChangePercent: 2, atrExpansionScore: 1.2, smcDirectionalScore: -0.5, smcContextScore: 0.7,
    scoringBreakdown: { obi: 1, qStruct: 1, volume: 1, funding: 1, openInterest: 1, atr: 1, microstructure: 1, liquidity: 1, smc: 1, weightedSum: 9, totalWeight: 9 },
    smartMoneyContext: { smcDirectionalScore: -0.5, smcContextScore: 0.7, smartMoneyBiasScore: -0.4, flipSetupScore: 0.2, chochSetupScore: 0.2, continuationScore: 0.2, ifcQualityScore: 0.5, liquiditySweepScore: 0.3, zoneFreshnessScore: 0.8, unmitigatedZoneProximity: 0.5, htfSupplyInControl: true, htfDemandInControl: false, setupModel: 'NONE', controlSide: 'SUPPLY' },
    gatesSnapshot: { shortObi: true, shortVolume: true, shortQStruct: true, longObi: false, longVolume: false, longQStruct: false, obiThreshold: -0.2, volumeThreshold: -1, qStructThreshold: -0.3, smoothedObi: -0.4, smoothedVolDelta: -8, qStructDirectional: -0.5 },
    configSnapshot: { intervalMs: 60000, obiThreshold: -0.2, volumeThreshold: -1, qStructThreshold: -0.3, fundingThreshold: 0.0001, oiExpansionThresholdPct: 1, atrExpansionThreshold: 1, maxSqueezeRisk: 0.8, minEvidenceAgreement: 0.5, minSmartMoneyScore: 0.4, smcHardRejectThreshold: -0.9, adaptiveLearningRate: 0.1, adaptiveMinSamples: 20, minConfidence: 0.6, topRankSkip: 0, minVolume24hUsd: 1_000_000, scoreWeights: { obi: 1, qStruct: 1, volume: 1, funding: 1, openInterest: 1, atr: 1, microstructure: 1, liquidity: 1, smc: 1 }, thresholdMode: 'MANUAL', directionBias: 'BOTH', scorePreset: 'CUSTOM' },
    marketSnapshotSummary: { price: 100, obi: -0.4, netVolumeDelta: -8, fundingRate: 0.0001, longShortRatio: 1.2, takerBuySellRatio: 0.9, spread: 0.02, atr: 2, dataSource: 'kucoin_plus_binance_live' },
    price: 100, atr: 2, laterOutcome: outcome, laterPnl: outcome === 'WIN' ? 1 : -1,
    ...base,
  } as SignalDecisionLog;
}

describe('canonical ML dataset contract', () => {
  it('emits chronological, leakage-free rows with provenance and a stable integrity checksum', () => {
    const logs = Array.from({ length: 400 }, (_, index) => makeLog(index, index % 2 ? 'WIN' : 'LOSS'));
    const dataset = prepareMlDataset(logs, { sourcePath: 'decision-memory.json', generatedAt: '2026-08-10T00:00:00.000Z' });
    expect(dataset.gate.status).toBe('PASSED');
    expect(dataset.integrity.validated).toBe(true);
    expect(dataset.integrity.rowsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(dataset.rows[0].provenance.featureVersion).toBe('ml_features_v1');
    expect(dataset.rows[0].provenance.marketDataSource).toBe('kucoin_plus_binance_live');
    expect(dataset.featureNames).toEqual(ML_FEATURE_NAMES);
    expect(validatePreparedMlDataset(dataset)).toEqual({ valid: true, errors: [] });
  });

  it('detects chronological/split/provenance corruption instead of silently training', () => {
    const logs = Array.from({ length: 400 }, (_, index) => makeLog(index, index % 2 ? 'WIN' : 'LOSS'));
    const dataset = prepareMlDataset(logs, { sourcePath: null, generatedAt: '2026-08-10T00:00:00.000Z' });
    const broken = structuredClone(dataset);
    broken.rows[1].timestamp = broken.rows[0].timestamp - 1;
    broken.rows[1].provenance.decisionTimestamp = broken.rows[0].timestamp;
    const validation = validatePreparedMlDataset(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('rows_not_chronological');
    expect(validation.errors).toContain('feature_provenance_mismatch');
  });
});
