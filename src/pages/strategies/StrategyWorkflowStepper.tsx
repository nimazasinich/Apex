import React from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';

export type StrategyWorkflowStage = 'discover' | 'configure' | 'validate' | 'send-to-backtesting';

type StepState = 'complete' | 'current' | 'running' | 'blocked' | 'warning' | 'ready' | 'pending';

interface StrategyWorkflowStepperProps {
  stage: StrategyWorkflowStage;
  validationRunning?: boolean;
  evidenceReady?: boolean;
  evidenceBound?: boolean;
  blocked?: boolean;
}

const STAGES: Array<{ id: StrategyWorkflowStage; label: string; description: string }> = [
  { id: 'discover', label: 'Discover', description: 'Select a real registered strategy' },
  { id: 'configure', label: 'Configure', description: 'Set market, timeframe, side and parameters' },
  { id: 'validate', label: 'Validate', description: 'Run server evidence and model gates' },
  { id: 'send-to-backtesting', label: 'Send to Backtesting', description: 'Transfer this exact configuration' },
];

function stateLabel(state: StepState): string {
  if (state === 'complete') return 'Complete';
  if (state === 'current') return 'Current';
  if (state === 'running') return 'Running';
  if (state === 'blocked') return 'Blocked';
  if (state === 'warning') return 'Review';
  if (state === 'ready') return 'Ready';
  return 'Pending';
}

export function StrategyWorkflowStepper({ stage, validationRunning = false, evidenceReady = false, evidenceBound = false, blocked = false }: StrategyWorkflowStepperProps) {
  const activeIndex = Math.max(0, STAGES.findIndex((item) => item.id === stage));
  return (
    <nav className="strategy-workflow-stepper" aria-label="Strategy workflow">
      {STAGES.map((item, index) => {
        let stepState: StepState = index < activeIndex ? 'complete' : index === activeIndex ? 'current' : 'pending';
        if (item.id === 'discover') stepState = 'complete';
        if (item.id === 'configure' && blocked) stepState = 'blocked';
        if (item.id === 'validate') {
          if (validationRunning) stepState = 'running';
          else if (blocked) stepState = 'blocked';
          else if (evidenceReady) stepState = 'complete';
          else if (evidenceBound) stepState = 'warning';
          else stepState = stage === 'validate' ? 'current' : 'pending';
        }
        if (item.id === 'send-to-backtesting') {
          if (blocked) stepState = 'blocked';
          else if (evidenceReady) stepState = 'ready';
          else if (stage === 'send-to-backtesting') stepState = 'current';
        }
        const completed = stepState === 'complete' || stepState === 'ready';
        const current = stepState === 'current' || stepState === 'running' || stepState === 'warning' || stepState === 'blocked';
        return (
          <React.Fragment key={item.id}>
            <div className={`strategy-workflow-step is-${stepState}`} aria-current={current ? 'step' : undefined} aria-label={`${item.label}. ${stateLabel(stepState)}. ${item.description}`}>
              <span className="strategy-workflow-number" aria-hidden="true">{stepState === 'running' ? <Loader2 size={13} className="spin" /> : completed ? <Check size={14} strokeWidth={2.5} /> : stepState === 'blocked' || stepState === 'warning' ? <AlertTriangle size={13} /> : index + 1}</span>
              <span className="strategy-workflow-copy"><strong>{item.label}</strong><small>{stateLabel(stepState)}</small></span>
            </div>
            {index < STAGES.length - 1 && <span className={`strategy-workflow-connector ${completed ? 'is-complete' : ''}`} aria-hidden="true" />}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
