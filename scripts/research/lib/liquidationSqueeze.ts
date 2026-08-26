/**
 * Liquidation-flow-conditioned volatility-compression breakout.
 *
 * WHAT THIS ADDS TO `squeeze`, AND WHY
 * -----------------------------------
 * The unconditioned `squeeze` family buys a breakout out of a compressed range and
 * holds for a fixed number of bars. It was the only one of ten families whose
 * walk-forward result came closest to surviving the deletion of its single best window.
 * Verified figures, reproduced byte-identically from the artifact
 * `QA/walk-forward-baseline/walk-forward-baseline-results.json`
 * (sha256 4b11b31ed34f3989efbef2ea5d60739cda4392a117f02eda4894ee34ce28b319): at 2x cost
 * stress, +5.10% aggregate over 14 splits, 581 trades, profit factor 1.033, maxDD 38.12%,
 * and **-6.09% excluding its best split**. The mission verdict is therefore false, on the
 * drawdown cap.
 *
 * That last number corrects the premise this file was written under. An earlier handoff
 * cited "+16.76% total, +5.57% excluding the best split, 9/14 positive, median +1.55%"
 * and described squeeze as the only family still positive after deleting its best window.
 * Those figures do not match the artifact, no script in this repository produces them
 * (`runWalkForwardBaseline.mts` has no leave-out-best logic at all), and their provenance
 * is unconfirmed -- the likeliest explanation is that they are the *sized/integrated*
 * study's totals from `runRiskAdjustedWalkForward.mts` quoted against unsized baseline
 * numbers. The defensible version of the claim is weaker: squeeze is the *least negative*
 * ex-best of the ten families, not a survivor. It is refined here on those grounds.
 *
 * Cheng, Deng, Wang & Yu, "Liquidation, Leverage and Optimal Margin in Bitcoin Futures
 * Markets" (arXiv 2102.04591, q-fin.TR) supplies a mechanism for why such a breakout
 * should continue rather than mean-revert. On BitMEX BTC perpetuals they measure daily
 * forced liquidations of 3.51% of outstanding long contracts and 1.89% of short, with
 * liquidated traders averaging roughly 60x leverage. Forced liquidation is
 * *price-insensitive* flow: it must transact regardless of value, so it amplifies the
 * move that triggered it. A range that compresses while leverage accumulates is a
 * loaded spring; the breakout is the release.
 *
 * That yields a testable refinement: require not merely that volatility is compressed,
 * but that leverage has been *building* during the compression. Open interest is the
 * only leverage proxy this archive supports (see the calibration note below), so the
 * conditioner asks whether open interest has risen unusually over the same window
 * whose volatility is compressed.
 *
 * CALIBRATION IS EMPIRICAL, NOT IMPORTED
 * -------------------------------------
 * Cheng et al.'s magnitudes are BitMEX-era, under looser margin rules and far higher
 * permitted leverage than the 2021-2023 Binance USD-M regime this study runs on.
 * Their numbers are therefore used *directionally* -- to justify that the effect exists
 * and that it is asymmetric -- and never as thresholds. Every threshold here is a
 * dimensionless trailing percentile rank, chosen from the grid on training data only,
 * so nothing from that paper is transplanted as a magnitude.
 *
 * THE ASYMMETRY IS A PREDICTION, NOT A FREE PARAMETER
 * --------------------------------------------------
 * Because longs are liquidated at roughly 1.9x the rate of shorts, a *downside* break
 * has more forced flow behind it than an upside break of equal size: the losing side
 * of a down move is the more crowded and more levered one. The prediction is therefore
 * that short entries should clear a *lower* buildup bar than long entries. The grid
 * includes that ordering, the symmetric case, and the *reversed* ordering, so the data
 * can reject the prediction rather than merely confirm it. A corroborating long/short
 * asymmetry result was attributed in the task brief to Chen, Ma & Nie; that citation
 * could not be verified on this gateway (zero arXiv hits for the phrase and the
 * author, SSRN unreachable), so it is recorded as UNVERIFIED in the research log and
 * carries no weight here. The asymmetry rests on Cheng et al. alone.
 *
 * THE EXIT IS A MECHANISM BORROWED WITHOUT ITS NUMBERS
 * ---------------------------------------------------
 * `squeeze` exits on a bar count alone, which is indifferent to whether the move it
 * caught is still running. AdaptiveTrend (arXiv 2602.11708v1, Bui & Nguyen) uses a
 * trailing stop calibrated to the prevailing volatility regime. That *mechanism* is
 * adopted here. Its reported performance is not: the paper is not peer-reviewed and
 * its 2022-2024 sample overlaps this project's sealed 2024-2025 holdout, so its
 * Sharpe and Calmar figures are treated as unreplicated and are never cited as
 * support. The trail distance is expressed in units of current ATR, so it widens in
 * volatile regimes and tightens in quiet ones without a fixed price threshold.
 *
 * NO NEW WINDOW PARAMETERS
 * ------------------------
 * Both additions reuse `atrBars`, the window already being fitted by the base family:
 * open-interest buildup is measured over the same window whose volatility is
 * compressed, and the trail is scaled by the same ATR that defines compression. This
 * is a deliberate constraint on the search space. Every free parameter added to a grid
 * multiplies the number of ways an in-sample winner can be the luckiest draw rather
 * than the best idea, and this project has already measured that failure directly:
 * selecting across 40 candidates on 1095 training bars let `tsm`'s aggregate beat every
 * fixed configuration it selected from, purely by chance.
 *
 * MISSING DATA FAILS CLOSED, AND IS NEVER ZERO-FILLED
 * --------------------------------------------------
 * Open interest does not begin until 2022-01-01, and the derived buildup rank needs
 * further history on top of that. Where the rank cannot be computed, an *active*
 * conditioner refuses the entry rather than assuming a value. That is not a silent
 * skip: `openInterestAvailability.ts` measures the same input per split and marks the
 * affected splits `unavailable`, so a window where the conditioner was blind is
 * reported as a gap in the results table instead of being averaged in as a zero.
 *
 * A threshold of exactly 0 disables its side of the conditioner entirely, and a
 * disabled side reads no open-interest data at all -- so the zero-effect configuration
 * runs identically on 2021 bars, where no open interest exists. This matters for more
 * than tidiness: it is what makes the "do nothing" cell a genuine member of the grid
 * on every split, per Baquero's proposed standard that a hyperparameter search must be
 * able to conclude that the addition does not help. `tests/research` asserts that the
 * zero-effect configuration reproduces the unconditioned `squeeze` positions exactly,
 * bar for bar, so the control arm is a true nested special case and not an
 * approximation of one.
 */

