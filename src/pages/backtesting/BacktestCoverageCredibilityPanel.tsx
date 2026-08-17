import React from 'react';
import { AlertTriangle, CalendarRange, CheckCircle2, Database, Info, ShieldCheck } from 'lucide-react';
import type { BacktestResult } from '../../types';
import type { BacktestRunConfig } from './backtestingTypes';
import { deriveBacktestCoverage, formatCoverageTimestamp } from './backtestCoverage';

function n(value: number): string { return value.toLocaleString(); }
function pct(value: number | null): string { return value == null ? '—' : `${value.toFixed(value >= 99.5 ? 0 : 1)}%`; }

// Partial data is not presented as a complete backtest.
export function BacktestCoverageCredibilityPanel({ result, config, loading }: {
  result: BacktestResult | null;
  config: BacktestRunConfig;
  loading: boolean;
}) {
  const coverage = deriveBacktestCoverage(result, config);
  const Icon = coverage.status === 'full' ? CheckCircle2 : coverage.status === 'pending' ? Info : AlertTriangle;
  return (
    <section className={`apex-bt-coverage-panel status-${coverage.status}`} aria-label="Run Coverage and Credibility">
      <header>
        <div>
          <span><ShieldCheck size={15} aria-hidden="true" />Run Coverage &amp; Credibility</span>
          <small>{coverage.explanation}</small>
        </div>
        <strong><Icon size={14} aria-hidden="true" />{loading ? 'Running' : coverage.statusLabel}</strong>
      </header>
      <dl className="apex-bt-coverage-counts">
        <div><dt>Requested</dt><dd>{n(coverage.requestedCandles)}</dd><small>candles</small></div>
        <div><dt>Returned</dt><dd>{result ? n(coverage.returnedCandles) : '—'}</dd><small>candles</small></div>
        <div><dt>Used</dt><dd>{result ? n(coverage.usedCandles) : '—'}</dd><small>candles</small></div>
        <div><dt>Executable</dt><dd>{result ? n(coverage.executableCandles) : '—'}</dd><small>candles</small></div>
        <div><dt>Coverage</dt><dd>{pct(coverage.coveragePct)}</dd><small>{coverage.missingCandles ? `${n(coverage.missingCandles)} missing` : 'no returned gap'}</small></div>
      </dl>
      <div className="apex-bt-coverage-meta">
        <span><CalendarRange size={14} aria-hidden="true" /><b>Actual range</b><em>{formatCoverageTimestamp(coverage.firstTimestamp)} → {formatCoverageTimestamp(coverage.lastTimestamp)}</em></span>
        <span><Database size={14} aria-hidden="true" /><b>Provider</b><em>{coverage.provider}</em></span>
        <span><Info size={14} aria-hidden="true" /><b>Replay rules</b><em>{coverage.timeframe} · warm-up {coverage.warmupBars ?? '—'} · closed candles {coverage.closedCandlesOnly == null ? 'pending' : coverage.closedCandlesOnly ? 'yes' : 'no'}</em></span>
      </div>
      {result && coverage.status !== 'full' && (
        <p className="apex-bt-coverage-warning"><AlertTriangle size={13} aria-hidden="true" />Partial history: partial data is not presented as a complete backtest. Low trade count is reported separately from missing candle history.</p>
      )}
    </section>
  );
}
