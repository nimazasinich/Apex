import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FlaskConical, Play, Shield, X } from 'lucide-react';
import type { StrategyDefinition } from '../../types';
import { useDialogA11y } from '../../lib/useDialogA11y';
import './StrategyDetailPage.css';

interface StrategyDetailPageProps {
  strategy: StrategyDefinition;
  onClose: () => void;
  initialParameterValues?: Record<string, number | string>;
  onSendToBacktesting: (parameters: Record<string, number | string>) => void;
  onRunValidation: () => void;
  validationRunning?: boolean;
  validationMessage?: string | null;
}

const RULE_SECTIONS: Array<{ key: keyof Pick<StrategyDefinition, 'regimeRules' | 'setupRules' | 'triggerRules' | 'riskRules' | 'exitRules' | 'noTradeRules'>; label: string }> = [
  { key: 'regimeRules', label: 'Regime Rules' },
  { key: 'setupRules', label: 'Setup Rules' },
  { key: 'triggerRules', label: 'Trigger Rules' },
  { key: 'riskRules', label: 'Risk Rules' },
  { key: 'exitRules', label: 'Exit Rules' },
  { key: 'noTradeRules', label: 'No-Trade Rules' },
];

export function StrategyDetailPage({ strategy, onClose, initialParameterValues, onSendToBacktesting, onRunValidation, validationRunning = false, validationMessage }: StrategyDetailPageProps) {
  const initialParameters = useMemo(() => ({
    ...Object.fromEntries(strategy.parameters.map((parameter) => [parameter.key, parameter.default])),
    ...(initialParameterValues ?? {}),
  }), [initialParameterValues, strategy]);
  const [parameters, setParameters] = useState<Record<string, number | string>>(initialParameters);
  const [mode, setMode] = useState<'guided' | 'advanced'>('guided');
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogA11y<HTMLElement>({ isOpen: true, onClose, initialFocusRef: closeRef });

  useEffect(() => {
    setParameters(initialParameters);
    setMode('guided');
  }, [initialParameters, strategy.strategyId]);

  const updateParameter = (key: string, rawValue: string, numeric: boolean) => {
    setParameters((previous) => ({ ...previous, [key]: numeric ? Number(rawValue) : rawValue }));
  };

  return (
    <div className="strategy-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section ref={dialogRef} className="strategy-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="strategy-detail-title">
        <header className="strategy-detail-header">
          <div>
            <span className={`strategy-detail-status ${strategy.status}`}>{strategy.status}</span>
            <h2 id="strategy-detail-title">{strategy.name}</h2>
            <p>{strategy.summary}</p><small className="strategy-detail-subtitle">Inspect rules, evidence requirements, editable parameters, and safe handoff actions for this registered strategy.</small>
          </div>
          <button ref={closeRef} type="button" aria-label="Close strategy details" onClick={onClose}><X size={18} /></button>
        </header>

        {strategy.blockedReason && (
          <div className="strategy-detail-blocked"><AlertTriangle size={16} /><span><strong>Blocked prerequisite</strong>{strategy.blockedReason}</span></div>
        )}

        <div className="strategy-detail-meta">
          <div><Database size={15} /><span><small>Data</small><strong>{strategy.dataRequirements.join(' · ')}</strong></span></div>
          <div><FlaskConical size={15} /><span><small>Engine</small><strong>{strategy.engine}</strong></span></div>
          <div><Shield size={15} /><span><small>Evidence</small><strong>Tier {strategy.evidenceTier.join(' / ')}</strong></span></div>
          <div><CheckCircle2 size={15} /><span><small>Version</small><strong>v{strategy.version}</strong></span></div>
        </div>

        <div className="strategy-detail-body">
          <div className="strategy-rule-grid">
            {RULE_SECTIONS.map((section) => (
              <article key={section.key}>
                <h3>{section.label}</h3>
                <ol>{strategy[section.key].map((rule) => <li key={rule}>{rule}</li>)}</ol>
              </article>
            ))}
          </div>

          <aside className="strategy-parameter-panel">
            <div className="strategy-parameter-head">
              <h3>Configuration</h3><p>Guided mode protects registered defaults; Advanced allows explicit local edits before Backtesting handoff.</p>
              <div><button type="button" className={mode === 'guided' ? 'active' : ''} onClick={() => setMode('guided')}>Guided</button><button type="button" className={mode === 'advanced' ? 'active' : ''} onClick={() => setMode('advanced')}>Advanced</button></div>
            </div>
            {strategy.parameters.length ? strategy.parameters.map((parameter) => {
              const numeric = typeof parameter.default === 'number';
              return (
                <label key={parameter.key}>
                  <span>{parameter.label}</span>
                  <input
                    type={numeric ? 'number' : 'text'}
                    value={parameters[parameter.key]}
                    min={mode === 'advanced' ? parameter.min : undefined}
                    max={mode === 'advanced' ? parameter.max : undefined}
                    step={parameter.step}
                    disabled={mode === 'guided'}
                    onChange={(event) => updateParameter(parameter.key, event.target.value, numeric)}
                  />
                  <small>{parameter.reason}</small>
                </label>
              );
            }) : <p className="strategy-no-parameters">This strategy is waiting on infrastructure or rule sign-off; no executable parameters are exposed.</p>}

            <div className="strategy-failure-box">
              <h4>Known failure modes</h4>
              <ul>{strategy.knownFailureModes.map((failure) => <li key={failure}>{failure}</li>)}</ul>
            </div>

            <div className="strategy-detail-actions">
              <button type="button" className="strategy-detail-validate" disabled={strategy.status === 'blocked' || validationRunning} onClick={onRunValidation}>
                <FlaskConical size={15} />{validationRunning ? 'Running Validation…' : 'Run Validation'}
              </button>
              <button type="button" className="strategy-detail-run" disabled={strategy.status === 'blocked'} onClick={() => onSendToBacktesting(parameters)}>
                <Play size={15} />{strategy.status === 'blocked' ? 'Prerequisites Required' : 'Send to Backtesting'}
              </button>
            </div>
            <small className="strategy-detail-validation-scope">Validation uses the registered strategy definition. Edited values are transferred to Backtesting only.</small>
            {validationMessage && <p className="strategy-validation-message">{validationMessage}</p>}
          </aside>
        </div>
      </section>
    </div>
  );
}
