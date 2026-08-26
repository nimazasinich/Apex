/**
 * Open-interest feed integrity audit (research only, no promotion contract touched).
 *
 * WHY THIS EXISTS
 * ---------------
 * Giagkiozis & Said, "Reconciling Open Interest with Traded Volume in Perpetual Swaps",
 * Ledger Vol 9 (2024) 1-15, DOI 10.5195/ledger.2024.325, show that open interest in
 * Bitcoin perpetual swaps is systematically misquoted by several of the largest
 * derivatives exchanges: some report implausible values, others delay the messages that
 * carry forced trades. A strategy conditioned on a bad OI feed fails silently, because
 * the signal still looks like a signal.
 *
 * So before any OI-conditioned family is built, this script tries to break the feed we
 * actually have on disk. Every check is computed from the archive itself plus the hourly
 * candles already used by the walk-forward studies. Nothing is fetched, nothing is
 * repaired, nothing is filled in: the output is a verdict and a set of counts.
 *
 * TWO PASSES, AND WHY THAT MATTERS
 * --------------------------------
 * The audit runs every consistency check twice:
 *
 *   RAW        every row exactly as stored.
 *   SANITIZED  with rows whose `oi` or `oiUsd` is non-finite or <= 0 removed, because a
 *              perpetual swap with zero outstanding contracts did not happen - such a row
 *              is a missing observation that the archive encoded as a zero.
 *
 * The two passes exist to separate "the feed is untrustworthy" from "the feed contains a
 * locatable outage that must be dropped rather than read as data". Those demand very
 * different responses, and a single-pass audit cannot tell them apart: one spurious zero
 * sitting between two real values manufactures a false flatline run, a false step
 * discontinuity, and a false violation of the volume bound simultaneously.
 *
 * THE CHECKS, AND WHAT A FAILURE WOULD MEAN
 * -----------------------------------------
 *  1. GRID       Every row must sit exactly on an hour boundary and be strictly
 *                increasing. A misaligned stamp means the archive was re-sampled or
 *                concatenated wrongly and every as-of alignment downstream is off.
 *  2. COVERAGE   Missing hours inside the file's own span. Real holes are acceptable and
 *                are already surfaced as `undefined` by the loader; a large or clustered
 *                hole set means the series cannot support a short-window conditioner.
 *  3. INVALID    Non-finite or non-positive `oi` / `oiUsd`. This is the "wholly
 *                implausible" failure mode named in the paper. Every such row is listed
 *                by timestamp so it can be cross-checked against the other symbols.
 *  4. FLATLINE   Runs of byte-identical `oi` across consecutive hours. Open interest on a
 *                liquid perpetual does not repeat to the same fractional contract for
 *                hours on end; a run is a frozen or delayed publisher, which is the
 *                second failure mode named in the paper.
 *  5. NOTIONAL   `oiUsd / oi` is an implied price at the sample instant. The sample sits
 *                on the hour boundary, i.e. the open of the candle stamped with the same
 *                millisecond, so the implied price must be within a fraction of a percent
 *                of that open. A wide deviation means the two columns were computed
 *                against different prices or different instants.
 *  6. VOLUME     The arithmetic bound. Open interest can only change when a trade prints,
 *                and one trade of size q moves it by at most q, so over any interval
 *                |dOI| <= traded base volume. This is the reconciliation the paper is
 *                named after, and it is the one check that cannot be argued with: a
 *                violation is proof of inconsistency between the two feeds.
 *  7. JUMPS      Single-hour log changes, and specifically spike-then-revert pairs. A
 *                jump that unwinds in the next hour is a reporting artefact, not flow.
 *  8. RATIOS     Coverage of the top-trader / taker columns, which are null for part of
 *                the span and must not be assumed present.
 *  9. USABLE     What actually survives on the four-hour grid the families trade, since
 *                the OI file starts 2022-01-01 while the candles start 2021-01-01.
 *
 * The verdict is computed from the SANITIZED pass for the consistency checks, because
 * that is the state in which the data would actually be consumed, with the invalid rows
 * reported separately and prominently. Thresholds are declared in `THRESHOLDS` so the
 * standard being applied is visible rather than implied.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  alignOpenInterestToCandles,
  loadDevelopmentCandles,
  loadDevelopmentOpenInterest,
  REPO_ROOT,
  RESEARCH_SYMBOLS,
  resampleCandles,
  type Candle,
  type OpenInterestPoint,
} from './lib/researchDataset';
import { FAMILY_HOURS_PER_BAR } from './lib/strategyFamilies';

const HOUR_MS = 60 * 60 * 1000;

const OUTPUT_PATH = path.join(
  REPO_ROOT,
  'QA',
  'walk-forward-baseline',
  'open-interest-feed-audit.json',
);

/**
 * Declared tolerances. These are judgement calls, so they are stated as data rather
 * than buried in branches. `fail` means the feed cannot be conditioned on as-is;
 * `concern` means it can, with the limitation recorded.
 */
