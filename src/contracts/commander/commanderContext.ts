import type { CommanderEvidenceQuality } from './commanderEvidence';

export const COMMANDER_REGIMES = [
  'TREND_UP',
  'TREND_DOWN',
  'RANGE',
  'COMPRESSION',
  'EXPANSION',
  'EXHAUSTION_UP',
  'EXHAUSTION_DOWN',
  'EVENT_SHOCK',
  'THIN_LIQUIDITY',
  'MIXED',
  'UNCERTAIN',
] as const;

export type CommanderMarketRegime = (typeof COMMANDER_REGIMES)[number];
export type OpportunityThesis =
  | 'TREND_CONTINUATION'
  | 'BREAKOUT'
  | 'PULLBACK'
  | 'REVERSAL'
  | 'MEAN_REVERSION'
  | 'EXHAUSTION'
  | 'CARRY';
export type TrendRelation = 'WITH_TREND' | 'COUNTER_TREND' | 'RANGE' | 'MIXED' | 'UNAVAILABLE';
export type CommanderDirection = 'LONG' | 'SHORT';

export const COMMANDER_ABSTAIN_REASONS = [
  'NO_OPPORTUNITY',
  'INSUFFICIENT_EVIDENCE',
  'DATA_MISSING',
  'DATA_STALE',
  'REGIME_UNCERTAIN',
  'THESIS_CONFLICT',
  'EXPERT_DISSENT',
  'STRATEGY_COMPETENCE_LOW',
  'SAMPLE_INSUFFICIENT',
  'LIQUIDITY_UNSAFE',
  'EVENT_RISK',
  'PORTFOLIO_CONFLICT',
  'IDENTITY_MISMATCH',
] as const;

export type CommanderAbstainReason = (typeof COMMANDER_ABSTAIN_REASONS)[number];

export interface CommanderMarketContextV1 {
  regime: CommanderMarketRegime;
  regimeConfidence: number;
  preferredDirection?: CommanderDirection;
  eligibleDirections: CommanderDirection[];
  primaryThesis?: OpportunityThesis;
  trendRelation: TrendRelation;
  volatilityState: string;
  liquidityState: string;
  evidenceCompleteness: number;
  confidence: number;
  evidenceQuality: CommanderEvidenceQuality;
  reasons: string[];
}

export interface CommanderContextValidation {
  ok: boolean;
  reasons: string[];
}

const isUnit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export function isCommanderMarketRegime(value: unknown): value is CommanderMarketRegime {
  return typeof value === 'string' && (COMMANDER_REGIMES as readonly string[]).includes(value);
}

export function isOpportunityThesis(value: unknown): value is OpportunityThesis {
  return ['TREND_CONTINUATION', 'BREAKOUT', 'PULLBACK', 'REVERSAL', 'MEAN_REVERSION', 'EXHAUSTION', 'CARRY'].includes(String(value));
}

export function isTrendRelation(value: unknown): value is TrendRelation {
  return ['WITH_TREND', 'COUNTER_TREND', 'RANGE', 'MIXED', 'UNAVAILABLE'].includes(String(value));
}

export function validateCommanderMarketContext(context: CommanderMarketContextV1): CommanderContextValidation {
  const reasons: string[] = [];
  if (!isCommanderMarketRegime(context.regime)) reasons.push('invalid_regime');
  if (!isUnit(context.regimeConfidence)) reasons.push('invalid_regime_confidence');
  if (context.preferredDirection !== undefined && context.preferredDirection !== 'LONG' && context.preferredDirection !== 'SHORT') reasons.push('invalid_preferred_direction');
  if (!Array.isArray(context.eligibleDirections) || context.eligibleDirections.some((direction) => direction !== 'LONG' && direction !== 'SHORT')) reasons.push('invalid_eligible_directions');
  if (context.primaryThesis !== undefined && !isOpportunityThesis(context.primaryThesis)) reasons.push('invalid_primary_thesis');
  if (!isTrendRelation(context.trendRelation)) reasons.push('invalid_trend_relation');
  if (typeof context.volatilityState !== 'string' || !context.volatilityState.trim()) reasons.push('volatility_state_required');
  if (typeof context.liquidityState !== 'string' || !context.liquidityState.trim()) reasons.push('liquidity_state_required');
  if (!isUnit(context.evidenceCompleteness)) reasons.push('invalid_evidence_completeness');
  if (!isUnit(context.confidence)) reasons.push('invalid_confidence');
  if (!isStringArray(context.reasons)) reasons.push('invalid_reasons');
  return { ok: reasons.length === 0, reasons };
}

export function assertValidCommanderMarketContext(context: CommanderMarketContextV1): void {
  const validation = validateCommanderMarketContext(context);
  if (!validation.ok) throw new Error(`invalid_commander_market_context:${validation.reasons.join(',')}`);
}
