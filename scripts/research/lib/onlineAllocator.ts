/**
 * Hedge -- the exponentially weighted average forecaster, also called multiplicative
 * weights -- used here as a *selection layer* over an existing pool of strategy
 * configurations, replacing per-split argmax.
 *
 * WHY THIS ALGORITHM, AND WHAT IS ACTUALLY GUARANTEED
 * --------------------------------------------------
 * The feedback available in this harness is FULL INFORMATION, not bandit: the walk-forward
 * runners already evaluate every grid cell on every out-of-sample window, so after each
 * round the realised return of every expert is observable, not just the one that was held.
 * That rules out EXP3 (Auer, Cesa-Bianchi, Freund & Schapire, "The Nonstochastic Multiarmed
 * Bandit Problem", SIAM J. Comput. 32(1):48-77, 2002), whose O(sqrt(T N log N)) bound pays
 * for information this harness does not have to buy.
 *
 * With N experts, losses l_t(i) in [0,1], and weights w_t(i) proportional to
 * exp(-eta * sum_{s<t} l_s(i)):
 *
 *     sum_t <w_t, l_t>  -  min_i sum_t l_t(i)   <=   ln(N)/eta  +  eta*T/2
 *
 * and at the horizon-tuned eta = sqrt(2 ln N / T) this gives
 *
 *     Regret  <=  sqrt(2 * T * ln N).
 *
 * Citations for that statement, in the form relied on here:
 *   - Freund & Schapire, "A Decision-Theoretic Generalization of On-Line Learning and an
 *     Application to Boosting", J. Comput. Syst. Sci. 55(1):119-139, 1997.
 *   - Arora, Hazan & Kale, "The Multiplicative Weights Update Method: a Meta-Algorithm and
 *     Applications", Theory of Computing 8:121-164, 2012 -- Theorem 2.3.
 *   - Cesa-Bianchi & Lugosi, *Prediction, Learning, and Games*, CUP 2006, Theorem 2.2,
 *     which sharpens the constant to sqrt((T/2) ln N) via Hoeffding's lemma.
 * This module reports the conservative sqrt(2 T ln N) form as the headline bound and the
 * sharper form alongside it, so a reader can see which constant is being claimed.
 *
 * The bound is a guarantee against the best FIXED expert in hindsight, not against an
 * absolute return target, and it is only as useful as T makes it. At T = 14 (one round per
 * walk-forward split) the allowance covers most of the entire achievable loss range and the
 * guarantee is close to vacuous; `regretReport()` therefore returns
 * `boundShareOfLossRange` so that vacuity is a reported number rather than a footnote.
 *
 * BOUNDED LOSSES AND THE PRE-REGISTERED CAP
 * -----------------------------------------
 * The bound requires l_t(i) in [0,1]. Returns are unbounded, so they are mapped by
 *
 *     l = clip( 0.5 - r / (2R), 0, 1 )
 *
 * where R is a return cap in percentage points that MUST be pre-registered before any
 * result is inspected. Choosing R after seeing outcomes converts the guarantee into a
 * fitted parameter and voids both the bound and the honesty of the study, so the cap is
 * passed in explicitly and the share of rounds where clipping actually bound is reported.
 * r = 0 maps to l = 0.5, so "flat" is the neutral loss and a cash expert is exactly neutral.
 *
 * SLEEPING (SPECIALIST) EXPERTS
 * ----------------------------
 * An expert with no usable data on a round -- a family whose required series is
 * `unavailable` on that split, or one that has not yet accumulated the minimum trade
 * history -- is ASLEEP. Feeding it a substitute loss of 0, 0.5 or the pool average is the
 * zero-fill this research program forbids, and it silently breaks the bound. Instead the
 * simplex is renormalised over the awake set each round and only awake experts are updated.
 * The guarantee then holds against the best expert *on the rounds where that expert was
 * awake*, which is what `realizedRegret` measures.
 *   - Freund, Schapire, Singer & Warmuth, "Using and combining predictors that specialize",
 *     STOC '97, pp. 334-343.
 *   - Blum & Mansour, "From External to Internal Regret", JMLR 8:1307-1324, 2007.
 *
 * SCOPE
 * -----
 * Pure algorithm: no I/O, no dataset access, no cost model. Everything here is a function
 * of the per-round return vectors handed in by the runner, which is what makes the
 * bound-versus-realised-regret check in the unit tests meaningful.
 */

