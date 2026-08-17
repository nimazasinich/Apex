import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, DatabaseZap, ShieldCheck } from 'lucide-react';
import type { CandidateScore } from '../../types';
import type { TradePlan } from '../../services/tradePlan';

export interface ExecutionCorridorPanelProps {
  plan: TradePlan | null;
  candidate: CandidateScore | null;
  currentPrice?: number | null;
}

const formatPrice = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 2 : 8 });
const formatUsd = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`;

export function ExecutionCorridorPanel({ plan, candidate, currentPrice = null }: ExecutionCorridorPanelProps) {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    setClock(Date.now());
    if (!plan) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [plan?.id]);

  const scale = useMemo(() => {
    if (!plan) return null;
    const values = [plan.stopLoss, ...plan.entryRange, plan.entryPrice, ...plan.takeProfitTargets];
    if (currentPrice != null && Number.isFinite(currentPrice)) values.push(currentPrice);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(Number.EPSILON, max - min);
    return { min, max, position: (value: number) => Math.max(0, Math.min(100, ((value - min) / span) * 100)) };
  }, [currentPrice, plan]);

  if (!plan || !scale) {
    return <div className="apex-execution-empty"><DatabaseZap size={18} /><span><strong>No canonical corridor</strong><small>A verified symbol detail response is required before execution geometry can be displayed.</small></span></div>;
  }

  const totalCosts = plan.expectedFeesUsd + plan.expectedFundingUsd + plan.expectedSpreadUsd + plan.expectedSlippageUsd + plan.expectedMarketImpactUsd;
  const divergence = candidate?.directionDivergenceShadow;
  const lifecycle = candidate?.signalLifecycle;
  const secondsRemaining = Math.max(0, Math.floor((plan.expiresAt - clock) / 1000));
  const rangeLeft = scale.position(plan.entryRange[0]);
  const rangeWidth = Math.max(2, scale.position(plan.entryRange[1]) - rangeLeft);

  return <div className="apex-execution-corridor" data-direction={plan.direction.toLowerCase()}>
    <div className={`apex-execution-validity ${plan.valid ? 'valid' : 'blocked'}`}>
      {plan.valid ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
      <span><strong>{plan.valid ? 'Canonical geometry valid' : 'Preview blocked'}</strong><small>{plan.valid ? `Plan ${plan.id}` : plan.validationErrors[0] || 'Plan validation failed'}</small></span>
      <em>{plan.netRiskReward.toFixed(2)} net R/R</em>
    </div>

    <div className="apex-corridor-track-wrap">
      <div className="apex-corridor-axis"><span>{formatPrice(scale.min)}</span><span>{formatPrice(scale.max)}</span></div>
      <div className="apex-corridor-track">
        <i className="entry-band" style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }} />
        <span className="marker stop" style={{ left: `${scale.position(plan.stopLoss)}%` }}><b>SL</b><small>{formatPrice(plan.stopLoss)}</small></span>
        <span className="marker entry" style={{ left: `${scale.position(plan.entryPrice)}%` }}><b>ENTRY</b><small>{formatPrice(plan.entryPrice)}</small></span>
        {plan.takeProfitTargets.map((target, index) => <span key={target} className="marker target" style={{ left: `${scale.position(target)}%` }}><b>T{index + 1}</b><small>{formatPrice(target)}</small></span>)}
        {currentPrice != null && Number.isFinite(currentPrice) ? <span className="current-marker" style={{ left: `${scale.position(currentPrice)}%` }} title={`Current ${formatPrice(currentPrice)}`} /> : null}
      </div>
    </div>

    <div className="apex-execution-metrics">
      <div><span>Risk amount</span><strong>{formatUsd(plan.riskAmountUsd)}</strong></div>
      <div><span>Position size</span><strong>{formatUsd(plan.sizing.positionSizeUsd)}</strong></div>
      <div><span>Estimated costs</span><strong>{formatUsd(totalCosts)}</strong></div>
      <div><span>Expected net edge</span><strong className={plan.expectedNetEdgeUsd > 0 ? 'positive' : 'negative'}>{formatUsd(plan.expectedNetEdgeUsd)}</strong></div>
    </div>

    <div className="apex-execution-observability">
      <div><span><DatabaseZap size={13} /> Direction class</span><strong className={divergence?.category === 'WITH_TREND' ? 'positive' : divergence?.category === 'COUNTER_TREND' ? 'negative' : ''}>{divergence?.category?.replaceAll('_', ' ') || 'Unavailable'}</strong><small>{divergence ? `${Math.round(divergence.timeframeAgreement * 100)}% TF agreement · ${Math.round(divergence.dataCompleteness * 100)}% complete` : 'No independent trend snapshot'}</small></div>
      <div><span>{lifecycle?.state === 'ACTIVE' || lifecycle?.state === 'CONFIRMED' ? <CheckCircle2 size={13} /> : <Clock3 size={13} />} Lifecycle</span><strong>{lifecycle?.state || 'Not tracked'}</strong><small>{lifecycle ? `${lifecycle.shadowOnly ? 'Shadow only' : 'Observed'} · ${lifecycle.signalId}` : 'Lifecycle begins after scanner qualification'}</small></div>
      <div><span><Clock3 size={13} /> Plan TTL</span><strong>{secondsRemaining > 0 ? `${secondsRemaining}s` : 'Expired'}</strong><small>Refresh detail before preview after expiry</small></div>
    </div>
  </div>;
}