import {
  atr,
  closes,
  highs,
  lows,
  pctChange,
  rollingMax,
  rollingMin,
  trailingPercentileRank,
  type MaybeNumber,
} from './indicators';
import { COMPRESSION_RANK_WINDOW, type SymbolSeries } from './strategyFamilies';
import type { Direction } from './tradeMetrics';

export interface LiquidationSqueezeParams {
  /** Range/ATR window. Also the open-interest buildup window and the trail's ATR window. */
  atrBars: number;
  /** Compression rank at or below which the range counts as compressed. */
  compressionPercentile: number;
  /** Maximum bars held, unchanged from the base family. */
  holdBars: number;
  /**
   * Trailing percentile rank of open-interest buildup a *long* entry must clear.
   * `0` disables the check for longs and reads no open-interest data.
   */
  oiRankLong: number;
  /** Same bar for *short* entries. `0` disables. */
  oiRankShort: number;
  /** Trailing stop distance for longs, in ATR units. `0` disables. */
  trailAtrLong: number;
  /** Same for shorts. `0` disables. */
  trailAtrShort: number;
}

/** The configuration that must reproduce the unconditioned family exactly. */
export const ZERO_EFFECT: Pick<
  LiquidationSqueezeParams,
  'oiRankLong' | 'oiRankShort' | 'trailAtrLong' | 'trailAtrShort'
> = {
  oiRankLong: 0,
  oiRankShort: 0,
  trailAtrLong: 0,
  trailAtrShort: 0,
};

export function isZeroEffect(params: LiquidationSqueezeParams): boolean {
  return (
    params.oiRankLong === 0 &&
    params.oiRankShort === 0 &&
    params.trailAtrLong === 0 &&
    params.trailAtrShort === 0
  );
}

/** True when any part of this configuration reads open interest. */
export function readsOpenInterest(params: LiquidationSqueezeParams): boolean {
  return params.oiRankLong > 0 || params.oiRankShort > 0;
}

/**
 * Trailing percentile rank of open-interest buildup, aligned to the candle grid.
 *
 * Buildup is the percentage change in open interest over `lookbackBars`, then ranked
 * against its own trailing distribution so the threshold means the same thing for BTC
 * in 2022 and DOGE in 2023. Both primitives fail closed -- `pctChange` needs both
 * endpoints and `trailingPercentileRank` needs 80% of its window -- so the result is
 * `undefined` wherever the input is too sparse to rank honestly, which is the
 * behaviour the conditioner relies on.
 *
 * Exported because the availability map measures coverage of *this* series, not merely
 * of the raw `oi` column it derives from. The derived series has a longer warm-up than
 * the raw field, and checking only the raw field would overstate where the conditioner
 * can actually act.
 */
export function openInterestBuildupRank(
  openInterest: readonly MaybeNumber[],
  lookbackBars: number,
): MaybeNumber[] {
  return trailingPercentileRank(pctChange(openInterest, lookbackBars), COMPRESSION_RANK_WINDOW);
}

