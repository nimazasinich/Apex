/**
 * Forward PAPER evaluation of validated research profiles.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * `researchOutcomeFeedback` closed the *replay* half of the loop: it compares
 * the optimizer's holdout expectation against a replay of the promoted profile.
 * Both numbers come from history that already existed when the decision was
 * made, so a profile that is merely curve-fit can still look excellent there.
 *
 * This module closes the *forward* half. A slot approved by the paper council
 * opens a simulated position at the last CLOSED bar of the cycle, and is marked
 * on later cycles against bars that did not exist at decision time. Nothing here
 * can peek: `markForwardPosition` discards every bar at or before the entry bar,
 * whatever the caller passes in.
 *
 * ---------------------------------------------------------------------------
 * SAFETY BOUNDARY — read before changing this file.
 *
 * These positions are SIMULATED. No exchange client, no order, no Risk Governor
 * interaction, no execution authorization. The rows produced here carry
 * `researchOnly: true` / `paperOnly: true` / `executionAuthorized: false` and the
 * `PAPER_FORWARD_SOURCE` provenance marker, which `isResearchOutcomeLog` in
 * researchOutcomeFeedback.ts recognises. That marker is what keeps simulated
 * evidence out of the live decision-memory mirror backing
 * `adaptiveThresholdGovernance.propose()`. Do not remove it, and do not write
 * these rows to the live mirror.
 *
 * ---------------------------------------------------------------------------
 * PURITY
 *
 * No clock, no network, no filesystem. The caller supplies `now` and the bars.
 * Position state round-trips through the existing `SignalDecisionLog` shape, so
 * an open position survives a restart in the research-scoped DecisionMemoryMirror
 * without a new store class or a new persistence format.
 */
import type { SignalDecisionLog } from '../types';
import {
  computeTransactionCostPct,
  transactionCostInputsFromModel,
  type TransactionCostModel,
} from './transactionCosts';

export const PAPER_FORWARD_VERSION = 'paper_forward_evaluation_v1';
export const PAPER_FORWARD_SOURCE = 'SMART_AUTOPILOT_PAPER_FORWARD';

/** Default protective geometry, in ATR multiples, when a slot supplies none. */
export const DEFAULT_FORWARD_STOP_ATR_MULTIPLE = 1.5;
export const DEFAULT_FORWARD_TARGET_ATR_MULTIPLE = 2.25;
/** Fallback risk width when ATR is unavailable or degenerate (flat history). */
export const FALLBACK_STOP_WIDTH_PCT = 0.5;

export type ForwardPositionState = 'OPEN' | 'CLOSED';
export type ForwardExitReason = 'STOP' | 'TARGET' | 'MAX_HOLD';
export type ForwardVerdict = 'IMPROVE' | 'RETAIN' | 'DEMOTE' | 'INSUFFICIENT_EVIDENCE';

export interface ForwardBar {
  timestamp: number;
  high: number;
  low: number;
  close: number;
}

/** Last closed bar of the research window for one context, plus its ATR. */
export interface ForwardMark {
  symbol: string;
  interval: string;
  close: number;
  atr: number;
  timestamp: number;
}

export interface ForwardPositionSeed {
  cycleIndex: number;
  jobId: string;
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
  /** Revision of the optimization profile in force, for exact attribution. */
  profileRevision: number | null;
  consensusScore: number;
  notionalBudgetUsd: number;
  maxLossBudgetUsd: number;
  /** Replay/holdout expectation this forward result will be measured against. */
  expectedPnlPct: number | null;
  mark: ForwardMark;
  maxHoldBars: number;
  costModel: TransactionCostModel;
  openedAt: number;
  stopAtrMultiple?: number;
  targetAtrMultiple?: number;
}

export interface ForwardPosition {
  id: string;
  cycleIndex: number;
  jobId: string;
  contextKey: string;
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
  profileRevision: number | null;
  consensusScore: number;
  expectedPnlPct: number | null;
  entryPrice: number;
  entryBarTimestamp: number;
  openedAt: number;
  stopPrice: number;
  targetPrice: number;
  quantity: number;
  notionalUsd: number;
  maxLossBudgetUsd: number;
  maxHoldBars: number;
  costModel: TransactionCostModel;
  state: ForwardPositionState;
  barsHeld: number;
  markPrice: number;
  markedAt: number;
  exitReason: ForwardExitReason | null;
  exitPrice: number | null;
  closedAt: number | null;
  grossPnlPct: number;
  costPct: number;
  netPnlPct: number;
  netPnlUsd: number;
}

