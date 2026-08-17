/**
 * Research/paper outcome feedback tests.
 *
 * The safety-critical rule these lock: simulated replay outcomes are recorded so
 * the improvement loop has memory, but they must never become evidence for live
 * scanner threshold adaptation, and they must never carry execution authority.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  RESEARCH_OUTCOME_SOURCE,
  RESEARCH_OUTCOME_VERSION,
  buildResearchOutcomeLogs,
  isResearchOutcomeLog,
  summarizeResearchOutcomes,
  type ResearchOutcomeInput,
  type ResearchOutcomeJob,
} from '../services/researchOutcomeFeedback';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const GENERATED_AT = 1_700_000_000_000;

function job(overrides: Partial<ResearchOutcomeJob> = {}): ResearchOutcomeJob {
  return {
    id: 'autopilot:0:orbVwapBreakout:BTC-USDT:1h:LONG',
    strategyId: 'orbVwapBreakout',
    symbol: 'BTC-USDT',
    interval: '1h',
    direction: 'LONG',
    status: 'COMPLETED',
    metrics: {
      totalPnlPct: 4.5,
      maxDrawdownPct: 6.2,
      profitFactor: 1.4,
      tradeCount: 18,
      winRatePct: 55,
      dataState: 'live',
      historyComplete: true,
    },
    utility: 3.1,
    error: null,
    ...overrides,
  };
}

function input(overrides: Partial<ResearchOutcomeInput> = {}): ResearchOutcomeInput {
  return {
    cycleIndex: 0,
    generatedAt: GENERATED_AT,
    jobs: [job()],
    paperTradePlan: [{
      id: 'autopilot:0:orbVwapBreakout:BTC-USDT:1h:LONG',
      strategyId: 'orbVwapBreakout',
      symbol: 'BTC-USDT',
      direction: 'LONG',
      consensusScore: 0.72,
      notionalBudgetUsd: 12_500,
    }],
    ...overrides,
  };
}

describe('research outcome feedback — provenance and contamination boundary', () => {
  it('marks every row as simulated research, never live evidence', () => {
    for (const row of buildResearchOutcomeLogs(input())) {
      const summary = row.marketSnapshotSummary as Record<string, unknown>;
      expect(summary.source).toBe(RESEARCH_OUTCOME_SOURCE);
      expect(summary.researchOnly).toBe(true);
      expect(summary.paperOnly).toBe(true);
      expect(summary.simulated).toBe(true);
      expect(summary.executionAuthorized).toBe(false);
      expect(isResearchOutcomeLog(row)).toBe(true);
    }
  });

  it('does not misclassify a genuine live scanner row as research', () => {
    expect(isResearchOutcomeLog({ marketSnapshotSummary: undefined })).toBe(false);
    expect(isResearchOutcomeLog({ marketSnapshotSummary: {} })).toBe(false);
    expect(isResearchOutcomeLog({ marketSnapshotSummary: { source: 'LIVE_SCAN', researchOnly: false } })).toBe(false);
    // A row that only claims researchOnly, without the source marker, is not ours.
    expect(isResearchOutcomeLog({ marketSnapshotSummary: { researchOnly: true } })).toBe(false);
  });

  it('keeps the live adaptive proposal path free of simulated rows', () => {
    const server = read('server.ts');
    expect(server).toContain('.filter((row) => !isResearchOutcomeLog(row))');
    expect(server).toContain('adaptiveThresholdGovernance.propose(liveLogs)');
    // The research store must be a separate file from the live mirror.
    expect(server).toContain('researchOutcomeMemory');
    expect(server).toContain('research-outcome-memory-v1.json');
    expect(server).toContain('onResearchOutcomeLogs');
    // Simulated rows must not be routed into the live mirror.
    expect(server).not.toContain('decisionMemoryMirror.putMany(logs)\n    }\n  },\n  onResearchOutcomeLogs');
  });

  it('keeps live approval manual — nothing auto-approves a proposal', () => {
    const server = read('server.ts');
    const routes = read('src/services/apexNextMarketRoutes.ts');
    // The only approve() call is the operator-driven route.
    expect(server.match(/adaptiveThresholdGovernance\.approve\(/g)?.length).toBe(1);
    expect(server).toContain("app.post('/api/operations/adaptive-thresholds/approve'");
    // The autopilot cycle never touches governance approval at all.
    expect(routes).not.toContain('adaptiveThresholdGovernance');
  });
});

describe('research outcome feedback — outcome classification', () => {
  it('carries an exact Commander attribution only when the producing lifecycle supplies it', () => {
    const attribution = {
      version: 'commander_outcome_attribution_v1' as const,
      decisionId: 'decision-1', strategyId: 'orbVwapBreakout', strategyVersion: '1', parameterProfileFingerprint: 'profile-1',
      opportunityFingerprint: 'opportunity-1', evidenceFingerprint: 'evidence-1', evidenceIds: ['row-1'], symbol: 'BTC-USDT', interval: '1h',
      evidence: [{ evidenceId: 'row-1', expertId: 'apex.momentum', expertVersion: '1', family: 'MOMENTUM' as const, timeframe: '1h', direction: 'LONG' as const, confidence: 0.7, valueQuality: 'VALID' as const }],
      direction: 'LONG' as const, regime: 'TREND_UP' as const, thesis: 'TREND_CONTINUATION' as const, trendRelation: 'WITH_TREND' as const,
      predictedConfidence: 0.72,
    };
    const jobId = job().id;
    const tagged = buildResearchOutcomeLogs(input({ commanderAttributionByJobId: { [jobId]: attribution } }))[0];
    expect(tagged.marketSnapshotSummary?.commanderAttribution).toEqual(attribution);
    expect(buildResearchOutcomeLogs(input())[0].marketSnapshotSummary).not.toHaveProperty('commanderAttribution');
  });

  it('summarizes Commander research dispositions without applying routing', () => {
    const comparisons = {
      selected: { version: 'commander_research_comparison_v1' as const, decisionId: 'd1', strategyId: 'orbVwapBreakout', strategyVersion: '1', parameterProfileFingerprint: 'p1', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' as const, disposition: 'SELECT' as const, reason: 'selected', shadowOnly: true as const, researchRoutingApplied: false as const },
      suppressed: { version: 'commander_research_comparison_v1' as const, decisionId: 'd1', strategyId: 'orbVwapBreakout', strategyVersion: '1', parameterProfileFingerprint: 'p2', symbol: 'ETH-USDT', interval: '1h', direction: 'LONG' as const, disposition: 'SUPPRESS' as const, reason: 'suppressed', shadowOnly: true as const, researchRoutingApplied: false as const },
      abstained: { version: 'commander_research_comparison_v1' as const, decisionId: 'd2', strategyId: 'orbVwapBreakout', strategyVersion: '1', parameterProfileFingerprint: 'p3', symbol: 'SOL-USDT', interval: '1h', direction: 'LONG' as const, disposition: 'ABSTAIN' as const, reason: 'abstain', shadowOnly: true as const, researchRoutingApplied: false as const },
    };
    const args = input({
      jobs: [
        job({ id: 'selected', metrics: { ...job().metrics!, totalPnlPct: 3 } }),
        job({ id: 'suppressed', symbol: 'ETH-USDT', metrics: { ...job().metrics!, totalPnlPct: -2 } }),
        job({ id: 'abstained', symbol: 'SOL-USDT', metrics: { ...job().metrics!, totalPnlPct: 1 } }),
      ],
      paperTradePlan: [],
      commanderResearchComparisonByJobId: comparisons,
    });
    const summary = summarizeResearchOutcomes(args, buildResearchOutcomeLogs(args)).commanderShadowComparison;
    expect(summary).toMatchObject({ available: 3, selected: 1, suppressed: 1, abstained: 1, selectedMeanPnlPct: 3, suppressedMeanPnlPct: -2, abstainedMeanPnlPct: 1, shadowOnly: true, researchRoutingApplied: false });
  });

  it('classifies a profitable replay as a win and an unprofitable one as a loss', () => {
    const rows = buildResearchOutcomeLogs(input({
      jobs: [
        job({ id: 'win', metrics: { ...job().metrics!, totalPnlPct: 3 } }),
        job({ id: 'loss', metrics: { ...job().metrics!, totalPnlPct: -2 } }),
        job({ id: 'flat', metrics: { ...job().metrics!, totalPnlPct: 0 } }),
      ],
    }));
    expect(rows.map((row) => row.laterOutcome)).toEqual(['WIN', 'LOSS', 'BREAKEVEN']);
  });

  it('leaves an incomplete replay UNKNOWN instead of scoring it as a loss', () => {
    const rows = buildResearchOutcomeLogs(input({
      jobs: [job({ status: 'FAILED', metrics: null, error: 'insufficient_requested_history:900/3000' })],
    }));
    expect(rows[0].laterOutcome).toBe('UNKNOWN');
    expect(rows[0].reasonCode).toBe('EVALUATION_ERROR');
    expect(rows[0].reasonText).toContain('insufficient_requested_history');
    expect(rows[0].laterPnl).toBeUndefined();
  });

  it('records paper selection as ACCEPTED and non-selection as REJECTED', () => {
    const rows = buildResearchOutcomeLogs(input({
      jobs: [job({ id: 'picked' }), job({ id: 'ignored' })],
      paperTradePlan: [{
        id: 'picked', strategyId: 'orbVwapBreakout', symbol: 'BTC-USDT',
        direction: 'LONG', consensusScore: 0.8, notionalBudgetUsd: 5_000,
      }],
    }));
    expect(rows[0].decision).toBe('ACCEPTED');
    expect(rows[0].reasonCode).toBe('ACCEPTED_BEST_CANDIDATE');
    expect(rows[1].decision).toBe('REJECTED');
    expect(rows[1].reasonCode).toBe('LOWER_RANK_THAN_BEST');
  });

  it('produces deterministic, re-recordable ids so a repeat cycle overwrites', () => {
    const first = buildResearchOutcomeLogs(input());
    const second = buildResearchOutcomeLogs(input());
    expect(first[0].id).toBe(second[0].id);
    expect(first[0].id).toContain('research-outcome:0:');
    expect(new Set(buildResearchOutcomeLogs(input({
      jobs: [job({ id: 'a' }), job({ id: 'b' })],
    })).map((row) => row.id)).size).toBe(2);
  });

  it('carries the decision-memory fields the mirror indexes on', () => {
    const row = buildResearchOutcomeLogs(input())[0];
    expect(typeof row.id).toBe('string');
    expect(typeof row.timestamp).toBe('number');
    expect(row.ticker).toBe('BTC-USDT');
    expect(row.direction).toBe('LONG');
    expect(row.isoTime).toBe(new Date(GENERATED_AT).toISOString());
  });
});

describe('research outcome feedback — expectation gap', () => {
  it('computes realized minus expected and flags underperformance', () => {
    const args = input({
      jobs: [job({ id: 'under', metrics: { ...job().metrics!, totalPnlPct: 1 } })],
      paperTradePlan: [],
      expectedPnlPctByJobId: { under: 5 },
    });
    const rows = buildResearchOutcomeLogs(args);
    const summary = rows[0].marketSnapshotSummary as Record<string, unknown>;
    expect(summary.expectedPnlPct).toBe(5);
    expect(summary.realizedPnlPct).toBe(1);
    expect(summary.expectationGapPct).toBe(-4);

    const aggregate = summarizeResearchOutcomes(args, rows);
    expect(aggregate.meanExpectationGapPct).toBe(-4);
    expect(aggregate.underperformingJobIds).toEqual(['under']);
  });

  it('reports a null gap rather than guessing when no expectation exists', () => {
    const args = input({ expectedPnlPctByJobId: {} });
    const rows = buildResearchOutcomeLogs(args);
    expect((rows[0].marketSnapshotSummary as Record<string, unknown>).expectationGapPct).toBeNull();
    expect(summarizeResearchOutcomes(args, rows).meanExpectationGapPct).toBeNull();
  });

  it('summarizes counts and stays research-only', () => {
    const args = input({
      jobs: [
        job({ id: 'w', metrics: { ...job().metrics!, totalPnlPct: 2 } }),
        job({ id: 'l', metrics: { ...job().metrics!, totalPnlPct: -1 } }),
        job({ id: 'u', status: 'FAILED', metrics: null, error: 'x' }),
      ],
      paperTradePlan: [],
    });
    const summary = summarizeResearchOutcomes(args, buildResearchOutcomeLogs(args));
    expect(summary.version).toBe(RESEARCH_OUTCOME_VERSION);
    expect(summary.recorded).toBe(3);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.unresolved).toBe(1);
    expect(summary.researchOnly).toBe(true);
    expect(summary.executionAuthorized).toBe(false);
  });
});

describe('research outcome feedback — cycle wiring', () => {
  it('records outcomes from the shared cycle and surfaces the summary', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('buildResearchOutcomeLogs(outcomeInput)');
    expect(routes).toContain('summarizeResearchOutcomes(outcomeInput, outcomeLogs)');
    expect(routes).toContain('options?.onResearchOutcomeLogs?.(outcomeLogs)');
    expect(routes).toContain('outcomeFeedback,');
  });

  it('propagates only explicit Commander attribution without routing research', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('let researchContexts = plan.contexts');
    expect(routes).toContain('buildCommanderOutcomeAttribution({');
    expect(routes).toContain('commanderAttributionByJobId,');
    expect(routes).toContain('commanderResearchComparisonByJobId,');
    expect(routes).not.toContain('researchContexts = commander');
  });

  it('never lets outcome recording break or authorize a cycle', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain("console.warn('[Smart Autopilot] outcome feedback failed:'");
    expect(routes).toContain('executionAuthorized: false');
    expect(routes).toContain('riskGovernorBypassAllowed: false');
  });
});
