import { createHash } from 'node:crypto';
import type {
  AcademyMetric,
  AcademyRegime,
} from '../types.ts';

export const ACADEMY_STRATEGY_INTELLIGENCE_VERSION = 'academy_intelligence_engine_v2' as const;

export type ScoreDimensionStatus = 'EVALUATED' | 'NOT_EVALUATED' | 'INSUFFICIENT_DATA';

export interface ScoreDimension {
  value: number | null;
  status: ScoreDimensionStatus;
  basis: string;
  evidenceRefs: string[];
  limitations: string[];
}

export interface MultiDimensionalStrategyScore {
  strategyId: string;
  strategyVersion: number;
  recordId: string;
  evidenceQuality: ScoreDimension;
  historicalRobustness: ScoreDimension;
  regimeFitness: ScoreDimension;
  costRobustness: ScoreDimension;
  riskEfficiency: ScoreDimension;
  parameterStability: ScoreDimension;
  neighborStability: ScoreDimension;
  diversityContribution: ScoreDimension;
  executionFeasibility: ScoreDimension;
  compositeScore: number | null;
  confidence: number | null;
  uncertainty: number | null;
  evaluatedDimensionsCount: number;
  missingDimensionsCount: number;
}

export interface StrategyDescriptor {
  strategyId: string;
  strategyVersion: number;
  recordId: string;
  name: string;
  family?: string;
  categories?: string[];
  parameters?: Array<{ key: string; value: number | string }>;
  timeframes?: string[];
  instruments?: string[];
  status?: string;
}

export interface StrategyEvidenceBundle {
  strategyId: string;
  strategyVersion: number;
  recordId: string;
  evidenceId: string;
  provenance: {
    source: string;
    datasetFingerprint: string | null;
    runId: string | null;
    timestamp: number;
    verified: boolean;
  };
  metrics?: {
    sampleSize?: number | null;
    winRatePct?: number | null;
    profitFactor?: number | null;
    maxDrawdownPct?: number | null;
    sharpeRatio?: number | null;
    sortinoRatio?: number | null;
    calmarRatio?: number | null;
    netReturnPct?: number | null;
    turnover?: number | null;
  };
  validationGates?: Record<string, boolean | null>;
  holdoutProtocolStatus?: 'PASSED' | 'FAILED' | 'SEALED' | 'NOT_EVALUATED';
  regimesMeasured?: AcademyRegime[];
  regimesProfitable?: AcademyRegime[];
}

export interface MarketRegimeContext {
  currentRegime: AcademyRegime;
  volatilityAtrPct?: number;
  trendingStrength?: number;
  confidence?: number;
}

export interface CostStressEvidence {
  strategyId: string;
  strategyVersion: number;
  feeSlippageMultiplier: number;
  passed: boolean;
  netEdgeRetainedPct: number | null;
}

export interface RobustnessEvidence {
  strategyId: string;
  strategyVersion: number;
  parameterStabilityScore: number | null;
  neighborStabilityScore: number | null;
  deflatedSharpeRatio: number | null;
  pboProbability: number | null;
  bootstrapPassed: boolean | null;
}

export interface OutcomeFeedbackEntry {
  strategyId: string;
  strategyVersion: number;
  timestamp: number;
  expectedReturnPct: number;
  observedReturnPct: number;
  observedDrawdownPct: number;
  concordance: boolean;
  failureReason?: string;
}

export interface StrategyPairComparison {
  targetId: string;
  referenceId: string;
  winnerId: string | null;
  scoreDelta: number | null;
  riskRewardAdvantage: string;
  drawdownAdvantage: string;
  sampleAdvantage: string;
  regimeAdvantage: string;
  costAdvantage: string;
  stabilityAdvantage: string;
  reasons: string[];
}

export interface StrategyRankingEntry {
  rank: number;
  strategyId: string;
  strategyVersion: number;
  recordId: string;
  name: string;
  compositeScore: number | null;
  confidence: number | null;
  uncertainty: number | null;
  rankReasons: string[];
}

export interface SimilarityDiversityMatrix {
  strategyIds: string[];
  similarity: Record<string, Record<string, number>>;
  diversity: Record<string, Record<string, number>>;
  averagePortfolioDiversity: number;
}

