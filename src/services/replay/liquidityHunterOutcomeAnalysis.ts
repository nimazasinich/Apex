import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';

export interface LiquidityHunterOutcomeHorizon {
  horizonMs: number;
  endPrice: number | null;
  grossDirectionalReturnPct: number | null;
  netDirectionalReturnPct: number | null;
  mfePct: number | null;
  maePct: number | null;
  mfeR: number | null;
  maeR: number | null;
  invalidationHit: boolean | null;
  oneRHit: boolean | null;
  twoRHit: boolean | null;
  oneRBeforeInvalidation: boolean | null;
  twoRBeforeInvalidation: boolean | null;
}

export interface LiquidityHunterSetupOutcome {
  evaluationId: string;
  setupId: string;
  signalAt: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  invalidationPrice: number | null;
  riskDistancePct: number | null;
  fusionScore: number;
  horizons: LiquidityHunterOutcomeHorizon[];
}

export interface LiquidityHunterOutcomeSummary {
  candidateCount: number;
  resolvedCount: number;
  medianNetReturnPct: number | null;
  meanNetReturnPct: number | null;
  positiveNetShare: number | null;
  medianMfePct: number | null;
  medianMaePct: number | null;
  invalidationShare: number | null;
  oneRBeforeInvalidationShare: number | null;
  twoRBeforeInvalidationShare: number | null;
}

