/**
 * Forward PAPER evaluation.
 *
 * These are behavioural tests, not string matches: they drive real bars through
 * the evaluator and assert the fills, the costs, the look-ahead guard, the
 * attribution and the improve/retain/demote verdicts. The final describe blocks
 * check the two properties that keep the loop safe — simulated rows are
 * recognised by the live-mirror guard, and the cycle reads them back.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateForwardEvidence,
  applyForwardEvidenceToContexts,
  averageTrueRange,
  forwardContextKey,
  forwardPositionToLog,
  isPaperForwardLog,
  logToForwardPosition,
  markForwardPosition,
  openForwardPosition,
  readForwardPositions,
  PAPER_FORWARD_SOURCE,
  type ForwardBar,
  type ForwardPosition,
  type ForwardPositionSeed,
} from '../services/paperForwardEvaluator';
import { isResearchOutcomeLog, RESEARCH_OUTCOME_SOURCE } from '../services/researchOutcomeFeedback';
import { transactionCostModelFromPerSideAssumptions, type TransactionCostModel } from '../services/transactionCosts';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** Flat 0.1% round-trip cost so PnL assertions stay readable. */
const FLAT_COST: TransactionCostModel = { feePct: 0.1, spreadPct: 0, fundingRate: 0, fundingIntervalBars: 8 };

const ENTRY_TS = 1_000;

function seed(overrides: Partial<ForwardPositionSeed> = {}): ForwardPositionSeed {
  return {
    cycleIndex: 4,
    jobId: 'autopilot:4:apexTrend:BTC-USDT:1h:LONG',
    strategyId: 'apexTrend',
    symbol: 'BTC-USDT',
    interval: '1h',
    direction: 'LONG',
    profileRevision: 7,
    consensusScore: 0.81,
    notionalBudgetUsd: 1_000,
    maxLossBudgetUsd: 60,
    expectedPnlPct: 6,
    mark: { symbol: 'BTC-USDT', interval: '1h', close: 100, atr: 2, timestamp: ENTRY_TS },
    maxHoldBars: 4,
    costModel: FLAT_COST,
    openedAt: 1_500,
    ...overrides,
  };
}

function open(overrides: Partial<ForwardPositionSeed> = {}): ForwardPosition {
  const position = openForwardPosition(seed(overrides));
  if (!position) throw new Error('expected a position');
  return position;
}

function bar(timestamp: number, high: number, low: number, close: number): ForwardBar {
  return { timestamp, high, low, close };
}

describe('forward position sizing and geometry', () => {
  it('places the stop on the loss side and the target on the profit side for both directions', () => {
    const long = open();
    expect(long.entryPrice).toBe(100);
    expect(long.stopPrice).toBe(97);      // 100 - 1.5 * ATR(2)
    expect(long.targetPrice).toBe(104.5); // 100 + 2.25 * ATR(2)

    const short = open({ direction: 'SHORT' });
    expect(short.stopPrice).toBe(103);
    expect(short.targetPrice).toBe(95.5);
  });

  it('sizes on the tighter of the notional and risk budgets, like the paper sizer', () => {
    // notional-bound: 1000/100 = 10 units, risk-bound: 60/3 = 20 units.
    expect(open().quantity).toBe(10);
    // risk-bound: 12/3 = 4 units is tighter than 1000/100 = 10.
    expect(open({ maxLossBudgetUsd: 12 }).quantity).toBe(4);
  });

  it('falls back to a percentage stop width instead of inventing risk from a zero ATR', () => {
    const flat = open({ mark: { symbol: 'BTC-USDT', interval: '1h', close: 100, atr: 0, timestamp: ENTRY_TS } });
    expect(flat.stopPrice).toBe(99.5);
    expect(flat.targetPrice).toBeGreaterThan(100);
  });

  it('refuses to open on a non-positive price or budget rather than emitting a junk sample', () => {
    expect(openForwardPosition(seed({ mark: { symbol: 'X', interval: '1h', close: 0, atr: 1, timestamp: 1 } }))).toBeNull();
    expect(openForwardPosition(seed({ notionalBudgetUsd: 0 }))).toBeNull();
    expect(openForwardPosition(seed({ maxLossBudgetUsd: -5 }))).toBeNull();
  });

  it('carries exact attribution back to strategy, context, profile revision and cycle', () => {
    const position = open();
    expect(position.id).toBe('paper-forward:4:autopilot:4:apexTrend:BTC-USDT:1h:LONG');
    expect(position.contextKey).toBe('apexTrend:BTC-USDT:1h:LONG');
    expect(position.contextKey).toBe(forwardContextKey(position));
    expect(position.profileRevision).toBe(7);
    expect(position.cycleIndex).toBe(4);
    expect(position.state).toBe('OPEN');
  });
});

