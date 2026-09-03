import { createHash } from 'node:crypto';
import { advanceAcademyLifecycle, targetLifecycleForEvaluation } from './lifecycle.ts';
import { buildRegimeCompatibility } from '../knowledge/regimeIntelligence.ts';
import { buildStrategyEmbedding } from '../ml/strategyEmbedding.ts';
import { classifyStrategyPatterns } from '../ml/patternClassifier.ts';
import type {
  AcademyEvaluationResult,
  AcademyEvaluationMetrics,
  AcademyEvaluationStage,
  AcademyEvidenceMetadata,
  AcademyEvidenceState,
  AcademyMetric,
  AcademyStrategyRecord,
  DiscoveredAcademyStrategy,
} from '../types.ts';

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metric<T>(state: AcademyEvidenceState, value: T | null, evidenceIds: string[], detail: string): AcademyMetric<T> {
  return { state, value, evidenceIds, detail };
}

function stage(state: AcademyEvidenceState, passed: boolean | null, evidenceIds: string[], detail: string): AcademyEvaluationStage {
  return { state, passed, evidenceIds, detail };
}

function evidenceFingerprint(evidence: AcademyEvidenceMetadata[]): string {
  return createHash('sha256').update(evidence.map((item) => item.fingerprint).sort().join('|')).digest('hex');
}

function mergeEvidence(existing: AcademyEvidenceMetadata[] | undefined, incoming: AcademyEvidenceMetadata[]): AcademyEvidenceMetadata[] {
  const byId = new Map((existing ?? []).map((item) => [item.evidenceId, item]));
  for (const item of incoming) if (!byId.has(item.evidenceId)) byId.set(item.evidenceId, item);
  return [...byId.values()].sort((left, right) => (left.observedAt ?? left.ingestedAt) - (right.observedAt ?? right.ingestedAt) || left.evidenceId.localeCompare(right.evidenceId));
}

