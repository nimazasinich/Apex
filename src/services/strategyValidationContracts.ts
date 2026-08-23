/** Validation identity contracts shared by domain types and validation behavior. */
export const STRATEGY_VALIDATION_SUBJECT_VERSION = 'strategy_validation_subject_v1';
export const STRATEGY_VALIDATION_UNIVERSE_VERSION = 'strategy_validation_universe_v1';

export interface StrategyValidationUniverseIdentity {
  version: typeof STRATEGY_VALIDATION_UNIVERSE_VERSION;
  symbols: string[];
  interval: string;
  alignedFrom: number | null;
  alignedTo: number | null;
  candleCounts: Record<string, number>;
  contentFingerprint: string;
}

export type StrategyValidationSubjectKind =
  | 'OPTIMIZATION_CANDIDATE'
  | 'ACTIVE_PROFILE'
  | 'DEFINITION_DEFAULTS';

export interface StrategyValidationSubjectIdentity {
  version: typeof STRATEGY_VALIDATION_SUBJECT_VERSION;
  kind: StrategyValidationSubjectKind;
  strategyId: string;
  strategyVersion: number;
  fingerprint: string;
  activeProfileRevision: number | null;
  sourceReportAt: number | null;
  universeIdentityRequired: boolean;
  universeIdentity: StrategyValidationUniverseIdentity | null;
}
