import type { ScannerConfig, SignalDecisionLog } from '../types';
import { deriveAdaptiveScannerConfig, summarizeAdaptiveExperience } from './adaptiveThresholdEngine';

export const ADAPTIVE_STRESS_REPORT_VERSION = 1;

export interface AdaptiveStressCheck {
  id: string;
  pass: boolean;
  actual: unknown;
  expected: string;
}

export interface AdaptiveStressResult {
  version: number;
  generatedAt: string;
  verdict: 'PASS' | 'FAIL';
  run: {
    seed: number;
    cycles: number;
    candidatesPerCycle: number;
    totalCandidates: number;
    accepted: number;
    rejected: number;
    wins: number;
    losses: number;
    pnl: number;
    acceptanceRate: number;
  };
  profile: {
    sampleSize: number;
    marketRegime: string;
    winRate: number | null;
    avgPnl: number | null;
    missedWinners: number;
    savedLosses: number;
    adjustmentConfidence: number;
  };
  finalConfig: ScannerConfig;
  checks: AdaptiveStressCheck[];
}

function rng(seedInput: number) {
  let seed = seedInput >>> 0;
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    return seed / 0x100000000;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function baseConfig(): ScannerConfig {
  return {
    intervalMs: 6005,
    obiThreshold: -0.15,
    volumeThreshold: 0,
    qStructThreshold: -0.30,
    fundingThreshold: 0.0001,
    oiExpansionThresholdPct: 0.30,
    atrExpansionThreshold: 0.005,
    maxSqueezeRisk: 0.62,
    minEvidenceAgreement: 0.58,
    minSmartMoneyScore: 0.52,
    smcHardRejectThreshold: 0.22,
    thresholdMode: 'ADAPTIVE_GUARDRAILS',
    scorePreset: 'ATLAS_PLUS_V2',
    adaptiveLearningRate: 0.04,
    adaptiveMinSamples: 24,
    scoreWeights: {
      obi: 0.12,
      qStruct: 0.18,
      volume: 0.14,
      funding: 0.08,
      openInterest: 0.06,
      atr: 0.05,
      microstructure: 0.11,
      liquidity: 0.13,
      smc: 0.13,
    },
    minConfidence: 0.78,
    directionBias: 'SHORT_ONLY',
    topRankSkip: 10,
    minVolume24hUsd: 5_000_000,
  };
}

function reasonFor(input: { q: number; confidence: number; evidence: number; squeeze: number; liquidity: number }, cfg: ScannerConfig): SignalDecisionLog['reasonCode'] {
  if (input.q >= cfg.qStructThreshold) return 'GATE_QSTRUCT_FAILED';
  if (input.liquidity < 0.80) return 'LOW_LIQUIDITY_QUALITY';
  if (input.squeeze > cfg.maxSqueezeRisk) return 'HIGH_SQUEEZE_RISK';
  if (input.evidence < cfg.minEvidenceAgreement) return 'LOW_EVIDENCE_AGREEMENT';
  if (input.confidence < cfg.minConfidence) return 'LOW_CONFIDENCE';
  return 'ACCEPTED_BEST_CANDIDATE';
}

export function runAdaptiveLearningStress(input: {
  seed: number;
  cycles: number;
  candidatesPerCycle: number;
  generatedAt: string;
}): AdaptiveStressResult {
  if (!Number.isFinite(input.seed)) throw new RangeError('seed must be finite.');
  if (!Number.isFinite(input.cycles) || input.cycles < 1) throw new RangeError('cycles must be a finite positive number.');
  if (!Number.isFinite(input.candidatesPerCycle) || input.candidatesPerCycle < 1) throw new RangeError('candidatesPerCycle must be a finite positive number.');
  if (typeof input.generatedAt !== 'string' || Number.isNaN(Date.parse(input.generatedAt))) throw new TypeError('generatedAt must be a valid ISO date string.');
  const random = rng(input.seed);
  const cycles = Math.floor(input.cycles);
  const candidatesPerCycle = Math.floor(input.candidatesPerCycle);
  let cfg = baseConfig();
  const logs: SignalDecisionLog[] = [];
  let accepted = 0, rejected = 0, wins = 0, losses = 0, pnl = 0;

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const candidates: SignalDecisionLog[] = [];
    for (let candidate = 0; candidate < candidatesPerCycle; candidate += 1) {
      const q = clamp(-0.48 + (random() - 0.5) * 0.58, -1, 1);
      const evidence = clamp(0.54 + random() * 0.40, 0, 1);
      const squeeze = clamp(0.22 + random() * 0.55, 0, 1);
      const liquidity = clamp(0.72 + random() * 0.28, 0, 1);
      const confidence = clamp(0.70 + (-q) * 0.16 + evidence * 0.12 + liquidity * 0.08 - squeeze * 0.10 + (random() - 0.5) * 0.12, 0.01, 0.99);
      const reasonCode = reasonFor({ q, confidence, evidence, squeeze, liquidity }, cfg);
      const decision = reasonCode === 'ACCEPTED_BEST_CANDIDATE' ? 'ACCEPTED' : 'REJECTED';
      const latentEdge = clamp(0.40 + (-q) * 0.24 + evidence * 0.18 + liquidity * 0.10 - squeeze * 0.18, 0.03, 0.95);
      const outcome = random() < latentEdge ? 'WIN' : 'LOSS';
      const laterPnl = outcome === 'WIN' ? 0.5 + random() * 1.8 : -(0.55 + random() * 1.25);
      const log: SignalDecisionLog = {
        id: `ADAPT-${input.seed}-${cycle}-${candidate}`,
        cycleId: `ADAPT-CYCLE-${cycle}`,
        timestamp: 1_750_000_000_000 + cycle * 6000 + candidate,
        isoTime: new Date(1_750_000_000_000 + cycle * 6000 + candidate).toISOString(),
        ticker: `SYNTH-${candidate}`,
        direction: 'SHORT',
        decision,
        reasonCode,
        reasonText: `Synthetic deterministic ${reasonCode}`,
        confidence,
        rawScore: confidence,
        qStructDirectional: q,
        squeezeRiskScore: squeeze,
        evidenceAgreementScore: evidence,
        liquidityQualityScore: liquidity,
        microPriceSkewScore: (random() - 0.5) * 0.2,
        fundingBiasScore: (random() - 0.5) * 0.4,
        oiChangePercent: (random() - 0.2) * 0.8,
        atrExpansionScore: random(),
        laterOutcome: outcome,
        laterPnl,
      };
      candidates.push(log);
    }

    // Preserve scanner dispatch semantics: at most one accepted candidate/cycle.
    const acceptedCandidates = candidates.filter((row) => row.decision === 'ACCEPTED').sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    for (const row of acceptedCandidates.slice(1)) {
      row.decision = 'REJECTED';
      row.reasonCode = 'LOWER_RANK_THAN_BEST';
      row.reasonText = 'Qualified but not dispatched because a stronger candidate won this cycle.';
    }
    for (const row of candidates) {
      logs.push(row);
      if (row.decision === 'ACCEPTED') {
        accepted += 1;
        if (row.laterOutcome === 'WIN') wins += 1; else losses += 1;
        pnl += row.laterPnl ?? 0;
      } else rejected += 1;
    }
    if (cycle > 0 && cycle % 30 === 0) cfg = deriveAdaptiveScannerConfig(cfg, logs, { now: 1_750_000_000_000 + cycle * 6000 }).nextConfig;
  }

  cfg = deriveAdaptiveScannerConfig(cfg, logs, { now: 1_750_000_000_000 + cycles * 6000 }).nextConfig;
  const profile = summarizeAdaptiveExperience(logs, cfg.adaptiveMinSamples);
  const totalCandidates = cycles * candidatesPerCycle;
  const acceptanceRate = accepted / Math.max(1, totalCandidates);
  const weightValues = Object.values(cfg.scoreWeights);
  const weightSum = weightValues.reduce((sum, value) => sum + value, 0);
  const finiteMetrics = [acceptanceRate, pnl, profile.adjustmentConfidence, cfg.minConfidence, cfg.maxSqueezeRisk].every(Number.isFinite);
  const checks: AdaptiveStressCheck[] = [
    { id: 'guardrails_mode_preserved', pass: cfg.thresholdMode === 'ADAPTIVE_GUARDRAILS', actual: cfg.thresholdMode, expected: 'ADAPTIVE_GUARDRAILS' },
    { id: 'short_only_preserved', pass: cfg.directionBias === 'SHORT_ONLY', actual: cfg.directionBias, expected: 'SHORT_ONLY' },
    { id: 'confidence_guardrail_floor', pass: cfg.minConfidence >= 0.74 && cfg.minConfidence <= 0.91, actual: cfg.minConfidence, expected: '0.74 <= minConfidence <= 0.91' },
    { id: 'obi_guardrail_bound', pass: cfg.obiThreshold >= -0.40 && cfg.obiThreshold <= -0.10, actual: cfg.obiThreshold, expected: '-0.40 <= obiThreshold <= -0.10' },
    { id: 'qstruct_guardrail_bound', pass: cfg.qStructThreshold >= -0.52 && cfg.qStructThreshold <= -0.30, actual: cfg.qStructThreshold, expected: '-0.52 <= qStructThreshold <= -0.30' },
    { id: 'squeeze_guard_bound', pass: cfg.maxSqueezeRisk >= 0.36 && cfg.maxSqueezeRisk <= 0.86, actual: cfg.maxSqueezeRisk, expected: '0.36 <= maxSqueezeRisk <= 0.86' },
    { id: 'evidence_guard_bound', pass: cfg.minEvidenceAgreement >= 0.32 && cfg.minEvidenceAgreement <= 0.82, actual: cfg.minEvidenceAgreement, expected: '0.32 <= minEvidenceAgreement <= 0.82' },
    { id: 'weights_normalized', pass: Math.abs(weightSum - 1) <= 0.002, actual: Number(weightSum.toFixed(6)), expected: 'abs(sum(weights) - 1) <= 0.002' },
    { id: 'weights_bounded', pass: weightValues.every((value) => value >= 0.01 && value <= 0.60), actual: weightValues.every((value) => value >= 0.01 && value <= 0.60), expected: 'all weights between 0.01 and 0.60' },
    { id: 'acceptance_controlled', pass: acceptanceRate <= 0.20, actual: Number(acceptanceRate.toFixed(6)), expected: 'acceptanceRate <= 0.20' },
    { id: 'profile_populated', pass: profile.sampleSize > 0 && Number.isFinite(profile.adjustmentConfidence), actual: profile.sampleSize, expected: 'profile sampleSize > 0 with finite adjustment confidence' },
    { id: 'metrics_finite', pass: finiteMetrics, actual: finiteMetrics, expected: 'all core metrics finite' },
  ];

  return {
    version: ADAPTIVE_STRESS_REPORT_VERSION,
    generatedAt: input.generatedAt,
    verdict: checks.every((check) => check.pass) ? 'PASS' : 'FAIL',
    run: {
      seed: input.seed,
      cycles,
      candidatesPerCycle,
      totalCandidates,
      accepted,
      rejected,
      wins,
      losses,
      pnl: Number(pnl.toFixed(6)),
      acceptanceRate: Number(acceptanceRate.toFixed(6)),
    },
    profile: {
      sampleSize: profile.sampleSize,
      marketRegime: profile.marketRegime,
      winRate: profile.winRate,
      avgPnl: profile.avgPnl,
      missedWinners: profile.missedWinners,
      savedLosses: profile.savedLosses,
      adjustmentConfidence: profile.adjustmentConfidence,
    },
    finalConfig: cfg,
    checks,
  };
}
