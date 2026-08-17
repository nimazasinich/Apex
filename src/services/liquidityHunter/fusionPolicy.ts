export interface LiquidityHunterFusionPolicy {
  version: string;
  shadowOnly: true;
  authoritative: false;
  automaticPromotionEnabled: false;
  majorityVoteAllowed: false;
  layer4MayRescueDeterministicFailure: false;
  requiredLayerOrder: readonly [1, 2, 3, 4];
  minimumDataQuality: number;
  maximumSentimentWeight: number;
  maximumMetaModelWeight: number;
  executionModes: readonly ['MANUAL', 'PAPER'];
  layerWeights: Readonly<Record<1 | 2 | 3 | 4, number>>;
}

export const LIQUIDITY_HUNTER_CORE_FUSION_POLICY: LiquidityHunterFusionPolicy = Object.freeze({
  version: 'liquidity-hunter-core-policy-v2',
  shadowOnly: true,
  authoritative: false,
  automaticPromotionEnabled: false,
  majorityVoteAllowed: false,
  layer4MayRescueDeterministicFailure: false,
  requiredLayerOrder: [1, 2, 3, 4] as const,
  minimumDataQuality: 0.75,
  maximumSentimentWeight: 0.1,
  maximumMetaModelWeight: 0.1,
  executionModes: ['MANUAL', 'PAPER'] as const,
  layerWeights: Object.freeze({ 1: 0.24, 2: 0.24, 3: 0.34, 4: 0.18 }),
});

// Backward-compatible export retained for source-contract and older callers.
export const LIQUIDITY_HUNTER_FOUNDATION_FUSION_POLICY = LIQUIDITY_HUNTER_CORE_FUSION_POLICY;
