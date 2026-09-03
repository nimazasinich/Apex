/**
 * strategyLabService.ts — strategy lab stages 2–7 (Task 1).
 *
 * STAGE MAP (stage 1 is deliberately absent)
 *   Stage 1 — external internet discovery: NOT IMPLEMENTED HERE. No outbound
 *     fetch, no provider, no crawler. Candidates enter the lab only through the
 *     existing `POST /api/academy/strategies/import` request path. Wiring any
 *     external network discovery is an explicit human-sign-off item and must not
 *     be added to this file without it.
 *   Stage 2 — parse/normalize: `recordImportedCandidate` reuses the route's own
 *     `parseImportedStrategy` output verbatim.
 *   Stage 3 — store: rows land in real SQL tables (see strategyLabStore.ts).
 *   Stage 4 — test: `testCandidate` runs the SAME `AutomatedEvaluationPipeline`
 *     instance the Academy engine uses for house strategies. There is no
 *     lab-local scoring, no second evaluation implementation, and no bypass of
 *     the sealed-holdout blockers that pipeline emits.
 *   Stage 5 — improve: `improveCandidate` reuses `buildEvolutionSuggestions`,
 *     which is a rule-based checklist and is labelled as such.
 *   Stage 6 — compare: `compareCandidates` reads recorded metrics only.
 *   Stage 7 — fuse: `fuseCandidates` writes a `COMBINED` candidate with its
 *     parents recorded, queued to re-enter stage 4.
 *
 * SAFETY: nothing here promotes a strategy, authorizes execution, or writes to
 * the live trading path. A candidate reaching `VALIDATED` in this lab is a
 * research status, not a promotion.
 */
import { createHash } from 'node:crypto';
import type { AutomatedEvaluationPipeline } from '../evaluation/evaluationPipeline.ts';
import { buildEvolutionSuggestions, EVOLUTION_SUGGESTION_BASIS, EVOLUTION_SUGGESTION_METHOD_NOTE } from '../ml/evolutionEngine.ts';
import type {
  AcademyEvaluationResult,
  AcademyEvidenceMetadata,
  AcademyEvolutionSuggestion,
  AcademyStrategyRecord,
  DiscoveredAcademyStrategy,
} from '../types.ts';
import { StrategyLabStore } from './strategyLabStore.ts';
import {
  STRATEGY_LAB_AUTHORITY,
  type StrategyCandidateRow,
  type StrategyComparisonRow,
  type StrategyEvaluationRunRow,
  type StrategyFusionMethod,
  type StrategyFusionRow,
} from './strategyLabTypes.ts';

/** Comparison is bounded so a request cannot ask for an unbounded join. */
export const STRATEGY_LAB_MAX_COMPARED = 4;
/** Fusion is bounded for the same reason. */
export const STRATEGY_LAB_MAX_FUSION_PARENTS = 4;

/** Result of stage 2 (`recordImportedCandidate`). */
export interface RecordCandidateResult {
  candidate: StrategyCandidateRow;
  /** false when this exact content was already recorded, so nothing was inserted. */
  created: boolean;
}

/** Result of stage 4 (`testCandidate`). */
export interface TestCandidateResult {
  candidate: StrategyCandidateRow;
  run: StrategyEvaluationRunRow;
  record: AcademyStrategyRecord;
}

/** Result of stage 5 (`improveCandidate`). */
export interface ImproveCandidateResult {
  candidate: StrategyCandidateRow;
  run: StrategyEvaluationRunRow;
  suggestions: AcademyEvolutionSuggestion[];
  basis: typeof EVOLUTION_SUGGESTION_BASIS;
  methodNote: typeof EVOLUTION_SUGGESTION_METHOD_NOTE;
}

/** One row of the stage 6 comparison table. Absent numbers stay absent. */
export interface StrategyComparisonEntry {
  candidateId: string;
  sourceType: StrategyCandidateRow['sourceType'];
  status: StrategyCandidateRow['status'];
  recordId: string | null;
  name: string | null;
  parseConfidence: number;
  evaluationState: string;
  datasetFingerprint: string | null;
  runId: string | null;
  holdoutProtocolStatus: string;
  confidenceScore: { state: string; value: number | null };
  rankScore: { state: string; value: number | null };
  winRatePct: { state: string; value: number | null };
  profitFactor: { state: string; value: number | null };
  maxDrawdownPct: { state: string; value: number | null };
  blockers: string[];
  detail: string;
}

