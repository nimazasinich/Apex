import type { CommanderEvidenceQuality, CommanderEvidenceV1 } from '../../contracts/commander/commanderEvidence';
import type { CommanderMarketRegime, OpportunityThesis, TrendRelation } from '../../contracts/commander/commanderContext';
import type { CommanderOutcomeObservationV1 } from './commanderOutcomeFeedback';

export const GOVERNED_EVIDENCE_TRUST_VERSION = 'commander_static_trust_v1' as const;

export const GOVERNED_BASE_TRUST: Readonly<Record<string, number>> = Object.freeze({
  'apex.momentum': 0.85,
  'apex.direction_divergence': 0.82,
  'apex.price_action': 0.9,
  'apex.smart_money': 0.9,
  'apex.liquidity': 0.95,
  'apex.volatility': 0.85,
  'apex.funding_oi': 0.75,
  'apex.news': 0.65,
  'apex.sentiment': 0.6,
  'apex.whale': 0.65,
  'apex.fibonacci': 0.45,
  'apex.elliott': 0.4,
  'apex.harmonic': 0.45,
});

export const QUALITY_TRUST_MULTIPLIER: Readonly<Record<CommanderEvidenceQuality, number>> = Object.freeze({
  VALID: 1,
  ESTIMATED: 0.6,
  STALE: 0.25,
  MISSING: 0,
  INVALID: 0,
  NOT_CONFIGURED: 0,
});

export interface GovernedEvidenceTrust {
  version: typeof GOVERNED_EVIDENCE_TRUST_VERSION;
  evidenceId: string;
  expertId: string;
  baseTrust: number;
  qualityMultiplier: number;
  freshnessMultiplier: number;
  confidenceMultiplier: number;
  effectiveTrust: number;
  adaptive: false;
  included: boolean;
  exclusionReason: string | null;
}

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number) => Number(value.toFixed(6));

export function governedEvidenceTrust(
  evidence: CommanderEvidenceV1,
  asOf: string,
  baseTrustByExpert: Readonly<Record<string, number>> = GOVERNED_BASE_TRUST,
): GovernedEvidenceTrust {
  const asOfTime = Date.parse(asOf);
  const observedTime = Date.parse(evidence.observedAt);
  const expiryTime = evidence.expiresAt ? Date.parse(evidence.expiresAt) : null;
  const validTime = Number.isFinite(asOfTime) && Number.isFinite(observedTime) && observedTime <= asOfTime + 5 * 60_000;
  const expired = expiryTime !== null && (!Number.isFinite(expiryTime) || expiryTime < asOfTime);
  const freshnessMultiplier = !validTime ? 0 : expired ? 0.15 : 1;
  const qualityMultiplier = QUALITY_TRUST_MULTIPLIER[evidence.valueQuality] ?? 0;
  const baseTrust = clamp(baseTrustByExpert[evidence.expertId] ?? 0.5);
  const confidenceMultiplier = clamp(evidence.confidence);
  const effectiveTrust = round(baseTrust * qualityMultiplier * freshnessMultiplier * confidenceMultiplier);
  const exclusionReason = !validTime
    ? 'invalid_or_future_observation_time'
    : qualityMultiplier === 0
      ? `quality_${evidence.valueQuality.toLowerCase()}`
      : effectiveTrust === 0
        ? 'zero_effective_trust'
        : null;
  return {
    version: GOVERNED_EVIDENCE_TRUST_VERSION,
    evidenceId: evidence.evidenceId,
    expertId: evidence.expertId,
    baseTrust,
    qualityMultiplier,
    freshnessMultiplier,
    confidenceMultiplier,
    effectiveTrust,
    adaptive: false,
    included: exclusionReason === null,
    exclusionReason,
  };
}

