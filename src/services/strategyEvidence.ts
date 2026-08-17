import type {
  BacktestResult,
  StrategyDefinition,
  StrategyRankScore,
  StrategyValidationReport,
} from '../types';

export function strategyValidationWarnings(
  validation: StrategyValidationReport,
  result: BacktestResult,
): string[] {
  const warnings: string[] = [];
  const failedGates = Object.entries(validation.gates)
    .filter(([, passed]) => !passed)
    .map(([gate]) => gate.replaceAll('_', ' '));

  if (failedGates.length) warnings.push(`Failed validation gates: ${failedGates.join(', ')}.`);
  if (result.dataState !== 'live') warnings.push(`Holdout data state: ${result.dataState.replaceAll('_', ' ')}.`);
  if (result.source) warnings.push(`Market data provider: ${result.source}.`);
  if (result.diagnostics?.noTradeReason) warnings.push(result.diagnostics.noTradeReason);
  if (result.disclaimer) warnings.push(result.disclaimer);
  for (const override of result.configOverrides ?? []) warnings.push(`${override.field}: ${override.reason}`);
  if (!validation.costStress.passed) warnings.push('Cost-stress gate did not pass.');
  if (validation.validationScope === 'BASE_REPLAY') {
    warnings.push('Validation scope is base replay only; full strategy semantics were not completely exercised.');
    for (const limitation of validation.validationLimitations ?? []) warnings.push(limitation);
  }

  return Array.from(new Set(warnings));
}

export function buildStrategyEvidenceSnapshot(
  definition: StrategyDefinition,
  validation?: StrategyValidationReport,
  rank?: StrategyRankScore,
): StrategyDefinition['latestSnapshot'] {
  const holdout = validation?.holdout?.result;
  if (!validation || !holdout) return undefined;

  return {
    score: rank?.score ?? 0,
    winRatePct: holdout.historicalWinRatePct,
    netReturnPct: holdout.totalPnlPct,
    maxDrawdownPct: holdout.maxDrawdownPct,
    profitFactor: holdout.profitFactor ?? 0,
    lastBacktestAt: holdout.audit?.generatedAt || validation.runAt,
    costStressPassed: validation.costStress.passed,
    source: 'validation',
    symbol: holdout.symbol,
    interval: holdout.interval as StrategyDefinition['supportedIntervals'][number],
    direction: holdout.direction,
    dateFrom: validation.holdout.from,
    dateTo: validation.holdout.to,
    commissionPctPerSide: holdout.costModel?.commissionPctPerSide,
    slippagePctPerSide: holdout.costModel?.slippagePctPerSide,
    fundingPctEstimate: holdout.costModel?.fundingPctEstimate,
    sampleSize: holdout.candlesUsed,
    engine: holdout.audit?.engine || holdout.replayMode || definition.engine,
    runId: holdout.audit?.runId,
    validationMethod: validation.validationScope === 'BASE_REPLAY'
      ? 'base-replay-walk-forward-3-window-plus-holdout-v1'
      : 'walk-forward-3-window-plus-holdout-v1',
    validationScope: validation.validationScope ?? 'FULL_STRATEGY',
    fullStrategyValidated: validation.fullStrategyValidated ?? validation.passedAllGates,
    dataState: holdout.dataState,
    warnings: strategyValidationWarnings(validation, holdout),
  };
}
