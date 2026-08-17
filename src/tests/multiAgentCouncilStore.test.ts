import { describe, expect, it } from 'vitest';
import { MultiAgentCouncilStore } from '../services/multiAgentCouncilStore';
import type { MultiAgentResearchCouncilReport } from '../services/multiAgentResearchCouncil';

const plan = { id: 'a', strategyId: 's', symbol: 'BTC-USDT', direction: 'LONG' as const, consensusScore: 0.9, allocationWeight: 0.4, notionalBudgetUsd: 4000, maxLossBudgetUsd: 100, riskPctOfCapital: 1, orderSubmissionAllowed: false as const, requiresManualConfirmation: true as const };
const report = { deterministicFingerprint: 'a'.repeat(64), paperTradePlan: [plan], safety: { researchOnly: true, paperOnly: true, executionAuthorized: false } } as unknown as MultiAgentResearchCouncilReport;

describe('multi agent council provenance store', () => {
  it('accepts the exact server-issued plan set and rejects a tampered one', () => {
    const store = new MultiAgentCouncilStore(60_000);
    const receipt = store.put(report, 1_000);
    expect(store.verify(report.deterministicFingerprint, [plan], 2_000).planFingerprint).toBe(receipt.planFingerprint);
    expect(() => store.verify(report.deterministicFingerprint, [{ ...plan, maxLossBudgetUsd: 101 }], 2_000)).toThrow('paper_multi_trade_plan_fingerprint_mismatch');
  });
});
