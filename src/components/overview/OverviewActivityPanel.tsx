import React, { useState } from 'react';
import type { AccountSnapshot, ConnectionState } from '../../services/accountClient';
import { ActivityTable, HonestEmpty, PositionsTable, numberFrom, rows } from '../workspace/AccountViews';
import { Tabs } from '../ui/WorkspacePrimitives';
import type { WorkspacePage } from '../workspace/WorkspaceShell';

export function OverviewActivityPanel({ snapshot, connection, insights, onNavigate }: { snapshot: AccountSnapshot | null; connection: ConnectionState; insights: import('../../services/workspaceInsights').WorkspaceInsights | null; onNavigate: (page: WorkspacePage) => void }) {
  const [tab, setTab] = useState<'positions' | 'orders' | 'trades' | 'activity'>('positions');
  const positions = rows(snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true);
  const orders = rows(snapshot, 'openOrders');
  const trades = rows(snapshot, 'recentTrades');
  const activities = insights?.activities ?? [];
  const connected = connection.mode === 'demo' || connection.status === 'connected';
  return <section className="apex-overview-activity apex-panel" aria-labelledby="overview-activity-title">
    <header className="apex-overview-section-head"><span className="apex-overview-section-num">6</span><div><h2 id="overview-activity-title">Recent Activity</h2></div><button type="button" className="apex-secondary-button" onClick={() => onNavigate(tab === 'trades' || tab === 'activity' ? 'history' : tab)}>Open full view</button></header>
    <Tabs
      label="Overview account activity"
      active={tab}
      onChange={setTab}
      tabs={[{ id: 'positions', label: 'Positions', count: positions.length }, { id: 'orders', label: 'Orders', count: orders.length }, { id: 'trades', label: 'Decisions', count: trades.length }, { id: 'activity', label: 'Alerts', count: activities.length }]}
    >
      {!connected ? <HonestEmpty label="Account activity is unavailable until Demo is selected or a live account is verified." /> : tab === 'positions' ? (positions.length ? <PositionsTable positions={positions.slice(0, 4)} /> : <HonestEmpty label={`No open ${connection.mode} positions.`} />) : tab === 'orders' ? (orders.length ? <ActivityTable activity={orders.slice(0, 4)} /> : <HonestEmpty label="No open orders in this account." />) : tab === 'trades' ? (trades.length ? <ActivityTable activity={trades.slice(0, 4)} /> : <HonestEmpty label="No recent account fills." />) : (activities.length ? <ActivityTable activity={activities.slice(0, 4).map((row) => ({ symbol: row.symbol ?? '—', side: row.direction === 'negative' ? 'sell' : 'buy', size: row.amount ?? 0, price: row.usdValue ?? 0, status: row.status, time: row.timestamp }))} /> : <HonestEmpty label="No recent workspace alerts." />)}
    </Tabs>
  </section>;
}
