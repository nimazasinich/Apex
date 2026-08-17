import { evaluateScanDecision } from '../../src/services/scannerCore';
import { MathEngine } from '../../src/services/mathEngine';
import { deriveAdaptiveScannerConfig } from '../../src/services/adaptiveThresholdEngine';
import type { ScannerConfig, SignalDecisionLog } from '../../src/types';

const seedArg = Number(process.env.APEX_AUDIT_SEED ?? 42);
let seed = seedArg;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function normal(mean = 0, sd = 1) {
  const u = Math.max(1e-9, rnd());
  const v = Math.max(1e-9, rnd());
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
}
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

type Regime = 'trend_down' | 'trend_up' | 'chop' | 'squeeze_risk' | 'thin_book';
const regimes: Regime[] = ['trend_down', 'trend_up', 'chop', 'squeeze_risk', 'thin_book'];
const tickers = ['BTC-USDT','ETH-USDT','SOL-USDT','AVAX-USDT','SUI-USDT','APT-USDT','ARB-USDT','LINK-USDT','NEAR-USDT','OP-USDT','DOGE-USDT','DOT-USDT','INJ-USDT','TIA-USDT','ATOM-USDT','ADA-USDT','XRP-USDT','PEPE-USDT','LTC-USDT','BNB-USDT','SEI-USDT','WIF-USDT','FIL-USDT','RNDR-USDT','JUP-USDT','AAVE-USDT','UNI-USDT','FET-USDT','ORDI-USDT','FTM-USDT','MATIC-USDT','ETC-USDT'];

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
    scoreWeights: MathEngine.defaultScoreWeights(),
    minConfidence: 0.78,
    directionBias: 'SHORT_ONLY',
    topRankSkip: 10,
    minVolume24hUsd: 5_000_000,
    thresholdMode: 'ADAPTIVE_GUARDRAILS',
    adaptiveLearningRate: 0.04,
    adaptiveMinSamples: 60,
  } as ScannerConfig;
}

function sampleFeatures(regime: Regime, ticker: string) {
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

let cfg = baseConfig();
let logs: SignalDecisionLog[] = [];
const outcomes: any[] = [];
const adaptations: any[] = [];
const cycles = Number(process.env.APEX_AUDIT_CYCLES ?? 150); // 150 * 6s = 15m equivalent
for (let cycle = 0; cycle < cycles; cycle++) {
  const regime = regimes[Math.floor((cycle / 18) % regimes.length)] as Regime;
  const cycleResults: any[] = [];
  for (const ticker of tickers) {
    const f = sampleFeatures(regime, ticker);
    const trace = evaluateScanDecision({
      ...f,
      atr: Math.max(0.05, f.atr),
      cfg,
      heuristicAdj: 0,
    });
    const id = `SIM-${cycle}-${ticker}`;
    const log: SignalDecisionLog = {
      id,
      cycleId: `CYCLE-${cycle}`,
      timestamp: Date.now() + cycle * 6000,
      isoTime: new Date(Date.now() + cycle * 6000).toISOString(),
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
  // mimic scanner: only top accepted candidate per cycle remains accepted, others that passed become lower-rank rejects
  const accepted = cycleResults.filter(r => r.log.decision === 'ACCEPTED').sort((a,b)=>(b.log.confidence??0)-(a.log.confidence??0));
  if (accepted.length > 1) {
    for (let i=1;i<accepted.length;i++) {
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
      outcomes.push({ ticker: r.log.ticker, regime: r.regime, win, pnl: r.log.laterPnl, confidence: r.log.confidence, edge: r.edge });
    }
    logs.push(r.log);
  }
  if (cycle % 10 === 0 && cycle > 0) {
    const res = deriveAdaptiveScannerConfig(cfg, logs);
    if (res.audit) adaptations.push(res.audit);
    cfg = res.nextConfig;
  }
}
const accepted = logs.filter(l => l.decision === 'ACCEPTED');
const rejected = logs.filter(l => l.decision === 'REJECTED');
const wins = outcomes.filter(o => o.win).length;
const winRate = outcomes.length ? wins / outcomes.length : 0;
const avgPnl = outcomes.length ? outcomes.reduce((s,o)=>s+o.pnl,0)/outcomes.length : 0;
const netPnl = outcomes.reduce((s,o)=>s+o.pnl,0);
const avgConf = accepted.length ? accepted.reduce((s,l)=>s+(l.confidence??0),0)/accepted.length : 0;
const calibrationGap = Math.abs(avgConf - winRate);
const acceptanceRate = accepted.length / logs.length;
const rejectGoodMisses = rejected.filter(l => (l.marketSnapshotSummary as any)?.latentShortEdge > 0.62).length;
const rejectQuality = rejected.length ? 1 - rejectGoodMisses / rejected.length : 1;
const selectivityScore = 1 - Math.min(1, Math.abs(acceptanceRate - 0.06) / 0.10);
const smartScore = Math.round(100 * clamp(winRate*0.34 + rejectQuality*0.22 + selectivityScore*0.18 + (1-calibrationGap)*0.16 + (avgPnl>0?0.10:0), 0, 1));
const reasonCounts = logs.reduce<Record<string,number>>((m,l)=>{m[l.reasonCode]=(m[l.reasonCode]||0)+1;return m;},{});
const regimeOutcomes = regimes.map(regime => {
  const xs = outcomes.filter(o=>o.regime===regime);
  return { regime, trades: xs.length, winRate: xs.length ? xs.filter(o=>o.win).length/xs.length : 0, avgPnl: xs.length ? xs.reduce((s,o)=>s+o.pnl,0)/xs.length : 0 };
});
const report = {
  seed: seedArg,
  simulatedMinutes: 15,
  cycles,
  candidates: logs.length,
  accepted: accepted.length,
  rejected: rejected.length,
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
  regimeOutcomes,
  finalConfig: cfg,
  adaptations,
};
console.log(JSON.stringify(report, null, 2));
