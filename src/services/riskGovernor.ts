/**
 * Central Risk Governor — one policy surface for strategy plans and manual orders.
 * It does not replace exchange filters; it runs after local geometry/sizing checks
 * and before any order intent is submitted to an exchange adapter.
 */
import { assertTradePlanSubmittable, type TradePlan } from './tradePlan';
import { canonicalInstrumentId } from './providers/publicExchangeClient';
import type { DataState, TradeDirection } from '../types';
import { academyRiskGate } from '../features/academy/api/strategyIntelligence';
import type { AcademyConsumerIntelligence, AcademyIntelligenceResolution } from '../features/academy/types';

export const RISK_GOVERNOR_POLICY_VERSION = 'risk_governor_v1';

export type RiskGovernorDecision = 'APPROVED' | 'APPROVED_REDUCED' | 'DEFERRED' | 'REJECTED';
export type ExecutionMode = 'MANUAL' | 'AUTOMATED';

export interface RiskKillSwitches {
  allTrading: boolean;
  newEntries: boolean;
  automatedExecution: boolean;
  exchanges: string[];
  symbols: string[];
  strategies: string[];
}

export interface RiskGovernorPolicy {
  maxRiskPerTradePct: number;
  maxTotalOpenRiskPct: number;
  dailyLossLimitPct: number;
  weeklyLossLimitPct: number;
  maxDrawdownPct: number;
  minimumMarginReservePct: number;
  maxSymbolExposurePct: number;
  maxCorrelatedExposurePct: number;
  maxSimultaneousPositions: number;
  maxLeverage: number;
  maxConsecutiveLosses: number;
  maxMarketDataAgeMs: number;
  maxAccountDataAgeMs: number;
  failClosedForAutomation: boolean;
  killSwitches: RiskKillSwitches;
}

export interface RiskOrderIntent {
  symbol: string;
  direction: TradeDirection;
  quantity: number;
  entryPrice: number;
  notionalUsd: number;
  /** USD notional multiplier per quantity unit (for derivatives/contracts). Defaults to 1 for base-asset quantity. */
  contractMultiplier?: number;
  leverage: number;
  reduceOnly: boolean;
  exchange: string;
  strategyId?: string | null;
  strategyVersion?: number | null;
  strategy?: string | null;
}

export interface RiskAccountSnapshot {
  equityUsd: number;
  availableMarginUsd: number;
  timestamp?: number | null;
}

export interface RiskPortfolioSnapshot {
  openPositionCount: number;
  totalOpenRiskUsd?: number | null;
  symbolExposureUsd?: number | null;
  correlatedExposureUsd?: number | null;
  dailyPnlUsd?: number | null;
  weeklyPnlUsd?: number | null;
  drawdownPct?: number | null;
  consecutiveLosses?: number | null;
}

export interface RiskMarketSnapshot {
  dataState: DataState;
  ageMs?: number | null;
  exchangeDegraded?: boolean;
  reconciliationHealthy?: boolean | null;
}

export interface RiskGovernorInput {
  order: RiskOrderIntent;
  account: RiskAccountSnapshot;
  portfolio: RiskPortfolioSnapshot;
  market: RiskMarketSnapshot;
  executionMode: ExecutionMode;
  plan?: TradePlan | null;
  policy?: RiskGovernorPolicy;
  now?: number;
  academyIntelligence?: AcademyConsumerIntelligence | null;
  academyResolution?: AcademyIntelligenceResolution | null;
}

export interface RiskCheckResult {
  code: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN';
  detail: string;
}

export interface RiskGovernorResult {
  policyVersion: typeof RISK_GOVERNOR_POLICY_VERSION;
  decision: RiskGovernorDecision;
  approvedQuantity: number;
  sizeScale: number;
  reasons: string[];
  checks: RiskCheckResult[];
  evaluatedAt: number;
}

const positive = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const bool = (value: string | undefined): boolean => String(value || '').toLowerCase() === 'true';
const csv = (value: string | undefined): string[] => (value || '').split(',').map((item) => item.trim()).filter(Boolean);

