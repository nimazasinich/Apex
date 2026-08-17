import { describe, it, expect } from 'vitest';
import {
  advanceLifecycle,
  advanceStaleLifecycle,
  isTerminalState,
  CONFIRM_TICKS_REQUIRED,
  MAX_FAIL_TICKS,
  MAX_STALE_CONTEXT_TICKS,
  REVERSAL_TICKS_REQUIRED,
} from '../services/lifecycleCore';
import type { LiveLifecycleInput } from '../services/lifecycleCore';

// A SHORT candidate with healthy, confirming live data and no exit hit.
const baseShort = (over: Partial<LiveLifecycleInput> = {}): LiveLifecycleInput => ({
  current: 'CANDIDATE',
  direction: 'SHORT',
  smoothedObi: -0.5,          // strongly negative → confirms SHORT
  confluence1M: -0.5,         // strongly bearish → confirms SHORT
  confluenceAvailable: true,
  ageMs: 1000,
  maxLifetimeMs: 20 * 60 * 1000,
  price: 100,
  stopLoss: 110,              // SHORT SL above entry
  takeProfit: 90,             // SHORT TP below entry
  confidence: 0.8,
  confirmTicks: 0,
  failTicks: 0,
  reversalTicks: 0,
  ...over,
});

describe('candidate grace period (issues 18-21)', () => {
  it('does NOT confirm a candidate on a single passing tick', () => {
    const r = advanceLifecycle(baseShort());
    expect(r.next).toBe('CANDIDATE');
    expect(r.confirmTicks).toBe(1);
  });

  it('confirms only after CONFIRM_TICKS_REQUIRED consecutive passing ticks', () => {
    let inp = baseShort();
    let last = advanceLifecycle(inp);
    for (let i = 1; i < CONFIRM_TICKS_REQUIRED; i++) {
      last = advanceLifecycle({ ...inp, confirmTicks: last.confirmTicks });
    }
    expect(last.next).toBe('CONFIRMED');
  });

  it('does NOT invalidate a candidate on a single failing OBI tick', () => {
    const r = advanceLifecycle(baseShort({ smoothedObi: 0.5 })); // OBI against thesis
    expect(r.next).toBe('CANDIDATE');
    expect(r.failTicks).toBe(1);
  });

  it('invalidates only after MAX_FAIL_TICKS consecutive failing ticks', () => {
    let failTicks = 0;
    let next = 'CANDIDATE';
    for (let i = 0; i < MAX_FAIL_TICKS; i++) {
      const r = advanceLifecycle(baseShort({ smoothedObi: 0.5, failTicks }));
      failTicks = r.failTicks;
      next = r.next;
    }
    expect(next).toBe('INVALIDATED');
  });
});

describe('missing confluence is not a real neutral (issues 10-12, 20)', () => {
  it('does not invalidate when confluence is unavailable but OBI confirms', () => {
    const r = advanceLifecycle(baseShort({ confluence1M: 0, confluenceAvailable: false }));
    // OBI confirms, confluence indeterminate → HOLD, no fail accrued.
    expect(r.next).toBe('CANDIDATE');
    expect(r.failTicks).toBe(0);
  });

  it('cannot confirm on OBI alone while confluence is unavailable', () => {
    let confirmTicks = 0;
    let next = 'CANDIDATE';
    for (let i = 0; i < CONFIRM_TICKS_REQUIRED + 2; i++) {
      const r = advanceLifecycle(baseShort({ confluence1M: 0, confluenceAvailable: false, confirmTicks }));
      confirmTicks = r.confirmTicks;
      next = r.next;
    }
    expect(next).toBe('CANDIDATE'); // never promoted without confluence
  });
});

describe('expiry by max lifetime (issues 22-23)', () => {
  it('expires an over-age signal even on the live path', () => {
    const r = advanceLifecycle(baseShort({ current: 'ACTIVE', ageMs: 999_999_999, maxLifetimeMs: 1000 }));
    expect(r.next).toBe('EXPIRED');
  });
});

