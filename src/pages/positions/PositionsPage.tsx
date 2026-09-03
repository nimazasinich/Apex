import React, { useEffect, useMemo, useState } from 'react';
import './PositionsPage.css';
import {
  Activity,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChartNoAxesCombined,
  ExternalLink,
  Gauge,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { CoinIcon } from '../../components/CoinIcon';
import { notifyWorkspace } from '../../lib/workspaceFeedback';
import type { WorkspacePosition } from '../../services/workspaceInsights';
import type { AccountWorkspaceProps } from '../pageTypes';
import { AccountFreshnessChip } from '../../components/ui/AccountFreshnessChip';
import { TabdealAccountSurface } from '../../components/account/TabdealAccountSurface';
import {
  Donut,
  fmtCompact,
  fmtMoney,
  fmtPct,
  fmtPrice,
  HalfGauge,
  tone,
  V20PageTitle,
} from '../referenceUi';

const ASSET_COLORS = ['#ff970f', '#2d80df', '#20b98b', '#f3ba18', '#7a46d7', '#9bb6d8'];
type PositionSortKey = 'asset' | 'side' | 'size' | 'entryPrice' | 'markPrice' | 'unrealizedPnlUsd' | 'pnlPct' | 'marginUsd' | 'leverage' | 'liquidationPrice' | 'valueUsd' | 'risk';
type SortDirection = 'asc' | 'desc';
type PositionHeader = {
  key: PositionSortKey | null;
  label: string;
  ariaLabel?: string;
};

const POSITION_HEADERS: PositionHeader[] = [
  { key: 'asset', label: 'Asset' },
  { key: 'side', label: 'Side' },
  { key: 'size', label: 'Size' },
  { key: 'entryPrice', label: 'Entry Price' },
  { key: 'markPrice', label: 'Mark Price' },
  { key: 'unrealizedPnlUsd', label: 'Unrealized P&L' },
  { key: 'pnlPct', label: 'P&L (%)' },
  { key: 'marginUsd', label: 'Margin' },
  { key: 'leverage', label: 'Leverage' },
  { key: 'liquidationPrice', label: 'Liq. Price', ariaLabel: 'Liquidation Price' },
  { key: null, label: 'Action' },
];

function fmtSignedMoney(value: number | null | undefined) {
  const formatted = fmtMoney(value);
  return Number(value) > 0 ? `+${formatted}` : formatted;
}

function liquidationGap(position: WorkspacePosition) {
  if (position.liquidationPrice == null || position.markPrice == null || position.markPrice <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(position.markPrice - position.liquidationPrice) / position.markPrice * 100;
}

function sortValue(position: WorkspacePosition, key: PositionSortKey) {
  if (key === 'asset') return `${position.asset} ${position.symbol}`.toLowerCase();
  if (key === 'side') return position.side;
  if (key === 'risk') return liquidationGap(position);
  if (key === 'liquidationPrice') return position.liquidationPrice ?? Number.POSITIVE_INFINITY;
  return position[key];
}

function comparePositions(left: WorkspacePosition, right: WorkspacePosition, key: PositionSortKey, direction: SortDirection) {
  const leftValue = sortValue(left, key);
  const rightValue = sortValue(right, key);
  const order = typeof leftValue === 'string' || typeof rightValue === 'string'
    ? String(leftValue).localeCompare(String(rightValue))
    : Number(leftValue) - Number(rightValue);
  return direction === 'asc' ? order : -order;
}

function PositionMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ComponentType<{ size?: number }>;
  accent: 'green' | 'blue' | 'violet';
}) {
  return (
    <article className={`positions-reference-metric ${accent}`} tabIndex={0} aria-label={`${label}: ${String(value)}`}>
      <div className="positions-reference-metric-head"><span className="positions-reference-metric-icon"><Icon size={20} /></span><strong>{label}</strong></div>
      <div className="positions-reference-metric-value">{value}</div>
      <footer><small>{detail}</small></footer>
    </article>
  );
}

function ExposureEmpty() {
  return <div className="positions-exposure-empty"><span><i /><i /><i /></span><strong>No exposure data</strong><small>Open positions with verified notional are required.</small></div>;
}

