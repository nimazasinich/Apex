import { describe, expect, it } from 'vitest';
import type { ScannerConfig, SignalDecisionLog, SmartMoneyContext } from '../types';
import {
  ML_FEATURE_NAMES,
  extractFeatures,
  inspectMlFeatureCompleteness,
  isLeakageExcludedFeature,
} from '../services/mlFeatureExtractor';
import { prepareMlDataset } from '../services/mlDatasetPreparation';
import {
  predictLogisticProbability,
  trainLogisticRegression,
} from '../services/mlLogisticRegression';
import {
  createShadowMlModelFile,
  validateShadowMlModelFile,
} from '../services/shadowMlModel';
import { trainShadowMlModel } from '../services/shadowMlTraining';
import { compareShadowMlRows } from '../services/shadowMlComparison';
import {
  classifyDirectionDivergence,
  chronologicalSplitRows,
} from '../services/directionDivergenceAnalysis';
import {
  buildRejectedReplayGeometry,
  resolveRejectedReplay,
} from '../services/rejectedCandidateReplay';
import {
  deriveAdaptiveScannerConfig,
} from '../services/adaptiveThresholdEngine';
import { runAdaptiveLearningStress } from '../services/adaptiveLearningStress';
import { runProviderRoutingStress } from '../services/providerRoutingStress';

function scannerConfig(): ScannerConfig {
  return {
    intervalMs: 6005,
    obiThreshold: -0.15,
    volumeThreshold: 0,
    qStructThreshold: -0.30,
    fundingThreshold: 0.0001,
    oiExpansionThresholdPct: 0.30,
    atrExpansionThreshold: 0.005,
    maxSqueezeRisk: 0.62,
    minEvidenceAgreement: 0.58,
    minSmartMoneyScore: 0.52,
    smcHardRejectThreshold: 0.22,
    thresholdMode: 'ADAPTIVE_GUARDRAILS',
    scorePreset: 'ATLAS_PLUS_V2',
    adaptiveLearningRate: 0.04,
    adaptiveMinSamples: 24,
    scoreWeights: {
      obi: 0.12,
      qStruct: 0.18,
      volume: 0.14,
      funding: 0.08,
      openInterest: 0.06,
      atr: 0.05,
      microstructure: 0.11,
      liquidity: 0.13,
      smc: 0.13,
    },
    minConfidence: 0.78,
    directionBias: 'SHORT_ONLY',
    topRankSkip: 10,
    minVolume24hUsd: 5_000_000,
  };
}

function decisionFixture(
  index = 0,
  outcome: 'WIN' | 'LOSS' | 'UNKNOWN' = 'WIN',
  direction: 'SHORT' | 'LONG' = 'SHORT',
  decision: 'ACCEPTED' | 'REJECTED' = 'ACCEPTED',
): SignalDecisionLog {
  const config = scannerConfig();
  const smartMoneyContext: SmartMoneyContext = {
    smcDirectionalScore: direction === 'SHORT' ? -0.65 : 0.65,
    smcContextScore: 0.72,
    setupModel: 'FLIP',
    controlSide: direction === 'SHORT' ? 'SUPPLY' : 'DEMAND',
    smartMoneyBiasScore: 0.70,
    flipSetupScore: 0.80,
    chochSetupScore: 0.40,
    continuationScore: 0.50,
    ifcQualityScore: 0.70,
    liquiditySweepScore: 0.60,
    zoneFreshnessScore: 0.80,
    unmitigatedZoneProximity: 0.30,
    htfSupplyInControl: direction === 'SHORT',
    htfDemandInControl: direction === 'LONG',
    reasons: ['test fixture'],
  };
  const timestamp = 1_700_000_000_000 + index;
  return {
    id: `decision-${index}`,
    cycleId: `cycle-${index}`,
    timestamp,
    isoTime: new Date(timestamp).toISOString(),
    ticker: `TEST-${index}`,
    direction,
    decision,
    reasonCode: decision === 'ACCEPTED' ? 'ACCEPTED_BEST_CANDIDATE' : 'LOW_CONFIDENCE',
    reasonText: 'Deterministic test fixture.',
    confidence: 0.82,
    rawScore: 0.60,
    qStructDirectional: direction === 'SHORT' ? -0.50 : 0.50,
    squeezeRiskScore: 0.20,
    evidenceAgreementScore: 0.80,
    liquidityQualityScore: 0.90,
    microPriceSkewScore: direction === 'SHORT' ? -0.10 : 0.10,
    fundingBiasScore: -0.20,
    oiChangePercent: 0.40,
    atrExpansionScore: 0.70,
    smcDirectionalScore: smartMoneyContext.smcDirectionalScore,
    smcContextScore: smartMoneyContext.smcContextScore,
    smcSetupModel: smartMoneyContext.setupModel,
    smartMoneyContext,
    scoringBreakdown: {
      obi: 0.30,
      qStruct: 0.40,
      volume: 0.20,
      funding: 0.10,
      openInterest: 0.20,
      atr: 0.30,
      microstructure: 0.20,
      liquidity: 0.80,
      smc: 0.60,
      weightedSum: 0.42,
      totalWeight: 1,
    },
    gatesSnapshot: {
      shortObi: direction === 'SHORT',
      shortVolume: direction === 'SHORT',
      shortQStruct: direction === 'SHORT',
      longObi: direction === 'LONG',
      longVolume: direction === 'LONG',
      longQStruct: direction === 'LONG',
      obiThreshold: -0.15,
      volumeThreshold: 0,
      qStructThreshold: -0.30,
      smoothedObi: direction === 'SHORT' ? -0.40 : 0.40,
      smoothedVolDelta: direction === 'SHORT' ? -8 : 8,
      qStructDirectional: direction === 'SHORT' ? -0.50 : 0.50,
    },
    configSnapshot: config,
    marketSnapshotSummary: {
      price: 100,
      obi: -0.40,
      netVolumeDelta: -8,
      fundingRate: 0.0002,
      longShortRatio: 1.2,
      takerBuySellRatio: 0.9,
      spread: 0.02,
      atr: 2,
      dataSource: 'kucoin_plus_binance_live',
    },
    price: 100,
    atr: 2,
    laterOutcome: outcome,
    laterPnl: outcome === 'WIN' ? 1.5 : outcome === 'LOSS' ? -1 : undefined,
  };
}

