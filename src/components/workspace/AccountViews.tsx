import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  Bell,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock,
  Eye,
  Filter,
  KeyRound,
  Landmark,
  Layers3,
  ListOrdered,
  History as HistoryIcon,
  MoreHorizontal,
  ScrollText,
  FlaskConical,
  Link2,
  Loader2,
  LockKeyhole,
  Pencil,
  Percent,
  RefreshCw,
  Search,
  ShieldCheck,
  Snowflake,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import {
  accountIsAvailable,
  cancelLiveOrder,
  previewOrder,
  submitLiveOrder,
  type AccountSnapshot,
  type ConnectionState,
  type LiveOrderDraft,
  type LiveOrderPreview,
} from '../../services/accountClient';
import { describeOrderError, type FriendlyOrderError } from '../../services/orderErrorMessages';
import type { Candle, CandidateScore, ChartFeedStatus, DerivedLevels, OrderBook, OrderBookSummary, SymbolTicker, TerminalSettings, UiDataState } from '../../types';
import type { TradePlan } from '../../services/tradePlan';
import { TradePlanRiskReward } from '../trading/TradePlanRiskReward';
import { InstrumentFacts } from '../trading/InstrumentFacts';
import { reviewOrderActionLabel, submitOrderActionLabel } from '../trading/orderActionLabels';
import { ExecutionIntelligence } from '../trading/ExecutionIntelligence';
import { formatCompactNumber, formatPercent, formatPrice } from '../../lib/marketPresentation';
import { CoinIcon } from '../CoinIcon';
import { ColoredGauge } from '../ColoredGauge';
import { FormattedNumberInput } from '../FormattedNumberInput';
import { PriceChart } from '../PriceChart';
import { ORDER_DRAFT_STORAGE_KEY, parseOrderDraftTransfer } from '../../lib/workspaceUi';
import { matchesBacktestEvidence, navigateWorkspace, readWorkspaceContext, writeWorkspaceContext } from '../../lib/workspaceContext';
import { useDialogA11y } from '../../lib/useDialogA11y';
import { TradingToolbox, type TradingToolboxState } from './TradingToolbox';
import { StatusBadge, Tabs } from '../ui/WorkspacePrimitives';
import './TradingSystemBridge.css';
import { HonestEmpty, normalizeSymbol, numberFrom, rows, stringFrom } from './accountSnapshotHelpers';
import { useTabdealAccount } from '../../hooks/useTabdealAccount';
import { TabdealCapabilityMatrix } from '../account/TabdealAccountSurface';

function money(value: number | null, currency = 'USDT'): string {
  if (value === null) return '—';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${currency}`;
}

function decimal(value: number | null, digits = 4): string {
  if (value === null) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function signedClass(value: number | null) {
  if (value === null || value === 0) return '';
  return value > 0 ? 'positive' : 'negative';
}

const LOCAL_PRICE_ALERTS_KEY = 'apex-local-price-alerts';
const LOCAL_PRICE_ALERTS_EVENT = 'apex:local-price-alerts-changed';
const TRADING_ACTIVITY_OPEN_STORAGE_KEY = 'apex.trading.accountActivity.open.v2';
const LEGACY_TRADING_ACTIVITY_OPEN_STORAGE_KEY = 'apex.trading.accountActivity.open.v1';

function readTradingActivityOpen(storage: Storage | null | undefined = typeof window === 'undefined' ? undefined : window.localStorage): boolean {
  if (!storage) return true;
  try {
    const current = storage.getItem(TRADING_ACTIVITY_OPEN_STORAGE_KEY);
    if (current === 'true') return true;
    if (current === 'false') return false;
    const legacy = storage.getItem(LEGACY_TRADING_ACTIVITY_OPEN_STORAGE_KEY);
    if (legacy === 'true' || legacy === 'false') {
      storage.setItem(TRADING_ACTIVITY_OPEN_STORAGE_KEY, legacy);
      storage.removeItem(LEGACY_TRADING_ACTIVITY_OPEN_STORAGE_KEY);
      return legacy === 'true';
    }
    return true;
  } catch {
    return true;
  }
}

interface LocalPriceAlert {
  id: string;
  symbol: string;
  condition: 'above' | 'below';
  price: number;
  createdAt: string;
}

function readLocalPriceAlerts(storage: Storage | null | undefined = typeof window === 'undefined' ? undefined : window.localStorage): LocalPriceAlert[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(LOCAL_PRICE_ALERTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is LocalPriceAlert => Boolean(
        row
        && typeof row.id === 'string'
        && typeof row.symbol === 'string'
        && (row.condition === 'above' || row.condition === 'below')
        && Number.isFinite(Number(row.price))
        && typeof row.createdAt === 'string',
      ))
      .map((row) => ({ ...row, price: Number(row.price) }))
      .slice(0, 50);
  } catch {
    return [];
  }
}

function accountModeLabel(connection: ConnectionState) {
  return connection.mode === 'demo' ? 'Demo' : 'Live';
}

export function LockedAccountState({ title, onConnect }: { title: string; onConnect: () => void }) {
  return (
    <section className="apex-locked-state" aria-label={`${title} is locked`}>
      <div className="apex-lock-orbit"><LockKeyhole size={30} /></div>
      <span className="apex-eyebrow">Verified account required</span>
      <h2>{title} is not connected</h2>
      <p>
        Live account values are intentionally hidden until a real KuCoin API Key, Secret and Passphrase
        are verified. Switch to Demo for a virtual wallet, or connect KuCoin to unlock real balances.
      </p>
      <button className="apex-primary-button" type="button" onClick={onConnect}>
        <KeyRound size={17} /> Connect exchange API
      </button>
      <div className="apex-security-note"><ShieldCheck size={15} /> Secrets are never stored in browser LocalStorage.</div>
    </section>
  );
}

function AccountLoading({ label, mode }: { label: string; mode: 'demo' | 'live' }) {
  return <div className="apex-loading-panel"><Loader2 className="spin" size={24} /> Syncing {label} from {mode === 'demo' ? 'the demo ledger' : 'KuCoin'}…</div>;
}

type ParsedMetricValue = { main: string; suffix: string | null; range: [string, string] | null };

function parseMetricValue(value: string): ParsedMetricValue {
  const trimmed = value.trim();
  const rangeParts = trimmed.split(/\s+[–—]\s+/);
  if (rangeParts.length === 2) return { main: trimmed, suffix: null, range: [rangeParts[0], rangeParts[1]] };
  const match = trimmed.match(/^(.*?)(?:\s+([A-Z]{3,6}))$/);
  if (match && !trimmed.includes('%') && !trimmed.includes('/')) {
    return { main: match[1], suffix: match[2], range: null };
  }
  return { main: trimmed, suffix: null, range: null };
}

function MetricCard({ label, value, tone, detail, icon: Icon = WalletCards, accent = 'green' }: { label: string; value: string; tone?: string; detail?: string; icon?: React.ComponentType<{ size?: number }>; accent?: 'green' | 'blue' | 'violet' | 'amber' | 'rose' }) {
  const parsed = parseMetricValue(value);
  const compact = parsed.main.length > 16 || value.length > 20 || Boolean(parsed.range);
  return (
    <article className={`apex-metric-card accent-${accent}${compact ? ' is-compact' : ''}${detail ? '' : ' no-detail'}`} title={value}>
      <div className={`apex-metric-icon ${tone || ''}`}><Icon size={19} /></div>
      <div className="apex-metric-copy">
        <span className="apex-metric-label">{label}</span>
        {parsed.range ? (
          <div className="apex-metric-range" aria-label={value}>
            <strong className={tone || ''}>{parsed.range[0]}</strong><i>→</i><strong className={tone || ''}>{parsed.range[1]}</strong>
          </div>
        ) : (
          <div className="apex-metric-value-row">
            <strong className={tone || ''}>{parsed.main}</strong>
            {parsed.suffix && <em className={tone || ''}>{parsed.suffix}</em>}
          </div>
        )}
        {detail && <small><i aria-hidden="true" />{detail}</small>}
      </div>
      <i className="apex-metric-glow" />
      <i className="apex-metric-sheen" />
    </article>
  );
}


const PORTFOLIO_COLORS = ['#ff920d', '#2f8fdf', '#24b99a', '#f2ba21', '#9650d8', '#78a8dc'];

type SeriesPoint = { x: number; y: number };

function smoothSeriesPath(points: SeriesPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  path += ` Q ${last.x.toFixed(1)} ${last.y.toFixed(1)} ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return path;
}

function positionValue(row: Record<string, unknown>): number {
  const direct = numberFrom(row, 'positionValue', 'value', 'currentValue', 'notionalValue');
  if (direct !== null) return Math.abs(direct);
  const quantity = Math.abs(numberFrom(row, 'currentQty', 'size') || 0);
  const markPrice = numberFrom(row, 'markPrice', 'lastPrice') || 0;
  return quantity * markPrice;
}

function PortfolioContributionChart({ equity, positions }: { equity: number | null; positions: Array<Record<string, unknown>> }) {
  const pnlValues = positions.map((row) => numberFrom(row, 'unrealisedPnl', 'unrealizedPnl') || 0);
  const totalPnl = pnlValues.reduce((sum, value) => sum + value, 0);
  const ending = equity || 0;
  const starting = ending - totalPnl;
  const series = [starting];
  pnlValues.forEach((value) => series.push((series[series.length - 1] || starting) + value));
  if (series.length === 1) series.push(ending);
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(max - min, Math.abs(ending) * .015, 1);
  const points = series.map((value, index) => ({
    x: 18 + (index / Math.max(1, series.length - 1)) * 684,
    y: 190 - ((value - min) / range) * 142,
  }));
  const line = smoothSeriesPath(points);
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} 210 L ${points[0].x.toFixed(1)} 210 Z`;
  return (
    <section className="apex-panel apex-portfolio-performance-card">
      <div className="apex-panel-head"><div><span>Portfolio Performance</span><small>Current mark-to-market contribution curve</small></div><span className="apex-live-context" title="This legacy contribution chart represents the current open-position snapshot">Live snapshot</span></div>
      <div className="apex-performance-total"><strong>{money(equity)}</strong><span className={signedClass(totalPnl)}>{totalPnl >= 0 ? '+' : ''}{money(totalPnl)}</span></div>
      <div className="apex-portfolio-chart-wrap">
        <svg viewBox="0 0 720 220" preserveAspectRatio="none" role="img" aria-label="Current portfolio contribution chart">
          <defs><linearGradient id="apex-portfolio-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#36bd4c" stopOpacity=".22" /><stop offset="1" stopColor="#36bd4c" stopOpacity="0" /></linearGradient></defs>
          {[48, 88, 128, 168].map((y) => <line key={y} x1="18" x2="702" y1={y} y2={y} className="apex-portfolio-grid-line" />)}
          <path d={area} fill="url(#apex-portfolio-area)" />
          <path d={line} className="apex-portfolio-line" />
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" className="apex-portfolio-end-dot" />
        </svg>
      </div>
      <div className="apex-portfolio-chart-foot"><span>Contribution by open positions</span><span>Updated {new Date().toLocaleTimeString()}</span></div>
    </section>
  );
}

function AssetAllocationPanel({ positions, equity }: { positions: Array<Record<string, unknown>>; equity: number | null }) {
  const assets = positions.map((row, index) => ({
    symbol: normalizeSymbol(stringFrom(row, 'symbol')),
    value: positionValue(row),
    color: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length],
  })).filter((item) => item.value > 0).slice(0, 6);
  const total = assets.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const segments = assets.map((item) => {
    const start = cursor;
    const percentage = total ? item.value / total * 100 : 0;
    cursor += percentage;
    return `${item.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  const background = segments.length ? `conic-gradient(${segments.join(',')})` : 'conic-gradient(#e8eef0 0 100%)';
  return (
    <section className="apex-panel apex-allocation-card">
      <div className="apex-panel-head"><div><span>Asset Allocation</span><small>Current position notional</small></div><strong>{assets.length} assets</strong></div>
      <div className="apex-allocation-content">
        <div className="apex-allocation-donut" style={{ background } as React.CSSProperties}><div><strong>{money(equity)}</strong><span>Total equity</span></div></div>
        <div className="apex-allocation-legend">
          {assets.length ? assets.map((item) => <div key={item.symbol}><i style={{ background: item.color }} /><span>{item.symbol}</span><strong>{money(item.value)}</strong><em>{total ? `${(item.value / total * 100).toFixed(1)}%` : '0%'}</em></div>) : <div className="empty"><span>No open position allocation yet.</span></div>}
        </div>
      </div>
    </section>
  );
}

export interface AccountViewProps {
  connection: ConnectionState;
  snapshot: AccountSnapshot | null;
  loading: boolean;
  error: string | null;
  onConnect: () => void;
  onRefresh: () => Promise<void> | void;
}

