import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Database,
  DatabaseZap,
  Gauge,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { DataState } from '../../types';
import {
  countUsableDiagnostics,
  diagnosticsErrorSummary,
  fetchOperationsDiagnostics,
  mergeOperationsDiagnostics,
  selectFastAdaptiveHorizon,
  summarizeOperationsDiagnostics,
  type OperationsDiagnosticsSnapshot,
} from '../../services/operationsDiagnostics';
import { useDialogA11y } from '../../lib/useDialogA11y';
import { listModuleCapabilities, listProviderCapabilities } from '../../lib/capabilityStatus';
import './OperationsDrawers.css';

interface SystemHealthDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const stateTone = (state: DataState | string | undefined) => {
  if (state === 'live') return 'positive';
  if (state === 'degraded') return 'warning';
  if (state === 'not_configured') return 'neutral';
  return 'negative';
};

const operationsTone = (state: string | undefined) => {
  const value = String(state || '').toUpperCase();
  if (/READY|HEALTHY|SYNC_ENABLED|SYNCED|PASSED|TRAINED|COMPARED|ENABLED/.test(value)) return 'positive';
  if (/DEGRADED|WAITING|RATE_LIMITED|LOCAL_ONLY|INSUFFICIENT|SKIPPED|EMPTY|DISABLED/.test(value)) return 'warning';
  if (/UNAVAILABLE|UNHEALTHY|ERROR|FAILED|MALFORMED/.test(value)) return 'negative';
  return 'neutral';
};

const stateLabel = (state: string | undefined) => (state || 'unavailable').replaceAll('_', ' ').toLowerCase();
const percentage = (value: number | null | undefined) => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const numberOrDash = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString();

const declaredProviderCapabilities = listProviderCapabilities();
const declaredDecisionCapabilities = listModuleCapabilities().filter((entry) => [
  'src/services/scannerCore.ts',
  'src/services/mlFeatureExtractor.ts',
  'src/services/riskGovernor.ts',
  'src/services/tradePlan.ts',
  'MathEngine.detectStructuralZones',
].includes(entry.module));

const capabilityTone = (label: string) => {
  const normalized = label.toUpperCase();
  if (normalized.includes('LIVE AUTHORITY')) return 'positive';
  if (normalized.includes('DEPRECATED')) return 'negative';
  if (normalized.includes('SHADOW') || normalized.includes('RESEARCH')) return 'warning';
  return 'neutral';
};

