import type { AccountSnapshot, ConnectionState, LiveReconciliationSummary } from '../../services/accountClient';
import { AlertTriangle, Info } from 'lucide-react';
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
import autopilotBeaconUrl from '../../assets/overview-autopilot-beacon.svg';
import '../overview/OverviewWorkspace.css';
import '../overview/OverviewMockupCompletion.css';

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
  marketProvider: string | null;
  marketObservedAt: number | null;
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
  const isRunning = Boolean(autopilot?.enabled);
  const ap = autopilot as any;
  const cycleText = ap?.cycleCount ? `#${ap.cycleCount}` : (isRunning ? 'Cycle 1' : 'Standby');
  const decisionText = ap?.lastDecision || 'No trade';
  const reasonText = ap?.reason || 'Evaluation window active';

  return (
    <section className="apex-overview-autopilot apex-panel" aria-labelledby="overview-autopilot-title">
      <header className="apex-overview-section-head">
        <div className="section-head-left">
          <span className="apex-overview-section-num" aria-hidden="true">4</span>
          <h2 id="overview-autopilot-title">AUTOPILOT DECISION SUMMARY</h2>
        </div>
        <span className="autopilot-stage-badge" style={{ fontSize: '7.5px', fontWeight: 500, padding: '1px 5px', borderRadius: '3px', background: isRunning ? '#ecfdf5' : '#eff6ff', color: isRunning ? '#059669' : '#2563eb', border: '1px solid #f1f5f9' }}>
          {isRunning ? 'RUNNING' : 'WAITING'}
        </span>
      </header>
      <div className="apex-overview-autopilot-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <div className="decision-kv-grid" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', fontSize: '8px', flex: 1 }}>
          <span className="kv-key" style={{ color: '#64748b', fontWeight: 500 }}>Current Cycle</span>
          <span className="kv-val" style={{ color: '#1e293b', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{cycleText}</span>

          <span className="kv-key" style={{ color: '#64748b', fontWeight: 500 }}>Last Decision</span>
          <span className="kv-val" style={{ color: '#1e293b', fontWeight: 500 }}>{decisionText}</span>

          <span className="kv-key" style={{ color: '#64748b', fontWeight: 500 }}>Status</span>
          <span className="kv-val" style={{ color: '#059669', fontWeight: 500 }}>Guarded</span>

          <span className="kv-key" style={{ color: '#64748b', fontWeight: 500 }}>Reason</span>
          <span className="kv-val purple-text" style={{ color: '#7c3aed', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reasonText}</span>

          <span className="kv-key" style={{ color: '#64748b', fontWeight: 500 }}>Opened</span>
          <span className="kv-val" style={{ color: '#64748b', fontWeight: 500 }}>0 positions</span>

          <span className="kv-key" style={{ color: '#64748b', fontWeight: 500 }}>Evidence</span>
          <span className="kv-val" style={{ color: '#64748b', fontWeight: 500 }}>neutral bias (0.00)</span>
        </div>
        <div className="autopilot-crystal-visual" style={{ width: '40px', height: '40px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={autopilotBeaconUrl} alt="Decision crystal" className="crystal-img" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
        </div>
      </div>
      <div className="autopilot-card-footer" style={{ marginTop: 'auto', paddingTop: '1px' }}>
        <button type="button" className="btn-view-details" onClick={onNavigate} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '8px', fontWeight: 500, cursor: 'pointer', padding: 0 }}>
          VIEW DETAILS →
        </button>
      </div>
    </section>
  );
}

function buildOverviewExecutionView(
  diagnostics: OperationsDiagnosticsSnapshot | null,
  reconciliation: LiveReconciliationSummary | null,
  insights: WorkspaceInsights | null,
) {
  return buildExecutionSnapshot(
    diagnostics?.health.data ?? null,
    reconciliation,
    diagnostics?.operations.data?.providers.items ?? [],
    averageOrderFillPct(insights),
  );
}

export function OverviewView(props: OverviewProps) {
  const candidates = [...props.longCandidates, ...props.shortCandidates];
  const { snapshot: diagnostics, loading: diagnosticsLoading } = useOverviewDiagnostics(true);
  const executionView = buildOverviewExecutionView(diagnostics, props.reconciliation, props.insights);
  const providers = diagnostics?.operations.data?.providers.items ?? [];

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
          insights={props.insights}
          reconciliation={props.reconciliation}
          chartFeed={props.chartFeed}
          onNavigate={props.onNavigate}
        />
        <OverviewActivityPanel snapshot={props.snapshot} connection={props.connection} insights={props.insights} onNavigate={props.onNavigate} />
        <OverviewProviderHealthPanel
          providers={providers}
          health={diagnostics?.health.data ?? null}
          loading={diagnosticsLoading}
          healthError={diagnostics?.health.error ?? null}
          operationsError={diagnostics?.operations.error ?? null}
          activeMarketSource={props.marketProvider}
          marketDataState={props.dataState}
          marketObservedAt={props.marketObservedAt}
          onNavigate={props.onNavigate}
        />
        <OverviewExecutionSnapshotPanel snapshot={executionView} />
      </div>
    </div>
  );
}
