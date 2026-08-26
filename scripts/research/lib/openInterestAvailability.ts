/**
 * Per-split, per-field availability map for the open-interest archive.
 *
 * WHY THIS MODULE EXISTS AS A SEPARATE, FIRST-CLASS ARTEFACT
 * ---------------------------------------------------------
 * A conditioner is only as trustworthy as the field it reads, and a field can be
 * untrustworthy in two completely different ways:
 *
 *   1. The values are wrong. `runOpenInterestFeedAudit.mts` tests for that.
 *   2. The values are absent exactly where they are needed, while an aggregate
 *      coverage summary still looks healthy.
 *
 * The second failure is the dangerous one because it is invisible to the obvious
 * check. `topPositionRatio` in this archive is the worked example: 56% populated
 * overall, which passes any "is it mostly there" test, yet by calendar quarter it
 * reads 24/2160, 674/2184, **1/2208**, 416/2208 across 2022 before going complete in
 * 2023. A conditioner reading it would have been driven by roughly one percent of
 * 2022 bars and would still have produced a position series that looks like a signal.
 *
 * So this module refuses to summarise. It reports coverage per field, per split,
 * separately for the train and test window, and separately per calendar quarter --
 * because those are the three shapes in which a hole can hide from an average.
 *
 * THREE-VALUED, NOT TWO-VALUED
 * ----------------------------
 * Conditioning status is `available` / `partial` / `unavailable`, never a boolean and
 * never a silently zero-filled number. A split where the field does not exist is not
 * a split where the conditioner scored zero; it is a split where the conditioner could
 * not run, and those two must never be added together. The 2021-08..2021-10 window is
 * why this matters concretely: it produced the entire apparent edge of the `tsm`
 * family (+81.87% of a +44.81% total), and open interest does not begin until
 * 2022-01-01, so it is precisely the window most likely to flatter a result and also
 * the one where an OI conditioner is blind. Reporting that as `unavailable` rather
 * than as a zero is the difference between an honest table and a misleading one.
 *
 * TRAIN COVERAGE IS A REQUIREMENT, NOT A DETAIL
 * ---------------------------------------------
 * Both windows are scored because they fail differently. A hole in the *test* window
 * means the conditioner cannot act. A hole in the *train* window means its threshold
 * was chosen on a sample that mostly lacked the input -- the parameter is unfitted
 * rather than misfitted. Either one invalidates the split, so `status` is driven by
 * the worse of the two.
 */

import {
  alignEventSeriesToCandles,
  OPEN_INTEREST_MAX_STALENESS_MS,
  type Candle,
  type OpenInterestPoint,
} from './researchDataset';
import type { WalkForwardSplit } from './walkForward';

/**
 * Numeric fields of the archive that a conditioner could read.
 *
 * `oi` and `oiUsd` are always present as numbers; the four ratio columns are
 * `number | null | undefined` in the envelope, which is exactly the hazard this
 * module exists to measure.
 */
export const OPEN_INTEREST_FIELDS = [
  'oi',
  'oiUsd',
  'topAccountRatio',
  'topPositionRatio',
  'accountRatio',
  'takerRatio',
] as const;

export type OpenInterestField = (typeof OPEN_INTEREST_FIELDS)[number];

export type ConditioningStatus = 'available' | 'partial' | 'unavailable';

/**
 * Coverage bars required before a window is considered conditionable.
 *
 * `available` is deliberately strict: at 0.95 a split still tolerates the odd
 * upstream hole but cannot be dominated by them. `unavailable` triggers below 0.50 on
 * *either* window, because a threshold selected on a train window that is more than
 * half empty is not a fitted parameter, and a test window that is more than half
 * empty cannot exercise it.
 */
export const AVAILABILITY_THRESHOLDS = {
  availableShare: 0.95,
  unavailableShare: 0.5,
} as const;

export interface WindowCoverage {
  bars: number;
  /** Bars where every symbol in the universe carries a usable value. */
  barsCoveredEverySymbol: number;
  /** `barsCoveredEverySymbol / bars`. The binding figure: families trade all symbols. */
  share: number;
  /** Per-symbol share, so a single lagging symbol is visible rather than averaged away. */
  bySymbolShare: Record<string, number>;
}

export interface SplitSeriesAvailability {
  splitIndex: number;
  /** Field name, or the name of a derived series such as `oiBuildupRank(atr20)`. */
  series: string;
  train: WindowCoverage;
  test: WindowCoverage;
  status: ConditioningStatus;
  /** Human-readable justification, carried into the results table verbatim. */
  reason: string;
}

export interface QuarterCoverage {
  quarter: string;
  bars: number;
  barsCoveredEverySymbol: number;
  share: number;
}

