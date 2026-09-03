/**
 * Research/paper outcome feedback.
 *
 * The lifecycle audit found the loop's last break: Smart Autopilot produced a
 * paper plan and a research replay, but nothing recorded what actually happened,
 * so "monitor → improve → repeat" had no memory. Expected performance (the
 * optimizer's development-validation expectation) was never compared against realized performance (the
 * replay of the promoted profile).
 *
 * This module closes that break by translating one completed cycle into the
 * project's existing `SignalDecisionLog` vocabulary, so the outcomes are stored,
 * queried and exported by the same `DecisionMemoryMirror` the rest of APEX
 * already uses. It introduces no new persistence format and no new store class.
 *
 * ---------------------------------------------------------------------------
 * SAFETY BOUNDARY — read before changing this file.
 *
 * These rows describe SIMULATED replays, not live fills. The live decision
 * memory mirror is the evidence base for
 * `adaptiveThresholdGovernance.propose()`, which moves LIVE scanner thresholds.
 * Simulated outcomes must therefore never be written into that live mirror, or
 * a backtest could silently retune live gating.
 *
 * Every row this module emits is stamped `researchOnly: true` with a
 * `RESEARCH_OUTCOME_SOURCE` provenance marker, and the caller writes them to a
 * research-scoped mirror with its own file path. `isResearchOutcomeLog` lets any
 * consumer — including the live proposal path — assert that it is not looking at
 * simulated evidence.
 * ---------------------------------------------------------------------------
 */
import type { SignalDecisionLog } from '../types';
import { PAPER_FORWARD_SOURCE } from './paperForwardEvaluator';
import type { CommanderOutcomeAttributionV1, CommanderResearchComparisonV1 } from '../contracts/commander/commanderOutcomeContracts';

export const RESEARCH_OUTCOME_VERSION = 'research_outcome_feedback_v1';
export const RESEARCH_OUTCOME_SOURCE = 'SMART_AUTOPILOT_RESEARCH_REPLAY';

/**
 * Every provenance marker that means "this row is simulated".
 *
 * `isResearchOutcomeLog` below is the guard that keeps simulated evidence out of
 * the live decision-memory mirror, so a new kind of simulated row MUST be added
 * here at the same time it is introduced. Missing an entry would let forward
 * paper rows read as live scanner evidence.
 */
export const SIMULATED_DECISION_SOURCES: ReadonlySet<string> = new Set([
  RESEARCH_OUTCOME_SOURCE,
  PAPER_FORWARD_SOURCE,
]);

/** Minimal shape this module needs from the research orchestrator. */
export interface ResearchOutcomeJob {
  id: string;
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  metrics: {
    totalPnlPct: number;
    maxDrawdownPct: number;
    profitFactor: number | null;
    tradeCount: number;
    winRatePct?: number;
    dataState: string;
    historyComplete: boolean;
  } | null;
  utility: number | null;
  error: string | null;
}

/** Minimal shape this module needs from the paper council. */
export interface ResearchOutcomePaperSlot {
  id: string;
  strategyId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  consensusScore: number;
  notionalBudgetUsd: number;
}

export interface ResearchOutcomeInput {
  cycleIndex: number;
  generatedAt: number;
  jobs: ResearchOutcomeJob[];
  paperTradePlan: ResearchOutcomePaperSlot[];
  /** Optimizer development-validation expectation per context id, when one was produced. */
  expectedPnlPctByJobId?: Record<string, number | null>;
  /** Exact SHADOW Commander identity carried by the producing lifecycle. */
  commanderAttributionByJobId?: Record<string, CommanderOutcomeAttributionV1 | undefined>;
  /** SHADOW comparison only; this never filters the jobs supplied above. */
  commanderResearchComparisonByJobId?: Record<string, CommanderResearchComparisonV1 | undefined>;
}

export interface ResearchOutcomeSummary {
  version: typeof RESEARCH_OUTCOME_VERSION;
  cycleIndex: number;
  recorded: number;
  paperSelected: number;
  wins: number;
  losses: number;
  breakeven: number;
  unresolved: number;
  /** Mean realized minus expected pnl%, or null when no pair was comparable. */
  meanExpectationGapPct: number | null;
  /** Contexts whose realized replay underperformed the optimizer development-validation expectation. */
  underperformingJobIds: string[];
  commanderShadowComparison: CommanderResearchComparisonSummaryV1;
  researchOnly: true;
  executionAuthorized: false;
}

