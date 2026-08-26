/**
 * Risk-adjusted walk-forward study: does position sizing rescue the families that the
 * unsized baseline shows failing the drawdown cap?
 *
 * WHAT THE BASELINE ESTABLISHED, AND WHY THIS RUN EXISTS
 * -----------------------------------------------------
 * `runWalkForwardBaseline.mts` scores ten families unsized -- every position one full
 * unit of gross exposure -- and none of them passes. The failures are not marginal:
 * out-of-sample drawdowns under stressed costs run from 28 to 336 percentage points
 * against a 15-point cap. This study asks whether volatility-based sizing closes that
 * gap, using the identical splits, identical costs and identical trade construction, so
 * the only thing that changed is how much is held.
 *
 * THE TRAP THIS STUDY IS BUILT TO AVOID
 * ------------------------------------
 * Because P&L is additive, multiplying every position by a constant multiplies the net
 * return and the drawdown by the same constant. Profit factor and the sign of the return
 * do not move at all. So the three gates -- trades, profit factor above 1, drawdown under
 * a cap -- can be satisfied by *any* family with a profit factor above 1 simply by
 * holding less, and a study that reported "drawdown now under 15" as a success would be
 * reporting arithmetic rather than a strategy. Every result below is therefore reported
 * with `calmar` (net return divided by max drawdown), which is invariant under exactly
 * that rescaling, plus the explicit multiplier that would put the drawdown at the cap and
 * the return that would remain after it. Sizing has done something real only if `calmar`
 * improves.
 *
 * TWO RESULTS PER FAMILY, ONLY ONE OF WHICH IS HONEST ON ITS OWN
 * -------------------------------------------------------------
 *   integrated  the sizing policy is one more axis of the in-sample parameter search, so
 *               each split picks its policy without seeing the test window. This is the
 *               single reportable out-of-sample number per family.
 *   byPolicy    each policy scored separately, for diagnosis. Five policies per family
 *               means five looks at the same out-of-sample data, so the best row of this
 *               matrix is a multiple-comparison artefact and is NOT a result. It is here
 *               to show *why* the integrated number came out where it did.
 *
 * The sealed holdout (2024-01-01 onward, seal identity `e656624e...`) is not read: every
 * series comes from `loadDevelopmentUniverse`, which loads through the `loadDevelopment*`
 * guards that refuse rows at or after the boundary.
 *
 * Run with:  npx tsx scripts/research/runRiskAdjustedWalkForward.mts
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  transactionCostModelFromPerSideAssumptions,
  type TransactionCostModel,
} from '../../src/services/transactionCosts';
import { REPO_ROOT, SEALED_HOLDOUT_FROM_MS } from './lib/researchDataset';
import { UNSIZED, buildSizingSeries, type SizingPolicy } from './lib/riskSizing';
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
} from './lib/walkForward';

/* ------------------------------------------------------------------ *
 * Policy -- deliberately identical to the baseline study
 * ------------------------------------------------------------------ */

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

const SPLIT_GEOMETRY = { warmupBars: 180, trainBars: 1095, testBars: 365, stepBars: 365 } as const;
const MIN_TRAIN_TRADES = 10;

const GATES = {
  mission: { minTrades: 30, minProfitFactor: 1, maxDrawdownPct: 15 },
  repository: { minTrades: 30, minProfitFactor: 1, maxDrawdownPct: 13 },
} as const;

/**
 * The drawdown cap the mission was given, reused as the reference exposure for the
 * rescaling arithmetic: "if this book were levered to sit exactly at the cap, what return
 * would be left?"
 */
const REFERENCE_DRAWDOWN_CAP = GATES.mission.maxDrawdownPct;

/**
 * Sizing policies.
 *
 * Volatility targets are in percent per four-hour bar. For orientation, a 3.5%-per-day
 * name has roughly 1.4% per four-hour bar, so 1.50 sits near the middle of this universe
 * and 0.75 is a deliberate halving of average exposure. `maxScale` 3 stops a very quiet
 * stretch from implying leverage no exchange would extend on these symbols.
 *
 * The two risk-parity rows target no absolute level at all -- they divide each symbol's
 * volatility into the cross-sectional median, which equalises risk across symbols while
 * leaving average gross exposure near one unit. Including both separates "held less" from
 * "held differently", which is the whole question.
 */
