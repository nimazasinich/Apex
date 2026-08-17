export type ExecutionPositionState =
  | 'CREATED'
  | 'RISK_AUTHORIZED'
  | 'AWAITING_MANUAL_CONFIRMATION'
  | 'SUBMITTING'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'PROTECTING'
  | 'PROTECTED'
  | 'CLOSING'
  | 'CLOSED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'UNKNOWN'
  | 'RECONCILING'
  | 'FAILED';

export interface ExecutionPositionTransition {
  transitionId: string;
  executionId: string;
  previousState: ExecutionPositionState;
  nextState: ExecutionPositionState;
  occurredAt: number;
  reason: string;
  exchangeOrderId?: string;
  clientOrderId?: string;
}