const round = (value: number, places = 6): number =>
  Number.isFinite(value) ? Number(value.toFixed(places)) : 0;

const positive = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function forwardContextKey(input: {
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
}): string {
  return `${input.strategyId}:${input.symbol}:${input.interval}:${input.direction}`;
}

/**
 * Wilder-style average true range over the supplied bars. Returns 0 when the
 * window is too short or the data is degenerate; callers fall back to a
 * percentage width rather than inventing a risk distance.
 */
export function averageTrueRange(bars: readonly ForwardBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const window = Math.max(1, Math.min(period, bars.length - 1));
  const ranges: number[] = [];
  for (let i = bars.length - window; i < bars.length; i += 1) {
    const bar = bars[i];
    const previousClose = bars[i - 1].close;
    if (![bar.high, bar.low, previousClose].every(Number.isFinite)) continue;
    ranges.push(Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    ));
  }
  if (!ranges.length) return 0;
  const atr = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  return Number.isFinite(atr) && atr > 0 ? atr : 0;
}

/**
 * Open one simulated forward position for an approved paper slot.
 *
 * Quantity uses the same min(notional-bound, risk-bound) rule as
 * `sizePaperMultiTradePositions`, so the forward result reflects the budget the
 * council actually allocated rather than an arbitrary unit size.
 */
export function openForwardPosition(seed: ForwardPositionSeed): ForwardPosition | null {
  const entryPrice = positive(seed.mark.close);
  const notionalBudgetUsd = positive(seed.notionalBudgetUsd);
  const maxLossBudgetUsd = positive(seed.maxLossBudgetUsd);
  if (entryPrice === null || notionalBudgetUsd === null || maxLossBudgetUsd === null) return null;

  const atr = Number.isFinite(seed.mark.atr) && seed.mark.atr > 0 ? seed.mark.atr : 0;
  const stopMultiple = Number.isFinite(seed.stopAtrMultiple) && (seed.stopAtrMultiple as number) > 0
    ? Number(seed.stopAtrMultiple)
    : DEFAULT_FORWARD_STOP_ATR_MULTIPLE;
  const targetMultiple = Number.isFinite(seed.targetAtrMultiple) && (seed.targetAtrMultiple as number) > 0
    ? Number(seed.targetAtrMultiple)
    : DEFAULT_FORWARD_TARGET_ATR_MULTIPLE;
  const riskWidth = atr > 0
    ? atr * stopMultiple
    : entryPrice * (FALLBACK_STOP_WIDTH_PCT / 100);
  const rewardWidth = atr > 0
    ? atr * targetMultiple
    : riskWidth * (DEFAULT_FORWARD_TARGET_ATR_MULTIPLE / DEFAULT_FORWARD_STOP_ATR_MULTIPLE);
  if (!(riskWidth > 0) || !(rewardWidth > 0)) return null;

  const long = seed.direction === 'LONG';
  const stopPrice = round(long ? entryPrice - riskWidth : entryPrice + riskWidth, 8);
  const targetPrice = round(long ? entryPrice + rewardWidth : entryPrice - rewardWidth, 8);
  if (stopPrice <= 0 || targetPrice <= 0) return null;

  const quantity = round(Math.min(notionalBudgetUsd / entryPrice, maxLossBudgetUsd / riskWidth), 8);
  if (!(quantity > 0)) return null;
  const maxHoldBars = Math.max(1, Math.floor(Number(seed.maxHoldBars) || 1));

  return {
    id: `paper-forward:${seed.cycleIndex}:${seed.jobId}`,
    cycleIndex: seed.cycleIndex,
    jobId: seed.jobId,
    contextKey: forwardContextKey(seed),
    strategyId: seed.strategyId,
    symbol: seed.symbol,
    interval: seed.interval,
    direction: seed.direction,
    profileRevision: seed.profileRevision,
    consensusScore: round(seed.consensusScore, 6),
    expectedPnlPct: seed.expectedPnlPct === null || !Number.isFinite(seed.expectedPnlPct)
      ? null
      : round(seed.expectedPnlPct),
    entryPrice: round(entryPrice, 8),
    entryBarTimestamp: Math.floor(Number(seed.mark.timestamp) || 0),
    openedAt: Math.floor(Number(seed.openedAt) || 0),
    stopPrice,
    targetPrice,
    quantity,
    notionalUsd: round(quantity * entryPrice, 2),
    maxLossBudgetUsd: round(maxLossBudgetUsd, 2),
    maxHoldBars,
    costModel: { ...seed.costModel },
    state: 'OPEN',
    barsHeld: 0,
    markPrice: round(entryPrice, 8),
    markedAt: Math.floor(Number(seed.openedAt) || 0),
    exitReason: null,
    exitPrice: null,
    closedAt: null,
    grossPnlPct: 0,
    costPct: 0,
    netPnlPct: 0,
    netPnlUsd: 0,
  };
}

