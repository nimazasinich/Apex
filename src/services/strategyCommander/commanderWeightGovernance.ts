import { parliamentFingerprint } from './intelligenceConsensus';

export const COMMANDER_WEIGHT_GOVERNANCE_VERSION = 'commander_weight_governance_v1' as const;

export interface CommanderWeightGovernancePolicyV1 {
  version: 'commander_weight_governance_policy_v1';
  minimumObservations: number;
  minimumContextObservations: number;
  minWeight: number;
  maxWeight: number;
  maximumChangePerRevision: number;
  learningRate: number;
  smoothing: number;
  confidenceFloor: number;
}

export interface CommanderWeightEvidenceV1 {
  expertId: string;
  currentWeight: number;
  targetWeight: number;
  sampleCount: number;
  contextSampleCount: number;
  confidence: number;
}

export interface CommanderWeightRevisionV1 {
  version: typeof COMMANDER_WEIGHT_GOVERNANCE_VERSION;
  revisionId: string;
  previousRevisionId: string | null;
  previousStateHash: string | null;
  evidenceFingerprint: string;
  shadowOnly: true;
  adaptiveApplied: false;
  reasonForChange: string;
  entries: Array<{
    expertId: string;
    currentWeight: number;
    targetWeight: number;
    proposedWeight: number;
    sampleCount: number;
    contextSampleCount: number;
    eligible: boolean;
    reasons: string[];
  }>;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const round = (value: number) => Number(value.toFixed(6));

export const DEFAULT_COMMANDER_WEIGHT_GOVERNANCE_POLICY: CommanderWeightGovernancePolicyV1 = Object.freeze({
  version: 'commander_weight_governance_policy_v1',
  minimumObservations: 40,
  minimumContextObservations: 20,
  minWeight: 0.1,
  maxWeight: 0.95,
  maximumChangePerRevision: 0.02,
  learningRate: 0.2,
  smoothing: 0.75,
  confidenceFloor: 0.65,
});

/**
 * Deterministic proposal only. `adaptiveApplied` intentionally stays false:
 * callers may persist and review this record, but cannot use it as Parliament
 * trust or a position-size signal.
 */
export function buildCommanderWeightRevision(input: {
  evidence: readonly CommanderWeightEvidenceV1[];
  evidenceFingerprint: string;
  previousRevision?: Pick<CommanderWeightRevisionV1, 'revisionId'> | null;
  previousStateHash?: string | null;
  policy?: CommanderWeightGovernancePolicyV1;
}): CommanderWeightRevisionV1 {
  const policy = input.policy ?? DEFAULT_COMMANDER_WEIGHT_GOVERNANCE_POLICY;
  const entries = [...input.evidence]
    .sort((left, right) => left.expertId.localeCompare(right.expertId))
    .map((row) => {
      const currentWeight = round(clamp(row.currentWeight, policy.minWeight, policy.maxWeight));
      const targetWeight = round(clamp(row.targetWeight, policy.minWeight, policy.maxWeight));
      const eligible = Number.isSafeInteger(row.sampleCount) && row.sampleCount >= policy.minimumObservations
        && Number.isSafeInteger(row.contextSampleCount) && row.contextSampleCount >= policy.minimumContextObservations
        && Number.isFinite(row.confidence) && row.confidence >= policy.confidenceFloor;
      const reasons = eligible
        ? ['eligible_for_shadow_proposal', 'adaptive_application_requires_separate_approval']
        : [
          row.sampleCount < policy.minimumObservations ? 'minimum_observations_not_met' : null,
          row.contextSampleCount < policy.minimumContextObservations ? 'minimum_context_observations_not_met' : null,
          row.confidence < policy.confidenceFloor ? 'confidence_floor_not_met' : null,
        ].filter((reason): reason is string => reason !== null);
      const learned = currentWeight + (targetWeight - currentWeight) * policy.learningRate;
      const smoothed = currentWeight * policy.smoothing + learned * (1 - policy.smoothing);
      const bounded = clamp(smoothed, currentWeight - policy.maximumChangePerRevision, currentWeight + policy.maximumChangePerRevision);
      return {
        expertId: row.expertId,
        currentWeight,
        targetWeight,
        proposedWeight: round(eligible ? clamp(bounded, policy.minWeight, policy.maxWeight) : currentWeight),
        sampleCount: Math.max(0, Number.isSafeInteger(row.sampleCount) ? row.sampleCount : 0),
        contextSampleCount: Math.max(0, Number.isSafeInteger(row.contextSampleCount) ? row.contextSampleCount : 0),
        eligible,
        reasons,
      };
    });
  const unsigned = {
    version: COMMANDER_WEIGHT_GOVERNANCE_VERSION,
    previousRevisionId: input.previousRevision?.revisionId ?? null,
    previousStateHash: input.previousStateHash ?? null,
    evidenceFingerprint: input.evidenceFingerprint,
    shadowOnly: true as const,
    adaptiveApplied: false as const,
    reasonForChange: entries.some((entry) => entry.eligible) ? 'shadow_review_pending' : 'insufficient_evidence',
    entries,
  };
  return { ...unsigned, revisionId: parliamentFingerprint(unsigned) };
}
