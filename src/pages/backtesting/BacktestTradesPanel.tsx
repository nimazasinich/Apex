import React from 'react';
import type { BacktestResult, TradeDirection } from '../../types';

export type BacktestTradeRow = BacktestResult['timeline'][number] & {
  adjustedReturnPct: number;
  tradeNumber: number;
  dateLabel: string;
  timeLabel: string;
};

function price(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : 8;
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
}
function pct(value: number): string { return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`; }

export function BacktestTradesPanel({ trades, direction, compact = false, onOpenAll }: { trades: BacktestTradeRow[]; direction: TradeDirection; compact?: boolean; onOpenAll?: () => void }) {
  const rows = compact ? trades.slice().reverse().slice(0, 5) : trades.slice().reverse();
  return (
    <div className={compact ? 'apex-bt-recent-trades' : 'apex-bt-trades-full'}>
      {compact && <div className="apex-bt-recent-trades-head"><strong>Recent Trades</strong>{onOpenAll && <button type="button" className="apex-bt-view-all" onClick={onOpenAll}>View all trades</button>}</div>}
      <div className={compact ? 'apex-bt-table-wrap' : undefined}>
        <table>
          <thead><tr><th>#</th><th>{compact ? 'Entry Time' : 'Opened'}</th><th>Side</th><th>Entry Price</th><th>Exit Price</th><th>PnL (%)</th><th>Reason</th></tr></thead>
          <tbody>
            {rows.map((trade) => <tr key={`${trade.timestamp}-${trade.tradeNumber}`}>
              <td>{trade.tradeNumber}</td><td>{trade.dateLabel} {trade.timeLabel}</td>
              <td><span className={`apex-bt-side ${direction.toLowerCase()}`}>{direction === 'LONG' ? 'Long' : 'Short'}</span></td>
              <td>{price(trade.entry)}</td><td>{price(trade.exit)}</td>
              <td className={trade.adjustedReturnPct >= 0 ? 'positive' : 'negative'}>{pct(trade.adjustedReturnPct)}</td>
              <td>{trade.reason || (trade.outcome === 'WIN' ? 'Take Profit' : trade.outcome === 'LOSS' ? 'Stop Loss' : 'Timed exit')}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={7}><div className="apex-bt-table-empty">No replay trades are available.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
