import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';
import type { DecisionSnapshot } from '../canonicalDecisionAdapter';
import { buildTradePlan, type TradePlan, type TradePlanInput } from '../tradePlan';
import { evaluateRiskGovernor, type RiskGovernorInput, type RiskGovernorResult } from '../riskGovernor';

export interface LiquidityHunterDecisionBridgeResult {
  decision: DecisionSnapshot;
  liquidityHunter: LiquidityHunterEvaluation;
  directionAligned: boolean;
  executionAuthorized: false;
}

export interface LiquidityHunterTradePlanAuthorization {
  decision: DecisionSnapshot;
  liquidityHunter: LiquidityHunterEvaluation;
  tradePlan: TradePlan | null;
  risk: RiskGovernorResult | null;
  acceptedSetup: boolean;
  manualConfirmationRequired: true;
  executionAuthorized: false;
  reasons: string[];
}

/**
 * Attaches Liquidity Hunter evidence to an already-built canonical decision.
 * It deliberately does not replace baseline ranking, mutate the TradePlan, or
 * authorize execution. A future audited promotion can change authority, but
 * this bridge is shadow-only by construction.
 */
export function bridgeLiquidityHunterToCanonicalDecision(
  decision: DecisionSnapshot,
  evaluation: LiquidityHunterEvaluation,
): LiquidityHunterDecisionBridgeResult {
  const triggerDirection = evaluation.trigger.direction;
  const directionAligned = triggerDirection !== null && decision.direction === triggerDirection;
  const supporting = [
    ...decision.supportingSignals,
    ...evaluation.evidence
      .filter((edge) => edge.status === 'PASS' && (triggerDirection === null || edge.direction === triggerDirection || edge.direction === 'NEUTRAL'))
      .map((edge) => `Liquidity Hunter ${edge.edgeId}: ${(edge.score ?? 0).toFixed(3)}`),
  ];
  const conflicting = [
    ...decision.conflictingSignals,
    ...evaluation.evidence
      .filter((edge) => edge.status === 'PASS' && triggerDirection !== null && edge.direction !== null && edge.direction !== 'NEUTRAL' && edge.direction !== triggerDirection)
      .map((edge) => `Liquidity Hunter conflict ${edge.edgeId}: ${(edge.score ?? 0).toFixed(3)}`),
  ];

  return {
    decision: {
      ...decision,
      supportingSignals: [...new Set(supporting)],
      conflictingSignals: [...new Set(conflicting)],
      engineVersion: `${decision.engineVersion}+lh-shadow-v1`,
    },
    liquidityHunter: structuredClone(evaluation),
    directionAligned,
    executionAuthorized: false,
  };
}

/**
 * Production bridge for a READY_FOR_CONFIRMATION setup. It deliberately uses
 * the shared TradePlan builder and the one central Risk Governor. A passing
 * risk decision makes the plan eligible for a later human-confirmed testnet
 * canary only; this function never submits an order or grants execution.
 */
export function authorizeLiquidityHunterTradePlan(input: {
  decision: DecisionSnapshot;
  evaluation: LiquidityHunterEvaluation;
  tradePlan: Omit<TradePlanInput, 'decisionRef' | 'direction' | 'symbol'>;
  risk: Omit<RiskGovernorInput, 'plan' | 'order' | 'executionMode'>;
}): LiquidityHunterTradePlanAuthorization {
  const bridged = bridgeLiquidityHunterToCanonicalDecision(input.decision, input.evaluation);
  const acceptedSetup = input.evaluation.setupState === 'READY_FOR_CONFIRMATION'
    && input.evaluation.eligibleForManualConfirmation
    && input.evaluation.setupId !== null
    && input.evaluation.trigger.direction !== null
    && bridged.directionAligned;
  if (!acceptedSetup) {
    return {
      ...bridged, tradePlan: null, risk: null, acceptedSetup: false,
      manualConfirmationRequired: true, executionAuthorized: false,
      reasons: ['liquidity_hunter_setup_not_accepted_or_direction_misaligned'],
    };
  }
  const direction = input.evaluation.trigger.direction!;
  const tradePlan = buildTradePlan({
    ...input.tradePlan,
    symbol: input.evaluation.symbol,
    direction,
    decisionRef: {
      score: bridged.decision.rankingScore,
      readinessTier: bridged.decision.baseline.readinessTier,
      engineVersion: bridged.decision.engineVersion,
      createdAt: bridged.decision.createdAt,
    },
  });
  const risk = evaluateRiskGovernor({
    ...input.risk,
    executionMode: 'MANUAL',
    plan: tradePlan,
    order: {
      symbol: tradePlan.symbol,
      direction: tradePlan.direction,
      quantity: tradePlan.quantity,
      entryPrice: tradePlan.entryPrice,
      notionalUsd: tradePlan.sizing.positionSizeUsd,
      leverage: tradePlan.leverage,
      reduceOnly: false,
      exchange: 'kucoin-testnet',
      strategy: 'liquidity-hunter-manual-testnet',
    },
  });
  const riskPassed = risk.decision === 'APPROVED' || risk.decision === 'APPROVED_REDUCED';
  return {
    ...bridged,
    tradePlan,
    risk,
    acceptedSetup: true,
    manualConfirmationRequired: true,
    executionAuthorized: false,
    reasons: riskPassed ? ['risk_governor_passed_manual_confirmation_still_required'] : risk.reasons,
  };
}