export interface EvidenceOutcomeObservationV1 {
  version: 'evidence_outcome_observation_v1';
  outcomeId: string;
  evidenceId: string;
  symbol: string;
  expertId: string;
  expertVersion: string;
  family: CommanderEvidenceV1['family'];
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  regime: CommanderMarketRegime;
  thesis: OpportunityThesis | null;
  trendRelation: TrendRelation;
  predictedConfidence: number;
  successScore: number;
  researchOnly: true;
}

export interface EvidenceCompetenceIdentityV1 {
  evidenceId: string;
  symbol: string;
  expertId: string;
  expertVersion: string;
  family: CommanderEvidenceV1['family'];
  timeframe: string;
  direction: CommanderEvidenceV1['direction'];
  regime: CommanderMarketRegime;
  thesis: OpportunityThesis | null;
  trendRelation: TrendRelation;
}

export interface EvidenceCompetenceV1 {
  version: 'evidence_competence_v1';
  evidenceId: string;
  symbol: string;
  expertId: string;
  expertVersion: string;
  family: CommanderEvidenceV1['family'];
  timeframe: string;
  direction: CommanderEvidenceV1['direction'];
  contextLevel: 'EXACT' | 'REGIME_THESIS_DIRECTION' | 'REGIME_THESIS' | 'REGIME' | 'GLOBAL' | 'DEFAULT';
  sampleCount: number;
  effectiveSampleCount: number;
  minimumRequiredSample: number;
  competence: number;
  brierScore: number | null;
  coverage: number;
  status: 'SUFFICIENT_EVIDENCE' | 'INSUFFICIENT_EVIDENCE';
  adaptiveTrustApplied: false;
  reasons: string[];
}

export interface EvidenceCompetencePolicyV1 {
  version: 'evidence_competence_policy_v1';
  minimumObservations: number;
  minimumContextObservations: number;
  defaultCompetence: number;
}

export const DEFAULT_EVIDENCE_COMPETENCE_POLICY: EvidenceCompetencePolicyV1 = Object.freeze({
  version: 'evidence_competence_policy_v1',
  minimumObservations: 40,
  minimumContextObservations: 20,
  defaultCompetence: 0.5,
});

export function extractEvidenceOutcomeObservations(
  outcomes: readonly CommanderOutcomeObservationV1[],
): EvidenceOutcomeObservationV1[] {
  const observations: EvidenceOutcomeObservationV1[] = [];
  for (const outcome of outcomes) {
    for (const evidence of outcome.attribution.evidence) {
      if (evidence.direction !== 'LONG' && evidence.direction !== 'SHORT') continue;
      if (evidence.valueQuality !== 'VALID' && evidence.valueQuality !== 'ESTIMATED' && evidence.valueQuality !== 'STALE') continue;
      const agreesWithTrade = evidence.direction === outcome.attribution.direction;
      const successScore = outcome.outcome === 'BREAKEVEN' ? 0.5 : outcome.outcome === 'WIN' ? (agreesWithTrade ? 1 : 0) : (agreesWithTrade ? 0 : 1);
      observations.push({
        version: 'evidence_outcome_observation_v1',
        outcomeId: outcome.outcomeId,
        evidenceId: evidence.evidenceId,
        symbol: outcome.attribution.symbol,
        expertId: evidence.expertId,
        expertVersion: evidence.expertVersion,
        family: evidence.family,
        timeframe: evidence.timeframe,
        direction: evidence.direction,
        regime: outcome.attribution.regime,
        thesis: outcome.attribution.thesis,
        trendRelation: outcome.attribution.trendRelation,
        predictedConfidence: evidence.confidence,
        successScore,
        researchOnly: true,
      });
    }
  }
  return observations.sort((left, right) => left.outcomeId.localeCompare(right.outcomeId) || left.evidenceId.localeCompare(right.evidenceId));
}

type EvidenceContextLevel = Exclude<EvidenceCompetenceV1['contextLevel'], 'DEFAULT'>;

