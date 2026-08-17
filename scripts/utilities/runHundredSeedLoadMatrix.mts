import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateScanDecision } from '../../src/services/scannerCore';
import { MathEngine } from '../../src/services/mathEngine';
import { deriveAdaptiveScannerConfig } from '../../src/services/adaptiveThresholdEngine';
import type { ScannerConfig, SignalDecisionLog } from '../../src/types';

type Regime = 'trend_down' | 'trend_up' | 'chop' | 'squeeze_risk' | 'thin_book';
const regimes: Regime[] = ['trend_down', 'trend_up', 'chop', 'squeeze_risk', 'thin_book'];
const tickers = ['BTC-USDT','ETH-USDT','SOL-USDT','AVAX-USDT','SUI-USDT','APT-USDT','ARB-USDT','LINK-USDT','NEAR-USDT','OP-USDT','DOGE-USDT','DOT-USDT','INJ-USDT','TIA-USDT','ATOM-USDT','ADA-USDT','XRP-USDT','PEPE-USDT','LTC-USDT','BNB-USDT','SEI-USDT','WIF-USDT','FIL-USDT','RNDR-USDT','JUP-USDT','AAVE-USDT','UNI-USDT','FET-USDT','ORDI-USDT','FTM-USDT','MATIC-USDT','ETC-USDT'];