function applyCosts(position: ForwardPosition, exitPrice: number, barsHeld: number): {
  grossPnlPct: number;
  costPct: number;
  netPnlPct: number;
  netPnlUsd: number;
} {
  const gross = position.direction === 'LONG'
    ? (exitPrice - position.entryPrice) / position.entryPrice * 100
    : (position.entryPrice - exitPrice) / position.entryPrice * 100;
  // Fees, spread, slippage and funding are charged once as a round-trip
  // percentage by the shared replay formula. The fill prices above are the raw
  // stop/target/close levels precisely so this is not double counted.
  const costPct = computeTransactionCostPct(
    transactionCostInputsFromModel(position.costModel, position.entryPrice, Math.max(1, barsHeld)),
  );
  const netPnlPct = gross - costPct;
  return {
    grossPnlPct: round(gross),
    costPct: round(costPct),
    netPnlPct: round(netPnlPct),
    netPnlUsd: round(position.notionalUsd * netPnlPct / 100, 2),
  };
}

/**
 * Mark one open position against bars that arrived after it was opened.
 *
 * Look-ahead protection: every bar at or before `entryBarTimestamp` is dropped
 * here, so a caller that hands over the full candle window cannot accidentally
 * settle a position on the bar it entered on.
 *
 * Same-bar ambiguity resolves to the STOP. When a bar's range covers both the
 * stop and the target there is no way to know which printed first, so the
 * pessimistic branch is taken; an optimistic choice would quietly inflate the
 * forward evidence this loop is supposed to keep honest.
 */
export function markForwardPosition(
  position: ForwardPosition,
  bars: readonly ForwardBar[],
  now: number,
): ForwardPosition {
  if (position.state === 'CLOSED') return position;
  const forward = bars
    .filter((bar) => Number.isFinite(bar.timestamp) && bar.timestamp > position.entryBarTimestamp)
    .filter((bar) => [bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0))
    .sort((left, right) => left.timestamp - right.timestamp);
  if (!forward.length) return { ...position, markedAt: Math.floor(now) };

  const long = position.direction === 'LONG';
  for (let index = 0; index < forward.length; index += 1) {
    const bar = forward[index];
    const barsHeld = index + 1;
    const stopHit = long ? bar.low <= position.stopPrice : bar.high >= position.stopPrice;
    const targetHit = long ? bar.high >= position.targetPrice : bar.low <= position.targetPrice;

    let exitReason: ForwardExitReason | null = null;
    let exitPrice = 0;
    if (stopHit) {
      exitReason = 'STOP';
      exitPrice = position.stopPrice;
    } else if (targetHit) {
      exitReason = 'TARGET';
      exitPrice = position.targetPrice;
    } else if (barsHeld >= position.maxHoldBars) {
      exitReason = 'MAX_HOLD';
      exitPrice = bar.close;
    }

    if (exitReason) {
      return {
        ...position,
        state: 'CLOSED',
        barsHeld,
        markPrice: round(bar.close, 8),
        markedAt: Math.floor(now),
        exitReason,
        exitPrice: round(exitPrice, 8),
        closedAt: bar.timestamp,
        ...applyCosts(position, exitPrice, barsHeld),
      };
    }
  }

  // Still running: report the unrealized mark so an operator can see the
  // position is alive rather than silently stalled.
  const last = forward[forward.length - 1];
  const barsHeld = Math.min(forward.length, position.maxHoldBars);
  return {
    ...position,
    state: 'OPEN',
    barsHeld,
    markPrice: round(last.close, 8),
    markedAt: Math.floor(now),
    ...applyCosts(position, last.close, barsHeld),
  };
}

