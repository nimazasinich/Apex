// src/services/lifecycleCore.ts
// Pure (no I/O, no React, no timers) signal-lifecycle state machine so the
// transition rules can be unit-tested in isolation — same inputs → same output.
//
// This module is the single source of truth for HOW a tracked signal advances
// between CANDIDATE → CONFIRMED → ACTIVE → (INVALIDATED | EXPIRED). It exists to
// fix the over-aggressive, single-tick invalidation and the unbounded-stale
// behaviour that lived inline in useWatchlistTracking:
//
//   • A candidate now needs CONFIRM_TICKS_REQUIRED consecutive passing ticks to
//     be confirmed, and MAX_FAIL_TICKS consecutive failing ticks to be killed —
//     so one noisy OBI/confluence reading can neither promote nor remove it.
//   • Missing/unavailable confluence is treated as INDETERMINATE (a hold), never
//     as a real neutral reading that fails the gate.
//   • An ACTIVE signal's OBI reversal must hold for REVERSAL_TICKS_REQUIRED
//     consecutive ticks before it invalidates.
//   • Stale (no-data) signals are bounded by both maxLifetime and
//     MAX_STALE_CONTEXT_TICKS, so they can never live forever.
//   • TP/SL are only compared when both levels are finite; otherwise exits are
//     skipped (never compared against undefined) and the maxLifetime backstop
//     resolves the signal.

import type { SignalLifecycleState } from '../types';

// ── Tunable lifecycle constants ──────────────────────────────────────────────
/** Consecutive passing ticks required to promote CANDIDATE → CONFIRMED. */
export const CONFIRM_TICKS_REQUIRED = 2;
/** Consecutive failing ticks required to INVALIDATE a CANDIDATE (grace window). */
export const MAX_FAIL_TICKS = 3;
/** Consecutive stale (no live data) ticks after which a signal EXPIRES. */
export const MAX_STALE_CONTEXT_TICKS = 5;
/** Consecutive OBI-reversed ticks required to INVALIDATE an ACTIVE signal. */
export const REVERSAL_TICKS_REQUIRED = 2;
/** Confidence floor below which an ACTIVE signal decays to BREAKEVEN. */
export const CONFIDENCE_DECAY_THRESHOLD = 0.35;

const OBI_CONFIRM_MAG = 0.10;      // |OBI| needed to count as confirming the thesis
const CONFLUENCE_CONFIRM_MAG = 0.15; // |confluence| needed to count as confirming

export type LifecycleOutcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

export interface LiveLifecycleInput {
  current: SignalLifecycleState;
  direction: 'SHORT' | 'LONG';
  smoothedObi: number;
  confluence1M: number;
  /** false → confluence value is a placeholder; gate is treated as indeterminate. */
  confluenceAvailable: boolean;
  ageMs: number;
  maxLifetimeMs: number;
  price: number;
  /** Stop-loss level — may be undefined/NaN at runtime. */
  stopLoss: number | undefined;
  /** Take-profit level — may be undefined/NaN at runtime. */
  takeProfit: number | undefined;
  confidence: number;
  /** Optional scanner guard/readiness gate. Defaults to true for compatibility. */
  qualificationPass?: boolean;
  // Prior-tick counters (default 0 when absent).
  confirmTicks: number;
  failTicks: number;
  reversalTicks: number;
}

export interface LifecycleResult {
  next: SignalLifecycleState;
  confirmTicks: number;
  failTicks: number;
  reversalTicks: number;
  exitLevelsValid: boolean;
  outcome: LifecycleOutcome | null;
}

/**
 * Advance a signal one tick using a LIVE (non-stale) market context.
 * Pure and deterministic.
 */
