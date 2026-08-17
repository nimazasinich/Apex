import { randomUUID } from 'node:crypto';
import type { ExecutionPositionState, ExecutionPositionTransition } from '../../contracts/realtime/executionPositionState';

export interface ExecutionPositionLifecycleSnapshot {
  executionId: string;
  state: ExecutionPositionState;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  exchangeOrderId?: string;
  clientOrderId?: string;
  transitions: ExecutionPositionTransition[];
}

export type ExecutionLifecycleIdFactory = () => string;

const ALLOWED: Readonly<Record<ExecutionPositionState, readonly ExecutionPositionState[]>> = Object.freeze({
  CREATED: ['RISK_AUTHORIZED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  RISK_AUTHORIZED: ['AWAITING_MANUAL_CONFIRMATION', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  AWAITING_MANUAL_CONFIRMATION: ['SUBMITTING', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  SUBMITTING: ['ACKNOWLEDGED', 'PARTIALLY_FILLED', 'FILLED', 'UNKNOWN', 'REJECTED', 'FAILED'],
  ACKNOWLEDGED: ['PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'UNKNOWN', 'FAILED'],
  PARTIALLY_FILLED: ['FILLED', 'CLOSING', 'UNKNOWN', 'FAILED'],
  FILLED: ['PROTECTING', 'CLOSING', 'UNKNOWN', 'FAILED'],
  PROTECTING: ['PROTECTED', 'CLOSING', 'UNKNOWN', 'FAILED'],
  PROTECTED: ['CLOSING', 'UNKNOWN', 'FAILED'],
  CLOSING: ['CLOSED', 'UNKNOWN', 'FAILED'],
  CLOSED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
  UNKNOWN: ['RECONCILING'],
  RECONCILING: ['ACKNOWLEDGED', 'PARTIALLY_FILLED', 'FILLED', 'PROTECTING', 'PROTECTED', 'CLOSING', 'CLOSED', 'CANCELLED', 'REJECTED', 'FAILED', 'UNKNOWN'],
  FAILED: ['RECONCILING'],
});

export class ExecutionPositionStateMachine {
  private readonly lifecycles = new Map<string, ExecutionPositionLifecycleSnapshot>();
  private readonly idFactory: ExecutionLifecycleIdFactory;

  constructor(idFactory: ExecutionLifecycleIdFactory = randomUUID) {
    this.idFactory = idFactory;
  }

  create(input: { executionId?: string; now?: number; expiresAt?: number | null; clientOrderId?: string }): ExecutionPositionLifecycleSnapshot {
    const now = input.now ?? Date.now();
    const executionId = input.executionId ?? this.idFactory();
    if (this.lifecycles.has(executionId)) throw new Error('execution_lifecycle_already_exists');
    if (input.expiresAt != null && (!Number.isFinite(input.expiresAt) || input.expiresAt <= now)) throw new Error('execution_lifecycle_invalid_expiry');
    const snapshot: ExecutionPositionLifecycleSnapshot = {
      executionId,
      state: 'CREATED',
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? null,
      clientOrderId: input.clientOrderId,
      transitions: [],
    };
    this.lifecycles.set(executionId, snapshot);
    return this.snapshot(executionId)!;
  }

  transition(input: {
    executionId: string;
    nextState: ExecutionPositionState;
    reason: string;
    now?: number;
    exchangeOrderId?: string;
    clientOrderId?: string;
  }): ExecutionPositionLifecycleSnapshot {
    const current = this.lifecycles.get(input.executionId);
    if (!current) throw new Error('execution_lifecycle_not_found');
    const now = input.now ?? Date.now();
    if (current.expiresAt != null && now >= current.expiresAt && ['CREATED', 'RISK_AUTHORIZED', 'AWAITING_MANUAL_CONFIRMATION'].includes(current.state)) {
      return this.applyTransition(current, 'EXPIRED', 'execution_lifecycle_expired', now);
    }
    const allowed = ALLOWED[current.state];
    if (!allowed.includes(input.nextState)) {
      throw new Error(`execution_transition_not_allowed:${current.state}:${input.nextState}`);
    }
    if (input.nextState === 'SUBMITTING' && current.state !== 'AWAITING_MANUAL_CONFIRMATION') {
      throw new Error('manual_confirmation_gate_required');
    }
    return this.applyTransition(current, input.nextState, input.reason, now, input.exchangeOrderId, input.clientOrderId);
  }

  expire(executionId: string, now = Date.now()): ExecutionPositionLifecycleSnapshot {
    const current = this.lifecycles.get(executionId);
    if (!current) throw new Error('execution_lifecycle_not_found');
    if (!['CREATED', 'RISK_AUTHORIZED', 'AWAITING_MANUAL_CONFIRMATION'].includes(current.state)) return this.snapshot(executionId)!;
    return this.applyTransition(current, 'EXPIRED', 'execution_lifecycle_expired', now);
  }

  snapshot(executionId: string): ExecutionPositionLifecycleSnapshot | null {
    const current = this.lifecycles.get(executionId);
    if (!current) return null;
    return {
      ...current,
      transitions: current.transitions.map((row) => ({ ...row })),
    };
  }

  private applyTransition(
    current: ExecutionPositionLifecycleSnapshot,
    nextState: ExecutionPositionState,
    reason: string,
    now: number,
    exchangeOrderId?: string,
    clientOrderId?: string,
  ): ExecutionPositionLifecycleSnapshot {
    const previousState = current.state;
    current.state = nextState;
    current.updatedAt = now;
    if (exchangeOrderId) current.exchangeOrderId = exchangeOrderId;
    if (clientOrderId) current.clientOrderId = clientOrderId;
    current.transitions.push({
      transitionId: this.idFactory(),
      executionId: current.executionId,
      previousState,
      nextState,
      occurredAt: now,
      reason: reason || 'unspecified',
      exchangeOrderId: current.exchangeOrderId,
      clientOrderId: current.clientOrderId,
    });
    if (current.transitions.length > 500) current.transitions.splice(0, current.transitions.length - 500);
    return this.snapshot(current.executionId)!;
  }
}
