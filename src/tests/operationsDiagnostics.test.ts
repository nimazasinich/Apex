import { describe, expect, it } from 'vitest';
import type { OperationsDiagnosticsSnapshot } from '../services/operationsDiagnostics';
import {
  countUsableDiagnostics,
  diagnosticsErrorSummary,
  mergeOperationsDiagnostics,
  selectFastAdaptiveHorizon,
  summarizeOperationsDiagnostics,
} from '../services/operationsDiagnostics';
import type { FastAdaptiveShadowRecommendation } from '../services/fastAdaptiveShadowController';

const horizon = (sampleSize: number, regime = 'UNKNOWN') => ({
  horizonMs: 60_000,
  sampleSize,
  accepted: 0,
  rejected: sampleSize,
  acceptanceRate: 0,
  resolvedAccepted: 0,
  winRate: null,
  avgPnl: null,
  gateRejectRate: 0,
  squeezeRejectRate: 0,
  smcRejectRate: 0,
  regime: regime as any,
});

const recommendation: FastAdaptiveShadowRecommendation = {
  version: 1,
  generatedAt: 1,
  generatedAtIso: new Date(1).toISOString(),
  shadowOnly: true,
  active: false,
  minimumSamples: 24,
  sourceHorizon: '5m',
  oneMinute: horizon(3),
  fiveMinute: { ...horizon(28, 'TREND_DOWN'), horizonMs: 300_000 },
  recommendedConfig: {} as any,
  changes: [],
  reasonSummary: [],
};

describe('operations diagnostics aggregation', () => {
  it('selects the declared adaptive source horizon', () => {
    expect(selectFastAdaptiveHorizon(recommendation)?.sampleSize).toBe(28);
  });

  it('falls back to the fuller window when no source is active', () => {
    const pending = { ...recommendation, sourceHorizon: 'none' as const, oneMinute: horizon(7), fiveMinute: horizon(13) };
    expect(selectFastAdaptiveHorizon(pending)?.sampleSize).toBe(13);
  });

  it('keeps partial diagnostics usable and reports only failed sections', () => {
    const snapshot = {
      generatedAt: 1,
      health: { data: { uptimeSeconds: 5 } as any, error: null },
      operations: { data: null, error: 'ops_failed' },
      fastAdaptive: { data: { recommendation } as any, error: null },
      streaming: { data: null, error: 'stream_failed' },
      marketStatistics: { data: null, error: null },
    } satisfies OperationsDiagnosticsSnapshot;

    expect(countUsableDiagnostics(snapshot)).toBe(2);
    expect(diagnosticsErrorSummary(snapshot)).toContain('operations: ops_failed');
    expect(diagnosticsErrorSummary(snapshot)).toContain('streaming: stream_failed');
  });


  it('preserves last-known data when one refresh resource fails', () => {
    const previous = {
      generatedAt: 1,
      health: { data: { uptimeSeconds: 5 } as any, error: null },
      operations: { data: { service: { status: 'READY' } } as any, error: null },
      fastAdaptive: { data: null, error: null },
      streaming: { data: null, error: null },
      marketStatistics: { data: null, error: null },
    } satisfies OperationsDiagnosticsSnapshot;
    const incoming = {
      generatedAt: 2,
      health: { data: null, error: 'timeout' },
      operations: { data: null, error: 'timeout' },
      fastAdaptive: { data: { recommendation } as any, error: null },
      streaming: { data: null, error: null },
      marketStatistics: { data: null, error: null },
    } satisfies OperationsDiagnosticsSnapshot;

    const merged = mergeOperationsDiagnostics(previous, incoming);
    expect(merged.health.data?.uptimeSeconds).toBe(5);
    expect(merged.operations.data?.service.status).toBe('READY');
    expect(merged.health.error).toBe('timeout');
    expect(merged.fastAdaptive.data?.recommendation.sourceHorizon).toBe('5m');
  });

  it('summarizes fail-closed defaults without inventing operational data', () => {
    const summary = summarizeOperationsDiagnostics(null);
    expect(summary.serviceStatus).toBe('UNAVAILABLE');
    expect(summary.decisionRows).toBeNull();
    expect(summary.streamingEnabled).toBeNull();
    expect(summary.adaptiveRegime).toBe('UNKNOWN');
  });
});
