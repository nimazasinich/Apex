/**
 * Direction-Divergence Outcome Analysis (v1.1)
 *
 * Pure, deterministic, shadow-only analysis. Classification is direction-aware:
 * a negative QStruct reading aligns with SHORT and a positive reading aligns
 * with LONG. No result from this module is used as a live scanner gate.
 */
import type { SignalDecisionLog } from '../types';

export const ANALYSIS_VERSION = 1;
export const MIN_LABELED_ROWS = 300;
export const MIN_MINORITY_CLASS = 30;
export const QSTRUCT_TREND_THRESHOLD = 0.15;

export type DivergenceCategory = 'WITH_TREND' | 'RANGE' | 'COUNTER_TREND';
export type DivergenceExclusionReason =
  | 'missing_or_non_finite_qStructDirectional'
  | 'direction_unavailable'
  | 'not_accepted'
  | 'accepted_but_unresolved_outcome';

export interface ClassifiedDirectionRow {
  log: SignalDecisionLog;
  category: DivergenceCategory;
  alignmentScore: number;
}

export interface CategorySummary {
  category: DivergenceCategory;
  sampleCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number | null;
  avgPnl: number | null;
  avgAlignmentScore: number | null;
  avgTrendStrength: number | null;
  avgTimeframeAgreement: number | null;
}

export interface ChronologicalSplitSummary {
  split: 'train' | 'validation' | 'test';
  rowCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  startTimestamp: number | null;
  endTimestamp: number | null;
  categoryCounts: Record<DivergenceCategory, number>;
}

export interface DirectionDivergenceGate {
  status: 'INSUFFICIENT_DATA' | 'PASSED';
  minLabeledRows: number;
  minMinorityClass: number;
  resolvedRows: number;
  minorityClassRows: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
}

