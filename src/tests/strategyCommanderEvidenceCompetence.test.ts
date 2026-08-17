import { describe, expect, it } from 'vitest';
import type { CommanderOutcomeObservationV1 } from '../services/strategyCommander/commanderOutcomeFeedback';
import { extractEvidenceOutcomeObservations, resolveEvidenceCompetence } from '../services/strategyCommander/evidenceCompetence';

function outcome(result: 'WIN' | 'LOSS' | 'BREAKEVEN' = 'WIN'): CommanderOutcomeObservationV1 {
  return {
    version: 'commander_outcome_observation_v1', outcomeId: `outcome-${result}`, occurredAt: 1,
    attribution: {
      version: 'commander_outcome_attribution_v1', decisionId: 'decision-1', strategyId: 'trend', strategyVersion: '1', parameterProfileFingerprint: 'profile-1', opportunityFingerprint: 'opp-1', evidenceFingerprint: 'evidence-set-1', evidenceIds: ['aligned', 'opposed', 'neutral', 'missing'],
      evidence: [
        { evidenceId: 'aligned', expertId: 'apex.momentum', expertVersion: '1', family: 'MOMENTUM', timeframe: '1h', direction: 'LONG', confidence: 0.8, valueQuality: 'VALID' },
        { evidenceId: 'opposed', expertId: 'apex.price_action', expertVersion: '1', family: 'PRICE_ACTION', timeframe: '1h', direction: 'SHORT', confidence: 0.7, valueQuality: 'VALID' },
        { evidenceId: 'neutral', expertId: 'apex.sentiment', expertVersion: '1', family: 'SENTIMENT', timeframe: '1h', direction: 'NEUTRAL', confidence: 0.6, valueQuality: 'VALID' },
        { evidenceId: 'missing', expertId: 'apex.whale', expertVersion: '1', family: 'WHALE', timeframe: '1h', direction: 'LONG', confidence: 0.6, valueQuality: 'MISSING' },
      ],
      symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', regime: 'TREND_UP', thesis: 'TREND_CONTINUATION', trendRelation: 'WITH_TREND', predictedConfidence: 0.8,
    },
    outcome: result, realizedPnlPct: result === 'WIN' ? 1 : result === 'LOSS' ? -1 : 0, successScore: result === 'WIN' ? 1 : result === 'LOSS' ? 0 : 0.5, researchOnly: true,
  };
}

describe('Strategy Commander evidence competence', () => {
  it('scores only explicit directional, usable-quality evidence', () => {
    const win = extractEvidenceOutcomeObservations([outcome('WIN')]);
    expect(win.map((row) => row.evidenceId)).toEqual(['aligned', 'opposed']);
    expect(win.find((row) => row.evidenceId === 'aligned')?.successScore).toBe(1);
    expect(win.find((row) => row.evidenceId === 'opposed')?.successScore).toBe(0);
    const loss = extractEvidenceOutcomeObservations([outcome('LOSS')]);
    expect(loss.find((row) => row.evidenceId === 'aligned')?.successScore).toBe(0);
    expect(loss.find((row) => row.evidenceId === 'opposed')?.successScore).toBe(1);
  });

  it('keeps competence neutral below minimum samples and never applies adaptive trust', () => {
    const rows = extractEvidenceOutcomeObservations([outcome('WIN')]);
    const target = { evidenceId: 'current', symbol: 'BTC-USDT', expertId: 'apex.momentum', expertVersion: '1', family: 'MOMENTUM' as const, timeframe: '1h', direction: 'LONG' as const, regime: 'TREND_UP' as const, thesis: 'TREND_CONTINUATION' as const, trendRelation: 'WITH_TREND' as const };
    const insufficient = resolveEvidenceCompetence({ target, observations: rows, policy: { version: 'evidence_competence_policy_v1', minimumObservations: 2, minimumContextObservations: 2, defaultCompetence: 0.5 } });
    expect(insufficient.competence).toBe(0.5);
    expect(insufficient.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(insufficient.adaptiveTrustApplied).toBe(false);
    const sufficient = resolveEvidenceCompetence({ target, observations: [...rows, ...rows.map((row) => ({ ...row, outcomeId: `${row.outcomeId}-2`, evidenceId: `${row.evidenceId}-2` }))], policy: { version: 'evidence_competence_policy_v1', minimumObservations: 2, minimumContextObservations: 2, defaultCompetence: 0.5 } });
    expect(sufficient.contextLevel).toBe('EXACT');
    expect(sufficient.competence).toBe(1);
    expect(sufficient.brierScore).toBe(0.04);
    expect(sufficient.adaptiveTrustApplied).toBe(false);
  });
});
