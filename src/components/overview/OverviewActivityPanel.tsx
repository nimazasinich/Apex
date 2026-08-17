import React, { useState } from 'react';
import type { AccountSnapshot, ConnectionState } from '../../services/accountClient';
import { ActivityTable, HonestEmpty, PositionsTable, numberFrom, rows } from '../workspace/AccountViews';
import { Tabs } from '../ui/WorkspacePrimitives';
import type { WorkspacePage } from '../workspace/WorkspaceShell';

export function OverviewActivityPanel({ snapshot, connection, onNavigate }: { snapshot: AccountSnapshot | null; connection: ConnectionState; onNavigate: (page: WorkspacePage) => void }) {
  const [tab, setTab] = useState<'positions' | 'orders' | 'trades'>('positions');
  const positions = rows(snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true);
  const orders = rows(snapshot, 'openOrders');
  const trades = rows(snapshot, 'recentTrades');
  const connected = connection.mode === 'demo' || connection.status === 'connected';
  return <section className="apex-overview-activity apex-panel" aria-labelledby="overview-activity-title">
    <header><div><span className="apex-eyebrow">Account activity</span><h2 id="overview-activity-title">Current activity</h2></div><button type="button" className="apex-secondary-button" onClick={() => onNavigate(tab === 'trades' ? 'history' : tab)}>Open full view</button></header>
    <Tabs
      label="Overview account activity"
      active={tab}
      onChange={setTab}
      tabs={[{ id: 'positions', label: 'Positions', count: positions.length }, { id: 'orders', label: 'Open Orders', count: orders.length }, { id: 'trades', label: 'Recent Trades', count: trades.length }]}
    >
      {!connected ? <HonestEmpty label="Account activity is unavailable until Demo is selected or a live account is verified." /> : tab === 'positions' ? (positions.length ? <PositionsTable positions={positions.slice(0, 4)} /> : <HonestEmpty label={`No open ${connection.mode} positions.`} />) : tab === 'orders' ? (orders.length ? <ActivityTable activity={orders.slice(0, 5)} /> : <HonestEmpty label="No open orders in this account." />) : (trades.length ? <ActivityTable activity={trades.slice(0, 5)} /> : <HonestEmpty label="No recent account fills." />)}
    </Tabs>
  </section>;
}
