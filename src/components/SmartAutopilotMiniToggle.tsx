import React from 'react';
import { Activity } from 'lucide-react';
import type { AutopilotPhase } from '../lib/useAutopilotController';
import './SmartAutopilotMiniToggle.css';

interface SmartAutopilotMiniToggleProps {
  enabled: boolean;
  running?: boolean;
  /**
   * Real controller phase reported by the server. When present it is
   * authoritative — the label must never claim a state the server is not in.
   */
  phase?: AutopilotPhase | null;
  /** Operator-facing explanation of the phase, used as the tooltip. */
  phaseText?: string | null;
  /** True when the status endpoint is unreachable, so we don't fake "OFF". */
  disconnected?: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
  title?: string;
}

/** Short badge text per real controller phase. */
const PHASE_LABEL: Record<AutopilotPhase, string> = {
  OFF: 'OFF',
  WAITING: 'WAITING',
  RESEARCHING: 'RESEARCHING',
  VALIDATING: 'VALIDATING',
  FAILED: 'FAILED',
};

export function SmartAutopilotMiniToggle({
  enabled,
  running = false,
  phase = null,
  phaseText = null,
  disconnected = false,
  disabled = false,
  onChange,
  className = '',
  title = 'Smart Autopilot auto-tuning',
}: SmartAutopilotMiniToggleProps) {
  // Server phase wins. Local props are only the fallback for the brief window
  // before the first status response, or if this toggle is rendered unwired.
  const state = disconnected
    ? 'UNREACHABLE'
    : phase
      ? PHASE_LABEL[phase]
      : enabled ? (running ? 'TUNING' : 'ARMED') : 'OFF';

  const serverBusy = phase === 'RESEARCHING' || phase === 'VALIDATING';
  const isRunning = phase ? serverBusy : running;
  const isOn = phase ? phase !== 'OFF' : enabled;
  const isFailed = phase === 'FAILED' || disconnected;

  return (
    <button
      type="button"
      className={[
        'apex-smart-auto-mini',
        isOn ? 'is-on' : 'is-off',
        isRunning ? 'is-running' : '',
        isFailed ? 'is-failed' : '',
        className,
      ].filter(Boolean).join(' ')}
      aria-pressed={isOn}
      aria-label={`${title}: ${state}. ${isOn ? 'Disable' : 'Enable'} Smart Autopilot`}
      title={phaseText ? `${title} · ${state} — ${phaseText}` : `${title} · ${state}`}
      disabled={disabled}
      onClick={() => onChange(!isOn)}
    >
      <span className="apex-smart-auto-mini-icon" aria-hidden="true"><Activity size={12} /></span>
      <span className="apex-smart-auto-mini-copy">
        <strong>Autopilot</strong>
        <small>{state}</small>
      </span>
      <span className="apex-smart-auto-mini-switch" aria-hidden="true"><i /></span>
    </button>
  );
}
