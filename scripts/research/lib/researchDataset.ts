/**
 * Isolated dataset loader for the self-built walk-forward baseline study.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `acquireProfitabilityData.mts`
 * -------------------------------------------------------------------
 * The verified series under `QA/profitability-structural-remediation/data` span
 * 2020-09-01 .. 2025-12-31, which *includes* the sealed final-holdout window
 * (2024-01-01 .. 2025-12-31, seal identity `e656624e...`). Iterating a strategy
 * search against those rows would silently retune on the holdout and burn the
 * seal. This loader therefore refuses to hand out any row at or after
 * 2024-01-01T00:00:00Z: `loadDevelopmentCandles` filters, and
 * `assertNoHoldoutLeakage` re-checks the filtered result and throws. The guard is
 * deliberately redundant so that a future caller who assembles rows by hand still
 * trips it.
 *
 * This module reads the data files only. It never reads `holdout-seal.json` or
 * `structural-profitability-results.json`, so no sealed verdict can leak into a
 * development-window decision.
 *
 * NO-FABRICATION RULE
 * -------------------
 * Funding is an 8-hour event series and open interest genuinely has missing hours
 * (ETH is short 79 of an ideal 35,064). Aligning either onto the hourly candle
 * grid therefore produces holes. Those holes are returned as `undefined` and are
 * never interpolated, forward-filled or zero-filled; a family that needs the value
 * must fail closed and not trade that bar. `alignEventSeriesToCandles` carries the
 * as-of semantics that make this explicit.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Repository root, resolved from this file's own location (scripts/research/lib). */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** The verified, hash-manifested series directory produced by the acquisition script. */
export const DATA_DIR = path.join(REPO_ROOT, 'QA', 'profitability-structural-remediation', 'data');

/** First millisecond of the sealed final holdout. Nothing at or after this may be read. */
export const SEALED_HOLDOUT_FROM_MS = Date.UTC(2024, 0, 1, 0, 0, 0, 0);

/** First millisecond of the development window this study is allowed to iterate on. */
export const DEVELOPMENT_FROM_MS = Date.UTC(2021, 0, 1, 0, 0, 0, 0);

/** Exclusive upper bound of the development window (== the sealed holdout start). */
export const DEVELOPMENT_TO_EXCLUSIVE_MS = SEALED_HOLDOUT_FROM_MS;

/**
 * The ten symbols carried by the manifest, in a fixed order so that any
 * cross-sectional ranking is reproducible run to run.
 */
export const RESEARCH_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'LTCUSDT',
] as const;

export type ResearchSymbol = (typeof RESEARCH_SYMBOLS)[number];

export interface Candle {
  /** Open time, epoch milliseconds, UTC. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface FundingEvent {
  t: number;
  /** Realized funding rate as a fraction (0.0001 == 1 basis point). */
  rate: number;
  /**
   * Mark price at the funding event, or 0 where the upstream archive carried no
   * value. Treated as missing rather than as a real zero price by
   * `alignFundingToCandles`.
   */
  mark: number;
}

export interface OpenInterestPoint {
  t: number;
  /** Open interest in base units. */
  oi: number;
  /** Open interest notional in USD. */
  oiUsd: number;
  topAccountRatio?: number | null;
  topPositionRatio?: number | null;
  accountRatio?: number | null;
  takerRatio?: number | null;
}

export interface SeriesEnvelope<Row> {
  schemaVersion: number | string;
  kind: string;
  source: string;
  semanticLabel: string;
  symbol: string;
  interval: string;
  coverage: { from: string; to: string; rows: number };
  limitations?: unknown;
  provenance?: unknown;
  rows: Row[];
  integrity?: { contentSha256?: string; [key: string]: unknown };
}

export class HoldoutLeakageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldoutLeakageError';
  }
}

function symbolFileStem(symbol: string): string {
  return symbol.trim().toLowerCase();
}

function readEnvelope<Row>(fileName: string): SeriesEnvelope<Row> {
  const absolute = path.join(DATA_DIR, fileName);
  const parsed = JSON.parse(readFileSync(absolute, 'utf8')) as SeriesEnvelope<Row>;

  if (!Array.isArray(parsed.rows)) {
    throw new Error(`${fileName}: envelope has no rows array`);
  }

  // Cheap truncation detector: the manifest records the row count the acquisition
  // run actually stored, so a short read or a partially written file is caught here
  // rather than silently shortening a backtest window.
  const declared = Number(parsed.coverage?.rows);
  if (Number.isFinite(declared) && declared !== parsed.rows.length) {
    throw new Error(
      `${fileName}: coverage.rows says ${declared} but the file carries ${parsed.rows.length} rows`,
    );
  }

  return parsed;
}

