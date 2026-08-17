export const COMMANDER_EVIDENCE_VERSION = 'commander_evidence_v1' as const;

export const COMMANDER_EVIDENCE_FAMILIES = [
  'MOMENTUM',
  'PRICE_ACTION',
  'SMART_MONEY',
  'LIQUIDITY',
  'VOLATILITY',
  'FUNDING_OI',
  'NEWS',
  'SENTIMENT',
  'WHALE',
  'FIBONACCI',
  'ELLIOTT',
  'HARMONIC',
] as const;

export type CommanderEvidenceFamily = (typeof COMMANDER_EVIDENCE_FAMILIES)[number];
export type CommanderEvidenceDirection = 'LONG' | 'SHORT' | 'NEUTRAL' | null;

export const COMMANDER_EVIDENCE_QUALITIES = [
  'VALID',
  'ESTIMATED',
  'STALE',
  'MISSING',
  'INVALID',
  'NOT_CONFIGURED',
] as const;

export type CommanderEvidenceQuality = (typeof COMMANDER_EVIDENCE_QUALITIES)[number];

export interface CommanderEvidenceV1 {
  version: typeof COMMANDER_EVIDENCE_VERSION;
  evidenceId: string;
  expertId: string;
  expertVersion: string;
  family: CommanderEvidenceFamily;
  symbol: string;
  timeframe: string;
  direction: CommanderEvidenceDirection;
  thesisTags: string[];
  score: number;
  confidence: number;
  valueQuality: CommanderEvidenceQuality;
  observedAt: string;
  receivedAt: string;
  expiresAt?: string;
  source: string;
  sourceVersion?: string;
  supportingReasons: string[];
  conflictingReasons: string[];
  rawEvidenceIds: string[];
  inputFingerprint: string;
}

export interface CommanderEvidenceValidation {
  ok: boolean;
  reasons: string[];
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isFiniteUnit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isFiniteScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export function isCommanderEvidenceFamily(value: unknown): value is CommanderEvidenceFamily {
  return typeof value === 'string' && (COMMANDER_EVIDENCE_FAMILIES as readonly string[]).includes(value);
}

export function isCommanderEvidenceQuality(value: unknown): value is CommanderEvidenceQuality {
  return typeof value === 'string' && (COMMANDER_EVIDENCE_QUALITIES as readonly string[]).includes(value);
}

export function validateCommanderEvidence(candidate: CommanderEvidenceV1): CommanderEvidenceValidation {
  const reasons: string[] = [];
  if (candidate.version !== COMMANDER_EVIDENCE_VERSION) reasons.push('invalid_version');
  for (const [field, value] of Object.entries({
    evidenceId: candidate.evidenceId,
    expertId: candidate.expertId,
    expertVersion: candidate.expertVersion,
    symbol: candidate.symbol,
    timeframe: candidate.timeframe,
    observedAt: candidate.observedAt,
    receivedAt: candidate.receivedAt,
    source: candidate.source,
    inputFingerprint: candidate.inputFingerprint,
  })) {
    if (!isNonEmptyString(value)) reasons.push(`${field}_required`);
  }
  if (!isCommanderEvidenceFamily(candidate.family)) reasons.push('invalid_family');
  if (candidate.direction !== null && candidate.direction !== 'LONG' && candidate.direction !== 'SHORT' && candidate.direction !== 'NEUTRAL') {
    reasons.push('invalid_direction');
  }
  if (!isStringArray(candidate.thesisTags)) reasons.push('invalid_thesis_tags');
  if (!isFiniteScore(candidate.score)) reasons.push('invalid_score');
  if (!isFiniteUnit(candidate.confidence)) reasons.push('invalid_confidence');
  if (!isCommanderEvidenceQuality(candidate.valueQuality)) reasons.push('invalid_quality');
  if (candidate.expiresAt !== undefined && !isNonEmptyString(candidate.expiresAt)) reasons.push('invalid_expires_at');
  if (candidate.sourceVersion !== undefined && !isNonEmptyString(candidate.sourceVersion)) reasons.push('invalid_source_version');
  if (!isStringArray(candidate.supportingReasons)) reasons.push('invalid_supporting_reasons');
  if (!isStringArray(candidate.conflictingReasons)) reasons.push('invalid_conflicting_reasons');
  if (!isStringArray(candidate.rawEvidenceIds)) reasons.push('invalid_raw_evidence_ids');
  return { ok: reasons.length === 0, reasons };
}

export function assertValidCommanderEvidence(candidate: CommanderEvidenceV1): void {
  const validation = validateCommanderEvidence(candidate);
  if (!validation.ok) throw new Error(`invalid_commander_evidence:${validation.reasons.join(',')}`);
}
