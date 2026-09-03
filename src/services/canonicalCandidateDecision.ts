import type { CandidateScore } from '../types';
import { computeTransactionCostPct } from './transactionCosts';

export type CanonicalCandidateState = NonNullable<CandidateScore['decisionState']>;

const STATE_BASE: Record<CanonicalCandidateState, number> = {
  SIGNAL: 500,
  QUALIFIED_SETUP: 400,
  WATCH: 300,
  ABSTAIN: 200,
  REJECTED: 100,
};

// Promotion thresholds are intentionally stricter than the watchlist gates.
// A visible SIGNAL must have complete multi-timeframe evidence and enough
// cost-adjusted edge to avoid promoting numerical noise around zero.
export const MIN_SIGNAL_CONFIDENCE = 0.72;
export const MIN_SIGNAL_COVERAGE_PCT = 75;
export const MIN_SIGNAL_NET_EDGE_PCT = 0.05;
export const MIN_SETUP_CONFIDENCE = 0.68;
export const MIN_SETUP_COVERAGE_PCT = 70;

export function canonicalCandidateState(candidate: CandidateScore, now = Date.now()): CanonicalCandidateState {
  const canonical = candidate.canonicalDecision;
  const expired = canonical?.expiresAt != null && canonical.expiresAt <= now;
  if (!candidate.guardPass || candidate.readinessTier === 'BLOCKED') return 'REJECTED';
  if (expired || candidate.dataState === 'unavailable' || candidate.dataState === 'not_configured') return 'ABSTAIN';

  const probability = canonical?.calibratedProbability;
  const netEdge = canonical?.expectedNetEdge;
  const confidence = canonical?.confidence ?? 0;
  const coverage = candidate.featureCompletenessPct ?? canonical?.featureCompletenessPct ?? 0;
  const confluence = candidate.timeframeConfluenceState
    ?? (candidate.timeframeConfluence === true ? 'ALIGNED' : 'UNAVAILABLE');
  if (
    candidate.readinessTier === 'CONFIRMED'
    && candidate.dataState === 'live'
    && probability != null
    && Number.isFinite(probability)
    && netEdge != null
    && Number.isFinite(netEdge)
    && netEdge >= MIN_SIGNAL_NET_EDGE_PCT
    && confidence >= MIN_SIGNAL_CONFIDENCE
    && coverage >= MIN_SIGNAL_COVERAGE_PCT
    && confluence === 'ALIGNED'
  ) return 'SIGNAL';

  if (
    candidate.readinessTier === 'CONFIRMED'
    && candidate.dataState === 'live'
    && confidence >= MIN_SETUP_CONFIDENCE
    && coverage >= MIN_SETUP_COVERAGE_PCT
    && confluence !== 'CONFLICTING'
    && confluence !== 'UNAVAILABLE'
  ) return 'QUALIFIED_SETUP';

  if (candidate.readinessTier === 'CONFIRMED' || candidate.readinessTier === 'WATCHLIST') return 'WATCH';
  return 'ABSTAIN';
}

export function canonicalCandidateRankScore(candidate: CandidateScore, now = Date.now()): number {
  const state = canonicalCandidateState(candidate, now);
  const score = Number.isFinite(candidate.score) ? Math.max(0, Math.min(100, candidate.score)) : 0;
  const netEdge = candidate.canonicalDecision?.expectedNetEdge;
  const edgeBonus = netEdge != null && Number.isFinite(netEdge) ? Math.max(-10, Math.min(10, netEdge)) : 0;
  const coverage = candidate.featureCompletenessPct ?? candidate.canonicalDecision?.featureCompletenessPct ?? 0;
  const coverageBonus = Number.isFinite(coverage) ? Math.max(0, Math.min(100, coverage)) / 100 : 0;
  const confidence = candidate.canonicalDecision?.confidence;
  const probability = candidate.canonicalDecision?.calibratedProbability;
  const uncertainty = candidate.canonicalDecision?.modelUncertainty;
  const agreement = candidate.canonicalDecision?.modelAgreement;
  const confidenceBonus = confidence != null && Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) * 4 : 0;
  const probabilityBonus = probability != null && Number.isFinite(probability) ? Math.max(0, Math.min(1, probability)) * 3 : 0;
  const uncertaintyPenalty = uncertainty != null && Number.isFinite(uncertainty) ? Math.max(0, Math.min(1, uncertainty)) * 3 : 0;
  const agreementBonus = agreement != null && Number.isFinite(agreement) ? Math.max(0, Math.min(1, agreement)) * 2 : 0;
  return Number((STATE_BASE[state] + score + edgeBonus + coverageBonus + confidenceBonus + probabilityBonus + agreementBonus - uncertaintyPenalty).toFixed(4));
}

export function withCanonicalCandidateAuthority(candidate: CandidateScore, now = Date.now()): CandidateScore {
  const decisionState = canonicalCandidateState(candidate, now);
  return {
    ...candidate,
    decisionState,
    canonicalRankScore: canonicalCandidateRankScore(candidate, now),
  };
}

/**
 * Derive probability-weighted net edge from the candidate's actual entry,
 * stop, target and observable costs. Missing calibration, geometry, spread or
 * funding stays null: the scanner must abstain instead of inventing an edge.
 */
export function withCandidateExpectedNetEdge(
  candidate: CandidateScore,
  market: { spread: number | null | undefined; fundingRate: number | null | undefined; holdingBars?: number },
): CandidateScore {
  const canonical = candidate.canonicalDecision;
  const probability = canonical?.calibratedProbability;
  const context = candidate.lifecycleContext;
  const entry = context?.entryPrice;
  const stop = context?.stopLoss;
  const target = context?.takeProfit;
  if (
    !canonical
    || probability == null
    || probability < 0
    || probability > 1
    || !Number.isFinite(entry)
    || !Number.isFinite(stop)
    || !Number.isFinite(target)
    || Number(entry) <= 0
    || market.spread == null
    || !Number.isFinite(market.spread)
    || market.fundingRate == null
    || !Number.isFinite(market.fundingRate)
  ) return candidate;

  const entryPrice = Number(entry);
  const stopPrice = Number(stop);
  const targetPrice = Number(target);
  const validGeometry = candidate.direction === 'LONG'
    ? stopPrice < entryPrice && targetPrice > entryPrice
    : stopPrice > entryPrice && targetPrice < entryPrice;
  if (!validGeometry) return candidate;

  const winPct = (Math.abs(targetPrice - entryPrice) / entryPrice) * 100;
  const lossPct = (Math.abs(entryPrice - stopPrice) / entryPrice) * 100;
  const costPct = computeTransactionCostPct({
    entryPrice,
    holdingBars: market.holdingBars ?? 8,
    feePct: 0.12,
    spread: market.spread,
    fundingRate: market.fundingRate,
    // No entry/exit timestamps exist at candidate-ranking time, so funding is
    // deliberately excluded here rather than inferred from holdingBars.
    fundingAccountingMode: 'NONE',
    spreadMultiplier: 1,
    slippageMultiplier: 1,
  });
  const expectedNetEdge = probability * winPct - (1 - probability) * lossPct - costPct;
  return {
    ...candidate,
    canonicalDecision: { ...canonical, expectedNetEdge: Number(expectedNetEdge.toFixed(6)) },
  };
}

export function compareCanonicalCandidates(left: CandidateScore, right: CandidateScore): number {
  const leftRank = left.canonicalRankScore ?? canonicalCandidateRankScore(left);
  const rightRank = right.canonicalRankScore ?? canonicalCandidateRankScore(right);
  return rightRank - leftRank || right.score - left.score || left.direction.localeCompare(right.direction);
}
