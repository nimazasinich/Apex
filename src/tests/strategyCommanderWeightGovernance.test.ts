import { describe, expect, it } from 'vitest';
import { buildCommanderWeightRevision } from '../services/strategyCommander/commanderWeightGovernance';

describe('Commander weight governance', () => {
  it('returns the static weight when observation or context evidence is insufficient', () => {
    const result = buildCommanderWeightRevision({ evidenceFingerprint: 'evidence-1', evidence: [{ expertId: 'apex.price_action', currentWeight: 0.15, targetWeight: 0.9, sampleCount: 39, contextSampleCount: 20, confidence: 0.9 }] });
    expect(result.entries[0]?.proposedWeight).toBe(0.15);
    expect(result.adaptiveApplied).toBe(false);
    expect(result.reasonForChange).toBe('insufficient_evidence');
  });

  it('bounds an eligible shadow proposal by the maximum revision delta', () => {
    const result = buildCommanderWeightRevision({ evidenceFingerprint: 'evidence-1', policy: { version: 'commander_weight_governance_policy_v1', minimumObservations: 2, minimumContextObservations: 2, minWeight: 0.1, maxWeight: 0.9, maximumChangePerRevision: 0.02, learningRate: 1, smoothing: 0, confidenceFloor: 0.5 }, evidence: [{ expertId: 'apex.price_action', currentWeight: 0.15, targetWeight: 0.27, sampleCount: 2, contextSampleCount: 2, confidence: 0.9 }] });
    expect(result.entries[0]?.proposedWeight).toBe(0.17);
    expect(result.entries[0]?.reasons).toContain('adaptive_application_requires_separate_approval');
    expect(result.adaptiveApplied).toBe(false);
  });

  it('is deterministic regardless of evidence input order', () => {
    const evidence = [
      { expertId: 'apex.price_action', currentWeight: 0.4, targetWeight: 0.45, sampleCount: 50, contextSampleCount: 50, confidence: 0.9 },
      { expertId: 'apex.liquidity', currentWeight: 0.5, targetWeight: 0.45, sampleCount: 50, contextSampleCount: 50, confidence: 0.9 },
    ];
    expect(buildCommanderWeightRevision({ evidenceFingerprint: 'evidence', evidence }).revisionId)
      .toBe(buildCommanderWeightRevision({ evidenceFingerprint: 'evidence', evidence: [...evidence].reverse() }).revisionId);
  });
});