export interface SeriesAvailability {
  series: string;
  /** Whole development window, minimised across symbols. */
  overallShare: number;
  /** First bar at which every symbol carries a usable value. */
  firstFullyCoveredIso: string | null;
  /** Longest contiguous run of fully covered bars, in bars. */
  longestContiguousBars: number;
  longestContiguousFromIso: string | null;
  /**
   * Per-calendar-quarter coverage. This is the view that exposes a concentrated hole
   * hiding inside a healthy overall share, which no aggregate can show.
   */
  byQuarter: QuarterCoverage[];
  /** Lowest quarterly share anywhere in the development window. */
  worstQuarter: QuarterCoverage | null;
  splits: SplitSeriesAvailability[];
  /** Splits whose status is `available`, the only ones a conditioned arm may aggregate. */
  availableSplitIndices: number[];
  partialSplitIndices: number[];
  unavailableSplitIndices: number[];
}

/**
 * Align one archive field onto a candle grid.
 *
 * A value must be finite and strictly positive to count. The `> 0` guard is not
 * cosmetic: the archive encodes upstream outages as zeros (13 hours in the
 * development window, identical across all ten symbols), and every field here is a
 * quantity or a ratio for which zero is not a physically meaningful observation. A
 * zero admitted as data would read as a -100% collapse followed by an infinite
 * recovery, which is a fabricated liquidation cascade landing on a genuinely volatile
 * day -- the exact pattern a liquidation conditioner is built to detect.
 */
export function alignFieldToCandles(
  candles: readonly Candle[],
  openInterest: readonly OpenInterestPoint[],
  field: OpenInterestField,
): (number | undefined)[] {
  return alignEventSeriesToCandles(candles, openInterest, OPEN_INTEREST_MAX_STALENESS_MS).map(
    (point) => {
      if (!point) {
        return undefined;
      }
      const value = point[field];
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
    },
  );
}

function quarterKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

/** Bars where *every* symbol carries a value -- the constraint a pooled family faces. */
function coveredEverySymbol(perSymbol: readonly (number | undefined)[][]): boolean[] {
  const barCount = perSymbol.length > 0 ? perSymbol[0].length : 0;
  const covered = new Array<boolean>(barCount).fill(true);
  for (const series of perSymbol) {
    for (let index = 0; index < barCount; index += 1) {
      if (series[index] === undefined) {
        covered[index] = false;
      }
    }
  }
  return covered;
}

function windowCoverage(
  covered: readonly boolean[],
  perSymbol: readonly (number | undefined)[][],
  symbols: readonly string[],
  start: number,
  end: number,
): WindowCoverage {
  const bars = Math.max(0, end - start);
  let barsCovered = 0;
  for (let index = start; index < end; index += 1) {
    if (covered[index]) {
      barsCovered += 1;
    }
  }
  const bySymbolShare: Record<string, number> = {};
  for (let s = 0; s < perSymbol.length; s += 1) {
    let present = 0;
    for (let index = start; index < end; index += 1) {
      if (perSymbol[s][index] !== undefined) {
        present += 1;
      }
    }
    bySymbolShare[symbols[s]] = bars > 0 ? present / bars : 0;
  }
  return {
    bars,
    barsCoveredEverySymbol: barsCovered,
    share: bars > 0 ? barsCovered / bars : 0,
    bySymbolShare,
  };
}

function classify(train: WindowCoverage, test: WindowCoverage): {
  status: ConditioningStatus;
  reason: string;
} {
  const trainPct = `${(train.share * 100).toFixed(1)}%`;
  const testPct = `${(test.share * 100).toFixed(1)}%`;
  const { availableShare, unavailableShare } = AVAILABILITY_THRESHOLDS;

  if (train.share < unavailableShare || test.share < unavailableShare) {
    const which =
      train.share < unavailableShare && test.share < unavailableShare
        ? 'neither window has'
        : train.share < unavailableShare
          ? 'the train window lacks'
          : 'the test window lacks';
    return {
      status: 'unavailable',
      reason:
        `train ${trainPct} / test ${testPct} covered: ${which} enough of this field to condition on. ` +
        'Excluded from conditioning; reported as a gap, not as a zero result.',
    };
  }
  if (train.share >= availableShare && test.share >= availableShare) {
    return { status: 'available', reason: `train ${trainPct} / test ${testPct} covered` };
  }
  return {
    status: 'partial',
    reason:
      `train ${trainPct} / test ${testPct} covered: usable but incompletely, so the conditioner acts ` +
      'on a subset of bars and the split is excluded from the headline comparison.',
  };
}

export interface AvailabilityRequest {
  symbols: readonly string[];
  /** Four-hour candle grid, identical for every symbol (asserted upstream). */
  candles: readonly Candle[];
  /** Raw hourly archive rows per symbol, index-aligned with `symbols`. */
  openInterestBySymbol: readonly (readonly OpenInterestPoint[])[];
  splits: readonly WalkForwardSplit[];
  /** Defaults to every field, so an excluded field still carries its evidence. */
  fields?: readonly OpenInterestField[];
}

