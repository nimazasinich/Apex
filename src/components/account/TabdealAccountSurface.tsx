import React from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useTabdealAccount } from '../../hooks/useTabdealAccount';
import { formatPrice } from '../../lib/marketPresentation';
import './TabdealAccountSurface.css';

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} USDT`;
}
function sourceTime(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'UNAVAILABLE';
  return new Date(value).toLocaleString();
}

export function TabdealAccountSurface({ mode }: { mode: 'positions' | 'orders' }) {
  const tabdeal = useTabdealAccount();
  const account = tabdeal.insights?.account ?? null;
  const positions = tabdeal.insights?.positions ?? [];
  const orders = tabdeal.insights?.orders ?? [];
  const observedAt = tabdeal.snapshot?.observationMetadata?.sourceObservedAt ?? null;
  const state = !tabdeal.connection.connected
    ? 'DISCONNECTED'
    : tabdeal.stale
      ? 'STALE'
      : tabdeal.connection.status === 'DEGRADED' || tabdeal.snapshot?.quality?.state === 'partial'
        ? 'DEGRADED'
        : 'READ_ONLY';

  return <section className="tabdeal-account-surface" aria-label={`Tabdeal ${mode} account surface`}>
    <header>
      <div>
        <span className="tabdeal-venue-chip">TABDEAL</span>
        <strong>Tabdeal FAPI · Secondary venue</strong>
        <small>Authenticated read-only account data. KuCoin remains primary/default; no automatic venue failover.</small>
      </div>
      <div className="tabdeal-surface-actions">
        <span className={`tabdeal-state state-${state.toLowerCase()}`}>{state}</span>
        <button type="button" onClick={() => void tabdeal.refresh()} disabled={tabdeal.loading} aria-label="Refresh Tabdeal account"><RefreshCw size={13} className={tabdeal.loading ? 'spin' : ''} /> Refresh</button>
      </div>
    </header>

    {!tabdeal.connection.connected ? <div className="tabdeal-empty">Tabdeal is not connected. Connect the secondary read-only venue in Settings to inspect its account data here.</div> : <>
      <div className="tabdeal-account-metrics">
        <div><span>Venue</span><strong>Tabdeal</strong></div>
        <div><span>Equity</span><strong>{money(account?.equityUsd)}</strong></div>
        <div><span>Available</span><strong>{money(account?.availableBalanceUsd)}</strong></div>
        <div><span>Margin used</span><strong>{money(account?.marginUsedUsd)}</strong></div>
        <div><span>Source observation</span><strong>{sourceTime(observedAt)}</strong></div>
      </div>
      {tabdeal.error && <div className="tabdeal-warning">{tabdeal.stale ? 'Last authoritative Tabdeal snapshot retained; its original source timestamp was not refreshed. ' : ''}{tabdeal.error}</div>}

      {mode === 'positions' ? <div className="tabdeal-table-wrap">
        <div className="tabdeal-table-title"><strong>Tabdeal positions</strong><span>{positions.length ? `${positions.length} observed` : 'No positions observed'}</span></div>
        {positions.length ? <table><thead><tr><th>Venue</th><th>Market</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Unrealized P&amp;L</th><th>Margin</th></tr></thead><tbody>
          {positions.map((position) => <tr key={`${position.venue}:${position.id}`}><td><span className="tabdeal-venue-chip">Tabdeal</span></td><td>{position.symbol || '—'}</td><td>{position.side}</td><td>{position.size == null ? '—' : position.size.toLocaleString()}</td><td>{position.entryPrice == null ? '—' : formatPrice(position.entryPrice)}</td><td>{position.markPrice == null ? '—' : formatPrice(position.markPrice)}</td><td>{money(position.unrealizedPnlUsd)}</td><td>{money(position.marginUsd)}</td></tr>)}
        </tbody></table> : <div className="tabdeal-empty">No Tabdeal positions were supplied by the authoritative account snapshot.</div>}
      </div> : <div className="tabdeal-table-wrap">
        <div className="tabdeal-table-title"><strong>Tabdeal orders</strong><span>{orders.length ? `${orders.length} observed` : 'No orders observed'}</span></div>
        {orders.length ? <table><thead><tr><th>Venue</th><th>Order</th><th>Market</th><th>Side</th><th>Type</th><th>Filled / Size</th><th>Status</th><th>Source time</th></tr></thead><tbody>
          {orders.map((order) => <tr key={`${order.venue}:${order.id}`}><td><span className="tabdeal-venue-chip">Tabdeal</span></td><td>{order.id || '—'}</td><td>{order.symbol || '—'}</td><td>{order.side}</td><td>{order.type}</td><td>{order.filled == null ? '—' : order.filled.toLocaleString()} / {order.size == null ? '—' : order.size.toLocaleString()}</td><td>{order.status}</td><td>{sourceTime(order.updatedAt ?? order.createdAt)}</td></tr>)}
        </tbody></table> : <div className="tabdeal-empty">No Tabdeal orders were supplied by the authoritative account snapshot.</div>}
      </div>}

      <TabdealCapabilityMatrix />
    </>}
  </section>;
}

export function TabdealCapabilityMatrix({ compact = false }: { compact?: boolean }) {
  return <div className={`tabdeal-capabilities${compact ? ' is-compact' : ''}`} aria-label="Tabdeal venue capability matrix"><ShieldCheck size={14} /><span>Historical klines: <b>NOT_SUPPORTED_BY_VENUE</b></span><span>Funding feed/history: <b>NOT_SUPPORTED_BY_VENUE</b></span><span>Execution: <b>READ_ONLY</b></span></div>;
}