const THRESHOLDS = {
  /** Share of the file's own span that may be missing before it is a concern / failure. */
  missingHourShare: { concern: 0.01, fail: 0.05 },
  /** Share of consecutive-hour pairs that may repeat `oi` exactly. */
  flatlineRunShare: { concern: 0.001, fail: 0.01 },
  /** Implied-price deviation from the same-instant candle open. */
  notionalDeviation: { tolerate: 0.005, concernShare: 0.01, failAbs: 0.02, failShare: 0.005 },
  /** Violations of |dOI| <= traded volume, as a share of comparable hour pairs. */
  volumeBoundShare: { concern: 0, fail: 0.001 },
  /** Single-hour |d ln oi| treated as a candidate artefact. */
  jumpMagnitude: 0.1,
  /**
   * Share of rows that may be invalid (non-finite / non-positive) and still leave the
   * feed usable once they are dropped. Above this the outage is too large to excise.
   */
  invalidRowShare: { concern: 0, fail: 0.01 },
} as const;

type Verdict = 'PASS' | 'CONCERN' | 'FAIL';

interface GapRecord {
  fromIso: string;
  toIso: string;
  missingHours: number;
}

interface FlatlineReport {
  comparablePairs: number;
  repeatedPairs: number;
  repeatedShare: number;
  runsOfTwoPlus: number;
  runsOfThreePlus: number;
  longestRunHours: number;
  longestRunStartIso: string | null;
}

interface NotionalReport {
  comparableRows: number;
  medianAbsDeviation: number;
  p99AbsDeviation: number;
  maxAbsDeviation: number;
  maxAbsDeviationIso: string | null;
  beyondTolerance: number;
  beyondToleranceShare: number;
  beyondFailAbs: number;
  beyondFailAbsShare: number;
}

interface VolumeBoundReport {
  comparablePairs: number;
  violations: number;
  violationShare: number;
  worstRatio: number;
  worstRatioIso: string | null;
  worstViolations: { atIso: string; absOiChange: number; volume: number; ratio: number }[];
  allViolationHours: string[];
}

interface JumpReport {
  comparablePairs: number;
  p999AbsLogChange: number;
  maxAbsLogChange: number;
  maxAbsLogChangeIso: string | null;
  over10pct: number;
  over25pct: number;
  over50pct: number;
  spikeThenRevert: number;
  largestJumps: { atIso: string; logChange: number; fromOi: number; toOi: number }[];
}

interface ConsistencyPass {
  rowsConsidered: number;
  flatline: FlatlineReport;
  notional: NotionalReport;
  volumeBound: VolumeBoundReport;
  jumps: JumpReport;
}

