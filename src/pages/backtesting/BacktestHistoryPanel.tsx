import React from 'react';
import { History } from 'lucide-react';
import type { TradeDirection } from '../../types';

export interface BacktestHistoryEntry {
  id: string;
  runId?: string;
  timestamp: number;
  symbol: string;
  direction: TradeDirection;
  interval: string;
  netReturnPct: number;
}

function pct(value: number): string { return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`; }

export function BacktestHistoryPanel({ entries, expanded, onToggle }: { entries: BacktestHistoryEntry[]; expanded: boolean; onToggle: () => void }) {
  const visible = expanded ? entries : entries.slice(0, 3);
  return (
    <section className="apex-bt-evidence-block history">
      <header><span><History size={14} />Run History</span><div className="apex-bt-history-provenance"><em>This browser</em><button className="apex-bt-history-toggle" type="button" disabled={entries.length <= 3} onClick={onToggle}>{expanded ? 'Show less' : 'View all'}</button></div></header>
      <ul className="apex-bt-history-list">
        {visible.length ? visible.map((entry) => <li key={entry.id}>
          <History size={13} />
          <div><span>{new Date(entry.timestamp).toLocaleString()}</span><small>{entry.symbol} {entry.direction} · {entry.interval}</small></div>
          <b className={entry.netReturnPct >= 0 ? 'positive' : 'negative'}>{pct(entry.netReturnPct)}</b>
        </li>) : <li className="apex-bt-history-empty">No browser-local runs have been recorded.</li>}
      </ul>
    </section>
  );
}
