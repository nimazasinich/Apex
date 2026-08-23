import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Database, ListOrdered, Radio, ShieldAlert } from 'lucide-react';
import type { AccountSnapshot, ConnectionState } from '../../services/accountClient';
import type { CandidateScore, DataState } from '../../types';
import { numberFrom, rows } from '../workspace/AccountViews';
import type { WorkspacePage } from '../workspace/WorkspaceShell';

interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  page: WorkspacePage;
  icon: React.ComponentType<{ size?: number }>;
  tone: 'warning' | 'danger' | 'info';
}

export function OverviewAttentionPanel({
  marketState,
  connection,
  snapshot,
  candidates,
  onNavigate,
}: {
  marketState: DataState;
  connection: ConnectionState;
  snapshot: AccountSnapshot | null;
  candidates: CandidateScore[];
  onNavigate: (page: WorkspacePage) => void;
}) {
  const items: AttentionItem[] = [];
  if (marketState !== 'live') items.push({ id: 'market', title: 'Market data is degraded', detail: 'Review provider health before acting on stale or partial data.', page: 'settings', icon: Database, tone: 'warning' });
  if (connection.mode === 'live' && connection.status !== 'connected') items.push({ id: 'account', title: 'Live account is locked', detail: 'Live balances and execution remain unavailable until verification succeeds.', page: 'settings', icon: ShieldAlert, tone: 'warning' });
  const positions = rows(snapshot, 'positions').filter((row) => (numberFrom(row, 'currentQty') ?? 0) !== 0 || row.isOpen === true);
  const risky = positions.find((row) => Math.abs(numberFrom(row, 'unrealisedPnl', 'unrealizedPnl') ?? 0) > Math.max(50, Math.abs(numberFrom(row, 'positionMargin', 'posInit') ?? 0) * 0.25));
  if (risky) items.push({ id: 'position-risk', title: 'Position requires review', detail: 'One position has moved beyond the configured attention threshold.', page: 'positions', icon: AlertTriangle, tone: 'danger' });
  const orders = rows(snapshot, 'openOrders');
  if (orders.length) items.push({ id: 'orders', title: `${orders.length} open order${orders.length === 1 ? '' : 's'}`, detail: 'Confirm working orders still match the current market context.', page: 'orders', icon: ListOrdered, tone: 'info' });
  const candidate = candidates.find((row) => row.guardPass && row.readinessTier === 'CONFIRMED');
  if (candidate) items.push({ id: 'signal', title: `${candidate.symbol} ${candidate.direction} signal`, detail: `Score ${candidate.score}; review its evidence before opening Trading.`, page: 'strategies', icon: Radio, tone: 'info' });

  const visible = items.slice(0, 3);
  return <section className="apex-overview-attention apex-panel" aria-labelledby="overview-attention-title">
    <header className="apex-overview-section-head"><span className="apex-overview-section-num">5</span><div><h2 id="overview-attention-title">Priority / Action Needed</h2></div><strong>{visible.length}</strong></header>
    {visible.length ? <div className="apex-overview-attention-list">{visible.map((item) => {
      const Icon = item.icon;
      return <button type="button" key={item.id} className={`tone-${item.tone}`} onClick={() => onNavigate(item.page)}>
        <Icon size={17} aria-hidden="true" />
        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
        <ArrowRight size={15} aria-hidden="true" />
      </button>;
    })}</div> : <div className="apex-overview-calm-compact apex-overview-calm-large"><CheckCircle2 size={18} aria-hidden="true" /><span><strong>No immediate action required</strong><small>All systems operational</small></span></div>}
  </section>;
}
