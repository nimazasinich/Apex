import React from 'react';
import { Activity, CircleDollarSign, ListOrdered, ShieldCheck } from 'lucide-react';
import type { AccountSnapshot, ConnectionState } from '../../services/accountClient';
import type { CandidateScore } from '../../types';
import { numberFrom, rows } from '../workspace/AccountViews';

function money(value: number | null): string {
  return value == null ? 'Not connected' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`;
}

export function OverviewKpiStrip({
  connection,
  snapshot,
  candidates,
  onNavigate,
}: {
  connection: ConnectionState;
  snapshot: AccountSnapshot | null;
  candidates: CandidateScore[];
  onNavigate: (page: 'portfolio' | 'positions' | 'orders' | 'strategies') => void;
}) {
  const connected = connection.mode === 'demo' || connection.status === 'connected';
  const positions = rows(snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true);
  const orders = rows(snapshot, 'openOrders');
  const equity = connected ? numberFrom(snapshot?.account, 'accountEquity', 'equity') : null;
  const qualified = candidates.filter((candidate) => candidate.guardPass && candidate.readinessTier !== 'BLOCKED').length;
  const items = [
    { label: 'Account equity', value: money(equity), detail: connected ? connection.mode === 'demo' ? 'Demo wallet' : 'Connected account' : 'Connect or switch to Demo', icon: CircleDollarSign, page: 'portfolio' as const },
    { label: 'Open positions', value: connected ? String(positions.length) : 'Not connected', detail: connected ? 'Current account snapshot' : 'No account values shown', icon: ShieldCheck, page: 'positions' as const },
    { label: 'Open orders', value: connected ? String(orders.length) : 'Not connected', detail: connected ? 'Working and pending orders' : 'No account values shown', icon: ListOrdered, page: 'orders' as const },
    { label: 'Qualified signals', value: String(qualified), detail: `${candidates.length} candidates evaluated`, icon: Activity, page: 'strategies' as const },
  ];
  return <section className="apex-overview-kpis" aria-label="Account and market summary">
    {items.map((item) => {
      const Icon = item.icon;
      return <button type="button" key={item.label} onClick={() => onNavigate(item.page)}>
        <Icon size={18} aria-hidden="true" />
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.detail}</small>
      </button>;
    })}
  </section>;
}
