import { describe, expect, it } from 'vitest';
import { calibrateDecisionFromMemory } from '../services/decisionCalibration';
import type { SignalDecisionLog } from '../types';

function row(index: number, outcome: 'WIN' | 'LOSS', direction: 'LONG' | 'SHORT' = 'LONG'): SignalDecisionLog {
  return {
    id: `d-${index}`, cycleId: 'c', timestamp: index, isoTime: new Date(index).toISOString(), ticker: 'BTC-USDT', direction,
    decision: 'ACCEPTED', reasonCode: 'ENSEMBLE_ACCEPTED', reasonText: 'fixture', laterOutcome: outcome,
    marketRegime: 'TREND_UP', ensembleScore: 0.75, ensembleModelAgreement: 0.8,
  };
}

describe('decisionCalibration', () => {
  it('does not manufacture a probability from a small live sample', () => {
    const result = calibrateDecisionFromMemory(Array.from({ length: 10 }, (_, i) => row(i, i < 6 ? 'WIN' : 'LOSS')), { regime: 'TREND_UP', direction: 'LONG' });
    expect(result.probability).toBeNull();
    expect(result.scope).toBe('INSUFFICIENT');
  });

  it('emits a smoothed outcome-backed probability when regime+direction sample is sufficient', () => {
    const rows = Array.from({ length: 24 }, (_, i) => row(i, i < 15 ? 'WIN' : 'LOSS'));
    const result = calibrateDecisionFromMemory(rows, { regime: 'TREND_UP', direction: 'LONG' });
    expect(result.scope).toBe('REGIME_DIRECTION');
    expect(result.sampleSize).toBe(24);
    expect(result.probability).toBeCloseTo(17 / 28, 4); // Beta(2,2) posterior
    expect(result.uncertainty).not.toBeNull();
  });
});
