import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BacktestCandle } from '../backtesting';

export interface FundingSignalRow { t: number; rate: number; mark: number | null }
export interface PositioningSignalRow {
  t: number;
  oi: number;
  oiUsd: number;
  topAccountRatio: number;
  topPositionRatio: number;
  accountRatio: number;
  takerRatio: number;
}
export interface OrderBookDepthSignalRow {
  t: number;
  bidDepth: number;
  askDepth: number;
  bidNotional: number;
  askNotional: number;
  imbalance: number;
}
export interface NewsSignalRow { t: number; title: string; url: string; publisher: string; symbols: string[] }
export interface SentimentSignalRow { t: number; value: number; classification: string }

export interface HistoricalSignalSeriesMeta {
  kind: string;
  source: string;
  semanticLabel: string;
  coverage: { from: string | null; to: string | null; rows: number };
  limitations: string[];
  contentSha256: string;
  fileSha256: string;
}

export interface HistoricalSignalBundle {
  symbol: string;
  identitySha256: string;
  funding: FundingSignalRow[];
  positioning: PositioningSignalRow[];
  orderBookDepth: OrderBookDepthSignalRow[];
  news: NewsSignalRow[];
  sentiment: SentimentSignalRow[];
  series: Record<string, HistoricalSignalSeriesMeta>;
  unavailable: Array<{ kind: string; status: string; reason: string }>;
}

type SeriesEnvelope<T> = {
  kind: string;
  source: string;
  semanticLabel: string;
  coverage: HistoricalSignalSeriesMeta['coverage'];
  limitations: string[];
  rows: T[];
  integrity: { algorithm: 'sha256'; contentSha256: string; verifiedAtWrite: boolean };
  [key: string]: unknown;
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function readVerifiedSeries<T>(file: string): { envelope: SeriesEnvelope<T>; meta: HistoricalSignalSeriesMeta } {
  const bytes = fs.readFileSync(file);
  const envelope = JSON.parse(bytes.toString('utf8')) as SeriesEnvelope<T>;
  const { integrity, ...payload } = envelope;
  if (integrity?.algorithm !== 'sha256' || sha256(JSON.stringify(payload)) !== integrity.contentSha256) {
    throw new Error(`historical_signal_content_identity_mismatch:${file}`);
  }
  return {
    envelope,
    meta: {
      kind: envelope.kind,
      source: envelope.source,
      semanticLabel: envelope.semanticLabel,
      coverage: envelope.coverage,
      limitations: envelope.limitations,
      contentSha256: integrity.contentSha256,
      fileSha256: sha256(bytes),
    },
  };
}

function assertManifest(dataDir: string): { unavailable: HistoricalSignalBundle['unavailable']; fileHashes: Map<string, string> } {
  const manifestPath = path.join(dataDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    artifacts: Array<{ file: string; fileSha256: string }>;
    unavailable?: HistoricalSignalBundle['unavailable'];
    integrity: { algorithm: 'sha256'; contentSha256: string };
    [key: string]: unknown;
  };
  const { integrity, ...core } = manifest;
  if (integrity?.algorithm !== 'sha256' || sha256(JSON.stringify(core)) !== integrity.contentSha256) {
    throw new Error(`historical_signal_manifest_identity_mismatch:${manifestPath}`);
  }
  return {
    unavailable: manifest.unavailable ?? [],
    fileHashes: new Map(manifest.artifacts.map((artifact) => [path.basename(artifact.file), artifact.fileSha256])),
  };
}

function filterWindow<T extends { t: number }>(rows: T[], from?: number, to?: number): T[] {
  if (from == null && to == null) return rows;
  const lower = from == null ? Number.NEGATIVE_INFINITY : from;
  const upper = to == null ? Number.POSITIVE_INFINITY : to;
  const prior = rows.filter((row) => row.t < lower).at(-1);
  const selected = rows.filter((row) => row.t >= lower && row.t <= upper);
  return prior ? [prior, ...selected] : selected;
}

export function loadHistoricalSignalBundle(args: { dataDir: string; symbol: string; from?: number; to?: number }): HistoricalSignalBundle {
  const symbol = args.symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const prefix = symbol.toLowerCase();
  const manifest = assertManifest(args.dataDir);
  const inputs = {
    funding: readVerifiedSeries<FundingSignalRow>(path.join(args.dataDir, `${prefix}-funding.json`)),
    positioning: readVerifiedSeries<PositioningSignalRow>(path.join(args.dataDir, `${prefix}-open-interest-top-trader-1h.json`)),
    orderBookDepth: readVerifiedSeries<OrderBookDepthSignalRow>(path.join(args.dataDir, `${prefix}-order-book-depth-weekly-sample.json`)),
    news: readVerifiedSeries<NewsSignalRow>(path.join(args.dataDir, 'crypto-news-google-rss.json')),
    sentiment: readVerifiedSeries<SentimentSignalRow>(path.join(args.dataDir, 'crypto-fear-greed-daily.json')),
  };
  for (const [key, value] of Object.entries(inputs)) {
    const expected = manifest.fileHashes.get(path.basename(key === 'positioning'
      ? `${prefix}-open-interest-top-trader-1h.json`
      : key === 'orderBookDepth'
        ? `${prefix}-order-book-depth-weekly-sample.json`
        : key === 'news'
          ? 'crypto-news-google-rss.json'
          : key === 'sentiment'
            ? 'crypto-fear-greed-daily.json'
            : `${prefix}-funding.json`));
    if (!expected || expected !== value.meta.fileSha256) throw new Error(`historical_signal_file_identity_mismatch:${key}`);
  }
  const series = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value.meta]));
  const identitySha256 = sha256(JSON.stringify(Object.fromEntries(Object.entries(series).map(([key, value]) => [key, value.contentSha256]))));
  return {
    symbol,
    identitySha256,
    funding: filterWindow(inputs.funding.envelope.rows, args.from, args.to),
    positioning: filterWindow(inputs.positioning.envelope.rows, args.from, args.to),
    orderBookDepth: filterWindow(inputs.orderBookDepth.envelope.rows, args.from, args.to),
    news: filterWindow(inputs.news.envelope.rows.filter((row) => row.symbols.includes(symbol)), args.from, args.to),
    sentiment: filterWindow(inputs.sentiment.envelope.rows, args.from, args.to),
    series,
    unavailable: manifest.unavailable,
  };
}

