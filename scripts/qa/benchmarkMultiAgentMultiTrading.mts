import { performance } from 'node:perf_hooks';
import { runMultiAgentResearchCouncil } from '../../src/services/multiAgentResearchCouncil';
import { sizePaperMultiTradePositions } from '../../src/services/execution/paperMultiTradeSizer';
import type { MultiStrategyResearchReport } from '../../src/services/multiStrategyResearchOrchestrator';

const jobs = Array.from({ length: 16 }, (_, index) => ({
  id: `job-${index}`,
  strategyId: `strategy-${index % 4}`,
  symbol: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT'][index % 4],
  interval: '1h',
  direction: (index % 3 === 0 ? 'SHORT' : 'LONG') as 'LONG' | 'SHORT',
  status: 'COMPLETED' as const,
  metrics: { totalPnlPct: 3 + index * 0.4, maxDrawdownPct: 2 + index * 0.2, profitFactor: 1.1 + (index % 5) * 0.12, tradeCount: 12 + index, winRatePct: 51 + index * 0.3, requestedBars: 2000, candlesUsed: 2000, dataSource: 'fixture', dataState: 'live', historyComplete: true },
  utility: 2 + index * 0.5,
  error: null,
}));
const report: MultiStrategyResearchReport = {
  version: 'multi_strategy_research_v2', jobs,
  ranking: [...jobs].sort((a, b) => b.utility - a.utility).map((row, index) => ({ id: row.id, utility: row.utility, rank: index + 1 })),
  paperPortfolio: jobs.filter((_, index) => index % 4 === 0).slice(0, 4).map((row) => ({ id: row.id, strategyId: row.strategyId, symbol: row.symbol, direction: row.direction, weight: 0.25 })),
  conflicts: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT'].map((symbol) => ({ symbol, longJobs: jobs.filter((row) => row.symbol === symbol && row.direction === 'LONG').map((row) => row.id), shortJobs: jobs.filter((row) => row.symbol === symbol && row.direction === 'SHORT').map((row) => row.id) })).filter((row) => row.longJobs.length && row.shortJobs.length),
  runtime: { jobs: 16, completed: 16, failed: 0, cancelled: 0, concurrency: 4, elapsedMs: 0 },
  researchOnly: true, executionAuthorized: false, automaticOrderSubmission: false,
  deterministicFingerprint: 'b'.repeat(64),
};

const iterations = 5_000;
let council = runMultiAgentResearchCouncil(report, { capitalUsd: 100_000, portfolioRiskPct: 1, maxSlots: 4 });
const start = performance.now();
for (let index = 0; index < iterations; index += 1) council = runMultiAgentResearchCouncil(report, { capitalUsd: 100_000, portfolioRiskPct: 1, maxSlots: 4 });
const councilMs = performance.now() - start;
const entries = council.paperTradePlan.map((row, index) => ({ id: row.id, entryPrice: 100 + index * 10, stopPrice: row.direction === 'LONG' ? 98 + index * 10 : 102 + index * 10 }));
let sized = sizePaperMultiTradePositions({ sourceCouncilFingerprint: council.deterministicFingerprint, sourcePlanFingerprint: council.paperTradePlanFingerprint, plans: council.paperTradePlan, entries });
const sizeStart = performance.now();
for (let index = 0; index < iterations; index += 1) sized = sizePaperMultiTradePositions({ sourceCouncilFingerprint: council.deterministicFingerprint, sourcePlanFingerprint: council.paperTradePlanFingerprint, plans: council.paperTradePlan, entries });
const sizingMs = performance.now() - sizeStart;

console.log(JSON.stringify({
  iterations,
  jobsPerCouncil: report.jobs.length,
  council: { totalMs: Number(councilMs.toFixed(3)), opsPerSecond: Number((iterations / (councilMs / 1000)).toFixed(1)), approved: council.paperTradePlan.length, fingerprint: council.deterministicFingerprint },
  sizing: { totalMs: Number(sizingMs.toFixed(3)), opsPerSecond: Number((iterations / (sizingMs / 1000)).toFixed(1)), positions: sized.positions.length, fingerprint: sized.deterministicFingerprint },
  safety: council.safety,
}, null, 2));
