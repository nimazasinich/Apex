import React from 'react';
import { CircleDollarSign, Coins, Layers3, ListOrdered, Percent, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import type { AccountSnapshot, ConnectionState } from '../../services/accountClient';
import type { WorkspaceInsights } from '../../services/workspaceInsights';
import { numberFrom, rows } from '../workspace/AccountViews';

function money(value: number | null): string {
  return value == null ? '—' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`;
}

function signedMoney(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`;
}

function signedClass(value: number | null): string {
  return value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative';
}

/* Eight cells share one row, so large balances are abbreviated rather than
   truncated mid-number. The precise figure and its context stay reachable in
   each cell's tooltip. */
function compactMoney(value: number | null): string {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} USDT`;
}

function percent(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

export function OverviewKpiStrip({
  connection,
  snapshot,
  insights,
  onNavigate,
}: {
  connection: ConnectionState;
  snapshot: AccountSnapshot | null;
  insights: WorkspaceInsights | null;
  onNavigate: (page: 'portfolio' | 'positions' | 'orders') => void;
}) {
  const connected = connection.mode === 'demo' || connection.status === 'connected';
  const account = insights?.account ?? null;
  const equity = account ? account.equityUsd : connected ? numberFrom(snapshot?.account, 'accountEquity', 'equity') : null;
  const available = account ? account.availableBalanceUsd : connected ? numberFrom(snapshot?.account, 'availableBalance', 'availableMargin') : null;
  const unrealized = account ? account.unrealizedPnlUsd : connected ? numberFrom(snapshot?.account, 'unrealizedPnl', 'unrealisedPnl') : null;
  const positionCount = insights ? insights.positions.length : connected ? rows(snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true).length : null;
  const orderCount = insights ? insights.orders.length : connected ? rows(snapshot, 'openOrders').length : null;
  /* Realized P&L, margin ratio and buying power are all real `WorkspaceInsights`
     fields. Daily P&L and Open Risk from the reference layout are deliberately
     absent: they exist only in server-side live-risk telemetry that never
     reaches this page, and are not approximated here. */
  const realized = account ? account.realizedPnlUsd : connected ? numberFrom(snapshot?.account, 'realisedPnl', 'realizedPnl') : null;
  const marginRatio = account ? account.marginRatioPct : null;
  const buyingPower = account ? account.buyingPowerUsd : null;
  const grossExposure = insights ? insights.positions.reduce((sum, position) => sum + Math.abs(position.valueUsd), 0) : null;
  const exposurePct = grossExposure != null && equity && equity > 0 ? (grossExposure / equity) * 100 : null;
  const count = (value: number | null): string => (value == null ? '—' : String(value));
  const items = [
    { label: 'Equity', value: money(equity), valueClass: '', detail: connected ? (connection.mode === 'demo' ? 'Demo wallet equity' : 'Connected account equity') : 'Connect or switch to Demo', icon: CircleDollarSign, page: 'portfolio' as const },
    { label: 'Available', value: money(available), valueClass: '', detail: 'Free collateral', icon: Wallet, page: 'portfolio' as const },
    { label: 'Unrealized P&L', value: signedMoney(unrealized), valueClass: signedClass(unrealized), detail: 'Open position P&L', icon: TrendingUp, page: 'positions' as const },
    { label: 'Realized P&L', value: signedMoney(realized), valueClass: signedClass(realized), detail: 'Booked account P&L', icon: Coins, page: 'portfolio' as const },
    { label: 'Positions', value: count(positionCount), valueClass: '', detail: 'Open positions', icon: ShieldCheck, page: 'positions' as const },
    { label: 'Orders', value: count(orderCount), valueClass: '', detail: 'Working and pending orders', icon: ListOrdered, page: 'orders' as const },
    { label: 'Current exposure', value: compactMoney(grossExposure), valueClass: '', detail: `Gross absolute position value${exposurePct != null ? ` · ${exposurePct.toFixed(1)}% of equity` : ''}`, icon: Layers3, page: 'positions' as const },
    { label: 'Margin ratio', value: percent(marginRatio), valueClass: '', detail: buyingPower != null ? `Buying power ${money(buyingPower)}` : 'Margin utilisation', icon: Percent, page: 'portfolio' as const },
  ];
  return <section className="apex-overview-kpis" aria-label="Account summary">
    {items.map((item) => {
      const Icon = item.icon;
      return <button type="button" key={item.label} title={item.detail} onClick={() => onNavigate(item.page)}>
        <Icon size={18} aria-hidden="true" />
        <span>{item.label}</span>
        <strong className={item.valueClass}>{item.value}</strong>
        <small>{item.detail}</small>
      </button>;
    })}
  </section>;
}
