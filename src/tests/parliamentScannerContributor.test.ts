import { describe, expect, it } from 'vitest';
import type { NativeParliamentSnapshotV1 } from '../services/strategyCommander/parliamentShadow';
import { evaluateParliamentScannerContribution } from '../services/parliamentScannerContributor';
import type { CommanderEvidenceV1 } from '../contracts/commander/commanderEvidence';

function row(partial: Partial<CommanderEvidenceV1> & Pick<CommanderEvidenceV1, 'evidenceId' | 'family' | 'direction'>): CommanderEvidenceV1 {
  return {
    version: 'commander_evidence_v1', evidenceId: partial.evidenceId, expertId: `apex.${partial.family.toLowerCase()}`,
    expertVersion: '1', family: partial.family, symbol: 'BTC-USDT', timeframe: '1h', direction: partial.direction,
    thesisTags: [], score: partial.score ?? -0.8, confidence: partial.confidence ?? 0.9, valueQuality: partial.valueQuality ?? 'VALID',
    observedAt: '2026-08-29T14:00:00.000Z', receivedAt: '2026-08-29T14:00:01.000Z', expiresAt: '2026-08-29T14:02:00.000Z',
    source: 'fixture', supportingReasons: [], conflictingReasons: [], rawEvidenceIds: [], inputFingerprint: `fp:${partial.evidenceId}`,
  };
}

function snapshot(evidence: CommanderEvidenceV1[]): NativeParliamentSnapshotV1 {
  return {
    evidence,
    consensus: {
      version: 'commander_intelligence_consensus_v1', symbol: 'BTC-USDT', timestamp: '2026-08-29T14:00:01.000Z', shadowOnly: true,
      directionConsensus: { LONG: 0.1, SHORT: 0.78, NEUTRAL: 0.12 }, thesisConsensus: { TREND_CONTINUATION: 0, BREAKOUT: 0, PULLBACK: 0, REVERSAL: 0, MEAN_REVERSION: 0, EXHAUSTION: 0, CARRY: 0, UNCERTAIN: 1 },
      leadingDirection: 'SHORT', leadingThesis: 'UNCERTAIN', consensus: 0.78,
      dissent: { score: 0.1, directionalDisagreement: 0.1, scoreDispersion: 0.1, confidenceWeightedDisagreement: 0.1, materialVetoPenalty: 0, crossTimeframeConflict: 0, crossFamilyConflict: 0 },
      materialVetoes: [], evidenceCompleteness: 0.9, evidenceQuality: 0.9, contextualTrust: 0.9, trust: [], evidenceIds: evidence.map((x) => x.evidenceId), reasons: [], fingerprint: 'parliament-fnv1a64-fixture',
    },
  };
}

const regime = { regime: 'HIGH_VOLATILITY' as const, confidence: 0.8, trendEfficiency: 0.3, emaSpreadPct: -0.01, realizedVolatility: 0.04, volatilityRatio: 1.9, atrPct: 0.04, reasons: ['fixture'] };

const evidence = [
  row({ evidenceId: 'funding', family: 'FUNDING_OI', direction: 'SHORT', score: -0.9 }),
  row({ evidenceId: 'smart', family: 'SMART_MONEY', direction: 'SHORT', score: -0.8 }),
  row({ evidenceId: 'whale', family: 'WHALE', direction: 'SHORT', score: -0.9 }),
  row({ evidenceId: 'news', family: 'NEWS', direction: 'SHORT', score: -0.6 }),
];

describe('parliament scanner contributor', () => {
  it('stays shadow-only by default even when confluence is strong', () => {
    const result = evaluateParliamentScannerContribution({ snapshot: snapshot(evidence), direction: 'SHORT', regime, coreModelSupport: 0.8, timestamp: Date.parse('2026-08-29T14:00:00Z'), fundingRate: 0.0012, oiChangePercent: 3, mode: 'SHADOW' });
    expect(result.categoryConfluence).toBeGreaterThanOrEqual(2);
    expect(result.reasonCode).toBe('SHADOW_ONLY');
    expect(result.actionable).toBe(false);
  });

  it('becomes actionable only after explicit signal promotion and 2+ category confluence', () => {
    const result = evaluateParliamentScannerContribution({ snapshot: snapshot(evidence), direction: 'SHORT', regime, coreModelSupport: 0.8, timestamp: Date.parse('2026-08-29T14:00:00Z'), fundingRate: 0.0012, oiChangePercent: 3, mode: 'SIGNAL_PROMOTED', killSwitchActive: false });
    expect(result.categoryConfluence).toBeGreaterThanOrEqual(2);
    expect(result.crowdingRegime).toBe(true);
    expect(result.actionable).toBe(true);
    expect(result.reasonCode).toBe('CONTRIBUTION_ACCEPTED');
  });

  it('kill-switch wins over an otherwise promotable contribution', () => {
    const result = evaluateParliamentScannerContribution({ snapshot: snapshot(evidence), direction: 'SHORT', regime, coreModelSupport: 0.8, timestamp: Date.parse('2026-08-29T14:00:00Z'), fundingRate: 0.0012, oiChangePercent: 3, mode: 'SIGNAL_PROMOTED', killSwitchActive: true });
    expect(result.reasonCode).toBe('KILL_SWITCH');
    expect(result.actionable).toBe(false);
  });

  it('does not promote low-category confluence', () => {
    const result = evaluateParliamentScannerContribution({ snapshot: snapshot([row({ evidenceId: 'funding', family: 'FUNDING_OI', direction: 'SHORT', score: -0.9 })]), direction: 'SHORT', regime, coreModelSupport: 0.1, timestamp: Date.parse('2026-08-29T14:00:00Z'), mode: 'SIGNAL_PROMOTED', killSwitchActive: false });
    expect(result.categoryConfluence).toBeLessThan(2);
    expect(result.actionable).toBe(false);
  });
});
