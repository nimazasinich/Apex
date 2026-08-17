import React from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import type { AutopilotControllerView } from '../../lib/useAutopilotController';

interface AutopilotHeaderControlProps {
  preferenceEnabled: boolean;
  controller: AutopilotControllerView;
  onToggle: (enabled: boolean) => void;
}

export function AutopilotHeaderControl({ preferenceEnabled, controller, onToggle }: AutopilotHeaderControlProps) {
  const known = controller.phase !== null;
  const enabled = known ? controller.enabled : preferenceEnabled;
  const phase = controller.transportError ? 'UNREACHABLE' : controller.phase ?? (enabled ? 'STARTING' : 'OFF');
  const busy = phase === 'RESEARCHING' || phase === 'VALIDATING';
  const failed = phase === 'FAILED' || phase === 'UNREACHABLE';
  const owner = controller.armedBy === 'ENV' ? 'ENV' : controller.armedBy === 'OPERATOR' ? 'OPERATOR' : 'LOCAL';
  const detail = controller.transportError
    ? `Autopilot controller unreachable: ${controller.transportError}`
    : controller.phaseText || 'Research/paper-only Smart Autopilot. No live order authority.';

  return (
    <button
      type="button"
      className={`apex-autopilot-header ${enabled ? 'is-on' : 'is-off'} ${busy ? 'is-busy' : ''} ${failed ? 'is-failed' : ''}`}
      aria-label={`Autopilot ${phase}. ${enabled ? 'Stop' : 'Start'} research Autopilot`}
      aria-pressed={enabled}
      title={`${detail} · owner ${owner}`}
      disabled={controller.pending || Boolean(controller.transportError)}
      onClick={() => onToggle(!enabled)}
      data-autopilot-phase={phase}
    >
      <span className="apex-autopilot-header-icon" aria-hidden="true"><Activity size={15} /></span>
      <span className="apex-autopilot-header-copy">
        <strong>AUTOPILOT</strong>
        <small>{controller.pending ? 'UPDATING' : phase}</small>
      </span>
      <span className="apex-autopilot-header-owner" aria-label={`Controller owner ${owner}`}><ShieldCheck size={11} />{owner}</span>
      <span className="apex-autopilot-header-switch" aria-hidden="true"><i /></span>
    </button>
  );
}