export interface DirectionDivergenceAnalysisResult {
  version: number;
  generatedAt: string;
  sourcePath: string | null;
  gate: DirectionDivergenceGate;
  totals: {
    rowsLoaded: number;
    rowsWithValidClassification: number;
    resolvedAcceptedRows: number;
    excludedRows: number;
  };
  exclusions: Array<{ reason: DivergenceExclusionReason; count: number }>;
  categorySummaries: CategorySummary[];
  chronologicalSplits: ChronologicalSplitSummary[];
  dataCompleteness: { avg: number | null; min: number | null; max: number | null };
  limitations: string[];
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function exclusionReasonForRow(log: SignalDecisionLog): DivergenceExclusionReason | null {
  if (!finite(log.qStructDirectional)) return 'missing_or_non_finite_qStructDirectional';
  if (log.direction !== 'SHORT' && log.direction !== 'LONG') return 'direction_unavailable';
  if (log.decision !== 'ACCEPTED') return 'not_accepted';
  if (log.laterOutcome !== 'WIN' && log.laterOutcome !== 'LOSS' && log.laterOutcome !== 'BREAKEVEN') {
    return 'accepted_but_unresolved_outcome';
  }
  return null;
}

/** Positive alignment means the market structure agrees with the trade thesis. */
export function classifyDirectionDivergence(log: SignalDecisionLog): ClassifiedDirectionRow | null {
  if (!finite(log.qStructDirectional) || (log.direction !== 'SHORT' && log.direction !== 'LONG')) return null;
  const alignmentScore = log.direction === 'SHORT' ? -log.qStructDirectional : log.qStructDirectional;
  const category: DivergenceCategory = alignmentScore > QSTRUCT_TREND_THRESHOLD
    ? 'WITH_TREND'
    : alignmentScore < -QSTRUCT_TREND_THRESHOLD
      ? 'COUNTER_TREND'
      : 'RANGE';
  return { log, category, alignmentScore };
}

export function evaluateAnalysisGate(rows: ClassifiedDirectionRow[]): DirectionDivergenceGate {
  const winCount = rows.filter(({ log }) => log.laterOutcome === 'WIN').length;
  const lossCount = rows.filter(({ log }) => log.laterOutcome === 'LOSS').length;
  const breakevenCount = rows.filter(({ log }) => log.laterOutcome === 'BREAKEVEN').length;
  const minorityClassRows = Math.min(winCount, lossCount);
  return {
    status: rows.length >= MIN_LABELED_ROWS && minorityClassRows >= MIN_MINORITY_CLASS
      ? 'PASSED'
      : 'INSUFFICIENT_DATA',
    minLabeledRows: MIN_LABELED_ROWS,
    minMinorityClass: MIN_MINORITY_CLASS,
    resolvedRows: rows.length,
    minorityClassRows,
    winCount,
    lossCount,
    breakevenCount,
  };
}

export function chronologicalSplitRows(rows: ClassifiedDirectionRow[]): ChronologicalSplitSummary[] {
  const sorted = [...rows].sort((a, b) => a.log.timestamp - b.log.timestamp || a.log.id.localeCompare(b.log.id));
  const trainEnd = Math.floor(sorted.length * 0.70);
  const validationEnd = Math.floor(sorted.length * 0.85);
  const definitions = [
    ['train', 0, trainEnd],
    ['validation', trainEnd, validationEnd],
    ['test', validationEnd, sorted.length],
  ] as const;

  return definitions.map(([split, start, end]) => {
    const bucket = sorted.slice(start, end);
    const categoryCounts: Record<DivergenceCategory, number> = {
      WITH_TREND: 0,
      RANGE: 0,
      COUNTER_TREND: 0,
    };
    for (const row of bucket) categoryCounts[row.category] += 1;
    return {
      split,
      rowCount: bucket.length,
      winCount: bucket.filter(({ log }) => log.laterOutcome === 'WIN').length,
      lossCount: bucket.filter(({ log }) => log.laterOutcome === 'LOSS').length,
      breakevenCount: bucket.filter(({ log }) => log.laterOutcome === 'BREAKEVEN').length,
      startTimestamp: bucket[0]?.log.timestamp ?? null,
      endTimestamp: bucket.at(-1)?.log.timestamp ?? null,
      categoryCounts,
    };
  });
}

export function analyzeDirectionDivergenceRows(
  rows: SignalDecisionLog[],
  ctx: { sourcePath: string | null; generatedAt: string },
): DirectionDivergenceAnalysisResult {
  const exclusions = new Map<DivergenceExclusionReason, number>();
  const classifiedAll: ClassifiedDirectionRow[] = [];
  const resolvedAccepted: ClassifiedDirectionRow[] = [];

  for (const log of rows) {
    const classification = classifyDirectionDivergence(log);
    if (classification) classifiedAll.push(classification);
    const reason = exclusionReasonForRow(log);
    if (reason) {
      exclusions.set(reason, (exclusions.get(reason) ?? 0) + 1);
      continue;
    }
    if (classification) resolvedAccepted.push(classification);
  }

  const categories: DivergenceCategory[] = ['WITH_TREND', 'RANGE', 'COUNTER_TREND'];
  const categorySummaries = categories.map((category): CategorySummary => {
    const bucket = resolvedAccepted.filter((row) => row.category === category);
    const wins = bucket.filter(({ log }) => log.laterOutcome === 'WIN').length;
    const losses = bucket.filter(({ log }) => log.laterOutcome === 'LOSS').length;
    const breakevens = bucket.filter(({ log }) => log.laterOutcome === 'BREAKEVEN').length;
    const decided = wins + losses;
    return {
      category,
      sampleCount: bucket.length,
      winCount: wins,
      lossCount: losses,
      breakevenCount: breakevens,
      winRate: decided ? wins / decided : null,
      avgPnl: mean(bucket.map(({ log }) => log.laterPnl).filter(finite)),
      avgAlignmentScore: mean(bucket.map((row) => row.alignmentScore)),
      avgTrendStrength: mean(bucket.map(({ log }) => Math.abs(log.qStructDirectional as number))),
      avgTimeframeAgreement: mean(bucket.map(({ log }) => log.evidenceAgreementScore).filter(finite)),
    };
  });

  const completenessValues = classifiedAll.map(({ log }) =>
    [log.confidence, log.evidenceAgreementScore, log.liquidityQualityScore, log.squeezeRiskScore]
      .filter(finite).length / 4,
  );

  return {
    version: ANALYSIS_VERSION,
    generatedAt: ctx.generatedAt,
    sourcePath: ctx.sourcePath,
    gate: evaluateAnalysisGate(resolvedAccepted),
    totals: {
      rowsLoaded: rows.length,
      rowsWithValidClassification: classifiedAll.length,
      resolvedAcceptedRows: resolvedAccepted.length,
      excludedRows: rows.length - resolvedAccepted.length,
    },
    exclusions: [...exclusions.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, count]) => ({ reason, count })),
    categorySummaries,
    chronologicalSplits: chronologicalSplitRows(resolvedAccepted),
    dataCompleteness: {
      avg: mean(completenessValues),
      min: completenessValues.length ? Math.min(...completenessValues) : null,
      max: completenessValues.length ? Math.max(...completenessValues) : null,
    },
    limitations: [
      'Direction-divergence analysis is shadow-only and does not change scanner gates, lifecycle behavior, or execution.',
      'qStructDirectional is a scanner-structure proxy, not an independently validated multi-timeframe trend indicator.',
      'Classification is direction-aware: negative structure aligns with SHORT and positive structure aligns with LONG.',
      'Rejected candidates and unresolved outcomes are excluded from realized outcome conclusions.',
      'Chronological splits are deterministic; random splitting is not used.',
      'Category thresholds are fixed audit heuristics and must not be treated as fitted decision boundaries.',
    ],
  };
}
