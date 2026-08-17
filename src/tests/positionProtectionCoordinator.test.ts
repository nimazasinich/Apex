import { describe, expect, it } from 'vitest';
import { PositionProtectionCoordinator } from '../services/execution/positionProtectionCoordinator';

function createPlan() {
  const coordinator = new PositionProtectionCoordinator();
  const plan = coordinator.create({
    executionId: 'execution-1', symbol: 'XBTUSDTM', direction: 'LONG',
    filledQuantity: 2, averageFillPrice: 100, stopLoss: 98, targets: [102, 104, 106],
  });
  return { coordinator, plan };
}

describe('PositionProtectionCoordinator verification lifecycle', () => {
  it('starts requested and never treats intent as active protection', () => {
    const { plan } = createPlan();
    expect(plan.version).toBe('position_protection_v2');
    expect(plan.state).toBe('REQUESTED');
    expect(plan.protectedQuantity).toBe(0);
    expect(plan.executionAuthorized).toBe(false);
    expect(plan.legs.every((leg) => leg.status === 'REQUESTED' && leg.reduceOnly)).toBe(true);
  });

  it('keeps exchange acknowledgement explicitly unverified', () => {
    const { coordinator, plan } = createPlan();
    const stopId = plan.legs.find((leg) => leg.kind === 'STOP')!.id;
    coordinator.mark(plan.executionId, stopId, { status: 'SUBMITTED', exchangeOrderId: 'stop-1' });
    const acknowledged = coordinator.mark(plan.executionId, stopId, { status: 'ACKNOWLEDGED' });
    expect(acknowledged.state).toBe('ACKNOWLEDGED_UNVERIFIED');
    expect(acknowledged.protectedQuantity).toBe(0);
  });

  it('requires exchange identity before a leg can be ACTIVE_VERIFIED', () => {
    const { coordinator, plan } = createPlan();
    const stopId = plan.legs.find((leg) => leg.kind === 'STOP')!.id;
    coordinator.mark(plan.executionId, stopId, { status: 'SUBMITTED' });
    coordinator.mark(plan.executionId, stopId, { status: 'ACKNOWLEDGED' });
    expect(() => coordinator.mark(plan.executionId, stopId, { status: 'ACTIVE_VERIFIED' })).toThrow('active_protection_requires_exchange_order_id');
  });

  it('reports protected quantity only after the stop is independently verified active', () => {
    const { coordinator, plan } = createPlan();
    const stopId = plan.legs.find((leg) => leg.kind === 'STOP')!.id;
    coordinator.mark(plan.executionId, stopId, { status: 'SUBMITTED', exchangeOrderId: 'stop-1' });
    coordinator.mark(plan.executionId, stopId, { status: 'ACKNOWLEDGED' });
    const verified = coordinator.mark(plan.executionId, stopId, { status: 'ACTIVE_VERIFIED' });
    expect(verified.state).toBe('PARTIALLY_VERIFIED');
    expect(verified.protectedQuantity).toBe(2);
  });

  it('only reports fully ACTIVE_VERIFIED after every leg is verified', () => {
    const { coordinator, plan } = createPlan();
    let current = plan;
    for (const leg of plan.legs) {
      current = coordinator.mark(plan.executionId, leg.id, { status: 'SUBMITTED', exchangeOrderId: `ex-${leg.id}` });
      current = coordinator.mark(plan.executionId, leg.id, { status: 'ACKNOWLEDGED' });
      current = coordinator.mark(plan.executionId, leg.id, { status: 'ACTIVE_VERIFIED' });
    }
    expect(current.state).toBe('ACTIVE_VERIFIED');
    expect(current.protectedQuantity).toBe(2);
  });

  it('moves uncertain evidence into reconciliation instead of assuming protection', () => {
    const { coordinator, plan } = createPlan();
    const stopId = plan.legs.find((leg) => leg.kind === 'STOP')!.id;
    coordinator.mark(plan.executionId, stopId, { status: 'SUBMITTED', exchangeOrderId: 'stop-1' });
    coordinator.mark(plan.executionId, stopId, { status: 'ACKNOWLEDGED' });
    coordinator.mark(plan.executionId, stopId, { status: 'ACTIVE_VERIFIED' });
    const reconciling = coordinator.mark(plan.executionId, stopId, { status: 'RECONCILING' });
    expect(reconciling.state).toBe('RECONCILING');
    expect(reconciling.protectedQuantity).toBe(0);
  });
});