function evidenceKey(item: EvidenceCompetenceIdentityV1, level: EvidenceContextLevel): string {
  const base = `${item.expertId}|${item.expertVersion}`;
  if (level === 'GLOBAL') return base;
  if (level === 'REGIME') return `${base}|${item.regime}`;
  if (level === 'REGIME_THESIS') return `${base}|${item.regime}|${item.thesis ?? 'NONE'}`;
  if (level === 'REGIME_THESIS_DIRECTION') return `${base}|${item.regime}|${item.thesis ?? 'NONE'}|${item.direction ?? 'NONE'}`;
  return `${base}|${item.symbol}|${item.family}|${item.timeframe}|${item.direction ?? 'NONE'}|${item.regime}|${item.thesis ?? 'NONE'}|${item.trendRelation}`;
}

function evidenceIdentityOf(row: EvidenceOutcomeObservationV1): EvidenceCompetenceIdentityV1 {
  return {
    evidenceId: row.evidenceId,
    symbol: row.symbol,
    expertId: row.expertId,
    expertVersion: row.expertVersion,
    family: row.family,
    timeframe: row.timeframe,
    direction: row.direction,
    regime: row.regime,
    thesis: row.thesis,
    trendRelation: row.trendRelation,
  };
}

export function resolveEvidenceCompetence(input: {
  target: EvidenceCompetenceIdentityV1;
  observations: readonly EvidenceOutcomeObservationV1[];
  policy?: EvidenceCompetencePolicyV1;
}): EvidenceCompetenceV1 {
  const policy = input.policy ?? DEFAULT_EVIDENCE_COMPETENCE_POLICY;
  const levels: Array<{ level: EvidenceContextLevel; minimum: number }> = [
    { level: 'EXACT', minimum: policy.minimumContextObservations },
    { level: 'REGIME_THESIS_DIRECTION', minimum: policy.minimumContextObservations },
    { level: 'REGIME_THESIS', minimum: policy.minimumContextObservations },
    { level: 'REGIME', minimum: policy.minimumContextObservations },
    { level: 'GLOBAL', minimum: policy.minimumObservations },
  ];
  for (const attempt of levels) {
    const rows = input.observations.filter((row) => evidenceKey(evidenceIdentityOf(row), attempt.level) === evidenceKey(input.target, attempt.level));
    if (rows.length < attempt.minimum) continue;
    const competence = rows.reduce((sum, row) => sum + row.successScore, 0) / rows.length;
    const brier = rows.reduce((sum, row) => sum + (row.predictedConfidence - row.successScore) ** 2, 0) / rows.length;
    return {
      version: 'evidence_competence_v1', evidenceId: input.target.evidenceId, symbol: input.target.symbol,
      expertId: input.target.expertId, expertVersion: input.target.expertVersion, family: input.target.family, timeframe: input.target.timeframe, direction: input.target.direction,
      contextLevel: attempt.level, sampleCount: rows.length, effectiveSampleCount: rows.length, minimumRequiredSample: attempt.minimum,
      competence: round(competence), brierScore: round(brier), coverage: 1, status: 'SUFFICIENT_EVIDENCE', adaptiveTrustApplied: false,
      reasons: [`${attempt.level.toLowerCase()}:minimum_observations_met`, 'adaptive_trust:false'],
    };
  }
  const globalCount = input.observations.filter((row) => row.expertId === input.target.expertId && row.expertVersion === input.target.expertVersion).length;
  return {
    version: 'evidence_competence_v1', evidenceId: input.target.evidenceId, symbol: input.target.symbol,
    expertId: input.target.expertId, expertVersion: input.target.expertVersion, family: input.target.family, timeframe: input.target.timeframe, direction: input.target.direction,
    contextLevel: 'DEFAULT', sampleCount: globalCount, effectiveSampleCount: globalCount, minimumRequiredSample: policy.minimumObservations,
    competence: clamp(policy.defaultCompetence), brierScore: null, coverage: 0, status: 'INSUFFICIENT_EVIDENCE', adaptiveTrustApplied: false,
    reasons: ['insufficient_evidence_across_hierarchy', 'adaptive_trust:false'],
  };
}
