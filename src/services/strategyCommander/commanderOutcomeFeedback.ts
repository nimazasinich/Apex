import type { SignalDecisionLog } from '../../types';
import type { CommanderDirection, CommanderMarketRegime, OpportunityThesis, TrendRelation } from '../../contracts/commander/commanderContext';
import type { StrategyCommanderDecisionV1 } from '../../contracts/commander/commanderDecision';
import { isCommanderEvidenceFamily, isCommanderEvidenceQuality, type CommanderEvidenceDirection, type CommanderEvidenceFamily, type CommanderEvidenceQuality, type CommanderEvidenceV1 } from '../../contracts/commander/commanderEvidence';
import type {
  CommanderOutcomeAttributionV1,
  CommanderOutcomeExtraction,
  CommanderOutcomeObservationV1,
  CommanderResearchComparisonV1,
} from '../../contracts/commander/commanderOutcomeContracts';
export type {
  CommanderEvidenceAttributionV1,
  CommanderOutcomeAttributionV1,
  CommanderOutcomeExtraction,
  CommanderOutcomeObservationV1,
  CommanderResearchComparisonV1,
} from '../../contracts/commander/commanderOutcomeContracts';
import { isResearchOutcomeLog } from '../researchOutcomeFeedback';

/**
 * Immutable Commander-to-outcome join material.  This is deliberately carried
 * by the producing lifecycle; consumers must never recreate it from a similar
 * symbol, direction, timestamp, or strategy id.
 */
const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isUnit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isDirection = (value: unknown): value is CommanderDirection => value === 'LONG' || value === 'SHORT';
const isRegime = (value: unknown): value is CommanderMarketRegime => [
  'TREND_UP', 'TREND_DOWN', 'RANGE', 'COMPRESSION', 'EXPANSION', 'EXHAUSTION_UP', 'EXHAUSTION_DOWN', 'EVENT_SHOCK', 'THIN_LIQUIDITY', 'MIXED', 'UNCERTAIN',
].includes(String(value));
const isThesis = (value: unknown): value is OpportunityThesis | null => value === null || [
  'TREND_CONTINUATION', 'BREAKOUT', 'PULLBACK', 'REVERSAL', 'MEAN_REVERSION', 'EXHAUSTION', 'CARRY',
].includes(String(value));
const isTrendRelation = (value: unknown): value is TrendRelation => ['WITH_TREND', 'COUNTER_TREND', 'RANGE', 'MIXED', 'UNAVAILABLE'].includes(String(value));

/** Compare a real research context to an exact Commander decision without routing it. */
export function buildCommanderResearchComparison(input: {
  decision: StrategyCommanderDecisionV1;
  horizon: string;
  expectedParameterProfileFingerprint: string | null;
  actualParameterProfileFingerprint: string | null;
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  interval: string;
  direction: CommanderDirection;
}): CommanderResearchComparisonV1 | null {
  if (input.decision.symbol !== input.symbol
    || input.decision.marketContext.preferredDirection !== input.direction
    || input.horizon !== input.interval
    || input.expectedParameterProfileFingerprint === null
    || input.actualParameterProfileFingerprint === null
    || input.expectedParameterProfileFingerprint !== input.actualParameterProfileFingerprint) return null;
  const ranking = input.decision.rankings.find((entry) => entry.strategyId === input.strategyId);
  const suppressed = input.decision.suppressedStrategies.find((entry) => entry.strategyId === input.strategyId);
  const disposition = input.decision.abstain
    ? 'ABSTAIN'
    : input.decision.selectedStrategies.includes(input.strategyId)
      ? 'SELECT'
      : 'SUPPRESS';
  return {
    version: 'commander_research_comparison_v1',
    decisionId: input.decision.decisionId,
    strategyId: input.strategyId,
    strategyVersion: ranking?.strategyVersion ?? input.strategyVersion,
    parameterProfileFingerprint: input.actualParameterProfileFingerprint,
    symbol: input.symbol,
    interval: input.interval,
    direction: input.direction,
    disposition,
    reason: disposition === 'ABSTAIN'
      ? `abstain:${input.decision.abstainReason ?? 'unspecified'}`
      : disposition === 'SELECT'
        ? 'commander_selected_shadow_only'
        : suppressed?.reason ?? 'commander_not_selected',
    shadowOnly: true,
    researchRoutingApplied: false,
  };
}

/** Build attribution only for the exact strategy/profile explicitly selected by the decision. */
export function buildCommanderOutcomeAttribution(input: {
  decision: StrategyCommanderDecisionV1;
  evidence: readonly CommanderEvidenceV1[];
  horizon: string;
  expectedParameterProfileFingerprint: string | null;
  actualParameterProfileFingerprint: string | null;
  strategyId: string;
  symbol: string;
  interval: string;
  direction: CommanderDirection;
}): CommanderOutcomeAttributionV1 | null {
  const ranking = input.decision.rankings.find((entry) => entry.strategyId === input.strategyId);
  if (!ranking
    || !input.decision.selectedStrategies.includes(input.strategyId)
    || input.decision.symbol !== input.symbol
    || input.decision.marketContext.preferredDirection !== input.direction
    || input.horizon !== input.interval
    || input.expectedParameterProfileFingerprint === null
    || input.actualParameterProfileFingerprint === null
    || input.expectedParameterProfileFingerprint !== input.actualParameterProfileFingerprint) return null;
  return {
    version: 'commander_outcome_attribution_v1',
    decisionId: input.decision.decisionId,
    strategyId: input.strategyId,
    strategyVersion: ranking.strategyVersion,
    parameterProfileFingerprint: input.actualParameterProfileFingerprint,
    opportunityFingerprint: input.decision.opportunityFingerprint,
    evidenceFingerprint: input.decision.evidenceFingerprint,
    evidenceIds: input.evidence.map((row) => row.evidenceId).sort(),
    evidence: input.evidence.map((row) => ({
      evidenceId: row.evidenceId,
      expertId: row.expertId,
      expertVersion: row.expertVersion,
      family: row.family,
      timeframe: row.timeframe,
      direction: row.direction,
      confidence: row.confidence,
      valueQuality: row.valueQuality,
    })).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
    symbol: input.symbol,
    interval: input.interval,
    direction: input.direction,
    regime: input.decision.marketContext.regime,
    thesis: input.decision.marketContext.primaryThesis ?? null,
    trendRelation: input.decision.marketContext.trendRelation,
    predictedConfidence: ranking.confidence,
  };
}

