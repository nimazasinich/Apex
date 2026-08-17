import type { StrategyDefinition } from '../../types';
import { listStrategyDefinitions } from '../strategyRegistry';
import type { StrategyCommanderDecisionV1, CommanderRankingV1, CommanderSuppressedStrategyV1 } from '../../contracts/commander/commanderDecision';
import { COMMANDER_SAFETY, type CommanderPolicyV1 } from '../../contracts/commander/commanderPolicy';
import { COMMANDER_IDENTITY_VERSION, commanderIdentityFingerprint, type StrategyCommanderIdentityV1 } from '../../contracts/commander/commanderIdentity';
import type { IntelligenceConsensusV1 } from './intelligenceConsensus';
import { parliamentFingerprint } from './intelligenceConsensus';
import { buildCommanderMarketContext } from './marketContextEngine';
import type { OpportunityCandidateV1 } from './opportunity/opportunityTypes';
import type { StrategyCompetenceV1 } from './strategyCompetence';
import type { EvidenceCompetenceV1 } from './evidenceCompetence';

export const STRATEGY_COMMANDER_SHADOW_VERSION = 'strategy_commander_shadow_v1' as const;
export const STRATEGY_COMMANDER_SHADOW_REVISION = 'observed-competence-no-routing-v1' as const;

export interface StrategyCommanderScanShadowV1 {
  version: 'strategy_commander_scan_shadow_v1';
  timestamp: string;
  shadowOnly: true;
  authoritativeSelection: 'CURRENT_APEX_CANDIDATES';
  results: StrategyCommanderDecisionV1[];
  evidenceCompetence: EvidenceCompetenceV1[];
  failures: Array<{ symbol: string; reason: 'commander_evaluation_failed' }>;
  fingerprint: string;
}

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number) => Number(clamp(value).toFixed(6));
const qualityScore: Record<StrategyCommanderDecisionV1['marketContext']['evidenceQuality'], number> = {
  VALID: 1, ESTIMATED: 0.65, STALE: 0.25, MISSING: 0, INVALID: 0, NOT_CONFIGURED: 0,
};