export type EtaSchedule = 'fixed' | 'anytime';

/**
 * `hedge` is the algorithm under test. The other two are controls that share this module's
 * bookkeeping exactly -- same loss normalisation, same awake handling, same accounting --
 * so that any difference in the reported numbers comes from the weighting rule alone.
 */
export type AllocatorRule = 'hedge' | 'equalWeight' | 'followTheLeader';

export interface AllocatorConfig {
  expertCount: number;
  /** Pre-registered per-round return cap R, in percentage points. Must be > 0. */
  returnCapPct: number;
  etaSchedule: EtaSchedule;
  /** Horizon T, known in advance from the split plan. Must be >= 1. */
  horizon: number;
  rule: AllocatorRule;
}

export interface RoundOutcome {
  /** 1-based round index. */
  round: number;
  /** Learning rate actually used to form this round's weights. 0 for the controls. */
  eta: number;
  awakeCount: number;
  /** Length `expertCount`; exactly 0 for every asleep expert; sums to 1 when any are awake. */
  weights: number[];
  portfolioReturnPct: number;
  /** The portfolio's loss for the round, in [0,1]. */
  portfolioLoss: number;
  /** How many awake experts had their loss clipped at 0 or 1 this round. */
  clippedCount: number;
}

export interface RegretReport {
  rule: AllocatorRule;
  etaSchedule: EtaSchedule;
  expertCount: number;
  returnCapPct: number;
  rounds: number;
  /** Awake-expert loss observations, and how many of them the cap bound. */
  lossObservations: number;
  clippedObservations: number;
  clippedShare: number;
  portfolioCumulativeLoss: number;
  bestExpertIndex: number | null;
  /** Cumulative loss of the best specialist over the rounds where it was awake. */
  bestExpertCumulativeLoss: number | null;
  /**
   * max_i [ portfolio loss over i's awake rounds  -  i's cumulative loss ].
   * This is the specialist form of regret, which is the form the sleeping-experts
   * construction actually guarantees.
   */
  realizedRegret: number | null;
  realizedRegretPerRound: number | null;
  /** sqrt(2 T ln N), or 2 sqrt(T ln N) for the anytime schedule. */
  conservativeBound: number;
  /** The Hoeffding-sharpened constant, reported for contrast, not claimed as the headline. */
  tightBound: number;
  /** False for the controls: equal-weight and follow-the-leader carry no such guarantee. */
  boundApplies: boolean;
  /** Null when no expert was ever awake. Only meaningful where `boundApplies`. */
  boundHolds: boolean | null;
  /**
   * conservativeBound / T. The maximum loss achievable in T rounds is T, so this is the
   * fraction of the entire loss range the guarantee gives away. Close to 1 means vacuous.
   */
  boundShareOfLossRange: number;
  interpretation: string;
}

export class AllocatorConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllocatorConfigurationError';
  }
}

/**
 * Map a return in percentage points onto the unit interval the bound requires.
 * Returns the loss and whether the cap bound, so clipping frequency can be reported
 * instead of hidden.
 */
export function normalizeLoss(
  returnPct: number,
  returnCapPct: number,
): { loss: number; clipped: boolean } {
  if (!Number.isFinite(returnPct)) {
    throw new AllocatorConfigurationError(`return ${returnPct} is not finite`);
  }
  const raw = 0.5 - returnPct / (2 * returnCapPct);
  if (raw <= 0) {
    return { loss: 0, clipped: true };
  }
  if (raw >= 1) {
    return { loss: 1, clipped: true };
  }
  return { loss: raw, clipped: false };
}