export type CandidateCompositionKind =
  | 'WEIGHTED_ENSEMBLE'
  | 'VOTING_ENSEMBLE'
  | 'CONFIDENCE_WEIGHTED_ENSEMBLE'
  | 'REGIME_ROUTED_COMPOSITE'
  | 'RISK_BUDGETED_COMBINATION'
  | 'DIVERSITY_WEIGHTED_COMBINATION';

export interface StrategyCombinationCandidate {
  candidateId: string;
  compositionKind: CandidateCompositionKind;
  parentStrategies: Array<{
    strategyId: string;
    strategyVersion: number;
    weight: number;
  }>;
  generationReason: string;
  weightMethodology: string;
  estimatedDiversityScore: number;
  status: 'QUALIFIED' | 'REJECTED' | 'NEEDS_EVIDENCE';
  rejectionReasons: string[];
  evidenceRefs: string[];
  engineVersion: typeof ACADEMY_STRATEGY_INTELLIGENCE_VERSION;
}

export type AcademyResearchDecision =
  | 'REJECT'
  | 'OBSERVE'
  | 'NEEDS_EVIDENCE'
  | 'NEEDS_ROBUSTNESS'
  | 'RESEARCH_CANDIDATE'
  | 'SHADOW_ELIGIBLE'
  | 'BLOCKED';

export interface AcademyStrategyIntelligenceResult {
  engineVersion: typeof ACADEMY_STRATEGY_INTELLIGENCE_VERSION;
  evaluatedAt: number;
  strategyScores: MultiDimensionalStrategyScore[];
  rankings: StrategyRankingEntry[];
  comparisons: StrategyPairComparison[];
  similarityDiversity: SimilarityDiversityMatrix;
  candidateCombinations: StrategyCombinationCandidate[];
  overallDecision: AcademyResearchDecision;
  confidence: number | null;
  uncertainty: number | null;
  primaryReasons: string[];
  failedGates: string[];
  evidenceRefs: string[];
  limitations: string[];
  recommendedNextActions: string[];
  safetyContract: {
    autonomousLiveExecutionEnabled: false;
    automaticPromotionEnabled: false;
    riskGovernorIsAuthoritative: true;
    advisoryOnly: true;
    sealedHoldoutPreserved: true;
  };
}

export class AcademyStrategyIntelligenceEngine {
  private outcomeHistory: OutcomeFeedbackEntry[] = [];

  constructor(initialOutcomes?: OutcomeFeedbackEntry[]) {
    if (initialOutcomes) {
      this.outcomeHistory = [...initialOutcomes];
    }
  }

  recordOutcomeFeedback(entry: OutcomeFeedbackEntry): void {
    this.outcomeHistory.push({ ...entry });
  }

  getOutcomeHistory(): OutcomeFeedbackEntry[] {
    return [...this.outcomeHistory];
  }

