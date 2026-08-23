import type {
  CommanderDirection,
  CommanderMarketRegime,
  OpportunityThesis,
  TrendRelation,
} from './commanderContext';
import type {
  CommanderEvidenceDirection,
  CommanderEvidenceFamily,
  CommanderEvidenceQuality,
} from './commanderEvidence';

export interface CommanderOutcomeAttributionV1 {
  version: 'commander_outcome_attribution_v1';
  decisionId: string;
  strategyId: string;
  strategyVersion: string;
  parameterProfileFingerprint: string;
  opportunityFingerprint: string;
  evidenceFingerprint: string;
  evidenceIds: string[];
  evidence: CommanderEvidenceAttributionV1[];
  symbol: string;
  interval: string;
  direction: CommanderDirection;
  regime: CommanderMarketRegime;
  thesis: OpportunityThesis | null;
  trendRelation: TrendRelation;
  predictedConfidence: number;
}

export interface CommanderEvidenceAttributionV1 {
  evidenceId: string;
  expertId: string;
  expertVersion: string;
  family: CommanderEvidenceFamily;
  timeframe: string;
  direction: CommanderEvidenceDirection;
  confidence: number;
  valueQuality: CommanderEvidenceQuality;
}

export interface CommanderResearchComparisonV1 {
  version: 'commander_research_comparison_v1';
  decisionId: string;
  strategyId: string;
  strategyVersion: string;
  parameterProfileFingerprint: string;
  symbol: string;
  interval: string;
  direction: CommanderDirection;
  disposition: 'SELECT' | 'SUPPRESS' | 'ABSTAIN';
  reason: string;
  shadowOnly: true;
  researchRoutingApplied: false;
}

export interface CommanderOutcomeObservationV1 {
  version: 'commander_outcome_observation_v1';
  outcomeId: string;
  occurredAt: number;
  attribution: CommanderOutcomeAttributionV1;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  realizedPnlPct: number | null;
  successScore: number;
  researchOnly: true;
}

export interface CommanderOutcomeExtraction {
  observation: CommanderOutcomeObservationV1 | null;
  reason: string | null;
}
