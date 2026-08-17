import type { MemoryLog, SignalDecisionLog } from '../types';
import { DecisionMemoryDB } from './decisionMemory';

export interface LifecycleClosure {
  signalId: string;
  ticker: string;
  direction: 'SHORT' | 'LONG';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'EXPIRED';
  pnlR?: number;
  resolvedAt: number;
  bornAt: number;
  entryPrice: number;
  exitPrice?: number;
  /** Exchange costs are optional because the shadow lifecycle has no fill ledger. */
  fees?: { value: number; currency?: string };
  funding?: { value: number; currency?: string };
  provenance?: { source: 'SIGNAL_LIFECYCLE_TRACKER'; version: string };
}

function finiteOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function cost(value: LifecycleClosure['fees'] | LifecycleClosure['funding'] | undefined) {
  const amount = finiteOrNull(value?.value);
  return amount === null
    ? { value: null, currency: null, status: 'NOT_AVAILABLE' as const }
    : { value: amount, currency: value?.currency ? String(value.currency) : null, status: 'VERIFIED' as const };
}

export function attachOutcome(
  logs: SignalDecisionLog[],
  outcome: MemoryLog,
): { logs: SignalDecisionLog[]; updated?: SignalDecisionLog } {
  const index = logs.findIndex(decision =>
    decision.decision === 'ACCEPTED' &&
    (decision.laterOutcome === undefined || decision.laterOutcome === 'UNKNOWN') &&
    (
      (Boolean(outcome.signalId) && decision.signalId === outcome.signalId) ||
      (!outcome.signalId && decision.ticker === outcome.ticker && decision.direction === outcome.direction)
    )
  );
  if (index < 0) return { logs };
  const outcomeTimestamp = timestampOrNull(outcome.timestamp);
  const returnValue = finiteOrNull(outcome.pnlPercentage);
  const updated: SignalDecisionLog = {
    ...logs[index],
    laterOutcome: outcome.outcome,
    laterPnl: returnValue ?? undefined,
    outcomeResolution: {
      schemaVersion: 1,
      outcomeTimestamp,
      horizonMs: outcomeTimestamp === null ? null : Math.max(0, outcomeTimestamp - logs[index].timestamp),
      returnDefinition: 'PERCENTAGE',
      returnValue,
      entryReference: { price: finiteOrNull(logs[index].price), timestamp: logs[index].timestamp, source: 'MEMORY_LOG' },
      exitReference: { price: null, timestamp: outcomeTimestamp, source: 'MEMORY_LOG' },
      fees: { value: null, currency: null, status: 'NOT_AVAILABLE' },
      funding: { value: null, currency: null, status: 'NOT_AVAILABLE' },
      provenance: { source: 'MEMORY_LOG', version: 'memory_log_v1' },
      unresolvedReason: outcomeTimestamp === null ? 'outcome_timestamp_unverifiable' : returnValue === null ? 'return_value_unverifiable' : null,
    },
  };
  const next = [...logs];
  next[index] = updated;
  return { logs: next, updated };
}

export function attachLifecycleClosure(
  logs: SignalDecisionLog[],
  closure: LifecycleClosure,
): { logs: SignalDecisionLog[]; updated?: SignalDecisionLog } {
  const index = logs.findIndex((decision) =>
    decision.decision === 'ACCEPTED' &&
    decision.signalId === closure.signalId &&
    (decision.laterOutcome === undefined || decision.laterOutcome === 'UNKNOWN')
  );
  if (index < 0) return { logs };
  const resolvedAt = timestampOrNull(closure.resolvedAt);
  const bornAt = timestampOrNull(closure.bornAt);
  const returnValue = finiteOrNull(closure.pnlR);
  const updated: SignalDecisionLog = {
    ...logs[index],
    laterOutcome: closure.outcome,
    laterPnl: returnValue ?? undefined,
    outcomeResolution: {
      schemaVersion: 1,
      outcomeTimestamp: resolvedAt,
      horizonMs: resolvedAt === null || bornAt === null ? null : Math.max(0, resolvedAt - bornAt),
      returnDefinition: 'R_MULTIPLE',
      returnValue,
      entryReference: { price: finiteOrNull(closure.entryPrice), timestamp: bornAt, source: 'SIGNAL_LIFECYCLE' },
      exitReference: { price: finiteOrNull(closure.exitPrice), timestamp: resolvedAt, source: 'SIGNAL_LIFECYCLE' },
      fees: cost(closure.fees),
      funding: cost(closure.funding),
      provenance: closure.provenance ?? { source: 'SIGNAL_LIFECYCLE_TRACKER', version: 'signal_lifecycle_v1' },
      unresolvedReason: returnValue === null ? 'return_value_unavailable' : null,
    },
  };
  const next = [...logs];
  next[index] = updated;
  return { logs: next, updated };
}

/** Patch the exact persisted accepted decision. Never falls back when signalId exists. */
export async function linkLifecycleClosureToDecisionMemory(
  closure: LifecycleClosure,
): Promise<SignalDecisionLog | null> {
  const logs = await DecisionMemoryDB.list(1000);
  const result = attachLifecycleClosure(logs, closure);
  if (!result.updated) return null;
  await DecisionMemoryDB.patch(result.updated.id, {
    laterOutcome: result.updated.laterOutcome,
    laterPnl: result.updated.laterPnl,
    outcomeResolution: result.updated.outcomeResolution,
  });
  return result.updated;
}
