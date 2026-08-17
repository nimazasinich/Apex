import type {
  CandidateScore,
  SignalLifecycleOutcome,
  SignalLifecycleSnapshot,
  SignalLifecycleState,
  TradeDirection,
} from '../types';
import { allocateSignalId } from '../utils/signalId';
import {
  advanceLifecycle,
  advanceStaleLifecycle,
  isTerminalState,
  MAX_STALE_CONTEXT_TICKS,
} from './lifecycleCore';
import type { LifecycleClosure } from './decisionOutcome';

const STORAGE_KEY = 'apex.signal-lifecycle.shadow.v1';
const DEFAULT_MAX_LIFETIME_MS = 20 * 60 * 1000;
const TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_RECORDS = 100;

export interface SignalLifecycleRecord extends SignalLifecycleSnapshot {
  ticker: string;
  direction: TradeDirection;
  entry: number;
  lastPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence: number;
  dataState: CandidateScore['dataState'];
  lastSeenAt: number;
  missingScans: number;
}

export interface LifecycleTransition {
  previousState: SignalLifecycleState;
  nextState: SignalLifecycleState;
  record: SignalLifecycleRecord;
}

export interface LifecycleUpdateResult {
  longCandidates: CandidateScore[];
  shortCandidates: CandidateScore[];
  transitions: LifecycleTransition[];
  closures: LifecycleClosure[];
  created: SignalLifecycleRecord[];
  records: SignalLifecycleRecord[];
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRecords(): SignalLifecycleRecord[] {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is SignalLifecycleRecord =>
      row && typeof row.signalId === 'string' && typeof row.ticker === 'string' &&
      (row.direction === 'LONG' || row.direction === 'SHORT') &&
      ['CANDIDATE', 'CONFIRMED', 'ACTIVE', 'INVALIDATED', 'EXPIRED'].includes(row.state)
    ).map((row) => ({
      ...row,
      lastSeenAt: Number.isFinite(row.lastSeenAt) ? row.lastSeenAt : row.updatedAt,
      missingScans: Number.isFinite(row.missingScans) ? Math.max(0, row.missingScans) : 0,
      entry: Number.isFinite(row.entry) ? row.entry : row.lastPrice,
      stopLoss: finiteOrUndefined(row.stopLoss),
      takeProfit: finiteOrUndefined(row.takeProfit),
    })).slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

function writeRecords(records: SignalLifecycleRecord[], now: number): void {
  if (!storageAvailable()) return;
  try {
    const sorted = records
      .filter((row) => !isTerminalState(row.state) || now - row.updatedAt <= TERMINAL_RETENTION_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RECORDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // Lifecycle is observability-only; storage failure must never break scanning.
  }
}

function thesisKey(ticker: string, direction: TradeDirection): string {
  return `${ticker}|${direction}`;
}

function qualifies(candidate: CandidateScore): boolean {
  return candidate.guardPass && candidate.readinessTier !== 'BLOCKED';
}

function confidenceFor(candidate: CandidateScore): number {
  const value = candidate.canonicalDecision?.confidence ?? candidate.score / 100;
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function newRecord(candidate: CandidateScore, now: number): SignalLifecycleRecord {
  const context = candidate.lifecycleContext;
  const entry = finiteOrUndefined(context?.entryPrice) ?? candidate.lastPrice;
  return {
    signalId: allocateSignalId(candidate.symbol, candidate.direction),
    ticker: candidate.symbol,
    direction: candidate.direction,
    state: 'CANDIDATE',
    bornAt: now,
    updatedAt: now,
    maxLifetimeMs: DEFAULT_MAX_LIFETIME_MS,
    confirmTicks: 0,
    failTicks: 0,
    staleTicks: 0,
    reversalTicks: 0,
    exitLevelsValid: Number.isFinite(context?.stopLoss) && Number.isFinite(context?.takeProfit),
    outcome: null,
    entryPrice: entry,
    stopLoss: finiteOrUndefined(context?.stopLoss),
    takeProfit: finiteOrUndefined(context?.takeProfit),
    entry,
    lastPrice: candidate.lastPrice,
    confidence: confidenceFor(candidate),
    dataState: candidate.dataState,
    lastSeenAt: now,
    missingScans: 0,
    shadowOnly: true,
  };
}

function snapshot(record: SignalLifecycleRecord): SignalLifecycleSnapshot {
  return {
    signalId: record.signalId,
    state: record.state,
    bornAt: record.bornAt,
    updatedAt: record.updatedAt,
    maxLifetimeMs: record.maxLifetimeMs,
    confirmTicks: record.confirmTicks,
    failTicks: record.failTicks,
    staleTicks: record.staleTicks,
    reversalTicks: record.reversalTicks,
    exitLevelsValid: record.exitLevelsValid,
    outcome: record.outcome,
    entryPrice: record.entry,
    stopLoss: record.stopLoss,
    takeProfit: record.takeProfit,
    shadowOnly: true,
  };
}

function outcomeR(record: SignalLifecycleRecord): number | undefined {
  const risk = Number.isFinite(record.stopLoss) ? Math.abs(record.entry - (record.stopLoss as number)) : 0;
  if (!risk || !Number.isFinite(record.lastPrice)) return undefined;
  const pnl = record.direction === 'LONG'
    ? record.lastPrice - record.entry
    : record.entry - record.lastPrice;
  return Number((pnl / risk).toFixed(4));
}

function closureFor(record: SignalLifecycleRecord): LifecycleClosure {
  return {
    signalId: record.signalId,
    ticker: record.ticker,
    direction: record.direction,
    outcome: record.outcome ?? 'EXPIRED',
    pnlR: record.outcome === 'BREAKEVEN' ? 0 : outcomeR(record),
    resolvedAt: record.updatedAt,
    bornAt: record.bornAt,
    entryPrice: record.entry,
    exitPrice: Number.isFinite(record.lastPrice) ? record.lastPrice : undefined,
    provenance: { source: 'SIGNAL_LIFECYCLE_TRACKER', version: 'signal_lifecycle_v1' },
  };
}

function advanceRecord(
  record: SignalLifecycleRecord,
  candidate: CandidateScore,
  now: number,
): { record: SignalLifecycleRecord; transition?: LifecycleTransition; closure?: LifecycleClosure } {
  const previousState = record.state;
  const ageMs = Math.max(0, now - record.bornAt);
  const ctx = candidate.lifecycleContext;
  let nextState = previousState;
  let outcome: SignalLifecycleOutcome | null = record.outcome;
  let confirmTicks = record.confirmTicks;
  let failTicks = record.failTicks;
  let staleTicks = record.staleTicks;
  let reversalTicks = record.reversalTicks;
  let exitLevelsValid = record.exitLevelsValid;

  if (!ctx || ctx.dataState === 'unavailable' || !Number.isFinite(ctx.smoothedObi)) {
    const stale = advanceStaleLifecycle({
      current: previousState,
      ageMs,
      maxLifetimeMs: record.maxLifetimeMs,
      staleTicks,
    });
    nextState = stale.next;
    staleTicks = stale.staleTicks;
  } else {
    const live = advanceLifecycle({
      current: previousState,
      direction: candidate.direction,
      smoothedObi: ctx.smoothedObi,
      confluence1M: ctx.confluence1M,
      confluenceAvailable: ctx.confluenceAvailable,
      qualificationPass: qualifies(candidate),
      ageMs,
      maxLifetimeMs: record.maxLifetimeMs,
      price: candidate.lastPrice,
      stopLoss: record.stopLoss,
      takeProfit: record.takeProfit,
      confidence: confidenceFor(candidate),
      confirmTicks,
      failTicks,
      reversalTicks,
    });
    nextState = live.next;
    confirmTicks = live.confirmTicks;
    failTicks = live.failTicks;
    reversalTicks = live.reversalTicks;
    exitLevelsValid = live.exitLevelsValid;
    outcome = live.outcome ?? outcome;
    staleTicks = 0;
  }

  const updated: SignalLifecycleRecord = {
    ...record,
    state: nextState,
    updatedAt: now,
    lastSeenAt: now,
    missingScans: 0,
    lastPrice: candidate.lastPrice,
    confidence: confidenceFor(candidate),
    dataState: candidate.dataState,
    confirmTicks,
    failTicks,
    staleTicks,
    reversalTicks,
    exitLevelsValid,
    outcome,
  };

  const transition = previousState !== nextState
    ? { previousState, nextState, record: updated }
    : undefined;
  const closure = !isTerminalState(previousState) && isTerminalState(nextState)
    ? closureFor(updated)
    : undefined;
  return { record: updated, transition, closure };
}

function advanceMissingRecord(
  record: SignalLifecycleRecord,
  now: number,
): { record: SignalLifecycleRecord; transition?: LifecycleTransition; closure?: LifecycleClosure } {
  if (isTerminalState(record.state)) {
    return { record: { ...record, missingScans: record.missingScans + 1 } };
  }
  const stale = advanceStaleLifecycle({
    current: record.state,
    ageMs: Math.max(0, now - record.bornAt),
    maxLifetimeMs: record.maxLifetimeMs,
    staleTicks: record.staleTicks,
  });
  const updated: SignalLifecycleRecord = {
    ...record,
    state: stale.next,
    updatedAt: now,
    staleTicks: stale.staleTicks,
    missingScans: record.missingScans + 1,
    dataState: 'unavailable',
  };
  const transition = record.state !== updated.state
    ? { previousState: record.state, nextState: updated.state, record: updated }
    : undefined;
  const closure = !isTerminalState(record.state) && isTerminalState(updated.state)
    ? closureFor(updated)
    : undefined;
  return { record: updated, transition, closure };
}

/**
 * Advance lifecycle records using only verified candidate payload fields.
 * This is shadow-only: it annotates candidates and decision memory but never
 * changes ranking, readiness, risk checks, order preview or execution.
 */
export function updateSignalLifecycles(
  longCandidates: CandidateScore[],
  shortCandidates: CandidateScore[],
  now = Date.now(),
): LifecycleUpdateResult {
  const stored = readRecords();
  const byKey = new Map(stored.map((row) => [thesisKey(row.ticker, row.direction), row]));
  const seen = new Set<string>();
  const transitions: LifecycleTransition[] = [];
  const closures: LifecycleClosure[] = [];
  const created: SignalLifecycleRecord[] = [];

  const update = (candidate: CandidateScore): CandidateScore => {
    const key = thesisKey(candidate.symbol, candidate.direction);
    seen.add(key);
    let record = byKey.get(key);
    if (!record && !qualifies(candidate)) return candidate;
    if (!record || (isTerminalState(record.state) && record.missingScans > 0 && qualifies(candidate))) {
      record = newRecord(candidate, now);
      created.push(record);
    }
    const advanced: {
      record: SignalLifecycleRecord;
      transition?: LifecycleTransition;
      closure?: LifecycleClosure;
    } = isTerminalState(record.state)
      ? { record: { ...record, lastSeenAt: now, missingScans: 0, lastPrice: candidate.lastPrice } }
      : advanceRecord(record, candidate, now);
    byKey.set(key, advanced.record);
    if (advanced.transition) transitions.push(advanced.transition);
    if (advanced.closure) closures.push(advanced.closure);
    return {
      ...candidate,
      signalId: advanced.record.signalId,
      signalLifecycle: snapshot(advanced.record),
    };
  };

  const nextLong = longCandidates.map(update);
  const nextShort = shortCandidates.map(update);

  for (const [key, record] of byKey.entries()) {
    if (seen.has(key)) continue;
    const advanced = advanceMissingRecord(record, now);
    byKey.set(key, advanced.record);
    if (advanced.transition) transitions.push(advanced.transition);
    if (advanced.closure) closures.push(advanced.closure);
  }

  const records = [...byKey.values()]
    .filter((row) => !isTerminalState(row.state) || now - row.updatedAt <= TERMINAL_RETENTION_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECORDS);
  writeRecords(records, now);
  return { longCandidates: nextLong, shortCandidates: nextShort, transitions, closures, created, records };
}

export function readSignalLifecycleRecords(): SignalLifecycleRecord[] {
  return readRecords();
}

export function clearSignalLifecycleRecords(): void {
  if (!storageAvailable()) return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export { MAX_STALE_CONTEXT_TICKS };
