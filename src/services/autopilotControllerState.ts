/**
 * Smart Autopilot controller state machine.
 *
 * The lifecycle audit found that the Autopilot UI toggle drove a *client-side*
 * `window.setInterval` and never learned anything about the server. The server,
 * meanwhile, had a scheduler with counters but no notion of what phase a cycle
 * was in. So the button was cosmetic with respect to the real controller.
 *
 * This module owns the phase machine only. It is pure — no timers, no I/O, no
 * network — so the transitions can be tested exhaustively. The route layer
 * feeds it events; it never runs a cycle itself and therefore cannot become a
 * second controller.
 *
 * ---------------------------------------------------------------------------
 * SAFETY BOUNDARY — read before changing this file.
 *
 * "Enabled" here means only that a RESEARCH cycle may be triggered. It confers
 * no execution authority: no field in this state carries an order, an
 * authorization, or a Risk Governor decision, and `assertNoExecutionSurface`
 * is asserted by tests. Turning the controller on must never be a path to a
 * live order.
 * ---------------------------------------------------------------------------
 */

export const AUTOPILOT_CONTROLLER_VERSION = 'autopilot_controller_v1';

/**
 * Phases the operator sees. `RESEARCHING` and `VALIDATING` are the two halves
 * of an in-flight cycle; `WAITING` is armed-but-idle between cycles.
 */
export type AutopilotPhase = 'OFF' | 'RESEARCHING' | 'VALIDATING' | 'WAITING' | 'FAILED';

/** Why the controller is in its current phase, in operator language. */
export type AutopilotPhaseReason =
  | 'NOT_ARMED'
  | 'STOPPED_BY_OPERATOR'
  | 'ARMED_IDLE'
  | 'OPTIMIZING_AND_REPLAYING'
  | 'VALIDATING_AND_RANKING'
  | 'CYCLE_FAILED'
  | 'NO_EXECUTABLE_CONTEXTS';

export type AutopilotTrigger = 'ENV' | 'OPERATOR' | 'NONE';

export interface AutopilotControllerState {
  version: typeof AUTOPILOT_CONTROLLER_VERSION;
  enabled: boolean;
  phase: AutopilotPhase;
  phaseReason: AutopilotPhaseReason;
  /** When the current phase was entered (ms epoch). */
  phaseSince: number;
  /** What armed the controller most recently. */
  armedBy: AutopilotTrigger;
  /** Cycle index currently in flight, or null when idle. */
  activeCycleIndex: number | null;
  cyclesStarted: number;
  cyclesCompleted: number;
  cyclesSkipped: number;
  cyclesFailed: number;
  lastStartedAt: number | null;
  lastCompletedAt: number | null;
  lastError: string | null;
}

export type AutopilotControllerEvent =
  | { type: 'START'; at: number; by: AutopilotTrigger }
  | { type: 'STOP'; at: number }
  | { type: 'CYCLE_STARTED'; at: number; cycleIndex: number }
  | { type: 'CYCLE_VALIDATING'; at: number }
  | { type: 'CYCLE_COMPLETED'; at: number }
  | { type: 'CYCLE_FAILED'; at: number; error: string }
  | { type: 'CYCLE_SKIPPED'; at: number };

export function createAutopilotControllerState(
  enabled: boolean,
  at = 0,
  armedBy: AutopilotTrigger = enabled ? 'ENV' : 'NONE',
): AutopilotControllerState {
  return {
    version: AUTOPILOT_CONTROLLER_VERSION,
    enabled,
    phase: enabled ? 'WAITING' : 'OFF',
    phaseReason: enabled ? 'ARMED_IDLE' : 'NOT_ARMED',
    phaseSince: at,
    armedBy: enabled ? armedBy : 'NONE',
    activeCycleIndex: null,
    cyclesStarted: 0,
    cyclesCompleted: 0,
    cyclesSkipped: 0,
    cyclesFailed: 0,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastError: null,
  };
}

/** True while a cycle is actually executing. */
export function isCycleInFlight(state: AutopilotControllerState): boolean {
  return state.phase === 'RESEARCHING' || state.phase === 'VALIDATING';
}

/**
 * Apply one event. Total and deterministic: every event is valid in every
 * phase, because the route layer must never be able to wedge the machine.
 */