/** Result of stage 6 (`compareCandidates`). */
export interface CompareCandidatesResult {
  comparison: StrategyComparisonRow;
  entries: StrategyComparisonEntry[];
}

/** Result of stage 7 (`fuseCandidates`). */
export interface FuseCandidatesResult {
  fusion: StrategyFusionRow;
  candidate: StrategyCandidateRow;
  weights: Array<{ candidateId: string; weight: number; basis: string }>;
}

/** Metrics payload persisted in `strategy_evaluation_runs.metrics_json`. */
interface PersistedRunMetrics {
  kind: 'EVALUATION' | 'IMPROVEMENT_SUGGESTIONS';
  recordId: string;
  evaluation?: AcademyEvaluationResult;
  suggestions?: AcademyEvolutionSuggestion[];
  basis?: string;
  methodNote?: string;
}

/** Deterministic JSON with sorted keys, so a content hash is reproducible. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Hash of the candidate's *content*, deliberately excluding ingest timestamps.
 * `parseImportedStrategy` stamps `ingestedAt: now` on every evidence entry, so
 * hashing the whole object would make the same submitted strategy hash
 * differently on every request and defeat duplicate detection. Only fields the
 * submitter actually supplied are hashed.
 */
function rawContentHashOf(strategy: DiscoveredAcademyStrategy): string {
  return sha256(canonicalJson({
    recordId: strategy.recordId,
    name: strategy.name,
    sourceKind: strategy.sourceKind,
    source: strategy.source,
    logic: strategy.logic,
    indicators: strategy.indicators.values,
    marketConditions: strategy.marketConditions,
    sourceReferences: strategy.sourceReferences,
    knownFailureModes: strategy.knownFailureModes,
    categories: strategy.categories,
    evidence: strategy.evidenceHistory.map((entry) => ({
      kind: entry.kind,
      source: entry.source,
      fingerprint: entry.fingerprint,
      datasetFingerprint: entry.datasetFingerprint,
      runId: entry.runId,
    })),
  }));
}

/**
 * `parse_confidence` is a COMPLETENESS RATIO, not a model confidence and not a
 * probability that the strategy works. It is the fraction of the eight rule
 * buckets below that the submission actually populated. It is fully
 * deterministic and carries no predictive meaning whatsoever; nothing downstream
 * may treat it as evidence of performance.
 */
function parseCompletenessConfidence(strategy: DiscoveredAcademyStrategy): number {
  const signals: boolean[] = [
    strategy.logic.summary.trim().length > 0,
    strategy.logic.setupRules.length > 0,
    strategy.logic.triggerRules.length > 0,
    strategy.logic.riskRules.length > 0,
    strategy.logic.exitRules.length > 0,
    strategy.logic.noTradeRules.length > 0,
    strategy.indicators.values.length > 0,
    strategy.marketConditions.length > 0,
  ];
  const populated = signals.filter(Boolean).length;
  return Math.round((populated / signals.length) * 10_000) / 10_000;
}

/** Rehydrates the stored candidate into the exact shape the pipeline consumes. */
function parseStoredStrategy(candidate: StrategyCandidateRow): DiscoveredAcademyStrategy {
  const parsed: unknown = JSON.parse(candidate.parsedRulesJson);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`strategy_lab_candidate_rules_invalid:${candidate.id}`);
  }
  const strategy = parsed as DiscoveredAcademyStrategy;
  if (typeof strategy.recordId !== 'string' || !strategy.recordId.trim()) {
    throw new Error(`strategy_lab_candidate_rules_invalid:${candidate.id}`);
  }
  if (!Array.isArray(strategy.evidenceHistory) || strategy.evidenceHistory.length === 0) {
    throw new Error(`strategy_lab_candidate_rules_invalid:${candidate.id}`);
  }
  return strategy;
}

