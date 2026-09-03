import type { BacktestCandle } from './backtesting';
import type { ScannerConfig, StrategyDefinition, StrategyParameterDefinition, StrategyReplaySummary } from '../types';
import {
  fingerprintGovernanceConfiguration,
  partitionFiveWayWithSealedHoldout,
} from './sealedHoldout';
import type { AuthorityStage } from '../contracts/evidence/evidenceGraph';
import {
  computeCscvPbo,
  distinctSelectionHypothesisFingerprints,
  STATISTICAL_VALIDATION_POLICY_VERSION,
  fingerprintSelectionHypothesis,
  type CscvPboResult,
} from './statisticalValidation';

export const STRATEGY_OPTIMIZER_VERSION = 'strategy_optimizer_v4_development_only_selection';
export const STRATEGY_OPTIMIZER_OBJECTIVE_VERSION = 'strategy_optimizer_utility_v1';
export const STRATEGY_OPTIMIZER_VALIDATION_POLICY_VERSION = 'strategy_optimizer_validation_policy_v2';

export type OptimizationFieldTarget = 'PARAMETER' | 'SCANNER_CONFIG';

export interface NumericOptimizationField {
  key: string;
  target: OptimizationFieldTarget;
  base: number;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export interface StrategyOptimizationCandidate {
  id: string;
  values: Record<string, number>;
  parameters: Record<string, number | string>;
  scannerConfig: ScannerConfig;
}

export interface StrategyOptimizationMetrics {
  totalPnlPct: number;
  maxDrawdownPct: number;
  profitFactor: number | null;
  tradeCount: number;
  winRatePct: number;
  avgPnlPct: number;
}

export interface StrategyOptimizationWindowResult {
  label: string;
  from: number;
  to: number;
  metrics: StrategyOptimizationMetrics;
  utility: number;
}

export interface StrategyOptimizationEvaluation {
  candidateId: string;
  values: Record<string, number>;
  parameters: Record<string, number | string>;
  scannerConfig: ScannerConfig;
  windows: StrategyOptimizationWindowResult[];
  robustScore: number;
  meanUtility: number;
  worstUtility: number;
  dispersion: number;
  totalTrades: number;
  durationMs: number;
  error?: string;
}

export interface StrategyOptimizationPromotion {
  eligible: boolean;
  automaticallyPromoted: boolean;
  blockers: string[];
  evidenceScope: 'DEVELOPMENT_ONLY';
  baselineDevelopmentUtility: number;
  candidateDevelopmentUtility: number;
  robustImprovement: number;
  developmentValidationImprovement: number;
  overfitGap: number;
  neighborPassRate: number;
}

export interface StrategyOptimizationReport {
  version: typeof STRATEGY_OPTIMIZER_VERSION;
  generatedAt: number;
  generatedAtIso: string;
  strategyId: string;
  strategyVersion: number;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
  budget: Required<StrategyOptimizationBudget>;
  validationIsolation: { purgeBars: number; embargoBars: number };
  candidateFingerprint: string;
  finalHoldoutDatasetFingerprint: string;
  developmentDatasetFingerprint: string;
  validationPolicyFingerprint: string;
  searchObjectiveFingerprint: string;
  selectionHypothesisFingerprints: string[];
  selectionHypothesisCount: number;
  developmentPbo: CscvPboResult;
  finalHoldoutStatus: 'SEALED_NOT_OPENED_DURING_OPTIMIZATION';
  authorityStage: AuthorityStage;
  fields: NumericOptimizationField[];
  baseline: StrategyOptimizationEvaluation;
  winner: StrategyOptimizationEvaluation;
  developmentValidation: {
    baseline: StrategyOptimizationWindowResult;
    candidate: StrategyOptimizationWindowResult;
    costStress: StrategyOptimizationWindowResult;
    neighbors: StrategyOptimizationEvaluation[];
  };
  promotion: StrategyOptimizationPromotion;
  triedCandidates: number;
  completedEvaluations: number;
  cacheHits: number;
  searchEfficiency: {
    theoreticalWindowEvaluations: number;
    completedWindowEvaluations: number;
    reductionPct: number;
  };
  durationMs: number;
  warnings: string[];
}

export interface StrategyOptimizationBudget {
  coarseCandidates?: number;
  finalists?: number;
  refinementCandidates?: number;
  maxConcurrent?: number;
  minTradesPerEvaluation?: number;
  maxDrawdownPct?: number;
  minimumRobustImprovement?: number;
  minimumHoldoutImprovement?: number;
  maximumOverfitGap?: number;
  timeoutMs?: number;
  costStressMultiplier?: number;
  randomSeed?: number;
  purgeBars?: number;
  embargoBars?: number;
}

export interface StrategyOptimizationEvaluatorInput {
  candles: BacktestCandle[];
  parameters: Record<string, number | string>;
  scannerConfig: ScannerConfig;
  transactionCostPct: number;
  signal?: AbortSignal;
}

export type StrategyOptimizationEvaluator = (
  input: StrategyOptimizationEvaluatorInput,
) => Promise<StrategyOptimizationMetrics> | StrategyOptimizationMetrics;

export interface OptimizeStrategyInput {
  definition: StrategyDefinition;
  candles: BacktestCandle[];
  baseScannerConfig: ScannerConfig;
  baseParameters?: Record<string, number | string>;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
  transactionCostPct: number;
  evaluator: StrategyOptimizationEvaluator;
  budget?: StrategyOptimizationBudget;
  autoPromote?: boolean;
  signal?: AbortSignal;
  /** Deprecated compatibility input. The optimizer is development-only and
   * never opens the final sealed governance holdout. Final holdout access is
   * owned exclusively by the candidate-matched validation suite. */
  holdoutLedger?: unknown;
}

const SCANNER_FIELD_RANGES: Record<string, { min: number; max: number; step: number }> = {
  obiThreshold: { min: -0.40, max: -0.10, step: 0.005 },
  qStructThreshold: { min: -0.52, max: -0.30, step: 0.005 },
  minConfidence: { min: 0.74, max: 0.91, step: 0.005 },
  maxSqueezeRisk: { min: 0.36, max: 0.72, step: 0.005 },
  minEvidenceAgreement: { min: 0.50, max: 0.82, step: 0.005 },
  minSmartMoneyScore: { min: 0.35, max: 0.80, step: 0.005 },
  smcHardRejectThreshold: { min: 0.10, max: 0.45, step: 0.005 },
};

const SCANNER_OPTIMIZATION_KEYS = Object.keys(SCANNER_FIELD_RANGES);

export function applyStrategyOptimizationScannerDeltas(
  base: ScannerConfig,
  deltas: Record<string, number> | undefined,
): ScannerConfig {
  const next = cloneScannerConfig(base);
  for (const [key, rawDelta] of Object.entries(deltas || {})) {
    const bounds = SCANNER_FIELD_RANGES[key];
    const current = Number((next as unknown as Record<string, unknown>)[key]);
    const delta = Number(rawDelta);
    if (!bounds || !Number.isFinite(current) || !Number.isFinite(delta)) continue;
    (next as unknown as Record<string, unknown>)[key] = round(clamp(current + delta, bounds.min, bounds.max));
  }
  return next;
}

const DEFAULT_BUDGET: Required<StrategyOptimizationBudget> = {
  coarseCandidates: 28,
  finalists: 8,
  refinementCandidates: 12,
  maxConcurrent: 4,
  minTradesPerEvaluation: 30,
  maxDrawdownPct: 24,
  minimumRobustImprovement: 0.035,
  minimumHoldoutImprovement: 0.01,
  maximumOverfitGap: 0.32,
  timeoutMs: 120_000,
  costStressMultiplier: 2,
  randomSeed: 47,
  purgeBars: 12,
  embargoBars: 12,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}

function cloneScannerConfig(config: ScannerConfig): ScannerConfig {
  return { ...config, scoreWeights: { ...config.scoreWeights } };
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function metricFromSummary(summary: StrategyReplaySummary): StrategyOptimizationMetrics {
  return {
    totalPnlPct: finite(summary.totalPnlPct),
    maxDrawdownPct: Math.abs(finite(summary.maxDrawdownPct)),
    profitFactor: Number.isFinite(summary.profitFactor) ? Number(summary.profitFactor) : null,
    tradeCount: Math.max(0, Math.floor(finite(summary.trades))),
    winRatePct: clamp(finite(summary.winRate) * 100, 0, 100),
    avgPnlPct: finite(summary.avgPnlPct),
  };
}

export function strategyOptimizationMetricsFromSummary(summary: StrategyReplaySummary): StrategyOptimizationMetrics {
  return metricFromSummary(summary);
}

function normalizeBudget(input?: StrategyOptimizationBudget): Required<StrategyOptimizationBudget> {
  const merged = { ...DEFAULT_BUDGET, ...(input || {}) };
  return {
    coarseCandidates: Math.floor(clamp(finite(merged.coarseCandidates, DEFAULT_BUDGET.coarseCandidates), 8, 64)),
    finalists: Math.floor(clamp(finite(merged.finalists, DEFAULT_BUDGET.finalists), 3, 16)),
    refinementCandidates: Math.floor(clamp(finite(merged.refinementCandidates, DEFAULT_BUDGET.refinementCandidates), 1, 100)),
    maxConcurrent: Math.floor(clamp(finite(merged.maxConcurrent, DEFAULT_BUDGET.maxConcurrent), 1, 16)),
    minTradesPerEvaluation: Math.floor(clamp(finite(merged.minTradesPerEvaluation, DEFAULT_BUDGET.minTradesPerEvaluation), 1, 100)),
    maxDrawdownPct: clamp(finite(merged.maxDrawdownPct, DEFAULT_BUDGET.maxDrawdownPct), 5, 60),
    minimumRobustImprovement: clamp(finite(merged.minimumRobustImprovement, DEFAULT_BUDGET.minimumRobustImprovement), 0, 1),
    minimumHoldoutImprovement: clamp(finite(merged.minimumHoldoutImprovement, DEFAULT_BUDGET.minimumHoldoutImprovement), -0.25, 1),
    maximumOverfitGap: clamp(finite(merged.maximumOverfitGap, DEFAULT_BUDGET.maximumOverfitGap), 0.05, 1.5),
    timeoutMs: Math.floor(clamp(finite(merged.timeoutMs, DEFAULT_BUDGET.timeoutMs), 10_000, 600_000)),
    costStressMultiplier: clamp(finite(merged.costStressMultiplier, DEFAULT_BUDGET.costStressMultiplier), 1, 5),
    randomSeed: Math.floor(clamp(finite(merged.randomSeed, DEFAULT_BUDGET.randomSeed), 1, 2_147_483_646)),
    purgeBars: Math.floor(clamp(finite(merged.purgeBars, DEFAULT_BUDGET.purgeBars), 0, 1_000)),
    embargoBars: Math.floor(clamp(finite(merged.embargoBars, DEFAULT_BUDGET.embargoBars), 0, 1_000)),
  };
}

function parameterField(parameter: StrategyParameterDefinition, baseParameters: Record<string, number | string>): NumericOptimizationField | null {
  if (parameter.optimization === 'manual-only') return null;
  if (typeof parameter.default !== 'number') return null;
  const min = finite(parameter.min, parameter.default);
  const max = finite(parameter.max, parameter.default);
  if (!(max > min)) return null;
  const base = clamp(finite(baseParameters[parameter.key], parameter.default), min, max);
  const step = Math.max(Number.EPSILON, finite(parameter.step, (max - min) / 20));
  return {
    key: parameter.key,
    target: 'PARAMETER',
    base,
    min,
    max,
    step,
    integer: Number.isInteger(parameter.default) && Number.isInteger(step),
  };
}

function scannerField(key: string, baseScannerConfig: ScannerConfig): NumericOptimizationField | null {
  const bounds = SCANNER_FIELD_RANGES[key];
  if (!bounds) return null;
  const value = finite((baseScannerConfig as unknown as Record<string, unknown>)[key], Number.NaN);
  if (!Number.isFinite(value)) return null;
  // A bounded local search avoids turning optimization into a broad, unstable
  // parameter hunt. The full hard policy range remains an absolute clamp.
  const localRadius = Math.max(bounds.step * 4, (bounds.max - bounds.min) * 0.22);
  return {
    key,
    target: 'SCANNER_CONFIG',
    base: clamp(value, bounds.min, bounds.max),
    min: clamp(value - localRadius, bounds.min, bounds.max),
    max: clamp(value + localRadius, bounds.min, bounds.max),
    step: bounds.step,
    integer: false,
  };
}

export function buildStrategyOptimizationFields(
  definition: StrategyDefinition,
  baseScannerConfig: ScannerConfig,
  baseParameters: Record<string, number | string> = {},
): NumericOptimizationField[] {
  const fields = definition.parameters
    .map((parameter) => parameterField(parameter, baseParameters))
    .filter((field): field is NumericOptimizationField => Boolean(field));
  const existing = new Set(fields.map((field) => field.key));
  if (definition.engine === 'scanner-preset') {
    for (const key of SCANNER_OPTIMIZATION_KEYS) {
      if (existing.has(key)) continue;
      const field = scannerField(key, baseScannerConfig);
      if (field) fields.push(field);
    }
  }
  // Keep the search bounded. Registry parameters are ordered by strategy
  // importance; scanner controls are appended in policy order.
  return fields.slice(0, 10);
}

function quantize(value: number, field: NumericOptimizationField): number {
  const stepped = field.min + Math.round((clamp(value, field.min, field.max) - field.min) / field.step) * field.step;
  const bounded = clamp(stepped, field.min, field.max);
  return field.integer ? Math.round(bounded) : round(bounded);
}

function primeAt(index: number): number {
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
  return primes[index % primes.length];
}

function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  let current = index;
  while (current > 0) {
    result += fraction * (current % base);
    current = Math.floor(current / base);
    fraction /= base;
  }
  return result;
}

function candidateKey(values: Record<string, number>): string {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${round(value, 10)}`)
    .join('|');
}

function buildCandidate(
  id: string,
  fields: NumericOptimizationField[],
  values: Record<string, number>,
  baseParameters: Record<string, number | string>,
  baseScannerConfig: ScannerConfig,
): StrategyOptimizationCandidate {
  const parameters = { ...baseParameters };
  const scannerConfig = cloneScannerConfig(baseScannerConfig);
  for (const field of fields) {
    const value = quantize(values[field.key] ?? field.base, field);
    if (field.target === 'PARAMETER') parameters[field.key] = value;
    else (scannerConfig as unknown as Record<string, unknown>)[field.key] = value;
  }
  return { id, values: Object.fromEntries(fields.map((field) => [field.key, quantize(values[field.key] ?? field.base, field)])), parameters, scannerConfig };
}

function generateCoarseCandidates(
  fields: NumericOptimizationField[],
  count: number,
  seed: number,
  baseParameters: Record<string, number | string>,
  baseScannerConfig: ScannerConfig,
): StrategyOptimizationCandidate[] {
  const seen = new Set<string>();
  const candidates: StrategyOptimizationCandidate[] = [];
  const baseValues = Object.fromEntries(fields.map((field) => [field.key, field.base]));
  const add = (values: Record<string, number>, label: string) => {
    const normalized = Object.fromEntries(fields.map((field) => [field.key, quantize(values[field.key] ?? field.base, field)]));
    const key = candidateKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(buildCandidate(label, fields, normalized, baseParameters, baseScannerConfig));
  };
  add(baseValues, 'baseline');

  for (let index = 1; candidates.length < count && index < count * 20; index += 1) {
    const values: Record<string, number> = {};
    for (let dimension = 0; dimension < fields.length; dimension += 1) {
      const field = fields[dimension];
      const u = halton(index + seed, primeAt(dimension));
      values[field.key] = field.min + u * (field.max - field.min);
    }
    add(values, `coarse-${index}`);
  }
  return candidates;
}

function generateRefinementCandidates(
  fields: NumericOptimizationField[],
  leaders: StrategyOptimizationEvaluation[],
  count: number,
  baseParameters: Record<string, number | string>,
  baseScannerConfig: ScannerConfig,
): StrategyOptimizationCandidate[] {
  if (!leaders.length || count <= 0) return [];
  const seen = new Set(leaders.map((leader) => candidateKey(leader.values)));
  const candidates: StrategyOptimizationCandidate[] = [];
  const leaderCount = Math.min(3, leaders.length);
  for (let index = 0; candidates.length < count && index < count * 20; index += 1) {
    const leader = leaders[index % leaderCount];
    const values: Record<string, number> = {};
    fields.forEach((field, dimension) => {
      const sign = ((index + dimension) % 2 === 0) ? 1 : -1;
      const ring = 1 + Math.floor(index / Math.max(1, fields.length * 2));
      const stride = field.step * Math.min(4, ring);
      const nudge = dimension === index % fields.length ? sign * stride : sign * stride * 0.35;
      values[field.key] = quantize((leader.values[field.key] ?? field.base) + nudge, field);
    });
    const key = candidateKey(values);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(buildCandidate(`refine-${index + 1}`, fields, values, baseParameters, baseScannerConfig));
  }
  return candidates;
}

function utility(metrics: StrategyOptimizationMetrics, budget: Required<StrategyOptimizationBudget>): number {
  const pnl = Math.tanh(metrics.totalPnlPct / 12);
  const profitFactor = metrics.profitFactor === null ? 0 : clamp(metrics.profitFactor, 0, 4);
  const pf = Math.tanh((profitFactor - 1) / 1.1);
  const winRate = Math.tanh((metrics.winRatePct - 50) / 20);
  const averageTrade = Math.tanh(metrics.avgPnlPct / 1.2);
  const drawdownPenalty = clamp(Math.abs(metrics.maxDrawdownPct) / budget.maxDrawdownPct, 0, 3);
  const samplePenalty = metrics.tradeCount >= budget.minTradesPerEvaluation
    ? 0
    : (budget.minTradesPerEvaluation - metrics.tradeCount) / budget.minTradesPerEvaluation;
  return round(
    pnl * 0.42 +
    pf * 0.24 +
    winRate * 0.08 +
    averageTrade * 0.10 -
    drawdownPenalty * 0.32 -
    samplePenalty * 0.55,
    10,
  );
}

function median(values: number[]): number {
  if (!values.length) return Number.NEGATIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[], meanValue: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length);
}

function aggregateEvaluation(
  candidate: StrategyOptimizationCandidate,
  windows: StrategyOptimizationWindowResult[],
  durationMs: number,
  error?: string,
): StrategyOptimizationEvaluation {
  const utilities = windows.map((window) => window.utility);
  const meanUtility = utilities.length ? utilities.reduce((sum, value) => sum + value, 0) / utilities.length : Number.NEGATIVE_INFINITY;
  const worstUtility = utilities.length ? Math.min(...utilities) : Number.NEGATIVE_INFINITY;
  const dispersion = utilities.length ? standardDeviation(utilities, meanUtility) : Number.POSITIVE_INFINITY;
  const robustScore = error || !utilities.length
    ? Number.NEGATIVE_INFINITY
    : round(median(utilities) * 0.55 + meanUtility * 0.35 + worstUtility * 0.10 - dispersion * 0.35, 10);
  return {
    candidateId: candidate.id,
    values: { ...candidate.values },
    parameters: { ...candidate.parameters },
    scannerConfig: cloneScannerConfig(candidate.scannerConfig),
    windows,
    robustScore,
    meanUtility: round(meanUtility, 10),
    worstUtility: round(worstUtility, 10),
    dispersion: round(dispersion, 10),
    totalTrades: windows.reduce((sum, window) => sum + window.metrics.tradeCount, 0),
    durationMs: round(durationMs, 3),
    error,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Optimization aborted.', 'AbortError');
}

function windowIdentity(candles: BacktestCandle[]): string {
  if (!candles.length) return 'empty';
  const first = candles[0];
  const last = candles[candles.length - 1];
  let checksum = 2166136261;
  const stride = Math.max(1, Math.floor(candles.length / 32));
  for (let index = 0; index < candles.length; index += stride) {
    const candle = candles[index];
    const text = `${candle.time}|${candle.open}|${candle.high}|${candle.low}|${candle.close}|${candle.volume}`;
    for (let offset = 0; offset < text.length; offset += 1) {
      checksum ^= text.charCodeAt(offset);
      checksum = Math.imul(checksum, 16777619);
    }
  }
  return `${candles.length}:${first.time}:${last.time}:${checksum >>> 0}`;
}

function evaluationCacheKey(candidate: StrategyOptimizationCandidate, candles: BacktestCandle[], transactionCostPct: number): string {
  return `${candidateKey(candidate.values)}|${round(transactionCostPct, 8)}|${windowIdentity(candles)}`;
}

function changedFieldCount(values: Record<string, number>, fields: NumericOptimizationField[]): number {
  return fields.filter((field) => Math.abs((values[field.key] ?? field.base) - field.base) >= field.step * 0.5).length;
}

function evaluateParameterMovement(values: Record<string, number>, fields: NumericOptimizationField[]): string[] {
  const blockers: string[] = [];
  for (const field of fields) {
    const before = field.base;
    const after = values[field.key] ?? before;
    const range = Math.max(field.max - field.min, field.step);
    const normalizedMove = Math.abs(after - before) / range;
    if (normalizedMove > 0.55) blockers.push(`parameter_move_too_large:${field.key}`);
  }
  if (changedFieldCount(values, fields) > Math.max(6, Math.ceil(fields.length * 0.8))) blockers.push('too_many_fields_changed');
  return blockers;
}

function buildNeighborCandidates(
  winner: StrategyOptimizationEvaluation,
  fields: NumericOptimizationField[],
  baseParameters: Record<string, number | string>,
  baseScannerConfig: ScannerConfig,
): StrategyOptimizationCandidate[] {
  if (!fields.length) return [];
  const ranked = [...fields]
    .sort((left, right) => {
      const leftMove = Math.abs((winner.values[left.key] ?? left.base) - left.base) / Math.max(left.max - left.min, left.step);
      const rightMove = Math.abs((winner.values[right.key] ?? right.base) - right.base) / Math.max(right.max - right.min, right.step);
      return rightMove - leftMove;
    })
    .slice(0, 4);
  return ranked.flatMap((field, index) => [-1, 1].map((sign) => {
    const values = { ...winner.values, [field.key]: quantize((winner.values[field.key] ?? field.base) + sign * field.step, field) };
    return buildCandidate(`neighbor-${index + 1}-${sign > 0 ? 'up' : 'down'}`, fields, values, baseParameters, baseScannerConfig);
  }));
}

export async function optimizeStrategy(input: OptimizeStrategyInput): Promise<StrategyOptimizationReport> {
  const startedAt = performance.now();
  const budget = normalizeBudget(input.budget);
  const fields = buildStrategyOptimizationFields(input.definition, input.baseScannerConfig, input.baseParameters);
  if (!fields.length) throw new Error('strategy_optimizer_no_numeric_fields');
  if (input.candles.length < 400) throw new Error('strategy_optimizer_insufficient_history');
  throwIfAborted(input.signal);

  let split: ReturnType<typeof partitionFiveWayWithSealedHoldout>;
  try {
    split = partitionFiveWayWithSealedHoldout(input.candles, budget.purgeBars, budget.embargoBars, 40);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'sealed_holdout_insufficient_history') throw new Error('strategy_optimizer_insufficient_history');
    if (message === 'sealed_holdout_isolation_gap_too_large') throw new Error('strategy_optimizer_isolation_gap_too_large');
    if (message === 'sealed_holdout_isolated_window_too_small') throw new Error('strategy_optimizer_isolated_window_too_small');
    throw error;
  }
  const baseParameters = { ...(input.baseParameters || {}) };
  const validationPolicyFingerprint = fingerprintGovernanceConfiguration('validation-policy', {
    version: STRATEGY_OPTIMIZER_VALIDATION_POLICY_VERSION,
    purgeBars: budget.purgeBars,
    embargoBars: budget.embargoBars,
    minTradesPerEvaluation: budget.minTradesPerEvaluation,
    maxDrawdownPct: budget.maxDrawdownPct,
    minimumRobustImprovement: budget.minimumRobustImprovement,
    maximumOverfitGap: budget.maximumOverfitGap,
    costStressMultiplier: budget.costStressMultiplier,
    statisticalValidationPolicyVersion: STATISTICAL_VALIDATION_POLICY_VERSION,
  });
  const searchObjectiveFingerprint = fingerprintGovernanceConfiguration('search-objective', {
    version: STRATEGY_OPTIMIZER_OBJECTIVE_VERSION,
    coarseCandidates: budget.coarseCandidates,
    finalists: budget.finalists,
    refinementCandidates: budget.refinementCandidates,
    randomSeed: budget.randomSeed,
  });
  const hypothesisFingerprint = (candidate: StrategyOptimizationCandidate): string => fingerprintSelectionHypothesis({
    strategyId: input.definition.strategyId,
    strategyVersion: input.definition.version,
    parameters: candidate.parameters,
    scannerConfig: candidate.scannerConfig,
    searchObjectiveFingerprint,
  });
  const cache = new Map<string, Promise<StrategyOptimizationMetrics>>();
  let cacheHits = 0;
  let completedEvaluations = 0;
  const deadline = Date.now() + budget.timeoutMs;

  const runMetrics = async (candidate: StrategyOptimizationCandidate, candles: BacktestCandle[], transactionCostPct: number): Promise<StrategyOptimizationMetrics> => {
    throwIfAborted(input.signal);
    if (Date.now() > deadline) throw new Error('strategy_optimizer_timeout');
    const key = evaluationCacheKey(candidate, candles, transactionCostPct);
    const existing = cache.get(key);
    if (existing) {
      cacheHits += 1;
      return existing;
    }
    const pending = Promise.resolve(input.evaluator({
      candles,
      parameters: candidate.parameters,
      scannerConfig: candidate.scannerConfig,
      transactionCostPct,
      signal: input.signal,
    })).then((metrics) => {
      completedEvaluations += 1;
      return {
        totalPnlPct: finite(metrics.totalPnlPct),
        maxDrawdownPct: Math.abs(finite(metrics.maxDrawdownPct)),
        profitFactor: metrics.profitFactor !== null && Number.isFinite(metrics.profitFactor) ? Number(metrics.profitFactor) : null,
        tradeCount: Math.max(0, Math.floor(finite(metrics.tradeCount))),
        winRatePct: clamp(finite(metrics.winRatePct), 0, 100),
        avgPnlPct: finite(metrics.avgPnlPct),
      };
    }).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
    return pending;
  };

  const evaluate = async (
    candidate: StrategyOptimizationCandidate,
    windows: Array<{ label: string; candles: BacktestCandle[] }>,
    transactionCostPct = input.transactionCostPct,
  ): Promise<StrategyOptimizationEvaluation> => {
    const candidateStartedAt = performance.now();
    try {
      const results: StrategyOptimizationWindowResult[] = [];
      for (const window of windows) {
        const metrics = await runMetrics(candidate, window.candles, transactionCostPct);
        results.push({
          label: window.label,
          from: Date.parse(window.candles[0].time),
          to: Date.parse(window.candles.at(-1)?.time || window.candles[0].time),
          metrics,
          utility: utility(metrics, budget),
        });
      }
      return aggregateEvaluation(candidate, results, performance.now() - candidateStartedAt);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return aggregateEvaluation(candidate, [], performance.now() - candidateStartedAt, error instanceof Error ? error.message : 'optimization_evaluation_failed');
    }
  };

  const coarse = generateCoarseCandidates(fields, budget.coarseCandidates, budget.randomSeed, baseParameters, input.baseScannerConfig);
  const firstTrainWindow = split.train.slice(0, 1);
  const firstPassResults = await mapLimit(coarse, budget.maxConcurrent, (candidate) => evaluate(candidate, firstTrainWindow));
  const baselineFirstPass = firstPassResults.find((row) => row.candidateId === 'baseline');
  if (!baselineFirstPass) throw new Error('strategy_optimizer_baseline_missing');

  // Successive halving avoids paying for every candidate on every window. The
  // baseline is always retained, and only the strongest candidates receive
  // progressively more expensive chronological evidence.
  const secondaryCount = Math.min(coarse.length, Math.max(budget.finalists * 2, budget.finalists + 2));
  const secondary = firstPassResults
    .filter((row) => !row.error)
    .sort((left, right) => right.robustScore - left.robustScore)
    .slice(0, secondaryCount);
  if (!secondary.some((row) => row.candidateId === 'baseline')) secondary.push(baselineFirstPass);
  const secondaryCandidates = secondary.map((evaluation) => buildCandidate(
    evaluation.candidateId,
    fields,
    evaluation.values,
    baseParameters,
    input.baseScannerConfig,
  ));
  const secondaryResults = await mapLimit(secondaryCandidates, budget.maxConcurrent, (candidate) => evaluate(candidate, split.train.slice(0, 2)));
  const baselineSecondary = secondaryResults.find((row) => row.candidateId === 'baseline') ?? baselineFirstPass;
  const finalists = secondaryResults
    .filter((row) => !row.error)
    .sort((left, right) => right.robustScore - left.robustScore)
    .slice(0, budget.finalists);
  if (!finalists.some((row) => row.candidateId === 'baseline')) finalists.push(baselineSecondary);

  const finalistCandidates = finalists.map((evaluation) => buildCandidate(
    evaluation.candidateId,
    fields,
    evaluation.values,
    baseParameters,
    input.baseScannerConfig,
  ));
  const fullSelectionWindows = [...split.train, split.validation];
  const finalistResults = await mapLimit(finalistCandidates, budget.maxConcurrent, (candidate) => evaluate(candidate, fullSelectionWindows));
  const refinementCandidates = generateRefinementCandidates(
    fields,
    finalistResults.filter((row) => !row.error).sort((left, right) => right.robustScore - left.robustScore),
    budget.refinementCandidates,
    baseParameters,
    input.baseScannerConfig,
  );
  const refinementScreen = await mapLimit(refinementCandidates, budget.maxConcurrent, (candidate) => evaluate(candidate, split.train.slice(0, 2)));
  const refinementFinalistCount = Math.min(refinementCandidates.length, Math.max(3, Math.ceil(budget.finalists / 2)));
  const refinementFinalists = refinementScreen
    .filter((row) => !row.error)
    .sort((left, right) => right.robustScore - left.robustScore)
    .slice(0, refinementFinalistCount)
    .map((evaluation) => buildCandidate(evaluation.candidateId, fields, evaluation.values, baseParameters, input.baseScannerConfig));
  const refinementResults = await mapLimit(refinementFinalists, budget.maxConcurrent, (candidate) => evaluate(candidate, fullSelectionWindows));
  const selectionResults = [...finalistResults, ...refinementResults]
    .filter((row) => !row.error)
    .sort((left, right) => right.robustScore - left.robustScore);
  const baseline = selectionResults.find((row) => row.candidateId === 'baseline')
    ?? await evaluate(buildCandidate('baseline', fields, Object.fromEntries(fields.map((field) => [field.key, field.base])), baseParameters, input.baseScannerConfig), fullSelectionWindows);
  const winner = selectionResults[0] ?? baseline;

  const winnerCandidate = buildCandidate(winner.candidateId, fields, winner.values, baseParameters, input.baseScannerConfig);
  // Neighbor and cost-stress development checks run only on the pre-holdout
  // validation window. Candidate identity is frozen only after these pass.
  const costStressEval = await evaluate(
    winnerCandidate,
    [{ label: 'development-cost-stress', candles: split.validation.candles }],
    input.transactionCostPct * budget.costStressMultiplier,
  );
  const costStress = costStressEval.windows[0];
  const neighborCandidates = buildNeighborCandidates(winner, fields, baseParameters, input.baseScannerConfig);
  const neighbors = await mapLimit(neighborCandidates, budget.maxConcurrent, (candidate) => evaluate(candidate, [split.validation]));
  const neighborPassRate = neighbors.length
    ? neighbors.filter((row) => !row.error && row.robustScore >= baseline.robustScore).length / neighbors.length
    : 0;

  const robustImprovement = winner.robustScore - baseline.robustScore;
  const developmentBlockers = evaluateParameterMovement(winner.values, fields);
  if (winner.candidateId === 'baseline') developmentBlockers.push('baseline_remains_best');
  if (robustImprovement < budget.minimumRobustImprovement) developmentBlockers.push('robust_improvement_below_minimum');
  if (!costStress || costStress.metrics.totalPnlPct <= 0 || (costStress.metrics.profitFactor ?? 0) < 1) developmentBlockers.push('development_cost_stress_failed');
  if (neighborPassRate < 0.60) developmentBlockers.push('neighbor_stability_failed');
  if (developmentBlockers.length) {
    throw new Error(`strategy_optimizer_development_gates_failed:${[...new Set(developmentBlockers)].join(',')}`);
  }

  const selectionHypothesisFingerprints = distinctSelectionHypothesisFingerprints(
    [...coarse, ...refinementCandidates].map(hypothesisFingerprint),
  );
  const fullMatrixCandidates = selectionResults.map((evaluation) => buildCandidate(
    evaluation.candidateId,
    fields,
    evaluation.values,
    baseParameters,
    input.baseScannerConfig,
  ));
  const developmentPbo = computeCscvPbo({
    source: 'DEVELOPMENT_SELECTION_MATRIX',
    candidateFingerprints: fullMatrixCandidates.map(hypothesisFingerprint),
    partitionLabels: fullSelectionWindows.map((window) => window.label),
    matrix: selectionResults.map((evaluation) => evaluation.windows.map((window) => window.utility)),
  });
  // Optimization is selection/development only. The fifth partition is sealed
  // at partition time and is NEVER exposed to this function. This prevents the
  // search/council from spending the codebase-wide final governance holdout
  // before the candidate-matched validation suite has frozen all development
  // choices. The sealed dataset fingerprint may be recorded as identity only;
  // its rows are inaccessible here.
  const candidateFingerprint = fingerprintGovernanceConfiguration('optimizer-development-candidate', {
    strategyId: input.definition.strategyId,
    strategyVersion: input.definition.version,
    parameters: winnerCandidate.parameters,
    scannerConfig: winnerCandidate.scannerConfig,
    transactionCostProfileFingerprint: `cost-profile:roundtrip:${input.transactionCostPct}`,
    validationPolicyFingerprint,
    searchObjectiveFingerprint,
    developmentDatasetFingerprint: split.developmentDatasetFingerprint,
    featureVersions: [STRATEGY_OPTIMIZER_VERSION, 'closed_candle_validator_v1', 'transaction_cost_model_v3_event_time'],
    authorityConfiguration: { direction: input.direction, interval: input.interval },
  });
  const finalHoldoutDatasetFingerprint = split.holdout.metadata.datasetFingerprint;

  const candidateDevelopment = winner.windows.find((window) => window.label === split.validation.label)
    ?? winner.windows.at(-1);
  const baselineDevelopment = baseline.windows.find((window) => window.label === split.validation.label)
    ?? baseline.windows.at(-1);
  if (!candidateDevelopment || !baselineDevelopment) {
    throw new Error('development_validation_comparator_missing');
  }
  const developmentValidationImprovement = candidateDevelopment.utility - baselineDevelopment.utility;
  const trainUtilities = winner.windows.filter((window) => window.label.startsWith('train-')).map((window) => window.utility);
  const meanTrainUtility = trainUtilities.length ? trainUtilities.reduce((sum, value) => sum + value, 0) / trainUtilities.length : winner.meanUtility;
  const overfitGap = Math.max(0, meanTrainUtility - candidateDevelopment.utility);
  const blockers: string[] = [];
  if (candidateDevelopment.metrics.totalPnlPct <= 0) blockers.push('development_validation_return_not_positive');
  if ((candidateDevelopment.metrics.profitFactor ?? 0) < 1.05) blockers.push('development_validation_profit_factor_below_1_05');
  if (candidateDevelopment.metrics.tradeCount < budget.minTradesPerEvaluation) blockers.push('development_validation_trade_count_too_low');
  if (candidateDevelopment.metrics.maxDrawdownPct > budget.maxDrawdownPct) blockers.push('development_validation_drawdown_exceeds_limit');
  if (overfitGap > budget.maximumOverfitGap) blockers.push('development_overfit_gap_exceeds_limit');
  const uniqueBlockers = [...new Set(blockers)];
  const eligible = uniqueBlockers.length === 0;
  const warnings = [
    'Optimization is development-only: candidate search, cost stress, neighbors and CSCV/PBO run without opening the final sealed governance holdout.',
    input.autoPromote
      ? 'Automatic promotion was requested, but optimization alone can only nominate a candidate for separate FULL_STRATEGY final validation.'
      : 'The optimizer can only nominate a development-eligible candidate; final sealed validation and explicit promotion governance remain separate.',
  ];
  const theoreticalWindowEvaluations = (coarse.length + refinementCandidates.length) * fullSelectionWindows.length
    + 3
    + neighborCandidates.length;
  const reductionPct = theoreticalWindowEvaluations > 0
    ? Math.max(0, (1 - completedEvaluations / theoreticalWindowEvaluations) * 100)
    : 0;

  return {
    version: STRATEGY_OPTIMIZER_VERSION,
    generatedAt: Date.now(),
    generatedAtIso: new Date().toISOString(),
    strategyId: input.definition.strategyId,
    strategyVersion: input.definition.version,
    symbol: input.symbol,
    interval: input.interval,
    direction: input.direction,
    budget,
    validationIsolation: { purgeBars: budget.purgeBars, embargoBars: budget.embargoBars },
    candidateFingerprint,
    finalHoldoutDatasetFingerprint,
    developmentDatasetFingerprint: split.developmentDatasetFingerprint,
    validationPolicyFingerprint,
    searchObjectiveFingerprint,
    selectionHypothesisFingerprints,
    selectionHypothesisCount: selectionHypothesisFingerprints.length,
    developmentPbo,
    finalHoldoutStatus: 'SEALED_NOT_OPENED_DURING_OPTIMIZATION',
    authorityStage: 'RESEARCH',
    fields,
    baseline,
    winner,
    developmentValidation: {
      baseline: { ...baselineDevelopment, label: 'development-baseline-comparator' },
      candidate: { ...candidateDevelopment, label: 'development-validation-candidate' },
      costStress,
      neighbors,
    },
    promotion: {
      eligible,
      automaticallyPromoted: false,
      blockers: uniqueBlockers,
      evidenceScope: 'DEVELOPMENT_ONLY',
      baselineDevelopmentUtility: baselineDevelopment.utility,
      candidateDevelopmentUtility: candidateDevelopment.utility,
      robustImprovement: round(robustImprovement, 10),
      developmentValidationImprovement: round(developmentValidationImprovement, 10),
      overfitGap: round(overfitGap, 10),
      neighborPassRate: round(neighborPassRate, 6),
    },
    triedCandidates: selectionHypothesisFingerprints.length,
    completedEvaluations,
    cacheHits,
    searchEfficiency: {
      theoreticalWindowEvaluations,
      completedWindowEvaluations: completedEvaluations,
      reductionPct: round(reductionPct, 3),
    },
    durationMs: round(performance.now() - startedAt, 3),
    warnings,
  };
}
