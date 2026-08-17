import React from 'react';
import type { BacktestResult } from '../types';

export default function BacktestTradesTable({ trades, loading, error, full }: { trades: BacktestResult['timeline'] | []; loading: boolean; error: string | null; full?: boolean }) {
  const rows = trades || [];
  const display = full ? rows.slice().reverse() : rows.slice().reverse().slice(0, 5);
  return (
    <div className={full ? 'apex-bt-trades-full' : 'apex-bt-recent-trades'}>
      {full ? (
        <table>
          <thead><tr><th>#</th><th>Opened</th><th>Side</th><th>Entry</th><th>Exit</th><th>PnL (%)</th><th>Reason</th></tr></thead>
          <tbody>
            {display.map((trade: any) => (
              <tr key={`${trade.timestamp}-${trade.entry}-${trade.exit}`}>
                <td>{trade.tradeNumber ?? '—'}</td>
                <td>{trade.dateLabel} <small>{trade.timeLabel}</small></td>
                <td><span className={`apex-bt-side ${trade.rMultiple >= 0 ? 'long' : 'short'}`}>{trade.rMultiple >= 0 ? 'Long' : 'Short'}</span></td>
                <td>{trade.entry ? trade.entry.toFixed ? Number(trade.entry).toFixed(4) : trade.entry : '—'}</td>
                <td>{trade.exit ? trade.exit.toFixed ? Number(trade.exit).toFixed(4) : trade.exit : '—'}</td>
                <td className={trade.adjustedReturnPct >= 0 ? 'positive' : 'negative'}>{trade.adjustedReturnPct != null ? `${trade.adjustedReturnPct.toFixed(2)}%` : '—'}</td>
                <td>{trade.outcome === 'WIN' ? 'Take Profit' : trade.outcome === 'LOSS' ? 'Stop Loss' : 'Timed exit'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7}><div className="apex-bt-table-empty">{loading ? 'The engine is evaluating historical bars…' : error || 'No replay trades are available.'}</div></td></tr>}
          </tbody>
        </table>
      ) : (
        <div>
          <div className="apex-bt-recent-trades-head"><strong>Recent Trades</strong></div>
          <div className="apex-bt-table-wrap">
            <table>
              <thead><tr><th>#</th><th>Entry Time</th><th>Side</th><th>Entry Price</th><th>Exit Price</th><th>PnL (%)</th><th>Reason</th></tr></thead>
              <tbody>
                {display.map((trade: any) => (
                  <tr key={`${trade.timestamp}-${trade.entry}-${trade.exit}`}>
                    <td>{trade.tradeNumber ?? '—'}</td>
                    <td>{trade.dateLabel} {trade.timeLabel}</td>
                    <td><span className={`apex-bt-side ${trade.rMultiple >= 0 ? 'long' : 'short'}`}>{trade.rMultiple >= 0 ? 'Long' : 'Short'}</span></td>
                    <td>{trade.entry ? Number(trade.entry).toFixed(4) : '—'}</td>
                    <td>{trade.exit ? Number(trade.exit).toFixed(4) : '—'}</td>
                    <td className={trade.adjustedReturnPct >= 0 ? 'positive' : 'negative'}>{trade.adjustedReturnPct != null ? `${trade.adjustedReturnPct.toFixed(2)}%` : '—'}</td>
                    <td>{trade.outcome === 'WIN' ? 'Take Profit' : trade.outcome === 'LOSS' ? 'Stop Loss' : 'Timed exit'}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7}><div className="apex-bt-table-empty">{loading ? 'The engine is evaluating historical bars…' : error || 'No replay trades are available.'}</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
