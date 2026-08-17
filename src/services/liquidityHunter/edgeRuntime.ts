import type { EdgeEvidence, EdgeId, EdgeDirection, EdgeStatus } from '../../contracts/realtime/edgeEvidence';
import type { MetaModelEvaluationPayload } from '../../contracts/realtime/marketPayloads';
import type { WorldStateStore } from '../realtime/worldStateStore';
import type { RealtimeSeriesStore } from '../realtime/realtimeSeriesStore';
import type { OrderBookRebuilder } from '../realtime/orderBookRebuilder';
import type { SmartMoneyContext } from '../../types';

export interface LiquidityHunterEdgeContext {
  symbol: string;
  now: number;
  worldState: WorldStateStore;
  seriesStore: RealtimeSeriesStore;
  orderBook: OrderBookRebuilder;
  smartMoneyContext?: SmartMoneyContext | null;
  metaModelEvaluation?: MetaModelEvaluationPayload | null;
  currentPrice?: number | null;
}

export type LiquidityHunterEdgeEvaluator = (context: LiquidityHunterEdgeContext) => EdgeEvidence | Promise<EdgeEvidence>;

export interface EdgeEvidenceBuildInput {
  edgeId: EdgeId;
  status: EdgeStatus;
  direction?: EdgeDirection;
  score?: number | null;
  dataQuality?: number;
  observedAt?: number;
  expiresAt?: number;
  sourceVersion?: string;
  supportingReasons?: string[];
  conflictingReasons?: string[];
  rawEventIds?: string[];
  metadata?: Record<string, unknown>;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function buildEdgeEvidence(input: EdgeEvidenceBuildInput, now = Date.now()): EdgeEvidence {
  return {
    edgeId: input.edgeId,
    status: input.status,
    direction: input.direction ?? null,
    score: input.score === undefined ? null : input.score === null ? null : clamp01(input.score),
    dataQuality: clamp01(input.dataQuality ?? (input.status === 'PASS' || input.status === 'FAIL' ? 1 : 0)),
    observedAt: input.observedAt ?? now,
    expiresAt: input.expiresAt ?? now,
    sourceVersion: input.sourceVersion ?? 'liquidity-hunter-core-v1',
    supportingReasons: [...(input.supportingReasons ?? [])],
    conflictingReasons: [...(input.conflictingReasons ?? [])],
    rawEventIds: [...(input.rawEventIds ?? [])],
    metadata: input.metadata ? structuredClone(input.metadata) : undefined,
  };
}

export function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function pickNumber(payload: unknown, keys: string[]): number | null {
  if (typeof payload === 'number') return Number.isFinite(payload) ? payload : null;
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = finiteNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function stdDev(values: number[], average = mean(values)): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function weightedDirection(longWeight: number, shortWeight: number, neutralThreshold = 0.1): EdgeDirection {
  const total = Math.abs(longWeight) + Math.abs(shortWeight);
  if (total <= 0) return null;
  const imbalance = (longWeight - shortWeight) / total;
  if (imbalance > neutralThreshold) return 'LONG';
  if (imbalance < -neutralThreshold) return 'SHORT';
  return 'NEUTRAL';
}
