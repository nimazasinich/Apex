/**
 * Deflated and probabilistic Sharpe ratios, for judging a grid winner honestly.
 *
 * THE PROBLEM THIS ADDRESSES
 * -------------------------
 * A Sharpe ratio computed on the winner of a search is a biased estimate of that
 * strategy's Sharpe ratio, and the bias grows with the number of configurations tried.
 * This project has already paid for that lesson at full price: selecting across 40
 * candidates on 1095 training bars produced a `tsm` aggregate whose apparent +44.81%
 * came almost entirely from one window (+81.87% in 2021-08..2021-10), and which beat
 * every fixed configuration it was selected from. The aggregate was not a measurement of
 * an edge; it was a measurement of how many chances the search had to get lucky.
 *
 * Bailey & Lopez de Prado, "The Deflated Sharpe Ratio: Correcting for Selection Bias,
 * Backtest Overfitting and Non-Normality" (Journal of Portfolio Management, 40(5), 2014)
 * gives the correction. Two ingredients:
 *
 *   1. The Probabilistic Sharpe Ratio, PSR(SR*), the probability that the true Sharpe
 *      exceeds a benchmark SR*, accounting for track-record length and for skew and
 *      kurtosis -- because a Sharpe estimated from few, skewed, fat-tailed observations
 *      is far less certain than the point estimate suggests.
 *   2. A benchmark SR* that is not zero but the Sharpe one would *expect* the best of N
 *      trials to show under the null of no skill, which rises with N and with the spread
 *      of Sharpes across trials.
 *
 * The Deflated Sharpe Ratio is PSR evaluated at that expected-maximum benchmark. Read it
 * as: given how many configurations were tried and how widely they scattered, what is the
 * probability the winner's Sharpe is genuinely above zero rather than the best draw from
 * a pile of noise?
 *
 * WHAT THE TRIAL COUNT MUST INCLUDE
 * --------------------------------
 * Every configuration actually evaluated, not the ones that survived. Passing only the
 * winners would defeat the entire purpose. `trialSharpes` therefore takes the Sharpe of
 * every grid cell scored, including cells that lost, cells that failed the trade minimum,
 * and the zero-effect cell.
 *
 * AN HONEST CAVEAT ABOUT CORRELATED TRIALS
 * ---------------------------------------
 * The formula treats the N trials as N draws whose spread estimates the null distribution.
 * The cells of this grid are strongly correlated -- neighbouring thresholds select
 * overlapping trades -- so the observed cross-trial variance understates the spread that
 * N *independent* trials would show. Because SR* scales with that variance, the
 * correction here is therefore *optimistic*, not conservative: it deflates less than a
 * truly independent search of the same size would warrant. It is a floor on the penalty,
 * not a ceiling. That is why `deflatedSharpe` reports `trials` and
 * `trialSharpeStdDev` alongside the probability, and why the study also keeps the
 * leave-out-best-window check, which makes no distributional assumptions at all and is
 * what actually caught `tsm`.
 *
 * OBSERVATIONS ARE TRADES, NOT CALENDAR PERIODS
 * --------------------------------------------
 * Sharpe here is computed over the sequence of per-trade net returns, so `observations`
 * is a trade count and the ratio is per-trade rather than annualised. This matches how
 * the rest of the study measures P&L (per-trade percentages summed, not compounded) and
 * keeps the deflation consistent with the numbers it is deflating. It does mean these
 * figures are not comparable to annualised Sharpes quoted elsewhere in the literature,
 * which is stated in the output payload rather than left for a reader to infer.
 */

/** Euler-Mascheroni constant, as used in the expected-maximum formula. */
const EULER_MASCHERONI = 0.5772156649015329;

/**
 * Standard normal CDF via a high-accuracy erf approximation.
 *
 * Abramowitz & Stegun 7.1.26 has ~1e-7 absolute error, which is far below the precision
 * anyone should read into a probability derived from a few hundred trades.
 */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

/**
 * Inverse standard normal CDF (Acklam's rational approximation).
 *
 * Relative error below 1.15e-9 across the open unit interval, refined by one
 * Halley step. Needed for the expected-maximum benchmark, which evaluates the quantile
 * function at points very close to 1 when N is large.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0) || !(p < 1)) {
    throw new RangeError(`normalQuantile requires 0 < p < 1, received ${p}`);
  }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  // One Halley refinement, which costs nothing and removes the tail error.
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

export interface ReturnMoments {
  observations: number;
  mean: number;
  /** Population standard deviation, matching the Sharpe convention used here. */
  stdDev: number;
  /** Per-observation Sharpe: `mean / stdDev`. Not annualised. */
  sharpe: number;
  /** Sample skewness (Fisher). */
  skewness: number;
  /** Non-excess kurtosis: 3 for a normal distribution, as the DSR formula expects. */
  kurtosis: number;
}

