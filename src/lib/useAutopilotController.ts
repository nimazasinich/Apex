/**
 * Client binding for the server-side Smart Autopilot controller.
 *
 * Before this hook, the Autopilot switch only flipped a localStorage flag and a
 * client `setInterval`; the badge read "ARMED"/"TUNING" from local state and had
 * no idea what the server was doing. This hook makes the switch a real control:
 * explicit operator actions POST START/STOP to the one server controller and
 * the hook polls the real phase back, so the UI shows OFF / RESEARCHING /
 * VALIDATING / WAITING / FAILED as reported by the process that actually runs
 * cycles. A persisted local preference may opt in at boot, but it never
 * auto-stops a controller armed by the environment or another operator.
 *
 * SAFETY: this is a research control surface only. Starting the controller
 * grants no execution authority — the server hardcodes researchOnly/paperOnly
 * and executionAuthorized:false on every cycle, and neither the Risk Governor
 * nor DecisionBridge is reachable from here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiMutate } from '../services/apiMutate';

export type AutopilotPhase = 'OFF' | 'RESEARCHING' | 'VALIDATING' | 'WAITING' | 'FAILED';

/** Phases in which the server is genuinely mid-cycle. */
const BUSY_PHASES = new Set<AutopilotPhase>(['RESEARCHING', 'VALIDATING']);
const VALID_PHASES = new Set<AutopilotPhase>(['OFF', 'RESEARCHING', 'VALIDATING', 'WAITING', 'FAILED']);

export const AUTOPILOT_STATUS_POLL_MS = 15_000;

export interface AutopilotControllerView {
  /** Real server phase, or null until the first status response lands. */
  phase: AutopilotPhase | null;
  phaseText: string | null;
  phaseSince: number | null;
  enabled: boolean;
  armedBy: 'NONE' | 'ENV' | 'OPERATOR';
  serverBackgroundLoop: boolean;
  activeCycleIndex: number | null;
  cyclesCompleted: number;
  cyclesFailed: number;
  lastError: string | null;
  /** True while a start/stop request is in flight. */
  pending: boolean;
  /** Set when the status endpoint itself is unreachable. */
  transportError: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => void;
}

interface StatusPayload {
  controller?: {
    phase?: string;
    phaseText?: string;
    phaseSince?: number;
    enabled?: boolean;
    armedBy?: string;
    activeCycleIndex?: number | null;
    cyclesCompleted?: number;
    cyclesFailed?: number;
    lastError?: string | null;
  };
  scheduler?: { serverBackgroundLoop?: boolean };
}

const EMPTY = {
  phase: null as AutopilotPhase | null,
  phaseText: null as string | null,
  phaseSince: null as number | null,
  enabled: false,
  armedBy: 'NONE' as 'NONE' | 'ENV' | 'OPERATOR',
  serverBackgroundLoop: false,
  activeCycleIndex: null as number | null,
  cyclesCompleted: 0,
  cyclesFailed: 0,
  lastError: null as string | null,
};

const readPhase = (raw: unknown): AutopilotPhase | null =>
  typeof raw === 'string' && VALID_PHASES.has(raw as AutopilotPhase) ? (raw as AutopilotPhase) : null;

function project(payload: StatusPayload): typeof EMPTY {
  const controller = payload.controller ?? {};
  const armedBy = controller.armedBy;
  return {
    phase: readPhase(controller.phase),
    phaseText: typeof controller.phaseText === 'string' ? controller.phaseText : null,
    phaseSince: typeof controller.phaseSince === 'number' ? controller.phaseSince : null,
    enabled: controller.enabled === true,
    armedBy: armedBy === 'ENV' || armedBy === 'OPERATOR' ? armedBy : 'NONE',
    serverBackgroundLoop: payload.scheduler?.serverBackgroundLoop === true,
    activeCycleIndex: typeof controller.activeCycleIndex === 'number' ? controller.activeCycleIndex : null,
    cyclesCompleted: typeof controller.cyclesCompleted === 'number' ? controller.cyclesCompleted : 0,
    cyclesFailed: typeof controller.cyclesFailed === 'number' ? controller.cyclesFailed : 0,
    lastError: typeof controller.lastError === 'string' ? controller.lastError : null,
  };
}

/**
 * @param desiredEnabled the persisted user preference used as a one-time boot opt-in.
 *   If the server is OFF and the persisted preference is enabled, the hook starts it once.
 *   Explicit operator actions are otherwise authoritative; this hook never auto-stops an
 *   independently ENV/operator-armed server controller.
 */
export function useAutopilotController(desiredEnabled: boolean): AutopilotControllerView {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Poll faster while mid-cycle so RESEARCHING -> VALIDATING is visible.
  const busy = snapshot.phase !== null && BUSY_PHASES.has(snapshot.phase);
  const initialPreferenceHandledRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch('/api/strategies/autopilot/status', { signal: controller.signal });
        if (!response.ok) throw new Error(`status_${response.status}`);
        const payload = (await response.json()) as StatusPayload;
        if (cancelled) return;
        setSnapshot(project(payload));
        setTransportError(null);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        // Keep the last known phase; surface the transport problem separately so
        // an unreachable server never renders as a healthy OFF.
        setTransportError(error instanceof Error ? error.message : String(error));
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), busy ? 4_000 : AUTOPILOT_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [busy, nonce]);

  const send = useCallback(async (action: 'START' | 'STOP') => {
    setPending(true);
    try {
      const response = await apiMutate('/api/strategies/autopilot/control', {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as StatusPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || `control_${response.status}`);
      setSnapshot(project(payload));
      setTransportError(null);
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
      setNonce((value) => value + 1);
    }
  }, []);

  const start = useCallback(() => send('START'), [send]);
  const stop = useCallback(() => send('STOP'), [send]);

  // Boot-time reconciliation is intentionally one-way: a persisted operator
  // preference may arm an OFF controller, but a browser must never auto-stop a
  // controller that was armed by the server environment or another operator.
  // Explicit user clicks call start/stop directly from App.tsx.
  useEffect(() => {
    if (initialPreferenceHandledRef.current || snapshot.phase === null) return;
    initialPreferenceHandledRef.current = true;
    if (desiredEnabled && !snapshot.enabled) void send('START');
  }, [desiredEnabled, send, snapshot.enabled, snapshot.phase]);

  return {
    ...snapshot,
    pending,
    transportError,
    start,
    stop,
    refresh: useCallback(() => setNonce((value) => value + 1), []),
  };
}
