import type { StrategyDefinition } from '../../types.ts';

export const ACADEMY_SCHEMA_VERSION = 1 as const;
export const ACADEMY_ENGINE_VERSION = 'academy_intelligence_v1' as const;

export type AcademyEvidenceState = 'EVALUATED' | 'NOT_EVALUATED' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE';
export type AcademyEvidenceVerification = 'INTERNAL_RECORDED' | 'EXTERNAL_VERIFIED' | 'UNVERIFIED';
export type AcademyLifecycleState = 'DISCOVERED' | 'BACKTESTED' | 'VALIDATED' | 'SHADOW' | 'LIVE_ELIGIBLE' | 'RETIRED';
export type AcademySourceKind =
  | 'INTERNAL_STRATEGY_ENGINE'
  | 'BACKTEST_RESULT'
  | 'USER_CREATED'
  | 'RESEARCH_MODULE'
  | 'HISTORICAL_PATTERN'
  | 'EXTERNAL_RESEARCH';
export type AcademyEvidenceKind = 'DISCOVERY' | 'BACKTEST' | 'VALIDATION' | 'PAPER_FORWARD' | 'LIVE_OUTCOME' | 'RESEARCH';
export type AcademyEnginePhase = 'OFF' | 'LEARNING' | 'EVALUATING' | 'STORING' | 'IMPROVING' | 'IDLE' | 'FAILED';
export type AcademyRegime = 'TRENDING' | 'RANGE' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'LIQUIDITY_EVENT' | 'NEWS_DRIVEN';
export type AcademyRegimeCompatibilityState = 'SUPPORTED' | 'WEAK' | 'INSUFFICIENT_DATA';

export interface AcademyEvidenceMetadata {
  evidenceId: string;
  kind: AcademyEvidenceKind;
  source: string;
  sourceKind: AcademySourceKind;
  verification: AcademyEvidenceVerification;
  observedAt: number | null;
  ingestedAt: number;
  fingerprint: string;
  dataState: 'live' | 'degraded' | 'unavailable' | 'not_applicable';
  datasetFingerprint: string | null;
  runId: string | null;
  notes: string[];
}

export interface AcademyStrategyLogic {
  summary: string;
  setupRules: string[];
  triggerRules: string[];
  riskRules: string[];
  exitRules: string[];
  noTradeRules: string[];
}

export interface AcademyMetric<T = number> {
  state: AcademyEvidenceState;
  value: T | null;
  evidenceIds: string[];
  detail: string;
}

export interface AcademyEvaluationMetrics {
  winRatePct: AcademyMetric;
  profitFactor: AcademyMetric;
  maxDrawdownPct: AcademyMetric;
  riskReward: AcademyMetric;
  stability: AcademyMetric<boolean>;
  marketRegimePerformance: AcademyMetric<{ measured: string[]; profitable: string[] }>;
  dataQuality: AcademyMetric<'LIVE' | 'DEGRADED' | 'UNAVAILABLE'>;
}

export interface AcademyEvaluationStage {
  state: AcademyEvidenceState;
  passed: boolean | null;
  evidenceIds: string[];
  detail: string;
}

export interface AcademyEvaluationResult {
  evaluatedAt: number;
  evidenceFingerprint: string;
  backtest: AcademyEvaluationStage;
  risk: AcademyEvaluationStage;
  robustness: AcademyEvaluationStage;
  scoring: AcademyEvaluationStage;
  overall: AcademyEvidenceState;
  metrics: AcademyEvaluationMetrics;
  confidenceScore: AcademyMetric;
  rankScore: AcademyMetric;
  blockers: string[];
}

export interface AcademyLifecycleEvent {
  from: AcademyLifecycleState | null;
  to: AcademyLifecycleState;
  at: number;
  reason: string;
  evidenceIds: string[];
  authority: 'ACADEMY_PIPELINE' | 'SERVER_GOVERNANCE' | 'OPERATOR';
}

export interface AcademyRegimeCompatibility {
  regime: AcademyRegime;
  state: AcademyRegimeCompatibilityState;
  evidenceIds: string[];
  detail: string;
}

export interface AcademyPatternClassification {
  pattern: 'TREND_FOLLOWING' | 'MEAN_REVERSION' | 'BREAKOUT' | 'CARRY' | 'LIQUIDITY' | 'EVENT_DRIVEN' | 'UNCLASSIFIED';
  basis: 'RULE_BASED_METADATA';
  matchedTerms: string[];
}