function PositionsEmptyVisual({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="positions-empty-state">
      <div className="positions-empty-art" aria-hidden="true">
        <i /><i /><i />
        <svg viewBox="0 0 96 96">
          <defs>
            <linearGradient id="positions-empty-bag" x1="24" x2="72" y1="25" y2="78" gradientUnits="userSpaceOnUse">
              <stop stopColor="#dffbea" />
              <stop offset="1" stopColor="#7ce1a1" />
            </linearGradient>
          </defs>
          <path className="halo" d="M20 64c2-22 16-37 33-36 15 1 25 14 23 31" />
          <path className="bag-shadow" d="M25 45h42l5 31H20l5-31Z" />
          <path className="bag" d="M27 43h42l5 30H22l5-30Z" />
          <path className="handle" d="M35 43c1-11 6-17 13-17s12 6 13 17" />
          <path className="slot" d="M36 56h24" />
          <circle className="badge" cx="68" cy="66" r="12" />
          <path className="check" d="m63 66 4 4 8-10" />
        </svg>
      </div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function PositionsPage(props: AccountWorkspaceProps) {
  const positions = props.insights?.positions || [];
  const [positionQuery, setPositionQuery] = useState('');
  const [sortKey, setSortKey] = useState<PositionSortKey>('unrealizedPnlUsd');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(positions[0]?.id || null);

  const filteredPositions = useMemo(() => {
    const normalized = positionQuery.trim().toLowerCase();
    const matching = positions.filter((position) => (
      !normalized || `${position.asset} ${position.symbol} ${position.side}`.toLowerCase().includes(normalized)
    ));
    return [...matching].sort((left, right) => comparePositions(left, right, sortKey, sortDirection));
  }, [positionQuery, positions, sortDirection, sortKey]);

  useEffect(() => {
    if (!filteredPositions.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredPositions.some((position) => position.id === selectedId)) {
      setSelectedId(filteredPositions[0].id);
    }
  }, [filteredPositions, selectedId]);

  const selected = filteredPositions.find((position) => position.id === selectedId) || filteredPositions[0] || null;
  const account = props.insights?.account;
  const verifiedValues = positions.map((position) => position.valueUsd).filter((value): value is number => value != null && Number.isFinite(value));
  const verifiedPnl = positions.map((position) => position.unrealizedPnlUsd).filter((value): value is number => value != null && Number.isFinite(value));
  const totalValue = verifiedValues.length ? verifiedValues.reduce((sum, value) => sum + value, 0) : null;
  const totalPnl = verifiedPnl.length ? verifiedPnl.reduce((sum, value) => sum + value, 0) : null;
  const exposureItems = useMemo(() => {
    const totals = new Map<string, number>();
    positions.forEach((position) => {
      if (!position.asset || position.valueUsd == null || !Number.isFinite(position.valueUsd)) return;
      totals.set(position.asset, (totals.get(position.asset) || 0) + Math.max(0, position.valueUsd));
    });
    return [...totals.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([label, value], index) => ({ label, value, color: ASSET_COLORS[index] }));
  }, [positions]);
  const leverageDistribution = useMemo(() => {
    const buckets = [
      { label: '≤2x', count: positions.filter((position) => position.leverage != null && position.leverage <= 2).length },
      { label: '2–5x', count: positions.filter((position) => position.leverage != null && position.leverage > 2 && position.leverage <= 5).length },
      { label: '>5x', count: positions.filter((position) => position.leverage != null && position.leverage > 5).length },
    ];
    const measured = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    return { buckets, total: measured };
  }, [positions]);
  const liquidationDistances = positions
    .map(liquidationGap)
    .filter(Number.isFinite);
  const nearestLiquidationDistance = liquidationDistances.length ? Math.min(...liquidationDistances) : null;
  const liquidationRisk = nearestLiquidationDistance == null
    ? 'Unavailable'
    : nearestLiquidationDistance < 5
      ? 'High'
      : nearestLiquidationDistance < 12
        ? 'Medium'
        : 'Low';

  const openTrading = (position: WorkspacePosition | null) => {
    if (!position) return;
    if (!position.symbol) {
      notifyWorkspace({ title: 'Trading navigation unavailable', detail: 'This position has no authoritative symbol.', tone: 'warning' });
      return;
    }
    if (props.onOpenTrading) {
      props.onOpenTrading(position.symbol);
      notifyWorkspace({
        title: `${position.symbol} opened in Trading`,
        detail: 'Review the live mark, trade plan, and risk controls before taking action.',
        tone: 'info',
      });
      return;
    }
    notifyWorkspace({ title: 'Trading navigation unavailable', detail: 'Open the Trading workspace and select this symbol manually.', tone: 'warning' });
  };

  const setHeaderSort = (key: PositionSortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'asset' || key === 'side' || key === 'risk' ? 'asc' : 'desc');
  };

  const selectSortPreset = (value: PositionSortKey) => {
    setSortKey(value);
    setSortDirection(value === 'risk' ? 'asc' : 'desc');
  };


  const refreshPositions = () => {
    notifyWorkspace({ title: 'Position refresh requested', detail: 'Synchronizing the latest account snapshot.', tone: 'info' });
    void props.onRefresh();
  };

  const emptyTitle = props.loading && !props.insights
    ? 'Loading positions'
    : props.error
      ? 'Position synchronization failed'
      : props.connection.mode === 'live' && props.connection.status !== 'connected'
        ? 'Live positions are locked'
        : positions.length
          ? 'No positions match your search'
          : 'No open positions';
  const emptyDetail = props.loading && !props.insights
    ? 'Waiting for the current account workspace snapshot.'
    : props.error
      ? props.error
      : props.connection.mode === 'live' && props.connection.status !== 'connected'
        ? 'Connect a verified Live account or switch to Demo in Settings.'
        : positions.length
          ? 'Clear the search box to see all open positions.'
          : 'The exchange returned no active positions for this account.';

  return (
    <div className="v20-reference-page v20-positions-page">
      <div className="v20-main-column">
        <V20PageTitle
          title="Positions"
          subtitle="Manage open positions, compare exposure, and move a selected market into Trading."
          actions={<><AccountFreshnessChip loading={props.loading} error={props.error} connection={props.connection} snapshot={props.snapshot} /><button type="button" className="v20-refresh-action" onClick={() => void refreshPositions()} disabled={props.loading}><Activity size={14} className={props.loading ? 'spin' : ''} /> Refresh</button></>}
        />
        <div className="v20-metrics five positions-reference-metrics">
          <PositionMetricCard label="Total Position Value" value={fmtMoney(totalValue)} detail={positions.length ? `${positions.length} open position${positions.length === 1 ? '' : 's'}` : 'No open exposure'} icon={ChartNoAxesCombined} accent="green" />
          <PositionMetricCard label="Unrealized P&L" value={fmtSignedMoney(totalPnl)} detail="Across open positions" icon={Activity} accent="green" />
          <PositionMetricCard label="Realized P&L" value={fmtSignedMoney(account?.realizedPnlUsd)} detail="Current account snapshot" icon={ChartNoAxesCombined} accent="green" />
          <PositionMetricCard label="Margin Used" value={fmtMoney(account?.marginUsedUsd)} detail={account?.marginRatioPct == null ? 'Margin ratio unavailable' : `${account.marginRatioPct.toFixed(2)}% of equity`} icon={Gauge} accent="blue" />
          <PositionMetricCard label="Available Balance" value={fmtMoney(account?.availableBalanceUsd)} detail="Available for account operations" icon={WalletCards} accent="violet" />
        </div>

        <section className="v20-table-card v20-positions-table">
          <div className="v20-card-head v20-position-toolbar">
            <div><strong>Open Positions</strong><small>{filteredPositions.length} of {positions.length} positions</small></div>
            <div>
              <label className="v20-sort-control"><ArrowUpDown size={13} /><select value={sortKey} onChange={(event) => selectSortPreset(event.target.value as PositionSortKey)} aria-label="Sort positions"><option value="unrealizedPnlUsd">P&L</option><option value="valueUsd">Position value</option><option value="leverage">Leverage</option><option value="risk">Liquidation risk</option></select></label>
              <label><Search size={14} /><input value={positionQuery} onChange={(event) => setPositionQuery(event.target.value)} placeholder="Search positions…" /></label>
              <button type="button" onClick={() => setPositionQuery('')} disabled={!positionQuery}>Clear</button>
            </div>
          </div>
          <div className="v20-position-table-scroll" role="region" aria-label="Open positions table" tabIndex={0}>
            <table>
              <thead><tr>{POSITION_HEADERS.map((header) => {
                const sortableKey = header.key;
                return (
                <th key={header.label} aria-sort={sortableKey && sortKey === sortableKey ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {sortableKey ? (
                    <button
                      type="button"
                      className={sortKey === sortableKey ? 'active' : ''}
                      onClick={() => setHeaderSort(sortableKey)}
                      aria-label={`Sort by ${header.ariaLabel || header.label}`}
                    >
                      <span>{header.label}</span>
                      {sortKey === sortableKey ? (sortDirection === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ArrowUpDown size={10} />}
                    </button>
                  ) : header.label}
                </th>
              );})}</tr></thead>
              <tbody>{filteredPositions.map((position) => (
                <tr
                  key={position.id}
                  className={selected?.id === position.id ? 'selected' : ''}
                  onClick={() => setSelectedId(position.id)}
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(position.id); } }}
                >
                  <td>{position.symbol ? <CoinIcon symbol={position.symbol} size={24} /> : null}<span><strong>{position.asset || '—'}</strong><small>{position.symbol || '—'}</small></span></td>
                  <td><span className={`v20-pill ${position.side === 'LONG' ? 'success' : position.side === 'SHORT' ? 'danger' : ''}`}>{position.side}</span></td>
                  <td><strong className="v20-position-primary-value">{position.size == null ? '—' : position.size.toLocaleString()}</strong><small>≈ {fmtMoney(position.valueUsd)}</small></td>
                  <td>{fmtPrice(position.entryPrice)}</td>
                  <td>{fmtPrice(position.markPrice)}</td>
                  <td className={tone(position.unrealizedPnlUsd)}>{fmtSignedMoney(position.unrealizedPnlUsd)}</td>
                  <td className={tone(position.pnlPct)}>{fmtPct(position.pnlPct)}</td>
                  <td>{fmtMoney(position.marginUsd)}</td>
                  <td>{position.leverage == null ? '—' : `${position.leverage.toFixed(position.leverage % 1 ? 2 : 0)}x`}</td>
                  <td className={position.liquidationPrice ? 'negative' : ''}>{position.liquidationPrice ? fmtPrice(position.liquidationPrice) : '—'}</td>
                  <td><button type="button" className="v20-icon-button" title="Open this market in Trading" aria-label={`Open ${position.symbol || 'position market'} in Trading`} onClick={(event) => { event.stopPropagation(); openTrading(position); }}><ExternalLink size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!filteredPositions.length && <PositionsEmptyVisual title={emptyTitle} detail={emptyDetail} />}
        </section>
        <TabdealAccountSurface mode="positions" />
      </div>

      <aside className="v20-context-sidebar">
        <div className="v20-context-section positions-exposure-card">
          <div className="v20-section-title"><strong>Exposure by Asset</strong><span>By verified notional</span></div>
          {exposureItems.length ? (
            <div className="v20-donut-row">
              <Donut items={exposureItems} totalLabel={fmtCompact(totalValue)} />
              <ul>{exposureItems.map((item) => (
                <li key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><b>{totalValue && totalValue > 0 ? `${(item.value / totalValue * 100).toFixed(1)}%` : '—'}</b></li>
              ))}</ul>
            </div>
          ) : <ExposureEmpty />}
        </div>

        <div className="v20-context-section positions-leverage-card">
          <div className="v20-section-title"><strong>Leverage Distribution</strong><span>{positions.length ? `${positions.length} positions` : 'No exposure'}</span></div>
          <div className="positions-leverage-bars" aria-label="Leverage distribution">
            {leverageDistribution.buckets.map((bucket) => {
              const pct = leverageDistribution.total ? bucket.count / leverageDistribution.total * 100 : null;
              return <div key={bucket.label}><span>{bucket.label}</span><i><em style={{ width: `${pct ?? 0}%` }} /></i><strong>{pct == null ? '—' : `${pct.toFixed(0)}%`}</strong></div>;
            })}
          </div>
        </div>

        <div className="v20-context-section positions-risk-card">
          <div className="v20-section-title"><strong>Account Risk</strong><span className={`v20-pill ${account?.riskLabel === 'High' ? 'danger' : account?.riskLabel === 'Medium' ? 'partially_filled' : account?.riskLabel === 'Low' ? 'success' : ''}`}>{account?.riskLabel ? `${account.riskLabel} Risk` : 'UNAVAILABLE'}</span></div>
          {account?.riskScore == null || account?.riskLabel == null ? <div className="positions-exposure-empty"><strong>Risk score unavailable</strong><small>No zero/low-risk state is synthesized.</small></div> : <HalfGauge
            value={account.riskScore}
            label={`${account.riskLabel} Risk`}
            toneName={account.riskLabel === 'High' ? 'red' : account.riskLabel === 'Medium' ? 'amber' : 'green'}
            centerText={account.riskLabel}
          />}
          <dl className="v20-detail-list">
            <div><dt>Margin Level</dt><dd>{account?.marginRatioPct == null ? '—' : `${Math.max(0, 100 - account.marginRatioPct).toFixed(2)}%`}</dd></div>
            <div><dt>Liquidation Risk</dt><dd>{liquidationRisk}</dd></div>
            <div><dt>Nearest Liq. Gap</dt><dd>{nearestLiquidationDistance == null ? '—' : `${nearestLiquidationDistance.toFixed(1)}%`}</dd></div>
            <div><dt>Risk Score</dt><dd>{account?.riskScore == null ? '—' : `${account.riskScore.toFixed(0)}/100`}</dd></div>
          </dl>
          <p className="v20-risk-note"><ShieldCheck size={12} /> Risk indicators reflect the current verified account snapshot.</p>
        </div>
      </aside>
    </div>
  );
}
