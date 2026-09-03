import { describe, expect, it } from 'vitest';
import { evaluateParliamentPromotion, type ParliamentValidationEvidence } from '../services/parliamentPromotionGate';

const strong: ParliamentValidationEvidence = {
  resolvedSamples: 420, paperForwardSamples: 140, walkForwardFolds: 5, profitableWalkForwardFolds: 4,
  walkForwardResults: [
    { label: 'wf1', trades: 44, netReturnPct: 1.1, profitFactor: 1.12, maxDrawdownPct: 8 },
    { label: 'wf2', trades: 47, netReturnPct: 1.4, profitFactor: 1.18, maxDrawdownPct: 9 },
    { label: 'wf3', trades: 42, netReturnPct: 0.8, profitFactor: 1.08, maxDrawdownPct: 7 },
    { label: 'wf4', trades: 50, netReturnPct: 1.3, profitFactor: 1.15, maxDrawdownPct: 10 },
    { label: 'wf5', trades: 45, netReturnPct: -0.2, profitFactor: 0.98, maxDrawdownPct: 11 },
  ],
  regimes: {
    TREND: { samples: 90, netReturnPct: 4, profitFactor: 1.2, maxDrawdownPct: 9 },
    RANGE: { samples: 80, netReturnPct: 2, profitFactor: 1.12, maxDrawdownPct: 11 },
    HIGH_VOLATILITY: { samples: 70, netReturnPct: 1, profitFactor: 1.08, maxDrawdownPct: 13 },
  },
  netReturnPct: 7, profitFactor: 1.16, maxDrawdownPct: 12, costStressPassed: true,
  sealedHoldoutUsesForCandidate: 1, materialVetoCount: 0,
};

describe('parliament promotion gate', () => {
  it('may automatically promote validated shadow research only into paper-forward', () => {
    const decision = evaluateParliamentPromotion({ stage: 'SHADOW', evidence: strong });
    expect(decision.action).toBe('AUTO_PROMOTE_PAPER');
    expect(decision.humanApprovalRequired).toBe(false);
    expect(decision.autonomousLiveExecutionEnabled).toBe(false);
  });

  it('requires a human action before signal authority', () => {
    const decision = evaluateParliamentPromotion({ stage: 'PAPER_FORWARD', evidence: strong });
    expect(decision.action).toBe('REQUIRE_HUMAN_SIGNAL_PROMOTION');
    expect(decision.humanApprovalRequired).toBe(true);
    expect(decision.autonomousLiveExecutionEnabled).toBe(false);
  });

  it('fails closed when sealed holdout was reused', () => {
    const decision = evaluateParliamentPromotion({ stage: 'SHADOW', evidence: { ...strong, sealedHoldoutUsesForCandidate: 2 } });
    expect(decision.authorized).toBe(false);
    expect(decision.blockers).toContain('sealed_holdout_reuse');
  });
});
