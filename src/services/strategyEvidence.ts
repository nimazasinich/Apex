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

function finiteOrNull(value: number | undefined | null): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

export function buildStrategyEvidenceSnapshot(
  definition: StrategyDefinition,
  validation?: StrategyValidationReport,
  rank?: StrategyRankScore,
): StrategyDefinition['latestSnapshot'] {
  const holdout = validation?.holdout?.result;
  if (!validation || !holdout) return undefined;

  // Regime coverage is reported from the labels the run actually measured. When
  // no regime results exist the arrays stay undefined rather than empty, so a
  // consumer can distinguish "measured nothing" from "measured and found none".
  const regimeEntries = validation.regimeResults ? Object.entries(validation.regimeResults) : null;
  const statistical = validation.statisticalEvidence;

  return {
    score: finiteOrNull(rank?.score),
    winRatePct: holdout.historicalWinRatePct,
    netReturnPct: holdout.totalPnlPct,
    maxDrawdownPct: holdout.maxDrawdownPct,
    profitFactor: finiteOrNull(holdout.profitFactor),
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
      ? 'base-replay-temporal-robustness-3-window-plus-sealed-holdout-v2'
      : 'temporal-robustness-3-window-plus-sealed-holdout-v2',
    validationScope: validation.validationScope ?? 'FULL_STRATEGY',
    fullStrategyValidated: validation.fullStrategyValidated ?? validation.passedAllGates,
    dataState: holdout.dataState,
    warnings: strategyValidationWarnings(validation, holdout),
    gates: { ...validation.gates },
    passedAllGates: validation.passedAllGates,
    validationLimitations: validation.validationLimitations ?? [],
    regimeStatus: validation.regimeStatus,
    regimeReason: validation.regimeReason,
    regimesMeasured: regimeEntries ? regimeEntries.map(([label]) => label) : undefined,
    regimesProfitable: regimeEntries
      ? regimeEntries.filter(([, result]) => result.totalPnlPct > 0).map(([label]) => label)
      : undefined,
    costStress: {
      feeMultiplier: validation.costStress.feeMultiplier,
      slippageMultiplier: validation.costStress.slippageMultiplier,
      passed: validation.costStress.passed,
      totalPnlPct: validation.costStress.result.totalPnlPct,
      profitFactor: finiteOrNull(validation.costStress.result.profitFactor),
      maxDrawdownPct: validation.costStress.result.maxDrawdownPct,
    },
    statistical: statistical
      ? {
        passed: statistical.passed,
        observations: statistical.observations,
        effectiveSampleSize: statistical.effectiveSampleSize,
        meanReturnPct: statistical.meanReturnPct,
        lowerConfidenceBoundPct: finiteOrNull(statistical.lowerConfidenceBoundPct),
        probabilityPositiveMean: finiteOrNull(statistical.probabilityPositiveMean),
        deflatedSharpeRatioProbability: finiteOrNull(statistical.deflatedSharpeRatioProbability),
        selectionHypotheses: statistical.selectionHypothesisFingerprints.length,
        familyWiseAlpha: statistical.familyWiseAlpha,
        correctedAlpha: statistical.correctedAlpha,
        blockers: [...statistical.blockers],
      }
      : undefined,
    datasetFingerprint: validation.holdoutProtocol?.datasetFingerprint,
    holdoutProtocolStatus: validation.holdoutProtocol?.status,
  };
}