export function autopilotControllerReducer(
  state: AutopilotControllerState,
  event: AutopilotControllerEvent,
): AutopilotControllerState {
  switch (event.type) {
    case 'START': {
      // Arming an already-running controller must not restart a live cycle.
      if (state.enabled) return state;
      return {
        ...state,
        enabled: true,
        armedBy: event.by,
        // A cycle can still be draining after a STOP; don't lie about the phase.
        phase: isCycleInFlight(state) ? state.phase : 'WAITING',
        phaseReason: isCycleInFlight(state) ? state.phaseReason : 'ARMED_IDLE',
        phaseSince: isCycleInFlight(state) ? state.phaseSince : event.at,
      };
    }

    case 'STOP': {
      // A cycle already in flight is allowed to finish; it holds no execution
      // authority, and killing it mid-way would lose its outcome evidence.
      if (isCycleInFlight(state)) {
        return { ...state, enabled: false, armedBy: 'NONE' };
      }
      return {
        ...state,
        enabled: false,
        armedBy: 'NONE',
        phase: 'OFF',
        phaseReason: 'STOPPED_BY_OPERATOR',
        phaseSince: event.at,
        activeCycleIndex: null,
      };
    }

    case 'CYCLE_STARTED':
      return {
        ...state,
        phase: 'RESEARCHING',
        phaseReason: 'OPTIMIZING_AND_REPLAYING',
        phaseSince: event.at,
        activeCycleIndex: event.cycleIndex,
        cyclesStarted: state.cyclesStarted + 1,
        lastStartedAt: event.at,
        // A new cycle clears the previous failure; FAILED is not permanent.
        lastError: null,
      };

    case 'CYCLE_VALIDATING':
      // Only meaningful inside a cycle — ignore a stray event rather than
      // inventing an in-flight cycle that is not running.
      if (!isCycleInFlight(state)) return state;
      return {
        ...state,
        phase: 'VALIDATING',
        phaseReason: 'VALIDATING_AND_RANKING',
        phaseSince: event.at,
      };

    case 'CYCLE_COMPLETED':
      return {
        ...state,
        phase: state.enabled ? 'WAITING' : 'OFF',
        phaseReason: state.enabled ? 'ARMED_IDLE' : 'STOPPED_BY_OPERATOR',
        phaseSince: event.at,
        activeCycleIndex: null,
        cyclesCompleted: state.cyclesCompleted + 1,
        lastCompletedAt: event.at,
        lastError: null,
      };

    case 'CYCLE_FAILED':
      return {
        ...state,
        // FAILED is surfaced even when still armed, so a repeatedly failing
        // loop cannot masquerade as a healthy WAITING controller.
        phase: 'FAILED',
        phaseReason: event.error === 'smart_autopilot_no_executable_contexts'
          ? 'NO_EXECUTABLE_CONTEXTS'
          : 'CYCLE_FAILED',
        phaseSince: event.at,
        activeCycleIndex: null,
        cyclesFailed: state.cyclesFailed + 1,
        lastError: event.error,
      };

    case 'CYCLE_SKIPPED':
      // The timer fired while the previous cycle was still running.
      return { ...state, cyclesSkipped: state.cyclesSkipped + 1 };

    default:
      return state;
  }
}

/** One-line operator-facing description of the current phase. */
export function describeAutopilotPhase(state: AutopilotControllerState): string {
  switch (state.phase) {
    case 'OFF':
      return state.phaseReason === 'STOPPED_BY_OPERATOR'
        ? 'Stopped. No research cycle is scheduled.'
        : 'Off. Start the controller to run research cycles.';
    case 'WAITING':
      return 'Armed and idle, waiting for the next research cycle.';
    case 'RESEARCHING':
      return `Cycle ${(state.activeCycleIndex ?? 0) + 1}: optimizing and replaying strategy contexts.`;
    case 'VALIDATING':
      return `Cycle ${(state.activeCycleIndex ?? 0) + 1}: validating, ranking and reviewing promotion candidates.`;
    case 'FAILED':
      return state.phaseReason === 'NO_EXECUTABLE_CONTEXTS'
        ? 'Last cycle found no executable strategy context.'
        : `Last cycle failed: ${state.lastError || 'unknown error'}.`;
    default:
      return 'Unknown controller phase.';
  }
}

/**
 * Public projection for the status endpoint. Deliberately excludes anything
 * resembling execution state — see the safety boundary above.
 */
export function publicAutopilotControllerState(state: AutopilotControllerState) {
  return {
    version: state.version,
    enabled: state.enabled,
    phase: state.phase,
    phaseReason: state.phaseReason,
    phaseSince: state.phaseSince,
    phaseText: describeAutopilotPhase(state),
    armedBy: state.armedBy,
    activeCycleIndex: state.activeCycleIndex,
    cyclesStarted: state.cyclesStarted,
    cyclesCompleted: state.cyclesCompleted,
    cyclesSkipped: state.cyclesSkipped,
    cyclesFailed: state.cyclesFailed,
    lastStartedAt: state.lastStartedAt,
    lastCompletedAt: state.lastCompletedAt,
    lastError: state.lastError,
  };
}