export function isCommanderOutcomeAttribution(value: unknown): value is CommanderOutcomeAttributionV1 {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const evidenceIds = Array.isArray(row.evidenceIds) && row.evidenceIds.every(isString) ? row.evidenceIds : null;
  const evidence = Array.isArray(row.evidence) ? row.evidence : null;
  const evidenceValid = evidence !== null && evidence.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const entry = item as Record<string, unknown>;
    return ['evidenceId', 'expertId', 'expertVersion', 'timeframe'].every((field) => isString(entry[field]))
      && isCommanderEvidenceFamily(entry.family)
      && isCommanderEvidenceQuality(entry.valueQuality)
      && (entry.direction === null || entry.direction === 'LONG' || entry.direction === 'SHORT' || entry.direction === 'NEUTRAL')
      && isUnit(entry.confidence);
  });
  const envelopeEvidenceIds = evidenceValid ? evidence!.map((item) => String((item as Record<string, unknown>).evidenceId)).sort() : [];
  const declaredEvidenceIds = evidenceIds ? [...evidenceIds].sort() : [];
  const evidenceIdentityValid = evidenceIds !== null
    && new Set(declaredEvidenceIds).size === declaredEvidenceIds.length
    && new Set(envelopeEvidenceIds).size === envelopeEvidenceIds.length
    && declaredEvidenceIds.length === envelopeEvidenceIds.length
    && declaredEvidenceIds.every((id, index) => id === envelopeEvidenceIds[index]);
  return row.version === 'commander_outcome_attribution_v1'
    && ['decisionId', 'strategyId', 'strategyVersion', 'parameterProfileFingerprint', 'opportunityFingerprint', 'evidenceFingerprint', 'symbol', 'interval'].every((field) => isString(row[field]))
    && evidenceValid
    && evidenceIdentityValid
    && isDirection(row.direction)
    && isRegime(row.regime)
    && isThesis(row.thesis)
    && isTrendRelation(row.trendRelation)
    && isUnit(row.predictedConfidence);
}

/**
 * Extract one resolved, explicitly attributed research/paper outcome.  The
 * `commanderAttribution` envelope is mandatory: matching on only a strategy or
 * market would contaminate competence when the same setup recurs.
 */
export function extractCommanderOutcomeObservation(row: SignalDecisionLog): CommanderOutcomeExtraction {
  if (!isResearchOutcomeLog(row)) return { observation: null, reason: 'not_research_outcome' };
  if (row.laterOutcome !== 'WIN' && row.laterOutcome !== 'LOSS' && row.laterOutcome !== 'BREAKEVEN') {
    return { observation: null, reason: 'outcome_unresolved' };
  }
  const summary = row.marketSnapshotSummary;
  const attribution = summary?.commanderAttribution;
  if (!isCommanderOutcomeAttribution(attribution)) return { observation: null, reason: 'missing_or_invalid_commander_attribution' };
  if (row.ticker !== attribution.symbol || row.direction !== attribution.direction) {
    return { observation: null, reason: 'outcome_identity_mismatch' };
  }
  return {
    reason: null,
    observation: {
      version: 'commander_outcome_observation_v1',
      outcomeId: row.id,
      occurredAt: row.timestamp,
      attribution: {
        ...attribution,
        evidenceIds: [...attribution.evidenceIds].sort(),
        evidence: attribution.evidence.map((item) => ({ ...item })).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
      },
      outcome: row.laterOutcome,
      realizedPnlPct: Number.isFinite(row.laterPnl) ? Number(row.laterPnl) : null,
      successScore: row.laterOutcome === 'WIN' ? 1 : row.laterOutcome === 'LOSS' ? 0 : 0.5,
      researchOnly: true,
    },
  };
}

export function extractCommanderOutcomeObservations(rows: readonly SignalDecisionLog[]): {
  observations: CommanderOutcomeObservationV1[];
  ignored: Array<{ outcomeId: string; reason: string }>;
} {
  const observations: CommanderOutcomeObservationV1[] = [];
  const ignored: Array<{ outcomeId: string; reason: string }> = [];
  for (const row of rows) {
    const result = extractCommanderOutcomeObservation(row);
    if (result.observation) observations.push(result.observation);
    else if (result.reason !== 'not_research_outcome') ignored.push({ outcomeId: row.id, reason: result.reason ?? 'unknown' });
  }
  return {
    observations: observations.sort((left, right) => left.outcomeId.localeCompare(right.outcomeId)),
    ignored: ignored.sort((left, right) => left.outcomeId.localeCompare(right.outcomeId)),
  };
}
