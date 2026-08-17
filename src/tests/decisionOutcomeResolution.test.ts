import { describe, expect, it } from 'vitest';
import type { SignalDecisionLog } from '../types';
import { attachLifecycleClosure, attachOutcome } from '../services/decisionOutcome';

const base: SignalDecisionLog = {
  id: 'decision-1', signalId: 'signal-1', cycleId: 'cycle-1', timestamp: 1_000, isoTime: new Date(1_000).toISOString(),
  ticker: 'BTCUSDT', direction: 'LONG', decision: 'ACCEPTED', reasonCode: 'ACCEPTED_BEST_CANDIDATE', reasonText: 'accepted', price: 100,
};

describe('decision outcome resolution metadata', () => {
  it('persists lifecycle provenance, horizon and references without imputing unavailable costs', () => {
    const result = attachLifecycleClosure([base], {
      signalId: 'signal-1', ticker: 'BTCUSDT', direction: 'LONG', outcome: 'WIN', pnlR: 2,
      bornAt: 1_000, resolvedAt: 5_000, entryPrice: 100, exitPrice: 104,
    });
    const resolution = result.updated?.outcomeResolution;
    expect(result.updated?.laterOutcome).toBe('WIN');
    expect(resolution?.horizonMs).toBe(4_000);
    expect(resolution?.returnDefinition).toBe('R_MULTIPLE');
    expect(resolution?.entryReference.price).toBe(100);
    expect(resolution?.exitReference.price).toBe(104);
    expect(resolution?.fees).toEqual({ value: null, currency: null, status: 'NOT_AVAILABLE' });
    expect(resolution?.funding.status).toBe('NOT_AVAILABLE');
    expect(resolution?.provenance.source).toBe('SIGNAL_LIFECYCLE_TRACKER');
  });

  it('records why a lifecycle return could not be resolved instead of inventing one', () => {
    const result = attachLifecycleClosure([base], {
      signalId: 'signal-1', ticker: 'BTCUSDT', direction: 'LONG', outcome: 'EXPIRED',
      bornAt: 1_000, resolvedAt: 5_000, entryPrice: 100,
    });
    expect(result.updated?.laterPnl).toBeUndefined();
    expect(result.updated?.outcomeResolution?.returnValue).toBeNull();
    expect(result.updated?.outcomeResolution?.unresolvedReason).toBe('return_value_unavailable');
  });

  it('retains memory-log percentage semantics and rejects unverifiable timestamp via metadata', () => {
    const result = attachOutcome([base], {
      id: 'memory-1', signalId: 'signal-1', timestamp: 'not-a-time', ticker: 'BTCUSDT', direction: 'LONG', pnlPercentage: 1.25,
      outcome: 'WIN', heuristicsTuned: { compositeConfidenceAdjustment: 0, riskFixedFactor: 1 }, note: 'resolved',
    });
    expect(result.updated?.outcomeResolution?.returnDefinition).toBe('PERCENTAGE');
    expect(result.updated?.outcomeResolution?.outcomeTimestamp).toBeNull();
    expect(result.updated?.outcomeResolution?.unresolvedReason).toBe('outcome_timestamp_unverifiable');
  });
});
