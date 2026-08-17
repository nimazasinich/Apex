import { describe, expect, it } from 'vitest';
import {
  COMMANDER_EVIDENCE_VERSION,
  validateCommanderEvidence,
  type CommanderEvidenceV1,
} from '../contracts/commander/commanderEvidence';
import {
  validateCommanderMarketContext,
  type CommanderMarketContextV1,
} from '../contracts/commander/commanderContext';
import {
  validateStrategyCommanderDecision,
  type StrategyCommanderDecisionV1,
} from '../contracts/commander/commanderDecision';
import {
  COMMANDER_POLICY_VERSION,
  COMMANDER_SAFETY,
  validateCommanderPolicy,
  type CommanderPolicyV1,
} from '../contracts/commander/commanderPolicy';
import {
  COMMANDER_IDENTITY_VERSION,
  commanderIdentityFingerprint,
  validateCommanderIdentity,
  type StrategyCommanderIdentityV1,
} from '../contracts/commander/commanderIdentity';

const evidence: CommanderEvidenceV1 = {
  version: COMMANDER_EVIDENCE_VERSION,
  evidenceId: 'ev-1', expertId: 'momentum', expertVersion: '1.0.0', family: 'MOMENTUM',
  symbol: 'BTC-USDT', timeframe: '1h', direction: 'LONG', thesisTags: ['TREND_CONTINUATION'],
  score: 0.72, confidence: 0.81, valueQuality: 'VALID', observedAt: '2026-08-12T00:00:00.000Z',
  receivedAt: '2026-08-12T00:00:01.000Z', source: 'test', sourceVersion: '1',
  supportingReasons: ['momentum_accelerating'], conflictingReasons: [], rawEvidenceIds: [], inputFingerprint: 'input-1',
};

const context: CommanderMarketContextV1 = {
  regime: 'TREND_UP', regimeConfidence: 0.8, preferredDirection: 'LONG', eligibleDirections: ['LONG'],
  primaryThesis: 'TREND_CONTINUATION', trendRelation: 'WITH_TREND', volatilityState: 'NORMAL', liquidityState: 'HEALTHY',
  evidenceCompleteness: 0.9, confidence: 0.8, evidenceQuality: 'VALID', reasons: ['aligned'],
};

const decision: StrategyCommanderDecisionV1 = {
  decisionId: 'decision-1', timestamp: '2026-08-12T00:00:00.000Z', symbol: 'BTC-USDT',
  opportunityFingerprint: 'opportunity-1', evidenceFingerprint: 'evidence-1', marketContext: context,
  eligibleStrategies: ['strategy-a'], rankings: [{ strategyId: 'strategy-a', strategyVersion: '1', participationScore: 0.8, participationWeight: 0.7, competence: 0.6, competenceSampleCount: 25, confidence: 0.8, evidenceQuality: 0.9, reasons: ['capability_match'] }],
  selectedStrategies: ['strategy-a'], suppressedStrategies: [], abstain: false, commanderVersion: '1', commanderStateRevision: 'r1',
  safety: { shadowOnly: true, ...COMMANDER_SAFETY },
};

const policy: CommanderPolicyV1 = {
  version: COMMANDER_POLICY_VERSION, maturity: 'SHADOW', shadowOnly: true, maxSelectedStrategies: 3,
  requiredEvidenceFamilies: ['MOMENTUM'], safety: COMMANDER_SAFETY,
};

const identity: StrategyCommanderIdentityV1 = {
  version: COMMANDER_IDENTITY_VERSION, commanderVersion: '1', commanderStateRevision: 'r1', symbol: 'BTC-USDT',
  time: '2026-08-12T00:00:00.000Z', universe: ['ETH-USDT', 'BTC-USDT'], regime: 'TREND_UP', thesis: 'TREND_CONTINUATION',
  direction: 'LONG', trendRelation: 'WITH_TREND', evidenceIds: ['ev-2', 'ev-1'], expertVersions: { momentum: '1.0.0' },
  strategyIds: ['strategy-a'], strategyVersions: { 'strategy-a': '1' }, parameterProfiles: { 'strategy-a': 'profile-1' },
};

describe('Plan C Phase 1 Commander contracts', () => {
  it('preserves explicit evidence quality and rejects invalid quality/score states', () => {
    expect(validateCommanderEvidence(evidence).ok).toBe(true);
    expect(validateCommanderEvidence({ ...evidence, valueQuality: 'MISSING', score: Number.NaN } as CommanderEvidenceV1).reasons).toContain('invalid_score');
    expect(validateCommanderEvidence({ ...evidence, valueQuality: 'INVALID' as CommanderEvidenceV1['valueQuality'], inputFingerprint: '' }).reasons).toContain('inputFingerprint_required');
  });

  it('keeps market context dimensions independent and bounded', () => {
    expect(validateCommanderMarketContext(context).ok).toBe(true);
    expect(validateCommanderMarketContext({ ...context, regimeConfidence: 1.1 }).reasons).toContain('invalid_regime_confidence');
    expect(validateCommanderMarketContext({ ...context, trendRelation: 'COUNTER_TREND', primaryThesis: 'REVERSAL' }).ok).toBe(true);
  });

  it('requires decision rankings to match eligible strategy identity', () => {
    expect(validateStrategyCommanderDecision(decision).ok).toBe(true);
    expect(validateStrategyCommanderDecision({ ...decision, selectedStrategies: ['strategy-b'] }).reasons).toContain('invalid_selected_strategies');
    expect(validateStrategyCommanderDecision({ ...decision, abstain: true, selectedStrategies: ['strategy-a'], abstainReason: 'INSUFFICIENT_EVIDENCE' }).reasons).toContain('abstain_cannot_select_strategies');
  });

  it('keeps the Phase 1 policy and decision execution boundary fail-closed', () => {
    expect(validateCommanderPolicy(policy).ok).toBe(true);
    expect(validateCommanderPolicy({ ...policy, safety: { ...COMMANDER_SAFETY, executionAuthorized: true } } as unknown as CommanderPolicyV1).reasons).toContain('execution_must_remain_denied');
    expect(validateStrategyCommanderDecision({ ...decision, safety: { ...COMMANDER_SAFETY, shadowOnly: true, orderSubmissionAllowed: true } } as unknown as StrategyCommanderDecisionV1).reasons).toContain('order_submission_must_remain_denied');
  });

  it('binds identity fingerprints to revision, evidence, strategy, and parameter profile', () => {
    expect(validateCommanderIdentity(identity)).toEqual([]);
    const reordered: StrategyCommanderIdentityV1 = { ...identity, universe: ['BTC-USDT', 'ETH-USDT'], evidenceIds: ['ev-1', 'ev-2'] };
    expect(commanderIdentityFingerprint(identity)).toBe(commanderIdentityFingerprint(reordered));
    expect(commanderIdentityFingerprint(identity)).not.toBe(commanderIdentityFingerprint({ ...identity, commanderStateRevision: 'r2' }));
    expect(commanderIdentityFingerprint(identity)).not.toBe(commanderIdentityFingerprint({ ...identity, evidenceIds: ['ev-1'] }));
    expect(commanderIdentityFingerprint(identity)).not.toBe(commanderIdentityFingerprint({ ...identity, parameterProfiles: { 'strategy-a': 'profile-2' } }));
  });
});