/**
 * The theoretical regret bounds for N experts over T rounds.
 *
 * `fixed`   -- eta = sqrt(2 ln N / T): conservative sqrt(2 T ln N), tight sqrt((T/2) ln N).
 * `anytime` -- eta_t = sqrt(ln N / t): the horizon is not used to tune eta, and the standard
 *              constant is 2 sqrt(T ln N); sqrt(2 T ln N) is reported as the tight form.
 */
export function theoreticalRegretBound(
  expertCount: number,
  horizon: number,
  etaSchedule: EtaSchedule,
): { conservative: number; tight: number } {
  const lnN = Math.log(Math.max(1, expertCount));
  if (lnN === 0 || horizon <= 0) {
    return { conservative: 0, tight: 0 };
  }
  if (etaSchedule === 'anytime') {
    return {
      conservative: 2 * Math.sqrt(horizon * lnN),
      tight: Math.sqrt(2 * horizon * lnN),
    };
  }
  return {
    conservative: Math.sqrt(2 * horizon * lnN),
    tight: Math.sqrt((horizon / 2) * lnN),
  };
}

/** eta for a given 1-based round. `fixed` ignores the round; `anytime` decays as 1/sqrt(t). */
export function etaForRound(
  expertCount: number,
  horizon: number,
  etaSchedule: EtaSchedule,
  round: number,
): number {
  const lnN = Math.log(Math.max(1, expertCount));
  if (lnN === 0) {
    // A single expert: every rule collapses to holding it, and eta is irrelevant.
    return 0;
  }
  if (etaSchedule === 'anytime') {
    return Math.sqrt(lnN / Math.max(1, round));
  }
  return Math.sqrt((2 * lnN) / Math.max(1, horizon));
}

export class OnlineAllocator {
  readonly config: AllocatorConfig;

  /** Cumulative loss per expert, accumulated only over the rounds it was awake. */
  private readonly cumulativeLoss: number[];
  private readonly awakeRounds: number[];
  /** Portfolio loss accumulated over each expert's awake rounds, for specialist regret. */
  private readonly portfolioLossOnAwakeRounds: number[];

  private roundIndex = 0;
  private cumulativePortfolioLoss = 0;
  private lossObservations = 0;
  private clippedObservations = 0;

  constructor(config: AllocatorConfig) {
    if (!Number.isInteger(config.expertCount) || config.expertCount < 1) {
      throw new AllocatorConfigurationError(
        `expertCount must be a positive integer, received ${config.expertCount}`,
      );
    }
    if (!Number.isFinite(config.returnCapPct) || config.returnCapPct <= 0) {
      throw new AllocatorConfigurationError(
        `returnCapPct must be a positive, finite pre-registered cap, received ${config.returnCapPct}`,
      );
    }
    if (!Number.isInteger(config.horizon) || config.horizon < 1) {
      throw new AllocatorConfigurationError(
        `horizon must be a positive integer, received ${config.horizon}`,
      );
    }
    this.config = config;
    this.cumulativeLoss = new Array<number>(config.expertCount).fill(0);
    this.awakeRounds = new Array<number>(config.expertCount).fill(0);
    this.portfolioLossOnAwakeRounds = new Array<number>(config.expertCount).fill(0);
  }

  get rounds(): number {
    return this.roundIndex;
  }

