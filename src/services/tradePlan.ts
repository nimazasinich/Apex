/**
 * Shared Trade Plan layer — wraps existing levels and sizing logic with validation.
 * Same object can be displayed in the order ticket, passed to risk validation, and execution.
 */
import { calculatePositionSizing } from '../lib/sizing';
import type {
  CandidateScore,
  DerivedLevels,
  SizingConfig,
  SizingResult,
  TradeDirection,
} from '../types';
import { academyTradePlanErrors } from '../features/academy/api/strategyIntelligence';
import type { AcademyConsumerIntelligence } from '../features/academy/types';

export const TRADE_PLAN_VERSION = 'trade_plan_v1';
const DEFAULT_TAKER_FEE_RATE = 0.0006;
const DEFAULT_PLAN_TTL_MS = 90_000;

export interface TradePlanInput {
  symbol: string;
  direction: TradeDirection;
  levels: DerivedLevels;
  sizing: SizingConfig;
  strategyId?: string | null;
  strategyVersion?: number | null;
  recordId?: string | null;
  decisionRef?: {
    score?: number;
    readinessTier?: CandidateScore['readinessTier'];
    engineVersion?: string;
    createdAt?: number;
  };
  spread?: number | null;
  spreadState?: 'VALID' | 'ESTIMATED' | 'MISSING' | 'STALE';
  fundingRate?: number | null;
  fundingState?: 'VALID' | 'ESTIMATED' | 'MISSING' | 'STALE';
  feeRate?: number;
  holdHours?: number;
  now?: number;
  ttlMs?: number;
  academyIntelligence?: AcademyConsumerIntelligence | null;
}

export interface TradePlan {
  version: typeof TRADE_PLAN_VERSION;
  id: string;
  symbol: string;
  direction: TradeDirection;
  strategyId: string | null;
  strategyVersion: number | null;
  recordId: string | null;
  decisionRef: TradePlanInput['decisionRef'];
  entryType: 'MARKET' | 'LIMIT';
  entryPrice: number;
  entryRange: [number, number];
  stopLoss: number;
  takeProfitTargets: [number, number, number];
  quantity: number;
  leverage: number;
  riskAmountUsd: number;
  expectedFeesUsd: number;
  expectedFundingUsd: number;
  expectedSpreadUsd: number;
  expectedSlippageUsd: number;
  expectedMarketImpactUsd: number;
  expectedNetEdgeUsd: number;
  costQuality: { spread: 'VALID' | 'ESTIMATED' | 'MISSING' | 'STALE'; funding: 'VALID' | 'ESTIMATED' | 'MISSING' | 'STALE' };
  netRiskReward: number;
  grossRiskReward: number;
  expiresAt: number;
  createdAt: number;
  validationErrors: string[];
  valid: boolean;
  sizing: SizingResult;
  academyIntelligence?: AcademyConsumerIntelligence;
}

function directionalPrices(direction: TradeDirection, levels: DerivedLevels) {
  if (direction === 'LONG') {
    return {
      stop: levels.supports[0],
      targets: levels.resistances,
    };
  }
  return {
    stop: levels.resistances[0],
    targets: levels.supports,
  };
}

function estimateCosts(args: {
  entry: number;
  quantity: number;
  spread: number | null | undefined;
  fundingRate: number | null | undefined;
  feeRate: number;
  holdHours: number;
  spreadState: 'VALID' | 'ESTIMATED' | 'MISSING' | 'STALE';
  fundingState: 'VALID' | 'ESTIMATED' | 'MISSING' | 'STALE';
}) {
  const notional = Math.abs(args.entry * args.quantity);
  const expectedFeesUsd = notional * args.feeRate * 2;
  const hasSpread = args.spread != null && Number.isFinite(args.spread) && args.spread >= 0;
  const spreadUsd = hasSpread ? Number(args.spread) * args.quantity : 0;
  const expectedSlippageUsd = hasSpread ? spreadUsd * 0.5 : 0;
  const expectedMarketImpactUsd = hasSpread ? Math.max(spreadUsd * 0.25, notional * 0.00005) : 0;
  const hasFunding = args.fundingRate != null && Number.isFinite(args.fundingRate);
  const expectedFundingUsd = hasFunding
    ? Math.abs(Number(args.fundingRate)) * notional * (args.holdHours / 8)
    : 0;
  return {
    expectedFeesUsd: Number(expectedFeesUsd.toFixed(4)),
    expectedSpreadUsd: Number(spreadUsd.toFixed(4)),
    expectedSlippageUsd: Number(expectedSlippageUsd.toFixed(4)),
    expectedFundingUsd: Number(expectedFundingUsd.toFixed(4)),
    expectedMarketImpactUsd: Number(expectedMarketImpactUsd.toFixed(4)),
    costQuality: {
      spread: hasSpread ? args.spreadState : 'MISSING',
      funding: hasFunding ? args.fundingState : 'MISSING',
    },
  };
}

