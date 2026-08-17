import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import {
  computeWalletPerformanceMetrics,
  deriveWalletGradeV2,
  WALLET_GRADING_VERSION,
  type WalletFundingSample,
  type WalletRealizedTradeSample,
} from '../liquidityHunter/walletGrading';
import type { InProcessEventBus } from './inProcessEventBus';
import type { PublicFeedConnectionState, PublicFeedSnapshot } from './publicFeedTypes';

const SOURCE = 'hyperliquid-wallet-history-grader';
const DEFAULT_INFO_URL = 'https://api.hyperliquid.xyz/info';
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const MAX_FILL_ROWS = 2_000;
const MAX_ACCESSIBLE_FILL_ROWS = 10_000;
const MAX_TIME_RANGE_ROWS = 500;

interface HyperliquidFill {
  coin?: string;
  px?: string | number;
  sz?: string | number;
  closedPnl?: string | number;
  fee?: string | number;
  time?: number;
  tid?: string | number;
  hash?: string;
}

interface HyperliquidFunding {
  time?: number;
  hash?: string;
  delta?: {
    type?: string;
    coin?: string;
    usdc?: string | number;
  };
}

interface HyperliquidAssetPosition {
  position?: {
    coin?: string;
    szi?: string | number;
    leverage?: { value?: string | number };
  };
}

export interface HyperliquidWalletHistoryGradingFeedOptions {
  enabled: boolean;
  symbols: string[];
  wallets: string[];
  eventBus: InProcessEventBus;
  fetchJson?: (url: string, body: unknown) => Promise<unknown>;
  infoUrl?: string;
  now?: () => number;
  pollIntervalMs?: number;
  lookbackDays?: number;
  concurrency?: number;
  maxRequestsPerWallet?: number;
  minimumWindowMs?: number;
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
  return `hlg-${createHash('sha256').update(wallet.toLowerCase()).digest('hex').slice(0, 20)}`;
}

async function defaultFetchJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`hyperliquid_history_http_${response.status}`);
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
 * Optional public-history grader for configured Hyperliquid wallets. It uses
 * time-bounded public fills plus user funding and refuses to grade a wallet if
 * a saturated history window cannot be subdivided within the request budget.
 * Raw wallet addresses never enter emitted market events.
 */
export class HyperliquidWalletHistoryGradingFeed {
  private readonly symbols: string[];
  private readonly wallets: string[];
  private readonly eventBus: InProcessEventBus;
  private readonly fetchJson: (url: string, body: unknown) => Promise<unknown>;
  private readonly infoUrl: string;
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly lookbackDays: number;
  private readonly concurrency: number;
  private readonly maxRequestsPerWallet: number;
  private readonly minimumWindowMs: number;
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

