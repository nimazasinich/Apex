import { createHash } from 'node:crypto';
import type { PaperTradeBudgetPlan } from '../multiAgentResearchCouncil';
import { fingerprintPaperTradePlans } from '../paperTradePlanIntegrity';

export interface PaperTradeEntryStopInput {
  id: string;
  entryPrice: number;
  stopPrice: number;
}

export interface PaperSizedPositionIntent {
  id: string;
  strategyId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopPrice: number;
  riskPerUnit: number;
  quantity: number;
  notionalUsedUsd: number;
  maxLossUsedUsd: number;
  notionalBudgetUsd: number;
  maxLossBudgetUsd: number;
  limitingConstraint: 'NOTIONAL' | 'RISK';
  reduceOnlyProtectionRequired: true;
  requiresRiskGovernorApproval: true;
  requiresManualConfirmation: true;
  orderSubmissionAllowed: false;
}

export interface PaperMultiTradeSizingReport {
  version: 'paper_multi_trade_sizer_v2';
  sourceCouncilFingerprint: string;
  sourcePlanFingerprint: string;
  positions: PaperSizedPositionIntent[];
  rejected: Array<{ id: string; reason: string }>;
  totals: { positions: number; notionalUsedUsd: number; maxLossUsedUsd: number };
  safety: {
    paperOnly: true;
    executionAuthorized: false;
    automaticOrderSubmission: false;
    autonomousLiveExecutionEnabled: false;
    exchangeClientDependency: false;
    requiresRiskGovernorApproval: true;
    requiresManualConfirmation: true;
  };
  deterministicFingerprint: string;
}

function positive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function round(value: number, decimals = 8): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sizePaperMultiTradePositions(input: {
  sourceCouncilFingerprint: string;
  sourcePlanFingerprint: string;
  plans: readonly PaperTradeBudgetPlan[];
  entries: readonly PaperTradeEntryStopInput[];
}): PaperMultiTradeSizingReport {
  if (!/^[a-f0-9]{64}$/i.test(input.sourceCouncilFingerprint)) throw new Error('paper_multi_trade_source_fingerprint_required');
  if (!/^[a-f0-9]{64}$/i.test(input.sourcePlanFingerprint)) throw new Error('paper_multi_trade_plan_fingerprint_required');
  if (input.plans.length < 1 || input.plans.length > 10 || input.entries.length > 10) throw new Error('paper_multi_trade_slot_limit_exceeded');
  const actualPlanFingerprint = fingerprintPaperTradePlans(input.plans);
  if (actualPlanFingerprint !== input.sourcePlanFingerprint) throw new Error('paper_multi_trade_plan_fingerprint_mismatch');

  const entryById = new Map(input.entries.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const positions: PaperSizedPositionIntent[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];

  for (const plan of input.plans) {
    if (!plan.id || seen.has(plan.id)) {
      rejected.push({ id: plan.id || 'unknown', reason: 'duplicate_or_missing_plan_id' });
      continue;
    }
    seen.add(plan.id);
    if (plan.orderSubmissionAllowed !== false || plan.requiresManualConfirmation !== true) {
      rejected.push({ id: plan.id, reason: 'unsafe_source_plan_contract' });
      continue;
    }
    const row = entryById.get(plan.id);
    if (!row) {
      rejected.push({ id: plan.id, reason: 'entry_stop_required' });
      continue;
    }
    const entryPrice = positive(row.entryPrice);
    const stopPrice = positive(row.stopPrice);
    const notionalBudgetUsd = positive(plan.notionalBudgetUsd);
    const maxLossBudgetUsd = positive(plan.maxLossBudgetUsd);
    if (entryPrice === null || stopPrice === null || notionalBudgetUsd === null || maxLossBudgetUsd === null) {
      rejected.push({ id: plan.id, reason: 'non_positive_price_or_budget' });
      continue;
    }
    if ((plan.direction === 'LONG' && stopPrice >= entryPrice) || (plan.direction === 'SHORT' && stopPrice <= entryPrice)) {
      rejected.push({ id: plan.id, reason: 'stop_not_on_loss_side' });
      continue;
    }
    const riskPerUnit = Math.abs(entryPrice - stopPrice);
    const qtyByNotional = notionalBudgetUsd / entryPrice;
    const qtyByRisk = maxLossBudgetUsd / riskPerUnit;
    const limitingConstraint = qtyByRisk <= qtyByNotional ? 'RISK' as const : 'NOTIONAL' as const;
    const quantity = round(Math.min(qtyByNotional, qtyByRisk));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      rejected.push({ id: plan.id, reason: 'sized_quantity_invalid' });
      continue;
    }
    positions.push({
      id: plan.id,
      strategyId: plan.strategyId,
      symbol: plan.symbol,
      direction: plan.direction,
      entryPrice,
      stopPrice,
      riskPerUnit: round(riskPerUnit),
      quantity,
      notionalUsedUsd: round(quantity * entryPrice, 2),
      maxLossUsedUsd: round(quantity * riskPerUnit, 2),
      notionalBudgetUsd: round(notionalBudgetUsd, 2),
      maxLossBudgetUsd: round(maxLossBudgetUsd, 2),
      limitingConstraint,
      reduceOnlyProtectionRequired: true,
      requiresRiskGovernorApproval: true,
      requiresManualConfirmation: true,
      orderSubmissionAllowed: false,
    });
  }

  const withoutFingerprint = {
    version: 'paper_multi_trade_sizer_v2' as const,
    sourceCouncilFingerprint: input.sourceCouncilFingerprint,
    sourcePlanFingerprint: input.sourcePlanFingerprint,
    positions,
    rejected,
    totals: {
      positions: positions.length,
      notionalUsedUsd: round(positions.reduce((sum, row) => sum + row.notionalUsedUsd, 0), 2),
      maxLossUsedUsd: round(positions.reduce((sum, row) => sum + row.maxLossUsedUsd, 0), 2),
    },
    safety: {
      paperOnly: true as const,
      executionAuthorized: false as const,
      automaticOrderSubmission: false as const,
      autonomousLiveExecutionEnabled: false as const,
      exchangeClientDependency: false as const,
      requiresRiskGovernorApproval: true as const,
      requiresManualConfirmation: true as const,
    },
  };
  return { ...withoutFingerprint, deterministicFingerprint: createHash('sha256').update(JSON.stringify(withoutFingerprint)).digest('hex') };
}