export function validateTradePlanGeometry(
  direction: TradeDirection,
  entry: number,
  stop: number,
  targets: [number, number, number],
): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(entry) || entry <= 0) errors.push('Entry price is unavailable or invalid.');
  if (!Number.isFinite(stop) || stop <= 0) errors.push('Stop loss is unavailable or invalid.');
  if (direction === 'LONG') {
    if (stop >= entry) errors.push('LONG stop must be below entry.');
    if (targets.some((t) => t <= entry)) errors.push('LONG targets must be above entry.');
  } else {
    if (stop <= entry) errors.push('SHORT stop must be above entry.');
    if (targets.some((t) => t >= entry)) errors.push('SHORT targets must be below entry.');
  }
  return errors;
}

export function buildTradePlan(input: TradePlanInput): TradePlan {
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_PLAN_TTL_MS;
  const { stop, targets } = directionalPrices(input.direction, input.levels);
  const entry = input.sizing.entryPrice || input.levels.entry;
  const sizingConfig: SizingConfig = {
    ...input.sizing,
    entryPrice: entry,
    stopLossPrice: input.sizing.stopLossPrice || stop,
    takeProfitPrice: input.sizing.takeProfitPrice || targets[0],
    direction: input.direction,
  };
  const sizing = calculatePositionSizing(sizingConfig);
  const geometryErrors = validateTradePlanGeometry(
    input.direction,
    entry,
    sizingConfig.stopLossPrice,
    targets,
  );
  const validationErrors = [...geometryErrors];
  if (sizing.positionSizeBase <= 0) validationErrors.push('Position size must be greater than zero.');
  if (sizing.riskUsd <= 0) validationErrors.push('Risk amount must be greater than zero.');

  const stopDistance = Math.abs(entry - sizingConfig.stopLossPrice);
  const rewardDistance = Math.abs(targets[0] - entry);
  const grossRiskReward = stopDistance > 0 ? Number((rewardDistance / stopDistance).toFixed(3)) : 0;

  const costs = estimateCosts({
    entry,
    quantity: sizing.positionSizeBase,
    spread: input.spread,
    fundingRate: input.fundingRate,
    feeRate: input.feeRate ?? DEFAULT_TAKER_FEE_RATE,
    holdHours: input.holdHours ?? 8,
    spreadState: input.spreadState ?? (input.spread == null ? 'MISSING' : 'VALID'),
    fundingState: input.fundingState ?? (input.fundingRate == null ? 'MISSING' : 'VALID'),
  });
  if (costs.costQuality.spread === 'MISSING' || costs.costQuality.spread === 'STALE') {
    validationErrors.push('Spread is unavailable or stale; net edge cannot be validated.');
  }
  if (costs.costQuality.funding === 'MISSING' || costs.costQuality.funding === 'STALE') {
    validationErrors.push('Funding is unavailable or stale; net edge cannot be validated.');
  }
  const totalCosts = costs.expectedFeesUsd + costs.expectedSpreadUsd + costs.expectedSlippageUsd + costs.expectedFundingUsd + costs.expectedMarketImpactUsd;
  const grossRewardUsd = sizing.positionSizeBase * rewardDistance;
  const grossRiskUsd = sizing.positionSizeBase * stopDistance;
  const expectedNetEdgeUsd = Number((grossRewardUsd - totalCosts).toFixed(4));
  const netRiskReward = grossRiskUsd > 0
    ? Number((expectedNetEdgeUsd / (grossRiskUsd + totalCosts)).toFixed(3))
    : 0;

  if (netRiskReward < 1 && validationErrors.length === 0) {
    validationErrors.push('Expected net risk/reward falls below 1:1 after estimated transaction costs.');
  }

  const atr = input.levels.atr14 || entry * 0.01;
  const entryRange: [number, number] = input.direction === 'LONG'
    ? [Number((entry - atr * 0.15).toFixed(6)), Number((entry + atr * 0.05).toFixed(6))]
    : [Number((entry - atr * 0.05).toFixed(6)), Number((entry + atr * 0.15).toFixed(6))];

  const explicitStrategyId = input.strategyId ?? input.academyIntelligence?.strategyId ?? null;
  const explicitStrategyVersion = input.strategyVersion ?? input.academyIntelligence?.strategyVersion ?? null;
  const explicitRecordId = input.recordId ?? (explicitStrategyId && explicitStrategyVersion != null ? `${explicitStrategyId}@${explicitStrategyVersion}` : explicitStrategyId);

  if (input.strategyId && input.academyIntelligence && input.strategyId !== input.academyIntelligence.strategyId) {
    validationErrors.push(`TradePlan strategy identity (${input.strategyId}) does not match Academy intelligence (${input.academyIntelligence.strategyId}).`);
  }
  if (input.strategyVersion != null && input.academyIntelligence && input.strategyVersion !== input.academyIntelligence.strategyVersion) {
    validationErrors.push(`TradePlan strategy version (${input.strategyVersion}) does not match Academy intelligence (${input.academyIntelligence.strategyVersion}).`);
  }

  const academyErrors = academyTradePlanErrors(input.academyIntelligence, { isStrategySpecific: Boolean(explicitStrategyId) });
  validationErrors.push(...academyErrors);

  return {
    version: TRADE_PLAN_VERSION,
    id: `${input.symbol}-${input.direction}-${now}`,
    symbol: input.symbol,
    direction: input.direction,
    strategyId: explicitStrategyId,
    strategyVersion: explicitStrategyVersion,
    recordId: explicitRecordId,
    decisionRef: input.decisionRef,
    entryType: 'LIMIT',
    entryPrice: entry,
    entryRange,
    stopLoss: sizingConfig.stopLossPrice,
    takeProfitTargets: targets,
    quantity: sizing.positionSizeBase,
    leverage: input.sizing.leverage,
    riskAmountUsd: sizing.riskUsd,
    ...costs,
    expectedNetEdgeUsd,
    netRiskReward,
    grossRiskReward,
    expiresAt: now + ttlMs,
    createdAt: now,
    validationErrors,
    valid: validationErrors.length === 0,
    sizing,
    academyIntelligence: input.academyIntelligence ?? undefined,
  };
}