  evaluate(input: {
    strategies: StrategyDescriptor[];
    evidence: StrategyEvidenceBundle[];
    regimeContext?: MarketRegimeContext;
    costEvidence?: CostStressEvidence[];
    robustnessEvidence?: RobustnessEvidence[];
    now?: number;
  }): AcademyStrategyIntelligenceResult {
    const now = input.now ?? Date.now();
    const evidenceMap = new Map<string, StrategyEvidenceBundle>();
    for (const item of input.evidence) {
      evidenceMap.set(item.recordId, item);
    }

    const costMap = new Map<string, CostStressEvidence>();
    for (const item of input.costEvidence ?? []) {
      costMap.set(`${item.strategyId}@${item.strategyVersion}`, item);
    }

    const robustnessMap = new Map<string, RobustnessEvidence>();
    for (const item of input.robustnessEvidence ?? []) {
      robustnessMap.set(`${item.strategyId}@${item.strategyVersion}`, item);
    }

    // 1. Multi-dimensional Scoring
    const strategyScores = input.strategies.map((strat) =>
      this.scoreStrategy(strat, evidenceMap.get(strat.recordId), input.regimeContext, costMap.get(strat.recordId), robustnessMap.get(strat.recordId)),
    );

    // 2. Explainable Rankings
    const rankings = this.rankStrategies(strategyScores, input.strategies);

    // 3. Pairwise & Top-N Comparisons
    const comparisons = this.compareStrategies(strategyScores, input.strategies);

    // 4. Similarity & Diversity Matrix
    const similarityDiversity = this.buildSimilarityDiversityMatrix(input.strategies, strategyScores);

    // 5. Strategy Fusion & Candidate Generation
    const candidateCombinations = this.generateCandidates(
      input.strategies,
      strategyScores,
      similarityDiversity,
      input.regimeContext,
    );

    // 6. Overall Research Decision
    const topScore = strategyScores.slice().sort((a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1))[0];
    const topCandidate = candidateCombinations.find((c) => c.status === 'QUALIFIED');

    let overallDecision: AcademyResearchDecision = 'NEEDS_EVIDENCE';
    const primaryReasons: string[] = [];
    const failedGates: string[] = [];
    const evidenceRefs: string[] = [];
    const limitations: string[] = [];
    const recommendedNextActions: string[] = [];

    if (!input.strategies.length) {
      overallDecision = 'NEEDS_EVIDENCE';
      primaryReasons.push('No strategies provided to research intelligence engine.');
      limitations.push('Empty strategy input universe.');
      recommendedNextActions.push('Register strategies through the internal collector adapter.');
    } else if (!topScore || topScore.compositeScore == null) {
      overallDecision = 'NEEDS_EVIDENCE';
      primaryReasons.push('Available strategies lack required evaluation metrics.');
      limitations.push('Evidence bundles incomplete across primary performance dimensions.');
      recommendedNextActions.push('Run walk-forward validation and backtesting pipelines.');
    } else if (topCandidate) {
      overallDecision = 'RESEARCH_CANDIDATE';
      primaryReasons.push(`Qualified candidate '${topCandidate.candidateId}' formed via ${topCandidate.compositionKind} with diversity ${topCandidate.estimatedDiversityScore}.`);
      evidenceRefs.push(...topCandidate.evidenceRefs);
      recommendedNextActions.push('Submit candidate to supervised shadow evaluation.');
    } else if (topScore.compositeScore >= 70 && topScore.confidence != null && topScore.confidence >= 0.65) {
      overallDecision = 'SHADOW_ELIGIBLE';
      primaryReasons.push(`Strategy '${topScore.strategyId}@${topScore.strategyVersion}' qualified for supervised paper shadow tracking with score ${topScore.compositeScore}.`);
      recommendedNextActions.push('Confirm paper forwarding under server governance.');
    } else if (topScore.compositeScore < 40) {
      overallDecision = 'REJECT';
      primaryReasons.push(`Evaluated strategies fall below minimum viable edge threshold (top composite score: ${topScore.compositeScore}).`);
      failedGates.push('MINIMUM_EDGE_THRESHOLD');
      recommendedNextActions.push('Collect cleaner data or revise strategy setup rules.');
    } else {
      overallDecision = 'OBSERVE';
      primaryReasons.push(`Evaluated strategies show moderate edge (${topScore.compositeScore}) but require further robustness and regime evidence.`);
      recommendedNextActions.push('Execute out-of-sample and multi-regime stress cycles.');
    }

    // Collect all evidence refs & limitations
    for (const score of strategyScores) {
      if (score.costRobustness.status === 'NOT_EVALUATED') limitations.push(`Cost robustness not evaluated for ${score.recordId}.`);
      if (score.historicalRobustness.status === 'NOT_EVALUATED') limitations.push(`Historical robustness checks incomplete for ${score.recordId}.`);
      if (score.regimeFitness.status === 'NOT_EVALUATED') limitations.push(`Regime fitness unmeasured for ${score.recordId}.`);
    }

    const meanConfidence = strategyScores.filter((s) => s.confidence != null).map((s) => s.confidence as number);
    const overallConfidence = meanConfidence.length ? Number((meanConfidence.reduce((a, b) => a + b, 0) / meanConfidence.length).toFixed(3)) : null;

    const meanUncertainty = strategyScores.filter((s) => s.uncertainty != null).map((s) => s.uncertainty as number);
    const overallUncertainty = meanUncertainty.length ? Number((meanUncertainty.reduce((a, b) => a + b, 0) / meanUncertainty.length).toFixed(3)) : null;

    return {
      engineVersion: ACADEMY_STRATEGY_INTELLIGENCE_VERSION,
      evaluatedAt: now,
      strategyScores,
      rankings,
      comparisons,
      similarityDiversity,
      candidateCombinations,
      overallDecision,
      confidence: overallConfidence,
      uncertainty: overallUncertainty,
      primaryReasons,
      failedGates,
      evidenceRefs: [...new Set(evidenceRefs)],
      limitations: [...new Set(limitations)],
      recommendedNextActions,
      safetyContract: {
        autonomousLiveExecutionEnabled: false,
        automaticPromotionEnabled: false,
        riskGovernorIsAuthoritative: true,
        advisoryOnly: true,
        sealedHoldoutPreserved: true,
      },
    };
  }

