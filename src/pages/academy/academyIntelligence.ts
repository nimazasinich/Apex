/* Strategy Academy intelligence.
 *
 * Every value here is derived from evidence the server already computed and
 * shipped on `StrategyDefinition.latestSnapshot` (see
 * `src/services/strategyEvidence.ts`). Nothing in this module estimates,
 * interpolates, or scores anything on its own: when the evidence for a claim is
 * absent the claim is reported as unmeasured rather than defaulted, because a
 * missing measurement and a measurement of zero are different statements about
 * a strategy and must never render identically.
 *
 * This module deliberately holds no I/O and no React so the truthfulness rules
 * can be asserted directly in unit tests.
 */
import type { StrategyDefinition } from '../../types';
import { hasBoundEvidence, strategyDataTier, strategyDisplayStatus, type StrategyDataTier, type StrategyDisplayStatus } from '../strategies/strategyPresentation';

export type AcademyEvidenceQuality = 'complete-live' | 'complete-degraded' | 'incomplete' | 'none';

/** Ladder of *observable* stages. `promotion` is intentionally absent: the
 *  automatic promotion gate lives on the server and owns that verdict, so
 *  Academy reports readiness for the next supervised step and never asserts
 *  promotion eligibility itself. */
export type AcademyReadiness = 'blocked' | 'no-evidence' | 'more-evidence' | 'paper-forward';

export type AcademyMeasureState = 'pass' | 'fail' | 'unmeasured';

export interface AcademyMeasure {
  state: AcademyMeasureState;
  /** Short cell label. Never a number that was not measured. */
  label: string;
  /** Why the state is what it is, in terms of the evidence on screen. */
  detail: string;
}

export interface AcademyGate {
  key: string;
  label: string;
  state: AcademyMeasureState;
}

export interface AcademyRecommendation {
  id: string;
  headline: string;
  /** The visible evidence that produced the headline. Never empty. */
  because: string[];
}

/** Fixed severity of a recommendation rule id, assigned from the rule's own
 *  fired-semantics in `buildRecommendations` (never inferred from strategy
 *  data): `critical` retires a candidate outright, `high` is a failed gate
 *  actively blocking progress, `medium` is missing evidence rather than a
 *  failure, and `info` covers the review/paper-forward rules that are not
 *  gaps at all. Unknown ids default to `medium` so a future rule id never
 *  silently becomes invisible. */
export type AcademyRecommendationSeverity = 'critical' | 'high' | 'medium' | 'info';

const RECOMMENDATION_SEVERITY: Record<string, AcademyRecommendationSeverity> = {
  retire: 'critical',
  'holdout-retired': 'critical',
  'data-quality': 'high',
  cost: 'high',
  'oos-vs-cost': 'high',
  statistical: 'high',
  regime: 'high',
  'run-validation': 'medium',
  'complete-provenance': 'medium',
  'more-history': 'medium',
  'statistical-missing': 'medium',
  scope: 'medium',
  'paper-forward': 'info',
  review: 'info',
};

const SEVERITY_RANK: Record<AcademyRecommendationSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };

/** One entry of a digest group's family breakdown: how many of the
 *  strategies carrying this recommendation belong to a given family. */
export interface AcademyRecommendationFamilyCount {
  family: string;
  count: number;
}

/** One row of the portfolio-wide recommendation digest: a recommendation
 *  rule id that fired for one or more strategies, how many strategies it
 *  fired for, and which ones. `representativeHeadline` is always copied
 *  verbatim from a recommendation that a row actually produced — this
 *  module never composes or guesses a headline of its own. `severity` is a
 *  fixed property of the rule id, and `familyBreakdown` is a plain tally of
 *  the families already present on the affected rows — neither field adds
 *  any claim beyond what the rows already carry. */
export interface AcademyRecommendationDigestEntry {
  id: string;
  representativeHeadline: string;
  count: number;
  strategyIds: string[];
  severity: AcademyRecommendationSeverity;
  familyBreakdown: AcademyRecommendationFamilyCount[];
}

export interface AcademyProvenanceStep {
  stage: 'Source' | 'Dataset' | 'Validation run' | 'Evidence' | 'Limitation';
  value: string;
  /** Present only when the underlying record supplies it. */
  detail?: string;
}

export interface AcademyMetric {
  key: string;
  label: string;
  /** Null means the snapshot did not report a finite value for this metric. */
  value: number | null;
  suffix: string;
  fractionDigits: number;
  tooltip: string;
}

export interface AcademyIntelligence {
  strategy: StrategyDefinition;
  strategyId: string;
  name: string;
  family: string;
  dataTier: StrategyDataTier;
  displayStatus: StrategyDisplayStatus;
  timeframe: string;