describe('stale lifecycle bounds (issues 22-25)', () => {
  it('keeps a fresh-enough stale signal alive but counts the tick', () => {
    const r = advanceStaleLifecycle({ current: 'ACTIVE', ageMs: 1000, maxLifetimeMs: 1_000_000, staleTicks: 0 });
    expect(r.next).toBe('ACTIVE');
    expect(r.staleTicks).toBe(1);
  });

  it('expires after MAX_STALE_CONTEXT_TICKS consecutive stale ticks', () => {
    const r = advanceStaleLifecycle({
      current: 'ACTIVE', ageMs: 1000, maxLifetimeMs: 1_000_000,
      staleTicks: MAX_STALE_CONTEXT_TICKS - 1,
    });
    expect(r.next).toBe('EXPIRED');
  });

  it('still enforces max lifetime while stale', () => {
    const r = advanceStaleLifecycle({ current: 'ACTIVE', ageMs: 5000, maxLifetimeMs: 1000, staleTicks: 0 });
    expect(r.next).toBe('EXPIRED');
  });
});

describe('active OBI reversal needs multi-tick confirmation (issue 26)', () => {
  it('does not invalidate an ACTIVE signal on a single reversed tick', () => {
    const r = advanceLifecycle(baseShort({ current: 'ACTIVE', smoothedObi: 0.5, confluenceAvailable: false }));
    expect(r.next).toBe('ACTIVE');
    expect(r.reversalTicks).toBe(1);
  });

  it('invalidates after REVERSAL_TICKS_REQUIRED consecutive reversed ticks', () => {
    let reversalTicks = REVERSAL_TICKS_REQUIRED - 1;
    const r = advanceLifecycle(baseShort({
      current: 'ACTIVE', smoothedObi: 0.5, confluenceAvailable: false, reversalTicks,
    }));
    expect(r.next).toBe('INVALIDATED');
  });
});

describe('TP/SL finite guard (issues 28-31)', () => {
  it('marks exit levels invalid and skips exits when SL is undefined', () => {
    const r = advanceLifecycle(baseShort({ current: 'ACTIVE', stopLoss: undefined }));
    expect(r.exitLevelsValid).toBe(false);
    // No false exit; signal remains active (governed by lifetime backstop).
    expect(r.next).toBe('ACTIVE');
    expect(r.outcome).toBeNull();
  });

  it('does not treat an undefined TP as a hit', () => {
    const r = advanceLifecycle(baseShort({ current: 'ACTIVE', takeProfit: undefined, price: 1 }));
    expect(r.outcome).toBeNull();
    expect(r.next).toBe('ACTIVE');
  });

  it('resolves WIN when SHORT take-profit is hit', () => {
    const r = advanceLifecycle(baseShort({ current: 'ACTIVE', price: 89 })); // <= TP 90
    expect(r.next).toBe('EXPIRED');
    expect(r.outcome).toBe('WIN');
  });

  it('resolves LOSS when SHORT stop-loss is hit', () => {
    const r = advanceLifecycle(baseShort({ current: 'ACTIVE', price: 111 })); // >= SL 110
    expect(r.next).toBe('INVALIDATED');
    expect(r.outcome).toBe('LOSS');
  });

  it('resolves BREAKEVEN on confidence decay', () => {
    const r = advanceLifecycle(baseShort({ current: 'ACTIVE', confidence: 0.1 }));
    expect(r.next).toBe('EXPIRED');
    expect(r.outcome).toBe('BREAKEVEN');
  });
});

describe('terminal-state helper', () => {
  it('identifies terminal states', () => {
    expect(isTerminalState('EXPIRED')).toBe(true);
    expect(isTerminalState('INVALIDATED')).toBe(true);
    expect(isTerminalState('ACTIVE')).toBe(false);
    expect(isTerminalState('CANDIDATE')).toBe(false);
  });
});
