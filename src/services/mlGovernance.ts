import type { AdaptiveMarketRegime, SignalDecisionLog } from '../types';
import { extractFeatures, ML_FEATURE_NAMES } from './mlFeatureExtractor';
import { scoreShadowMlValues, validateShadowMlModelFile, type ShadowMlModelFile } from './shadowMlModel';

export const ML_GOVERNANCE_VERSION = 'ml_governance_v1';

export interface ReliabilityBucket {
  lower: number;
  upper: number;
  count: number;
  predictedMean: number | null;
  realizedWinRate: number | null;
  absoluteGap: number | null;
}

export interface CalibrationMetrics {
  observations: number;
  brierScore: number | null;
  expectedCalibrationError: number | null;
  maximumCalibrationError: number | null;
  reliability: ReliabilityBucket[];
}

export interface DriftMetric {
  state: 'OK' | 'WARN' | 'HIGH' | 'UNAVAILABLE';
  value: number | null;
  thresholdWarn: number;
  thresholdHigh: number;
}

export interface MlGovernanceReport {
  version: typeof ML_GOVERNANCE_VERSION;
  modelId: string | null;
  generatedAt: string;
  mode: 'SHADOW_ONLY';
  promotionState: 'NO_MODEL' | 'INSUFFICIENT_DATA' | 'BLOCKED' | 'ELIGIBLE_FOR_MANUAL_REVIEW';
  authoritative: false;
  sample: { totalResolved: number; reference: number; recent: number; skippedIncomplete: number };
  calibration: CalibrationMetrics;
  calibrationByRegime: Partial<Record<AdaptiveMarketRegime, CalibrationMetrics>>;
  drift: {
    predictionPsi: DriftMetric;
    featureMeanShift: DriftMetric;
    brierDelta: DriftMetric;
    topFeatureShifts: Array<{ feature: string; standardizedMeanShift: number }>;
  };
  gates: Array<{ code: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string }>;
  recommendedAction: string;
}