  /** Null when no validation run is bound at all. */
  validationScope: 'BASE_REPLAY' | 'FULL_STRATEGY' | null;
  scopeLabel: string;
  scopeDetail: string;

  evidenceQuality: AcademyEvidenceQuality;
  evidenceLabel: string;
  evidenceDetail: string;

  gates: AcademyGate[];
  gatesPassed: number | null;
  gatesTotal: number | null;
  gatesLabel: string;

  outOfSample: AcademyMeasure;
  statistical: AcademyMeasure;
  regime: AcademyMeasure;
  cost: AcademyMeasure;

  readiness: AcademyReadiness;
  readinessLabel: string;
  readinessDetail: string;

  blockers: string[];
  recommendations: AcademyRecommendation[];
  metrics: AcademyMetric[];
  provenance: AcademyProvenanceStep[];
  limitations: string[];

  rankScore: number | null;
  updatedAt: number | null;
}

export const ACADEMY_GATE_LABELS: Array<{ key: keyof NonNullable<NonNullable<StrategyDefinition['latestSnapshot']>['gates']>; label: string }> = [
  { key: 'data', label: 'Data' },
  { key: 'sample', label: 'Sample' },
  { key: 'outOfSample', label: 'Out-of-sample' },
  { key: 'drawdown', label: 'Drawdown' },
  { key: 'stability', label: 'Stability' },
  { key: 'costResilience', label: 'Cost resilience' },
  { key: 'regime', label: 'Regime' },
  { key: 'reproducibility', label: 'Reproducibility' },
  { key: 'statisticalEvidence', label: 'Statistical evidence' },
];

/** Metric tooltips explain the measure, not the model. They are shown verbatim
 *  in the UI so a reader never has to guess what a technical column means. */
const METRIC_TOOLTIPS: Record<string, string> = {
  netReturnPct: 'Net percentage return of the sealed-holdout replay after commission, slippage and funding.',
  maxDrawdownPct: 'Largest peak-to-trough equity decline observed inside the sealed-holdout replay.',
  winRatePct: 'Share of closed holdout trades that ended positive. Not a forward-looking probability.',
  profitFactor: 'Gross profit divided by gross loss on the holdout. Reported only when the ratio is finite.',
  expectancyPct: 'Mean per-observation return from the statistical evidence block, in percent.',
  deflatedSharpeRatioProbability: 'Deflated Sharpe Ratio probability: the chance the observed Sharpe survives correction for the number of selection hypotheses tried.',
  probabilityPositiveMean: 'Bootstrap probability that the true mean return is above zero.',
  lowerConfidenceBoundPct: 'Lower bound of the multiplicity-corrected confidence interval on mean return.',
  effectiveSampleSize: 'Sample size after adjusting for autocorrelation between observations.',
  costStressPnlPct: 'Net return of the same strategy re-run with multiplied fees and slippage.',
  rankScore: 'Comparable ranking score recorded for the run. Absent when the run carried no ranking.',
};

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function describeDataState(state: string | undefined): string {
  if (!state) return 'no data state recorded';
  return state.replaceAll('_', ' ');
}

/** Which provenance fields the snapshot is missing, in the order
 *  `hasBoundEvidence` checks them, so the reason a model reads "incomplete" is
 *  always the specific field a reader can go and look for. */
export function missingEvidenceFields(strategy: StrategyDefinition): string[] {
  const snapshot = strategy.latestSnapshot;
  if (!snapshot) return ['validation run'];
  const missing: string[] = [];
  if (!snapshot.source) missing.push('source');
  if (!snapshot.symbol) missing.push('market');
  if (!snapshot.interval) missing.push('timeframe');
  if (!snapshot.direction) missing.push('direction');
  if (finite(snapshot.lastBacktestAt) == null) missing.push('run date');
  if (finite(snapshot.dateFrom) == null || finite(snapshot.dateTo) == null) missing.push('dataset date range');
  if (finite(snapshot.commissionPctPerSide) == null) missing.push('commission');
  if (finite(snapshot.slippagePctPerSide) == null) missing.push('slippage');
  if (finite(snapshot.fundingPctEstimate) == null) missing.push('funding estimate');
  if ((finite(snapshot.sampleSize) ?? 0) <= 0) missing.push('sample size');
  if (!snapshot.engine) missing.push('engine');
  if (!snapshot.runId) missing.push('run id');
  if (!snapshot.validationMethod) missing.push('validation method');
  return missing;
}

function evidenceQualityOf(strategy: StrategyDefinition): AcademyEvidenceQuality {
  const snapshot = strategy.latestSnapshot;
  if (!snapshot) return 'none';
  if (!hasBoundEvidence(strategy)) return 'incomplete';
  return snapshot.dataState === 'live' ? 'complete-live' : 'complete-degraded';
}