/**
 * Throws if any row is at or after the sealed holdout boundary.
 *
 * Called by every loader in this module *after* filtering, so that the guard also
 * covers rows assembled or concatenated by a caller.
 */
export function assertNoHoldoutLeakage(rows: readonly { t: number }[], label: string): void {
  for (const row of rows) {
    if (row.t >= SEALED_HOLDOUT_FROM_MS) {
      throw new HoldoutLeakageError(
        `${label}: row at ${new Date(row.t).toISOString()} is inside the sealed final holdout ` +
          `(>= ${new Date(SEALED_HOLDOUT_FROM_MS).toISOString()}). The holdout is one-shot and must ` +
          'not be read during iteration.',
      );
    }
  }
}

function withinDevelopmentWindow<Row extends { t: number }>(rows: readonly Row[]): Row[] {
  return rows.filter((row) => row.t >= DEVELOPMENT_FROM_MS && row.t < DEVELOPMENT_TO_EXCLUSIVE_MS);
}

function assertStrictlyIncreasing(rows: readonly { t: number }[], label: string): void {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].t <= rows[index - 1].t) {
      throw new Error(
        `${label}: timestamps are not strictly increasing at index ${index} ` +
          `(${rows[index - 1].t} then ${rows[index].t})`,
      );
    }
  }
}

export interface LoadedSeries<Row> {
  symbol: string;
  kind: string;
  semanticLabel: string;
  interval: string;
  /** Rows restricted to the development window. */
  rows: Row[];
  /** Coverage of the *file*, before the development-window restriction. */
  fileCoverage: { from: string; to: string; rows: number };
}

/** Hourly OHLCV candles for one symbol, restricted to the development window. */
export function loadDevelopmentCandles(symbol: string): LoadedSeries<Candle> {
  const fileName = `${symbolFileStem(symbol)}-candles-1h.json`;
  const envelope = readEnvelope<Candle>(fileName);
  const rows = withinDevelopmentWindow(envelope.rows);
  assertStrictlyIncreasing(rows, fileName);
  assertNoHoldoutLeakage(rows, fileName);
  return {
    symbol: envelope.symbol,
    kind: envelope.kind,
    semanticLabel: envelope.semanticLabel,
    interval: envelope.interval,
    rows,
    fileCoverage: envelope.coverage,
  };
}

/** Realized funding events for one symbol, restricted to the development window. */
export function loadDevelopmentFunding(symbol: string): LoadedSeries<FundingEvent> {
  const fileName = `${symbolFileStem(symbol)}-funding.json`;
  const envelope = readEnvelope<FundingEvent>(fileName);
  const rows = withinDevelopmentWindow(envelope.rows);
  assertStrictlyIncreasing(rows, fileName);
  assertNoHoldoutLeakage(rows, fileName);
  return {
    symbol: envelope.symbol,
    kind: envelope.kind,
    semanticLabel: envelope.semanticLabel,
    interval: envelope.interval,
    rows,
    fileCoverage: envelope.coverage,
  };
}

/**
 * Open interest plus top-trader / taker-flow ratios for one symbol, restricted to
 * the development window. Note the file itself only starts 2022-01-01, so any
 * family using this series has a genuinely shorter development span than the
 * candle-only families. That is a real coverage limit, not something to pad.
 */
export function loadDevelopmentOpenInterest(symbol: string): LoadedSeries<OpenInterestPoint> {
  const fileName = `${symbolFileStem(symbol)}-open-interest-top-trader-1h.json`;
  const envelope = readEnvelope<OpenInterestPoint>(fileName);
  const rows = withinDevelopmentWindow(envelope.rows);
  assertStrictlyIncreasing(rows, fileName);
  assertNoHoldoutLeakage(rows, fileName);
  return {
    symbol: envelope.symbol,
    kind: envelope.kind,
    semanticLabel: envelope.semanticLabel,
    interval: envelope.interval,
    rows,
    fileCoverage: envelope.coverage,
  };
}

/**
 * Align an irregular event series onto a candle grid with strict as-of semantics.
 *
 * `out[i]` is the most recent event whose timestamp is `<= candles[i].t`, or
 * `undefined` when no such event exists. Two properties matter for honesty:
 *
 *  1. **No lookahead.** An event stamped inside bar `i` (after its open) is not
 *     visible at bar `i`; only events at or before the bar's open time are.
 *  2. **No fabrication.** Bars before the first event are `undefined`, not
 *     back-filled. Callers must skip those bars rather than assume a value.
 *
 * `maxStalenessMs` bounds how old an event may be and still count as current. It
 * exists because a genuine upstream hole (a missing funding event, a missing OI
 * hour) would otherwise be papered over by an arbitrarily stale carry-forward. A
 * value older than the bound yields `undefined`.
 */
