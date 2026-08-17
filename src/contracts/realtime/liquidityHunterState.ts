import type { EdgeEvidence } from './edgeEvidence';

export type SweepDirection = 'UP' | 'DOWN' | 'NONE';
export type TradeBias = 'LONG' | 'SHORT' | 'BOTH' | 'NO_TRADE';
export type LiquidityHunterSetupState =
  | 'IDLE'
  | 'MACRO_ELIGIBLE'
  | 'TARGET_MAPPED'
  | 'ARMED'
  | 'MICRO_TRIGGERED'
  | 'SHADOW_VALIDATING'
  | 'READY_FOR_CONFIRMATION'
  | 'EXPIRED'
  | 'REJECTED';

export interface LayerDecision {
  layer: 1 | 2 | 3 | 4;
  status: 'BLOCKED' | 'ELIGIBLE' | 'PASSED' | 'EXPIRED';
  supporting: EdgeEvidence[];
  conflicting: EdgeEvidence[];
  missing: EdgeEvidence[];
  decidedAt: number;
  expiresAt: number;
}

export interface LiquidityHunterSetupTransition {
  transitionId: string;
  setupId: string;
  previousState: LiquidityHunterSetupState;
  nextState: LiquidityHunterSetupState;
  evidenceIds: string[];
  policyVersion: string;
  occurredAt: number;
  expiresAt: number;
  reasons: string[];
}

export interface MacroRegimeDecision {
  expectedSweepDirection: SweepDirection;
  postSweepTradeBias: TradeBias;
  volatilityRegime: 'AMPLIFYING' | 'DAMPENING' | 'UNSTABLE' | 'UNKNOWN';
  score: number;
}

export interface LiquidityHunterTarget {
  sourceEdge: 'LIQUIDATION_TOPOLOGY' | 'SESSION_LIQUIDITY';
  liquidityType: 'LONG_LIQUIDATIONS' | 'SHORT_LIQUIDATIONS' | 'BSL' | 'SSL' | 'SMC_ZONE';
  lowerPrice: number;
  upperPrice: number;
  midpoint: number;
  invalidationPrice: number | null;
  validUntil: number;
}

export type MicroTriggerKind =
  | 'NO_TRIGGER'
  | 'ABSORPTION_REVERSAL_TRIGGER'
  | 'CONTINUATION_TRIGGER'
  | 'DEFERRED'
  | 'INVALIDATED';

export interface MicroTriggerDecision {
  kind: MicroTriggerKind;
  direction: 'LONG' | 'SHORT' | null;
  score: number;
  invalidationPrice: number | null;
  reasons: string[];
}

export type ShadowValidationDecision = 'CONFIRM' | 'CONFIRM_WITH_REDUCED_SIZE' | 'DEFER' | 'REJECT' | 'UNKNOWN';

export interface LiquidityHunterEvaluation {
  evaluationId: string;
  symbol: string;
  generatedAt: number;
  setupId: string | null;
  setupState: LiquidityHunterSetupState;
  transitions: LiquidityHunterSetupTransition[];
  layers: LayerDecision[];
  evidence: EdgeEvidence[];
  macro: MacroRegimeDecision;
  target: LiquidityHunterTarget | null;
  trigger: MicroTriggerDecision;
  shadowValidation: ShadowValidationDecision;
  fusionScore: number;
  eligibleForManualConfirmation: boolean;
  shadowOnly: true;
  authoritative: false;
  reasons: string[];
}
