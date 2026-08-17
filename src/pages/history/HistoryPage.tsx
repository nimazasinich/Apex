import React, { useEffect, useMemo, useState } from 'react';
import './HistoryPage.css';
import { Activity, Database, Download, FileText, History, RefreshCw, Search, ShieldCheck, WalletCards } from 'lucide-react';
import {
  DataState,
  PageHeading,
  Panel,
  PanelHeader,
  StatusBadge,
  WorkspacePageFrame,
  formatMaybeNumber,
} from '../../components/ui/WorkspacePrimitives';
import type { WorkspaceActivity } from '../../services/workspaceInsights';
import type { AccountWorkspaceProps } from '../pageTypes';
import { AccountFreshnessChip } from '../../components/ui/AccountFreshnessChip';
import { notifyWorkspace } from '../../lib/workspaceFeedback';

const PAGE_SIZE = 50;
const toneFor = (record: WorkspaceActivity): 'positive' | 'negative' | 'warning' | 'info' | 'neutral' => {
  if (record.direction === 'positive') return 'positive';
  if (record.direction === 'negative') return 'negative';
  if (record.status === 'pending') return 'warning';
  if (record.status === 'completed' || record.status === 'success') return 'positive';
  if (record.status === 'cancelled') return 'negative';
  return 'neutral';
};

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(records: WorkspaceActivity[]) {
  const headers = ['timestamp_iso', 'type', 'title', 'subtitle', 'symbol', 'amount', 'currency', 'usd_value', 'realized_pnl_usd', 'status', 'reference'];
  const lines = records.map((record) => [
    new Date(record.timestamp).toISOString(), record.type, record.title, record.subtitle, record.symbol,
    record.amount, record.currency, record.usdValue, record.realizedPnlUsd, record.status, record.reference,
  ].map(csvCell).join(','));
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const filename = `apex-account-history-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return filename;
}

function HistoryMetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'violet';
}) {
  return (
    <article className={`history-metric-card tone-${tone}`} tabIndex={0} aria-label={`${label}: ${String(value)}`}>
      <div className="history-metric-head"><span>{icon}</span><strong>{label}</strong></div>
      <b>{value}</b>
      <small>{detail}</small>
    </article>
  );
}

export function HistoryPage(props: AccountWorkspaceProps) {
  const records = props.insights?.activities || [];
  const [type, setType] = useState<'all' | WorkspaceActivity['type']>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    return records.filter((record) => {
      if (type !== 'all' && record.type !== type) return false;
      return !normalized || `${record.symbol || ''} ${record.status} ${record.title} ${record.subtitle} ${record.reference || ''}`.toUpperCase().includes(normalized);
    });
  }, [query, records, type]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const selected = records.find((record) => record.id === selectedId) || paged[0] || null;
  const sourceCounts = {
    order: records.filter((record) => record.type === 'order').length,
    trade: records.filter((record) => record.type === 'trade').length,
    position: records.filter((record) => record.type === 'position').length,
  };
  const sumUsdByType = (recordType: WorkspaceActivity['type']) => records
    .filter((record) => record.type === recordType && Number.isFinite(record.usdValue))
    .reduce((sum, record) => sum + Number(record.usdValue), 0);
  const depositTotal = sumUsdByType('deposit');
  const withdrawalTotal = sumUsdByType('withdrawal');
  const fundingTotal = sumUsdByType('funding');

  const setFilterType = (next: typeof type) => { setType(next); setPage(1); };


  const refreshHistory = () => {
    notifyWorkspace({ title: 'History refresh requested', detail: 'Synchronizing the latest normalized account activity.', tone: 'info' });
    void props.onRefresh();
  };

  const exportHistory = () => {
    if (!visible.length) return;
    const filename = downloadCsv(visible);
    notifyWorkspace({
      title: 'History export created',
      detail: `${visible.length} filtered records saved as ${filename}.`,
      tone: 'success',
    });
  };

  const clearFilters = () => {
    setType('all');
    setQuery('');
    setPage(1);
    notifyWorkspace({ title: 'History filters cleared', detail: 'The complete activity snapshot is visible again.', tone: 'info' });
  };

  const main = <div className="apex-v3-history-main">
    <PageHeading eyebrow="" title="History" subtitle="View and track normalized account activity from the current verified workspace snapshot." actions={<button type="button" className="apex-v3-button secondary" onClick={refreshHistory} disabled={props.loading}><RefreshCw size={14} className={props.loading ? 'spin' : ''} /> Refresh</button>} />
    <div className="history-summary">
      <HistoryMetricCard label="Total Activity" value={props.insights ? records.length : '—'} detail="Normalized account events" icon={<History size={16} />} tone="positive" />
      <HistoryMetricCard label="Total Trades" value={props.insights ? sourceCounts.trade : '—'} detail="Reported account fills" icon={<Activity size={16} />} tone="info" />
      <HistoryMetricCard label="Total Deposits" value={props.insights ? formatMaybeNumber(depositTotal, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }) : '—'} detail="USD-valued deposits" icon={<WalletCards size={16} />} tone="violet" />
      <HistoryMetricCard label="Total Withdrawals" value={props.insights ? formatMaybeNumber(withdrawalTotal, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }) : '—'} detail="USD-valued withdrawals" icon={<Download size={16} />} tone="warning" />
      <HistoryMetricCard label="Net Funding" value={props.insights ? formatMaybeNumber(fundingTotal, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }) : '—'} detail="Reported funding events" icon={<FileText size={16} />} tone={fundingTotal >= 0 ? 'positive' : 'negative'} />
    </div>

    <div className="apex-v3-tabs apex-v3-history-tabs" role="tablist" aria-label="Activity type">{(['all', 'order', 'trade', 'position', 'deposit', 'withdrawal', 'transfer', 'funding'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={type === item} className={`${type === item ? 'active ' : ''}history-tab-${item}`} onClick={() => setFilterType(item)}>{item === 'all' ? 'All activity' : item}</button>)}</div>
    <div className="apex-v3-toolbar apex-v3-history-toolbar"><label className="apex-v3-search-field compact"><Search size={14} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search history" aria-label="Search account history" /></label><div><span>{visible.length} records</span><button type="button" className="apex-v3-button secondary" onClick={clearFilters} disabled={type === 'all' && !query}>Clear filters</button></div></div>

    <Panel className="apex-v3-table-panel history-table">
      <PanelHeader title="Activity ledger" subtitle={`${visible.length} records in active filters`} action={<><AccountFreshnessChip loading={props.loading} error={props.error} connection={props.connection} snapshot={props.snapshot} /><StatusBadge tone={props.connection.mode === 'demo' ? 'info' : props.connection.status === 'connected' ? 'positive' : 'warning'}>{props.connection.mode.toUpperCase()}</StatusBadge></>} />
      {props.loading && !props.insights ? <DataState availability="loading" title="Loading account history" detail="Waiting for the current workspace snapshot." />
        : props.error ? <DataState availability="error" title="History unavailable" detail={props.error} onRetry={() => void props.onRefresh()} />
          : props.connection.mode === 'live' && props.connection.status !== 'connected' ? <DataState availability="locked" title="Live history is locked" detail="Connect a verified Live account or switch to Demo." />
            : !props.insights ? <DataState availability="empty" title="No account snapshot" detail="WorkspaceInsights has not been generated yet." />
              : !visible.length ? <DataState availability="empty" title="No matching activity" detail="The account returned no records for this filter." />
                : <><div className="apex-v3-table-scroll"><table className="apex-v3-table"><thead><tr><th>Time</th><th>Type</th><th>Event</th><th>Symbol</th><th>Amount</th><th>USD value</th><th>P&L</th><th>Status</th></tr></thead><tbody>{paged.map((record) => <tr key={record.id} className={selected?.id === record.id ? 'selected' : ''} onClick={() => setSelectedId(record.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(record.id); } }}><td>{new Date(record.timestamp).toLocaleString()}</td><td><StatusBadge tone="info">{record.type}</StatusBadge></td><td><strong>{record.title}</strong><small>{record.subtitle}</small></td><td>{record.symbol || '—'}</td><td>{formatMaybeNumber(record.amount, { maximumFractionDigits: 6 })} {record.currency || ''}</td><td>{formatMaybeNumber(record.usdValue, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}</td><td className={record.realizedPnlUsd == null ? '' : record.realizedPnlUsd >= 0 ? 'positive' : 'negative'}>{formatMaybeNumber(record.realizedPnlUsd, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}</td><td><StatusBadge tone={toneFor(record)}>{record.status}</StatusBadge></td></tr>)}</tbody></table></div><div className="apex-v3-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</button></div></>}
    </Panel>
  </div>;

  const context = <div className="apex-v3-context-stack history-context">
    <Panel className="timeline-card"><PanelHeader title="Recent timeline" subtitle="Latest normalized records" action={<History size={16} />} />{records.length ? <div className="apex-v3-timeline">{records.slice(0, 8).map((record) => <button type="button" key={record.id} className={selected?.id === record.id ? 'active' : ''} onClick={() => setSelectedId(record.id)}><i className={`tone-${toneFor(record)}`} /><span><strong>{record.symbol || record.title}</strong><small>{record.status} · {new Date(record.timestamp).toLocaleString()}</small></span></button>)}</div> : <div className="history-empty-visual"><Database size={34} /><strong>No timeline</strong><span>Account activity has not been reported yet.</span></div>}</Panel>
    <Panel className="export-card"><PanelHeader title="Export & reports" subtitle="Filtered client-side CSV" action={<Download size={16} />} /><button type="button" className="apex-v3-button primary full history-export-button" onClick={exportHistory} disabled={!visible.length}><Download size={15} /> <span>Export filtered history</span></button><p>The export includes only rows displayed from the current account snapshot and uses ISO timestamps.</p><div className="history-export-status"><ShieldCheck size={13} /><span>{visible.length ? `${visible.length} filtered rows ready` : 'Export unlocks when rows are visible'}</span></div></Panel>
    <Panel className="activity-insights-card"><PanelHeader title="Activity insights" subtitle="Source-aware summary" /><div className="history-source-bars"><span style={{ '--bar': records.length ? sourceCounts.order / records.length * 100 : 0 } as React.CSSProperties}><b>Orders</b><i /><em>{sourceCounts.order}</em></span><span style={{ '--bar': records.length ? sourceCounts.trade / records.length * 100 : 0 } as React.CSSProperties}><b>Trades</b><i /><em>{sourceCounts.trade}</em></span><span style={{ '--bar': records.length ? sourceCounts.position / records.length * 100 : 0 } as React.CSSProperties}><b>Positions</b><i /><em>{sourceCounts.position}</em></span></div><div className="history-report-note"><FileText size={13} /><span><strong>{visible.length ? 'Report ready' : 'Report waiting'}</strong><small>{visible.length ? 'Filtered rows can be exported now.' : 'Rows appear after account activity is reported.'}</small></span></div><div className="history-report-generated"><span>Generated</span><b>{props.insights ? new Date(props.insights.generatedAt).toLocaleString() : 'Unavailable'}</b></div></Panel>
  </div>;

  return <WorkspacePageFrame className="apex-v3-page apex-v3-history-page" main={main} context={context} />;
}