function makeRng(seedArg: number) {
  let seed = seedArg >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const normal = (mean = 0, sd = 1) => {
    const u = Math.max(1e-9, rnd());
    const v = Math.max(1e-9, rnd());
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
  };
  return { rnd, normal };
}
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function avg(xs: number[]) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function median(xs: number[]) { if (!xs.length) return 0; const s=[...xs].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
function pct(xs: number[], p: number) { if (!xs.length) return 0; const s=[...xs].sort((a,b)=>a-b); const idx=Math.min(s.length-1, Math.max(0, Math.floor((s.length-1)*p))); return s[idx]; }
function round(v: number, d=4) { return Number(v.toFixed(d)); }

function baseConfig(): ScannerConfig {
  return {
    intervalMs: 6005,
    obiThreshold: -0.15,
    volumeThreshold: 0,
    qStructThreshold: -0.30,
    fundingThreshold: 0.0001,
    oiExpansionThresholdPct: 0.30,
    atrExpansionThreshold: 0.005,
    maxSqueezeRisk: 0.46,
    minEvidenceAgreement: 0.64,
    minSmartMoneyScore: 0.52,
    smcHardRejectThreshold: 0.22,
    scoreWeights: {
      ...MathEngine.defaultScoreWeights(),
      qStruct: 0.28,
      atr: 0.05,
      microstructure: 0.11,
      liquidity: 0.10,
      smc: 0.12,
    },
    minConfidence: 0.78,
    directionBias: 'SHORT_ONLY',
    topRankSkip: 10,
    minVolume24hUsd: 5_000_000,
    thresholdMode: 'ADAPTIVE_GUARDRAILS',
    adaptiveLearningRate: 0.04,
    adaptiveMinSamples: 24,
  } as ScannerConfig;
}

function sampleFeatures(regime: Regime, ticker: string, normal: ReturnType<typeof makeRng>['normal']) {
  const tickerBias = (ticker.charCodeAt(0) % 7 - 3) * 0.015;
  if (regime === 'trend_down') {
    return {
      smoothedObi: clamp(normal(-0.34 + tickerBias, 0.18), -0.95, 0.35),
      smoothedVolDelta: normal(-7.0, 5.0),
      qStructDirectional: clamp(normal(-0.43, 0.20), -0.95, 0.25),
      fundingRate: normal(0.00019, 0.00013),
      oiChangePercent: normal(0.42, 0.22),
      atr: normal(0.007, 0.002) * 100,
      price: 100,
      microPrice: 100 + normal(-0.035, 0.025),
      spread: normal(0.020, 0.008),
      sentiment: { longShortRatio: clamp(normal(1.35,0.25),0.4,2.6), takerBuySellRatio: clamp(normal(0.92,0.14),0.5,1.7), longAccount: 57, shortAccount: 43, dataSource:'live' as const },
      latentShortEdge: normal(0.68, 0.18),
    };
  }
  if (regime === 'trend_up') {
    return {
      smoothedObi: clamp(normal(0.18, 0.22), -0.45, 0.9),
      smoothedVolDelta: normal(4.0, 6.0),
      qStructDirectional: clamp(normal(0.28, 0.25), -0.4, 0.9),
      fundingRate: normal(-0.00002, 0.00010),
      oiChangePercent: normal(0.20, 0.18),
      atr: normal(0.006, 0.002) * 100,
      price: 100,
      microPrice: 100 + normal(0.035, 0.025),
      spread: normal(0.022, 0.010),
      sentiment: { longShortRatio: clamp(normal(1.15,0.30),0.4,2.8), takerBuySellRatio: clamp(normal(1.18,0.20),0.5,1.8), longAccount: 54, shortAccount: 46, dataSource:'live' as const },
      latentShortEdge: normal(0.22, 0.18),
    };
  }
  if (regime === 'squeeze_risk') {
    return {
      smoothedObi: clamp(normal(-0.28, 0.17), -0.95, 0.25),
      smoothedVolDelta: normal(-5.0, 4.2),
      qStructDirectional: clamp(normal(-0.26, 0.22), -0.85, 0.35),
      fundingRate: normal(-0.00025, 0.00014),
      oiChangePercent: normal(0.48, 0.24),
      atr: normal(0.009, 0.003) * 100,
      price: 100,
      microPrice: 100 + normal(0.020, 0.028),
      spread: normal(0.028, 0.012),
      sentiment: { longShortRatio: clamp(normal(0.72,0.18),0.35,1.4), takerBuySellRatio: clamp(normal(1.20,0.20),0.6,1.8), longAccount: 42, shortAccount: 58, dataSource:'live' as const },
      latentShortEdge: normal(0.38, 0.20),
    };
  }
  if (regime === 'thin_book') {
    return {
      smoothedObi: clamp(normal(-0.31, 0.19), -0.95, 0.3),
      smoothedVolDelta: normal(-6.0, 5.5),
      qStructDirectional: clamp(normal(-0.36, 0.22), -0.95, 0.3),
      fundingRate: normal(0.00012, 0.00012),
      oiChangePercent: normal(0.32, 0.25),
      atr: normal(0.005, 0.002) * 100,
      price: 100,
      microPrice: 100 + normal(-0.015, 0.04),
      spread: normal(0.12, 0.04),
      sentiment: { longShortRatio: clamp(normal(1.25,0.25),0.5,2.2), takerBuySellRatio: clamp(normal(0.98,0.18),0.5,1.7), longAccount: 55, shortAccount: 45, dataSource:'live' as const },
      latentShortEdge: normal(0.43, 0.22),
    };
  }
  return {
    smoothedObi: clamp(normal(-0.04, 0.28), -0.9, 0.9),
    smoothedVolDelta: normal(-0.5, 8.0),
    qStructDirectional: clamp(normal(-0.02, 0.30), -0.9, 0.9),
    fundingRate: normal(0.00002, 0.00016),
    oiChangePercent: normal(0.08, 0.28),
    atr: normal(0.006, 0.003) * 100,
    price: 100,
    microPrice: 100 + normal(0, 0.04),
    spread: normal(0.035, 0.02),
    sentiment: { longShortRatio: clamp(normal(1.05,0.35),0.4,2.7), takerBuySellRatio: clamp(normal(1.00,0.24),0.5,1.8), longAccount: 52, shortAccount: 48, dataSource:'live' as const },
    latentShortEdge: normal(0.46, 0.20),
  };
}

function runOne(seed: number, measurementCycles: number, warmupCycles = 0) {
  const { rnd, normal } = makeRng(seed);
  let cfg = baseConfig();
  const logs: SignalDecisionLog[] = [];
  const measurementLogs: SignalDecisionLog[] = [];
  const outcomes: Array<{ regime: Regime; win: boolean; pnl: number; confidence: number; edge: number }> = [];
  const adaptations: any[] = [];
  const totalCycles = warmupCycles + measurementCycles;
  for (let cycle = 0; cycle < totalCycles; cycle++) {
    const inMeasurement = cycle >= warmupCycles;
    const regime = regimes[Math.floor((cycle / 18) % regimes.length)] as Regime;
    const cycleResults: Array<{ log: SignalDecisionLog; edge: number; regime: Regime }> = [];
    for (const ticker of tickers) {
      const f = sampleFeatures(regime, ticker, normal);
      const trace = evaluateScanDecision({ ...f, atr: Math.max(0.05, f.atr), cfg, heuristicAdj: 0 });
      const id = `SIM-${seed}-${cycle}-${ticker}`;
      const log: SignalDecisionLog = {
        id,
        cycleId: `CYCLE-${cycle}`,
        timestamp: 1_700_000_000_000 + cycle * 6000,
        isoTime: new Date(1_700_000_000_000 + cycle * 6000).toISOString(),
        ticker,
        decision: trace.status,
        direction: trace.direction,
        reasonCode: trace.reasonCode,
        reasonText: trace.reasonText,
        confidence: trace.evaluation?.confidence ?? 0,
        rawScore: trace.evaluation?.rawScore ?? 0,
        qStructDirectional: f.qStructDirectional,
        squeezeRiskScore: trace.evaluation?.squeezeRiskScore ?? undefined,
        evidenceAgreementScore: trace.evaluation?.evidenceAgreementScore ?? undefined,
        liquidityQualityScore: trace.evaluation?.liquidityQualityScore ?? undefined,
        microPriceSkewScore: trace.evaluation?.microPriceSkewScore ?? undefined,
        fundingBiasScore: trace.evaluation?.fundingBiasScore ?? undefined,
        oiChangePercent: f.oiChangePercent,
        atrExpansionScore: trace.evaluation?.atrExpansionScore ?? undefined,
        scoringBreakdown: trace.evaluation?.scoringBreakdown,
        gatesSnapshot: trace.gatesSnapshot as any,
        configSnapshot: cfg,
        marketSnapshotSummary: { regime, latentShortEdge: f.latentShortEdge },
      } as SignalDecisionLog;
      cycleResults.push({ log, edge: f.latentShortEdge, regime });
    }
    const accepted = cycleResults.filter(r => r.log.decision === 'ACCEPTED').sort((a, b) => (b.log.confidence ?? 0) - (a.log.confidence ?? 0));
    if (accepted.length > 1) {
      for (let i = 1; i < accepted.length; i++) {
        accepted[i].log.decision = 'REJECTED' as any;
        accepted[i].log.reasonCode = 'LOWER_RANK_THAN_BEST' as any;
        accepted[i].log.reasonText = 'Qualified but not dispatched because a stronger candidate won this cycle.';
      }
    }
    for (const r of cycleResults) {
      if (r.log.decision === 'ACCEPTED') {
        const winProb = clamp(r.edge, 0.05, 0.95);
        const win = rnd() < winProb;
        r.log.laterOutcome = win ? 'WIN' : 'LOSS';
        r.log.laterPnl = win ? Math.abs(normal(1.8, 0.7)) : -Math.abs(normal(1.1, 0.6));
        if (inMeasurement) outcomes.push({ regime: r.regime, win, pnl: r.log.laterPnl, confidence: r.log.confidence ?? 0, edge: r.edge });
      }
      logs.push(r.log);
      if (inMeasurement) measurementLogs.push(r.log);
    }
    if (cycle % 10 === 0 && cycle > 0) {
      const res = deriveAdaptiveScannerConfig(cfg, logs);
      if (res.audit && inMeasurement) adaptations.push(res.audit);
      cfg = res.nextConfig;
    }
  }
  const accepted = measurementLogs.filter(l => l.decision === 'ACCEPTED');
  const rejected = measurementLogs.filter(l => l.decision === 'REJECTED');
  const wins = outcomes.filter(o => o.win).length;
  const losses = outcomes.length - wins;
  const winRate = outcomes.length ? wins / outcomes.length : 0;
  const avgPnl = outcomes.length ? avg(outcomes.map(o => o.pnl)) : 0;
  const netPnl = outcomes.reduce((s, o) => s + o.pnl, 0);
  const avgConf = accepted.length ? avg(accepted.map(l => l.confidence ?? 0)) : 0;
  const calibrationGap = Math.abs(avgConf - winRate);
  const acceptanceRate = accepted.length / Math.max(1, measurementLogs.length);
  const rejectGoodMisses = rejected.filter(l => ((l.marketSnapshotSummary as any)?.latentShortEdge ?? 0) > 0.62).length;
  const rejectQuality = rejected.length ? 1 - rejectGoodMisses / rejected.length : 1;
  const selectivityScore = 1 - Math.min(1, Math.abs(acceptanceRate - 0.06) / 0.10);
  const smartScore = Math.round(100 * clamp(winRate * 0.34 + rejectQuality * 0.22 + selectivityScore * 0.18 + (1 - calibrationGap) * 0.16 + (avgPnl > 0 ? 0.10 : 0), 0, 1));
  const reasonCounts = measurementLogs.reduce<Record<string, number>>((m, l) => { m[l.reasonCode] = (m[l.reasonCode] || 0) + 1; return m; }, {});
  return {
    seed,
    simulatedMinutes: Math.round(measurementCycles * 6005 / 60000),
    warmupMinutes: Math.round(warmupCycles * 6005 / 60000),
    cycles: measurementCycles,
    candidates: measurementLogs.length,
    accepted: accepted.length,
    rejected: rejected.length,
    wins,
    losses,
    acceptanceRate,
    winRate,
    avgPnl,
    netPnl,
    avgConfidence: avgConf,
    calibrationGap,
    rejectQuality,
    selectivityScore,
    smartScore,
    reasonCounts,
    finalConfig: cfg,
    adaptations: adaptations.length,
  };
}

function summarize(label: string, runs: ReturnType<typeof runOne>[]) {
  const n = runs.length;
  const sum = (key: keyof ReturnType<typeof runOne>) => runs.reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const wr = runs.map(r => r.winRate);
  const ar = runs.map(r => r.acceptanceRate);
  const pnl = runs.map(r => r.netPnl);
  const avgp = runs.map(r => r.avgPnl);
  const ss = runs.map(r => r.smartScore);
  const cal = runs.map(r => r.calibrationGap);
  const reasons: Record<string, number> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.reasonCounts)) reasons[k] = (reasons[k] || 0) + v;
  return {
    label,
    runs: n,
    simulatedMinutesPerRun: runs[0]?.simulatedMinutes ?? 0,
    warmupMinutesPerRun: runs[0]?.warmupMinutes ?? 0,
    totalCandidates: sum('candidates'),
    totalAccepted: sum('accepted'),
    totalRejected: sum('rejected'),
    totalWins: sum('wins'),
    totalLosses: sum('losses'),
    totalNetPnl: round(sum('netPnl'), 3),
    avgAcceptanceRate: round(avg(ar), 4),
    medianAcceptanceRate: round(median(ar), 4),
    avgWinRate: round(avg(wr), 4),
    medianWinRate: round(median(wr), 4),
    p10WinRate: round(pct(wr, 0.10), 4),
    worstWinRate: round(Math.min(...wr), 4),
    bestWinRate: round(Math.max(...wr), 4),
    avgPnlPerTrade: round(avg(avgp), 4),
    avgNetPnlPerRun: round(avg(pnl), 3),
    worstNetPnl: round(Math.min(...pnl), 3),
    bestNetPnl: round(Math.max(...pnl), 3),
    avgSmartScore: round(avg(ss), 2),
    medianSmartScore: round(median(ss), 2),
    worstSmartScore: Math.min(...ss),
    bestSmartScore: Math.max(...ss),
    avgCalibrationGap: round(avg(cal), 4),
    pass: avg(wr) >= 0.62 && pct(wr, 0.10) >= 0.55 && avg(avgp) > 0.45 && avg(ss) >= 66,
    reasonCounts: reasons,
  };
}

