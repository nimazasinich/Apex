/** Canonical event-time/provenance contract. Fetch/cache time never substitutes for event time. */
export const OBSERVATION_METADATA_VERSION = 'observation_metadata_v1' as const;

export type ObservationQualityState = 'VALID' | 'DEGRADED' | 'STALE' | 'MISSING' | 'INVALID' | 'NOT_CONFIGURED';
export type EvidenceDependencyFamily =
  | 'PRICE_CANDLES'
  | 'L2_ORDERBOOK'
  | 'EXECUTED_TRADES'
  | 'DERIVATIVES_POSITIONING'
  | 'FUNDING'
  | 'NEWS_TEXT'
  | 'ONCHAIN_FLOW'
  | 'CROSS_VENUE'
  | 'REFERENCE_PRICE'
  | 'UNKNOWN';

export interface ObservationMetadataV1 {
  version: typeof OBSERVATION_METADATA_VERSION;
  /** Actual upstream event time. Null is explicit unknown provenance. */
  sourceObservedAt: number | null;
  /** Time the provider/API read completed. */
  providerReadAt: number;
  /** Time APEX received the provider result. */
  receivedAt: number;
  /** Time this exact observation was stored in a cache; null when uncached. */
  cacheStoredAt: number | null;
  provider: string;
  venue: string | null;
  canonicalInstrumentId: string;
  providerInstrumentId: string;
  adapterVersion: string;
  qualityState: ObservationQualityState;
  staleReason: string | null;
  lineageId: string;
  dependencyFamily: EvidenceDependencyFamily;
  parentLineageIds: string[];
  decisionEligible: boolean;
}

const finiteTimestamp = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function oldestSourceObservation(rows: Array<number | string | null | undefined>): number | null {
  const valid = rows.map(finiteTimestamp).filter((value): value is number => value !== null);
  return valid.length ? Math.min(...valid) : null;
}

export function observationAgeMs(metadata: Pick<ObservationMetadataV1, 'sourceObservedAt'>, now = Date.now()): number | null {
  return metadata.sourceObservedAt === null ? null : Math.max(0, now - metadata.sourceObservedAt);
}

export function withCacheStoredAt<T extends { metadata?: ObservationMetadataV1 }>(value: T, cacheStoredAt: number): T {
  if (!value.metadata) return value;
  return { ...value, metadata: { ...value.metadata, cacheStoredAt } };
}

export function canonicalObservationMetadata(input: Omit<ObservationMetadataV1, 'version'>): ObservationMetadataV1 {
  return {
    version: OBSERVATION_METADATA_VERSION,
    ...input,
    parentLineageIds: [...new Set(input.parentLineageIds)].sort(),
  };
}

export function effectiveEvidenceObservedAt(metadata: Array<ObservationMetadataV1 | null | undefined>): number | null {
  return oldestSourceObservation(metadata.filter(Boolean).map((row) => row!.sourceObservedAt));
}