function outcomeFor(position: ForwardPosition): SignalDecisionLog['laterOutcome'] {
  if (position.state !== 'CLOSED') return 'UNKNOWN';
  if (position.netPnlPct > 0) return 'WIN';
  if (position.netPnlPct < 0) return 'LOSS';
  return 'BREAKEVEN';
}

/**
 * Project a position into the project's existing decision-row vocabulary.
 *
 * The id is stable across marks, so re-emitting a position UPDATES its row in
 * the research mirror instead of appending a duplicate.
 */
export function forwardPositionToLog(position: ForwardPosition): SignalDecisionLog {
  const timestamp = position.markedAt || position.openedAt;
  return {
    id: position.id,
    cycleId: `autopilot-forward:${position.cycleIndex}`,
    timestamp,
    isoTime: new Date(timestamp).toISOString(),
    ticker: position.symbol,
    direction: position.direction,
    decision: 'ACCEPTED',
    reasonCode: 'ACCEPTED_BEST_CANDIDATE',
    reasonText: position.state === 'CLOSED'
      ? `Forward paper position closed on ${position.exitReason} after ${position.barsHeld} bar(s): ${position.netPnlPct}% net of ${position.costPct}% costs.`
      : `Forward paper position open for ${position.barsHeld} bar(s) at mark ${position.markPrice}.`,
    laterOutcome: outcomeFor(position),
    laterPnl: position.state === 'CLOSED' ? position.netPnlPct : undefined,
    price: position.entryPrice,
    // Provenance marker — recognised by isResearchOutcomeLog, which is what
    // keeps these simulated rows out of the live decision-memory mirror.
    marketSnapshotSummary: {
      source: PAPER_FORWARD_SOURCE,
      version: PAPER_FORWARD_VERSION,
      researchOnly: true,
      paperOnly: true,
      shadowOnly: true,
      executionAuthorized: false,
      orderSubmissionAllowed: false,
      simulated: true,
      forwardEvaluation: true,
      strategyId: position.strategyId,
      interval: position.interval,
      jobId: position.jobId,
      contextKey: position.contextKey,
      cycleIndex: position.cycleIndex,
      profileRevision: position.profileRevision,
      forwardState: position.state,
      expectedPnlPct: position.expectedPnlPct,
      realizedPnlPct: position.state === 'CLOSED' ? position.netPnlPct : null,
      expectationGapPct: position.state === 'CLOSED' && position.expectedPnlPct !== null
        ? round(position.netPnlPct - position.expectedPnlPct)
        : null,
      forward: position,
    },
  };
}

/** True when a decision row is a simulated forward paper position. */
export function isPaperForwardLog(row: Pick<SignalDecisionLog, 'marketSnapshotSummary'>): boolean {
  const summary = row.marketSnapshotSummary as Record<string, unknown> | undefined;
  return Boolean(summary && summary.researchOnly === true && summary.source === PAPER_FORWARD_SOURCE);
}

/**
 * Rebuild a position from a stored row. Returns null for anything that is not a
 * well-formed forward row, so a corrupt or foreign row is skipped rather than
 * silently becoming a zero-PnL sample.
 */
export function logToForwardPosition(row: Pick<SignalDecisionLog, 'marketSnapshotSummary'>): ForwardPosition | null {
  if (!isPaperForwardLog(row)) return null;
  const summary = row.marketSnapshotSummary as Record<string, unknown>;
  const forward = summary.forward as Partial<ForwardPosition> | undefined;
  if (!forward || typeof forward !== 'object') return null;
  if (typeof forward.id !== 'string' || typeof forward.symbol !== 'string') return null;
  if (forward.direction !== 'LONG' && forward.direction !== 'SHORT') return null;
  if (forward.state !== 'OPEN' && forward.state !== 'CLOSED') return null;
  if (!Number.isFinite(forward.entryPrice) || !((forward.entryPrice as number) > 0)) return null;
  if (!forward.costModel || typeof forward.costModel !== 'object') return null;
  return forward as ForwardPosition;
}