/** Moments of a return series, or `null` when there are too few observations. */
export function returnMoments(returns: readonly number[]): ReturnMoments | null {
  const observations = returns.length;
  if (observations < 2) {
    return null;
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / observations;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const value of returns) {
    const d = value - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= observations;
  m3 /= observations;
  m4 /= observations;
  const stdDev = Math.sqrt(m2);
  if (!(stdDev > 0)) {
    return null;
  }
  return {
    observations,
    mean,
    stdDev,
    sharpe: mean / stdDev,
    skewness: m3 / Math.pow(stdDev, 3),
    kurtosis: m4 / (m2 * m2),
  };
}

/**
 * Probabilistic Sharpe Ratio: P(true Sharpe > `benchmark`).
 *
 * The denominator is the asymptotic standard error of the Sharpe estimator under
 * non-normal returns. Negative skew and fat tails inflate it, which is the mechanism by
 * which a strategy that makes steady small gains and occasional large losses is correctly
 * penalised relative to one with the same point-estimate Sharpe and symmetric returns.
 */
export function probabilisticSharpe(moments: ReturnMoments, benchmark: number): number | null {
  const { sharpe, skewness, kurtosis, observations } = moments;
  if (observations < 2) {
    return null;
  }
  const variance = 1 - skewness * sharpe + ((kurtosis - 1) / 4) * sharpe * sharpe;
  if (!(variance > 0)) {
    // Extreme higher moments on a short record; the estimator is not usable here and
    // returning a number anyway would be worse than admitting that.
    return null;
  }
  return normalCdf(((sharpe - benchmark) * Math.sqrt(observations - 1)) / Math.sqrt(variance));
}

/**
 * Expected maximum Sharpe across `trials` independent draws under the null of no skill.
 *
 * `trialSharpeStdDev` is the cross-trial spread; with a single trial there is no spread
 * to measure and the benchmark collapses to zero, which is the honest answer -- a search
 * of size one carries no selection bias to correct.
 */
export function expectedMaximumSharpe(trials: number, trialSharpeStdDev: number): number {
  if (trials < 2 || !(trialSharpeStdDev > 0)) {
    return 0;
  }
  const a = normalQuantile(1 - 1 / trials);
  const b = normalQuantile(1 - 1 / (trials * Math.E));
  return trialSharpeStdDev * ((1 - EULER_MASCHERONI) * a + EULER_MASCHERONI * b);
}

export interface DeflatedSharpeResult {
  /** Number of configurations actually evaluated, winners and losers alike. */
  trials: number;
  trialSharpeStdDev: number;
  /** Sharpe of the selected configuration, per trade, not annualised. */
  observedSharpe: number;
  observations: number;
  skewness: number;
  kurtosis: number;
  /** The expected-maximum benchmark the observed Sharpe must clear. */
  benchmarkSharpe: number;
  /** P(true Sharpe > 0), ignoring selection bias. Reported for contrast. */
  probabilisticSharpe: number | null;
  /** P(true Sharpe > benchmark). This is the number to read. */
  deflatedSharpe: number | null;
  /** Plain-language reading of `deflatedSharpe`, so a reader cannot mistake its direction. */
  interpretation: string;
}

/**
 * Deflate a selected configuration's Sharpe by the size and spread of the search.
 *
 * `selectedReturns` is the winner's out-of-sample per-trade return series.
 * `trialSharpes` is the Sharpe of every configuration evaluated -- the whole search, not
 * the shortlist.
 */
export function deflatedSharpe(
  selectedReturns: readonly number[],
  trialSharpes: readonly number[],
): DeflatedSharpeResult | null {
  const moments = returnMoments(selectedReturns);
  if (moments === null) {
    return null;
  }
  const usable = trialSharpes.filter((value) => Number.isFinite(value));
  const trials = usable.length;
  let stdDev = 0;
  if (trials >= 2) {
    const mean = usable.reduce((sum, value) => sum + value, 0) / trials;
    stdDev = Math.sqrt(
      usable.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / (trials - 1),
    );
  }
  const benchmark = expectedMaximumSharpe(trials, stdDev);
  const deflated = probabilisticSharpe(moments, benchmark);
  const psr = probabilisticSharpe(moments, 0);

  let interpretation: string;
  if (deflated === null) {
    interpretation =
      'Not computable: the higher moments of this return series make the Sharpe standard error ' +
      'non-positive, which happens on short or extremely skewed records.';
  } else if (deflated >= 0.95) {
    interpretation =
      `The winner's Sharpe of ${moments.sharpe.toFixed(4)} per trade clears the ` +
      `${benchmark.toFixed(4)} expected from the best of ${trials} trials with probability ` +
      `${(deflated * 100).toFixed(1)}%. Survives the selection-bias correction at the 95% level.`;
  } else {
    interpretation =
      `The winner's Sharpe of ${moments.sharpe.toFixed(4)} per trade clears the ` +
      `${benchmark.toFixed(4)} expected from the best of ${trials} trials with probability only ` +
      `${(deflated * 100).toFixed(1)}%. This is what a lucky grid cell looks like; it does not ` +
      'meet the 95% bar and must not be promoted on this evidence.';
  }

  return {
    trials,
    trialSharpeStdDev: stdDev,
    observedSharpe: moments.sharpe,
    observations: moments.observations,
    skewness: moments.skewness,
    kurtosis: moments.kurtosis,
    benchmarkSharpe: benchmark,
    probabilisticSharpe: psr,
    deflatedSharpe: deflated,
    interpretation,
  };
}
