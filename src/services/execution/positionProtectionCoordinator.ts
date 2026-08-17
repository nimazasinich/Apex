import { createHash } from 'node:crypto';

export type ProtectionSide = 'BUY' | 'SELL';
export type ProtectionLegKind = 'STOP' | 'TARGET_1' | 'TARGET_2' | 'TARGET_3';
export type ProtectionLegStatus =
  | 'REQUESTED'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'ACTIVE_VERIFIED'
  | 'REJECTED'
  | 'UNKNOWN'
  | 'RECONCILING'
  | 'CANCELLED';

export type PositionProtectionState =
  | 'REQUESTED'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED_UNVERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'ACTIVE_VERIFIED'
  | 'RECONCILING'
  | 'UNKNOWN'
  | 'FAILED';

export interface ProtectionLeg {
  id: string;
  kind: ProtectionLegKind;
  side: ProtectionSide;
  quantity: number;
  triggerPrice: number;
  reduceOnly: true;
  status: ProtectionLegStatus;
  exchangeOrderId: string | null;
  error: string | null;
}

export interface PositionProtectionPlan {
  version: 'position_protection_v2';
  executionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  filledQuantity: number;
  averageFillPrice: number;
  stopLoss: number;
  targets: [number, number, number];
  legs: ProtectionLeg[];
  /** Quantity proven protected by an exchange-verified STOP leg. */
  protectedQuantity: number;
  state: PositionProtectionState;
  fingerprintSha256: string;
  executionAuthorized: false;
}

function finitePositive(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`invalid_${name}`);
  return parsed;
}

function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

const LEG_TRANSITIONS: Record<ProtectionLegStatus, ReadonlySet<ProtectionLegStatus>> = {
  REQUESTED: new Set(['REQUESTED', 'SUBMITTED', 'REJECTED', 'UNKNOWN', 'CANCELLED']),
  SUBMITTED: new Set(['SUBMITTED', 'ACKNOWLEDGED', 'REJECTED', 'UNKNOWN', 'RECONCILING', 'CANCELLED']),
  ACKNOWLEDGED: new Set(['ACKNOWLEDGED', 'ACTIVE_VERIFIED', 'REJECTED', 'UNKNOWN', 'RECONCILING', 'CANCELLED']),
  ACTIVE_VERIFIED: new Set(['ACTIVE_VERIFIED', 'RECONCILING', 'UNKNOWN', 'CANCELLED']),
  REJECTED: new Set(['REJECTED']),
  UNKNOWN: new Set(['UNKNOWN', 'RECONCILING', 'ACTIVE_VERIFIED', 'REJECTED', 'CANCELLED']),
  RECONCILING: new Set(['RECONCILING', 'ACKNOWLEDGED', 'ACTIVE_VERIFIED', 'REJECTED', 'UNKNOWN', 'CANCELLED']),
  CANCELLED: new Set(['CANCELLED']),
};

/**
 * Builds and tracks reduce-only protection intent. It deliberately does not own
 * an exchange client and cannot submit/cancel an order by itself. Exchange
 * acknowledgement is never treated as proof that protection is active.
 */
export class PositionProtectionCoordinator {
  private readonly plans = new Map<string, PositionProtectionPlan>();