const EVIDENCE_LABELS: Record<AcademyEvidenceQuality, string> = {
  'complete-live': 'Complete · live',
  'complete-degraded': 'Complete · non-live',
  incomplete: 'Incomplete',
  none: 'None',
};

const READINESS_LABELS: Record<AcademyReadiness, string> = {
  blocked: 'Blocked',
  'no-evidence': 'No evidence',
  'more-evidence': 'More evidence',
  'paper-forward': 'Paper-forward',
};

export const ACADEMY_READINESS_ORDER: AcademyReadiness[] = ['paper-forward', 'more-evidence', 'no-evidence', 'blocked'];

function outOfSampleMeasure(strategy: StrategyDefinition): AcademyMeasure {
  const snapshot = strategy.latestSnapshot;
  const gate = snapshot?.gates?.outOfSample;
  if (gate === undefined) {
    return { state: 'unmeasured', label: '—', detail: 'No validation run reported an out-of-sample gate result.' };
  }
  const holdout = snapshot?.holdoutProtocolStatus;
  if (holdout === 'FAILED_RETIRED') {
    return { state: 'fail', label: 'Retired', detail: 'The sealed holdout was opened and failed, so this candidate is retired under the holdout protocol.' };
  }
  return gate
    ? { state: 'pass', label: 'Pass', detail: 'The out-of-sample gate passed on the sealed holdout window.' }
    : { state: 'fail', label: 'Fail', detail: 'The out-of-sample gate did not pass on the sealed holdout window.' };
}

function statisticalMeasure(strategy: StrategyDefinition): AcademyMeasure {
  const statistical = strategy.latestSnapshot?.statistical;
  if (!statistical) {
    return { state: 'unmeasured', label: '—', detail: 'No multiplicity-corrected statistical evidence was recorded for this model.' };
  }
  const dsr = finite(statistical.deflatedSharpeRatioProbability);
  const dsrText = dsr == null ? 'DSR probability not reported' : `DSR probability ${(dsr * 100).toFixed(1)}%`;
  const detail = `${dsrText} · ${statistical.selectionHypotheses} selection hypotheses · corrected alpha ${statistical.correctedAlpha.toFixed(4)} · effective sample ${Math.round(statistical.effectiveSampleSize)}.`;
  if (statistical.passed) return { state: 'pass', label: 'Pass', detail };
  const blockers = statistical.blockers.length ? ` Blockers: ${statistical.blockers.join(', ')}.` : '';
  return { state: 'fail', label: 'Fail', detail: `${detail}${blockers}` };
}

function regimeMeasure(strategy: StrategyDefinition): AcademyMeasure {
  const snapshot = strategy.latestSnapshot;
  const measured = snapshot?.regimesMeasured;
  if (snapshot?.regimeStatus === 'insufficient_data' || !measured || !measured.length) {
    const reason = snapshot?.regimeReason ? ` ${snapshot.regimeReason}` : '';
    return { state: 'unmeasured', label: '—', detail: `Regime behaviour was not measured for this model.${reason}` };
  }
  const profitable = snapshot?.regimesProfitable ?? [];
  const label = `${profitable.length}/${measured.length}`;
  const detail = `Profitable in ${profitable.length} of ${measured.length} measured regimes (${measured.join(', ')}).`;
  const gate = snapshot?.gates?.regime;
  if (gate === undefined) return { state: 'unmeasured', label, detail };
  return gate ? { state: 'pass', label, detail } : { state: 'fail', label, detail: `${detail} The regime gate did not pass.` };
}

function costMeasure(strategy: StrategyDefinition): AcademyMeasure {
  const snapshot = strategy.latestSnapshot;
  const stress = snapshot?.costStress;
  if (!stress) {
    if (snapshot?.costStressPassed === undefined) {
      return { state: 'unmeasured', label: '—', detail: 'No cost-stress run was recorded for this model.' };
    }
    return snapshot.costStressPassed
      ? { state: 'pass', label: 'Pass', detail: 'The recorded cost-stress gate passed; multiplier detail was not reported.' }
      : { state: 'fail', label: 'Fail', detail: 'The recorded cost-stress gate did not pass; multiplier detail was not reported.' };
  }
  const detail = `At ${stress.feeMultiplier}x fees and ${stress.slippageMultiplier}x slippage the replay returns ${stress.totalPnlPct.toFixed(2)}% with a ${Math.abs(stress.maxDrawdownPct).toFixed(2)}% drawdown.`;
  return stress.passed
    ? { state: 'pass', label: `${stress.feeMultiplier}x pass`, detail }
    : { state: 'fail', label: `${stress.feeMultiplier}x fail`, detail };
}

/** Blockers are quoted from records that already exist: the registry status, the
 *  holdout protocol, the gate booleans, and the statistical blocker vocabulary.
 *  Academy invents no blocker of its own. */
