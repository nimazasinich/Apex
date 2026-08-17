import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FlaskConical, Gauge, Radar, RotateCcw, ShieldCheck } from 'lucide-react';
import type { StrategyDefinition } from '../../types';
import { SmartAutopilotMiniToggle } from '../../components/SmartAutopilotMiniToggle';
import type { AutopilotPhase } from '../../lib/useAutopilotController';
import type { StrategyOptimizationReport } from '../../services/strategyOptimization';
import type { StrategyOptimizationProfile } from '../../services/strategyOptimizationStore';
import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';
import {
  evidenceWarnings,
  formatEvidenceDate,
  hasBoundEvidence,
  intervalLabel,
  strategyDataTier,
  strategyDisplayStatus,
} from './strategyPresentation';

interface StrategyEvidenceRailProps {
  strategy: StrategyDefinition;
  validationRunning: boolean;
  validationMessage: string | null;
  onRunValidation: () => void;
  optimizationRunning: boolean;
  optimizationMessage: string | null;
  optimizationReport: StrategyOptimizationReport | null;
  activeOptimizationProfile: StrategyOptimizationProfile | null;
  onRunOptimization: () => void;
  onPromoteOptimization: () => void;
  onRollbackOptimization: () => void;
  liquidityHunterRunning: boolean;
  liquidityHunterMessage: string | null;
  liquidityHunterEvaluation: LiquidityHunterEvaluation | null;
  liquidityHunterGovernance: unknown;
  liquidityHunterDatasets: unknown[];
  liquidityHunterManualTestnetPlans: Array<{
    liquidityHunter?: { setupId?: string | null; setupState?: string; symbol?: string };
    tradePlan?: { symbol?: string; direction?: string; quantity?: number; entryPrice?: number } | null;
    risk?: { decision?: string; approvedQuantity?: number; reasons?: string[] } | null;
    reasons?: string[];
  }>;
  liquidityHunterManualTestnetSafety: { manualConfirmationRequired: boolean; testnetOnly: boolean; autonomousLiveExecutionEnabled: boolean } | null;
  onSubmitLiquidityHunterManualTestnet: (setupId: string) => Promise<void>;
  onRunLiquidityHunter: () => void;
  autopilotEnabled: boolean;
  autopilotRunning: boolean;
  /** Real controller phase from the server; authoritative when present. */
  autopilotPhase?: AutopilotPhase | null;
  autopilotPhaseText?: string | null;
  autopilotDisconnected?: boolean;
  onAutopilotEnabledChange: (enabled: boolean) => void;
}