describe('restored decision and shadow-ML subsystem', () => {
  it('extracts the frozen 100-feature contract deterministically without leakage', () => {
    const row = decisionFixture();
    const first = extractFeatures(row);
    const second = extractFeatures(row);
    expect(ML_FEATURE_NAMES).toHaveLength(100);
    expect(first?.values).toHaveLength(100);
    expect(first).toEqual(second);
    for (const name of ['laterOutcome', 'laterPnl', 'decision', 'reasonCode']) {
      expect(isLeakageExcludedFeature(name)).toBe(true);
      expect(ML_FEATURE_NAMES).not.toContain(name);
    }
  });

  it('rejects incomplete and unknown categorical feature values instead of encoding them as zero', () => {
    const missing = { ...decisionFixture(), confidence: undefined };
    expect(extractFeatures(missing)).toBeNull();
    expect(inspectMlFeatureCompleteness(missing).missing).toContain('log.confidence');

    const invalidCategory = decisionFixture();
    invalidCategory.marketSnapshotSummary = {
      ...invalidCategory.marketSnapshotSummary,
      dataSource: 'unknown_runtime_value',
    };
    expect(extractFeatures(invalidCategory)).toBeNull();
    expect(inspectMlFeatureCompleteness(invalidCategory).missing)
      .toContain('marketSnapshotSummary.dataSource.kucoin_live');
  });

  it('prepares deterministic chronological train, validation, and test splits', () => {
    const rows = Array.from({ length: 400 }, (_, index) =>
      decisionFixture(index, index % 2 ? 'WIN' : 'LOSS'));
    const dataset = prepareMlDataset(rows, { sourcePath: 'fixture.json', generatedAt: '2026-08-03T00:00:00.000Z' });
    expect(dataset.gate.status).toBe('PASSED');
    expect(dataset.rows.filter((row) => row.split === 'train')).toHaveLength(280);
    expect(dataset.rows.filter((row) => row.split === 'validation')).toHaveLength(60);
    expect(dataset.rows.filter((row) => row.split === 'test')).toHaveLength(60);
  });

  it('trains a deterministic logistic baseline and validates its model integrity', () => {
    const rows = [
      ...Array.from({ length: 100 }, (_, index) => ({ values: [index < 50 ? -2 : -1, 0], label: 0 as const })),
      ...Array.from({ length: 100 }, (_, index) => ({ values: [index < 50 ? 1 : 2, 0], label: 1 as const })),
    ];
    const model = trainLogisticRegression(rows, { epochs: 1000, learningRate: 0.1 });
    expect(predictLogisticProbability(model, [2, 0])).toBeGreaterThan(0.8);
    expect(predictLogisticProbability(model, [-2, 0])).toBeLessThan(0.2);

    const file = createShadowMlModelFile({
      modelId: 'test-model',
      createdAt: '2026-08-03T00:00:00.000Z',
      model: {
        ...model,
        coefficients: Array.from({ length: ML_FEATURE_NAMES.length }, (_, index) => model.coefficients[index] ?? 0),
        standardization: {
          means: Array.from({ length: ML_FEATURE_NAMES.length }, (_, index) => model.standardization.means[index] ?? 0),
          standardDeviations: Array.from({ length: ML_FEATURE_NAMES.length }, (_, index) => model.standardization.standardDeviations[index] ?? 1),
        },
      },
      training: { rows: 200, winRows: 100, lossRows: 100, epochs: 1000, learningRate: 0.1, l2: 0.001, sourcePath: null },
    });
    expect(validateShadowMlModelFile(file)).toEqual([]);
    expect(validateShadowMlModelFile({ ...file, intercept: file.intercept + 1 })).toContain('checksum mismatch.');
  });

  it('trains and compares a model only after the data and train-split gates pass', () => {
    const alternating = Array.from({ length: 400 }, (_, index) =>
      decisionFixture(index, index % 2 ? 'WIN' : 'LOSS'));
    const dataset = prepareMlDataset(alternating, { sourcePath: 'fixture.json', generatedAt: '2026-08-03T00:00:00.000Z' });
    const trained = trainShadowMlModel(dataset, { generatedAt: '2026-08-03T00:00:00.000Z' });
    expect(trained.gate.status).toBe('TRAINED');
    expect(trained.model).not.toBeNull();
    const compared = compareShadowMlRows(alternating.slice(0, 20), trained.model, { sourcePath: 'fixture.json', generatedAt: '2026-08-03T00:00:00.000Z' });
    expect(compared.gate.status).toBe('COMPARED');
    expect(compared.summary.rowsScored).toBe(20);

    const chronologicallyBiased = Array.from({ length: 400 }, (_, index) =>
      decisionFixture(index, index < 280 ? 'LOSS' : 'WIN'));
    const biasedDataset = prepareMlDataset(chronologicallyBiased, { sourcePath: null, generatedAt: '2026-08-03T00:00:00.000Z' });
    expect(biasedDataset.gate.status).toBe('PASSED');
    const blocked = trainShadowMlModel(biasedDataset, { generatedAt: '2026-08-03T00:00:00.000Z' });
    expect(blocked.gate.status).toBe('INSUFFICIENT_DATA');
    expect(blocked.gate.reason).toBe('chronological_train_split_missing_class_support');
    expect(blocked.model).toBeNull();
  });

  it('classifies both LONG and SHORT divergence directionally and splits chronologically', () => {
    expect(classifyDirectionDivergence(decisionFixture(1, 'WIN', 'SHORT'))?.category).toBe('WITH_TREND');
    expect(classifyDirectionDivergence(decisionFixture(2, 'WIN', 'LONG'))?.category).toBe('WITH_TREND');
    const counter = { ...decisionFixture(3, 'WIN', 'LONG'), qStructDirectional: -0.5 };
    expect(classifyDirectionDivergence(counter)?.category).toBe('COUNTER_TREND');
    const classified = [decisionFixture(3), decisionFixture(1), decisionFixture(2)]
      .map((row) => classifyDirectionDivergence(row))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    expect(chronologicalSplitRows(classified).reduce((sum, split) => sum + split.rowCount, 0)).toBe(3);
  });

  it('resolves rejected replay wins, losses, and expiry without using a post-horizon price', () => {
    const row = { ...decisionFixture(4, 'UNKNOWN', 'SHORT', 'REJECTED'), laterOutcome: 'UNKNOWN' as const };
    const geometry = buildRejectedReplayGeometry(row);
    expect(geometry).not.toBeNull();
    expect(geometry!.stop).toBeGreaterThan(geometry!.entry);
    expect(geometry!.target).toBeLessThan(geometry!.entry);
    expect(resolveRejectedReplay(row, [{ timestamp: row.timestamp + 1_000, price: geometry!.target - 0.1 }])?.outcome).toBe('WIN');
    expect(resolveRejectedReplay(row, [{ timestamp: row.timestamp + 1_000, price: geometry!.stop + 0.1 }])?.outcome).toBe('LOSS');
    const expired = resolveRejectedReplay(row, [{ timestamp: row.timestamp + 86_400_001, price: 999 }]);
    expect(expired?.outcome).toBe('EXPIRED');
    expect(expired?.resolvedPrice).toBeNull();
  });

  it('preserves manual configuration and emits deterministic bounded adaptive results', () => {
    const manual = { ...scannerConfig(), thresholdMode: 'MANUAL' as const };
    const rows = Array.from({ length: 100 }, (_, index) => decisionFixture(index, index % 2 ? 'WIN' : 'LOSS'));
    expect(deriveAdaptiveScannerConfig(manual, rows).nextConfig).toEqual(manual);
    const first = deriveAdaptiveScannerConfig(scannerConfig(), rows, { now: 1_700_000_100_000 });
    const second = deriveAdaptiveScannerConfig(scannerConfig(), [...rows].reverse(), { now: 1_700_000_100_000 });
    expect(first.nextConfig).toEqual(second.nextConfig);
    expect(Object.values(first.nextConfig.scoreWeights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 7);
  });

  it('runs deterministic adaptive and provider-routing safety harnesses', async () => {
    const input = { seed: 42, cycles: 180, candidatesPerCycle: 30, generatedAt: '2026-08-03T00:00:00.000Z' };
    const first = runAdaptiveLearningStress(input);
    const second = runAdaptiveLearningStress(input);
    expect(first).toEqual(second);
    expect(first.verdict).toBe('PASS');
    expect(() => runAdaptiveLearningStress({ ...input, cycles: Number.NaN })).toThrow('cycles must be a finite positive number.');

    const provider = await runProviderRoutingStress({ seed: 42, generatedAt: input.generatedAt });
    expect(provider.verdict).toBe('PASS');
    expect(provider.run).toMatchObject({ scenarioCount: 12, passedChecks: 16, totalChecks: 16 });
    expect(provider.scenarios.every((scenario) => !scenario.fabricated)).toBe(true);
  });
});