/**
 * Everything derived from a symbol's bars that depends only on `atrBars`.
 *
 * Split out because the study evaluates 168 parameter combinations and every one of them
 * would otherwise recompute the same 180-bar trailing percentile ranks. `atrBars` takes
 * two values over ten symbols, so preparing these twenty bundles once turns the
 * per-combination cost into a single linear pass. This is purely a speed arrangement: the
 * values are identical to what the inline computation produced.
 */
export interface SqueezeIndicators {
  closePrices: readonly number[];
  averageTrueRange: readonly MaybeNumber[];
  /** Trailing percentile rank of ATR/close: low means the range is compressed. */
  compressionRank: readonly MaybeNumber[];
  upper: readonly MaybeNumber[];
  lower: readonly MaybeNumber[];
  /** Trailing percentile rank of open-interest buildup; `undefined` where unrankable. */
  buildupRank: readonly MaybeNumber[];
}

export function prepareSqueezeIndicators(
  series: SymbolSeries,
  atrBars: number,
): SqueezeIndicators {
  const { candles } = series;
  const averageTrueRange = atr(candles, atrBars);
  const normalised: MaybeNumber[] = averageTrueRange.map((value, index) =>
    value === undefined || !(candles[index].c > 0) ? undefined : value / candles[index].c,
  );
  return {
    closePrices: closes(candles),
    averageTrueRange,
    compressionRank: trailingPercentileRank(normalised, COMPRESSION_RANK_WINDOW),
    upper: rollingMax(highs(candles), atrBars),
    lower: rollingMin(lows(candles), atrBars),
    buildupRank: openInterestBuildupRank(series.openInterest, atrBars),
  };
}

/**
 * Position series for one symbol, from prepared indicators.
 *
 * The entry decision reproduces the base family bar for bar: compression is read at
 * `i - 1`, the breakout level is the range through `i - 1`, and the trade is entered at
 * the close of `i`. Two gates are layered on top, both evaluated with information
 * available strictly before the close of `i` is acted upon:
 *
 *   - the open-interest buildup rank at `i - 1`, per side;
 *   - while holding, a trailing stop measured from the best close *before* `i`, at a
 *     distance of `trailAtr * atr[i - 1]`, breached by the close of `i`.
 *
 * Both the entry and the stop therefore act on the same bar's close using only prior
 * bars to form the level, which is the convention `buildTrades` prices against: a run
 * ending at `i - 1` exits at the close of `i`.
 */
export function positionsFromIndicators(
  indicators: SqueezeIndicators,
  params: LiquidationSqueezeParams,
): Direction[] {
  const { closePrices, averageTrueRange, compressionRank, upper, lower, buildupRank } = indicators;
  // Read only when a side is enabled, so the zero-effect configuration consults no
  // open-interest data at all and behaves identically on bars where none exists.
  const conditionerActive = readsOpenInterest(params);

  const out: Direction[] = new Array<Direction>(closePrices.length).fill(0);

  let remaining = 0;
  let direction: Direction = 0;
  /** Best close seen since entry, in the direction of the trade. */
  let extreme = 0;
  let trailAtrUnits = 0;

  for (let i = 1; i < closePrices.length; i += 1) {
    if (remaining > 0) {
      // ---- holding: consider the volatility-scaled trailing stop first ----------
      const atrValue = averageTrueRange[i - 1];
      if (trailAtrUnits > 0 && atrValue !== undefined && atrValue > 0) {
        const distance = trailAtrUnits * atrValue;
        const breached =
          direction === 1
            ? closePrices[i] <= extreme - distance
            : closePrices[i] >= extreme + distance;
        if (breached) {
          // Leave `out[i]` at 0 so the run ends at `i - 1`; `buildTrades` then exits
          // this trade at the close of `i`, the bar that breached the stop.
          remaining = 0;
          direction = 0;
          continue;
        }
      }
      out[i] = direction;
      remaining -= 1;
      if (direction === 1) {
        extreme = Math.max(extreme, closePrices[i]);
      } else if (direction === -1) {
        extreme = Math.min(extreme, closePrices[i]);
      }
      continue;
    }

    // ---- flat: look for a compressed-range breakout ---------------------------
    const compression = compressionRank[i - 1];
    if (compression === undefined || compression > params.compressionPercentile) {
      continue;
    }
    const close = closePrices[i];
    const breakoutUp = upper[i - 1];
    const breakoutDown = lower[i - 1];
    let candidate: Direction = 0;
    if (breakoutUp !== undefined && close > breakoutUp) {
      candidate = 1;
    } else if (breakoutDown !== undefined && close < breakoutDown) {
      candidate = -1;
    } else {
      continue;
    }

    // ---- liquidation-flow conditioner ----------------------------------------
    const requiredRank = candidate === 1 ? params.oiRankLong : params.oiRankShort;
    if (conditionerActive && requiredRank > 0) {
      const buildup = buildupRank[i - 1];
      if (buildup === undefined || buildup < requiredRank) {
        // Either leverage did not build, or it cannot be established that it did.
        // Both refuse the entry; neither substitutes a value.
        continue;
      }
    }

    direction = candidate;
    out[i] = direction;
    remaining = params.holdBars - 1;
    extreme = close;
    trailAtrUnits = candidate === 1 ? params.trailAtrLong : params.trailAtrShort;
  }

  return out;
}