function buildEvaluation(
  strategy: DiscoveredAcademyStrategy,
  evidence: AcademyEvidenceMetadata[],
  now: number,
): AcademyEvaluationResult {
  const trustedEvidence = evidence.filter((item) => item.verification !== 'UNVERIFIED' && item.kind !== 'DISCOVERY');
  const evidenceIds = trustedEvidence.map((item) => item.evidenceId);
  const snapshot = strategy.performanceEvidenceTrusted ? strategy.latestSnapshot : null;
  const noEvidenceDetail = strategy.performanceEvidenceTrusted
    ? 'No recorded backtest or validation snapshot is bound to this strategy.'
    : 'Performance claims from this source are unverified and are not evaluated by Academy.';

  const winRate = finite(snapshot?.winRatePct);
  const profitFactor = finite(snapshot?.profitFactor);
  const drawdown = finite(snapshot?.maxDrawdownPct);
  const metrics: AcademyEvaluationMetrics = {
    winRatePct: winRate == null ? metric<number>('NOT_EVALUATED', null, evidenceIds, noEvidenceDetail) : metric('EVALUATED', winRate, evidenceIds, 'Recorded win rate from the bound strategy evidence.'),
    profitFactor: profitFactor == null ? metric<number>('NOT_EVALUATED', null, evidenceIds, 'No finite profit factor was recorded; Academy does not replace it with zero.') : metric('EVALUATED', profitFactor, evidenceIds, 'Recorded profit factor from the bound strategy evidence.'),
    maxDrawdownPct: drawdown == null ? metric<number>('NOT_EVALUATED', null, evidenceIds, noEvidenceDetail) : metric('EVALUATED', drawdown, evidenceIds, 'Recorded maximum drawdown from the bound strategy evidence.'),
    riskReward: metric<number>('NOT_EVALUATED', null, evidenceIds, 'The strategy evidence contract contains no measured risk/reward metric; Academy does not derive a proxy.'),
    stability: snapshot?.gates?.stability === undefined
      ? metric<boolean>('NOT_EVALUATED', null, evidenceIds, 'No stability gate result was recorded.')
      : metric('EVALUATED', snapshot.gates.stability, evidenceIds, 'Recorded strategy-validation stability gate.'),
    marketRegimePerformance: !snapshot?.regimesMeasured?.length
      ? metric<{ measured: string[]; profitable: string[] }>('INSUFFICIENT_DATA', null, evidenceIds, snapshot?.regimeReason ?? 'No explicit regime slices were measured.')
      : metric('EVALUATED', { measured: [...snapshot.regimesMeasured], profitable: [...(snapshot.regimesProfitable ?? [])] }, evidenceIds, 'Recorded regime slices and profitable subset.'),
    dataQuality: !snapshot
      ? metric<'LIVE' | 'DEGRADED' | 'UNAVAILABLE'>('NOT_EVALUATED', null, evidenceIds, noEvidenceDetail)
      : snapshot.dataState === 'live'
        ? metric('EVALUATED', 'LIVE' as const, evidenceIds, 'The bound validation snapshot records live-origin data.')
        : snapshot.dataState === 'unavailable'
          ? metric('UNAVAILABLE', 'UNAVAILABLE' as const, evidenceIds, 'The bound validation snapshot records unavailable data.')
          : metric('INSUFFICIENT_DATA', 'DEGRADED' as const, evidenceIds, 'The bound validation snapshot is not live-origin complete.'),
  };

  const backtestMeasured = Boolean(snapshot && winRate != null && profitFactor != null && drawdown != null && trustedEvidence.length);
  const backtest = backtestMeasured
    ? stage('EVALUATED', true, evidenceIds, 'Backtest metrics and provenance are recorded.')
    : snapshot
      ? stage('INSUFFICIENT_DATA', null, evidenceIds, 'A snapshot exists but required backtest metrics or trusted provenance are incomplete.')
      : stage('NOT_EVALUATED', null, evidenceIds, noEvidenceDetail);

  const riskGates = snapshot?.gates ? [snapshot.gates.drawdown, snapshot.gates.costResilience] : null;
  const risk = !riskGates
    ? stage('NOT_EVALUATED', null, evidenceIds, 'Drawdown and cost-resilience gates were not recorded.')
    : stage('EVALUATED', riskGates.every(Boolean), evidenceIds, riskGates.every(Boolean) ? 'Recorded drawdown and cost-resilience gates passed.' : 'A recorded drawdown or cost-resilience gate failed.');

  const robustnessGates = snapshot?.gates
    ? [snapshot.gates.outOfSample, snapshot.gates.stability, snapshot.gates.regime, snapshot.gates.reproducibility, snapshot.gates.statisticalEvidence]
    : null;
  const robustness = !robustnessGates
    ? stage('NOT_EVALUATED', null, evidenceIds, 'Out-of-sample, stability, regime, reproducibility, and statistical gates were not recorded.')
    : stage('EVALUATED', robustnessGates.every(Boolean), evidenceIds, robustnessGates.every(Boolean) ? 'All recorded robustness gates passed.' : 'One or more recorded robustness gates failed.');

  const recordedRankScore = finite(snapshot?.score);
  const scoring = recordedRankScore == null
    ? stage('NOT_EVALUATED', null, evidenceIds, 'No finite canonical strategy rank score was recorded.')
    : stage('EVALUATED', true, evidenceIds, 'Canonical strategy ranking score is present.');

  const gateValues = snapshot?.gates ? Object.values(snapshot.gates) : [];
  const confidenceScore = gateValues.length
    ? metric('EVALUATED', Number((gateValues.filter(Boolean).length / gateValues.length).toFixed(6)), evidenceIds, 'Evidence confidence equals passed recorded validation gates divided by all recorded gates; it is not an expected-return claim.')
    : metric<number>('NOT_EVALUATED', null, evidenceIds, 'No gate outcomes exist from which to calculate evidence confidence.');
  const rankScore = recordedRankScore == null
    ? metric<number>('NOT_EVALUATED', null, evidenceIds, 'No canonical rank score is available.')
    : metric('EVALUATED', recordedRankScore, evidenceIds, 'Canonical recorded strategy rank score; Academy does not recompute performance.');

  const blockers: string[] = [];
  if (!snapshot) blockers.push(noEvidenceDetail);
  if (snapshot && !backtestMeasured) blockers.push('Required backtest metrics or provenance are incomplete.');
  if (risk.passed === false) blockers.push('Risk evaluation did not pass.');
  if (robustness.passed === false) blockers.push('Robustness evaluation did not pass.');
  if (snapshot?.validationScope !== 'FULL_STRATEGY') blockers.push('Full-strategy validation is not recorded.');
  if (snapshot && snapshot.dataState !== 'live') blockers.push('Validation data is not recorded as live-origin complete.');
  if (snapshot && !snapshot.datasetFingerprint) blockers.push('Dataset fingerprint is missing.');
  if (snapshot && !snapshot.runId) blockers.push('Validation run ID is missing.');
  if (snapshot && snapshot.holdoutProtocolStatus !== 'PASSED') blockers.push('Sealed holdout status is not PASSED.');
  if (strategy.registryStatus === 'blocked' || strategy.registryStatus === 'deprecated') blockers.push(`Registry status is ${strategy.registryStatus}.`);

  const evaluatedStages = [backtest, risk, robustness];
  const overall: AcademyEvidenceState = evaluatedStages.every((item) => item.state === 'EVALUATED')
    ? 'EVALUATED'
    : snapshot ? 'INSUFFICIENT_DATA' : 'NOT_EVALUATED';

  return {
    evaluatedAt: now,
    evidenceFingerprint: evidenceFingerprint(evidence),
    backtest,
    risk,
    robustness,
    scoring,
    overall,
    metrics,
    confidenceScore,
    rankScore,
    blockers: [...new Set(blockers)],
  };
}

