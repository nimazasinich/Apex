import React from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Database, Fingerprint } from 'lucide-react';
import type { BacktestResult, TradeDirection } from '../../types';

export interface BacktestRunIdentity {
  strategyId: string;
  strategyName: string;
  symbol: string;
  direction: TradeDirection;
  interval: string;
  requestedBars: number;
  usedBars: number;
  maxHoldBars: number;
  generatedAt: number | null;
  source: string | null;
  runtimeMs: number | null;
  warningCount: number;
}

export function buildBacktestRunIdentity({
  result,
  strategyId,
  strategyName,
  symbol,
  direction,
  interval,
  requestedBars,
  maxHoldBars,
  runtimeMs,
}: {
  result: BacktestResult | null;
  strategyId: string;
  strategyName: string;
  symbol: string;
  direction: TradeDirection;
  interval: string;
  requestedBars: number;
  maxHoldBars: number;
  runtimeMs: number | null;
}): BacktestRunIdentity {
  const warnings = (result?.configOverrides?.length ?? 0)
    + (result && result.dataState !== 'live' ? 1 : 0)
    + (result?.diagnostics?.noTradeReason ? 1 : 0);
  return {
    strategyId: result?.strategy || strategyId,
    strategyName,
    symbol: result?.symbol || symbol,
    direction: result?.direction || direction,
    interval: result?.interval || interval,
    requestedBars: result?.requestedBars ?? requestedBars,
    usedBars: result?.candlesUsed ?? 0,
    maxHoldBars: result?.maxHoldBars ?? maxHoldBars,
    generatedAt: result?.audit?.generatedAt ?? null,
    source: result?.source ?? null,
    runtimeMs: result?.runtime?.totalMs ?? runtimeMs,
    warningCount: warnings,
  };
}

export function BacktestRunHeader({
  identity,
  result,
  stale,
  loading,
  cancelled,
  error,
  blocked = false,
}: {
  identity: BacktestRunIdentity;
  result: BacktestResult | null;
  stale: boolean;
  loading: boolean;
  cancelled: boolean;
  error: string | null;
  blocked?: boolean;
}) {
  const state = loading
    ? 'RUNNING'
    : error
      ? 'FAILED'
      : cancelled
        ? 'CANCELLED'
        : !result
          ? (blocked ? 'BLOCKED' : 'READY TO RUN')
          : stale
            ? 'STALE CONFIGURATION'
            : result.dataState === 'live'
              ? 'CURRENT'
              : result.dataState === 'degraded'
                ? 'PARTIAL / PROXY'
                : 'FAILED';
  const stateClass = loading ? 'running' : error ? 'failed' : cancelled ? 'cancelled' : blocked ? 'failed' : stale ? 'stale' : result?.dataState === 'live' ? 'current' : result ? 'partial' : 'current';
  const generated = identity.generatedAt ? new Date(identity.generatedAt).toLocaleString() : 'Not run';

  const readiness: { label: string; tone: 'pending' | 'run' | 'ok' | 'warn'; detail: string } = loading
    ? { label: 'Running', tone: 'run', detail: 'Run in progress' }
    : !result
      ? { label: 'Pending', tone: 'pending', detail: 'Awaiting a completed run' }
      : identity.warningCount === 0 && result.dataState === 'live'
        ? { label: 'Verified', tone: 'ok', detail: 'Live data · no warnings' }
        : identity.warningCount > 0
          ? { label: `Review ${identity.warningCount}`, tone: 'warn', detail: 'Warnings recorded for this run' }
          : { label: 'Partial', tone: 'warn', detail: 'Non-live data state' };

  return (
    <section className="apex-bt-run-identity" aria-label="Backtest result identity">
      <header>
        <div>
          <span className={`apex-bt-result-state ${stateClass}`}>{loading ? <Clock3 size={12} /> : !error && !cancelled && !blocked && (!result || !stale) ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}{state}</span>
          <strong>{identity.strategyName}</strong>
          <small>{identity.strategyId} · {identity.symbol} · {identity.direction} · {identity.interval}</small>
        </div>
        <div className="apex-bt-run-fingerprint"><Fingerprint size={13} /><span>{result?.audit?.configFingerprint || 'Fingerprint pending'}</span></div>
      </header>
      <dl className="apex-bt-identity-metrics">
        <div><dt>Bars</dt><dd>{identity.usedBars.toLocaleString()} / {identity.requestedBars.toLocaleString()}</dd></div>
        <div><dt>Max hold</dt><dd>{identity.maxHoldBars} bars</dd></div>
        <div><dt>Run time</dt><dd>{identity.runtimeMs == null ? '—' : `${identity.runtimeMs.toFixed(identity.runtimeMs >= 1000 ? 0 : 1)} ms`}</dd><small>{generated === 'Not run' ? 'Not run yet' : `Generated ${generated}`}</small></div>
        <div><dt>Data source</dt><dd><Database size={11} />{identity.source || 'Unavailable'}</dd></div>
        <div><dt>Warnings</dt><dd className={identity.warningCount ? 'negative' : 'positive'}>{identity.warningCount}</dd></div>
        <div><dt>Readiness</dt><dd className={`apex-bt-readiness ${readiness.tone}`}>{readiness.label}</dd><small>{readiness.detail}</small></div>
      </dl>
    </section>
  );
}