/** Convenience wrapper: prepare indicators and build positions in one call. */
export function liquidationSqueezePositions(
  series: SymbolSeries,
  params: LiquidationSqueezeParams,
): Direction[] {
  return positionsFromIndicators(prepareSqueezeIndicators(series, params.atrBars), params);
}

/** Threshold pair for the two sides of the conditioner. */
export interface ThresholdPair {
  label: string;
  oiRankLong: number;
  oiRankShort: number;
}

/** Trail pair, in ATR units, for the two sides of the exit. */
export interface TrailPair {
  label: string;
  trailAtrLong: number;
  trailAtrShort: number;
}

/**
 * Base grid of the unconditioned family, reproduced verbatim.
 *
 * Held identical to `squeeze` so that the control arm and every treatment arm search
 * the same underlying rule shapes, and any difference between arms is attributable to
 * the addition rather than to a different base search.
 */
export const BASE_SQUEEZE_GRID = {
  atrBars: [20, 40],
  compressionPercentile: [0.2, 0.35],
  holdBars: [12, 24],
} as const;

/** `(0, 0)` first in every list: the "do nothing" cell is always in the search. */
export const THRESHOLD_PAIRS = {
  symmetric: [
    { label: 'none', oiRankLong: 0, oiRankShort: 0 },
    { label: 'sym-0.40', oiRankLong: 0.4, oiRankShort: 0.4 },
    { label: 'sym-0.55', oiRankLong: 0.55, oiRankShort: 0.55 },
    { label: 'sym-0.70', oiRankLong: 0.7, oiRankShort: 0.7 },
  ],
  asymmetric: [
    { label: 'none', oiRankLong: 0, oiRankShort: 0 },
    { label: 'sym-0.55', oiRankLong: 0.55, oiRankShort: 0.55 },
    // Cheng et al.: longs are liquidated ~1.9x more, so a downside break carries more
    // forced flow and shorts should need less buildup to qualify.
    { label: 'short-easier', oiRankLong: 0.7, oiRankShort: 0.4 },
    // The reversed ordering, included so the prediction above can be rejected.
    { label: 'long-easier', oiRankLong: 0.4, oiRankShort: 0.7 },
  ],
} as const;

export const TRAIL_PAIRS = {
  main: [
    { label: 'none', trailAtrLong: 0, trailAtrShort: 0 },
    { label: 'sym-2.5', trailAtrLong: 2.5, trailAtrShort: 2.5 },
    { label: 'short-wider', trailAtrLong: 2.5, trailAtrShort: 3.75 },
    { label: 'long-wider', trailAtrLong: 3.75, trailAtrShort: 2.5 },
  ],
  combined: [
    { label: 'none', trailAtrLong: 0, trailAtrShort: 0 },
    { label: 'short-wider', trailAtrLong: 2.5, trailAtrShort: 3.75 },
  ],
} as const;

export interface GridCell {
  params: LiquidationSqueezeParams;
  /** Stable identity for the research log and the multiple-testing correction. */
  key: string;
  thresholdLabel: string;
  trailLabel: string;
}

/** Cross the base grid with a set of threshold and trail pairs. */
export function buildGrid(
  thresholds: readonly ThresholdPair[],
  trails: readonly TrailPair[],
): GridCell[] {
  const cells: GridCell[] = [];
  for (const atrBars of BASE_SQUEEZE_GRID.atrBars) {
    for (const compressionPercentile of BASE_SQUEEZE_GRID.compressionPercentile) {
      for (const holdBars of BASE_SQUEEZE_GRID.holdBars) {
        for (const threshold of thresholds) {
          for (const trail of trails) {
            cells.push({
              params: {
                atrBars,
                compressionPercentile,
                holdBars,
                oiRankLong: threshold.oiRankLong,
                oiRankShort: threshold.oiRankShort,
                trailAtrLong: trail.trailAtrLong,
                trailAtrShort: trail.trailAtrShort,
              },
              key:
                `atr${atrBars}-cmp${compressionPercentile}-hold${holdBars}` +
                `-oi:${threshold.label}-trail:${trail.label}`,
              thresholdLabel: threshold.label,
              trailLabel: trail.label,
            });
          }
        }
      }
    }
  }
  return cells;
}
