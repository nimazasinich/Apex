import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import type { SignalDecisionLog } from '../../types';
import { DecisionMemoryDB } from '../../services/decisionMemory';
import { useDialogA11y } from '../../lib/useDialogA11y';
import './OperationsDrawers.css';

interface DecisionJournalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const OUTCOMES: Array<NonNullable<SignalDecisionLog['laterOutcome']> | ''> = ['', 'WIN', 'LOSS', 'BREAKEVEN', 'EXPIRED', 'UNKNOWN'];
const PAGE_SIZE = 50;

function csvCell(value: unknown) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function download(filename: string, type: string, content: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DecisionJournalDrawer({ isOpen, onClose }: DecisionJournalDrawerProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useDialogA11y({ isOpen, onClose, initialFocusRef: closeRef });
  const [rows, setRows] = useState<SignalDecisionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [decision, setDecision] = useState('ALL');
  const [direction, setDirection] = useState('ALL');
  const [outcome, setOutcome] = useState('ALL');
  const [reason, setReason] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [editing, setEditing] = useState<Record<string, { outcome: string; pnl: string }>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await DecisionMemoryDB.list(5000)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Decision journal is unavailable.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isOpen) void load(); }, [isOpen, load]);

  const reasons = useMemo(() => [...new Set(rows.map((row) => row.reasonCode))].sort(), [rows]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return rows.filter((row) => {
      if (decision !== 'ALL' && row.decision !== decision) return false;
      if (direction !== 'ALL' && row.direction !== direction) return false;
      if (outcome !== 'ALL' && (row.laterOutcome || 'UNRESOLVED') !== outcome) return false;
      if (reason !== 'ALL' && row.reasonCode !== reason) return false;
      if (row.timestamp < from || row.timestamp > to) return false;
      return !normalized || `${row.ticker} ${row.reasonCode} ${row.reasonText} ${row.cycleId}`.toUpperCase().includes(normalized);
    });
  }, [decision, direction, fromDate, outcome, query, reason, rows, toDate]);

  useEffect(() => setPage(1), [decision, direction, fromDate, outcome, query, reason, toDate]);

  const accepted = filtered.filter((row) => row.decision === 'ACCEPTED').length;
  const rejected = filtered.filter((row) => row.decision === 'REJECTED').length;
  const resolved = filtered.filter((row) => row.laterOutcome && row.laterOutcome !== 'UNKNOWN');
  const pnlRows = filtered.filter((row) => Number.isFinite(row.laterPnl));
  const avgPnl = pnlRows.length ? pnlRows.reduce((sum, row) => sum + Number(row.laterPnl), 0) / pnlRows.length : null;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const draftFor = (row: SignalDecisionLog) => editing[row.id] || { outcome: row.laterOutcome || '', pnl: row.laterPnl == null ? '' : String(row.laterPnl) };
  const updateDraft = (row: SignalDecisionLog, patch: Partial<{ outcome: string; pnl: string }>) => setEditing((current) => ({ ...current, [row.id]: { ...draftFor(row), ...patch } }));
  const saveOutcome = async (row: SignalDecisionLog) => {
    const draft = draftFor(row);
    const parsedPnl = draft.pnl.trim() === '' ? undefined : Number(draft.pnl);
    try {
      await DecisionMemoryDB.patch(row.id, { laterOutcome: draft.outcome ? draft.outcome as NonNullable<SignalDecisionLog['laterOutcome']> : undefined, laterPnl: parsedPnl });
      setEditing((current) => { const next = { ...current }; delete next[row.id]; return next; });
      setMessage(`Updated ${row.ticker}. laterPnl is stored as an R-multiple.`);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Outcome update failed.'); }
  };
  const removeRow = async (row: SignalDecisionLog) => {
    if (!window.confirm(`Delete decision ${row.id}?`)) return;
    await DecisionMemoryDB.delete(row.id);
    await load();
  };
  const exportJson = () => download(`apex-decision-journal-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(filtered, null, 2));
  const exportCsv = () => {
    const fields: Array<keyof SignalDecisionLog> = ['id', 'cycleId', 'isoTime', 'ticker', 'direction', 'decision', 'reasonCode', 'reasonText', 'confidence', 'rawScore', 'laterOutcome', 'laterPnl'];
    const content = [fields.map(csvCell).join(','), ...filtered.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\n');
    download(`apex-decision-journal-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8', content);
  };

  if (!isOpen) return null;

  return <div className="apex-ops-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="apex-ops-drawer apex-journal-drawer" role="dialog" aria-modal="true" aria-labelledby="decision-journal-title">
      <header className="apex-ops-header"><div><span>Canonical Decision Memory</span><h2 id="decision-journal-title">Decision Journal</h2><p>Outcomes are annotations on existing SignalDecisionLog rows; scores are not probabilities.</p></div><button ref={closeRef} type="button" aria-label="Close decision journal" onClick={onClose}><X size={18} /></button></header>
      <div className="apex-ops-toolbar"><span>{filtered.length} filtered rows</span><div className="apex-journal-actions"><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh</button><button type="button" onClick={exportCsv} disabled={!filtered.length}><Download size={14} /> CSV</button><button type="button" onClick={exportJson} disabled={!filtered.length}><Download size={14} /> JSON</button></div></div>
      <section className="apex-journal-summary" aria-label="Outcome breakdown"><article><span>Accepted</span><strong>{accepted}</strong></article><article><span>Rejected</span><strong>{rejected}</strong></article><article><span>Resolved</span><strong>{resolved.length}</strong></article><article><span>Average later P&L</span><strong>{avgPnl == null ? '—' : `${avgPnl.toFixed(2)}R`}</strong></article></section>
      <section className="apex-journal-filters"><label className="search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticker, reason, cycle…" /></label><select aria-label="Decision filter" value={decision} onChange={(event) => setDecision(event.target.value)}><option value="ALL">All decisions</option><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option></select><select aria-label="Direction filter" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="ALL">All directions</option><option value="LONG">Long</option><option value="SHORT">Short</option><option value="NONE">None</option></select><select aria-label="Outcome filter" value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="ALL">All outcomes</option><option value="UNRESOLVED">Unresolved</option>{OUTCOMES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="Reason filter" value={reason} onChange={(event) => setReason(event.target.value)}><option value="ALL">All reasons</option>{reasons.map((item) => <option key={item} value={item}>{item}</option>)}</select><label><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></section>
      {message && <div className="apex-ops-inline-warning success">{message}</div>}
      {loading && !rows.length ? <div className="apex-ops-state"><RefreshCw className="spin" size={22} /><strong>Loading decision memory</strong></div> : error && !rows.length ? <div className="apex-ops-state error"><strong>Decision memory unavailable</strong><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div> : !visible.length ? <div className="apex-ops-state"><strong>No matching decisions</strong><span>Change filters or wait for canonical scanner decisions to be persisted.</span></div> : <div className="apex-journal-table-wrap"><table className="apex-journal-table"><thead><tr><th>Time / Market</th><th>Decision</th><th>Reason</th><th>Outcome</th><th>laterPnl (R)</th><th>Actions</th></tr></thead><tbody>{visible.map((row) => { const draft = draftFor(row); return <tr key={row.id}><td><strong>{row.ticker}</strong><small>{new Date(row.timestamp).toLocaleString()} · {row.direction}</small></td><td><b className={row.decision === 'ACCEPTED' ? 'positive' : 'negative'}>{row.decision}</b><small>Score {row.rawScore ?? row.confidence ?? '—'} (ranking only)</small></td><td><strong>{row.reasonCode}</strong><small title={row.reasonText}>{row.reasonText}</small></td><td><select value={draft.outcome} onChange={(event) => updateDraft(row, { outcome: event.target.value })}>{OUTCOMES.map((item) => <option key={item || 'blank'} value={item}>{item || 'Unresolved'}</option>)}</select></td><td><input type="number" step="0.01" value={draft.pnl} onChange={(event) => updateDraft(row, { pnl: event.target.value })} placeholder="e.g. 1.50" /></td><td><button type="button" aria-label={`Save outcome for ${row.ticker}`} onClick={() => void saveOutcome(row)}><Save size={14} /></button><button type="button" aria-label={`Delete ${row.ticker} decision`} onClick={() => void removeRow(row)}><Trash2 size={14} /></button></td></tr>; })}</tbody></table></div>}
      <footer className="apex-journal-pagination"><span>Page {Math.min(page, pages)} of {pages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button type="button" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</button></div></footer>
    </div>
  </div>;
}