function collectBlockers(strategy: StrategyDefinition): string[] {
  const snapshot = strategy.latestSnapshot;
  const blockers: string[] = [];
  if (strategy.status === 'blocked') blockers.push('Registry status is blocked.');
  if (strategy.status === 'deprecated') blockers.push('Registry status is deprecated.');
  if (!snapshot) {
    blockers.push('No validation run is bound to this model.');
    return blockers;
  }
  if (snapshot.holdoutProtocolStatus === 'FAILED_RETIRED') {
    blockers.push('Sealed holdout failed; the candidate is retired under the holdout protocol.');
  }
  const missing = missingEvidenceFields(strategy);
  if (missing.length) blockers.push(`Evidence provenance is incomplete: missing ${missing.join(', ')}.`);
  if (snapshot.dataState && snapshot.dataState !== 'live') {
    blockers.push(`Snapshot data state is ${describeDataState(snapshot.dataState)}, not live.`);
  }
  if (snapshot.gates) {
    for (const { key, label } of ACADEMY_GATE_LABELS) {
      if (snapshot.gates[key] === false) blockers.push(`${label} gate did not pass.`);
    }
  }
  if (snapshot.validationScope === 'BASE_REPLAY') {
    blockers.push('Validation scope is base replay; full strategy semantics were not completely exercised.');
  }
  for (const blocker of snapshot.statistical?.blockers ?? []) {
    blockers.push(`Statistical evidence blocker: ${blocker}.`);
  }
  return Array.from(new Set(blockers));
}

function readinessOf(strategy: StrategyDefinition, blockers: string[]): AcademyReadiness {
  const snapshot = strategy.latestSnapshot;
  if (strategy.status === 'blocked' || strategy.status === 'deprecated' || snapshot?.holdoutProtocolStatus === 'FAILED_RETIRED') return 'blocked';
  if (!snapshot) return 'no-evidence';
  if (blockers.length) return 'more-evidence';
  const eligible = snapshot.passedAllGates === true
    && snapshot.validationScope === 'FULL_STRATEGY'
    && snapshot.fullStrategyValidated === true
    && snapshot.dataState === 'live'
    && hasBoundEvidence(strategy);
  return eligible ? 'paper-forward' : 'more-evidence';
}

function readinessDetail(readiness: AcademyReadiness, blockers: string[]): string {
  switch (readiness) {
    case 'blocked':
      return blockers[0] ?? 'This model is blocked in the registry.';
    case 'no-evidence':
      return 'No validation run is bound, so no readiness claim can be made.';
    case 'more-evidence':
      return `${blockers.length} open item${blockers.length === 1 ? '' : 's'} must clear before the next supervised stage.`;
    case 'paper-forward':
      return 'All recorded gates pass at full-strategy scope on live data, so the next supervised step is paper-forward validation. Promotion authority remains with the server governance gate.';
  }
}

/* Recommendations are a fixed, ordered rule set. Each rule fires only from
   evidence that is also rendered on screen, and each carries the specific
   observations that produced it, so a reader can always retrace the reasoning
   without trusting the label. */
