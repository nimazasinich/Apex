/**
 * Autopilot UI <-> controller wiring.
 *
 * The point of these tests is to stop the switch from regressing back into a
 * cosmetic toggle: the badge must render the phase the server reports, the
 * switch must POST to the one control route, and no page may drive a second
 * cycle loop behind the server scheduler's back.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const HOOK = 'src/lib/useAutopilotController.ts';
const TOGGLE = 'src/components/SmartAutopilotMiniToggle.tsx';
const APP = 'src/App.tsx';
const RUN_BUILDER = 'src/pages/backtesting/BacktestRunBuilder.tsx';
const BACKTESTING_PAGE = 'src/pages/backtesting/BacktestingPage.tsx';
const BACKTESTING_HOOK = 'src/pages/backtesting/useBacktestingOptimization.ts';
const STRATEGY_PAGE = 'src/pages/strategies/StrategyPage.tsx';
const EVIDENCE_RAIL = 'src/pages/strategies/StrategyEvidenceRail.tsx';

describe('Autopilot control surface — real server binding', () => {
  it('polls the existing status endpoint rather than inventing a new one', () => {
    const hook = read(HOOK);
    expect(hook).toContain("fetch('/api/strategies/autopilot/status'");
    expect(hook).toContain('AUTOPILOT_STATUS_POLL_MS');
  });

  it('sends START/STOP to the one control route through the shared mutate helper', () => {
    const hook = read(HOOK);
    expect(hook).toContain("apiMutate('/api/strategies/autopilot/control'");
    expect(hook).toContain("send('START')");
    expect(hook).toContain("send('STOP')");
    // Boot reconciliation is intentionally one-way: a persisted opt-in may start an OFF controller,
    // but a browser must never auto-stop a controller armed by ENV or another operator.
    expect(hook).toContain('if (initialPreferenceHandledRef.current || snapshot.phase === null) return;');
    expect(hook).toContain("if (desiredEnabled && !snapshot.enabled) void send('START');");
    expect(hook).not.toContain("if (!desiredEnabled && snapshot.enabled) void send('STOP')");
  });

  it('models exactly the five operator phases the server reports', () => {
    const hook = read(HOOK);
    expect(hook).toContain("export type AutopilotPhase = 'OFF' | 'RESEARCHING' | 'VALIDATING' | 'WAITING' | 'FAILED'");
    // Unknown/garbage phase strings degrade to null, never to a fake healthy state.
    expect(hook).toContain('VALID_PHASES.has(raw as AutopilotPhase) ? (raw as AutopilotPhase) : null');
  });

  it('never renders an unreachable server as a healthy OFF', () => {
    const hook = read(HOOK);
    // A failed poll keeps the last known phase and raises transportError instead.
    expect(hook).toContain('setTransportError(error instanceof Error ? error.message : String(error));');
    expect(hook).not.toMatch(/catch[\s\S]{0,200}setSnapshot\(EMPTY\)/);

    const toggle = read(TOGGLE);
    expect(toggle).toContain("const state = disconnected");
    expect(toggle).toContain("'UNREACHABLE'");
    expect(toggle).toContain("const isFailed = phase === 'FAILED' || disconnected;");
  });

  it('grants no execution authority from the control surface', () => {
    const hook = read(HOOK);
    expect(hook).not.toMatch(/submitOrder|placeOrder|executeTrade|executionAuthorized:\s*true/);
    expect(hook).not.toMatch(/\/api\/(orders|execution|trade)/);
  });
});

describe('Autopilot badge — server phase is authoritative', () => {
  it('prefers the server phase over the local enabled/running props', () => {
    const toggle = read(TOGGLE);
    expect(toggle).toContain('const PHASE_LABEL: Record<AutopilotPhase, string>');
    for (const phase of ['OFF', 'WAITING', 'RESEARCHING', 'VALIDATING', 'FAILED']) {
      expect(toggle).toContain(`${phase}: '${phase}'`);
    }
    expect(toggle).toContain('const isRunning = phase ? serverBusy : running;');
    expect(toggle).toContain("const isOn = phase ? phase !== 'OFF' : enabled;");
  });

  it('stops the Backtesting header from claiming a phase of its own', () => {
    const builder = read(RUN_BUILDER);
    // The old header hardcoded TUNING/ARMED/OFF from local state alone.
    expect(builder).toContain('{autopilotPhaseText ?? (autopilotEnabled ? (autopilotRunning ? \'TUNING\' : \'ARMED\') : \'OFF\')}');
    expect(builder).toContain('phase={autopilotPhase}');
    expect(builder).toContain('disconnected={autopilotDisconnected}');
  });

  it('has a distinct failed style so a broken loop cannot look idle', () => {
    const css = read('src/components/SmartAutopilotMiniToggle.css');
    expect(css).toContain('.apex-smart-auto-mini.is-failed');
  });
});

describe('Autopilot wiring — one controller, one driver', () => {
  it('binds the controller once at the level that owns the preference', () => {
    const app = read(APP);
    expect(app).toContain("import { useAutopilotController } from './lib/useAutopilotController';");
    expect(app.match(/useAutopilotController\(settings\.autopilotEnabled\)/g)?.length).toBe(1);
    // The global shell plus all three page consumers (Overview, Backtesting, Strategies) receive the same controller binding.
    expect(app.match(/autopilotController=\{autopilotController\}/g)?.length).toBe(4);
    // The existing persisted-preference path is untouched.
    expect(app.match(/onAutopilotEnabledChange=\{setAutopilotEnabled\}/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('threads the real phase down to both toggles', () => {
    for (const path of [BACKTESTING_PAGE, STRATEGY_PAGE]) {
      const page = read(path);
      expect(page).toContain('autopilotPhase={autopilotController?.phase ?? null}');
      expect(page).toContain('autopilotPhaseText={autopilotController?.phaseText ?? null}');
      expect(page).toContain('autopilotDisconnected={Boolean(autopilotController?.transportError)}');
    }
    expect(read(EVIDENCE_RAIL)).toContain('phase={autopilotPhase}');
  });

  it('yields the cadence to the server scheduler instead of double-driving cycles', () => {
    const backtesting = read(BACKTESTING_HOOK);
    expect(backtesting).toContain('if (serverDriven) return undefined;');
    expect(backtesting).toContain('}, [autopilotEnabled, runAutopilotOptimization, serverDriven]);');
    expect(read(BACKTESTING_PAGE)).toContain('serverDriven: autopilotController?.serverBackgroundLoop === true,');

    const strategies = read(STRATEGY_PAGE);
    expect(strategies).toContain('if (autopilotServerDriven) return undefined;');
    expect(strategies).toContain('const autopilotServerDriven = autopilotController?.serverBackgroundLoop === true;');
  });

  it('adds no competing controller or cycle timer in the client', () => {
    const hook = read(HOOK);
    // The hook's only timer is the status poll; it must never call the cycle route.
    expect(hook).not.toContain('/api/strategies/autopilot/cycle');
    const timers = hook.match(/window\.setInterval/g) ?? [];
    expect(timers.length).toBe(1);
  });
});
