import React, { useState } from 'react';
import type { AccountSnapshot, ConnectionState } from '../../services/accountClient';
import type { WorkspaceInsights } from '../../services/workspaceInsights';
import { HonestEmpty, normalizeSymbol, numberFrom, rows, stringFrom } from '../workspace/AccountViews';
import { Tabs } from '../ui/WorkspacePrimitives';
import type { WorkspacePage } from '../workspace/WorkspaceShell';

type ActivityTab = 'positions' | 'orders' | 'trades' | 'activity';

interface OverviewActivityRow {
  key: string;
  time: number | null;
  type: string;
  market: string;
  side: 'long' | 'short' | null;
  size: number | null;
  price: number | null;
  status: string;
}

const UTC_CLOCK = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

function utcTime(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  return UTC_CLOCK.format(new Date(ms));
}

function quantity(value: number | null, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function sideOf(raw: string, qty: number | null): 'long' | 'short' | null {
  const value = raw.toLowerCase();
  if (value === 'sell' || value === 'short') return 'short';
  if (value === 'buy' || value === 'long') return 'long';
  if (qty != null && qty !== 0) return qty < 0 ? 'short' : 'long';
  return null;
}

/**
 * Normalise an epoch to milliseconds. Some venue trade feeds report `tradeTime` in
 * nanoseconds; 4e12 ms is already the year 2096, so anything larger is finer-grained
 * than milliseconds and must be scaled down rather than formatted as-is.
 */
function epochMs(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  let ms = value;
  while (ms > 4e12) ms /= 1000;
  return Math.round(ms);
}

function positionRows(snapshot: AccountSnapshot | null): OverviewActivityRow[] {
  return rows(snapshot, 'positions')
    .filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true)
    .map((row, index) => {
      const qty = numberFrom(row, 'currentQty');
      return {
        key: `position-${stringFrom(row, 'id', 'symbol')}-${index}`,
        time: epochMs(numberFrom(row, 'updatedAt', 'createdAt', 'openingTimestamp')),
        type: 'Position',
        market: normalizeSymbol(stringFrom(row, 'symbol')),
        side: sideOf('', qty),
        size: qty == null ? null : Math.abs(qty),
        price: numberFrom(row, 'avgEntryPrice', 'markPrice'),
        status: 'Open',
      };
    });
}

function orderRows(snapshot: AccountSnapshot | null): OverviewActivityRow[] {
  return rows(snapshot, 'openOrders').map((row, index) => ({
    key: `order-${stringFrom(row, 'id', 'orderId', 'symbol')}-${index}`,
    time: epochMs(numberFrom(row, 'createdAt', 'ts')),
    type: stringFrom(row, 'type', 'orderType'),
    market: normalizeSymbol(stringFrom(row, 'symbol')),
    side: sideOf(stringFrom(row, 'side'), numberFrom(row, 'size', 'origSize')),
    size: numberFrom(row, 'size', 'origSize'),
    price: numberFrom(row, 'price', 'avgPrice'),
    status: stringFrom(row, 'status', 'orderStatus', 'state'),
  }));
}

function tradeRows(snapshot: AccountSnapshot | null): OverviewActivityRow[] {
  return rows(snapshot, 'recentTrades').map((row, index) => {
    const status = stringFrom(row, 'status', 'orderStatus');
    return {
      key: `trade-${stringFrom(row, 'id', 'tradeId', 'orderId')}-${index}`,
      time: epochMs(numberFrom(row, 'tradeTime', 'createdAt', 'ts')),
      type: 'Fill',
      market: normalizeSymbol(stringFrom(row, 'symbol')),
      side: sideOf(stringFrom(row, 'side'), numberFrom(row, 'size', 'dealSize')),
      size: numberFrom(row, 'size', 'dealSize'),
      price: numberFrom(row, 'price', 'dealPrice'),
      status: status === '—' ? 'Filled' : status,
    };
  });
}