export function loadHistoricalCandles(args: { dataDir: string; symbol: string; from?: number; to?: number }): {
  candles: BacktestCandle[];
  identitySha256: string;
  meta: HistoricalSignalSeriesMeta;
} {
  const symbol = args.symbol.replace(/[^A-Z0-9]/gi, '').toLowerCase();
  const manifest = assertManifest(args.dataDir);
  const file = path.join(args.dataDir, `${symbol}-candles-1h.json`);
  const series = readVerifiedSeries<{ t: number; o: number; h: number; l: number; c: number; v: number }>(file);
  const expected = manifest.fileHashes.get(path.basename(file));
  if (!expected || expected !== series.meta.fileSha256) throw new Error('historical_candle_file_identity_mismatch');
  const rows = filterWindow(series.envelope.rows, args.from, args.to);
  return {
    candles: rows.filter((row) => (args.from == null || row.t >= args.from) && (args.to == null || row.t <= args.to)).map((row) => ({
      time: new Date(row.t).toISOString(), open: row.o, high: row.h, low: row.l, close: row.c, volume: row.v,
    })),
    identitySha256: series.meta.contentSha256,
    meta: series.meta,
  };
}

export function asOf<T extends { t: number }>(rows: T[], timestamp: number, maxAgeMs: number): T | null {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle].t <= timestamp) low = middle + 1;
    else high = middle;
  }
  const value = rows[low - 1];
  return value && timestamp - value.t <= maxAgeMs ? value : null;
}
