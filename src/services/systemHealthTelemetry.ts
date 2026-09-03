import { buildRuntimeProviderCapabilityHealth } from '../contracts/providerCapabilityHealth';
import type { PrimaryProviderHealth } from './marketDataService';

interface CandidateScanTelemetry {
  activeCandidateCount: number;
  scanTimestamp: number;
}

let marketCacheQueries = 0;
let marketCacheHits = 0;
let lastCandidateScanTelemetry: CandidateScanTelemetry | null = null;

export function recordMarketCacheLookup(hit: boolean): void {
  marketCacheQueries += 1;
  if (hit) marketCacheHits += 1;
}

export function recordCandidateScanTelemetry(value: CandidateScanTelemetry): void {
  lastCandidateScanTelemetry = { ...value };
}

export function resetSystemHealthTelemetryForTests(): void {
  marketCacheQueries = 0;
  marketCacheHits = 0;
  lastCandidateScanTelemetry = null;
}

export function buildSystemHealthPayload(args: {
  primary: PrimaryProviderHealth;
  supplementalConfigured: boolean;
}) {
  const { primary, supplementalConfigured } = args;
  const providerCapabilities = buildRuntimeProviderCapabilityHealth({
    checkedAt: primary.checkedAt,
    kucoin: primary.kucoin,
    binance: primary.binance,
    supplementalConfigured,
  });
  const scan = lastCandidateScanTelemetry;
  return {
    checkedAt: primary.checkedAt,
    kucoinStatus: primary.kucoin.status,
    binanceStatus: primary.binance.status,
    kucoinLatencyMs: primary.kucoin.latencyMs,
    binanceLatencyMs: primary.binance.latencyMs,
    kucoinRoute: primary.kucoin.route,
    binanceRoute: primary.binance.route,
    sentimentStatus: supplementalConfigured ? 'degraded' : 'not_configured',
    cacheHitRatePct: marketCacheQueries > 0 ? (marketCacheHits / marketCacheQueries) * 100 : null,
    cacheTotalQueries: marketCacheQueries,
    cacheHits: marketCacheHits,
    telemetryState: {
      cache: 'AVAILABLE' as const,
      candidates: scan ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
      scans: scan ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
    },
    providerCapabilities,
    uptimeSeconds: Math.round(process.uptime()),
    lastErrorLog: [
      primary.binance.reason ? { timestamp: primary.checkedAt, source: 'binance', message: primary.binance.reason } : null,
      primary.kucoin.reason ? { timestamp: primary.checkedAt, source: 'kucoin', message: primary.kucoin.reason } : null,
    ].filter(Boolean),
    activeCandidateCount: scan?.activeCandidateCount ?? null,
    lastScanTimestamp: scan?.scanTimestamp ?? null,
  };
}