export interface CommanderResearchComparisonSummaryV1 {
  version: 'commander_research_comparison_summary_v1';
  available: number;
  selected: number;
  suppressed: number;
  abstained: number;
  selectedMeanPnlPct: number | null;
  suppressedMeanPnlPct: number | null;
  abstainedMeanPnlPct: number | null;
  shadowOnly: true;
  researchRoutingApplied: false;
}

const round = (value: number, places = 6): number => Number(value.toFixed(places));

function validCommanderResearchComparison(
  job: ResearchOutcomeJob,
  value: CommanderResearchComparisonV1 | undefined,
): value is CommanderResearchComparisonV1 {
  return Boolean(value
    && value.version === 'commander_research_comparison_v1'
    && value.shadowOnly === true
    && value.researchRoutingApplied === false
    && ['SELECT', 'SUPPRESS', 'ABSTAIN'].includes(value.disposition)
    && value.strategyId === job.strategyId
    && value.symbol === job.symbol
    && value.interval === job.interval
    && value.direction === job.direction);
}

/**
 * True when a decision row came from simulated research rather than live
 * scanning. Consumers that feed live adaptation MUST reject these.
 *
 * Covers both simulated kinds: the replay outcomes built below and the forward
 * paper positions in paperForwardEvaluator.
 */
export function isResearchOutcomeLog(row: Pick<SignalDecisionLog, 'marketSnapshotSummary'>): boolean {
  const summary = row.marketSnapshotSummary as Record<string, unknown> | undefined;
  return Boolean(
    summary
    && summary.researchOnly === true
    && typeof summary.source === 'string'
    && SIMULATED_DECISION_SOURCES.has(summary.source),
  );
}

/**
 * Convert one completed Smart Autopilot cycle into decision-memory rows.
 *
 * Pure and deterministic: ids derive from the cycle index and job id, never
 * from a clock or random source, so re-recording a cycle overwrites rather than
 * duplicates.
 */
export function buildResearchOutcomeLogs(input: ResearchOutcomeInput): SignalDecisionLog[] {
  const paperById = new Map(input.paperTradePlan.map((slot) => [slot.id, slot]));
  const expected = input.expectedPnlPctByJobId ?? {};
  const rows: SignalDecisionLog[] = [];

  for (const job of input.jobs) {
    const selected = paperById.get(job.id);
    const metrics = job.status === 'COMPLETED' ? job.metrics : null;
    const expectedPnlPct = Number.isFinite(expected[job.id] as number) ? Number(expected[job.id]) : null;
    const commanderAttribution = input.commanderAttributionByJobId?.[job.id];
    const comparisonCandidate = input.commanderResearchComparisonByJobId?.[job.id];
    const commanderResearchComparison = validCommanderResearchComparison(job, comparisonCandidate) ? comparisonCandidate : undefined;

    // An unresolved replay stays UNKNOWN rather than being scored as a loss.
    let laterOutcome: SignalDecisionLog['laterOutcome'];
    if (!metrics) laterOutcome = 'UNKNOWN';
    else if (metrics.totalPnlPct > 0) laterOutcome = 'WIN';
    else if (metrics.totalPnlPct < 0) laterOutcome = 'LOSS';
    else laterOutcome = 'BREAKEVEN';

    const decision: SignalDecisionLog['decision'] = selected ? 'ACCEPTED' : 'REJECTED';
    const reasonCode: SignalDecisionLog['reasonCode'] = job.status !== 'COMPLETED'
      ? 'EVALUATION_ERROR'
      : selected
        ? 'ACCEPTED_BEST_CANDIDATE'
        : 'LOWER_RANK_THAN_BEST';

    const reasonText = job.status !== 'COMPLETED'
      ? `Research replay did not complete: ${job.error || 'unknown_error'}`
      : selected
        ? `Paper council allocated ${round(selected.notionalBudgetUsd, 2)} USD notional at consensus ${round(selected.consensusScore, 4)}.`
        : 'Completed research replay was not selected into the paper portfolio.';

    rows.push({
      id: `research-outcome:${input.cycleIndex}:${job.id}`,
      cycleId: `autopilot-research:${input.cycleIndex}`,
      timestamp: input.generatedAt,
      isoTime: new Date(input.generatedAt).toISOString(),
      ticker: job.symbol,
      direction: job.direction,
      decision,
      reasonCode,
      reasonText,
      laterOutcome,
      laterPnl: metrics ? round(metrics.totalPnlPct) : undefined,
      // Provenance marker — the guard that keeps simulated rows out of live
      // adaptation. Do not remove without updating isResearchOutcomeLog.
      marketSnapshotSummary: {
        source: RESEARCH_OUTCOME_SOURCE,
        version: RESEARCH_OUTCOME_VERSION,
        researchOnly: true,
        paperOnly: true,
        executionAuthorized: false,
        simulated: true,
        strategyId: job.strategyId,
        interval: job.interval,
        jobId: job.id,
        utility: job.utility,
        expectedPnlPct,
        realizedPnlPct: metrics ? round(metrics.totalPnlPct) : null,
        expectationGapPct: metrics && expectedPnlPct !== null ? round(metrics.totalPnlPct - expectedPnlPct) : null,
        maxDrawdownPct: metrics ? round(metrics.maxDrawdownPct) : null,
        profitFactor: metrics ? metrics.profitFactor : null,
        tradeCount: metrics ? metrics.tradeCount : null,
        winRatePct: metrics && metrics.winRatePct !== undefined ? round(metrics.winRatePct) : null,
        dataState: metrics ? metrics.dataState : null,
        historyComplete: metrics ? metrics.historyComplete : null,
        paperSelected: Boolean(selected),
        ...(commanderAttribution ? { commanderAttribution } : {}),
        ...(commanderResearchComparison ? { commanderResearchComparison } : {}),
      },
    });
  }

  return rows;
}

