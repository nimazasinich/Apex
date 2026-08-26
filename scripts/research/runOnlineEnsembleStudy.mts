/**
 * Candidate 2 -- a regret-bounded online ensemble allocator, evaluated as a REPLACEMENT for
 * per-split argmax selection across the whole strategy-family pool.
 *
 * WHY THIS STUDY EXISTS
 * ---------------------
 * The liquidation-squeeze study (candidate 1) was rejected, but its decisive finding was not
 * about squeeze's signal. It was that `selectionVersusBestFixed` is negative for every arm,
 * including the unconditioned control: +5.10% net at 2x cost stress against +41.42% for the
 * best fixed configuration chosen with hindsight over the same window. A ~36-point gap of
 * that shape says the per-split argmax selector is destroying value rather than adapting, so
 * conditioning any single family could not have fixed it. This study replaces the selector.
 *
 * WHAT IS BEING CLAIMED, AND WHAT IS NOT
 * -------------------------------------
 * The allocator is Hedge (exponentially weighted average forecaster / multiplicative
 * weights). Its regret bound, the citations behind it, the bounded-loss requirement and the
 * sleeping-expert construction all live in `lib/onlineAllocator.ts` and are not restated
 * here. What matters at this level:
 *
 *   - The guarantee is against the BEST FIXED EXPERT IN HINDSIGHT, minus a regret allowance.
 *     It is not a guarantee of profit and it cannot reach the hindsight-chosen +41.42%.
 *   - At T = 14 (one round per walk-forward split) the allowance covers most of the entire
 *     achievable loss range, so that arm's bound is close to vacuous. It is reported anyway,
 *     with its vacuity as a number, because the per-bar arm's better figure is only
 *     interpretable next to it.
 *   - Equal weighting is the arm that matters. If Hedge cannot beat a naive 1/N over the same
 *     awake set, the regret machinery bought nothing, and that is the headline.
 *
 * ARMS
 * ----
 * Allocator variants (8):    Hedge x {fixed eta, anytime eta} x {per-split, per-bar}
 *                                  x {pool with cash expert, pool without}
 * Controls:                  best-fixed-with-hindsight (an unreachable upper bound, not a
 *                            target), per-split argmax over the whole pool, per-family argmax
 *                            equal-weighted across families (the construction the published
 *                            baseline artifact used), equal weighting, follow-the-leader,
 *                            and a pure cash arm as the zero-effect cell.
 *
 * WHAT IS HELD FIXED FROM EVERY PRIOR STUDY IN THIS DIRECTORY
 * ----------------------------------------------------------
 * Same 14 rolling walk-forward splits and the same 180/1095/365/365 geometry. Same base and
 * 2x-stressed cost models. Same MIN_TRAIN_TRADES = 10 floor, applied here as the expert
 * ADMISSION rule: a configuration with fewer than ten trades on a split's train window is
 * asleep on that split, exactly as it would have been ineligible for argmax selection. Same
 * sealed-holdout guards: development loaders only, plus an explicit re-assertion over every
 * loaded candle series. No gate is relaxed anywhere; the two additions below are disclosures,
 * not relaxations.
 *
 * ACCOUNTING CONVENTIONS THAT ARE NEW HERE, AND THEIR DIRECTION OF ERROR
 * ---------------------------------------------------------------------
 *  1. P&L IS BOOKED AT TRADE EXIT. An expert's return for a round is the net P&L of the
 *     trades that closed in that round, under the same cost model every other study uses.
 *     This reuses `tradeMetrics` unchanged rather than reimplementing a per-bar mark-to-market
 *     with its own cost accounting, which would be a second, divergent cost model. The
 *     consequence is that the allocator's information about an expert arrives only when that
 *     expert closes a position, so the per-bar arm's reaction lags the position it is
 *     implicitly holding. That understates the per-bar arm, so it is conservative with
 *     respect to the thing being tested.
 *  2. PROFIT FACTOR AND DRAWDOWN ARE BAR-LEVEL, not trade-level. A continuously reweighted
 *     book has no round trips of its own, so the only definitions available are over the
 *     portfolio's per-bar return series. They are labelled `...BarLevel` wherever reported
 *     and must not be compared numerically against the trade-level profit factors in the
 *     baseline artifact.
 *  3. SLEEPING EXPERTS ARE EXCLUDED, NEVER ZERO-FILLED. A split where a family's required
 *     series is `unavailable` under `openInterestAvailability` logic is dropped from that
 *     expert's aggregate and from the simplex for that round. It is not scored as flat, and
 *     it is not averaged over.
 *
 * THE PRE-REGISTERED RETURN CAP
 * -----------------------------
 * The bound needs losses in [0,1], so returns are mapped through
 * l = clip(0.5 - r/(2R), 0, 1). R is declared in `PRE_REGISTERED_RETURN_CAP_PCT` below, from
 * a design constant that predates this study, and is deliberately identical at both
 * granularities so neither arm receives a tuned cap. Clipping frequency is reported per arm.
 *
 * TRIAL COUNTING FOR THE DEFLATED SHARPE RATIO
 * --------------------------------------------
 * Every parameter combination in every family's grid is its own trial, not one trial per
 * family name. The trial set handed to `deflatedSharpe` is therefore
 *   (total grid cells across all families)  +  (every allocator variant)
 * and the exact integer is emitted in `trialAccounting` so the correction is auditable rather
 * than asserted. A wider sensitivity count that also charges the six non-Hedge selection
 * procedures is emitted next to it. Trial Sharpes are computed on the SAME round basis as
 * the arm being deflated -- per-split Sharpes for per-split arms, per-bar for per-bar arms --
 * because a Sharpe per split and a Sharpe per bar are not the same quantity and mixing them
 * would corrupt the trial dispersion the correction depends on.
 *
 * Paper trading only. Every figure here is simulated P&L on development-window data.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  transactionCostModelFromPerSideAssumptions,
  type TransactionCostModel,
} from '../../src/services/transactionCosts';
import { deflatedSharpe, returnMoments, type DeflatedSharpeResult } from './lib/deflatedSharpe';
import {
  OnlineAllocator,
  type AllocatorRule,
  type EtaSchedule,
  type RegretReport,
} from './lib/onlineAllocator';
import {
  availabilityForAlignedSeries,
  statusFor,
  type ConditioningStatus,
  type SeriesAvailability,
} from './lib/openInterestAvailability';
import {
  assertNoHoldoutLeakage,
  DEVELOPMENT_FROM_MS,
  REPO_ROOT,
  SEALED_HOLDOUT_FROM_MS,
} from './lib/researchDataset';
import {
  FAMILY_HOURS_PER_BAR,
  STRATEGY_FAMILIES,
  type ParamValues,
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
 * Constants, all identical to the prior studies except where noted
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

/**
 * PRE-REGISTERED, declared before any allocator output existed.
 *
 * R = 15 percentage points, which is the mission gate's maximum-drawdown cap. The reasoning
 * is deliberately independent of any observed return: a round that loses more than the entire
 * drawdown budget is already a gate failure, so treating -15 points as the maximal loss and
 * +15 as the minimal one uses the study's own pre-existing definition of "as bad as it gets"
 * rather than a quantile of the results. The same value is used for the per-split and the
 * per-bar arms on purpose -- a granularity-specific cap would be a free parameter, and the
 * horizon-tuned learning rate already absorbs the difference in round length.
 *
 * If clipping turns out to bind on a large share of observations, that compresses extreme
 * outcomes and pushes Hedge towards equal weighting. That biases the study towards finding NO
 * advantage for Hedge, so it cannot manufacture a positive result; the share is reported per
 * arm either way.
 */
const PRE_REGISTERED_RETURN_CAP_PCT = 15;

const OUTPUT_DIR = path.join(REPO_ROOT, 'QA', 'walk-forward-baseline');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'online-ensemble-allocator-study.json');
const LOG_FILE = path.join(OUTPUT_DIR, 'online-ensemble-allocator-research-log.json');

/* ------------------------------------------------------------------ *
 * Small numeric helpers, on the additive percentage-point convention
 * ------------------------------------------------------------------ */

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

/**
 * Max drawdown of a cumulative curve built additively from per-round returns. Percentage
 * points are additive in this harness, so this is the same convention `tradeMetrics` uses,
 * differing only in that several trades closing on one bar are netted before the curve steps.
 */
function maxDrawdownPctFromSeries(perRound: readonly number[]): number {
  let cumulative = 0;
  let peak = 0;
  let worst = 0;
  for (const value of perRound) {
    cumulative += value;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = peak - cumulative;
    if (drawdown > worst) {
      worst = drawdown;
    }
  }
  return worst;
}

