import React from 'react';
import { Check, CircleDollarSign, FileCheck2, Layers, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import heroIllustration from '../../assets/backtesting/apex-backtesting-evidence-hero.svg';

export type BacktestPhase = 'ready' | 'blocked' | 'running' | 'error' | 'cancelled' | 'stale' | 'complete';

type StepStatus = 'pending' | 'active' | 'complete' | 'error';

const COPY: Record<BacktestPhase, { title: string; detail: string }> = {
  ready: { title: 'Replay is ready to run', detail: 'Your configuration is valid and all inputs are available. Run the backtest to generate verified results.' },
  blocked: { title: 'Strategy prerequisites unavailable', detail: 'This strategy is blocked by the server. Resolve its prerequisites before a replay can be requested.' },
  running: { title: 'Replay running', detail: 'The server is executing this configuration. The engine does not expose progress counts, so no percentage is invented.' },
  error: { title: 'Backtest failed', detail: 'The latest request did not complete. Review the error, adjust the configuration, and run again.' },
  cancelled: { title: 'Backtest cancelled', detail: 'The active browser request was cancelled. No completion is claimed for the cancelled run.' },
  stale: { title: 'Configuration changed since last run', detail: 'The inputs differ from the completed result shown below. Re-run to refresh the evidence for the current configuration.' },
  complete: { title: 'Replay complete', detail: 'Server-verified results are ready below. Review the evidence, notes, and run history.' },
};

function Step({ index, label, detail, status }: { index: number; label: string; detail: string; status: StepStatus }) {
  return (
    <li className={`apex-bt-step status-${status}`}>
      <span className="apex-bt-step-marker">{status === 'complete' ? <Check size={13} aria-hidden="true" /> : index}</span>
      <span className="apex-bt-step-body"><strong>{label}</strong><small>{detail}</small></span>
    </li>
  );
}

export function BacktestEvidenceHero({
  phase,
  canRun,
  loading,
  onRun,
  integrityNote,
}: {
  phase: BacktestPhase;
  canRun: boolean;
  loading: boolean;
  onRun: () => void;
  integrityNote: string;
}) {
  const copy = COPY[phase];
  const configStatus: StepStatus = phase === 'blocked' ? 'error' : 'complete';
  const runStatus: StepStatus = loading
    ? 'active'
    : phase === 'error' || phase === 'cancelled'
      ? 'error'
      : phase === 'complete' || phase === 'stale'
        ? 'complete'
        : 'pending';
  const reviewStatus: StepStatus = phase === 'complete' || phase === 'stale' ? 'active' : 'pending';
  const showRunCta = phase === 'error' || phase === 'cancelled' || phase === 'stale';

  return (
    <section className={`apex-bt-hero phase-${phase}`} aria-label="Backtest evidence hero">
      <div className="apex-bt-hero-band">
        <div className="apex-bt-hero-copy">
          <div className="apex-bt-hero-headline"><ShieldCheck size={22} aria-hidden="true" /><h2>{copy.title}</h2></div>
          <p>{copy.detail}</p>
          <small className="apex-bt-hero-integrity">{integrityNote}</small>
          <ul className="apex-bt-hero-features" aria-label="Backtest pipeline properties">
            <li><FileCheck2 size={15} aria-hidden="true" /><span><strong>Canonical server results</strong><small>Verified and audited</small></span></li>
            <li><Layers size={15} aria-hidden="true" /><span><strong>Separation of calculations</strong><small>Clear labeling of outputs</small></span></li>
            <li><CircleDollarSign size={15} aria-hidden="true" /><span><strong>Reproducible &amp; reportable</strong><small>Trusted backtest pipeline</small></span></li>
          </ul>
          {showRunCta && (
            <button type="button" className="apex-bt-hero-cta" onClick={onRun} disabled={loading || !canRun}>
              {loading ? <RefreshCw className="spin" size={15} aria-hidden="true" /> : <Play size={15} fill="currentColor" aria-hidden="true" />}
              {loading ? 'Running Backtest…' : phase === 'stale' ? 'Apply & Run' : 'Run Backtest'}
            </button>
          )}
        </div>
        <div className="apex-bt-hero-art">
          <img className="apex-bt-hero-illustration" src={heroIllustration} alt="Backtesting evidence pipeline" />
        </div>
      </div>
      <ol className="apex-bt-stepper" aria-label="Backtest workflow">
        <Step index={1} label="Configure" detail="Review inputs & settings" status={configStatus} />
        <Step index={2} label="Run" detail="Execute backtest on server" status={runStatus} />
        <Step index={3} label="Review" detail="Analyze results & evidence" status={reviewStatus} />
      </ol>
    </section>
  );
}
