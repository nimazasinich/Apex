import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  evaluateProposalBlockers,
  relativeChange,
} from '../src/services/adaptiveThresholdGovernance';
import { DEFAULT_SCANNER_CONFIG } from '../src/services/apexNextMarketRoutes';
import type { AdaptiveExperienceProfile, AdaptiveThresholdAuditLog } from '../src/services/adaptiveThresholdEngine';
import type { ScannerConfig } from '../src/types';

// H3 regression coverage: scoreWeights.* fields are fractions of a ~1.0 normalized
// weighting budget, so a routine renormalization near zero (e.g. 0.05 -> 0.105)
// must not be blocked as a >100% relative change, while a genuinely large weight
// shift, or a change to direction bias / threshold mode, must still be blocked.

const policy = { ...DEFAULT_POLICY, maxRelativeFieldChange: 0.20 };

function profile(overrides: Partial<AdaptiveExperienceProfile> = {}): AdaptiveExperienceProfile {
  return {
    sampleSize: policy.minSamples,
    marketRegime: 'NEUTRAL' as AdaptiveExperienceProfile['marketRegime'],
    confidenceInAdjustment: policy.minAdjustmentConfidence,
    adjustmentConfidence: policy.minAdjustmentConfidence,
    accepted: 100,
    rejected: 20,
    acceptanceRate: 0.83,
    resolvedAccepted: policy.minResolvedOutcomes,
    recentResolvedAccepted: policy.minResolvedOutcomes,
    winRate: 0.55,
    recentWinRate: 0.55,
    recentAvgPnl: 0.2,
    outcomeDrift: 0,
    avgPnl: 0.2,
    harmfulAcceptedLosses: 2,
    missedWinners: 1,
    savedLosses: 1,
    falseSqueezeRejects: 0,
    falseEvidenceRejects: 0,
    falseConfidenceRejects: 0,
    rejectionOutcomeByReason: {},
    averages: { squeezeRisk: null, evidenceAgreement: null, liquidityQuality: null, qStructDirectional: null },
    ...overrides,
  };
}

function audit(changes: AdaptiveThresholdAuditLog['changes']): AdaptiveThresholdAuditLog {
  return {
    version: 1,
    timestamp: 1_700_000_000_000,
    isoTime: new Date(1_700_000_000_000).toISOString(),
    mode: DEFAULT_SCANNER_CONFIG.thresholdMode,
    marketRegime: 'NEUTRAL' as AdaptiveThresholdAuditLog['marketRegime'],
    confidence: policy.minAdjustmentConfidence,
    sampleSize: policy.minSamples,
    changes,
    before: DEFAULT_SCANNER_CONFIG,
    after: DEFAULT_SCANNER_CONFIG,
    reasonSummary: ['test'],
  };
}

function baseConfig(): ScannerConfig {
  return { ...DEFAULT_SCANNER_CONFIG, thresholdMode: 'ADAPTIVE_GUARDRAILS', scoreWeights: { ...DEFAULT_SCANNER_CONFIG.scoreWeights } };
}

describe('adaptive threshold governance - scoreWeights guardrail (H3)', () => {
  it('does not block ordinary normalized weight redistribution near zero', () => {
    // 0.05 -> 0.105 is a +110% relative-to-self change, but only a 0.055 absolute
    // move against the ~1.0 weighting budget - ordinary renormalization noise.
    const configured = baseConfig();
    const effective = baseConfig();
    const change = { field: 'scoreWeights.liquidity', before: 0.05, after: 0.105, delta: 0.055, reason: 'renormalization' };
    const blockers = evaluateProposalBlockers(configured, effective, profile(), audit([change]), policy);
    expect(blockers).not.toContain(`field_change_exceeds_limit:${change.field}`);
    // Sanity: confirms the scenario really would trip a relative-to-self check.
    expect(relativeChange(change.before, change.after)).toBeGreaterThan(policy.maxRelativeFieldChange);
  });

  it('still blocks an unusually large total weight-budget movement', () => {
    const configured = baseConfig();
    const effective = baseConfig();
    // 0.10 -> 0.45 is a 0.35 absolute move against the shared budget - well past the limit.
    const change = { field: 'scoreWeights.momentum', before: 0.10, after: 0.45, delta: 0.35, reason: 'large_shift' };
    const blockers = evaluateProposalBlockers(configured, effective, profile(), audit([change]), policy);
    expect(blockers).toContain(`field_change_exceeds_limit:${change.field}`);
  });

  it('still applies relative-change limits to non-weight thresholds', () => {
    const configured = baseConfig();
    const effective = baseConfig();
    // qStructThreshold moving from 0.30 to 0.70 is a >100% relative change and is not a scoreWeights field.
    const change = { field: 'qStructThreshold', before: 0.30, after: 0.70, delta: 0.40, reason: 'threshold_shift' };
    const blockers = evaluateProposalBlockers(configured, effective, profile(), audit([change]), policy);
    expect(blockers).toContain(`field_change_exceeds_limit:${change.field}`);
  });

  it('blocks any proposal that changes direction bias or threshold mode', () => {
    const configured = baseConfig();
    const biasChanged = { ...baseConfig(), directionBias: 'LONG_ONLY' as const };
    const modeChanged = { ...baseConfig(), thresholdMode: 'STATIC' as ScannerConfig['thresholdMode'] };

    const biasBlockers = evaluateProposalBlockers(configured, biasChanged, profile(), audit([]), policy);
    expect(biasBlockers).toContain('direction_bias_change_not_allowed');

    const modeBlockers = evaluateProposalBlockers(configured, modeChanged, profile(), audit([]), policy);
    expect(modeBlockers).toContain('threshold_mode_change_not_allowed');
  });
});
