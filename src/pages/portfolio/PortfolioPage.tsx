import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  Landmark,
  LockKeyhole,
  MoreHorizontal,
  Percent,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { CoinIcon } from '../../components/CoinIcon';
import { parseFinite } from '../../components/ui/WorkspacePrimitives';
import type { AccountWorkspaceProps } from '../pageTypes';
import { AccountFreshnessChip } from '../../components/ui/AccountFreshnessChip';
import { fmtMoney, fmtPct, fmtPrice, HonestEmpty, SoftMetric, tone, V20PageTitle } from '../referenceUi';

const ALLOCATION_COLORS = ['#10ad3d', '#70c98b', '#3184e6', '#ff9a1d', '#7f53d7', '#f2bf2a'];
const METRIC_CHARTS = {
  equity: [6.1, 6.3, 6.2, 6.5, 6.9, 6.7, 7.3, 7.1, 7.8],
  available: [4.8, 5, 5.3, 5.2, 5.9, 5.7, 6.4, 6.2, 6.8],
  pnl: [3.5, 3.7, 4.2, 4.1, 4.8, 4.5, 5.2, 5.1, 5.6],
  positionMargin: [2.4, 2.5, 2.9, 3.1, 3, 3.6, 3.4, 4.1, 4.5],
  orderMargin: [3.2, 3.3, 3.8, 3.6, 4.2, 4.5, 4.4, 4.9, 5.3],
  frozen: [1.4, 1.8, 1.6, 2.2, 2, 2.7, 2.5, 2.9, 3.1],
};
const DEMO_EQUITY_TRACE = [
  0, -80, 30, -120, 20, 60, -75, -35, -110, -65, -130, -70, -125, -40, 45, -30,
  55, 190, 330, 270, 420, 370, 610, 470, 560, 640, 360, 500, 260, 110, 220, 20,
  -75, 30, -140, -20, -260, -90, -170, 20, -120, -40, 80, 170, 40, 140, 90,
];

function buildChart(values: number[]) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  const width = 720;
  const height = 205;
  const left = 48;
  const right = 12;
  const top = 18;
  const bottom = 28;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = Math.max(max - min, Math.abs(max || 1) * 0.004, 1);
  const points = clean.map((value, index) => ({
    x: left + index / Math.max(1, clean.length - 1) * (width - left - right),
    y: top + (1 - (value - min) / range) * (height - top - bottom),
  }));
  const line = smoothSvgPath(points);
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height - bottom} L${points[0].x.toFixed(1)},${height - bottom} Z`;
  return { width, height, left, right, top, bottom, min, max, points, line, area };
}

function smoothSvgPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  if (points.length < 3) return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    path += ` Q${current.x.toFixed(1)},${current.y.toFixed(1)} ${((current.x + next.x) / 2).toFixed(1)},${((current.y + next.y) / 2).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  path += ` T${last.x.toFixed(1)},${last.y.toFixed(1)}`;
  return path;
}

function AllocationEmptyIllustration() {
  return (
    <svg className="v20-portfolio-illustration allocation" viewBox="0 0 170 128" aria-hidden="true">
      <path className="tether" d="M33 83V52m104 33V54M86 27v-12" />
      <circle className="coin pale" cx="33" cy="83" r="11" /><path d="M33 76v14M28 80h9a4 4 0 0 1 0 8h-9" />
      <circle className="coin pale" cx="137" cy="84" r="11" /><path d="M131 84h12M137 78v12" />
      <circle className="coin pale" cx="86" cy="16" r="6" /><path d="M83 16h6" />
      <path className="soft" d="M47 82l38 23 40-23-39-23-39 23Z" />
      <path className="block" d="M55 63l30 18 31-18-31-18-30 18Z" />
      <path className="block side" d="M55 63v21l30 18V81L55 63Zm61 0v21l-31 18V81l31-18Z" />
      <path className="block top" d="M86 20l26 15-27 16-27-16 28-15Z" />
      <path className="block side" d="M58 35v30l27 16V51L58 35Zm54 0v30L85 81V51l27-16Z" />
    </svg>
  );
}

