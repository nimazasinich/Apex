/**
 * Walk-forward study of the liquidation-flow-conditioned compression breakout.
 *
 * WHAT IS BEING TESTED
 * -------------------
 * Whether conditioning the `squeeze` family on open-interest buildup, and/or replacing its
 * fixed-bar exit with a volatility-scaled trailing stop, improves its out-of-sample
 * result. The mechanism and its sources are documented in `lib/liquidationSqueeze.ts`.
 *
 * The harness is deliberately identical to `runWalkForwardBaseline.mts`: the same fourteen
 * rolling splits, the same cost models including the 2x stress, the same selection
 * objective, the same minimum in-sample trade count, the same gates. Nothing about the
 * measurement was re-tuned to suit the new candidate, because a refinement that only looks
 * better under a different measurement has not been shown to be better at all.
 *
 * FIVE ARMS, AND WHY EACH EXISTS
 * -----------------------------
 *   A  control          plain squeeze, unconditioned. Present in every table so the
 *                       additions must beat their own baseline rather than merely clear a
 *                       gate in isolation.
 *   B  symmetric OI     one buildup threshold for both directions.
 *   C  asymmetric OI    separate long and short thresholds, including the ordering Cheng
 *                       et al. predict, the symmetric case, and the reversed ordering.
 *   D  trailing exit    the exit mechanism alone, no open interest. Isolating it matters:
 *                       it needs no OI, so it runs on all fourteen splits, and without
 *                       this arm a combined improvement could not be attributed.
 *   E  combined         asymmetric conditioning plus the trailing exit.
 *
 * Every arm's grid contains the zero-effect cell, so each search is able to conclude that
 * its own addition does not help.
 *
 * THREE THINGS THIS RUN REFUSES TO DO
 * ----------------------------------
 * 1. It does not zero-fill a blind window. Open interest begins 2022-01-01 and the derived
 *    buildup rank warms up later still, so on the early splits a conditioned cell can take
 *    no trades at all. Those splits are reported `unavailable` and excluded from the
 *    headline, never averaged in as a zero.
 *
 * 2. It does not let an arm silently degenerate into its own control. This is the subtle
 *    version of the same failure and it would otherwise pass unnoticed: on a blind split
 *    every conditioned cell falls below the minimum in-sample trade count, so the search
 *    has only the zero-effect cell left to pick, and the arm quietly reports the control's
 *    number as if it were the conditioner's. `selectedIsZeroEffect` is therefore recorded
 *    per split per arm. If an arm chooses "do nothing" on most of its *available* splits,
 *    that is not a null result to be explained away -- it is the answer.
 *
 * 3. It does not report only the winner. Every cell is additionally scored as a fixed
 *    configuration over the same out-of-sample windows, which supplies the trial
 *    distribution for the deflated Sharpe ratio and answers the question that exposed
 *    `tsm`: did adaptive selection actually beat the best fixed configuration, or was it
 *    just picking noise that happened to look good in-sample?
 *
 * The sealed 2024-2025 holdout is untouched. Every bar comes through `loadDevelopment*`,
 * which filters below the boundary and then re-asserts it.
 *
 * Run with:  npx tsx scripts/research/runLiquidationSqueezeStudy.mts
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  transactionCostModelFromPerSideAssumptions,
  type TransactionCostModel,
} from '../../src/services/transactionCosts';
import { deflatedSharpe, returnMoments, type DeflatedSharpeResult } from './lib/deflatedSharpe';
import {
  BASE_SQUEEZE_GRID,
  buildGrid,
  isZeroEffect,
  positionsFromIndicators,
  prepareSqueezeIndicators,
  readsOpenInterest,
  THRESHOLD_PAIRS,
  TRAIL_PAIRS,
  type GridCell,
  type SqueezeIndicators,
  type ThresholdPair,
  type TrailPair,
} from './lib/liquidationSqueeze';
import {
  availabilityForAlignedSeries,
  buildOpenInterestAvailability,
  type ConditioningStatus,
  type SeriesAvailability,
} from './lib/openInterestAvailability';
import {
  DEVELOPMENT_FROM_MS,
  loadDevelopmentOpenInterest,
  REPO_ROOT,
  SEALED_HOLDOUT_FROM_MS,
  type OpenInterestPoint,
} from './lib/researchDataset';
import {
  FAMILY_HOURS_PER_BAR,
  STRATEGY_FAMILIES,
  type SymbolSeries,
} from './lib/strategyFamilies';
import {
  buildTrades,
  summarizeTrades,
  type Direction,
  type Trade,
  type TradeSummary,
} from './lib/tradeMetrics';
import { loadDevelopmentUniverse } from './lib/universe';
import {
  assertSplitsAreCausal,
  buildWalkForwardSplits,
  outOfSampleBarCount,
  type WalkForwardSplit,
} from './lib/walkForward';

/* ------------------------------------------------------------------ *
 * Policy -- held identical to the baseline study on purpose
 * ------------------------------------------------------------------ */

const COST_ASSUMPTIONS = {
  commissionPctPerSide: 0.04,
  slippagePctPerSide: 0.02,
  fundingPctEstimate: 0.01,
} as const;

const BASE_COSTS: TransactionCostModel =
  transactionCostModelFromPerSideAssumptions(COST_ASSUMPTIONS);
const STRESSED_COSTS: TransactionCostModel = transactionCostModelFromPerSideAssumptions(
  COST_ASSUMPTIONS,
  { feeMultiplier: 2, spreadMultiplier: 2, slippageMultiplier: 2, fundingMultiplier: 2 },
);

const SPLIT_GEOMETRY = { warmupBars: 180, trainBars: 1095, testBars: 365, stepBars: 365 } as const;
const MIN_TRAIN_TRADES = 10;

const GATES = {
  mission: { minTrades: 30, minProfitFactor: 1, maxDrawdownPct: 15 },
  repository: { minTrades: 30, minProfitFactor: 1, maxDrawdownPct: 13 },
} as const;

const OUTPUT_DIR = path.join(REPO_ROOT, 'QA', 'walk-forward-baseline');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'liquidation-squeeze-study.json');
const RESEARCH_LOG_FILE = path.join(OUTPUT_DIR, 'liquidation-squeeze-research-log.json');

/**
 * The window that produced the entire apparent edge of the `tsm` family (+81.87% of a
 * +44.81% total). Flagged by name in the output because it is the single most likely
 * source of a false positive in this dataset, and because it is also a window where an
 * open-interest conditioner is structurally blind -- which is a useful epistemic property
 * worth stating rather than a coincidence worth hiding.
 */