export function advanceLifecycle(inp: LiveLifecycleInput): LifecycleResult {
  const dir = inp.direction;
  const obi = inp.smoothedObi;

  let next: SignalLifecycleState = inp.current;
  let confirmTicks = inp.confirmTicks;
  let failTicks = inp.failTicks;
  let reversalTicks = inp.reversalTicks;
  let outcome: LifecycleOutcome | null = null;

  // Direction-aware gate readings.
  const obiConfirm = dir === 'SHORT' ? obi < -OBI_CONFIRM_MAG : obi > OBI_CONFIRM_MAG;
  // null = indeterminate (confluence data unavailable this tick).
  const confluenceConfirm: boolean | null = inp.confluenceAvailable
    ? (dir === 'SHORT' ? inp.confluence1M < -CONFLUENCE_CONFIRM_MAG : inp.confluence1M > CONFLUENCE_CONFIRM_MAG)
    : null;

  const qualificationPass = inp.qualificationPass !== false;
  const gatesPass = qualificationPass && obiConfirm && confluenceConfirm === true;
  // A definite negative on either AVAILABLE gate. If confluence is unavailable,
  // only an OBI-against-thesis reading counts as a fail (never the missing data).
  const gatesFail = !qualificationPass || !obiConfirm || confluenceConfirm === false;

  if (inp.current === 'CANDIDATE') {
    if (gatesPass) {
      confirmTicks += 1;
      failTicks = 0;
      if (confirmTicks >= CONFIRM_TICKS_REQUIRED) {
        next = 'CONFIRMED';
        confirmTicks = 0;
      }
    } else if (gatesFail) {
      failTicks += 1;
      confirmTicks = 0;
      if (failTicks >= MAX_FAIL_TICKS) {
        next = 'INVALIDATED';
      }
    } else {
      // Indeterminate (e.g. OBI confirms but confluence unavailable): HOLD.
      // No invalidation penalty for missing data; just break the confirm streak.
      confirmTicks = 0;
    }
  } else if (inp.current === 'CONFIRMED') {
    next = 'ACTIVE';
  }

  // Hard lifetime expiry always wins over confirmation, but not over an
  // already-decided INVALIDATED this tick.
  if (next !== 'INVALIDATED' && inp.ageMs > inp.maxLifetimeMs) {
    next = 'EXPIRED';
  }

  // ACTIVE: OBI reversal needs multi-tick confirmation before invalidating.
  if (next === 'ACTIVE') {
    const obiReversed = dir === 'SHORT' ? obi > OBI_CONFIRM_MAG : obi < -OBI_CONFIRM_MAG;
    if (obiReversed) {
      reversalTicks += 1;
      if (reversalTicks >= REVERSAL_TICKS_REQUIRED) {
        next = 'INVALIDATED';
      }
    } else {
      reversalTicks = 0;
    }
  }

  // Exit-level resolution — only when BOTH levels are finite. Comparing a price
  // against undefined/NaN silently evaluates false, which would leave a signal
  // active forever; instead we mark exit levels invalid and lean on maxLifetime.
  const exitLevelsValid =
    Number.isFinite(inp.stopLoss as number) && Number.isFinite(inp.takeProfit as number);

  if (next === 'ACTIVE' && exitLevelsValid) {
    const sl = inp.stopLoss as number;
    const tp = inp.takeProfit as number;
    const slHit = dir === 'SHORT' ? inp.price >= sl : inp.price <= sl;
    const tpHit = dir === 'SHORT' ? inp.price <= tp : inp.price >= tp;

    if (slHit) {
      next = 'INVALIDATED';
      outcome = 'LOSS';
    } else if (tpHit) {
      next = 'EXPIRED';
      outcome = 'WIN';
    } else if (inp.confidence < CONFIDENCE_DECAY_THRESHOLD) {
      next = 'EXPIRED';
      outcome = 'BREAKEVEN';
    }
  }

  return { next, confirmTicks, failTicks, reversalTicks, exitLevelsValid, outcome };
}

export interface StaleLifecycleInput {
  current: SignalLifecycleState;
  ageMs: number;
  maxLifetimeMs: number;
  staleTicks: number;
}

export interface StaleLifecycleResult {
  next: SignalLifecycleState;
  staleTicks: number;
}

/**
 * Advance a signal one tick when the live context is UNAVAILABLE/stale.
 * Enforces both the hard lifetime bound and a bounded number of stale ticks so
 * no-data signals can neither be invalidated by noise nor survive indefinitely.
 */
export function advanceStaleLifecycle(inp: StaleLifecycleInput): StaleLifecycleResult {
  const staleTicks = inp.staleTicks + 1;
  let next: SignalLifecycleState = inp.current;

  if (inp.ageMs > inp.maxLifetimeMs) {
    next = 'EXPIRED';                       // hard lifetime still enforced while stale
  } else if (staleTicks >= MAX_STALE_CONTEXT_TICKS) {
    next = 'EXPIRED';                       // bounded stale lifecycle
  }

  return { next, staleTicks };
}

/** A lifecycle state from which a tracked entry should be pruned. */
export function isTerminalState(state: SignalLifecycleState): boolean {
  return state === 'EXPIRED' || state === 'INVALIDATED';
}
