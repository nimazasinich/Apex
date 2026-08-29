import type { AccountSnapshot, ConnectionState, LiveReconciliationSummary } from '../../services/accountClient';
import { AlertTriangle, Bot } from 'lucide-react';
import type { AutopilotControllerView } from '../../lib/useAutopilotController';
import { useOverviewDiagnostics } from '../../lib/useOverviewDiagnostics';
import type { WorkspaceInsights } from '../../services/workspaceInsights';
import type { TradePlan } from '../../services/tradePlan';
import type { Candle, CandidateScore, ChartFeedStatus, DataState, OrderBookSummary, SentimentComposite, SymbolTicker, TerminalSettings } from '../../types';
import type { AccountViewProps } from './AccountViews';
import type { WorkspacePage } from './WorkspaceShell';
import { OverviewMarketSummary } from '../overview/OverviewMarketSummary';
import { OverviewAccountSummary } from '../overview/OverviewAccountSummary';
import { OverviewStatusCards } from '../overview/OverviewStatusCards';
import { OverviewAttentionPanel } from '../overview/OverviewAttentionPanel';
import { OverviewSignalsPanel } from '../overview/OverviewSignalsPanel';
import { OverviewActivityPanel } from '../overview/OverviewActivityPanel';
import { OverviewProviderHealthPanel } from '../overview/OverviewProviderHealthPanel';
import { OverviewExecutionSnapshotPanel } from '../overview/OverviewExecutionSnapshotPanel';
import { averageOrderFillPct, buildExecutionSnapshot, type ScanMeta } from '../overview/overviewModel';
import type { OperationsDiagnosticsSnapshot } from '../../services/operationsDiagnostics';
import '../overview/OverviewWorkspace.css';

interface MarketViewProps {
  tickers: SymbolTicker[];
  sentiment: SentimentComposite | null;
  longCandidates: CandidateScore[];
  shortCandidates: CandidateScore[];
  dataState: DataState;
  loading: boolean;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onRefresh: () => void;
}

