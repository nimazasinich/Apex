import { describe, expect, it } from 'vitest';
import {
  clampQStructThreshold,
  normalizeEffectiveScannerConfig,
  QSTRUCT_THRESHOLD_MAX,
  QSTRUCT_THRESHOLD_MIN,
  REPLAY_PROXY_SMC_WEIGHT_CAP,
} from '../services/scannerConfigPolicy';
import { MathEngine } from '../services/mathEngine';
import type { ScannerConfig } from '../types';

const baseConfig: ScannerConfig = {
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
  scoreWeights: MathEngine.defaultScoreWeights(),
  minConfidence: 0.78,
  directionBias: 'SHORT_ONLY',
  topRankSkip: 10,
  minVolume24hUsd: 5000000,
};

describe('scannerConfigPolicy', () => {
  it('clamps qStruct above policy maximum', () => {
    const result = clampQStructThreshold(-0.20);
    expect(result.effective).toBe(QSTRUCT_THRESHOLD_MAX);
    expect(result.override?.reason).toContain('maximum');
  });

  it('clamps qStruct below policy minimum', () => {
    const result = clampQStructThreshold(-0.60);
    expect(result.effective).toBe(QSTRUCT_THRESHOLD_MIN);
  });

  it('records replay SMC weight override', () => {
    const configured = { ...baseConfig, scoreWeights: { ...baseConfig.scoreWeights, smc: 0.08 } };
    const { effective, overrides } = normalizeEffectiveScannerConfig(configured, 'replay_proxy');
    expect(effective.scoreWeights.smc).toBe(REPLAY_PROXY_SMC_WEIGHT_CAP);
    expect(overrides.some((o) => o.field === 'scoreWeights.smc')).toBe(true);
  });

  it('does not cap SMC weight on live context', () => {
    const configured = { ...baseConfig, scoreWeights: { ...baseConfig.scoreWeights, smc: 0.08 } };
    const { effective, overrides } = normalizeEffectiveScannerConfig(configured, 'live');
    expect(effective.scoreWeights.smc).toBe(0.08);
    expect(overrides.filter((o) => o.field === 'scoreWeights.smc')).toHaveLength(0);
  });
});
