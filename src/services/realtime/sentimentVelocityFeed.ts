import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { SentimentResult } from '../providers/supplementalTypes';
import type { InProcessEventBus } from './inProcessEventBus';
import type { PublicFeedConnectionState, PublicFeedSnapshot } from './publicFeedTypes';
import { normalizeCanonicalSymbols } from './publicFeedTypes';

const SOURCE = 'supplemental-sentiment-shadow';

export interface SentimentVelocityFeedOptions {
  enabled: boolean;
  symbols: string[];
  eventBus: InProcessEventBus;
  fetchSentiment?: (symbol: string) => Promise<SentimentResult>;
  now?: () => number;
  pollIntervalMs?: number;
  concurrency?: number;
}

function clamp01(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}

function clampScore(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -1 && parsed <= 1 ? parsed : null;
}

function fingerprint(result: SentimentResult): string {
  const value = Number(result.data?.value);
  const confidence = Number(result.data?.confidence);
  const basis = JSON.stringify({
    provider: result.provider,
    modelVersion: result.data?.modelVersion ?? null,
    value: Number.isFinite(value) ? Number(value.toFixed(6)) : null,
    confidence: Number.isFinite(confidence) ? Number(confidence.toFixed(6)) : null,
    label: result.data?.label ?? null,
    source: result.source,
    status: result.status,
  });
  return createHash('sha256').update(basis).digest('hex');
}

async function defaultFetchSentiment(symbol: string): Promise<SentimentResult> {
  const { getSupplementalOrchestrator } = await import('../supplementalOrchestrator');
  const orchestrator = getSupplementalOrchestrator();
  const news = await orchestrator.fetchNews(symbol, false);
  const headlines = news.data.map((article) => article.title).filter(Boolean);
  return orchestrator.fetchSentiment(symbol, false, { headlines });
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
 * Shadow-only adapter from APEX's existing supplemental sentiment subsystem into
 * the normalized realtime evidence bus. It publishes only changed normalized
 * observations, so provider polling cannot manufacture artificial velocity by
 * repeating an unchanged cached score.
 */
export class SentimentVelocityFeed {
  private readonly symbols: string[];
  private readonly eventBus: InProcessEventBus;
  private readonly fetchSentiment: (symbol: string) => Promise<SentimentResult>;
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly concurrency: number;
  private readonly lastFingerprint = new Map<string, string>();
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

  constructor(options: SentimentVelocityFeedOptions) {
    this.symbols = normalizeCanonicalSymbols(options.symbols);
    this.eventBus = options.eventBus;
    this.fetchSentiment = options.fetchSentiment ?? defaultFetchSentiment;
    this.now = options.now ?? Date.now;
    this.pollIntervalMs = Math.max(5_000, Math.min(5 * 60_000, Math.floor(options.pollIntervalMs ?? 15_000)));
    this.concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));
    this.state = options.enabled && this.symbols.length ? 'DISCONNECTED' : 'DISABLED';
  }

  start(): void {
    if (this.state === 'DISABLED' || this.stopping || this.timer || this.inFlight) return;
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
      const settled = await mapWithConcurrency(this.symbols, this.concurrency, async (symbol) => this.pollSymbol(symbol));
      const failures = settled.filter((result) => result.status === 'rejected');
      if (failures.length === settled.length && settled.length) throw failures[0].reason;
      if (this.connectedAt === null) this.connectedAt = this.now();
      this.state = failures.length ? 'DEGRADED' : 'CONNECTED';
      this.lastError = failures.length
        ? failures.map((result) => result.status === 'rejected' ? (result.reason instanceof Error ? result.reason.message : String(result.reason)) : '').filter(Boolean).join('|')
        : null;
      this.lastMessageAt = this.now();
    } catch (error) {
      this.reconnects += 1;
      this.state = 'DEGRADED';
      this.lastError = error instanceof Error ? error.message : String(error || 'sentiment_velocity_poll_failed');
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }

  private async pollSymbol(symbol: string): Promise<void> {
    const result = await this.fetchSentiment(symbol);
    if (result.source !== 'live' && result.source !== 'degraded') {
      throw new Error(`sentiment_provider_unavailable:${result.provider}:${result.status}`);
    }
    const score = clampScore(result.data?.value);
    if (score === null) throw new Error(`sentiment_payload_invalid:${result.provider}`);
    const confidence = clamp01(result.data?.confidence);
    const currentFingerprint = fingerprint(result);
    if (this.lastFingerprint.get(symbol) === currentFingerprint) return;

    const now = this.now();
    const credibility = clamp01(confidence * (result.source === 'live' ? 1 : 0.6));
    const event: MarketEvent = {
      eventId: `sent:${currentFingerprint.slice(0, 20)}:${now}`,
      type: 'SENTIMENT_EVENT',
      source: SOURCE,
      symbol,
      exchangeTimestamp: now,
      receivedAt: now,
      schemaVersion: 1,
      ingestionKind: 'LIVE',
      payload: {
        score,
        credibility,
        sourceId: result.provider,
        provider: result.provider,
        providerStatus: result.status,
        sourceState: result.source,
        label: result.data?.label,
        modelVersion: result.data?.modelVersion ?? null,
        providerUpdatedAt: result.updatedAt,
        methodology: 'APEX_SUPPLEMENTAL_SENTIMENT_CHANGED_OBSERVATION_SHADOW_ONLY',
      },
    };
    try {
      const disposition = await this.eventBus.publish(event);
      if (disposition === 'DELIVERED') {
        this.publishedEvents += 1;
        this.lastFingerprint.set(symbol, currentFingerprint);
      }
    } catch (error) {
      this.rejectedEvents += 1;
      throw error;
    }
  }
}