const KNOWN_LUCKY_WINDOW = { splitIndex: 0, note: 'source of tsm\'s entire fake +81.87% edge' };

/* ------------------------------------------------------------------ *
 * Arms
 * ------------------------------------------------------------------ */

interface Arm {
  id: string;
  label: string;
  hypothesis: string;
  thresholds: readonly ThresholdPair[];
  trails: readonly TrailPair[];
  /** True when any non-zero cell of this arm reads open interest. */
  usesOpenInterest: boolean;
}

const NO_THRESHOLD: readonly ThresholdPair[] = [{ label: 'none', oiRankLong: 0, oiRankShort: 0 }];
const NO_TRAIL: readonly TrailPair[] = [{ label: 'none', trailAtrLong: 0, trailAtrShort: 0 }];

const ARMS: readonly Arm[] = [
  {
    id: 'A-control',
    label: 'Plain squeeze (unconditioned control)',
    hypothesis:
      'Baseline. Reproduces the published squeeze family exactly; asserted against it at run ' +
      'time rather than assumed.',
    thresholds: NO_THRESHOLD,
    trails: NO_TRAIL,
    usesOpenInterest: false,
  },
  {
    id: 'B-symmetric-oi',
    label: 'Squeeze + symmetric open-interest buildup conditioner',
    hypothesis:
      'Breakouts from compression continue further when leverage accumulated during the ' +
      'compression, because forced liquidation is price-insensitive flow that amplifies the ' +
      'triggering move (Cheng et al., arXiv 2102.04591).',
    thresholds: THRESHOLD_PAIRS.symmetric,
    trails: NO_TRAIL,
    usesOpenInterest: true,
  },
  {
    id: 'C-asymmetric-oi',
    label: 'Squeeze + asymmetric long/short open-interest conditioner',
    hypothesis:
      'Longs are liquidated at roughly 1.9x the rate of shorts (3.51% vs 1.89% of outstanding ' +
      'contracts daily), so a downside break carries more forced flow and short entries should ' +
      'need less buildup to qualify. The reversed ordering is in the grid so this can be ' +
      'rejected.',
    thresholds: THRESHOLD_PAIRS.asymmetric,
    trails: NO_TRAIL,
    usesOpenInterest: true,
  },
  {
    id: 'D-trailing-exit',
    label: 'Squeeze + volatility-scaled trailing exit (no open interest)',
    hypothesis:
      'A fixed-bar exit is indifferent to whether the move is still running. A trailing stop ' +
      'scaled by current ATR adapts to the volatility regime. Mechanism from AdaptiveTrend ' +
      '(arXiv 2602.11708v1); its reported performance is not relied on. Needs no open interest, ' +
      'so this arm runs on all fourteen splits.',
    thresholds: NO_THRESHOLD,
    trails: TRAIL_PAIRS.main,
    usesOpenInterest: false,
  },
  {
    id: 'E-combined',
    label: 'Squeeze + asymmetric conditioner + trailing exit',
    hypothesis:
      'Both additions together. Only interpretable against arms C and D individually, which is ' +
      'why those are run separately rather than inferred from this one.',
    thresholds: THRESHOLD_PAIRS.asymmetric,
    trails: TRAIL_PAIRS.combined,
    usesOpenInterest: true,
  },
];

/* ------------------------------------------------------------------ *
 * Scoring helpers -- identical semantics to the baseline
 * ------------------------------------------------------------------ */

function tradesForRange(
  universe: readonly SymbolSeries[],
  positions: ReadonlyMap<string, readonly Direction[]>,
  weight: number,
  armId: string,
  splitIndex: number,
  range: { start: number; end: number },
  costModel: TransactionCostModel,
): Trade[] {
  const trades: Trade[] = [];
  for (const series of universe) {
    const positionSeries = positions.get(series.symbol);
    if (!positionSeries) {
      continue;
    }
    trades.push(
      ...buildTrades({
        symbol: series.symbol,
        familyId: armId,
        splitIndex,
        candles: series.candles,
        positions: positionSeries,
        range,
        costModel,
        hoursPerBar: FAMILY_HOURS_PER_BAR,
        weight,
      }),
    );
  }
  return trades;
}

function selectionScore(summary: TradeSummary): number {
  return summary.netReturnPct / Math.max(1, summary.maxDrawdownPct);
}

function evaluateGate(
  summary: TradeSummary,
  baseSummary: TradeSummary,
  gate: { minTrades: number; minProfitFactor: number; maxDrawdownPct: number },
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  if (summary.trades < gate.minTrades) {
    failures.push(`only ${summary.trades} out-of-sample trades, needs ${gate.minTrades}`);
  }
  const pf = summary.profitFactor;
  if (pf === null || pf <= gate.minProfitFactor) {
    failures.push(
      `stressed profit factor ${pf === null ? 'n/a' : pf.toFixed(3)} is not above ${gate.minProfitFactor}`,
    );
  }
  if (!(summary.netReturnPct > 0)) {
    failures.push(`stressed net return ${summary.netReturnPct.toFixed(2)}% is not positive`);
  }
  if (!(baseSummary.netReturnPct > 0)) {
    failures.push(`base-cost net return ${baseSummary.netReturnPct.toFixed(2)}% is not positive`);
  }
  if (summary.maxDrawdownPct > gate.maxDrawdownPct) {
    failures.push(
      `stressed max drawdown ${summary.maxDrawdownPct.toFixed(2)} points exceeds the ` +
        `${gate.maxDrawdownPct}-point cap`,
    );
  }
  return { pass: failures.length === 0, failures };
}

/** Per-trade net returns in exit order -- the observation sequence Sharpe is computed on. */
function orderedReturns(trades: readonly Trade[]): number[] {
  return [...trades].sort((a, b) => a.exitTime - b.exitTime).map((trade) => trade.netPnlPct);
}

/**
 * Total net return excluding the single best split.
 *
 * This project's standing check, and the one that actually caught `tsm`. It assumes
 * nothing about the return distribution, which is why it is kept alongside the deflated
 * Sharpe rather than replaced by it.
 */