interface SymbolAudit {
  symbol: string;
  rows: number;
  fileCoverage: { from: string; to: string; rows: number };
  developmentSpan: { from: string; to: string } | null;
  grid: { offBoundaryRows: number; nonIncreasingRows: number };
  coverage: {
    spanHours: number;
    presentHours: number;
    missingHours: number;
    missingShare: number;
    gapCount: number;
    longestGapHours: number;
    largestGaps: GapRecord[];
  };
  invalid: {
    nonFiniteOi: number;
    nonPositiveOi: number;
    nonFiniteOiUsd: number;
    nonPositiveOiUsd: number;
    totalInvalidRows: number;
    invalidRowShare: number;
    /** Every invalid row, so the outage can be located and cross-checked. */
    rows: { atIso: string; oi: number; oiUsd: number }[];
    contiguousBlocks: { fromIso: string; toIso: string; hours: number }[];
  };
  raw: ConsistencyPass;
  sanitized: ConsistencyPass;
  ratios: {
    field: string;
    firstNonNullIso: string | null;
    nonNullRows: number;
    nullShare: number;
  }[];
  usableOnFamilyGrid: {
    hoursPerBar: number;
    totalBars: number;
    barsWithOpenInterest: number;
    barsViaNaiveRowRemoval: number;
    staleValuesLeakedByRowRemoval: number;
    firstBarWithOpenInterestIso: string | null;
    lastBarWithOpenInterestIso: string | null;
  };
  verdict: Verdict;
  findings: string[];
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function worse(current: Verdict, candidate: Verdict): Verdict {
  const rank: Record<Verdict, number> = { PASS: 0, CONCERN: 1, FAIL: 2 };
  return rank[candidate] > rank[current] ? candidate : current;
}

function isUsableRow(row: OpenInterestPoint): boolean {
  return Number.isFinite(row.oi) && row.oi > 0 && Number.isFinite(row.oiUsd) && row.oiUsd > 0;
}

/** Checks 4-7, over whichever row set is handed in. */
function runConsistencyChecks(
  rows: readonly OpenInterestPoint[],
  candleByTime: ReadonlyMap<number, Candle>,
): ConsistencyPass {
  /* 4. FLATLINE --------------------------------------------------------- */
  let comparablePairs = 0;
  let repeatedPairs = 0;
  let runsOfTwoPlus = 0;
  let runsOfThreePlus = 0;
  let longestRunHours = 0;
  let longestRunStart: number | null = null;
  let currentRun = 1;
  let currentRunStart = rows.length > 0 ? rows[0].t : 0;

  const closeRun = (): void => {
    if (currentRun >= 2) {
      runsOfTwoPlus += 1;
      if (currentRun >= 3) {
        runsOfThreePlus += 1;
      }
      if (currentRun > longestRunHours) {
        longestRunHours = currentRun;
        longestRunStart = currentRunStart;
      }
    }
    currentRun = 1;
  };

  for (let index = 1; index < rows.length; index += 1) {
    const consecutive = rows[index].t - rows[index - 1].t === HOUR_MS;
    if (consecutive) {
      comparablePairs += 1;
    }
    if (consecutive && rows[index].oi === rows[index - 1].oi) {
      repeatedPairs += 1;
      if (currentRun === 1) {
        currentRunStart = rows[index - 1].t;
      }
      currentRun += 1;
    } else {
      closeRun();
    }
  }
  closeRun();

  /* 5. NOTIONAL --------------------------------------------------------- */
  const deviations: number[] = [];
  let maxAbsDeviation = 0;
  let maxAbsDeviationAt: number | null = null;
  let beyondTolerance = 0;
  let beyondFailAbs = 0;
  for (const row of rows) {
    const candle = candleByTime.get(row.t);
    if (!candle || !(row.oi > 0) || !Number.isFinite(row.oiUsd) || !(candle.o > 0)) {
      continue;
    }
    const deviation = Math.abs(row.oiUsd / row.oi / candle.o - 1);
    deviations.push(deviation);
    if (deviation > maxAbsDeviation) {
      maxAbsDeviation = deviation;
      maxAbsDeviationAt = row.t;
    }
    if (deviation > THRESHOLDS.notionalDeviation.tolerate) {
      beyondTolerance += 1;
    }
    if (deviation > THRESHOLDS.notionalDeviation.failAbs) {
      beyondFailAbs += 1;
    }
  }
  deviations.sort((a, b) => a - b);

  /* 6. VOLUME BOUND ----------------------------------------------------- */
  let volumePairs = 0;
  const violations: { atIso: string; absOiChange: number; volume: number; ratio: number }[] = [];
  let worstRatio = 0;
  let worstRatioAt: number | null = null;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (current.t - previous.t !== HOUR_MS) {
      continue;
    }
    // The candle stamped at `previous.t` covers [previous.t, current.t), which is exactly
    // the interval bracketed by the two open-interest snapshots.
    const candle = candleByTime.get(previous.t);
    if (!candle || !Number.isFinite(candle.v) || !(candle.v > 0)) {
      continue;
    }
    if (!Number.isFinite(previous.oi) || !Number.isFinite(current.oi)) {
      continue;
    }
    volumePairs += 1;
    const change = Math.abs(current.oi - previous.oi);
    const ratio = change / candle.v;
    if (ratio > worstRatio) {
      worstRatio = ratio;
      worstRatioAt = previous.t;
    }
    if (change > candle.v) {
      violations.push({
        atIso: iso(previous.t),
        absOiChange: change,
        volume: candle.v,
        ratio,
      });
    }
  }