export function readForwardPositions(rows: readonly Pick<SignalDecisionLog, 'marketSnapshotSummary'>[]): ForwardPosition[] {
  const positions: ForwardPosition[] = [];
  for (const row of rows) {
    const position = logToForwardPosition(row);
    if (position) positions.push(position);
  }
  return positions;
}

export interface ForwardEvidenceEntry {
  contextKey: string;
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
  resolved: number;
  open: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRatePct: number;
  meanNetPnlPct: number;
  totalNetPnlUsd: number;
  worstNetPnlPct: number;
  meanCostPct: number;
  /** Forward net minus the replay expectation. Negative = backtest was optimistic. */
  meanExpectationGapPct: number | null;
  lastClosedAt: number | null;
  lastCycleIndex: number | null;
  verdict: ForwardVerdict;
}

export interface ForwardEvidenceReport {
  version: typeof PAPER_FORWARD_VERSION;
  entries: ForwardEvidenceEntry[];
  demotedContextKeys: string[];
  improveContextKeys: string[];
  resolvedPositions: number;
  openPositions: number;
  researchOnly: true;
  executionAuthorized: false;
}

export interface ForwardEvidenceOptions {
  /** Closed forward positions required before a verdict is anything but INSUFFICIENT_EVIDENCE. */
  minResolvedSamples?: number;
  /** Mean net PnL% at or below this demotes the context. */
  demoteMeanNetPnlPct?: number;
  /** Mean net PnL% at or above this (with the win-rate floor) marks it IMPROVE. */
  improveMeanNetPnlPct?: number;
  improveMinWinRatePct?: number;
}

/**
 * Aggregate closed forward positions per strategy/symbol/interval/direction and
 * turn each group into an improve / retain / demote verdict.
 *
 * Deliberately conservative: a context with too few closed samples is
 * INSUFFICIENT_EVIDENCE, never RETAIN, so thin evidence cannot be read as an
 * endorsement.
 */
export function aggregateForwardEvidence(
  positions: readonly ForwardPosition[],
  options: ForwardEvidenceOptions = {},
): ForwardEvidenceReport {
  const minResolvedSamples = Math.max(1, Math.floor(Number(options.minResolvedSamples) || 3));
  const demoteMeanNetPnlPct = Number.isFinite(options.demoteMeanNetPnlPct) ? Number(options.demoteMeanNetPnlPct) : 0;
  const improveMeanNetPnlPct = Number.isFinite(options.improveMeanNetPnlPct) ? Number(options.improveMeanNetPnlPct) : 0.25;
  const improveMinWinRatePct = Number.isFinite(options.improveMinWinRatePct) ? Number(options.improveMinWinRatePct) : 50;

  const groups = new Map<string, ForwardPosition[]>();
  for (const position of positions) {
    const key = position.contextKey || forwardContextKey(position);
    const bucket = groups.get(key) ?? [];
    bucket.push(position);
    groups.set(key, bucket);
  }

  const entries: ForwardEvidenceEntry[] = [];
  let resolvedPositions = 0;
  let openPositions = 0;

  for (const [contextKey, bucket] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const closed = bucket.filter((position) => position.state === 'CLOSED');
    const open = bucket.length - closed.length;
    resolvedPositions += closed.length;
    openPositions += open;

    const head = bucket[0];
    const wins = closed.filter((position) => position.netPnlPct > 0).length;
    const losses = closed.filter((position) => position.netPnlPct < 0).length;
    const breakeven = closed.length - wins - losses;
    const netPcts = closed.map((position) => position.netPnlPct);
    const meanNetPnlPct = netPcts.length ? netPcts.reduce((sum, value) => sum + value, 0) / netPcts.length : 0;
    const gaps = closed
      .filter((position) => position.expectedPnlPct !== null && Number.isFinite(position.expectedPnlPct))
      .map((position) => position.netPnlPct - Number(position.expectedPnlPct));

    let verdict: ForwardVerdict;
    if (closed.length < minResolvedSamples) verdict = 'INSUFFICIENT_EVIDENCE';
    else if (meanNetPnlPct <= demoteMeanNetPnlPct) verdict = 'DEMOTE';
    else if (meanNetPnlPct >= improveMeanNetPnlPct && (wins / closed.length) * 100 >= improveMinWinRatePct) verdict = 'IMPROVE';
    else verdict = 'RETAIN';

    entries.push({
      contextKey,
      strategyId: head.strategyId,
      symbol: head.symbol,
      interval: head.interval,
      direction: head.direction,
      resolved: closed.length,
      open,
      wins,
      losses,
      breakeven,
      winRatePct: closed.length ? round((wins / closed.length) * 100, 4) : 0,
      meanNetPnlPct: round(meanNetPnlPct),
      totalNetPnlUsd: round(closed.reduce((sum, position) => sum + position.netPnlUsd, 0), 2),
      worstNetPnlPct: netPcts.length ? round(Math.min(...netPcts)) : 0,
      meanCostPct: closed.length
        ? round(closed.reduce((sum, position) => sum + position.costPct, 0) / closed.length)
        : 0,
      meanExpectationGapPct: gaps.length ? round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : null,
      lastClosedAt: closed.length ? Math.max(...closed.map((position) => position.closedAt ?? 0)) : null,
      lastCycleIndex: bucket.length ? Math.max(...bucket.map((position) => position.cycleIndex)) : null,
      verdict,
    });
  }

  return {
    version: PAPER_FORWARD_VERSION,
    entries,
    demotedContextKeys: entries.filter((entry) => entry.verdict === 'DEMOTE').map((entry) => entry.contextKey),
    improveContextKeys: entries.filter((entry) => entry.verdict === 'IMPROVE').map((entry) => entry.contextKey),
    resolvedPositions,
    openPositions,
    researchOnly: true,
    executionAuthorized: false,
  };
}