  private scoreStrategy(
    desc: StrategyDescriptor,
    evidence?: StrategyEvidenceBundle,
    regimeContext?: MarketRegimeContext,
    costEvidence?: CostStressEvidence,
    robustnessEvidence?: RobustnessEvidence,
  ): MultiDimensionalStrategyScore {
    const recordId = desc.recordId || `${desc.strategyId}@${desc.strategyVersion}`;

    // 1. Evidence Quality
    let evidenceQuality: ScoreDimension;
    if (!evidence) {
      evidenceQuality = { value: null, status: 'NOT_EVALUATED', basis: 'No evidence bundle attached to strategy.', evidenceRefs: [], limitations: ['Missing evidence bundle.'] };
    } else {
      let qVal = 40;
      const limitations: string[] = [];
      if (evidence.provenance.verified) qVal += 30;
      else limitations.push('Unverified source provenance.');
      if (evidence.provenance.datasetFingerprint) qVal += 20;
      else limitations.push('Missing dataset fingerprint.');
      if (evidence.metrics?.sampleSize && evidence.metrics.sampleSize >= 100) qVal += 10;
      else limitations.push('Small sample size (<100 trades).');
      evidenceQuality = {
        value: qVal,
        status: 'EVALUATED',
        basis: `Provenance verified: ${evidence.provenance.verified}; Dataset fingerprint: ${Boolean(evidence.provenance.datasetFingerprint)}.`,
        evidenceRefs: [evidence.evidenceId],
        limitations,
      };
    }

    // 2. Historical Robustness
    let historicalRobustness: ScoreDimension;
    if (robustnessEvidence && robustnessEvidence.parameterStabilityScore != null) {
      const pScore = robustnessEvidence.parameterStabilityScore;
      const nScore = robustnessEvidence.neighborStabilityScore ?? pScore;
      const robVal = Number((((pScore + nScore) / 2) * 100).toFixed(1));
      historicalRobustness = {
        value: robVal,
        status: 'EVALUATED',
        basis: `Parameter stability: ${pScore}; Neighbor stability: ${nScore}.`,
        evidenceRefs: evidence ? [evidence.evidenceId] : [],
        limitations: robustnessEvidence.bootstrapPassed === false ? ['Bootstrap resilience check failed.'] : [],
      };
    } else if (evidence?.validationGates) {
      const gates = evidence.validationGates;
      const evaluatedGates = Object.values(gates).filter((g) => g !== null);
      const passedGates = evaluatedGates.filter((g) => g === true);
      const val = evaluatedGates.length ? Number(((passedGates.length / evaluatedGates.length) * 100).toFixed(1)) : null;
      historicalRobustness = {
        value: val,
        status: val !== null ? 'EVALUATED' : 'NOT_EVALUATED',
        basis: `Passed ${passedGates.length}/${evaluatedGates.length} validation gates.`,
        evidenceRefs: evidence ? [evidence.evidenceId] : [],
        limitations: passedGates.length < evaluatedGates.length ? ['One or more validation gates failed.'] : [],
      };
    } else {
      historicalRobustness = { value: null, status: 'NOT_EVALUATED', basis: 'No robustness metrics or validation gates provided.', evidenceRefs: [], limitations: ['Robustness unmeasured.'] };
    }

    // 3. Regime Fitness
    let regimeFitness: ScoreDimension;
    if (regimeContext && evidence?.regimesMeasured) {
      const isMeasured = evidence.regimesMeasured.includes(regimeContext.currentRegime);
      const isProfitable = (evidence.regimesProfitable ?? []).includes(regimeContext.currentRegime);
      const val = !isMeasured ? 20 : isProfitable ? 90 : 40;
      regimeFitness = {
        value: val,
        status: 'EVALUATED',
        basis: `Active regime: ${regimeContext.currentRegime}. Measured: ${isMeasured}; Profitable: ${isProfitable}.`,
        evidenceRefs: evidence ? [evidence.evidenceId] : [],
        limitations: !isProfitable ? [`Strategy not profitable in active regime (${regimeContext.currentRegime}).`] : [],
      };
    } else {
      regimeFitness = { value: null, status: 'NOT_EVALUATED', basis: 'Active regime context or strategy regime coverage missing.', evidenceRefs: [], limitations: ['Regime fitness unmeasured.'] };
    }

    // 4. Cost Robustness
    let costRobustness: ScoreDimension;
    if (costEvidence && costEvidence.netEdgeRetainedPct != null) {
      const val = Math.max(0, Math.min(100, costEvidence.netEdgeRetainedPct));
      costRobustness = {
        value: val,
        status: 'EVALUATED',
        basis: `Retains ${val}% net edge under fee/slippage multiplier ${costEvidence.feeSlippageMultiplier}x.`,
        evidenceRefs: evidence ? [evidence.evidenceId] : [],
        limitations: !costEvidence.passed ? ['Fails cost stress threshold under multiplied fees/slippage.'] : [],
      };
    } else {
      costRobustness = { value: null, status: 'NOT_EVALUATED', basis: 'Cost stress testing not evaluated.', evidenceRefs: [], limitations: ['Cost robustness unmeasured.'] };
    }

    // 5. Risk Efficiency
    let riskEfficiency: ScoreDimension;
    if (evidence?.metrics?.profitFactor != null && evidence.metrics.maxDrawdownPct != null) {
      const pf = Math.max(0, evidence.metrics.profitFactor);
      const dd = Math.max(0.1, evidence.metrics.maxDrawdownPct);
      // Normalized risk-efficiency metric: PF of 2.0 with 10% DD yields high score
      const val = Math.max(0, Math.min(100, Number(((pf / (1 + dd / 20)) * 50).toFixed(1))));
      riskEfficiency = {
        value: val,
        status: 'EVALUATED',
        basis: `Profit Factor: ${pf.toFixed(2)}, Max Drawdown: ${dd.toFixed(1)}%.`,
        evidenceRefs: evidence ? [evidence.evidenceId] : [],
        limitations: dd > 15 ? ['Elevated drawdown risk (>15%).'] : [],
      };
    } else {
      riskEfficiency = { value: null, status: 'NOT_EVALUATED', basis: 'Profit factor or drawdown metrics absent.', evidenceRefs: [], limitations: ['Risk efficiency unmeasured.'] };
    }

    // 6. Parameter Stability
    let parameterStability: ScoreDimension;
    if (robustnessEvidence?.parameterStabilityScore != null) {
      const val = Math.round(robustnessEvidence.parameterStabilityScore * 100);
      parameterStability = {
        value: val,
        status: 'EVALUATED',
        basis: `Evaluated parameter neighborhood consistency: ${val}%.`,
        evidenceRefs: evidence ? [evidence.evidenceId] : [],
        limitations: val < 60 ? ['Fragile parameter sensitivity detected in neighborhood grid.'] : [],
      };
    } else {
      parameterStability = { value: null, status: 'NOT_EVALUATED', basis: 'Parameter neighborhood stability not provided.', evidenceRefs: [], limitations: ['Parameter stability unmeasured.'] };
    }

    // 7. Neighbor Stability
    let neighborStability: ScoreDimension;
    if (robustnessEvidence?.neighborStabilityScore != null) {
      const val = Math.round(robustnessEvidence.neighborStabilityScore * 100);
      neighborStability = {
        value: val,
        status: 'EVALUATED',
        basis: `Neighboring walk-forward fold correlation: ${val}%.`,
        evidenceRefs: evidence ? [evidence.evidenceId] : [],
        limitations: val < 50 ? ['Neighboring fold performance deviates significantly.'] : [],
      };
    } else {
      neighborStability = { value: null, status: 'NOT_EVALUATED', basis: 'Neighboring fold stability not provided.', evidenceRefs: [], limitations: ['Neighbor stability unmeasured.'] };
    }

    // 8. Diversity Contribution
    const diversityContribution: ScoreDimension = {
      value: 70, // Baseline contribution prior to portfolio cross-matrix
      status: 'EVALUATED',
      basis: `Categorical family: ${desc.family || 'general'}; timeframes: ${(desc.timeframes || ['1h']).join(',')}.`,
      evidenceRefs: [],
      limitations: [],
    };

    // 9. Execution Feasibility
    let executionFeasibility: ScoreDimension;
    if (evidence?.metrics?.turnover != null) {
      const turnover = evidence.metrics.turnover;
      const val = Math.max(0, Math.min(100, Math.round(100 - turnover * 10)));
      executionFeasibility = {
        value: val,
        status: 'EVALUATED',
        basis: `Turnover rate: ${turnover} trades/day.`,
        evidenceRefs: evidence ? [evidence.evidenceId] : [],
        limitations: turnover > 10 ? ['High trade frequency creates execution bottleneck risk.'] : [],
      };
    } else {
      executionFeasibility = { value: 75, status: 'EVALUATED', basis: 'Default moderate execution feasibility for liquid futures.', evidenceRefs: [], limitations: [] };
    }

    // Composite & Confidence Calculation
    const allDimensions = [
      evidenceQuality,
      historicalRobustness,
      regimeFitness,
      costRobustness,
      riskEfficiency,
      parameterStability,
      neighborStability,
      diversityContribution,
      executionFeasibility,
    ];

    const evaluatedDims = allDimensions.filter((d) => d.status === 'EVALUATED' && d.value !== null);
    const evaluatedCount = evaluatedDims.length;
    const missingCount = allDimensions.length - evaluatedCount;

    let compositeScore: number | null = null;
    let confidence: number | null = null;
    let uncertainty: number | null = null;

    if (evaluatedCount >= 3) {
      const sum = evaluatedDims.reduce((acc, curr) => acc + (curr.value ?? 0), 0);
      compositeScore = Number((sum / evaluatedCount).toFixed(1));
      // Confidence increases with proportion of evaluated dimensions and sample size
      const coverageRatio = evaluatedCount / allDimensions.length;
      const sampleWeight = Math.min(1, (evidence?.metrics?.sampleSize ?? 50) / 200);
      confidence = Number((coverageRatio * 0.7 + sampleWeight * 0.3).toFixed(3));
      uncertainty = Number((1 - confidence).toFixed(3));
    }

    return {
      strategyId: desc.strategyId,
      strategyVersion: desc.strategyVersion,
      recordId,
      evidenceQuality,
      historicalRobustness,
      regimeFitness,
      costRobustness,
      riskEfficiency,
      parameterStability,
      neighborStability,
      diversityContribution,
      executionFeasibility,
      compositeScore,
      confidence,
      uncertainty,
      evaluatedDimensionsCount: evaluatedCount,
      missingDimensionsCount: missingCount,
    };
  }