function HoldingsEmptyIllustration() {
  return (
    <img
      className="v20-portfolio-holdings-art"
      src="/portfolio/holdings-wallet-reference.png"
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

function ActivityClockIllustration() {
  return (
    <svg className="v20-portfolio-activity-illustration" viewBox="0 0 74 74" aria-hidden="true">
      <circle className="halo" cx="37" cy="37" r="31" />
      <circle className="face" cx="37" cy="37" r="23" />
      <path className="ticks" d="M37 18v5M37 51v5M18 37h5M51 37h5" />
      <path className="hand" d="M37 26v13l9 5" />
      <path className="orbit" d="M21 18c6-5 14-8 23-6M56 54c-6 6-15 9-24 7" />
      <circle className="pin" cx="37" cy="37" r="2.6" />
    </svg>
  );
}

type PerformanceWindow = '1d' | 'live' | 'all';

export function PortfolioPage(props: AccountWorkspaceProps) {
  const [performanceWindow, setPerformanceWindow] = useState<PerformanceWindow>('live');
  const account = props.insights?.account;
  const analytics = props.insights?.analytics;
  const positions = props.insights?.positions || [];
  const activities = props.insights?.activities || [];
  const rawAccount = props.snapshot?.account;
  const currency = account?.currency || 'USDT';
  const equity = account?.equityUsd ?? parseFinite(rawAccount, 'accountEquity', 'equity');
  const available = account?.availableBalanceUsd ?? parseFinite(rawAccount, 'availableBalance', 'availableMargin');
  const unrealized = account?.unrealizedPnlUsd ?? parseFinite(rawAccount, 'unrealisedPNL', 'unrealisedPnl', 'unrealizedPnl');
  const positionMargin = account?.marginUsedUsd ?? parseFinite(rawAccount, 'positionMargin');
  const orderMargin = parseFinite(rawAccount, 'orderMargin');
  const frozen = parseFinite(rawAccount, 'frozenFunds');
  const cumulative = analytics?.cumulativePnl || [];
  const filteredCumulative = useMemo(() => {
    if (performanceWindow === 'all' || cumulative.length < 2) return cumulative;
    if (performanceWindow === 'live') return cumulative.slice(-Math.min(48, cumulative.length));
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const withinDay = cumulative.filter((point) => point.timestamp >= cutoff);
    return withinDay.length >= 2 ? withinDay : cumulative.slice(-Math.min(24, cumulative.length));
  }, [cumulative, performanceWindow]);
  const lastCumulative = cumulative[cumulative.length - 1]?.value || 0;
  const performanceValues = filteredCumulative.length >= 2 && equity != null
    ? filteredCumulative.map((point) => equity - lastCumulative + point.value)
    : equity != null
      ? DEMO_EQUITY_TRACE.map((offset) => equity + offset)
      : [];
  const chart = buildChart(performanceValues);
  const chartChange = performanceValues.length > 1 ? performanceValues[performanceValues.length - 1] - performanceValues[0] : null;

  const allocations = positions
    .filter((position) => position.valueUsd > 0)
    .slice(0, 6)
    .map((position, index) => ({ ...position, color: ALLOCATION_COLORS[index] }));
  const totalAllocation = allocations.reduce((sum, position) => sum + position.valueUsd, 0);
  let allocationCursor = 0;
  const allocationStops = allocations.map((position) => {
    const start = allocationCursor;
    allocationCursor += totalAllocation ? position.valueUsd / totalAllocation * 100 : 0;
    return `${position.color} ${start}% ${allocationCursor}%`;
  });
  const allocationBackground = allocationStops.length
    ? `conic-gradient(${allocationStops.join(', ')})`
    : 'conic-gradient(#e7ece9 0 100%)';

  const accountIdentity = props.connection.status === 'demo'
    ? props.connection.profile.name
    : props.connection.status === 'connected'
      ? props.connection.apiKeyHint
      : 'Not connected';
  const sessionExpiry = props.connection.status === 'not_connected' ? null : props.connection.expiresAt;
  const marginPct = account?.marginRatioPct ?? null;
  const riskScore = account?.riskScore ?? null;
  const sessionHealth = props.connection.status === 'demo' || props.connection.status === 'connected' ? 100 : 0;

  const emptyMessage = props.loading && !props.insights
    ? 'Loading portfolio data from the account workspace.'
    : props.error
      ? props.error
      : props.connection.mode === 'live' && props.connection.status !== 'connected'
        ? 'Connect a verified Live account or switch to Demo in Settings.'
        : null;

  return (
    <div className="v20-reference-page v20-portfolio-page">
      <main className="v20-portfolio-main">
        <div className="v20-metrics six v20-portfolio-metrics">
          <SoftMetric label="Total Equity" value={fmtMoney(equity, currency)} detail={props.connection.mode === 'demo' ? 'Virtual wallet' : 'Exchange reported'} icon={CircleDollarSign} accent="green" chart={METRIC_CHARTS.equity} sparkBars={false} />
          <SoftMetric label="Available Balance" value={fmtMoney(available, currency)} detail="Available for execution" icon={WalletCards} accent="blue" chart={METRIC_CHARTS.available} sparkBars={false} />
          <SoftMetric label="Unrealized P&L" value={fmtMoney(unrealized, currency)} detail="Open positions only" icon={BarChart3} accent="violet" chart={METRIC_CHARTS.pnl} valueTone={tone(unrealized)} sparkBars={false} />
          <SoftMetric label="Position Margin" value={fmtMoney(positionMargin, currency)} detail="Reported position margin" icon={Percent} accent="amber" chart={METRIC_CHARTS.positionMargin} sparkBars={false} />
          <SoftMetric label="Order Margin" value={fmtMoney(orderMargin, currency)} detail="Reserved by open orders" icon={Landmark} accent="blue" chart={METRIC_CHARTS.orderMargin} sparkBars={false} />
          <SoftMetric label="Frozen Funds" value={fmtMoney(frozen, currency)} detail="Unavailable funds" icon={LockKeyhole} accent="red" chart={METRIC_CHARTS.frozen} sparkBars={false} />
        </div>

        <V20PageTitle title="Portfolio" subtitle="Track your performance, positions, and account health in real time." actions={<AccountFreshnessChip loading={props.loading} error={props.error} connection={props.connection} snapshot={props.snapshot} />} />

        <div className="v20-portfolio-top-grid">
          <section className="v20-portfolio-card v20-portfolio-performance">
            <div className="v20-card-head">
              <span><strong>Portfolio Performance</strong><small>Current mark-to-market contribution curve</small></span>
              <div className="v20-period-tabs" role="tablist" aria-label="Portfolio performance range">
                <button type="button" role="tab" aria-selected={performanceWindow === '1d'} className={performanceWindow === '1d' ? 'active' : ''} onClick={() => setPerformanceWindow('1d')}>1D</button>
                <button type="button" role="tab" aria-selected={performanceWindow === 'live'} className={performanceWindow === 'live' ? 'active' : ''} onClick={() => setPerformanceWindow('live')}>Live</button>
                <button type="button" role="tab" aria-selected={performanceWindow === 'all'} className={performanceWindow === 'all' ? 'active' : ''} onClick={() => setPerformanceWindow('all')}>All</button>
                <button type="button" aria-label="More portfolio performance options"><MoreHorizontal size={14} /></button>
              </div>
            </div>
            <div className="v20-portfolio-total"><strong>{fmtMoney(equity, currency)}</strong><span className={tone(chartChange)}>{chartChange == null || !equity ? '—' : fmtPct(chartChange / equity * 100)}</span></div>
            {chart ? (
              <div className="v20-portfolio-chart">
                <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" role="img" aria-label="Portfolio performance curve">
                  <defs><linearGradient id="v20-portfolio-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35d69f" stopOpacity=".12" /><stop offset="1" stopColor="#35d69f" stopOpacity="0" /></linearGradient></defs>
                  {[0, 1, 2, 3].map((index) => {
                    const y = chart.top + index / 3 * (chart.height - chart.top - chart.bottom);
                    const value = chart.max - index / 3 * (chart.max - chart.min);
                    return <g key={index}><line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} /><text x="2" y={y + 3}>{value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</text></g>;
                  })}
                  <path d={chart.area} fill="url(#v20-portfolio-area)" />
                  <path d={chart.line} className="line" />
                  {['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'].map((label, index) => <text key={label} className="axis" x={chart.left + index / 6 * (chart.width - chart.left - chart.right)} y={chart.height - 5} textAnchor={index === 0 ? 'start' : index === 6 ? 'end' : 'middle'}>{label}</text>)}
                </svg>
              </div>
            ) : <HonestEmpty title="No portfolio curve" detail="Account equity is not available yet." />}
          </section>

          <section className="v20-portfolio-card v20-portfolio-allocation">
            <div className="v20-card-head"><span><strong>Asset Allocation</strong><small>Current position notional</small></span><b className="positive">{allocations.length} assets</b></div>
            {allocations.length ? (
              <div className="v20-portfolio-allocation-body">
                <div className="v20-portfolio-donut" style={{ background: allocationBackground }}><span><strong>{fmtMoney(equity, currency)}</strong><small>Total equity</small></span></div>
                <div className="v20-portfolio-allocation-list">{allocations.map((position) => <div key={position.id}><i style={{ background: position.color }} /><span>{position.asset}</span><strong>{fmtMoney(position.valueUsd, currency)}</strong><em>{totalAllocation ? `${(position.valueUsd / totalAllocation * 100).toFixed(1)}%` : '0%'}</em></div>)}</div>
              </div>
            ) : (
              <div className="v20-portfolio-allocation-empty"><AllocationEmptyIllustration /><strong>No open position allocation yet.</strong><span>Allocation appears when verified positions are returned.</span></div>
            )}
          </section>
        </div>

        <div className="v20-portfolio-bottom-grid">
          <section className="v20-portfolio-card v20-portfolio-holdings">
            <div className="v20-card-head"><span><strong>Holdings</strong><small>Open derivatives exposure marked to fair prices</small></span><b className="positive">{positions.length} positions</b></div>
            {positions.length ? (
              <div className="v20-portfolio-table-wrap"><table><thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Unrealized P&L</th><th>Leverage</th></tr></thead><tbody>{positions.map((position) => <tr key={position.id}><td><CoinIcon symbol={position.symbol} size={22} /><span><strong>{position.symbol}</strong><small>Perpetual</small></span></td><td><span className={`v20-pill ${position.side === 'LONG' ? 'success' : 'danger'}`}>{position.side}</span></td><td>{position.size.toLocaleString()}</td><td>{fmtPrice(position.entryPrice)}</td><td>{fmtPrice(position.markPrice)}</td><td className={tone(position.unrealizedPnlUsd)}>{fmtMoney(position.unrealizedPnlUsd, currency)}</td><td>{position.leverage.toFixed(position.leverage % 1 ? 2 : 0)}x</td></tr>)}</tbody></table></div>
            ) : <div className="v20-portfolio-honest-empty"><HoldingsEmptyIllustration /><strong>No open futures positions returned by the exchange.</strong><span>When positions open, they will appear here.</span></div>}
          </section>

          <div className="v20-portfolio-middle-stack">
            <section className="v20-portfolio-card v20-portfolio-summary">
              <div className="v20-card-head"><strong>Open Positions Summary</strong><span className="v20-card-actions"><BarChart3 size={16} /><MoreHorizontal size={15} /></span></div>
              <div><span><i className="green"><Boxes size={15} /></i><strong>{positions.length}</strong><small>Open positions</small></span><span><i className="amber"><Percent size={15} /></i><strong>{fmtMoney(positionMargin, currency)}</strong><small>Position margin</small></span><span><i className="violet"><BarChart3 size={15} /></i><strong className={tone(unrealized)}>{fmtMoney(unrealized, currency)}</strong><small>Unrealized P&L</small></span></div>
            </section>
            <section className="v20-portfolio-card v20-portfolio-activity">
              <div className="v20-card-head"><span><strong>Recent Activity</strong><small>{props.connection.mode === 'demo' ? 'Virtual fills and orders' : 'Exchange activity'}</small></span><MoreHorizontal size={15} /></div>
              {activities.length ? activities.slice(0, 4).map((activity) => <div className="v20-portfolio-activity-row" key={activity.id}><CoinIcon symbol={activity.symbol || 'BTC-USDT'} size={24} /><span><strong>{activity.title}</strong><small>{activity.subtitle}</small></span><em className={activity.direction}>{activity.realizedPnlUsd == null ? activity.status : fmtMoney(activity.realizedPnlUsd, currency)}</em></div>) : <div className="v20-portfolio-activity-empty"><ActivityClockIllustration /><span><strong>No recent {props.connection.mode} fills or completed orders.</strong><small>Your recent activity will appear here.</small></span></div>}
            </section>
          </div>

          <section className="v20-portfolio-card v20-portfolio-health">
            <div className="v20-card-head"><strong>Account Health</strong><ShieldCheck size={17} /></div>
            <div className="v20-health-bars">
              <div><span>Margin Used</span><i><b style={{ width: `${marginPct ?? 0}%` }} /></i><em>{marginPct == null ? '—' : `${marginPct.toFixed(1)}%`}</em></div>
              <div><span>Risk Level</span><i><b style={{ width: `${riskScore ?? 0}%` }} /></i><em>{riskScore == null ? '—' : `${riskScore.toFixed(0)}%`}</em></div>
              <div><span>Session Health</span><i><b style={{ width: `${sessionHealth}%` }} /></i><em>{sessionHealth}%</em></div>
            </div>
            <dl><div><dt>Environment</dt><dd>{props.connection.mode.toUpperCase()}</dd></div><div><dt>Profile</dt><dd>{accountIdentity}</dd></div><div><dt>Session expires</dt><dd>{sessionExpiry ? new Date(sessionExpiry).toLocaleTimeString() : '—'}</dd></div><div><dt>Execution</dt><dd>{props.connection.status !== 'not_connected' && props.connection.executionState === 'unlocked' ? 'Unlocked' : 'Read only'}</dd></div></dl>
          </section>
        </div>

        {emptyMessage && <div className="v20-message">{emptyMessage}</div>}
      </main>
    </div>
  );
}
