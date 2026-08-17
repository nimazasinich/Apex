import { describe, expect, it } from 'vitest';
import type { ScannerConfig, StrategyDefinition } from '../types';
import { buildScannerPresetConfig } from '../services/strategyEngine/scannerPresetAdapter';

const baseConfig = {
  intervalMs: 6000,
  obiThreshold: -0.15,
  volumeThreshold: 0,
  qStructThreshold: -0.3,
  fundingThreshold: 0.0001,
  oiExpansionThresholdPct: 0.3,
  atrExpansionThreshold: 0.005,
  maxSqueezeRisk: 0.46,
  minEvidenceAgreement: 0.64,
  minSmartMoneyScore: 0.52,
  smcHardRejectThreshold: 0.22,
  thresholdMode: 'ADAPTIVE_GUARDRAILS',
  adaptiveLearningRate: 0.04,
  adaptiveMinSamples: 24,
  scoreWeights: {
    obi: 1,
    qStruct: 1,
    volume: 1,
    funding: 1,
    openInterest: 1,
    atr: 1,
    microstructure: 1,
    liquidity: 1,
    smc: 1,
  },
  minConfidence: 0.78,
  directionBias: 'BOTH',
  topRankSkip: 0,
  minVolume24hUsd: 5_000_000,
} satisfies ScannerConfig;

const definition = {
  strategyId: 'test-scanner-preset',
  version: 1,
  name: 'Test Scanner Preset',
  summary: 'Test strategy',
  evidenceTier: ['B'],
  wave: 'wave1-mvp',
  status: 'candidate',
  longShort: 'BOTH',
  supportedIntervals: ['1h'],
  dataRequirements: ['candles'],
  engine: 'scanner-preset',
  scoreWeights: { funding: 2 },
  scannerConfigOverrides: { minConfidence: 0.8, minEvidenceAgreement: 0.7 },
  regimeRules: [], setupRules: [], triggerRules: [], riskRules: [], exitRules: [], noTradeRules: [],
  parameters: [
    { key: 'minConfidence', label: 'Confidence', default: 0.8, min: 0.6, max: 0.95, step: 0.01, reason: 'test' },
    { key: 'minEvidenceAgreement', label: 'Agreement', default: 0.7, min: 0.55, max: 0.85, step: 0.01, reason: 'test' },
  ],
  sourceReferences: [], knownFailureModes: [], categories: ['Test'], componentCount: 1,
} satisfies StrategyDefinition;

describe('strategy/backtest production hardening', () => {
  it('applies runtime scanner parameters and clamps them to signed ranges', () => {
    const result = buildScannerPresetConfig(baseConfig, definition, {
      minConfidence: 0.91,
      minEvidenceAgreement: 4,
      unknownParameter: 123,
    });
    expect(result.minConfidence).toBe(0.91);
    expect(result.minEvidenceAgreement).toBe(0.85);
    expect(result.scoreWeights.funding).toBe(2);
    expect((result as unknown as Record<string, unknown>).unknownParameter).toBeUndefined();
  });
});
