import { createHash } from 'node:crypto';
import type { MultiStrategyResearchJobResult, MultiStrategyResearchReport } from './multiStrategyResearchOrchestrator';
import { fingerprintPaperTradePlans } from './paperTradePlanIntegrity';

export type ResearchAgentId = 'PERFORMANCE' | 'RISK' | 'CONFLICT' | 'PORTFOLIO' | 'EXECUTION_GUARDIAN';
export type ResearchAgentDisposition = 'SUPPORT' | 'CAUTION' | 'VETO' | 'NEUTRAL';

export interface ResearchAgentAssessment {
  agentId: ResearchAgentId;
  jobId: string;
  disposition: ResearchAgentDisposition;
  score: number;
  reasons: string[];
}

export interface MultiAgentJobConsensus {
  id: string;
  strategyId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  consensusScore: number;
  supports: number;
  cautions: number;
  vetoes: number;
  approvedForPaperPlan: boolean;
  reasons: string[];
}

export interface PaperTradeBudgetPlan {
  id: string;
  strategyId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  consensusScore: number;
  allocationWeight: number;
  notionalBudgetUsd: number;
  maxLossBudgetUsd: number;
  riskPctOfCapital: number;
  orderSubmissionAllowed: false;
  requiresManualConfirmation: true;
}

export interface MultiAgentResearchCouncilReport {
  version: 'multi_agent_research_council_v2';
  sourceResearchFingerprint: string;
  assessments: ResearchAgentAssessment[];
  consensus: MultiAgentJobConsensus[];
  paperTradePlan: PaperTradeBudgetPlan[];
  paperTradePlanFingerprint: string;
  portfolio: {
    capitalUsd: number;
    configuredRiskPct: number;
    riskBudgetUsd: number;
    allocatedRiskUsd: number;
    allocatedNotionalUsd: number;
    allocatedWeight: number;
    cashReserveWeight: number;
    longWeight: number;
    shortWeight: number;
    maxSymbolWeight: number;
    maxDirectionalWeight: number;
    maxSlots: number;
  };
  council: {
    agents: ResearchAgentId[];
    quorum: number;
    approvedJobs: number;
    vetoedJobs: number;
  };
  safety: {
    researchOnly: true;
    paperOnly: true;
    authoritative: false;
    executionAuthorized: false;
    automaticOrderSubmission: false;
    autonomousLiveExecutionEnabled: false;
    riskGovernorBypassAllowed: false;
    manualConfirmationRequired: true;
  };
  deterministicFingerprint: string;
}