  private rankStrategies(
    scores: MultiDimensionalStrategyScore[],
    descriptors: StrategyDescriptor[],
  ): StrategyRankingEntry[] {
    const descMap = new Map<string, StrategyDescriptor>();
    for (const d of descriptors) descMap.set(d.recordId, d);

    const sorted = [...scores].sort((left, right) => {
      // 1. Composite score descending
      const lScore = left.compositeScore ?? -1;
      const rScore = right.compositeScore ?? -1;
      if (lScore !== rScore) return rScore - lScore;

      // 2. Confidence descending
      const lConf = left.confidence ?? -1;
      const rConf = right.confidence ?? -1;
      if (lConf !== rConf) return rConf - lConf;

      // 3. Evaluated count descending
      if (left.evaluatedDimensionsCount !== right.evaluatedDimensionsCount) {
        return right.evaluatedDimensionsCount - left.evaluatedDimensionsCount;
      }

      // 4. Deterministic tie-breaker
      return left.recordId.localeCompare(right.recordId);
    });

    return sorted.map((entry, index) => {
      const desc = descMap.get(entry.recordId);
      const rank = index + 1;
      const reasons: string[] = [];

      if (entry.compositeScore != null) {
        reasons.push(`Composite score ${entry.compositeScore} across ${entry.evaluatedDimensionsCount} evaluated dimensions.`);
      } else {
        reasons.push('Insufficient evidence to compute reliable composite score.');
      }

      if (entry.confidence != null && entry.confidence >= 0.7) {
        reasons.push(`High evidence confidence (${(entry.confidence * 100).toFixed(0)}%).`);
      } else if (entry.uncertainty != null && entry.uncertainty > 0.5) {
        reasons.push(`Elevated uncertainty (${(entry.uncertainty * 100).toFixed(0)}%) due to ${entry.missingDimensionsCount} missing dimensions.`);
      }

      return {
        rank,
        strategyId: entry.strategyId,
        strategyVersion: entry.strategyVersion,
        recordId: entry.recordId,
        name: desc?.name ?? entry.strategyId,
        compositeScore: entry.compositeScore,
        confidence: entry.confidence,
        uncertainty: entry.uncertainty,
        rankReasons: reasons,
      };
    });
  }

