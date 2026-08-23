/* Copied from apex-trading-engine/src/services/providers/supplementalTypes.ts */

import type { NewsApiQueryOptions } from './newsApiTypes';

export type SupplementalDataSource = 'live' | 'degraded' | 'unavailable' | 'not_configured';

export type SupplementalCategory = 'news' | 'sentiment' | 'onchain' | 'market';

/**
 * Truthful outcome of an upstream read, kept distinct from `status` so an
 * operator can tell a genuinely empty source from one whose response shape
 * changed or that could not be reached. Mirrors HfResultState in hfSpaceIntel.
 */
export type SupplementalResultState = 'SUCCESS' | 'NO_DATA' | 'SCHEMA_MISMATCH' | 'NETWORK_ERROR';

/** One upstream endpoint attempt, for debugging without reproducing requests. */
export interface SupplementalAttemptDiagnostic {
  endpoint: string;
  provider: string;
  latencyMs: number;
  httpStatus: number;
  resultState: SupplementalResultState;
  itemCount: number;
  rawItemCount: number;
  receivedKeys?: string[];
  error?: string;
}

/**
 * Optional, non-scoring diagnostics. Never consumed as trading evidence — it
 * exists so provider failures are explainable after the fact.
 */
export interface SupplementalDiagnostics {
  state: SupplementalResultState;
  /** Body keys observed when a response no longer matched the expected schema. */
  receivedKeys?: string[];
  /**
   * Valid raw observations the upstream returned, before category-specific
   * promotion rules (e.g. requiring an explicit on-chain direction) applied.
   */
  rawObservationCount?: number;
  attempts?: SupplementalAttemptDiagnostic[];
}

export interface NewsArticle {
  title: string;
  description?: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
}

export interface NewsResult {
  category: 'news';
  provider: string;
  symbol: string;
  data: NewsArticle[];
  source: SupplementalDataSource;
  status: string;
  reason?: string;
  latencyMs: number;
  updatedAt: string;
  /** Additive diagnostics; absent for providers that do not report them. */
  diagnostics?: SupplementalDiagnostics;
}

export interface SentimentScore {
  value: number; // -1 to +1
  label: 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE';
  confidence: number;
  modelVersion?: string;
}

export interface SentimentResult {
  category: 'sentiment';
  /** True only when data is validated market evidence. False prevents neutral sentinels from entering fusion. */
  valid: boolean;
  provider: string;
  symbol: string;
  /** Null unless valid=true; prevents unavailable neutral sentinels from becoming fusion evidence. */
  data: SentimentScore | null;
  newsContext?: string[]; // article titles used for sentiment calc
  source: SupplementalDataSource;
  status: string;
  reason?: string;
  latencyMs: number;
  updatedAt: string;
  /** Additive diagnostics; absent for providers that do not report them. */
  diagnostics?: SupplementalDiagnostics;
}

export interface OnChainSignal {
  type: 'whale_transfer' | 'exchange_deposit' | 'exchange_withdrawal' | 'contract_interaction';
  amount: number;
  /**
   * The token actually moved. BTC and ETH have no native ERC-20, so their flow is
   * observed through WBTC/WETH — naming the token keeps the row honest rather
   * than implying the transfer was in the traded symbol itself.
   */
  asset?: string;
  amountUSD?: number;
  direction: 'inbound' | 'outbound';
  chain: string;
  blockNumber?: number;
  transactionHash: string;
  timestamp: string;
}

export interface OnChainResult {
  category: 'onchain';
  provider: string;
  symbol: string;
  data: OnChainSignal[];
  source: SupplementalDataSource;
  status: string;
  reason?: string;
  latencyMs: number;
  updatedAt: string;
  /**
   * Additive diagnostics. `rawObservationCount` records valid whale rows the
   * upstream returned even when none carried an explicit direction, so raw
   * observations stay visible without being promoted to directional signals.
   */
  diagnostics?: SupplementalDiagnostics;
}

export type SupplementalResult = NewsResult | SentimentResult | OnChainResult;

/** Cache-only bundle used by latency-sensitive shadow consumers. */
export interface SupplementalBundle {
  news: NewsResult | null;
  sentiment: SentimentResult | null;
  onchain: OnChainResult | null;
}

export type SupplementalFreshness = 'CURRENT' | 'STALE' | 'UNKNOWN';

/** Truthful, non-scoring projection of supplemental provider state. */
export interface ShadowSupplementalEvidenceItem {
  category: SupplementalCategory;
  provider: string;
  symbol: string;
  source: SupplementalDataSource;
  status: string;
  observedAt: string | null;
  freshness: SupplementalFreshness;
  available: boolean;
  observationCount: number;
  confidence?: number | null;
  reason?: string;
}

export interface ShadowSupplementalEvidence {
  version: 'supplemental_shadow_v1';
  generatedAt: number;
  items: ShadowSupplementalEvidenceItem[];
}

export type ProviderHealthReasonCode =
  | 'HEALTHY'
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'DNS_NETWORK_UNAVAILABLE'
  | 'HTTP_REJECTED'
  | 'SCHEMA_INVALID'
  | 'STALE'
  | 'RATE_LIMITED'
  | 'CIRCUIT_OPEN'
  | 'PROVIDER_FAILURE';

export interface ProviderHealth {
  name: string;
  category: SupplementalCategory;
  isConfigured: boolean;
  /** Explicit operator/runtime disablement, distinct from missing configuration. */
  isEnabled?: boolean;
  isHealthy: boolean;
  lastCheckTime: number;
  lastSuccessTime?: number;
  failureCount: number;
  rateLimitedUntil?: number; // ms timestamp
  reason?: string;
  /** Machine-readable operations reason. `reason` remains safe human diagnostics. */
  reasonCode?: ProviderHealthReasonCode;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  rateLimitPerMinute?: number;
  /** NewsAPI.org /v2 query options (non-secret). */
  newsApiQuery?: NewsApiQueryOptions;
}

export interface SupplementalFetchContext {
  headlines?: string[];
}

export interface SupplementalProvider {
  name: string;
  category: SupplementalCategory;
  isConfigured(): boolean;
  fetch(
    symbol: string,
    timeoutMs?: number,
    context?: SupplementalFetchContext,
  ): Promise<SupplementalResult>;
}

export type IntelligenceSourceMeta = {
  id: string;
  name: string;
  category: SupplementalCategory | string;
  baseUrl?: string;
  endpoint?: string;
  requiredEnv?: string[];
  optional?: boolean;
  normalizedCategory?: SupplementalCategory | string;
  rateLimitNotes?: string;
  parser?: string;
  statusMapping?: Record<string, string>;
};

export default SupplementalResult;