describe('forward marking against bars that arrived later', () => {
  it('ignores every bar at or before the entry bar, so it cannot settle on data it already saw', () => {
    const position = open();
    // This bar would have hit the target, but it IS the entry bar.
    const marked = markForwardPosition(position, [bar(ENTRY_TS, 200, 50, 150)], 9_000);
    expect(marked.state).toBe('OPEN');
    expect(marked.barsHeld).toBe(0);
    expect(marked.netPnlPct).toBe(0);
  });

  it('closes a LONG on the target and deducts the round-trip cost', () => {
    const marked = markForwardPosition(open(), [bar(2_000, 105, 99, 104.8)], 9_000);
    expect(marked.state).toBe('CLOSED');
    expect(marked.exitReason).toBe('TARGET');
    expect(marked.exitPrice).toBe(104.5);
    expect(marked.grossPnlPct).toBe(4.5);
    expect(marked.costPct).toBe(0.1);
    expect(marked.netPnlPct).toBe(4.4);
    expect(marked.netPnlUsd).toBe(44);
    expect(marked.closedAt).toBe(2_000);
  });

  it('closes a LONG on the stop', () => {
    const marked = markForwardPosition(open(), [bar(2_000, 101, 96, 96.5)], 9_000);
    expect(marked.exitReason).toBe('STOP');
    expect(marked.grossPnlPct).toBe(-3);
    expect(marked.netPnlPct).toBe(-3.1);
  });

  it('mirrors the logic for SHORT', () => {
    const short = open({ direction: 'SHORT' });
    expect(markForwardPosition(short, [bar(2_000, 101, 95, 95.2)], 9_000).exitReason).toBe('TARGET');
    expect(markForwardPosition(short, [bar(2_000, 104, 99, 103.5)], 9_000).exitReason).toBe('STOP');
  });

  it('resolves a bar that spans both levels to the STOP rather than flattering the evidence', () => {
    const marked = markForwardPosition(open(), [bar(2_000, 106, 96, 105)], 9_000);
    expect(marked.exitReason).toBe('STOP');
    expect(marked.netPnlPct).toBeLessThan(0);
  });

  it('times out at max hold and exits on that bar close', () => {
    const position = open({ maxHoldBars: 2 });
    const marked = markForwardPosition(position, [
      bar(2_000, 101, 99, 100.5),
      bar(3_000, 102.5, 100, 102),
    ], 9_000);
    expect(marked.exitReason).toBe('MAX_HOLD');
    expect(marked.barsHeld).toBe(2);
    expect(marked.exitPrice).toBe(102);
    expect(marked.netPnlPct).toBe(1.9);
  });

  it('stays open with a live unrealized mark while nothing has resolved', () => {
    const marked = markForwardPosition(open({ maxHoldBars: 8 }), [
      bar(2_000, 101, 99, 100.5),
      bar(3_000, 101.5, 100, 101),
    ], 9_000);
    expect(marked.state).toBe('OPEN');
    expect(marked.barsHeld).toBe(2);
    expect(marked.markPrice).toBe(101);
    expect(marked.exitReason).toBeNull();
  });

  it('never re-opens or re-prices a closed position', () => {
    const closed = markForwardPosition(open(), [bar(2_000, 105, 99, 104.8)], 9_000);
    expect(markForwardPosition(closed, [bar(4_000, 300, 1, 250)], 10_000)).toEqual(closed);
  });

  it('charges the real per-side assumptions when the cycle model is used', () => {
    const model = transactionCostModelFromPerSideAssumptions({
      commissionPctPerSide: 0.04, slippagePctPerSide: 0.05, fundingPctEstimate: 0.01,
    });
    const marked = markForwardPosition(open({ costModel: model }), [bar(2_000, 105, 99, 104.8)], 9_000);
    // No configured UTC funding event crosses this synthetic timestamp range.
    expect(marked.costPct).toBe(0.18);
    expect(marked.netPnlPct).toBe(4.32);
  });

  it('sorts unordered bars before walking them', () => {
    const marked = markForwardPosition(open({ maxHoldBars: 5 }), [
      bar(4_000, 106, 96, 105),
      bar(2_000, 105, 99, 104.8),
    ], 9_000);
    // The target bar is chronologically first, so TARGET wins over the later stop.
    expect(marked.exitReason).toBe('TARGET');
    expect(marked.barsHeld).toBe(1);
  });
});

