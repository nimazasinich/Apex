/**
 * Smart Autopilot controller state machine tests.
 *
 * These lock the operator-visible contract: the phase the UI shows is the
 * phase the server is actually in, and arming the controller never becomes a
 * path to execution authority.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUTOPILOT_CONTROLLER_VERSION,
  autopilotControllerReducer,
  createAutopilotControllerState,
  describeAutopilotPhase,
  isCycleInFlight,
  publicAutopilotControllerState,
  type AutopilotControllerEvent,
  type AutopilotControllerState,
} from '../services/autopilotControllerState';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const apply = (
  state: AutopilotControllerState,
  ...events: AutopilotControllerEvent[]
): AutopilotControllerState => events.reduce(autopilotControllerReducer, state);

const off = () => createAutopilotControllerState(false, 1_000, 'NONE');
const armed = () => apply(off(), { type: 'START', at: 2_000, by: 'OPERATOR' });

describe('Autopilot controller — the five operator phases', () => {
  it('starts OFF, not merely idle', () => {
    const state = off();
    expect(state.phase).toBe('OFF');
    expect(state.phaseReason).toBe('NOT_ARMED');
    expect(state.enabled).toBe(false);
    expect(state.version).toBe(AUTOPILOT_CONTROLLER_VERSION);
  });

  it('moves OFF -> WAITING when armed, without inventing a cycle', () => {
    const state = armed();
    expect(state.phase).toBe('WAITING');
    expect(state.phaseReason).toBe('ARMED_IDLE');
    expect(state.armedBy).toBe('OPERATOR');
    expect(state.activeCycleIndex).toBeNull();
    expect(state.cyclesStarted).toBe(0);
  });

  it('walks the real cycle: WAITING -> RESEARCHING -> VALIDATING -> WAITING', () => {
    const phases: string[] = [];
    let state = armed();
    phases.push(state.phase);
    state = apply(state, { type: 'CYCLE_STARTED', at: 3_000, cycleIndex: 0 });
    phases.push(state.phase);
    state = apply(state, { type: 'CYCLE_VALIDATING', at: 4_000 });
    phases.push(state.phase);
    state = apply(state, { type: 'CYCLE_COMPLETED', at: 5_000 });
    phases.push(state.phase);
    expect(phases).toEqual(['WAITING', 'RESEARCHING', 'VALIDATING', 'WAITING']);
    expect(state.cyclesCompleted).toBe(1);
    expect(state.lastCompletedAt).toBe(5_000);
  });

  it('surfaces FAILED even while still armed, so a broken loop cannot look healthy', () => {
    const state = apply(
      armed(),
      { type: 'CYCLE_STARTED', at: 3_000, cycleIndex: 0 },
      { type: 'CYCLE_FAILED', at: 4_000, error: 'insufficient_requested_history:900/3000' },
    );
    expect(state.phase).toBe('FAILED');
    expect(state.enabled).toBe(true);
    expect(state.lastError).toContain('insufficient_requested_history');
    expect(state.cyclesFailed).toBe(1);
    expect(state.activeCycleIndex).toBeNull();
  });

  it('names the no-executable-context failure distinctly', () => {
    const state = apply(armed(), {
      type: 'CYCLE_FAILED', at: 4_000, error: 'smart_autopilot_no_executable_contexts',
    });
    expect(state.phaseReason).toBe('NO_EXECUTABLE_CONTEXTS');
    expect(describeAutopilotPhase(state)).toContain('no executable strategy context');
  });

  it('recovers from FAILED on the next successful cycle', () => {
    const state = apply(
      armed(),
      { type: 'CYCLE_FAILED', at: 4_000, error: 'boom' },
      { type: 'CYCLE_STARTED', at: 5_000, cycleIndex: 1 },
    );
    expect(state.phase).toBe('RESEARCHING');
    expect(state.lastError).toBeNull();
    expect(apply(state, { type: 'CYCLE_COMPLETED', at: 6_000 }).phase).toBe('WAITING');
  });

  it('returns to OFF on stop', () => {
    const state = apply(armed(), { type: 'STOP', at: 7_000 });
    expect(state.phase).toBe('OFF');
    expect(state.phaseReason).toBe('STOPPED_BY_OPERATOR');
    expect(state.enabled).toBe(false);
    expect(state.armedBy).toBe('NONE');
  });
});

describe('Autopilot controller — transition safety', () => {
  it('lets an in-flight cycle drain after STOP rather than lying about the phase', () => {
    const state = apply(
      armed(),
      { type: 'CYCLE_STARTED', at: 3_000, cycleIndex: 0 },
      { type: 'STOP', at: 3_500 },
    );
    expect(state.enabled).toBe(false);
    // Still genuinely working, so it must not claim OFF.
    expect(state.phase).toBe('RESEARCHING');
    // And when that cycle lands, it settles to OFF, not WAITING.
    expect(apply(state, { type: 'CYCLE_COMPLETED', at: 4_000 }).phase).toBe('OFF');
  });

  it('does not restart or double-count when START is repeated', () => {
    const once = armed();
    const twice = apply(once, { type: 'START', at: 9_000, by: 'OPERATOR' });
    expect(twice).toEqual(once);
  });

  it('ignores a stray VALIDATING event outside a cycle', () => {
    const state = apply(armed(), { type: 'CYCLE_VALIDATING', at: 3_000 });
    expect(state.phase).toBe('WAITING');
    expect(state.cyclesStarted).toBe(0);
  });

  it('counts a skipped tick without disturbing the running cycle', () => {
    const state = apply(
      armed(),
      { type: 'CYCLE_STARTED', at: 3_000, cycleIndex: 0 },
      { type: 'CYCLE_SKIPPED', at: 3_100 },
      { type: 'CYCLE_SKIPPED', at: 3_200 },
    );
    expect(state.cyclesSkipped).toBe(2);
    expect(state.phase).toBe('RESEARCHING');
    expect(state.activeCycleIndex).toBe(0);
  });

  it('reports in-flight only during RESEARCHING and VALIDATING', () => {
    expect(isCycleInFlight(off())).toBe(false);
    expect(isCycleInFlight(armed())).toBe(false);
    const researching = apply(armed(), { type: 'CYCLE_STARTED', at: 3_000, cycleIndex: 0 });
    expect(isCycleInFlight(researching)).toBe(true);
    expect(isCycleInFlight(apply(researching, { type: 'CYCLE_VALIDATING', at: 4_000 }))).toBe(true);
    expect(isCycleInFlight(apply(researching, { type: 'CYCLE_FAILED', at: 4_000, error: 'x' }))).toBe(false);
  });

  it('advances phaseSince on every real phase change', () => {
    const researching = apply(armed(), { type: 'CYCLE_STARTED', at: 3_000, cycleIndex: 0 });
    expect(researching.phaseSince).toBe(3_000);
    expect(apply(researching, { type: 'CYCLE_VALIDATING', at: 4_000 }).phaseSince).toBe(4_000);
  });
});

describe('Autopilot controller — execution safety', () => {
  it('exposes no execution-authorization surface in its public state', () => {
    const state = publicAutopilotControllerState(
      apply(armed(), { type: 'CYCLE_STARTED', at: 3_000, cycleIndex: 2 }),
    );
    expect(JSON.stringify(Object.keys(state))).not.toMatch(/execution|live|order|authoriz|governor|bypass/i);
  });

  it('is a pure state machine — no timers, network, or persistence', () => {
    // Strip comments first: the header prose legitimately discusses the
    // client-side setInterval this module replaced.
    const code = read('src/services/autopilotControllerState.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/setInterval|setTimeout|fetch\(|writeFileSync|readFileSync/);
    expect(code).not.toMatch(/Date\.now\(\)/);
  });

  it('is the only controller the routes consult', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    // One state variable, one dispatch helper — no parallel controller.
    expect(routes.match(/let autopilotController = /g)?.length).toBe(1);
    expect(routes).toContain('const dispatchAutopilotEvent = (event: AutopilotControllerEvent): void =>');
    // The scheduler no longer keeps its own duplicate running/counter state.
    expect(routes).not.toContain('schedulerState.running');
    expect(routes).not.toContain('schedulerState.cyclesCompleted');
  });

  it('drives the phase from the shared cycle runner, not from the route handlers', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain("dispatchAutopilotEvent({ type: 'CYCLE_STARTED', at: cycleStartedAt, cycleIndex });");
    expect(routes).toContain("dispatchAutopilotEvent({ type: 'CYCLE_VALIDATING', at: Date.now() });");
    expect(routes).toContain("dispatchAutopilotEvent({ type: 'CYCLE_COMPLETED', at: Date.now() });");
  });
});

describe('Autopilot controller — control endpoint', () => {
  it('exposes a real start/stop route that arms the one scheduler', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain("app.post('/api/strategies/autopilot/control'");
    expect(routes).toContain("armSmartAutopilotScheduler('OPERATOR')");
    expect(routes).toContain('stopSmartAutopilotScheduler();');
    expect(routes).toContain('autopilot_control_action_invalid');
  });

  it('reports the controller phase on the existing status endpoint', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain("app.get('/api/strategies/autopilot/status'");
    expect(routes).toContain('controller: publicAutopilotControllerState(autopilotController)');
  });

  it('keeps the control endpoint research-only', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    const control = routes.slice(routes.indexOf("app.post('/api/strategies/autopilot/control'"));
    const body = control.slice(0, control.indexOf('\n  });'));
    expect(body).toContain('researchOnly: true');
    expect(body).toContain('executionAuthorized: false');
    expect(body).toContain('riskGovernorBypassAllowed: false');
    expect(body).not.toMatch(/submitOrder|placeOrder|executeTrade/);
  });
});