export function alignEventSeriesToCandles<Row extends { t: number }>(
  candles: readonly Candle[],
  events: readonly Row[],
  maxStalenessMs: number,
): (Row | undefined)[] {
  const aligned: (Row | undefined)[] = new Array(candles.length).fill(undefined);
  let cursor = -1;

  for (let index = 0; index < candles.length; index += 1) {
    const barTime = candles[index].t;
    while (cursor + 1 < events.length && events[cursor + 1].t <= barTime) {
      cursor += 1;
    }
    if (cursor < 0) {
      continue;
    }
    const candidate = events[cursor];
    aligned[index] = barTime - candidate.t <= maxStalenessMs ? candidate : undefined;
  }

  return aligned;
}

/** Funding events are published every 8 hours, so a value older than that is a hole. */
export const FUNDING_MAX_STALENESS_MS = 8 * 60 * 60 * 1000;

/** Open interest is hourly, so anything older than one hour is a hole. */
export const OPEN_INTEREST_MAX_STALENESS_MS = 60 * 60 * 1000;

/**
 * Aligned funding rates for a candle grid. `mark` is deliberately not exposed
 * here: the archive stores 0 where no mark price was published, and treating that
 * as a real price would be fabrication. Only `rate` is used.
 */
export function alignFundingToCandles(
  candles: readonly Candle[],
  funding: readonly FundingEvent[],
): (number | undefined)[] {
  return alignEventSeriesToCandles(candles, funding, FUNDING_MAX_STALENESS_MS).map((event) =>
    event ? event.rate : undefined,
  );
}

/**
 * Aligned open interest (base units) for a candle grid, `undefined` on genuine holes.
 *
 * A zero is rejected, not returned. `runOpenInterestFeedAudit.mts` found 13 hours in the
 * development window where the archive stores `oi: 0` on every one of the ten symbols
 * simultaneously (a ten-hour block from 2022-03-07T16:00Z, plus 2023-04-10T09:00Z,
 * 2023-11-11T22:00Z and 2023-11-23T04:00Z), which
 * a perpetual swap cannot do: zero outstanding contracts would mean the instrument ceased
 * to exist. Those rows are the upstream metrics feed encoding an outage as a zero.
 *
 * Returning them verbatim would be worse than returning nothing, because any conditioner
 * built on the change in open interest would read a real value followed by a zero as a
 * -100% collapse and then a +infinite recovery - a fabricated liquidation cascade, landed
 * on a genuinely volatile day, which is exactly the pattern such a conditioner is meant to
 * detect. So the guard is `> 0` and the bar fails closed, consistent with the
 * no-fabrication rule at the top of this file.
 */
export function alignOpenInterestToCandles(
  candles: readonly Candle[],
  openInterest: readonly OpenInterestPoint[],
): (number | undefined)[] {
  return alignEventSeriesToCandles(candles, openInterest, OPEN_INTEREST_MAX_STALENESS_MS).map(
    (point) => (point && Number.isFinite(point.oi) && point.oi > 0 ? point.oi : undefined),
  );
}

/**
 * Resample an hourly candle series to a coarser bar size, in whole hours.
 *
 * Only groups that are *complete* are emitted, so a partial trailing group is
 * dropped rather than published as a short bar. Grouping is by absolute epoch
 * boundary (`t % sizeMs === 0`) rather than by array position, so a missing hour
 * shifts nothing.
 */
export function resampleCandles(candles: readonly Candle[], hoursPerBar: number): Candle[] {
  if (!Number.isInteger(hoursPerBar) || hoursPerBar < 1) {
    throw new Error(`hoursPerBar must be a positive integer, received ${hoursPerBar}`);
  }
  if (hoursPerBar === 1) {
    return [...candles];
  }

  const sizeMs = hoursPerBar * 60 * 60 * 1000;
  const out: Candle[] = [];
  let bucketStart = -1;
  let group: Candle[] = [];

  const flush = (): void => {
    if (group.length === hoursPerBar) {
      let high = group[0].h;
      let low = group[0].l;
      let volume = 0;
      for (const bar of group) {
        if (bar.h > high) high = bar.h;
        if (bar.l < low) low = bar.l;
        volume += bar.v;
      }
      out.push({
        t: bucketStart,
        o: group[0].o,
        h: high,
        l: low,
        c: group[group.length - 1].c,
        v: volume,
      });
    }
    group = [];
  };

  for (const bar of candles) {
    const start = Math.floor(bar.t / sizeMs) * sizeMs;
    if (start !== bucketStart) {
      flush();
      bucketStart = start;
    }
    group.push(bar);
  }
  flush();

  return out;
}
