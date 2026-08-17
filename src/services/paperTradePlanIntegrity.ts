import { createHash } from 'node:crypto';

export interface PaperTradePlanIntegrityView {
  id: string;
  strategyId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  consensusScore: number;
  allocationWeight: number;
  notionalBudgetUsd: number;
  maxLossBudgetUsd: number;
  riskPctOfCapital: number;
  orderSubmissionAllowed: false;
  requiresManualConfirmation: true;
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('paper_plan_non_finite_value');
  return value;
}

/** Canonical, order-sensitive representation used for provenance binding. */
export function canonicalPaperTradePlans(plans: readonly PaperTradePlanIntegrityView[]) {
  return plans.map((plan) => ({
    id: String(plan.id),
    strategyId: String(plan.strategyId),
    symbol: String(plan.symbol).toUpperCase(),
    direction: plan.direction,
    consensusScore: finite(Number(plan.consensusScore)),
    allocationWeight: finite(Number(plan.allocationWeight)),
    notionalBudgetUsd: finite(Number(plan.notionalBudgetUsd)),
    maxLossBudgetUsd: finite(Number(plan.maxLossBudgetUsd)),
    riskPctOfCapital: finite(Number(plan.riskPctOfCapital)),
    orderSubmissionAllowed: plan.orderSubmissionAllowed,
    requiresManualConfirmation: plan.requiresManualConfirmation,
  }));
}

export function fingerprintPaperTradePlans(plans: readonly PaperTradePlanIntegrityView[]): string {
  return createHash('sha256').update(JSON.stringify(canonicalPaperTradePlans(plans))).digest('hex');
}
