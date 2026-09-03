/**
 * strategyLabTypes.ts — contracts for the Academy strategy lab (Task 1, stages 2–7).
 *
 * SCOPE AND SAFETY BOUNDARY
 * The strategy lab is a research surface. Nothing in this module authorizes
 * execution, promotion, or order routing. Candidates recorded here are
 * ADVISORY-only, exactly like `AcademyConsumerIntelligence`, and every metric
 * they carry comes from the existing `AutomatedEvaluationPipeline` rather than
 * from any lab-local scoring.
 *
 * WHY A SEPARATE VERSION CONSTANT
 * `ACADEMY_SCHEMA_VERSION` in ../types.ts governs the durable-JSON academy
 * store and its hard-fail validation. The lab is a physically separate SQLite
 * database with its own migration timeline, so it carries its own constant and
 * MUST NOT be coupled to the academy one. Bumping one must never silently
 * invalidate the other.
 *
 * This file deliberately contains NO node imports so it stays safe to import
 * from any layer.
 */

export const STRATEGY_LAB_SCHEMA_VERSION = 1 as const;

export const STRATEGY_LAB_AUTHORITY = 'ADVISORY_AND_SAFETY_GATE_ONLY' as const;

export const STRATEGY_CANDIDATE_SOURCE_TYPES = ['DISCOVERED', 'COMBINED', 'HOUSE'] as const;
export type StrategyCandidateSourceType = (typeof STRATEGY_CANDIDATE_SOURCE_TYPES)[number];

export const STRATEGY_CANDIDATE_STATUSES = [
  'INGESTED', 'QUEUED_FOR_TEST', 'TESTING', 'TESTED', 'IMPROVING', 'VALIDATED', 'REJECTED',
] as const;
export type StrategyCandidateStatus = (typeof STRATEGY_CANDIDATE_STATUSES)[number];

export const STRATEGY_FUSION_METHODS = ['WEIGHTED_ENSEMBLE', 'SEQUENTIAL_FILTER'] as const;
export type StrategyFusionMethod = (typeof STRATEGY_FUSION_METHODS)[number];

/**
 * A parsed candidate is stored verbatim as the `DiscoveredAcademyStrategy` the
 * existing import parser produced. That is deliberate: stage 4 must feed the
 * SAME object shape into the SAME `AutomatedEvaluationPipeline` that house
 * strategies use, so the lab cannot drift into a parallel evaluation path.
 * `parsedRules` is typed as `unknown` here only to keep this file node-free and
 * dependency-light; the store and service narrow it at the boundary.
 */
export interface StrategyCandidateRow {
  id: string;
  sourceType: StrategyCandidateSourceType;
  sourceUrl: string | null;
  sourceCitation: string | null;
  discoveredAtUtc: string;
  rawContentHash: string;
  parsedRulesJson: string;
  parseConfidence: number;
  parentCandidateIds: string[];
  status: StrategyCandidateStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface StrategyEvaluationRunRow {
  id: string;
  candidateId: string;
  datasetFingerprint: string | null;
  runId: string | null;
  holdoutProtocolStatus: string;
  metricsJson: string;
  createdAtUtc: string;
}

export interface StrategyComparisonRow {
  id: string;
  candidateIds: string[];
  metricsJson: string;
  createdAtUtc: string;
}

export interface StrategyFusionRow {
  id: string;
  parentCandidateIds: string[];
  fusionMethod: StrategyFusionMethod;
  resultingCandidateId: string;
  createdAtUtc: string;
}

export function isStrategyCandidateSourceType(value: unknown): value is StrategyCandidateSourceType {
  return typeof value === 'string' && (STRATEGY_CANDIDATE_SOURCE_TYPES as readonly string[]).includes(value);
}

export function isStrategyCandidateStatus(value: unknown): value is StrategyCandidateStatus {
  return typeof value === 'string' && (STRATEGY_CANDIDATE_STATUSES as readonly string[]).includes(value);
}

export function isStrategyFusionMethod(value: unknown): value is StrategyFusionMethod {
  return typeof value === 'string' && (STRATEGY_FUSION_METHODS as readonly string[]).includes(value);
}