export function loadRiskGovernorPolicy(env = process.env): RiskGovernorPolicy {
  return {
    maxRiskPerTradePct: positive(env.APEX_RISK_MAX_PER_TRADE_PCT, 1.0),
    maxTotalOpenRiskPct: positive(env.APEX_RISK_MAX_TOTAL_OPEN_PCT, 5.0),
    dailyLossLimitPct: positive(env.APEX_RISK_DAILY_LOSS_LIMIT_PCT, 3.0),
    weeklyLossLimitPct: positive(env.APEX_RISK_WEEKLY_LOSS_LIMIT_PCT, 7.0),
    maxDrawdownPct: positive(env.APEX_RISK_MAX_DRAWDOWN_PCT, 12.0),
    minimumMarginReservePct: positive(env.APEX_RISK_MIN_MARGIN_RESERVE_PCT, 20.0),
    maxSymbolExposurePct: positive(env.APEX_RISK_MAX_SYMBOL_EXPOSURE_PCT, 25.0),
    maxCorrelatedExposurePct: positive(env.APEX_RISK_MAX_CORRELATED_EXPOSURE_PCT, 40.0),
    maxSimultaneousPositions: Math.max(1, Math.floor(positive(env.APEX_RISK_MAX_POSITIONS, 6))),
    maxLeverage: Math.max(1, Math.floor(positive(env.APEX_RISK_MAX_LEVERAGE, 10))),
    maxConsecutiveLosses: Math.max(1, Math.floor(positive(env.APEX_RISK_MAX_CONSECUTIVE_LOSSES, 4))),
    maxMarketDataAgeMs: positive(env.APEX_RISK_MAX_MARKET_DATA_AGE_MS, 15_000),
    maxAccountDataAgeMs: positive(env.APEX_RISK_MAX_ACCOUNT_DATA_AGE_MS, 20_000),
    failClosedForAutomation: env.APEX_RISK_AUTOMATION_FAIL_CLOSED !== 'false',
    killSwitches: {
      allTrading: bool(env.APEX_KILL_ALL_TRADING),
      newEntries: bool(env.APEX_KILL_NEW_ENTRIES),
      automatedExecution: bool(env.APEX_KILL_AUTOMATED_EXECUTION),
      exchanges: csv(env.APEX_KILL_EXCHANGES).map((item) => item.toLowerCase()),
      symbols: csv(env.APEX_KILL_SYMBOLS).map((item) => item.toUpperCase()),
      strategies: csv(env.APEX_KILL_STRATEGIES),
    },
  };
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function percentOf(amount: number, equity: number): number {
  return finitePositive(equity) ? (amount / equity) * 100 : Infinity;
}

function unknownCritical(input: RiskGovernorInput): boolean {
  const accountAge = input.account.timestamp == null ? null : Math.max(0, (input.now ?? Date.now()) - input.account.timestamp);
  return !finitePositive(input.account.equityUsd)
    || !Number.isFinite(input.account.availableMarginUsd)
    || input.market.dataState === 'unavailable'
    || input.market.exchangeDegraded === true
    || input.market.reconciliationHealthy === false
    || (input.market.ageMs != null && input.market.ageMs > (input.policy ?? loadRiskGovernorPolicy()).maxMarketDataAgeMs)
    || (accountAge != null && accountAge > (input.policy ?? loadRiskGovernorPolicy()).maxAccountDataAgeMs);
}

export function evaluateRiskGovernor(input: RiskGovernorInput): RiskGovernorResult {
  const now = input.now ?? Date.now();
  const policy = input.policy ?? loadRiskGovernorPolicy();
  const checks: RiskCheckResult[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  const add = (code: string, status: RiskCheckResult['status'], detail: string) => {
    checks.push({ code, status, detail });
    if (status === 'FAIL') failures.push(detail);
    if (status === 'WARN' || status === 'UNKNOWN') warnings.push(detail);
  };

  const { order, account, portfolio, market } = input;
  const effectiveStrategyId = order.strategyId ?? input.plan?.strategyId ?? null;
  const effectiveStrategyVersion = order.strategyVersion ?? input.plan?.strategyVersion ?? null;

  const switchHit = policy.killSwitches.allTrading
    || (!order.reduceOnly && policy.killSwitches.newEntries)
    || (input.executionMode === 'AUTOMATED' && policy.killSwitches.automatedExecution)
    || policy.killSwitches.exchanges.includes(order.exchange.toLowerCase())
    || policy.killSwitches.symbols.includes(order.symbol.toUpperCase())
    || Boolean(order.strategy && policy.killSwitches.strategies.includes(order.strategy))
    || Boolean(order.strategyId && policy.killSwitches.strategies.includes(order.strategyId));
  add('KILL_SWITCH', switchHit ? 'FAIL' : 'PASS', switchHit ? 'A configured trading kill switch blocks this order.' : 'No applicable kill switch is active.');

  if (input.plan && order.strategyId && input.plan.strategyId && order.strategyId !== input.plan.strategyId) {
    add('STRATEGY_IDENTITY_MISMATCH', 'FAIL', `Order strategyId '${order.strategyId}' does not match TradePlan strategyId '${input.plan.strategyId}'.`);
  }
  if (input.plan && order.strategyVersion != null && input.plan.strategyVersion != null && order.strategyVersion !== input.plan.strategyVersion) {
    add('STRATEGY_IDENTITY_MISMATCH', 'FAIL', `Order strategyVersion '${order.strategyVersion}' does not match TradePlan strategyVersion '${input.plan.strategyVersion}'.`);
  }

  const intelligenceSource = input.academyResolution ?? input.academyIntelligence ?? input.plan?.academyIntelligence ?? null;
  const academyGate = academyRiskGate(intelligenceSource, order.reduceOnly, {
    executionMode: input.executionMode,
    expectedStrategyId: effectiveStrategyId,
    expectedStrategyVersion: effectiveStrategyVersion,
  });
  if (academyGate) add('ACADEMY_STRATEGY_INTELLIGENCE', academyGate.status, academyGate.detail);

  const contractMultiplier = order.contractMultiplier ?? 1;
  const geometryValid = finitePositive(order.quantity)
    && finitePositive(order.entryPrice)
    && finitePositive(order.notionalUsd)
    && finitePositive(contractMultiplier);
  const impliedNotionalUsd = geometryValid ? order.quantity * contractMultiplier * order.entryPrice : Number.NaN;
  const notionalToleranceUsd = geometryValid ? Math.max(0.02, Math.abs(impliedNotionalUsd) * 0.02) : 0;
  const notionalConsistent = geometryValid
    && Number.isFinite(impliedNotionalUsd)
    && Math.abs(order.notionalUsd - impliedNotionalUsd) <= notionalToleranceUsd;
  if (!geometryValid) {
    add('ORDER_GEOMETRY', 'FAIL', 'Order quantity, reference price, notional, or contract multiplier is invalid.');
  } else if (!notionalConsistent) {
    add('ORDER_GEOMETRY', 'FAIL', `Declared order notional (${order.notionalUsd}) is inconsistent with quantity × multiplier × reference price (${impliedNotionalUsd}).`);
  } else {
    add('ORDER_GEOMETRY', 'PASS', 'Order quantity, reference price, contract multiplier, and notional are internally consistent.');
  }

  if (!finitePositive(order.leverage)) add('LEVERAGE', 'FAIL', 'Order leverage must be a finite positive value.');
  else if (order.leverage > policy.maxLeverage) add('LEVERAGE', 'FAIL', `Leverage ${order.leverage}x exceeds the policy maximum ${policy.maxLeverage}x.`);
  else add('LEVERAGE', 'PASS', `Leverage ${order.leverage}x is within policy.`);

  if (input.plan) {
    const planCheck = assertTradePlanSubmittable(input.plan, now);
    const directionMatches = input.plan.direction === order.direction;
    // H2 fix: compare canonical instrument identities with exact equality (never startsWith),
    // so KuCoin's XBT contract symbol correctly matches a BTC-denominated Trade Plan and
    // similarly-prefixed-but-distinct symbols are never conflated.
    const symbolMatches = canonicalInstrumentId(input.plan.symbol) === canonicalInstrumentId(order.symbol);
    const requestedWithinPlan = order.reduceOnly || order.notionalUsd <= input.plan.sizing.positionSizeUsd * 1.02;
    const entryWithinRange = order.reduceOnly || (order.entryPrice >= input.plan.entryRange[0] && order.entryPrice <= input.plan.entryRange[1]);
    const leverageWithinPlan = order.reduceOnly || order.leverage <= input.plan.leverage;
    const planValid = planCheck.ok && directionMatches && symbolMatches && requestedWithinPlan && entryWithinRange && leverageWithinPlan;
    add('TRADE_PLAN', planValid ? 'PASS' : 'FAIL', planValid
      ? `Trade Plan ${input.plan.id} is valid and matches the order direction and symbol.`
      : [...planCheck.errors, !directionMatches ? 'Trade Plan direction does not match the order.' : '', !symbolMatches ? 'Trade Plan symbol does not match the order.' : '', !requestedWithinPlan ? 'Requested order exceeds the Trade Plan position size.' : '', !entryWithinRange ? 'Order entry is outside the Trade Plan entry range.' : '', !leverageWithinPlan ? 'Order leverage exceeds the Trade Plan leverage.' : ''].filter(Boolean).join(' '));
  } else {
    add('TRADE_PLAN', input.executionMode === 'AUTOMATED' ? 'FAIL' : 'WARN', input.executionMode === 'AUTOMATED'
      ? 'Automated execution requires an approved Trade Plan.'
      : 'Manual order has no attached Trade Plan; only basic risk controls can be applied.');
  }

  const criticalUnknown = unknownCritical({ ...input, policy, now });
  add('DATA_AND_RECONCILIATION', criticalUnknown ? 'UNKNOWN' : 'PASS', criticalUnknown
    ? 'Critical market, account, exchange, or reconciliation data is unavailable, stale, or degraded.'
    : 'Market, account, exchange, and reconciliation state are usable.');

  const planRiskUsd = input.plan && input.plan.entryPrice > 0
    ? order.notionalUsd * (Math.abs(input.plan.entryPrice - input.plan.stopLoss) / input.plan.entryPrice)
    : undefined;
  const riskPct = planRiskUsd == null ? null : percentOf(planRiskUsd, account.equityUsd);
  if (riskPct == null) add('RISK_PER_TRADE', 'UNKNOWN', 'Risk per trade cannot be measured without a Trade Plan risk amount.');
  else if (riskPct > policy.maxRiskPerTradePct) add('RISK_PER_TRADE', 'WARN', `Planned risk ${riskPct.toFixed(2)}% exceeds the ${policy.maxRiskPerTradePct.toFixed(2)}% limit and requires size reduction.`);
  else add('RISK_PER_TRADE', 'PASS', `Planned risk ${riskPct.toFixed(2)}% is within policy.`);

  const totalRiskPct = portfolio.totalOpenRiskUsd == null || planRiskUsd == null
    ? null
    : percentOf(portfolio.totalOpenRiskUsd + (order.reduceOnly ? 0 : planRiskUsd), account.equityUsd);
  if (totalRiskPct == null) add('TOTAL_OPEN_RISK', 'UNKNOWN', 'Total open-position risk is not available.');
  else if (totalRiskPct > policy.maxTotalOpenRiskPct) add('TOTAL_OPEN_RISK', 'WARN', `Total open risk would reach ${totalRiskPct.toFixed(2)}%, above the ${policy.maxTotalOpenRiskPct.toFixed(2)}% limit.`);
  else add('TOTAL_OPEN_RISK', 'PASS', `Total open risk ${totalRiskPct.toFixed(2)}% is within policy.`);

  const lossChecks: Array<[string, number | null | undefined, number]> = [
    ['DAILY_LOSS', portfolio.dailyPnlUsd, policy.dailyLossLimitPct],
    ['WEEKLY_LOSS', portfolio.weeklyPnlUsd, policy.weeklyLossLimitPct],
  ];
  for (const [code, pnl, limit] of lossChecks) {
    if (pnl == null || !finitePositive(account.equityUsd)) add(code, 'UNKNOWN', `${code.toLowerCase().replace('_', ' ')} is not available.`);
    else {
      const lossPct = pnl < 0 ? Math.abs(pnl) / account.equityUsd * 100 : 0;
      add(code, lossPct >= limit ? 'FAIL' : 'PASS', lossPct >= limit
        ? `${code.toLowerCase().replace('_', ' ')} ${lossPct.toFixed(2)}% reached the ${limit.toFixed(2)}% limit.`
        : `${code.toLowerCase().replace('_', ' ')} ${lossPct.toFixed(2)}% is within policy.`);
    }
  }

  if (portfolio.drawdownPct == null) add('DRAWDOWN', 'UNKNOWN', 'Account drawdown is not available.');
  else add('DRAWDOWN', portfolio.drawdownPct >= policy.maxDrawdownPct ? 'FAIL' : 'PASS', portfolio.drawdownPct >= policy.maxDrawdownPct
    ? `Drawdown ${portfolio.drawdownPct.toFixed(2)}% reached the ${policy.maxDrawdownPct.toFixed(2)}% limit.`
    : `Drawdown ${portfolio.drawdownPct.toFixed(2)}% is within policy.`);

  if (portfolio.consecutiveLosses == null) add('CONSECUTIVE_LOSSES', 'UNKNOWN', 'Consecutive-loss count is not available.');
  else add('CONSECUTIVE_LOSSES', portfolio.consecutiveLosses >= policy.maxConsecutiveLosses ? 'FAIL' : 'PASS', portfolio.consecutiveLosses >= policy.maxConsecutiveLosses
    ? `${portfolio.consecutiveLosses} consecutive losses reached the policy limit.`
    : `${portfolio.consecutiveLosses} consecutive losses is below the policy limit.`);

  if (!order.reduceOnly && portfolio.openPositionCount >= policy.maxSimultaneousPositions) add('POSITION_COUNT', 'FAIL', `Maximum simultaneous positions (${policy.maxSimultaneousPositions}) has been reached.`);
  else add('POSITION_COUNT', 'PASS', 'Simultaneous-position count is within policy.');

  const marginNeeded = order.notionalUsd / Math.max(1, order.leverage);
  const reserveUsd = account.equityUsd * (policy.minimumMarginReservePct / 100);
  if (!order.reduceOnly && account.availableMarginUsd - marginNeeded < reserveUsd) add('MARGIN_RESERVE', 'WARN', `Order would reduce available margin below the ${policy.minimumMarginReservePct.toFixed(0)}% reserve.`);
  else add('MARGIN_RESERVE', 'PASS', 'Available-margin reserve remains within policy.');

  const symbolExposurePct = portfolio.symbolExposureUsd == null ? null : percentOf(portfolio.symbolExposureUsd + (order.reduceOnly ? 0 : order.notionalUsd), account.equityUsd);
  if (symbolExposurePct == null) add('SYMBOL_CONCENTRATION', 'UNKNOWN', 'Current symbol exposure is not available.');
  else add('SYMBOL_CONCENTRATION', symbolExposurePct > policy.maxSymbolExposurePct ? 'WARN' : 'PASS', symbolExposurePct > policy.maxSymbolExposurePct
    ? `Symbol exposure would reach ${symbolExposurePct.toFixed(2)}%, above the ${policy.maxSymbolExposurePct.toFixed(2)}% limit.`
    : `Symbol exposure ${symbolExposurePct.toFixed(2)}% is within policy.`);

  const correlatedExposurePct = portfolio.correlatedExposureUsd == null ? null : percentOf(portfolio.correlatedExposureUsd + (order.reduceOnly ? 0 : order.notionalUsd), account.equityUsd);
  if (correlatedExposurePct == null) add('CORRELATED_EXPOSURE', 'UNKNOWN', 'Correlated exposure is not available.');
  else add('CORRELATED_EXPOSURE', correlatedExposurePct > policy.maxCorrelatedExposurePct ? 'WARN' : 'PASS', correlatedExposurePct > policy.maxCorrelatedExposurePct
    ? `Correlated exposure would reach ${correlatedExposurePct.toFixed(2)}%, above the ${policy.maxCorrelatedExposurePct.toFixed(2)}% limit.`
    : `Correlated exposure ${correlatedExposurePct.toFixed(2)}% is within policy.`);

  if (failures.length) {
    return { policyVersion: RISK_GOVERNOR_POLICY_VERSION, decision: 'REJECTED', approvedQuantity: 0, sizeScale: 0, reasons: failures, checks, evaluatedAt: now };
  }

  // Critical unknown state must never authorize a NEW ENTRY, including the
  // APPROVED_REDUCED branch below. Reduce-only orders keep their existing risk-
  // reducing semantics; all new entries defer with zero approved quantity.
  if (criticalUnknown && !order.reduceOnly) {
    return { policyVersion: RISK_GOVERNOR_POLICY_VERSION, decision: 'DEFERRED', approvedQuantity: 0, sizeScale: 0, reasons: warnings, checks, evaluatedAt: now };
  }
  if (criticalUnknown && input.executionMode === 'AUTOMATED' && policy.failClosedForAutomation) {
    return { policyVersion: RISK_GOVERNOR_POLICY_VERSION, decision: 'DEFERRED', approvedQuantity: 0, sizeScale: 0, reasons: warnings, checks, evaluatedAt: now };
  }

  let scale = 1;
  if (riskPct != null && riskPct > policy.maxRiskPerTradePct) scale = Math.min(scale, policy.maxRiskPerTradePct / riskPct);
  if (totalRiskPct != null && totalRiskPct > policy.maxTotalOpenRiskPct && planRiskUsd && finitePositive(account.equityUsd)) {
    const remainingRiskUsd = Math.max(0, account.equityUsd * policy.maxTotalOpenRiskPct / 100 - (portfolio.totalOpenRiskUsd || 0));
    scale = Math.min(scale, remainingRiskUsd / planRiskUsd);
  }
  if (!order.reduceOnly && account.availableMarginUsd > reserveUsd && marginNeeded > 0) {
    scale = Math.min(scale, Math.max(0, (account.availableMarginUsd - reserveUsd) / marginNeeded));
  }
  if (symbolExposurePct != null && symbolExposurePct > policy.maxSymbolExposurePct) {
    const remaining = Math.max(0, account.equityUsd * policy.maxSymbolExposurePct / 100 - (portfolio.symbolExposureUsd || 0));
    scale = Math.min(scale, remaining / order.notionalUsd);
  }
  if (correlatedExposurePct != null && correlatedExposurePct > policy.maxCorrelatedExposurePct) {
    const remaining = Math.max(0, account.equityUsd * policy.maxCorrelatedExposurePct / 100 - (portfolio.correlatedExposureUsd || 0));
    scale = Math.min(scale, remaining / order.notionalUsd);
  }
  scale = Math.max(0, Math.min(1, scale));

  if (scale < 0.1) {
    return { policyVersion: RISK_GOVERNOR_POLICY_VERSION, decision: 'REJECTED', approvedQuantity: 0, sizeScale: scale, reasons: [...warnings, 'Risk-compliant quantity would be below 10% of the requested size.'], checks, evaluatedAt: now };
  }

  if (scale < 0.999) {
    return {
      policyVersion: RISK_GOVERNOR_POLICY_VERSION,
      decision: 'APPROVED_REDUCED',
      approvedQuantity: Number((order.quantity * scale).toPrecision(12)),
      sizeScale: scale,
      reasons: warnings,
      checks,
      evaluatedAt: now,
    };
  }

  return {
    policyVersion: RISK_GOVERNOR_POLICY_VERSION,
    decision: criticalUnknown ? 'DEFERRED' : 'APPROVED',
    approvedQuantity: criticalUnknown ? 0 : order.quantity,
    sizeScale: criticalUnknown ? 0 : 1,
    reasons: warnings,
    checks,
    evaluatedAt: now,
  };
}
