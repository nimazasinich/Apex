/**
 * Persists shadow comparison logs from candidate scans to browser decision memory.
 */
import type { CandidateScore, SignalDecisionLog, TradeDirection } from '../types';
import { DecisionMemoryDB } from './decisionMemory';
import { decisionSnapshotToLog, type ShadowComparisonSummary } from './decisionSnapshotLogger';
import type { DecisionSnapshot } from './canonicalDecisionAdapter';
import { buildCanonicalDecision, type LiveShadowMarketContext } from './canonicalDecisionAdapter';
import type { OpportunityShortlistComparisonV1 } from './strategyCommander/opportunity/opportunityTypes';
import type { ParliamentScanShadowV1 } from './strategyCommander/parliamentShadow';

export interface CandidateScanPayload {
  longCandidates?: CandidateScore[];
  shortCandidates?: CandidateScore[];
  scanTimestamp?: number;
  shadowMode?: boolean;
  opportunityShadow?: OpportunityShortlistComparisonV1;
  intelligenceParliamentShadow?: ParliamentScanShadowV1;
}

export function attachOpportunityShadowComparison(
  logs: SignalDecisionLog[],
  comparison: OpportunityShortlistComparisonV1 | undefined,
): SignalDecisionLog[] {
  if (!comparison || !logs.length) return logs;
  return logs.map((log, index) => index === 0 ? {
    ...log,
    marketSnapshotSummary: {
      ...(log.marketSnapshotSummary || {}),
      opportunityDiscovery: comparison,
    },
  } : log);
}

export function attachIntelligenceParliamentShadow(
  logs: SignalDecisionLog[],
  parliament: ParliamentScanShadowV1 | undefined,
): SignalDecisionLog[] {
  if (!parliament || !logs.length) return logs;
  return logs.map((log, index) => index === 0 ? {
    ...log,
    marketSnapshotSummary: {
      ...(log.marketSnapshotSummary || {}),
      intelligenceParliament: parliament,
    },
  } : log);
}

/** Reconstruct minimal snapshot from API candidate for logging when full snapshot isn't returned. */
function snapshotFromCandidate(candidate: CandidateScore, scanTimestamp: number): DecisionSnapshot {
  return {
    symbol: candidate.symbol,
    direction: candidate.guardPass && candidate.readinessTier !== 'BLOCKED' ? candidate.direction : 'NO_TRADE',
    rankingScore: candidate.score,
    confidence: candidate.canonicalDecision?.confidence ?? Math.max(0.01, Math.min(0.99, (candidate.featureCompletenessPct ?? 0) / 100)),
    calibratedProbability: candidate.canonicalDecision?.calibratedProbability ?? null,
    expectedNetEdge: candidate.canonicalDecision?.expectedNetEdge ?? null,
    modelUncertainty: candidate.canonicalDecision?.modelUncertainty ?? null,
    featureCompletenessPct: candidate.canonicalDecision?.featureCompletenessPct ?? candidate.featureCompletenessPct ?? 0,
    supportingSignals: [],
    conflictingSignals: candidate.guardReasons,
    dataQuality: candidate.dataState,
    engineVersion: candidate.canonicalDecision?.engineVersion ?? candidate.shadowDecision?.engineVersion ?? 'canonical_v2',
    createdAt: candidate.canonicalDecision?.createdAt ?? scanTimestamp,
    expiresAt: candidate.canonicalDecision?.expiresAt ?? scanTimestamp + 90_000,
    baseline: candidate,
    shadow: candidate.shadowDecision,
    smcAvailability: candidate.shadowDecision?.smcAvailability,
    smartMoneyContext: null,
    mode: 'live',
  };
}

export async function persistCandidateShadowLogs(
  payload: CandidateScanPayload,
  cycleId?: string,
): Promise<{ persisted: number; divergences: ShadowComparisonSummary[] }> {
  const scanTimestamp = payload.scanTimestamp ?? Date.now();
  const id = cycleId ?? `scan-${scanTimestamp}`;
  const logs: SignalDecisionLog[] = [];
  const divergences: ShadowComparisonSummary[] = [];

  const append = (candidate: CandidateScore, direction: TradeDirection) => {
    if (!payload.shadowMode && !candidate.shadowDecision && !candidate.directionDivergenceShadow && !candidate.signalId) return;
    const snapshot = snapshotFromCandidate(candidate, scanTimestamp);
    const log = decisionSnapshotToLog(snapshot, direction, id);
    log.signalId = candidate.signalId;
    log.directionDivergence = candidate.directionDivergenceShadow?.category;
    log.directionDivergenceDetail = candidate.directionDivergenceShadow;
    log.signalLifecycleState = candidate.signalLifecycle?.state;
    log.marketSnapshotSummary = {
      ...(log.marketSnapshotSummary || {}),
      signalId: candidate.signalId ?? null,
      directionDivergence: candidate.directionDivergenceShadow ?? null,
      signalLifecycle: candidate.signalLifecycle ?? null,
      observabilityMode: 'shadow-only',
    };
    logs.push(log);
    const summary = log.marketSnapshotSummary?.comparison as ShadowComparisonSummary | undefined;
    if (summary && !summary.agreement) divergences.push(summary);
  };

  for (const c of payload.longCandidates ?? []) append(c, 'LONG');
  for (const c of payload.shortCandidates ?? []) append(c, 'SHORT');

  const persistedLogs = attachIntelligenceParliamentShadow(
    attachOpportunityShadowComparison(logs, payload.opportunityShadow),
    payload.intelligenceParliamentShadow,
  );
  if (persistedLogs.length) await DecisionMemoryDB.bulkPut(persistedLogs);
  return { persisted: persistedLogs.length, divergences };
}

export { buildCanonicalDecision, type LiveShadowMarketContext, type DecisionSnapshot };