interface OverviewProps extends MarketViewProps {
  connection: ConnectionState;
  settings: TerminalSettings;
  snapshot: AccountSnapshot | null;
  account: AccountViewProps;
  insights: WorkspaceInsights | null;
  reconciliation: LiveReconciliationSummary | null;
  autopilotController: AutopilotControllerView;
  selectedTicker: SymbolTicker | null;
  chartCandles: Candle[];
  chartOrderBook: OrderBookSummary | null;
  chartInterval: string;
  chartFeed: ChartFeedStatus;
  scanMeta: ScanMeta | null;
  onRetryChart: () => void;
  onChartIntervalChange: (interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d') => void;
  tradePlanLong: TradePlan | null;
  tradePlanShort: TradePlan | null;
  onNavigate: (page: WorkspacePage) => void;
}

type StripTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';

function OverviewAutopilotDecisionPanel({
  autopilot,
  onNavigate,
}: {
  autopilot: AutopilotControllerView;
  onNavigate: () => void;
}) {
  const stateTone: StripTone = autopilot.phase === 'FAILED' ? 'danger'
    : autopilot.phase === 'WAITING' ? 'ok'
    : autopilot.phase === 'RESEARCHING' || autopilot.phase === 'VALIDATING' ? 'info'
    : autopilot.transportError ? 'warn' : 'muted';
  const cycle = autopilot.activeCycleIndex == null ? '—' : `N+${autopilot.activeCycleIndex + 1}`;
  const lastDecision = autopilot.phase === 'FAILED' ? 'No trade' : autopilot.phase === 'WAITING' ? 'No trade' : autopilot.phase ?? '—';
  const reason = autopilot.lastError ?? autopilot.phaseText ?? autopilot.transportError ?? '—';
  const error = autopilot.lastError ?? autopilot.transportError;

  return (
    <section className="apex-overview-autopilot apex-panel" aria-labelledby="overview-autopilot-title">
      <header className="apex-overview-section-head">
        <span className="apex-overview-section-num">4</span>
        <h2 id="overview-autopilot-title"><Bot size={14} /> Autopilot Decision Summary</h2>
        <em className={autopilot.enabled ? 'tone-ok' : 'tone-muted'}>{autopilot.enabled ? 'ENABLED' : 'DISABLED'}</em>
      </header>
      <dl className="apex-overview-decision-list">
        <div><dt>State</dt><dd className={`tone-${stateTone}`}>{autopilot.phase ?? (autopilot.transportError ? 'OFFLINE' : 'SYNC…')}</dd></div>
        <div><dt>Current Cycle</dt><dd>{cycle}</dd></div>
        <div><dt>Last Decision</dt><dd>{lastDecision}</dd></div>
        <div><dt>Reason</dt><dd title={reason}>{reason}</dd></div>
      </dl>
      {error ? <p className="apex-overview-panel-error"><AlertTriangle size={12} />{error}</p> : null}
      <footer><button type="button" className="apex-secondary-button" onClick={onNavigate}>View details</button></footer>
    </section>
  );
}

function buildOverviewExecutionView(
  diagnostics: OperationsDiagnosticsSnapshot | null,
  reconciliation: LiveReconciliationSummary | null,
  insights: WorkspaceInsights | null,
) {
  return buildExecutionSnapshot(
    diagnostics?.health?.data ?? null,
    reconciliation,
    diagnostics?.operations?.data?.providers?.items ?? [],
    averageOrderFillPct(insights),
  );
}

export function OverviewView(props: OverviewProps) {
  const candidates = [...props.longCandidates, ...props.shortCandidates];
  const { snapshot: diagnostics, loading: diagnosticsLoading } = useOverviewDiagnostics(true);
  const executionView = buildOverviewExecutionView(diagnostics, props.reconciliation, props.insights);
  const providers = diagnostics?.operations?.data?.providers?.items ?? [];

  return (
    <div className="apex-overview-v2" data-testid="overview-workspace">
      <OverviewStatusCards
        autopilot={props.autopilotController}
        connection={props.connection}
        insights={props.insights}
        chartFeed={props.chartFeed}
        candidates={candidates}
        reconciliation={props.reconciliation}
        diagnostics={diagnostics}
      />
      <div className="apex-overview-upper-grid">
        <OverviewAccountSummary
          connection={props.connection}
          snapshot={props.snapshot}
          insights={props.insights}
          onNavigate={props.onNavigate}
        />
        <OverviewMarketSummary
          ticker={props.selectedTicker}
          tickers={props.tickers}
          selectedSymbol={props.selectedSymbol}
          candles={props.chartCandles}
          feed={props.chartFeed}
          sentiment={props.sentiment}
          onRetry={props.onRetryChart}
          onOpenTrading={() => props.onNavigate('trading')}
          onSelectSymbol={props.onSelectSymbol}
        />
        <div className="apex-overview-upper-right">
          <OverviewSignalsPanel
            candidates={candidates}
            marketState={props.dataState}
            loading={props.loading}
            scanMeta={props.scanMeta}
            onOpenSymbol={(symbol) => { props.onSelectSymbol(symbol); props.onNavigate('trading'); }}
            onNavigateStrategies={() => props.onNavigate('strategies')}
          />
          <OverviewAutopilotDecisionPanel autopilot={props.autopilotController} onNavigate={() => props.onNavigate('strategies')} />
        </div>
      </div>
      <div className="apex-overview-lower-grid">
        <OverviewAttentionPanel
          marketState={props.dataState}
          connection={props.connection}
          snapshot={props.snapshot}
          candidates={candidates}
          onNavigate={props.onNavigate}
        />
        <OverviewActivityPanel snapshot={props.snapshot} connection={props.connection} insights={props.insights} onNavigate={props.onNavigate} />
        <div className="apex-overview-lower-right">
          <OverviewProviderHealthPanel providers={providers} loading={diagnosticsLoading} />
          <OverviewExecutionSnapshotPanel snapshot={executionView} />
        </div>
      </div>
    </div>
  );
}