function insightRows(insights: WorkspaceInsights | null): OverviewActivityRow[] {
  return (insights?.activities ?? []).map((row, index) => {
    const direction = String(row.direction ?? '');
    return {
      key: `activity-${index}`,
      time: epochMs(numberFrom(row as unknown as Record<string, unknown>, 'timestamp')),
      type: 'Alert',
      market: row.symbol ? normalizeSymbol(row.symbol) : '—',
      side: direction === 'negative' ? 'short' : direction === 'positive' ? 'long' : null,
      size: row.amount ?? null,
      price: row.usdValue ?? null,
      status: String(row.status ?? '—'),
    };
  });
}

/**
 * The table frame (header row + column structure) stays mounted even with zero rows, so an
 * empty tab reads as "this table has nothing in it" rather than as a missing panel. The
 * previous implementation swapped the whole table out for a bare `HonestEmpty` card, which
 * is why the Positions tab appeared to have no table at all.
 */
function ActivityRowsTable({ activityRows, emptyLabel }: { activityRows: OverviewActivityRow[]; emptyLabel: string }) {
  return (
    <div className="apex-table-wrap apex-overview-activity-table">
      <table className="apex-table">
        <thead>
          <tr>
            <th>Time (UTC)</th>
            <th>Type</th>
            <th>Market</th>
            <th>Side</th>
            <th>Size</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {activityRows.length ? (
            activityRows.map((row) => (
              <tr key={row.key}>
                <td>{utcTime(row.time)}</td>
                <td>{row.type}</td>
                <td>{row.market}</td>
                <td>{row.side ? <span className={`apex-status-pill ${row.side === 'short' ? 'danger' : 'success'}`}>{row.side === 'short' ? 'SHORT' : 'LONG'}</span> : '—'}</td>
                <td>{quantity(row.size)}</td>
                <td>{quantity(row.price, 2)}</td>
                <td>{row.status}</td>
              </tr>
            ))
          ) : (
            <tr className="apex-overview-activity-empty"><td colSpan={7}>{emptyLabel}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function OverviewActivityPanel({
  snapshot,
  connection,
  insights,
  onNavigate,
}: {
  snapshot: AccountSnapshot | null;
  connection: ConnectionState;
  insights: WorkspaceInsights | null;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const [tab, setTab] = useState<ActivityTab>('positions');
  const positions = positionRows(snapshot);
  const orders = orderRows(snapshot);
  const trades = tradeRows(snapshot);
  const alerts = insightRows(insights);
  const connected = connection.mode === 'demo' || connection.status === 'connected';

  const active = tab === 'positions' ? positions : tab === 'orders' ? orders : tab === 'trades' ? trades : alerts;
  const emptyLabel = tab === 'positions'
    ? `No open ${connection.mode} positions.`
    : tab === 'orders'
      ? 'No open orders in this account.'
      : tab === 'trades'
        ? 'No recent account fills.'
        : 'No recent workspace alerts.';

  return (
    <section className="apex-overview-activity apex-panel" aria-labelledby="overview-activity-title">
      <header className="apex-overview-section-head">
        <span className="apex-overview-section-num">6</span>
        <div><h2 id="overview-activity-title">Recent Activity</h2></div>
        <button type="button" className="apex-secondary-button" onClick={() => onNavigate(tab === 'trades' || tab === 'activity' ? 'history' : tab)}>Open full view</button>
      </header>
      <Tabs
        label="Overview account activity"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'positions', label: 'Positions', count: positions.length },
          { id: 'orders', label: 'Orders', count: orders.length },
          { id: 'trades', label: 'Decisions', count: trades.length },
          { id: 'activity', label: 'Alerts', count: alerts.length },
        ]}
      >
        {connected
          ? <ActivityRowsTable activityRows={active.slice(0, 5)} emptyLabel={emptyLabel} />
          : <HonestEmpty label="Account activity is unavailable until Demo is selected or a live account is verified." />}
      </Tabs>
    </section>
  );
}
