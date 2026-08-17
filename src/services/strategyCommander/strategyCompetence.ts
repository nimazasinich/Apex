import type { CommanderOutcomeObservationV1 } from './commanderOutcomeFeedback';

export const STRATEGY_COMPETENCE_VERSION = 'strategy_competence_v1' as const;
export const STRATEGY_COMPETENCE_DEFAULT = 0.5;

export interface StrategyCompetencePolicyV1 {
  version: 'strategy_competence_policy_v1';
  minimumObservations: number;
  minimumContextObservations: number;
  defaultCompetence: number;
}

export interface StrategyCompetenceV1 {
  version: typeof STRATEGY_COMPETENCE_VERSION;
  strategyId: string;
  strategyVersion: string;
  parameterProfileFingerprint: string;
  contextLevel: 'EXACT' | 'REGIME_THESIS_DIRECTION' | 'REGIME_THESIS' | 'REGIME' | 'GLOBAL' | 'DEFAULT';
  sampleCount: number;
  effectiveSampleCount: number;
  minimumRequiredSample: number;
  competence: number;
  brierScore: number | null;
  coverage: number;
  status: 'SUFFICIENT_EVIDENCE' | 'INSUFFICIENT_EVIDENCE';
  reasons: string[];
}

export interface StrategyCompetenceIdentityV1 {
  strategyId: string;
  strategyVersion: string;
  parameterProfileFingerprint: string;
  symbol: string;
  interval: string;
  direction: CommanderOutcomeObservationV1['attribution']['direction'];
  regime: CommanderOutcomeObservationV1['attribution']['regime'];
  thesis: CommanderOutcomeObservationV1['attribution']['thesis'];
  trendRelation: CommanderOutcomeObservationV1['attribution']['trendRelation'];
}

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number) => Number(clamp(value).toFixed(6));

export const DEFAULT_STRATEGY_COMPETENCE_POLICY: StrategyCompetencePolicyV1 = Object.freeze({
  version: 'strategy_competence_policy_v1',
  minimumObservations: 20,
  minimumContextObservations: 12,
  defaultCompetence: STRATEGY_COMPETENCE_DEFAULT,
});

type ContextLevel = Exclude<StrategyCompetenceV1['contextLevel'], 'DEFAULT'>;

function key(item: StrategyCompetenceIdentityV1, level: ContextLevel): string {
  const base = `${item.strategyId}|${item.strategyVersion}|${item.parameterProfileFingerprint}`;
  if (level === 'GLOBAL') return base;
  if (level === 'REGIME') return `${base}|${item.regime}`;
  if (level === 'REGIME_THESIS') return `${base}|${item.regime}|${item.thesis ?? 'NONE'}`;
  if (level === 'REGIME_THESIS_DIRECTION') return `${base}|${item.regime}|${item.thesis ?? 'NONE'}|${item.direction}`;
  return `${base}|${item.symbol}|${item.interval}|${item.direction}|${item.regime}|${item.thesis ?? 'NONE'}|${item.trendRelation}`;
}

function identityOf(observation: CommanderOutcomeObservationV1): StrategyCompetenceIdentityV1 {
  const item = observation.attribution;
  return {
    strategyId: item.strategyId,
    strategyVersion: item.strategyVersion,
    parameterProfileFingerprint: item.parameterProfileFingerprint,
    symbol: item.symbol,
    interval: item.interval,
    direction: item.direction,
    regime: item.regime,
    thesis: item.thesis,
    trendRelation: item.trendRelation,
  };
}

function aggregate(rows: readonly CommanderOutcomeObservationV1[], minimum: number, level: ContextLevel): Omit<StrategyCompetenceV1, 'version' | 'contextLevel' | 'strategyId' | 'strategyVersion' | 'parameterProfileFingerprint'> {
  const sampleCount = rows.length;
  if (!sampleCount) {
    return { sampleCount: 0, effectiveSampleCount: 0, minimumRequiredSample: minimum, competence: STRATEGY_COMPETENCE_DEFAULT, brierScore: null, coverage: 0, status: 'INSUFFICIENT_EVIDENCE', reasons: ['no_explicitly_attributed_outcomes'] };
  }
  const competence = rows.reduce((sum, row) => sum + row.successScore, 0) / sampleCount;
  const brierScore = rows.reduce((sum, row) => sum + (row.attribution.predictedConfidence - row.successScore) ** 2, 0) / sampleCount;
  const sufficient = sampleCount >= minimum;
  return {
    sampleCount,
    effectiveSampleCount: sampleCount,
    minimumRequiredSample: minimum,
    competence: round(sufficient ? competence : STRATEGY_COMPETENCE_DEFAULT),
    brierScore: round(brierScore),
    coverage: 1,
    status: sufficient ? 'SUFFICIENT_EVIDENCE' : 'INSUFFICIENT_EVIDENCE',
    reasons: sufficient ? [`${level.toLowerCase()}:minimum_observations_met`] : [`${level.toLowerCase()}:minimum_observations_not_met`],
  };
}

/** Resolve with the prescribed hierarchy; undersampled buckets never alter the default. */
export function resolveStrategyCompetence(input: {
  target: CommanderOutcomeObservationV1;
  observations: readonly CommanderOutcomeObservationV1[];
  policy?: StrategyCompetencePolicyV1;
}): StrategyCompetenceV1 {
  return resolveStrategyCompetenceForIdentity({
    target: identityOf(input.target),
    observations: input.observations,
    policy: input.policy,
  });
}

export function resolveStrategyCompetenceForIdentity(input: {
  target: StrategyCompetenceIdentityV1;
  observations: readonly CommanderOutcomeObservationV1[];
  policy?: StrategyCompetencePolicyV1;
}): StrategyCompetenceV1 {
  const policy = input.policy ?? DEFAULT_STRATEGY_COMPETENCE_POLICY;
  const levels: Array<{ level: ContextLevel; minimum: number }> = [
    { level: 'EXACT', minimum: policy.minimumContextObservations },
    { level: 'REGIME_THESIS_DIRECTION', minimum: policy.minimumContextObservations },
    { level: 'REGIME_THESIS', minimum: policy.minimumContextObservations },
    { level: 'REGIME', minimum: policy.minimumContextObservations },
    { level: 'GLOBAL', minimum: policy.minimumObservations },
  ];
  for (const attempt of levels) {
    const rows = input.observations.filter((row) => key(identityOf(row), attempt.level) === key(input.target, attempt.level));
    const result = aggregate(rows, attempt.minimum, attempt.level);
    if (result.status === 'SUFFICIENT_EVIDENCE') {
      return { version: STRATEGY_COMPETENCE_VERSION, strategyId: input.target.strategyId, strategyVersion: input.target.strategyVersion, parameterProfileFingerprint: input.target.parameterProfileFingerprint, contextLevel: attempt.level, ...result };
    }
  }
  return {
    version: STRATEGY_COMPETENCE_VERSION,
    strategyId: input.target.strategyId,
    strategyVersion: input.target.strategyVersion,
    parameterProfileFingerprint: input.target.parameterProfileFingerprint,
    contextLevel: 'DEFAULT',
    ...aggregate([], policy.minimumObservations, 'GLOBAL'),
    reasons: ['insufficient_evidence_across_hierarchy'],
  };
}
