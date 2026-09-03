import { join } from 'node:path';
import { canonicalInstrumentId } from './providers/publicExchangeClient';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from './durableJsonFile';
import { resolvePrivateDataDir } from './privateConfigFile';

export const OPEN_INTEREST_HISTORY_VERSION = 1;
const DEFAULT_RETENTION_MS = 14 * 24 * 60 * 60_000;
const DEFAULT_EXPECTED_INTERVAL_MS = 5 * 60_000;
const DEFAULT_FRESHNESS_MS = 15 * 60_000;
const DEFAULT_MAX_SAMPLES = 200_000;

export interface OpenInterestSample {
  symbol: string;
  venue: string;
  openInterestUsd: number;
  observedAt: number;
  sourceTimestamp: number | null;
  provenance: string;
  dataState: 'live' | 'degraded';
}

interface OpenInterestHistoryFile {
  version: typeof OPEN_INTEREST_HISTORY_VERSION;
  updatedAt: string;
  samples: OpenInterestSample[];
}

export interface OpenInterestSeriesGap {
  from: number;
  to: number;
  durationMs: number;
}

export interface OpenInterestSeriesResult {
  symbol: string;
  venue: string | null;
  status: 'FRESH' | 'STALE' | 'INSUFFICIENT';
  freshnessAgeMs: number | null;
  expectedIntervalMs: number;
  gaps: OpenInterestSeriesGap[];
  samples: OpenInterestSample[];
  change: {
    absoluteUsd: number;
    percent: number | null;
    durationMs: number;
  } | null;
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finiteTimestamp(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= Date.now() + 60_000 ? Math.floor(parsed) : null;
}

function cleanText(value: unknown, max = 120): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max ? text : null;
}

function normalizeSample(value: unknown): OpenInterestSample | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<OpenInterestSample>;
  const symbolRaw = cleanText(row.symbol, 80);
  const venue = cleanText(row.venue, 80);
  const openInterestUsd = finitePositive(row.openInterestUsd);
  const observedAt = finiteTimestamp(row.observedAt);
  const sourceTimestamp = row.sourceTimestamp == null ? null : finiteTimestamp(row.sourceTimestamp);
  const provenance = cleanText(row.provenance, 180);
  const dataState = row.dataState === 'live' || row.dataState === 'degraded' ? row.dataState : null;
  if (!symbolRaw || !venue || openInterestUsd === null || observedAt === null || !provenance || !dataState) return null;
  return {
    symbol: canonicalInstrumentId(symbolRaw),
    venue: venue.toLowerCase(),
    openInterestUsd,
    observedAt,
    sourceTimestamp,
    provenance,
    dataState,
  };
}

function historyPath(): string {
  return join(resolvePrivateDataDir(), 'state', 'open-interest-history.json');
}

export class OpenInterestHistoryStore {
  private samples: OpenInterestSample[] = [];
  private readonly retentionMs: number;
  private readonly expectedIntervalMs: number;
  private readonly freshnessMs: number;
  private readonly maxSamples: number;
  private readonly filePath: string;

  constructor(options: {
    filePath?: string;
    retentionMs?: number;
    expectedIntervalMs?: number;
    freshnessMs?: number;
    maxSamples?: number;
  } = {}) {
    this.filePath = options.filePath ?? historyPath();
    this.retentionMs = Number.isFinite(options.retentionMs) && Number(options.retentionMs) >= 60_000
      ? Math.floor(Number(options.retentionMs)) : DEFAULT_RETENTION_MS;
    this.expectedIntervalMs = Number.isFinite(options.expectedIntervalMs) && Number(options.expectedIntervalMs) >= 10_000
      ? Math.floor(Number(options.expectedIntervalMs)) : DEFAULT_EXPECTED_INTERVAL_MS;
    this.freshnessMs = Number.isFinite(options.freshnessMs) && Number(options.freshnessMs) >= this.expectedIntervalMs
      ? Math.floor(Number(options.freshnessMs)) : DEFAULT_FRESHNESS_MS;
    this.maxSamples = Number.isFinite(options.maxSamples) && Number(options.maxSamples) >= 100
      ? Math.floor(Number(options.maxSamples)) : DEFAULT_MAX_SAMPLES;
    this.load();
  }

