import { describe, expect, it } from 'vitest';
import type { CommanderEvidenceV1 } from '../contracts/commander/commanderEvidence';
import { buildIntelligenceConsensus } from '../services/strategyCommander/intelligenceConsensus';
import { buildCommanderMarketContext } from '../services/strategyCommander/marketContextEngine';
import { buildStrategyCommanderDecision, buildStrategyCommanderScanShadow, strategyParameterProfileFingerprint } from '../services/strategyCommander/strategyCommander';
import { listStrategyDefinitions } from '../services/strategyRegistry';
import type { OpportunityCandidateV1 } from '../services/strategyCommander/opportunity/opportunityTypes';

const timestamp = '2026-08-12T02:00:00.000Z';
const opportunity: OpportunityCandidateV1 = {
  version: 'commander_opportunity_v1', symbol: 'BTC-USDT', timestamp, horizon: '1h', opportunityScore: 81,
  continuationPotential: 0.8, breakoutPotential: 0.5, reversalPotential: 0.1, meanReversionPotential: 0.1,
  momentumState: 'BULLISH_ACCELERATING', volumeState: 'ACCELERATING', volatilityState: 'NORMAL', liquidityQuality: 0.8,
  possibleDirections: ['LONG'], evidenceCompleteness: 0.9, evidenceQuality: 0.9, reasons: ['fixture'], fingerprint: 'opportunity-fixture',
};

function evidence(overrides: Partial<CommanderEvidenceV1> = {}): CommanderEvidenceV1 {
  return {
    version: 'commander_evidence_v1', evidenceId: overrides.evidenceId ?? 'evidence-fixture', expertId: overrides.expertId ?? 'apex.momentum',
    expertVersion: 'fixture-v1', family: overrides.family ?? 'MOMENTUM', symbol: 'BTC-USDT', timeframe: '1h',
    direction: overrides.direction ?? 'LONG', thesisTags: overrides.thesisTags ?? ['TREND_CONTINUATION'], score: overrides.score ?? 0.8,
    confidence: overrides.confidence ?? 0.9, valueQuality: overrides.valueQuality ?? 'VALID', observedAt: timestamp, receivedAt: timestamp,
    expiresAt: '2026-08-12T02:05:00.000Z', source: 'fixture', supportingReasons: overrides.supportingReasons ?? [],
    conflictingReasons: overrides.conflictingReasons ?? [], rawEvidenceIds: [], inputFingerprint: 'fixture-input',
  };
}

describe('Plan C Phase 6 Strategy Commander SHADOW', () => {
  it('derives a context and static non-authoritative recommendation deterministically', () => {
    const consensus = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp,
      evidence: [evidence({ evidenceId: 'momentum' }), evidence({ evidenceId: 'price', expertId: 'apex.price_action', family: 'PRICE_ACTION' })],
      expectedExpertIds: ['apex.momentum', 'apex.price_action'],
    });
    const first = buildStrategyCommanderDecision({ consensus, opportunity, definitions: listStrategyDefinitions() });
    const second = buildStrategyCommanderDecision({ consensus, opportunity, definitions: listStrategyDefinitions().reverse() });
    expect(first).toEqual(second);
    expect(first.abstain).toBe(false);
    expect(first.selectedStrategies.length).toBeGreaterThan(0);
    expect(first.safety).toMatchObject({ shadowOnly: true, executionAuthorized: false, orderSubmissionAllowed: false });
    expect(first.rankings.every((ranking) => ranking.competenceSampleCount === 0)).toBe(true);
    expect(first.suppressedStrategies.some((row) => row.reason === 'registry_status:blocked')).toBe(true);
  });

  it('preserves counter-trend reversal as a separate context dimension', () => {
    const consensus = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp,
      evidence: [evidence({ thesisTags: ['REVERSAL'], direction: 'LONG' })], expectedExpertIds: ['apex.momentum'],
    });
    const context = buildCommanderMarketContext(consensus, opportunity);
    expect(context.preferredDirection).toBe('LONG');
    expect(context.primaryThesis).toBe('REVERSAL');
    expect(context.trendRelation).toBe('COUNTER_TREND');
  });

  it('includes the exact parameter profile in Commander identity', () => {
    const consensus = buildIntelligenceConsensus({ symbol: 'BTC-USDT', timestamp, evidence: [evidence()], expectedExpertIds: ['apex.momentum'] });
    const definition = listStrategyDefinitions().find((row) => row.parameters.length > 0)!;
    const base = strategyParameterProfileFingerprint(definition);
    const changed = strategyParameterProfileFingerprint(definition, { [definition.parameters[0].key]: Number(definition.parameters[0].default) + 1 });
    expect(changed).not.toBe(base);
    const first = buildStrategyCommanderDecision({ consensus, opportunity, definitions: [definition], parameterProfileFingerprints: { [definition.strategyId]: base } });
    const second = buildStrategyCommanderDecision({ consensus, opportunity, definitions: [definition], parameterProfileFingerprints: { [definition.strategyId]: changed } });
    expect(second.decisionId).not.toBe(first.decisionId);
  });

  it('reports observed competence without changing SHADOW ranking or selection', () => {
    const consensus = buildIntelligenceConsensus({ symbol: 'BTC-USDT', timestamp, evidence: [evidence()], expectedExpertIds: ['apex.momentum'] });
    const definition = listStrategyDefinitions().find((row) => row.status !== 'blocked' && row.status !== 'deprecated' && row.supportedIntervals.includes('1h') && row.longShort !== 'SHORT')!;
    const baseline = buildStrategyCommanderDecision({ consensus, opportunity, definitions: [definition] });
    const observed = buildStrategyCommanderDecision({
      consensus,
      opportunity,
      definitions: [definition],
      observedStrategyCompetence: {
        [definition.strategyId]: {
          version: 'strategy_competence_v1', strategyId: definition.strategyId, strategyVersion: String(definition.version), parameterProfileFingerprint: 'profile',
          contextLevel: 'GLOBAL', sampleCount: 40, effectiveSampleCount: 40, minimumRequiredSample: 20, competence: 0.9, brierScore: 0.1, coverage: 1,
          status: 'SUFFICIENT_EVIDENCE', reasons: ['fixture'],
        },
      },
    });
    expect(observed.rankings[0].competence).toBe(0.9);
    expect(observed.rankings[0].competenceSampleCount).toBe(40);
    expect(observed.rankings[0].participationScore).toBe(baseline.rankings[0].participationScore);
    expect(observed.selectedStrategies).toEqual(baseline.selectedStrategies);
  });

  it('abstains on a material event veto and records only a SHADOW scan result', () => {
    const consensus = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp,
      evidence: [evidence({ family: 'NEWS', expertId: 'apex.news', direction: 'SHORT', score: -0.9, conflictingReasons: ['event_risk_material'] })],
      expectedExpertIds: ['apex.news'],
    });
    const decision = buildStrategyCommanderDecision({ consensus, opportunity });
    const scan = buildStrategyCommanderScanShadow({ timestamp: Date.parse(timestamp), results: [decision] });
    expect(decision.abstain).toBe(true);
    expect(decision.abstainReason).toBe('EVENT_RISK');
    expect(decision.selectedStrategies).toEqual([]);
    expect(scan.shadowOnly).toBe(true);
    expect(scan.results[0].decisionId).toBe(decision.decisionId);
  });
});