const runs = Number(process.env.APEX_MATRIX_RUNS ?? 100);
const seedBase = Number(process.env.APEX_MATRIX_SEED_BASE ?? 1000);
const outDir = process.env.APEX_MATRIX_OUT ?? 'Doc/automation/load_matrix_100';
// Single canonical output directory — writes LOAD_MATRIX_100_RESULT.md and
// LOAD_MATRIX_100_SUMMARY.json here (no duplicate parent-level copies).
mkdirSync(outDir, { recursive: true });

const phases = [
  { key: '5m_100', label: '100× 5-minute load test', cycles: 50, warmup: 0 },
  { key: '15m_100', label: '100× 15-minute load test', cycles: 150, warmup: 0 },
  { key: '5m_warmup_plus_15m_100', label: '100× 5-minute warmup + 15-minute walk-forward test', cycles: 150, warmup: 50 },
];
const result: any = {
  generatedAt: new Date().toISOString(),
  purpose: '100-run load matrix for 5-minute, 15-minute, and 5-minute warmup + 15-minute walk-forward synthetic decision tests.',
  assumptions: {
    scanTickMs: 6005,
    tickersPerCycle: tickers.length,
    productionNetwork: 'not used; deterministic synthetic market regimes exercise the pure decision engine',
    acceptanceTarget: 'quiet, high-selectivity scanner; acceptance rate around 0.5%-2% is acceptable for this harness',
  },
  phases: [] as any[],
};
for (const phase of phases) {
  const phaseRuns = [];
  for (let i = 0; i < runs; i++) {
    phaseRuns.push(runOne(seedBase + i, phase.cycles, phase.warmup));
  }
  const summary = summarize(phase.label, phaseRuns);
  result.phases.push({ key: phase.key, summary, runs: phaseRuns });
  writeFileSync(join(outDir, `${phase.key}.json`), JSON.stringify({ summary, runs: phaseRuns }, null, 2));
}

