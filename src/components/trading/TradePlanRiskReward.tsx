import React, { useMemo } from 'react';
import { AlertTriangle, Clock3, ShieldCheck, Target } from 'lucide-react';
import type { TradePlan } from '../../services/tradePlan';
import { validateTradePlanGeometry } from '../../services/tradePlan';
import './TradePlanRiskReward.css';

export interface TradePlanRiskRewardProps {
  plan: TradePlan;
  currentPrice?: number | null;
  compact?: boolean;
}

const formatPrice = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 2 : 8 });

export function TradePlanRiskReward({ plan, currentPrice = null, compact = false }: TradePlanRiskRewardProps) {
  const geometry = useMemo(() => validateTradePlanGeometry(plan.direction, plan.entryPrice, plan.stopLoss, plan.takeProfitTargets), [plan]);
  const errors = [...new Set([...(plan.validationErrors || []), ...geometry])];
  const values = [plan.stopLoss, plan.entryRange[0], plan.entryPrice, plan.entryRange[1], ...plan.takeProfitTargets, ...(currentPrice && Number.isFinite(currentPrice) ? [currentPrice] : [])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(Number.EPSILON, max - min);
  const position = (value: number) => `${Math.max(0, Math.min(100, ((value - min) / span) * 100))}%`;
  const riskDistance = Math.abs(plan.entryPrice - plan.stopLoss);
  const rewards = plan.takeProfitTargets.map((target) => Math.abs(target - plan.entryPrice));
  const rMultiples = rewards.map((reward) => riskDistance > 0 ? reward / riskDistance : 0);

  if (errors.length || !plan.valid) {
    return <section className={`apex-plan-rr blocked${compact ? ' compact' : ''}`} aria-label="Invalid trade plan geometry"><div className="apex-plan-rr-blocked"><AlertTriangle size={17} /><div><strong>Trade plan blocked</strong><span>{errors[0] || 'The canonical plan is not valid for execution.'}</span></div></div>{errors.length > 1 && <ul>{errors.slice(1).map((error) => <li key={error}>{error}</li>)}</ul>}</section>;
  }

  if (compact) {
    return <section className="apex-plan-rr compact" aria-label={`${plan.direction} trade plan risk reward`}>
      <header><div><ShieldCheck size={15} /><span>Canonical {plan.direction} plan</span></div><strong>{plan.netRiskReward.toFixed(2)} net R/R</strong></header>
      <div className="apex-plan-compact-grid">
        <div><span>Entry</span><strong>{formatPrice(plan.entryPrice)}</strong></div>
        <div><span>Stop</span><strong>{formatPrice(plan.stopLoss)}</strong></div>
        <div><span>T1</span><strong>{formatPrice(plan.takeProfitTargets[0])}</strong></div>
        <div><span>Risk</span><strong>{plan.riskAmountUsd.toFixed(0)} USDT</strong></div>
      </div>
    </section>;
  }

  return <section className="apex-plan-rr" aria-label={`${plan.direction} trade plan risk reward`}>
    <header><div><ShieldCheck size={15} /><span>Canonical {plan.direction} plan</span></div><strong>{plan.netRiskReward.toFixed(2)} net R/R</strong></header>
    <div className="apex-plan-scale" data-direction={plan.direction.toLowerCase()}>
      <div className="apex-plan-track" />
      <div className="apex-plan-entry-range" style={{ left: position(plan.entryRange[0]), width: `${Math.max(1.5, Math.abs(plan.entryRange[1] - plan.entryRange[0]) / span * 100)}%` }} title={`Entry range ${formatPrice(plan.entryRange[0])}–${formatPrice(plan.entryRange[1])}`} />
      <span className="apex-plan-marker stop" style={{ left: position(plan.stopLoss) }}><i /><b>Stop</b><em>{formatPrice(plan.stopLoss)}</em></span>
      <span className="apex-plan-marker entry" style={{ left: position(plan.entryPrice) }}><i /><b>Entry</b><em>{formatPrice(plan.entryPrice)}</em></span>
      {plan.takeProfitTargets.map((target, index) => <span key={target} className="apex-plan-marker target" style={{ left: position(target) }}><i /><b>T{index + 1}</b><em>{rMultiples[index].toFixed(2)}R</em></span>)}
      {currentPrice && Number.isFinite(currentPrice) ? <span className="apex-plan-current" style={{ left: position(currentPrice) }} title={`Current price ${formatPrice(currentPrice)}`} /> : null}
    </div>
    <div className="apex-plan-stats"><div><span>Entry range</span><strong>{formatPrice(plan.entryRange[0])}–{formatPrice(plan.entryRange[1])}</strong></div><div><span>Risk distance</span><strong>{formatPrice(riskDistance)}</strong></div><div><span>Targets</span><strong>{rMultiples.map((value) => `${value.toFixed(2)}R`).join(' · ')}</strong></div><div><span>Risk amount</span><strong>{plan.riskAmountUsd.toFixed(2)} USDT</strong></div></div>
    <footer><span><Target size={12} /> {plan.takeProfitTargets.map(formatPrice).join(' · ')}</span><span><Clock3 size={12} /> Expires {new Date(plan.expiresAt).toLocaleTimeString()}</span></footer>
  </section>;
}
