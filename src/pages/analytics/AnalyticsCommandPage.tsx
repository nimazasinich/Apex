import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CircleAlert,
  Clock3,
  Database,
  Grid3X3,
  Info,
  ShieldCheck,
  Zap,
  X,
} from 'lucide-react';
import { MiniSparkline } from '../../components/MiniSparkline';
import type { AccountWorkspaceProps, MarketWorkspaceProps } from '../pageTypes';
import type { CandidateScore, DataState } from '../../types';
import { buildMarketBreadth } from '../../components/overview/overviewModel';
import { CorrelationMatrix } from './components/CorrelationMatrix';
import { useDialogA11y } from '../../lib/useDialogA11y';
import { useOverviewDiagnostics } from '../../lib/useOverviewDiagnostics';
import { fetchJsonWithTimeout } from '../../services/apiQuery';
import './AnalyticsPage.css';

interface AnalyticsPageProps {
  account: AccountWorkspaceProps;
  market: MarketWorkspaceProps;
}

type StrategyEvidenceRow = {
  strategyId: string;
  name: string;
  status: string;
  supportedIntervals?: string[];
  latestSnapshot?: {
    score?: number;
    winRatePct?: number;
    netReturnPct?: number;
    maxDrawdownPct?: number;
    profitFactor?: number;
    sampleSize?: number;
    lastBacktestAt?: number;
    fullStrategyValidated?: boolean;
  };
};

type AutopilotRuntime = {
  controller?: {
    phase?: string;
    activeCycleIndex?: number | null;
    lastError?: string | null;
  };
  scheduler?: { enabled?: boolean };
  latestCycle?: Record<string, unknown> | null;
};

type ProviderDisplayRow = {
  name: string;
  status: string;
  latency: string;
  lastUpdate: string;
  fallback: string;
  schema: string;
};

const compactMoney = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const compactNumber = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value)
  ? '—'
  : value.toLocaleString('en-US', { maximumFractionDigits: digits });
const pct = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`;
const latencyLabel = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${Math.max(0, Math.round(value))}ms`;

function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function ageLabel(timestamp: number | null | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) return '—';
  const ms = Math.max(0, Date.now() - timestamp);
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function dataStateLabel(state: DataState | undefined): string {
  if (state === 'live') return 'OK';
  if (state === 'degraded') return 'DEGRADED';
  if (state === 'not_configured') return 'NOT SET';
  return 'UNAVAILABLE';
}

function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return <header className="analytics-section-head"><h2>{title}</h2><Info size={13} />{action && <span>{action}</span>}</header>;
}

function MiniMetric({ label, value, detail, tone = 'neutral', values }: { label: string; value: string; detail?: string; tone?: 'positive' | 'negative' | 'neutral' | 'warning'; values?: number[] }) {
  return <div className="analytics-mini-metric"><span>{label}</span><strong className={tone}>{value}</strong>{detail && <small className={tone}>{detail}</small>}{values?.length ? <MiniSparkline values={values} tone={tone === 'negative' ? 'negative' : 'positive'} /> : null}</div>;
}

function candidateRejections(candidates: CandidateScore[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  candidates.forEach((candidate) => {
    if (candidate.guardPass && candidate.readinessTier !== 'BLOCKED') return;
    const reason = candidate.guardReasons[0] || candidate.canonicalDecision?.reasonText || 'Risk blocked';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  });
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return ranked.length ? ranked.slice(0, 5) : [
    ['Insufficient forward evidence', 0],
    ['Low confluence', 0],
    ['Stale provider data', 0],
    ['Risk blocked', 0],
    ['Direction unavailable', 0],
  ];
}

function computePeakDrawdownPct(equity: number | null, totalPnl: number | null, cumulative: Array<{ value: number }>): number | null {
  if (equity == null || totalPnl == null || !Number.isFinite(equity) || equity <= 0 || cumulative.length < 2) return null;
  const baseEquity = equity - totalPnl;
  let peak = baseEquity + cumulative[0].value;
  let maxDrawdown = 0;
  for (const row of cumulative) {
    const curve = baseEquity + row.value;
    peak = Math.max(peak, curve);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - curve) / peak * 100);
  }
  return maxDrawdown;
}