/** Bar-level profit factor. Not comparable to the trade-level figure in the baseline. */
function profitFactorFromSeries(perRound: readonly number[]): number | null {
  let gains = 0;
  let losses = 0;
  for (const value of perRound) {
    if (value > 0) {
      gains += value;
    } else if (value < 0) {
      losses -= value;
    }
  }
  if (gains === 0 && losses === 0) {
    return null;
  }
  if (losses === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return gains / losses;
}

/** The argmax objective the published baseline used, reused verbatim so the control is real. */
function selectionScore(summary: TradeSummary): number {
  return summary.netReturnPct / Math.max(1, summary.maxDrawdownPct);
}

function tradesForRange(
  universe: readonly SymbolSeries[],
  positions: ReadonlyMap<string, readonly Direction[]>,
  weight: number,
  familyId: string,
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
        familyId,
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

function paramKey(params: ParamValues): string {
  return Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join(',');
}

/* ------------------------------------------------------------------ *
 * Experts
 * ------------------------------------------------------------------ */

interface Expert {
  index: number;
  key: string;
  familyId: string;
  familyLabel: string;
  params: ParamValues;
  requires: readonly ('funding' | 'openInterest')[];
  legWeight: number;
  isCash: boolean;
  /** Net P&L booked at each out-of-sample bar. Index is the out-of-sample bar index. */
  perBarStressed: number[];
  perBarBase: number[];
  /** Number of trades that closed on each out-of-sample bar. */
  tradeCountPerBar: number[];
  perSplitStressed: number[];
  perSplitBase: number[];
  tradesBySplit: number[];
  trainTradesBySplit: number[];
  trainSelectionScoreBySplit: (number | null)[];
  availabilityBySplit: ConditioningStatus[];
  awakeBySplit: boolean[];
}

interface ArmDefinition {
  id: string;
  label: string;
  kind: 'hedge' | 'control';
  rule: AllocatorRule | 'cash' | 'bestFixed' | 'argmaxPool' | 'argmaxPerFamily';
  etaSchedule: EtaSchedule;
  granularity: 'perSplit' | 'perBar';
  pool: 'withCash' | 'withoutCash';
  note: string;
}

interface WeightContribution {
  expertKey: string;
  familyId: string;
  averageWeight: number;
}

interface ArmResult {
  id: string;
  label: string;
  kind: ArmDefinition['kind'];
  rule: ArmDefinition['rule'];
  etaSchedule: EtaSchedule | null;
  granularity: ArmDefinition['granularity'];
  pool: ArmDefinition['pool'];
  note: string;
  expertsInPool: number;
  rounds: number;
  netReturnPctStressed: number;
  netReturnPctBase: number;
  maxDrawdownPctStressedBarLevel: number;
  profitFactorStressedBarLevel: number | null;
  calmarStressed: number | null;
  perSplitStressed: number[];
  splitsScored: number;
  splitsProfitableStressed: number;
  medianSplitStressed: number;
  totalExcludingBestSplitStressed: number;
  underlyingTradesTouched: number;
  effectiveTrades: number;
  averageAwakeExperts: number;
  topWeightContributions: WeightContribution[];
  weightByFamily: Record<string, number>;
  regret: RegretReport | null;
  gateMission: { pass: boolean; failures: string[] };
  gateRepository: { pass: boolean; failures: string[] };
  selectionVersusBestFixed: {
    armNetReturnPctStressed: number;
    bestFixedNetReturnPctStressed: number;
    differencePct: number;
    note: string;
  } | null;
  deflated: DeflatedSharpeResult | null;
  deflatedSensitivity: DeflatedSharpeResult | null;
  verdict: string;
}

interface ArmRun {
  perBarStressed: number[];
  perBarBase: number[];
  perSplitStressed: number[];
  perSplitBase: number[];
  rounds: number;
  underlyingTradesTouched: number;
  effectiveTrades: number;
  averageAwakeExperts: number;
  weightSumByExpert: number[];
  weightRounds: number;
  regret: RegretReport | null;
}

/* ------------------------------------------------------------------ *
 * Gate evaluation, bar-level and labelled as such
 * ------------------------------------------------------------------ */

function evaluateGate(
  result: {
    underlyingTradesTouched: number;
    profitFactorStressedBarLevel: number | null;
    netReturnPctStressed: number;
    netReturnPctBase: number;
    maxDrawdownPctStressedBarLevel: number;
  },
  gate: { minTrades: number; minProfitFactor: number; maxDrawdownPct: number },
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  if (result.underlyingTradesTouched < gate.minTrades) {
    failures.push(
      `only ${result.underlyingTradesTouched} underlying out-of-sample trades received weight, needs ${gate.minTrades}`,
    );
  }
  const profitFactor = result.profitFactorStressedBarLevel;
  if (profitFactor === null || !(profitFactor > gate.minProfitFactor)) {
    failures.push(
      `stressed bar-level profit factor ${profitFactor === null ? 'undefined' : profitFactor.toFixed(4)} is not above ${gate.minProfitFactor}`,
    );
  }
  if (!(result.netReturnPctStressed > 0)) {
    failures.push(`stressed net return ${result.netReturnPctStressed.toFixed(2)}% is not positive`);
  }
  if (!(result.netReturnPctBase > 0)) {
    failures.push(`base-cost net return ${result.netReturnPctBase.toFixed(2)}% is not positive`);
  }
  if (result.maxDrawdownPctStressedBarLevel > gate.maxDrawdownPct) {
    failures.push(
      `stressed bar-level max drawdown ${result.maxDrawdownPctStressedBarLevel.toFixed(2)} points exceeds the ${gate.maxDrawdownPct}-point cap`,
    );
  }
  return { pass: failures.length === 0, failures };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function main(): void {
  const startedAt = Date.now();

  /* ---- data, splits, guards -------------------------------------- */

  const { universe, barCount, coverage } = loadDevelopmentUniverse();
  for (const series of universe) {
    // The loaders already restrict to the development window; re-asserting here means a
    // regression in the loader surfaces as a thrown error in this study too, not silently.
    assertNoHoldoutLeakage(series.candles, `${series.symbol} four-hour candles`);
  }
  const referenceCandles = universe[0].candles;

  const plan = buildWalkForwardSplits({ totalBars: barCount, ...SPLIT_GEOMETRY });
  assertSplitsAreCausal(plan.splits);
  const splits: readonly WalkForwardSplit[] = plan.splits;
  const splitCount = splits.length;
  const totalOosBars = outOfSampleBarCount(splits);

  /* ---- out-of-sample bar index <-> global bar index --------------- */

  const oosGlobalBar: number[] = [];
  const oosSplitOfBar: number[] = [];
  const oosIndexOfGlobalBar = new Array<number>(barCount).fill(-1);
  for (const split of splits) {
    for (let bar = split.testStart; bar < split.testEnd; bar += 1) {
      oosIndexOfGlobalBar[bar] = oosGlobalBar.length;
      oosSplitOfBar.push(split.index);
      oosGlobalBar.push(bar);
    }
  }
  if (oosGlobalBar.length !== totalOosBars) {
    throw new Error(
      `out-of-sample bar mapping produced ${oosGlobalBar.length} bars, expected ${totalOosBars}`,
    );
  }

  /* ---- availability of the conditioning series, per split --------- */

  const symbols = universe.map((series) => series.symbol);
  const availability: SeriesAvailability[] = [
    availabilityForAlignedSeries(
      'oi',
      universe.map((series) => series.openInterest),
      symbols,
      referenceCandles,
      splits,
    ),
    availabilityForAlignedSeries(
      'fundingRate',
      universe.map((series) => series.fundingRate),
      symbols,
      referenceCandles,
      splits,
    ),
  ];

  function requiredSeriesStatus(
    requires: readonly ('funding' | 'openInterest')[],
    splitIndex: number,
  ): ConditioningStatus {
    let worst: ConditioningStatus = 'available';
    for (const requirement of requires) {
      const series = requirement === 'openInterest' ? 'oi' : 'fundingRate';
      const status = statusFor(availability, series, splitIndex);
      if (status === 'unavailable') {
        return 'unavailable';
      }
      if (status === 'partial') {
        worst = 'partial';
      }
    }
    return worst;
  }

  /* ---- build every grid cell as an expert ------------------------- */

  console.log(
    `universe ${universe.length} symbols, ${barCount} four-hour bars, ${splitCount} splits, ` +
      `${totalOosBars} out-of-sample bars`,
  );

  const experts: Expert[] = [];
  const gridCellsByFamily: Record<string, number> = {};
  let partialSplitExpertPairs = 0;
  let unavailableSplitExpertPairs = 0;

  for (const family of STRATEGY_FAMILIES) {
    gridCellsByFamily[family.id] = family.grid.length;
    for (const params of family.grid) {
      // Positions are computed over the whole series and then sliced by range. That is not
      // lookahead: every indicator in `lib/indicators.ts` at bar i reads only bars <= i.
      const built = family.build(universe, params);
      const expert: Expert = {
        index: experts.length,
        key: `${family.id}#${paramKey(params)}`,
        familyId: family.id,
        familyLabel: family.label,
        params: { ...params },
        requires: family.requires,
        legWeight: built.weight,
        isCash: false,
        perBarStressed: new Array<number>(totalOosBars).fill(0),
        perBarBase: new Array<number>(totalOosBars).fill(0),
        tradeCountPerBar: new Array<number>(totalOosBars).fill(0),
        perSplitStressed: new Array<number>(splitCount).fill(0),
        perSplitBase: new Array<number>(splitCount).fill(0),
        tradesBySplit: new Array<number>(splitCount).fill(0),
        trainTradesBySplit: new Array<number>(splitCount).fill(0),
        trainSelectionScoreBySplit: new Array<number | null>(splitCount).fill(null),
        availabilityBySplit: new Array<ConditioningStatus>(splitCount).fill('available'),
        awakeBySplit: new Array<boolean>(splitCount).fill(false),
      };

      for (const split of splits) {
        const status = requiredSeriesStatus(family.requires, split.index);
        expert.availabilityBySplit[split.index] = status;

        // The MIN_TRAIN_TRADES floor, in its original form. Scored at BASE costs, because
        // runWalkForwardBaseline.mts declares `costModelUsedForSelection: 'base'` and scores
        // its train window with BASE_COSTS. Selecting on stressed costs here would silently
        // make the argmax control a different mechanism from the published one, which is the
        // one thing the control must not be.
        const trainTrades = tradesForRange(
          universe,
          built.bySymbol,
          built.weight,
          family.id,
          split.index,
          { start: split.trainStart, end: split.trainEnd },
          BASE_COSTS,
        );
        const trainSummary = summarizeTrades(trainTrades);
        expert.trainTradesBySplit[split.index] = trainSummary.trades;
        expert.trainSelectionScoreBySplit[split.index] =
          trainSummary.trades >= MIN_TRAIN_TRADES ? selectionScore(trainSummary) : null;

        const admitted = trainSummary.trades >= MIN_TRAIN_TRADES;
        // Only `unavailable` puts an expert to sleep. That is the literal rule this research
        // program requires -- a split whose required series is unavailable is excluded rather
        // than zero-filled -- and it is also what keeps the argmax controls identical to the
        // published baseline, which applied no availability filter to eligibility at all.
        // Extending the exclusion to `partial` would be stricter than the rule and would make
        // the control a different mechanism, so `partial` stays awake and is counted instead.
        const awake = admitted && status !== 'unavailable';
        if (status === 'partial') {
          partialSplitExpertPairs += 1;
        }
        if (status === 'unavailable') {
          unavailableSplitExpertPairs += 1;
        }
        expert.awakeBySplit[split.index] = awake;
        if (!awake) {
          // Excluded, not zero-filled: no return series is written for this split at all.
          continue;
        }

        const range = { start: split.testStart, end: split.testEnd };
        const stressed = tradesForRange(
          universe,
          built.bySymbol,
          built.weight,
          family.id,
          split.index,
          range,
          STRESSED_COSTS,
        );
        const base = tradesForRange(
          universe,
          built.bySymbol,
          built.weight,
          family.id,
          split.index,
          range,
          BASE_COSTS,
        );

        for (const trade of stressed) {
          const oosIndex = oosIndexOfGlobalBar[trade.exitIndex];
          if (oosIndex < 0) {
            throw new Error(
              `${expert.key}: trade exited at bar ${trade.exitIndex}, outside every test window`,
            );
          }
          expert.perBarStressed[oosIndex] += trade.netPnlPct;
          expert.tradeCountPerBar[oosIndex] += 1;
          expert.perSplitStressed[split.index] += trade.netPnlPct;
        }
        for (const trade of base) {
          const oosIndex = oosIndexOfGlobalBar[trade.exitIndex];
          expert.perBarBase[oosIndex] += trade.netPnlPct;
          expert.perSplitBase[split.index] += trade.netPnlPct;
        }
        expert.tradesBySplit[split.index] = stressed.length;
      }

      experts.push(expert);
    }
  }

  const gridCellCount = experts.length;
  console.log(`experts built: ${gridCellCount} grid cells across ${STRATEGY_FAMILIES.length} families`);

  /* ---- the cash expert, appended so the pool with and without it share indices --- */

  const cashExpert: Expert = {
    index: experts.length,
    key: 'cash#flat',
    familyId: 'cash',
    familyLabel: 'Cash (zero-effect expert)',
    params: {},
    requires: [],
    legWeight: 0,
    isCash: true,
    perBarStressed: new Array<number>(totalOosBars).fill(0),
    perBarBase: new Array<number>(totalOosBars).fill(0),
    tradeCountPerBar: new Array<number>(totalOosBars).fill(0),
    perSplitStressed: new Array<number>(splitCount).fill(0),
    perSplitBase: new Array<number>(splitCount).fill(0),
    tradesBySplit: new Array<number>(splitCount).fill(0),
    trainTradesBySplit: new Array<number>(splitCount).fill(0),
    trainSelectionScoreBySplit: new Array<number | null>(splitCount).fill(0),
    availabilityBySplit: new Array<ConditioningStatus>(splitCount).fill('available'),
    awakeBySplit: new Array<boolean>(splitCount).fill(true),
  };
  const poolWithCash: Expert[] = [...experts, cashExpert];
  const poolWithoutCash: Expert[] = experts;

  function poolFor(pool: ArmDefinition['pool']): Expert[] {
    return pool === 'withCash' ? poolWithCash : poolWithoutCash;
  }

  /* ---- run one arm ------------------------------------------------ */

  function runAllocatorArm(definition: ArmDefinition): ArmRun {
    const pool = poolFor(definition.pool);
    const expertCount = pool.length;
    const rule = definition.rule as AllocatorRule;
    const horizon = definition.granularity === 'perSplit' ? splitCount : totalOosBars;

    const allocator = new OnlineAllocator({
      expertCount,
      returnCapPct: PRE_REGISTERED_RETURN_CAP_PCT,
      etaSchedule: definition.etaSchedule,
      horizon,
      rule,
    });

    const perBarStressed = new Array<number>(totalOosBars).fill(0);
    const perBarBase = new Array<number>(totalOosBars).fill(0);
    const perSplitStressed = new Array<number>(splitCount).fill(0);
    const perSplitBase = new Array<number>(splitCount).fill(0);
    const weightSumByExpert = new Array<number>(expertCount).fill(0);
    let weightRounds = 0;
    let awakeTotal = 0;
    let underlyingTradesTouched = 0;
    let effectiveTrades = 0;

    const applyBar = (oosIndex: number, weights: readonly number[]): void => {
      for (let i = 0; i < expertCount; i += 1) {
        const weight = weights[i];
        if (weight === 0) {
          continue;
        }
        const expert = pool[i];
        perBarStressed[oosIndex] += weight * expert.perBarStressed[oosIndex];
        perBarBase[oosIndex] += weight * expert.perBarBase[oosIndex];
        const trades = expert.tradeCountPerBar[oosIndex];
        if (trades > 0 && weight > 0) {
          underlyingTradesTouched += trades;
          effectiveTrades += weight * trades;
        }
      }
    };

    if (definition.granularity === 'perSplit') {
      for (const split of splits) {
        const awake = pool.map((expert) => expert.awakeBySplit[split.index]);
        const weights = allocator.weightsFor(awake);
        weightRounds += 1;
        awakeTotal += awake.filter(Boolean).length;
        for (let i = 0; i < expertCount; i += 1) {
          weightSumByExpert[i] += weights[i];
        }
        for (let bar = split.testStart; bar < split.testEnd; bar += 1) {
          applyBar(oosIndexOfGlobalBar[bar], weights);
        }
        allocator.observe(
          pool.map((expert) =>
            expert.awakeBySplit[split.index] ? expert.perSplitStressed[split.index] : undefined,
          ),
        );
      }
    } else {
      for (let oosIndex = 0; oosIndex < totalOosBars; oosIndex += 1) {
        const splitIndex = oosSplitOfBar[oosIndex];
        const awake = pool.map((expert) => expert.awakeBySplit[splitIndex]);
        const weights = allocator.weightsFor(awake);
        weightRounds += 1;
        awakeTotal += awake.filter(Boolean).length;
        for (let i = 0; i < expertCount; i += 1) {
          weightSumByExpert[i] += weights[i];
        }
        applyBar(oosIndex, weights);
        allocator.observe(
          pool.map((expert, i) => (awake[i] ? expert.perBarStressed[oosIndex] : undefined)),
        );
      }
    }

    for (let oosIndex = 0; oosIndex < totalOosBars; oosIndex += 1) {
      const splitIndex = oosSplitOfBar[oosIndex];
      perSplitStressed[splitIndex] += perBarStressed[oosIndex];
      perSplitBase[splitIndex] += perBarBase[oosIndex];
    }

    return {
      perBarStressed,
      perBarBase,
      perSplitStressed,
      perSplitBase,
      rounds: allocator.rounds,
      underlyingTradesTouched,
      effectiveTrades,
      averageAwakeExperts: weightRounds === 0 ? 0 : awakeTotal / weightRounds,
      weightSumByExpert,
      weightRounds,
      regret: allocator.regretReport(),
    };
  }

  /**
   * A control expressed as a fixed weight matrix over splits, so it goes through exactly the
   * same booking path as the allocator arms and no accounting difference can creep in.
   */
  function runFixedWeightArm(
    definition: ArmDefinition,
    weightsBySplit: readonly (readonly number[])[],
  ): ArmRun {
    const pool = poolFor(definition.pool);
    const expertCount = pool.length;
    const perBarStressed = new Array<number>(totalOosBars).fill(0);
    const perBarBase = new Array<number>(totalOosBars).fill(0);
    const perSplitStressed = new Array<number>(splitCount).fill(0);
    const perSplitBase = new Array<number>(splitCount).fill(0);
    const weightSumByExpert = new Array<number>(expertCount).fill(0);
    let underlyingTradesTouched = 0;
    let effectiveTrades = 0;
    let awakeTotal = 0;

    for (const split of splits) {
      const weights = weightsBySplit[split.index];
      for (let i = 0; i < expertCount; i += 1) {
        weightSumByExpert[i] += weights[i];
        if (weights[i] > 0) {
          awakeTotal += 1;
        }
      }
      for (let bar = split.testStart; bar < split.testEnd; bar += 1) {
        const oosIndex = oosIndexOfGlobalBar[bar];
        for (let i = 0; i < expertCount; i += 1) {
          const weight = weights[i];
          if (weight === 0) {
            continue;
          }
          const expert = pool[i];
          perBarStressed[oosIndex] += weight * expert.perBarStressed[oosIndex];
          perBarBase[oosIndex] += weight * expert.perBarBase[oosIndex];
          const trades = expert.tradeCountPerBar[oosIndex];
          if (trades > 0) {
            underlyingTradesTouched += trades;
            effectiveTrades += weight * trades;
          }
        }
      }
    }

    for (let oosIndex = 0; oosIndex < totalOosBars; oosIndex += 1) {
      const splitIndex = oosSplitOfBar[oosIndex];
      perSplitStressed[splitIndex] += perBarStressed[oosIndex];
      perSplitBase[splitIndex] += perBarBase[oosIndex];
    }

    return {
      perBarStressed,
      perBarBase,
      perSplitStressed,
      perSplitBase,
      rounds: splitCount,
      underlyingTradesTouched,
      effectiveTrades,
      averageAwakeExperts: awakeTotal / splitCount,
      weightSumByExpert,
      weightRounds: splitCount,
      regret: null,
    };
  }

  /* ---- control weight matrices ----------------------------------- */

  function zeroWeights(expertCount: number): number[][] {
    return Array.from({ length: splitCount }, () => new Array<number>(expertCount).fill(0));
  }

  /** Best single grid cell by total stressed out-of-sample return, chosen with hindsight. */
  const bestFixedCandidates = experts
    .map((expert) => ({
      expert,
      total: sum(
        splits
          .filter((split) => expert.awakeBySplit[split.index])
          .map((split) => expert.perSplitStressed[split.index]),
      ),
      awakeSplits: expert.awakeBySplit.filter(Boolean).length,
      trades: sum(expert.tradesBySplit),
    }))
    .filter((entry) => entry.trades > 0);
  const bestFixed = bestFixedCandidates.reduce<(typeof bestFixedCandidates)[number] | null>(
    (top, entry) => (top === null || entry.total > top.total ? entry : top),
    null,
  );

  const bestFixedWeights = zeroWeights(poolWithoutCash.length);
  if (bestFixed !== null) {
    for (const split of splits) {
      if (bestFixed.expert.awakeBySplit[split.index]) {
        bestFixedWeights[split.index][bestFixed.expert.index] = 1;
      }
    }
  }

  /** Per-split argmax over the WHOLE pool -- the pool-level analogue of the old selector. */
  const argmaxPoolWeights = zeroWeights(poolWithoutCash.length);
  const argmaxPoolPicks: (string | null)[] = [];
  for (const split of splits) {
    let best: Expert | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const expert of experts) {
      if (!expert.awakeBySplit[split.index]) {
        continue;
      }
      const score = expert.trainSelectionScoreBySplit[split.index];
      if (score === null) {
        continue;
      }
      if (best === null || score > bestScore) {
        best = expert;
        bestScore = score;
      }
    }
    if (best !== null) {
      argmaxPoolWeights[split.index][best.index] = 1;
    }
    argmaxPoolPicks.push(best === null ? null : best.key);
  }

  /** Per-family argmax, equal-weighted across the families that produced a pick. */
  const argmaxPerFamilyWeights = zeroWeights(poolWithoutCash.length);
  const argmaxPerFamilyPicks: Record<string, (string | null)[]> = {};
  for (const family of STRATEGY_FAMILIES) {
    argmaxPerFamilyPicks[family.id] = [];
  }
  for (const split of splits) {
    const picks: Expert[] = [];
    for (const family of STRATEGY_FAMILIES) {
      let best: Expert | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const expert of experts) {
        if (expert.familyId !== family.id || !expert.awakeBySplit[split.index]) {
          continue;
        }
        const score = expert.trainSelectionScoreBySplit[split.index];
        if (score === null) {
          continue;
        }
        if (best === null || score > bestScore) {
          best = expert;
          bestScore = score;
        }
      }
      argmaxPerFamilyPicks[family.id].push(best === null ? null : best.key);
      if (best !== null) {
        picks.push(best);
      }
    }
    if (picks.length > 0) {
      const share = 1 / picks.length;
      for (const pick of picks) {
        argmaxPerFamilyWeights[split.index][pick.index] = share;
      }
    }
  }

  /* ---- cross-check against the published walk-forward baseline ---- */

  /**
   * Every family's per-split-argmax aggregate at FULL weight, which is exactly the quantity
   * runWalkForwardBaseline.mts reports as `families[i].aggregateStressed.netReturnPct`. If this
   * harness re-derives those numbers, then its split geometry, cost models, selection rule and
   * P&L booking all agree with the published artifact, and the ensemble arms above are measured
   * on the same ruler. Any family that does not reproduce is a disclosure, not a rounding note.
   */
  const expertByKey = new Map(experts.map((expert) => [expert.key, expert]));
  const perFamilyArgmaxAggregate = STRATEGY_FAMILIES.map((family) => {
    const picks = argmaxPerFamilyPicks[family.id];
    let netReturnPctStressed = 0;
    let netReturnPctBase = 0;
    let splitsWithPick = 0;
    let splitsProfitableStressed = 0;
    for (const split of splits) {
      const key = picks[split.index];
      if (key === null) {
        continue;
      }
      const expert = expertByKey.get(key);
      if (expert === undefined) {
        throw new Error(`per-family pick ${key} does not resolve to an expert`);
      }
      splitsWithPick += 1;
      netReturnPctStressed += expert.perSplitStressed[split.index];
      netReturnPctBase += expert.perSplitBase[split.index];
      if (expert.perSplitStressed[split.index] > 0) {
        splitsProfitableStressed += 1;
      }
    }
    return {
      familyId: family.id,
      gridCells: family.grid.length,
      splitsWithPick,
      splitsProfitableStressed,
      netReturnPctStressed,
      netReturnPctBase,
    };
  });

  const baselinePath = path.join(OUTPUT_DIR, 'walk-forward-baseline-results.json');
  /**
   * WHY THE COMPARISON IS RESTRICTED TO AWAKE SPLITS.
   *
   * The published baseline applied no availability filter to eligibility: on a split where a
   * family's required conditioning series is `unavailable` it still selected a configuration and
   * booked its return. This study excludes those splits, because the no-fabrication rule this
   * research program runs under requires an unavailable split to be dropped rather than
   * zero-filled or averaged over. A whole-history comparison would therefore differ for exactly
   * the families that have unavailable splits, and that difference would say nothing about
   * whether the machinery agrees -- it would only restate a design decision.
   *
   * So both figures are reported. `reproduces` is set from the awake-restricted comparison, and
   * the excluded split indices plus their published contribution are named explicitly, so the
   * whole-history gap is always fully accounted for rather than left looking like drift.
   */
  let publishedComparison:
    | {
        familyId: string;
        thisStudyNetReturnPctStressed: number;
        publishedNetReturnPctStressed: number | null;
        publishedNetReturnPctStressedOnAwakeSplits: number | null;
        differencePctWholeHistory: number | null;
        differencePctOnAwakeSplits: number | null;
        splitsExcludedForUnavailability: number[];
        publishedContributionOfExcludedSplitsPct: number | null;
        identicalPicksOnAwakeSplits: number;
        awakeSplitsCompared: number;
        reproduces: boolean | null;
      }[]
    | null = null;
  if (existsSync(baselinePath)) {
    const published = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      families?: {
        id: string;
        aggregateStressed?: { netReturnPct?: number };
        splits?: {
          splitIndex?: number;
          selectedParams?: ParamValues | null;
          outOfSampleStressed?: { netReturnPct?: number };
        }[];
      }[];
    };
    publishedComparison = perFamilyArgmaxAggregate.map((mine) => {
      const theirs = published.families?.find((entry) => entry.id === mine.familyId);
      const theirNet = theirs?.aggregateStressed?.netReturnPct;
      const picks = argmaxPerFamilyPicks[mine.familyId];
      const excludedSplits: number[] = [];
      let awakeNet = 0;
      let excludedNet = 0;
      let identicalPicks = 0;
      let awakeCompared = 0;
      let anyPerSplitData = false;
      for (const entry of theirs?.splits ?? []) {
        const index = entry.splitIndex;
        const net = entry.outOfSampleStressed?.netReturnPct;
        if (typeof index !== 'number' || typeof net !== 'number') {
          continue;
        }
        anyPerSplitData = true;
        const publishedPicked = entry.selectedParams !== null && entry.selectedParams !== undefined;
        const myKey = picks === undefined ? null : picks[index];
        if (myKey === null || myKey === undefined) {
          // A split this study dropped. Only count it as excluded where the published run
          // actually booked something, so splits nobody could trade are not miscounted.
          if (publishedPicked) {
            excludedSplits.push(index);
            excludedNet += net;
          }
          continue;
        }
        awakeNet += net;
        awakeCompared += 1;
        if (publishedPicked && myKey === `${mine.familyId}#${paramKey(entry.selectedParams as ParamValues)}`) {
          identicalPicks += 1;
        }
      }
      const awakeDifference = anyPerSplitData ? mine.netReturnPctStressed - awakeNet : null;
      return {
        familyId: mine.familyId,
        thisStudyNetReturnPctStressed: mine.netReturnPctStressed,
        publishedNetReturnPctStressed: typeof theirNet === 'number' ? theirNet : null,
        publishedNetReturnPctStressedOnAwakeSplits: anyPerSplitData ? awakeNet : null,
        differencePctWholeHistory:
          typeof theirNet === 'number' ? mine.netReturnPctStressed - theirNet : null,
        differencePctOnAwakeSplits: awakeDifference,
        splitsExcludedForUnavailability: excludedSplits,
        publishedContributionOfExcludedSplitsPct: anyPerSplitData ? excludedNet : null,
        identicalPicksOnAwakeSplits: identicalPicks,
        awakeSplitsCompared: awakeCompared,
        reproduces: awakeDifference === null ? null : Math.abs(awakeDifference) < 1e-6,
      };
    });
  }

  /* ---- arm definitions ------------------------------------------- */

  const hedgeArms: ArmDefinition[] = [];
  for (const etaSchedule of ['fixed', 'anytime'] as const) {
    for (const granularity of ['perSplit', 'perBar'] as const) {
      for (const pool of ['withoutCash', 'withCash'] as const) {
        hedgeArms.push({
          id: `hedge-${etaSchedule}-${granularity === 'perSplit' ? 'split' : 'bar'}-${pool === 'withCash' ? 'cash' : 'nocash'}`,
          label: `Hedge, ${etaSchedule} eta, ${granularity === 'perSplit' ? 'one round per split (T=' + splitCount + ')' : 'one round per out-of-sample bar (T=' + totalOosBars + ')'}, pool ${pool === 'withCash' ? 'including' : 'excluding'} the cash expert`,
          kind: 'hedge',
          rule: 'hedge',
          etaSchedule,
          granularity,
          pool,
          note:
            granularity === 'perSplit'
              ? 'The regret allowance at this horizon covers most of the achievable loss range; see boundShareOfLossRange.'
              : 'The horizon that makes the regret bound informative, at the cost of reacting only when trades close.',
        });
      }
    }
  }

  const controlArms: ArmDefinition[] = [
    {
      id: 'control-equal-weight-nocash',
      label: 'Equal weighting over the awake set, pool excluding cash',
      kind: 'control',
      rule: 'equalWeight',
      etaSchedule: 'fixed',
      granularity: 'perSplit',
      pool: 'withoutCash',
      note: 'The arm that decides whether the regret machinery bought anything. Granularity-invariant, because the awake set is defined per split.',
    },
    {
      id: 'control-equal-weight-cash',
      label: 'Equal weighting over the awake set, pool including cash',
      kind: 'control',
      rule: 'equalWeight',
      etaSchedule: 'fixed',
      granularity: 'perSplit',
      pool: 'withCash',
      note: 'Equal weighting with one unit of the book permanently flat.',
    },
    {
      id: 'control-ftl-split',
      label: 'Follow-the-leader on cumulative loss, one round per split',
      kind: 'control',
      rule: 'followTheLeader',
      etaSchedule: 'fixed',
      granularity: 'perSplit',
      pool: 'withoutCash',
      note: 'The degenerate eta -> infinity limit of Hedge; carries no regret guarantee.',
    },
    {
      id: 'control-ftl-bar',
      label: 'Follow-the-leader on cumulative loss, one round per out-of-sample bar',
      kind: 'control',
      rule: 'followTheLeader',
      etaSchedule: 'fixed',
      granularity: 'perBar',
      pool: 'withoutCash',
      note: 'The degenerate eta -> infinity limit of Hedge; carries no regret guarantee.',
    },
  ];

  const fixedWeightArms: { definition: ArmDefinition; weights: number[][] }[] = [
    {
      definition: {
        id: 'control-best-fixed-hindsight',
        label: `Best single fixed configuration chosen with hindsight (${bestFixed === null ? 'none' : bestFixed.expert.key})`,
        kind: 'control',
        rule: 'bestFixed',
        etaSchedule: 'fixed',
        granularity: 'perSplit',
        pool: 'withoutCash',
        note: 'An unreachable upper bound, not a target: it is selected using the out-of-sample returns it is then scored on.',
      },
      weights: bestFixedWeights,
    },
    {
      definition: {
        id: 'control-argmax-pool',
        label: 'Per-split argmax over the whole pool, on train-window netReturn/maxDD',
        kind: 'control',
        rule: 'argmaxPool',
        etaSchedule: 'fixed',
        granularity: 'perSplit',
        pool: 'withoutCash',
        note: 'The mechanism this study is trying to replace, applied pool-wide rather than per family.',
      },
      weights: argmaxPoolWeights,
    },
    {
      definition: {
        id: 'control-argmax-per-family',
        label: 'Per-split argmax within each family, equal-weighted across families',
        kind: 'control',
        rule: 'argmaxPerFamily',
        etaSchedule: 'fixed',
        granularity: 'perSplit',
        pool: 'withoutCash',
        note: 'The construction the published walk-forward baseline artifact used.',
      },
      weights: argmaxPerFamilyWeights,
    },
    {
      definition: {
        id: 'control-cash',
        label: 'Cash: the zero-effect arm',
        kind: 'control',
        rule: 'cash',
        etaSchedule: 'fixed',
        granularity: 'perSplit',
        pool: 'withoutCash',
        note: 'Holds nothing. Any arm that cannot beat this has no case at all.',
      },
      weights: zeroWeights(poolWithoutCash.length),
    },
  ];

  /* ---- execute every arm ----------------------------------------- */

  console.log('');
  const runs = new Map<string, { definition: ArmDefinition; run: ArmRun }>();

  for (const definition of [...hedgeArms, ...controlArms]) {
    const run = runAllocatorArm(definition);
    runs.set(definition.id, { definition, run });
    console.log(
      `${definition.id.padEnd(34)} net@2x ${sum(run.perBarStressed).toFixed(2).padStart(8)}%  ` +
        `rounds ${String(run.rounds).padStart(5)}  awake~${run.averageAwakeExperts.toFixed(1)}`,
    );
  }
  for (const { definition, weights } of fixedWeightArms) {
    const run = runFixedWeightArm(definition, weights);
    runs.set(definition.id, { definition, run });
    console.log(
      `${definition.id.padEnd(34)} net@2x ${sum(run.perBarStressed).toFixed(2).padStart(8)}%  ` +
        `rounds ${String(run.rounds).padStart(5)}  awake~${run.averageAwakeExperts.toFixed(1)}`,
    );
  }

  const bestFixedNet = sum(runs.get('control-best-fixed-hindsight')!.run.perBarStressed);

  /* ---- trial accounting for the deflated Sharpe ------------------- */

  /**
   * One trial per parameter combination, not one per family name. Per Bailey & Lopez de Prado
   * the search size is the number of configurations evaluated, and every cell here WAS
   * evaluated on every eligible window, so every cell is a trial. Sharpes are computed on the
   * same round basis as the arm being deflated.
   */
  const cellTrialSharpesPerSplit: number[] = [];
  const cellTrialSharpesPerBar: number[] = [];
  const cellTrialLog: {
    key: string;
    familyId: string;
    params: ParamValues;
    awakeSplits: number;
    trades: number;
    netReturnPctStressed: number;
    sharpePerSplit: number | null;
    sharpePerBar: number | null;
  }[] = [];

  for (const expert of experts) {
    const awakeSplitIndices = splits
      .filter((split) => expert.awakeBySplit[split.index])
      .map((split) => split.index);
    const perSplitReturns = awakeSplitIndices.map((index) => expert.perSplitStressed[index]);
    const perBarReturns: number[] = [];
    for (let oosIndex = 0; oosIndex < totalOosBars; oosIndex += 1) {
      if (expert.awakeBySplit[oosSplitOfBar[oosIndex]]) {
        perBarReturns.push(expert.perBarStressed[oosIndex]);
      }
    }
    const splitMoments = returnMoments(perSplitReturns);
    const barMoments = returnMoments(perBarReturns);
    if (splitMoments !== null && Number.isFinite(splitMoments.sharpe)) {
      cellTrialSharpesPerSplit.push(splitMoments.sharpe);
    }
    if (barMoments !== null && Number.isFinite(barMoments.sharpe)) {
      cellTrialSharpesPerBar.push(barMoments.sharpe);
    }
    cellTrialLog.push({
      key: expert.key,
      familyId: expert.familyId,
      params: expert.params,
      awakeSplits: awakeSplitIndices.length,
      trades: sum(expert.tradesBySplit),
      netReturnPctStressed: sum(perSplitReturns),
      sharpePerSplit: splitMoments === null ? null : splitMoments.sharpe,
      sharpePerBar: barMoments === null ? null : barMoments.sharpe,
    });
  }

  function armSharpe(id: string, basis: 'perSplit' | 'perBar'): number | null {
    const entry = runs.get(id);
    if (entry === undefined) {
      return null;
    }
    const series =
      basis === 'perSplit' ? entry.run.perSplitStressed : entry.run.perBarStressed;
    const moments = returnMoments(series);
    return moments === null || !Number.isFinite(moments.sharpe) ? null : moments.sharpe;
  }

  const allocatorVariantIds = hedgeArms.map((arm) => arm.id);
  const sensitivityIds = controlArms
    .map((arm) => arm.id)
    .concat(['control-argmax-pool', 'control-argmax-per-family']);

  function trialSharpes(basis: 'perSplit' | 'perBar', includeSensitivity: boolean): number[] {
    const cells = basis === 'perSplit' ? cellTrialSharpesPerSplit : cellTrialSharpesPerBar;
    const ids = includeSensitivity
      ? [...allocatorVariantIds, ...sensitivityIds]
      : allocatorVariantIds;
    const variants = ids
      .map((id) => armSharpe(id, basis))
      .filter((value): value is number => value !== null);
    return [...cells, ...variants];
  }

  const primaryTrialsPerSplit = trialSharpes('perSplit', false);
  const primaryTrialsPerBar = trialSharpes('perBar', false);
  const sensitivityTrialsPerSplit = trialSharpes('perSplit', true);
  const sensitivityTrialsPerBar = trialSharpes('perBar', true);

  /* ---- assemble per-arm results ---------------------------------- */

  function summariseArm(definition: ArmDefinition, run: ArmRun): ArmResult {
    const pool = poolFor(definition.pool);
    const netStressed = sum(run.perBarStressed);
    const netBase = sum(run.perBarBase);
    const maxDrawdown = maxDrawdownPctFromSeries(run.perBarStressed);
    const profitFactor = profitFactorFromSeries(run.perBarStressed);
    const scoredSplits = run.perSplitStressed.filter((_value, index) =>
      pool.some((expert) => expert.awakeBySplit[index]),
    );
    const sorted = [...run.perSplitStressed].sort((a, b) => a - b);
    const median =
      sorted.length === 0
        ? 0
        : sorted.length % 2 === 1
          ? sorted[(sorted.length - 1) / 2]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const bestSplit = run.perSplitStressed.reduce((top, value) => Math.max(top, value), Number.NEGATIVE_INFINITY);

    const contributions: WeightContribution[] = run.weightSumByExpert
      .map((total, index) => ({
        expertKey: pool[index].key,
        familyId: pool[index].familyId,
        averageWeight: run.weightRounds === 0 ? 0 : total / run.weightRounds,
      }))
      .filter((entry) => entry.averageWeight > 0)
      .sort((a, b) => b.averageWeight - a.averageWeight)
      .slice(0, 10);

    const weightByFamily: Record<string, number> = {};
    for (let i = 0; i < pool.length; i += 1) {
      const share = run.weightRounds === 0 ? 0 : run.weightSumByExpert[i] / run.weightRounds;
      if (share === 0) {
        continue;
      }
      weightByFamily[pool[i].familyId] = (weightByFamily[pool[i].familyId] ?? 0) + share;
    }

    const gateInput = {
      underlyingTradesTouched: run.underlyingTradesTouched,
      profitFactorStressedBarLevel: profitFactor,
      netReturnPctStressed: netStressed,
      netReturnPctBase: netBase,
      maxDrawdownPctStressedBarLevel: maxDrawdown,
    };

    const basis = definition.granularity;
    const selectedReturns = basis === 'perSplit' ? run.perSplitStressed : run.perBarStressed;
    const primary = basis === 'perSplit' ? primaryTrialsPerSplit : primaryTrialsPerBar;
    const sensitivity =
      basis === 'perSplit' ? sensitivityTrialsPerSplit : sensitivityTrialsPerBar;

    const isCashArm = definition.rule === 'cash';

    return {
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      rule: definition.rule,
      etaSchedule: definition.kind === 'hedge' ? definition.etaSchedule : null,
      granularity: definition.granularity,
      pool: definition.pool,
      note: definition.note,
      expertsInPool: pool.length,
      rounds: run.rounds,
      netReturnPctStressed: netStressed,
      netReturnPctBase: netBase,
      maxDrawdownPctStressedBarLevel: maxDrawdown,
      profitFactorStressedBarLevel: profitFactor,
      calmarStressed: maxDrawdown === 0 ? null : netStressed / maxDrawdown,
      perSplitStressed: run.perSplitStressed,
      splitsScored: scoredSplits.length,
      splitsProfitableStressed: run.perSplitStressed.filter((value) => value > 0).length,
      medianSplitStressed: median,
      totalExcludingBestSplitStressed:
        bestSplit === Number.NEGATIVE_INFINITY ? netStressed : netStressed - bestSplit,
      underlyingTradesTouched: run.underlyingTradesTouched,
      effectiveTrades: run.effectiveTrades,
      averageAwakeExperts: run.averageAwakeExperts,
      topWeightContributions: contributions,
      weightByFamily,
      regret: run.regret,
      gateMission: evaluateGate(gateInput, GATES.mission),
      gateRepository: evaluateGate(gateInput, GATES.repository),
      selectionVersusBestFixed:
        definition.rule === 'bestFixed'
          ? null
          : {
              armNetReturnPctStressed: netStressed,
              bestFixedNetReturnPctStressed: bestFixedNet,
              differencePct: netStressed - bestFixedNet,
              note:
                netStressed >= bestFixedNet
                  ? 'This arm matched or beat the hindsight-chosen fixed configuration, which would be a strong result and should be checked for a selection path that leaks out-of-sample information.'
                  : 'This arm did not beat the best fixed configuration chosen with hindsight. The gap is the cost of not knowing in advance which configuration would win; it is not a target, because the comparison uses information no live selector could have had.',
            },
      deflated: isCashArm ? null : deflatedSharpe(selectedReturns, primary),
      deflatedSensitivity: isCashArm ? null : deflatedSharpe(selectedReturns, sensitivity),
      verdict: '',
    };
  }

  const results: ArmResult[] = [];
  for (const id of [
    ...hedgeArms.map((arm) => arm.id),
    ...controlArms.map((arm) => arm.id),
    ...fixedWeightArms.map((entry) => entry.definition.id),
  ]) {
    const entry = runs.get(id);
    if (entry === undefined) {
      throw new Error(`arm ${id} was defined but never run`);
    }
    results.push(summariseArm(entry.definition, entry.run));
  }

  /* ---- the comparison that decides the study --------------------- */

  const equalWeightByPool: Record<ArmDefinition['pool'], number> = {
    withoutCash: results.find((arm) => arm.id === 'control-equal-weight-nocash')!
      .netReturnPctStressed,
    withCash: results.find((arm) => arm.id === 'control-equal-weight-cash')!.netReturnPctStressed,
  };

  const hedgeResults = results.filter((arm) => arm.kind === 'hedge');
  const hedgeVersusEqualWeight = hedgeResults.map((arm) => ({
    armId: arm.id,
    pool: arm.pool,
    granularity: arm.granularity,
    etaSchedule: arm.etaSchedule,
    hedgeNetReturnPctStressed: arm.netReturnPctStressed,
    equalWeightNetReturnPctStressed: equalWeightByPool[arm.pool],
    differencePct: arm.netReturnPctStressed - equalWeightByPool[arm.pool],
    hedgeBeatEqualWeight: arm.netReturnPctStressed > equalWeightByPool[arm.pool],
  }));

  const hedgeWins = hedgeVersusEqualWeight.filter((entry) => entry.hedgeBeatEqualWeight).length;
  const bestHedgeByPool = (['withoutCash', 'withCash'] as const).map((pool) => {
    const candidates = hedgeVersusEqualWeight.filter((entry) => entry.pool === pool);
    const best = candidates.reduce((top, entry) =>
      entry.hedgeNetReturnPctStressed > top.hedgeNetReturnPctStressed ? entry : top,
    );
    // `best` already carries `pool`, so it is not restated here.
    return { ...best };
  });

  const headlineFirstLine =
    hedgeWins === 0
      ? 'Hedge did NOT beat equal weighting in any of the eight allocator variants.'
      : hedgeWins === hedgeVersusEqualWeight.length
        ? 'Hedge beat equal weighting in all eight allocator variants.'
        : `Hedge beat equal weighting in ${hedgeWins} of ${hedgeVersusEqualWeight.length} allocator variants, and lost in the other ${hedgeVersusEqualWeight.length - hedgeWins}.`;

  for (const arm of results) {
    if (arm.kind === 'hedge') {
      const comparison = hedgeVersusEqualWeight.find((entry) => entry.armId === arm.id)!;
      arm.verdict = comparison.hedgeBeatEqualWeight
        ? `Beat equal weighting on the same pool by ${comparison.differencePct.toFixed(2)} points; still ${arm.gateMission.pass ? 'passes' : 'fails'} the mission gate.`
        : `Lost to equal weighting on the same pool by ${Math.abs(comparison.differencePct).toFixed(2)} points. The regret machinery bought nothing here.`;
    } else if (arm.rule === 'bestFixed') {
      arm.verdict =
        'Upper bound only. Selected using the out-of-sample returns it is scored on, so it is not achievable by any live selector.';
    } else {
      arm.verdict = `Control. ${arm.gateMission.pass ? 'Passes' : 'Fails'} the mission gate at bar-level definitions.`;
    }
  }

  /* ---- payload --------------------------------------------------- */

  const generatedAt = new Date().toISOString();

  const payload = {
    schemaVersion: 1,
    study: 'online-ensemble-allocator',
    generatedAt,
    capitalMode:
      'Paper trading / virtual capital only. Every figure is simulated P&L over the development window; no live orders and no trading-permissioned keys are involved.',
    developmentWindow: {
      fromIso: new Date(DEVELOPMENT_FROM_MS).toISOString(),
      toExclusiveIso: new Date(SEALED_HOLDOUT_FROM_MS).toISOString(),
      bars: barCount,
      hoursPerBar: FAMILY_HOURS_PER_BAR,
      symbols,
      coverage,
    },
    sealedHoldout: {
      fromIso: new Date(SEALED_HOLDOUT_FROM_MS).toISOString(),
      status:
        'Not read. Development loaders only, plus an explicit assertNoHoldoutLeakage pass over every loaded candle series.',
    },
    algorithm: {
      name: 'Hedge (exponentially weighted average forecaster / multiplicative weights)',
      chosenOver:
        'EXP3, which would have been the wrong fit: this harness evaluates every grid cell on every window, so the feedback is full-information rather than bandit.',
      boundStatement:
        'Regret against the best fixed expert in hindsight is at most sqrt(2 T ln N) with eta = sqrt(2 ln N / T) and losses in [0,1].',
      citations: [
        'Freund & Schapire, A Decision-Theoretic Generalization of On-Line Learning and an Application to Boosting, J. Comput. Syst. Sci. 55(1):119-139, 1997.',
        'Arora, Hazan & Kale, The Multiplicative Weights Update Method, Theory of Computing 8:121-164, 2012, Theorem 2.3.',
        'Cesa-Bianchi & Lugosi, Prediction, Learning, and Games, CUP 2006, Theorem 2.2 (sharper constant sqrt((T/2) ln N)).',
        'Freund, Schapire, Singer & Warmuth, Using and combining predictors that specialize, STOC 1997 (sleeping/specialist experts).',
        'Blum & Mansour, From External to Internal Regret, JMLR 8:1307-1324, 2007.',
      ],
      preRegisteredReturnCapPct: PRE_REGISTERED_RETURN_CAP_PCT,
      preRegistrationRationale:
        'R equals the mission gate maximum-drawdown cap, a design constant that predates this study. A round losing more than the whole drawdown budget is already a gate failure, so it is treated as the maximal loss. The same R is used at both granularities so that neither arm receives a tuned cap.',
      lossMap: 'loss = clip(0.5 - returnPct / (2R), 0, 1); a flat round maps to exactly 0.5.',
      sleepingExperts:
        'An expert with fewer than MIN_TRAIN_TRADES trades on a split train window, or whose required series is not `available` on that split, is asleep: excluded from the simplex and from its own aggregate, never zero-filled. The guarantee is then against the best expert over the rounds it was awake.',
    },
    costs: {
      assumptions: COST_ASSUMPTIONS,
      headline: 'stressed (2x fees, spread, slippage and funding)',
      base: BASE_COSTS,
      stressed: STRESSED_COSTS,
    },
    splitPlan: {
      geometry: SPLIT_GEOMETRY,
      splits: splits.map((split) => ({ ...split })),
      droppedTailBars: plan.droppedTailBars,
      outOfSampleBars: totalOosBars,
    },
    selection: {
      minTrainTrades: MIN_TRAIN_TRADES,
      argmaxObjective: 'netReturnPct / max(1, maxDrawdownPct) on the train window',
      costModelUsedForSelection:
        'base -- matching runWalkForwardBaseline.mts, which declares the same. Out-of-sample scoring is stressed.',
      awakeRule:
        'An expert is awake on a split when it clears MIN_TRAIN_TRADES on that train window AND its required series is not `unavailable`. `partial` stays awake and is counted below, because excluding it would be stricter than the no-fabrication rule requires and would make the argmax controls a different mechanism from the published baseline.',
      partialSplitExpertPairs,
      unavailableSplitExpertPairs,
      argmaxPoolPicksBySplit: argmaxPoolPicks,
      argmaxPerFamilyPicksBySplit: argmaxPerFamilyPicks,
    },
    publishedBaselineCrossCheck: {
      purpose:
        'Re-derives families[i].aggregateStressed.netReturnPct from walk-forward-baseline-results.json using this harness. Exact agreement means the split geometry, cost models, selection rule and P&L booking here are the same ruler the published numbers were measured with.',
      comparisonBasis:
        'Agreement is judged on the splits where this study kept the family awake. The published run booked returns on splits whose conditioning series is `unavailable`; this study drops them under the no-fabrication rule, so the whole-history figures are also reported together with the excluded split indices and their published contribution, which accounts for the difference exactly.',
      perFamilyArgmaxAggregate,
      comparison: publishedComparison,
      familiesReproduced:
        publishedComparison === null
          ? null
          : publishedComparison.filter((entry) => entry.reproduces === true).length,
      familiesCompared:
        publishedComparison === null
          ? null
          : publishedComparison.filter((entry) => entry.reproduces !== null).length,
      familiesWithExcludedSplits:
        publishedComparison === null
          ? null
          : publishedComparison
              .filter((entry) => entry.splitsExcludedForUnavailability.length > 0)
              .map((entry) => ({
                familyId: entry.familyId,
                splits: entry.splitsExcludedForUnavailability,
                publishedContributionPct: entry.publishedContributionOfExcludedSplitsPct,
              })),
    },
    conditioningAvailability: availability.map((entry) => ({
      series: entry.series,
      overallShare: entry.overallShare,
      firstFullyCoveredIso: entry.firstFullyCoveredIso,
      longestContiguousBars: entry.longestContiguousBars,
      splits: entry.splits.map((split) => ({
        splitIndex: split.splitIndex,
        status: split.status,
        reason: split.reason,
      })),
    })),
    gates: GATES,
    metricConventions: {
      profitFactorAndDrawdown:
        'Bar-level: computed over the portfolio per-bar return series, because a continuously reweighted book has no round trips of its own. NOT comparable to the trade-level figures in walk-forward-baseline-results.json.',
      pnlBooking:
        'An expert return for a round is the net P&L of the trades that closed in that round, under the shared cost model. The allocator therefore learns about an expert only when that expert closes a position, which understates the per-bar arm rather than flattering it.',
      tradeCounts:
        'underlyingTradesTouched counts distinct underlying expert trades that received strictly positive weight; effectiveTrades is the weight-weighted count. The gate uses the former.',
      exposure:
        'Weights sum to one over the awake set, so gross exposure stays at about one unit and the drawdown cap cannot be passed by de-levering.',
      informationSet:
        'The allocator sees every completed round strictly before the current one, which is a superset of the argmax selector 1095-bar train window. It sees no future bar.',
    },
    trialAccounting: {
      rule: 'One trial per parameter combination in every family grid, plus one per allocator variant. Family names are not trials.',
      gridCellsByFamily,
      gridCellsAcrossFamilies: gridCellCount,
      allocatorVariants: allocatorVariantIds.length,
      primaryTrialCount: gridCellCount + allocatorVariantIds.length,
      primaryUsableTrialsPerSplitBasis: primaryTrialsPerSplit.length,
      primaryUsableTrialsPerBarBasis: primaryTrialsPerBar.length,
      sensitivityAdditionalSelectionProcedures: sensitivityIds.length,
      sensitivityTrialCount: gridCellCount + allocatorVariantIds.length + sensitivityIds.length,
      sensitivityUsableTrialsPerSplitBasis: sensitivityTrialsPerSplit.length,
      sensitivityUsableTrialsPerBarBasis: sensitivityTrialsPerBar.length,
      usableTrialNote:
        'The usable counts are the finite entries deflatedSharpe actually consumed. A configuration with no trades, or one whose return series has zero dispersion, yields no Sharpe and is dropped; the cash expert is one such case by construction.',
      basisNote:
        'Trial Sharpes are computed on the same round basis as the arm being deflated. A Sharpe per split and a Sharpe per bar are different quantities and pooling them would corrupt the trial dispersion the correction depends on.',
      knownLimitation:
        'Adjacent grid cells share most of their trades, so the trial Sharpes are highly correlated. That inflates the trial count without proportionally widening their dispersion, and the expected-maximum benchmark scales with that dispersion. The correction is therefore a floor on the selection-bias penalty, not a ceiling, which is why the leave-out-the-best-split figure is reported for every arm as an assumption-free check.',
    },
    headline: {
      firstLine: headlineFirstLine,
      hedgeVariantsThatBeatEqualWeighting: hedgeWins,
      hedgeVariantsTotal: hedgeVersusEqualWeight.length,
      equalWeightNetReturnPctStressedByPool: equalWeightByPool,
      bestHedgeByPool,
      hedgeVersusEqualWeight,
      bestFixedWithHindsight:
        bestFixed === null
          ? null
          : {
              key: bestFixed.expert.key,
              familyId: bestFixed.expert.familyId,
              params: bestFixed.expert.params,
              awakeSplits: bestFixed.awakeSplits,
              netReturnPctStressed: bestFixedNet,
            },
      argmaxPoolNetReturnPctStressed: results.find((arm) => arm.id === 'control-argmax-pool')!
        .netReturnPctStressed,
      argmaxPerFamilyNetReturnPctStressed: results.find(
        (arm) => arm.id === 'control-argmax-per-family',
      )!.netReturnPctStressed,
    },
    arms: results,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const body = JSON.stringify(payload, null, 2);
  const digest = createHash('sha256').update(body).digest('hex');
  writeFileSync(
    RESULTS_FILE,
    `${JSON.stringify({ ...payload, integrity: { contentSha256: digest } }, null, 2)}\n`,
    'utf8',
  );

  /* ---- research log --------------------------------------------- */

  const logPayload = {
    schemaVersion: 1,
    study: 'online-ensemble-allocator',
    generatedAt,
    preRegistration: {
      returnCapPct: PRE_REGISTERED_RETURN_CAP_PCT,
      rationale: payload.algorithm.preRegistrationRationale,
      declaredBeforeResults: true,
      granularities: ['perSplit', 'perBar'],
      etaSchedules: ['fixed', 'anytime'],
      poolCompositions: ['withoutCash', 'withCash'],
      statedExpectationBeforeRunning:
        'Hedge cannot reach the hindsight-chosen best fixed configuration, because its guarantee is best-fixed minus a regret allowance and that allowance is large at these horizons. The live question is whether it beats per-split argmax and equal weighting, and even a win was expected to fail the mission gate, because the drawdown comes from the signals rather than from the selector.',
    },
    trialAccounting: payload.trialAccounting,
    clippingByArm: results
      .filter((arm) => arm.regret !== null)
      .map((arm) => ({
        armId: arm.id,
        rounds: arm.regret!.rounds,
        lossObservations: arm.regret!.lossObservations,
        clippedObservations: arm.regret!.clippedObservations,
        clippedShare: arm.regret!.clippedShare,
      })),
    regretByArm: results
      .filter((arm) => arm.regret !== null)
      .map((arm) => ({ armId: arm.id, ...arm.regret! })),
    leaveOutBestSplitByArm: results.map((arm) => ({
      armId: arm.id,
      netReturnPctStressed: arm.netReturnPctStressed,
      totalExcludingBestSplitStressed: arm.totalExcludingBestSplitStressed,
      survivesWithoutBestSplit: arm.totalExcludingBestSplitStressed > 0,
    })),
    trialLog: cellTrialLog,
    trialSharpes: {
      perSplitBasis: primaryTrialsPerSplit,
      perBarBasis: primaryTrialsPerBar,
    },
  };

  const logBody = JSON.stringify(logPayload, null, 2);
  const logDigest = createHash('sha256').update(logBody).digest('hex');
  writeFileSync(
    LOG_FILE,
    `${JSON.stringify({ ...logPayload, integrity: { contentSha256: logDigest } }, null, 2)}\n`,
    'utf8',
  );

  /* ---- console summary, verdict first ---------------------------- */

  console.log('');
  console.log(headlineFirstLine);
  console.log('');
  for (const entry of bestHedgeByPool) {
    console.log(
      `pool ${entry.pool.padEnd(11)} best Hedge ${entry.hedgeNetReturnPctStressed.toFixed(2)}% ` +
        `vs equal weighting ${entry.equalWeightNetReturnPctStressed.toFixed(2)}% ` +
        `(${entry.differencePct >= 0 ? '+' : ''}${entry.differencePct.toFixed(2)} points, ${entry.granularity}, ${entry.etaSchedule} eta)`,
    );
  }

  console.log('');
  console.log(
    'arm                                 net@2x   base   maxDD  pf(bar)  calmar  splits+  ex-best   trades  gate',
  );
  for (const arm of results) {
    console.log(
      [
        arm.id.padEnd(34),
        `${arm.netReturnPctStressed.toFixed(2)}%`.padStart(8),
        `${arm.netReturnPctBase.toFixed(2)}%`.padStart(8),
        arm.maxDrawdownPctStressedBarLevel.toFixed(2).padStart(7),
        (arm.profitFactorStressedBarLevel === null
          ? 'n/a'
          : arm.profitFactorStressedBarLevel === Number.POSITIVE_INFINITY
            ? 'inf'
            : arm.profitFactorStressedBarLevel.toFixed(3)
        ).padStart(8),
        (arm.calmarStressed === null ? 'n/a' : arm.calmarStressed.toFixed(3)).padStart(7),
        `${arm.splitsProfitableStressed}/${arm.splitsScored}`.padStart(8),
        `${arm.totalExcludingBestSplitStressed.toFixed(2)}%`.padStart(9),
        String(arm.underlyingTradesTouched).padStart(8),
        (arm.gateMission.pass ? 'PASS' : 'FAIL').padStart(6),
      ].join(' '),
    );
  }

  console.log('');
  console.log(
    `trial set fed to deflatedSharpe: ${gridCellCount} grid cells + ${allocatorVariantIds.length} allocator variants ` +
      `= ${gridCellCount + allocatorVariantIds.length} declared; ` +
      `${primaryTrialsPerSplit.length} usable on the per-split basis, ${primaryTrialsPerBar.length} on the per-bar basis`,
  );
  console.log(
    `sensitivity trial set (also charging the ${sensitivityIds.length} non-Hedge selection procedures): ` +
      `${gridCellCount + allocatorVariantIds.length + sensitivityIds.length} declared`,
  );

  console.log('');
  for (const arm of hedgeResults) {
    const regret = arm.regret!;
    console.log(
      `${arm.id.padEnd(34)} T=${String(regret.rounds).padStart(5)} ` +
        `realised regret ${regret.realizedRegret === null ? 'n/a' : regret.realizedRegret.toFixed(2)} ` +
        `<= bound ${regret.conservativeBound.toFixed(2)} ` +
        `(bound is ${(regret.boundShareOfLossRange * 100).toFixed(1)}% of the loss range; ` +
        `clipping ${(regret.clippedShare * 100).toFixed(2)}%)`,
    );
  }

  console.log('');
  if (publishedComparison === null) {
    console.log(
      'published-baseline cross-check: skipped, walk-forward-baseline-results.json is absent',
    );
  } else {
    const reproduced = publishedComparison.filter((entry) => entry.reproduces === true).length;
    const compared = publishedComparison.filter((entry) => entry.reproduces !== null).length;
    console.log(
      `published-baseline cross-check: ${reproduced}/${compared} family argmax aggregates reproduced exactly on the splits this study kept awake`,
    );
    for (const entry of publishedComparison) {
      if (entry.reproduces === true && entry.splitsExcludedForUnavailability.length === 0) {
        continue;
      }
      const excluded = entry.splitsExcludedForUnavailability;
      const suffix =
        excluded.length === 0
          ? ''
          : `  [dropped splits ${excluded.join(',')} as unavailable, published contribution ` +
            `${(entry.publishedContributionOfExcludedSplitsPct ?? 0).toFixed(2)}%]`;
      console.log(
        `  ${entry.familyId.padEnd(14)} awake-split net ${entry.thisStudyNetReturnPctStressed.toFixed(2).padStart(9)}%  ` +
          `published on those splits ${entry.publishedNetReturnPctStressedOnAwakeSplits === null ? 'n/a' : entry.publishedNetReturnPctStressedOnAwakeSplits.toFixed(2).padStart(9) + '%'}  ` +
          `delta ${entry.differencePctOnAwakeSplits === null ? 'n/a' : entry.differencePctOnAwakeSplits.toFixed(6)}  ` +
          `picks ${entry.identicalPicksOnAwakeSplits}/${entry.awakeSplitsCompared}${suffix}`,
      );
    }
  }
  console.log(
    `availability: ${partialSplitExpertPairs} partial and ${unavailableSplitExpertPairs} unavailable split-expert pairs; ` +
      'only unavailable puts an expert to sleep',
  );

  console.log('');
  console.log(`Results: ${path.relative(REPO_ROOT, RESULTS_FILE)} (sha256 ${digest})`);
  console.log(`Log:     ${path.relative(REPO_ROOT, LOG_FILE)} (sha256 ${logDigest})`);
  console.log(`elapsed ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main();
