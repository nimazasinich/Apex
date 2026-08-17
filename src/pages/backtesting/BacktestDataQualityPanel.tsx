import React from 'react';
import { AlertTriangle, Database, ShieldCheck } from 'lucide-react';
import type { BacktestResult, DataState } from '../../types';

export function BacktestDataQualityPanel({ result, routeState }: { result: BacktestResult | null; routeState: DataState }) {
  const state = result?.dataState ?? routeState;
  const live = state === 'live';
  return (
    <section className="apex-bt-evidence-block">
      <header><span>{live ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}Data Quality</span><strong className={live ? 'positive' : 'negative'}>{state.replaceAll('_', ' ').toUpperCase()}</strong></header>
      <dl>
        <div><dt>Source</dt><dd><Database size={11} />{result?.source || 'Not run'}</dd></div>
        <div><dt>Closed candles only</dt><dd>{result?.audit ? (result.audit.closedCandlesOnly ? 'Yes' : 'No') : 'Pending run'}</dd></div>
        <div><dt>Requested / returned</dt><dd>{result ? `${result.diagnostics?.requestedBars ?? result.requestedBars ?? 0} / ${result.diagnostics?.candlesReturned ?? result.candlesUsed}` : '—'}</dd></div>
        <div><dt>Warm-up / executable</dt><dd>{result ? `${result.diagnostics?.warmupBars ?? '—'} / ${result.diagnostics?.executableBars ?? '—'}` : '—'}</dd></div>
        <div><dt>Replay mode</dt><dd>{result?.replayMode || 'Pending run'}</dd></div>
        <div><dt>Deterministic</dt><dd>{result?.audit ? (result.audit.deterministic ? 'Yes' : 'No') : 'Pending run'}</dd></div>
      </dl>
      {result?.diagnostics?.noTradeReason && <p><AlertTriangle size={12} />{result.diagnostics.noTradeReason}</p>}
    </section>
  );
}
