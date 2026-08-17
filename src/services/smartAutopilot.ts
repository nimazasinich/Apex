export const SMART_AUTOPILOT_VERSION = 'smart_autopilot_v1' as const;

export interface SmartAutopilotOptimizationReportLike {
  promotion: {
    eligible: boolean;
    blockers: string[];
    holdoutImprovement: number;
    neighborPassRate: number;
    overfitGap: number;
  };
  budget: { maximumOverfitGap: number };
  holdout: {
    candidate: { metrics: { totalPnlPct: number; profitFactor: number | null; tradeCount: number } };
    costStress: { metrics: { totalPnlPct: number; profitFactor: number | null } };
  };
}

export interface SmartAutopilotStrategyDescriptor {
  strategyId: string;
  status: string;
  supportedIntervals: string[];
  longShort: 'LONG' | 'SHORT' | 'BOTH';
}

export interface SmartAutopilotContext {
  id: string;
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
}

export interface SmartAutopilotPlan {
  version: typeof SMART_AUTOPILOT_VERSION;
  cycleIndex: number;
  totalContexts: number;
  startOffset: number;
  contexts: SmartAutopilotContext[];
}

export type SmartAutopilotAgentId = 'EVIDENCE' | 'HOLDOUT' | 'COST_STRESS' | 'STABILITY' | 'OVERFIT_GUARD';
export type SmartAutopilotDisposition = 'SUPPORT' | 'CAUTION' | 'VETO';

export interface SmartAutopilotAgentAssessment {
  agentId: SmartAutopilotAgentId;
  disposition: SmartAutopilotDisposition;
  score: number;
  reasons: string[];
}

export interface SmartAutopilotOptimizationCouncil {
  version: 'smart_autopilot_optimization_council_v1';
  assessments: SmartAutopilotAgentAssessment[];
  supports: number;
  cautions: number;
  vetoes: number;
  consensusScore: number;
  approvedForPromotion: boolean;
  blockers: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function preferredIntervalOrder(intervals: string[], preferredInterval?: string): string[] {
  const unique = [...new Set(intervals.filter(Boolean))];
  if (!preferredInterval || !unique.includes(preferredInterval)) return unique;
  return [preferredInterval, ...unique.filter((interval) => interval !== preferredInterval)];
}

export function buildSmartAutopilotPlan(input: {
  strategies: SmartAutopilotStrategyDescriptor[];
  symbol: string;
  symbols?: string[];
  preferredInterval?: string;
  cycleIndex?: number;
  maxContexts?: number;
}): SmartAutopilotPlan {
  const cycleIndex = Math.max(0, Math.floor(finite(input.cycleIndex, 0)));
  const maxContexts = Math.floor(clamp(finite(input.maxContexts, 6), 1, 12));
  const preferredSymbol = String(input.symbol || 'BTC-USDT').trim().toUpperCase();
  const symbols = [...new Set([preferredSymbol, ...(input.symbols || []).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)])].slice(0, 6);
  const all: SmartAutopilotContext[] = [];

  const executable = input.strategies
    .filter((strategy) => strategy.status !== 'blocked' && strategy.status !== 'deprecated')
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId));

  for (const strategy of executable) {
    const directions: Array<'LONG' | 'SHORT'> = strategy.longShort === 'BOTH'
      ? ['LONG', 'SHORT']
      : [strategy.longShort];
    const intervals = preferredIntervalOrder(strategy.supportedIntervals, input.preferredInterval);
    for (const interval of intervals) {
      for (const direction of directions) {
        for (const symbol of symbols) {
          all.push({
            id: `${strategy.strategyId}:${symbol}:${interval}:${direction}`,
            strategyId: strategy.strategyId,
            symbol,
            interval,
            direction,
          });
        }
      }
    }
  }

  if (!all.length) return { version: SMART_AUTOPILOT_VERSION, cycleIndex, totalContexts: 0, startOffset: 0, contexts: [] };
  const startOffset = (cycleIndex * maxContexts) % all.length;
  const contexts = Array.from({ length: Math.min(maxContexts, all.length) }, (_, index) => all[(startOffset + index) % all.length]);
  return { version: SMART_AUTOPILOT_VERSION, cycleIndex, totalContexts: all.length, startOffset, contexts };
}

function assessment(
  agentId: SmartAutopilotAgentId,
  disposition: SmartAutopilotDisposition,
  score: number,
  reasons: string[],
): SmartAutopilotAgentAssessment {
  return { agentId, disposition, score: round(clamp(score, 0, 1)), reasons };
}