export function AnalyticsPage({ account, market }: AnalyticsPageProps) {
  const [correlationOpen, setCorrelationOpen] = useState(false);
  const [strategyEvidence, setStrategyEvidence] = useState<StrategyEvidenceRow[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotRuntime | null>(null);
  const correlationCloseRef = useRef<HTMLButtonElement>(null);
  const closeCorrelation = useCallback(() => setCorrelationOpen(false), []);
  const correlationDialogRef = useDialogA11y<HTMLElement>({ isOpen: correlationOpen, onClose: closeCorrelation, initialFocusRef: correlationCloseRef });
  const { snapshot: diagnostics, loading: diagnosticsLoading } = useOverviewDiagnostics(true);

  useEffect(() => {
    const controller = new AbortController();
    const read = (url: string) => fetchJsonWithTimeout<any>(url, { signal: controller.signal, timeoutMs: 12_000 });
    void Promise.allSettled([read('/api/strategies'), read('/api/strategies/autopilot/status')]).then((results) => {
      if (controller.signal.aborted) return;
      const [strategiesResult, autopilotResult] = results;
      if (strategiesResult.status === 'fulfilled') {
        setStrategyEvidence(Array.isArray(strategiesResult.value?.strategies) ? strategiesResult.value.strategies : []);
      }
      if (autopilotResult.status === 'fulfilled') setAutopilot(autopilotResult.value as AutopilotRuntime);
    });
    return () => controller.abort();
  }, []);

  const candidates = useMemo(() => [...market.longCandidates, ...market.shortCandidates].sort((a, b) => b.score - a.score), [market.longCandidates, market.shortCandidates]);
  const selected = market.tickers.find((ticker) => ticker.symbol === market.selectedSymbol) ?? market.tickers[0] ?? null;
  const breadth = buildMarketBreadth(market.tickers);
  const qualified = candidates.filter((candidate) => candidate.decisionState === 'QUALIFIED_SETUP' || (candidate.guardPass && candidate.readinessTier !== 'BLOCKED'));
  const confirmed = candidates.filter((candidate) => candidate.decisionState === 'SIGNAL' || (candidate.guardPass && candidate.readinessTier === 'CONFIRMED'));
  const promoted = candidates.filter((candidate) => candidate.canonicalDecision?.parliamentMode === 'PAPER_PROMOTED' || candidate.canonicalDecision?.parliamentMode === 'SIGNAL_PROMOTED');
  const rejected = candidates.filter((candidate) => candidate.decisionState === 'REJECTED' || !candidate.guardPass || candidate.readinessTier === 'BLOCKED');
  const averageSignal = candidates.length ? candidates.reduce((sum, candidate) => sum + candidate.score, 0) / candidates.length : null;
  const rejectionRows = candidateRejections(candidates);
  const maxRejections = Math.max(1, ...rejectionRows.map(([, count]) => Number(count)));
  const totalRejections = rejectionRows.reduce((sum, [, count]) => sum + Number(count), 0);
  const rejectionRate = candidates.length ? rejected.length / candidates.length * 100 : null;
  const equity = account.insights?.account.equityUsd ?? null;
  const totalPnl = account.insights?.analytics.totalPnlUsd ?? null;
  const unrealizedPnl = account.insights?.analytics.unrealizedPnlUsd ?? null;
  const riskScore = account.insights?.account.riskScore ?? null;
  const riskLabel = account.insights?.account.riskLabel ?? null;
  const observedFillRates = account.insights?.orders
    .map((order) => order.fillPct)
    .filter((value): value is number => value != null && Number.isFinite(value)) ?? [];
  const fillRate = observedFillRates.length
    ? observedFillRates.reduce((sum, value) => sum + value, 0) / observedFillRates.length
    : null;
  const rejectedOrders = account.insights?.orders.filter((order) => order.status === 'rejected').length ?? 0;
  const cancelledOrders = account.insights?.orders.filter((order) => order.status === 'cancelled').length ?? 0;
  const candleSpark = (market.candles || []).slice(-90).map((candle) => candle.close).filter((value) => Number.isFinite(value));
  const spark = candleSpark.length > 2 ? candleSpark : selected?.sparkline1h?.length ? selected.sparkline1h : [];
  const marketTone = (selected?.priceChange24hPct ?? 0) >= 0 ? 'positive' : 'negative';
  const regimeDirection = breadth.bullishPct >= breadth.bearishPct ? 'bullish' : 'bearish';
  const chartState = market.chartFeed?.dataState ?? market.dataState;
  const chartAge = market.chartFeed?.ageMs ?? null;
  const dailyRealized = account.insights?.activities
    .filter((item) => item.timestamp != null && item.timestamp >= Date.now() - 86_400_000 && item.realizedPnlUsd != null)
    .reduce((sum, item) => sum + Number(item.realizedPnlUsd || 0), 0) ?? null;
  const peakDrawdownPct = computePeakDrawdownPct(equity, totalPnl, account.insights?.analytics.cumulativePnl || []);
  const observedExposureValues = account.insights?.positions.map((position) => position.valueUsd) ?? [];
  const exposure = account.insights && observedExposureValues.every((value): value is number => value != null && Number.isFinite(value))
    ? observedExposureValues.reduce((sum, value) => sum + Math.abs(value), 0)
    : null;
  const marginUsed = account.insights?.account.marginUsedUsd ?? null;

  const lifecycleCandidate = candidates.find((candidate) => candidate.signalLifecycle) ?? candidates[0] ?? null;
  const lifecycle = lifecycleCandidate?.signalLifecycle;
  const lifecycleElapsed = lifecycle ? Math.max(0, lifecycle.updatedAt - lifecycle.bornAt) : null;
  const lifecycleRemaining = lifecycle ? Math.max(0, lifecycle.maxLifetimeMs - (Date.now() - lifecycle.bornAt)) : null;
  const lifecycleDecision = lifecycleCandidate?.canonicalDecision?.reasonText || lifecycleCandidate?.guardReasons[0] || 'No active decision evidence';
  const autopilotPhase = String(autopilot?.controller?.phase || (autopilot ? 'OFF' : 'SYNCING'));

  const operationsProviders = diagnostics?.operations.data?.providers.items ?? [];
  const systemHealth = diagnostics?.health.data ?? null;
  const pickProvider = (needles: string[]) => operationsProviders.find((row) => needles.some((needle) => row.name.toLowerCase().includes(needle)));
  const providerFromOps = (name: string, needles: string[]): ProviderDisplayRow => {
    const row = pickProvider(needles);
    if (!row) return { name, status: diagnosticsLoading ? 'CHECKING' : 'NOT SET', latency: '—', lastUpdate: '—', fallback: '—', schema: '—' };
    const status = !row.isConfigured ? 'NOT SET' : row.isHealthy ? 'OK' : row.status === 'RATE_LIMITED' ? 'DELAYED' : 'DEGRADED';
    return {
      name,
      status,
      latency: '—',
      lastUpdate: ageLabel(row.lastCheckTime),
      fallback: row.isConfigured && !row.isHealthy ? 'Yes' : 'No',
      schema: row.isHealthy ? 'OK' : row.isConfigured ? 'CHECK' : '—',
    };
  };
  const providerRows: ProviderDisplayRow[] = [
    { name: 'Binance', status: dataStateLabel(systemHealth?.binanceStatus), latency: latencyLabel(systemHealth?.binanceLatencyMs), lastUpdate: systemHealth ? ageLabel(diagnostics?.generatedAt) : '—', fallback: !systemHealth ? '—' : systemHealth.binanceStatus === 'live' ? 'No' : 'Yes', schema: !systemHealth ? '—' : systemHealth.binanceStatus === 'live' ? 'OK' : 'CHECK' },
    { name: 'KuCoin', status: dataStateLabel(systemHealth?.kucoinStatus), latency: latencyLabel(systemHealth?.kucoinLatencyMs), lastUpdate: systemHealth ? ageLabel(diagnostics?.generatedAt) : '—', fallback: !systemHealth ? '—' : systemHealth.kucoinStatus === 'live' ? 'No' : 'Yes', schema: !systemHealth ? '—' : systemHealth.kucoinStatus === 'live' ? 'OK' : 'CHECK' },
    providerFromOps('HF Space4', ['space-4', 'space4', 'huggingface']),
    providerFromOps('HF Space2', ['space-2', 'space2']),
    providerFromOps('CMC fallback', ['coinmarketcap', 'coin market cap', 'cmc']),
    providerFromOps('News API', ['newsapi', 'news api', 'newsdata']),
    { name: 'Sentiment', status: dataStateLabel(systemHealth?.sentimentStatus), latency: '—', lastUpdate: systemHealth ? ageLabel(diagnostics?.generatedAt) : '—', fallback: !systemHealth ? '—' : systemHealth.sentimentStatus === 'live' ? 'No' : 'Yes', schema: !systemHealth ? '—' : systemHealth.sentimentStatus === 'live' ? 'OK' : 'CHECK' },
    providerFromOps('On-chain / Whale', ['etherscan', 'tronscan', 'bscscan', 'onchain', 'whale']),
  ];

  const configuredUnhealthy = diagnostics?.operations.data?.providers.summary.configuredUnhealthyProviders ?? 0;
  const alerts = [
    { tone: rejected.length ? 'danger' : 'info', title: rejected.length ? 'High rejection rate' : 'Signal pipeline stable', detail: rejected.length ? `${pct(rejectionRate, 1)} rejected in current evaluation set` : 'No blocked candidates', age: 'now' },
    { tone: market.dataState === 'live' ? 'info' : 'warning', title: market.dataState === 'live' ? 'Provider observation' : 'Provider degraded', detail: market.dataState === 'live' ? 'Market stream is current' : market.dataState.replace('_', ' '), age: ageLabel(diagnostics?.generatedAt) },
    { tone: account.error ? 'warning' : 'info', title: account.error ? 'Account data warning' : 'Account snapshot received', detail: account.error || account.connection.mode, age: account.insights?.generatedAt ? ageLabel(Date.parse(account.insights.generatedAt)) : '—' },
    { tone: chartState === 'live' ? 'info' : 'warning', title: chartState === 'live' ? 'Data freshness healthy' : 'Stale data warning', detail: chartState === 'live' ? 'Selected market candles are current' : `${chartState}${chartAge != null ? ` · age ${duration(chartAge)}` : ''}`, age: chartAge == null ? '—' : duration(chartAge) },
    { tone: configuredUnhealthy > 0 ? 'warning' : 'info', title: configuredUnhealthy > 0 ? 'Supplemental provider warning' : 'Supplemental providers stable', detail: configuredUnhealthy > 0 ? `${configuredUnhealthy} configured provider${configuredUnhealthy === 1 ? '' : 's'} unhealthy` : 'No configured supplemental failure reported', age: ageLabel(diagnostics?.generatedAt) },
    { tone: confirmed.length ? 'info' : 'info', title: confirmed.length ? 'Qualified setup requires review' : 'No immediate action required', detail: confirmed.length ? `${confirmed.length} confirmed candidate${confirmed.length === 1 ? '' : 's'} · manual gate remains` : 'Monitoring', age: 'now' },
  ];

  const strategyRows = useMemo(() => [...strategyEvidence]
    .filter((strategy) => strategy.latestSnapshot)
    .sort((left, right) => (right.latestSnapshot?.score ?? Number.NEGATIVE_INFINITY) - (left.latestSnapshot?.score ?? Number.NEGATIVE_INFINITY))
    .slice(0, 5), [strategyEvidence]);



  return (
    <div className="analytics-command-page" data-testid="analytics-workspace">
      <section className="analytics-status-strip">
        <div className={`analytics-regime-card is-${regimeDirection}`}><span className={`analytics-trend-icon is-${regimeDirection}`} aria-hidden="true"><img src={regimeDirection === 'bullish' ? '/analytics/trend-bullish.png' : '/analytics/trend-bearish.png'} alt="" /></span><span><small>Market Regime</small><strong className={regimeDirection === 'bullish' ? 'positive' : 'negative'}>{regimeDirection === 'bullish' ? 'Bullish' : 'Bearish'}</strong><em>Trend: {Math.abs(breadth.bullishPct - breadth.bearishPct) > 30 ? 'Strong' : 'Balanced'}</em></span></div>
        <div><Zap /><span><small title="Composite scores are not calibrated win probabilities.">Signal Quality</small><strong>{averageSignal == null ? '—' : `${averageSignal.toFixed(0)} / 100`}</strong><em className="positive">{averageSignal != null && averageSignal >= 65 ? 'Good' : 'Monitoring'}</em></span></div>
        <div><Clock3 /><span><small>Autopilot State</small><strong className={autopilotPhase === 'WAITING' ? 'warning' : autopilotPhase === 'FAILED' ? 'negative' : ''}>{autopilotPhase}</strong><em>Scheduler: {autopilot?.scheduler?.enabled ? 'ON' : 'OFF'}</em></span></div>
        <div><ShieldCheck /><span><small>Risk State</small><strong className={riskLabel === 'High' ? 'negative' : riskLabel === 'Medium' ? 'warning' : riskLabel === 'Low' ? 'positive' : ''}>{riskLabel ?? 'Unavailable'}</strong><em>{riskScore == null ? 'No risk score' : `Score ${riskScore}/100`}</em></span></div>
        <div><Zap /><span><small>Execution Health</small><strong className={rejectedOrders ? 'warning' : 'positive'}>{fillRate == null ? '—' : pct(fillRate, 0)}</strong><em>{rejectedOrders ? `${rejectedOrders} rejected` : fillRate == null ? 'Not instrumented' : 'Good'}</em></span></div>
        <div><Database /><span><small>Data Freshness</small><strong className={chartState === 'live' ? 'positive' : 'warning'}>{chartState === 'live' ? 'Live' : chartState === 'degraded' ? 'Delayed' : 'Unavailable'}</strong><em>{chartState === 'live' ? 'Selected chart feed current' : chartAge != null ? `Age ${duration(chartAge)}` : 'Partial provider state'}</em></span></div>
      </section>

      <div className="analytics-command-grid">
        <main>
          <div className="analytics-primary-row">
            <section className="analytics-market-panel analytics-card">
              <SectionHead title="Market Analytics" action={<button type="button" onClick={() => setCorrelationOpen(true)}><Grid3X3 size={13} /> Correlation</button>} />
              <div className="analytics-market-focus">
                <div className="analytics-market-plot">
                  <header><strong>{selected?.symbol ?? 'No market selected'}</strong><b>{compactNumber(selected?.lastPrice)}</b><em className={marketTone}>{selected ? `${selected.priceChange24hPct >= 0 ? '+' : ''}${pct(selected.priceChange24hPct, 2)}` : '—'}</em></header>
                  <div>{spark.length ? <MiniSparkline values={spark} tone={marketTone === 'negative' ? 'negative' : 'positive'} /> : <span className="analytics-empty-plot">Verified market history is unavailable.</span>}</div>
                  <footer><span>12:00</span><span>16:00</span><span>20:00</span><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span></footer>
                </div>
                <dl>
                  <div><dt>Trend</dt><dd className={marketTone}>{marketTone === 'positive' ? 'Bullish' : 'Bearish'}</dd></div>
                  <div><dt>24h Absolute Price Change</dt><dd>{selected ? pct(Math.abs(selected.priceChange24hPct), 2) : '—'}</dd></div>
                  <div><dt>24h Turnover</dt><dd>{selected ? compactMoney(selected.turnover24h) : '—'}</dd></div>
                  <div><dt>Funding Bias</dt><dd className={selected && selected.fundingRate >= 0 ? 'positive' : 'negative'}>{selected ? pct(selected.fundingRate * 100, 3) : '—'}</dd></div>
                  <div><dt>Open Interest</dt><dd>{selected && Number.isFinite(selected.openInterest) ? compactMoney(selected.openInterest) : '—'}</dd></div>
                  <div><dt>Market Breadth</dt><dd className="positive">{breadth.bullishPct}%</dd></div>
                </dl>
              </div>
            </section>

            <section className="analytics-signal-panel analytics-card">
              <SectionHead title="Signal Analytics" />
              <h3>Signal Funnel (current evaluation set)</h3>
              <div className="analytics-funnel">
                <div><span>Evaluated</span><strong>{candidates.length}</strong></div><div><span>Qualified</span><strong>{qualified.length}</strong></div><div><span>Confirmed</span><strong>{confirmed.length}</strong></div><div className="promoted"><span>Promoted</span><strong>{promoted.length}</strong></div><div className="rejected"><span>Rejected</span><strong>{rejected.length}</strong></div>
              </div>
              <h3>Rejection Reasons (current evaluation set)</h3>
              <div className="analytics-rejections">
                <div>{rejectionRows.map(([reason, count]) => <p key={reason}><span title={reason}>{reason}</span><i><b style={{ width: `${Number(count) / maxRejections * 100}%` }} /></i><em>{count} {totalRejections ? `(${(Number(count) / totalRejections * 100).toFixed(1)}%)` : ''}</em></p>)}</div>
                <aside><span>Total Rejection Rate <strong className="negative">{pct(rejectionRate, 1)}</strong></span><span>vs 7D Avg <strong>—</strong></span></aside>
              </div>
            </section>
          </div>

          <div className="analytics-secondary-row">
            <section className="analytics-lifecycle analytics-card">
              <SectionHead title="Autopilot Lifecycle" />
              <div className="analytics-lifecycle-track"><span className={lifecycle ? 'active' : ''}>Candidate</span><span className={lifecycle?.state === 'CONFIRMED' || lifecycle?.state === 'ACTIVE' ? 'active' : ''}>Confirmed</span><span className={lifecycle?.state === 'ACTIVE' ? 'active' : ''}>Active</span><span className={lifecycle?.state === 'INVALIDATED' || lifecycle?.state === 'EXPIRED' ? 'active' : ''}>Invalidated / Expired</span></div>
              <div className="analytics-lifecycle-details"><dl><div><dt>Cycle</dt><dd>{autopilot?.controller?.activeCycleIndex == null ? '—' : `N+${autopilot.controller.activeCycleIndex + 1}`}</dd></div><div><dt>Trigger</dt><dd>{lifecycleCandidate?.shadowDecision?.engineVersion || '—'}</dd></div><div><dt>Opened</dt><dd>{lifecycle?.state === 'ACTIVE' ? 1 : 0}</dd></div></dl><dl><div><dt>Evidence</dt><dd className="link">{lifecycleCandidate?.canonicalDecision?.authority || lifecycleCandidate?.shadowDecision?.reasonCode || '—'}</dd></div><div><dt>Decision</dt><dd className={lifecycleCandidate?.guardPass ? 'positive' : 'negative'} title={lifecycleDecision}>{lifecycleDecision}</dd></div></dl><dl><div><dt>Elapsed</dt><dd>{duration(lifecycleElapsed)}</dd></div><div><dt>Event Age</dt><dd>{lifecycle ? ageLabel(lifecycle.updatedAt) : '—'}</dd></div><div><dt>Next Review</dt><dd>{duration(lifecycleRemaining)}</dd></div></dl></div>
            </section>
            <section className="analytics-risk analytics-card">
              <SectionHead title="Risk Analytics" />
              <div className="analytics-risk-grid"><MiniMetric label="Account Equity" value={compactMoney(equity)} detail={totalPnl == null || equity == null ? undefined : `${totalPnl >= 0 ? '+' : ''}${pct(totalPnl / Math.max(1, equity - totalPnl) * 100, 2)}`} tone={totalPnl != null && totalPnl < 0 ? 'negative' : 'positive'} /><MiniMetric label="Daily P&L" value={compactMoney(dailyRealized)} detail="Realized last 24h" tone={dailyRealized != null && dailyRealized < 0 ? 'negative' : dailyRealized != null && dailyRealized > 0 ? 'positive' : 'neutral'} /><MiniMetric label="Drawdown (Peak)" value={peakDrawdownPct == null ? '—' : `-${peakDrawdownPct.toFixed(2)}%`} detail={peakDrawdownPct == null ? 'Insufficient account history' : peakDrawdownPct < 5 ? 'Good' : 'Monitor'} tone={peakDrawdownPct != null && peakDrawdownPct > 10 ? 'warning' : 'positive'} /><MiniMetric label="Margin Utilization" value={pct(account.insights?.account.marginRatioPct, 0)} detail="Used margin / equity" tone={account.insights?.account.marginRatioPct != null && account.insights.account.marginRatioPct >= 70 ? 'warning' : 'positive'} /><MiniMetric label="Exposure" value={compactMoney(exposure)} detail={equity && exposure != null ? `${pct(exposure / Math.max(1, equity) * 100, 1)} of equity` : undefined} /><MiniMetric label="Margin Used" value={compactMoney(marginUsed)} detail={equity && marginUsed != null ? `${pct(marginUsed / Math.max(1, equity) * 100, 1)} of equity` : undefined} /><div className="analytics-kill-switch"><span>Risk Guard State</span><strong className={riskLabel === 'High' ? 'negative' : riskLabel === 'Medium' ? 'warning' : riskLabel === 'Low' ? 'positive' : ''}><i /> {riskLabel ? riskLabel.toUpperCase() : 'UNAVAILABLE'}</strong><small>{riskScore == null ? 'No risk score' : `Score ${riskScore}/100`}</small></div></div>
            </section>
          </div>

          <section className="analytics-execution analytics-card">
            <SectionHead title="Execution Analytics" />
            <div><MiniMetric label="Avg Latency" value="—" detail="Not instrumented" /><MiniMetric label="Fill Rate" value={pct(fillRate, 2)} detail={fillRate != null && fillRate > 95 ? 'Excellent' : fillRate == null ? 'Not measured' : 'Monitoring'} tone="positive" values={observedFillRates} /><MiniMetric label="Slippage (bps)" value="—" detail="Not instrumented" /><MiniMetric label="Maker / IOC Ratio" value="—" detail="Awaiting order types" /><MiniMetric label="Rejected Orders" value={String(rejectedOrders)} tone={rejectedOrders ? 'negative' : 'positive'} values={account.insights?.orders.map((order) => order.status === 'rejected' ? 1 : 0)} /><MiniMetric label="Cancelled Orders" value={String(cancelledOrders)} tone="warning" values={account.insights?.orders.map((order) => order.status === 'cancelled' ? 1 : 0)} /><MiniMetric label="Timeout Count" value="—" detail="Not instrumented" tone="neutral" /></div>
          </section>

          <section className="analytics-strategies analytics-card">
            <SectionHead title="Latest Strategy Validation Snapshots" action={<button type="button" disabled title="Use the Strategies workspace for full history">Current snapshots</button>} />
            <table><thead><tr><th>Strategy</th><th>Symbol</th><th>Trades</th><th>Win Rate</th><th>Avg R</th><th>Profit Factor</th><th>Max Drawdown</th><th>Expectancy</th><th>Status</th></tr></thead>
              <tbody>{strategyRows.length ? strategyRows.map((strategy) => <tr key={strategy.strategyId}><td>{strategy.name}</td><td>{market.selectedSymbol}</td><td>{strategy.latestSnapshot?.sampleSize ?? '—'}</td><td>{strategy.latestSnapshot?.winRatePct == null ? '—' : pct(strategy.latestSnapshot.winRatePct, 1)}</td><td>—</td><td>{strategy.latestSnapshot?.profitFactor == null ? '—' : strategy.latestSnapshot.profitFactor.toFixed(2)}</td><td className={Number(strategy.latestSnapshot?.maxDrawdownPct || 0) < 0 ? 'negative' : ''}>{strategy.latestSnapshot?.maxDrawdownPct == null ? '—' : pct(strategy.latestSnapshot.maxDrawdownPct, 2)}</td><td>—</td><td><span className={strategy.latestSnapshot?.fullStrategyValidated ? 'live' : 'disabled'}>{strategy.latestSnapshot?.fullStrategyValidated ? 'VALIDATED' : strategy.status.toUpperCase()}</span></td></tr>) : <tr><td colSpan={9} className="analytics-table-empty">Verified strategy evidence appears after recorded validation snapshots are available.</td></tr>}</tbody>
            </table>
          </section>
        </main>

        <aside className="analytics-context-rail">
          <section className="analytics-alerts analytics-card"><SectionHead title="Alerts & Anomalies" />{alerts.map((alert) => <div key={alert.title} className={alert.tone}><span>{alert.tone === 'danger' ? <AlertTriangle /> : alert.tone === 'warning' ? <CircleAlert /> : <Info />}</span><p><strong>{alert.title}</strong><small>{alert.detail}</small></p><time>{alert.age}</time></div>)}</section>
          <section className="analytics-providers analytics-card"><SectionHead title="Provider / Data Source Health" />
            <div className="analytics-provider-table"><div className="head"><span>Provider</span><span>Status</span><span>Latency</span><span>Health Check</span><span>Fallback</span><span>Schema</span></div>{providerRows.map((row) => <div className="row" key={row.name}><span>{row.name}</span><span className={row.status.toLowerCase().replace(/\W+/g, '-')}>{row.status}</span><span>{row.latency}</span><span>{row.lastUpdate}</span><span>{row.fallback}</span><span>{row.schema}</span></div>)}</div>
            <footer><Info size={12} /> Raw observations are preserved; unavailable fields stay explicit.</footer>
          </section>
        </aside>
      </div>
      {correlationOpen && (
        <div className="v20-correlation-overlay">
          <div className="v20-correlation-backdrop" aria-hidden="true" onClick={closeCorrelation} />
          <section ref={correlationDialogRef} className="v20-correlation-dialog" role="dialog" aria-modal="true" aria-labelledby="market-correlation-title">
            <header><div><strong id="market-correlation-title">Market Correlation Matrix</strong><small>Live endpoint data only</small></div><button ref={correlationCloseRef} type="button" onClick={closeCorrelation} aria-label="Close correlation matrix"><X size={17} /></button></header>
            <div><CorrelationMatrix onSelectSymbol={market.onSelectSymbol} /></div>
          </section>
        </div>
      )}
    </div>
  );
}
