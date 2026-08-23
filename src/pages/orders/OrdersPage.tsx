import React, { useEffect, useMemo, useState } from 'react';
import './OrdersPage.css';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Pencil,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  WalletCards,
  RefreshCw,
  X,
} from 'lucide-react';
import { cancelLiveOrder } from '../../services/accountClient';
import type { WorkspaceOrder } from '../../services/workspaceInsights';
import { buildOrderDraftTransfer, ORDER_DRAFT_STORAGE_KEY, paginate } from '../../lib/workspaceUi';
import { CoinIcon } from '../../components/CoinIcon';
import { notifyWorkspace } from '../../lib/workspaceFeedback';
import type { AccountWorkspaceProps } from '../pageTypes';
import { AccountFreshnessChip } from '../../components/ui/AccountFreshnessChip';
import {
  assetFrom,
  fmtCompact,
  fmtPrice,
  HalfGauge,
  PaginationControls,
  timestamp,
} from '../referenceUi';

type AssistantMode = 'inspect' | 'actions' | 'risk';

const ASSISTANT_MODE_COPY: Record<AssistantMode, { title: string; detail: string; chip: string }> = {
  inspect: {
    title: 'Select an order',
    detail: 'Order details, fill progress, and audit context appear here.',
    chip: 'Details ready after selection',
  },
  actions: {
    title: 'Safe actions',
    detail: 'Prepare replacements, duplicates, or manual cancels only after selecting a row.',
    chip: 'Manual confirmation required',
  },
  risk: {
    title: 'Execution guard',
    detail: 'The assistant checks status, remaining size, and environment before any action.',
    chip: 'Fail-closed workflow',
  },
};

function orderExecutionQuality(order: WorkspaceOrder): { improvementPerUnit: number | null; adverseSlippagePct: number | null } {
  const limit = order.price;
  const fill = order.averageFillPrice;
  if (limit == null || fill == null || !Number.isFinite(limit) || !Number.isFinite(fill) || limit <= 0 || order.filled <= 0) {
    return { improvementPerUnit: null, adverseSlippagePct: null };
  }
  const improvementPerUnit = order.side === 'buy' ? limit - fill : fill - limit;
  const adverseMove = order.side === 'buy' ? fill - limit : limit - fill;
  return { improvementPerUnit, adverseSlippagePct: (adverseMove / limit) * 100 };
}

function OrderMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: 'green' | 'amber' | 'violet' | 'red' | 'blue';
}) {
  return (
    <article className={`orders-kpi-card orders-kpi-${tone}`}>
      <div className="orders-kpi-icon"><Icon size={20} /></div>
      <div className="orders-kpi-copy">
        <span className="orders-kpi-label">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function OrdersEmptyVisual() {
  return (
    <div className="orders-empty-visual" aria-hidden="true">
      <span className="orders-empty-bubble one" />
      <span className="orders-empty-bubble two" />
      <span className="orders-empty-plus one">+</span>
      <span className="orders-empty-plus two">+</span>
      <svg viewBox="0 0 150 168">
        <rect x="35" y="22" width="80" height="124" rx="18" />
        <circle cx="58" cy="52" r="11" />
        <circle cx="58" cy="84" r="11" />
        <circle cx="58" cy="116" r="11" />
        <path d="M52 52l4 4 8-10M52 84l4 4 8-10M52 116l4 4 8-10" />
        <path d="M78 53h42M78 84h38M78 116h44M78 137h58" />
      </svg>
    </div>
  );
}

function OrderAssistantEmpty({
  mode,
  onModeChange,
}: {
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
}) {
  const copy = ASSISTANT_MODE_COPY[mode];
  return (
    <div className={`orders-assistant-empty mode-${mode}`}>
      <div className="assistant-mode-tabs" role="tablist" aria-label="Order assistant mode">
        {(['inspect', 'actions', 'risk'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            className={mode === item ? 'active' : ''}
            onClick={() => onModeChange(item)}
          >
            {item === 'inspect' ? <FileText size={13} /> : item === 'actions' ? <SlidersHorizontal size={13} /> : <ShieldCheck size={13} />}
            {item}
          </button>
        ))}
      </div>
      <div className="orders-assistant-honest-empty">
        <span className="orders-assistant-empty-icon"><ShieldCheck size={28} /></span>
        <strong>{copy.title}</strong>
        <span>{copy.detail}</span>
        <small>{copy.chip}</small>
      </div>
    </div>
  );
}

export function OrdersPage(props: AccountWorkspaceProps) {
  const orders = props.insights?.orders || [];
  const [selectedId, setSelectedId] = useState<string | null>(orders[0]?.id || null);
  const [selectionCleared, setSelectionCleared] = useState(false);
  const [statusTab, setStatusTab] = useState<'all' | WorkspaceOrder['status']>('all');
  const [orderQuery, setOrderQuery] = useState('');
  const [sideFilter, setSideFilter] = useState<'all' | WorkspaceOrder['side']>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'market' | 'limit'>('all');
  const [page, setPage] = useState(1);
  const [messageNote, setMessageNote] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('inspect');

  useEffect(() => setPage(1), [statusTab, orderQuery, sideFilter, typeFilter]);

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const normalizedType = order.type.toLowerCase().includes('market') ? 'market' : 'limit';
    return (statusTab === 'all' || order.status === statusTab)
      && (sideFilter === 'all' || order.side === sideFilter)
      && (typeFilter === 'all' || normalizedType === typeFilter)
      && (!orderQuery || `${order.symbol} ${order.id}`.toLowerCase().includes(orderQuery.toLowerCase()));
  }), [orders, orderQuery, sideFilter, statusTab, typeFilter]);

  const pageData = paginate(filteredOrders, page, 8);
  useEffect(() => {
    if (page !== pageData.page) setPage(pageData.page);
  }, [page, pageData.page]);

  useEffect(() => {
    if (selectionCleared) return;
    if (!filteredOrders.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredOrders.some((order) => order.id === selectedId)) setSelectedId(filteredOrders[0].id);
  }, [filteredOrders, selectedId, selectionCleared]);

  const selected = selectedId ? filteredOrders.find((order) => order.id === selectedId) || null : null;
  const selectedExecutionQuality = selected ? orderExecutionQuality(selected) : null;
  const count = (status: WorkspaceOrder['status']) => orders.filter((order) => order.status === status).length;
  const totalNotional = orders.reduce((sum, order) => sum + (order.price || order.averageFillPrice || 0) * order.size, 0);

  const cancel = async () => {
    if (!selected || (selected.status !== 'open' && selected.status !== 'partially_filled')) return;
    const confirmed = window.confirm(`Cancel order ${selected.id}? This will be sent to the active ${props.connection.mode.toUpperCase()} environment.`);
    if (!confirmed) return;
    setWorking(true);
    setMessageNote(null);
    try {
      await cancelLiveOrder(selected.id);
      const detail = `Order ${selected.id.slice(0, 12)} was cancelled.`;
      setMessageNote(detail);
      notifyWorkspace({ title: 'Order cancelled', detail, tone: 'success' });
      await props.onRefresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'order_cancel_failed';
      setMessageNote(detail);
      notifyWorkspace({ title: 'Order cancellation failed', detail, tone: 'error', durationMs: 6500 });
    } finally {
      setWorking(false);
    }
  };

  const prepareDraft = (order: WorkspaceOrder, intent: 'duplicate' | 'replace') => {
    if (typeof window === 'undefined') return;
    const transfer = buildOrderDraftTransfer(order, intent);
    window.sessionStorage.setItem(ORDER_DRAFT_STORAGE_KEY, JSON.stringify(transfer));
    const detail = intent === 'replace'
      ? `Replacement draft prepared for the remaining ${transfer.draft.quantity.toLocaleString()} ${assetFrom(order.symbol)}. Review it in Trading before cancelling the original order.`
      : `Duplicate draft prepared for ${order.symbol}. Review all fields before submission.`;
    setMessageNote(detail);
    notifyWorkspace({
      title: intent === 'replace' ? 'Replacement draft prepared' : 'Order draft duplicated',
      detail,
      tone: 'success',
      actionLabel: props.onOpenTrading ? 'Open Trading' : undefined,
      onAction: props.onOpenTrading ? () => props.onOpenTrading?.(order.symbol) : undefined,
    });
  };


  const refreshOrders = () => {
    notifyWorkspace({ title: 'Order refresh requested', detail: 'Synchronizing the latest account order snapshot.', tone: 'info' });
    void props.onRefresh();
  };

  const clearFilters = () => {
    setStatusTab('all');
    setOrderQuery('');
    setSideFilter('all');
    setTypeFilter('all');
    notifyWorkspace({ title: 'Order filters cleared', detail: 'All order statuses, sides, and types are visible again.', tone: 'info' });
  };

  const selectOrder = (orderId: string) => {
    setSelectionCleared(false);
    setSelectedId(orderId);
  };

  const copyOrderId = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      notifyWorkspace({ title: 'Order ID copied', detail: orderId, tone: 'success' });
    } catch {
      notifyWorkspace({ title: 'Could not copy order ID', detail: 'Clipboard access is unavailable in this browser context.', tone: 'warning' });
    }
  };



  const activeFilterCount = Number(statusTab !== 'all') + Number(Boolean(orderQuery)) + Number(sideFilter !== 'all') + Number(typeFilter !== 'all');

  const noDataTitle = props.loading && !props.insights
    ? 'Loading account orders'
    : props.error
      ? 'Order synchronization failed'
      : props.connection.mode === 'live' && props.connection.status !== 'connected'
        ? 'Live account is locked'
        : orders.length
          ? 'No orders match your filters'
          : 'No orders returned';
  const noDataDetail = props.loading && !props.insights
    ? 'Waiting for the current account workspace snapshot.'
    : props.error
      ? props.error
      : props.connection.mode === 'live' && props.connection.status !== 'connected'
        ? 'Connect a verified Live account or switch to Demo in Settings.'
        : orders.length
          ? 'Try a different status, side, type, or search term.'
          : 'Place an order in Demo or connect a verified Live account.';

  return (
    <div className="v20-reference-page v20-orders-page">
      <div className="v20-main-column">
        <div className="orders-hero">
          <div className="orders-hero-copy">
            <div><h1>Orders</h1><p>Track and manage your trading orders in real time.</p></div>
          </div>
          <AccountFreshnessChip loading={props.loading} error={props.error} connection={props.connection} snapshot={props.snapshot} />
          <button type="button" className="v20-refresh-action" onClick={refreshOrders} disabled={props.loading}><RefreshCw size={15} className={props.loading ? 'spin' : ''} /> {props.loading ? 'Syncing' : 'Refresh'}</button>
        </div>
        {props.connection.mode === 'live' && props.reconciliation && props.reconciliation.unresolvedIntentCount > 0 && (
          <section className="orders-reconciliation-warning" role="alert" data-testid="orders-reconciliation-warning">
            <AlertTriangle size={17} />
            <div>
              <strong>LIVE reconciliation requires attention</strong>
              <span>{props.reconciliation.unresolvedIntentCount} durable execution intent{props.reconciliation.unresolvedIntentCount === 1 ? '' : 's'} remain unresolved ({props.reconciliation.unresolvedStatuses.join(', ')}).</span>
              {props.reconciliation.latestError && <small>Latest issue: {props.reconciliation.latestError}</small>}
            </div>
          </section>
        )}
        <div className="orders-kpi-grid">
          <OrderMetricCard label="Open Orders" value={count('open')} detail="Active on markets" icon={FileText} tone="green" />
          <OrderMetricCard label="Partially Filled" value={count('partially_filled')} detail="Working orders" icon={Activity} tone="amber" />
          <OrderMetricCard label="Filled" value={count('filled')} detail="Completed orders" icon={CheckCircle2} tone="violet" />
          <OrderMetricCard label="Cancelled" value={count('cancelled')} detail="Cancelled orders" icon={X} tone="red" />
          <OrderMetricCard label="Total Notional" value={<>{fmtCompact(totalNotional)} <span className="orders-kpi-unit">USDT</span></>} detail="Visible order history" icon={WalletCards} tone="blue" />
        </div>

        <section className="v20-table-card v20-orders-table">
          <div className="v20-table-tabs" role="tablist" aria-label="Order status">
            <button type="button" role="tab" aria-selected={statusTab === 'all'} className={statusTab === 'all' ? 'active' : ''} onClick={() => setStatusTab('all')}>All Orders</button>
            <button type="button" role="tab" aria-selected={statusTab === 'open'} className={statusTab === 'open' ? 'active' : ''} onClick={() => setStatusTab('open')}>Open</button>
            <button type="button" role="tab" aria-selected={statusTab === 'partially_filled'} className={statusTab === 'partially_filled' ? 'active' : ''} onClick={() => setStatusTab('partially_filled')}>Partially Filled</button>
            <button type="button" role="tab" aria-selected={statusTab === 'filled'} className={statusTab === 'filled' ? 'active' : ''} onClick={() => setStatusTab('filled')}>Filled</button>
            <button type="button" role="tab" aria-selected={statusTab === 'cancelled'} className={statusTab === 'cancelled' ? 'active' : ''} onClick={() => setStatusTab('cancelled')}>Cancelled</button>
          </div>
          <div className="v20-filter-row">
            <label><Search size={14} /><input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="Search orders by ID or market…" /></label>
            <select aria-label="Filter orders by side" value={sideFilter} onChange={(event) => setSideFilter(event.target.value as typeof sideFilter)}>
              <option value="all">All Sides</option><option value="buy">Buy</option><option value="sell">Sell</option>
            </select>
            <select aria-label="Filter orders by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
              <option value="all">All Types</option><option value="limit">Limit</option><option value="market">Market</option>
            </select>
            <button type="button" className={activeFilterCount ? 'active-filters' : ''} disabled={!activeFilterCount} onClick={clearFilters}><SlidersHorizontal size={13} /> Clear Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</button>
          </div>
          <table>
            <thead><tr><th></th><th>Order ID</th><th>Market</th><th>Side</th><th>Type</th><th>Filled / Size</th><th>Avg. Fill</th><th>Status</th><th>Time</th><th></th></tr></thead>
            <tbody>{pageData.items.map((order) => {
              // The exact pair, kept for the cell `title`: the Filled / Size column
              // is the one cell whose content width scales with the magnitude of the
              // data, so a seven-digit pair truncates visually. The unrounded value
              // stays available here rather than being abbreviated in the table.
              const fillLabel = `${order.filled.toLocaleString()} / ${order.size.toLocaleString()}`;
              return (
              <tr
                key={order.id}
                className={selected?.id === order.id ? 'selected' : ''}
                onClick={() => selectOrder(order.id)}
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectOrder(order.id); } }}
              >
                <td><span className="v20-radio" /></td>
                <td>{order.id.slice(0, 12)}</td>
                <td><CoinIcon symbol={order.symbol} size={20} /><strong title={order.symbol}>{order.symbol}</strong></td>
                <td><span className={`v20-pill ${order.side === 'buy' ? 'success' : 'danger'}`}>{order.side === 'buy' ? 'Buy' : 'Sell'}</span></td>
                <td title={order.type}>{order.type}</td>
                <td title={fillLabel}><span>{fillLabel}</span><div className="v20-progress"><i style={{ width: `${order.fillPct}%` }} /></div></td>
                <td>{fmtPrice(order.averageFillPrice || order.price)}</td>
                <td><span className={`v20-pill ${order.status}`}>{order.status.replace('_', ' ')}</span></td>
                <td>{timestamp(order.updatedAt || order.createdAt)}</td>
                <td><button type="button" className="v20-icon-button" onClick={(event) => { event.stopPropagation(); prepareDraft(order, 'duplicate'); }} aria-label="Duplicate order"><FileText size={14} /></button></td>
              </tr>
              );
            })}</tbody>
          </table>
          {!pageData.items.length && <div className="orders-empty-state"><OrdersEmptyVisual /><strong>{noDataTitle}</strong><span>{noDataDetail}</span></div>}
          <PaginationControls {...pageData} onPageChange={setPage} />
          {messageNote && <div className="v20-message" role="status"><span>{messageNote}</span><button type="button" aria-label="Dismiss order message" onClick={() => setMessageNote(null)}><X size={13} /></button></div>}
        </section>
      </div>

      <aside className="v20-context-sidebar">
        <div className="v20-context-title"><strong>Order Assistant</strong><button type="button" className="v20-icon-button" onClick={() => { setSelectionCleared(true); setSelectedId(null); }} aria-label="Clear selected order" title="Clear selection"><X size={15} /></button></div>
        {selected ? (
          <>
            <div className="v20-context-section">
              <div className="v20-selected-asset">
                <CoinIcon symbol={selected.symbol} size={26} />
                <span><strong>{selected.symbol}</strong><small>{selected.side === 'buy' ? 'Buy' : 'Sell'} · {selected.type}</small></span>
                <span className={`v20-pill ${selected.status}`}>{selected.status.replace('_', ' ')}</span>
              </div>
              <div className="v20-order-id-row"><h2>{selected.id.slice(0, 14)}</h2><button type="button" className="v20-icon-button" aria-label="Copy full order ID" title="Copy full order ID" onClick={() => void copyOrderId(selected.id)}><Copy size={14} /></button></div>
              <dl className="v20-detail-list">
                <div><dt>Order Type</dt><dd>{selected.type}</dd></div>
                <div><dt>Limit Price</dt><dd>{fmtPrice(selected.price)}</dd></div>
                <div><dt>Order Size</dt><dd>{selected.size.toLocaleString()} {assetFrom(selected.symbol)}</dd></div>
                <div><dt>Filled</dt><dd>{selected.filled.toLocaleString()}</dd></div>
                <div><dt>Remaining</dt><dd>{Math.max(0, selected.size - selected.filled).toLocaleString()}</dd></div>
                <div><dt>Time</dt><dd>{timestamp(selected.createdAt)}</dd></div>
              </dl>
            </div>
            <div className="v20-context-section">
              <strong>Fill Progress</strong>
              <HalfGauge value={selected.fillPct} label="Filled" centerText={`${Math.round(selected.fillPct)}%`} />
              <div className="orders-fill-meter" aria-label={`Order is ${selected.fillPct.toFixed(1)} percent filled`}><i style={{ width: `${selected.fillPct}%` }} /></div>
              <div className="v20-side-values">
                <span><b>{selected.filled.toLocaleString()}</b> Filled</span>
                <span><b>{selected.size.toLocaleString()}</b> Total Size</span>
              </div>
            </div>
            <div className="v20-context-section">
              <strong>Execution Quality</strong>
              <dl className="v20-detail-list">
                <div><dt>Avg. Fill Price</dt><dd>{fmtPrice(selected.averageFillPrice || selected.price)}</dd></div>
                <div><dt>Price Improvement</dt><dd className={(selectedExecutionQuality?.improvementPerUnit ?? 0) >= 0 ? 'positive' : 'negative'}>{selectedExecutionQuality?.improvementPerUnit == null ? '—' : `${selectedExecutionQuality.improvementPerUnit >= 0 ? '+' : ''}${fmtPrice(selectedExecutionQuality.improvementPerUnit)}`}</dd></div>
                <div><dt>Slippage</dt><dd className={(selectedExecutionQuality?.adverseSlippagePct ?? 0) <= 0 ? 'positive' : 'negative'}>{selectedExecutionQuality?.adverseSlippagePct == null ? '—' : `${selectedExecutionQuality.adverseSlippagePct.toFixed(3)}%`}</dd></div>
                <div><dt>Current Status</dt><dd>{selected.status.replace('_', ' ')}</dd></div>
                <div><dt>Fill Rate</dt><dd className="positive">{selected.fillPct.toFixed(1)}%</dd></div>
              </dl>
              <div className="orders-safety-strip"><ShieldCheck size={13} /><span>Draft actions require review in Trading.</span></div>
            </div>
            <div className="v20-context-section v20-quick-actions">
              <strong>Quick Actions</strong>
              <button type="button" onClick={() => prepareDraft(selected, 'replace')} disabled={selected.status !== 'open' && selected.status !== 'partially_filled'} title="Creates a replacement draft for the remaining quantity; it does not silently cancel the original order"><Pencil size={15} /> Prepare Replacement</button>
              <button type="button" className="danger" onClick={() => void cancel()} disabled={working || (selected.status !== 'open' && selected.status !== 'partially_filled')}><Trash2 size={15} /> Cancel Order</button>
              <button type="button" onClick={() => prepareDraft(selected, 'duplicate')}><FileText size={15} /> Duplicate Order</button>
            </div>
          </>
        ) : <OrderAssistantEmpty mode={assistantMode} onModeChange={setAssistantMode} />}
      </aside>
    </div>
  );
}
