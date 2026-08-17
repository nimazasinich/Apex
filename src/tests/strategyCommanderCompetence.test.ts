import { describe, expect, it } from 'vitest';
import type { SignalDecisionLog } from '../types';
import type { StrategyCommanderDecisionV1 } from '../contracts/commander/commanderDecision';
import type { CommanderEvidenceV1 } from '../contracts/commander/commanderEvidence';
import { COMMANDER_SAFETY } from '../contracts/commander/commanderPolicy';
import { buildCommanderOutcomeAttribution, buildCommanderResearchComparison, extractCommanderOutcomeObservation, extractCommanderOutcomeObservations, type CommanderOutcomeAttributionV1 } from '../services/strategyCommander/commanderOutcomeFeedback';
import { resolveStrategyCompetence } from '../services/strategyCommander/strategyCompetence';

const commanderEvidence: CommanderEvidenceV1 = {
  version: 'commander_evidence_v1', evidenceId: 'e1', expertId: 'apex.momentum', expertVersion: '1', family: 'MOMENTUM', symbol: 'BTC-USDT', timeframe: '1h', direction: 'LONG', thesisTags: ['TREND_CONTINUATION'], score: 0.8, confidence: 0.75, valueQuality: 'VALID', observedAt: '2023-11-14T22:13:20.000Z', receivedAt: '2023-11-14T22:13:20.000Z', source: 'fixture', supportingReasons: [], conflictingReasons: [], rawEvidenceIds: [], inputFingerprint: 'input-1',
};

const attribution: CommanderOutcomeAttributionV1 = {
  version: 'commander_outcome_attribution_v1', decisionId: 'decision-1', strategyId: 'trend', strategyVersion: '2', parameterProfileFingerprint: 'params-1', opportunityFingerprint: 'opp-1', evidenceFingerprint: 'evidence-1', evidenceIds: ['e1'],
  evidence: [{ evidenceId: 'e1', expertId: 'apex.momentum', expertVersion: '1', family: 'MOMENTUM', timeframe: '1h', direction: 'LONG', confidence: 0.75, valueQuality: 'VALID' }],
  symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', regime: 'TREND_UP', thesis: 'TREND_CONTINUATION', trendRelation: 'WITH_TREND', predictedConfidence: 0.8,
};

const decision: StrategyCommanderDecisionV1 = {
  decisionId: 'decision-1', timestamp: '2023-11-14T22:13:20.000Z', symbol: 'BTC-USDT', opportunityFingerprint: 'opp-1', evidenceFingerprint: 'evidence-1',
  marketContext: { regime: 'TREND_UP', regimeConfidence: 0.8, preferredDirection: 'LONG', eligibleDirections: ['LONG'], primaryThesis: 'TREND_CONTINUATION', trendRelation: 'WITH_TREND', volatilityState: 'NORMAL', liquidityState: 'VALID', evidenceCompleteness: 0.9, confidence: 0.8, evidenceQuality: 'VALID', reasons: [] },
  eligibleStrategies: ['trend'], rankings: [{ strategyId: 'trend', strategyVersion: '2', participationScore: 0.8, participationWeight: 1, competence: 0.5, competenceSampleCount: 0, confidence: 0.8, evidenceQuality: 1, reasons: [] }],
  selectedStrategies: ['trend'], suppressedStrategies: [], abstain: false, commanderVersion: 'test', commanderStateRevision: 'test', safety: { shadowOnly: true, ...COMMANDER_SAFETY },
};

function outcome(overrides: Partial<SignalDecisionLog> = {}): SignalDecisionLog {
  return {
    id: 'outcome-1', cycleId: 'research-1', timestamp: 1_700_000_000_000, isoTime: '2023-11-14T22:13:20.000Z', ticker: 'BTC-USDT', direction: 'LONG', decision: 'ACCEPTED', reasonCode: 'ACCEPTED_BEST_CANDIDATE', reasonText: 'test', laterOutcome: 'WIN', laterPnl: 1.2,
    marketSnapshotSummary: { source: 'SMART_AUTOPILOT_RESEARCH_REPLAY', researchOnly: true, commanderAttribution: attribution },
    ...overrides,
  };
}