export interface AcademyEvolutionSuggestion {
  suggestionId: string;
  kind: 'COLLECT_EVIDENCE' | 'ROBUSTNESS_TEST' | 'REGIME_TEST' | 'COST_TEST' | 'PARAMETER_RESEARCH';
  statement: string;
  evidenceIds: string[];
  autoApply: false;
  /**
   * Provenance of the suggestion, mirroring `AcademyStrategyPattern.basis`.
   * `RULE_BASED_CHECKLIST` means: emitted by a fixed conditional checklist over
   * the record's own evaluation state. It is NOT the output of a parameter
   * search, an optimizer, or an evolutionary loop, and must never be presented
   * as one. See src/features/academy/ml/evolutionEngine.ts.
   */
  basis: 'RULE_BASED_CHECKLIST';
}

export interface DiscoveredAcademyStrategy {
  recordId: string;
  strategyId: string;
  version: number;
  name: string;
  sourceKind: AcademySourceKind;
  source: string;
  metadata: Record<string, string | number | boolean | string[] | null>;
  logic: AcademyStrategyLogic;
  indicators: { state: AcademyEvidenceState; values: string[]; detail: string };
  parameters: StrategyDefinition['parameters'];
  marketConditions: string[];
  sourceReferences: string[];
  knownFailureModes: string[];
  categories: string[];
  evidenceHistory: AcademyEvidenceMetadata[];
  latestSnapshot: StrategyDefinition['latestSnapshot'] | null;
  performanceEvidenceTrusted: boolean;
  registryStatus: StrategyDefinition['status'] | 'external';
}

export interface AcademyStrategyRecord extends DiscoveredAcademyStrategy {
  lifecycle: AcademyLifecycleState;
  lifecycleHistory: AcademyLifecycleEvent[];
  validationHistory: AcademyEvaluationResult[];
  latestEvaluation: AcademyEvaluationResult;
  regimeCompatibility: AcademyRegimeCompatibility[];
  riskProfile: AcademyMetric<'LOW' | 'MODERATE' | 'HIGH'>;
  embedding: number[];
  similarityClusterId: string | null;
  patterns: AcademyPatternClassification[];
  evolutionSuggestions: AcademyEvolutionSuggestion[];
  knowledgeRank: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AcademyEngineStatus {
  engineVersion: typeof ACADEMY_ENGINE_VERSION;
  enabled: boolean;
  phase: AcademyEnginePhase;
  strategiesAnalyzed: number;
  newDiscoveries: number;
  totalStrategies: number;
  cycleCount: number;
  lastUpdateAt: number | null;
  lastCycleId: string | null;
  lastError: string | null;
  intervalMs: number;
  nextRunAt?: number | null;
  safety: {
    researchOnly: true;
    executionAuthorized: false;
    autonomousLiveExecutionEnabled: false;
    automaticPromotionEnabled: false;
  };
}

export interface AcademyCycleReport {
  cycleId: string;
  startedAt: number;
  completedAt: number;
  discovered: number;
  newDiscoveries: number;
  evaluated: number;
  stored: number;
  issues: string[];
}

export interface AcademyDatabase {
  schemaVersion: typeof ACADEMY_SCHEMA_VERSION;
  revision: number;
  records: Record<string, AcademyStrategyRecord>;
  cycles: AcademyCycleReport[];
  engine: AcademyEngineStatus;
  updatedAt: number;
}

export type AcademyConsumer = 'SCANNER' | 'TRADE_PLAN' | 'RISK_GOVERNOR';
export type AcademyConsumerState = 'VALIDATED_SHADOW' | 'BLOCKED' | 'NOT_EVALUATED' | 'INSUFFICIENT_DATA';

export interface AcademyConsumerIntelligence {
  strategyId: string;
  strategyVersion: number;
  recordId: string;
  consumer: AcademyConsumer;
  lifecycle: AcademyLifecycleState;
  state: AcademyConsumerState;
  regime: AcademyRegime | null;
  regimeCompatibility: AcademyRegimeCompatibilityState | null;
  confidenceScore: AcademyMetric;
  evidenceIds: string[];
  blockers: string[];
  generatedAt: number;
  authority: 'ADVISORY_AND_SAFETY_GATE_ONLY';
  executionAuthorized: false;
}

export type AcademyResolutionState =
  | 'RESOLVED'
  | 'ACADEMY_DISABLED'
  | 'STRATEGY_NOT_FOUND'
  | 'VERSION_MISMATCH'
  | 'NOT_EVALUATED'
  | 'INSUFFICIENT_DATA'
  | 'STORE_UNAVAILABLE'
  | 'NOT_APPLICABLE';

export interface AcademyIntelligenceResolution {
  status: AcademyResolutionState;
  strategyId: string;
  strategyVersion: number;
  recordId: string;
  intelligence: AcademyConsumerIntelligence | null;
  detail: string;
}

