import React from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, FileBarChart2, Info, Play, Settings2 } from 'lucide-react';
import { Tabs } from '../../components/ui/WorkspacePrimitives';
import type { BacktestResult, DataState, TradeDirection } from '../../types';
import { BacktestAssumptionsPanel } from './BacktestAssumptionsPanel';
import { BacktestDataQualityPanel } from './BacktestDataQualityPanel';
import { BacktestHistoryPanel } from './BacktestHistoryPanel';
import { BacktestNotesPanel } from './BacktestNotesPanel';
import { BacktestRuntimePanel } from './BacktestRuntimePanel';
import { BacktestTradesPanel } from './BacktestTradesPanel';
import type {
  BacktestEvidenceTab,
  BacktestHistoryEntry,
  BacktestLocalSummary,
  CostAdjustedTrade,
} from './backtestingTypes';
import type { BacktestNote } from './backtestPersistence';

function pct(value: number, digits = 2): string { return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`; }

export function BacktestEvidenceTabs({
  active,
  onChange,
  result,
  routeDataState,
  direction,
  trades,
  summary,
  configuredCosts,
  observedRuntimeMs,
  history,
  historyExpanded,
  onToggleHistory,
  onOpenAllTrades,
  activeRunId,
  activeRunLabel,
  savedNote,
  onSaveNote,
  onClearNote,
  onRun,
  canRun,
  loading,
}: {
  active: BacktestEvidenceTab;
  onChange: (tab: BacktestEvidenceTab) => void;
  result: BacktestResult | null;
  routeDataState: DataState;
  direction: TradeDirection;
  trades: CostAdjustedTrade[];
  summary: BacktestLocalSummary;
  configuredCosts: { commissionPct: number; slippagePct: number; fundingPct: number };
  observedRuntimeMs: number | null;
  history: BacktestHistoryEntry[];
  historyExpanded: boolean;
  onToggleHistory: () => void;
  onOpenAllTrades: () => void;
  activeRunId: string | null;
  activeRunLabel: string;
  savedNote: BacktestNote | undefined;
  onSaveNote: (text: string) => void;
  onClearNote: () => void;
  onRun?: () => void;
  canRun?: boolean;
  loading?: boolean;
}) {
  const noteSaved = Boolean(savedNote?.text?.trim());
  const tabs = [
    { id: 'summary' as const, label: 'Output Overview' },
    { id: 'notes' as const, label: 'Evidence Notes', count: noteSaved ? 1 : undefined, disabled: !activeRunId, disabledReason: 'Run a backtest to attach evidence notes.' },
    { id: 'history' as const, label: 'Run History', count: history.length },
    { id: 'trades' as const, label: 'Trades', count: result?.timeline.length ?? 0 },
    { id: 'costs' as const, label: 'Costs' },
    { id: 'assumptions' as const, label: 'Assumptions' },
    { id: 'data-quality' as const, label: 'Data Quality' },
    { id: 'runtime' as const, label: 'Runtime' },
  ];

  const rejectionRows = Object.entries(result?.rejectionCounts ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const cost = result?.costModel;
  const roundTrip = cost?.roundTripCostPct ?? ((configuredCosts.commissionPct + configuredCosts.slippagePct) * 2 + configuredCosts.fundingPct);

  return (
    <section className="apex-bt-evidence-tabs" aria-label="Backtest evidence">
      <Tabs label="Backtest evidence" tabs={tabs} active={active} onChange={onChange}>
        {active === 'summary' && (
          result ? (
            <div className="apex-bt-evidence-summary">
              <section className="apex-bt-evidence-block">
                <header><span><CheckCircle2 size={14} />Run Summary</span><small>Exact server result plus clearly labelled local display values</small></header>
                <dl>
                  <div><dt>Accepted candidates</dt><dd>{result.acceptedCandidates}</dd></div>
                  <div><dt>Rejected candidates</dt><dd>{result.rejectedCandidates}</dd></div>
                  <div><dt>Flagged signals</dt><dd>{result.flaggedSignals}</dd></div>
                  <div><dt>Closed trades</dt><dd>{result.timeline.length}</dd></div>
                  <div><dt>Server total P&amp;L</dt><dd className={result.totalPnlPct >= 0 ? 'positive' : 'negative'}>{pct(result.totalPnlPct)}</dd></div>
                  <div><dt>Local capital result</dt><dd className={summary.netReturnPct >= 0 ? 'positive' : 'negative'}>{pct(summary.netReturnPct)}</dd></div>
                </dl>
                {result.diagnostics?.noTradeReason && <p><AlertTriangle size={12} />{result.diagnostics.noTradeReason}</p>}
              </section>

              <section className="apex-bt-evidence-block">
                <header><span><AlertTriangle size={14} />Rejection Evidence</span><small>Top server reason codes</small></header>
                {rejectionRows.length ? <ol className="apex-bt-rejection-list">
                  {rejectionRows.map(([reason, count]) => <li key={reason}><span>{reason.replaceAll('_', ' ')}</span><b>{count}</b></li>)}
                </ol> : <p><Info size={12} />No rejection reason counts are available for this result.</p>}
                {result.configOverrides?.length ? <div className="apex-bt-config-overrides">
                  <strong>Effective configuration overrides</strong>
                  {result.configOverrides.map((override) => <div key={`${override.field}-${override.reason}`}><span>{override.field}</span><code>{String(override.configured)} → {String(override.effective)}</code><small>{override.reason}</small></div>)}
                </div> : null}
              </section>

              <BacktestTradesPanel trades={trades} direction={result.direction ?? direction} compact onOpenAll={onOpenAllTrades} />
            </div>
          ) : (
            <section className="apex-bt-pre-result-overview" aria-live="polite">
              <div className="apex-bt-pre-result-main">
                <FileBarChart2 size={34} aria-hidden="true" />
                <span><strong>No results yet</strong><small>Run a backtest to generate server-verified output files, charts, trades and performance metrics.</small></span>
              </div>
              <div className="apex-bt-pre-result-next">
                <span><strong>Next step</strong><small>Start the replay. If robust optimization found no eligible candidate, the engine will report that honestly instead of forcing a positive result.</small></span>
                {onRun && <button type="button" onClick={onRun} disabled={loading || canRun === false}><Play size={13} fill="currentColor" aria-hidden="true" />{loading ? 'Running…' : 'Run Backtest'}</button>}
              </div>
            </section>
          )
        )}

        {active === 'notes' && (
          <BacktestNotesPanel runId={activeRunId} savedNote={savedNote} runLabel={activeRunLabel} onSave={onSaveNote} onClear={onClearNote} />
        )}

        {active === 'trades' && <BacktestTradesPanel trades={trades} direction={result?.direction ?? direction} />}

        {active === 'costs' && (
          <section className="apex-bt-evidence-block">
            <header><span><CircleDollarSign size={14} />Cost Evidence</span><small>{cost?.appliedByEngine ? 'Applied by replay engine' : 'Configured for next run'}</small></header>
            <dl>
              <div><dt>Commission / side</dt><dd>{(cost?.commissionPctPerSide ?? configuredCosts.commissionPct).toFixed(3)}%</dd></div>
              <div><dt>Slippage / side</dt><dd>{(cost?.slippagePctPerSide ?? configuredCosts.slippagePct).toFixed(3)}%</dd></div>
              <div><dt>Funding estimate</dt><dd>{(cost?.fundingPctEstimate ?? configuredCosts.fundingPct).toFixed(3)}%</dd></div>
              <div><dt>Round-trip model</dt><dd>{roundTrip.toFixed(3)}%</dd></div>
              <div><dt>Applied by engine</dt><dd>{cost ? (cost.appliedByEngine ? 'Yes' : 'No') : 'Pending run'}</dd></div>
              <div><dt>Market impact</dt><dd>Not supplied</dd></div>
            </dl>
            <p><Info size={12} />No spread, queue-position, partial-fill, or market-impact claim is made unless the result contract supplies it.</p>
          </section>
        )}

        {active === 'assumptions' && <BacktestAssumptionsPanel result={result} configured={configuredCosts} />}
        {active === 'data-quality' && <BacktestDataQualityPanel result={result} routeState={routeDataState} />}
        {active === 'runtime' && <BacktestRuntimePanel result={result} observedTotalMs={observedRuntimeMs} />}
        {active === 'history' && <BacktestHistoryPanel entries={history} expanded={historyExpanded} onToggle={onToggleHistory} />}
      </Tabs>

      {!result && active !== 'summary' && active !== 'history' && active !== 'notes' && (
        <div className="apex-bt-evidence-unavailable"><Settings2 size={16} /><span>Run evidence will appear here after the server returns a result. No placeholder metrics are generated.</span></div>
      )}
    </section>
  );
}
