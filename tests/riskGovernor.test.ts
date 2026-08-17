import { describe, expect, it } from 'vitest';
import { buildTradePlan } from '../src/services/tradePlan';
import { evaluateRiskGovernor, loadRiskGovernorPolicy } from '../src/services/riskGovernor';
import type { DerivedLevels } from '../src/types';

const levels: DerivedLevels = {
  symbol: 'BTC-USDT',
  entry: 100,
  resistances: [110, 115, 120],
  supports: [95, 92, 90],
  method: 'ATR_BANDS',
  atr14: 5,
  confidenceScore: 80,
  evidenceList: [],
  riskReward: { nearestTarget: 110, nearestStop: 95, rMultiple: 2, riskPct: 5 },
  dataState: 'live',
};

function validPlan() {
  return buildTradePlan({
    symbol: 'BTC-USDT',
    direction: 'LONG',
    levels,
    sizing: {
      accountBalanceUsd: 10_000,
      riskMode: 'PCT',
      riskValue: 1,
      leverage: 2,
      entryPrice: 100,
      stopLossPrice: 95,
      takeProfitPrice: 110,
      direction: 'LONG',
      successProbModel: 65,
      successProbUserOverride: null,
    },
    spread: 0.02,
    spreadState: 'VALID',
    fundingRate: 0.0001,
    fundingState: 'VALID',
    now: 1_000,
    ttlMs: 60_000,
  });
}

describe('Risk Governor', () => {
  it('approves a complete, risk-compliant plan', () => {
    const plan = validPlan();
    expect(plan.valid).toBe(true);
    const result = evaluateRiskGovernor({
      order: {
        symbol: plan.symbol,
        direction: plan.direction,
        quantity: plan.quantity,
        entryPrice: plan.entryPrice,
        notionalUsd: plan.sizing.positionSizeUsd,
        leverage: plan.leverage,
        reduceOnly: false,
        exchange: 'paper',
        strategy: 'test',
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
      portfolio: {
        openPositionCount: 0,
        totalOpenRiskUsd: 0,
        symbolExposureUsd: 0,
        correlatedExposureUsd: 0,
        dailyPnlUsd: 0,
        weeklyPnlUsd: 0,
        drawdownPct: 0,
        consecutiveLosses: 0,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      policy: loadRiskGovernorPolicy({}),
      now: 1_000,
    });
    expect(['APPROVED', 'APPROVED_REDUCED']).toContain(result.decision);
    expect(result.approvedQuantity).toBeGreaterThan(0);
  });

  it('fails closed for automated execution without a Trade Plan', () => {
    const result = evaluateRiskGovernor({
      order: { symbol: 'BTC-USDT', direction: 'LONG', quantity: 1, entryPrice: 100, notionalUsd: 100, leverage: 1, reduceOnly: false, exchange: 'paper' },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
      portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      policy: loadRiskGovernorPolicy({}),
      now: 1_000,
    });
    expect(result.decision).toBe('REJECTED');
    expect(result.checks.find((check) => check.code === 'TRADE_PLAN')?.status).toBe('FAIL');
  });

  // H2 regression coverage: the Trade Plan/order symbol check must use exact canonical
  // instrument identity, not prefix matching, or a legitimate BTC plan can be rejected
  // against KuCoin's XBT contract symbol (or a distinct-but-similarly-prefixed symbol
  // can be incorrectly accepted).
  it('matches a KuCoin XBT futures contract symbol against a BTC-USDT Trade Plan', () => {
    const plan = validPlan();
    const result = evaluateRiskGovernor({
      order: {
        symbol: 'XBTUSDTM',
        direction: plan.direction,
        quantity: plan.quantity,
        entryPrice: plan.entryPrice,
        notionalUsd: plan.sizing.positionSizeUsd,
        leverage: plan.leverage,
        reduceOnly: false,
        exchange: 'kucoin',
        strategy: 'test',
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
      portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      policy: loadRiskGovernorPolicy({}),
      now: 1_000,
    });
    expect(result.checks.find((check) => check.code === 'TRADE_PLAN')?.status).toBe('PASS');
  });

  it('rejects an order symbol that only shares a prefix with the Trade Plan symbol', () => {
    const plan = validPlan(); // BTC-USDT
    const result = evaluateRiskGovernor({
      order: {
        symbol: 'BTCUP-USDT', // shares the "BTC" prefix but is a distinct leveraged-token instrument
        direction: plan.direction,
        quantity: plan.quantity,
        entryPrice: plan.entryPrice,
        notionalUsd: plan.sizing.positionSizeUsd,
        leverage: plan.leverage,
        reduceOnly: false,
        exchange: 'kucoin',
        strategy: 'test',
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
      portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      policy: loadRiskGovernorPolicy({}),
      now: 1_000,
    });
    expect(result.checks.find((check) => check.code === 'TRADE_PLAN')?.status).toBe('FAIL');
  });

  it('rejects a quantity/notional mismatch that could understate execution exposure', () => {
    const plan = validPlan();
    const result = evaluateRiskGovernor({
      order: {
        symbol: plan.symbol,
        direction: plan.direction,
        quantity: plan.quantity * 1000,
        entryPrice: plan.entryPrice,
        notionalUsd: plan.sizing.positionSizeUsd,
        leverage: plan.leverage,
        reduceOnly: false,
        exchange: 'paper',
        strategy: 'adversarial-test',
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
      portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      policy: loadRiskGovernorPolicy({}),
      now: 1_000,
    });
    expect(result.decision).toBe('REJECTED');
    expect(result.checks.find((check) => check.code === 'ORDER_GEOMETRY')?.status).toBe('FAIL');
  });

  it('supports derivative contract quantities when an explicit multiplier makes notional consistent', () => {
    const plan = validPlan();
    const contractMultiplier = 0.1;
    const contractQuantity = plan.quantity / contractMultiplier;
    const result = evaluateRiskGovernor({
      order: {
        symbol: 'XBTUSDTM',
        direction: plan.direction,
        quantity: contractQuantity,
        entryPrice: plan.entryPrice,
        notionalUsd: plan.sizing.positionSizeUsd,
        contractMultiplier,
        leverage: plan.leverage,
        reduceOnly: false,
        exchange: 'kucoin',
        strategy: 'contract-unit-test',
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
      portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      policy: loadRiskGovernorPolicy({}),
      now: 1_000,
    });
    expect(result.checks.find((check) => check.code === 'ORDER_GEOMETRY')?.status).toBe('PASS');
    expect(['APPROVED', 'APPROVED_REDUCED']).toContain(result.decision);
  });

  it('rejects zero, negative, and non-finite leverage before execution', () => {
    const plan = validPlan();
    for (const leverage of [0, -1, Number.NaN]) {
      const result = evaluateRiskGovernor({
        order: {
          symbol: plan.symbol,
          direction: plan.direction,
          quantity: plan.quantity,
          entryPrice: plan.entryPrice,
          notionalUsd: plan.sizing.positionSizeUsd,
          leverage,
          reduceOnly: false,
          exchange: 'paper',
          strategy: 'invalid-leverage-test',
        },
        account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
        portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
        market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
        executionMode: 'AUTOMATED',
        plan,
        policy: loadRiskGovernorPolicy({}),
        now: 1_000,
      });
      expect(result.decision).toBe('REJECTED');
      expect(result.checks.find((check) => check.code === 'LEVERAGE')?.status).toBe('FAIL');
    }
  });

});
