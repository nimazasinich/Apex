import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import { EDGE_IDS, type EdgeId } from '../../contracts/realtime/edgeEvidence';
import type { LiquidityHunterFeatureFlags } from '../liquidityHunter/featureFlags';
import type { MetaModelEvaluationPayload } from '../../contracts/realtime/marketPayloads';
import type { SmartMoneyContext } from '../../types';
import { runLiquidityHunterEventReplay } from './eventReplayRunner';
import { analyzeLiquidityHunterSetupOutcomes, type LiquidityHunterOutcomeAnalysis } from './liquidityHunterOutcomeAnalysis';
import { createReplayDatasetManifest, type ReplayDatasetManifest } from './replayDatasetManifest';
import { optimizeEdgeThreshold, type EdgeThresholdObservation, type EdgeThresholdOptimizationReport } from '../liquidityHunter/edgeThresholdOptimizer';
import { classifyEdgeSymbolClass, createBaselineEdgeThresholdProfile } from '../liquidityHunter/edgeThresholdRegistry';

export interface LiquidityHunterValidationWindow {
  id: string;
  role: 'WALK_FORWARD' | 'HOLDOUT';
  warmupStart: number;
  purgeStart: number;
  validationStart: number;
  validationEnd: number;
  embargoBeforeMs: number;
  purgeBeforeMs: number;
}

export interface LiquidityHunterValidationFoldResult {
  window: LiquidityHunterValidationWindow;
  replayManifest: ReplayDatasetManifest;
  deterministicFingerprint: string;
  evaluationCount: number;
  uniqueSetupCount: number;
  manualCandidateCount: number;
  medianFusionScore: number | null;
  layerPassRates: Record<'1' | '2' | '3' | '4', number | null>;
  edgeAvailability: Partial<Record<EdgeId, { pass: number; fail: number; missing: number; meanQuality: number | null }>>;
  outcomes: LiquidityHunterOutcomeAnalysis;
}

export interface LiquidityHunterWalkForwardValidationReport {
  version: 'lh_event_validation_v1';
  datasetManifest: ReplayDatasetManifest;
  symbol: string;
  createdAt: number;
  policy: {
    foldCount: number;
    holdoutFraction: number;
    warmupMs: number;
    purgeMs: number;
    embargoMs: number;
    evaluateEveryEvents: number;
    maxConcurrency: number;
    roundTripCostBps: number;
    horizonsMs: number[];
  };
  windows: LiquidityHunterValidationWindow[];
  folds: LiquidityHunterValidationFoldResult[];
  holdout: LiquidityHunterValidationFoldResult;
  walkForward: LiquidityHunterValidationFoldResult[];
  /** Advisory only; selection uses WALK_FORWARD observations and HOLDOUT is evaluated after selection. */
  edgeThresholdOptimization: Partial<Record<EdgeId, EdgeThresholdOptimizationReport>>;
  consistency: {
    walkForwardCandidateFolds: number;
    walkForwardPositiveMedianNetFolds: number;
    holdoutCandidateCount: number;
    holdoutMedianNetReturnPct: number | null;
    holdoutTwoRBeforeInvalidationShare: number | null;
  };
  fingerprintSha256: string;
  shadowOnly: true;
  authoritative: false;
  automaticPromotionEnabled: false;
  caveats: string[];
}