  /**
   * Weights for the next round given which experts are awake. Exposed separately from
   * `observe` so a caller can inspect the weights that will be applied before the round's
   * returns are known -- which is also the property that makes the procedure causal.
   */
  weightsFor(awake: readonly boolean[]): number[] {
    const n = this.config.expertCount;
    if (awake.length !== n) {
      throw new AllocatorConfigurationError(`awake mask has length ${awake.length}, expected ${n}`);
    }
    const weights = new Array<number>(n).fill(0);
    const awakeIndices: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (awake[i]) {
        awakeIndices.push(i);
      }
    }
    if (awakeIndices.length === 0) {
      // Nothing to hold. The runner books a flat round rather than inventing an allocation.
      return weights;
    }

    if (this.config.rule === 'equalWeight') {
      const share = 1 / awakeIndices.length;
      for (const i of awakeIndices) {
        weights[i] = share;
      }
      return weights;
    }

    if (this.config.rule === 'followTheLeader') {
      let best = Number.POSITIVE_INFINITY;
      for (const i of awakeIndices) {
        if (this.cumulativeLoss[i] < best) {
          best = this.cumulativeLoss[i];
        }
      }
      const leaders = awakeIndices.filter((i) => this.cumulativeLoss[i] === best);
      const share = 1 / leaders.length;
      for (const i of leaders) {
        weights[i] = share;
      }
      return weights;
    }

    const eta = etaForRound(n, this.config.horizon, this.config.etaSchedule, this.roundIndex + 1);
    if (eta === 0) {
      const share = 1 / awakeIndices.length;
      for (const i of awakeIndices) {
        weights[i] = share;
      }
      return weights;
    }