const SIZING_POLICIES: readonly SizingPolicy[] = [
  UNSIZED,
  { id: 'volTarget0.75/90', mode: 'volTarget', volWindowBars: 90, targetVolPctPerBar: 0.75, maxScale: 3 },
  { id: 'volTarget1.50/90', mode: 'volTarget', volWindowBars: 90, targetVolPctPerBar: 1.5, maxScale: 3 },
  { id: 'riskParity/90', mode: 'riskParity', volWindowBars: 90, targetVolPctPerBar: 0, maxScale: 3 },
  { id: 'riskParity/30', mode: 'riskParity', volWindowBars: 30, targetVolPctPerBar: 0, maxScale: 3 },
];

const OUTPUT_DIR = path.join(REPO_ROOT, 'QA', 'walk-forward-baseline');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'walk-forward-risk-sizing-results.json');

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

type ScaleMap = ReadonlyMap<string, (number | undefined)[] | undefined>;

function tradesForRange(
  universe: readonly SymbolSeries[],
  positions: ReadonlyMap<string, readonly Direction[]>,
  scales: ScaleMap,
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
        exposureScale: scales.get(series.symbol),
      }),
    );
  }
  return trades;
}

/**
 * In-sample objective, unchanged from the baseline study so the two are comparable: net
 * return per point of drawdown, with the denominator floored at one point so a candidate
 * that barely traded cannot win on a near-zero drawdown.
 */
function selectionScore(summary: TradeSummary): number {
  return summary.netReturnPct / Math.max(1, summary.maxDrawdownPct);
}

function calmar(summary: TradeSummary): number | null {
  return summary.maxDrawdownPct > 0 ? summary.netReturnPct / summary.maxDrawdownPct : null;
}

function averageExposureScale(trades: readonly Trade[]): number {
  if (trades.length === 0) {
    return 0;
  }
  return trades.reduce((total, trade) => total + trade.exposureScale, 0) / trades.length;
}

interface RescaledView {
  /** Constant multiplier that would put max drawdown exactly at the reference cap. */
  exposureMultiplier: number | null;
  netReturnPct: number | null;
  annualizedPct: number | null;
}

