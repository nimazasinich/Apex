/**
 * Walk-forward baseline study for ten candidate strategy families.
 *
 * WHAT THIS RUN IS, AND WHAT IT IS NOT
 * ------------------------------------
 * It is a first honest measurement, on data the families have never been tuned
 * against, of whether any of ten rule shapes survives realistic costs. It is *not* a
 * check against the sealed final holdout (2024-01-01 .. 2025-12-31, seal identity
 * `e656624e...`). Every bar read here comes from `loadDevelopment*`, which refuses to
 * return a row at or after the holdout boundary, so this script cannot touch the seal
 * even by accident.
 *
 * PROCEDURE
 * ---------
 * For each family, each of fourteen rolling walk-forward splits does the following:
 *   1. score every parameter combination on the split's train window;
 *   2. pick one combination -- the best in-sample risk-adjusted return -- with no
 *      knowledge of the test window;
 *   3. score exactly that combination on the test window, under both the base cost
 *      model and a 2x stressed one.
 * Out-of-sample trades from all fourteen test windows are then concatenated into one
 * track record. Test windows never overlap, so no bar is counted twice.
 *
 * The number that matters is the aggregate out-of-sample result under 2x costs. The
 * in-sample numbers are reported only so the gap between them is visible: a family
 * that looks excellent in-sample and poor out-of-sample has been fitted, and saying
 * so is the point of the exercise.
 *
 * Run with:  npx tsx scripts/research/runWalkForwardBaseline.mts
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  transactionCostModelFromPerSideAssumptions,
  type TransactionCostModel,
} from '../../src/services/transactionCosts';
import {
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
import { loadDevelopmentUniverse } from './lib/universe';
import {
  buildTrades,
  summarizeTrades,
  type Direction,
  type Trade,
  type TradeSummary,
} from './lib/tradeMetrics';
import {
  assertSplitsAreCausal,
  buildWalkForwardSplits,
  outOfSampleBarCount,
} from './lib/walkForward';

/* ------------------------------------------------------------------ *
 * Policy
 * ------------------------------------------------------------------ */

/** Per-side assumptions, identical to those used by the sealed structural study. */
const COST_ASSUMPTIONS = {
  commissionPctPerSide: 0.04,
  slippagePctPerSide: 0.02,
  fundingPctEstimate: 0.01,
} as const;

const BASE_COSTS: TransactionCostModel = transactionCostModelFromPerSideAssumptions(COST_ASSUMPTIONS);
const STRESSED_COSTS: TransactionCostModel = transactionCostModelFromPerSideAssumptions(
  COST_ASSUMPTIONS,
  { feeMultiplier: 2, spreadMultiplier: 2, slippageMultiplier: 2, fundingMultiplier: 2 },
);

/**
 * Split geometry, in four-hour bars.
 *   warm-up  180 bars =  30 days of indicator history before the first train window
 *   train   1095 bars = 182 days
 *   test     365 bars =  61 days, stepping by the same amount so tests exactly tile
 */
const SPLIT_GEOMETRY = { warmupBars: 180, trainBars: 1095, testBars: 365, stepBars: 365 } as const;

/** A parameter set must produce at least this many in-sample trades to be selectable. */
const MIN_TRAIN_TRADES = 10;

/**
 * Two gates are reported. The 15% drawdown cap is the one this mission was given; the
 * 13% cap is the stricter figure already encoded in the repository's own structural
 * study, kept visible so a family that only clears the looser bar cannot be mistaken
 * for one that clears the existing promotion standard.
 */
const GATES = {
  mission: { minTrades: 30, minProfitFactor: 1, maxDrawdownPct: 15 },
  repository: { minTrades: 30, minProfitFactor: 1, maxDrawdownPct: 13 },
} as const;

const OUTPUT_DIR = path.join(REPO_ROOT, 'QA', 'walk-forward-baseline');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'walk-forward-baseline-results.json');

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

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

/** In-sample objective: risk-adjusted net return, with drawdown as the denominator. */
function selectionScore(summary: TradeSummary): number {
  return summary.netReturnPct / Math.max(1, summary.maxDrawdownPct);
}

interface SplitOutcome {
  splitIndex: number;
  trainRange: [number, number];
  testRange: [number, number];
  testFrom: string;
  testTo: string;
  selectedParams: ParamValues | null;
  candidatesConsidered: number;
  candidatesEligible: number;
  inSample: TradeSummary | null;
  outOfSampleBase: TradeSummary | null;
  outOfSampleStressed: TradeSummary | null;
}