function leaveOutBestSplit(
  perSplitNet: readonly { splitIndex: number; netReturnPct: number }[],
): { total: number; excludingBest: number; bestSplitIndex: number | null; bestSplitNet: number } {
  const total = perSplitNet.reduce((sum, entry) => sum + entry.netReturnPct, 0);
  if (perSplitNet.length === 0) {
    return { total: 0, excludingBest: 0, bestSplitIndex: null, bestSplitNet: 0 };
  }
  const best = perSplitNet.reduce((top, entry) =>
    entry.netReturnPct > top.netReturnPct ? entry : top,
  );
  return {
    total,
    excludingBest: total - best.netReturnPct,
    bestSplitIndex: best.splitIndex,
    bestSplitNet: best.netReturnPct,
  };
}

/* ------------------------------------------------------------------ *
 * Output shapes
 * ------------------------------------------------------------------ */

type SplitConditioning = 'not-required' | ConditioningStatus;

interface ArmSplitOutcome {
  splitIndex: number;
  testFrom: string;
  testTo: string;
  conditioning: SplitConditioning;
  conditioningReason: string;
  /** Null when the conditioner could not run in this window. Never a zero standing in for it. */
  selectedCellKey: string | null;
  selectedParams: Record<string, number> | null;
  /** True when the search chose the do-nothing cell, i.e. the arm reduced to its control. */
  selectedIsZeroEffect: boolean | null;
  candidatesConsidered: number;
  candidatesEligible: number;
  inSampleNetPct: number | null;
  outOfSampleBaseNetPct: number | null;
  outOfSampleStressed: TradeSummary | null;
}

interface FixedConfigurationOutcome {
  key: string;
  thresholdLabel: string;
  trailLabel: string;
  isZeroEffect: boolean;
  trades: number;
  netReturnPctStressed: number;
  maxDrawdownPctStressed: number;
  /** Per-trade Sharpe on the stressed series. Feeds the deflated-Sharpe trial distribution. */
  sharpeStressed: number | null;
}