export interface LiquidityHunterOutcomeAnalysis {
  methodology: 'SIGNAL_PRICE_FORWARD_OUTCOME';
  executionSimulation: false;
  roundTripCostBps: number;
  horizonsMs: number[];
  outcomes: LiquidityHunterSetupOutcome[];
  summaries: Array<{ horizonMs: number; summary: LiquidityHunterOutcomeSummary }>;
  caveats: string[];
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function priceFromEvent(event: MarketEvent): number | null {
  if (!event.payload || typeof event.payload !== 'object') return null;
  const row = event.payload as Record<string, unknown>;
  if (event.type === 'TRADE') return finitePositive(row.price);
  if (event.type === 'QUOTE') {
    const bid = finitePositive(row.bid);
    const ask = finitePositive(row.ask);
    return bid !== null && ask !== null && ask >= bid ? (bid + ask) / 2 : null;
  }
  return null;
}

function orderedPrices(events: readonly MarketEvent[], symbol: string): Array<{ timestamp: number; price: number }> {
  return events
    .filter((event) => event.symbol === symbol && (event.type === 'TRADE' || event.type === 'QUOTE'))
    .map((event) => ({ timestamp: event.exchangeTimestamp, price: priceFromEvent(event) }))
    .filter((row): row is { timestamp: number; price: number } => row.price !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function upperBoundTimestamp(rows: readonly { timestamp: number }[], timestamp: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid].timestamp <= timestamp) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function firstHit(
  rows: readonly { timestamp: number; price: number }[],
  direction: 'LONG' | 'SHORT',
  level: number,
  kind: 'FAVORABLE' | 'ADVERSE',
): number | null {
  for (const row of rows) {
    if (direction === 'LONG') {
      if (kind === 'FAVORABLE' ? row.price >= level : row.price <= level) return row.timestamp;
    } else if (kind === 'FAVORABLE' ? row.price <= level : row.price >= level) return row.timestamp;
  }
  return null;
}

function summarize(outcomes: readonly LiquidityHunterSetupOutcome[], horizonMs: number): LiquidityHunterOutcomeSummary {
  const rows = outcomes.map((outcome) => outcome.horizons.find((horizon) => horizon.horizonMs === horizonMs)).filter(Boolean) as LiquidityHunterOutcomeHorizon[];
  const resolved = rows.filter((row) => row.netDirectionalReturnPct !== null);
  const netReturns = resolved.map((row) => row.netDirectionalReturnPct!).filter(Number.isFinite);
  const mfe = resolved.map((row) => row.mfePct).filter((value): value is number => value !== null && Number.isFinite(value));
  const mae = resolved.map((row) => row.maePct).filter((value): value is number => value !== null && Number.isFinite(value));
  const withInvalidation = resolved.filter((row) => row.invalidationHit !== null);
  const withOneR = resolved.filter((row) => row.oneRBeforeInvalidation !== null);
  const withTwoR = resolved.filter((row) => row.twoRBeforeInvalidation !== null);
  return {
    candidateCount: rows.length,
    resolvedCount: resolved.length,
    medianNetReturnPct: median(netReturns),
    meanNetReturnPct: mean(netReturns),
    positiveNetShare: pct(netReturns.filter((value) => value > 0).length, netReturns.length),
    medianMfePct: median(mfe),
    medianMaePct: median(mae),
    invalidationShare: pct(withInvalidation.filter((row) => row.invalidationHit).length, withInvalidation.length),
    oneRBeforeInvalidationShare: pct(withOneR.filter((row) => row.oneRBeforeInvalidation).length, withOneR.length),
    twoRBeforeInvalidationShare: pct(withTwoR.filter((row) => row.twoRBeforeInvalidation).length, withTwoR.length),
  };
}

/**
 * Forward setup-outcome analysis. This deliberately does not claim fills,
 * queue priority, stop execution, or realized PnL. The signal-time market
 * price is used only to measure subsequent directional movement, MFE/MAE and
 * whether deterministic invalidation/1R/2R levels were touched first.
 */
export function analyzeLiquidityHunterSetupOutcomes(args: {
  events: readonly MarketEvent[];
  evaluations: readonly LiquidityHunterEvaluation[];
  symbol: string;
  horizonsMs?: number[];
  roundTripCostBps?: number;
}): LiquidityHunterOutcomeAnalysis {
  const symbol = args.symbol.toUpperCase();
  const horizonsMs = [...new Set((args.horizonsMs ?? [5 * 60_000, 15 * 60_000, 60 * 60_000])
    .map((value) => Math.floor(value))
    .filter((value) => Number.isSafeInteger(value) && value >= 1_000 && value <= 24 * 60 * 60_000))].sort((a, b) => a - b);
  if (!horizonsMs.length) throw new Error('outcome_analysis_requires_horizon');
  const roundTripCostBps = Math.max(0, Math.min(500, Number(args.roundTripCostBps ?? 0)));
  const priceRows = orderedPrices(args.events, symbol);
  const seenSetups = new Set<string>();
  const candidates = args.evaluations
    .filter((evaluation) => evaluation.symbol === symbol && evaluation.eligibleForManualConfirmation && evaluation.trigger.direction && evaluation.setupId)
    .filter((evaluation) => {
      if (seenSetups.has(evaluation.setupId!)) return false;
      seenSetups.add(evaluation.setupId!);
      return true;
    })
    .sort((a, b) => a.generatedAt - b.generatedAt);

  const outcomes: LiquidityHunterSetupOutcome[] = [];
  for (const evaluation of candidates) {
    const direction = evaluation.trigger.direction!;
    const startIndex = upperBoundTimestamp(priceRows, evaluation.generatedAt) - 1;
    if (startIndex < 0) continue;
    const entryPrice = priceRows[startIndex].price;
    const invalidationPrice = evaluation.trigger.invalidationPrice;
    const riskDistance = invalidationPrice !== null && Number.isFinite(invalidationPrice)
      ? Math.abs(entryPrice - invalidationPrice)
      : null;
    const riskDistancePct = riskDistance !== null && riskDistance > 0 ? riskDistance / entryPrice * 100 : null;
    const horizons: LiquidityHunterOutcomeHorizon[] = [];

    for (const horizonMs of horizonsMs) {
      const endAt = evaluation.generatedAt + horizonMs;
      const from = upperBoundTimestamp(priceRows, evaluation.generatedAt - 1);
      const to = upperBoundTimestamp(priceRows, endAt);
      const forward = priceRows.slice(from, to);
      if (!forward.length) {
        horizons.push({
          horizonMs,
          endPrice: null,
          grossDirectionalReturnPct: null,
          netDirectionalReturnPct: null,
          mfePct: null,
          maePct: null,
          mfeR: null,
          maeR: null,
          invalidationHit: null,
          oneRHit: null,
          twoRHit: null,
          oneRBeforeInvalidation: null,
          twoRBeforeInvalidation: null,
        });
        continue;
      }
      const sign = direction === 'LONG' ? 1 : -1;
      const endPrice = forward.at(-1)!.price;
      const directionalMoves = forward.map((row) => sign * (row.price - entryPrice) / entryPrice * 100);
      const grossDirectionalReturnPct = sign * (endPrice - entryPrice) / entryPrice * 100;
      const netDirectionalReturnPct = grossDirectionalReturnPct - roundTripCostBps / 100;
      const mfePct = Math.max(...directionalMoves, 0);
      const maePct = Math.min(...directionalMoves, 0);

      let invalidationHit: boolean | null = null;
      let oneRHit: boolean | null = null;
      let twoRHit: boolean | null = null;
      let oneRBeforeInvalidation: boolean | null = null;
      let twoRBeforeInvalidation: boolean | null = null;
      let mfeR: number | null = null;
      let maeR: number | null = null;
      if (riskDistance !== null && riskDistance > 0 && invalidationPrice !== null) {
        const oneRLevel = direction === 'LONG' ? entryPrice + riskDistance : entryPrice - riskDistance;
        const twoRLevel = direction === 'LONG' ? entryPrice + riskDistance * 2 : entryPrice - riskDistance * 2;
        const stopAt = firstHit(forward, direction, invalidationPrice, 'ADVERSE');
        const oneRAt = firstHit(forward, direction, oneRLevel, 'FAVORABLE');
        const twoRAt = firstHit(forward, direction, twoRLevel, 'FAVORABLE');
        invalidationHit = stopAt !== null;
        oneRHit = oneRAt !== null;
        twoRHit = twoRAt !== null;
        oneRBeforeInvalidation = oneRAt !== null && (stopAt === null || oneRAt < stopAt);
        twoRBeforeInvalidation = twoRAt !== null && (stopAt === null || twoRAt < stopAt);
        mfeR = mfePct / (riskDistance / entryPrice * 100);
        maeR = maePct / (riskDistance / entryPrice * 100);
      }

      horizons.push({
        horizonMs,
        endPrice,
        grossDirectionalReturnPct,
        netDirectionalReturnPct,
        mfePct,
        maePct,
        mfeR,
        maeR,
        invalidationHit,
        oneRHit,
        twoRHit,
        oneRBeforeInvalidation,
        twoRBeforeInvalidation,
      });
    }

    outcomes.push({
      evaluationId: evaluation.evaluationId,
      setupId: evaluation.setupId!,
      signalAt: evaluation.generatedAt,
      symbol,
      direction,
      entryPrice,
      invalidationPrice,
      riskDistancePct,
      fusionScore: evaluation.fusionScore,
      horizons,
    });
  }

  return {
    methodology: 'SIGNAL_PRICE_FORWARD_OUTCOME',
    executionSimulation: false,
    roundTripCostBps,
    horizonsMs,
    outcomes,
    summaries: horizonsMs.map((horizonMs) => ({ horizonMs, summary: summarize(outcomes, horizonMs) })),
    caveats: [
      'Signal-time price movement analysis is not a fill simulation.',
      'No queue priority, partial fill, maker/taker routing, latency, stop slippage, or market impact is assumed.',
      'Round-trip cost is a configurable analytical haircut, not an exchange fill model.',
    ],
  };
}