export function SystemHealthDrawer({ isOpen, onClose }: SystemHealthDrawerProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useDialogA11y({ isOpen, onClose, initialFocusRef: closeRef });
  const [snapshot, setSnapshot] = useState<OperationsDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const incoming = await fetchOperationsDiagnostics(signal);
    if (signal?.aborted) return;

    const usable = countUsableDiagnostics(incoming);
    const partialError = diagnosticsErrorSummary(incoming);
    if (usable === 0) {
      setError(partialError || 'All operational diagnostics are unavailable.');
    } else {
      setSnapshot((previous) => mergeOperationsDiagnostics(previous, incoming));
      setUpdatedAt(incoming.generatedAt);
      setError(partialError);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), 45_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [isOpen, load]);

  if (!isOpen) return null;

  const report = snapshot?.health.data ?? null;
  const operations = snapshot?.operations.data ?? null;
  const adaptiveResponse = snapshot?.fastAdaptive.data ?? null;
  const recommendation = adaptiveResponse?.recommendation ?? null;
  const adaptiveWindow = selectFastAdaptiveHorizon(recommendation);
  const streaming = snapshot?.streaming.data?.kucoinPublicStreaming ?? null;
  const marketStats = snapshot?.marketStatistics.data ?? null;
  const summary = summarizeOperationsDiagnostics(snapshot);
  const cacheRate = typeof report?.cacheTotalQueries === 'number' && report.cacheTotalQueries > 0 ? report.cacheHitRatePct : null;
  const providerRows = operations?.providers.items ?? [];

  return (
    <div className="apex-ops-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="apex-ops-drawer" role="dialog" aria-modal="true" aria-labelledby="system-health-title">
        <header className="apex-ops-header">
          <div><span>Operations</span><h2 id="system-health-title">System Health</h2><p>Live runtime, provider, adaptive-shadow and streaming diagnostics.</p></div>
          <button ref={closeRef} type="button" aria-label="Close system health" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="apex-ops-toolbar">
          <span>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : 'Not updated yet'}</span>
          <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh all</button>
        </div>

        {loading && !snapshot ? <div className="apex-ops-state"><RefreshCw className="spin" size={22} /><strong>Checking operational services</strong><span>The server is collecting provider, decision-memory, shadow and stream state.</span></div>
          : error && !snapshot ? <div className="apex-ops-state error"><Server size={22} /><strong>Diagnostics unavailable</strong><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>
            : snapshot ? <>
              {error && <div className="apex-ops-inline-warning">Partial refresh issue: {error}. Last-known values remain visible where available.</div>}

              <section className="apex-ops-metric-grid" aria-label="Service status">
                <article><ShieldCheck size={17} /><span>KuCoin</span><strong className={stateTone(report?.kucoinStatus)}>{stateLabel(report?.kucoinStatus)}</strong></article>
                <article><ShieldCheck size={17} /><span>Binance</span><strong className={stateTone(report?.binanceStatus)}>{stateLabel(report?.binanceStatus)}</strong></article>
                <article><Activity size={17} /><span>Operations</span><strong className={operationsTone(summary.serviceStatus)}>{stateLabel(summary.serviceStatus)}</strong></article>
                <article><Server size={17} /><span>Uptime</span><strong>{report ? `${Math.floor(report.uptimeSeconds / 60)} min` : '—'}</strong></article>
              </section>

              <section className="apex-ops-control-grid" aria-label="Operational control plane">
                <article><DatabaseZap size={16} /><span>Providers</span><strong>{numberOrDash(summary.healthyProviders)} / {numberOrDash(summary.configuredProviders)}</strong><small>healthy / configured · {numberOrDash(summary.trackedSymbols)} tracked</small></article>
                <article><Database size={16} /><span>Decision memory</span><strong>{numberOrDash(summary.decisionRows)}</strong><small>{numberOrDash(summary.resolvedDecisions)} resolved</small></article>
                <article><Gauge size={16} /><span>Fast adaptive</span><strong>{summary.adaptiveSource === 'none' ? 'Waiting' : summary.adaptiveSource}</strong><small>{summary.adaptiveSamples} samples · {stateLabel(summary.adaptiveRegime)}</small></article>
                <article><Radio size={16} /><span>Public streaming</span><strong className={streaming?.enabled ? 'positive' : 'warning'}>{streaming ? (streaming.enabled ? 'Enabled' : 'Disabled') : 'Unavailable'}</strong><small>{streaming?.executionDependency ? 'execution-linked' : 'execution-independent'}</small></article>
              </section>

              <section className="apex-ops-panel">
                <h3><Database size={16} /> Runtime counters</h3>
                <dl>
                  <div><dt>Cache hit rate</dt><dd>{cacheRate == null ? 'Unavailable (no queries)' : `${cacheRate.toFixed(1)}%`}</dd></div>
                  <div><dt>Cache queries</dt><dd>{numberOrDash(report?.cacheTotalQueries)}</dd></div>
                  <div><dt>Cache hits</dt><dd>{numberOrDash(report?.cacheHits)}</dd></div>
                  <div><dt>Active candidates</dt><dd>{numberOrDash(report?.activeCandidateCount)}</dd></div>
                  <div><dt>Last scan</dt><dd>{report?.lastScanTimestamp ? new Date(report.lastScanTimestamp).toLocaleString() : 'Unavailable'}</dd></div>
                </dl>
              </section>

              <section className="apex-ops-panel apex-ops-adaptive-panel">
                <div className="apex-ops-section-title">
                  <h3><Gauge size={16} /> Fast adaptive shadow</h3>
                  <span className={`apex-ops-chip ${recommendation?.active ? 'positive' : 'neutral'}`}>{recommendation?.active ? 'Recommendation ready' : 'Observation only'}</span>
                </div>
                {recommendation ? <>
                  <dl>
                    <div><dt>Safety mode</dt><dd>Shadow-only · never auto-applied</dd></div>
                    <div><dt>Source window</dt><dd>{recommendation.sourceHorizon === 'none' ? 'Insufficient samples' : recommendation.sourceHorizon}</dd></div>
                    <div><dt>Sample size</dt><dd>{adaptiveWindow?.sampleSize ?? 0} / {recommendation.minimumSamples} minimum</dd></div>
                    <div><dt>Regime</dt><dd>{stateLabel(adaptiveWindow?.regime)}</dd></div>
                    <div><dt>Acceptance / win rate</dt><dd>{percentage(adaptiveWindow?.acceptanceRate)} / {percentage(adaptiveWindow?.winRate)}</dd></div>
                    <div><dt>Suggested changes</dt><dd>{recommendation.changes.length}</dd></div>
                  </dl>
                  {recommendation.changes.length > 0 ? <ul className="apex-ops-change-list">{recommendation.changes.slice(0, 5).map((change) => <li key={`${change.field}-${change.after}`}><div><strong>{change.field}</strong><span>{change.before.toFixed(4)} → {change.after.toFixed(4)}</span></div><small>{change.reason}</small></li>)}</ul>
                    : <div className="apex-ops-empty compact">No bounded threshold adjustment is recommended from the current 1–5 minute sample.</div>}
                </> : <div className="apex-ops-empty compact">Fast adaptive diagnostics are unavailable.</div>}
              </section>

              <section className="apex-ops-panel apex-ops-stream-panel">
                <div className="apex-ops-section-title">
                  <h3><Radio size={16} /> KuCoin public streaming guardrails</h3>
                  <span className={`apex-ops-chip ${streaming?.enabled ? 'positive' : 'warning'}`}>{streaming ? (streaming.enabled ? 'Opt-in enabled' : 'Default off') : 'Unavailable'}</span>
                </div>
                {streaming ? <dl>
                  <div><dt>Transport mode</dt><dd>{stateLabel(streaming.mode)}</dd></div>
                  <div><dt>Sequence validation</dt><dd className={streaming.sequenceValidation ? 'positive' : 'negative'}>{streaming.sequenceValidation ? 'Required' : 'Disabled'}</dd></div>
                  <div><dt>Gap policy</dt><dd>{stateLabel(streaming.gapPolicy)}</dd></div>
                  <div><dt>Execution dependency</dt><dd className={!streaming.executionDependency ? 'positive' : 'warning'}>{streaming.executionDependency ? 'Yes' : 'No · observability only'}</dd></div>
                </dl> : <div className="apex-ops-empty compact">Streaming policy status is unavailable.</div>}
              </section>

              <section className="apex-ops-panel apex-ops-statistics-panel">
                <div className="apex-ops-section-title">
                  <h3><Activity size={16} /> Online market statistics</h3>
                  <span className="apex-ops-chip neutral">Shadow observability</span>
                </div>
                {marketStats?.rows.length ? <div className="apex-ops-statistics-table" role="table" aria-label="Recent smoothed market statistics">
                  <div className="head" role="row"><span>Symbol</span><span>Smoothed OBI</span><span>Samples</span><span>ATR</span></div>
                  {marketStats.rows.slice(0, 8).map((row) => <div className="row" role="row" key={row.symbol}>
                    <strong>{row.symbol}</strong>
                    <span className={(row.obi?.value ?? 0) < 0 ? 'negative' : (row.obi?.value ?? 0) > 0 ? 'positive' : 'neutral'}>{row.obi?.value == null ? '—' : `${(row.obi.value * 100).toFixed(1)}%`}</span>
                    <span>{row.obi?.samples ?? row.obiDistribution?.samples ?? 0}</span>
                    <span>{row.atr?.value == null ? '—' : row.atr.value.toFixed(4)}</span>
                  </div>)}
                </div> : <div className="apex-ops-empty compact">No symbols have entered the bounded shadow-statistics registry in this server session.</div>}
              </section>

              <section className="apex-ops-panel apex-ops-provider-panel">
                <h3><ShieldCheck size={16} /> Declared capability status</h3>
                <p className="apex-ops-panel-note">Capability labels come from the same fail-closed registries used by routing and governance. Planned and shadow modules are never presented as active authority.</p>
                <ul aria-label="Declared provider capabilities">
                  {declaredProviderCapabilities.map((provider) => <li key={`capability-${provider.id}`}>
                    <strong>{provider.id.toUpperCase()}</strong>
                    <span className={capabilityTone(provider.label)}>{provider.label}</span>
                    <small>{provider.role.toLowerCase().replaceAll('_', ' ')} · {provider.transport.toLowerCase()} · {provider.registered ? `${provider.role === 'REALTIME_EVIDENCE' ? 'evidence categories' : 'categories'}: ${provider.isActive ? 'implemented' : 'unavailable'}` : provider.disabledReason}</small>
                  </li>)}
                </ul>
                <ul aria-label="Declared decision capabilities">
                  {declaredDecisionCapabilities.map((capability) => <li key={`module-${capability.module}`}>
                    <strong>{capability.module.replace('src/services/', '').replace('.ts', '')}</strong>
                    <span className={capabilityTone(capability.label)}>{capability.label}</span>
                    <small>{capability.disabledReason || 'Audited live decision authority.'}</small>
                  </li>)}
                </ul>
              </section>

              <section className="apex-ops-panel apex-ops-provider-panel">
                <h3><ShieldCheck size={16} /> Provider configuration and health</h3>
                <p className="apex-ops-panel-note">Public exchanges use their verified public contracts. Owner-managed HF gateways are built-in fallbacks with contract allowlists. Operator-key providers remain optional until configured.</p>
                {providerRows.length ? <ul>{providerRows.map((provider) => <li key={provider.name}><strong>{provider.name}</strong><span className={operationsTone(provider.status)}>{stateLabel(provider.status)}</span><small>{provider.isConfigured ? provider.category : `operator-key optional · ${stateLabel(provider.reasonCode)}`}{provider.reason ? ` · ${stateLabel(provider.reason)}` : ''}</small></li>)}</ul>
                  : <div className="apex-ops-empty compact">Provider diagnostics are unavailable.</div>}
              </section>

              <section className="apex-ops-panel diagnostics">
                <h3><Activity size={16} /> Diagnostic events</h3>
                {report?.lastErrorLog.length ? <ul>{report.lastErrorLog.map((event, index) => <li key={`${event.timestamp}-${event.source}-${index}`}><time>{new Date(event.timestamp).toLocaleString()}</time><strong>{event.source}</strong><span>{event.message}</span></li>)}</ul>
                  : <div className="apex-ops-empty">No diagnostic events were returned by the server.</div>}
              </section>
            </> : null}
      </div>
    </div>
  );
}