interface ArmOutcome {
  id: string;
  label: string;
  hypothesis: string;
  usesOpenInterest: boolean;
  gridSize: number;
  eligibleSplitIndices: number[];
  /** Skipped because the conditioning input did not exist in that window. */
  unavailableSplitIndices: number[];
  /**
   * Skipped because the conditioning input was only partially covered.
   *
   * Kept separate from `unavailableSplitIndices` so the results table can report the real
   * reason. A partial split carries downgraded evidence, not absent evidence, and merging
   * the two would overstate how blind the conditioner was.
   */
  partialSplitIndices: number[];
  splits: ArmSplitOutcome[];
  /** Headline: concatenated out-of-sample over eligible splits only. */
  aggregateBase: TradeSummary;
  aggregateStressed: TradeSummary;
  splitsScored: number;
  splitsProfitableStressed: number;
  splitsWhereSearchChoseDoNothing: number;
  leaveOutBest: ReturnType<typeof leaveOutBestSplit>;
  verdict: {
    mission: { pass: boolean; failures: string[] };
    repository: { pass: boolean; failures: string[] };
  };
  fixedConfigurations: FixedConfigurationOutcome[];
  bestFixedConfiguration: FixedConfigurationOutcome | null;
  /**
   * The control scored over *this arm's* eligible splits only.
   *
   * Without this the comparison is invalid, and invalid in a direction that flatters the
   * conditioner's critics as easily as the conditioner: a conditioned arm that can only run
   * on splits 6-13 must be compared against the control on splits 6-13, not against the
   * control's fourteen-split total. The two windows are not interchangeable here, because
   * the eight conditionable splits happen to be a period in which the base family loses
   * money.
   */
  controlOnSameSplits: {
    splitIndices: number[];
    netReturnPctStressed: number;
    netReturnPctBase: number;
    trades: number;
    maxDrawdownPctStressed: number;
    /** Arm minus control on the same windows, at 2x costs. Positive means the addition helped. */
    deltaStressed: number;
    verdict: string;
  } | null;
  /**
   * Did adaptive per-split selection beat the best single fixed configuration? When it
   * does so by a wide margin the selection is more likely to be fitting noise than
   * tracking a regime, which is exactly how `tsm` presented.
   */
  selectionVersusBestFixed: {
    walkForwardNetPct: number;
    bestFixedNetPct: number | null;
    difference: number | null;
    note: string;
  };
  deflated: DeflatedSharpeResult | null;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function main(): void {
  const startedAt = Date.now();
  process.stdout.write('Loading verified development-window data (2021-01-01 .. 2023-12-31)...\n');
  const { universe, barCount, coverage } = loadDevelopmentUniverse();
  const symbols = universe.map((series) => series.symbol);
  const candles = universe[0].candles;
  process.stdout.write(
    `Loaded ${universe.length} symbols, ${barCount} four-hour bars each ` +
      `(${coverage[0].firstBar} .. ${coverage[0].lastBar})\n`,
  );

  const plan = buildWalkForwardSplits({ totalBars: barCount, ...SPLIT_GEOMETRY });
  assertSplitsAreCausal(plan.splits);
  process.stdout.write(
    `${plan.splits.length} rolling splits, ${outOfSampleBarCount(plan.splits)} out-of-sample bars, ` +
      `${plan.droppedTailBars} tail bars dropped\n`,
  );

  /* ---- availability, measured before anything is conditioned on ------------- */

  const rawOpenInterest: OpenInterestPoint[][] = symbols.map(
    (symbol) => loadDevelopmentOpenInterest(symbol).rows as OpenInterestPoint[],
  );
  const fieldAvailability = buildOpenInterestAvailability({
    symbols,
    candles,
    openInterestBySymbol: rawOpenInterest,
    splits: plan.splits,
  });

  // Indicator bundles, memoised per (symbol, atrBars). Two atrBars values over ten
  // symbols: twenty bundles serve all 168 parameter combinations.
  const indicatorCache = new Map<string, SqueezeIndicators>();
  const indicatorsFor = (series: SymbolSeries, atrBars: number): SqueezeIndicators => {
    const key = `${series.symbol}:${atrBars}`;
    let bundle = indicatorCache.get(key);
    if (bundle === undefined) {
      bundle = prepareSqueezeIndicators(series, atrBars);
      indicatorCache.set(key, bundle);
    }
    return bundle;
  };

  // Coverage of the series the conditioner actually reads. A raw field being complete
  // does not make its derived rank usable: the rank needs an atrBars lookback plus a
  // 180-bar ranking window on top, so it stays blind well after `oi` itself is complete.
  const derivedAvailability: SeriesAvailability[] = BASE_SQUEEZE_GRID.atrBars.map((atrBars) =>
    availabilityForAlignedSeries(
      `oiBuildupRank(atr${atrBars})`,
      universe.map((series) => [...indicatorsFor(series, atrBars).buildupRank]),
      symbols,
      candles,
      plan.splits,
    ),
  );

  // An arm that conditions on open interest is only eligible on a split where *every*
  // atrBars variant in its grid is usable, since the search may choose either.
  const conditionedEligible = plan.splits
    .filter((split) =>
      derivedAvailability.every(
        (entry) =>
          entry.splits.find((candidate) => candidate.splitIndex === split.index)?.status ===
          'available',
      ),
    )
    .map((split) => split.index);

  /**
   * Ordering over conditioning statuses, worst first, so a split can be summarised across
   * `atrBars` variants without collapsing the distinction between its failure modes.
   */
  const STATUS_RANK: Record<ConditioningStatus, number> = {
    unavailable: 0,
    partial: 1,
    available: 2,
  };

  /**
   * Effective conditioning status for one split, across every `atrBars` variant.
   *
   * The *worst* variant governs, because the in-sample search is free to choose either, so
   * a split is only as conditionable as the weakest input the search could land on.
   *
   * This is reported at three-valued granularity rather than collapsed to "eligible or
   * not", because `partial` and `unavailable` are different facts about the evidence and
   * flattening them would misreport this study. `unavailable` means the conditioner was
   * blind -- there is no result to have an opinion about. `partial` means it could act on
   * some bars, but its threshold was fitted on a window that was itself incompletely
   * covered, so the split carries real but downgraded evidence. Splits 0-4 here are the
   * first kind and split 5 is the second; printing all six as `unavailable` would claim
   * the conditioner was blind on a window where it was merely under-fitted.
   */
  const effectiveConditioning = (
    splitIndex: number,
  ): { status: ConditioningStatus; reason: string } => {
    let worst: { status: ConditioningStatus; reason: string } | null = null;
    for (const entry of derivedAvailability) {
      const split = entry.splits.find((candidate) => candidate.splitIndex === splitIndex);
      const status = split?.status ?? 'unavailable';
      const reason = `${entry.series}: ${split?.reason ?? 'series absent from the availability map'}`;
      if (worst === null || STATUS_RANK[status] < STATUS_RANK[worst.status]) {
        worst = { status, reason };
      }
    }
    return worst ?? { status: 'unavailable', reason: 'no availability map was built' };
  };

  process.stdout.write(
    `Open-interest conditioning is available on ${conditionedEligible.length}/${plan.splits.length} ` +
      `splits: [${conditionedEligible.join(', ')}]\n`,
  );
  for (const entry of derivedAvailability) {
    process.stdout.write(
      `  ${entry.series}: overall ${(entry.overallShare * 100).toFixed(1)}% covered, ` +
        `first full bar ${entry.firstFullyCoveredIso ?? 'never'}, ` +
        `unavailable splits [${entry.unavailableSplitIndices.join(', ')}]\n`,
    );
  }
  process.stdout.write('\n');

  const weight = universe.length > 0 ? 1 / universe.length : 1;
  const armOutcomes: ArmOutcome[] = [];
  /** Control trades kept per split so later arms can be compared on their own windows. */
  let controlSplitTrades: Map<number, { base: Trade[]; stressed: Trade[] }> | null = null;
  const trialLog: {
    armId: string;
    cellKey: string;
    params: Record<string, number>;
    isZeroEffect: boolean;
    trades: number;
    netReturnPctStressed: number;
    maxDrawdownPctStressed: number;
    sharpeStressed: number | null;
  }[] = [];

  for (const arm of ARMS) {
    const armStart = Date.now();
    const cells: GridCell[] = buildGrid(arm.thresholds, arm.trails);
    const eligibleSplitIndices = arm.usesOpenInterest
      ? conditionedEligible
      : plan.splits.map((split) => split.index);
    const eligible = new Set(eligibleSplitIndices);

    // Positions for every cell, over the whole development series. Not lookahead: every
    // indicator at bar i reads only bars <= i, so a test window legitimately warms up on
    // bars preceding it. What the split structure prevents is the other direction --
    // choosing the cell itself using test-window bars.
    const built = cells.map((cell) => {
      const bySymbol = new Map<string, Direction[]>();
      for (const series of universe) {
        bySymbol.set(
          series.symbol,
          positionsFromIndicators(indicatorsFor(series, cell.params.atrBars), cell.params),
        );
      }
      return { cell, bySymbol };
    });

    /* ---- run-time assertion: the control really is the published family ----- */
    if (arm.id === 'A-control') {
      const squeeze = STRATEGY_FAMILIES.find((family) => family.id === 'squeeze');
      if (!squeeze) {
        throw new Error('squeeze family not found; the control arm cannot be validated');
      }
      for (const { cell, bySymbol } of built) {
        const reference = squeeze.build(universe, {
          atrBars: cell.params.atrBars,
          compressionPercentile: cell.params.compressionPercentile,
          holdBars: cell.params.holdBars,
        });
        for (const series of universe) {
          const mine = bySymbol.get(series.symbol) ?? [];
          const theirs = reference.bySymbol.get(series.symbol) ?? [];
          if (mine.length !== theirs.length) {
            throw new Error(`control arm length mismatch on ${series.symbol} for ${cell.key}`);
          }
          for (let i = 0; i < mine.length; i += 1) {
            if (mine[i] !== theirs[i]) {
              throw new Error(
                `control arm diverges from the published squeeze family on ${series.symbol} ` +
                  `bar ${i} for ${cell.key}: ${mine[i]} vs ${theirs[i]}. The zero-effect cell ` +
                  'must reproduce the control exactly or no arm comparison is valid.',
              );
            }
          }
        }
      }
      process.stdout.write(
        '  control arm verified identical to the published squeeze family on all 8 cells x 10 symbols\n',
      );
    }

    /* ---- walk-forward: select on train, score on test ---------------------- */

    const splits: ArmSplitOutcome[] = [];
    const allBase: Trade[] = [];
    const allStressed: Trade[] = [];
    const perSplitNet: { splitIndex: number; netReturnPct: number }[] = [];
    /** Kept per split, not just concatenated, so the control can later be re-aggregated
     *  over an arbitrary subset of windows without re-running it. */
    const splitTrades = new Map<number, { base: Trade[]; stressed: Trade[] }>();

    for (const split of plan.splits) {
      const testFrom = new Date(candles[split.testStart].t).toISOString();
      const testTo = new Date(candles[split.testEnd - 1].t).toISOString();

      if (!eligible.has(split.index)) {
        // Report the status the coverage map actually measured, not a blanket
        // `unavailable`. A split the arm skipped because its input was only *partially*
        // covered is a different claim from one where the input did not exist.
        const { status, reason } = effectiveConditioning(split.index);
        splits.push({
          splitIndex: split.index,
          testFrom,
          testTo,
          conditioning: status,
          conditioningReason: reason,
          selectedCellKey: null,
          selectedParams: null,
          selectedIsZeroEffect: null,
          candidatesConsidered: cells.length,
          candidatesEligible: 0,
          inSampleNetPct: null,
          outOfSampleBaseNetPct: null,
          outOfSampleStressed: null,
        });
        continue;
      }

      let best: { index: number; summary: TradeSummary } | null = null;
      let eligibleCells = 0;

      for (let index = 0; index < built.length; index += 1) {
        const summary = summarizeTrades(
          tradesForRange(
            universe,
            built[index].bySymbol,
            weight,
            arm.id,
            split.index,
            { start: split.trainStart, end: split.trainEnd },
            BASE_COSTS,
          ),
        );
        if (summary.trades < MIN_TRAIN_TRADES) {
          continue;
        }
        eligibleCells += 1;
        if (best === null || selectionScore(summary) > selectionScore(best.summary)) {
          best = { index, summary };
        }
      }

      if (best === null) {
        splits.push({
          splitIndex: split.index,
          testFrom,
          testTo,
          conditioning: arm.usesOpenInterest ? 'partial' : 'not-required',
          conditioningReason:
            `no cell produced the ${MIN_TRAIN_TRADES}-trade in-sample minimum, so no parameter ` +
            'set was selectable for this window',
          selectedCellKey: null,
          selectedParams: null,
          selectedIsZeroEffect: null,
          candidatesConsidered: cells.length,
          candidatesEligible: 0,
          inSampleNetPct: null,
          outOfSampleBaseNetPct: null,
          outOfSampleStressed: null,
        });
        continue;
      }

      const chosen = built[best.index];
      const testRange = { start: split.testStart, end: split.testEnd };
      const baseTrades = tradesForRange(
        universe,
        chosen.bySymbol,
        weight,
        arm.id,
        split.index,
        testRange,
        BASE_COSTS,
      );
      const stressedTrades = tradesForRange(
        universe,
        chosen.bySymbol,
        weight,
        arm.id,
        split.index,
        testRange,
        STRESSED_COSTS,
      );
      allBase.push(...baseTrades);
      allStressed.push(...stressedTrades);
      splitTrades.set(split.index, { base: baseTrades, stressed: stressedTrades });

      const stressedSummary = summarizeTrades(stressedTrades);
      perSplitNet.push({ splitIndex: split.index, netReturnPct: stressedSummary.netReturnPct });

      splits.push({
        splitIndex: split.index,
        testFrom,
        testTo,
        conditioning: arm.usesOpenInterest ? 'available' : 'not-required',
        conditioningReason: arm.usesOpenInterest
          ? (derivedAvailability[0].splits.find(
              (candidate) => candidate.splitIndex === split.index,
            )?.reason ?? '')
          : 'this arm reads no open interest, so every split is scoreable',
        selectedCellKey: chosen.cell.key,
        selectedParams: { ...chosen.cell.params },
        selectedIsZeroEffect: isZeroEffect(chosen.cell.params),
        candidatesConsidered: cells.length,
        candidatesEligible: eligibleCells,
        inSampleNetPct: best.summary.netReturnPct,
        outOfSampleBaseNetPct: summarizeTrades(baseTrades).netReturnPct,
        outOfSampleStressed: stressedSummary,
      });
    }

    if (arm.id === 'A-control') {
      controlSplitTrades = splitTrades;
    }

    /* ---- every cell as a fixed configuration over the same windows --------- */

    const fixedConfigurations: FixedConfigurationOutcome[] = built.map(({ cell, bySymbol }) => {
      const stressed: Trade[] = [];
      for (const split of plan.splits) {
        if (!eligible.has(split.index)) {
          continue;
        }
        stressed.push(
          ...tradesForRange(
            universe,
            bySymbol,
            weight,
            arm.id,
            split.index,
            { start: split.testStart, end: split.testEnd },
            STRESSED_COSTS,
          ),
        );
      }
      const summary = summarizeTrades(stressed);
      const moments = returnMoments(orderedReturns(stressed));
      const outcome: FixedConfigurationOutcome = {
        key: cell.key,
        thresholdLabel: cell.thresholdLabel,
        trailLabel: cell.trailLabel,
        isZeroEffect: isZeroEffect(cell.params),
        trades: summary.trades,
        netReturnPctStressed: summary.netReturnPct,
        maxDrawdownPctStressed: summary.maxDrawdownPct,
        sharpeStressed: moments === null ? null : moments.sharpe,
      };
      trialLog.push({
        armId: arm.id,
        cellKey: cell.key,
        params: { ...cell.params },
        isZeroEffect: outcome.isZeroEffect,
        trades: outcome.trades,
        netReturnPctStressed: outcome.netReturnPctStressed,
        maxDrawdownPctStressed: outcome.maxDrawdownPctStressed,
        sharpeStressed: outcome.sharpeStressed,
      });
      return outcome;
    });

    const bestFixed = fixedConfigurations.reduce<FixedConfigurationOutcome | null>(
      (top, entry) =>
        entry.trades > 0 && (top === null || entry.netReturnPctStressed > top.netReturnPctStressed)
          ? entry
          : top,
      null,
    );

    const aggregateBase = summarizeTrades(allBase);
    const aggregateStressed = summarizeTrades(allStressed);
    const trialSharpes = fixedConfigurations
      .map((entry) => entry.sharpeStressed)
      .filter((value): value is number => value !== null);
    const deflated = deflatedSharpe(orderedReturns(allStressed), trialSharpes);

    /* ---- the control, restricted to the windows this arm could actually run on ---
     *
     * The conditioned arms score eight of fourteen splits. Comparing their eight-split
     * total against the control's fourteen-split total would not be a comparison of two
     * strategies; it would be a comparison of two different periods. Re-aggregating the
     * control's already-computed per-split trades over exactly the arm's scored windows
     * removes that confound, and costs nothing beyond a re-summarise.
     */

    const scoredSplitIndices = splits
      .filter((entry) => entry.outOfSampleStressed !== null)
      .map((entry) => entry.splitIndex);

    let controlOnSameSplits: ArmOutcome['controlOnSameSplits'] = null;
    if (arm.id !== 'A-control') {
      if (controlSplitTrades === null) {
        throw new Error(
          `${arm.id} was scored before the control arm, so no same-window comparison is possible. ` +
            'The control must run first; every conclusion in this study depends on it.',
        );
      }
      const controlBase: Trade[] = [];
      const controlStressed: Trade[] = [];
      const covered: number[] = [];
      for (const splitIndex of scoredSplitIndices) {
        const entry = controlSplitTrades.get(splitIndex);
        if (entry === undefined) {
          // The control failed to score a window this arm did score. Recorded by omission
          // from `covered` rather than treated as a zero contribution.
          continue;
        }
        covered.push(splitIndex);
        controlBase.push(...entry.base);
        controlStressed.push(...entry.stressed);
      }
      const controlBaseSummary = summarizeTrades(controlBase);
      const controlStressedSummary = summarizeTrades(controlStressed);
      const deltaStressed = aggregateStressed.netReturnPct - controlStressedSummary.netReturnPct;

      const direction =
        deltaStressed > 0
          ? `beat the unconditioned control by ${deltaStressed.toFixed(2)} points`
          : `lost to the unconditioned control by ${Math.abs(deltaStressed).toFixed(2)} points`;
      const fairnessCaveat =
        controlStressedSummary.netReturnPct < 0
          ? ' Read with the caveat that the control itself loses money over these windows ' +
            `(${controlStressedSummary.netReturnPct.toFixed(2)}%), so this addition is only ever ` +
            'evaluated inside a regime where the base family does not work. That weakens the ' +
            'evidence against it without reversing it: an addition that is meant to select the ' +
            'better subset of the same signals still has to lose less than taking all of them.'
          : '';
      controlOnSameSplits = {
        splitIndices: covered,
        netReturnPctStressed: controlStressedSummary.netReturnPct,
        netReturnPctBase: controlBaseSummary.netReturnPct,
        trades: controlStressedSummary.trades,
        maxDrawdownPctStressed: controlStressedSummary.maxDrawdownPct,
        deltaStressed,
        verdict:
          `Over splits [${covered.join(', ')}] at 2x costs, ${arm.id} returned ` +
          `${aggregateStressed.netReturnPct.toFixed(2)}% against the control's ` +
          `${controlStressedSummary.netReturnPct.toFixed(2)}%, so it ${direction}.` +
          fairnessCaveat,
      };
    }

    const walkForwardNet = aggregateStressed.netReturnPct;
    const difference = bestFixed === null ? null : walkForwardNet - bestFixed.netReturnPctStressed;

    armOutcomes.push({
      id: arm.id,
      label: arm.label,
      hypothesis: arm.hypothesis,
      usesOpenInterest: arm.usesOpenInterest,
      gridSize: cells.length,
      eligibleSplitIndices,
      // Skipped splits, separated by *why* they were skipped. Both are excluded from the
      // headline, but only one of them means the conditioner was actually blind.
      unavailableSplitIndices: plan.splits
        .map((split) => split.index)
        .filter(
          (index) => !eligible.has(index) && effectiveConditioning(index).status === 'unavailable',
        ),
      partialSplitIndices: plan.splits
        .map((split) => split.index)
        .filter(
          (index) => !eligible.has(index) && effectiveConditioning(index).status === 'partial',
        ),
      splits,
      aggregateBase,
      aggregateStressed,
      splitsScored: splits.filter((entry) => entry.outOfSampleStressed !== null).length,
      splitsProfitableStressed: splits.filter(
        (entry) => (entry.outOfSampleStressed?.netReturnPct ?? 0) > 0,
      ).length,
      splitsWhereSearchChoseDoNothing: splits.filter((entry) => entry.selectedIsZeroEffect === true)
        .length,
      leaveOutBest: leaveOutBestSplit(perSplitNet),
      verdict: {
        mission: evaluateGate(aggregateStressed, aggregateBase, GATES.mission),
        repository: evaluateGate(aggregateStressed, aggregateBase, GATES.repository),
      },
      fixedConfigurations,
      bestFixedConfiguration: bestFixed,
      controlOnSameSplits,
      selectionVersusBestFixed: {
        walkForwardNetPct: walkForwardNet,
        bestFixedNetPct: bestFixed?.netReturnPctStressed ?? null,
        difference,
        note:
          difference === null
            ? 'no fixed configuration produced trades on the eligible splits'
            : difference > 0
              ? 'Adaptive selection beat the best fixed configuration. Treat a large margin as a ' +
                'warning rather than a result: this is the shape tsm presented, where selection ' +
                'was fitting in-sample noise rather than tracking a regime.'
              : 'Adaptive selection did not beat the best fixed configuration, so the per-split ' +
                're-selection is adding cost rather than adaptivity.',
      },
      deflated,
    });

    const armResult = armOutcomes[armOutcomes.length - 1];
    process.stdout.write(
      `${arm.id.padEnd(17)} cells=${String(cells.length).padStart(3)} ` +
        `splits=${armResult.splitsScored}/${plan.splits.length} ` +
        `trades=${String(aggregateStressed.trades).padStart(5)} ` +
        `net(2x)=${aggregateStressed.netReturnPct.toFixed(2).padStart(9)}% ` +
        `exBest=${armResult.leaveOutBest.excludingBest.toFixed(2).padStart(9)}% ` +
        `pf=${(aggregateStressed.profitFactor ?? 0).toFixed(3).padStart(6)} ` +
        `maxDD=${aggregateStressed.maxDrawdownPct.toFixed(2).padStart(6)} ` +
        `vsCtl=${(armResult.controlOnSameSplits === null ? 'n/a' : `${armResult.controlOnSameSplits.deltaStressed >= 0 ? '+' : ''}${armResult.controlOnSameSplits.deltaStressed.toFixed(2)}`).padStart(7)} ` +
        `doNothing=${armResult.splitsWhereSearchChoseDoNothing}/${armResult.splitsScored} ` +
        `DSR=${armResult.deflated?.deflatedSharpe === null || armResult.deflated === null ? 'n/a' : armResult.deflated.deflatedSharpe.toFixed(3)} ` +
        `${armResult.verdict.mission.pass ? 'PASS' : 'FAIL'} ` +
        `(${((Date.now() - armStart) / 1000).toFixed(1)}s)\n`,
    );
  }

  /* ---- the two-numbers-per-split comparison table ------------------------- */

  const control = armOutcomes.find((arm) => arm.id === 'A-control');
  if (!control) {
    throw new Error('control arm missing; the comparison table cannot be built');
  }

  const perSplitComparison = plan.splits.map((split) => {
    const controlSplit = control.splits.find((entry) => entry.splitIndex === split.index);
    const row: Record<string, unknown> = {
      splitIndex: split.index,
      testFrom: controlSplit?.testFrom ?? null,
      testTo: controlSplit?.testTo ?? null,
      knownLuckyWindow: split.index === KNOWN_LUCKY_WINDOW.splitIndex ? KNOWN_LUCKY_WINDOW.note : null,
      controlNetPctStressed: controlSplit?.outOfSampleStressed?.netReturnPct ?? null,
      controlTrades: controlSplit?.outOfSampleStressed?.trades ?? null,
    };
    for (const arm of armOutcomes) {
      if (arm.id === 'A-control') {
        continue;
      }
      const entry = arm.splits.find((candidate) => candidate.splitIndex === split.index);
      row[arm.id] =
        entry === undefined
          ? null
          : entry.outOfSampleStressed === null
            ? { status: entry.conditioning, netPctStressed: null, reason: entry.conditioningReason }
            : {
                status: entry.conditioning,
                netPctStressed: entry.outOfSampleStressed.netReturnPct,
                trades: entry.outOfSampleStressed.trades,
                selectedCellKey: entry.selectedCellKey,
                selectedIsZeroEffect: entry.selectedIsZeroEffect,
              };
    }
    return row;
  });

  /* ---- payload ----------------------------------------------------------- */

  const payload = {
    schemaVersion: 1,
    study: 'liquidation-conditioned-squeeze',
    generatedAt: new Date().toISOString(),
    developmentWindow: {
      from: new Date(DEVELOPMENT_FROM_MS).toISOString(),
      toExclusive: new Date(SEALED_HOLDOUT_FROM_MS).toISOString(),
      barSizeHours: FAMILY_HOURS_PER_BAR,
      bars: barCount,
    },
    sealedHoldout: {
      fromInclusive: new Date(SEALED_HOLDOUT_FROM_MS).toISOString(),
      read: false,
      note:
        'Every series is loaded through loadDevelopment*, which filters to bars before ' +
        '2024-01-01 and then re-asserts the boundary. The sealed holdout was not opened, scored ' +
        'against, or tuned against by this run. Opening it remains a manual, one-time, ' +
        'human-gated decision and is deliberately not reachable from this script.',
    },
    dataProvenance: {
      directory: 'QA/profitability-structural-remediation/data',
      note:
        'Verified Binance Vision futures archives with a hash manifest. Single venue, so ' +
        'cross-venue open-interest consistency is NOT testable here and is not claimed. Funding ' +
        'and open-interest holes are carried as unavailable and cause a flat position; nothing ' +
        'is interpolated.',
      coverage,
    },
    costs: {
      perSideAssumptions: COST_ASSUMPTIONS,
      stressMultipliers: { fee: 2, spread: 2, slippage: 2, funding: 2 },
      note: 'Identical to runWalkForwardBaseline.mts so the arms are comparable to the baseline.',
    },
    splitPlan: {
      geometry: SPLIT_GEOMETRY,
      splits: plan.splits,
      droppedTailBars: plan.droppedTailBars,
      outOfSampleBars: outOfSampleBarCount(plan.splits),
    },
    selection: {
      objective: 'in-sample net return divided by max(1, in-sample max drawdown)',
      minTrainTrades: MIN_TRAIN_TRADES,
      costModelUsedForSelection: 'base',
      zeroEffectCellInEveryGrid: true,
      note:
        'One cell is chosen per arm per split, pooled across all ten symbols. Every grid contains ' +
        'the zero-effect cell, so the search is able to conclude that the addition does not help; ' +
        'selectedIsZeroEffect records when it did.',
    },
    conditioningAvailability: {
      note:
        'Status is three-valued and driven by the worse of the train and test window. A split ' +
        'marked unavailable is a window where the conditioner could not run; it is reported as a ' +
        'gap and excluded from the headline, never averaged in as a zero. Conditioned arms are ' +
        'scored only on splits where the DERIVED input is available, not merely the raw column.',
      derivedSeries: derivedAvailability,
      rawFields: fieldAvailability,
      conditionedEligibleSplits: conditionedEligible,
      knownLuckyWindow: KNOWN_LUCKY_WINDOW,
    },
    gates: GATES,
    metricConventions: {
      pnl: 'per-trade percentages summed, not compounded',
      drawdown:
        'peak-to-trough of the exit-time-ordered cumulative net P&L curve, in percentage points ' +
        'of a one-unit gross-exposure book',
      profitFactor: 'gross win / gross loss; Infinity when there were no losers, null when no trades',
      sharpe:
        'computed over the sequence of per-trade net returns, so it is per-trade and NOT ' +
        'annualised. Not comparable to annualised Sharpe ratios quoted in the literature.',
    },
    promotionPolicy:
      'This file reports results. It does not approve anything. No auto-accept or auto-reject ' +
      'logic exists in this script, and promotion of any arm remains a human decision taken on ' +
      'the evidence below.',
    headline: armOutcomes.map((arm) => ({
      id: arm.id,
      splitsScored: `${arm.splitsScored}/${plan.splits.length}`,
      netReturnPctStressed: arm.aggregateStressed.netReturnPct,
      excludingBestSplit: arm.leaveOutBest.excludingBest,
      controlOnSameSplitsNetPctStressed: arm.controlOnSameSplits?.netReturnPctStressed ?? null,
      deltaVersusControlOnSameSplits: arm.controlOnSameSplits?.deltaStressed ?? null,
      splitsWhereSearchChoseDoNothing: `${arm.splitsWhereSearchChoseDoNothing}/${arm.splitsScored}`,
      deflatedSharpe: arm.deflated?.deflatedSharpe ?? null,
      missionGate: arm.verdict.mission.pass ? 'PASS' : 'FAIL',
      verdict: arm.controlOnSameSplits?.verdict ?? 'This is the control; every other arm is measured against it.',
    })),
    perSplitComparison,
    arms: armOutcomes,
  };

  const body = JSON.stringify(payload, null, 2);
  const digest = createHash('sha256').update(body).digest('hex');
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    RESULTS_FILE,
    `${JSON.stringify({ ...payload, integrity: { contentSha256: digest } }, null, 2)}\n`,
    'utf8',
  );