export interface LiquidityHunterWalkForwardValidationInput {
  events: MarketEvent[];
  symbol: string;
  flags: LiquidityHunterFeatureFlags;
  manifest?: ReplayDatasetManifest;
  foldCount?: number;
  holdoutFraction?: number;
  warmupMs?: number;
  purgeMs?: number;
  embargoMs?: number;
  evaluateEveryEvents?: number;
  maxConcurrency?: number;
  roundTripCostBps?: number;
  horizonsMs?: number[];
  smartMoneyContextAt?: (timestamp: number) => SmartMoneyContext | null | Promise<SmartMoneyContext | null>;
  metaModelAt?: (timestamp: number) => MetaModelEvaluationPayload | null | Promise<MetaModelEvaluationPayload | null>;
  currentPriceAt?: (timestamp: number) => number | null | Promise<number | null>;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function eventRange(events: readonly MarketEvent[], symbol: string): { start: number; end: number; events: MarketEvent[] } {
  const filtered = events.filter((event) => event.symbol === symbol).sort((a, b) => a.exchangeTimestamp - b.exchangeTimestamp || a.receivedAt - b.receivedAt);
  if (filtered.length < 10) throw new Error('validation_dataset_too_small');
  const start = filtered[0].exchangeTimestamp;
  const end = filtered.at(-1)!.exchangeTimestamp;
  if (!(end > start)) throw new Error('validation_dataset_time_range_invalid');
  return { start, end, events: filtered };
}

function buildWindows(args: {
  start: number;
  end: number;
  foldCount: number;
  holdoutFraction: number;
  warmupMs: number;
  purgeMs: number;
  embargoMs: number;
}): LiquidityHunterValidationWindow[] {
  const duration = args.end - args.start;
  const holdoutDuration = Math.max(args.purgeMs + 1, Math.floor(duration * args.holdoutFraction));
  const holdoutStart = args.end - holdoutDuration;
  const developmentEnd = holdoutStart - args.embargoMs;
  const earliestValidation = args.start + args.warmupMs + args.purgeMs;
  if (developmentEnd <= earliestValidation) throw new Error('validation_dataset_too_short_for_requested_isolation');
  const walkForwardDuration = developmentEnd - earliestValidation;
  const foldWidth = Math.floor(walkForwardDuration / args.foldCount);
  if (foldWidth <= 0) throw new Error('validation_fold_width_invalid');
  const windows: LiquidityHunterValidationWindow[] = [];
  for (let index = 0; index < args.foldCount; index += 1) {
    const validationStart = earliestValidation + foldWidth * index;
    const validationEnd = index === args.foldCount - 1 ? developmentEnd : earliestValidation + foldWidth * (index + 1);
    windows.push({
      id: `wf-${index + 1}`,
      role: 'WALK_FORWARD',
      warmupStart: Math.max(args.start, validationStart - args.warmupMs - args.purgeMs),
      purgeStart: validationStart - args.purgeMs,
      validationStart,
      validationEnd,
      embargoBeforeMs: 0,
      purgeBeforeMs: args.purgeMs,
    });
  }
  windows.push({
    id: 'holdout',
    role: 'HOLDOUT',
    warmupStart: Math.max(args.start, holdoutStart - args.warmupMs - args.purgeMs),
    purgeStart: holdoutStart - args.purgeMs,
    validationStart: holdoutStart,
    validationEnd: args.end,
    embargoBeforeMs: args.embargoMs,
    purgeBeforeMs: args.purgeMs,
  });
  return windows;
}

function eventsForWindow(events: readonly MarketEvent[], window: LiquidityHunterValidationWindow): MarketEvent[] {
  return events.filter((event) => {
    const ts = event.exchangeTimestamp;
    if (ts < window.warmupStart || ts > window.validationEnd) return false;
    // The purge interval is intentionally omitted. This prevents state formed
    // immediately before the scored window from carrying over across the split.
    return ts < window.purgeStart || ts >= window.validationStart;
  });
}

async function mapWithConcurrency<T, R>(values: readonly T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarizeEdgeAvailability(evaluations: Awaited<ReturnType<typeof runLiquidityHunterEventReplay>>['evaluations']): LiquidityHunterValidationFoldResult['edgeAvailability'] {
  const buckets = new Map<EdgeId, { pass: number; fail: number; missing: number; qualities: number[] }>();
  for (const evaluation of evaluations) {
    for (const edge of evaluation.evidence) {
      const bucket = buckets.get(edge.edgeId) ?? { pass: 0, fail: 0, missing: 0, qualities: [] };
      if (edge.status === 'PASS') bucket.pass += 1;
      else if (edge.status === 'FAIL') bucket.fail += 1;
      else bucket.missing += 1;
      if (Number.isFinite(edge.dataQuality)) bucket.qualities.push(edge.dataQuality);
      buckets.set(edge.edgeId, bucket);
    }
  }
  const output: LiquidityHunterValidationFoldResult['edgeAvailability'] = {};
  for (const [edgeId, bucket] of buckets) {
    output[edgeId] = {
      pass: bucket.pass,
      fail: bucket.fail,
      missing: bucket.missing,
      meanQuality: bucket.qualities.length ? bucket.qualities.reduce((sum, value) => sum + value, 0) / bucket.qualities.length : null,
    };
  }
  return output;
}

function buildEdgeThresholdObservations(args: {
  evaluations: Awaited<ReturnType<typeof runLiquidityHunterEventReplay>>['evaluations'];
  outcomes: LiquidityHunterOutcomeAnalysis;
  window: LiquidityHunterValidationWindow;
  primaryHorizon: number;
}): EdgeThresholdObservation[] {
  const outcomesByEvaluation = new Map(args.outcomes.outcomes.map((row) => [row.evaluationId, row]));
  const role: EdgeThresholdObservation['role'] = args.window.role === 'HOLDOUT' ? 'HOLDOUT' : 'DEVELOPMENT';
  const rows: EdgeThresholdObservation[] = [];
  for (const evaluation of args.evaluations) {
    const outcome = outcomesByEvaluation.get(evaluation.evaluationId);
    const horizon = outcome?.horizons.find((row) => row.horizonMs === args.primaryHorizon);
    if (!horizon || horizon.netDirectionalReturnPct === null || !Number.isFinite(horizon.netDirectionalReturnPct)) continue;
    const regime = `${evaluation.macro.volatilityRegime}:${evaluation.macro.expectedSweepDirection}`;
    for (const edge of evaluation.evidence) {
      // The governed threshold is a post-evaluator quality filter, so only edge
      // evidence that already passed deterministic edge logic is eligible here.
      // This can make good candidates stricter; it cannot resurrect rejected rows.
      if (edge.status !== 'PASS' || edge.score === null || !Number.isFinite(edge.score)) continue;
      rows.push({
        edgeId: edge.edgeId,
        timestamp: evaluation.generatedAt,
        score: edge.score,
        dataQuality: edge.dataQuality,
        netReturnPct: horizon.netDirectionalReturnPct,
        regime,
        role,
        sourceVersion: edge.sourceVersion,
      });
    }
  }
  return rows;
}

interface InternalFoldResult {
  fold: LiquidityHunterValidationFoldResult;
  thresholdObservations: EdgeThresholdObservation[];
}

function foldFingerprint(report: Omit<LiquidityHunterWalkForwardValidationReport, 'fingerprintSha256'>): string {
  return createHash('sha256').update(JSON.stringify(report)).digest('hex');
}

export async function runLiquidityHunterWalkForwardValidation(
  input: LiquidityHunterWalkForwardValidationInput,
): Promise<LiquidityHunterWalkForwardValidationReport> {
  const symbol = input.symbol.toUpperCase();
  const range = eventRange(input.events, symbol);
  const manifest = input.manifest ?? createReplayDatasetManifest(range.events, { createdAt: range.end });
  const foldCount = clampInt(input.foldCount, 3, 2, 8);
  const holdoutFraction = clampNumber(input.holdoutFraction, 0.20, 0.10, 0.35);
  const warmupMs = clampInt(input.warmupMs, 60 * 60_000, 60_000, 24 * 60 * 60_000);
  const purgeMs = clampInt(input.purgeMs, 5 * 60_000, 0, 6 * 60 * 60_000);
  const embargoMs = clampInt(input.embargoMs, 5 * 60_000, 0, 6 * 60 * 60_000);
  const evaluateEveryEvents = clampInt(input.evaluateEveryEvents, 50, 1, 10_000);
  const maxConcurrency = clampInt(input.maxConcurrency, 2, 1, 4);
  const roundTripCostBps = clampNumber(input.roundTripCostBps, 10, 0, 500);
  const horizonsMs = [...new Set((input.horizonsMs ?? [5 * 60_000, 15 * 60_000, 60 * 60_000]).map((value) => clampInt(value, 5 * 60_000, 1_000, 24 * 60 * 60_000)))].sort((a, b) => a - b);
  const primaryHorizon = horizonsMs[Math.min(1, horizonsMs.length - 1)];
  const windows = buildWindows({ start: range.start, end: range.end, foldCount, holdoutFraction, warmupMs, purgeMs, embargoMs });

  const foldBundles = await mapWithConcurrency(windows, maxConcurrency, async (window): Promise<InternalFoldResult> => {
    const replayEvents = eventsForWindow(range.events, window);
    if (replayEvents.length < 5) throw new Error(`validation_window_has_insufficient_events:${window.id}`);
    const replayManifest = createReplayDatasetManifest(replayEvents, { datasetId: `${manifest.datasetId}:${window.id}`, createdAt: manifest.createdAt });
    const replay = await runLiquidityHunterEventReplay({
      events: replayEvents,
      symbol,
      flags: input.flags,
      manifest: replayManifest,
      evaluateEveryEvents,
      smartMoneyContextAt: input.smartMoneyContextAt,
      metaModelAt: input.metaModelAt,
      currentPriceAt: input.currentPriceAt,
    });
    const scored = replay.evaluations.filter((evaluation) => evaluation.generatedAt >= window.validationStart && evaluation.generatedAt <= window.validationEnd);
    const uniqueSetups = new Set(scored.map((evaluation) => evaluation.setupId).filter(Boolean));
    const manualCandidates = scored.filter((evaluation) => evaluation.eligibleForManualConfirmation);
    const fusionScores = scored.map((evaluation) => evaluation.fusionScore).filter(Number.isFinite);
    const layerPassRates = Object.fromEntries(([1, 2, 3, 4] as const).map((layer) => {
      const rows = scored.map((evaluation) => evaluation.layers.find((row) => row.layer === layer)).filter(Boolean);
      return [String(layer), rows.length ? rows.filter((row) => row!.status === 'PASSED').length / rows.length : null];
    })) as LiquidityHunterValidationFoldResult['layerPassRates'];
    const outcomes = analyzeLiquidityHunterSetupOutcomes({
      events: range.events.filter((event) => event.exchangeTimestamp >= window.validationStart && event.exchangeTimestamp <= window.validationEnd + Math.max(...horizonsMs)),
      evaluations: scored,
      symbol,
      horizonsMs,
      roundTripCostBps,
    });
    const fold: LiquidityHunterValidationFoldResult = {
      window,
      replayManifest,
      deterministicFingerprint: replay.deterministicFingerprint,
      evaluationCount: scored.length,
      uniqueSetupCount: uniqueSetups.size,
      manualCandidateCount: manualCandidates.length,
      medianFusionScore: median(fusionScores),
      layerPassRates,
      edgeAvailability: summarizeEdgeAvailability(scored),
      outcomes,
    };
    return {
      fold,
      thresholdObservations: buildEdgeThresholdObservations({ evaluations: scored, outcomes, window, primaryHorizon }),
    };
  });
  const folds = foldBundles.map((row) => row.fold);

  const holdout = folds.find((fold) => fold.window.role === 'HOLDOUT');
  if (!holdout) throw new Error('holdout_fold_missing');
  const walkForward = folds.filter((fold) => fold.window.role === 'WALK_FORWARD');
  const positiveWalkForward = walkForward.filter((fold) => {
    const summary = fold.outcomes.summaries.find((row) => row.horizonMs === primaryHorizon)?.summary;
    return summary?.medianNetReturnPct != null && summary.medianNetReturnPct > 0;
  }).length;
  const holdoutSummary = holdout.outcomes.summaries.find((row) => row.horizonMs === primaryHorizon)?.summary;

  const thresholdObservations = foldBundles.flatMap((row) => row.thresholdObservations);
  const edgeThresholdOptimization: Partial<Record<EdgeId, EdgeThresholdOptimizationReport>> = {};
  const symbolClass = classifyEdgeSymbolClass(symbol);
  for (const edgeId of EDGE_IDS) {
    const profile = createBaselineEdgeThresholdProfile({ edgeId, symbolClass, timeframe: 'EVENT', regime: 'ANY' });
    edgeThresholdOptimization[edgeId] = optimizeEdgeThreshold({
      profile,
      observations: thresholdObservations,
      validationContext: {
        sourceSet: [...manifest.sources],
        featureVersion: 'liquidity-hunter-core-v1',
        validationProtocol: 'PURGED_WALK_FORWARD_HOLDOUT',
        datasetFingerprintSha256: manifest.checksumSha256,
      },
      now: manifest.createdAt,
    });
  }

  const withoutFingerprint: Omit<LiquidityHunterWalkForwardValidationReport, 'fingerprintSha256'> = {
    version: 'lh_event_validation_v1',
    datasetManifest: manifest,
    symbol,
    createdAt: manifest.createdAt,
    policy: { foldCount, holdoutFraction, warmupMs, purgeMs, embargoMs, evaluateEveryEvents, maxConcurrency, roundTripCostBps, horizonsMs },
    windows,
    folds,
    holdout,
    walkForward,
    edgeThresholdOptimization,
    consistency: {
      walkForwardCandidateFolds: walkForward.filter((fold) => fold.manualCandidateCount > 0).length,
      walkForwardPositiveMedianNetFolds: positiveWalkForward,
      holdoutCandidateCount: holdout.manualCandidateCount,
      holdoutMedianNetReturnPct: holdoutSummary?.medianNetReturnPct ?? null,
      holdoutTwoRBeforeInvalidationShare: holdoutSummary?.twoRBeforeInvalidationShare ?? null,
    },
    shadowOnly: true,
    authoritative: false,
    automaticPromotionEnabled: false,
    caveats: [
      'Validation measures deterministic setup behavior and forward signal-price outcomes; it is not an exchange fill backtest.',
      'Purged chronological windows and a final holdout are isolated, but provider quality is still limited by the recorded dataset.',
      'No validation result can promote thresholds or authorize execution.',
      'Edge-threshold recommendations are advisory filters over already-PASS evidence and require explicit manual governance before runtime use.',
    ],
  };
  return { ...withoutFingerprint, fingerprintSha256: foldFingerprint(withoutFingerprint) };
}