export function PortfolioView(props: AccountViewProps) {
  if (!accountIsAvailable(props.connection)) return <LockedAccountState title="Portfolio" onConnect={props.onConnect} />;
  if (props.loading && !props.snapshot) return <AccountLoading label="portfolio" mode={props.connection.mode} />;
  const isDemo = props.connection.mode === 'demo';
  const account = props.snapshot?.account;
  const currency = stringFrom(account, 'currency') === '—' ? 'USDT' : stringFrom(account, 'currency');
  const equity = numberFrom(account, 'accountEquity', 'equity');
  const available = numberFrom(account, 'availableBalance', 'availableMargin');
  const unrealized = numberFrom(account, 'unrealisedPNL', 'unrealisedPnl', 'unrealizedPnl');
  const positionMargin = numberFrom(account, 'positionMargin');
  const orderMargin = numberFrom(account, 'orderMargin');
  const frozen = numberFrom(account, 'frozenFunds');
  const positions = rows(props.snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true);
  const recent = [...rows(props.snapshot, 'recentTrades'), ...rows(props.snapshot, 'recentOrders')].slice(0, 8);
  const usedMarginPct = equity && positionMargin !== null ? Math.max(0, Math.min(100, (positionMargin / equity) * 100)) : null;
  const accountIdentity = props.connection.status === 'demo'
    ? props.connection.profile.name
    : props.connection.apiKeyHint;

  return (
    <div className="apex-page-stack apex-unified-page apex-portfolio-page">
      <PageTitle title="Portfolio" subtitle={isDemo ? 'Virtual balances and executions, marked with real KuCoin prices.' : 'Real balances and derivatives exposure only.'} eyebrow={isDemo ? 'Demo account · real market data' : 'Live KuCoin account'} icon={WalletCards} mode={props.connection.mode} onRefresh={props.onRefresh} loading={props.loading} />
      {props.error && <div className="apex-inline-error"><AlertTriangle size={16} /> {props.error}</div>}
      <div className="apex-metric-grid six">
        <MetricCard label="Total Equity" value={money(equity, currency)} tone="positive" detail={isDemo ? 'Virtual wallet' : 'Exchange reported'} icon={CircleDollarSign} accent="green" />
        <MetricCard label="Available Balance" value={money(available, currency)} icon={WalletCards} accent="blue" />
        <MetricCard label="Unrealized P&L" value={money(unrealized, currency)} tone={signedClass(unrealized)} icon={BarChart3} accent="violet" />
        <MetricCard label="Position Margin" value={money(positionMargin, currency)} icon={Percent} accent="amber" />
        <MetricCard label="Order Margin" value={money(orderMargin, currency)} icon={Landmark} accent="blue" />
        <MetricCard label="Frozen Funds" value={money(frozen, currency)} icon={Snowflake} accent="rose" />
      </div>

      <div className="apex-portfolio-visual-grid">
        <PortfolioContributionChart equity={equity} positions={positions} />
        <AssetAllocationPanel positions={positions} equity={equity} />
      </div>

      <div className="apex-portfolio-detail-grid">
        <section className="apex-panel apex-holdings-card">
          <div className="apex-panel-head"><div><span>Holdings</span><small>Open derivatives exposure marked to live prices</small></div><strong>{positions.length} positions</strong></div>
          {positions.length ? <PositionsTable positions={positions} /> : <HonestEmpty label="No open futures positions returned by the exchange." />}
        </section>
        <div className="apex-portfolio-side-stack">
          <section className="apex-panel apex-open-position-summary">
            <div className="apex-panel-head"><span>Open Positions Summary</span><BarChart3 size={17} /></div>
            <div className="apex-summary-metrics"><div><strong>{positions.length}</strong><span>Open positions</span></div><div><strong>{money(positionMargin)}</strong><span>Position margin</span></div><div><strong className={signedClass(unrealized)}>{money(unrealized)}</strong><span>Unrealized P&amp;L</span></div></div>
          </section>
          <section className="apex-panel apex-recent-activity-card">
            <div className="apex-panel-head"><div><span>Recent Activity</span><small>{isDemo ? 'Virtual fills and orders' : 'Exchange activity'}</small></div></div>
            {recent.length ? <ActivityTable activity={recent.slice(0, 4)} /> : <HonestEmpty label={`No recent ${isDemo ? 'demo' : 'live'} fills or completed orders.`} />}
          </section>
        </div>
        <section className="apex-panel apex-health-panel apex-portfolio-health-card">
          <div className="apex-panel-head"><span>Account Health</span><ShieldCheck size={18} /></div>
          <ColoredGauge value={usedMarginPct} inverse size={132} displayValue={usedMarginPct === null ? '—' : `${usedMarginPct.toFixed(1)}%`} label="Margin used" className="apex-health-gauge" />
          <dl><div><dt>Environment</dt><dd>{isDemo ? 'DEMO' : 'LIVE'}</dd></div><div><dt>{isDemo ? 'Profile' : 'API key'}</dt><dd>{accountIdentity}</dd></div><div><dt>Session expires</dt><dd>{new Date(props.connection.expiresAt).toLocaleTimeString()}</dd></div><div><dt>Execution</dt><dd>{props.connection.executionState === 'unlocked' ? 'Unlocked' : 'Read only'}</dd></div></dl>
        </section>
      </div>
    </div>
  );
}

export function PositionsTable({ positions }: { positions: Array<Record<string, unknown>> }) {
  return (
    <div className="apex-table-wrap"><table className="apex-table"><thead><tr><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Unrealized P&L</th><th>Leverage</th><th>Liquidation</th></tr></thead>
      <tbody>{positions.map((row, index) => {
        const qty = numberFrom(row, 'currentQty');
        const pnl = numberFrom(row, 'unrealisedPnl', 'unrealizedPnl');
        return <tr key={stringFrom(row, 'id', 'symbol') + index}><td className="symbol-cell"><CoinIcon symbol={normalizeSymbol(stringFrom(row, 'symbol'))} size={24} /><span><strong>{normalizeSymbol(stringFrom(row, 'symbol'))}</strong><small>Perpetual</small></span></td><td><span className={`apex-status-pill ${qty !== null && qty < 0 ? 'danger' : 'success'}`}>{qty !== null && qty < 0 ? 'Short' : 'Long'}</span></td><td>{decimal(qty)}</td><td>{decimal(numberFrom(row, 'avgEntryPrice'))}</td><td>{decimal(numberFrom(row, 'markPrice'))}</td><td className={signedClass(pnl)}>{money(pnl)}</td><td>{decimal(numberFrom(row, 'realLeverage'), 2)}x</td><td>{decimal(numberFrom(row, 'liquidationPrice'))}</td></tr>;
      })}</tbody></table></div>
  );
}

export function ActivityTable({ activity }: { activity: Array<Record<string, unknown>> }) {
  return <div className="apex-activity-list">{activity.map((row, index) => {
    const side = stringFrom(row, 'side');
    const symbol = normalizeSymbol(stringFrom(row, 'symbol'));
    const time = numberFrom(row, 'createdAt', 'ts', 'tradeTime');
    return <div key={stringFrom(row, 'id', 'orderId', 'tradeId') + index} className="apex-activity-row"><CoinIcon symbol={symbol} size={30} className={side === 'sell' ? 'sell' : ''} /><div><strong>{symbol}</strong><small>{side} · {stringFrom(row, 'type', 'orderType')}</small></div><div><strong>{decimal(numberFrom(row, 'size', 'dealSize'))}</strong><small>{time ? new Date(time).toLocaleString() : stringFrom(row, 'createdAt')}</small></div></div>;
  })}</div>;
}

export function PositionsView(props: AccountViewProps) {
  if (!accountIsAvailable(props.connection)) return <LockedAccountState title="Positions" onConnect={props.onConnect} />;
  const positions = rows(props.snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true);
  const totalPnl = positions.reduce((sum, row) => sum + (numberFrom(row, 'unrealisedPnl', 'unrealizedPnl') || 0), 0);
  return <div className="apex-page-stack apex-unified-page apex-positions-page">
    <PageTitle title="Positions" subtitle={props.connection.mode === 'demo' ? 'Virtual positions marked with real market prices' : 'Exchange-synchronized futures positions'} icon={BarChart3} mode={props.connection.mode} onRefresh={props.onRefresh} loading={props.loading} />
    <div className="apex-page-mini-stats"><div><span>Open positions</span><strong>{positions.length}</strong><small>{accountModeLabel(props.connection)} account</small></div><div><span>Unrealized P&amp;L</span><strong className={signedClass(totalPnl)}>{money(totalPnl)}</strong><small>Current marked value</small></div><div><span>Execution mode</span><strong>{props.connection.executionState === 'unlocked' ? 'Ready' : 'Read only'}</strong><small>{props.connection.mode.toUpperCase()}</small></div></div>
    <section className="apex-panel apex-section-card"><div className="apex-panel-head"><div><span>Open exposure</span><small>Live position state with consistent financial formatting</small></div><strong>{positions.length} positions</strong></div>{positions.length ? <PositionsTable positions={positions} /> : <HonestEmpty label={`No open ${props.connection.mode} positions.`} />}</section>
  </div>;
}

type OrderLifecycle = 'open' | 'partial' | 'filled' | 'cancelled';

function classifyOrderStatus(row: Record<string, unknown>): OrderLifecycle {
  const status = stringFrom(row, 'status', 'orderStatus', 'state').toLowerCase();
  const size = numberFrom(row, 'size', 'origSize') ?? 0;
  const filled = numberFrom(row, 'dealSize', 'filledSize', 'executedSize') ?? 0;
  if (status.includes('cancel') || status.includes('reject')) return 'cancelled';
  if (size > 0 && filled >= size) return 'filled';
  if (filled > 0 && filled < size) return 'partial';
  if (status.includes('done') || status.includes('match') || status.includes('filled')) return 'filled';
  if (row.isActive === false && filled === 0) return 'cancelled';
  return 'open';
}

const ORDER_TAB_META: Record<'all' | OrderLifecycle, { label: string }> = {
  all: { label: 'All Orders' },
  open: { label: 'Open' },
  partial: { label: 'Partially Filled' },
  filled: { label: 'Filled' },
  cancelled: { label: 'Cancelled' },
};

