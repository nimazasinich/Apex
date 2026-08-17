import type { EdgeId } from '../../contracts/realtime/edgeEvidence';

export type EdgeAvailability =
  | 'DIAGNOSTIC_AVAILABLE'
  | 'SHADOW_ONLY'
  | 'BLOCKED_BY_L2'
  | 'BLOCKED_BY_REALTIME_FEEDS'
  | 'NOT_CONFIGURED';

export interface EdgeCatalogEntry {
  edgeId: EdgeId;
  name: string;
  layer: 1 | 2 | 3 | 4;
  dependencies: string[];
  ttlMs: number;
  minimumQuality: number;
  availability: EdgeAvailability;
  evidenceOnly: true;
}

const CATALOG: readonly EdgeCatalogEntry[] = Object.freeze([
  {
    edgeId: 'LIQUIDATION_TOPOLOGY', name: 'Liquidation Topology', layer: 2,
    dependencies: ['verified_liquidation_provider'], ttlMs: 30_000, minimumQuality: 0.8,
    availability: 'NOT_CONFIGURED', evidenceOnly: true,
  },
  {
    edgeId: 'WHALE_POSITIONING', name: 'S-Grade Whale Positioning', layer: 4,
    dependencies: ['hyperliquid_wallet_history', 'fee_funding_adjusted_grading'], ttlMs: 60_000, minimumQuality: 0.8,
    availability: 'NOT_CONFIGURED', evidenceOnly: true,
  },
  {
    edgeId: 'ICEBERG_ABSORPTION', name: 'Iceberg Absorption', layer: 3,
    dependencies: ['sequence_correct_l2', 'normalized_trades'], ttlMs: 2_000, minimumQuality: 0.9,
    availability: 'SHADOW_ONLY', evidenceOnly: true,
  },
  {
    edgeId: 'OPTIONS_GAMMA', name: 'Options Gamma Regime', layer: 1,
    dependencies: ['options_taker_flow', 'greeks', 'open_interest'], ttlMs: 60_000, minimumQuality: 0.8,
    availability: 'NOT_CONFIGURED', evidenceOnly: true,
  },
  {
    edgeId: 'MULTI_EXCHANGE_CVD', name: 'Multi-Exchange CVD', layer: 3,
    dependencies: ['multi_exchange_trades', 'quotes', 'clock_alignment'], ttlMs: 5_000, minimumQuality: 0.85,
    availability: 'SHADOW_ONLY', evidenceOnly: true,
  },
  {
    edgeId: 'SESSION_LIQUIDITY', name: 'Session Liquidity / SMC', layer: 2,
    dependencies: ['closed_candles', 'smart_money_context'], ttlMs: 60_000, minimumQuality: 0.7,
    availability: 'DIAGNOSTIC_AVAILABLE', evidenceOnly: true,
  },
  {
    edgeId: 'FUNDING_OI', name: 'Funding + OI Crowding', layer: 1,
    dependencies: ['funding_history', 'open_interest_history'], ttlMs: 60_000, minimumQuality: 0.75,
    availability: 'DIAGNOSTIC_AVAILABLE', evidenceOnly: true,
  },
  {
    edgeId: 'SENTIMENT_VELOCITY', name: 'Sentiment Velocity', layer: 1,
    dependencies: ['news_social_stream', 'source_credibility_history'], ttlMs: 30_000, minimumQuality: 0.7,
    availability: 'SHADOW_ONLY', evidenceOnly: true,
  },
  {
    edgeId: 'META_MODEL', name: 'Meta Evaluator', layer: 4,
    dependencies: ['versioned_features', 'outcome_dataset'], ttlMs: 30_000, minimumQuality: 0.8,
    availability: 'SHADOW_ONLY', evidenceOnly: true,
  },
  {
    edgeId: 'CONTRARIAN_WALLETS', name: 'F-Grade Contrarian Wallets', layer: 4,
    dependencies: ['long_duration_wallet_grading'], ttlMs: 60_000, minimumQuality: 0.8,
    availability: 'NOT_CONFIGURED', evidenceOnly: true,
  },
]);

export function getEdgeCatalog(): EdgeCatalogEntry[] {
  return CATALOG.map((entry) => ({ ...entry, dependencies: [...entry.dependencies] }));
}

export function summarizeEdgeCatalog(): Record<EdgeAvailability, number> & { total: number } {
  const summary: Record<EdgeAvailability, number> & { total: number } = {
    total: CATALOG.length,
    DIAGNOSTIC_AVAILABLE: 0,
    SHADOW_ONLY: 0,
    BLOCKED_BY_L2: 0,
    BLOCKED_BY_REALTIME_FEEDS: 0,
    NOT_CONFIGURED: 0,
  };
  for (const edge of CATALOG) summary[edge.availability] += 1;
  return summary;
}
