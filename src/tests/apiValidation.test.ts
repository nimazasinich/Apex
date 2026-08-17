import { describe, expect, it } from 'vitest';
import { validateBacktestQuery, validateStrategyOptimizationInput, validateStrategyValidationInput } from '../services/apiValidation';

describe('API validation', () => {
  it('accepts a bounded deterministic backtest query', () => {
    const result = validateBacktestQuery({
      strategy: 'opening-range-vwap-rvol-breakout-v1',
      symbol: 'BTC-USDT',
      direction: 'SHORT',
      interval: '15m',
      bars: '2000',
      maxBars: '72',
      commissionPct: '0.04',
      parameters: '{"rvol":1.5}',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.direction).toBe('SHORT');
      expect(result.value.requestedBars).toBe(2000);
      expect(result.value.parameters).toEqual({ rvol: 1.5 });
    }
  });

  it('rejects non-finite, excessive, and unsupported compute values', () => {
    const result = validateBacktestQuery({ symbol: 'file:///etc/passwd', direction: 'SIDEWAYS', interval: '2m', bars: 'Infinity', maxBars: '9999' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['symbol', 'direction', 'interval', 'bars', 'maxBars']));
  });

  it('rejects unknown strategy-validation fields', () => {
    const result = validateStrategyValidationInput({ symbol: 'ETH-USDT', interval: '1h', direction: 'LONG', maxBars: 24, executeLive: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ field: 'executeLive', code: 'unknown_field' }));
  });

  it('bounds automatic strategy optimization workloads', () => {
    const result = validateStrategyOptimizationInput({
      symbol: 'BTC-USDT', direction: 'SHORT', interval: '1h', bars: 2500, maxBars: 72,
      coarseCandidates: 32, refinementCandidates: 12, maxConcurrent: 4, autoPromote: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.requestedBars).toBe(2500);
      expect(result.value.autoPromote).toBe(true);
      expect(result.value.maxConcurrent).toBe(4);
    }
  });

  it('rejects excessive optimizer budgets and unknown fields', () => {
    const result = validateStrategyOptimizationInput({ bars: 50_000, coarseCandidates: 500, maxConcurrent: 64, disableRisk: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['bars', 'coarseCandidates', 'maxConcurrent', 'disableRisk']));
  });

});