  /* ---- research log ------------------------------------------------------ */

  const researchLog = {
    schemaVersion: 1,
    log: 'liquidation-conditioned-squeeze',
    generatedAt: new Date().toISOString(),
    purpose:
      'Record-keeping so that work is not re-derived: what was consulted, what was tried, what ' +
      'came out. Explicitly NOT an approval pipeline. Nothing here auto-accepts or auto-rejects a ' +
      'candidate, and the sealed holdout is not reachable from any automated path.',
    sources: [
      {
        id: 'cheng-2021-liquidation',
        citation:
          'Cheng, Deng, Wang & Yu, "Liquidation, Leverage and Optimal Margin in Bitcoin Futures ' +
          'Markets", arXiv 2102.04591 (q-fin.TR)',
        verification: 'VERIFIED via arXiv API',
        category: 'mechanism',
        usedFor:
          'Justifies the liquidation-flow conditioner and its long/short asymmetry. Magnitudes ' +
          '(3.51%/1.89% daily liquidation, ~60x leverage) are BitMEX-era and used directionally ' +
          'only; every threshold in this study is a dimensionless percentile fitted on training ' +
          'data.',
      },
      {
        id: 'giagkiozis-2024-openinterest',
        citation:
          'Giagkiozis & Said, Ledger Vol 9 (2024) 1-15, DOI 10.5195/ledger.2024.325',
        verification: 'VERIFIED',
        category: 'data quality',
        usedFor:
          'Motivated auditing the open-interest feed before conditioning on it. Audit verdict ' +
          'CONCERN-but-usable: notional cross-check median deviation 0.0038%, 13 zero-OI hours ' +
          'identical across all ten symbols (publisher outage, treated as missing). Cross-venue ' +
          'consistency untestable from a single-venue archive and not claimed.',
      },
      {
        id: 'chen-ma-nie-asymmetry',
        citation: 'Chen, Ma & Nie -- long/short asymmetry in crypto futures',
        verification:
          'UNVERIFIED. Zero arXiv API hits for the phrase and for the author; SSRN unreachable ' +
          'from this gateway. Carries no weight in this study. The asymmetry rests on Cheng et ' +
          'al. alone, and the reversed ordering is in the grid so the prediction can be rejected.',
        category: 'corroboration',
        usedFor: 'Nothing. Recorded so the claim is not silently inherited as established.',
      },
      {
        id: 'adaptivetrend-2602.11708v1',
        citation: 'AdaptiveTrend, arXiv 2602.11708v1',
        verification: 'RETRIEVED but NOT peer-reviewed',
        category: 'mechanism',
        usedFor:
          'The volatility-regime-scaled trailing stop, as a mechanism only. Its reported Sharpe ' +
          'and Calmar are not relied on: the paper is unreviewed and its sample overlaps this ' +
          "project's sealed 2024-2025 holdout.",
      },
      {
        id: 'bailey-lopezdeprado-2014-dsr',
        citation:
          'Bailey & Lopez de Prado, "The Deflated Sharpe Ratio", Journal of Portfolio ' +
          'Management 40(5), 2014',
        verification: 'VERIFIED',
        category: 'methodology',
        usedFor:
          'The selection-bias correction applied across every grid cell evaluated. Caveat on the ' +
          'record: grid cells are correlated, so the cross-trial variance understates an ' +
          'independent search and the correction is a floor on the penalty, not a ceiling.',
      },
      {
        id: 'baquero-zero-in-grid',
        citation: 'Baquero -- proposed standard: include a zero/no-effect setting in every grid',
        verification: 'ADOPTED as a procedural standard',
        category: 'methodology',
        usedFor:
          'Every arm here contains the zero-effect cell, and selectedIsZeroEffect records each ' +
          'split where the search chose it.',
      },
    ],
    trials: trialLog,
    trialCount: trialLog.length,
    note:
      'trials lists every parameter combination actually evaluated as a fixed configuration over ' +
      'the eligible out-of-sample windows -- winners and losers alike, which is what makes the ' +
      'deflated Sharpe meaningful.',
  };