function formatOrderTime(row: Record<string, unknown>): string {
  const ts = numberFrom(row, 'createdAt', 'ts', 'tradeTime', 'updatedAt');
  if (!ts) return '—';
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC`;
}

function orderId(row: Record<string, unknown>): string {
  return stringFrom(row, 'id', 'orderId');
}

function OrderRiskBar({ label, pct, tag, tone }: { label: string; pct: number; tag: string; tone: 'low' | 'medium' | 'high' }) {
  return (
    <div className="apex-oa-riskbar">
      <div className="apex-oa-riskbar-head"><span>{label}</span><em className={tone}>{tag}</em></div>
      <div className="apex-oa-riskbar-track"><span className={tone} style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} /></div>
    </div>
  );
}

export function OrdersView(props: AccountViewProps) {
  const [canceling, setCanceling] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | OrderLifecycle>('all');
  const [side, setSide] = useState<'all' | 'buy' | 'sell'>('all');
  const [type, setType] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!accountIsAvailable(props.connection)) return <LockedAccountState title="Orders" onConnect={props.onConnect} />;

  const merged = new Map<string, Record<string, unknown>>();
  [...rows(props.snapshot, 'recentOrders'), ...rows(props.snapshot, 'openOrders')].forEach((row) => merged.set(orderId(row) || `${merged.size}`, row));
  const allOrders = Array.from(merged.values());

  const counts = allOrders.reduce<Record<OrderLifecycle, number>>((acc, row) => { acc[classifyOrderStatus(row)] += 1; return acc; }, { open: 0, partial: 0, filled: 0, cancelled: 0 });
  const totalNotional = allOrders
    .filter((row) => { const status = classifyOrderStatus(row); return status === 'open' || status === 'partial'; })
    .reduce((sum, row) => {
      const price = numberFrom(row, 'price') ?? numberFrom(row, 'avgFillPrice', 'dealAvgPrice', 'avgPrice') ?? 0;
      const size = numberFrom(row, 'size', 'origSize') ?? 0;
      return sum + price * size;
    }, 0);

  const searchLower = search.trim().toLowerCase();
  const visibleOrders = allOrders
    .filter((row) => {
      const status = classifyOrderStatus(row);
      if (tab !== 'all' && status !== tab) return false;
      const rowSide = stringFrom(row, 'side').toLowerCase();
      if (side !== 'all' && rowSide !== side) return false;
      const rowType = stringFrom(row, 'type').toLowerCase();
      if (type !== 'all' && rowType !== type) return false;
      if (searchLower) {
        const id = orderId(row).toLowerCase();
        const symbol = normalizeSymbol(stringFrom(row, 'symbol')).toLowerCase();
        if (!id.includes(searchLower) && !symbol.includes(searchLower)) return false;
      }
      return true;
    })
    .sort((a, b) => (numberFrom(b, 'createdAt', 'ts', 'updatedAt') ?? 0) - (numberFrom(a, 'createdAt', 'ts', 'updatedAt') ?? 0));

  const selectedOrder = selectedId ? allOrders.find((row) => orderId(row) === selectedId) ?? null : null;

  const cancel = async (id: string) => {
    setCanceling(id); setMessage(null);
    try { await cancelLiveOrder(id); setMessage(props.connection.mode === 'demo' ? 'Demo order cancelled.' : 'Cancellation accepted by KuCoin.'); await props.onRefresh(); }
    catch (error) {
      // Never surface the server's machine code (e.g. demo_order_not_found) raw.
      const friendly = describeOrderError(error instanceof Error ? error.message : 'cancel_failed');
      setMessage(friendly.detail ? `${friendly.title} ${friendly.detail}` : friendly.title);
    }
    finally { setCanceling(null); }
  };

  const copyDetails = async (row: Record<string, unknown>) => {
    const summary = `${orderId(row)} · ${normalizeSymbol(stringFrom(row, 'symbol'))} · ${stringFrom(row, 'side')} ${stringFrom(row, 'type')} · ${decimal(numberFrom(row, 'dealSize', 'filledSize'))}/${decimal(numberFrom(row, 'size', 'origSize'))}`;
    try { await navigator.clipboard.writeText(summary); setMessage('Order details copied to clipboard.'); }
    catch { setMessage('Could not copy order details.'); }
  };

  const clearFilters = () => { setSide('all'); setType('all'); setSearch(''); setTab('all'); };

  return <div className="apex-page-stack apex-unified-page apex-orders-page">
    <PageTitle title="Orders" subtitle="Track and manage your trading orders in real time." icon={ListOrdered} mode={props.connection.mode} onRefresh={props.onRefresh} loading={props.loading} />

    <div className="apex-metric-grid five apex-orders-summary">
      <MetricCard label="Open Orders" value={String(counts.open)} detail="Active on markets" icon={ListOrdered} accent="green" />
      <MetricCard label="Partially Filled" value={String(counts.partial)} detail="Working orders" icon={Activity} accent="amber" />
      <MetricCard label="Filled" value={String(counts.filled)} detail="Completed orders" icon={CheckCircle2} accent="violet" />
      <MetricCard label="Cancelled" value={String(counts.cancelled)} detail="Cancelled orders" icon={XCircle} accent="rose" />
      <MetricCard label="Total Notional" value={money(totalNotional)} detail="Visible order history" icon={CircleDollarSign} accent="blue" />
    </div>

    {message && <div className="apex-inline-note">{message}</div>}

    <div className="apex-trading-layout apex-orders-layout">
      <section className="apex-panel apex-section-card apex-orders-table-card">
        <div className="apex-panel-head"><div><span>Working orders</span><small>Manage pending limit and market instructions</small></div><strong>{visibleOrders.length} shown</strong></div>

        <div className="apex-orders-tabs">
          {(Object.keys(ORDER_TAB_META) as Array<'all' | OrderLifecycle>).map((key) => (
            <button key={key} type="button" className={`apex-orders-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{ORDER_TAB_META[key].label}</button>
          ))}
        </div>

        <div className="apex-orders-filters">
          <div className="apex-orders-search"><Search size={14} /><input type="text" placeholder="Search orders by ID or market…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="apex-orders-select" value={side} onChange={(event) => setSide(event.target.value as typeof side)}>
            <option value="all">All Sides</option><option value="buy">Buy</option><option value="sell">Sell</option>
          </select>
          <select className="apex-orders-select" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">All Types</option><option value="limit">Limit</option><option value="market">Market</option><option value="stop">Stop</option>
          </select>
          <button type="button" className="apex-secondary-button" onClick={clearFilters}><Filter size={14} /> Clear Filters</button>
        </div>

        {visibleOrders.length ? <div className="apex-table-wrap"><table className="apex-table apex-orders-table"><thead><tr><th>Order ID</th><th>Market</th><th>Side</th><th>Type</th><th>Filled / Size</th><th>Avg. Fill Price</th><th>Status</th><th>Time</th></tr></thead><tbody>{visibleOrders.map((row, index) => {
          const id = orderId(row); const symbol = normalizeSymbol(stringFrom(row, 'symbol')); const side = stringFrom(row, 'side'); const status = classifyOrderStatus(row);
          const statusTone = status === 'cancelled' ? 'danger' : status === 'filled' ? 'success' : status === 'partial' ? 'warning' : '';
          return <tr key={id + index} className={selectedId === id ? 'selected' : ''} onClick={() => setSelectedId(id)}>
            <td><span className="apex-orders-id">{id || '—'}</span></td>
            <td className="symbol-cell"><CoinIcon symbol={symbol} size={22} /><span><strong>{symbol}</strong></span></td>
            <td><span className={`apex-status-pill ${side === 'sell' ? 'danger' : 'success'}`}>{side}</span></td>
            <td>{stringFrom(row, 'type')}</td>
            <td>{decimal(numberFrom(row, 'dealSize', 'filledSize'))} / {decimal(numberFrom(row, 'size', 'origSize'))}</td>
            <td>{decimal(numberFrom(row, 'avgFillPrice', 'dealAvgPrice', 'avgPrice', 'price'))}</td>
            <td><span className={`apex-status-pill ${statusTone}`}>{ORDER_TAB_META[status].label}</span></td>
            <td>{formatOrderTime(row)}</td>
          </tr>;
        })}</tbody></table></div> : <HonestEmpty label="No orders returned. Place an order in Demo or connect a verified account." />}
      </section>

      <aside className="apex-order-ticket apex-order-assistant">
        <div className="apex-panel-head"><span>Order Assistant</span>{selectedOrder ? <span className="apex-orders-id">{orderId(selectedOrder)}</span> : null}</div>
        {!selectedOrder ? (
          <div className="apex-oa-empty"><CheckCircle2 size={30} /><strong>Select an order</strong><span>Order details and safe actions appear here.</span></div>
        ) : (() => {
          const symbol = normalizeSymbol(stringFrom(selectedOrder, 'symbol'));
          const orderSide = stringFrom(selectedOrder, 'side');
          const status = classifyOrderStatus(selectedOrder);
          const size = numberFrom(selectedOrder, 'size', 'origSize');
          const filled = numberFrom(selectedOrder, 'dealSize', 'filledSize') ?? 0;
          const fillPct = size ? Math.max(0, Math.min(100, Math.round((filled / size) * 100))) : 0;
          const avgPrice = numberFrom(selectedOrder, 'avgFillPrice', 'dealAvgPrice', 'avgPrice', 'price');
          const limitPrice = numberFrom(selectedOrder, 'price');
          const estValue = avgPrice !== null ? avgPrice * filled : null;
          const slippagePct = limitPrice && avgPrice ? Math.abs((avgPrice - limitPrice) / limitPrice) * 100 : null;
          const createdAt = numberFrom(selectedOrder, 'createdAt', 'ts', 'tradeTime');
          const ageMinutes = createdAt ? Math.max(0, Math.round((Date.now() - (createdAt < 1e12 ? createdAt * 1000 : createdAt)) / 60000)) : null;
          const slippageTone: 'low' | 'medium' | 'high' = slippagePct === null ? 'low' : slippagePct < 0.15 ? 'low' : slippagePct < 0.5 ? 'medium' : 'high';
          const ageTone: 'low' | 'medium' | 'high' = ageMinutes === null ? 'low' : ageMinutes < 15 ? 'low' : ageMinutes < 60 ? 'medium' : 'high';
          return <>
            <div className="apex-oa-header"><CoinIcon symbol={symbol} size={26} /><div><strong>{symbol}</strong></div><span className={`apex-status-pill ${orderSide === 'sell' ? 'danger' : 'success'}`}>{orderSide}</span><span className={`apex-status-pill ${status === 'cancelled' ? 'danger' : status === 'filled' ? 'success' : status === 'partial' ? 'warning' : ''}`}>{ORDER_TAB_META[status].label}</span></div>

            <div className="apex-oa-grid">
              <div><span>Type</span><strong>{stringFrom(selectedOrder, 'type')}</strong></div>
              <div><span>Time</span><strong>{formatOrderTime(selectedOrder)}</strong></div>
              <div><span>Filled / Size</span><strong>{decimal(filled)} / {decimal(size)}</strong></div>
              <div><span>Est. Value</span><strong>{money(estValue)}</strong></div>
              <div><span>Avg. Fill Price</span><strong>{decimal(avgPrice)}</strong></div>
              <div><span>Order ID</span><strong className="apex-orders-id">{orderId(selectedOrder)}</strong></div>
            </div>

            <div className="apex-oa-fill">
              <div className="apex-oa-fill-head"><span>Fill Progress</span><strong>{fillPct}%</strong></div>
              <div className="apex-oa-fill-track"><span style={{ width: `${fillPct}%` }} /></div>
              <div className="apex-oa-fill-endpoints"><small>{decimal(filled)} {symbol.split('-')[0]}</small><small>{decimal(size)} {symbol.split('-')[0]}</small></div>
            </div>

            <div className="apex-oa-section-label"><Activity size={13} /> Execution Snapshot</div>
            <div className="apex-oa-risk">
              <OrderRiskBar label="Fill Progress" pct={fillPct} tag={fillPct >= 100 ? 'Complete' : fillPct > 0 ? 'In progress' : 'Pending'} tone={fillPct >= 100 ? 'low' : fillPct > 0 ? 'medium' : 'high'} />
              <OrderRiskBar label="Price Deviation" pct={slippagePct === null ? 4 : Math.min(100, slippagePct * 40)} tag={slippagePct === null ? '—' : `${slippagePct.toFixed(2)}%`} tone={slippageTone} />
              <OrderRiskBar label="Order Age" pct={ageMinutes === null ? 4 : Math.min(100, (ageMinutes / 120) * 100)} tag={ageMinutes === null ? '—' : `${ageMinutes}m`} tone={ageTone} />
            </div>

            <div className="apex-oa-actions">
              <button type="button" className="apex-secondary-button full" onClick={() => void copyDetails(selectedOrder)}><Eye size={14} /> View Details</button>
              <button type="button" className="apex-secondary-button full" disabled title="Order amendments aren't available yet"><Pencil size={14} /> Amend Order</button>
            </div>
            <button type="button" className="apex-danger-button full" onClick={() => void cancel(orderId(selectedOrder))} disabled={status === 'cancelled' || status === 'filled' || canceling === orderId(selectedOrder)}><X size={14} /> {canceling === orderId(selectedOrder) ? 'Cancelling…' : 'Cancel Order'}</button>

            <div className="apex-oa-tip"><Clock size={14} /> {ageMinutes !== null && ageMinutes > 60 ? 'This order has been working for over an hour — review before leaving it open.' : 'Review fill price and order age before scaling size.'}</div>
          </>;
        })()}
      </aside>
    </div>
  </div>;
}

export function HistoryView(props: AccountViewProps) {
  if (!accountIsAvailable(props.connection)) return <LockedAccountState title="History" onConnect={props.onConnect} />;
  const history = [...rows(props.snapshot, 'positionHistory'), ...rows(props.snapshot, 'recentOrders')];
  return <div className="apex-page-stack apex-unified-page apex-history-page">
    <PageTitle title="History" subtitle={props.connection.mode === 'demo' ? 'Virtual fills and closed positions' : 'Real exchange position and order history'} icon={HistoryIcon} mode={props.connection.mode} onRefresh={props.onRefresh} loading={props.loading} />
    <div className="apex-page-mini-stats"><div><span>History records</span><strong>{history.length}</strong><small>Orders and positions</small></div><div><span>Environment</span><strong>{accountModeLabel(props.connection)}</strong><small>{props.connection.mode === 'demo' ? 'Virtual ledger' : 'KuCoin account'}</small></div><div><span>Sync status</span><strong className="positive">Current</strong><small>Latest account snapshot</small></div></div>
    <section className="apex-panel apex-section-card"><div className="apex-panel-head"><div><span>Account activity</span><small>Chronological fills, orders and closed-position events</small></div><HistoryIcon size={18} /></div>{history.length ? <ActivityTable activity={history} /> : <HonestEmpty label="No recent history was returned for this account." />}</section>
  </div>;
}

function PageTitle({ title, subtitle, eyebrow, icon: Icon = WalletCards, mode, onRefresh, loading }: { title: string; subtitle: string; eyebrow?: string; icon?: React.ComponentType<{ size?: number }>; mode: 'demo' | 'live'; onRefresh: () => Promise<void> | void; loading: boolean }) {
  return <div className="apex-page-heading apex-page-hero"><div className="apex-page-title-cluster"><span className="apex-page-hero-icon"><Icon size={21} /></span><div><span className="apex-eyebrow">{eyebrow || (mode === 'demo' ? 'Demo account · live data' : 'Live connected account')}</span><h1>{title}</h1><p>{subtitle}</p></div></div><button className="apex-secondary-button" onClick={() => void onRefresh()} type="button" disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} /> Refresh</button></div>;
}