  create(input: { executionId: string; symbol: string; direction: 'LONG' | 'SHORT'; filledQuantity: number; averageFillPrice: number; stopLoss: number; targets: [number, number, number] }): PositionProtectionPlan {
    if (this.plans.has(input.executionId)) throw new Error('protection_plan_already_exists');
    const quantity = finitePositive(input.filledQuantity, 'filled_quantity');
    const averageFillPrice = finitePositive(input.averageFillPrice, 'average_fill_price');
    const stopLoss = finitePositive(input.stopLoss, 'stop_loss');
    const targets = input.targets.map((value) => finitePositive(value, 'target')) as [number, number, number];
    if (input.direction === 'LONG' && (stopLoss >= averageFillPrice || targets.some((value) => value <= averageFillPrice))) throw new Error('invalid_long_protection_geometry');
    if (input.direction === 'SHORT' && (stopLoss <= averageFillPrice || targets.some((value) => value >= averageFillPrice))) throw new Error('invalid_short_protection_geometry');
    const side: ProtectionSide = input.direction === 'LONG' ? 'SELL' : 'BUY';
    const targetQuantities = [quantity * 0.34, quantity * 0.33, quantity * 0.33];
    targetQuantities[2] = quantity - targetQuantities[0] - targetQuantities[1];
    const legs: ProtectionLeg[] = [
      { id: `${input.executionId}:stop`, kind: 'STOP', side, quantity, triggerPrice: stopLoss, reduceOnly: true, status: 'REQUESTED', exchangeOrderId: null, error: null },
      ...targets.map((triggerPrice, index) => ({ id: `${input.executionId}:tp${index + 1}`, kind: `TARGET_${index + 1}` as ProtectionLegKind, side, quantity: targetQuantities[index], triggerPrice, reduceOnly: true as const, status: 'REQUESTED' as const, exchangeOrderId: null, error: null })),
    ];
    const base = { version: 'position_protection_v2' as const, executionId: input.executionId, symbol: input.symbol, direction: input.direction, filledQuantity: quantity, averageFillPrice, stopLoss, targets, legs, protectedQuantity: 0, state: 'REQUESTED' as const, executionAuthorized: false as const };
    const plan: PositionProtectionPlan = { ...base, fingerprintSha256: fingerprint(base) };
    this.plans.set(input.executionId, plan);
    return this.snapshot(input.executionId)!;
  }

  mark(executionId: string, legId: string, update: { status: ProtectionLegStatus; exchangeOrderId?: string | null; error?: string | null }): PositionProtectionPlan {
    const plan = this.plans.get(executionId);
    if (!plan) throw new Error('protection_plan_not_found');
    const leg = plan.legs.find((row) => row.id === legId);
    if (!leg) throw new Error('protection_leg_not_found');
    if (!LEG_TRANSITIONS[leg.status].has(update.status)) throw new Error('protection_leg_transition_not_allowed');
    if (update.status === 'ACTIVE_VERIFIED' && !String(update.exchangeOrderId ?? leg.exchangeOrderId ?? '').trim()) {
      throw new Error('active_protection_requires_exchange_order_id');
    }
    leg.status = update.status;
    if (update.exchangeOrderId !== undefined) leg.exchangeOrderId = update.exchangeOrderId ? String(update.exchangeOrderId) : null;
    leg.error = update.error === undefined ? leg.error : update.error;
    if (update.status === 'REJECTED' && !leg.error) leg.error = 'exchange_rejected_protection';
    this.recompute(plan);
    return this.snapshot(executionId)!;
  }

  snapshot(executionId: string): PositionProtectionPlan | null {
    const plan = this.plans.get(executionId);
    return plan ? structuredClone(plan) : null;
  }

  private recompute(plan: PositionProtectionPlan): void {
    const stop = plan.legs.find((row) => row.kind === 'STOP')!;
    const targets = plan.legs.filter((row) => row.kind.startsWith('TARGET_'));
    plan.protectedQuantity = stop.status === 'ACTIVE_VERIFIED' ? plan.filledQuantity : 0;

    if (stop.status === 'REJECTED' || stop.status === 'CANCELLED') plan.state = 'FAILED';
    else if (plan.legs.some((row) => row.status === 'UNKNOWN')) plan.state = 'UNKNOWN';
    else if (plan.legs.some((row) => row.status === 'RECONCILING')) plan.state = 'RECONCILING';
    else if (stop.status === 'ACTIVE_VERIFIED' && targets.every((row) => row.status === 'ACTIVE_VERIFIED')) plan.state = 'ACTIVE_VERIFIED';
    else if (plan.legs.some((row) => row.status === 'ACTIVE_VERIFIED')) plan.state = 'PARTIALLY_VERIFIED';
    else if (plan.legs.some((row) => row.status === 'ACKNOWLEDGED')) plan.state = 'ACKNOWLEDGED_UNVERIFIED';
    else if (plan.legs.some((row) => row.status === 'SUBMITTED')) plan.state = 'SUBMITTED';
    else if (targets.some((row) => row.status === 'REJECTED' || row.status === 'CANCELLED')) plan.state = 'FAILED';
    else plan.state = 'REQUESTED';

    plan.fingerprintSha256 = fingerprint({ ...plan, fingerprintSha256: undefined });
  }
}
