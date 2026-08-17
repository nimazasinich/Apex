import { describe, expect, it } from 'vitest';
import { calculatePositionSizing } from '../../lib/sizing';
import { SizingConfig } from '../../types';

describe('Position Sizing & Risk Math (REQ-040 through REQ-046)', () => {
  const baseConfig: SizingConfig = {
    accountBalanceUsd: 10000,
    riskMode: 'USD',
    riskValue: 100, // $100 flat risk
    leverage: 5,
    entryPrice: 94000,
    stopLossPrice: 93000,
    takeProfitPrice: 96500,
    direction: 'LONG',
    successProbModel: 72,
    successProbUserOverride: null,
  };

  it('calculates position size base and USD notional accurately (REQ-044)', () => {
    const result = calculatePositionSizing(baseConfig);
    // $100 risk / $1000 stop distance = 0.1 BTC base size
    expect(result.positionSizeBase).toBeCloseTo(0.1, 3);
    expect(result.positionSizeUsd).toBeCloseTo(9400, 0);
    expect(result.riskUsd).toBe(100);
  });

  it('calculates expected R-multiple accurately (REQ-044)', () => {
    const result = calculatePositionSizing(baseConfig);
    // Reward distance = 2500, Stop distance = 1000 -> R = 2.5
    expect(result.expectedRMultiple).toBe(2.5);
  });

  it('supports percentage risk mode (REQ-040)', () => {
    const pctConfig: SizingConfig = {
      ...baseConfig,
      riskMode: 'PCT',
      riskValue: 1.5, // 1.5% of $10,000 = $150
    };
    const result = calculatePositionSizing(pctConfig);
    expect(result.riskUsd).toBe(150);
  });

  it('recalculates estimated liquidation price live for LONG and SHORT (REQ-041)', () => {
    const longRes = calculatePositionSizing(baseConfig);
    const shortRes = calculatePositionSizing({
      ...baseConfig,
      direction: 'SHORT',
      stopLossPrice: 95000,
      takeProfitPrice: 91500,
    });
    expect(longRes.liquidationPrice).toBeLessThan(baseConfig.entryPrice);
    expect(shortRes.liquidationPrice).toBeGreaterThan(baseConfig.entryPrice);
  });

  it('handles zero or missing prices without divide-by-zero or NaN (REQ-045)', () => {
    const zeroConfig: SizingConfig = {
      ...baseConfig,
      entryPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
    };
    const result = calculatePositionSizing(zeroConfig);
    expect(result.positionSizeBase).toBeDefined();
    expect(Number.isNaN(result.positionSizeBase)).toBe(false);
  });

  it('produces a plain-language summary string (REQ-044)', () => {
    const result = calculatePositionSizing(baseConfig);
    expect(result.summaryText).toContain('Risking');
    expect(result.summaryText).toContain('5x leverage');
  });
});