export function isTradePlanExpired(plan: TradePlan, now = Date.now()): boolean {
  return now >= plan.expiresAt;
}

export function validateTradePlanIntegrity(plan: TradePlan): string[] {
  const errors: string[] = [];
  if (plan.version !== TRADE_PLAN_VERSION) errors.push('Unsupported Trade Plan version.');
  if (!plan.id || !plan.symbol) errors.push('Trade Plan identity is incomplete.');
  if (plan.direction !== 'LONG' && plan.direction !== 'SHORT') errors.push('Trade Plan direction is invalid.');
  errors.push(...validateTradePlanGeometry(plan.direction, plan.entryPrice, plan.stopLoss, plan.takeProfitTargets));
  if (!Number.isFinite(plan.quantity) || plan.quantity <= 0) errors.push('Trade Plan quantity is invalid.');
  if (!Number.isFinite(plan.leverage) || plan.leverage < 1) errors.push('Trade Plan leverage is invalid.');
  if (!Number.isFinite(plan.riskAmountUsd) || plan.riskAmountUsd <= 0) errors.push('Trade Plan risk amount is invalid.');
  if (!Number.isFinite(plan.sizing.positionSizeBase) || Math.abs(plan.sizing.positionSizeBase - plan.quantity) > Math.max(1e-8, Math.abs(plan.quantity) * 0.02)) errors.push('Trade Plan base-quantity fields are inconsistent.');
  const recomputedPositionUsd = plan.quantity * plan.entryPrice;
  if (!Number.isFinite(plan.sizing.positionSizeUsd) || Math.abs(plan.sizing.positionSizeUsd - recomputedPositionUsd) > Math.max(0.01, recomputedPositionUsd * 0.02)) errors.push('Trade Plan position-size fields are inconsistent.');
  const recomputedRiskUsd = plan.quantity * Math.abs(plan.entryPrice - plan.stopLoss);
  if (Math.abs(plan.riskAmountUsd - recomputedRiskUsd) > Math.max(0.01, recomputedRiskUsd * 0.05)) errors.push('Trade Plan risk fields are inconsistent.');
  if (!Number.isFinite(plan.expectedNetEdgeUsd) || plan.expectedNetEdgeUsd <= 0) errors.push('Trade Plan expected net edge is not positive.');
  if (!Number.isFinite(plan.netRiskReward) || plan.netRiskReward < 1) errors.push('Trade Plan net risk/reward is below 1:1.');
  if (!Array.isArray(plan.entryRange) || plan.entryRange.length !== 2 || plan.entryRange[0] > plan.entryRange[1]) errors.push('Trade Plan entry range is invalid.');
  if (plan.costQuality.spread === 'MISSING' || plan.costQuality.spread === 'STALE') errors.push('Trade Plan spread evidence is unavailable or stale.');
  if (plan.costQuality.funding === 'MISSING' || plan.costQuality.funding === 'STALE') errors.push('Trade Plan funding evidence is unavailable or stale.');
  return [...new Set(errors)];
}

export function assertTradePlanSubmittable(plan: TradePlan, now = Date.now()): { ok: boolean; errors: string[] } {
  const errors = [...plan.validationErrors, ...validateTradePlanIntegrity(plan)];
  if (isTradePlanExpired(plan, now)) errors.push('Trade plan has expired.');
  const uniqueErrors = [...new Set(errors)];
  return { ok: uniqueErrors.length === 0, errors: uniqueErrors };
}
