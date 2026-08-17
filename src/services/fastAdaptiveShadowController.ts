/**
 * Fast 1–5 minute adaptive recommendations.
 *
 * This controller is deliberately shadow-only: it never writes scanner config,
 * never promotes a governance revision, and never authorizes an order. It emits
 * bounded recommendations that operators can compare with the slower adaptive
 * governance flow.
 */

import type {
  AdaptiveMarketRegime,
  ScannerConfig,
  ScoringWeights,
  SignalDecisionLog,
  SignalDecisionReasonCode,
} from '../types';
import { summarizeAdaptiveExperience } from './adaptiveThresholdEngine';

export interface FastAdaptiveHorizonSummary {
  horizonMs: number;
  sampleSize: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
  resolvedAccepted: number;
  winRate: number | null;
  avgPnl: number | null;
  gateRejectRate: number;
  squeezeRejectRate: number;
  smcRejectRate: number;
  regime: AdaptiveMarketRegime;
}

export interface FastAdaptiveShadowChange {
  field: string;
  before: number;
  after: number;
  delta: number;
  reason: string;
}

export interface FastAdaptiveShadowRecommendation {
  version: 1;
  generatedAt: number;
  generatedAtIso: string;
  shadowOnly: true;
  active: boolean;
  minimumSamples: number;
  sourceHorizon: '1m' | '5m' | 'none';
  oneMinute: FastAdaptiveHorizonSummary;
  fiveMinute: FastAdaptiveHorizonSummary;
  recommendedConfig: ScannerConfig;
  changes: FastAdaptiveShadowChange[];
  reasonSummary: string[];
}

const NUMBER_BOUNDS = {
  obiThreshold: [-0.40, -0.10],
  qStructThreshold: [-0.52, -0.30],
  minConfidence: [0.60, 0.91],
  maxSqueezeRisk: [0.36, 0.86],
  minEvidenceAgreement: [0.32, 0.82],
} as const;