function buildRecommendations(strategy: StrategyDefinition, context: {
  outOfSample: AcademyMeasure;
  statistical: AcademyMeasure;
  regime: AcademyMeasure;
  cost: AcademyMeasure;
  dataTier: StrategyDataTier;
  evidenceQuality: AcademyEvidenceQuality;
}): AcademyRecommendation[] {
  const snapshot = strategy.latestSnapshot;
  const out: AcademyRecommendation[] = [];
  const push = (id: string, headline: string, because: string[]) => {
    if (because.length) out.push({ id, headline, because });
  };

  if (strategy.status === 'blocked' || strategy.status === 'deprecated') {
    push('retire', 'Retire or replace this candidate', [`Registry status is ${strategy.status}.`]);
    return out;
  }
  if (snapshot?.holdoutProtocolStatus === 'FAILED_RETIRED') {
    push('holdout-retired', 'Retire this candidate; the sealed holdout is spent', [
      'Holdout protocol status is FAILED_RETIRED, so this fingerprint cannot be revalidated against the same sealed window.',
    ]);
    return out;
  }
  if (!snapshot) {
    push('run-validation', 'Run a validation pass to create evidence', ['No validation run is bound to this model.']);
    return out;
  }

  if (context.evidenceQuality === 'incomplete') {
    push('complete-provenance', 'Needs complete evidence provenance', [
      `The bound snapshot is missing ${missingEvidenceFields(strategy).join(', ')}.`,
    ]);
  }

  if (snapshot.gates?.sample === false) {
    const sample = finite(snapshot.sampleSize);
    push('more-history', 'Needs more historical evidence', [
      sample == null
        ? 'The sample gate did not pass and the run reported no sample size.'
        : `The sample gate did not pass at ${sample.toLocaleString()} candles.`,
    ]);
  }

  if (snapshot.gates?.data === false || (snapshot.dataState && snapshot.dataState !== 'live')) {
    const because: string[] = [];
    if (snapshot.gates?.data === false) because.push('The data gate did not pass.');
    if (snapshot.dataState && snapshot.dataState !== 'live') because.push(`Snapshot data state is ${describeDataState(snapshot.dataState)}.`);
    if (context.dataTier !== 'Standard') because.push(`This model requires ${context.dataTier} inputs.`);
    push('data-quality', context.dataTier === 'Standard' ? 'Missing required data evidence' : `Missing required ${context.dataTier} evidence`, because);
  }

  if (context.outOfSample.state === 'pass' && context.cost.state === 'fail') {
    push('oos-vs-cost', 'Strong out-of-sample result but weak cost resilience', [
      context.outOfSample.detail,
      context.cost.detail,
    ]);
  } else if (context.cost.state === 'fail') {
    push('cost', 'Cost resilience is the binding constraint', [context.cost.detail]);
  }

  if (context.statistical.state === 'fail') {
    push('statistical', 'Statistical evidence does not clear the corrected threshold', [context.statistical.detail]);
  } else if (context.statistical.state === 'unmeasured' && snapshot.gates) {
    push('statistical-missing', 'Needs multiplicity-corrected statistical evidence', [
      'The run recorded gate results but no statistical evidence block.',
    ]);
  }

  if (context.regime.state === 'unmeasured') {
    push('regime', 'Regime coverage is unmeasured', [context.regime.detail]);
  } else if (context.regime.state === 'fail') {
    push('regime', 'Regime coverage is too narrow', [context.regime.detail]);
  }

  if (snapshot.validationScope === 'BASE_REPLAY') {
    push('scope', 'Needs a full-strategy validation pass', [
      'Validation scope is BASE_REPLAY, so full strategy semantics were not completely exercised.',
      ...(snapshot.validationLimitations ?? []),
    ]);
  }

  if (!out.length && snapshot.passedAllGates === true && snapshot.validationScope === 'FULL_STRATEGY' && snapshot.dataState === 'live') {
    push('paper-forward', 'Eligible for paper-forward validation', [
      'All recorded validation gates pass.',
      'Validation scope is FULL_STRATEGY on live data with complete provenance.',
      'Promotion beyond paper-forward remains with the server governance gate.',
    ]);
  }

  if (!out.length) {
    push('review', 'Review the recorded evidence before advancing', [
      'No individual gate failure was recorded, but the run does not meet every paper-forward precondition.',
    ]);
  }
  return out;
}

function buildMetrics(strategy: StrategyDefinition): AcademyMetric[] {
  const snapshot = strategy.latestSnapshot;
  const statistical = snapshot?.statistical;
  return [
    { key: 'netReturnPct', label: 'Net return', value: finite(snapshot?.netReturnPct), suffix: '%', fractionDigits: 2, tooltip: METRIC_TOOLTIPS.netReturnPct },
    { key: 'maxDrawdownPct', label: 'Max drawdown', value: finite(snapshot?.maxDrawdownPct), suffix: '%', fractionDigits: 2, tooltip: METRIC_TOOLTIPS.maxDrawdownPct },
    { key: 'winRatePct', label: 'Win rate', value: finite(snapshot?.winRatePct), suffix: '%', fractionDigits: 1, tooltip: METRIC_TOOLTIPS.winRatePct },
    { key: 'profitFactor', label: 'Profit factor', value: finite(snapshot?.profitFactor), suffix: '', fractionDigits: 2, tooltip: METRIC_TOOLTIPS.profitFactor },
    { key: 'expectancyPct', label: 'Expectancy / obs', value: finite(statistical?.meanReturnPct), suffix: '%', fractionDigits: 3, tooltip: METRIC_TOOLTIPS.expectancyPct },
    { key: 'deflatedSharpeRatioProbability', label: 'DSR probability', value: finite(statistical?.deflatedSharpeRatioProbability), suffix: '', fractionDigits: 3, tooltip: METRIC_TOOLTIPS.deflatedSharpeRatioProbability },
    { key: 'probabilityPositiveMean', label: 'P(mean > 0)', value: finite(statistical?.probabilityPositiveMean), suffix: '', fractionDigits: 3, tooltip: METRIC_TOOLTIPS.probabilityPositiveMean },
    { key: 'lowerConfidenceBoundPct', label: 'CI lower bound', value: finite(statistical?.lowerConfidenceBoundPct), suffix: '%', fractionDigits: 3, tooltip: METRIC_TOOLTIPS.lowerConfidenceBoundPct },
    { key: 'effectiveSampleSize', label: 'Effective sample', value: finite(statistical?.effectiveSampleSize), suffix: '', fractionDigits: 0, tooltip: METRIC_TOOLTIPS.effectiveSampleSize },
    { key: 'costStressPnlPct', label: 'Cost-stress return', value: finite(snapshot?.costStress?.totalPnlPct), suffix: '%', fractionDigits: 2, tooltip: METRIC_TOOLTIPS.costStressPnlPct },
    { key: 'rankScore', label: 'Ranking score', value: finite(snapshot?.score), suffix: '', fractionDigits: 0, tooltip: METRIC_TOOLTIPS.rankScore },
  ];
}

