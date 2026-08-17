import { describe, expect, it } from 'vitest';
import type { MultiStrategyResearchReport } from '../services/multiStrategyResearchOrchestrator';
import { runMultiAgentResearchCouncil } from '../services/multiAgentResearchCouncil';

function report(): MultiStrategyResearchReport {
  const jobs = [
    { id: 'btc-long', strategyId: 'trend', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' as const, status: 'COMPLETED' as const, metrics: { totalPnlPct: 12, maxDrawdownPct: 4, profitFactor: 1.9, tradeCount: 35, winRatePct: 58, requestedBars: 2000, candlesUsed: 2000, dataSource: 'fixture', dataState: 'live', historyComplete: true }, utility: 12, error: null },
    { id: 'btc-short', strategyId: 'reversal', symbol: 'BTC-USDT', interval: '1h', direction: 'SHORT' as const, status: 'COMPLETED' as const, metrics: { totalPnlPct: 5, maxDrawdownPct: 6, profitFactor: 1.2, tradeCount: 18, winRatePct: 52, requestedBars: 2000, candlesUsed: 2000, dataSource: 'fixture', dataState: 'live', historyComplete: true }, utility: 5, error: null },
    { id: 'eth-long', strategyId: 'squeeze', symbol: 'ETH-USDT', interval: '1h', direction: 'LONG' as const, status: 'COMPLETED' as const, metrics: { totalPnlPct: 8, maxDrawdownPct: 3, profitFactor: 1.6, tradeCount: 28, winRatePct: 55, requestedBars: 2000, candlesUsed: 2000, dataSource: 'fixture', dataState: 'live', historyComplete: true }, utility: 8, error: null },
    { id: 'sol-long-risky', strategyId: 'breakout', symbol: 'SOL-USDT', interval: '1h', direction: 'LONG' as const, status: 'COMPLETED' as const, metrics: { totalPnlPct: 18, maxDrawdownPct: 31, profitFactor: 0.9, tradeCount: 6, winRatePct: 48, requestedBars: 2000, candlesUsed: 2000, dataSource: 'fixture', dataState: 'live', historyComplete: true }, utility: 10, error: null },
  ];
  return {
    version: 'multi_strategy_research_v2',
    jobs,
    ranking: [
      { id: 'btc-long', utility: 12, rank: 1 }, { id: 'sol-long-risky', utility: 10, rank: 2 },
      { id: 'eth-long', utility: 8, rank: 3 }, { id: 'btc-short', utility: 5, rank: 4 },
    ],
    paperPortfolio: [
      { id: 'btc-long', strategyId: 'trend', symbol: 'BTC-USDT', direction: 'LONG', weight: 0.6 },
      { id: 'eth-long', strategyId: 'squeeze', symbol: 'ETH-USDT', direction: 'LONG', weight: 0.4 },
    ],
    conflicts: [{ symbol: 'BTC-USDT', longJobs: ['btc-long'], shortJobs: ['btc-short'] }],
    runtime: { jobs: 4, completed: 4, failed: 0, cancelled: 0, concurrency: 2, elapsedMs: 10 },
    researchOnly: true,
    executionAuthorized: false,
    automaticOrderSubmission: false,
    deterministicFingerprint: 'source-fingerprint',
  };
}

describe('multi-agent research council / paper multi-trading budget', () => {
  it('uses five independent deterministic roles and vetoes risk/conflict failures', () => {
    const result = runMultiAgentResearchCouncil(report(), { capitalUsd: 100_000, portfolioRiskPct: 1, maxSlots: 4 });
    expect(result.council.agents).toEqual(['PERFORMANCE', 'RISK', 'CONFLICT', 'PORTFOLIO', 'EXECUTION_GUARDIAN']);
    expect(result.consensus.find((row) => row.id === 'btc-short')?.vetoes).toBeGreaterThan(0);
    expect(result.consensus.find((row) => row.id === 'sol-long-risky')?.vetoes).toBeGreaterThan(0);
    expect(result.paperTradePlan.map((row) => row.id)).toEqual(expect.arrayContaining(['btc-long', 'eth-long']));
    expect(result.paperTradePlan.map((row) => row.id)).not.toContain('btc-short');
    expect(result.paperTradePlan.map((row) => row.id)).not.toContain('sol-long-risky');
  });

  it('caps portfolio risk/exposure and never creates execution authority', () => {
    const result = runMultiAgentResearchCouncil(report(), {
      capitalUsd: 250_000,
      portfolioRiskPct: 0.8,
      maxSlots: 3,
      maxSymbolWeight: 0.4,
      maxDirectionalWeight: 0.6,
    });
    expect(result.portfolio.riskBudgetUsd).toBe(2_000);
    expect(result.portfolio.allocatedRiskUsd).toBeLessThanOrEqual(2_000);
    expect(result.portfolio.longWeight).toBeLessThanOrEqual(0.6);
    expect(result.paperTradePlan.every((row) => row.allocationWeight <= 0.4)).toBe(true);
    expect(result.paperTradePlan.every((row) => row.orderSubmissionAllowed === false && row.requiresManualConfirmation === true)).toBe(true);
    expect(result.safety).toMatchObject({ researchOnly: true, paperOnly: true, executionAuthorized: false, automaticOrderSubmission: false, autonomousLiveExecutionEnabled: false, riskGovernorBypassAllowed: false, manualConfirmationRequired: true });
  });

  it('sanitizes non-finite portfolio controls instead of emitting NaN budgets', () => {
    const result = runMultiAgentResearchCouncil(report(), {
      capitalUsd: Number.NaN, portfolioRiskPct: Number.POSITIVE_INFINITY, maxSlots: Number.NaN,
      maxSymbolWeight: Number.NaN, maxDirectionalWeight: Number.NaN,
    });
    expect(result.portfolio.capitalUsd).toBe(100_000);
    expect(result.portfolio.configuredRiskPct).toBe(1);
    expect(Number.isFinite(result.portfolio.allocatedNotionalUsd)).toBe(true);
    expect(Number.isFinite(result.portfolio.allocatedRiskUsd)).toBe(true);
  });

  it('is deterministic and fingerprints the exact paper budget plan', () => {
    const first = runMultiAgentResearchCouncil(report(), { capitalUsd: 100_000, portfolioRiskPct: 1 });
    const second = runMultiAgentResearchCouncil(report(), { capitalUsd: 100_000, portfolioRiskPct: 1 });
    expect(first.deterministicFingerprint).toBe(second.deterministicFingerprint);
    expect(first.deterministicFingerprint).toHaveLength(64);
    expect(first.paperTradePlanFingerprint).toHaveLength(64);
  });

  it('fails closed if a caller tries to feed an execution-authorized source report', () => {
    const unsafe = { ...report(), executionAuthorized: true } as unknown as MultiStrategyResearchReport;
    expect(() => runMultiAgentResearchCouncil(unsafe)).toThrow('multi_agent_requires_research_only_report');
  });
});
