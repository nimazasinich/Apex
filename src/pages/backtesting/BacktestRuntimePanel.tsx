import React from 'react';
import { Clock3 } from 'lucide-react';
import type { BacktestResult } from '../../types';

function ms(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(value >= 1000 ? 0 : 1)} ms`;
}

export function BacktestRuntimePanel({ result, observedTotalMs }: { result: BacktestResult | null; observedTotalMs: number | null }) {
  return (
    <section className="apex-bt-evidence-block">
      <header><span><Clock3 size={14} />Runtime Evidence</span><small>Server timings unless labelled observed</small></header>
      <dl>
        <div><dt>Total</dt><dd>{ms(result?.runtime?.totalMs)}</dd></div>
        <div><dt>History fetch</dt><dd>{ms(result?.runtime?.historyFetchMs)}</dd></div>
        <div><dt>Replay</dt><dd>{ms(result?.runtime?.replayMs)}</dd></div>
        <div><dt>Ticker lookup</dt><dd>{ms(result?.runtime?.tickerLookupMs)}</dd></div>
        <div><dt>Lookup state</dt><dd>{result?.runtime?.tickerLookupState || '—'}</dd></div>
        <div><dt>Replay cache</dt><dd>{result?.runtime?.replayCache || '—'}</dd></div>
        <div><dt>Browser observed</dt><dd>{ms(observedTotalMs)}</dd></div>
      </dl>
    </section>
  );
}
