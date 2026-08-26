/**
 * Rolling walk-forward split construction for the development window.
 *
 * A split is a pair of index ranges over one candle series: a *train* range used
 * to choose parameters, and a *test* range that is scored. The test range always
 * begins at or after the end of its train range, so no parameter is ever chosen
 * with knowledge of the bars it is scored on. Test ranges never overlap each
 * other, so concatenating their trades yields a genuine out-of-sample track record
 * rather than the same bars counted several times.
 *
 * WARM-UP IS NOT LOOKAHEAD
 * ------------------------
 * Indicators are computed over the whole series but, by construction, the value at
 * bar `i` reads only bars `<= i`. A test window therefore legitimately uses bars
 * *before* `testStart` to warm up its moving averages -- those bars are in the past
 * relative to every decision made inside the window. What must never happen is the
 * reverse: choosing a parameter using bars at or after `testStart`. That is what
 * `assertSplitsAreCausal` pins down.
 */

export interface WalkForwardSplit {
  /** Zero-based index of this split in the sequence. */
  index: number;
  /** Inclusive first bar of the train range. */
  trainStart: number;
  /** Exclusive last bar of the train range. */
  trainEnd: number;
  /** Inclusive first bar of the test range. */
  testStart: number;
  /** Exclusive last bar of the test range. */
  testEnd: number;
}

export interface WalkForwardSplitRequest {
  /** Number of bars in the series being split. */
  totalBars: number;
  /**
   * Bars reserved at the front of the series so the first train range already has
   * indicator history behind it. No split starts before this.
   */
  warmupBars: number;
  /** Bars per train range. */
  trainBars: number;
  /** Bars per test range. */
  testBars: number;
  /**
   * How far the window advances between splits. Equal to `testBars` for
   * non-overlapping, exactly tiling test ranges; smaller values overlap the test
   * ranges and are rejected, because overlapping tests double-count bars.
   */
  stepBars: number;
}

export interface WalkForwardPlan {
  splits: WalkForwardSplit[];
  /** Bars at the tail that could not form a full test range, and were dropped. */
  droppedTailBars: number;
  request: WalkForwardSplitRequest;
}

export class WalkForwardConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalkForwardConfigurationError';
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new WalkForwardConfigurationError(`${name} must be a positive integer, received ${value}`);
  }
}

/**
 * Build a rolling (non-anchored) walk-forward plan.
 *
 * Rolling rather than anchored/expanding is deliberate: an expanding train range
 * gives later splits many times more history than earlier ones, so a family that
 * only works in one regime can look increasingly good purely because the early
 * regime keeps being re-fit. A fixed-length rolling window keeps every split's
 * fitting budget identical.
 */
export function buildWalkForwardSplits(request: WalkForwardSplitRequest): WalkForwardPlan {
  const { totalBars, warmupBars, trainBars, testBars, stepBars } = request;

  requirePositiveInteger(totalBars, 'totalBars');
  requirePositiveInteger(trainBars, 'trainBars');
  requirePositiveInteger(testBars, 'testBars');
  requirePositiveInteger(stepBars, 'stepBars');
  if (!Number.isInteger(warmupBars) || warmupBars < 0) {
    throw new WalkForwardConfigurationError(
      `warmupBars must be a non-negative integer, received ${warmupBars}`,
    );
  }
  if (stepBars < testBars) {
    throw new WalkForwardConfigurationError(
      `stepBars (${stepBars}) is smaller than testBars (${testBars}), which would overlap test ` +
        'ranges and double-count bars in the out-of-sample record',
    );
  }

  const splits: WalkForwardSplit[] = [];
  let trainStart = warmupBars;
  let lastTestEnd = warmupBars;

  while (true) {
    const trainEnd = trainStart + trainBars;
    const testStart = trainEnd;
    const testEnd = testStart + testBars;
    if (testEnd > totalBars) {
      break;
    }
    splits.push({ index: splits.length, trainStart, trainEnd, testStart, testEnd });
    lastTestEnd = testEnd;
    trainStart += stepBars;
  }

  return {
    splits,
    droppedTailBars: splits.length === 0 ? 0 : totalBars - lastTestEnd,
    request,
  };
}

/**
 * Verify the two properties the whole study rests on: parameters are never chosen
 * on the bars they are scored on, and no test bar is scored twice.
 *
 * Called by the runner on every plan before any trade is generated, so a future
 * change to the split arithmetic cannot quietly reintroduce leakage.
 */
export function assertSplitsAreCausal(splits: readonly WalkForwardSplit[]): void {
  let previousTestEnd = -1;

  for (const split of splits) {
    if (split.trainStart >= split.trainEnd) {
      throw new WalkForwardConfigurationError(
        `split ${split.index}: empty train range [${split.trainStart}, ${split.trainEnd})`,
      );
    }
    if (split.testStart >= split.testEnd) {
      throw new WalkForwardConfigurationError(
        `split ${split.index}: empty test range [${split.testStart}, ${split.testEnd})`,
      );
    }
    if (split.testStart < split.trainEnd) {
      throw new WalkForwardConfigurationError(
        `split ${split.index}: test range starts at ${split.testStart}, before the train range ends ` +
          `at ${split.trainEnd}. Parameters would be chosen on bars they are scored on.`,
      );
    }
    if (split.testStart < previousTestEnd) {
      throw new WalkForwardConfigurationError(
        `split ${split.index}: test range starts at ${split.testStart}, inside the previous test ` +
          `range which ended at ${previousTestEnd}. Out-of-sample bars would be counted twice.`,
      );
    }
    previousTestEnd = split.testEnd;
  }
}

/** Total number of distinct bars scored out-of-sample across a plan. */
export function outOfSampleBarCount(splits: readonly WalkForwardSplit[]): number {
  return splits.reduce((total, split) => total + (split.testEnd - split.testStart), 0);
}