function formatPct(value: number, signed = false): string {
  const prefix = signed && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function formatCost(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(3)}% / side` : 'Not recorded';
}

function relativeAge(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return 'Not recorded';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function StrategyEvidenceRail(props: StrategyEvidenceRailProps) {
  const {
    strategy, validationRunning, validationMessage, onRunValidation,
    optimizationRunning, optimizationMessage, optimizationReport, activeOptimizationProfile,
    onRunOptimization, onPromoteOptimization, onRollbackOptimization,
    liquidityHunterRunning, liquidityHunterMessage, liquidityHunterEvaluation,
    liquidityHunterGovernance, liquidityHunterDatasets, liquidityHunterManualTestnetPlans,
    liquidityHunterManualTestnetSafety, onSubmitLiquidityHunterManualTestnet, onRunLiquidityHunter,
    autopilotEnabled, autopilotRunning, onAutopilotEnabledChange,
    autopilotPhase = null, autopilotPhaseText = null, autopilotDisconnected = false,
  } = props;
  const governance = liquidityHunterGovernance as { activeRevision?: number; proposals?: Array<{ id: string; status: string; profile?: { edgeId?: string; candidate?: number | null } }> } | null;
  const datasets = liquidityHunterDatasets as Array<{ manifest?: { datasetId?: string; eventCount?: number; checksumSha256?: string; startAt?: number; endAt?: number } }>;
  const [confirmingSetupId, setConfirmingSetupId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [submittingManualTestnet, setSubmittingManualTestnet] = useState(false);
  const [manualTestnetMessage, setManualTestnetMessage] = useState<string | null>(null);
  const snapshot = strategy.latestSnapshot;
  const bound = hasBoundEvidence(strategy);
  const warnings = evidenceWarnings(strategy);
  const status = strategyDisplayStatus(strategy);
  const evidenceReady = bound && status === 'Verified';
  const confirmingPlan = liquidityHunterManualTestnetPlans.find((plan) => plan.liquidityHunter?.setupId === confirmingSetupId) ?? null;
  const closeManualTestnetConfirmation = () => { setConfirmingSetupId(null); setConfirmation(''); };
  const submitManualTestnet = async () => {
    if (!confirmingSetupId || confirmation !== 'CONFIRM_LIQUIDITY_HUNTER_TESTNET') return;
    setSubmittingManualTestnet(true);
    setManualTestnetMessage(null);
    try {
      await onSubmitLiquidityHunterManualTestnet(confirmingSetupId);
      setManualTestnetMessage('Testnet submission was accepted. Check the execution reference in the status message.');
      closeManualTestnetConfirmation();
    } catch (error) {
      setManualTestnetMessage(error instanceof Error ? error.message : 'Manual testnet submission failed.');
    } finally {
      setSubmittingManualTestnet(false);
    }
  };

  return (
    <aside className="strategy-evidence-rail" aria-label="Strategy evidence">
      <section className="strategy-evidence-card strategy-validation-card" aria-label="Primary Evidence / Validation">
        <header className="strategy-evidence-card-title">
          <strong>EVIDENCE &amp; VALIDATION</strong>
        </header>
        <button
          type="button"
          className="strategy-validation-button strategy-primary-action"
          disabled={strategy.status === 'blocked' || validationRunning}
          onClick={onRunValidation}
        >
          {validationRunning ? 'Running Validation…' : strategy.status === 'blocked' ? 'Validation Blocked' : 'Run Validation'}
        </button>
        {validationMessage && <p className="strategy-validation-message" role="status">{validationMessage}</p>}
      </section>

      <section className="strategy-evidence-card strategy-secondary-research-card" aria-label="Research Tools">
        <div className="strategy-secondary-tools" aria-label="Secondary research tools">
          <div className="strategy-secondary-research-header"><span>SECONDARY RESEARCH</span><SmartAutopilotMiniToggle
            enabled={autopilotEnabled}
            running={autopilotRunning}
            phase={autopilotPhase}
            phaseText={autopilotPhaseText}
            disconnected={autopilotDisconnected}
            onChange={onAutopilotEnabledChange}
            title="Strategy Smart Autopilot"
          /></div>
          <button
            type="button"
            className="strategy-optimization-button"
            disabled={strategy.status === 'blocked' || optimizationRunning || validationRunning}
            onClick={onRunOptimization}
          >
            {optimizationRunning ? 'Optimizing…' : strategy.status === 'blocked' ? 'Blocked' : 'Run Smart Optimization'}
          </button>
          <button
            type="button"
            className="strategy-liquidity-hunter-button"
            disabled={liquidityHunterRunning || validationRunning || optimizationRunning}
            onClick={onRunLiquidityHunter}
          >
            {liquidityHunterRunning ? 'Evaluating…' : 'Liquidity Hunter Shadow'}
          </button>
        </div>
      </section>

      <section className="strategy-evidence-card strategy-provenance-card" aria-label="Data &amp; Ecosystem">
        <header className="strategy-evidence-card-title"><strong>DATA &amp; ECOSYSTEM</strong></header>
        <dl>
          <div><dt>Registry</dt><dd>{strategy.strategyId}</dd></div>
          <div><dt>Model Data Tier</dt><dd>{strategyDataTier(strategy)}</dd></div>
          <div><dt>Engine</dt><dd>{strategy.engine}</dd></div>
        </dl>
      </section>

      <section className="strategy-evidence-card strategy-evidence-status-card">
        <header className="strategy-evidence-card-title"><strong>EVIDENCE STATUS</strong></header>
        <div className={`strategy-evidence-state ${evidenceReady ? 'ready' : 'pending'}`}>
          <ShieldCheck size={18} aria-hidden="true" />
          <span><strong>{evidenceReady ? 'Evidence Ready' : 'Evidence Pending'}</strong><p>{evidenceReady ? 'Bound server evidence is available for this registered model.' : 'Evidence pending: no complete server evidence snapshot is currently bound, so performance is not presented as verified performance.'}</p></span>
        </div>
        <dl className="strategy-evidence-status-list">
          <div><dt>Snapshot age</dt><dd>{bound && snapshot ? relativeAge(snapshot.lastBacktestAt) : '—'}</dd></div>
          <div><dt>Sample</dt><dd>{bound && snapshot ? `${snapshot.sampleSize?.toLocaleString() ?? '—'} candles` : '—'}</dd></div>
          <div><dt>Ranking score</dt><dd>{bound && snapshot ? snapshot.score.toFixed(0) : '—'}</dd></div>
        </dl>
      </section>

      <section className="strategy-evidence-card strategy-warnings-card" aria-label="Warnings &amp; Limits">
        <header className="strategy-evidence-card-title"><strong>WARNINGS &amp; LIMITATIONS</strong><small>{warnings.length ? `${warnings.length}` : 'Clear'}</small></header>
        <div className="strategy-warning-rows">
          {warnings.length ? warnings.map((warning) => <div key={warning}><AlertTriangle size={14} /><p>{warning}</p></div>) : <div className="is-clear"><CheckCircle2 size={14} /><p>No current evidence warnings.</p></div>}
        </div>
      </section>

      {(activeOptimizationProfile || optimizationMessage || optimizationReport) && (
        <details className="strategy-evidence-advanced" open={Boolean(optimizationMessage)}>
          <summary><span>Advanced Evidence / Provenance</span><small>Optimization evidence &amp; profile governance</small></summary>
          {activeOptimizationProfile && (
            <section className="strategy-active-optimization" aria-label="Active optimization profile">
              <div><span>Active profile</span><strong>r{activeOptimizationProfile.revision}</strong><em>{activeOptimizationProfile.source === 'ROLLBACK' ? `restored from r${activeOptimizationProfile.restoredRevision ?? '—'}` : activeOptimizationProfile.source === 'MANUAL_PROMOTION' ? 'manually promoted' : activeOptimizationProfile.source === 'AUTOMATIC_PROMOTION' ? 'promoted by Autopilot' : 'legacy optimizer profile'}</em></div>
              <button type="button" disabled={optimizationRunning || !activeOptimizationProfile.previousRevision} onClick={onRollbackOptimization}><RotateCcw size={13} /> Roll back</button>
            </section>
          )}
          {optimizationMessage && <p className="strategy-validation-message" role="status">{optimizationMessage}</p>}
          {optimizationReport && (
            <section className="strategy-optimization-summary" aria-label="Latest optimization result">
              <header><Gauge size={14} /><strong>{optimizationReport.promotion.automaticallyPromoted ? 'Evidence-eligible candidate promoted by Autopilot' : optimizationReport.promotion.eligible ? 'Candidate eligible for manual promotion' : 'Promotion blocked'}</strong></header>
              <p>Eligibility uses untouched holdout, cost, drawdown, sample, stability and isolation gates.</p>
              <dl>
                <div><dt>Robust utility delta</dt><dd>{optimizationReport.promotion.robustImprovement >= 0 ? '+' : ''}{optimizationReport.promotion.robustImprovement.toFixed(3)}</dd></div>
                <div><dt>Holdout utility delta</dt><dd>{optimizationReport.promotion.holdoutImprovement >= 0 ? '+' : ''}{optimizationReport.promotion.holdoutImprovement.toFixed(3)}</dd></div>
                <div><dt>Neighbor pass</dt><dd>{(optimizationReport.promotion.neighborPassRate * 100).toFixed(0)}%</dd></div>
                <div><dt>Candidates</dt><dd>{optimizationReport.triedCandidates}</dd></div>
                <div><dt>Runtime</dt><dd>{(optimizationReport.durationMs / 1000).toFixed(1)}s</dd></div>
                <div><dt>Holdout P&amp;L</dt><dd>{optimizationReport.holdout.candidate.metrics.totalPnlPct.toFixed(2)}%</dd></div>
              </dl>
              {optimizationReport.promotion.eligible && !optimizationReport.promotion.automaticallyPromoted && (
                <button type="button" className="strategy-optimization-promote-button" disabled={optimizationRunning} onClick={onPromoteOptimization}><ShieldCheck size={13} /> Promote reviewed candidate</button>
              )}
              {!optimizationReport.promotion.eligible && optimizationReport.promotion.blockers.length > 0 && <p>{optimizationReport.promotion.blockers.join(' · ')}</p>}
            </section>
          )}
        </details>
      )}

      {(liquidityHunterMessage || liquidityHunterEvaluation) && (
        <details className="strategy-evidence-advanced" open={Boolean(liquidityHunterMessage)}>
          <summary><span>Advanced Evidence / Provenance</span><small>Liquidity Hunter shadow evidence</small></summary>
          {liquidityHunterMessage && <p className="strategy-validation-message" role="status">{liquidityHunterMessage}</p>}
          {liquidityHunterEvaluation && (
            <section className="strategy-liquidity-hunter-summary" aria-label="Liquidity Hunter shadow result">
              <header><Radar size={14} /><strong>{liquidityHunterEvaluation.setupState.replaceAll('_', ' ')}</strong></header>
              <dl>
                <div><dt>Fusion</dt><dd>{(liquidityHunterEvaluation.fusionScore * 100).toFixed(1)}%</dd></div>
                <div><dt>Sweep</dt><dd>{liquidityHunterEvaluation.macro.expectedSweepDirection}</dd></div>
                <div><dt>Bias</dt><dd>{liquidityHunterEvaluation.macro.postSweepTradeBias}</dd></div>
                <div><dt>Trigger</dt><dd>{liquidityHunterEvaluation.trigger.kind.replaceAll('_', ' ')}</dd></div>
                <div><dt>Shadow validator</dt><dd>{liquidityHunterEvaluation.shadowValidation.replaceAll('_', ' ')}</dd></div>
                <div><dt>Manual candidate</dt><dd>{liquidityHunterEvaluation.eligibleForManualConfirmation ? 'Yes' : 'No'}</dd></div>
              </dl>
              <div className="strategy-liquidity-layer-strip">{liquidityHunterEvaluation.layers.map((layer) => <span key={layer.layer} className={`is-${layer.status.toLowerCase()}`}>L{layer.layer} · {layer.status}</span>)}</div>
              <div className="strategy-liquidity-edge-matrix" aria-label="Liquidity Hunter edge evidence matrix">
                {liquidityHunterEvaluation.evidence.map((edge) => (
                  <article key={edge.edgeId} className={`is-${edge.status.toLowerCase()}`}>
                    <strong>{edge.edgeId.replaceAll('_', ' ')}</strong>
                    <span>{edge.status} · {edge.direction ?? '—'} · {edge.score == null ? '—' : edge.score.toFixed(3)}</span>
                    <small>Quality {(edge.dataQuality * 100).toFixed(0)}% · age {Math.max(0, Math.round((Date.now() - edge.observedAt) / 1_000))}s · {edge.sourceVersion}</small>
                  </article>
                ))}
              </div>
              <section className="strategy-liquidity-governance" aria-label="Liquidity Hunter threshold proposals">
                <strong>Threshold governance · revision {governance?.activeRevision ?? '—'}</strong>
                {governance?.proposals?.length ? governance.proposals.slice(-5).map((proposal) => <p key={proposal.id}>{proposal.profile?.edgeId ?? 'EDGE'} · {proposal.status} · candidate {proposal.profile?.candidate ?? '—'}</p>) : <p>No staged threshold proposals.</p>}
              </section>
              <section className="strategy-liquidity-replays" aria-label="Liquidity Hunter replay datasets">
                <strong>Replay datasets</strong>
                {datasets.length ? datasets.map((dataset, index) => <p key={dataset.manifest?.datasetId ?? index}>{dataset.manifest?.datasetId ?? 'dataset'} · {dataset.manifest?.eventCount ?? 0} events · {dataset.manifest?.checksumSha256?.slice(0, 12) ?? 'no checksum'}</p>) : <p>No recorded replay dataset is available.</p>}
              </section>
              <section className="strategy-liquidity-manual-testnet" aria-label="Liquidity Hunter manual testnet plans">
                <strong>Manual Testnet</strong>
                <p>Manual confirmation required · {liquidityHunterManualTestnetSafety?.testnetOnly === false ? 'testnet status unavailable' : 'testnet only'} · {liquidityHunterManualTestnetSafety?.autonomousLiveExecutionEnabled ? 'live autonomy reported enabled' : 'no autonomous execution'}.</p>
                {liquidityHunterManualTestnetPlans.length ? liquidityHunterManualTestnetPlans.map((plan, index) => {
                  const setupId = plan.liquidityHunter?.setupId;
                  const riskDecision = plan.risk?.decision || 'NOT_RECORDED';
                  const actionable = Boolean(setupId) && (riskDecision === 'APPROVED' || riskDecision === 'APPROVED_REDUCED');
                  const reason = plan.risk?.reasons?.join(' · ') || plan.reasons?.join(' · ') || 'Risk approval is required before submission.';
                  return <article key={setupId ?? index} className={actionable ? 'is-approved' : 'is-blocked'}>
                    <header><strong>{plan.tradePlan?.symbol || plan.liquidityHunter?.symbol || 'Unknown symbol'} · {plan.tradePlan?.direction || '—'}</strong><span>{riskDecision.replaceAll('_', ' ')}</span></header>
                    <dl>
                      <div><dt>Approved quantity</dt><dd>{plan.risk?.approvedQuantity ?? plan.tradePlan?.quantity ?? '—'}</dd></div>
                      <div><dt>Entry price</dt><dd>{typeof plan.tradePlan?.entryPrice === 'number' ? plan.tradePlan.entryPrice.toLocaleString() : '—'}</dd></div>
                      <div><dt>Setup state</dt><dd>{plan.liquidityHunter?.setupState?.replaceAll('_', ' ') || '—'}</dd></div>
                    </dl>
                    {actionable ? <button type="button" onClick={() => { setConfirmingSetupId(setupId!); setConfirmation(''); setManualTestnetMessage(null); }}>Confirm &amp; Submit</button> : <p>{reason}</p>}
                  </article>;
                }) : <p>No pending risk-authorized manual-testnet plans.</p>}
                {manualTestnetMessage && <p role="status">{manualTestnetMessage}</p>}
              </section>
              <p>Shadow only · non-authoritative · no execution authorization.</p>
            </section>
          )}
        </details>
      )}

      {bound && snapshot && (
        <details className="strategy-evidence-advanced">
          <summary><span>Advanced Evidence / Provenance</span><small>Canonical validation metrics &amp; run provenance</small></summary>
          <section className="strategy-evidence-metrics">
            <div><span>Ranking score</span><strong>{snapshot.score.toFixed(0)}</strong></div>
            <div><span>Net return</span><strong className={snapshot.netReturnPct >= 0 ? 'positive' : 'negative'}>{formatPct(snapshot.netReturnPct, true)}</strong></div>
            <div><span>Max drawdown</span><strong className="negative">{formatPct(-Math.abs(snapshot.maxDrawdownPct))}</strong></div>
            <div><span>Win rate</span><strong>{formatPct(snapshot.winRatePct)}</strong></div>
            <div><span>Profit factor</span><strong>{snapshot.profitFactor.toFixed(2)}</strong></div>
            <div><span>Cost stress</span><strong>{snapshot.costStressPassed ? 'Passed' : 'Failed'}</strong></div>
          </section>
          <section className="strategy-provenance-card">
            <header><Database size={14} /><strong>Provenance</strong></header>
            <dl>
              <div><dt>Source</dt><dd>{snapshot.source}</dd></div>
              <div><dt>Market</dt><dd>{snapshot.symbol}</dd></div>
              <div><dt>Timeframe</dt><dd>{intervalLabel(snapshot.interval)}</dd></div>
              <div><dt>Direction</dt><dd>{snapshot.direction}</dd></div>
              <div><dt>Date range</dt><dd>{snapshot.dateFrom && snapshot.dateTo ? `${new Date(snapshot.dateFrom).toLocaleDateString()} – ${new Date(snapshot.dateTo).toLocaleDateString()}` : 'Not recorded'}</dd></div>
              <div><dt>Run date</dt><dd>{formatEvidenceDate(snapshot.lastBacktestAt)}</dd></div>
              <div><dt>Sample</dt><dd>{snapshot.sampleSize?.toLocaleString()} candles</dd></div>
              <div><dt>Commission</dt><dd>{formatCost(snapshot.commissionPctPerSide)}</dd></div>
              <div><dt>Slippage</dt><dd>{formatCost(snapshot.slippagePctPerSide)}</dd></div>
              <div><dt>Funding estimate</dt><dd>{typeof snapshot.fundingPctEstimate === 'number' && Number.isFinite(snapshot.fundingPctEstimate) ? `${snapshot.fundingPctEstimate.toFixed(3)}%` : 'Not recorded'}</dd></div>
              <div><dt>Engine</dt><dd>{snapshot.engine}</dd></div>
              <div><dt>Validation</dt><dd>{snapshot.validationMethod}</dd></div>
              <div><dt>Run ID</dt><dd className="mono">{snapshot.runId}</dd></div>
            </dl>
          </section>
        </details>
      )}

      {confirmingPlan && (
        <div className="strategy-manual-testnet-backdrop" role="presentation">
          <section className="strategy-manual-testnet-dialog" role="dialog" aria-modal="true" aria-labelledby="strategy-manual-testnet-title">
            <header><span>Manual testnet confirmation</span><button type="button" onClick={closeManualTestnetConfirmation} aria-label="Close manual testnet confirmation">×</button></header>
            <h3 id="strategy-manual-testnet-title">Confirm the Liquidity Hunter testnet order</h3>
            <p className="strategy-dialog-subtitle">This submits only the risk-authorized testnet plan shown below; it does not enable autonomous live execution.</p>
            <dl>
              <div><dt>Market</dt><dd>{confirmingPlan.tradePlan?.symbol || confirmingPlan.liquidityHunter?.symbol || '—'}</dd></div>
              <div><dt>Direction</dt><dd>{confirmingPlan.tradePlan?.direction || '—'}</dd></div>
              <div><dt>Approved quantity</dt><dd>{confirmingPlan.risk?.approvedQuantity ?? confirmingPlan.tradePlan?.quantity ?? '—'}</dd></div>
              <div><dt>Entry price</dt><dd>{typeof confirmingPlan.tradePlan?.entryPrice === 'number' ? confirmingPlan.tradePlan.entryPrice.toLocaleString() : '—'}</dd></div>
            </dl>
            <p>This is a manually confirmed testnet-only action. It cannot enable autonomous live execution.</p>
            <label>Type <strong>CONFIRM_LIQUIDITY_HUNTER_TESTNET</strong> to submit.
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="CONFIRM_LIQUIDITY_HUNTER_TESTNET" aria-label="Liquidity Hunter testnet confirmation phrase" />
            </label>
            <button type="button" disabled={confirmation !== 'CONFIRM_LIQUIDITY_HUNTER_TESTNET' || submittingManualTestnet} onClick={() => void submitManualTestnet()}>{submittingManualTestnet ? 'Submitting…' : 'Submit testnet order'}</button>
          </section>
        </div>
      )}
    </aside>
  );
}
