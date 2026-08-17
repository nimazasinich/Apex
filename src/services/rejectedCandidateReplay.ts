/** Shadow-only counterfactual replay for rejected candidates. */
import type { SignalDecisionLog } from '../types';
import { MathEngine } from './mathEngine';

export const REJECTED_REPLAY_VERSION = 1;
export const DEFAULT_REPLAY_HORIZON_MS = 24 * 60 * 60 * 1000;

export interface PriceObservation {
  timestamp: number;
  price: number;
}

export interface ReplayGeometry {
  direction: 'SHORT' | 'LONG';
  entry: number;
  atr: number;
  stop: number;
  target: number;
  riskDistance: number;
  rewardDistance: number;
  targetR: number;
}

export type ReplayEligibilityReason =
  | 'not_rejected'
  | 'already_resolved'
  | 'direction_unavailable'
  | 'missing_price'
  | 'missing_atr';

export interface ReplayResolution {
  outcome: 'WIN' | 'LOSS' | 'EXPIRED' | 'UNKNOWN';
  pnlR: number | null;
  resolvedAt: number | null;
  resolvedPrice: number | null;
  geometry: ReplayGeometry;
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function replayIneligibilityReason(log: SignalDecisionLog): ReplayEligibilityReason | null {
  if (log.decision !== 'REJECTED') return 'not_rejected';
  if (log.laterOutcome && log.laterOutcome !== 'UNKNOWN') return 'already_resolved';
  if (log.direction !== 'SHORT' && log.direction !== 'LONG') return 'direction_unavailable';
  const snapshot = log.marketSnapshotSummary as Record<string, unknown> | undefined;
  const price = finitePositive(log.price) ? log.price : snapshot?.price;
  const atr = finitePositive(log.atr) ? log.atr : snapshot?.atr;
  if (!finitePositive(price)) return 'missing_price';
  if (!finitePositive(atr)) return 'missing_atr';
  return null;
}

export function buildRejectedReplayGeometry(log: SignalDecisionLog): ReplayGeometry | null {
  if (replayIneligibilityReason(log)) return null;
  const snapshot = log.marketSnapshotSummary as Record<string, unknown> | undefined;
  const entry = (finitePositive(log.price) ? log.price : snapshot?.price) as number;
  const atr = (finitePositive(log.atr) ? log.atr : snapshot?.atr) as number;
  const direction = log.direction as 'SHORT' | 'LONG';
  const levels = MathEngine.buildLevels(entry, atr, direction);
  const stop = levels.resistance[2];
  const target = levels.breakout[0];
  const riskDistance = Math.abs(stop - entry);
  const rewardDistance = Math.abs(target - entry);
  return {
    direction,
    entry,
    atr,
    stop,
    target,
    riskDistance,
    rewardDistance,
    targetR: riskDistance > 0 ? rewardDistance / riskDistance : 0,
  };
}

export function resolveRejectedReplay(
  log: SignalDecisionLog,
  observations: PriceObservation[],
  options: { horizonMs?: number } = {},
): ReplayResolution | null {
  const geometry = buildRejectedReplayGeometry(log);
  if (!geometry) return null;
  const horizonMs = Math.max(1, options.horizonMs ?? DEFAULT_REPLAY_HORIZON_MS);
  const deadline = log.timestamp + horizonMs;
  const ordered = observations
    .filter((row) => Number.isFinite(row.timestamp) && finitePositive(row.price) && row.timestamp > log.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp);
  const withinHorizon = ordered.filter((observation) => observation.timestamp <= deadline);

  for (const observation of withinHorizon) {
    const targetHit = geometry.direction === 'SHORT'
      ? observation.price <= geometry.target
      : observation.price >= geometry.target;
    const stopHit = geometry.direction === 'SHORT'
      ? observation.price >= geometry.stop
      : observation.price <= geometry.stop;
    if (targetHit) {
      return { outcome: 'WIN', pnlR: geometry.targetR, resolvedAt: observation.timestamp, resolvedPrice: observation.price, geometry };
    }
    if (stopHit) {
      return { outcome: 'LOSS', pnlR: -1, resolvedAt: observation.timestamp, resolvedPrice: observation.price, geometry };
    }
  }

  const horizonWasObserved = ordered.some((observation) => observation.timestamp >= deadline);
  if (horizonWasObserved) {
    return {
      outcome: 'EXPIRED',
      pnlR: 0,
      resolvedAt: deadline,
      resolvedPrice: withinHorizon.at(-1)?.price ?? null,
      geometry,
    };
  }
  return { outcome: 'UNKNOWN', pnlR: null, resolvedAt: null, resolvedPrice: null, geometry };
}

export function attachRejectedReplayOutcome(log: SignalDecisionLog, resolution: ReplayResolution): SignalDecisionLog {
  if (resolution.outcome === 'UNKNOWN') return log;
  return {
    ...log,
    laterOutcome: resolution.outcome,
    laterPnl: resolution.pnlR ?? undefined,
    marketSnapshotSummary: {
      ...(log.marketSnapshotSummary ?? {}),
      rejectedReplay: {
        version: REJECTED_REPLAY_VERSION,
        resolvedAt: resolution.resolvedAt,
        resolvedPrice: resolution.resolvedPrice,
        entry: resolution.geometry.entry,
        stop: resolution.geometry.stop,
        target: resolution.geometry.target,
        targetR: resolution.geometry.targetR,
      },
    },
  };
}

export function summarizeReplayEligibility(logs: SignalDecisionLog[]) {
  const rejected = logs.filter((log) => log.decision === 'REJECTED');
  const byReason: Record<string, number> = {};
  let eligible = 0;
  let alreadyResolved = 0;
  let ineligible = 0;
  for (const log of rejected) {
    const reason = replayIneligibilityReason(log);
    if (!reason) { eligible += 1; continue; }
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    if (reason === 'already_resolved') alreadyResolved += 1;
    else ineligible += 1;
  }
  return { total: rejected.length, eligible, alreadyResolved, ineligible, byReason };
}

export function batchResolveRejectedReplays(
  logs: SignalDecisionLog[],
  observationsByTicker: Record<string, PriceObservation[]>,
  options: { horizonMs?: number } = {},
): { logs: SignalDecisionLog[]; resolvedCount: number } {
  let resolvedCount = 0;
  const next = logs.map((log) => {
    if (replayIneligibilityReason(log)) return log;
    const resolution = resolveRejectedReplay(log, observationsByTicker[log.ticker] ?? [], options);
    if (!resolution || resolution.outcome === 'UNKNOWN') return log;
    resolvedCount += 1;
    return attachRejectedReplayOutcome(log, resolution);
  });
  return { logs: next, resolvedCount };
}
