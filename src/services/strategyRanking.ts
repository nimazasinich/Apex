import type { StrategyComparableGroup, StrategyRankScore, StrategyValidationReport } from '../types';

const WEIGHTS: Record<keyof StrategyRankScore['components'], number> = {
  outOfSampleReturn: 0.18,
  drawdownTailLoss: 0.14,
  walkForwardConsistency: 0.14,
  profitFactorQuality: 0.10,
  sortinoQuality: 0.08,
  parameterStability: 0.10,
  costLatencyResilience: 0.08,
  regimeCoverage: 0.06,
  sampleAdequacy: 0.06,
  diversificationValue: 0.06,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function consistency(values: number[]): number {
  if (!values.length) return 0;
  const positiveShare = values.filter((value) => value > 0).length / values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const dispersionPenalty = Math.min(40, Math.sqrt(variance) * 2);
  return clamp(positiveShare * 100 - dispersionPenalty);
}

export function scoreStrategyValidation(
  report: StrategyValidationReport,
  comparableGroup: StrategyComparableGroup,
  diversificationValue = 50,
): StrategyRankScore {
  const holdout = report.holdout.result;
  const windowReturns = report.windows.map((window) => window.result.totalPnlPct);
  const neighborReturns = report.stability.neighborRuns.map((run) => run.totalPnlPct);
  const regimeEntries = Object.values(report.regimeResults ?? {});
  const downside = holdout.timeline.filter((row) => (row.pnlPct ?? 0) < 0).map((row) => Math.abs(row.pnlPct ?? 0));
  const downsideMean = downside.length ? downside.reduce((sum, value) => sum + value, 0) / downside.length : 0;
  const sortinoProxy = downsideMean > 0 ? Math.max(0, holdout.avgPnlPct ?? 0) / downsideMean : Math.max(0, holdout.avgPnlPct ?? 0);

  const components: StrategyRankScore['components'] = {
    outOfSampleReturn: clamp(50 + holdout.totalPnlPct * 2),
    drawdownTailLoss: clamp(100 - Math.abs(holdout.maxDrawdownPct) * 4),
    walkForwardConsistency: consistency(windowReturns),
    profitFactorQuality: clamp(((holdout.profitFactor ?? 0) - 0.5) * 50),
    sortinoQuality: clamp(sortinoProxy * 50),
    parameterStability: consistency(neighborReturns),
    costLatencyResilience: report.costStress.passed ? clamp(60 + report.costStress.result.totalPnlPct * 2) : clamp(30 + report.costStress.result.totalPnlPct),
    regimeCoverage: regimeEntries.length ? clamp((regimeEntries.filter((result) => result.totalPnlPct > 0).length / regimeEntries.length) * 100) : 0,
    sampleAdequacy: clamp((holdout.timeline.length / 100) * 100),
    diversificationValue: clamp(diversificationValue),
  };

  const penalties: string[] = [];
  let penalty = 0;
  if (!report.gates.outOfSample) { penalties.push('OUT_OF_SAMPLE_GATE_FAILED'); penalty += 15; }
  if (!report.gates.costResilience) { penalties.push('COST_STRESS_FAILED'); penalty += 12; }
  if (!report.gates.stability) { penalties.push('PARAMETER_INSTABILITY'); penalty += 10; }
  if (!report.gates.sample) { penalties.push('INADEQUATE_SAMPLE'); penalty += 8; }
  if (!report.gates.reproducibility) { penalties.push('REPRODUCIBILITY_NOT_CONFIRMED'); penalty += 5; }

  const weighted = (Object.keys(components) as Array<keyof typeof components>)
    .reduce((sum, key) => sum + components[key] * WEIGHTS[key], 0);

  return {
    strategyId: report.strategyId,
    strategyVersion: report.strategyVersion,
    comparableGroup,
    components,
    penalties,
    score: Math.round(clamp(weighted - penalty) * 10) / 10,
  };
}

export function rankStrategies(group: StrategyComparableGroup, reports: StrategyValidationReport[]): StrategyRankScore[] {
  return reports
    .map((report) => scoreStrategyValidation(report, group))
    .sort((left, right) => right.score - left.score);
}
