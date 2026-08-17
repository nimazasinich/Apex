import { createHash } from 'node:crypto';

export interface MultiStrategyResearchJob {
  id: string;
  strategyId: string;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
}

export interface MultiStrategyResearchMetrics {
  totalPnlPct: number;
  maxDrawdownPct: number;
  profitFactor: number | null;
  tradeCount: number;
  winRatePct?: number;
  requestedBars: number;
  candlesUsed: number;
  dataSource: string;
  dataState: string;
  historyComplete: boolean;
}

export interface MultiStrategyResearchJobResult extends MultiStrategyResearchJob {
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  metrics: MultiStrategyResearchMetrics | null;
  utility: number | null;
  error: string | null;
}

export interface MultiStrategyResearchReport {
  version: 'multi_strategy_research_v2';
  jobs: MultiStrategyResearchJobResult[];
  ranking: Array<{ id: string; utility: number; rank: number }>;
  paperPortfolio: Array<{ id: string; strategyId: string; symbol: string; direction: 'LONG' | 'SHORT'; weight: number }>;
  conflicts: Array<{ symbol: string; longJobs: string[]; shortJobs: string[] }>;
  runtime: { jobs: number; completed: number; failed: number; cancelled: number; concurrency: number; elapsedMs: number };
  researchOnly: true;
  executionAuthorized: false;
  automaticOrderSubmission: false;
  deterministicFingerprint: string;
}

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function utility(metrics: MultiStrategyResearchMetrics): number {
  const pf = metrics.profitFactor === null || !Number.isFinite(metrics.profitFactor) ? 0 : Math.min(4, Math.max(0, metrics.profitFactor));
  const tradeAdequacy = Math.min(1, Math.max(0, metrics.tradeCount) / 20);
  const historyPenalty = metrics.historyComplete ? 0 : 1000;
  return Number((metrics.totalPnlPct - Math.abs(metrics.maxDrawdownPct) * 0.65 + pf * 1.5 + tradeAdequacy - historyPenalty).toFixed(6));
}

/**
 * The per-job timeout is only real if the worker actually stops waiting. An
 * AbortController on its own does not interrupt an in-flight promise: firing the
 * timer flips `signal.aborted`, but a bare `await input.execute(...)` keeps
 * blocking the worker until the callback returns on its own. A slow provider
 * chain could therefore hold a research slot far past `timeoutMs` and only be
 * labelled CANCELLED after the fact, which is what made the autopilot cycle look
 * locked up. Racing the callback against an abort-tied rejection makes the
 * deadline authoritative: the worker moves on at `timeoutMs`, and the existing
 * catch branch still reports CANCELLED rather than FAILED because
 * `signal.aborted` is true by then.
 *
 * `Promise.race` subscribes to both inputs, so whichever promise loses cannot
 * surface as an unhandled rejection. The abandoned callback is not force-killed
 * — cancelling the underlying sockets would require threading this signal
 * through the shared market-data layer — but it no longer holds up the worker.
 */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const fail = () => reject(new Error('multi_strategy_timeout'));
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener('abort', fail, { once: true });
  });
}

function projectJob(job: MultiStrategyResearchJob): MultiStrategyResearchJob {
  return {
    id: String(job.id),
    strategyId: String(job.strategyId),
    symbol: String(job.symbol),
    interval: String(job.interval),
    direction: job.direction,
  };
}

