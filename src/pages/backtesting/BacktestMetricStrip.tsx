import React from 'react';
import type { BacktestResult } from '../../types';

function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function BacktestMetricStrip({
  result,
  localFinalBalance,
  startingCapital,
  localRiskPct,
}: {
  result: BacktestResult | null;
  localFinalBalance: number;
  startingCapital: number;
  localRiskPct: number;
}) {
  const profitFactor = result?.profitFactor == null ? (result?.timeline.length ? '∞' : '—') : result.profitFactor.toFixed(2);
  return (
    <>
      <div className="apex-bt-metric-source-label"><span>Canonical server metrics</span><small>Returned by the replay engine for this exact run</small></div>
      <div className="apex-bt-metric-strip">
        <div className="apex-bt-metric-cell"><span>Net Return</span><strong className={(result?.totalPnlPct ?? 0) >= 0 ? 'positive' : 'negative'}>{pct(result?.totalPnlPct)}</strong><small>Server total P&amp;L</small></div>
        <div className="apex-bt-metric-cell"><span>Win Rate</span><strong>{result ? `${result.historicalWinRatePct.toFixed(1)}%` : '—'}</strong><small>{result ? `${result.wins ?? 0} wins / ${result.timeline.length} trades` : 'No run yet'}</small></div>
        <div className="apex-bt-metric-cell"><span>Profit Factor</span><strong>{profitFactor}</strong><small>Server gross win/loss ratio</small></div>
        <div className="apex-bt-metric-cell"><span>Max Drawdown</span><strong className="negative">{result ? `-${Math.abs(result.maxDrawdownPct).toFixed(1)}%` : '—'}</strong><small>Canonical replay drawdown</small></div>
        <div className="apex-bt-metric-cell"><span>Average R</span><strong>{result ? result.avgRMultipleRealized.toFixed(2) : '—'}</strong><small>Realized R multiple</small></div>
        <div className="apex-bt-metric-cell"><span>Total Trades</span><strong>{result ? result.timeline.length : '—'}</strong><small>{result ? `${result.acceptedCandidates} accepted candidates` : 'No run yet'}</small></div>
      </div>
      <div className="apex-bt-local-calculation" aria-label="Local display calculation">
        <div className="apex-bt-local-calculation-label"><span>Local display calculation</span><small>Capital scaling only; not a canonical engine metric</small></div>
        <div><small>Displayed balance</small><strong>{result ? localFinalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 }) : startingCapital.toLocaleString()} USDT</strong></div>
        <div><small>UI risk profile</small><strong>{localRiskPct.toFixed(2)}%</strong></div>
      </div>
    </>
  );
}
