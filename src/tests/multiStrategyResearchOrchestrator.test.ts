import { describe, expect, it } from 'vitest';
import { runMultiStrategyResearch } from '../services/multiStrategyResearchOrchestrator';

const metric = (requestedBars = 500, candlesUsed = requestedBars) => ({ totalPnlPct: 4, maxDrawdownPct: 2, profitFactor: 1.4, tradeCount: 20, winRatePct: 55, requestedBars, candlesUsed, dataSource: 'fixture', dataState: 'live', historyComplete: candlesUsed === requestedBars });

describe('multi strategy research orchestrator v2', () => {
  it('projects only the public job identity and does not leak internal fields', async () => {
    const report = await runMultiStrategyResearch({ jobs: [{ id: 'a', strategyId: 's', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' as const, definition: { secret: true } }], execute: async () => metric() });
    expect(report.jobs[0]).not.toHaveProperty('definition');
    expect(report.jobs[0]?.metrics?.candlesUsed).toBe(500);
  });

  it('fails a job when the provider history is shorter than the requested horizon', async () => {
    const report = await runMultiStrategyResearch({ jobs: [{ id: 'a', strategyId: 's', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' as const }], execute: async () => metric(500, 499) });
    expect(report.jobs[0]?.status).toBe('FAILED');
    expect(report.jobs[0]?.error).toContain('insufficient_requested_history');
  });

  it('keeps the paper portfolio fail-closed unless return, profit factor, and sample evidence are positive', async () => {
    const jobs = [
      { id: 'negative-high-utility', strategyId: 'a', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' as const },
      { id: 'positive-valid', strategyId: 'b', symbol: 'ETH-USDT', interval: '1h', direction: 'LONG' as const },
      { id: 'positive-too-small', strategyId: 'c', symbol: 'SOL-USDT', interval: '1h', direction: 'LONG' as const },
    ];
    const metrics: Record<string, ReturnType<typeof metric>> = {
      'negative-high-utility': { ...metric(1000), totalPnlPct: -0.1, maxDrawdownPct: 0, profitFactor: 4, tradeCount: 100 },
      'positive-valid': { ...metric(1000), totalPnlPct: 1.2, maxDrawdownPct: 1, profitFactor: 1.4, tradeCount: 12 },
      'positive-too-small': { ...metric(1000), totalPnlPct: 5, maxDrawdownPct: 1, profitFactor: 1.8, tradeCount: 2 },
    };
    const report = await runMultiStrategyResearch({ jobs, execute: async (job) => metrics[job.id] });
    expect(report.ranking[0]?.id).toBe('positive-too-small');
    expect(report.paperPortfolio.map((row) => row.id)).toEqual(['positive-valid']);
  });

  it('cuts a slow execute off at timeoutMs instead of waiting for it to return', async () => {
    let executeSettled = false;
    const startedAt = Date.now();
    const report = await runMultiStrategyResearch({
      jobs: [{ id: 'slow', strategyId: 's', symbol: 'BTC-USDT', interval: '1h', direction: 'LONG' as const }],
      timeoutMs: 1_000,
      // Deliberately far longer than the deadline. The AbortController alone did
      // not stop this: firing the timer only flipped `signal.aborted` while the
      // bare `await` kept blocking the worker for the full 30s, so the job was
      // labelled CANCELLED long after the timeout had passed. No network here —
      // the delay is a plain timer, unref'd so it cannot hold the test runner open.
      execute: () => new Promise<ReturnType<typeof metric>>((resolve) => {
        const handle = setTimeout(() => { executeSettled = true; resolve(metric()); }, 30_000);
        (handle as unknown as { unref?: () => void }).unref?.();
      }),
    });
    const elapsedMs = Date.now() - startedAt;
    expect(report.jobs[0]?.status).toBe('CANCELLED');
    expect(report.jobs[0]?.error).toBe('timeout_or_cancelled');
    expect(report.runtime.cancelled).toBe(1);
    expect(executeSettled).toBe(false);
    expect(elapsedMs).toBeLessThan(10_000);
  });

});
