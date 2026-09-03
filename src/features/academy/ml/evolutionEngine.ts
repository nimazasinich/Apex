/**
 * evolutionEngine.ts — rule-based research checklist. NOT an optimizer.
 *
 * TRUTH-IN-LABELLING (CP28 Task 1 step 5, fork (b)). Despite the file name, the
 * function below performs no search of any kind: no grid search, no random
 * search, no hill-climbing, no genetic loop, no re-scoring through
 * evaluationPipeline. It is a fixed conditional checklist that reads the
 * record's own evaluation state and emits the corresponding standing research
 * instruction. Every suggestion is therefore tagged `basis:
 * 'RULE_BASED_CHECKLIST'`, and the API and UI surfaces label it as a
 * "rule-based suggestion" rather than "optimization" or "evolution".
 *
 * If a real bounded parameter search is implemented later, it must re-score
 * each iteration through the existing AutomatedEvaluationPipeline on non-holdout
 * data only, and it must introduce a NEW basis value rather than quietly
 * reusing this one.
 */
import { createHash } from 'node:crypto';
import type { AcademyEvolutionSuggestion, AcademyStrategyRecord } from '../types.ts';

/** Machine-readable provenance for every suggestion this module emits. */
export const EVOLUTION_SUGGESTION_BASIS = 'RULE_BASED_CHECKLIST' as const;

/** Operator-facing description of what this module does and does not do. */
export const EVOLUTION_SUGGESTION_METHOD_NOTE =
  'Rule-based checklist over the record\'s own evaluation state. No parameter search, optimization, or evolutionary loop was run.';

export function buildEvolutionSuggestions(record: AcademyStrategyRecord): AcademyEvolutionSuggestion[] {
  const suggestions: Omit<AcademyEvolutionSuggestion, 'suggestionId'>[] = [];
  const evidenceIds = record.evidenceHistory.map((item) => item.evidenceId);
  const add = (kind: AcademyEvolutionSuggestion['kind'], statement: string) => suggestions.push({ kind, statement, evidenceIds, autoApply: false, basis: EVOLUTION_SUGGESTION_BASIS });

  if (record.latestEvaluation.backtest.state !== 'EVALUATED') add('COLLECT_EVIDENCE', 'Collect a provenance-complete backtest before evaluating performance.');
  if (record.latestEvaluation.robustness.state !== 'EVALUATED' || record.latestEvaluation.robustness.passed !== true) add('ROBUSTNESS_TEST', 'Run sealed out-of-sample, stability, reproducibility, and multiplicity-corrected robustness checks.');
  if (record.regimeCompatibility.every((entry) => entry.state === 'INSUFFICIENT_DATA')) add('REGIME_TEST', 'Add explicit regime-sliced validation; do not infer regime fitness from strategy descriptions.');
  if (record.latestEvaluation.metrics.dataQuality.value !== 'LIVE') add('COLLECT_EVIDENCE', 'Repeat validation on verified live-origin historical data with complete provenance.');
  if (record.latestEvaluation.metrics.profitFactor.state === 'EVALUATED' && record.latestEvaluation.risk.passed === false) add('COST_TEST', 'Stress transaction costs and drawdown before any supervised shadow advancement.');
  if (record.parameters.some((parameter) => parameter.optimization === 'enabled')) add('PARAMETER_RESEARCH', 'Evaluate bounded parameter neighborhoods on training folds only, then use the sealed holdout once.');

  return suggestions.map((suggestion) => ({
    ...suggestion,
    suggestionId: `academy-evolution-${createHash('sha256').update(`${record.recordId}|${suggestion.kind}|${suggestion.statement}`).digest('hex').slice(0, 16)}`,
  }));
}
