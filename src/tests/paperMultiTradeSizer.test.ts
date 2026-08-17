import { describe, expect, it } from 'vitest';
import type { PaperTradeBudgetPlan } from '../services/multiAgentResearchCouncil';
import { fingerprintPaperTradePlans } from '../services/paperTradePlanIntegrity';
import { sizePaperMultiTradePositions } from '../services/execution/paperMultiTradeSizer';

const fingerprint = 'a'.repeat(64);
const plans: PaperTradeBudgetPlan[] = [
  { id: 'btc', strategyId: 'trend', symbol: 'BTC-USDT', direction: 'LONG', consensusScore: 0.8, allocationWeight: 0.4, notionalBudgetUsd: 40_000, maxLossBudgetUsd: 500, riskPctOfCapital: 0.5, orderSubmissionAllowed: false, requiresManualConfirmation: true },
  { id: 'eth', strategyId: 'squeeze', symbol: 'ETH-USDT', direction: 'SHORT', consensusScore: 0.75, allocationWeight: 0.3, notionalBudgetUsd: 30_000, maxLossBudgetUsd: 400, riskPctOfCapital: 0.4, orderSubmissionAllowed: false, requiresManualConfirmation: true },
];
const planFingerprint = fingerprintPaperTradePlans(plans);

describe('paper multi-trade position sizer v2', () => {
  it('sizes quantity by the stricter of notional and max-loss budgets', () => {
    const result = sizePaperMultiTradePositions({ sourceCouncilFingerprint: fingerprint, sourcePlanFingerprint: planFingerprint, plans, entries: [
      { id: 'btc', entryPrice: 100_000, stopPrice: 99_000 },
      { id: 'eth', entryPrice: 5_000, stopPrice: 5_100 },
    ] });
    expect(result.positions.find((row) => row.id === 'btc')?.quantity).toBe(0.4);
    expect(result.positions.find((row) => row.id === 'btc')?.limitingConstraint).toBe('NOTIONAL');
    expect(result.positions.find((row) => row.id === 'eth')?.quantity).toBe(4);
    expect(result.positions.find((row) => row.id === 'eth')?.limitingConstraint).toBe('RISK');
    expect(result.safety.executionAuthorized).toBe(false);
    expect(result.safety.exchangeClientDependency).toBe(false);
  });

  it('rejects stops that are not on the loss side', () => {
    const one = [plans[0]];
    const result = sizePaperMultiTradePositions({ sourceCouncilFingerprint: fingerprint, sourcePlanFingerprint: fingerprintPaperTradePlans(one), plans: one, entries: [{ id: 'btc', entryPrice: 100, stopPrice: 101 }] });
    expect(result.positions).toHaveLength(0);
    expect(result.rejected).toEqual([{ id: 'btc', reason: 'stop_not_on_loss_side' }]);
  });

  it('fails closed when the submitted plan set is modified after provenance was issued', () => {
    const tampered = [{ ...plans[0], notionalBudgetUsd: plans[0].notionalBudgetUsd + 1 }, plans[1]];
    expect(() => sizePaperMultiTradePositions({ sourceCouncilFingerprint: fingerprint, sourcePlanFingerprint: planFingerprint, plans: tampered, entries: [] }))
      .toThrow('paper_multi_trade_plan_fingerprint_mismatch');
  });

  it('fails closed on unsafe source plans and invalid fingerprints', () => {
    expect(() => sizePaperMultiTradePositions({ sourceCouncilFingerprint: 'bad', sourcePlanFingerprint: planFingerprint, plans, entries: [] })).toThrow('paper_multi_trade_source_fingerprint_required');
    const unsafe = [{ ...plans[0], orderSubmissionAllowed: true } as unknown as PaperTradeBudgetPlan];
    const unsafeFingerprint = fingerprintPaperTradePlans(unsafe);
    const result = sizePaperMultiTradePositions({ sourceCouncilFingerprint: fingerprint, sourcePlanFingerprint: unsafeFingerprint, plans: unsafe, entries: [{ id: 'btc', entryPrice: 100, stopPrice: 90 }] });
    expect(result.rejected[0]?.reason).toBe('unsafe_source_plan_contract');
  });

  it('is deterministic for the same explicit entry/stop inputs', () => {
    const input = { sourceCouncilFingerprint: fingerprint, sourcePlanFingerprint: planFingerprint, plans, entries: [{ id: 'btc', entryPrice: 100_000, stopPrice: 99_000 }, { id: 'eth', entryPrice: 5_000, stopPrice: 5_100 }] };
    expect(sizePaperMultiTradePositions(input).deterministicFingerprint).toBe(sizePaperMultiTradePositions(input).deterministicFingerprint);
  });
});