describe('Strategy Commander competence attribution', () => {
  it('builds attribution only for an exact selected profile and context', () => {
    const exact = buildCommanderOutcomeAttribution({ decision, evidence: [commanderEvidence], horizon: '1h', expectedParameterProfileFingerprint: 'params-1', actualParameterProfileFingerprint: 'params-1', strategyId: 'trend', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' });
    expect(exact).toEqual(attribution);
    expect(buildCommanderOutcomeAttribution({ decision, evidence: [commanderEvidence], horizon: '1h', expectedParameterProfileFingerprint: 'params-1', actualParameterProfileFingerprint: 'params-2', strategyId: 'trend', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' })).toBeNull();
    expect(buildCommanderOutcomeAttribution({ decision, evidence: [commanderEvidence], horizon: '1h', expectedParameterProfileFingerprint: 'params-1', actualParameterProfileFingerprint: 'params-1', strategyId: 'trend', symbol: 'BTC-USDT', interval: '1h', direction: 'SHORT' })).toBeNull();
  });

  it('records SELECT, SUPPRESS and ABSTAIN as comparison only without routing authority', () => {
    const base = { decision, horizon: '1h', expectedParameterProfileFingerprint: 'params-1', actualParameterProfileFingerprint: 'params-1', strategyId: 'trend', strategyVersion: '2', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' as const };
    expect(buildCommanderResearchComparison(base)).toMatchObject({ disposition: 'SELECT', shadowOnly: true, researchRoutingApplied: false });
    expect(buildCommanderResearchComparison({ ...base, decision: { ...decision, selectedStrategies: [], suppressedStrategies: [{ strategyId: 'trend', reason: 'shadow_selection_cap' }] } })).toMatchObject({ disposition: 'SUPPRESS', reason: 'shadow_selection_cap' });
    expect(buildCommanderResearchComparison({ ...base, decision: { ...decision, abstain: true, abstainReason: 'SAMPLE_INSUFFICIENT', selectedStrategies: [] } })).toMatchObject({ disposition: 'ABSTAIN', reason: 'abstain:SAMPLE_INSUFFICIENT' });
    expect(buildCommanderResearchComparison({ ...base, actualParameterProfileFingerprint: 'different' })).toBeNull();
  });

  it('accepts only resolved research outcomes with an exact attribution envelope', () => {
    const accepted = extractCommanderOutcomeObservation(outcome());
    expect(accepted.observation?.attribution.evidenceIds).toEqual(['e1']);
    expect(extractCommanderOutcomeObservation(outcome({ marketSnapshotSummary: { source: 'SMART_AUTOPILOT_RESEARCH_REPLAY', researchOnly: true } })).reason).toBe('missing_or_invalid_commander_attribution');
    expect(extractCommanderOutcomeObservation(outcome({ ticker: 'ETH-USDT' })).reason).toBe('outcome_identity_mismatch');
    expect(extractCommanderOutcomeObservation(outcome({ marketSnapshotSummary: { source: 'SMART_AUTOPILOT_RESEARCH_REPLAY', researchOnly: true, commanderAttribution: { ...attribution, evidenceIds: ['different'] } } })).reason).toBe('missing_or_invalid_commander_attribution');
  });

  it('does not infer attribution and therefore reports current untagged research rows as ignored', () => {
    const output = extractCommanderOutcomeObservations([outcome({ marketSnapshotSummary: { source: 'SMART_AUTOPILOT_RESEARCH_REPLAY', researchOnly: true } })]);
    expect(output.observations).toEqual([]);
    expect(output.ignored).toEqual([{ outcomeId: 'outcome-1', reason: 'missing_or_invalid_commander_attribution' }]);
  });

  it('keeps competence neutral below the configured evidence threshold and uses exact data only after it is met', () => {
    const observation = extractCommanderOutcomeObservation(outcome()).observation!;
    expect(resolveStrategyCompetence({ target: observation, observations: [observation], policy: { version: 'strategy_competence_policy_v1', minimumObservations: 2, minimumContextObservations: 2, defaultCompetence: 0.5 } }).competence).toBe(0.5);
    const resolved = resolveStrategyCompetence({ target: observation, observations: [observation, { ...observation, outcomeId: 'outcome-2' }], policy: { version: 'strategy_competence_policy_v1', minimumObservations: 2, minimumContextObservations: 2, defaultCompetence: 0.5 } });
    expect(resolved.contextLevel).toBe('EXACT');
    expect(resolved.competence).toBe(1);
    expect(resolved.brierScore).toBe(0.04);
  });
});