  /* 7. JUMPS ------------------------------------------------------------ */
  const logChanges: { at: number; value: number; fromOi: number; toOi: number }[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (current.t - previous.t !== HOUR_MS || !(previous.oi > 0) || !(current.oi > 0)) {
      continue;
    }
    logChanges.push({
      at: current.t,
      value: Math.log(current.oi / previous.oi),
      fromOi: previous.oi,
      toOi: current.oi,
    });
  }
  const absLogChanges = logChanges.map((entry) => Math.abs(entry.value)).sort((a, b) => a - b);
  let maxAbsLogChange = 0;
  let maxAbsLogChangeAt: number | null = null;
  let over10 = 0;
  let over25 = 0;
  let over50 = 0;
  let spikeThenRevert = 0;
  for (let index = 0; index < logChanges.length; index += 1) {
    const magnitude = Math.abs(logChanges[index].value);
    if (magnitude > maxAbsLogChange) {
      maxAbsLogChange = magnitude;
      maxAbsLogChangeAt = logChanges[index].at;
    }
    if (magnitude > 0.1) over10 += 1;
    if (magnitude > 0.25) over25 += 1;
    if (magnitude > 0.5) over50 += 1;
    if (magnitude > THRESHOLDS.jumpMagnitude && index + 1 < logChanges.length) {
      const next = logChanges[index + 1];
      const contiguous = next.at - logChanges[index].at === HOUR_MS;
      const opposed = Math.sign(next.value) === -Math.sign(logChanges[index].value);
      if (contiguous && opposed && Math.abs(next.value) >= 0.5 * magnitude) {
        spikeThenRevert += 1;
      }
    }
  }
  const largestJumps = [...logChanges]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5)
    .map((entry) => ({
      atIso: iso(entry.at),
      logChange: entry.value,
      fromOi: entry.fromOi,
      toOi: entry.toOi,
    }));

  return {
    rowsConsidered: rows.length,
    flatline: {
      comparablePairs,
      repeatedPairs,
      repeatedShare: comparablePairs > 0 ? repeatedPairs / comparablePairs : 0,
      runsOfTwoPlus,
      runsOfThreePlus,
      longestRunHours,
      longestRunStartIso: longestRunStart === null ? null : iso(longestRunStart),
    },
    notional: {
      comparableRows: deviations.length,
      medianAbsDeviation: quantile(deviations, 0.5),
      p99AbsDeviation: quantile(deviations, 0.99),
      maxAbsDeviation,
      maxAbsDeviationIso: maxAbsDeviationAt === null ? null : iso(maxAbsDeviationAt),
      beyondTolerance,
      beyondToleranceShare: deviations.length > 0 ? beyondTolerance / deviations.length : 0,
      beyondFailAbs,
      beyondFailAbsShare: deviations.length > 0 ? beyondFailAbs / deviations.length : 0,
    },
    volumeBound: {
      comparablePairs: volumePairs,
      violations: violations.length,
      violationShare: volumePairs > 0 ? violations.length / volumePairs : 0,
      worstRatio,
      worstRatioIso: worstRatioAt === null ? null : iso(worstRatioAt),
      worstViolations: [...violations].sort((a, b) => b.ratio - a.ratio).slice(0, 5),
      allViolationHours: violations.map((entry) => entry.atIso),
    },
    jumps: {
      comparablePairs: logChanges.length,
      p999AbsLogChange: quantile(absLogChanges, 0.999),
      maxAbsLogChange,
      maxAbsLogChangeIso: maxAbsLogChangeAt === null ? null : iso(maxAbsLogChangeAt),
      over10pct: over10,
      over25pct: over25,
      over50pct: over50,
      spikeThenRevert,
      largestJumps,
    },
  };
}

