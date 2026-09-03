/** Account snapshot contract shared by transport and workspace projection code. */
export interface AccountSnapshot {
  account: Record<string, unknown>;
  positions: Array<Record<string, unknown>>;
  openOrders: Array<Record<string, unknown>>;
  recentOrders: Array<Record<string, unknown>>;
  recentTrades: Array<Record<string, unknown>>;
  positionHistory: Array<Record<string, unknown>>;
  serverTime: unknown;
  syncedAt: string;
  venue?: 'kucoin' | 'tabdeal' | 'demo';
  observationMetadata?: { sourceObservedAt: number | null; providerReadAt: number; provenance: string };
  /** Explicit partial-read metadata. Arrays are never silently treated as authoritative when an upstream read failed. */
  quality?: {
    state: 'complete' | 'partial';
    failures: string[];
  };
}