  private load(): void {
    const raw = readDurableJsonFileSync(this.filePath);
    if (raw === null) return;
    if (!raw || typeof raw !== 'object' || (raw as Partial<OpenInterestHistoryFile>).version !== OPEN_INTEREST_HISTORY_VERSION) {
      throw new Error('open_interest_history_unsupported_or_corrupt');
    }
    const rows = Array.isArray((raw as Partial<OpenInterestHistoryFile>).samples)
      ? (raw as Partial<OpenInterestHistoryFile>).samples as unknown[] : [];
    if (rows.length > this.maxSamples * 2) throw new Error('open_interest_history_capacity_exceeded');
    this.samples = rows.map(normalizeSample).filter((row): row is OpenInterestSample => row !== null);
    this.prune(Date.now(), false);
  }

  private persist(): void {
    const payload: OpenInterestHistoryFile = {
      version: OPEN_INTEREST_HISTORY_VERSION,
      updatedAt: new Date().toISOString(),
      samples: this.samples,
    };
    writeDurableJsonFileSync(this.filePath, payload, { maxBytes: 64 * 1024 * 1024, backup: true });
  }

  prune(now = Date.now(), persist = true): number {
    const cutoff = now - this.retentionMs;
    const before = this.samples.length;
    this.samples = this.samples
      .filter((row) => row.observedAt >= cutoff && row.observedAt <= now + 60_000)
      .sort((a, b) => a.observedAt - b.observedAt || a.symbol.localeCompare(b.symbol))
      .slice(-this.maxSamples);
    if (persist && this.samples.length !== before) this.persist();
    return before - this.samples.length;
  }

  append(input: OpenInterestSample): OpenInterestSample {
    const sample = normalizeSample(input);
    if (!sample) throw new Error('open_interest_sample_invalid');
    const duplicate = this.samples.find((row) =>
      row.symbol === sample.symbol && row.venue === sample.venue && row.observedAt === sample.observedAt);
    if (duplicate) return duplicate;
    this.samples.push(sample);
    this.prune(Date.now(), false);
    this.persist();
    return sample;
  }

  appendMany(inputs: OpenInterestSample[]): { accepted: number; rejected: number } {
    let accepted = 0;
    let rejected = 0;
    for (const input of inputs) {
      const sample = normalizeSample(input);
      if (!sample) { rejected += 1; continue; }
      const duplicate = this.samples.some((row) =>
        row.symbol === sample.symbol && row.venue === sample.venue && row.observedAt === sample.observedAt);
      if (duplicate) continue;
      this.samples.push(sample);
      accepted += 1;
    }
    if (accepted) {
      this.prune(Date.now(), false);
      this.persist();
    }
    return { accepted, rejected };
  }

