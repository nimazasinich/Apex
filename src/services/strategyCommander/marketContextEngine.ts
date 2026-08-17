import type { CommanderMarketContextV1, CommanderMarketRegime, OpportunityThesis, TrendRelation } from '../../contracts/commander/commanderContext';
import type { IntelligenceConsensusV1 } from './intelligenceConsensus';
import type { OpportunityCandidateV1 } from './opportunity/opportunityTypes';

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number) => Number(clamp(value).toFixed(6));

function evidenceQuality(consensus: IntelligenceConsensusV1): CommanderMarketContextV1['evidenceQuality'] {
  if (consensus.evidenceQuality <= 0) return 'MISSING';
  if (consensus.materialVetoes.includes('STALE_EVIDENCE')) return 'STALE';
  if (consensus.evidenceQuality >= 0.85) return 'VALID';
  return 'ESTIMATED';
}

function regimeFor(consensus: IntelligenceConsensusV1, opportunity: OpportunityCandidateV1): CommanderMarketRegime {
  if (consensus.evidenceCompleteness === 0) return 'UNCERTAIN';
  if (consensus.materialVetoes.includes('EVENT_RISK')) return 'EVENT_SHOCK';
  if (consensus.materialVetoes.includes('LIQUIDITY_DEGRADATION')) return 'THIN_LIQUIDITY';
  if (opportunity.volatilityState === 'COMPRESSION') return 'COMPRESSION';
  if (opportunity.volatilityState === 'EXPANDING') return 'EXPANSION';
  if (consensus.leadingThesis === 'REVERSAL' || consensus.leadingThesis === 'EXHAUSTION') {
    return consensus.leadingDirection === 'LONG' ? 'EXHAUSTION_DOWN' : consensus.leadingDirection === 'SHORT' ? 'EXHAUSTION_UP' : 'MIXED';
  }
  if (consensus.leadingDirection === 'LONG') return 'TREND_UP';
  if (consensus.leadingDirection === 'SHORT') return 'TREND_DOWN';
  return opportunity.momentumState === 'NEUTRAL' ? 'RANGE' : 'MIXED';
}

function relationFor(regime: CommanderMarketRegime, thesis: OpportunityThesis | undefined): TrendRelation {
  if (thesis === 'REVERSAL' || thesis === 'EXHAUSTION') return 'COUNTER_TREND';
  if (regime === 'TREND_UP' || regime === 'TREND_DOWN') return 'WITH_TREND';
  if (regime === 'RANGE') return 'RANGE';
  if (regime === 'UNCERTAIN') return 'UNAVAILABLE';
  return 'MIXED';
}

/** Derives a non-authoritative market hypothesis from existing Opportunity and Parliament SHADOW records. */
export function buildCommanderMarketContext(
  consensus: IntelligenceConsensusV1,
  opportunity: OpportunityCandidateV1,
): CommanderMarketContextV1 {
  const thesis = consensus.leadingThesis === 'UNCERTAIN' ? undefined : consensus.leadingThesis;
  const regime = regimeFor(consensus, opportunity);
  const hardVeto = consensus.materialVetoes.some((veto) => veto === 'EVENT_RISK'
    || veto === 'LIQUIDITY_DEGRADATION'
    || veto === 'EVIDENCE_IDENTITY_MISMATCH'
    || veto === 'INVALID_EVIDENCE');
  const preferredDirection = !hardVeto && (consensus.leadingDirection === 'LONG' || consensus.leadingDirection === 'SHORT')
    ? consensus.leadingDirection
    : undefined;
  const confidence = round(consensus.consensus
    * consensus.evidenceCompleteness
    * consensus.evidenceQuality
    * (1 - consensus.dissent.score));
  const reasons = [
    `parliament_fingerprint:${consensus.fingerprint}`,
    `regime:${regime}`,
    `trend_relation:${relationFor(regime, thesis)}`,
    `shadow_only:true`,
  ];
  if (hardVeto) reasons.push(`material_veto:${consensus.materialVetoes.join('|')}`);
  if (!preferredDirection) reasons.push('direction_not_eligible_for_shadow_selection');
  if (!thesis) reasons.push('primary_thesis_uncertain');
  return {
    regime,
    regimeConfidence: round(consensus.consensus * consensus.evidenceQuality),
    preferredDirection,
    eligibleDirections: preferredDirection ? [preferredDirection] : [],
    primaryThesis: thesis,
    trendRelation: relationFor(regime, thesis),
    volatilityState: opportunity.volatilityState,
    liquidityState: consensus.materialVetoes.includes('LIQUIDITY_DEGRADATION') ? 'UNSAFE' : 'HEALTHY',
    evidenceCompleteness: round(consensus.evidenceCompleteness),
    confidence,
    evidenceQuality: evidenceQuality(consensus),
    reasons,
  };
}