/** `source → dataset → validation run → evidence → limitation`, populated only
 *  from recorded fields. A stage with no record says so instead of being
 *  dropped, so a reader can see where the chain breaks. */
function buildProvenance(strategy: StrategyDefinition): AcademyProvenanceStep[] {
  const snapshot = strategy.latestSnapshot;
  if (!snapshot) {
    return [
      { stage: 'Source', value: 'Not recorded', detail: 'No validation run is bound to this model.' },
      { stage: 'Dataset', value: 'Not recorded' },
      { stage: 'Validation run', value: 'Not recorded' },
      { stage: 'Evidence', value: 'Not recorded' },
      { stage: 'Limitation', value: 'Evidence has never been generated for this model.' },
    ];
  }
  const range = finite(snapshot.dateFrom) != null && finite(snapshot.dateTo) != null
    ? `${new Date(snapshot.dateFrom!).toLocaleDateString()} – ${new Date(snapshot.dateTo!).toLocaleDateString()}`
    : 'Date range not recorded';
  const costs = [
    finite(snapshot.commissionPctPerSide) == null ? null : `commission ${snapshot.commissionPctPerSide}%/side`,
    finite(snapshot.slippagePctPerSide) == null ? null : `slippage ${snapshot.slippagePctPerSide}%/side`,
    finite(snapshot.fundingPctEstimate) == null ? null : `funding ${snapshot.fundingPctEstimate}%`,
  ].filter((value): value is string => Boolean(value));
  const limitations = [
    ...(snapshot.validationLimitations ?? []),
    ...(snapshot.warnings ?? []),
  ];
  return [
    {
      stage: 'Source',
      value: snapshot.source ?? 'Not recorded',
      detail: `Data state ${describeDataState(snapshot.dataState)}${snapshot.engine ? ` · engine ${snapshot.engine}` : ''}`,
    },
    {
      stage: 'Dataset',
      value: `${snapshot.symbol ?? 'Market not recorded'} · ${snapshot.interval ?? 'timeframe not recorded'} · ${snapshot.direction ?? 'direction not recorded'}`,
      detail: `${range}${finite(snapshot.sampleSize) == null ? '' : ` · ${snapshot.sampleSize!.toLocaleString()} candles`}${snapshot.datasetFingerprint ? ` · fingerprint ${snapshot.datasetFingerprint.slice(0, 12)}` : ''}`,
    },
    {
      stage: 'Validation run',
      value: snapshot.validationMethod ?? 'Validation method not recorded',
      detail: `${snapshot.runId ? `run ${snapshot.runId}` : 'run id not recorded'}${finite(snapshot.lastBacktestAt) == null ? '' : ` · ${new Date(snapshot.lastBacktestAt!).toLocaleString()}`}${snapshot.holdoutProtocolStatus ? ` · holdout ${snapshot.holdoutProtocolStatus}` : ''}`,
    },
    {
      stage: 'Evidence',
      value: snapshot.gates
        ? `${ACADEMY_GATE_LABELS.filter(({ key }) => snapshot.gates![key]).length} of ${ACADEMY_GATE_LABELS.length} gates passed at ${snapshot.validationScope ?? 'unrecorded'} scope`
        : 'No gate results recorded',
      detail: costs.length ? `Cost model: ${costs.join(' · ')}` : 'Cost model not recorded',
    },
    {
      stage: 'Limitation',
      value: limitations.length ? limitations[0] : 'No limitation recorded for this run.',
      detail: limitations.length > 1 ? limitations.slice(1).join(' · ') : undefined,
    },
  ];
}