interface FamilyOutcome {
  id: string;
  label: string;
  rationale: string;
  requires: readonly string[];
  gridSize: number;
  splits: SplitOutcome[];
  aggregateBase: TradeSummary;
  aggregateStressed: TradeSummary;
  splitsWithTrades: number;
  splitsProfitableStressed: number;
  verdict: {
    mission: { pass: boolean; failures: string[] };
    repository: { pass: boolean; failures: string[] };
  };
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
  const stressedProfitFactor = summary.profitFactor;
  if (stressedProfitFactor === null || stressedProfitFactor <= gate.minProfitFactor) {
    failures.push(
      `stressed profit factor ${stressedProfitFactor === null ? 'n/a' : stressedProfitFactor.toFixed(3)} ` +
        `is not above ${gate.minProfitFactor}`,
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

function main(): void {
  const startedAt = Date.now();
  process.stdout.write('Loading verified development-window data (2021-01-01 .. 2023-12-31)...\n');
  const { universe, barCount, coverage } = loadDevelopmentUniverse();
  process.stdout.write(
    `Loaded ${universe.length} symbols, ${barCount} four-hour bars each ` +
      `(${coverage[0].firstBar} .. ${coverage[0].lastBar})\n`,
  );

  const plan = buildWalkForwardSplits({ totalBars: barCount, ...SPLIT_GEOMETRY });
  assertSplitsAreCausal(plan.splits);
  process.stdout.write(
    `${plan.splits.length} rolling splits, ${outOfSampleBarCount(plan.splits)} out-of-sample bars, ` +
      `${plan.droppedTailBars} tail bars dropped\n\n`,
  );

  const families: FamilyOutcome[] = [];

  for (const family of STRATEGY_FAMILIES) {
    const familyStart = Date.now();
    // Positions are computed once over the whole development series per combination.
    // This is not lookahead: every indicator value at bar i reads only bars <= i, so a
    // test window legitimately warms up on bars that precede it. What the split
    // structure prevents is the other direction -- choosing the combination itself
    // using test-window bars.
    const built = family.grid.map((params) => ({ params, ...family.build(universe, params) }));

    const splits: SplitOutcome[] = [];
    const allBase: Trade[] = [];
    const allStressed: Trade[] = [];

    for (const split of plan.splits) {
      let best: { params: ParamValues; summary: TradeSummary; index: number } | null = null;
      let eligible = 0;

      for (let index = 0; index < built.length; index += 1) {
        const candidate = built[index];
        const trainTrades = tradesForRange(
          universe,
          candidate.bySymbol,
          candidate.weight,
          family.id,
          split.index,
          { start: split.trainStart, end: split.trainEnd },
          BASE_COSTS,
        );
        const summary = summarizeTrades(trainTrades);
        if (summary.trades < MIN_TRAIN_TRADES) {
          continue;
        }
        eligible += 1;
        if (best === null || selectionScore(summary) > selectionScore(best.summary)) {
          best = { params: candidate.params, summary, index };
        }
      }

      const testFrom = new Date(universe[0].candles[split.testStart].t).toISOString();
      const testTo = new Date(universe[0].candles[split.testEnd - 1].t).toISOString();

      if (best === null) {
        splits.push({
          splitIndex: split.index,
          trainRange: [split.trainStart, split.trainEnd],
          testRange: [split.testStart, split.testEnd],
          testFrom,
          testTo,
          selectedParams: null,
          candidatesConsidered: built.length,
          candidatesEligible: 0,
          inSample: null,
          outOfSampleBase: null,
          outOfSampleStressed: null,
        });
        continue;
      }

      const chosen = built[best.index];
      const testRange = { start: split.testStart, end: split.testEnd };
      const baseTrades = tradesForRange(
        universe,
        chosen.bySymbol,
        chosen.weight,
        family.id,
        split.index,
        testRange,
        BASE_COSTS,
      );
      const stressedTrades = tradesForRange(
        universe,
        chosen.bySymbol,
        chosen.weight,
        family.id,
        split.index,
        testRange,
        STRESSED_COSTS,
      );
      allBase.push(...baseTrades);
      allStressed.push(...stressedTrades);

      splits.push({
        splitIndex: split.index,
        trainRange: [split.trainStart, split.trainEnd],
        testRange: [split.testStart, split.testEnd],
        testFrom,
        testTo,
        selectedParams: best.params,
        candidatesConsidered: built.length,
        candidatesEligible: eligible,
        inSample: best.summary,
        outOfSampleBase: summarizeTrades(baseTrades),
        outOfSampleStressed: summarizeTrades(stressedTrades),
      });
    }

    const aggregateBase = summarizeTrades(allBase);
    const aggregateStressed = summarizeTrades(allStressed);
    const splitsWithTrades = splits.filter((split) => (split.outOfSampleStressed?.trades ?? 0) > 0)
      .length;
    const splitsProfitableStressed = splits.filter(
      (split) => (split.outOfSampleStressed?.netReturnPct ?? 0) > 0,
    ).length;

    families.push({
      id: family.id,
      label: family.label,
      rationale: family.rationale,
      requires: family.requires,
      gridSize: family.grid.length,
      splits,
      aggregateBase,
      aggregateStressed,
      splitsWithTrades,
      splitsProfitableStressed,
      verdict: {
        mission: evaluateGate(aggregateStressed, aggregateBase, GATES.mission),
        repository: evaluateGate(aggregateStressed, aggregateBase, GATES.repository),
      },
    });

    process.stdout.write(
      `${family.id.padEnd(13)} trades=${String(aggregateStressed.trades).padStart(5)} ` +
        `net(base)=${aggregateBase.netReturnPct.toFixed(2).padStart(9)}% ` +
        `net(2x)=${aggregateStressed.netReturnPct.toFixed(2).padStart(9)}% ` +
        `pf(2x)=${(aggregateStressed.profitFactor ?? 0).toFixed(3).padStart(6)} ` +
        `maxDD(2x)=${aggregateStressed.maxDrawdownPct.toFixed(2).padStart(7)} ` +
        `splits+=${splitsProfitableStressed}/${splitsWithTrades} ` +
        `${families[families.length - 1].verdict.mission.pass ? 'PASS' : 'FAIL'} ` +
        `(${((Date.now() - familyStart) / 1000).toFixed(1)}s)\n`,
    );
  }

  const payload = {
    schemaVersion: 1,
    study: 'walk-forward-baseline',
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
        'Every series in this study is loaded through loadDevelopment*, which filters to bars ' +
        'before 2024-01-01 and then re-asserts the boundary. The sealed holdout was not opened, ' +
        'scored against, or tuned against by this run.',
    },
    dataProvenance: {
      directory: 'QA/profitability-structural-remediation/data',
      note:
        'Verified Binance Vision futures archives with a hash manifest. Funding and open-interest ' +
        'holes are carried as unavailable and cause a flat position; nothing is interpolated.',
      coverage,
    },
    costs: {
      perSideAssumptions: COST_ASSUMPTIONS,
      baseRoundTripPctOneBar: 0.13,
      stressedRoundTripPctOneBar: 0.26,
      stressMultipliers: { fee: 2, spread: 2, slippage: 2, funding: 2 },
      note:
        'Costs come from src/services/transactionCosts, the same module the sealed structural study ' +
        'uses, so the numbers are directly comparable to it.',
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
      note:
        'One parameter set is chosen per family per split, pooled across all ten symbols rather ' +
        'than per symbol, to keep the number of fitted degrees of freedom small.',
    },
    gates: GATES,
    metricConventions: {
      pnl: 'per-trade percentages summed, not compounded',
      drawdown:
        'peak-to-trough of the exit-time-ordered cumulative net P&L curve, in percentage points of ' +
        'a one-unit gross-exposure book',
      profitFactor: 'gross win / gross loss; Infinity when there were no losers, null when no trades',
    },
    families,
  };

  const body = JSON.stringify(payload, null, 2);
  const digest = createHash('sha256').update(body).digest('hex');
  const withIntegrity = JSON.stringify({ ...payload, integrity: { contentSha256: digest } }, null, 2);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${withIntegrity}\n`, 'utf8');

  const missionPasses = families.filter((family) => family.verdict.mission.pass);
  const repositoryPasses = families.filter((family) => family.verdict.repository.pass);

  process.stdout.write(
    `\n${missionPasses.length}/${families.length} families pass the 15-point drawdown gate: ` +
      `${missionPasses.map((family) => family.id).join(', ') || 'none'}\n`,
  );
  process.stdout.write(
    `${repositoryPasses.length}/${families.length} families pass the stricter 13-point gate: ` +
      `${repositoryPasses.map((family) => family.id).join(', ') || 'none'}\n`,
  );
  process.stdout.write(`Results: ${path.relative(REPO_ROOT, OUTPUT_FILE)} (sha256 ${digest})\n`);
  process.stdout.write(`Completed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);
}

main();