export interface OrderTicketPanelProps {
  selectedTicker: SymbolTicker | null;
  connection: ConnectionState;
  onConnect: () => void;
  onRefresh: () => Promise<void> | void;
  onSelectSymbol?: (symbol: string) => void;
  tradePlanLong?: TradePlan | null;
  tradePlanShort?: TradePlan | null;
  settings: TerminalSettings;
  accountEquityUsd?: number | null;
  density?: 'default' | 'compact';
  pricePrefill?: { price: number; requestId: number } | null;
}

export function OrderTicketPanel({ selectedTicker, connection, onConnect, onRefresh, onSelectSymbol, tradePlanLong, tradePlanShort, settings, accountEquityUsd, density = 'default', pricePrefill = null }: OrderTicketPanelProps) {
  const [draft, setDraft] = useState<LiveOrderDraft>({
    symbol: selectedTicker?.symbol || '', side: 'buy', type: 'limit', quantity: 1,
    price: selectedTicker?.lastPrice || null, leverage: settings.defaultLeverage, marginMode: 'ISOLATED', timeInForce: 'GTC',
    reduceOnly: false, takeProfitPrice: null, stopLossPrice: null,
  });
  const [preview, setPreview] = useState<LiveOrderPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'info' | 'success' | 'warning' | 'error'; text: string; detail?: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [allocationPct, setAllocationPct] = useState(0);
  const [ticketTab, setTicketTab] = useState<'order' | 'alerts'>('order');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [appliedPlanId, setAppliedPlanId] = useState<string | null>(null);
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertPrice, setAlertPrice] = useState<number | null>(selectedTicker?.lastPrice || null);
  const [alertSaved, setAlertSaved] = useState(false);
  const transferredSymbolRef = useRef<string | null>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const closePreview = useCallback(() => {
    setPreview(null);
    setConfirmation('');
  }, []);
  const previewDialogRef = useDialogA11y<HTMLElement>({
    isOpen: Boolean(preview),
    onClose: closePreview,
    initialFocusRef: confirmationInputRef,
  });
  const availableConnection = accountIsAvailable(connection) ? connection : null;
  const connected = Boolean(availableConnection);
  const isDemo = connection.mode === 'demo';
  const executionUnlocked = connected && connection.executionState === 'unlocked';
  const referencePrice = draft.type === 'limit' ? draft.price : selectedTicker?.lastPrice || null;
  const estimatedNotional = referencePrice && draft.quantity > 0 ? referencePrice * draft.quantity : null;
  const indicativeFee = estimatedNotional === null ? null : estimatedNotional * 0.0006;
  const estimatedInitialMargin = estimatedNotional === null ? null : estimatedNotional / Math.max(1, draft.leverage);
  const orderBlockReason = !draft.symbol
    ? 'Select a verified market before reviewing.'
    : !executionUnlocked
    ? (connected ? 'Execution is read-only. Reconnect with live trading enabled before reviewing.' : 'Connect Demo or a verified KuCoin account before reviewing.')
    : draft.quantity <= 0
      ? 'Enter a size greater than zero before Review.'
      : draft.type === 'limit' && (!draft.price || draft.price <= 0)
        ? 'Enter a valid limit price before Review.'
        : null;
  const activePlan = draft.side === 'buy' ? tradePlanLong ?? null : tradePlanShort ?? null;
  const attachedPlan = activePlan && appliedPlanId === activePlan.id ? activePlan : null;

  // Live countdown for the open preview. A preview is single-use and expires
  // server-side (410 order_preview_expired); mirroring the countdown here means
  // the confirm control is withdrawn the instant it goes stale, so an expired
  // preview never *looks* confirmable. The interval only runs while a preview
  // is open.
  const previewMsLeft = preview ? Math.max(0, Date.parse(preview.expiresAt) - nowMs) : 0;
  const previewExpired = Boolean(preview) && previewMsLeft <= 0;
  const previewSecondsLeft = Math.ceil(previewMsLeft / 1000);
  useEffect(() => {
    if (!preview) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(timer);
  }, [preview]);

  useEffect(() => {
    if (!selectedTicker) return;
    const preserveTransferredPrice = transferredSymbolRef.current === selectedTicker.symbol;
    setDraft((current) => ({
      ...current,
      symbol: selectedTicker.symbol,
      price: current.type === 'limit'
        ? (preserveTransferredPrice && current.price ? current.price : selectedTicker.lastPrice)
        : null,
    }));
    if (preserveTransferredPrice) transferredSymbolRef.current = null;
    setPreview(null);
    setAppliedPlanId(null);
    setAllocationPct(0);
    setAlertPrice(selectedTicker.lastPrice);
    setAlertSaved(false);
  }, [selectedTicker?.symbol]);

  useEffect(() => {
    if (!pricePrefill || !Number.isFinite(pricePrefill.price)) return;
    setDraft((current) => ({ ...current, type: 'limit', price: pricePrefill.price }));
    setPreview(null);
    setFeedback({ tone: 'info', text: `Order price set from the ${selectedTicker?.symbol || draft.symbol} order book.` });
  }, [pricePrefill?.requestId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const transfer = parseOrderDraftTransfer(window.sessionStorage.getItem(ORDER_DRAFT_STORAGE_KEY));
    if (!transfer) return;
    window.sessionStorage.removeItem(ORDER_DRAFT_STORAGE_KEY);
    transferredSymbolRef.current = transfer.draft.symbol;
    setDraft(transfer.draft);
    setPreview(null);
    setConfirmation('');
    setAllocationPct(0);
    setFeedback({
      tone: 'info',
      text: transfer.intent === 'replace'
        ? `Replacement draft loaded from order ${transfer.sourceOrderId.slice(0, 12)}. Review and submit this new order, then cancel the original separately.`
        : `Duplicate draft loaded from order ${transfer.sourceOrderId.slice(0, 12)}. Review all values before submitting.`,
    });
    onSelectSymbol?.(transfer.draft.symbol);
  }, [onSelectSymbol]);

  const update = <K extends keyof LiveOrderDraft>(key: K, value: LiveOrderDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value })); setPreview(null); setAppliedPlanId(null); setFeedback(null);
  };

  const setOrderType = (type: 'market' | 'limit') => {
    setDraft((current) => ({
      ...current,
      type,
      price: type === 'limit' ? (selectedTicker?.lastPrice || current.price) : null,
    }));
    setPreview(null);
    setAppliedPlanId(null);
    setFeedback(null);
  };

  const applyAllocation = (percentage: number) => {
    setAllocationPct(percentage);
    const maxNotional = availableConnection?.maxOrderNotionalUsd || 0;
    const price = selectedTicker?.lastPrice || draft.price || 0;
    if (!maxNotional || !price) return;
    const estimatedContracts = Math.max(1, Math.floor((maxNotional * percentage / 100) / price));
    update('quantity', estimatedContracts);
  };

  const applyStrategyPlan = () => {
    if (!activePlan) return;
    setDraft((current) => ({
      ...current,
      symbol: activePlan.symbol,
      side: activePlan.direction === 'LONG' ? 'buy' : 'sell',
      type: activePlan.entryType === 'MARKET' ? 'market' : 'limit',
      price: activePlan.entryType === 'MARKET' ? null : activePlan.entryPrice,
      leverage: activePlan.leverage,
      takeProfitPrice: activePlan.takeProfitTargets[0],
      stopLossPrice: activePlan.stopLoss,
      reduceOnly: false,
    }));
    setAppliedPlanId(activePlan.id);
    setPreview(null);
    setAdvancedOpen(true);
    setFeedback(activePlan.valid
      ? {
          tone: 'info',
          text: `Strategy Trade Plan ${activePlan.id} attached.`,
          detail: 'Contract conversion and central risk approval will be verified in Review.',
        }
      : {
          tone: 'warning',
          text: 'Trade Plan attached for inspection, but it is not executable.',
          detail: activePlan.validationErrors.join(' '),
        });
  };

  const savePriceAlert = () => {
    if (!selectedTicker || alertPrice === null || !Number.isFinite(alertPrice)) return;
    const alert = {
      id: `${selectedTicker.symbol}-${Date.now()}`,
      symbol: selectedTicker.symbol,
      condition: alertCondition,
      price: alertPrice,
      createdAt: new Date().toISOString(),
    };
    try {
      const current = JSON.parse(window.localStorage.getItem(LOCAL_PRICE_ALERTS_KEY) || '[]');
      const next = Array.isArray(current) ? [alert, ...current].slice(0, 50) : [alert];
      window.localStorage.setItem(LOCAL_PRICE_ALERTS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(LOCAL_PRICE_ALERTS_EVENT));
      setAlertSaved(true);
    } catch {
      setAlertSaved(false);
    }
  };

  /**
   * Drop a preview that can no longer be confirmed and tell the operator why.
   *
   * Called both when the local countdown reaches zero and when the server
   * rejects a confirm with 410 `order_preview_expired`. Clearing `preview` and
   * `confirmation` together is what guarantees a stale quote cannot be
   * re-submitted: `submit()` returns early without a preview, and the typed
   * phrase never survives into the next quote.
   *
   * Recovery is deliberately MANUAL (a fresh Review the operator triggers), not
   * an automatic re-preview. Auto-refreshing would swap in a new price, margin
   * and risk decision underneath an already-typed confirmation phrase, so a
   * click intended for the old numbers could execute against materially
   * different ones. Previews are also single-use server-side, so a timer-driven
   * re-preview would burn quotes without anyone reading them.
   */
  const discardStalePreview = useCallback((friendly?: FriendlyOrderError) => {
    setPreview(null);
    setConfirmation('');
    setFeedback({
      tone: 'warning',
      text: friendly?.title || 'This order preview expired before it was confirmed.',
      detail: friendly?.detail
        || 'Prices and risk checks may have moved. Review the order again to get a fresh quote, then confirm.',
    });
  }, []);

  const review = async () => {
    setWorking(true); setFeedback(null); setConfirmation('');
    try { setPreview(await previewOrder(draft, attachedPlan)); }
    catch (error) {
      const friendly = describeOrderError(error instanceof Error ? error.message : 'order_preview_failed');
      setPreview(null);
      setFeedback({ tone: 'error', text: friendly.title, detail: friendly.detail });
    }
    finally { setWorking(false); }
  };

  /** Re-run Review from the expired dialog, so recovery is one obvious click. */
  const reviewAgain = () => {
    setPreview(null);
    setConfirmation('');
    void review();
  };

  const submit = async () => {
    if (!preview) return;
    // Last line of defence before the network call. The confirm control is
    // already withdrawn once the countdown elapses, but re-check here so a
    // queued click, a restored focus or a slow render can never turn an expired
    // preview into a live order.
    if (previewExpired) { discardStalePreview(); return; }
    setWorking(true); setFeedback(null);
    try {
      await submitLiveOrder(preview.id, confirmation);
      setFeedback({
        tone: 'success',
        text: isDemo ? 'Demo order accepted.' : 'Live order accepted by KuCoin.',
        detail: isDemo ? 'The virtual ledger is being refreshed.' : 'Account data is being refreshed.',
      });
      setPreview(null); setConfirmation(''); await onRefresh();
    } catch (error) {
      const friendly = describeOrderError(error instanceof Error ? error.message : 'live_order_submission_failed');
      // 410 order_preview_expired (and the risk-changed variant) mean this quote
      // is dead server-side. Discard it rather than leaving a dialog the
      // operator could keep clicking.
      if (friendly.kind === 'expired') discardStalePreview(friendly);
      else setFeedback({ tone: 'error', text: friendly.title, detail: friendly.detail });
    }
    finally { setWorking(false); }
  };

  return <>
    <aside className={`apex-order-ticket density-${density} ${ticketTab === 'order' && !executionUnlocked ? 'locked' : ''}`}>
      <div className="apex-ticket-reference-head">
        <div className="apex-ticket-reference-title">
          <strong>{ticketTab === 'order' ? 'Order Ticket' : 'Price Alert'}</strong>
          <small>{selectedTicker?.symbol || draft.symbol} · {ticketTab === 'order' ? `${isDemo ? 'virtual funds' : 'real account'} · risk ${settings.defaultRiskPct.toFixed(2)}%` : 'browser notification rule'}</small>
        </div>
        <div className="apex-ticket-top-tabs" role="tablist" aria-label="Trading sidebar">
          <button type="button" role="tab" aria-selected={ticketTab === 'order'} className={ticketTab === 'order' ? 'active' : ''} onClick={() => setTicketTab('order')}>Order</button>
          <button type="button" role="tab" aria-selected={ticketTab === 'alerts'} className={ticketTab === 'alerts' ? 'active' : ''} onClick={() => setTicketTab('alerts')}>Alerts</button>
        </div>
        <span className={`apex-ticket-mode ${executionUnlocked ? 'positive' : 'negative'}`}>{executionUnlocked ? (isDemo ? 'DEMO' : 'LIVE') : 'LOCKED'}</span>
      </div>

      {ticketTab === 'alerts' ? (
        <section className="apex-inline-alert-builder" role="tabpanel">
          <div className="apex-alert-condition-tabs">
            <button type="button" className={alertCondition === 'above' ? 'active' : ''} onClick={() => { setAlertCondition('above'); setAlertSaved(false); }}>Price above</button>
            <button type="button" className={alertCondition === 'below' ? 'active' : ''} onClick={() => { setAlertCondition('below'); setAlertSaved(false); }}>Price below</button>
          </div>
          <label>Trigger price (USDT)<FormattedNumberInput value={alertPrice} placeholder="0.00" maximumFractionDigits={8} step={selectedTicker?.lastPrice && selectedTicker.lastPrice < 1 ? 0.000001 : 0.01} steppers suffix="USDT" ariaLabel="Alert trigger price" onValueChange={(value) => { setAlertPrice(value); setAlertSaved(false); }} /></label>
          <div className="apex-alert-current-price"><span>Current market price</span><strong>{formatPrice(selectedTicker?.lastPrice)}</strong></div>
          <button className="apex-primary-button full" type="button" disabled={alertPrice === null} onClick={savePriceAlert}><Bell size={16} /> Create alert</button>
          {alertSaved && <div className="apex-ticket-message success"><CheckCircle2 size={15} /> Alert saved in this browser.</div>}
          <p className="apex-alert-helper">The alert rule stays inside the trading sidebar, so switching tabs does not reload the page.</p>
        </section>
      ) : (
        <>
          <ol className="apex-order-flow-steps" aria-label="Order workflow">
            <li className="active"><span>1</span><strong>Set Order</strong></li>
            <li className={working && !preview ? 'active' : ''}><span>2</span><strong>Review</strong></li>
            <li className={preview ? 'active' : ''}><span>3</span><strong>Confirm</strong></li>
          </ol>
          {!executionUnlocked && <div className="apex-ticket-lock"><LockKeyhole size={28} /><strong>Execution locked</strong><p>{connected ? 'Reconnect with live trading enabled.' : 'Verify your KuCoin API credentials in Settings.'}</p><button type="button" onClick={onConnect}>Open API settings</button></div>}
          <fieldset disabled={!executionUnlocked || working}>
            <div className="apex-buy-sell"><button type="button" className={draft.side === 'buy' ? 'active buy' : ''} onClick={() => update('side', 'buy')}>Buy / Long</button><button type="button" className={draft.side === 'sell' ? 'active sell' : ''} onClick={() => update('side', 'sell')}>Sell / Short</button></div>
            <div className="apex-ticket-order-types">
              <button type="button" className={draft.type === 'limit' ? 'active' : ''} onClick={() => setOrderType('limit')}>Limit</button>
              <button type="button" className={draft.type === 'market' ? 'active' : ''} onClick={() => setOrderType('market')}>Market</button>
              <button type="button" disabled title="Stop orders require an additional exchange API contract">Stop</button>
            </div>
            <div className="apex-form-pair apex-form-pair-ticket-first">
              <label>Price (USDT)<FormattedNumberInput value={draft.price} disabled={draft.type === 'market'} placeholder={draft.type === 'market' ? 'Market price' : '0.00'} maximumFractionDigits={8} step={selectedTicker?.lastPrice && selectedTicker.lastPrice < 1 ? 0.000001 : 0.01} steppers suffix="USDT" ariaLabel="Order price" onValueChange={(value) => update('price', value)} /></label>
              <label>Size (contracts)<FormattedNumberInput value={draft.quantity} min={1} maximumFractionDigits={0} step={1} steppers suffix="contracts" ariaLabel="Order size" onValueChange={(value) => update('quantity', Math.max(1, Math.round(value ?? 1)))} /></label>
            </div>
            <div className="apex-ticket-defaults" aria-label="Active trading defaults">
              <span><small>Risk default</small><strong>{settings.defaultRiskPct.toFixed(2)}%</strong></span>
              <span><small>Leverage default</small><strong>{settings.defaultLeverage}x</strong></span>
              <span><small>Sizing balance</small><strong>{formatCompactNumber(accountEquityUsd ?? settings.defaultAccountBalanceUsd, 'USDT')}</strong></span>
            </div>
            <div className="apex-allocation-control">
              <input aria-label="Order allocation percentage" type="range" min="0" max="100" step="25" value={allocationPct} style={{ '--allocation': `${allocationPct}%` } as React.CSSProperties} onChange={(event) => applyAllocation(Number(event.target.value))} />
              <div>{[0, 25, 50, 75, 100].map((percentage) => <button type="button" key={percentage} className={allocationPct === percentage ? 'active' : ''} onClick={() => applyAllocation(percentage)}>{percentage}%</button>)}</div>
            </div>
            <div className="apex-form-pair"><label>Leverage<FormattedNumberInput value={draft.leverage} min={1} max={100} maximumFractionDigits={0} step={1} steppers suffix="x" ariaLabel="Leverage" onValueChange={(value) => update('leverage', Math.max(1, Math.round(value ?? 1)))} /></label><label>Margin<select value={draft.marginMode} onChange={(e) => update('marginMode', e.target.value as 'ISOLATED' | 'CROSS')}><option value="ISOLATED">Isolated</option><option value="CROSS">Cross</option></select></label></div>

            {activePlan && (density === 'compact' ? <div className="apex-compact-plan-action" aria-label="Canonical strategy plan"><span><b>{activePlan.direction}</b> · Entry {formatPrice(activePlan.entryPrice)} · Stop {formatPrice(activePlan.stopLoss)} · T1 {formatPrice(activePlan.takeProfitTargets[0])} · {activePlan.netRiskReward.toFixed(2)}R</span><button type="button" className="apex-secondary-button" disabled={!activePlan.valid} onClick={applyStrategyPlan}>{attachedPlan ? 'Attached' : 'Apply'}</button></div> : <><TradePlanRiskReward plan={activePlan} currentPrice={selectedTicker?.lastPrice ?? null} /><div className="apex-inline-note"><div><strong>Canonical Trade Plan</strong><span>{activePlan.valid ? `Plan ${activePlan.id} · preview and confirmation still required` : `${activePlan.validationErrors.length} validation issue(s)`}</span></div><button type="button" className="apex-secondary-button" disabled={!activePlan.valid} onClick={applyStrategyPlan}>{attachedPlan ? 'Plan attached' : 'Apply plan'}</button></div></>)}

            <button type="button" className={`apex-advanced-toggle ${advancedOpen ? 'open' : ''}`} aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((current) => !current)}>
              <span><strong>Advanced options</strong><small>Take profit, stop loss, reduce only and time in force</small></span><ChevronDown size={17} />
            </button>
            {advancedOpen && <div className="apex-advanced-options">
              <div className="apex-form-pair"><label>Take profit<FormattedNumberInput value={draft.takeProfitPrice} placeholder="Optional" maximumFractionDigits={8} step={selectedTicker?.lastPrice && selectedTicker.lastPrice < 1 ? 0.000001 : 0.01} suffix="USDT" ariaLabel="Take profit price" onValueChange={(value) => update('takeProfitPrice', value)} /></label><label>Stop loss<FormattedNumberInput value={draft.stopLossPrice} placeholder="Optional" maximumFractionDigits={8} step={selectedTicker?.lastPrice && selectedTicker.lastPrice < 1 ? 0.000001 : 0.01} suffix="USDT" ariaLabel="Stop loss price" onValueChange={(value) => update('stopLossPrice', value)} /></label></div>
              <div className="apex-ticket-options"><label className="apex-checkbox"><input type="checkbox" checked={draft.reduceOnly} onChange={(e) => update('reduceOnly', e.target.checked)} /> Reduce only</label><label>Time in force<select value={draft.timeInForce} onChange={(event) => update('timeInForce', event.target.value as 'GTC' | 'IOC' | 'FOK')}><option value="GTC">GTC</option><option value="IOC">IOC</option><option value="FOK">FOK</option></select></label></div>
            </div>}
            <div className="apex-ticket-estimate apex-ticket-estimate-grid" aria-label="Pre-review order estimates">
              <div><span>Indicative notional</span><strong>{estimatedNotional == null ? '—' : `${formatCompactNumber(estimatedNotional)} USDT`}</strong></div>
              <div><span>Initial margin</span><strong>{estimatedInitialMargin == null ? 'Reviewed in quote' : `${formatCompactNumber(estimatedInitialMargin)} USDT`}</strong></div>
              <div><span>Est. fee</span><strong>{indicativeFee == null ? 'Reviewed in quote' : `${formatCompactNumber(indicativeFee)} USDT`}</strong></div>
              <div><span>Liq. estimate</span><strong>Risk review</strong></div>
              <small>Exact exchange contract notional, margin, fees and risk decision are recalculated in Review before Confirm unlocks.</small>
            </div>
            {orderBlockReason && <div className="apex-ticket-message warning compact" role="alert"><span><strong>Review blocked</strong><small>{orderBlockReason}</small></span></div>}
            <button className="apex-primary-button full" type="button" disabled={working || Boolean(orderBlockReason)} title={orderBlockReason || undefined} onClick={() => void review()}>{working ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />} {reviewOrderActionLabel(draft.side, isDemo ? 'demo' : 'live')}</button>
          </fieldset>
          {feedback && (
            <div className={`apex-ticket-message ${feedback.tone}`} role={feedback.tone === 'error' || feedback.tone === 'warning' ? 'alert' : 'status'}>
              <span><strong>{feedback.text}</strong>{feedback.detail ? <small>{feedback.detail}</small> : null}</span>
            </div>
          )}
        </>
      )}
    </aside>

    {preview && (
      <div className="apex-confirm-backdrop" role="presentation">
        <section
          ref={previewDialogRef}
          className={`apex-confirm-dialog ${preview.mode === 'demo' ? 'demo' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-confirm-title"
        >
          <button className="apex-dialog-close" type="button" aria-label="Close order confirmation" onClick={closePreview}><X size={18} /></button>
          <div className="apex-danger-icon"><AlertTriangle size={25} /></div>
          <span className="apex-eyebrow">{preview.mode === 'demo' ? 'Virtual execution confirmation' : 'Final exchange confirmation'}</span>
          <h2 id="order-confirm-title">{preview.mode === 'demo' ? 'This order uses virtual funds and real market prices' : 'This will place a real KuCoin Futures order'}</h2>
          <div className="apex-confirm-summary">
            <div><span>Market</span><strong>{normalizeSymbol(preview.order.symbol)}</strong></div>
            <div><span>Side</span><strong className={preview.order.side === 'buy' ? 'positive' : 'negative'}>{preview.order.side.toUpperCase()}</strong></div>
            <div><span>Estimated notional</span><strong>{money(preview.estimatedNotionalUsd)}</strong></div>
            <div><span>Estimated margin</span><strong>{money(preview.estimatedInitialMarginUsd)}</strong></div>
          </div>
          {preview.riskDecision && <div className="apex-inline-note"><strong>Risk Governor: {preview.riskDecision.decision.replace('_', ' ')}</strong><span>{preview.tradePlan ? `Trade Plan ${preview.tradePlan.id}` : 'Manual order'} · {preview.riskDecision.approvedQuantity} approved quantity</span></div>}
          {previewExpired ? (
            <>
              <p className="apex-confirm-expired" role="alert">
                <strong>Preview expired — review again.</strong>
                The market moved. Please review this order again before confirming.
              </p>
              <button className="apex-primary-button full" type="button" disabled={working} onClick={reviewAgain}>
                {working ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />} Review again at the current price
              </button>
            </>
          ) : (
            <>
              <p>Type <strong>{preview.confirmationPhrase}</strong> to submit this exact preview. It expires in {previewSecondsLeft}s (at {new Date(preview.expiresAt).toLocaleTimeString()}).</p>
              <input
                ref={confirmationInputRef}
                aria-label="Order confirmation phrase"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={preview.confirmationPhrase}
              />
              <button className={preview.mode === 'demo' ? 'apex-primary-button full' : 'apex-danger-button'} type="button" disabled={confirmation !== preview.confirmationPhrase || working} onClick={() => void submit()}>{working ? 'Submitting…' : submitOrderActionLabel(preview.order.side, preview.mode)}</button>
            </>
          )}
        </section>
      </div>
    )}
  </>;
}

export function RiskOverviewPanel(props: AccountViewProps) {
  const account = props.snapshot?.account;
  const equity = numberFrom(account, 'accountEquity', 'equity');
  const available = numberFrom(account, 'availableBalance', 'availableMargin');
  const positionMargin = numberFrom(account, 'positionMargin');
  const maintenanceMargin = numberFrom(account, 'maintMarginTotal', 'maintenanceMargin', 'maintMargin');
  const marginRatioPct = equity && positionMargin !== null ? Math.max(0, Math.min(100, (positionMargin / equity) * 100)) : null;
  const connected = accountIsAvailable(props.connection) && props.snapshot;

  return (
    <section className="apex-panel apex-risk-overview">
      <div className="apex-panel-head"><span>Risk Overview</span><ShieldCheck size={18} /></div>
      {connected ? <>
        <ColoredGauge
          value={marginRatioPct}
          inverse
          size={82}
          displayValue={marginRatioPct === null ? '—' : `${marginRatioPct.toFixed(2)}%`}
          label="Margin Ratio"
          className="apex-risk-gauge"
        />
        <dl className="apex-definition-list">
          <div><dt>Maintenance Margin</dt><dd>{money(maintenanceMargin)}</dd></div>
          <div><dt>Account Equity</dt><dd>{money(equity)}</dd></div>
          <div><dt>Available Balance</dt><dd>{money(available)}</dd></div>
        </dl>
      </> : <div className="apex-mini-lock"><LockKeyhole size={20} /><span>Connect an account to see live risk metrics.</span></div>}
    </section>
  );
}


interface TradingViewProps extends AccountViewProps {
  settings: TerminalSettings;
  tickers: SymbolTicker[];
  selectedTicker: SymbolTicker | null;
  onSelectSymbol: (symbol: string) => void;
  levels: DerivedLevels | null;
  longScore: CandidateScore | null;
  shortScore: CandidateScore | null;
  tradePlanLong: TradePlan | null;
  tradePlanShort: TradePlan | null;
  chartCandles: Candle[];
  chartOrderBook: OrderBookSummary | null;
  chartOrderBookLevels?: OrderBook | null;
  chartInterval: string;
  chartFeed: ChartFeedStatus;
  onRetryChart: () => void;
  onChartIntervalChange: (interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d') => void;
}


/**
 * Real cumulative order-book depth curve. Built from the actual bid/ask
 * price-level ladder (server already computes running `cumulative` per
 * level in marketDataService.buildOrderBookLevels) — this replaces the
 * previous decorative, data-less "mountain" placeholder that always drew
 * the same fixed gradient regardless of the real book.
 */
export function DepthCurveChart({ book, lastPrice }: { book: OrderBook | null; lastPrice: number | null }) {
  const bids = (book?.bids || []).slice(0, 20);
  const asks = (book?.asks || []).slice(0, 20);
  if (!bids.length || !asks.length) {
    return (
      <div className="apex-depth-curve-empty">
        <Loader2 className="spin" size={16} /> Waiting for a live order-book snapshot…
      </div>
    );
  }

  const maxCumulative = Math.max(bids[bids.length - 1].cumulative, asks[asks.length - 1].cumulative) || 1;
  const W = 300, H = 100, MID = W / 2, TOP_PAD = 8;
  const yFor = (cumulative: number) => H - (cumulative / maxCumulative) * (H - TOP_PAD);
  const xForBid = (i: number) => bids.length > 1 ? MID - (i / (bids.length - 1)) * MID : MID;
  const xForAsk = (i: number) => asks.length > 1 ? MID + (i / (asks.length - 1)) * MID : MID;

  let bidPath = `M ${MID} ${H} L ${MID} ${yFor(bids[0].cumulative)}`;
  bids.forEach((level, i) => {
    if (i === 0) return;
    const prevY = yFor(bids[i - 1].cumulative);
    bidPath += ` L ${xForBid(i)} ${prevY} L ${xForBid(i)} ${yFor(level.cumulative)}`;
  });
  bidPath += ` L ${xForBid(bids.length - 1)} ${H} Z`;

  let askPath = `M ${MID} ${H} L ${MID} ${yFor(asks[0].cumulative)}`;
  asks.forEach((level, i) => {
    if (i === 0) return;
    const prevY = yFor(asks[i - 1].cumulative);
    askPath += ` L ${xForAsk(i)} ${prevY} L ${xForAsk(i)} ${yFor(level.cumulative)}`;
  });
  askPath += ` L ${xForAsk(asks.length - 1)} ${H} Z`;

  const worstBid = bids[bids.length - 1].price;
  const worstAsk = asks[asks.length - 1].price;

  return (
    <div className="apex-depth-curve">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Order book cumulative depth">
        <line x1={MID} y1="0" x2={MID} y2={H} className="apex-depth-curve-mid" />
        <path d={bidPath} className="apex-depth-curve-bid" />
        <path d={askPath} className="apex-depth-curve-ask" />
      </svg>
      <div className="apex-depth-curve-labels">
        <span>{formatPrice(worstBid)}</span>
        <strong>{formatPrice(lastPrice)}</strong>
        <span>{formatPrice(worstAsk)}</span>
      </div>
    </div>
  );
}

export function MarketDepthPanel({
  orderBook,
  levels,
  symbol,
  lastPrice,
  density = 'expanded',
  ageMs = null,
  onPickPrice,
}: {
  orderBook: OrderBookSummary | null;
  levels?: OrderBook | null;
  symbol: string;
  lastPrice: number | null;
  density?: 'compact' | 'expanded';
  ageMs?: number | null;
  onPickPrice?: (price: number) => void;
}) {
  const bids = (levels?.bids || []).slice(0, density === 'compact' ? 5 : 12);
  const asks = (levels?.asks || []).slice(0, density === 'compact' ? 5 : 12);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid !== null && bestAsk !== null ? Math.max(0, bestAsk - bestBid) : null;
  const spreadBps = spread !== null && bestBid ? (spread / bestBid) * 10_000 : null;
  const bidDepth = orderBook?.bidDepthUsd ?? 0;
  const askDepth = orderBook?.askDepthUsd ?? 0;
  const totalDepth = Math.max(bidDepth + askDepth, 1);
  const bidPct = (bidDepth / totalDepth) * 100;
  const state = orderBook?.dataState || levels?.dataSource || 'unavailable';
  const uiState: UiDataState = state === 'live' ? 'live' : state === 'degraded' ? 'partial' : 'unavailable';
  const ageLabel = ageMs === null || !Number.isFinite(ageMs)
    ? 'Age unavailable'
    : ageMs < 1_000
      ? 'Updated now'
      : ageMs < 60_000
        ? `${Math.floor(ageMs / 1_000)}s old`
        : `${Math.floor(ageMs / 60_000)}m old`;

  const renderRows = (rows: OrderBook['asks'], side: 'ask' | 'bid') => rows.map((level) => (
    <button
      type="button"
      className={`apex-depth-level ${side}`}
      key={`${side}-${level.price}`}
      onClick={() => onPickPrice?.(level.price)}
      disabled={!onPickPrice}
      title={onPickPrice ? `Set order price to ${formatPrice(level.price)}` : undefined}
    >
      <i aria-hidden="true" style={{ width: `${Math.max(2, Math.min(100, level.percentage))}%` }} />
      <span>{formatPrice(level.price)}</span>
      <span>{decimal(level.volume, 4)}</span>
      <span>{decimal(level.cumulative, 4)}</span>
    </button>
  ));

  return (
    <section className={`apex-panel apex-market-depth-card density-${density}`} aria-label={`${symbol} order book`}>
      <div className="apex-panel-head">
        <div><span>Order Book</span><small>{symbol} · executable exchange levels · {ageLabel}</small></div>
        <StatusBadge state={uiState} label={state.toUpperCase()} />
      </div>
      {onPickPrice && <p className="apex-depth-click-hint"><CircleDollarSign size={13} /> Click a price to prefill the ticket.</p>}
      <div className="apex-depth-summary">
        <div><span>Best bid</span><strong className="positive">{formatPrice(bestBid)}</strong></div>
        <div><span>Spread</span><strong>{spread === null ? '—' : `${formatPrice(spread)}${spreadBps === null ? '' : ` · ${spreadBps.toFixed(1)} bps`}`}</strong></div>
        <div><span>Best ask</span><strong className="negative">{formatPrice(bestAsk)}</strong></div>
      </div>
      <div className="apex-depth-columns" aria-hidden="true"><span>Price</span><span>Size</span><span>Cumulative</span></div>
      {asks.length && bids.length ? (
        <div className="apex-depth-real-ladder">
          <div className="apex-depth-side asks">{renderRows([...asks].reverse(), 'ask')}</div>
          <div className="apex-depth-mid"><span>Last</span><strong>{formatPrice(lastPrice)}</strong><small>{spreadBps === null ? 'Spread unavailable' : `${spreadBps.toFixed(1)} bps spread`}</small></div>
          <div className="apex-depth-side bids">{renderRows(bids, 'bid')}</div>
        </div>
      ) : (
        <div className="apex-depth-levels-empty"><Layers3 size={18} /><span>Level data is unavailable. No synthetic ladder is displayed.</span></div>
      )}
      <div className="apex-depth-bars" aria-label={`Bid share ${bidPct.toFixed(1)} percent`}><div className="bid" style={{ width: `${bidPct}%` }} /><div className="ask" style={{ width: `${100 - bidPct}%` }} /></div>
      <div className="apex-depth-values"><div><span>Bid depth</span><strong className="positive">{formatCompactNumber(bidDepth, 'USDT')}</strong></div><div><span>Ask depth</span><strong className="negative">{formatCompactNumber(askDepth, 'USDT')}</strong></div></div>
      {density === 'expanded' && <DepthCurveChart book={levels ?? null} lastPrice={lastPrice} />}
    </section>
  );
}

export function RecentTradesPanel({ activity }: { activity: Array<Record<string, unknown>> }) {
  return (
    <section className="apex-panel apex-recent-trades-card">
      <div className="apex-panel-head"><div><span>Recent Trades</span><small>Latest account fills</small></div><HistoryIcon size={16} /></div>
      {activity.length ? <ActivityTable activity={activity.slice(0, 6)} /> : <HonestEmpty label="No recent account fills yet." />}
    </section>
  );
}

export interface SystemLinkContext {
  strategyName?: string;
  direction: string;
  interval: string;
  lastBacktest?: { netReturnPct: number; maxDrawdownPct: number; trades: number } | null;
}

export function SystemLinkPanel({ context }: { context: SystemLinkContext }) {
  return (
    <section className="apex-panel apex-trading-system-bridge">
      <div className="apex-panel-head"><div><span>Strategy Context</span><small>Active strategy and validation context</small></div><Link2 size={16} /></div>
      <div className="apex-trading-bridge-context">
        <span><small>Active strategy</small><strong>{context.strategyName || 'No strategy selected'}</strong></span>
        <span><small>Context</small><strong>{context.direction} · {context.interval}</strong></span>
      </div>
      {context.lastBacktest ? (
        <div className="apex-trading-bridge-result">
          <div><span>Net return</span><strong className={context.lastBacktest.netReturnPct >= 0 ? 'positive' : 'negative'}>{context.lastBacktest.netReturnPct.toFixed(2)}%</strong></div>
          <div><span>Max drawdown</span><strong>{context.lastBacktest.maxDrawdownPct.toFixed(2)}%</strong></div>
          <div><span>Trades</span><strong>{context.lastBacktest.trades}</strong></div>
        </div>
      ) : <p className="apex-trading-bridge-empty">Run a strategy backtest to attach verified evidence to this trading context.</p>}
      <div className="apex-trading-bridge-actions">
        <button type="button" onClick={() => navigateWorkspace('strategies')}>Strategies</button>
        <button type="button" onClick={() => navigateWorkspace('backtesting')}><FlaskConical size={13} /> Backtest</button>
      </div>
    </section>
  );
}

interface SetupIntelligenceProps {
  symbol: string;
  levels: DerivedLevels | null;
  longScore: CandidateScore | null;
  shortScore: CandidateScore | null;
  intelligenceDirection: 'LONG' | 'SHORT' | null;
  intelligencePlan: TradePlan | null;
  intelligenceCandidate: CandidateScore | null;
  currentPrice: number | null;
}

export function SetupIntelligencePanel({ symbol, levels, longScore, shortScore, intelligenceDirection, intelligencePlan, intelligenceCandidate, currentPrice }: SetupIntelligenceProps) {
  const scores = { long: longScore?.score ?? null, short: shortScore?.score ?? null };
  return (
    <section className="apex-panel apex-trading-signal-card">
      <div className="apex-panel-head"><div><span>Setup Intelligence</span><small>Current scanner context for {symbol}</small></div></div>
      <div className="apex-signal-grid compact"><div><span>Long</span><strong className="positive">{scores.long ?? '—'}</strong><small>{longScore?.readinessTier || 'Unavailable'}</small></div><div><span>Short</span><strong className="negative">{scores.short ?? '—'}</strong><small>{shortScore?.readinessTier || 'Unavailable'}</small></div><div><span>Entry</span><strong>{formatPrice(levels?.entry)}</strong><small>{levels?.method || 'Unavailable'}</small></div><div><span>Confidence</span><strong>{levels ? `${levels.confidenceScore}%` : '—'}</strong><small>Structure</small></div></div>

      {(longScore || shortScore) && (
        <div className="apex-signal-factor-breakdown">
          <span className="apex-eyebrow">Score factors</span>
          {[
            { label: 'Momentum', long: longScore?.momentumScore, short: shortScore?.momentumScore },
            { label: 'Order flow', long: longScore?.orderFlowScore, short: shortScore?.orderFlowScore },
            { label: 'Structure', long: longScore?.structureScore, short: shortScore?.structureScore },
            { label: 'Funding', long: longScore?.fundingScore, short: shortScore?.fundingScore },
            { label: 'Liquidity', long: longScore?.liquidityScore, short: shortScore?.liquidityScore },
          ].map((factor) => {
            const value = factor.long ?? factor.short ?? null;
            return (
              <div className="apex-signal-factor-row" key={factor.label}>
                <span>{factor.label}</span>
                <div className="apex-signal-factor-bar"><i style={{ width: `${value ?? 0}%` }} /></div>
                <strong>{value === null ? '—' : Math.round(value)}</strong>
              </div>
            );
          })}
        </div>
      )}

      <div className="apex-signal-confluence">
        <span>Timeframe confluence</span>
        <div>
          <em className={(longScore?.timeframeDetails?.tf15m ?? shortScore?.timeframeDetails?.tf15m) === 'BULLISH' ? 'positive' : (longScore?.timeframeDetails?.tf15m ?? shortScore?.timeframeDetails?.tf15m) === 'BEARISH' ? 'negative' : ''}>15m {(longScore?.timeframeDetails?.tf15m ?? shortScore?.timeframeDetails?.tf15m ?? '—').toLowerCase()}</em>
          <em className={(longScore?.timeframeDetails?.tf1h ?? shortScore?.timeframeDetails?.tf1h) === 'BULLISH' ? 'positive' : (longScore?.timeframeDetails?.tf1h ?? shortScore?.timeframeDetails?.tf1h) === 'BEARISH' ? 'negative' : ''}>1h {(longScore?.timeframeDetails?.tf1h ?? shortScore?.timeframeDetails?.tf1h ?? '—').toLowerCase()}</em>
          <em className={longScore?.timeframeConfluence || shortScore?.timeframeConfluence ? 'positive' : ''}>{(longScore?.timeframeConfluence || shortScore?.timeframeConfluence) ? 'Aligned' : 'Mixed'}</em>
        </div>
      </div>

      {intelligenceDirection && (levels || intelligencePlan) && <ExecutionIntelligence
        direction={intelligenceDirection}
        levels={levels}
        plan={intelligencePlan}
        candidate={intelligenceCandidate}
        currentPrice={currentPrice}
      />}
    </section>
  );
}

type TradingActivityTab = 'positions' | 'orders' | 'trades' | 'alerts' | 'performance' | 'logs';

interface TradingActivitySummary {
  equityUsd: number | null;
  availableUsd: number | null;
  usedMarginUsd: number | null;
  marginRatioPct: number | null;
  unrealizedPnlUsd: number | null;
}

function TradingActivityPanel({
  connected,
  mode,
  executionState,
  positions,
  orders,
  trades,
  alerts,
  summary,
  expanded,
  onToggleExpanded,
}: {
  connected: boolean;
  mode: 'demo' | 'live';
  executionState: string;
  positions: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  trades: Array<Record<string, unknown>>;
  alerts: LocalPriceAlert[];
  summary: TradingActivitySummary;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [active, setActive] = useState<TradingActivityTab>('positions');
  const tabs = [
    { id: 'positions' as const, label: 'Positions', count: positions.length },
    { id: 'orders' as const, label: 'Orders', count: orders.length },
    { id: 'trades' as const, label: 'Trades', count: trades.length },
    { id: 'alerts' as const, label: 'Alerts', count: alerts.length },
    { id: 'performance' as const, label: 'Performance' },
    { id: 'logs' as const, label: 'Logs' },
  ];
  const filledTrades = trades.filter((row) => numberFrom(row, 'dealSize', 'filledSize', 'size') !== null);
  const realizedPnl = trades.reduce((sum, row) => sum + (numberFrom(row, 'realisedPnl', 'realizedPnl', 'pnl') || 0), 0);
  const positiveTrades = trades.filter((row) => (numberFrom(row, 'realisedPnl', 'realizedPnl', 'pnl') || 0) > 0).length;
  const winRate = trades.length ? (positiveTrades / trades.length) * 100 : null;
  const logRows = [
    { label: 'Account mode', value: mode.toUpperCase(), detail: connected ? 'Snapshot data is available.' : 'Switch to Demo or connect an API key.' },
    { label: 'Execution state', value: executionState === 'unlocked' ? 'Unlocked' : 'Read only / locked', detail: executionState === 'unlocked' ? 'Review remains required before any order can be confirmed.' : 'Trading actions stay blocked.' },
    { label: 'Open order monitor', value: `${orders.length} working`, detail: 'Current account snapshot; open the Orders workspace for full controls.' },
  ];
  const activityStatus = `${positions.length} positions · ${orders.length} orders · ${trades.length} trades`;

  return (
    <section className={`apex-panel apex-trading-activity-card ${expanded ? 'is-open' : 'is-collapsed'}`}>
      <div className="apex-panel-head apex-activity-slide-head">
        <button
          type="button"
          className="apex-activity-slide-toggle"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls="apex-trading-activity-content"
          title={expanded ? 'Collapse Account Activity' : 'Expand Account Activity'}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          <span>{expanded ? 'Hide account activity' : 'Show account activity'}</span>
        </button>
        <div className="apex-activity-head-title"><span>Account Activity</span><small>{expanded ? 'Monitor exposure, orders, alerts, performance and session state' : activityStatus}</small></div>
        <div className="apex-activity-head-kpis" aria-hidden={expanded}>
          <span><small>Equity</small><strong>{money(summary.equityUsd)}</strong></span>
          <span><small>P&amp;L</small><strong className={signedClass(summary.unrealizedPnlUsd)}>{money(summary.unrealizedPnlUsd)}</strong></span>
        </div>
        <button type="button" className="apex-link-button" onClick={() => navigateWorkspace(active === 'positions' ? 'positions' : active === 'orders' ? 'orders' : active === 'alerts' ? 'alerts' : active === 'performance' ? 'analytics' : active === 'logs' ? 'history' : 'history')}>Open full workspace</button>
      </div>
      <div id="apex-trading-activity-content" className="apex-activity-slide-body" hidden={!expanded}>
      <Tabs label="Trading account activity" tabs={tabs} active={active} onChange={setActive}>
        {!connected && active !== 'alerts' && active !== 'logs' ? <div className="apex-table-locked"><LockKeyhole size={18} /> Switch to Demo or connect a verified account to view account activity.</div>
          : active === 'positions' ? (positions.length ? <PositionsTable positions={positions.slice(0, 6)} /> : <HonestEmpty label={`No open ${mode} positions.`} />)
            : active === 'orders' ? (orders.length ? <ActivityTable activity={orders.slice(0, 8)} /> : <HonestEmpty label="No open orders in this account." />)
              : active === 'trades' ? (trades.length ? <ActivityTable activity={trades.slice(0, 8)} /> : <HonestEmpty label="No recent account fills yet." />)
                : active === 'alerts' ? (alerts.length ? <div className="apex-trading-alert-list">{alerts.slice(0, 8).map((alert) => <div key={alert.id} className="apex-trading-alert-row"><Bell size={15} /><span><strong>{alert.symbol}</strong><small>Price {alert.condition} {formatPrice(alert.price)}</small></span><time>{new Date(alert.createdAt).toLocaleString()}</time></div>)}</div> : <HonestEmpty label="No local Trading price alerts yet. Use the Ticket → Alerts tab to create one." />)
                  : active === 'performance' ? <div className="apex-trading-performance-grid"><div><span>Filled rows</span><strong>{filledTrades.length}</strong><small>From current account snapshot</small></div><div><span>Realized P&amp;L</span><strong className={signedClass(realizedPnl)}>{money(realizedPnl)}</strong><small>Reported fills only</small></div><div><span>Win rate</span><strong>{winRate === null ? '—' : `${winRate.toFixed(1)}%`}</strong><small>{trades.length ? `${positiveTrades}/${trades.length} positive` : 'No realized fill P&L available'}</small></div></div>
                    : <div className="apex-trading-log-list">{logRows.map((row) => <div key={row.label} className="apex-trading-log-row"><ScrollText size={15} /><span><strong>{row.label}</strong><small>{row.detail}</small></span><em>{row.value}</em></div>)}</div>}
      </Tabs>
      <div className="apex-activity-summary-strip" aria-label="Trading account summary">
        <span><small>Equity</small><strong>{money(summary.equityUsd)}</strong></span>
        <span><small>Available</small><strong>{money(summary.availableUsd)}</strong></span>
        <span><small>Used margin</small><strong>{money(summary.usedMarginUsd)}</strong></span>
        <span><small>Margin ratio</small><strong>{summary.marginRatioPct === null ? '—' : `${summary.marginRatioPct.toFixed(2)}%`}</strong></span>
        <span><small>Unrealized P&amp;L</small><strong className={signedClass(summary.unrealizedPnlUsd)}>{money(summary.unrealizedPnlUsd)}</strong></span>
      </div>
      </div>
    </section>
  );
}

function TradingViewCore({ settings, tickers = [], selectedTicker, onSelectSymbol, levels, longScore, shortScore, tradePlanLong, tradePlanShort, chartCandles, chartOrderBook, chartOrderBookLevels, chartInterval, chartFeed, onRetryChart, onChartIntervalChange, ...accountProps }: TradingViewProps) {
  const availableConnection = accountIsAvailable(accountProps.connection) ? accountProps.connection : null;
  const connected = Boolean(availableConnection);
  const isDemo = accountProps.connection.mode === 'demo';
  const executionUnlocked = connected && accountProps.connection.executionState === 'unlocked';
  const tabdealAccount = useTabdealAccount(selectedTicker?.symbol);
  const routeRef = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(() => typeof window === 'undefined' ? 1160 : Math.max(0, window.innerWidth - 184));
  const [closeToolRequest, setCloseToolRequest] = useState(0);
  const [pricePrefill, setPricePrefill] = useState<{ price: number; requestId: number } | null>(null);
  const [localAlerts, setLocalAlerts] = useState<LocalPriceAlert[]>(() => readLocalPriceAlerts());
  const [activityOpen, setActivityOpen] = useState(() => readTradingActivityOpen());
  const [toolboxState, setToolboxState] = useState<TradingToolboxState>({
    active: null,
    docked: false,
    mode: 'desktop-expanders',
    pinnedTools: [],
    executionDockWidthPx: 338,
    railOpen: false,
  });

  useEffect(() => {
    const route = routeRef.current;
    if (!route || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWorkspaceWidth(Math.max(0, entry.contentRect.width)));
    observer.observe(route);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const refreshAlerts = () => setLocalAlerts(readLocalPriceAlerts());
    window.addEventListener(LOCAL_PRICE_ALERTS_EVENT, refreshAlerts);
    window.addEventListener('storage', refreshAlerts);
    return () => {
      window.removeEventListener(LOCAL_PRICE_ALERTS_EVENT, refreshAlerts);
      window.removeEventListener('storage', refreshAlerts);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(TRADING_ACTIVITY_OPEN_STORAGE_KEY, activityOpen ? 'true' : 'false');
    } catch {
      // Persistence is optional in private or embedded browser contexts.
    }
  }, [activityOpen]);

  const openPositions = rows(accountProps.snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true);
  const observedPositionPnl = openPositions.map((row) => numberFrom(row, 'unrealisedPnl', 'unrealizedPnl')).filter((value): value is number => value !== null);
  const observedPositionMargin = openPositions.map((row) => numberFrom(row, 'posInit', 'positionMargin')).filter((value): value is number => value !== null);
  const openPositionsPnl = observedPositionPnl.length ? observedPositionPnl.reduce((sum, value) => sum + value, 0) : null;
  const openPositionsMargin = observedPositionMargin.length ? observedPositionMargin.reduce((sum, value) => sum + value, 0) : null;
  const scores = useMemo(() => ({ long: longScore?.score ?? null, short: shortScore?.score ?? null }), [longScore, shortScore]);
  const intelligenceDirection: 'LONG' | 'SHORT' | null = scores.long === null && scores.short === null
    ? null
    : scores.long !== null && scores.short === null
      ? 'LONG'
      : scores.short !== null && scores.long === null
        ? 'SHORT'
        : scores.long! > scores.short!
          ? 'LONG'
          : scores.short! > scores.long!
            ? 'SHORT'
            : null;
  const intelligenceCandidate = intelligenceDirection === 'LONG' ? longScore : intelligenceDirection === 'SHORT' ? shortScore : null;
  const intelligencePlan = intelligenceDirection === 'LONG' ? tradePlanLong : intelligenceDirection === 'SHORT' ? tradePlanShort : null;
  const [systemContext, setSystemContext] = useState(() => readWorkspaceContext() ?? null);
  const accountEquityUsd = numberFrom(accountProps.snapshot?.account, 'accountEquity', 'equity');

  useEffect(() => {
    const contextSymbol = selectedTicker?.symbol || systemContext?.symbol || undefined;
    const preservedDirection = contextSymbol && systemContext?.symbol === contextSymbol ? systemContext?.direction : undefined;
    const next = writeWorkspaceContext({
      source: 'trading',
      symbol: contextSymbol,
      direction: preservedDirection || intelligenceDirection || undefined,
      interval: (['5m', '15m', '1h', '4h', '1d'].includes(chartInterval) ? chartInterval : '1h') as '5m' | '15m' | '1h' | '4h' | '1d',
      strategyId: systemContext?.strategyId,
      strategyName: systemContext?.strategyName,
    });
    setSystemContext(next);
  }, [selectedTicker?.symbol, chartInterval, intelligenceDirection]);

  const recentTrades = rows(accountProps.snapshot, 'recentTrades');
  const openOrders = rows(accountProps.snapshot, 'openOrders');
  const expandedTool = toolboxState.railOpen && toolboxState.mode === 'desktop-expanders' && (toolboxState.active === 'order' || toolboxState.active === 'depth')
    ? toolboxState.active
    : null;

  const activeEvidenceIdentity = {
    strategyId: systemContext?.strategyId,
    symbol: selectedTicker?.symbol || systemContext?.symbol,
    direction: systemContext?.direction || intelligenceDirection || undefined,
    interval: (['5m', '15m', '1h', '4h', '1d'].includes(chartInterval) ? chartInterval : undefined) as '5m' | '15m' | '1h' | '4h' | '1d' | undefined,
  };
  const systemLinkContext: SystemLinkContext = {
    strategyName: systemContext?.strategyName || undefined,
    direction: activeEvidenceIdentity.direction ?? 'UNKNOWN',
    interval: chartInterval,
    lastBacktest: matchesBacktestEvidence(systemContext, activeEvidenceIdentity)
      ? systemContext?.lastBacktest ?? null
      : null,
  };

  const pickDepthPrice = (price: number) => {
    setPricePrefill((current) => ({ price, requestId: (current?.requestId ?? 0) + 1 }));
  };

  const equityUsd = numberFrom(accountProps.snapshot?.account, 'accountEquity', 'equity');
  const usedMarginUsd = numberFrom(accountProps.snapshot?.account, 'positionMargin', 'usedMargin');
  const activitySummary: TradingActivitySummary = {
    equityUsd,
    availableUsd: numberFrom(accountProps.snapshot?.account, 'availableBalance', 'availableMargin'),
    usedMarginUsd,
    marginRatioPct: equityUsd && usedMarginUsd !== null ? Math.max(0, (usedMarginUsd / equityUsd) * 100) : null,
    unrealizedPnlUsd: openPositionsPnl,
  };

  const orderTicket = (
    <OrderTicketPanel
      selectedTicker={selectedTicker}
      connection={accountProps.connection}
      onConnect={accountProps.onConnect}
      onRefresh={accountProps.onRefresh}
      onSelectSymbol={onSelectSymbol}
      tradePlanLong={tradePlanLong}
      tradePlanShort={tradePlanShort}
      settings={settings}
      accountEquityUsd={accountEquityUsd}
      density="compact"
      pricePrefill={pricePrefill}
    />
  );
  const depthPanel = (
    <MarketDepthPanel
      orderBook={chartOrderBook}
      levels={chartOrderBookLevels}
      symbol={selectedTicker?.symbol || 'UNAVAILABLE'}
      lastPrice={selectedTicker?.lastPrice ?? null}
      density={expandedTool === 'depth' ? 'expanded' : 'compact'}
      ageMs={chartFeed.ageMs}
      onPickPrice={pickDepthPrice}
    />
  );
  const riskPanel = (
    <section className="apex-panel apex-risk-context-card">
      <div className="apex-panel-head"><div><span>Risk Overview</span><small>Current account capacity</small></div></div>
      {availableConnection ? <>
        {numberFrom(accountProps.snapshot?.account, 'positionMargin') !== null && numberFrom(accountProps.snapshot?.account, 'accountEquity') !== null && (numberFrom(accountProps.snapshot?.account, 'accountEquity') ?? 0) > 0 ? <ColoredGauge value={Math.min(100, ((numberFrom(accountProps.snapshot?.account, 'positionMargin') ?? 0) / (numberFrom(accountProps.snapshot?.account, 'accountEquity') ?? 1)) * 100)} inverse size={92} label="Margin utilization" /> : <HonestEmpty label="Margin utilization unavailable — required account values are missing." />}
        <dl className="apex-definition-list"><div><dt>Available balance</dt><dd>{money(numberFrom(accountProps.snapshot?.account, 'availableBalance'))}</dd></div><div><dt>Max order notional</dt><dd>{money(availableConnection.maxOrderNotionalUsd)}</dd></div><div><dt>Open positions</dt><dd>{openPositions.length}</dd></div><div><dt>Execution state</dt><dd className={executionUnlocked ? 'positive' : 'negative'}>{isDemo ? 'Virtual execution' : executionUnlocked ? 'Unlocked' : 'Read only'}</dd></div><div><dt>Tabdeal secondary</dt><dd>{tabdealAccount.connection.status.replaceAll('_', ' ')}</dd></div><div><dt>Tabdeal available</dt><dd>{money(tabdealAccount.insights?.account.availableBalanceUsd ?? null)}</dd></div></dl>
        <TabdealCapabilityMatrix compact />
      </> : <div className="apex-mini-lock"><LockKeyhole size={20} /><span>Switch to Demo or connect a verified account to unlock the ticket.</span></div>}
    </section>
  );
  const renderStrategyContextPanel = () => <SystemLinkPanel context={systemLinkContext} />;

  const closeInlineTool = () => setCloseToolRequest((current) => current + 1);
  const activeMarketSymbols = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
  const displayTickers = useMemo(() => {
    const prioritized = [
      selectedTicker,
      ...activeMarketSymbols.map((symbol) => tickers.find((ticker) => ticker.symbol === symbol) ?? null),
      ...tickers,
    ].filter((ticker): ticker is SymbolTicker => Boolean(ticker));
    return prioritized.filter((ticker, index, rows) => rows.findIndex((candidate) => candidate.symbol === ticker.symbol) === index).slice(0, 3);
  }, [selectedTicker, tickers]);
  const tradingHeaderSlot = typeof document === 'undefined' ? null : document.getElementById('apex-trading-header-slot');
  const marketStrip = (
    <div className="apex-market-strip apex-market-strip-rich" aria-label="Quick market selector">
      <button type="button" className="apex-market-strip-overview" onClick={() => navigateWorkspace('overview')} aria-label="Open Market Overview">
        <span>
          <small>Desk</small>
          <strong>Market Overview</strong>
        </span>
      </button>
      {displayTickers.map((ticker) => (
        <button
          type="button"
          key={ticker.symbol}
          className={ticker.symbol === selectedTicker?.symbol ? 'active' : ''}
          aria-pressed={ticker.symbol === selectedTicker?.symbol}
          aria-label={`Select ${ticker.symbol}`}
          onClick={() => onSelectSymbol(ticker.symbol)}
        >
          <CoinIcon symbol={ticker.symbol} size={20} />
          <span className="apex-market-strip-copy">
            <strong>{ticker.symbol.replace('-USDT', 'USDT')}</strong>
            <small>{formatPrice(ticker.lastPrice)}</small>
          </span>
          <em className={signedClass(ticker.priceChange24hPct)}>
            <small>24h</small>
            <strong>{formatPercent(ticker.priceChange24hPct)}</strong>
          </em>
        </button>
      ))}
      <button type="button" className="apex-market-strip-more" onClick={() => navigateWorkspace('markets')} aria-label="Open More Markets workspace">
        <MoreHorizontal size={16} />
        <span>
          <small>Explore</small>
          <strong>More Markets</strong>
        </span>
      </button>
    </div>
  );
  const rootClasses = [
    'apex-trading-terminal',
    'apex-trading-modern',
    toolboxState.railOpen ? 'tool-rail-open' : 'tool-rail-closed',
    toolboxState.active ? 'tool-open' : '',
    toolboxState.active && toolboxState.docked ? 'tool-docked' : 'tool-undocked',
    expandedTool ? `expand-${expandedTool}` : '',
    activityOpen ? 'activity-open' : 'activity-collapsed',
  ].filter(Boolean).join(' ');

  return <div
    ref={routeRef}
    className={rootClasses}
    style={{ '--apex-execution-dock-width': `${toolboxState.executionDockWidthPx}px` } as React.CSSProperties}
  >
    <div className="apex-page-stack apex-unified-page trading-page apex-trading-page-enhanced">
      {workspaceWidth >= 1180 && tradingHeaderSlot ? createPortal(marketStrip, tradingHeaderSlot) : marketStrip}
      <InstrumentFacts ticker={selectedTicker} symbol={selectedTicker?.symbol || 'UNAVAILABLE'} feed={chartFeed} orderBook={chartOrderBookLevels} tradingMode={executionUnlocked ? (isDemo ? 'DEMO' : 'LIVE') : 'READ ONLY'} strategySummary={systemContext?.strategyName || null} />
      <div className="apex-trading-cockpit">
        <div className="apex-trading-chart-column">
          {selectedTicker ? <PriceChart candles={chartCandles} symbol={selectedTicker.symbol} lastPrice={selectedTicker.lastPrice} changePct={selectedTicker.priceChange24hPct} interval={chartInterval} feed={chartFeed} onRetry={onRetryChart} analysis={{ levels, longScore, shortScore }} onIntervalChange={(interval) => onChartIntervalChange(interval as '1m' | '5m' | '15m' | '1h' | '4h' | '1d')} /> : <HonestEmpty label="Select a verified market to load a chart." />}
        </div>
        <div className="apex-trading-order-column">
          {orderTicket}
        </div>
        <div className="apex-trading-market-column">
          {depthPanel}
          {renderStrategyContextPanel()}
        </div>
      </div>
      <TradingActivityPanel connected={connected} mode={accountProps.connection.mode} executionState={accountProps.connection.executionState} positions={openPositions} orders={openOrders} trades={recentTrades} alerts={localAlerts} summary={activitySummary} expanded={activityOpen} onToggleExpanded={() => setActivityOpen((current) => !current)} />
    </div>

      <TradingToolbox
        mode="auto"
        containerWidth={workspaceWidth}
        inlineTools={[]}
      closeRequest={closeToolRequest}
      onStateChange={setToolboxState}
      workspaceActions={{ settings: () => navigateWorkspace('settings') }}
      drawers={{
        order: <div className="apex-trading-order-drawer-stack">{orderTicket}{riskPanel}</div>,
        depth: <MarketDepthPanel orderBook={chartOrderBook} levels={chartOrderBookLevels} symbol={selectedTicker?.symbol || 'UNAVAILABLE'} lastPrice={selectedTicker?.lastPrice ?? null} density="expanded" ageMs={chartFeed.ageMs} onPickPrice={pickDepthPrice} />,
        orders: <div className="apex-trading-subpanel-drawer">
          <div className="apex-trading-drawer-kpis"><div><span>Open orders</span><strong>{openOrders.length}</strong></div><div><span>Environment</span><strong>{accountProps.connection.mode.toUpperCase()}</strong></div></div>
          <section className="apex-panel apex-open-orders-card"><div className="apex-panel-head"><div><span>Working Orders</span><small>Current account snapshot</small></div><ListOrdered size={17} /></div>{openOrders.length ? <ActivityTable activity={openOrders.slice(0, 12)} /> : <HonestEmpty label="No open orders in this account." />}</section>
          <button type="button" className="apex-trading-drawer-primary-action" onClick={() => navigateWorkspace('orders')}>Open full Orders workspace</button>
        </div>,
        positions: <div className="apex-trading-subpanel-drawer">
          <div className="apex-trading-drawer-kpis three"><div><span>Open positions</span><strong>{openPositions.length}</strong></div><div><span>Unrealized P&amp;L</span><strong className={signedClass(openPositionsPnl)}>{money(openPositionsPnl)}</strong></div><div><span>Margin</span><strong>{money(openPositionsMargin)}</strong></div></div>
          <section className="apex-panel apex-trading-positions-drawer-card">{connected ? (openPositions.length ? <PositionsTable positions={openPositions} /> : <HonestEmpty label={`No open ${accountProps.connection.mode} positions.`} />) : <div className="apex-table-locked"><LockKeyhole size={18} /> Position data will appear in Demo or after API verification.</div>}</section>
          <button type="button" className="apex-trading-drawer-primary-action" onClick={() => navigateWorkspace('positions')}>Open full Positions workspace</button>
        </div>,
        trades: <RecentTradesPanel activity={recentTrades} />,
        strategy: renderStrategyContextPanel(),
        signals: <SetupIntelligencePanel symbol={selectedTicker?.symbol || 'this market'} levels={levels} longScore={longScore} shortScore={shortScore} intelligenceDirection={intelligenceDirection} intelligencePlan={intelligencePlan} intelligenceCandidate={intelligenceCandidate} currentPrice={selectedTicker?.lastPrice ?? null} />,
      }}
    />
  </div>;
}

export function TradingView(props: TradingViewProps) {
  return <TradingViewCore {...props} />;
}