function auditSymbol(symbol: string): SymbolAudit {
  const candleSeries = loadDevelopmentCandles(symbol);
  const openInterestSeries = loadDevelopmentOpenInterest(symbol);
  const rows = openInterestSeries.rows;

  const candleByTime = new Map<number, Candle>();
  for (const candle of candleSeries.rows) {
    candleByTime.set(candle.t, candle);
  }

  const findings: string[] = [];
  let verdict: Verdict = 'PASS';

  /* 1. GRID ------------------------------------------------------------- */
  let offBoundaryRows = 0;
  let nonIncreasingRows = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].t % HOUR_MS !== 0) {
      offBoundaryRows += 1;
    }
    if (index > 0 && rows[index].t <= rows[index - 1].t) {
      nonIncreasingRows += 1;
    }
  }
  if (offBoundaryRows > 0 || nonIncreasingRows > 0) {
    verdict = worse(verdict, 'FAIL');
    findings.push(
      `grid: ${offBoundaryRows} rows off the hour boundary, ${nonIncreasingRows} non-increasing`,
    );
  }

  /* 2. COVERAGE --------------------------------------------------------- */
  const firstTime = rows.length > 0 ? rows[0].t : 0;
  const lastTime = rows.length > 0 ? rows[rows.length - 1].t : 0;
  const spanHours = rows.length > 0 ? (lastTime - firstTime) / HOUR_MS + 1 : 0;
  const missingHours = Math.max(0, spanHours - rows.length);
  const missingShare = spanHours > 0 ? missingHours / spanHours : 0;
  const gaps: GapRecord[] = [];
  let longestGapHours = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const delta = rows[index].t - rows[index - 1].t;
    if (delta > HOUR_MS) {
      const gapHours = delta / HOUR_MS - 1;
      if (gapHours > longestGapHours) {
        longestGapHours = gapHours;
      }
      gaps.push({
        fromIso: iso(rows[index - 1].t),
        toIso: iso(rows[index].t),
        missingHours: gapHours,
      });
    }
  }
  if (missingShare >= THRESHOLDS.missingHourShare.fail) {
    verdict = worse(verdict, 'FAIL');
    findings.push(
      `coverage: ${missingHours} of ${spanHours} hours missing (${(missingShare * 100).toFixed(2)}%)`,
    );
  } else if (missingShare >= THRESHOLDS.missingHourShare.concern) {
    verdict = worse(verdict, 'CONCERN');
    findings.push(
      `coverage: ${missingHours} of ${spanHours} hours missing (${(missingShare * 100).toFixed(2)}%)`,
    );
  }

  /* 3. INVALID ---------------------------------------------------------- */
  let nonFiniteOi = 0;
  let nonPositiveOi = 0;
  let nonFiniteOiUsd = 0;
  let nonPositiveOiUsd = 0;
  const invalidRows: { atIso: string; oi: number; oiUsd: number }[] = [];
  const invalidTimes: number[] = [];
  for (const row of rows) {
    if (!Number.isFinite(row.oi)) {
      nonFiniteOi += 1;
    } else if (!(row.oi > 0)) {
      nonPositiveOi += 1;
    }
    if (!Number.isFinite(row.oiUsd)) {
      nonFiniteOiUsd += 1;
    } else if (!(row.oiUsd > 0)) {
      nonPositiveOiUsd += 1;
    }
    if (!isUsableRow(row)) {
      invalidRows.push({ atIso: iso(row.t), oi: row.oi, oiUsd: row.oiUsd });
      invalidTimes.push(row.t);
    }
  }
  const contiguousBlocks: { fromIso: string; toIso: string; hours: number }[] = [];
  for (let index = 0; index < invalidTimes.length; index += 1) {
    const start = invalidTimes[index];
    let end = start;
    while (index + 1 < invalidTimes.length && invalidTimes[index + 1] - end === HOUR_MS) {
      index += 1;
      end = invalidTimes[index];
    }
    contiguousBlocks.push({
      fromIso: iso(start),
      toIso: iso(end),
      hours: (end - start) / HOUR_MS + 1,
    });
  }
  const invalidRowShare = rows.length > 0 ? invalidRows.length / rows.length : 0;
  const longestInvalidBlock = contiguousBlocks.reduce((best, block) => Math.max(best, block.hours), 0);
  if (invalidRowShare > THRESHOLDS.invalidRowShare.fail) {
    verdict = worse(verdict, 'FAIL');
    findings.push(
      `invalid: ${invalidRows.length} rows (${(invalidRowShare * 100).toFixed(3)}%) carry non-finite or non-positive oi/oiUsd`,
    );
  } else if (invalidRows.length > THRESHOLDS.invalidRowShare.concern) {
    verdict = worse(verdict, 'CONCERN');
    findings.push(
      `invalid: ${invalidRows.length} rows carry non-positive oi/oiUsd in ${contiguousBlocks.length} block(s), ` +
        `longest ${longestInvalidBlock}h, first ${contiguousBlocks[0]?.fromIso ?? 'n/a'} ` +
        '- must be read as missing, not as data',
    );
  }

  /* 4-7, twice ---------------------------------------------------------- */
  const sanitizedRows = rows.filter((row) => isUsableRow(row));
  const raw = runConsistencyChecks(rows, candleByTime);
  const sanitized = runConsistencyChecks(sanitizedRows, candleByTime);

  // The verdict uses the sanitized pass: that is the state the data would be consumed in
  // once invalid rows are excluded, which the loader must do regardless.
  if (sanitized.flatline.repeatedShare >= THRESHOLDS.flatlineRunShare.fail) {
    verdict = worse(verdict, 'FAIL');
    findings.push(
      `flatline (sanitized): ${sanitized.flatline.repeatedPairs} repeated hour pairs ` +
        `(${(sanitized.flatline.repeatedShare * 100).toFixed(3)}%), longest run ${sanitized.flatline.longestRunHours}h`,
    );
  } else if (
    sanitized.flatline.repeatedShare > THRESHOLDS.flatlineRunShare.concern ||
    sanitized.flatline.runsOfThreePlus > 0
  ) {
    verdict = worse(verdict, 'CONCERN');
    findings.push(
      `flatline (sanitized): ${sanitized.flatline.repeatedPairs} repeated hour pairs ` +
        `(${(sanitized.flatline.repeatedShare * 100).toFixed(3)}%), ` +
        `${sanitized.flatline.runsOfThreePlus} runs of 3h+, longest ${sanitized.flatline.longestRunHours}h ` +
        `from ${sanitized.flatline.longestRunStartIso ?? 'n/a'}`,
    );
  }

  if (sanitized.notional.beyondFailAbsShare > THRESHOLDS.notionalDeviation.failShare) {
    verdict = worse(verdict, 'FAIL');
    findings.push(
      `notional (sanitized): ${(sanitized.notional.beyondFailAbsShare * 100).toFixed(2)}% of rows imply a price >2% from the same-instant open`,
    );
  } else if (sanitized.notional.beyondToleranceShare > THRESHOLDS.notionalDeviation.concernShare) {
    verdict = worse(verdict, 'CONCERN');
    findings.push(
      `notional (sanitized): ${(sanitized.notional.beyondToleranceShare * 100).toFixed(2)}% of rows imply a price >0.5% from the same-instant open`,
    );
  }

  if (sanitized.volumeBound.violationShare > THRESHOLDS.volumeBoundShare.fail) {
    verdict = worse(verdict, 'FAIL');
    findings.push(
      `volume bound (sanitized): ${sanitized.volumeBound.violations} of ${sanitized.volumeBound.comparablePairs} ` +
        `hours have |dOI| > traded volume (worst ratio ${sanitized.volumeBound.worstRatio.toFixed(3)})`,
    );
  } else if (sanitized.volumeBound.violations > THRESHOLDS.volumeBoundShare.concern) {
    verdict = worse(verdict, 'CONCERN');
    findings.push(
      `volume bound (sanitized): ${sanitized.volumeBound.violations} of ${sanitized.volumeBound.comparablePairs} ` +
        `hours have |dOI| > traded volume (worst ratio ${sanitized.volumeBound.worstRatio.toFixed(3)}, ` +
        `at ${sanitized.volumeBound.worstViolations[0]?.atIso ?? 'n/a'})`,
    );
  }

  if (sanitized.jumps.spikeThenRevert > 0) {
    verdict = worse(verdict, 'CONCERN');
    findings.push(
      `jumps (sanitized): ${sanitized.jumps.spikeThenRevert} spike-then-revert pairs above ` +
        `${THRESHOLDS.jumpMagnitude} log change, max |d ln oi| ${sanitized.jumps.maxAbsLogChange.toFixed(3)}`,
    );
  }

  /* 8. RATIOS ----------------------------------------------------------- */
  const ratioFields: (keyof OpenInterestPoint)[] = [
    'topAccountRatio',
    'topPositionRatio',
    'accountRatio',
    'takerRatio',
  ];
  const ratios = ratioFields.map((field) => {
    let nonNull = 0;
    let firstNonNull: number | null = null;
    for (const row of rows) {
      const value = row[field];
      if (typeof value === 'number' && Number.isFinite(value)) {
        nonNull += 1;
        if (firstNonNull === null) {
          firstNonNull = row.t;
        }
      }
    }
    return {
      field: String(field),
      firstNonNullIso: firstNonNull === null ? null : iso(firstNonNull),
      nonNullRows: nonNull,
      nullShare: rows.length > 0 ? 1 - nonNull / rows.length : 1,
    };
  });

  /* 9. USABLE ON THE FAMILY GRID ---------------------------------------- */
  //
  // Two alignments, because they are not equivalent and the difference is a finding.
  //
  //   viaLoaderGuard    the full row set through `alignOpenInterestToCandles`, which
  //                     rejects oi <= 0. This is what a family actually sees.
  //   viaRowRemoval     the invalid rows deleted first, then aligned. This is the naive
  //                     "just drop the bad rows" approach, and it is WRONG: deleting a row
  //                     lets the as-of lookup fall back to the previous hour, which is
  //                     exactly at the one-hour staleness bound and therefore accepted. So
  //                     it silently carries a stale value onto the bar that had no
  //                     observation, and reports MORE usable bars than really exist.
  //
  // The guarded count is the honest one; the second is kept only to show the leak.
  const familyBars = resampleCandles(candleSeries.rows, FAMILY_HOURS_PER_BAR);
  const viaLoaderGuard = alignOpenInterestToCandles(familyBars, rows);
  const viaRowRemoval = alignOpenInterestToCandles(familyBars, sanitizedRows);
  let barsWithOpenInterest = 0;
  let barsViaRowRemoval = 0;
  let firstUsable: number | null = null;
  let lastUsable: number | null = null;
  for (let index = 0; index < familyBars.length; index += 1) {
    if (viaRowRemoval[index] !== undefined) {
      barsViaRowRemoval += 1;
    }
    if (viaLoaderGuard[index] !== undefined) {
      barsWithOpenInterest += 1;
      if (firstUsable === null) {
        firstUsable = familyBars[index].t;
      }
      lastUsable = familyBars[index].t;
    }
  }

  return {
    symbol,
    rows: rows.length,
    fileCoverage: openInterestSeries.fileCoverage,
    developmentSpan: rows.length > 0 ? { from: iso(firstTime), to: iso(lastTime) } : null,
    grid: { offBoundaryRows, nonIncreasingRows },
    coverage: {
      spanHours,
      presentHours: rows.length,
      missingHours,
      missingShare,
      gapCount: gaps.length,
      longestGapHours,
      largestGaps: [...gaps].sort((a, b) => b.missingHours - a.missingHours).slice(0, 5),
    },
    invalid: {
      nonFiniteOi,
      nonPositiveOi,
      nonFiniteOiUsd,
      nonPositiveOiUsd,
      totalInvalidRows: invalidRows.length,
      invalidRowShare,
      rows: invalidRows,
      contiguousBlocks,
    },
    raw,
    sanitized,
    ratios,
    usableOnFamilyGrid: {
      hoursPerBar: FAMILY_HOURS_PER_BAR,
      totalBars: familyBars.length,
      barsWithOpenInterest,
      barsViaNaiveRowRemoval: barsViaRowRemoval,
      staleValuesLeakedByRowRemoval: barsViaRowRemoval - barsWithOpenInterest,
      firstBarWithOpenInterestIso: firstUsable === null ? null : iso(firstUsable),
      lastBarWithOpenInterestIso: lastUsable === null ? null : iso(lastUsable),
    },
    verdict,
    findings,
  };
}