const MAX_DELTA = {
  obiThreshold: 0.012,
  qStructThreshold: 0.012,
  minConfidence: 0.014,
  maxSqueezeRisk: 0.016,
  minEvidenceAgreement: 0.014,
  weight: 0.012,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function cloneConfig(config: ScannerConfig): ScannerConfig {
  return { ...config, scoreWeights: { ...config.scoreWeights } };
}

function rowsWithin(logs: SignalDecisionLog[], horizonMs: number, now: number): SignalDecisionLog[] {
  return logs
    .filter((row) => row && Number.isFinite(row.timestamp) && row.timestamp <= now && now - row.timestamp <= horizonMs)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function reasonCount(rows: SignalDecisionLog[], codes: SignalDecisionReasonCode[]): number {
  const allowed = new Set(codes);
  return rows.filter((row) => allowed.has(row.reasonCode)).length;
}

function mean(values: Array<number | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function summarize(rows: SignalDecisionLog[], horizonMs: number, minSamples: number): FastAdaptiveHorizonSummary {
  const accepted = rows.filter((row) => row.decision === 'ACCEPTED');
  const resolved = accepted.filter((row) => row.laterOutcome === 'WIN' || row.laterOutcome === 'LOSS' || row.laterOutcome === 'BREAKEVEN');
  const wins = resolved.filter((row) => row.laterOutcome === 'WIN').length;
  return {
    horizonMs,
    sampleSize: rows.length,
    accepted: accepted.length,
    rejected: rows.length - accepted.length,
    acceptanceRate: rate(accepted.length, rows.length),
    resolvedAccepted: resolved.length,
    winRate: resolved.length ? wins / resolved.length : null,
    avgPnl: mean(resolved.map((row) => row.laterPnl)),
    gateRejectRate: rate(reasonCount(rows, ['GATE_OBI_FAILED', 'GATE_VOLUME_FAILED', 'GATE_QSTRUCT_FAILED', 'GATES_FAILED']), rows.length),
    squeezeRejectRate: rate(reasonCount(rows, ['HIGH_SQUEEZE_RISK']), rows.length),
    smcRejectRate: rate(reasonCount(rows, ['SMC_CONTEXT_AGAINST_SHORT', 'SMC_CONTEXT_AGAINST_LONG', 'NO_SMC_CONFIRMATION']), rows.length),
    regime: rows.length >= Math.min(20, minSamples)
      ? summarizeAdaptiveExperience(rows, Math.max(1, minSamples)).marketRegime
      : 'UNKNOWN',
  };
}

function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const keys = Object.keys(weights) as Array<keyof ScoringWeights>;
  const bounded = Object.fromEntries(keys.map((key) => [key, clamp(Number(weights[key]) || 0, 0.01, 0.60)])) as unknown as ScoringWeights;
  const total = keys.reduce((sum, key) => sum + bounded[key], 0);
  if (total <= 0) return { ...weights };
  const normalized = {} as ScoringWeights;
  let assigned = 0;
  keys.forEach((key, index) => {
    const value = index === keys.length - 1 ? 1 - assigned : round(bounded[key] / total, 8);
    normalized[key] = value;
    assigned += value;
  });
  return normalized;
}

export function buildFastAdaptiveShadowRecommendation(
  config: ScannerConfig,
  logs: SignalDecisionLog[],
  options: { now?: number; minSamples?: number } = {},
): FastAdaptiveShadowRecommendation {
  const now = options.now ?? Date.now();
  const minSamples = Math.max(8, Math.floor(options.minSamples ?? config.adaptiveMinSamples ?? 24));
  const oneRows = rowsWithin(logs, 60_000, now);
  const fiveRows = rowsWithin(logs, 5 * 60_000, now);
  const oneMinute = summarize(oneRows, 60_000, minSamples);
  const fiveMinute = summarize(fiveRows, 5 * 60_000, minSamples);
  const sourceRows = oneRows.length >= minSamples ? oneRows : fiveRows.length >= minSamples ? fiveRows : [];
  const source = sourceRows === oneRows && sourceRows.length ? '1m' : sourceRows.length ? '5m' : 'none';
  const sourceSummary = source === '1m' ? oneMinute : fiveMinute;
  const next = cloneConfig(config);
  const changes: FastAdaptiveShadowChange[] = [];
  const reasons: string[] = [];
  const weightReasons = new Map<keyof ScoringWeights, string[]>();

  const setNumber = (
    field: keyof typeof NUMBER_BOUNDS,
    proposed: number,
    reason: string,
  ): void => {
    const before = next[field];
    const [min, max] = NUMBER_BOUNDS[field];
    const limit = MAX_DELTA[field];
    const target = clamp(proposed, min, max);
    const after = round(clamp(target, before - limit, before + limit));
    if (Math.abs(after - before) < 1e-9) return;
    next[field] = after;
    changes.push({ field, before, after, delta: round(after - before), reason });
    reasons.push(reason);
  };

  const setWeight = (field: keyof ScoringWeights, proposed: number, reason: string): void => {
    const before = next.scoreWeights[field];
    const after = round(clamp(proposed, before - MAX_DELTA.weight, before + MAX_DELTA.weight), 6);
    if (Math.abs(after - before) < 1e-9) return;
    next.scoreWeights[field] = after;
    weightReasons.set(field, [...(weightReasons.get(field) ?? []), reason]);
    reasons.push(reason);
  };

  if (sourceRows.length) {
    const weakOutcomes = sourceSummary.resolvedAccepted >= 3 && (
      (sourceSummary.winRate !== null && sourceSummary.winRate < 0.50) ||
      (sourceSummary.avgPnl !== null && sourceSummary.avgPnl < 0)
    );
    const strongOutcomes = sourceSummary.resolvedAccepted >= 3 &&
      (sourceSummary.winRate ?? 0) > 0.66 && (sourceSummary.avgPnl ?? 0) > 0.40;

    if (sourceSummary.acceptanceRate > 0.055 || weakOutcomes) {
      setNumber('minConfidence', next.minConfidence + 0.012, 'Fast shadow: acceptance is hot or recent resolved outcomes are weak.');
      setNumber('minEvidenceAgreement', next.minEvidenceAgreement + 0.012, 'Fast shadow: require broader short-horizon evidence agreement.');
      setNumber('maxSqueezeRisk', next.maxSqueezeRisk - 0.012, 'Fast shadow: reduce immediate squeeze tolerance.');
    }

    if (sourceSummary.regime === 'SQUEEZE_RISK' || sourceSummary.squeezeRejectRate > 0.20) {
      setNumber('maxSqueezeRisk', next.maxSqueezeRisk - 0.014, 'Fast shadow: sudden squeeze-risk pressure detected.');
      setWeight('microstructure', next.scoreWeights.microstructure + 0.010, 'Fast shadow: increase microstructure confirmation weight.');
      setWeight('liquidity', next.scoreWeights.liquidity + 0.008, 'Fast shadow: increase liquidity quality weight.');
      setWeight('smc', next.scoreWeights.smc + 0.006, 'Fast shadow: increase smart-money context weight.');
    }

    if (sourceSummary.regime === 'THIN_BOOK') {
      setNumber('minConfidence', next.minConfidence + 0.010, 'Fast shadow: thin-book regime requires stronger confidence.');
      setNumber('maxSqueezeRisk', next.maxSqueezeRisk - 0.008, 'Fast shadow: thin-book regime reduces trap tolerance.');
      setWeight('liquidity', next.scoreWeights.liquidity + 0.012, 'Fast shadow: thin-book regime prioritizes executable liquidity.');
    }

    if (
      sourceSummary.acceptanceRate < 0.004 &&
      sourceSummary.gateRejectRate > 0.48 &&
      sourceSummary.regime === 'TREND_DOWN'
    ) {
      setNumber('obiThreshold', next.obiThreshold + 0.010, 'Fast shadow: scanner is unusually quiet during a verified downtrend.');
      setNumber('qStructThreshold', next.qStructThreshold + 0.010, 'Fast shadow: reduce short-term structure friction within guardrails.');
    }

    if (sourceSummary.smcRejectRate > 0.12) {
      setWeight('smc', next.scoreWeights.smc + 0.006, 'Fast shadow: frequent SMC rejects should be priced earlier in scoring.');
    }

    if (strongOutcomes && sourceSummary.acceptanceRate < 0.015 && sourceSummary.regime === 'TREND_DOWN') {
      setNumber('minEvidenceAgreement', next.minEvidenceAgreement - 0.006, 'Fast shadow: strong recent outcomes support slightly lower evidence friction.');
    }
  }

  if (weightReasons.size) {
    next.scoreWeights = normalizeWeights(next.scoreWeights);
    const keys = Object.keys(next.scoreWeights) as Array<keyof ScoringWeights>;
    for (const key of keys) {
      const before = config.scoreWeights[key];
      const after = next.scoreWeights[key];
      if (Math.abs(after - before) < 1e-9) continue;
      const directReasons = weightReasons.get(key);
      const reason = directReasons?.length
        ? [...new Set(directReasons)].join(' ')
        : 'Fast shadow: normalize the scoring-weight budget after bounded adjustments.';
      changes.push({
        field: `scoreWeights.${key}`,
        before,
        after,
        delta: round(after - before),
        reason,
      });
    }
  }
  const uniqueReasons = [...new Set(reasons)];
  return {
    version: 1,
    generatedAt: now,
    generatedAtIso: new Date(now).toISOString(),
    shadowOnly: true,
    active: sourceRows.length >= minSamples && changes.length > 0,
    minimumSamples: minSamples,
    sourceHorizon: source,
    oneMinute,
    fiveMinute,
    recommendedConfig: next,
    changes,
    reasonSummary: uniqueReasons,
  };
}