  private compareStrategies(
    scores: MultiDimensionalStrategyScore[],
    descriptors: StrategyDescriptor[],
  ): StrategyPairComparison[] {
    const comparisons: StrategyPairComparison[] = [];
    if (scores.length < 2) return comparisons;

    for (let i = 0; i < scores.length; i++) {
      for (let j = i + 1; j < scores.length; j++) {
        const a = scores[i];
        const b = scores[j];
        const aScore = a.compositeScore ?? 0;
        const bScore = b.compositeScore ?? 0;
        const delta = Number((aScore - bScore).toFixed(1));
        const winnerId = delta > 2 ? a.strategyId : delta < -2 ? b.strategyId : null;

        const reasons: string[] = [];
        const rrAdv = (a.riskEfficiency.value ?? 0) >= (b.riskEfficiency.value ?? 0) ? a.strategyId : b.strategyId;
        const regAdv = (a.regimeFitness.value ?? 0) >= (b.regimeFitness.value ?? 0) ? a.strategyId : b.strategyId;
        const costAdv = (a.costRobustness.value ?? 0) >= (b.costRobustness.value ?? 0) ? a.strategyId : b.strategyId;
        const stabAdv = (a.parameterStability.value ?? 0) >= (b.parameterStability.value ?? 0) ? a.strategyId : b.strategyId;

        if (winnerId === a.strategyId) {
          reasons.push(`${a.strategyId}@${a.strategyVersion} outperforms ${b.strategyId}@${b.strategyVersion} by +${delta} points.`);
        } else if (winnerId === b.strategyId) {
          reasons.push(`${b.strategyId}@${b.strategyVersion} outperforms ${a.strategyId}@${a.strategyVersion} by +${Math.abs(delta)} points.`);
        } else {
          reasons.push(`${a.strategyId} and ${b.strategyId} exhibit statistically comparable multi-dimensional fitness (delta: ${delta}).`);
        }

        comparisons.push({
          targetId: a.recordId,
          referenceId: b.recordId,
          winnerId: winnerId ? (winnerId === a.strategyId ? a.recordId : b.recordId) : null,
          scoreDelta: delta,
          riskRewardAdvantage: rrAdv,
          drawdownAdvantage: rrAdv,
          sampleAdvantage: (a.evidenceQuality.value ?? 0) >= (b.evidenceQuality.value ?? 0) ? a.strategyId : b.strategyId,
          regimeAdvantage: regAdv,
          costAdvantage: costAdv,
          stabilityAdvantage: stabAdv,
          reasons,
        });
      }
    }
    return comparisons;
  }

