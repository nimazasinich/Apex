import { describe, expect, it } from 'vitest';
import { attachOutcome } from '../services/decisionOutcome';
import type { MemoryLog, SignalDecisionLog } from '../types';

const decision = (id: string, signalId: string): SignalDecisionLog => ({
  id,
  signalId,
  cycleId: `cycle-${id}`,
  timestamp: 1,
  isoTime: new Date(1).toISOString(),
  ticker: 'BTC-USDT',
  direction: 'SHORT',
  decision: 'ACCEPTED',
  reasonCode: 'ACCEPTED_BEST_CANDIDATE',
  reasonText: 'test',
  laterOutcome: 'UNKNOWN',
});

const outcome = (signalId?: string): MemoryLog => ({
  id: 'outcome-1',
  signalId,
  timestamp: '12:00:00',
  ticker: 'BTC-USDT',
  direction: 'SHORT',
  pnlPercentage: 1.25,
  outcome: 'WIN',
  heuristicsTuned: { compositeConfidenceAdjustment: 0.03, riskFixedFactor: 1.01 },
  note: 'test',
});

describe('attachOutcome', () => {
  it('updates the exact accepted decision by signalId', () => {
    const result = attachOutcome([decision('newer', 's2'), decision('target', 's1')], outcome('s1'));
    expect(result.updated?.id).toBe('target');
    expect(result.updated?.laterOutcome).toBe('WIN');
    expect(result.updated?.laterPnl).toBe(1.25);
  });

  it('does not fall back to ticker matching when a signalId is present but unknown', () => {
    const logs = [decision('other', 's2')];
    expect(attachOutcome(logs, outcome('missing')).logs).toBe(logs);
  });
});