function firstUrl(references: string[]): string | null {
  return references.find((entry) => /^https?:\/\//i.test(entry)) ?? null;
}

/**
 * Stages 2 and 4–7 of the strategy lab.
 *
 * The pipeline is INJECTED, not constructed here, so that stage 4 evaluates a
 * candidate through the very same `AutomatedEvaluationPipeline` instance the
 * Academy engine uses for house strategies. There is no lab-local scoring path
 * to drift away from it.
 */
export class StrategyLabService {
  readonly authority = STRATEGY_LAB_AUTHORITY;
  /** Research lab. It never authorizes an order, and never promotes a strategy. */
  readonly executionAuthorized = false as const;

  constructor(
    private readonly store: StrategyLabStore,
    private readonly pipeline: AutomatedEvaluationPipeline,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }

  get databasePath(): string {
    return this.store.filePath;
  }

  /**
   * STAGE 2 — record a parsed candidate.
   *
   * The strategy passed in is the verbatim output of the import route's own
   * `parseImportedStrategy`, so the lab does not re-parse or re-interpret the
   * submission; it records exactly what the route accepted.
   *
   * Re-submitting identical content is idempotent: the candidate id is derived
   * from the record id plus the content hash, so a repeat submission returns the
   * existing row instead of creating a duplicate candidate.
   */
  recordImportedCandidate(
    strategy: DiscoveredAcademyStrategy,
    options: { sourceType?: 'DISCOVERED' | 'HOUSE'; sourceUrl?: string | null; sourceCitation?: string | null } = {},
  ): RecordCandidateResult {
    const rawContentHash = rawContentHashOf(strategy);
    const id = `cand-${sha256(`${strategy.recordId}|${rawContentHash}`).slice(0, 32)}`;
    const existing = this.store.getCandidate(id);
    if (existing) return { candidate: existing, created: false };

    const at = this.timestamp();
    const candidate = this.store.insertCandidate({
      id,
      sourceType: options.sourceType ?? 'DISCOVERED',
      sourceUrl: options.sourceUrl ?? firstUrl(strategy.sourceReferences),
      sourceCitation: options.sourceCitation ?? (strategy.sourceReferences[0] ?? strategy.source),
      discoveredAtUtc: at,
      rawContentHash,
      parsedRulesJson: JSON.stringify(strategy),
      parseConfidence: parseCompletenessConfidence(strategy),
      parentCandidateIds: [],
      status: 'QUEUED_FOR_TEST',
      createdAtUtc: at,
      updatedAtUtc: at,
    });
    return { candidate, created: true };
  }

  listCandidates(): StrategyCandidateRow[] {
    return this.store.listCandidates();
  }

  getCandidate(id: string): StrategyCandidateRow | null {
    return this.store.getCandidate(id);
  }

  evaluationRuns(candidateId: string): StrategyEvaluationRunRow[] {
    return this.store.listEvaluationRuns(candidateId);
  }

  /**
   * STAGE 4 — test a candidate through the house evaluation pipeline.
   *
   * No shortcut, no lab-local scorer, and no suppression of the pipeline's
   * blockers: whatever `AutomatedEvaluationPipeline` says about missing
   * provenance, non-live data, or a non-PASSED sealed holdout is recorded as-is.
   * An imported candidate carries UNVERIFIED evidence, so it is expected and
   * correct that its evaluation comes back blocked rather than validated.
   */
  testCandidate(candidateId: string): TestCandidateResult {
    const stored = this.store.getCandidateOrThrow(candidateId);
    const strategy = parseStoredStrategy(stored);

    this.store.updateCandidateStatus(stored.id, 'TESTING', this.timestamp());

    const record = this.pipeline.evaluate(strategy, undefined, this.now());

    // Provenance is read from the strategy's own bound snapshot when it is
    // trusted, else from its evidence, else recorded as absent. It is never
    // defaulted to a fabricated fingerprint or a zero.
    const snapshot = strategy.performanceEvidenceTrusted ? strategy.latestSnapshot : null;
    const evidenceWithDataset = strategy.evidenceHistory.find((entry) => entry.datasetFingerprint);
    const evidenceWithRun = strategy.evidenceHistory.find((entry) => entry.runId);
    const datasetFingerprint = (typeof snapshot?.datasetFingerprint === 'string' ? snapshot.datasetFingerprint : null)
      ?? evidenceWithDataset?.datasetFingerprint
      ?? null;
    const runId = (typeof snapshot?.runId === 'string' ? snapshot.runId : null)
      ?? evidenceWithRun?.runId
      ?? null;
    const holdoutProtocolStatus = typeof snapshot?.holdoutProtocolStatus === 'string'
      ? snapshot.holdoutProtocolStatus
      : 'NOT_RECORDED';

    const metrics: PersistedRunMetrics = { kind: 'EVALUATION', recordId: strategy.recordId, evaluation: record.latestEvaluation };
    const run = this.store.insertEvaluationRun({
      id: `${stored.id}#run-${this.store.listEvaluationRuns(stored.id).length + 1}`,
      candidateId: stored.id,
      datasetFingerprint,
      runId,
      holdoutProtocolStatus,
      metricsJson: JSON.stringify(metrics),
      createdAtUtc: this.timestamp(),
    });

    const candidate = this.store.updateCandidateStatus(stored.id, 'TESTED', this.timestamp());
    return { candidate, run, record };
  }

  /**
   * STAGE 5 — improvement cycle.
   *
   * Reuses `buildEvolutionSuggestions`, which is a fixed rule-based checklist
   * over the record's own evaluation state — NOT a parameter search, an
   * optimizer, or an evolutionary loop. The basis and method note are carried
   * through verbatim so nothing downstream can present it as a search.
   *
   * The candidate is deliberately left in `IMPROVING`: an improvement cycle is
   * open until someone acts on the suggestions and re-tests, which moves it back
   * through `TESTING` → `TESTED`.
   */
  improveCandidate(candidateId: string): ImproveCandidateResult {
    const stored = this.store.getCandidateOrThrow(candidateId);
    const strategy = parseStoredStrategy(stored);
    const record = this.pipeline.evaluate(strategy, undefined, this.now());
    const suggestions = buildEvolutionSuggestions(record);

    const metrics: PersistedRunMetrics = {
      kind: 'IMPROVEMENT_SUGGESTIONS',
      recordId: strategy.recordId,
      suggestions,
      basis: EVOLUTION_SUGGESTION_BASIS,
      methodNote: EVOLUTION_SUGGESTION_METHOD_NOTE,
    };
    const run = this.store.insertEvaluationRun({
      id: `${stored.id}#run-${this.store.listEvaluationRuns(stored.id).length + 1}`,
      candidateId: stored.id,
      datasetFingerprint: null,
      runId: null,
      // Explicitly labelled so this row can never be mistaken for an evaluation
      // that passed a sealed holdout. Stage 6 filters on the metrics `kind`.
      holdoutProtocolStatus: 'NOT_APPLICABLE_IMPROVEMENT_CYCLE',
      metricsJson: JSON.stringify(metrics),
      createdAtUtc: this.timestamp(),
    });

    const candidate = this.store.updateCandidateStatus(stored.id, 'IMPROVING', this.timestamp());
    return {
      candidate,
      run,
      suggestions,
      basis: EVOLUTION_SUGGESTION_BASIS,
      methodNote: EVOLUTION_SUGGESTION_METHOD_NOTE,
    };
  }

  /** Latest run that is an actual evaluation, ignoring improvement-cycle rows. */
  private latestEvaluation(candidateId: string): { run: StrategyEvaluationRunRow; metrics: PersistedRunMetrics } | null {
    const runs = this.store.listEvaluationRuns(candidateId);
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      const run = runs[index];
      if (!run) continue;
      const parsed: unknown = JSON.parse(run.metricsJson);
      if (!parsed || typeof parsed !== 'object') continue;
      const metrics = parsed as PersistedRunMetrics;
      if (metrics.kind === 'EVALUATION' && metrics.evaluation) return { run, metrics };
    }
    return null;
  }

  /**
   * STAGE 6 — side-by-side comparison of tested candidates.
   *
   * Reads only recorded metrics. A candidate that has not been through stage 4
   * is reported as `NOT_TESTED` with absent values; it is never filled in with
   * zeros, and it is never quietly dropped from the table.
   */
  compareCandidates(candidateIds: string[]): CompareCandidatesResult {
    const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length < 2) throw new Error('strategy_lab_compare_requires_two_candidates');
    if (ids.length > STRATEGY_LAB_MAX_COMPARED) {
      throw new Error(`strategy_lab_compare_limit_invalid:${STRATEGY_LAB_MAX_COMPARED}`);
    }

    const metricView = (metric: { state: string; value: unknown } | undefined): { state: string; value: number | null } => ({
      state: metric?.state ?? 'NOT_EVALUATED',
      value: typeof metric?.value === 'number' && Number.isFinite(metric.value) ? metric.value : null,
    });

    const entries: StrategyComparisonEntry[] = ids.map((id) => {
      const candidate = this.store.getCandidateOrThrow(id);
      const strategy = parseStoredStrategy(candidate);
      const latest = this.latestEvaluation(id);
      if (!latest?.metrics.evaluation) {
        const absent = { state: 'NOT_EVALUATED', value: null };
        return {
          candidateId: id,
          sourceType: candidate.sourceType,
          status: candidate.status,
          recordId: strategy.recordId,
          name: strategy.name,
          parseConfidence: candidate.parseConfidence,
          evaluationState: 'NOT_TESTED',
          datasetFingerprint: null,
          runId: null,
          holdoutProtocolStatus: 'NOT_RECORDED',
          confidenceScore: absent,
          rankScore: absent,
          winRatePct: absent,
          profitFactor: absent,
          maxDrawdownPct: absent,
          blockers: ['No evaluation run is recorded for this candidate.'],
          detail: 'Candidate has not completed stage 4 (test). No metrics exist to compare.',
        };
      }
      const evaluation = latest.metrics.evaluation;
      return {
        candidateId: id,
        sourceType: candidate.sourceType,
        status: candidate.status,
        recordId: strategy.recordId,
        name: strategy.name,
        parseConfidence: candidate.parseConfidence,
        evaluationState: evaluation.overall,
        datasetFingerprint: latest.run.datasetFingerprint,
        runId: latest.run.runId,
        holdoutProtocolStatus: latest.run.holdoutProtocolStatus,
        confidenceScore: metricView(evaluation.confidenceScore),
        rankScore: metricView(evaluation.rankScore),
        winRatePct: metricView(evaluation.metrics?.winRatePct),
        profitFactor: metricView(evaluation.metrics?.profitFactor),
        maxDrawdownPct: metricView(evaluation.metrics?.maxDrawdownPct),
        blockers: Array.isArray(evaluation.blockers) ? evaluation.blockers : [],
        detail: `Recorded by evaluation run ${latest.run.id} at ${latest.run.createdAtUtc}.`,
      };
    });

    const at = this.timestamp();
    const comparison = this.store.insertComparison({
      id: `cmp-${sha256(ids.join('|')).slice(0, 24)}-${this.store.listComparisons().length + 1}`,
      candidateIds: ids,
      metricsJson: JSON.stringify({ entries, comparedAtUtc: at }),
      createdAtUtc: at,
    });
    return { comparison, entries };
  }

  /**
   * STAGE 7 — fuse two or more tested candidates into a `COMBINED` candidate.
   *
   * WHAT FUSION IS HERE: a mechanical composition of the parents' recorded rule
   * text, annotated with the weight or filter order that produced it. It is NOT
   * a trained model, NOT an optimizer output, and it carries NO performance
   * claim of its own.
   *
   * The parents' evidence is deliberately NOT copied onto the child. Reusing a
   * parent's backtest evidence would amount to relabelling one strategy's
   * results as another's. The child gets exactly one synthesized DISCOVERY
   * entry, marked UNVERIFIED, and is queued to re-enter stage 4 so it earns its
   * own evaluation.
   */
  fuseCandidates(parentCandidateIds: string[], method: StrategyFusionMethod): FuseCandidatesResult {
    const ids = [...new Set(parentCandidateIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length < 2) throw new Error('strategy_lab_fusion_requires_two_parents');
    if (ids.length > STRATEGY_LAB_MAX_FUSION_PARENTS) {
      throw new Error(`strategy_lab_fusion_limit_invalid:${STRATEGY_LAB_MAX_FUSION_PARENTS}`);
    }

    const parents = ids.map((id) => {
      const candidate = this.store.getCandidateOrThrow(id);
      const strategy = parseStoredStrategy(candidate);
      const latest = this.latestEvaluation(id);
      // Fusing an untested candidate would produce weights with no recorded
      // basis at all, so stage 4 is a precondition rather than a suggestion.
      if (!latest?.metrics.evaluation) throw new Error(`strategy_lab_fusion_parent_untested:${id}`);
      return { candidate, strategy, evaluation: latest.metrics.evaluation };
    });

    const confidenceValues = parents.map((parent) => {
      const score = parent.evaluation.confidenceScore;
      return score.state === 'EVALUATED' && typeof score.value === 'number' && Number.isFinite(score.value) && score.value > 0
        ? score.value
        : null;
    });
    const total = confidenceValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const useRecorded = confidenceValues.every((value) => value !== null) && total > 0;
    const weights = parents.map((parent, index) => ({
      candidateId: parent.candidate.id,
      weight: useRecorded
        ? Math.round(((confidenceValues[index] ?? 0) / total) * 10_000) / 10_000
        : Math.round((1 / parents.length) * 10_000) / 10_000,
      // The basis is recorded per weight so a reader can tell a measured weight
      // from a fallback one without guessing.
      basis: useRecorded ? 'RECORDED_CONFIDENCE_SCORE' : 'EQUAL_WEIGHT_NO_RECORDED_CONFIDENCE',
    }));

    const label = (index: number): string => {
      const parent = parents[index];
      const recordId = parent ? parent.strategy.recordId : `parent-${index + 1}`;
      return method === 'WEIGHTED_ENSEMBLE'
        ? `[weight ${(weights[index]?.weight ?? 0).toFixed(4)} | ${recordId}]`
        : `[filter ${index + 1}/${parents.length} | ${recordId}]`;
    };
    const merge = (pick: (strategy: DiscoveredAcademyStrategy) => string[]): string[] => {
      const lines = parents.flatMap((parent, index) => pick(parent.strategy).map((rule) => `${label(index)} ${rule}`));
      return [...new Set(lines)].slice(0, 100);
    };
    const union = (pick: (strategy: DiscoveredAcademyStrategy) => string[]): string[] =>
      [...new Set(parents.flatMap((parent) => pick(parent.strategy)))].slice(0, 100);

    const fusionSpec = {
      method,
      parents: parents.map((parent, index) => ({
        candidateId: parent.candidate.id,
        recordId: parent.strategy.recordId,
        rawContentHash: parent.candidate.rawContentHash,
        weight: weights[index]?.weight ?? null,
      })),
    };
    const fusionHash = sha256(canonicalJson(fusionSpec));
    const sequence = this.store.listFusions().length + 1;
    const strategyId = `lab-fused-${fusionHash.slice(0, 16)}-${sequence}`;
    const at = this.timestamp();

    const evidence: AcademyEvidenceMetadata = {
      evidenceId: `academy-lab-fusion-${fusionHash.slice(0, 24)}`,
      kind: 'DISCOVERY',
      source: 'STRATEGY_LAB_FUSION',
      sourceKind: 'RESEARCH_MODULE',
      verification: 'UNVERIFIED',
      observedAt: null,
      ingestedAt: this.now(),
      fingerprint: fusionHash,
      dataState: 'not_applicable',
      datasetFingerprint: null,
      runId: null,
      notes: [
        `Fusion method: ${method}.`,
        `Parent candidates: ${ids.join(', ')}.`,
        `Weights: ${weights.map((entry) => `${entry.candidateId}=${entry.weight.toFixed(4)}`).join(', ')} (${weights[0]?.basis ?? 'UNKNOWN'}).`,
        'Composed from parent rule text only. No backtest, no holdout, and no performance claim is attached to this fusion.',
        'Parent evidence was intentionally not copied onto this candidate.',
      ],
    };

    const fusedStrategy: DiscoveredAcademyStrategy = {
      recordId: `${strategyId}@1`,
      strategyId,
      version: 1,
      name: `Fused ${method === 'WEIGHTED_ENSEMBLE' ? 'ensemble' : 'sequential filter'} of ${parents.length} candidates`.slice(0, 200),
      sourceKind: 'RESEARCH_MODULE',
      source: 'STRATEGY_LAB_FUSION',
      metadata: {
        fusionMethod: method,
        fusionHash,
        parentCandidateIds: ids,
        weightBasis: weights[0]?.basis ?? 'UNKNOWN',
        executionAuthorized: false,
      },
      logic: {
        summary: method === 'WEIGHTED_ENSEMBLE'
          ? `Weighted ensemble of ${parents.length} candidates (${weights.map((entry) => `${entry.candidateId}=${entry.weight.toFixed(4)}`).join(', ')}). Each parent's rules are retained and annotated with its weight. Composition is mechanical rule-text merging, not a trained model.`
          : `Sequential filter chain over ${parents.length} candidates in the order ${ids.join(' -> ')}. A setup must satisfy every stage in order. Composition is mechanical rule-text merging, not a trained model.`,
        setupRules: merge((strategy) => strategy.logic.setupRules),
        triggerRules: merge((strategy) => strategy.logic.triggerRules),
        riskRules: merge((strategy) => strategy.logic.riskRules),
        exitRules: merge((strategy) => strategy.logic.exitRules),
        // Every parent's no-trade rule is inherited by both methods: dropping a
        // parent's veto condition would make the child less safe than its parents.
        noTradeRules: merge((strategy) => strategy.logic.noTradeRules),
      },
      indicators: {
        state: 'INSUFFICIENT_DATA',
        values: union((strategy) => strategy.indicators.values),
        detail: 'Indicators are the union of the parent candidates and remain unverified until this fused candidate records its own evaluation evidence.',
      },
      parameters: [],
      // A sequential filter must satisfy every stage, so only conditions common
      // to all parents survive; an ensemble is permissive, so it takes the union.
      marketConditions: method === 'SEQUENTIAL_FILTER'
        ? (parents[0]?.strategy.marketConditions ?? []).filter((condition) =>
            parents.every((parent) => parent.strategy.marketConditions.includes(condition)))
        : union((strategy) => strategy.marketConditions),
      sourceReferences: [
        ...new Set(parents.flatMap((parent) => [
          `lab-candidate:${parent.candidate.id}`,
          ...(parent.candidate.sourceUrl ? [parent.candidate.sourceUrl] : []),
          ...(parent.candidate.sourceCitation ? [parent.candidate.sourceCitation] : []),
        ])),
      ].slice(0, 100),
      knownFailureModes: union((strategy) => strategy.knownFailureModes),
      categories: union((strategy) => strategy.categories),
      evidenceHistory: [evidence],
      latestSnapshot: null,
      performanceEvidenceTrusted: false,
      registryStatus: 'external',
    };

    // The candidate row must exist before the fusion row, because
    // strategy_fusions.resulting_candidate_id is a real foreign key.
    const candidate = this.store.insertCandidate({
      id: `cand-fused-${fusionHash.slice(0, 24)}-${sequence}`,
      sourceType: 'COMBINED',
      sourceUrl: null,
      sourceCitation: `Fusion of ${ids.join(' + ')} via ${method}`,
      discoveredAtUtc: at,
      rawContentHash: rawContentHashOf(fusedStrategy),
      parsedRulesJson: JSON.stringify(fusedStrategy),
      parseConfidence: parseCompletenessConfidence(fusedStrategy),
      parentCandidateIds: ids,
      // Re-enters the Test stage: a fused candidate has no evaluation of its own.
      status: 'QUEUED_FOR_TEST',
      createdAtUtc: at,
      updatedAtUtc: at,
    });

    const fusion = this.store.insertFusion({
      id: `fusion-${fusionHash.slice(0, 24)}-${sequence}`,
      parentCandidateIds: ids,
      fusionMethod: method,
      resultingCandidateId: candidate.id,
      createdAtUtc: at,
    });

    return { fusion, candidate, weights };
  }

  listFusions(): StrategyFusionRow[] {
    return this.store.listFusions();
  }

  listComparisons(): StrategyComparisonRow[] {
    return this.store.listComparisons();
  }

  /** Table list + row dump, used by the schema proof and by QA inspection. */
  dumpTable(table: string): Array<Record<string, unknown>> {
    return this.store.dump(table);
  }

  tableNames(): string[] {
    return this.store.tableNames();
  }

  close(): void {
    this.store.close();
  }
}