describe('forward state round-trips through the existing decision-row shape', () => {
  it('restores an identical position from its stored row', () => {
    const position = markForwardPosition(open(), [bar(2_000, 105, 99, 104.8)], 9_000);
    expect(logToForwardPosition(forwardPositionToLog(position))).toEqual(position);
  });

  it('keeps one stable row id across marks so re-emitting updates rather than duplicates', () => {
    const position = open();
    const openRow = forwardPositionToLog(position);
    const closedRow = forwardPositionToLog(markForwardPosition(position, [bar(2_000, 105, 99, 104.8)], 9_000));
    expect(closedRow.id).toBe(openRow.id);
    expect(openRow.laterOutcome).toBe('UNKNOWN');
    expect(openRow.laterPnl).toBeUndefined();
    expect(closedRow.laterOutcome).toBe('WIN');
    expect(closedRow.laterPnl).toBe(4.4);
  });

  it('scores a losing close as LOSS and a costed-to-zero close as BREAKEVEN', () => {
    const loser = markForwardPosition(open(), [bar(2_000, 101, 96, 96.5)], 9_000);
    expect(forwardPositionToLog(loser).laterOutcome).toBe('LOSS');

    const zeroCost = open({ costModel: { feePct: 0, spreadPct: 0, fundingRate: 0 }, maxHoldBars: 1 });
    const flat = markForwardPosition(zeroCost, [bar(2_000, 101, 99, 100)], 9_000);
    expect(forwardPositionToLog(flat).laterOutcome).toBe('BREAKEVEN');
  });

  it('rejects foreign, corrupt or truncated rows instead of scoring them as zero-PnL samples', () => {
    expect(logToForwardPosition({ marketSnapshotSummary: undefined })).toBeNull();
    expect(logToForwardPosition({ marketSnapshotSummary: { source: 'LIVE_SCAN', researchOnly: false } })).toBeNull();
    expect(logToForwardPosition({
      marketSnapshotSummary: { source: PAPER_FORWARD_SOURCE, researchOnly: true },
    })).toBeNull();
    expect(logToForwardPosition({
      marketSnapshotSummary: { source: PAPER_FORWARD_SOURCE, researchOnly: true, forward: { id: 'x' } },
    })).toBeNull();
    expect(readForwardPositions([
      forwardPositionToLog(open()),
      { marketSnapshotSummary: { source: RESEARCH_OUTCOME_SOURCE, researchOnly: true } },
    ])).toHaveLength(1);
  });
});

describe('SAFETY — simulated forward rows can never reach live adaptation', () => {
  it('is recognised by the guard that filters the live decision-memory mirror', () => {
    const row = forwardPositionToLog(open());
    expect(isPaperForwardLog(row)).toBe(true);
    // This is the assertion that matters: server.ts filters the LIVE mirror with
    // isResearchOutcomeLog, so a forward row must be caught by it too.
    expect(isResearchOutcomeLog(row)).toBe(true);
  });

  it('does not widen the guard to genuine live scanner rows', () => {
    expect(isResearchOutcomeLog({ marketSnapshotSummary: { source: 'LIVE_SCAN', researchOnly: false } })).toBe(false);
    expect(isResearchOutcomeLog({ marketSnapshotSummary: { researchOnly: true } })).toBe(false);
    expect(isResearchOutcomeLog({ marketSnapshotSummary: { source: PAPER_FORWARD_SOURCE, researchOnly: false } })).toBe(false);
  });

  it('stamps every row research/paper-only with no execution authority', () => {
    const summary = forwardPositionToLog(open()).marketSnapshotSummary as Record<string, unknown>;
    expect(summary.researchOnly).toBe(true);
    expect(summary.paperOnly).toBe(true);
    expect(summary.simulated).toBe(true);
    expect(summary.executionAuthorized).toBe(false);
    expect(summary.orderSubmissionAllowed).toBe(false);
  });

  it('holds no clock, no network and no filesystem of its own', () => {
    const source = read('src/services/paperForwardEvaluator.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).not.toMatch(/setInterval|setTimeout|fetch\(|readFileSync|writeFileSync/);
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/submitOrder|placeOrder|executeTrade|exchangeSession/);
  });
});