export async function runMultiStrategyResearch<T extends MultiStrategyResearchJob>(input: {
  jobs: T[];
  execute: (job: T, signal: AbortSignal) => Promise<MultiStrategyResearchMetrics>;
  concurrency?: number;
  timeoutMs?: number;
  maxPortfolioSlots?: number;
}): Promise<MultiStrategyResearchReport> {
  if (!input.jobs.length) throw new Error('multi_strategy_jobs_required');
  if (input.jobs.length > 32) throw new Error('multi_strategy_job_limit_exceeded');
  const ids = new Set<string>();
  for (const job of input.jobs) {
    if (!job.id || ids.has(job.id)) throw new Error('multi_strategy_job_ids_must_be_unique');
    if (job.direction !== 'LONG' && job.direction !== 'SHORT') throw new Error('multi_strategy_direction_invalid');
    ids.add(job.id);
  }
  const concurrency = finiteInteger(input.concurrency, 3, 1, 6);
  const timeoutMs = finiteInteger(input.timeoutMs, 30_000, 1_000, 120_000);
  const results: MultiStrategyResearchJobResult[] = new Array(input.jobs.length);
  let next = 0;
  const started = performance.now();
  const workers = Array.from({ length: Math.min(concurrency, input.jobs.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= input.jobs.length) return;
      const job = input.jobs[index];
      const projected = projectJob(job);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('multi_strategy_timeout'), timeoutMs);
      try {
        const metrics = await Promise.race([input.execute(job, controller.signal), rejectOnAbort(controller.signal)]);
        if (controller.signal.aborted) {
          results[index] = { ...projected, status: 'CANCELLED', metrics: null, utility: null, error: 'timeout_or_cancelled' };
          continue;
        }
        const finiteMetrics = [metrics.totalPnlPct, metrics.maxDrawdownPct, metrics.tradeCount, metrics.requestedBars, metrics.candlesUsed]
          .every(Number.isFinite);
        if (!finiteMetrics) throw new Error('multi_strategy_non_finite_metrics');
        if (metrics.requestedBars <= 0 || metrics.candlesUsed <= 0 || metrics.candlesUsed > metrics.requestedBars) {
          throw new Error('multi_strategy_history_provenance_invalid');
        }
        if (!metrics.historyComplete || metrics.candlesUsed !== metrics.requestedBars) {
          throw new Error(`insufficient_requested_history:${metrics.candlesUsed}/${metrics.requestedBars}`);
        }
        results[index] = { ...projected, status: 'COMPLETED', metrics, utility: utility(metrics), error: null };
      } catch (error) {
        const cancelled = controller.signal.aborted;
        results[index] = {
          ...projected,
          status: cancelled ? 'CANCELLED' : 'FAILED',
          metrics: null,
          utility: null,
          error: cancelled ? 'timeout_or_cancelled' : (error instanceof Error ? error.message : String(error)),
        };
      } finally {
        clearTimeout(timer);
      }
    }
  });
  await Promise.all(workers);

  const completed = results.filter((row) => row?.status === 'COMPLETED' && row.utility !== null);
  const ranking = [...completed]
    .sort((a, b) => (b.utility! - a.utility!) || a.id.localeCompare(b.id))
    .map((row, index) => ({ id: row.id, utility: row.utility!, rank: index + 1 }));
  const bySymbol = new Map<string, { longJobs: string[]; shortJobs: string[] }>();
  for (const row of completed) {
    const bucket = bySymbol.get(row.symbol) ?? { longJobs: [], shortJobs: [] };
    (row.direction === 'LONG' ? bucket.longJobs : bucket.shortJobs).push(row.id);
    bySymbol.set(row.symbol, bucket);
  }
  const conflicts = [...bySymbol.entries()]
    .filter(([, row]) => row.longJobs.length && row.shortJobs.length)
    .map(([symbol, row]) => ({ symbol, longJobs: row.longJobs.sort(), shortJobs: row.shortJobs.sort() }));

  const maxSlots = finiteInteger(input.maxPortfolioSlots, 4, 1, 10);
  const selected: MultiStrategyResearchJobResult[] = [];
  const usedSymbols = new Set<string>();
  for (const ranked of ranking) {
    const row = completed.find((candidate) => candidate.id === ranked.id)!;
    const metrics = row.metrics!;
    // A positive composite utility is not enough for a paper portfolio. The
    // candidate must also be actually profitable after configured costs, have
    // profit factor above break-even, and contain a minimally useful sample.
    // This stays fail-closed: an empty paper portfolio is preferable to
    // relabelling a weak/negative backtest as a positive research result.
    const positiveEvidence = metrics.totalPnlPct > 0
      && (metrics.profitFactor ?? 0) > 1
      && metrics.tradeCount >= 4;
    if (row.utility! <= 0 || !positiveEvidence || usedSymbols.has(row.symbol)) continue;
    selected.push(row);
    usedSymbols.add(row.symbol);
    if (selected.length >= maxSlots) break;
  }
  const positiveTotal = selected.reduce((sum, row) => sum + Math.max(0, row.utility!), 0);
  const paperPortfolio = selected.map((row) => ({
    id: row.id,
    strategyId: row.strategyId,
    symbol: row.symbol,
    direction: row.direction,
    weight: positiveTotal > 0 ? Number((Math.max(0, row.utility!) / positiveTotal).toFixed(6)) : 0,
  }));
  const elapsedMs = performance.now() - started;
  const withoutFingerprint = {
    version: 'multi_strategy_research_v2' as const,
    jobs: results,
    ranking,
    paperPortfolio,
    conflicts,
    runtime: {
      jobs: results.length,
      completed: completed.length,
      failed: results.filter((row) => row?.status === 'FAILED').length,
      cancelled: results.filter((row) => row?.status === 'CANCELLED').length,
      concurrency,
      elapsedMs: Number(elapsedMs.toFixed(3)),
    },
    researchOnly: true as const,
    executionAuthorized: false as const,
    automaticOrderSubmission: false as const,
  };
  const deterministicFingerprint = createHash('sha256')
    .update(JSON.stringify({ ...withoutFingerprint, runtime: { ...withoutFingerprint.runtime, elapsedMs: 0 } }))
    .digest('hex');
  return { ...withoutFingerprint, deterministicFingerprint };
}
