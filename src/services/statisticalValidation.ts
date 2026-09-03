import { createHash } from 'node:crypto';

export const STATISTICAL_VALIDATION_VERSION = 'statistical_validation_v2_selection_integrity';
export const STATISTICAL_VALIDATION_POLICY_VERSION = 'statistical_validation_policy_v2';
export const BLOCK_LENGTH_METHOD_VERSION = 'acf_decay_block_length_v1';
export const CSCV_PBO_VERSION = 'cscv_pbo_v1_development_only';

export interface StatisticalValidationPolicy {
  familyWiseAlpha: number;
  minimumRawSample: number;
  minimumEffectiveSample: number;
  bootstrapSamples: number;
  blockLengthMethod: typeof BLOCK_LENGTH_METHOD_VERSION;
  multiplicityMethod: 'DISTINCT_SELECTION_HYPOTHESES';
}

export interface StatisticalValidationResult {
  version: typeof STATISTICAL_VALIDATION_VERSION;
  policyVersion: typeof STATISTICAL_VALIDATION_POLICY_VERSION;
  policyFingerprint: string;
  observations: number;
  effectiveSampleSize: number;
  lagOneAutocorrelation: number;
  triedVariants: number;
  multiplicityMethod: 'DISTINCT_SELECTION_HYPOTHESES';
  selectionHypothesisFingerprints: string[];
  familyWiseAlpha: number;
  correctedAlpha: number;
  blockLength: number;
  blockLengthMethod: typeof BLOCK_LENGTH_METHOD_VERSION;
  legacySqrtBlockLength: number;
  bootstrapSamples: number;
  meanReturnPct: number;
  lowerConfidenceBoundPct: number | null;
  upperConfidenceBoundPct: number | null;
  legacySqrtLowerConfidenceBoundPct: number | null;
  legacySqrtUpperConfidenceBoundPct: number | null;
  probabilityPositiveMean: number | null;
  deflatedSharpeRatioProbability: number | null;
  passed: boolean;
  blockers: string[];
}

export interface DevelopmentSelectionMatrix {
  source: 'DEVELOPMENT_SELECTION_MATRIX';
  candidateFingerprints: string[];
  partitionLabels: string[];
  /** candidate-major matrix: matrix[candidate][development partition] */
  matrix: number[][];
}