/** Aggregate the rows above into the summary surfaced on the cycle payload. */
export function summarizeResearchOutcomes(
  input: ResearchOutcomeInput,
  rows: SignalDecisionLog[],
): ResearchOutcomeSummary {
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let unresolved = 0;
  const gaps: number[] = [];
  const underperformingJobIds: string[] = [];
  const comparisonPnl: Record<CommanderResearchComparisonV1['disposition'], number[]> = { SELECT: [], SUPPRESS: [], ABSTAIN: [] };

  for (const row of rows) {
    if (row.laterOutcome === 'WIN') wins += 1;
    else if (row.laterOutcome === 'LOSS') losses += 1;
    else if (row.laterOutcome === 'BREAKEVEN') breakeven += 1;
    else unresolved += 1;

    const summary = row.marketSnapshotSummary as Record<string, unknown> | undefined;
    const gap = summary?.expectationGapPct;
    if (typeof gap === 'number' && Number.isFinite(gap)) {
      gaps.push(gap);
      if (gap < 0) underperformingJobIds.push(String(summary?.jobId ?? row.id));
    }
    const comparison = summary?.commanderResearchComparison as CommanderResearchComparisonV1 | undefined;
    const realizedPnl = summary?.realizedPnlPct;
    if (comparison?.version === 'commander_research_comparison_v1'
      && comparison.shadowOnly === true
      && comparison.researchRoutingApplied === false
      && typeof realizedPnl === 'number'
      && Number.isFinite(realizedPnl)
      && comparisonPnl[comparison.disposition]) comparisonPnl[comparison.disposition].push(realizedPnl);
  }

  const mean = (values: number[]): number | null => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  const commanderShadowComparison: CommanderResearchComparisonSummaryV1 = {
    version: 'commander_research_comparison_summary_v1',
    available: comparisonPnl.SELECT.length + comparisonPnl.SUPPRESS.length + comparisonPnl.ABSTAIN.length,
    selected: comparisonPnl.SELECT.length,
    suppressed: comparisonPnl.SUPPRESS.length,
    abstained: comparisonPnl.ABSTAIN.length,
    selectedMeanPnlPct: mean(comparisonPnl.SELECT),
    suppressedMeanPnlPct: mean(comparisonPnl.SUPPRESS),
    abstainedMeanPnlPct: mean(comparisonPnl.ABSTAIN),
    shadowOnly: true,
    researchRoutingApplied: false,
  };

  return {
    version: RESEARCH_OUTCOME_VERSION,
    cycleIndex: input.cycleIndex,
    recorded: rows.length,
    paperSelected: input.paperTradePlan.length,
    wins,
    losses,
    breakeven,
    unresolved,
    meanExpectationGapPct: gaps.length ? round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : null,
    underperformingJobIds,
    commanderShadowComparison,
    researchOnly: true,
    executionAuthorized: false,
  };
}
