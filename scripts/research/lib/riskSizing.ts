/**
 * Position-sizing overlays for the walk-forward study.
 *
 * WHY SIZING IS A SEPARATE LAYER
 * ------------------------------
 * A family in `strategyFamilies` answers only "which way, and when". How much to hold
 * is a different question, and keeping it separate means the same rule can be measured
 * unsized and sized against the identical trade set, so any change in the result is
 * attributable to the sizing decision alone.
 *
 * THE ARITHMETIC THAT GOVERNS WHAT SIZING CAN AND CANNOT DO
 * --------------------------------------------------------
 * P&L here is additive in percentage points, so multiplying every position by a
 * constant `k` multiplies both the net return and the max drawdown by `k`. A constant
 * de-levering therefore cannot improve the return-per-unit-of-drawdown ratio at all --
 * it only slides a family along a straight line through the origin. It also means the
 * usual trio of gates (net return positive, profit factor above 1, drawdown under a
 * cap) is satisfiable by *any* family with a profit factor above 1, simply by choosing
 * `k` small enough: profit factor and the sign of the return are scale-invariant, and
 * the drawdown cap is not. That is a property of the gate, not a strategy result, and
 * it is why the study reports return/drawdown alongside the raw numbers.
 *
 * What sizing *can* do is change the ratio, by holding less where the loss per unit of
 * exposure is larger. Two overlays are provided:
 *
 *   volTarget   scale = targetVol / realizedVol, capped. Equalises risk across symbols
 *               *and* across time, and de-levers on average whenever the target is
 *               below the typical realized volatility.
 *   riskParity  scale = (cross-sectional median realized vol at that bar) / realizedVol,
 *               capped. Equalises risk across symbols while leaving average gross
 *               exposure near one unit, which isolates the cross-sectional effect from
 *               the de-levering effect.
 *
 * CAUSALITY
 * ---------
 * Every value at bar `i` is computed from bars `<= i` only, and is `undefined` until
 * there is a full window of history. A trade whose entry bar has no volatility estimate
 * is dropped by `buildTrades` rather than taken at an assumed size.
 */

import { rollingStd } from './indicators';
import type { Candle } from './researchDataset';
import type { MaybeNumber } from './indicators';

/** Per-bar log returns in percent. Element 0 is `undefined`: it has no predecessor. */
export function logReturnsPct(candles: readonly Candle[]): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(candles.length).fill(undefined);
  for (let i = 1; i < candles.length; i += 1) {
    const previous = candles[i - 1].c;
    const current = candles[i].c;
    if (previous > 0 && current > 0) {
      out[i] = Math.log(current / previous) * 100;
    }
  }
  return out;
}

/**
 * Realized volatility in percent per bar: the standard deviation of the trailing
 * `windowBars` log returns ending at `i`, inclusive.
 */
export function realizedVolPct(candles: readonly Candle[], windowBars: number): MaybeNumber[] {
  return rollingStd(logReturnsPct(candles), windowBars);
}

/**
 * Cross-sectional median of a set of index-aligned series. `undefined` at a bar where
 * fewer than half the series have a value, because a median of one or two symbols is
 * not a description of the universe.
 */
export function crossSectionalMedian(series: readonly MaybeNumber[][]): MaybeNumber[] {
  const length = series.reduce((longest, entry) => Math.max(longest, entry.length), 0);
  const out: MaybeNumber[] = new Array(length).fill(undefined);
  const minimumCoverage = Math.ceil(series.length / 2);
  for (let i = 0; i < length; i += 1) {
    const values: number[] = [];
    for (const entry of series) {
      const value = entry[i];
      if (value !== undefined && Number.isFinite(value)) {
        values.push(value);
      }
    }
    if (values.length < minimumCoverage || values.length === 0) {
      continue;
    }
    values.sort((left, right) => left - right);
    const middle = Math.floor(values.length / 2);
    out[i] =
      values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  }
  return out;
}

export interface ScaleBounds {
  /** Upper bound on the exposure multiplier, so a quiet tape cannot imply huge leverage. */
  maxScale: number;
  /** Multipliers at or below this are treated as no position rather than as dust. */
  minScale?: number;
}

/**
 * `reference / own`, bounded. `undefined` wherever either input is missing, so the
 * caller cannot silently fall back to full size.
 */
export function volatilityScaleSeries(
  ownVolPct: readonly MaybeNumber[],
  referenceVolPct: readonly MaybeNumber[] | number,
  bounds: ScaleBounds,
): (number | undefined)[] {
  const maxScale = Math.max(0, bounds.maxScale);
  const minScale = Math.max(0, bounds.minScale ?? 0);
  const out: (number | undefined)[] = new Array(ownVolPct.length).fill(undefined);
  for (let i = 0; i < ownVolPct.length; i += 1) {
    const own = ownVolPct[i];
    const reference = typeof referenceVolPct === 'number' ? referenceVolPct : referenceVolPct[i];
    if (own === undefined || !(own > 0) || reference === undefined || !(reference > 0)) {
      continue;
    }
    const scale = Math.min(maxScale, reference / own);
    if (scale > minScale) {
      out[i] = scale;
    }
  }
  return out;
}

export type SizingMode = 'none' | 'volTarget' | 'riskParity';

export interface SizingPolicy {
  id: string;
  mode: SizingMode;
  /** Trailing window for the volatility estimate, in bars. Unused when mode is 'none'. */
  volWindowBars: number;
  /** Target volatility in percent per bar. Only used by 'volTarget'. */
  targetVolPctPerBar: number;
  maxScale: number;
}

/** `undefined` everywhere means "unsized"; `buildTrades` reads 1 when no series is passed. */
export const UNSIZED: SizingPolicy = {
  id: 'none',
  mode: 'none',
  volWindowBars: 0,
  targetVolPctPerBar: 0,
  maxScale: 1,
};

/**
 * Build one exposure-multiplier series per symbol for a policy.
 *
 * The universe is passed whole because `riskParity` needs the cross-sectional median at
 * each bar; `volTarget` and `none` only read their own symbol.
 */
export function buildSizingSeries(
  universe: readonly { symbol: string; candles: readonly Candle[] }[],
  policy: SizingPolicy,
): Map<string, (number | undefined)[] | undefined> {
  const out = new Map<string, (number | undefined)[] | undefined>();
  if (policy.mode === 'none') {
    for (const entry of universe) {
      out.set(entry.symbol, undefined);
    }
    return out;
  }

  const vols = universe.map((entry) => realizedVolPct(entry.candles, policy.volWindowBars));
  const bounds: ScaleBounds = { maxScale: policy.maxScale, minScale: 0 };

  if (policy.mode === 'volTarget') {
    universe.forEach((entry, index) => {
      out.set(entry.symbol, volatilityScaleSeries(vols[index], policy.targetVolPctPerBar, bounds));
    });
    return out;
  }

  const median = crossSectionalMedian(vols);
  universe.forEach((entry, index) => {
    out.set(entry.symbol, volatilityScaleSeries(vols[index], median, bounds));
  });
  return out;
}
