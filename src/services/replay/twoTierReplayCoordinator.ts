import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { LiquidityHunterFeatureFlags } from '../liquidityHunter/featureFlags';
import { runLiquidityHunterResearchReplay, type ResearchReplayResult } from './researchReplayRunner';
import { runLiquidityHunterAuthoritativeReplay, type AuthoritativeReplayResult, type AuthoritativeReplayInput } from './authoritativeReplayRunner';
import type { ReplayDatasetManifest } from './replayDatasetManifest';

export interface TwoTierReplayResult {
  version: 'lh_two_tier_replay_v1';
  symbol: string;
  fast: ResearchReplayResult;
  advancedToAuthoritative: boolean;
  advancementEvidence: {
    maxFusionScore: number;
    maxPassedLayers: number;
    manualConfirmationCandidates: number;
    minimumFastFusionScore: number;
    minimumPassedLayers: number;
    requireManualConfirmationCandidate: boolean;
    blockers: string[];
  };
  authoritative: AuthoritativeReplayResult | null;
  deterministicFingerprint: string;
  researchOnly: true;
  executionAuthorized: false;
}

export async function runTwoTierLiquidityHunterReplay(input: {
  events: MarketEvent[];
  symbol: string;
  flags: LiquidityHunterFeatureFlags;
  manifest?: ReplayDatasetManifest;
  fast?: { sampleBucketMs?: number; maxEvents?: number; evaluateEveryEvents?: number };
  advancement?: { minimumFastFusionScore?: number; minimumPassedLayers?: number; requireManualConfirmationCandidate?: boolean };
  authoritative?: Omit<AuthoritativeReplayInput, 'events' | 'symbol' | 'flags' | 'manifest'>;
}): Promise<TwoTierReplayResult> {
  const symbol = input.symbol.toUpperCase();
  const fast = await runLiquidityHunterResearchReplay({
    events: input.events,
    symbol,
    flags: input.flags,
    manifest: input.manifest,
    sampleBucketMs: input.fast?.sampleBucketMs,
    maxEvents: input.fast?.maxEvents,
    evaluateEveryEvents: input.fast?.evaluateEveryEvents,
  });
  const evaluations = fast.replay.evaluations;
  const maxFusionScore = evaluations.reduce((max, row) => Math.max(max, row.fusionScore), 0);
  const maxPassedLayers = evaluations.reduce((max, row) => Math.max(max, row.layers.filter((layer) => layer.status === 'PASSED').length), 0);
  const manualConfirmationCandidates = evaluations.filter((row) => row.eligibleForManualConfirmation).length;
  const minimumFastFusionScore = Math.max(0, Math.min(1, Number(input.advancement?.minimumFastFusionScore ?? 0.35)));
  const minimumPassedLayers = Math.max(0, Math.min(4, Math.floor(Number(input.advancement?.minimumPassedLayers ?? 1))));
  const requireManualConfirmationCandidate = input.advancement?.requireManualConfirmationCandidate === true;
  const blockers: string[] = [];
  if (maxFusionScore < minimumFastFusionScore) blockers.push('fast_fusion_score_below_advancement_threshold');
  if (maxPassedLayers < minimumPassedLayers) blockers.push('fast_passed_layer_count_below_threshold');
  if (requireManualConfirmationCandidate && manualConfirmationCandidates === 0) blockers.push('fast_manual_confirmation_candidate_required');
  const advancedToAuthoritative = blockers.length === 0;
  const authoritative = advancedToAuthoritative
    ? await runLiquidityHunterAuthoritativeReplay({
        events: input.events,
        symbol,
        flags: input.flags,
        manifest: input.manifest,
        ...(input.authoritative ?? {}),
      })
    : null;
  const deterministicFingerprint = createHash('sha256')
    .update(fast.deterministicFingerprint)
    .update(':')
    .update(authoritative?.deterministicFingerprint ?? blockers.join('|'))
    .update(`:${minimumFastFusionScore}:${minimumPassedLayers}:${requireManualConfirmationCandidate}`)
    .digest('hex');
  return {
    version: 'lh_two_tier_replay_v1',
    symbol,
    fast,
    advancedToAuthoritative,
    advancementEvidence: {
      maxFusionScore,
      maxPassedLayers,
      manualConfirmationCandidates,
      minimumFastFusionScore,
      minimumPassedLayers,
      requireManualConfirmationCandidate,
      blockers,
    },
    authoritative,
    deterministicFingerprint,
    researchOnly: true,
    executionAuthorized: false,
  };
}
