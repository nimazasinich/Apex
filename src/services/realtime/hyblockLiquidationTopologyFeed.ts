import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { InProcessEventBus } from './inProcessEventBus';
import type { PublicFeedConnectionState, PublicFeedSnapshot } from './publicFeedTypes';

const SOURCE = 'hyblock-liquidation-topology-v2';
const DEFAULT_BASE = 'https://api.hyblockcapital.com/v2';

interface HyblockHeatmapRow {
  startingPrice?: number | string;
  endingPrice?: number | string;
  side?: string;
  size?: number | string;
  timestamp?: number | string;
}

export interface HyblockLiquidationTopologyFeedOptions {
  enabled: boolean;
  apiKey?: string;
  symbols: string[];
  eventBus: InProcessEventBus;
  fetchJson?: (url: string, headers: Record<string, string>) => Promise<unknown>;
  baseUrl?: string;
  exchange?: string;
  lookback?: string;
  scaling?: 'relative' | 'absolute';
  now?: () => number;
  pollIntervalMs?: number;
  maxClusters?: number;
}

function canonicalCoin(symbol: string): string | null {
  const coin = String(symbol || '').toUpperCase().split(/[-_]/)[0];
  return /^[A-Z0-9]{2,12}$/.test(coin) ? coin : null;
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function timestampMs(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed < 10_000_000_000 ? Math.floor(parsed * 1000) : Math.floor(parsed);
}

export function validatedHyblockBaseUrl(value: string | undefined): string {
  const candidate = (value ?? DEFAULT_BASE).replace(/\/+$/, '');
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.hyblockcapital.com' || !parsed.pathname.startsWith('/v2')) {
    throw new Error('hyblock_base_url_not_allowlisted');
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}

async function defaultFetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`hyblock_liquidation_http_${response.status}`);
  return response.json();
}

/**
 * Optional authenticated Hyblock v2 liquidation-heatmap collector. Unlike
 * observed force-order streams, Hyblock's endpoint is explicitly predictive
 * topology. The provider is default-off and the API key never enters market
 * events, operations snapshots, or logs.
 */
export class HyblockLiquidationTopologyFeed {
  private readonly apiKey: string;
  private readonly symbols: string[];
  private readonly eventBus: InProcessEventBus;
  private readonly fetchJson: (url: string, headers: Record<string, string>) => Promise<unknown>;
  private readonly baseUrl: string;
  private readonly exchange: string;
  private readonly lookback: string;
  private readonly scaling: 'relative' | 'absolute';
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly maxClusters: number;
  private state: PublicFeedConnectionState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private inFlight = false;
  private connectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private lastError: string | null = null;
  private reconnects = 0;
  private publishedEvents = 0;
  private rejectedEvents = 0;

  constructor(options: HyblockLiquidationTopologyFeedOptions) {
    this.apiKey = String(options.apiKey ?? '').trim();
    this.symbols = [...new Set(options.symbols.map((value) => value.trim().toUpperCase()).filter((value) => canonicalCoin(value)))].slice(0, 10);
    this.eventBus = options.eventBus;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.baseUrl = validatedHyblockBaseUrl(options.baseUrl);
    this.exchange = /^[a-z0-9_]{3,64}$/i.test(String(options.exchange ?? 'binance_perp_stable'))
      ? String(options.exchange ?? 'binance_perp_stable')
      : 'binance_perp_stable';
    this.lookback = /^(1h|4h|6h|12h|24h|2d|3d|7d)$/i.test(String(options.lookback ?? '12h'))
      ? String(options.lookback ?? '12h')
      : '12h';
    this.scaling = options.scaling === 'absolute' ? 'absolute' : 'relative';
    this.now = options.now ?? Date.now;
    this.pollIntervalMs = Math.max(30_000, Math.min(10 * 60_000, Math.floor(options.pollIntervalMs ?? 60_000)));
    this.maxClusters = Math.max(10, Math.min(500, Math.floor(options.maxClusters ?? 120)));
    this.state = options.enabled && this.apiKey.length >= 8 && this.symbols.length ? 'DISCONNECTED' : 'DISABLED';
  }