  series(symbol: string, options: { venue?: string; since?: number; now?: number } = {}): OpenInterestSeriesResult {
    const canonical = canonicalInstrumentId(symbol);
    const now = options.now ?? Date.now();
    const since = Number.isFinite(options.since) ? Number(options.since) : now - this.retentionMs;
    const venue = options.venue?.trim().toLowerCase() || null;
    const samples = this.samples.filter((row) =>
      row.symbol === canonical && row.observedAt >= since && row.observedAt <= now + 60_000 && (!venue || row.venue === venue));
    const gaps: OpenInterestSeriesGap[] = [];
    const gapThreshold = this.expectedIntervalMs * 2.5;
    for (let index = 1; index < samples.length; index += 1) {
      const durationMs = samples[index].observedAt - samples[index - 1].observedAt;
      if (durationMs > gapThreshold) gaps.push({ from: samples[index - 1].observedAt, to: samples[index].observedAt, durationMs });
    }
    const latest = samples.at(-1) ?? null;
    const freshnessAgeMs = latest ? Math.max(0, now - latest.observedAt) : null;
    const status: OpenInterestSeriesResult['status'] = samples.length < 2
      ? 'INSUFFICIENT'
      : freshnessAgeMs !== null && freshnessAgeMs <= this.freshnessMs && gaps.length === 0
        ? 'FRESH'
        : 'STALE';
    const first = samples[0];
    const change = samples.length >= 2 && first && latest
      ? {
          absoluteUsd: latest.openInterestUsd - first.openInterestUsd,
          percent: first.openInterestUsd > 0 ? ((latest.openInterestUsd / first.openInterestUsd) - 1) * 100 : null,
          durationMs: latest.observedAt - first.observedAt,
        }
      : null;
    return { symbol: canonical, venue, status, freshnessAgeMs, expectedIntervalMs: this.expectedIntervalMs, gaps, samples, change };
  }

  stats(now = Date.now()): { samples: number; symbols: number; venues: number; oldestAt: number | null; newestAt: number | null; staleSymbols: number } {
    const symbols = new Set(this.samples.map((row) => row.symbol));
    const venues = new Set(this.samples.map((row) => row.venue));
    let staleSymbols = 0;
    for (const symbol of symbols) if (this.series(symbol, { now }).status !== 'FRESH') staleSymbols += 1;
    return {
      samples: this.samples.length,
      symbols: symbols.size,
      venues: venues.size,
      oldestAt: this.samples[0]?.observedAt ?? null,
      newestAt: this.samples.at(-1)?.observedAt ?? null,
      staleSymbols,
    };
  }
}

export interface OpenInterestSamplerOptions {
  intervalMs?: number;
  initialDelayMs?: number;
  maxBackoffMs?: number;
  sample: () => Promise<OpenInterestSample[]>;
  store: OpenInterestHistoryStore;
  onError?: (error: unknown) => void;
}

export class OpenInterestSampler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private started = false;
  private failureCount = 0;
  private readonly intervalMs: number;
  private readonly initialDelayMs: number;
  private readonly maxBackoffMs: number;

  constructor(private readonly options: OpenInterestSamplerOptions) {
    this.intervalMs = Number.isFinite(options.intervalMs) && Number(options.intervalMs) >= 30_000
      ? Math.floor(Number(options.intervalMs)) : DEFAULT_EXPECTED_INTERVAL_MS;
    this.initialDelayMs = Number.isFinite(options.initialDelayMs) && Number(options.initialDelayMs) >= 0
      ? Math.floor(Number(options.initialDelayMs)) : 0;
    this.maxBackoffMs = Number.isFinite(options.maxBackoffMs) && Number(options.maxBackoffMs) >= this.intervalMs
      ? Math.floor(Number(options.maxBackoffMs)) : Math.max(this.intervalMs, 30 * 60_000);
  }

  async runOnce(): Promise<{ accepted: number; rejected: number }> {
    if (this.running) return { accepted: 0, rejected: 0 };
    this.running = true;
    try {
      const rows = await this.options.sample();
      return this.options.store.appendMany(rows);
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.schedule(this.initialDelayMs);
  }

  private schedule(delayMs: number): void {
    if (!this.started) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runOnce()
        .then(() => {
          this.failureCount = 0;
          this.schedule(this.intervalMs);
        })
        .catch((error) => {
          this.failureCount += 1;
          this.options.onError?.(error);
          const backoffMs = Math.min(this.maxBackoffMs, this.intervalMs * (2 ** Math.min(5, this.failureCount)));
          this.schedule(backoffMs);
        });
    }, Math.max(0, delayMs));
    this.timer.unref?.();
  }

  stop(): void {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