interface ScoredObservation {
  probability: number;
  outcome: 0 | 1;
  features: number[];
  regime: AdaptiveMarketRegime;
  timestamp: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const mean = (values: number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function regimeFor(log: SignalDecisionLog): AdaptiveMarketRegime {
  if ((log.squeezeRiskScore ?? 0) > 0.58) return 'SQUEEZE_RISK';
  if ((log.liquidityQualityScore ?? 1) < 0.48) return 'THIN_BOOK';
  if ((log.qStructDirectional ?? 0) > 0.30 && (log.evidenceAgreementScore ?? 0) > 0.52) return 'TREND_UP';
  if ((log.qStructDirectional ?? 0) < -0.30 && (log.evidenceAgreementScore ?? 0) > 0.52) return 'TREND_DOWN';
  if ((log.evidenceAgreementScore ?? 1) < 0.44) return 'CHOP';
  return 'MIXED';
}

export function calculateCalibrationMetrics(
  observations: Array<{ probability: number; outcome: 0 | 1 }>,
  bucketCount = 10,
): CalibrationMetrics {
  const valid = observations.filter((row) => Number.isFinite(row.probability) && (row.outcome === 0 || row.outcome === 1));
  const buckets: ReliabilityBucket[] = Array.from({ length: bucketCount }, (_, index) => ({
    lower: index / bucketCount,
    upper: (index + 1) / bucketCount,
    count: 0,
    predictedMean: null,
    realizedWinRate: null,
    absoluteGap: null,
  }));
  for (const row of valid) {
    const probability = clamp01(row.probability);
    const index = Math.min(bucketCount - 1, Math.floor(probability * bucketCount));
    const bucket = buckets[index] as ReliabilityBucket & { probabilities?: number[]; outcomes?: number[] };
    bucket.probabilities = [...(bucket.probabilities || []), probability];
    bucket.outcomes = [...(bucket.outcomes || []), row.outcome];
    bucket.count += 1;
  }
  let weightedGap = 0;
  let maxGap = 0;
  for (const bucket of buckets as Array<ReliabilityBucket & { probabilities?: number[]; outcomes?: number[] }>) {
    if (!bucket.count) continue;
    bucket.predictedMean = mean(bucket.probabilities || []);
    bucket.realizedWinRate = mean(bucket.outcomes || []);
    bucket.absoluteGap = Math.abs((bucket.predictedMean || 0) - (bucket.realizedWinRate || 0));
    weightedGap += bucket.absoluteGap * bucket.count;
    maxGap = Math.max(maxGap, bucket.absoluteGap);
    delete bucket.probabilities;
    delete bucket.outcomes;
  }
  const brier = valid.length ? valid.reduce((sum, row) => sum + (clamp01(row.probability) - row.outcome) ** 2, 0) / valid.length : null;
  return {
    observations: valid.length,
    brierScore: brier,
    expectedCalibrationError: valid.length ? weightedGap / valid.length : null,
    maximumCalibrationError: valid.length ? maxGap : null,
    reliability: buckets,
  };
}

function psi(reference: number[], recent: number[], bins = 10): number | null {
  if (reference.length < 20 || recent.length < 20) return null;
  let total = 0;
  for (let index = 0; index < bins; index += 1) {
    const low = index / bins;
    const high = (index + 1) / bins;
    const inBin = (value: number) => value >= low && (index === bins - 1 ? value <= high : value < high);
    const refPct = Math.max(1e-6, reference.filter(inBin).length / reference.length);
    const recentPct = Math.max(1e-6, recent.filter(inBin).length / recent.length);
    total += (recentPct - refPct) * Math.log(recentPct / refPct);
  }
  return total;
}

function metric(value: number | null, warn: number, high: number): DriftMetric {
  return {
    state: value == null ? 'UNAVAILABLE' : value >= high ? 'HIGH' : value >= warn ? 'WARN' : 'OK',
    value,
    thresholdWarn: warn,
    thresholdHigh: high,
  };
}

function scoreRows(logs: SignalDecisionLog[], model: ShadowMlModelFile): { rows: ScoredObservation[]; skipped: number } {
  const rows: ScoredObservation[] = [];
  let skipped = 0;
  for (const log of logs) {
    if (log.laterOutcome !== 'WIN' && log.laterOutcome !== 'LOSS') continue;
    const vector = extractFeatures(log);
    if (!vector) { skipped += 1; continue; }
    rows.push({
      probability: scoreShadowMlValues(model, vector.values),
      outcome: log.laterOutcome === 'WIN' ? 1 : 0,
      features: vector.values,
      regime: regimeFor(log),
      timestamp: log.timestamp,
    });
  }
  rows.sort((a, b) => a.timestamp - b.timestamp);
  return { rows, skipped };
}

export function evaluateMlGovernance(
  logs: SignalDecisionLog[],
  model: ShadowMlModelFile | null,
  options: { minResolved?: number; recentFraction?: number } = {},
): MlGovernanceReport {
  const generatedAt = new Date().toISOString();
  const validation = model ? validateShadowMlModelFile(model) : ['No model supplied.'];
  const emptyCalibration = calculateCalibrationMetrics([]);
  if (!model || validation.length) {
    return {
      version: ML_GOVERNANCE_VERSION, modelId: model?.modelId ?? null, generatedAt, mode: 'SHADOW_ONLY', promotionState: 'NO_MODEL', authoritative: false,
      sample: { totalResolved: 0, reference: 0, recent: 0, skippedIncomplete: 0 }, calibration: emptyCalibration, calibrationByRegime: {},
      drift: { predictionPsi: metric(null, 0.10, 0.25), featureMeanShift: metric(null, 0.35, 0.75), brierDelta: metric(null, 0.03, 0.07), topFeatureShifts: [] },
      gates: [{ code: 'MODEL_VALIDATION', status: 'FAIL', detail: validation.join(' ') }],
      recommendedAction: 'Keep ML disabled and provide a valid shadow model file.',
    };
  }
  const scored = scoreRows(logs, model);
  const minResolved = Math.max(40, options.minResolved ?? 120);
  const recentFraction = Math.max(0.2, Math.min(0.5, options.recentFraction ?? 0.3));
  const split = Math.max(1, Math.floor(scored.rows.length * (1 - recentFraction)));
  const reference = scored.rows.slice(0, split);
  const recent = scored.rows.slice(split);
  const calibration = calculateCalibrationMetrics(recent);
  const calibrationByRegime: Partial<Record<AdaptiveMarketRegime, CalibrationMetrics>> = {};
  for (const regime of ['TREND_UP', 'TREND_DOWN', 'SQUEEZE_RISK', 'THIN_BOOK', 'CHOP', 'MIXED', 'UNKNOWN'] as AdaptiveMarketRegime[]) {
    const subset = recent.filter((row) => row.regime === regime);
    if (subset.length) calibrationByRegime[regime] = calculateCalibrationMetrics(subset);
  }
  const predictionPsi = psi(reference.map((row) => row.probability), recent.map((row) => row.probability));
  const referenceCalibration = calculateCalibrationMetrics(reference);
  const brierDelta = calibration.brierScore != null && referenceCalibration.brierScore != null
    ? calibration.brierScore - referenceCalibration.brierScore : null;
  const featureShifts = ML_FEATURE_NAMES.map((feature, index) => {
    const refValues = reference.map((row) => row.features[index]);
    const recentValues = recent.map((row) => row.features[index]);
    const refMean = mean(refValues) ?? 0;
    const recentMean = mean(recentValues) ?? 0;
    const variance = refValues.length ? refValues.reduce((sum, value) => sum + (value - refMean) ** 2, 0) / refValues.length : 0;
    return { feature, standardizedMeanShift: Math.abs(recentMean - refMean) / Math.max(Math.sqrt(variance), 1e-6) };
  }).sort((a, b) => b.standardizedMeanShift - a.standardizedMeanShift);
  const meanTopShift = mean(featureShifts.slice(0, 10).map((row) => row.standardizedMeanShift));
  const drift = {
    predictionPsi: metric(predictionPsi, 0.10, 0.25),
    featureMeanShift: metric(meanTopShift, 0.35, 0.75),
    brierDelta: metric(brierDelta == null ? null : Math.max(0, brierDelta), 0.03, 0.07),
    topFeatureShifts: featureShifts.slice(0, 10),
  };
  const gates: MlGovernanceReport['gates'] = [];
  const enoughData = scored.rows.length >= minResolved && recent.length >= 30 && reference.length >= 30;
  gates.push({ code: 'MINIMUM_RESOLVED_SAMPLE', status: enoughData ? 'PASS' : 'FAIL', detail: `${scored.rows.length} complete resolved rows; ${minResolved} required.` });
  const brierPass = calibration.brierScore != null && calibration.brierScore <= 0.25;
  gates.push({ code: 'BRIER_SCORE', status: brierPass ? 'PASS' : 'FAIL', detail: calibration.brierScore == null ? 'Brier score unavailable.' : `Recent Brier score ${calibration.brierScore.toFixed(4)}.` });
  const ecePass = calibration.expectedCalibrationError != null && calibration.expectedCalibrationError <= 0.10;
  gates.push({ code: 'CALIBRATION_ERROR', status: ecePass ? 'PASS' : 'FAIL', detail: calibration.expectedCalibrationError == null ? 'Calibration error unavailable.' : `Recent ECE ${calibration.expectedCalibrationError.toFixed(4)}.` });
  for (const [code, value] of [['PREDICTION_DRIFT', drift.predictionPsi], ['FEATURE_DRIFT', drift.featureMeanShift], ['PERFORMANCE_DRIFT', drift.brierDelta]] as const) {
    gates.push({ code, status: value.state === 'HIGH' ? 'FAIL' : value.state === 'WARN' || value.state === 'UNAVAILABLE' ? 'WARN' : 'PASS', detail: `${code} state ${value.state}${value.value == null ? '' : ` (${value.value.toFixed(4)})`}.` });
  }
  const failed = gates.some((gate) => gate.status === 'FAIL');
  const promotionState = !enoughData ? 'INSUFFICIENT_DATA' : failed ? 'BLOCKED' : 'ELIGIBLE_FOR_MANUAL_REVIEW';
  return {
    version: ML_GOVERNANCE_VERSION, modelId: model.modelId, generatedAt, mode: 'SHADOW_ONLY', promotionState, authoritative: false,
    sample: { totalResolved: scored.rows.length, reference: reference.length, recent: recent.length, skippedIncomplete: scored.skipped },
    calibration, calibrationByRegime, drift, gates,
    recommendedAction: promotionState === 'ELIGIBLE_FOR_MANUAL_REVIEW'
      ? 'Review the model manually in shadow mode; no automatic promotion is permitted.'
      : promotionState === 'INSUFFICIENT_DATA'
        ? 'Collect more complete resolved shadow outcomes before review.'
        : 'Keep the model in shadow mode and investigate failed calibration or drift gates.',
  };
}
