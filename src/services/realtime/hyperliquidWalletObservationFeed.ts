import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { InProcessEventBus } from './inProcessEventBus';
import type { PublicFeedConnectionState, PublicFeedSnapshot } from './publicFeedTypes';

const SOURCE = 'hyperliquid-wallet-public-observer';
const DEFAULT_INFO_URL = 'https://api.hyperliquid.xyz/info';
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

interface HyperliquidAssetPosition {
  position?: {
    coin?: string;
    szi?: string | number;
    leverage?: { value?: string | number };
  };
}

interface HyperliquidFill {
  coin?: string;
  closedPnl?: string | number;
  time?: number;
}

export interface HyperliquidWalletObservationFeedOptions {
  enabled: boolean;
  symbols: string[];
  wallets: string[];
  eventBus: InProcessEventBus;
  fetchJson?: (url: string, body: unknown) => Promise<unknown>;
  infoUrl?: string;
  now?: () => number;
  pollIntervalMs?: number;
  concurrency?: number;
}

function canonicalCoin(symbol: string): string {
  return symbol.toUpperCase().split(/[-_]/)[0];
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pseudonym(wallet: string): string {
  return `hl-${createHash('sha256').update(wallet.toLowerCase()).digest('hex').slice(0, 20)}`;
}

async function defaultFetchJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`hyperliquid_info_http_${response.status}`);
  return response.json();
}

async function mapWithConcurrency<T>(values: readonly T[], concurrency: number, mapper: (value: T) => Promise<void>): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      try {
        await mapper(values[index]);
        results[index] = { status: 'fulfilled', value: undefined };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Public Hyperliquid wallet observation collector. It intentionally does not
 * assign S/F grades. Raw wallet addresses are pseudonymized before events enter
 * the central bus/log. A separate audited long-history grading process is still
 * required before wallet evidence can become PASS/FAIL instead of UNKNOWN.
 */
export class HyperliquidWalletObservationFeed {
  private readonly symbols: string[];
  private readonly wallets: string[];
  private readonly eventBus: InProcessEventBus;
  private readonly fetchJson: (url: string, body: unknown) => Promise<unknown>;
  private readonly infoUrl: string;
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly concurrency: number;
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
  private readonly lastFingerprintByPosition = new Map<string, string>();

  constructor(options: HyperliquidWalletObservationFeedOptions) {
    this.symbols = [...new Set(options.symbols.map((value) => value.trim().toUpperCase()).filter(Boolean))].slice(0, 20);
    this.wallets = [...new Set(options.wallets.map((value) => value.trim().toLowerCase()).filter((value) => ADDRESS_PATTERN.test(value)))].slice(0, 64);
    this.eventBus = options.eventBus;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.infoUrl = options.infoUrl ?? DEFAULT_INFO_URL;
    this.now = options.now ?? Date.now;
    this.pollIntervalMs = Math.max(15_000, Math.min(10 * 60_000, Math.floor(options.pollIntervalMs ?? 60_000)));
    this.concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 4)));
    this.state = options.enabled && this.wallets.length && this.symbols.length ? 'DISCONNECTED' : 'DISABLED';
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
      const settled = await mapWithConcurrency(this.wallets, this.concurrency, (wallet) => this.pollWallet(wallet));
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
      this.lastError = error instanceof Error ? error.message : String(error || 'hyperliquid_wallet_observation_failed');
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }

  private async pollWallet(wallet: string): Promise<void> {
    const [stateResult, fillsResult] = await Promise.all([
      this.fetchJson(this.infoUrl, { type: 'clearinghouseState', user: wallet }),
      this.fetchJson(this.infoUrl, { type: 'userFills', user: wallet, aggregateByTime: true }),
    ]);
    const state = stateResult && typeof stateResult === 'object' ? stateResult as Record<string, unknown> : null;
    const positions = Array.isArray(state?.assetPositions) ? state!.assetPositions as HyperliquidAssetPosition[] : [];
    const fills = Array.isArray(fillsResult) ? fillsResult as HyperliquidFill[] : [];
    const alias = pseudonym(wallet);
    const timestamp = this.now();

    for (const symbol of this.symbols) {
      const coin = canonicalCoin(symbol);
      const asset = positions.find((row) => String(row.position?.coin || '').toUpperCase() === coin);
      const size = finite(asset?.position?.szi);
      if (size === null || size === 0) continue;
      const direction = size > 0 ? 'LONG' : 'SHORT';
      const leverage = finite(asset?.position?.leverage?.value);
      const closedTrades = fills.filter((fill) => String(fill.coin || '').toUpperCase() === coin && Math.abs(finite(fill.closedPnl) ?? 0) > 0).length;
      const latestFillAt = fills
        .filter((fill) => String(fill.coin || '').toUpperCase() === coin)
        .map((fill) => finite(fill.time))
        .filter((value): value is number => value !== null)
        .reduce((max, value) => Math.max(max, value), 0);
      const observedAt = latestFillAt > 0 ? Math.min(timestamp, latestFillAt) : timestamp;
      const fingerprintKey = `${alias}:${coin}`;
      const fingerprint = JSON.stringify({ direction, size, leverage, closedTrades, latestFillAt });
      if (this.lastFingerprintByPosition.get(fingerprintKey) === fingerprint) continue;
      this.lastFingerprintByPosition.set(fingerprintKey, fingerprint);
      const event: MarketEvent = {
        eventId: `hl:wallet:${alias}:${coin}:${timestamp}`,
        type: 'WALLET_POSITION',
        source: SOURCE,
        symbol,
        exchangeTimestamp: observedAt,
        receivedAt: timestamp,
        schemaVersion: 1,
        ingestionKind: 'LIVE',
        payload: {
          wallet: alias,
          grade: 'UNRATED',
          direction,
          leverage: leverage === null ? undefined : Math.max(1, Math.min(50, leverage)),
          closedTrades,
          netPnlPct: null,
          maxDrawdownPct: null,
          observationOnly: true,
          gradingReady: false,
          methodology: 'HYPERLIQUID_PUBLIC_POSITION_AND_RECENT_FILLS_OBSERVATION',
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
}