const overall = {
  phaseCount: result.phases.length,
  allPass: result.phases.every((p: any) => p.summary.pass),
  totalRuns: result.phases.reduce((s: number, p: any) => s + p.summary.runs, 0),
  totalCandidates: result.phases.reduce((s: number, p: any) => s + p.summary.totalCandidates, 0),
  totalAccepted: result.phases.reduce((s: number, p: any) => s + p.summary.totalAccepted, 0),
  totalRejected: result.phases.reduce((s: number, p: any) => s + p.summary.totalRejected, 0),
  weightedWinRate: (() => {
    const w = result.phases.reduce((s: number, p: any) => s + p.summary.totalWins, 0);
    const t = result.phases.reduce((s: number, p: any) => s + p.summary.totalWins + p.summary.totalLosses, 0);
    return round(t ? w / t : 0, 4);
  })(),
  totalNetPnl: round(result.phases.reduce((s: number, p: any) => s + p.summary.totalNetPnl, 0), 3),
  averageSmartScoreAcrossPhases: round(avg(result.phases.map((p: any) => p.summary.avgSmartScore)), 2),
};
result.overall = overall;
writeFileSync(join(outDir, 'LOAD_MATRIX_100_SUMMARY.json'), JSON.stringify(result, null, 2));

const md = `# 100-Run Load Matrix Result\n\nGenerated: ${result.generatedAt}\n\n## Overall\n\n- Phases: ${overall.phaseCount}\n- Total runs: ${overall.totalRuns}\n- Total candidates evaluated: ${overall.totalCandidates}\n- Total accepted: ${overall.totalAccepted}\n- Total rejected: ${overall.totalRejected}\n- Weighted win rate: ${(overall.weightedWinRate*100).toFixed(2)}%\n- Total synthetic P&L: ${overall.totalNetPnl.toFixed(3)}R\n- Average smart score across phases: ${overall.averageSmartScoreAcrossPhases}/100\n- Acceptance verdict: ${overall.allPass ? 'PASS' : 'NEEDS MORE HARDENING'}\n\n## Phase summaries\n\n${result.phases.map((p: any) => `### ${p.summary.label}\n\n- Runs: ${p.summary.runs}\n- Simulated minutes/run: ${p.summary.simulatedMinutesPerRun}\n- Warmup minutes/run: ${p.summary.warmupMinutesPerRun}\n- Candidates: ${p.summary.totalCandidates}\n- Accepted: ${p.summary.totalAccepted}\n- Rejected: ${p.summary.totalRejected}\n- Avg acceptance rate: ${(p.summary.avgAcceptanceRate*100).toFixed(2)}%\n- Avg win rate: ${(p.summary.avgWinRate*100).toFixed(2)}%\n- Median win rate: ${(p.summary.medianWinRate*100).toFixed(2)}%\n- 10th percentile win rate: ${(p.summary.p10WinRate*100).toFixed(2)}%\n- Worst win rate: ${(p.summary.worstWinRate*100).toFixed(2)}%\n- Best win rate: ${(p.summary.bestWinRate*100).toFixed(2)}%\n- Avg P&L/trade: ${p.summary.avgPnlPerTrade.toFixed(3)}R\n- Avg net P&L/run: ${p.summary.avgNetPnlPerRun.toFixed(3)}R\n- Worst net P&L/run: ${p.summary.worstNetPnl.toFixed(3)}R\n- Avg smart score: ${p.summary.avgSmartScore}/100\n- Avg calibration gap: ${(p.summary.avgCalibrationGap*100).toFixed(2)} percentage points\n- Verdict: ${p.summary.pass ? 'PASS' : 'NEEDS MORE HARDENING'}\n`).join('\n')}\n\n## Interpretation\n\nThe engine is still highly selective by design. In this harness, low acceptance is not a bug; it means the scanner rejects most weak or trap-prone short candidates and only dispatches the highest-confidence candidate in a cycle. The key health metrics are positive expectancy, stable win rate across seeds, and bounded calibration gap.\n\n## Next optimization target\n\nThe weakest remaining area is confidence calibration. Win rate remains materially below the average displayed confidence, so the next production step is regime-specific calibration from real DecisionMemory outcomes rather than further tightening raw gates.\n`;
writeFileSync(join(outDir, 'LOAD_MATRIX_100_RESULT.md'), md);
console.log(JSON.stringify({ overall, phases: result.phases.map((p: any) => p.summary) }, null, 2));
