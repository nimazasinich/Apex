import { describe, expect, it } from 'vitest';

import {
  AllocatorConfigurationError,
  etaForRound,
  normalizeLoss,
  OnlineAllocator,
  theoreticalRegretBound,
  type AllocatorConfig,
} from '../../scripts/research/lib/onlineAllocator';

/**
 * These tests pin the properties the regret claim actually rests on. If any of them fails,
 * the study's "regret-bounded" language is no longer supported by the implementation, which
 * is the whole reason the algorithm lives in its own I/O-free module.
 */

const CAP = 5; // percentage points; a test-local cap, not the study's pre-registered R.

function config(overrides: Partial<AllocatorConfig> = {}): AllocatorConfig {
  return {
    expertCount: 4,
    returnCapPct: CAP,
    etaSchedule: 'fixed',
    horizon: 100,
    rule: 'hedge',
    ...overrides,
  };
}

describe('normalizeLoss', () => {
  it('maps a flat round to the neutral loss', () => {
    expect(normalizeLoss(0, CAP)).toEqual({ loss: 0.5, clipped: false });
  });

  it('maps +R to 0 and -R to 1, and reports both as clipped at the boundary', () => {
    expect(normalizeLoss(CAP, CAP)).toEqual({ loss: 0, clipped: true });
    expect(normalizeLoss(-CAP, CAP)).toEqual({ loss: 1, clipped: true });
  });

  it('is monotone decreasing in the return inside the cap', () => {
    const a = normalizeLoss(-2, CAP).loss;
    const b = normalizeLoss(0, CAP).loss;
    const c = normalizeLoss(2, CAP).loss;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('flags clipping rather than silently saturating', () => {
    expect(normalizeLoss(-40, CAP)).toEqual({ loss: 1, clipped: true });
    expect(normalizeLoss(40, CAP)).toEqual({ loss: 0, clipped: true });
    expect(normalizeLoss(-4.9, CAP).clipped).toBe(false);
  });

  it('refuses a non-finite return instead of producing a NaN loss', () => {
    expect(() => normalizeLoss(Number.NaN, CAP)).toThrow(AllocatorConfigurationError);
    expect(() => normalizeLoss(Number.POSITIVE_INFINITY, CAP)).toThrow(
      AllocatorConfigurationError,
    );
  });
});

describe('eta schedules and bounds', () => {
  it('uses the horizon-tuned learning rate for the fixed schedule', () => {
    const eta = etaForRound(40, 14, 'fixed', 1);
    expect(eta).toBeCloseTo(Math.sqrt((2 * Math.log(40)) / 14), 12);
    // Fixed means fixed: the round index must not move it.
    expect(etaForRound(40, 14, 'fixed', 9)).toBeCloseTo(eta, 12);
  });

  it('decays the anytime learning rate as 1/sqrt(t)', () => {
    const first = etaForRound(40, 14, 'anytime', 1);
    const ninth = etaForRound(40, 14, 'anytime', 9);
    expect(ninth).toBeCloseTo(first / 3, 12);
  });

  it('reports sqrt(2 T ln N) as the conservative bound and the sharper constant alongside', () => {
    const { conservative, tight } = theoreticalRegretBound(40, 14, 'fixed');
    expect(conservative).toBeCloseTo(Math.sqrt(2 * 14 * Math.log(40)), 12);
    expect(tight).toBeCloseTo(Math.sqrt((14 / 2) * Math.log(40)), 12);
    expect(tight).toBeLessThan(conservative);
  });

  it('collapses to zero for a single expert, where there is nothing to learn', () => {
    expect(theoreticalRegretBound(1, 100, 'fixed')).toEqual({ conservative: 0, tight: 0 });
    expect(etaForRound(1, 100, 'fixed', 1)).toBe(0);
  });
});

describe('configuration validation', () => {
  it('rejects a non-positive return cap, so the cap can never be silently defaulted', () => {
    expect(() => new OnlineAllocator(config({ returnCapPct: 0 }))).toThrow(
      AllocatorConfigurationError,
    );
    expect(() => new OnlineAllocator(config({ returnCapPct: -1 }))).toThrow(
      AllocatorConfigurationError,
    );
  });

  it('rejects a degenerate expert count or horizon', () => {
    expect(() => new OnlineAllocator(config({ expertCount: 0 }))).toThrow(
      AllocatorConfigurationError,
    );
    expect(() => new OnlineAllocator(config({ horizon: 0 }))).toThrow(
      AllocatorConfigurationError,
    );
  });

  it('rejects a return vector of the wrong length rather than padding it', () => {
    const allocator = new OnlineAllocator(config());
    expect(() => allocator.observe([1, 2, 3])).toThrow(AllocatorConfigurationError);
  });
});

describe('weights on the simplex', () => {
  it('starts uniform and sums to one', () => {
    const allocator = new OnlineAllocator(config());
    const weights = allocator.weightsFor([true, true, true, true]);
    expect(weights).toHaveLength(4);
    for (const weight of weights) {
      expect(weight).toBeCloseTo(0.25, 12);
    }
    expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it('renormalises over the awake set and gives an asleep expert exactly zero', () => {
    const allocator = new OnlineAllocator(config());
    const weights = allocator.weightsFor([true, false, true, false]);
    expect(weights[1]).toBe(0);
    expect(weights[3]).toBe(0);
    expect(weights[0]).toBeCloseTo(0.5, 12);
    expect(weights[2]).toBeCloseTo(0.5, 12);
    expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it('returns an all-zero allocation when every expert is asleep', () => {
    const allocator = new OnlineAllocator(config());
    expect(allocator.weightsFor([false, false, false, false])).toEqual([0, 0, 0, 0]);
  });

  it('keeps the simplex intact for every rule across a long mixed-availability run', () => {
    for (const rule of ['hedge', 'equalWeight', 'followTheLeader'] as const) {
      const allocator = new OnlineAllocator(config({ rule, horizon: 60 }));
      for (let round = 0; round < 60; round += 1) {
        const returns = [0, 1, 2, 3].map((index) =>
          (round + index) % 5 === 0 ? undefined : Math.sin(round + index) * 3,
        );
        const outcome = allocator.observe(returns);
        const total = outcome.weights.reduce((sum, value) => sum + value, 0);
        expect(total).toBeCloseTo(1, 12);
        for (let index = 0; index < 4; index += 1) {
          if (returns[index] === undefined) {
            expect(outcome.weights[index]).toBe(0);
          }
        }
      }
    }
  });
});

describe('sleeping experts are not zero-filled', () => {
  it('accrues no loss and no awake round for an expert that was asleep', () => {
    const allocator = new OnlineAllocator(config({ expertCount: 3 }));
    allocator.observe([2, undefined, -2]);
    allocator.observe([2, undefined, -2]);

    expect(allocator.expertAwakeRounds()).toEqual([2, 0, 2]);
    const losses = allocator.expertCumulativeLosses();
    // Exactly zero, and in particular NOT the 1.0 that two rounds of a neutral 0.5 fill
    // would have produced. That distinction is the whole point of the sleeping construction.
    expect(losses[1]).toBe(0);
    // +2 at a cap of 5 maps to 0.3 per round, -2 maps to 0.7, so the awake pair straddles
    // the neutral fill instead of sitting on it.
    expect(losses[0]).toBeCloseTo(0.6, 12);
    expect(losses[2]).toBeCloseTo(1.4, 12);
    expect(losses[0]).toBeLessThan(1);
    expect(losses[2]).toBeGreaterThan(1);
  });

  it('excludes a never-awake expert from the best-expert comparison', () => {
    const allocator = new OnlineAllocator(config({ expertCount: 3, horizon: 3 }));
    allocator.observe([1, undefined, -1]);
    allocator.observe([1, undefined, -1]);
    allocator.observe([1, undefined, -1]);
    const report = allocator.regretReport();
    // Expert 1 has cumulative loss 0, which would win on a naive minimum; it must not,
    // because it never actually played.
    expect(report.bestExpertIndex).toBe(0);
    expect(report.rounds).toBe(3);
  });

  it('books a flat, neutral round when nothing is awake', () => {
    const allocator = new OnlineAllocator(config({ expertCount: 2 }));
    const outcome = allocator.observe([undefined, undefined]);
    expect(outcome.awakeCount).toBe(0);
    expect(outcome.portfolioReturnPct).toBe(0);
    expect(outcome.portfolioLoss).toBe(0.5);
    expect(allocator.expertAwakeRounds()).toEqual([0, 0]);
  });
});

describe('multiplicative update behaviour', () => {
  it('decays a persistently losing expert monotonically', () => {
    const allocator = new OnlineAllocator(config({ expertCount: 4, horizon: 30 }));
    let previous = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 30; round += 1) {
      const outcome = allocator.observe([-CAP, CAP, CAP, CAP]);
      expect(outcome.weights[0]).toBeLessThan(previous);
      previous = outcome.weights[0];
    }
    expect(previous).toBeLessThan(0.01);
  });

  it('does not move weights at all under equal weighting, whatever the losses', () => {
    const allocator = new OnlineAllocator(config({ rule: 'equalWeight', horizon: 20 }));
    for (let round = 0; round < 20; round += 1) {
      const outcome = allocator.observe([-CAP, CAP, CAP, CAP]);
      for (const weight of outcome.weights) {
        expect(weight).toBeCloseTo(0.25, 12);
      }
    }
  });

  it('puts the whole book on the lowest cumulative loss under follow-the-leader', () => {
    const allocator = new OnlineAllocator(config({ rule: 'followTheLeader', horizon: 20 }));
    allocator.observe([-1, 1, 0, 0]); // round 1 is a tie: all cumulative losses are still 0
    const second = allocator.observe([-1, 1, 0, 0]);
    expect(second.weights[1]).toBeCloseTo(1, 12);
    expect(second.weights[0]).toBe(0);
  });
});

describe('realised regret against the theoretical guarantee', () => {
  /**
   * A deterministic adversary: each round it reads the weights Hedge is about to apply and
   * hands the heaviest expert the worst possible return. This is the sequence Hedge is meant
   * to survive, so it is the sequence worth checking the bound against.
   */
  it('stays inside sqrt(2 T ln N) against a weight-targeting adversary', () => {
    const expertCount = 6;
    const horizon = 400;
    const allocator = new OnlineAllocator(
      config({ expertCount, horizon, rule: 'hedge', etaSchedule: 'fixed' }),
    );
    const awake = new Array<boolean>(expertCount).fill(true);

    for (let round = 0; round < horizon; round += 1) {
      const weights = allocator.weightsFor(awake);
      let heaviest = 0;
      for (let index = 1; index < expertCount; index += 1) {
        if (weights[index] > weights[heaviest]) {
          heaviest = index;
        }
      }
      const returns = new Array<number>(expertCount).fill(CAP);
      returns[heaviest] = -CAP;
      allocator.observe(returns);
    }

    const report = allocator.regretReport();
    expect(report.rounds).toBe(horizon);
    expect(report.realizedRegret).not.toBeNull();
    expect(report.realizedRegret as number).toBeLessThanOrEqual(report.conservativeBound);
    expect(report.boundHolds).toBe(true);
    expect(report.boundApplies).toBe(true);
  });

  it('holds under the anytime schedule and with experts falling asleep', () => {
    const expertCount = 5;
    const horizon = 300;
    const allocator = new OnlineAllocator(
      config({ expertCount, horizon, rule: 'hedge', etaSchedule: 'anytime' }),
    );
    for (let round = 0; round < horizon; round += 1) {
      const returns = Array.from({ length: expertCount }, (_unused, index) =>
        (round + index) % 7 === 0 ? undefined : Math.cos(round * 0.7 + index) * CAP * 0.9,
      );
      allocator.observe(returns);
    }
    const report = allocator.regretReport();
    expect(report.realizedRegret as number).toBeLessThanOrEqual(report.conservativeBound);
    expect(report.boundHolds).toBe(true);
    expect(report.clippedShare).toBeLessThan(1);
  });

  it('reports the T=14 bound as covering most of the achievable loss range', () => {
    const allocator = new OnlineAllocator(config({ expertCount: 86, horizon: 14 }));
    for (let round = 0; round < 14; round += 1) {
      allocator.observe(new Array<number>(86).fill(0.1));
    }
    const report = allocator.regretReport();
    // sqrt(2 * 14 * ln 86) / 14 -- the guarantee gives away most of the range at this T,
    // which is exactly why the study also runs a per-bar arm.
    expect(report.boundShareOfLossRange).toBeCloseTo(
      Math.sqrt(2 * 14 * Math.log(86)) / 14,
      12,
    );
    expect(report.boundShareOfLossRange).toBeGreaterThan(0.7);
    expect(report.interpretation).toContain('vacuous');
  });

  it('marks the controls as carrying no guarantee', () => {
    for (const rule of ['equalWeight', 'followTheLeader'] as const) {
      const allocator = new OnlineAllocator(config({ rule, horizon: 10 }));
      for (let round = 0; round < 10; round += 1) {
        allocator.observe([1, -1, 0.5, -0.5]);
      }
      const report = allocator.regretReport();
      expect(report.boundApplies).toBe(false);
      expect(report.boundHolds).toBeNull();
      expect(report.interpretation).toContain('no regret guarantee');
    }
  });

  it('counts clipped observations so a binding cap cannot be buried', () => {
    const allocator = new OnlineAllocator(config({ expertCount: 2, horizon: 10 }));
    for (let round = 0; round < 10; round += 1) {
      allocator.observe([CAP * 4, -CAP * 4]);
    }
    const report = allocator.regretReport();
    expect(report.lossObservations).toBe(20);
    expect(report.clippedObservations).toBe(20);
    expect(report.clippedShare).toBe(1);
  });
});