/**
 * Coverage report for one already-aligned series, per split and per quarter.
 *
 * This is the shared core, and it deliberately knows nothing about where the series
 * came from. A raw archive column and a derived indicator are subject to exactly the
 * same question -- is this input present in the window where a parameter was fitted, and
 * in the window where it was exercised -- so they are measured by the same code rather
 * than by two implementations that could drift apart.
 */
export function availabilityForAlignedSeries(
  series: string,
  perSymbol: readonly (number | undefined)[][],
  symbols: readonly string[],
  candles: readonly Candle[],
  splits: readonly WalkForwardSplit[],
): SeriesAvailability {
  const covered = coveredEverySymbol(perSymbol);

  let barsCovered = 0;
  let firstFullyCovered: number | null = null;
  let longest = 0;
  let longestFrom: number | null = null;
  let run = 0;
  let runStart: number | null = null;
  const quarters = new Map<string, { bars: number; covered: number }>();

  for (let index = 0; index < candles.length; index += 1) {
    const key = quarterKey(candles[index].t);
    const bucket = quarters.get(key) ?? { bars: 0, covered: 0 };
    bucket.bars += 1;
    if (covered[index]) {
      bucket.covered += 1;
      barsCovered += 1;
      if (firstFullyCovered === null) {
        firstFullyCovered = candles[index].t;
      }
      if (run === 0) {
        runStart = candles[index].t;
      }
      run += 1;
      if (run > longest) {
        longest = run;
        longestFrom = runStart;
      }
    } else {
      run = 0;
    }
    quarters.set(key, bucket);
  }

  const byQuarter: QuarterCoverage[] = [...quarters.entries()]
    .map(([quarter, bucket]) => ({
      quarter,
      bars: bucket.bars,
      barsCoveredEverySymbol: bucket.covered,
      share: bucket.bars > 0 ? bucket.covered / bucket.bars : 0,
    }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  const worstQuarter = byQuarter.reduce<QuarterCoverage | null>(
    (worst, entry) => (worst === null || entry.share < worst.share ? entry : worst),
    null,
  );

  const splitAvailability = splits.map((split) => {
    const train = windowCoverage(covered, perSymbol, symbols, split.trainStart, split.trainEnd);
    const test = windowCoverage(covered, perSymbol, symbols, split.testStart, split.testEnd);
    const { status, reason } = classify(train, test);
    return { splitIndex: split.index, series, train, test, status, reason };
  });

  return {
    series,
    overallShare: candles.length > 0 ? barsCovered / candles.length : 0,
    firstFullyCoveredIso:
      firstFullyCovered === null ? null : new Date(firstFullyCovered).toISOString(),
    longestContiguousBars: longest,
    longestContiguousFromIso: longestFrom === null ? null : new Date(longestFrom).toISOString(),
    byQuarter,
    worstQuarter,
    splits: splitAvailability,
    availableSplitIndices: splitAvailability
      .filter((entry) => entry.status === 'available')
      .map((entry) => entry.splitIndex),
    partialSplitIndices: splitAvailability
      .filter((entry) => entry.status === 'partial')
      .map((entry) => entry.splitIndex),
    unavailableSplitIndices: splitAvailability
      .filter((entry) => entry.status === 'unavailable')
      .map((entry) => entry.splitIndex),
  };
}

/**
 * Build the availability map for the raw archive fields.
 *
 * Every field in `fields` is measured whether or not it ends up being used, because
 * "we did not use this field" is only a defensible statement if the measurement that
 * ruled it out is on the record.
 *
 * Note what this does *not* establish. A raw field being fully covered on a split does
 * not mean an indicator derived from it is: `oiBuildupRank` needs an `atrBars` lookback
 * plus a 180-bar ranking window on top of the raw coverage, so it goes on being blind
 * for weeks after `oi` itself becomes complete. Feed the derived series through
 * `availabilityForAlignedSeries` and drive conditioning status off *that*; using the raw
 * field's status as a proxy would overstate where the conditioner can act.
 */
export function buildOpenInterestAvailability(
  request: AvailabilityRequest,
): SeriesAvailability[] {
  const { symbols, candles, openInterestBySymbol, splits } = request;
  const fields = request.fields ?? OPEN_INTEREST_FIELDS;

  return fields.map((field) =>
    availabilityForAlignedSeries(
      field,
      openInterestBySymbol.map((rows) => alignFieldToCandles(candles, rows, field)),
      symbols,
      candles,
      splits,
    ),
  );
}

/** Lookup helper so the runner never has to re-scan the map. */
export function statusFor(
  availability: readonly SeriesAvailability[],
  series: string,
  splitIndex: number,
): ConditioningStatus {
  const entry = availability.find((candidate) => candidate.series === series);
  const split = entry?.splits.find((candidate) => candidate.splitIndex === splitIndex);
  return split?.status ?? 'unavailable';
}