export interface CscvPboResult {
  version: typeof CSCV_PBO_VERSION;
  source: 'DEVELOPMENT_SELECTION_MATRIX';
  state: 'OK' | 'INSUFFICIENT_STRUCTURE';
  pbo: number | null;
  combinationsEvaluated: number;
  candidateCount: number;
  partitionCount: number;
  logits: number[];
  reason: string | null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function fingerprint(prefix: string, value: unknown): string {
  return `${prefix}:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

export function fingerprintSelectionHypothesis(value: unknown): string {
  return fingerprint('selection-hypothesis', value);
}

export function distinctSelectionHypothesisFingerprints(values: readonly string[] | undefined): string[] {
  const normalized = (values ?? []).map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(normalized)].sort();
}

function quantile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * probability));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sampleStdDev(values: readonly number[], average = mean(values)): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function autocorrelationAtLag(values: readonly number[], average: number, lag: number): number {
  if (lag < 1 || values.length <= lag + 1) return 0;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const centered = values[index] - average;
    denominator += centered * centered;
    if (index >= lag) numerator += centered * (values[index - lag] - average);
  }
  if (denominator <= Number.EPSILON) return 0;
  return Math.max(-0.99, Math.min(0.99, numerator / denominator));
}

function lagOneAutocorrelation(values: number[], average: number): number {
  return autocorrelationAtLag(values, average, 1);
}

/**
 * Deterministic, data-driven block selection. We estimate the dependence horizon
 * from the empirical ACF rather than assuming sqrt(N). The first two consecutive
 * lags below the 95% white-noise bound terminate the dependence run; the block
 * covers 1.5x the last materially dependent lag and is bounded by N/4.
 */
export function selectDeterministicBlockLength(values: readonly number[]): number {
  const finite = values.filter(Number.isFinite);
  const n = finite.length;
  if (n < 4) return 1;
  const average = mean(finite);
  const significance = 1.96 / Math.sqrt(n);
  const maxLag = Math.max(1, Math.min(100, Math.floor(n / 4)));
  let lastDependentLag = 1;
  let quietRun = 0;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    const acf = Math.abs(autocorrelationAtLag(finite, average, lag));
    if (acf > significance) {
      lastDependentLag = lag;
      quietRun = 0;
    } else {
      quietRun += 1;
      if (quietRun >= 2) break;
    }
  }
  return Math.max(1, Math.min(Math.max(1, Math.floor(n / 4)), Math.ceil(lastDependentLag * 1.5)));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function movingBlockBootstrapMeans(values: readonly number[], blockLength: number, samples: number, seed: number): number[] {
  if (!values.length) return [];
  const random = seededRandom(seed);
  const means: number[] = [];
  for (let sample = 0; sample < samples; sample += 1) {
    let total = 0;
    let count = 0;
    while (count < values.length) {
      const start = Math.floor(random() * values.length);
      for (let offset = 0; offset < blockLength && count < values.length; offset += 1) {
        total += values[(start + offset) % values.length];
        count += 1;
      }
    }
    means.push(total / values.length);
  }
  return means;
}

function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * z);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z));
  return 0.5 * (1 + erf);
}

// Acklam inverse-normal approximation, deterministic and sufficient for DSR governance diagnostics.
function inverseNormalCdf(p: number): number {
  const probability = Math.max(1e-12, Math.min(1 - 1e-12, p));
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (probability < plow) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (probability > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = probability - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function skewness(values: readonly number[], average: number, standardDeviation: number): number {
  if (values.length < 3 || standardDeviation <= Number.EPSILON) return 0;
  return values.reduce((sum, value) => sum + ((value - average) / standardDeviation) ** 3, 0) / values.length;
}

function kurtosis(values: readonly number[], average: number, standardDeviation: number): number {
  if (values.length < 4 || standardDeviation <= Number.EPSILON) return 3;
  return values.reduce((sum, value) => sum + ((value - average) / standardDeviation) ** 4, 0) / values.length;
}

function deflatedSharpeProbability(values: readonly number[], triedVariants: number): number | null {
  if (values.length < 3) return null;
  const average = mean(values);
  const sd = sampleStdDev(values, average);
  if (sd <= Number.EPSILON) return average > 0 ? 1 : 0;
  const observedSharpe = average / sd;
  const trials = Math.max(1, triedVariants);
  const eulerGamma = 0.5772156649015329;
  const nullSharpeSigma = 1 / Math.sqrt(Math.max(1, values.length - 1));
  const expectedMaxSharpe = trials <= 1 ? 0 : nullSharpeSigma * (
    (1 - eulerGamma) * inverseNormalCdf(1 - 1 / trials) +
    eulerGamma * inverseNormalCdf(1 - 1 / (trials * Math.E))
  );
  const skew = skewness(values, average, sd);
  const kurt = kurtosis(values, average, sd);
  const denominator = Math.sqrt(Math.max(1e-12, 1 - skew * observedSharpe + ((kurt - 1) / 4) * observedSharpe ** 2));
  const statistic = (observedSharpe - expectedMaxSharpe) * Math.sqrt(Math.max(1, values.length - 1)) / denominator;
  return Math.max(0, Math.min(1, normalCdf(statistic)));
}

export function statisticalValidationPolicyFingerprint(policy: StatisticalValidationPolicy): string {
  return fingerprint('statistical-policy', { version: STATISTICAL_VALIDATION_POLICY_VERSION, ...policy });
}

/**
 * Moving-block bootstrap with deterministic ACF-derived block length. Multiplicity
 * is the number of DISTINCT selection-eligible hypotheses supplied by fingerprint,
 * not the number of folds, stress runs, neighbor diagnostics, or evaluator calls.
 */
export function validateReturnEvidence(
  rawReturnsPct: number[],
  options: {
    selectionHypothesisFingerprints?: string[];
    /** Legacy compatibility only. New production callers should supply fingerprints. */
    triedVariants?: number;
    familyWiseAlpha?: number;
    bootstrapSamples?: number;
    seed?: number;
    minimumRawSample?: number;
    minimumEffectiveSample?: number;
  } = {},
): StatisticalValidationResult {
  const returns = rawReturnsPct.filter(Number.isFinite);
  const observations = returns.length;
  const selectionHypothesisFingerprints = distinctSelectionHypothesisFingerprints(options.selectionHypothesisFingerprints);
  const triedVariants = selectionHypothesisFingerprints.length || Math.max(1, Math.floor(options.triedVariants ?? 1));
  const familyWiseAlpha = Math.max(0.001, Math.min(0.20, options.familyWiseAlpha ?? 0.05));
  const correctedAlpha = familyWiseAlpha / triedVariants;
  const bootstrapSamples = Math.max(500, Math.floor(options.bootstrapSamples ?? 2_000));
  const minimumRawSample = Math.max(1, Math.floor(options.minimumRawSample ?? 30));
  const minimumEffectiveSample = Math.max(1, Math.floor(options.minimumEffectiveSample ?? 20));
  const policy: StatisticalValidationPolicy = {
    familyWiseAlpha,
    minimumRawSample,
    minimumEffectiveSample,
    bootstrapSamples,
    blockLengthMethod: BLOCK_LENGTH_METHOD_VERSION,
    multiplicityMethod: 'DISTINCT_SELECTION_HYPOTHESES',
  };
  const meanReturnPct = mean(returns);
  const rho = lagOneAutocorrelation(returns, meanReturnPct);
  const effectiveSampleSize = observations
    ? Math.max(1, Math.min(observations, observations * (1 - rho) / (1 + rho)))
    : 0;
  const blockLength = selectDeterministicBlockLength(returns);
  const legacySqrtBlockLength = Math.max(1, Math.min(observations || 1, Math.ceil(Math.sqrt(Math.max(1, observations)))));
  const seed = options.seed ?? 0x41504558;
  const means = movingBlockBootstrapMeans(returns, blockLength, bootstrapSamples, seed);
  const legacyMeans = movingBlockBootstrapMeans(returns, legacySqrtBlockLength, bootstrapSamples, seed);
  const lowerConfidenceBoundPct = quantile(means, correctedAlpha);
  const upperConfidenceBoundPct = quantile(means, 1 - correctedAlpha);
  const legacySqrtLowerConfidenceBoundPct = quantile(legacyMeans, correctedAlpha);
  const legacySqrtUpperConfidenceBoundPct = quantile(legacyMeans, 1 - correctedAlpha);
  const probabilityPositiveMean = means.length ? means.filter((value) => value > 0).length / means.length : null;
  const dsr = deflatedSharpeProbability(returns, triedVariants);
  const blockers: string[] = [];
  if (observations < minimumRawSample) blockers.push(`raw_sample_below_${minimumRawSample}`);
  if (effectiveSampleSize < minimumEffectiveSample) blockers.push(`effective_sample_below_${minimumEffectiveSample}`);
  if (lowerConfidenceBoundPct === null || lowerConfidenceBoundPct <= 0) blockers.push('multiplicity_corrected_lower_bound_not_positive');
  return {
    version: STATISTICAL_VALIDATION_VERSION,
    policyVersion: STATISTICAL_VALIDATION_POLICY_VERSION,
    policyFingerprint: statisticalValidationPolicyFingerprint(policy),
    observations,
    effectiveSampleSize: Number(effectiveSampleSize.toFixed(3)),
    lagOneAutocorrelation: Number(rho.toFixed(6)),
    triedVariants,
    multiplicityMethod: 'DISTINCT_SELECTION_HYPOTHESES',
    selectionHypothesisFingerprints,
    familyWiseAlpha,
    correctedAlpha,
    blockLength,
    blockLengthMethod: BLOCK_LENGTH_METHOD_VERSION,
    legacySqrtBlockLength,
    bootstrapSamples,
    meanReturnPct: Number(meanReturnPct.toFixed(8)),
    lowerConfidenceBoundPct: lowerConfidenceBoundPct === null ? null : Number(lowerConfidenceBoundPct.toFixed(8)),
    upperConfidenceBoundPct: upperConfidenceBoundPct === null ? null : Number(upperConfidenceBoundPct.toFixed(8)),
    legacySqrtLowerConfidenceBoundPct: legacySqrtLowerConfidenceBoundPct === null ? null : Number(legacySqrtLowerConfidenceBoundPct.toFixed(8)),
    legacySqrtUpperConfidenceBoundPct: legacySqrtUpperConfidenceBoundPct === null ? null : Number(legacySqrtUpperConfidenceBoundPct.toFixed(8)),
    probabilityPositiveMean: probabilityPositiveMean === null ? null : Number(probabilityPositiveMean.toFixed(6)),
    deflatedSharpeRatioProbability: dsr === null ? null : Number(dsr.toFixed(8)),
    passed: blockers.length === 0,
    blockers,
  };
}

function combinations(values: number[], choose: number): number[][] {
  const output: number[][] = [];
  const visit = (start: number, current: number[]) => {
    if (current.length === choose) {
      output.push([...current]);
      return;
    }
    for (let index = start; index <= values.length - (choose - current.length); index += 1) {
      current.push(values[index]);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return output;
}

/**
 * CSCV/PBO is computed ONLY from the development/selection candidate matrix.
 * The sealed final holdout is structurally unavailable at the optimizer call site.
 */
export function computeCscvPbo(input: DevelopmentSelectionMatrix): CscvPboResult {
  if (input.source !== 'DEVELOPMENT_SELECTION_MATRIX') throw new Error('pbo_requires_development_selection_matrix');
  const candidateCount = input.candidateFingerprints.length;
  const partitionCount = input.partitionLabels.length;
  const insufficient = (reason: string): CscvPboResult => ({
    version: CSCV_PBO_VERSION,
    source: 'DEVELOPMENT_SELECTION_MATRIX',
    state: 'INSUFFICIENT_STRUCTURE',
    pbo: null,
    combinationsEvaluated: 0,
    candidateCount,
    partitionCount,
    logits: [],
    reason,
  });
  if (candidateCount < 4) return insufficient('at_least_four_selection_candidates_required');
  if (partitionCount < 4 || partitionCount % 2 !== 0) return insufficient('even_partition_count_at_least_four_required');
  if (input.matrix.length !== candidateCount || input.matrix.some((row) => row.length !== partitionCount || row.some((value) => !Number.isFinite(value)))) {
    return insufficient('complete_finite_candidate_partition_matrix_required');
  }
  const uniqueFingerprints = distinctSelectionHypothesisFingerprints(input.candidateFingerprints);
  if (uniqueFingerprints.length !== candidateCount) return insufficient('candidate_fingerprints_must_be_distinct');

  const partitionIndices = Array.from({ length: partitionCount }, (_, index) => index);
  const inSampleSets = combinations(partitionIndices, partitionCount / 2);
  // Guard pathological matrices while keeping deterministic coverage.
  if (inSampleSets.length > 5_000) return insufficient('partition_structure_exceeds_bounded_cscv_budget');
  const logits: number[] = [];
  for (const inSample of inSampleSets) {
    const inSet = new Set(inSample);
    const outSample = partitionIndices.filter((index) => !inSet.has(index));
    const inScores = input.matrix.map((row) => mean(inSample.map((index) => row[index])));
    let selected = 0;
    for (let candidate = 1; candidate < candidateCount; candidate += 1) {
      if (inScores[candidate] > inScores[selected] || (inScores[candidate] === inScores[selected] && input.candidateFingerprints[candidate] < input.candidateFingerprints[selected])) {
        selected = candidate;
      }
    }
    const outScores = input.matrix.map((row) => mean(outSample.map((index) => row[index])));
    const ranked = outScores.map((score, candidate) => ({ score, candidate, fingerprint: input.candidateFingerprints[candidate] }))
      .sort((left, right) => left.score - right.score || left.fingerprint.localeCompare(right.fingerprint));
    const rank = ranked.findIndex((row) => row.candidate === selected) + 1; // 1 = worst, N = best
    const relativeRank = rank / (candidateCount + 1);
    logits.push(Math.log(relativeRank / (1 - relativeRank)));
  }
  const pbo = logits.length ? logits.filter((value) => value <= 0).length / logits.length : null;
  return {
    version: CSCV_PBO_VERSION,
    source: 'DEVELOPMENT_SELECTION_MATRIX',
    state: logits.length ? 'OK' : 'INSUFFICIENT_STRUCTURE',
    pbo: pbo === null ? null : Number(pbo.toFixed(8)),
    combinationsEvaluated: logits.length,
    candidateCount,
    partitionCount,
    logits: logits.map((value) => Number(value.toFixed(8))),
    reason: logits.length ? null : 'no_cscv_combinations',
  };
}