  const logBody = JSON.stringify(researchLog, null, 2);
  const logDigest = createHash('sha256').update(logBody).digest('hex');
  writeFileSync(
    RESEARCH_LOG_FILE,
    `${JSON.stringify({ ...researchLog, integrity: { contentSha256: logDigest } }, null, 2)}\n`,
    'utf8',
  );

  /* ---- console summary --------------------------------------------------- */

  process.stdout.write('\nPer-split net return, 2x costs (control vs conditioned):\n');
  process.stdout.write(
    `${'split'.padEnd(6)}${'window'.padEnd(24)}${'control'.padStart(10)}` +
      armOutcomes
        .filter((arm) => arm.id !== 'A-control')
        .map((arm) => arm.id.replace(/^[A-E]-/, '').padStart(16))
        .join('') +
      '\n',
  );
  for (const row of perSplitComparison) {
    const control0 = row.controlNetPctStressed as number | null;
    let line =
      `${String(row.splitIndex).padEnd(6)}` +
      `${String(row.testFrom ?? '').slice(0, 10).padEnd(24)}` +
      `${(control0 === null ? 'n/a' : control0.toFixed(2)).padStart(10)}`;
    for (const arm of armOutcomes) {
      if (arm.id === 'A-control') {
        continue;
      }
      const cell = row[arm.id] as { status: string; netPctStressed: number | null } | null;
      const text =
        cell === null || cell.netPctStressed === null
          ? cell === null
            ? 'n/a'
            : cell.status
          : cell.netPctStressed.toFixed(2);
      line += text.padStart(16);
    }
    process.stdout.write(
      `${line}${row.knownLuckyWindow ? `   <- ${row.knownLuckyWindow}` : ''}\n`,
    );
  }

  process.stdout.write(
    '\nSame-window comparison (each arm against the control on the splits that arm could score):\n',
  );
  for (const arm of armOutcomes) {
    if (arm.controlOnSameSplits === null) {
      continue;
    }
    process.stdout.write(`  ${arm.id}: ${arm.controlOnSameSplits.verdict}\n`);
  }

  process.stdout.write(
    `\nResults: ${path.relative(REPO_ROOT, RESULTS_FILE)} (sha256 ${digest})\n` +
      `Research log: ${path.relative(REPO_ROOT, RESEARCH_LOG_FILE)} (sha256 ${logDigest}, ` +
      `${trialLog.length} trials)\n` +
      `Completed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`,
  );
}

main();