function riskProfile(evaluation: AcademyEvaluationResult): AcademyMetric<'LOW' | 'MODERATE' | 'HIGH'> {
  const drawdown = evaluation.metrics.maxDrawdownPct.value;
  if (drawdown == null) return metric<'LOW' | 'MODERATE' | 'HIGH'>('NOT_EVALUATED', null, evaluation.metrics.maxDrawdownPct.evidenceIds, 'Risk profile requires a recorded maximum drawdown.');
  const absoluteDrawdown = Math.abs(drawdown);
  const value = absoluteDrawdown <= 10 ? 'LOW' : absoluteDrawdown <= 20 ? 'MODERATE' : 'HIGH';
  return metric('EVALUATED', value, evaluation.metrics.maxDrawdownPct.evidenceIds, `Rule-based drawdown band from the recorded ${absoluteDrawdown.toFixed(2)}% maximum drawdown; not an execution-risk authorization.`);
}

export class AutomatedEvaluationPipeline {
  evaluate(strategy: DiscoveredAcademyStrategy, existing?: AcademyStrategyRecord, now = Date.now()): AcademyStrategyRecord {
    if (!strategy.evidenceHistory.length) throw new Error(`academy_strategy_evidence_required:${strategy.recordId}`);
    const evidenceHistory = mergeEvidence(existing?.evidenceHistory, strategy.evidenceHistory);
    const candidate = { ...strategy, evidenceHistory };
    const evaluation = buildEvaluation(candidate, evidenceHistory, now);
    const performanceEvidence = evidenceHistory.filter((item) => item.verification !== 'UNVERIFIED' && item.kind !== 'DISCOVERY');
    const target = targetLifecycleForEvaluation(candidate, evaluation);
    const lifecycle = advanceAcademyLifecycle({
      current: existing?.lifecycle ?? null,
      target,
      now,
      reason: target === 'RETIRED' ? (evaluation.blockers[0] ?? 'Retirement evidence recorded.') : 'Academy evidence pipeline completed the required recorded stage.',
      evidenceIds: performanceEvidence.map((item) => item.evidenceId),
    });
    const existingValidationHistory = existing?.validationHistory ?? [];
    const validationHistory = existingValidationHistory.some((item) => item.evidenceFingerprint === evaluation.evidenceFingerprint)
      ? existingValidationHistory
      : [...existingValidationHistory, evaluation].slice(-100);

    return {
      ...strategy,
      evidenceHistory,
      lifecycle: lifecycle.lifecycle,
      lifecycleHistory: [...(existing?.lifecycleHistory ?? []), ...lifecycle.events].slice(-100),
      validationHistory,
      latestEvaluation: evaluation,
      regimeCompatibility: buildRegimeCompatibility(candidate, performanceEvidence),
      riskProfile: riskProfile(evaluation),
      embedding: buildStrategyEmbedding(candidate),
      similarityClusterId: existing?.similarityClusterId ?? null,
      patterns: classifyStrategyPatterns(candidate),
      evolutionSuggestions: existing?.evolutionSuggestions ?? [],
      knowledgeRank: existing?.knowledgeRank ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }
}