export function strategyParameterProfileFingerprint(
  definition: StrategyDefinition,
  parameters: Readonly<Record<string, number | string>> = {},
): string {
  return parliamentFingerprint(definition.parameters
    .map((parameter) => `${parameter.key}=${String(parameters[parameter.key] ?? parameter.default)}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|') || 'default');
}

function supportsDirection(definition: StrategyDefinition, direction: 'LONG' | 'SHORT'): boolean {
  return definition.longShort === 'BOTH' || definition.longShort === direction;
}

function researchQuality(definition: StrategyDefinition): number {
  const value = definition.latestSnapshot?.score;
  return Number.isFinite(value) ? clamp(Number(value) / 100) : 0.5;
}

function abstainReason(input: {
  context: StrategyCommanderDecisionV1['marketContext'];
  consensus: IntelligenceConsensusV1;
  opportunity: OpportunityCandidateV1;
  eligible: StrategyDefinition[];
}): StrategyCommanderDecisionV1['abstainReason'] | undefined {
  if (input.consensus.materialVetoes.includes('EVENT_RISK')) return 'EVENT_RISK';
  if (input.consensus.materialVetoes.includes('LIQUIDITY_DEGRADATION')) return 'LIQUIDITY_UNSAFE';
  if (input.consensus.materialVetoes.includes('EVIDENCE_IDENTITY_MISMATCH') || input.consensus.materialVetoes.includes('INVALID_EVIDENCE')) return 'IDENTITY_MISMATCH';
  if (input.context.evidenceCompleteness === 0) return 'DATA_MISSING';
  if (input.context.evidenceQuality === 'STALE') return 'DATA_STALE';
  if (input.consensus.leadingDirection === 'NEUTRAL' || !input.context.primaryThesis) return 'THESIS_CONFLICT';
  if (input.context.eligibleDirections.length === 0) return 'REGIME_UNCERTAIN';
  if (!input.eligible.length || input.opportunity.possibleDirections.length === 0) return 'NO_OPPORTUNITY';
  return undefined;
}

function defaultPolicy(): CommanderPolicyV1 {
  return {
    version: 'commander_policy_v1',
    maturity: 'SHADOW',
    shadowOnly: true,
    maxSelectedStrategies: 3,
    requiredEvidenceFamilies: ['MOMENTUM', 'PRICE_ACTION', 'SMART_MONEY', 'LIQUIDITY'],
    safety: COMMANDER_SAFETY,
  };
}

/** Calculates a static, non-authoritative Commander recommendation from existing registry metadata. */
export function buildStrategyCommanderDecision(input: {
  consensus: IntelligenceConsensusV1;
  opportunity: OpportunityCandidateV1;
  definitions?: readonly StrategyDefinition[];
  policy?: CommanderPolicyV1;
  universe?: readonly string[];
  parameterProfileFingerprints?: Readonly<Record<string, string>>;
  observedStrategyCompetence?: Readonly<Record<string, StrategyCompetenceV1>>;
}): StrategyCommanderDecisionV1 {
  const policy = input.policy ?? defaultPolicy();
  const definitions = [...(input.definitions ?? listStrategyDefinitions())];
  const context = buildCommanderMarketContext(input.consensus, input.opportunity);
  const suppressed: CommanderSuppressedStrategyV1[] = [];
  const eligible: StrategyDefinition[] = [];
  for (const definition of definitions) {
    if (definition.status === 'blocked' || definition.status === 'deprecated') {
      suppressed.push({ strategyId: definition.strategyId, reason: `registry_status:${definition.status}` });
      continue;
    }
    if (!definition.supportedIntervals.some((interval) => interval === input.opportunity.horizon)) {
      suppressed.push({ strategyId: definition.strategyId, reason: `unsupported_horizon:${input.opportunity.horizon}` });
      continue;
    }
    if (!context.preferredDirection || !supportsDirection(definition, context.preferredDirection)) {
      suppressed.push({ strategyId: definition.strategyId, reason: 'direction_not_supported_by_current_context' });
      continue;
    }
    eligible.push(definition);
  }
  const abstain = abstainReason({ context, consensus: input.consensus, opportunity: input.opportunity, eligible });
  const rankings = eligible.map<CommanderRankingV1>((definition) => {
    const longTermQuality = researchQuality(definition);
    const evidenceQuality = qualityScore[context.evidenceQuality];
    const observedCompetence = input.observedStrategyCompetence?.[definition.strategyId];
    const participationScore = round(longTermQuality * 0.45
      + context.confidence * 0.3
      + context.evidenceCompleteness * 0.15
      + evidenceQuality * 0.1);
    return {
      strategyId: definition.strategyId,
      strategyVersion: String(definition.version),
      participationScore,
      participationWeight: 0,
      competence: observedCompetence?.competence ?? 0.5,
      competenceSampleCount: observedCompetence?.sampleCount ?? 0,
      confidence: round(context.confidence * 0.7 + longTermQuality * 0.3),
      evidenceQuality,
      reasons: [
        'registry_metadata_compatible',
        `long_term_research_quality:${longTermQuality.toFixed(4)}`,
        observedCompetence
          ? `competence_observation:${observedCompetence.status.toLowerCase()}:${observedCompetence.contextLevel.toLowerCase()}`
          : 'competence_observation_not_available',
        'competence_does_not_affect_participation_score',
        'shadow_only:true',
      ],
    };
  }).sort((left, right) => right.participationScore - left.participationScore || left.strategyId.localeCompare(right.strategyId));
  const selected = abstain ? [] : rankings.slice(0, policy.maxSelectedStrategies);
  const selectedScore = selected.reduce((sum, ranking) => sum + ranking.participationScore, 0);
  const selectedIds = new Set(selected.map((ranking) => ranking.strategyId));
  const weightedRankings = rankings.map((ranking) => ({
    ...ranking,
    participationWeight: selectedIds.has(ranking.strategyId) && selectedScore > 0 ? round(ranking.participationScore / selectedScore) : 0,
  }));
  for (const ranking of rankings) {
    if (!selectedIds.has(ranking.strategyId)) suppressed.push({ strategyId: ranking.strategyId, reason: 'shadow_selection_cap' });
  }
  const identity: StrategyCommanderIdentityV1 = {
    version: COMMANDER_IDENTITY_VERSION,
    commanderVersion: STRATEGY_COMMANDER_SHADOW_VERSION,
    commanderStateRevision: STRATEGY_COMMANDER_SHADOW_REVISION,
    symbol: input.opportunity.symbol,
    time: input.consensus.timestamp,
    universe: [...(input.universe ?? [input.opportunity.symbol])],
    regime: context.regime,
    thesis: context.primaryThesis ?? null,
    direction: context.preferredDirection ?? null,
    trendRelation: context.trendRelation,
    evidenceIds: input.consensus.evidenceIds,
    expertVersions: Object.fromEntries(input.consensus.trust.map((entry) => [entry.expertId, entry.version])),
    strategyIds: eligible.map((definition) => definition.strategyId),
    strategyVersions: Object.fromEntries(eligible.map((definition) => [definition.strategyId, String(definition.version)])),
    parameterProfiles: Object.fromEntries(eligible.map((definition) => [
      definition.strategyId,
      input.parameterProfileFingerprints?.[definition.strategyId] ?? strategyParameterProfileFingerprint(definition),
    ])),
  };
  const decisionId = commanderIdentityFingerprint(identity);
  return {
    decisionId,
    timestamp: input.consensus.timestamp,
    symbol: input.opportunity.symbol,
    opportunityFingerprint: input.opportunity.fingerprint,
    evidenceFingerprint: input.consensus.fingerprint,
    marketContext: context,
    eligibleStrategies: eligible.map((definition) => definition.strategyId).sort(),
    rankings: weightedRankings,
    selectedStrategies: selected.map((ranking) => ranking.strategyId),
    suppressedStrategies: suppressed.sort((left, right) => left.strategyId.localeCompare(right.strategyId) || left.reason.localeCompare(right.reason)),
    abstain: Boolean(abstain),
    abstainReason: abstain,
    commanderVersion: STRATEGY_COMMANDER_SHADOW_VERSION,
    commanderStateRevision: STRATEGY_COMMANDER_SHADOW_REVISION,
    safety: { shadowOnly: true, ...COMMANDER_SAFETY },
  };
}

export function buildStrategyCommanderScanShadow(input: {
  timestamp: number;
  results: readonly StrategyCommanderDecisionV1[];
  failures?: ReadonlyArray<{ symbol: string; reason: 'commander_evaluation_failed' }>;
  evidenceCompetence?: readonly EvidenceCompetenceV1[];
}): StrategyCommanderScanShadowV1 {
  const unsigned = {
    version: 'strategy_commander_scan_shadow_v1' as const,
    timestamp: new Date(input.timestamp).toISOString(),
    shadowOnly: true as const,
    authoritativeSelection: 'CURRENT_APEX_CANDIDATES' as const,
    results: [...input.results].sort((left, right) => left.symbol.localeCompare(right.symbol)),
    evidenceCompetence: [...(input.evidenceCompetence ?? [])].sort((left, right) => left.symbol.localeCompare(right.symbol) || left.expertId.localeCompare(right.expertId) || left.evidenceId.localeCompare(right.evidenceId)),
    failures: [...(input.failures ?? [])].sort((left, right) => left.symbol.localeCompare(right.symbol)),
  };
  return { ...unsigned, fingerprint: parliamentFingerprint(unsigned) };
}