    // Weights are recomputed from cumulative losses rather than updated in place: that is
    // required for the anytime schedule, where eta changes every round, and it keeps the
    // fixed schedule numerically identical to the in-place product form.
    let minLoss = Number.POSITIVE_INFINITY;
    for (const i of awakeIndices) {
      if (this.cumulativeLoss[i] < minLoss) {
        minLoss = this.cumulativeLoss[i];
      }
    }
    let total = 0;
    for (const i of awakeIndices) {
      // Shift by the minimum before exponentiating: mathematically a no-op after
      // normalisation, but it keeps exp() away from underflow at large eta*T.
      const value = Math.exp(-eta * (this.cumulativeLoss[i] - minLoss));
      weights[i] = value;
      total += value;
    }
    if (!(total > 0) || !Number.isFinite(total)) {
      const share = 1 / awakeIndices.length;
      for (const i of awakeIndices) {
        weights[i] = share;
      }
      return weights;
    }
    for (const i of awakeIndices) {
      weights[i] /= total;
    }
    return weights;
  }

  /**
   * Play one round. `returns[i]` is expert i's realised return for the round in percentage
   * points, or `undefined` if that expert is asleep. Asleep experts receive no substitute
   * loss and no weight update.
   */
  observe(returns: readonly (number | undefined)[]): RoundOutcome {
    const n = this.config.expertCount;
    if (returns.length !== n) {
      throw new AllocatorConfigurationError(
        `return vector has length ${returns.length}, expected ${n}`,
      );
    }
    const awake = returns.map((value) => value !== undefined && Number.isFinite(value));
    const weights = this.weightsFor(awake);
    this.roundIndex += 1;

    let portfolioReturnPct = 0;
    let portfolioLoss = 0;
    let clippedCount = 0;
    let anyAwake = false;

    const losses = new Array<number>(n).fill(Number.NaN);
    for (let i = 0; i < n; i += 1) {
      if (!awake[i]) {
        continue;
      }
      anyAwake = true;
      const value = returns[i] as number;
      const { loss, clipped } = normalizeLoss(value, this.config.returnCapPct);
      losses[i] = loss;
      this.lossObservations += 1;
      if (clipped) {
        this.clippedObservations += 1;
        clippedCount += 1;
      }
      portfolioReturnPct += weights[i] * value;
      portfolioLoss += weights[i] * loss;
    }

    if (!anyAwake) {
      // A flat round: no expert could be held, so nothing is learned and nothing is booked.
      return {
        round: this.roundIndex,
        eta: 0,
        awakeCount: 0,
        weights,
        portfolioReturnPct: 0,
        portfolioLoss: 0.5,
        clippedCount: 0,
      };
    }

    this.cumulativePortfolioLoss += portfolioLoss;
    for (let i = 0; i < n; i += 1) {
      if (!awake[i]) {
        continue;
      }
      this.cumulativeLoss[i] += losses[i];
      this.awakeRounds[i] += 1;
      this.portfolioLossOnAwakeRounds[i] += portfolioLoss;
    }

    return {
      round: this.roundIndex,
      eta:
        this.config.rule === 'hedge'
          ? etaForRound(n, this.config.horizon, this.config.etaSchedule, this.roundIndex)
          : 0,
      awakeCount: awake.filter(Boolean).length,
      weights,
      portfolioReturnPct,
      portfolioLoss,
      clippedCount,
    };
  }

  /** Cumulative loss per expert over its own awake rounds. Copy, not the live array. */
  expertCumulativeLosses(): number[] {
    return [...this.cumulativeLoss];
  }

  expertAwakeRounds(): number[] {
    return [...this.awakeRounds];
  }

  regretReport(): RegretReport {
    const n = this.config.expertCount;
    const bound = theoreticalRegretBound(n, this.config.horizon, this.config.etaSchedule);
    const boundApplies = this.config.rule === 'hedge';

    let bestExpertIndex: number | null = null;
    let bestExpertLoss: number | null = null;
    let realizedRegret: number | null = null;
    for (let i = 0; i < n; i += 1) {
      if (this.awakeRounds[i] === 0) {
        continue;
      }
      if (bestExpertLoss === null || this.cumulativeLoss[i] < bestExpertLoss) {
        bestExpertLoss = this.cumulativeLoss[i];
        bestExpertIndex = i;
      }
      const regret = this.portfolioLossOnAwakeRounds[i] - this.cumulativeLoss[i];
      if (realizedRegret === null || regret > realizedRegret) {
        realizedRegret = regret;
      }
    }

    const clippedShare =
      this.lossObservations === 0 ? 0 : this.clippedObservations / this.lossObservations;
    const boundShareOfLossRange =
      this.config.horizon === 0 ? 0 : bound.conservative / this.config.horizon;

    const interpretation = !boundApplies
      ? `${this.config.rule} is a control with no regret guarantee; the bound column is the ` +
        'Hedge bound for the same N and T, shown only for scale.'
      : realizedRegret === null
        ? 'No expert was ever awake, so realised regret is undefined.'
        : `Realised specialist regret ${realizedRegret.toFixed(3)} against a guarantee of ` +
          `${bound.conservative.toFixed(3)} over ${this.config.horizon} rounds, i.e. the ` +
          `guarantee gives away ${(boundShareOfLossRange * 100).toFixed(1)}% of the total ` +
          `achievable loss range` +
          (boundShareOfLossRange >= 0.25
            ? ' -- at that ratio the bound is close to vacuous and the realised number is the only informative one.'
            : '.');

    return {
      rule: this.config.rule,
      etaSchedule: this.config.etaSchedule,
      expertCount: n,
      returnCapPct: this.config.returnCapPct,
      rounds: this.roundIndex,
      lossObservations: this.lossObservations,
      clippedObservations: this.clippedObservations,
      clippedShare,
      portfolioCumulativeLoss: this.cumulativePortfolioLoss,
      bestExpertIndex,
      bestExpertCumulativeLoss: bestExpertLoss,
      realizedRegret,
      realizedRegretPerRound:
        realizedRegret === null || this.roundIndex === 0 ? null : realizedRegret / this.roundIndex,
      conservativeBound: bound.conservative,
      tightBound: bound.tight,
      boundApplies,
      boundHolds:
        !boundApplies || realizedRegret === null ? null : realizedRegret <= bound.conservative,
      boundShareOfLossRange,
      interpretation,
    };
  }
}
