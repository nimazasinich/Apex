import React from 'react';
import { CircleDollarSign, Info } from 'lucide-react';
import type { BacktestResult } from '../../types';

export function BacktestAssumptionsPanel({ result, configured }: {
  result: BacktestResult | null;
  configured: { commissionPct: number; slippagePct: number; fundingPct: number };
}) {
  const cost = result?.costModel;
  return (
    <section className="apex-bt-evidence-block">
      <header><span><CircleDollarSign size={14} />Cost &amp; Fill Assumptions</span><small>{cost?.appliedByEngine ? 'Applied by engine' : 'Configured for next run'}</small></header>
      <dl>
        <div><dt>Commission / side</dt><dd>{(cost?.commissionPctPerSide ?? configured.commissionPct).toFixed(3)}%</dd></div>
        <div><dt>Slippage / side</dt><dd>{(cost?.slippagePctPerSide ?? configured.slippagePct).toFixed(3)}%</dd></div>
        <div><dt>Funding estimate</dt><dd>{(cost?.fundingPctEstimate ?? configured.fundingPct).toFixed(3)}%</dd></div>
        <div><dt>Round trip</dt><dd>{(cost?.roundTripCostPct ?? ((configured.commissionPct + configured.slippagePct) * 2 + configured.fundingPct)).toFixed(3)}%</dd></div>
        <div><dt>Fill policy</dt><dd>{result?.audit?.fillPolicy || 'Pending run'}</dd></div>
        <div><dt>Lookahead</dt><dd>{result?.audit?.lookaheadPolicy || 'Pending run'}</dd></div>
      </dl>
      <p><Info size={12} />Spread, market impact, queue position, partial fills and limit non-fills are not claimed unless the server result explicitly provides them.</p>
    </section>
  );
}