export interface MultiAgentResearchCouncilOptions {
  capitalUsd?: number;
  portfolioRiskPct?: number;
  maxSlots?: number;
  maxSymbolWeight?: number;
  maxDirectionalWeight?: number;
  maxDrawdownPct?: number;
  minProfitFactor?: number;
  minTrades?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function round(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function completedRows(report: MultiStrategyResearchReport): MultiStrategyResearchJobResult[] {
  return report.jobs.filter((row) => row.status === 'COMPLETED' && row.metrics !== null && row.utility !== null);
}

function performanceAssessment(row: MultiStrategyResearchJobResult): ResearchAgentAssessment {
  const metrics = row.metrics!;
  const reasons: string[] = [];
  const returnScore = clamp((metrics.totalPnlPct + 5) / 20, 0, 1);
  const pf = metrics.profitFactor === null || !Number.isFinite(metrics.profitFactor) ? 0 : clamp(metrics.profitFactor / 2, 0, 1);
  const sample = clamp(metrics.tradeCount / 30, 0, 1);
  const score = round(returnScore * 0.45 + pf * 0.35 + sample * 0.2);
  if (metrics.totalPnlPct > 0) reasons.push('positive_net_return');
  else reasons.push('non_positive_net_return');
  if ((metrics.profitFactor ?? 0) >= 1.2) reasons.push('profit_factor_supportive');
  if (metrics.tradeCount >= 20) reasons.push('sample_depth_supportive');
  return {
    agentId: 'PERFORMANCE', jobId: row.id,
    disposition: score >= 0.58 ? 'SUPPORT' : score >= 0.42 ? 'CAUTION' : 'NEUTRAL',
    score, reasons,
  };
}

function riskAssessment(row: MultiStrategyResearchJobResult, options: Required<Pick<MultiAgentResearchCouncilOptions, 'maxDrawdownPct' | 'minProfitFactor' | 'minTrades'>>): ResearchAgentAssessment {
  const metrics = row.metrics!;
  const reasons: string[] = [];
  const pf = metrics.profitFactor ?? 0;
  if (Math.abs(metrics.maxDrawdownPct) > options.maxDrawdownPct) reasons.push('drawdown_limit_exceeded');
  if (pf < options.minProfitFactor) reasons.push('profit_factor_below_minimum');
  if (metrics.tradeCount < options.minTrades) reasons.push('trade_sample_below_minimum');
  if (metrics.totalPnlPct <= 0) reasons.push('non_positive_return');
  const veto = reasons.length > 0;
  const riskScore = round(clamp(1 - Math.abs(metrics.maxDrawdownPct) / Math.max(1, options.maxDrawdownPct * 1.5), 0, 1));
  return { agentId: 'RISK', jobId: row.id, disposition: veto ? 'VETO' : riskScore >= 0.55 ? 'SUPPORT' : 'CAUTION', score: riskScore, reasons: veto ? reasons : ['risk_limits_passed'] };
}

function conflictAssessment(row: MultiStrategyResearchJobResult, report: MultiStrategyResearchReport): ResearchAgentAssessment {
  const conflict = report.conflicts.find((item) => item.symbol === row.symbol);
  if (!conflict) return { agentId: 'CONFLICT', jobId: row.id, disposition: 'SUPPORT', score: 1, reasons: ['no_directional_conflict'] };
  const peers = completedRows(report).filter((candidate) => candidate.symbol === row.symbol);
  const winner = [...peers].sort((a, b) => (b.utility! - a.utility!) || a.id.localeCompare(b.id))[0];
  if (winner?.id === row.id) return { agentId: 'CONFLICT', jobId: row.id, disposition: 'CAUTION', score: 0.65, reasons: ['directional_conflict_present', 'highest_utility_conflict_winner'] };
  return { agentId: 'CONFLICT', jobId: row.id, disposition: 'VETO', score: 0, reasons: ['directional_conflict_present', `higher_utility_peer:${winner?.id ?? 'unknown'}`] };
}

function portfolioAssessment(row: MultiStrategyResearchJobResult, report: MultiStrategyResearchReport): ResearchAgentAssessment {
  const rank = report.ranking.find((item) => item.id === row.id)?.rank ?? Number.MAX_SAFE_INTEGER;
  const selected = report.paperPortfolio.some((item) => item.id === row.id);
  const score = round(clamp(1 - (rank - 1) / Math.max(1, report.ranking.length), 0, 1));
  return {
    agentId: 'PORTFOLIO', jobId: row.id,
    disposition: selected ? 'SUPPORT' : score >= 0.55 ? 'CAUTION' : 'NEUTRAL',
    score,
    reasons: selected ? ['selected_by_research_portfolio'] : [`research_rank:${rank}`],
  };
}

function executionGuardianAssessment(row: MultiStrategyResearchJobResult, report: MultiStrategyResearchReport): ResearchAgentAssessment {
  const safe = report.researchOnly === true && report.executionAuthorized === false && report.automaticOrderSubmission === false;
  const finite = row.metrics !== null && [row.metrics.totalPnlPct, row.metrics.maxDrawdownPct, row.metrics.tradeCount].every(Number.isFinite);
  const reasons = [safe ? 'research_boundary_intact' : 'research_boundary_invalid', finite ? 'metrics_finite' : 'metrics_invalid'];
  return { agentId: 'EXECUTION_GUARDIAN', jobId: row.id, disposition: safe && finite ? 'SUPPORT' : 'VETO', score: safe && finite ? 1 : 0, reasons };
}

function cappedWeights(rows: Array<{ id: string; score: number; direction: 'LONG' | 'SHORT' }>, maxSymbolWeight: number, maxDirectionalWeight: number): Map<string, number> {
  const weights = new Map<string, number>();
  if (!rows.length) return weights;
  const scores = rows.map((row) => Math.max(0.000001, row.score));
  const total = scores.reduce((sum, value) => sum + value, 0);
  rows.forEach((row, index) => weights.set(row.id, Math.min(maxSymbolWeight, scores[index] / total)));

  // Redistribute remaining weight among rows that are still below the per-symbol cap.
  for (let pass = 0; pass < 8; pass += 1) {
    const allocated = [...weights.values()].reduce((sum, value) => sum + value, 0);
    const remaining = Math.max(0, 1 - allocated);
    if (remaining < 1e-9) break;
    const eligible = rows.filter((row) => (weights.get(row.id) ?? 0) < maxSymbolWeight - 1e-9);
    if (!eligible.length) break;
    const eligibleScore = eligible.reduce((sum, row) => sum + row.score, 0);
    for (const row of eligible) {
      const current = weights.get(row.id) ?? 0;
      const add = remaining * (row.score / Math.max(eligibleScore, 1e-9));
      weights.set(row.id, Math.min(maxSymbolWeight, current + add));
    }
  }

  for (const direction of ['LONG', 'SHORT'] as const) {
    const directionalRows = rows.filter((row) => row.direction === direction);
    const directionalTotal = directionalRows.reduce((sum, row) => sum + (weights.get(row.id) ?? 0), 0);
    if (directionalTotal <= maxDirectionalWeight + 1e-9) continue;
    const scale = maxDirectionalWeight / directionalTotal;
    for (const row of directionalRows) weights.set(row.id, (weights.get(row.id) ?? 0) * scale);
  }
  for (const [id, value] of weights.entries()) weights.set(id, round(value));
  return weights;
}

export function runMultiAgentResearchCouncil(report: MultiStrategyResearchReport, options: MultiAgentResearchCouncilOptions = {}): MultiAgentResearchCouncilReport {
  if (report.researchOnly !== true || report.executionAuthorized !== false || report.automaticOrderSubmission !== false) throw new Error('multi_agent_requires_research_only_report');
  const capitalUsd = boundedNumber(options.capitalUsd, 100_000, 100, 1_000_000_000);
  const portfolioRiskPct = boundedNumber(options.portfolioRiskPct, 1, 0.05, 10);
  const maxSlots = Math.floor(boundedNumber(options.maxSlots, 4, 1, 10));
  const maxSymbolWeight = boundedNumber(options.maxSymbolWeight, 0.4, 0.05, 1);
  const maxDirectionalWeight = boundedNumber(options.maxDirectionalWeight, 0.7, 0.1, 1);
  const maxDrawdownPct = boundedNumber(options.maxDrawdownPct, 20, 1, 80);
  const minProfitFactor = boundedNumber(options.minProfitFactor, 1, 0, 5);
  const minTrades = Math.floor(boundedNumber(options.minTrades, 8, 1, 1_000));
  const rows = completedRows(report);
  const assessments: ResearchAgentAssessment[] = [];
  for (const row of rows) assessments.push(
    performanceAssessment(row),
    riskAssessment(row, { maxDrawdownPct, minProfitFactor, minTrades }),
    conflictAssessment(row, report),
    portfolioAssessment(row, report),
    executionGuardianAssessment(row, report),
  );

  const consensus = rows.map<MultiAgentJobConsensus>((row) => {
    const votes = assessments.filter((item) => item.jobId === row.id);
    const supports = votes.filter((item) => item.disposition === 'SUPPORT').length;
    const cautions = votes.filter((item) => item.disposition === 'CAUTION').length;
    const vetoes = votes.filter((item) => item.disposition === 'VETO').length;
    const consensusScore = round(votes.reduce((sum, item) => sum + item.score, 0) / Math.max(1, votes.length));
    const reasons = [...new Set(votes.flatMap((item) => item.reasons))];
    return {
      id: row.id, strategyId: row.strategyId, symbol: row.symbol, direction: row.direction,
      consensusScore, supports, cautions, vetoes,
      approvedForPaperPlan: vetoes === 0 && supports >= 3 && (row.utility ?? 0) > 0,
      reasons,
    };
  }).sort((a, b) => (b.consensusScore - a.consensusScore) || a.id.localeCompare(b.id));

  const approved = consensus.filter((row) => row.approvedForPaperPlan).slice(0, maxSlots);
  const weightMap = cappedWeights(approved.map((row) => ({ id: row.id, score: row.consensusScore, direction: row.direction })), maxSymbolWeight, maxDirectionalWeight);
  const allocatedWeight = round([...weightMap.values()].reduce((sum, value) => sum + value, 0));
  const riskBudgetUsd = capitalUsd * portfolioRiskPct / 100;
  const paperTradePlan = approved.map<PaperTradeBudgetPlan>((row) => {
    const allocationWeight = weightMap.get(row.id) ?? 0;
    const riskShare = allocatedWeight > 0 ? allocationWeight / allocatedWeight : 0;
    const maxLossBudgetUsd = round(riskBudgetUsd * riskShare, 2);
    return {
      id: row.id, strategyId: row.strategyId, symbol: row.symbol, direction: row.direction,
      consensusScore: row.consensusScore,
      allocationWeight,
      notionalBudgetUsd: round(capitalUsd * allocationWeight, 2),
      maxLossBudgetUsd,
      riskPctOfCapital: round(maxLossBudgetUsd / capitalUsd * 100, 4),
      orderSubmissionAllowed: false,
      requiresManualConfirmation: true,
    };
  }).filter((row) => row.allocationWeight > 0);
  const longWeight = round(paperTradePlan.filter((row) => row.direction === 'LONG').reduce((sum, row) => sum + row.allocationWeight, 0));
  const shortWeight = round(paperTradePlan.filter((row) => row.direction === 'SHORT').reduce((sum, row) => sum + row.allocationWeight, 0));
  const withoutFingerprint = {
    version: 'multi_agent_research_council_v2' as const,
    sourceResearchFingerprint: report.deterministicFingerprint,
    assessments,
    consensus,
    paperTradePlan,
    paperTradePlanFingerprint: fingerprintPaperTradePlans(paperTradePlan),
    portfolio: {
      capitalUsd: round(capitalUsd, 2), configuredRiskPct: round(portfolioRiskPct, 4), riskBudgetUsd: round(riskBudgetUsd, 2),
      allocatedRiskUsd: round(paperTradePlan.reduce((sum, row) => sum + row.maxLossBudgetUsd, 0), 2),
      allocatedNotionalUsd: round(paperTradePlan.reduce((sum, row) => sum + row.notionalBudgetUsd, 0), 2),
      allocatedWeight, cashReserveWeight: round(Math.max(0, 1 - allocatedWeight)), longWeight, shortWeight,
      maxSymbolWeight: round(maxSymbolWeight), maxDirectionalWeight: round(maxDirectionalWeight), maxSlots,
    },
    council: {
      agents: ['PERFORMANCE', 'RISK', 'CONFLICT', 'PORTFOLIO', 'EXECUTION_GUARDIAN'] as ResearchAgentId[],
      quorum: 3,
      approvedJobs: paperTradePlan.length,
      vetoedJobs: consensus.filter((row) => row.vetoes > 0).length,
    },
    safety: {
      researchOnly: true as const, paperOnly: true as const, authoritative: false as const,
      executionAuthorized: false as const, automaticOrderSubmission: false as const, autonomousLiveExecutionEnabled: false as const,
      riskGovernorBypassAllowed: false as const, manualConfirmationRequired: true as const,
    },
  };
  const deterministicFingerprint = createHash('sha256').update(JSON.stringify(withoutFingerprint)).digest('hex');
  return { ...withoutFingerprint, deterministicFingerprint };
}
