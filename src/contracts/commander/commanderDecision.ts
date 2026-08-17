import type { CommanderMarketContextV1 } from './commanderContext';
import { COMMANDER_SAFETY } from './commanderPolicy';

export interface CommanderRankingV1 {
  strategyId: string;
  strategyVersion: string;
  participationScore: number;
  participationWeight: number;
  competence: number;
  competenceSampleCount: number;
  confidence: number;
  evidenceQuality: number;
  reasons: string[];
}

export interface CommanderSuppressedStrategyV1 {
  strategyId: string;
  reason: string;
}

export interface CommanderSafetyV1 {
  shadowOnly: boolean;
  executionAuthorized: false;
  orderSubmissionAllowed: false;
  authoritativeLiveDecision: false;
  riskGovernorBypassAllowed: false;
}

export interface StrategyCommanderDecisionV1 {
  decisionId: string;
  timestamp: string;
  symbol: string;
  opportunityFingerprint: string;
  evidenceFingerprint: string;
  marketContext: CommanderMarketContextV1;
  eligibleStrategies: string[];
  rankings: CommanderRankingV1[];
  selectedStrategies: string[];
  suppressedStrategies: CommanderSuppressedStrategyV1[];
  abstain: boolean;
  abstainReason?: string;
  commanderVersion: string;
  commanderStateRevision: string;
  safety: CommanderSafetyV1;
}

export interface CommanderDecisionValidation {
  ok: boolean;
  reasons: string[];
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isUnit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

export function validateStrategyCommanderDecision(decision: StrategyCommanderDecisionV1): CommanderDecisionValidation {
  const reasons: string[] = [];
  for (const [field, value] of Object.entries({
    decisionId: decision.decisionId,
    timestamp: decision.timestamp,
    symbol: decision.symbol,
    opportunityFingerprint: decision.opportunityFingerprint,
    evidenceFingerprint: decision.evidenceFingerprint,
    commanderVersion: decision.commanderVersion,
    commanderStateRevision: decision.commanderStateRevision,
  })) {
    if (!isNonEmptyString(value)) reasons.push(`${field}_required`);
  }
  if (!Array.isArray(decision.eligibleStrategies) || decision.eligibleStrategies.some((id) => !isNonEmptyString(id)) || !unique(decision.eligibleStrategies)) reasons.push('invalid_eligible_strategies');
  if (!Array.isArray(decision.rankings) || decision.rankings.some((ranking) => {
    return !isNonEmptyString(ranking.strategyId)
      || !isNonEmptyString(ranking.strategyVersion)
      || !isUnit(ranking.participationScore)
      || !isUnit(ranking.participationWeight)
      || !isUnit(ranking.competence)
      || !Number.isSafeInteger(ranking.competenceSampleCount)
      || ranking.competenceSampleCount < 0
      || !isUnit(ranking.confidence)
      || !isUnit(ranking.evidenceQuality)
      || !Array.isArray(ranking.reasons)
      || ranking.reasons.some((reason) => typeof reason !== 'string');
  }) || !unique(decision.rankings.map((ranking) => ranking.strategyId))) reasons.push('invalid_rankings');
  if (new Set(decision.rankings.map((ranking) => ranking.strategyId)).size !== new Set(decision.eligibleStrategies).size
      || decision.rankings.some((ranking) => !decision.eligibleStrategies.includes(ranking.strategyId))) reasons.push('ranking_eligibility_mismatch');
  if (!Array.isArray(decision.selectedStrategies) || decision.selectedStrategies.some((id) => !decision.eligibleStrategies.includes(id)) || !unique(decision.selectedStrategies)) reasons.push('invalid_selected_strategies');
  if (!Array.isArray(decision.suppressedStrategies) || decision.suppressedStrategies.some((row) => !isNonEmptyString(row.strategyId) || !isNonEmptyString(row.reason))) reasons.push('invalid_suppressed_strategies');
  if (typeof decision.abstain !== 'boolean') reasons.push('invalid_abstain');
  if (decision.abstain && decision.selectedStrategies.length > 0) reasons.push('abstain_cannot_select_strategies');
  if (decision.abstain && !isNonEmptyString(decision.abstainReason)) reasons.push('abstain_reason_required');
  if (decision.safety.executionAuthorized !== COMMANDER_SAFETY.executionAuthorized) reasons.push('execution_must_remain_denied');
  if (decision.safety.orderSubmissionAllowed !== COMMANDER_SAFETY.orderSubmissionAllowed) reasons.push('order_submission_must_remain_denied');
  if (decision.safety.authoritativeLiveDecision !== COMMANDER_SAFETY.authoritativeLiveDecision) reasons.push('authoritative_live_decision_must_remain_denied');
  if (decision.safety.riskGovernorBypassAllowed !== COMMANDER_SAFETY.riskGovernorBypassAllowed) reasons.push('risk_governor_bypass_must_remain_denied');
  return { ok: reasons.length === 0, reasons };
}

export function assertValidStrategyCommanderDecision(decision: StrategyCommanderDecisionV1): void {
  const validation = validateStrategyCommanderDecision(decision);
  if (!validation.ok) throw new Error(`invalid_strategy_commander_decision:${validation.reasons.join(',')}`);
}
