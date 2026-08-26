/**
 * Causal indicator primitives for the walk-forward baseline.
 *
 * Every function here returns an array the same length as its input, where element
 * `i` is computed **only** from elements `<= i`. Where there is not yet enough
 * history the element is `undefined` rather than a padded or back-filled number, so
 * a strategy that reads it must decide explicitly to stay flat. That is the whole
 * point: a single accidental `values[i + 1]` anywhere in a backtest manufactures
 * profit that does not exist, so the lookahead question is answered once, here,
 * instead of separately inside every family.
 *
 * The implementations are deliberately plain O(n * window) loops. At 6,570 four-hour
 * bars per symbol the cost is irrelevant, and a plain loop is far easier to audit
 * for an off-by-one than an incremental accumulator would be.
 */

import type { Candle } from './researchDataset';

export type MaybeNumber = number | undefined;

function requireWindow(window: number, name = 'window'): void {
  if (!Number.isInteger(window) || window < 1) {
    throw new Error(`${name} must be a positive integer, received ${window}`);
  }
}

/** Simple moving average over the `window` values ending at `i`, inclusive. */
export function sma(values: readonly MaybeNumber[], window: number): MaybeNumber[] {
  requireWindow(window);
  const out: MaybeNumber[] = new Array(values.length).fill(undefined);
  for (let i = window - 1; i < values.length; i += 1) {
    let total = 0;
    let ok = true;
    for (let j = i - window + 1; j <= i; j += 1) {
      const value = values[j];
      if (value === undefined || !Number.isFinite(value)) {
        ok = false;
        break;
      }
      total += value;
    }
    if (ok) {
      out[i] = total / window;
    }
  }
  return out;
}

/** Population standard deviation over the `window` values ending at `i`, inclusive. */
export function rollingStd(values: readonly MaybeNumber[], window: number): MaybeNumber[] {
  requireWindow(window);
  const means = sma(values, window);
  const out: MaybeNumber[] = new Array(values.length).fill(undefined);
  for (let i = window - 1; i < values.length; i += 1) {
    const mean = means[i];
    if (mean === undefined) {
      continue;
    }
    let sumSquares = 0;
    for (let j = i - window + 1; j <= i; j += 1) {
      const value = values[j] as number;
      sumSquares += (value - mean) ** 2;
    }
    out[i] = Math.sqrt(sumSquares / window);
  }
  return out;
}

/** Highest value over the `window` values ending at `i`, inclusive. */
export function rollingMax(values: readonly MaybeNumber[], window: number): MaybeNumber[] {
  requireWindow(window);
  const out: MaybeNumber[] = new Array(values.length).fill(undefined);
  for (let i = window - 1; i < values.length; i += 1) {
    let best = -Infinity;
    let ok = true;
    for (let j = i - window + 1; j <= i; j += 1) {
      const value = values[j];
      if (value === undefined || !Number.isFinite(value)) {
        ok = false;
        break;
      }
      if (value > best) {
        best = value;
      }
    }
    if (ok) {
      out[i] = best;
    }
  }
  return out;
}

/** Lowest value over the `window` values ending at `i`, inclusive. */
export function rollingMin(values: readonly MaybeNumber[], window: number): MaybeNumber[] {
  requireWindow(window);
  const out: MaybeNumber[] = new Array(values.length).fill(undefined);
  for (let i = window - 1; i < values.length; i += 1) {
    let best = Infinity;
    let ok = true;
    for (let j = i - window + 1; j <= i; j += 1) {
      const value = values[j];
      if (value === undefined || !Number.isFinite(value)) {
        ok = false;
        break;
      }
      if (value < best) {
        best = value;
      }
    }
    if (ok) {
      out[i] = best;
    }
  }
  return out;
}

/** Percentage change from `i - window` to `i`. Undefined before enough history. */
export function pctChange(values: readonly MaybeNumber[], window: number): MaybeNumber[] {
  requireWindow(window);
  const out: MaybeNumber[] = new Array(values.length).fill(undefined);
  for (let i = window; i < values.length; i += 1) {
    const now = values[i];
    const then = values[i - window];
    if (now === undefined || then === undefined || !(then > 0) || !Number.isFinite(now)) {
      continue;
    }
    out[i] = (now / then - 1) * 100;
  }
  return out;
}

/**
 * True range per bar. Element 0 is `undefined` because a true range needs the
 * previous close.
 */
export function trueRange(candles: readonly Candle[]): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(candles.length).fill(undefined);
  for (let i = 1; i < candles.length; i += 1) {
    const bar = candles[i];
    const previousClose = candles[i - 1].c;
    out[i] = Math.max(
      bar.h - bar.l,
      Math.abs(bar.h - previousClose),
      Math.abs(bar.l - previousClose),
    );
  }
  return out;
}

/** Simple (not Wilder-smoothed) average true range over `window` bars ending at `i`. */
export function atr(candles: readonly Candle[], window: number): MaybeNumber[] {
  return sma(trueRange(candles), window);
}

/**
 * Fraction of the trailing `window` observations (ending at `i`, inclusive) that are
 * less than or equal to the observation at `i`.
 *
 * Used to ask "is current volatility unusually low *for this market*" without
 * hard-coding an absolute threshold that would mean different things for BTC in 2021
 * and DOGE in 2023.
 */
export function trailingPercentileRank(
  values: readonly MaybeNumber[],
  window: number,
): MaybeNumber[] {
  requireWindow(window);
  const out: MaybeNumber[] = new Array(values.length).fill(undefined);
  for (let i = window - 1; i < values.length; i += 1) {
    const current = values[i];
    if (current === undefined) {
      continue;
    }
    let counted = 0;
    let atOrBelow = 0;
    for (let j = i - window + 1; j <= i; j += 1) {
      const value = values[j];
      if (value === undefined) {
        continue;
      }
      counted += 1;
      if (value <= current) {
        atOrBelow += 1;
      }
    }
    // Require a mostly-complete window; a handful of observations would make the
    // rank meaningless.
    if (counted >= Math.ceil(window * 0.8)) {
      out[i] = atOrBelow / counted;
    }
  }
  return out;
}

/** Close prices as a plain array, for feeding the primitives above. */
export function closes(candles: readonly Candle[]): number[] {
  return candles.map((candle) => candle.c);
}

export function highs(candles: readonly Candle[]): number[] {
  return candles.map((candle) => candle.h);
}

export function lows(candles: readonly Candle[]): number[] {
  return candles.map((candle) => candle.l);
}

export function volumes(candles: readonly Candle[]): number[] {
  return candles.map((candle) => candle.v);
}

/**
 * Z-score of `values[i]` against the mean and standard deviation of the trailing
 * `window`, inclusive of `i`. Undefined when the deviation is zero, because a
 * division there would produce an infinite signal from a flat market.
 */
export function rollingZScore(values: readonly MaybeNumber[], window: number): MaybeNumber[] {
  const means = sma(values, window);
  const deviations = rollingStd(values, window);
  const out: MaybeNumber[] = new Array(values.length).fill(undefined);
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const mean = means[i];
    const deviation = deviations[i];
    if (value === undefined || mean === undefined || deviation === undefined || deviation <= 0) {
      continue;
    }
    out[i] = (value - mean) / deviation;
  }
  return out;
}