export function buildAcademyIntelligence(strategy: StrategyDefinition): AcademyIntelligence {
  const snapshot = strategy.latestSnapshot;
  const dataTier = strategyDataTier(strategy);
  const evidenceQuality = evidenceQualityOf(strategy);
  const outOfSample = outOfSampleMeasure(strategy);
  const statistical = statisticalMeasure(strategy);
  const regime = regimeMeasure(strategy);
  const cost = costMeasure(strategy);
  const blockers = collectBlockers(strategy);
  const readiness = readinessOf(strategy, blockers);

  const gates: AcademyGate[] = ACADEMY_GATE_LABELS.map(({ key, label }) => ({
    key,
    label,
    state: snapshot?.gates ? (snapshot.gates[key] ? 'pass' : 'fail') : 'unmeasured',
  }));
  const gatesTotal = snapshot?.gates ? ACADEMY_GATE_LABELS.length : null;
  const gatesPassed = snapshot?.gates ? gates.filter((gate) => gate.state === 'pass').length : null;
  const missing = missingEvidenceFields(strategy);

  return {
    strategy,
    strategyId: strategy.strategyId,
    name: strategy.name,
    family: strategy.categories?.[0] || 'Unclassified',
    dataTier,
    displayStatus: strategyDisplayStatus(strategy),
    timeframe: snapshot?.interval ?? strategy.supportedIntervals?.[0] ?? '—',

    validationScope: snapshot?.validationScope ?? null,
    scopeLabel: snapshot?.validationScope === 'FULL_STRATEGY' ? 'FULL_STRATEGY' : snapshot?.validationScope === 'BASE_REPLAY' ? 'BASE_REPLAY' : 'MISSING',
    scopeDetail: snapshot?.validationScope === 'FULL_STRATEGY'
      ? 'The run exercised full strategy semantics.'
      : snapshot?.validationScope === 'BASE_REPLAY'
        ? 'The run exercised base replay only; full strategy semantics were not completely exercised.'
        : 'No validation scope is recorded for this model.',

    evidenceQuality,
    evidenceLabel: EVIDENCE_LABELS[evidenceQuality],
    evidenceDetail: evidenceQuality === 'none'
      ? 'No validation run is bound to this model.'
      : evidenceQuality === 'incomplete'
        ? `Provenance is missing ${missing.join(', ')}.`
        : evidenceQuality === 'complete-degraded'
          ? `Provenance is complete but the snapshot data state is ${describeDataState(snapshot?.dataState)}.`
          : 'Provenance is complete and the snapshot was produced on live data.',

    gates,
    gatesPassed,
    gatesTotal,
    gatesLabel: gatesPassed == null || gatesTotal == null ? '—' : `${gatesPassed}/${gatesTotal}`,

    outOfSample,
    statistical,
    regime,
    cost,

    readiness,
    readinessLabel: READINESS_LABELS[readiness],
    readinessDetail: readinessDetail(readiness, blockers),

    blockers,
    recommendations: buildRecommendations(strategy, { outOfSample, statistical, regime, cost, dataTier, evidenceQuality }),
    metrics: buildMetrics(strategy),
    provenance: buildProvenance(strategy),
    limitations: Array.from(new Set([...(snapshot?.validationLimitations ?? []), ...(snapshot?.warnings ?? [])])),

    rankScore: finite(snapshot?.score),
    updatedAt: finite(snapshot?.lastBacktestAt),
  };
}

export function formatAcademyMetric(metric: AcademyMetric): string {
  if (metric.value == null) return 'Unavailable';
  return `${metric.value.toFixed(metric.fractionDigits)}${metric.suffix}`;
}

/** Groups recommendations across every row by rule id and counts how many
 *  strategies each one fired for. The headline shown for a group is taken
 *  verbatim from the first row that produced it — never invented. Entries
 *  are sorted by descending count first (unchanged from the original
 *  contract), then by descending severity, then by id, so ties resolve the
 *  same way every time. `familyBreakdown` tallies the `family` field already
 *  present on each affected row — it adds no new evidence, only a portfolio
 *  view of evidence already on screen. */
export function academyRecommendationDigest(rows: AcademyIntelligence[]): AcademyRecommendationDigestEntry[] {
  const groups = new Map<string, { headline: string; strategyIds: string[]; families: Map<string, number> }>();
  for (const row of rows) {
    for (const recommendation of row.recommendations) {
      let group = groups.get(recommendation.id);
      if (!group) {
        group = { headline: recommendation.headline, strategyIds: [], families: new Map() };
        groups.set(recommendation.id, group);
      }
      group.strategyIds.push(row.strategyId);
      group.families.set(row.family, (group.families.get(row.family) ?? 0) + 1);
    }
  }
  return Array.from(groups.entries())
    .map(([id, { headline, strategyIds, families }]) => ({
      id,
      representativeHeadline: headline,
      count: strategyIds.length,
      strategyIds,
      severity: RECOMMENDATION_SEVERITY[id] ?? 'medium',
      familyBreakdown: Array.from(families.entries())
        .map(([family, count]) => ({ family, count }))
        .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family)),
    }))
    .sort((a, b) => b.count - a.count || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id));
}