export interface ForwardDemotion {
  id: string;
  contextKey: string;
  reason: 'FORWARD_EVIDENCE_DEMOTED';
  meanNetPnlPct: number;
  resolved: number;
}

/**
 * Drop contexts the forward evidence has demoted from the next cycle's research
 * rotation.
 *
 * A floor of `minRetained` contexts is always kept: a run of bad forward luck
 * across every context must not leave Autopilot with nothing to research, which
 * would stall the loop instead of correcting it. Demoted contexts are still
 * eligible again as soon as newer forward evidence clears them.
 */
export function applyForwardEvidenceToContexts<T extends {
  id: string;
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
}>(
  contexts: readonly T[],
  report: ForwardEvidenceReport,
  options: { minRetained?: number } = {},
): { contexts: T[]; demoted: ForwardDemotion[] } {
  const minRetained = Math.max(1, Math.floor(Number(options.minRetained) || 1));
  const demotedKeys = new Set(report.demotedContextKeys);
  if (!demotedKeys.size) return { contexts: [...contexts], demoted: [] };

  const byKey = new Map(report.entries.map((entry) => [entry.contextKey, entry]));
  const kept: T[] = [];
  const candidatesForDemotion: T[] = [];
  for (const context of contexts) {
    if (demotedKeys.has(forwardContextKey(context))) candidatesForDemotion.push(context);
    else kept.push(context);
  }

  // Restore the least-bad demoted contexts until the floor is met.
  const ordered = [...candidatesForDemotion].sort((left, right) => {
    const leftMean = byKey.get(forwardContextKey(left))?.meanNetPnlPct ?? 0;
    const rightMean = byKey.get(forwardContextKey(right))?.meanNetPnlPct ?? 0;
    return rightMean - leftMean;
  });
  while (kept.length < minRetained && ordered.length) kept.push(ordered.shift() as T);

  const keptIds = new Set(kept.map((context) => context.id));
  const demoted: ForwardDemotion[] = candidatesForDemotion
    .filter((context) => !keptIds.has(context.id))
    .map((context) => {
      const key = forwardContextKey(context);
      const entry = byKey.get(key);
      return {
        id: context.id,
        contextKey: key,
        reason: 'FORWARD_EVIDENCE_DEMOTED' as const,
        meanNetPnlPct: entry?.meanNetPnlPct ?? 0,
        resolved: entry?.resolved ?? 0,
      };
    });

  // Preserve the caller's original ordering; the plan's rotation depends on it.
  const order = new Map(contexts.map((context, index) => [context.id, index]));
  kept.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  return { contexts: kept, demoted };
}
