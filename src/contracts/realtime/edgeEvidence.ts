export const EDGE_IDS = [
  'LIQUIDATION_TOPOLOGY',
  'WHALE_POSITIONING',
  'ICEBERG_ABSORPTION',
  'OPTIONS_GAMMA',
  'MULTI_EXCHANGE_CVD',
  'SESSION_LIQUIDITY',
  'FUNDING_OI',
  'SENTIMENT_VELOCITY',
  'META_MODEL',
  'CONTRARIAN_WALLETS',
] as const;

export type EdgeId = (typeof EDGE_IDS)[number];
export type EdgeStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'STALE' | 'NOT_CONFIGURED';
export type EdgeDirection = 'LONG' | 'SHORT' | 'NEUTRAL' | null;

export interface EdgeEvidence {
  edgeId: EdgeId;
  status: EdgeStatus;
  direction: EdgeDirection;
  score: number | null;
  dataQuality: number;
  observedAt: number;
  expiresAt: number;
  sourceVersion: string;
  supportingReasons: string[];
  conflictingReasons: string[];
  rawEventIds: string[];
  metadata?: Record<string, unknown>;
}

export function createUnavailableEdgeEvidence(
  edgeId: EdgeId,
  status: Extract<EdgeStatus, 'UNKNOWN' | 'STALE' | 'NOT_CONFIGURED'>,
  reason: string,
  now = Date.now(),
): EdgeEvidence {
  return {
    edgeId,
    status,
    direction: null,
    score: null,
    dataQuality: 0,
    observedAt: now,
    expiresAt: now,
    sourceVersion: 'liquidity-hunter-core-v1',
    supportingReasons: [],
    conflictingReasons: [reason],
    rawEventIds: [],
  };
}