export function runSmartAutopilotOptimizationCouncil(report: SmartAutopilotOptimizationReportLike): SmartAutopilotOptimizationCouncil {
  const candidate = report.holdout.candidate.metrics;
  const stressed = report.holdout.costStress.metrics;
  const eligible = report.promotion.eligible === true;
  const holdoutImprovement = finite(report.promotion.holdoutImprovement);
  const neighborPassRate = clamp(finite(report.promotion.neighborPassRate), 0, 1);
  const overfitGap = Math.abs(finite(report.promotion.overfitGap));
  const maxOverfitGap = Math.max(0.000001, finite(report.budget.maximumOverfitGap, 0.32));

  const evidence = eligible
    ? assessment('EVIDENCE', 'SUPPORT', 1, ['optimizer_evidence_gates_passed'])
    : assessment('EVIDENCE', 'VETO', 0, report.promotion.blockers.length ? report.promotion.blockers : ['optimizer_evidence_gate_failed']);

  const candidatePf = candidate.profitFactor === null ? 0 : finite(candidate.profitFactor);
  const holdoutPass = candidate.totalPnlPct > 0 && candidatePf > 1 && candidate.tradeCount >= 4 && holdoutImprovement > 0;
  const holdoutScore = clamp(
    0.35
      + Math.min(0.3, Math.max(0, candidate.totalPnlPct) / 40)
      + Math.min(0.2, Math.max(0, candidatePf - 1) / 3)
      + Math.min(0.15, Math.max(0, candidate.tradeCount) / 80),
    0,
    1,
  );
  const holdout = holdoutPass
    ? assessment('HOLDOUT', 'SUPPORT', holdoutScore, ['positive_untouched_holdout', 'profit_factor_above_break_even', 'minimum_trade_sample_present'])
    : assessment('HOLDOUT', 'VETO', holdoutScore * 0.35, [
      ...(candidate.totalPnlPct <= 0 ? ['holdout_return_not_positive'] : []),
      ...(candidatePf <= 1 ? ['holdout_profit_factor_not_above_one'] : []),
      ...(candidate.tradeCount < 4 ? ['holdout_trade_sample_too_small'] : []),
      ...(holdoutImprovement <= 0 ? ['holdout_utility_not_improved'] : []),
    ]);

  const stressedPf = stressed.profitFactor === null ? 0 : finite(stressed.profitFactor);
  const stressPass = stressed.totalPnlPct > 0 && stressedPf > 1;
  const costStress = stressPass
    ? assessment('COST_STRESS', 'SUPPORT', clamp(0.5 + Math.min(0.5, stressed.totalPnlPct / 30), 0, 1), ['positive_after_cost_stress', 'stressed_profit_factor_above_one'])
    : assessment('COST_STRESS', 'VETO', 0.15, [
      ...(stressed.totalPnlPct <= 0 ? ['cost_stress_return_not_positive'] : []),
      ...(stressedPf <= 1 ? ['cost_stress_profit_factor_not_above_one'] : []),
    ]);

  const stability = neighborPassRate >= 0.75
    ? assessment('STABILITY', 'SUPPORT', neighborPassRate, ['neighbor_stability_passed'])
    : neighborPassRate >= 0.6
      ? assessment('STABILITY', 'CAUTION', neighborPassRate, ['neighbor_stability_marginal'])
      : assessment('STABILITY', 'VETO', neighborPassRate, ['neighbor_stability_below_floor']);

  const overfitRatio = clamp(overfitGap / maxOverfitGap, 0, 2);
  const overfitGuard = overfitGap <= maxOverfitGap
    ? assessment('OVERFIT_GUARD', 'SUPPORT', clamp(1 - overfitRatio * 0.6, 0, 1), ['overfit_gap_within_budget'])
    : assessment('OVERFIT_GUARD', 'VETO', 0, ['overfit_gap_exceeds_budget']);

  const assessments = [evidence, holdout, costStress, stability, overfitGuard];
  const supports = assessments.filter((row) => row.disposition === 'SUPPORT').length;
  const cautions = assessments.filter((row) => row.disposition === 'CAUTION').length;
  const vetoes = assessments.filter((row) => row.disposition === 'VETO').length;
  const consensusScore = round(assessments.reduce((sum, row) => sum + row.score, 0) / assessments.length);
  const approvedForPromotion = eligible && vetoes === 0 && supports >= 4 && consensusScore >= 0.62;
  const blockers = approvedForPromotion
    ? []
    : [...new Set(assessments.filter((row) => row.disposition === 'VETO').flatMap((row) => row.reasons))];

  return {
    version: 'smart_autopilot_optimization_council_v1',
    assessments,
    supports,
    cautions,
    vetoes,
    consensusScore,
    approvedForPromotion,
    blockers,
  };
}