/** A recommendation rule id counts as a systemic family pattern when it fires
 *  for more than half of the registered strategies inside one family (and at
 *  least two strategies, so a single-strategy family never trivially
 *  qualifies). This is a plain majority computed from `familyBreakdown` and
 *  the registry's own family sizes — no inference beyond that ratio. */
export interface AcademySystemicPattern {
  recommendationId: string;
  representativeHeadline: string;
  severity: AcademyRecommendationSeverity;
  family: string;
  affected: number;
  familySize: number;
}

export function academySystemicPatterns(rows: AcademyIntelligence[]): AcademySystemicPattern[] {
  const familySizes = new Map<string, number>();
  for (const row of rows) {
    familySizes.set(row.family, (familySizes.get(row.family) ?? 0) + 1);
  }
  const digest = academyRecommendationDigest(rows);
  const patterns: AcademySystemicPattern[] = [];
  for (const entry of digest) {
    for (const { family, count } of entry.familyBreakdown) {
      const familySize = familySizes.get(family) ?? 0;
      if (familySize >= 2 && count > familySize / 2) {
        patterns.push({
          recommendationId: entry.id,
          representativeHeadline: entry.representativeHeadline,
          severity: entry.severity,
          family,
          affected: count,
          familySize,
        });
      }
    }
  }
  return patterns.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || (b.affected / b.familySize) - (a.affected / a.familySize)
    || a.family.localeCompare(b.family));
}

/** One concrete next step for one strategy: the recommendation that produced
 *  it, its severity, and the exact `because` evidence already shown on the
 *  strategy's own row. This module only ranks and packages recommendations
 *  that `buildAcademyIntelligence` already computed — it never decides what
 *  a strategy needs on its own, and it never writes to
 *  `scripts/research-agent/study-queue.json` (that queue's own schema note
 *  reserves it for studies a human adds deliberately; this plan is an export
 *  for a human or agent to act on, not a silent write to that file). */
export interface AcademyActionPlanItem {
  priority: number;
  strategyId: string;
  strategyName: string;
  family: string;
  recommendationId: string;
  severity: AcademyRecommendationSeverity;
  headline: string;
  because: string[];
}

/** Builds a flat, priority-ordered action plan: one item per (strategy,
 *  recommendation) pair, ordered by severity first and then by how many
 *  strategies share the same recommendation (the digest's own count), so the
 *  highest-leverage, most-blocking items surface first. Ties fall back to
 *  strategyId then recommendation id for a stable, reproducible order. */
export function academyActionPlan(rows: AcademyIntelligence[]): AcademyActionPlanItem[] {
  const digest = academyRecommendationDigest(rows);
  const severityById = new Map(digest.map((entry) => [entry.id, entry.severity]));
  const countById = new Map(digest.map((entry) => [entry.id, entry.count]));

  const items: Omit<AcademyActionPlanItem, 'priority'>[] = [];
  for (const row of rows) {
    for (const recommendation of row.recommendations) {
      items.push({
        strategyId: row.strategyId,
        strategyName: row.name,
        family: row.family,
        recommendationId: recommendation.id,
        severity: severityById.get(recommendation.id) ?? 'medium',
        headline: recommendation.headline,
        because: recommendation.because,
      });
    }
  }

  items.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || (countById.get(b.recommendationId) ?? 0) - (countById.get(a.recommendationId) ?? 0)
    || a.strategyId.localeCompare(b.strategyId)
    || a.recommendationId.localeCompare(b.recommendationId));

  return items.map((item, index) => ({ ...item, priority: index + 1 }));
}

/** Portfolio-level counts for the Academy funnel. Each number is a count of
 *  models that satisfy an observable predicate — none is a rate or an estimate. */
export function academyEvidenceFunnel(rows: AcademyIntelligence[]): Array<{ label: string; count: number; detail: string }> {
  return [
    { label: 'Registered', count: rows.length, detail: 'Models present in the strategy registry.' },
    { label: 'Evidence bound', count: rows.filter((row) => row.evidenceQuality !== 'none').length, detail: 'Models with a recorded validation snapshot.' },
    { label: 'Provenance complete', count: rows.filter((row) => row.evidenceQuality === 'complete-live' || row.evidenceQuality === 'complete-degraded').length, detail: 'Snapshots carrying every provenance field.' },
    { label: 'All gates pass', count: rows.filter((row) => row.gatesTotal != null && row.gatesPassed === row.gatesTotal).length, detail: 'Runs where all nine validation gates passed.' },
    { label: 'Full-strategy scope', count: rows.filter((row) => row.validationScope === 'FULL_STRATEGY').length, detail: 'Runs that exercised full strategy semantics.' },
    { label: 'Paper-forward ready', count: rows.filter((row) => row.readiness === 'paper-forward').length, detail: 'Models meeting every observable precondition for paper-forward validation.' },
  ];
}