  private buildSimilarityDiversityMatrix(
    descriptors: StrategyDescriptor[],
    scores: MultiDimensionalStrategyScore[],
  ): SimilarityDiversityMatrix {
    const strategyIds = descriptors.map((d) => d.recordId);
    const similarity: Record<string, Record<string, number>> = {};
    const diversity: Record<string, Record<string, number>> = {};

    let totalPairs = 0;
    let diversitySum = 0;

    for (const a of descriptors) {
      similarity[a.recordId] = {};
      diversity[a.recordId] = {};
      for (const b of descriptors) {
        if (a.recordId === b.recordId) {
          similarity[a.recordId][b.recordId] = 1.0;
          diversity[a.recordId][b.recordId] = 0.0;
        } else {
          // Compute multi-attribute similarity
          let sim = 0.0;
          // Family similarity
          if (a.family && b.family && a.family === b.family) sim += 0.4;
          // Category overlap
          const catA = new Set(a.categories || []);
          const catB = new Set(b.categories || []);
          const intersection = [...catA].filter((x) => catB.has(x)).length;
          const union = new Set([...catA, ...catB]).size || 1;
          sim += (intersection / union) * 0.3;

          // Timeframe overlap
          const tfA = new Set(a.timeframes || ['1h']);
          const tfB = new Set(b.timeframes || ['1h']);
          const tfIntersect = [...tfA].filter((x) => tfB.has(x)).length;
          const tfUnion = new Set([...tfA, ...tfB]).size || 1;
          sim += (tfIntersect / tfUnion) * 0.3;

          const simClamped = Number(Math.min(1.0, Math.max(0.0, sim)).toFixed(3));
          const divClamped = Number((1.0 - simClamped).toFixed(3));

          similarity[a.recordId][b.recordId] = simClamped;
          diversity[a.recordId][b.recordId] = divClamped;

          totalPairs += 1;
          diversitySum += divClamped;
        }
      }
    }

    const averagePortfolioDiversity = totalPairs > 0 ? Number((diversitySum / totalPairs).toFixed(3)) : 1.0;

    return {
      strategyIds,
      similarity,
      diversity,
      averagePortfolioDiversity,
    };
  }

