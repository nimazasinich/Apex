import { describe, expect, it } from 'vitest';
import { assertTradePlanSubmittable, buildTradePlan, validateTradePlanGeometry } from '../services/tradePlan';
import type { DerivedLevels } from '../types';

const levels: DerivedLevels = {
  symbol: 'BTC-USDT',
  entry: 100,
  resistances: [105, 110, 115],
  supports: [95, 90, 85],
  method: 'ATR_BANDS',
  atr14: 2,
  confidenceScore: 75,
  evidenceList: [],
  riskReward: { nearestTarget: 105, nearestStop: 95, rMultiple: 1.5, riskPct: 5 },
  dataState: 'live',
};

describe('tradePlan', () => {
  it('validates LONG geometry', () => {
    const errors = validateTradePlanGeometry('LONG', 100, 95, [105, 110, 115]);
    expect(errors).toHaveLength(0);
  });

  it('rejects LONG stop above entry', () => {
    const errors = validateTradePlanGeometry('LONG', 100, 101, [105, 110, 115]);
    expect(errors.some((e) => e.includes('below entry'))).toBe(true);
  });


  it('validates SHORT geometry and rejects a stop below entry', () => {
    expect(validateTradePlanGeometry('SHORT', 100, 105, [95, 90, 85])).toHaveLength(0);
    expect(validateTradePlanGeometry('SHORT', 100, 99, [95, 90, 85]).some((error) => error.includes('above entry'))).toBe(true);
  });

  it('builds a valid LONG trade plan with sizing', () => {
    const plan = buildTradePlan({
      symbol: 'BTC-USDT',
      direction: 'LONG',
      levels,
      sizing: {
        accountBalanceUsd: 10000,
        riskMode: 'PCT',
        riskValue: 1,
        leverage: 5,
        entryPrice: 100,
        stopLossPrice: 95,
        takeProfitPrice: 110,
        direction: 'LONG',
        successProbModel: 70,
        successProbUserOverride: null,
      },
      spread: 0.05,
      fundingRate: 0.0001,
    });
    expect(plan.quantity).toBeGreaterThan(0);
    expect(plan.stopLoss).toBeLessThan(plan.entryPrice);
    expect(plan.takeProfitTargets[0]).toBeGreaterThan(plan.entryPrice);
    expect(plan.expectedFeesUsd).toBeGreaterThan(0);
    expect(assertTradePlanSubmittable(plan).ok).toBe(plan.valid);
  });

  it('rejects a Trade Plan whose base-quantity fields disagree', () => {
    const plan = buildTradePlan({
      symbol: 'BTC-USDT', direction: 'LONG', levels,
      sizing: {
        accountBalanceUsd: 10000, riskMode: 'PCT', riskValue: 1, leverage: 2,
        entryPrice: 100, stopLossPrice: 95, takeProfitPrice: 110, direction: 'LONG',
        successProbModel: 70, successProbUserOverride: null,
      },
      spread: 0.05, spreadState: 'VALID', fundingRate: 0.0001, fundingState: 'VALID',
    });
    const corrupted = { ...plan, sizing: { ...plan.sizing, positionSizeBase: plan.quantity * 10 } };
    const check = assertTradePlanSubmittable(corrupted);
    expect(check.ok).toBe(false);
    expect(check.errors.some((error) => error.includes('base-quantity'))).toBe(true);
  });

});