function sharedAcross(sets: readonly Set<string>[]): string[] {
  if (sets.length === 0) {
    return [];
  }
  return [...sets[0]].filter((stamp) => sets.every((set) => set.has(stamp))).sort();
}

function main(): void {
  const audits = RESEARCH_SYMBOLS.map((symbol) => auditSymbol(symbol));

  let overall: Verdict = 'PASS';
  for (const audit of audits) {
    overall = worse(overall, audit.verdict);
  }

  // Cross-symbol correlation. If the same hours are broken on every symbol the defect is
  // an archive-wide outage, not a per-instrument reporting fault - a distinction that
  // decides whether the rows can simply be dropped.
  const invalidSets = audits.map((audit) => new Set(audit.invalid.rows.map((row) => row.atIso)));
  const sharedInvalidHours = sharedAcross(invalidSets);
  const unionInvalidHours = new Set<string>();
  for (const set of invalidSets) {
    for (const stamp of set) {
      unionInvalidHours.add(stamp);
    }
  }

  const rawViolationSets = audits.map((audit) => new Set(audit.raw.volumeBound.allViolationHours));
  const sanitizedViolationSets = audits.map(
    (audit) => new Set(audit.sanitized.volumeBound.allViolationHours),
  );

  const payload = {
    schemaVersion: 1,
    study: 'open-interest-feed-integrity-audit',
    generatedAt: new Date().toISOString(),
    motivation:
      'Giagkiozis & Said, Reconciling Open Interest with Traded Volume in Perpetual Swaps, ' +
      'Ledger Vol 9 (2024) 1-15, DOI 10.5195/ledger.2024.325',
    tradingMode: 'research-only, no execution, no promotion contract touched',
    feedProvenance:
      'Single venue: Binance USD-M futures daily metrics archives (data.binance.vision), ' +
      'per-day zip sha256 recorded in each series envelope. Cross-venue divergence, the other ' +
      'half of the cited finding, is therefore NOT testable with this archive - only internal ' +
      'consistency is.',
    thresholds: THRESHOLDS,
    checks: [
      'grid: hour-boundary stamps, strictly increasing',
      'coverage: missing hours inside the file span',
      'invalid: non-finite or non-positive oi / oiUsd, listed and blocked by contiguity',
      'flatline: byte-identical oi across consecutive hours',
      'notional: oiUsd/oi implied price vs same-instant candle open',
      'volume: |dOI| <= traded base volume over the bracketed hour',
      'jumps: single-hour log changes and spike-then-revert pairs',
      'ratios: coverage of top-trader / taker columns',
      'usable: bars with positive open interest on the four-hour family grid',
    ],
    crossSymbol: {
      invalidHoursSharedByAllSymbols: sharedInvalidHours,
      invalidHourUnionSize: unionInvalidHours.size,
      rawVolumeViolationHoursSharedByAllSymbols: sharedAcross(rawViolationSets),
      sanitizedVolumeViolationHoursSharedByAllSymbols: sharedAcross(sanitizedViolationSets),
    },
    overallVerdict: overall,
    symbols: audits,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  /* The digest is taken over the payload BEFORE the integrity block is attached, exactly
   * as every other runner in this directory does it. A file therefore never contains its
   * own file-bytes hash: to verify, re-serialise the object minus `integrity` at indent 2
   * and hash that. */
  const body = JSON.stringify(payload, null, 2);
  const digest = createHash('sha256').update(body).digest('hex');
  writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify({ ...payload, integrity: { contentSha256: digest } }, null, 2)}\n`,
    'utf8',
  );

  const header =
    'symbol       rows   miss%  invalid  f3h+  longest   note>.5%  volViol  worstRat  jmp>25%  revert  verdict';
  const line = (audit: SymbolAudit, pass: ConsistencyPass): string =>
    [
      audit.symbol.padEnd(10),
      String(audit.rows).padStart(6),
      `${(audit.coverage.missingShare * 100).toFixed(2)}%`.padStart(7),
      String(audit.invalid.totalInvalidRows).padStart(8),
      String(pass.flatline.runsOfThreePlus).padStart(6),
      String(pass.flatline.longestRunHours).padStart(8),
      `${(pass.notional.beyondToleranceShare * 100).toFixed(3)}%`.padStart(11),
      String(pass.volumeBound.violations).padStart(8),
      pass.volumeBound.worstRatio.toFixed(2).padStart(10),
      String(pass.jumps.over25pct).padStart(8),
      String(pass.jumps.spikeThenRevert).padStart(8),
      `  ${audit.verdict}`,
    ].join('');

  console.log('=== RAW (every row exactly as stored) ===');
  console.log(header);
  for (const audit of audits) {
    console.log(line(audit, audit.raw));
  }
  console.log('');
  console.log('=== SANITIZED (non-positive oi/oiUsd rows dropped as missing) ===');
  console.log(header);
  for (const audit of audits) {
    console.log(line(audit, audit.sanitized));
  }

  console.log('');
  console.log(
    `cross-symbol: ${sharedInvalidHours.length} invalid hours shared by all ${audits.length} symbols; ` +
      `union across symbols is ${unionInvalidHours.size} hours`,
  );
  if (sharedInvalidHours.length > 0) {
    console.log(`  shared invalid hours: ${sharedInvalidHours.join(' ')}`);
  }
  const sharedRawViolations = sharedAcross(rawViolationSets);
  const sharedSanitizedViolations = sharedAcross(sanitizedViolationSets);
  console.log(
    `  volume-bound violation hours shared by ALL symbols: raw ${sharedRawViolations.length}, ` +
      `sanitized ${sharedSanitizedViolations.length}`,
  );
  if (sharedSanitizedViolations.length > 0) {
    console.log(`  shared (sanitized): ${sharedSanitizedViolations.join(' ')}`);
  }

  console.log('');
  for (const audit of audits) {
    for (const finding of audit.findings) {
      console.log(`${audit.symbol}: ${finding}`);
    }
  }
  console.log('');
  console.log(`overall verdict: ${overall}`);
  console.log(`written: ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

main();
