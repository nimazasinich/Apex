import type { SystemHealthReport } from '../types';
import type { FastAdaptiveHorizonSummary, FastAdaptiveShadowRecommendation } from './fastAdaptiveShadowController';
import type { OperationsStatusContract } from './operationsStatus';
import type { TrackedSymbolStatisticsSnapshot } from './onlineStatistics';
import { fetchJsonWithTimeout } from './apiQuery';

export interface MarketStreamingStatusResponse {
  ok: boolean;
  kucoinPublicStreaming: {
    enabled: boolean;
    defaultEnabled: boolean;
    mode: string;
    sequenceValidation: boolean;
    gapPolicy: string;
    executionDependency: boolean;
  };
}

export interface MarketStatisticsStatusResponse {
  ok: boolean;
  shadowOnly: true;
  executionDependency: false;
  symbolCount: number;
  rows: TrackedSymbolStatisticsSnapshot[];
  generatedAt: string;
}

export interface FastAdaptiveShadowResponse {
  ok: boolean;
  recommendation: FastAdaptiveShadowRecommendation;
  applied: false;
  note: string;
}

export interface DiagnosticsResource<T> {
  data: T | null;
  error: string | null;
}

export interface OperationsDiagnosticsSnapshot {
  generatedAt: number;
  health: DiagnosticsResource<SystemHealthReport>;
  operations: DiagnosticsResource<OperationsStatusContract>;
  fastAdaptive: DiagnosticsResource<FastAdaptiveShadowResponse>;
  streaming: DiagnosticsResource<MarketStreamingStatusResponse>;
  marketStatistics: DiagnosticsResource<MarketStatisticsStatusResponse>;
}

export interface OperationsDiagnosticsSummary {
  usableResources: number;
  serviceStatus: string;
  configuredProviders: number | null;
  healthyProviders: number | null;
  decisionRows: number | null;
  resolvedDecisions: number | null;
  adaptiveSource: '1m' | '5m' | 'none';
  adaptiveSamples: number;
  adaptiveRegime: string;
  adaptiveChanges: number;
  streamingEnabled: boolean | null;
  streamingExecutionIndependent: boolean | null;
  trackedSymbols: number | null;
}

async function readResource<T>(url: string, signal?: AbortSignal): Promise<DiagnosticsResource<T>> {
  try {
    const data = await fetchJsonWithTimeout<T>(url, { signal, timeoutMs: 10_000 });
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'diagnostic_request_failed',
    };
  }
}

export async function fetchOperationsDiagnostics(signal?: AbortSignal): Promise<OperationsDiagnosticsSnapshot> {
  const [health, operations, fastAdaptive, streaming, marketStatistics] = await Promise.all([
    readResource<SystemHealthReport>('/api/system/health', signal),
    readResource<OperationsStatusContract>('/api/operations/status', signal),
    readResource<FastAdaptiveShadowResponse>('/api/operations/adaptive-thresholds/fast-shadow?minSamples=24', signal),
    readResource<MarketStreamingStatusResponse>('/api/operations/market-streaming', signal),
    readResource<MarketStatisticsStatusResponse>('/api/operations/market-statistics?limit=12', signal),
  ]);

  return {
    generatedAt: Date.now(),
    health,
    operations,
    fastAdaptive,
    streaming,
    marketStatistics,
  };
}


export function mergeOperationsDiagnostics(
  previous: OperationsDiagnosticsSnapshot | null | undefined,
  incoming: OperationsDiagnosticsSnapshot,
): OperationsDiagnosticsSnapshot {
  if (!previous) return incoming;
  const merge = <T>(oldResource: DiagnosticsResource<T>, nextResource: DiagnosticsResource<T>): DiagnosticsResource<T> => ({
    data: nextResource.data ?? oldResource.data,
    error: nextResource.error,
  });
  return {
    generatedAt: incoming.generatedAt,
    health: merge(previous.health, incoming.health),
    operations: merge(previous.operations, incoming.operations),
    fastAdaptive: merge(previous.fastAdaptive, incoming.fastAdaptive),
    streaming: merge(previous.streaming, incoming.streaming),
    marketStatistics: merge(previous.marketStatistics, incoming.marketStatistics),
  };
}

export function selectFastAdaptiveHorizon(
  recommendation: FastAdaptiveShadowRecommendation | null | undefined,
): FastAdaptiveHorizonSummary | null {
  if (!recommendation) return null;
  if (recommendation.sourceHorizon === '1m') return recommendation.oneMinute;
  if (recommendation.sourceHorizon === '5m') return recommendation.fiveMinute;
  return recommendation.fiveMinute.sampleSize >= recommendation.oneMinute.sampleSize
    ? recommendation.fiveMinute
    : recommendation.oneMinute;
}

export function countUsableDiagnostics(snapshot: OperationsDiagnosticsSnapshot | null | undefined): number {
  if (!snapshot) return 0;
  return [snapshot.health.data, snapshot.operations.data, snapshot.fastAdaptive.data, snapshot.streaming.data, snapshot.marketStatistics.data]
    .filter(Boolean).length;
}

export function diagnosticsErrorSummary(snapshot: OperationsDiagnosticsSnapshot | null | undefined): string | null {
  if (!snapshot) return null;
  const errors = [
    snapshot.health.error ? `health: ${snapshot.health.error}` : null,
    snapshot.operations.error ? `operations: ${snapshot.operations.error}` : null,
    snapshot.fastAdaptive.error ? `adaptive: ${snapshot.fastAdaptive.error}` : null,
    snapshot.streaming.error ? `streaming: ${snapshot.streaming.error}` : null,
    snapshot.marketStatistics.error ? `market statistics: ${snapshot.marketStatistics.error}` : null,
  ].filter((value): value is string => Boolean(value));
  return errors.length ? errors.join(' · ') : null;
}

export function summarizeOperationsDiagnostics(
  snapshot: OperationsDiagnosticsSnapshot | null | undefined,
): OperationsDiagnosticsSummary {
  const operations = snapshot?.operations.data;
  const recommendation = snapshot?.fastAdaptive.data?.recommendation;
  const horizon = selectFastAdaptiveHorizon(recommendation);
  const streaming = snapshot?.streaming.data?.kucoinPublicStreaming;
  const marketStats = snapshot?.marketStatistics.data;

  return {
    usableResources: countUsableDiagnostics(snapshot),
    serviceStatus: operations?.service?.status ?? 'UNAVAILABLE',
    configuredProviders: operations?.providers?.summary?.configuredProviders ?? null,
    healthyProviders: operations?.providers?.summary?.configuredHealthyProviders ?? null,
    decisionRows: operations?.decisionMemory.stats?.total ?? null,
    resolvedDecisions: operations?.decisionMemory.stats?.resolved ?? null,
    adaptiveSource: recommendation?.sourceHorizon ?? 'none',
    adaptiveSamples: horizon?.sampleSize ?? 0,
    adaptiveRegime: horizon?.regime ?? 'UNKNOWN',
    adaptiveChanges: recommendation?.changes.length ?? 0,
    streamingEnabled: streaming ? streaming.enabled : null,
    streamingExecutionIndependent: streaming ? !streaming.executionDependency : null,
    trackedSymbols: marketStats?.symbolCount ?? null,
  };
}