  constructor(options: HyperliquidWalletHistoryGradingFeedOptions) {
    this.symbols = [...new Set(options.symbols.map((value) => value.trim().toUpperCase()).filter(Boolean))].slice(0, 20);
    this.wallets = [...new Set(options.wallets.map((value) => value.trim().toLowerCase()).filter((value) => ADDRESS_PATTERN.test(value)))].slice(0, 16);
    this.eventBus = options.eventBus;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.infoUrl = options.infoUrl ?? DEFAULT_INFO_URL;
    this.now = options.now ?? Date.now;
    this.pollIntervalMs = Math.max(30 * 60_000, Math.min(24 * 60 * 60_000, Math.floor(options.pollIntervalMs ?? 6 * 60 * 60_000)));
    this.lookbackDays = Math.max(14, Math.min(180, Math.floor(options.lookbackDays ?? 60)));
    this.concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));
    this.maxRequestsPerWallet = Math.max(8, Math.min(1_024, Math.floor(options.maxRequestsPerWallet ?? 256)));
    this.minimumWindowMs = Math.max(60_000, Math.min(24 * 60 * 60_000, Math.floor(options.minimumWindowMs ?? 60 * 60_000)));
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
    while (this.inFlight) await new Promise((resolve) => setTimeout(resolve, 20));
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
      this.lastError = error instanceof Error ? error.message : String(error || 'hyperliquid_wallet_history_grading_failed');
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }

  private async pollWallet(wallet: string): Promise<void> {
    const endTime = this.now();
    const startTime = endTime - this.lookbackDays * 24 * 60 * 60_000;
    let requests = 0;
    let completeHistory = true;
    const fillsById = new Map<string, HyperliquidFill>();
    const fundingById = new Map<string, HyperliquidFunding>();

    const takeRequest = (): boolean => {
      if (requests >= this.maxRequestsPerWallet) {
        completeHistory = false;
        return false;
      }
      requests += 1;
      return true;
    };

    const fetchFillsRange = async (from: number, to: number): Promise<void> => {
      if (!takeRequest()) return;
      const fillsRaw = await this.fetchJson(this.infoUrl, { type: 'userFillsByTime', user: wallet, startTime: from, endTime: to, aggregateByTime: true });
      const fills = Array.isArray(fillsRaw) ? fillsRaw as HyperliquidFill[] : [];
      if (fills.length >= MAX_FILL_ROWS) {
        if (to - from <= this.minimumWindowMs) {
          completeHistory = false;
        } else {
          const midpoint = Math.floor(from + (to - from) / 2);
          await fetchFillsRange(from, midpoint);
          await fetchFillsRange(midpoint + 1, to);
          return;
        }
      }
      for (const fill of fills) {
        const id = String(fill.tid ?? fill.hash ?? `${fill.time}:${fill.coin}:${fill.px}:${fill.sz}:${fill.closedPnl}`);
        fillsById.set(id, fill);
      }
    };

    const fetchFundingRange = async (from: number, to: number): Promise<void> => {
      if (!takeRequest()) return;
      const fundingRaw = await this.fetchJson(this.infoUrl, { type: 'userFunding', user: wallet, startTime: from, endTime: to });
      const funding = Array.isArray(fundingRaw) ? fundingRaw as HyperliquidFunding[] : [];
      // Hyperliquid time-range responses are capped. Split saturated windows so
      // funding is not silently truncated for active multi-asset wallets.
      if (funding.length >= MAX_TIME_RANGE_ROWS) {
        if (to - from <= this.minimumWindowMs) {
          completeHistory = false;
        } else {
          const midpoint = Math.floor(from + (to - from) / 2);
          await fetchFundingRange(from, midpoint);
          await fetchFundingRange(midpoint + 1, to);
          return;
        }
      }
      for (const row of funding) {
        const id = String(row.hash ?? `${row.time}:${row.delta?.coin}:${row.delta?.usdc}`);
        fundingById.set(id, row);
      }
    };

    // Start with 7-day chunks. Fills and funding are paginated independently
    // because their public endpoint caps differ.
    const chunkMs = 7 * 24 * 60 * 60_000;
    for (let from = startTime; from < endTime; from += chunkMs) {
      const to = Math.min(endTime, from + chunkMs - 1);
      await Promise.all([fetchFillsRange(from, to), fetchFundingRange(from, to)]);
      if (requests >= this.maxRequestsPerWallet) {
        completeHistory = false;
        break;
      }
    }

    // userFillsByTime exposes only the 10,000 most recent fills. Reaching that
    // public-history ceiling means older requested history cannot be proven
    // complete, so the wallet must remain UNRATED.
    if (fillsById.size >= MAX_ACCESSIBLE_FILL_ROWS) completeHistory = false;

    if (requests + 1 > this.maxRequestsPerWallet) completeHistory = false;
    const stateRaw = requests + 1 <= this.maxRequestsPerWallet
      ? await this.fetchJson(this.infoUrl, { type: 'clearinghouseState', user: wallet })
      : null;
    requests += stateRaw === null ? 0 : 1;
    const state = stateRaw && typeof stateRaw === 'object' ? stateRaw as Record<string, unknown> : null;
    const positions = Array.isArray(state?.assetPositions) ? state!.assetPositions as HyperliquidAssetPosition[] : [];
    const alias = pseudonym(wallet);

    for (const symbol of this.symbols) {
      const coin = canonicalCoin(symbol);
      const asset = positions.find((row) => String(row.position?.coin || '').toUpperCase() === coin);
      const size = finite(asset?.position?.szi);
      if (size === null || size === 0) continue;
      const leverage = finite(asset?.position?.leverage?.value);
      const tradeSamples: WalletRealizedTradeSample[] = [];
      for (const fill of fillsById.values()) {
        if (String(fill.coin || '').toUpperCase() !== coin) continue;
        const closedPnl = finite(fill.closedPnl);
        const timestamp = finite(fill.time);
        const fee = finite(fill.fee) ?? 0;
        const px = finite(fill.px);
        const sz = finite(fill.sz);
        if (closedPnl === null || timestamp === null || px === null || sz === null || Math.abs(closedPnl) <= 1e-12) continue;
        tradeSamples.push({
          timestamp,
          closedPnlUsd: closedPnl,
          feeUsd: Math.abs(fee),
          notionalUsd: Math.abs(px * sz),
        });
      }
      const fundingSamples: WalletFundingSample[] = [];
      for (const row of fundingById.values()) {
        if (String(row.delta?.coin || '').toUpperCase() !== coin || String(row.delta?.type || '') !== 'funding') continue;
        const timestamp = finite(row.time);
        const fundingUsd = finite(row.delta?.usdc);
        if (timestamp === null || fundingUsd === null) continue;
        fundingSamples.push({ timestamp, fundingUsd });
      }
      const metrics = computeWalletPerformanceMetrics({ trades: tradeSamples, funding: fundingSamples, completeHistory });
      const grade = deriveWalletGradeV2(metrics);
      const direction = size > 0 ? 'LONG' : 'SHORT';
      const gradingReady = grade !== 'UNRATED';
      const fingerprintKey = `${alias}:${coin}`;
      const fingerprint = JSON.stringify({ direction, size, leverage, grade, metrics });
      if (this.lastFingerprintByPosition.get(fingerprintKey) === fingerprint) continue;
      this.lastFingerprintByPosition.set(fingerprintKey, fingerprint);
      const event: MarketEvent = {
        eventId: `hl:graded:${alias}:${coin}:${endTime}`,
        type: 'WALLET_POSITION',
        source: SOURCE,
        symbol,
        exchangeTimestamp: endTime,
        receivedAt: this.now(),
        schemaVersion: 1,
        ingestionKind: 'LIVE',
        payload: {
          wallet: alias,
          grade,
          direction,
          leverage: leverage === null ? undefined : Math.max(1, Math.min(50, leverage)),
          closedTrades: metrics.closedTrades,
          netPnlPct: null,
          maxDrawdownPct: null,
          observationOnly: false,
          gradingReady,
          methodology: 'HYPERLIQUID_PUBLIC_FILLS_PLUS_FUNDING_REALIZED_HISTORY',
          gradingVersion: WALLET_GRADING_VERSION,
          winRate: metrics.winRate,
          profitFactor: metrics.profitFactor,
          realizedPnlUsd: metrics.netPnlUsd,
          feesUsd: metrics.feesUsd,
          fundingUsd: metrics.fundingUsd,
          historyDays: metrics.historyDays,
          sizingCv: metrics.sizingCv,
          drawdownToGrossProfitRatio: metrics.drawdownToGrossProfitRatio,
          completeHistory: metrics.completeHistory,
          historyRequestCount: requests,
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
