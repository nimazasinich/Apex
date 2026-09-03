/**
 * Hugging Face Crypto Datasources — Canonical Types & Contracts
 * Backed by Really-amin/Datasourceforcryptocurrency-2 and Really-amin/Datasourceforcryptocurrency-4
 */

export type DataState = 'REAL' | 'CACHED' | 'PARTIAL' | 'UNAVAILABLE';

export type CoverageMode =
  | 'REAL_HISTORICAL'
  | 'REAL_HISTORICAL_ON_DEMAND'
  | 'REAL_RECENT_UPSTREAM'
  | 'REAL_RECENT_PLUS_FORWARD_ARCHIVE'
  | 'FORWARD_COLLECTING_ONLY'
  | 'LIVE_ONLY'
  | 'UNKNOWN';

export interface Coverage {
  mode: CoverageMode;
  earliestTimestampMs: number | null;
  latestTimestampMs: number | null;
  requestedStartMs?: number;
  requestedEndMs?: number;
  complete?: boolean;
}

export interface ProviderAttempt {
  provider: string;
  ok: boolean;
  status?: number;
  reason?: string;
  latencyMs?: number;
}

export interface Provenance {
  space: 'datasource-2' | 'datasource-4';
  endpoint: string;
  provider: string | null;
  attempts?: ProviderAttempt[];
  fetchedAtMs: number;
  requestId?: string;
  schemaVersion?: string;
}

export interface CanonicalEnvelope<T> {
  success: boolean;
  dataState: DataState;
  coverage: Coverage;
  provenance: Provenance;
  count: number;
  data: T;
}

export interface CanonicalCandle {
  symbol: string;
  interval: string;
  openTimeMs: number;
  closeTimeMs?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  trades?: number;
  provider: string;
}

export interface CanonicalFundingRate {
  symbol: string;
  fundingRate: number;
  fundingTimeMs: number;
  source: string;
}

export interface CanonicalOpenInterest {
  symbol: string;
  openInterest: number;
  openInterestUsd?: number;
  timestampMs: number;
  source: string;
}

export interface CanonicalFearGreed {
  value: number;
  classification: string;
  timestampMs: number;
  source: string;
}

export interface CanonicalNewsEvent {
  provider: string;
  providerId: string;
  title: string;
  publishedAtMs: number;
  ingestedAtMs: number;
  url?: string;
  symbols: string[];
  rawHash?: string;
}

export interface CanonicalWhaleFlow {
  chain: string;
  transactionHash: string;
  amount: number;
  amountUsd?: number;
  timestampMs: number;
  source: string;
}

export interface CanonicalShortHunterSnapshot {
  symbol: string;
  interval: string;
  sourceMode: 'LIVE';
  dataState: DataState;
  observedAtMs: number;
  replaySupported: false;
  metrics: Record<string, unknown>;
}

export function normalizeEpochMs(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // If timestamp is in seconds (e.g. 10 digits < 100 billion), convert to ms
  return n < 100_000_000_000 ? n * 1000 : n;
}

export function validateCandleInvariants(candle: CanonicalCandle): boolean {
  if (!Number.isFinite(candle.open) || !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || !Number.isFinite(candle.close)) {
    return false;
  }
  if (candle.volume < 0) return false;
  if (candle.high < Math.max(candle.open, candle.close, candle.low)) return false;
  if (candle.low > Math.min(candle.open, candle.close, candle.high)) return false;
  return true;
}
