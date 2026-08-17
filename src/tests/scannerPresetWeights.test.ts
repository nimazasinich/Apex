import { describe, expect, it } from 'vitest';
import type { ScannerConfig } from '../types';
import { getStrategyDefinition } from '../services/strategyRegistry';
import { buildScannerPresetConfig } from '../services/strategyEngine/scannerPresetAdapter';

const baseConfig = {
  intervalMs: 6000, obiThreshold: -0.15, volumeThreshold: 0, qStructThreshold: -0.3,
  fundingThreshold: 0.0001, oiExpansionThresholdPct: 0.3, atrExpansionThreshold: 0.005,
  maxSqueezeRisk: 0.46, minEvidenceAgreement: 0.64, minSmartMoneyScore: 0.52,
  smcHardRejectThreshold: 0.22, thresholdMode: 'ADAPTIVE_GUARDRAILS', adaptiveLearningRate: 0.04,
  adaptiveMinSamples: 24, scoreWeights: { obi: 1, qStruct: 1, volume: 1, funding: 1, openInterest: 1, atr: 1, microstructure: 1, liquidity: 1, smc: 1 },
  minConfidence: 0.78, directionBias: 'BOTH', topRankSkip: 0, minVolume24hUsd: 5_000_000,
} satisfies ScannerConfig;

describe('scanner preset manual and dynamic controls', () => {
  it('applies bounded scanner weights while keeping live fusion weights out of candle replay', () => {
    const definition = getStrategyDefinition('whale-flow-sentiment-reversal-v1')!;
    const result = buildScannerPresetConfig(baseConfig, definition, { 'weight.smc': 99, 'fusion.sentiment': 0.42 });
    const parameter = definition.parameters.find((row) => row.key === 'weight.smc')!;
    expect(result.scoreWeights.smc).toBe(parameter.max);
    expect((result as unknown as Record<string, unknown>)['fusion.sentiment']).toBeUndefined();
  });
});