function rescaleToCap(summary: TradeSummary, outOfSampleYears: number): RescaledView {
  if (!(summary.maxDrawdownPct > 0)) {
    return { exposureMultiplier: null, netReturnPct: null, annualizedPct: null };
  }
  const exposureMultiplier = REFERENCE_DRAWDOWN_CAP / summary.maxDrawdownPct;
  const netReturnPct = summary.netReturnPct * exposureMultiplier;
  return {
    exposureMultiplier,
    netReturnPct,
    annualizedPct: outOfSampleYears > 0 ? netReturnPct / outOfSampleYears : null,
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
  if (summary.profitFactor === null || summary.profitFactor <= gate.minProfitFactor) {
    failures.push(
      `stressed profit factor ${summary.profitFactor === null ? 'n/a' : summary.profitFactor.toFixed(3)} ` +
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

/**
 * The part of the mission gate that a constant rescaling cannot change. If this passes,
 * the family passes the full mission gate at *some* exposure, which is why it is reported
 * separately rather than being allowed to masquerade as a drawdown result.
 */
function scaleInvariantCore(
  summary: TradeSummary,
  baseSummary: TradeSummary,
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  if (summary.trades < GATES.mission.minTrades) {
    failures.push(`only ${summary.trades} out-of-sample trades`);
  }
  if (summary.profitFactor === null || summary.profitFactor <= 1) {
    failures.push('stressed profit factor is not above 1');
  }
  if (!(summary.netReturnPct > 0)) {
    failures.push('stressed net return is not positive');
  }
  if (!(baseSummary.netReturnPct > 0)) {
    failures.push('base-cost net return is not positive');
  }
  return { pass: failures.length === 0, failures };
}

interface Aggregate {
  outOfSampleBase: TradeSummary;
  outOfSampleStressed: TradeSummary;
  calmarStressed: number | null;
  avgExposureScale: number;
  atReferenceCap: RescaledView;
  splitsWithTrades: number;
  splitsProfitableStressed: number;
  splitsSelected: number;
  verdict: {
    mission: { pass: boolean; failures: string[] };
    repository: { pass: boolean; failures: string[] };
    scaleInvariantCore: { pass: boolean; failures: string[] };
  };
}

interface SelectionRecord {
  splitIndex: number;
  testFrom: string;
  testTo: string;
  selectedParams: ParamValues | null;
  selectedPolicyId: string | null;
  candidatesConsidered: number;
  candidatesEligible: number;
  inSampleNetReturnPct: number | null;
  inSampleMaxDrawdownPct: number | null;
  outOfSampleStressedNetReturnPct: number | null;
}

interface PolicyOutcome extends Aggregate {
  policyId: string;
  selections: SelectionRecord[];
}

interface FamilyOutcome {
  id: string;
  label: string;
  requires: readonly string[];
  gridSize: number;
  policyCount: number;
  integrated: Aggregate & { selections: SelectionRecord[]; combinationsPerSplit: number };
  byPolicy: PolicyOutcome[];
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

function buildAggregate(
  base: readonly Trade[],
  stressed: readonly Trade[],
  selections: readonly SelectionRecord[],
  outOfSampleYears: number,
): Aggregate {
  const outOfSampleBase = summarizeTrades(base);
  const outOfSampleStressed = summarizeTrades(stressed);

  const netBySplit = new Map<number, number>();
  for (const trade of stressed) {
    netBySplit.set(trade.splitIndex, (netBySplit.get(trade.splitIndex) ?? 0) + trade.netPnlPct);
  }
  let splitsProfitableStressed = 0;
  for (const net of netBySplit.values()) {
    if (net > 0) {
      splitsProfitableStressed += 1;
    }
  }

  return {
    outOfSampleBase,
    outOfSampleStressed,
    calmarStressed: calmar(outOfSampleStressed),
    avgExposureScale: averageExposureScale(stressed),
    atReferenceCap: rescaleToCap(outOfSampleStressed, outOfSampleYears),
    splitsWithTrades: netBySplit.size,
    splitsProfitableStressed,
    splitsSelected: selections.filter((entry) => entry.selectedParams !== null).length,
    verdict: {
      mission: evaluateGate(outOfSampleStressed, outOfSampleBase, GATES.mission),
      repository: evaluateGate(outOfSampleStressed, outOfSampleBase, GATES.repository),
      scaleInvariantCore: scaleInvariantCore(outOfSampleStressed, outOfSampleBase),
    },
  };
}

function formatRow(label: string, aggregate: Aggregate): string {
  const stressed = aggregate.outOfSampleStressed;
  const cap = aggregate.atReferenceCap;
  const number = (value: number | null, digits: number, width: number): string =>
    (value === null ? 'n/a' : value.toFixed(digits)).padStart(width);
  return (
    `  ${label.padEnd(18)}` +
    `trades=${String(stressed.trades).padStart(5)} ` +
    `net(2x)=${number(stressed.netReturnPct, 2, 9)}% ` +
    `pf=${number(stressed.profitFactor, 3, 6)} ` +
    `DD=${number(stressed.maxDrawdownPct, 2, 7)} ` +
    `calmar=${number(aggregate.calmarStressed, 3, 7)} ` +
    `scale=${number(aggregate.avgExposureScale, 2, 5)} ` +
    `x@cap=${number(cap.exposureMultiplier, 3, 6)} ` +
    `ann@cap=${number(cap.annualizedPct, 2, 7)}% ` +
    `core=${aggregate.verdict.scaleInvariantCore.pass ? 'PASS' : 'FAIL'} ` +
    `mission=${aggregate.verdict.mission.pass ? 'PASS' : 'FAIL'}`
  );
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

interface Candidate {
  gridIndex: number;
  policyIndex: number;
  summary: TradeSummary;
  score: number;
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
  const outOfSampleBars = outOfSampleBarCount(plan.splits);
  const outOfSampleYears = (outOfSampleBars * FAMILY_HOURS_PER_BAR) / (24 * 365.25);
  process.stdout.write(
    `${plan.splits.length} rolling splits, ${outOfSampleBars} out-of-sample bars ` +
      `(${outOfSampleYears.toFixed(3)} years), ${plan.droppedTailBars} tail bars dropped\n`,
  );

  // Sizing series depend only on prices, so they are computed once and shared by every
  // family rather than recomputed per family.
  const sizingSeries = SIZING_POLICIES.map((policy) => buildSizingSeries(universe, policy));
  const sizingCoverage = SIZING_POLICIES.map((policy, policyIndex) => {
    let available = 0;
    let total = 0;
    let scaleTotal = 0;
    for (const series of universe) {
      const scales = sizingSeries[policyIndex].get(series.symbol);
      total += series.candles.length;
      if (!scales) {
        available += series.candles.length;
        scaleTotal += series.candles.length;
        continue;
      }
      for (const value of scales) {
        if (value !== undefined) {
          available += 1;
          scaleTotal += value;
        }
      }
    }
    return {
      policy,
      barsWithScale: available,
      barsTotal: total,
      meanScaleWhereAvailable: available > 0 ? scaleTotal / available : 0,
    };
  });
  for (const entry of sizingCoverage) {
    process.stdout.write(
      `  sizing ${entry.policy.id.padEnd(18)} bars=${entry.barsWithScale}/${entry.barsTotal} ` +
        `meanScale=${entry.meanScaleWhereAvailable.toFixed(3)}\n`,
    );
  }
  process.stdout.write('\n');

  const families: FamilyOutcome[] = [];

  for (const family of STRATEGY_FAMILIES) {
    const familyStart = Date.now();
    const built = family.grid.map((params) => ({ params, ...family.build(universe, params) }));
    const combinationsPerSplit = built.length * SIZING_POLICIES.length;

    const policyTrades = SIZING_POLICIES.map(() => ({
      base: [] as Trade[],
      stressed: [] as Trade[],
      selections: [] as SelectionRecord[],
    }));
    const integratedTrades = {
      base: [] as Trade[],
      stressed: [] as Trade[],
      selections: [] as SelectionRecord[],
    };

    for (const split of plan.splits) {
      const testFrom = new Date(universe[0].candles[split.testStart].t).toISOString();
      const testTo = new Date(universe[0].candles[split.testEnd - 1].t).toISOString();
      const trainRange = { start: split.trainStart, end: split.trainEnd };
      const testRange = { start: split.testStart, end: split.testEnd };

      const bestPerPolicy: (Candidate | null)[] = SIZING_POLICIES.map(() => null);
      const eligiblePerPolicy: number[] = SIZING_POLICIES.map(() => 0);
      let bestOverall: Candidate | null = null;
      let eligibleOverall = 0;

      for (let gridIndex = 0; gridIndex < built.length; gridIndex += 1) {
        for (let policyIndex = 0; policyIndex < SIZING_POLICIES.length; policyIndex += 1) {
          const trainTrades = tradesForRange(
            universe,
            built[gridIndex].bySymbol,
            sizingSeries[policyIndex],
            built[gridIndex].weight,
            family.id,
            split.index,
            trainRange,
            BASE_COSTS,
          );
          const summary = summarizeTrades(trainTrades);
          if (summary.trades < MIN_TRAIN_TRADES) {
            continue;
          }
          eligibleOverall += 1;
          eligiblePerPolicy[policyIndex] += 1;
          const candidate: Candidate = {
            gridIndex,
            policyIndex,
            summary,
            score: selectionScore(summary),
          };
          const incumbentForPolicy = bestPerPolicy[policyIndex];
          if (incumbentForPolicy === null || candidate.score > incumbentForPolicy.score) {
            bestPerPolicy[policyIndex] = candidate;
          }
          // Strict `>` keeps the earliest winner on a tie, and the unsized policy is
          // first, so a sizing overlay has to be strictly better in-sample to be chosen.
          if (bestOverall === null || candidate.score > bestOverall.score) {
            bestOverall = candidate;
          }
        }
      }

      const score = (
        target: { base: Trade[]; stressed: Trade[]; selections: SelectionRecord[] },
        candidate: Candidate | null,
        considered: number,
        eligible: number,
      ): void => {
        if (candidate === null) {
          target.selections.push({
            splitIndex: split.index,
            testFrom,
            testTo,
            selectedParams: null,
            selectedPolicyId: null,
            candidatesConsidered: considered,
            candidatesEligible: 0,
            inSampleNetReturnPct: null,
            inSampleMaxDrawdownPct: null,
            outOfSampleStressedNetReturnPct: null,
          });
          return;
        }
        const chosen = built[candidate.gridIndex];
        const scales = sizingSeries[candidate.policyIndex];
        const baseTrades = tradesForRange(
          universe,
          chosen.bySymbol,
          scales,
          chosen.weight,
          family.id,
          split.index,
          testRange,
          BASE_COSTS,
        );
        const stressedTrades = tradesForRange(
          universe,
          chosen.bySymbol,
          scales,
          chosen.weight,
          family.id,
          split.index,
          testRange,
          STRESSED_COSTS,
        );
        target.base.push(...baseTrades);
        target.stressed.push(...stressedTrades);
        target.selections.push({
          splitIndex: split.index,
          testFrom,
          testTo,
          selectedParams: chosen.params,
          selectedPolicyId: SIZING_POLICIES[candidate.policyIndex].id,
          candidatesConsidered: considered,
          candidatesEligible: eligible,
          inSampleNetReturnPct: candidate.summary.netReturnPct,
          inSampleMaxDrawdownPct: candidate.summary.maxDrawdownPct,
          outOfSampleStressedNetReturnPct: summarizeTrades(stressedTrades).netReturnPct,
        });
      };

      for (let policyIndex = 0; policyIndex < SIZING_POLICIES.length; policyIndex += 1) {
        score(
          policyTrades[policyIndex],
          bestPerPolicy[policyIndex],
          built.length,
          eligiblePerPolicy[policyIndex],
        );
      }
      score(integratedTrades, bestOverall, combinationsPerSplit, eligibleOverall);
    }

    const byPolicy: PolicyOutcome[] = SIZING_POLICIES.map((policy, policyIndex) => ({
      policyId: policy.id,
      selections: policyTrades[policyIndex].selections,
      ...buildAggregate(
        policyTrades[policyIndex].base,
        policyTrades[policyIndex].stressed,
        policyTrades[policyIndex].selections,
        outOfSampleYears,
      ),
    }));
    const integrated = {
      combinationsPerSplit,
      selections: integratedTrades.selections,
      ...buildAggregate(
        integratedTrades.base,
        integratedTrades.stressed,
        integratedTrades.selections,
        outOfSampleYears,
      ),
    };

    families.push({
      id: family.id,
      label: family.label,
      requires: family.requires,
      gridSize: family.grid.length,
      policyCount: SIZING_POLICIES.length,
      integrated,
      byPolicy,
    });

    process.stdout.write(
      `${family.id} -- ${family.label} (${built.length} param sets x ` +
        `${SIZING_POLICIES.length} policies, ${((Date.now() - familyStart) / 1000).toFixed(1)}s)\n`,
    );
    for (const outcome of byPolicy) {
      process.stdout.write(`${formatRow(outcome.policyId, outcome)}\n`);
    }
    const chosenPolicies = [
      ...new Set(
        integrated.selections
          .map((entry) => entry.selectedPolicyId)
          .filter((value): value is string => value !== null),
      ),
    ];
    process.stdout.write(
      `${formatRow('INTEGRATED', integrated)}  <- picked {${chosenPolicies.join(', ') || 'none'}}\n\n`,
    );
  }

  const payload = {
    schemaVersion: 1,
    study: 'walk-forward-risk-sizing',
    generatedAt: new Date().toISOString(),
    baselineStudy: 'QA/walk-forward-baseline/walk-forward-baseline-results.json',
    sealedHoldout: {
      fromInclusive: new Date(SEALED_HOLDOUT_FROM_MS).toISOString(),
      read: false,
      note:
        'Loaded through loadDevelopmentUniverse -> loadDevelopment*, which filter to bars before ' +
        '2024-01-01 and then re-assert the boundary. The sealed holdout was not opened, scored ' +
        'against, or tuned against by this run.',
    },
    tradingMode: {
      capital: 'simulated',
      note:
        'Paper/virtual capital only. This study places no orders and holds no exchange credentials; ' +
        'every P&L figure is a replay of archived candles under a modelled cost.',
    },
    costs: {
      perSideAssumptions: COST_ASSUMPTIONS,
      baseRoundTripPctOneBar: 0.13,
      stressedRoundTripPctOneBar: 0.26,
      stressMultipliers: { fee: 2, spread: 2, slippage: 2, funding: 2 },
    },
    splitPlan: {
      geometry: SPLIT_GEOMETRY,
      splits: plan.splits.length,
      outOfSampleBars,
      outOfSampleYears,
      droppedTailBars: plan.droppedTailBars,
    },
    sizing: {
      policies: SIZING_POLICIES,
      coverage: sizingCoverage,
      appliedAt: 'entry bar only; a position is not re-sized while it is open',
      missingInputRule: 'no volatility estimate at the entry bar means the trade is not taken',
    },
    selection: {
      objective: 'in-sample net return divided by max(1, in-sample max drawdown), base costs',
      minTrainTrades: MIN_TRAIN_TRADES,
      tieBreak: 'first candidate wins; the unsized policy is enumerated first',
      integratedNote:
        'The integrated result is the only reportable out-of-sample number per family: the sizing ' +
        'policy is selected in-sample alongside the parameters.',
      byPolicyNote:
        'The byPolicy matrix is five looks at the same out-of-sample data per family. Its best row ' +
        'is a multiple-comparison artefact and must not be reported as a result.',
    },
    gates: {
      ...GATES,
      referenceDrawdownCap: REFERENCE_DRAWDOWN_CAP,
      scaleInvarianceWarning:
        'Net return sign and profit factor are invariant under a constant exposure multiplier while ' +
        'the drawdown cap is not, so any family whose scaleInvariantCore passes would pass the full ' +
        'mission gate at some smaller constant exposure. atReferenceCap reports exactly what would ' +
        'be left of the return after that rescaling, which is the number worth judging.',
    },
    dataProvenance: {
      directory: 'QA/profitability-structural-remediation/data',
      coverage,
    },
    families,
  };

  const body = JSON.stringify(payload, null, 2);
  const digest = createHash('sha256').update(body).digest('hex');
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    OUTPUT_FILE,
    `${JSON.stringify({ ...payload, integrity: { contentSha256: digest } }, null, 2)}\n`,
    'utf8',
  );

  const missionPasses = families.filter((family) => family.integrated.verdict.mission.pass);
  const corePasses = families.filter(
    (family) => family.integrated.verdict.scaleInvariantCore.pass,
  );
  const ranked = [...families].sort(
    (left, right) =>
      (right.integrated.calmarStressed ?? -Infinity) - (left.integrated.calmarStressed ?? -Infinity),
  );

  process.stdout.write(
    `integrated: ${missionPasses.length}/${families.length} pass the mission gate as run ` +
      `(${missionPasses.map((family) => family.id).join(', ') || 'none'})\n`,
  );
  process.stdout.write(
    `integrated: ${corePasses.length}/${families.length} pass the scale-invariant core, i.e. would ` +
      `pass at some smaller constant exposure (${corePasses.map((family) => family.id).join(', ') || 'none'})\n`,
  );
  process.stdout.write('integrated ranking by calmar (net return / max drawdown, 2x costs):\n');
  for (const family of ranked) {
    const cap = family.integrated.atReferenceCap;
    process.stdout.write(
      `  ${family.id.padEnd(13)} calmar=${(family.integrated.calmarStressed ?? Number.NaN).toFixed(3).padStart(7)} ` +
        `ann@cap=${(cap.annualizedPct ?? Number.NaN).toFixed(2).padStart(7)}%\n`,
    );
  }
  process.stdout.write(`Results: ${path.relative(REPO_ROOT, OUTPUT_FILE)} (sha256 ${digest})\n`);
  process.stdout.write(`Completed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);
}

main();
