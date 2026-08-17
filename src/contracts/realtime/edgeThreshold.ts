import type { EdgeId } from './edgeEvidence';

export type EdgeSymbolClass = 'BTC' | 'ETH' | 'LARGE_CAP' | 'MID_CAP' | 'LOW_LIQUIDITY';
export type EdgeThresholdPromotionState =
  | 'BASELINE'
  | 'SHADOW'
  | 'CANDIDATE'
  | 'PAPER_CANARY'
  | 'MANUALLY_PROMOTED'
  | 'ROLLED_BACK';

export interface EdgeThresholdProfile {
  id: string;
  edgeId: EdgeId;
  symbolClass: EdgeSymbolClass;
  timeframe: string;
  regime: string;
  baseline: number;
  candidate: number | null;
  min: number;
  max: number;
  step: number;
  sampleCount: number;
  minimumSamples: number;
  minimumRegimes: number;
  promotionState: EdgeThresholdPromotionState;
}

export function validateEdgeThresholdProfile(profile: EdgeThresholdProfile): string[] {
  const reasons: string[] = [];
  for (const [name, value] of Object.entries({
    baseline: profile.baseline,
    min: profile.min,
    max: profile.max,
    step: profile.step,
    sampleCount: profile.sampleCount,
    minimumSamples: profile.minimumSamples,
    minimumRegimes: profile.minimumRegimes,
  })) {
    if (!Number.isFinite(value)) reasons.push(`${name}_non_finite`);
  }
  if (profile.min > profile.max) reasons.push('invalid_bounds');
  if (profile.baseline < profile.min || profile.baseline > profile.max) reasons.push('baseline_out_of_bounds');
  if (profile.candidate !== null && (!Number.isFinite(profile.candidate)
      || profile.candidate < profile.min || profile.candidate > profile.max)) {
    reasons.push('candidate_out_of_bounds');
  }
  if (profile.step <= 0) reasons.push('step_must_be_positive');
  if (profile.sampleCount < 0 || profile.minimumSamples < 1 || profile.minimumRegimes < 1) {
    reasons.push('invalid_sample_requirements');
  }
  return reasons;
}
