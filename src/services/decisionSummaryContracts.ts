/**
 * Shared decision-summary contracts.
 *
 * `ShadowDecisionSummary` used to live in canonicalDecisionAdapter.ts, but
 * liveSignalEnsemble.ts also needs its shape (type-only) while
 * canonicalDecisionAdapter.ts imports liveSignalEnsemble.ts for real (value)
 * use — that combination is a circular module dependency
 * (canonicalDecisionAdapter -> liveSignalEnsemble -> canonicalDecisionAdapter).
 * Hoisting the shared type into this dependency-free module lets both sides
 * import it without importing each other.
 */
import type { ScanDecisionTrace } from './scannerCore';
import type { FeatureQualityState, SmcAvailabilityState } from '../types';
import type { ShadowSupplementalEvidence } from './providers/supplementalTypes';

export interface ShadowDecisionSummary {
  status: ScanDecisionTrace['status'];
  direction: ScanDecisionTrace['direction'];
  reasonCode: ScanDecisionTrace['reasonCode'];
  reasonText: ScanDecisionTrace['reasonText'];
  confidence: number | null;
  rawScore: number | null;
  smcAvailability: SmcAvailabilityState;
  engineVersion: string;
  latencyMs?: number;
  inputQuality?: Record<string, FeatureQualityState>;
  squeezeRiskScore?: number | null;
  evidenceAgreementScore?: number | null;
  qStructDirectional?: number | null;
  atrExpansionScore?: number | null;
  fundingBiasScore?: number | null;
  oiChangePercent?: number | null;
  microPriceSkewScore?: number | null;
  liquidityQualityScore?: number | null;
  smcDirectionalScore?: number | null;
  smcContextScore?: number | null;
  scoringBreakdown?: Record<string, unknown> | null;
  gatesSnapshot?: ScanDecisionTrace['gatesSnapshot'];
  marketInputs?: { obi: number; volumeDelta: number; fundingRate: number; spread: number; atr: number; microPrice: number };
  /** Supplemental evidence is descriptive only and never enters the score. */
  shadowSupplementalEvidence?: ShadowSupplementalEvidence;
}
