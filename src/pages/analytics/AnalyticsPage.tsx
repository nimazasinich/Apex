import React, { useCallback, useMemo, useRef, useState } from 'react';
import './AnalyticsPage.css';
import {
  Activity,
  BarChart3,
  ChevronDown,
  FileText,
  Grid3X3,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { MiniSparkline } from '../../components/MiniSparkline';
import { CorrelationMatrix } from './components/CorrelationMatrix';
import type { AccountWorkspaceProps, MarketWorkspaceProps } from '../pageTypes';
import { AccountFreshnessChip } from '../../components/ui/AccountFreshnessChip';
import { useDialogA11y } from '../../lib/useDialogA11y';
import {
  Donut,
  fmtCompact,
  fmtMoney,
  HonestEmpty,
  LinePlot,
  SoftMetric,
  tone,
  V20PageTitle,
} from '../referenceUi';

interface AnalyticsPageProps {
  account: AccountWorkspaceProps;
  market: MarketWorkspaceProps;
}

const CHART_COLORS = ['#ff970f', '#2d80df', '#20b98b', '#f3ba18', '#7a46d7', '#9bb6d8'];

export function AnalyticsPage({ account, market }: AnalyticsPageProps) {
  const [rangeDays, setRangeDays] = useState(30);
  const [candidateScope, setCandidateScope] = useState<'all' | 'long' | 'short'>('all');
  const [correlationOpen, setCorrelationOpen] = useState(false);
  const correlationCloseRef = useRef<HTMLButtonElement>(null);
  const closeCorrelation = useCallback(() => setCorrelationOpen(false), []);
  const correlationDialogRef = useDialogA11y<HTMLElement>({
    isOpen: correlationOpen,
    onClose: closeCorrelation,
    initialFocusRef: correlationCloseRef,
  });
  const [allocationSort, setAllocationSort] = useState<'pnl' | 'symbol'>('pnl');
  const [monthlyWindow, setMonthlyWindow] = useState<3 | 6 | 12>(6);
  const [showAllPerformers, setShowAllPerformers] = useState(false);
  const analytics = account.insights?.analytics;
  const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  const cumulativeRows = useMemo(
    () => (analytics?.cumulativePnl || []).filter((item) => item.timestamp >= cutoff),
    [analytics?.cumulativePnl, cutoff],
  );
  const values = cumulativeRows.map((item) => item.value);
  const allCandidates = useMemo(() => {
    const source = candidateScope === 'long'
      ? market.longCandidates
      : candidateScope === 'short'
        ? market.shortCandidates
        : [...market.longCandidates, ...market.shortCandidates];
    return [...source].sort((left, right) => right.score - left.score);
  }, [candidateScope, market.longCandidates, market.shortCandidates]);
  const topCandidate = allCandidates[0];
  const weakCandidate = [...allCandidates].sort((left, right) => left.score - right.score)[0];
  const topAssets = analytics?.topAssets || [];
  const orderedTopAssets = useMemo(() => {
    const rows = [...topAssets];
    return allocationSort === 'symbol'
      ? rows.sort((left, right) => left.symbol.localeCompare(right.symbol))
      : rows.sort((left, right) => Math.abs(right.pnlUsd) - Math.abs(left.pnlUsd));
  }, [allocationSort, topAssets]);
  const totalAbs = orderedTopAssets.reduce((sum, item) => sum + Math.abs(item.pnlUsd), 0) || 1;
  const donutItems = orderedTopAssets.slice(0, 6).map((item, index) => ({
    label: item.symbol,
    value: Math.abs(item.pnlUsd),
    color: CHART_COLORS[index],
  }));
  const concentrationRisk = orderedTopAssets.length
    ? Math.min(100, Math.abs(orderedTopAssets[0].pnlUsd) / totalAbs * 100)
    : 0;
  const executionRisk = account.insights?.orders.length
    ? account.insights.orders.filter((order) => order.status === 'partially_filled' || order.status === 'rejected').length / account.insights.orders.length * 100
    : null;

  const monthlyPlaceholders = useMemo(() => {
    const months: Array<{ month: string; value: number }> = [];
    const now = new Date();
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      months.push({ month: date.toLocaleString('en-US', { month: 'short' }), value: 0 });
    }
    return months;
  }, []);

  const riskRows = [
    { label: 'Market Risk', value: account.insights?.account.riskScore ?? 0 },
    { label: 'Margin Risk', value: account.insights?.account.marginRatioPct ?? 0 },
    { label: 'Execution Risk', value: executionRisk ?? 0 },
    { label: 'Concentration Risk', value: concentrationRisk },
  ];

  return (
    <div className="v20-reference-page v20-analytics-page">
      <div className="v20-main-column">
        <V20PageTitle
          title="Analytics"
          subtitle="Performance overview of your trading activity"
          actions={(
            <>
              <AccountFreshnessChip loading={account.loading} error={account.error} connection={account.connection} snapshot={account.snapshot} />
              <select aria-label="Analytics date range" value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
              </select>
              <select aria-label="Scanner direction scope" value={candidateScope} onChange={(event) => setCandidateScope(event.target.value as typeof candidateScope)}>
                <option value="all">All Strategies</option>
                <option value="long">Long Candidates</option>
                <option value="short">Short Candidates</option>
              </select>
              <button type="button" aria-label="Open correlation matrix" onClick={() => setCorrelationOpen(true)}><Grid3X3 size={13} /> Correlation</button>
            </>
          )}
        />

        <div className="v20-metrics five">
          <SoftMetric label="Total P&L" value={fmtMoney(analytics?.totalPnlUsd)} detail="Realized + unrealized" icon={TrendingUp} chart={values} valueTone={tone(analytics?.totalPnlUsd)} />
          <SoftMetric label="Win Rate" value={analytics?.winRatePct == null ? '—' : `${analytics.winRatePct.toFixed(1)}%`} detail="Closed positions only" icon={Target} chart={values} />
          <SoftMetric label="Profit Factor" value={analytics?.profitFactor == null ? '—' : analytics.profitFactor.toFixed(2)} detail="Gross profit / loss" icon={BarChart3} chart={values} />
          <SoftMetric label="Sharpe Ratio" value={analytics?.sharpeRatio == null ? '—' : analytics.sharpeRatio.toFixed(2)} detail="History-derived estimate" icon={Activity} accent="violet" chart={values} />
          <SoftMetric label="Total Trades" value={analytics ? analytics.totalTrades : '—'} detail="Verified exchange history" icon={FileText} chart={values} />
        </div>

        <div className="v20-analytics-grid">
          <section className="v20-chart-card">
            <div className="v20-card-head"><span><strong>Cumulative P&amp;L</strong><small>Verified account history</small></span><button type="button" onClick={() => setRangeDays((current) => current === 7 ? 30 : current === 30 ? 90 : 7)} aria-label="Cycle analytics date range">{rangeDays}D <ChevronDown size={12} /></button></div>
            <div className="v20-big-chart"><LinePlot values={values} toneName={(analytics?.totalPnlUsd || 0) < 0 ? 'red' : 'green'} /></div>
            <strong className={tone(analytics?.totalPnlUsd)}>{fmtMoney(analytics?.totalPnlUsd)}</strong>
          </section>

          <section className="v20-chart-card">
            <div className="v20-card-head"><strong>Asset Allocation Performance</strong><button type="button" onClick={() => setAllocationSort((current) => current === 'pnl' ? 'symbol' : 'pnl')} aria-label="Change asset allocation ordering">{allocationSort === 'pnl' ? 'By P&L' : 'By symbol'} <ChevronDown size={12} /></button></div>
            {donutItems.length ? (
              <div className="v20-donut-row analytics">
                <Donut items={donutItems} totalLabel={fmtCompact(analytics?.totalPnlUsd || 0)} />
                <ul>{orderedTopAssets.slice(0, 6).map((item, index) => <li key={item.symbol}><i style={{ background: donutItems[index]?.color }} /><span>{item.symbol}</span><b className={tone(item.pnlUsd)}>{fmtMoney(item.pnlUsd)}</b></li>)}</ul>
              </div>
            ) : <HonestEmpty title="No asset P&amp;L allocation" detail="Closed trade history is required." />}
          </section>

          <section className="v20-chart-card">
            <div className="v20-card-head"><strong>Monthly Performance</strong><button type="button" onClick={() => setMonthlyWindow((current) => current === 3 ? 6 : current === 6 ? 12 : 3)} aria-label="Cycle monthly performance window">{monthlyWindow}M <ChevronDown size={12} /></button></div>
            <div className="v20-month-bars">
              {(analytics?.monthlyPnl?.length ? analytics.monthlyPnl.slice(-monthlyWindow) : monthlyPlaceholders.slice(-Math.min(monthlyWindow, monthlyPlaceholders.length))).map((item) => (
                <div key={item.month}>
                  <i
                    className={item.value < 0 ? 'negative' : ''}
                    style={{
                      height: analytics?.monthlyPnl?.length
                        ? `${Math.max(8, Math.min(100, Math.abs(item.value) / Math.max(1, ...analytics.monthlyPnl.map((row) => Math.abs(row.value))) * 100))}%`
                        : '4%',
                    }}
                  />
                  <span>{item.month}</span>
                </div>
              ))}
            </div>
            {!analytics?.monthlyPnl?.length && <small className="v20-chart-empty-note">No closed trade history yet</small>}
          </section>

          <section className="v20-chart-card">
            <div className="v20-card-head"><strong>P&amp;L Heatmap</strong></div>
            <div className="v20-heatmap-frame">
              <div className="v20-heatmap-weeks"><span />{Array.from({ length: 6 }, (_, index) => <span key={index}>W{index + 1}</span>)}</div>
              <div className="v20-heatmap-body">
                <div className="v20-heatmap-days">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => <span key={day}>{day}</span>)}</div>
                <div className="v20-heatmap">
                  {Array.from({ length: 30 }, (_, index) => {
                    const weekday = index % 5;
                    const bucket = Math.floor(index / 5);
                    const value = analytics?.heatmap.find((cell) => cell.weekday === weekday && cell.bucket === bucket)?.value || 0;
                    const maxAbs = Math.max(1, ...((analytics?.heatmap || []).map((cell) => Math.abs(cell.value))));
                    const strength = Math.min(1, Math.abs(value) / maxAbs);
                    return <span key={index} className={value < 0 ? 'negative' : value > 0 ? 'positive' : ''} style={{ opacity: .22 + strength * .78 }}>{value ? Math.round(value).toLocaleString() : ''}</span>;
                  })}
                </div>
              </div>
              <div className="v20-heatmap-legend"><i className="scale-neg" /><span>Loss</span><i className="scale-zero" /><span>0</span><i className="scale-pos" /><span>Profit</span></div>
            </div>
          </section>
        </div>
      </div>

      <aside className="v20-context-sidebar">
        <div className="v20-context-section v20-insight-banner">
          <strong>Strategy Insights</strong>
          <p>{topCandidate ? `${topCandidate.symbol} is currently the strongest scanner setup with a score of ${topCandidate.score.toFixed(0)}.` : 'Scanner insights will appear when verified market candidates are available.'}</p>
          <small className="v20-score-disclaimer">No score is treated as probability; scanner scores are not a calibrated win probability.</small>
        </div>

        <div className="v20-context-section">
          <strong>Best Performing Setup</strong>
          {topCandidate ? (
            <div className="v20-strategy-card positive">
              <span><b>{topCandidate.symbol}</b><small>{topCandidate.direction} CANDIDATE</small></span>
              <strong>{topCandidate.score.toFixed(0)}/100</strong>
              <MiniSparkline values={[topCandidate.momentumScore, topCandidate.orderFlowScore, topCandidate.fundingScore, topCandidate.structureScore, topCandidate.liquidityScore]} />
            </div>
          ) : <small>No candidate data.</small>}
        </div>

        <div className="v20-context-section">
          <strong>Needs Attention</strong>
          {weakCandidate ? (
            <div className="v20-strategy-card negative">
              <span><b>{weakCandidate.symbol}</b><small>{weakCandidate.direction} · {weakCandidate.guardPass ? 'PASS' : 'BLOCKED'}</small></span>
              <strong>{weakCandidate.score.toFixed(0)}/100</strong>
              <MiniSparkline values={[weakCandidate.momentumScore, weakCandidate.orderFlowScore, weakCandidate.fundingScore, weakCandidate.structureScore, weakCandidate.liquidityScore]} tone="negative" />
            </div>
          ) : <small>No candidate data.</small>}
        </div>

        <div className="v20-context-section">
          <div className="v20-section-title"><strong>Top Performers (P&amp;L)</strong><button type="button" onClick={() => setShowAllPerformers((value) => !value)} disabled={orderedTopAssets.length <= 5}>{showAllPerformers ? 'Show Top 5' : 'View All'}</button></div>
          {(showAllPerformers ? orderedTopAssets : orderedTopAssets.slice(0, 5)).map((item) => (
            <div className="v20-performer" key={item.symbol}><span>{item.symbol}</span><i><b style={{ width: `${Math.abs(item.pnlUsd) / totalAbs * 100}%` }} /></i><em className={tone(item.pnlUsd)}>{fmtMoney(item.pnlUsd)}</em></div>
          ))}
          {!topAssets.length && <small>No closed trade history yet.</small>}
        </div>

        <div className="v20-context-section">
          <strong>Risk Decomposition</strong>
          {riskRows.map(({ label, value }) => (
            <div className="v20-risk-bar" key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><em>{Number.isFinite(value) ? `${value.toFixed(0)}%` : '—'}</em></div>
          ))}
        </div>
      </aside>

      {correlationOpen && (
        <div className="v20-correlation-overlay">
          <div className="v20-correlation-backdrop" aria-hidden="true" onClick={closeCorrelation} />
          <section
            ref={correlationDialogRef}
            className="v20-correlation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="market-correlation-title"
          >
            <header>
              <div><strong id="market-correlation-title">Market Correlation Matrix</strong><small>Live endpoint data only</small></div>
              <button ref={correlationCloseRef} type="button" onClick={closeCorrelation} aria-label="Close correlation matrix"><X size={17} /></button>
            </header>
            <CorrelationMatrix onSelectSymbol={market.onSelectSymbol} />
          </section>
        </div>
      )}
    </div>
  );
}