  start(): void {
    if (this.state === 'DISABLED' || this.stopping || this.inFlight || this.timer) return;
    this.stopping = false;
    this.state = 'CONNECTING';
    void this.poll();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.inFlight) await new Promise((resolve) => setTimeout(resolve, 10));
    this.state = this.state === 'DISABLED' ? 'DISABLED' : 'STOPPED';
  }

  snapshot(): PublicFeedSnapshot {
    return {
      source: SOURCE,
      state: this.state,
      symbols: [...this.symbols],
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      lastError: this.lastError,
      reconnects: this.reconnects,
      publishedEvents: this.publishedEvents,
      rejectedEvents: this.rejectedEvents,
    };
  }

  private schedule(): void {
    if (this.stopping || this.state === 'DISABLED') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  private async poll(): Promise<void> {
    if (this.stopping || this.inFlight || this.state === 'DISABLED') return;
    this.inFlight = true;
    try {
      const settled = await Promise.allSettled(this.symbols.map((symbol) => this.pollSymbol(symbol)));
      const failures = settled.filter((result) => result.status === 'rejected');
      if (failures.length === settled.length && settled.length) throw failures[0].reason;
      if (this.connectedAt === null) this.connectedAt = this.now();
      this.lastMessageAt = this.now();
      this.state = failures.length ? 'DEGRADED' : 'CONNECTED';
      this.lastError = failures.length
        ? failures.map((result) => result.status === 'rejected' ? (result.reason instanceof Error ? result.reason.message : String(result.reason)) : '').filter(Boolean).join('|')
        : null;
    } catch (error) {
      this.reconnects += 1;
      this.state = 'DEGRADED';
      this.lastError = error instanceof Error ? error.message : String(error || 'hyblock_liquidation_topology_failed');
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }

  private async pollSymbol(symbol: string): Promise<void> {
    const coin = canonicalCoin(symbol);
    if (!coin) return;
    const currentMs = this.now();
    const params = new URLSearchParams({
      coin,
      exchange: this.exchange,
      lookback: this.lookback,
      ohlcgraph: this.exchange,
      scaling: this.scaling,
      timestamp: String(Math.floor(currentMs / 1000)),
    });
    const payload = await this.fetchJson(`${this.baseUrl}/liquidationHeatmap?${params.toString()}`, { 'x-api-key': this.apiKey });
    const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    const rows = Array.isArray(root?.data) ? root!.data as HyblockHeatmapRow[] : [];
    const metadata = root?.metadata && typeof root.metadata === 'object' ? root.metadata as Record<string, unknown> : null;
    const parsedRows = rows.map((row, index) => {
      const lower = finitePositive(row.startingPrice);
      const upper = finitePositive(row.endingPrice);
      const size = finitePositive(row.size);
      const rawSide = String(row.side ?? '').toUpperCase();
      if (lower === null || upper === null || size === null || (rawSide !== 'LONG' && rawSide !== 'SHORT')) return null;
      const low = Math.min(lower, upper);
      const high = Math.max(lower, upper);
      return {
        id: `${coin}:${rawSide}:${low}:${high}:${index}`,
        side: rawSide as 'LONG' | 'SHORT',
        lowerPrice: low,
        upperPrice: high,
        notionalUsd: size,
        providerTimestamp: timestampMs(row.timestamp, currentMs),
      };
    }).filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (!parsedRows.length) throw new Error(`hyblock_liquidation_topology_empty:${coin}`);
    const strongest = [...parsedRows].sort((a, b) => b.notionalUsd - a.notionalUsd).slice(0, this.maxClusters);
    const maxSize = Math.max(...strongest.map((row) => row.notionalUsd), 1);
    const providerTimestamp = Math.max(...strongest.map((row) => row.providerTimestamp));
    const exchangeCoverage = Array.isArray(metadata?.exchanges)
      ? (metadata!.exchanges as unknown[]).map(String).filter(Boolean).slice(0, 32)
      : [this.exchange];
    const event: MarketEvent = {
      eventId: `hyblock:liqmap:${coin}:${providerTimestamp}`,
      type: 'LIQUIDATION',
      source: SOURCE,
      symbol,
      exchangeTimestamp: Math.min(currentMs, providerTimestamp),
      receivedAt: currentMs,
      schemaVersion: 1,
      ingestionKind: 'LIVE',
      payload: {
        clusters: strongest.map((row) => ({
          id: row.id,
          side: row.side,
          lowerPrice: row.lowerPrice,
          upperPrice: row.upperPrice,
          notionalUsd: row.notionalUsd,
          confidence: Math.max(0.55, Math.min(0.98, 0.55 + 0.43 * (row.notionalUsd / maxSize))),
        })),
        methodology: 'HYBLOCK_PREDICTIVE_LIQUIDATION_HEATMAP_V2',
        providerTimestamp,
        exchangeCoverage,
        predictive: true,
      },
    };
    try {
      const disposition = await this.eventBus.publish(event);
      if (disposition === 'DELIVERED') this.publishedEvents += 1;
    } catch (error) {
      this.rejectedEvents += 1;
      throw error;
    }
  }
}
