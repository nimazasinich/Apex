import type { BacktestResult, StrategyValidationReport } from '../types';
import { distinctSelectionHypothesisFingerprints, validateReturnEvidence } from './statisticalValidation';

export interface ValidationInputs {
  strategyId: string;
  strategyVersion: number;
  windows: StrategyValidationReport['windows'];
  holdout: StrategyValidationReport['holdout'];
  neighborRuns: StrategyValidationReport['stability']['neighborRuns'];
  costStressResult: BacktestResult;
  feeMultiplier?: number;
  slippageMultiplier?: number;
  regimeResults?: Record<string, BacktestResult>;
  regimeStatus?: StrategyValidationReport['regimeStatus'];
  regimeReason?: string;
  ablationResults?: StrategyValidationReport['ablationResults'];
  /** Distinct selection-eligible hypotheses that could influence winner selection. */
  selectionHypothesisFingerprints?: string[];
  /** Legacy compatibility for persisted callers; production routes pass explicit fingerprints. */
  triedVariants?: number;
  reproducible?: boolean;
  /**
   * What this run measured. Carried onto the report so the promotion gate can
   * verify the evidence belongs to the candidate it is about to promote, rather
   * than to whatever profile happened to be active.
   */
  subject?: StrategyValidationReport['subject'];
  /** Optional same-suite run of the active profile, for comparison only. */
  baseline?: StrategyValidationReport['baseline'];
  validationScope?: NonNullable<StrategyValidationReport['validationScope']>;
  validationLimitations?: string[];
  holdoutProtocol?: StrategyValidationReport['holdoutProtocol'];
}

export const MIN_REQUIRED_TRADES = 30;

export function gateData(result: BacktestResult): boolean {
  return result.dataState === 'live' && result.candlesUsed >= 200;
}

export function gateSample(result: BacktestResult): boolean {
  return result.timeline.length >= MIN_REQUIRED_TRADES;
}

export function gateOutOfSample(result: BacktestResult): boolean {
  return result.totalPnlPct > 0 && (result.profitFactor ?? 0) >= 1.1;
}

export function gateDrawdown(result: BacktestResult, limitPct = 20): boolean {
  return Math.abs(result.maxDrawdownPct) <= limitPct;
}

export function gateStability(neighborRuns: Array<{ totalPnlPct: number }>, holdoutReturn: number): boolean {
  if (neighborRuns.length < 2) return false;
  const profitable = neighborRuns.filter((run) => run.totalPnlPct > 0).length / neighborRuns.length;
  const worst = Math.min(...neighborRuns.map((run) => run.totalPnlPct));
  return profitable >= 0.66 && worst >= Math.min(-5, holdoutReturn * -0.5);
}

export function gateCostResilience(result: BacktestResult): boolean {
  return result.totalPnlPct > 0 && (result.profitFactor ?? 0) >= 1.1;
}

export function gateRegime(regimeResults?: Record<string, BacktestResult>): boolean {
  if (!regimeResults) return false;
  const requiredRegimes = ['trending', 'ranging', 'high_volatility'] as const;
  if (!requiredRegimes.every((label) => regimeResults[label])) return false;
  const entries = requiredRegimes.map((label) => regimeResults[label]);
  const identities = entries.map((result) => JSON.stringify({
    symbol: result.symbol,
    interval: result.interval,
    source: result.source,
    candlesUsed: result.candlesUsed,
    timeline: result.timeline.map((trade) => [trade.timestamp, trade.entry, trade.exit, trade.barsHeld]),
  }));
  if (new Set(identities).size !== identities.length) return false;
  const profitableCount = entries.filter((result) => result.totalPnlPct > 0).length;
  return profitableCount >= 2 && entries.every((result) => Math.abs(result.maxDrawdownPct) <= 30);
}

export function buildStrategyValidationReport(inputs: ValidationInputs): StrategyValidationReport {
  const explicitHypotheses = distinctSelectionHypothesisFingerprints(inputs.selectionHypothesisFingerprints);
  const selectionHypothesisFingerprints = explicitHypotheses.length
    ? explicitHypotheses
    : inputs.triedVariants && inputs.triedVariants > 1
      ? Array.from({ length: Math.floor(inputs.triedVariants) }, (_, index) => `legacy-selection-hypothesis:${index + 1}`)
      : [inputs.subject?.fingerprint || `fixed-validation-subject:${inputs.strategyId}:${inputs.strategyVersion}`];
  const triedVariants = selectionHypothesisFingerprints.length;
  const statisticalEvidence = validateReturnEvidence(
    inputs.holdout.result.timeline.map((trade) => Number(trade.pnlPct)).filter(Number.isFinite),
    { selectionHypothesisFingerprints },
  );
  const stabilityPassed = gateStability(inputs.neighborRuns, inputs.holdout.result.totalPnlPct);
  const gates = {
    data: gateData(inputs.holdout.result),
    sample: gateSample(inputs.holdout.result),
    outOfSample: gateOutOfSample(inputs.holdout.result),
    drawdown: gateDrawdown(inputs.holdout.result),
    stability: stabilityPassed,
    costResilience: gateCostResilience(inputs.costStressResult),
    regime: gateRegime(inputs.regimeResults),
    reproducibility: inputs.reproducible === true,
    statisticalEvidence: statisticalEvidence.passed,
  };

  const passedAllGates = Object.values(gates).every(Boolean);
  const validationScope = inputs.validationScope ?? 'FULL_STRATEGY';

  return {
    strategyId: inputs.strategyId,
    strategyVersion: inputs.strategyVersion,
    runAt: Date.now(),
    windows: inputs.windows,
    holdout: inputs.holdout,
    stability: { neighborRuns: inputs.neighborRuns, passed: stabilityPassed },
    costStress: {
      feeMultiplier: inputs.feeMultiplier ?? 1.5,
      slippageMultiplier: inputs.slippageMultiplier ?? 1.5,
      result: inputs.costStressResult,
      passed: gates.costResilience,
    },
    regimeResults: inputs.regimeResults,
    regimeStatus: inputs.regimeStatus ?? (inputs.regimeResults ? 'available' : 'insufficient_data'),
    regimeReason: inputs.regimeReason,
    ablationResults: inputs.ablationResults,
    triedVariants,
    selectionHypothesisFingerprints,
    statisticalEvidence,
    holdoutProtocol: inputs.holdoutProtocol,
    subject: inputs.subject,
    validationScope,
    validationLimitations: inputs.validationLimitations ?? [],
    fullStrategyValidated: passedAllGates && validationScope === 'FULL_STRATEGY',
    baseline: inputs.baseline,
    gates,
    passedAllGates,
  };
}