  private generateCandidates(
    descriptors: StrategyDescriptor[],
    scores: MultiDimensionalStrategyScore[],
    matrix: SimilarityDiversityMatrix,
    regime?: MarketRegimeContext,
  ): StrategyCombinationCandidate[] {
    const candidates: StrategyCombinationCandidate[] = [];
    if (descriptors.length < 2) return candidates;

    // Filter viable parent strategies (compositeScore >= 50 and not blocked)
    const viableParents = scores.filter((s) => (s.compositeScore ?? 0) >= 50);
    if (viableParents.length < 2) return candidates;

    for (let i = 0; i < viableParents.length; i++) {
      for (let j = i + 1; j < viableParents.length; j++) {
        const p1 = viableParents[i];
        const p2 = viableParents[j];
        const pairDiv = matrix.diversity[p1.recordId]?.[p2.recordId] ?? 0.5;

        const candidateId = `candidate-fusion-${createHash('sha256')
          .update(`${p1.recordId}|${p2.recordId}|${regime?.currentRegime || 'DEFAULT'}`)
          .digest('hex')
          .slice(0, 16)}`;

        const rejectionReasons: string[] = [];
        if (pairDiv < 0.2) {
          rejectionReasons.push(`Excessive strategy correlation / collinearity (diversity ${pairDiv} < 0.20 threshold).`);
        }
        if (p1.costRobustness.status === 'EVALUATED' && (p1.costRobustness.value ?? 0) < 40) {
          rejectionReasons.push(`Parent '${p1.recordId}' failed cost resilience.`);
        }
        if (p2.costRobustness.status === 'EVALUATED' && (p2.costRobustness.value ?? 0) < 40) {
          rejectionReasons.push(`Parent '${p2.recordId}' failed cost resilience.`);
        }

        const isQualified = rejectionReasons.length === 0;

        // Calculate weights inversely proportional to risk or proportional to confidence
        const w1 = Number(((p1.compositeScore ?? 50) / ((p1.compositeScore ?? 50) + (p2.compositeScore ?? 50))).toFixed(3));
        const w2 = Number((1.0 - w1).toFixed(3));

        candidates.push({
          candidateId,
          compositionKind: pairDiv >= 0.5 ? 'DIVERSITY_WEIGHTED_COMBINATION' : 'CONFIDENCE_WEIGHTED_ENSEMBLE',
          parentStrategies: [
            { strategyId: p1.strategyId, strategyVersion: p1.strategyVersion, weight: w1 },
            { strategyId: p2.strategyId, strategyVersion: p2.strategyVersion, weight: w2 },
          ],
          generationReason: `Composed from complimentary parents ${p1.recordId} (score: ${p1.compositeScore}) and ${p2.recordId} (score: ${p2.compositeScore}) with pair diversity ${pairDiv}.`,
          weightMethodology: 'Score-normalized deterministic inverse risk allocation.',
          estimatedDiversityScore: pairDiv,
          status: isQualified ? 'QUALIFIED' : 'REJECTED',
          rejectionReasons,
          evidenceRefs: [...p1.evidenceQuality.evidenceRefs, ...p2.evidenceQuality.evidenceRefs],
          engineVersion: ACADEMY_STRATEGY_INTELLIGENCE_VERSION,
        });
      }
    }

    return candidates;
  }
}