describe('aggregated forward evidence drives improve / retain / demote', () => {
  const closedAt = (netPnlPct: number, index: number, overrides: Partial<ForwardPosition> = {}): ForwardPosition => ({
    ...open(),
    id: `paper-forward:${index}:job-${index}`,
    cycleIndex: index,
    state: 'CLOSED',
    barsHeld: 2,
    exitReason: netPnlPct >= 0 ? 'TARGET' : 'STOP',
    exitPrice: 100 + netPnlPct,
    closedAt: 2_000 + index,
    grossPnlPct: netPnlPct + 0.1,
    costPct: 0.1,
    netPnlPct,
    netPnlUsd: netPnlPct * 10,
    ...overrides,
  });

  it('refuses to call thin evidence a pass', () => {
    const report = aggregateForwardEvidence([closedAt(3, 1), closedAt(2, 2)]);
    expect(report.entries[0].verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(report.demotedContextKeys).toEqual([]);
    expect(report.resolvedPositions).toBe(2);
  });

  it('demotes a context that loses money forward after costs', () => {
    const report = aggregateForwardEvidence([closedAt(-2, 1), closedAt(-1, 2), closedAt(0.5, 3)]);
    const entry = report.entries[0];
    expect(entry.verdict).toBe('DEMOTE');
    expect(entry.meanNetPnlPct).toBeLessThan(0);
    expect(entry.losses).toBe(2);
    expect(report.demotedContextKeys).toEqual(['apexTrend:BTC-USDT:1h:LONG']);
  });

  it('flags a strong, mostly-winning context as IMPROVE', () => {
    const report = aggregateForwardEvidence([closedAt(3, 1), closedAt(2, 2), closedAt(-0.5, 3)]);
    const entry = report.entries[0];
    expect(entry.verdict).toBe('IMPROVE');
    expect(entry.winRatePct).toBeCloseTo(66.6667, 3);
    expect(report.improveContextKeys).toEqual(['apexTrend:BTC-USDT:1h:LONG']);
  });

  it('retains a marginally profitable context without promoting it', () => {
    const report = aggregateForwardEvidence([closedAt(0.2, 1), closedAt(0.1, 2), closedAt(0.05, 3)]);
    expect(report.entries[0].verdict).toBe('RETAIN');
  });

  it('measures how far forward reality fell short of the replay expectation', () => {
    // expectedPnlPct is 6 on every seeded position.
    const report = aggregateForwardEvidence([closedAt(1, 1), closedAt(2, 2), closedAt(3, 3)]);
    expect(report.entries[0].meanExpectationGapPct).toBe(-4);
  });

  it('separates contexts and counts positions still running', () => {
    const other = closedAt(5, 9, {
      contextKey: 'apexTrend:ETH-USDT:1h:LONG', symbol: 'ETH-USDT',
    });
    const report = aggregateForwardEvidence([closedAt(1, 1), other, { ...open(), state: 'OPEN' }]);
    expect(report.entries.map((entry) => entry.contextKey)).toEqual([
      'apexTrend:BTC-USDT:1h:LONG',
      'apexTrend:ETH-USDT:1h:LONG',
    ]);
    expect(report.openPositions).toBe(1);
    expect(report.resolvedPositions).toBe(2);
  });

  it('reports itself as research-only evidence', () => {
    const report = aggregateForwardEvidence([]);
    expect(report.researchOnly).toBe(true);
    expect(report.executionAuthorized).toBe(false);
  });
});

describe('the next cycle narrows its research rotation on that evidence', () => {
  const context = (strategyId: string, symbol: string) => ({
    id: `${strategyId}:${symbol}:1h:LONG`,
    strategyId, symbol, interval: '1h', direction: 'LONG' as const,
  });
  const contexts = [context('apexTrend', 'BTC-USDT'), context('apexTrend', 'ETH-USDT'), context('meanRev', 'BTC-USDT')];

  const demoting = (...keys: string[]) => ({
    version: 'paper_forward_evaluation_v1' as const,
    entries: keys.map((contextKey) => ({
      contextKey, strategyId: 'x', symbol: 'x', interval: '1h', direction: 'LONG' as const,
      resolved: 3, open: 0, wins: 0, losses: 3, breakeven: 0, winRatePct: 0,
      meanNetPnlPct: -1, totalNetPnlUsd: -30, worstNetPnlPct: -2, meanCostPct: 0.1,
      meanExpectationGapPct: -5, lastClosedAt: 1, lastCycleIndex: 1, verdict: 'DEMOTE' as const,
    })),
    demotedContextKeys: keys,
    improveContextKeys: [],
    resolvedPositions: keys.length * 3,
    openPositions: 0,
    researchOnly: true as const,
    executionAuthorized: false as const,
  });

  it('drops demoted contexts and preserves the plan ordering of the rest', () => {
    const result = applyForwardEvidenceToContexts(contexts, demoting('apexTrend:ETH-USDT:1h:LONG'));
    expect(result.contexts.map((row) => row.id)).toEqual(['apexTrend:BTC-USDT:1h:LONG', 'meanRev:BTC-USDT:1h:LONG']);
    expect(result.demoted).toEqual([{
      id: 'apexTrend:ETH-USDT:1h:LONG',
      contextKey: 'apexTrend:ETH-USDT:1h:LONG',
      reason: 'FORWARD_EVIDENCE_DEMOTED',
      meanNetPnlPct: -1,
      resolved: 3,
    }]);
  });

  it('is a no-op when nothing is demoted', () => {
    const result = applyForwardEvidenceToContexts(contexts, demoting());
    expect(result.contexts).toHaveLength(3);
    expect(result.demoted).toEqual([]);
  });

  it('never starves the loop: a floor of contexts survives even if everything is demoted', () => {
    const all = contexts.map((row) => `${row.strategyId}:${row.symbol}:1h:LONG`);
    const result = applyForwardEvidenceToContexts(contexts, demoting(...all));
    expect(result.contexts).toHaveLength(1);
    expect(result.demoted).toHaveLength(2);
  });
});

describe('lifecycle wiring — the loop is actually connected', () => {
  const routes = read('src/services/apexNextMarketRoutes.ts');
  const server = read('server.ts');

  it('reads prior forward evidence at the start of a cycle and applies it to the rotation', () => {
    expect(routes).toContain('readForwardPositions(options?.researchOutcomeLogProvider?.() ?? [])');
    expect(routes).toContain('markOpenForwardPositions(priorForwardPositions, Date.now())');
    expect(routes).toContain('forwardEvidence = aggregateForwardEvidence(priorForwardPositions)');
    expect(routes).toContain('applyForwardEvidenceToContexts(researchContexts, forwardEvidence, { minRetained: 1 })');
    // The optimizer must iterate the narrowed set, not the original plan.
    expect(routes).toContain('const context = researchContexts[index];');
  });

  it('opens a forward position per approved council slot with exact attribution', () => {
    expect(routes).toContain('openForwardPositionsForPlan({');
    expect(routes).toContain('plans: multiAgent.paperTradePlan,');
    expect(routes).toContain('profileRevision: attribution.activeRevision,');
    expect(routes).toContain('expectedPnlPct: args.expectedPnlPctByJobId[plan.id] ?? null,');
    expect(routes).toContain('costModel: transactionCostModelFromPerSideAssumptions({');
    // One shared job-id builder, so replay rows and forward rows agree.
    expect(routes).toContain('const jobIdFor = (contextId: string): string => `autopilot:${cycleIndex}:${contextId}`;');
  });

  it('will not act on a plan that ever claimed order authority', () => {
    expect(routes).toContain('if (plan.orderSubmissionAllowed !== false || plan.requiresManualConfirmation !== true) continue;');
  });

  it('routes simulated rows to the research store and never to the live mirror', () => {
    expect(server).toContain('researchOutcomeLogProvider: () => (researchOutcomeMemory ? researchOutcomeMemory.exportAll() : [])');
    expect(server).toContain('researchOutcomeMemory.putMany(logs)');
    expect(server).toContain('.filter((row) => !isResearchOutcomeLog(row))');
    // The forward sink must be the research one.
    expect(routes).toContain('options?.onResearchOutcomeLogs?.(forwardOpened.map(forwardPositionToLog))');
    expect(routes).not.toMatch(/onShadowLogs\?\.\((?:[^)]*forward)/i);
  });

  it('surfaces the forward loop on the cycle payload without claiming execution authority', () => {
    expect(routes).toContain('forwardEvaluation,');
    expect(routes).toContain('writesLiveDecisionMemory: false,');
    expect(routes).toContain('demotedContexts: forwardDemotions,');
  });
});
