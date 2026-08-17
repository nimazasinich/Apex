/**
 * APEX-NEXT Risk / Reward Slider Component
 * Visually represents the calculated entry, stop loss, and take profit levels
 * relative to current price action, with proportional risk/reward zones.
 */

import React from 'react';
import { Pill } from './primitives';

export interface RiskRewardSliderProps {
  currentPrice: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  direction: 'LONG' | 'SHORT';
  rMultiple: number;
  className?: string;
}

export const RiskRewardSlider: React.FC<RiskRewardSliderProps> = ({
  currentPrice,
  entryPrice,
  stopLoss,
  takeProfit,
  direction,
  rMultiple,
  className = '',
}) => {
  // Guard against division by zero or invalid ordering
  const validInputs =
    entryPrice > 0 && stopLoss > 0 && takeProfit > 0 && stopLoss !== takeProfit;

  if (!validInputs) {
    return (
      <div className={`p-3 bg-[rgba(26,18,48,0.65)] border border-[var(--border)] rounded text-slate-400 terminal-text-xs ${className}`}>
        Configure Stop Loss and Take Profit to view Risk/Reward visual slider.
      </div>
    );
  }

  // Calculate overall range bounds with 10% padding on either side
  const prices = [currentPrice, entryPrice, stopLoss, takeProfit];
  const minPriceRaw = Math.min(...prices);
  const maxPriceRaw = Math.max(...prices);
  const spread = maxPriceRaw - minPriceRaw || entryPrice * 0.05;
  const minP = minPriceRaw - spread * 0.1;
  const maxP = maxPriceRaw + spread * 0.1;
  const fullSpan = maxP - minP || 1;

  const toPct = (val: number) =>
    Math.max(0, Math.min(100, ((val - minP) / fullSpan) * 100));

  const slPct = toPct(stopLoss);
  const entryPct = toPct(entryPrice);
  const tpPct = toPct(takeProfit);
  const curPct = toPct(currentPrice);

  // Determine risk zone (between entry and stop) and reward zone (between entry and target)
  const riskLeft = Math.min(slPct, entryPct);
  const riskWidth = Math.abs(entryPct - slPct);

  const rewardLeft = Math.min(entryPct, tpPct);
  const rewardWidth = Math.abs(tpPct - entryPct);

  const formatPrice = (p: number) =>
    p >= 10
      ? p.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : p.toPrecision(5);

  return (
    <div className={`p-3 bg-[rgba(26,18,48,0.65)] border border-[var(--border)] rounded flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="terminal-text-xs uppercase font-semibold text-slate-300">
          Risk / Reward Visual Slider
        </span>
        <div className="flex items-center gap-2">
          <Pill
            tier={rMultiple >= 2 ? 'CONFIRMED' : rMultiple >= 1.2 ? 'WATCHLIST' : 'CAUTION'}
            label={`${rMultiple.toFixed(2)}R Target`}
          />
          <span className="terminal-text-xs font-semibold text-slate-400">
            [{direction}]
          </span>
        </div>
      </div>

      {/* Slider Visual Bar */}
      <div className="relative h-6 bg-[var(--canvas)] rounded overflow-hidden my-3 border border-[var(--border-subtle)]">
        {/* Risk zone (rose) */}
        <div
          className="absolute top-0 bottom-0 bg-[var(--bearish)]/30 border-x border-[var(--bearish)]/60"
          style={{ left: `${riskLeft}%`, width: `${riskWidth}%` }}
          title="Risk Zone (1R)"
        />
        {/* Reward zone (teal) */}
        <div
          className="absolute top-0 bottom-0 bg-[var(--bullish)]/30 border-x border-[var(--bullish)]/60"
          style={{ left: `${rewardLeft}%`, width: `${rewardWidth}%` }}
          title={`Reward Zone (${rMultiple.toFixed(2)}R)`}
        />

        {/* Current price live marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[var(--accent)] z-10"
          style={{ left: `${curPct}%` }}
          title={`Current Price: $${formatPrice(currentPrice)}`}
        >
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-[var(--accent)] rounded-full shadow-[0_0_6px_var(--accent)]" />
        </div>

        {/* Entry marker */}
        <div
          className="absolute top-1 bottom-1 w-0.5 bg-slate-200 z-10"
          style={{ left: `${entryPct}%` }}
          title={`Entry: $${formatPrice(entryPrice)}`}
        />
      </div>

      {/* Legend and price labels */}
      <div className="flex items-center justify-between terminal-text-xs font-terminal-num">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--bearish)]" />
          <span className="text-[var(--bearish)] font-semibold">SL</span>
          <span className="text-slate-300">${formatPrice(stopLoss)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-slate-200 font-semibold">ENTRY</span>
          <span className="text-slate-300">${formatPrice(entryPrice)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
          <span className="text-[var(--accent)] font-semibold">LIVE</span>
          <span className="text-[var(--accent)]">${formatPrice(currentPrice)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--bullish)]" />
          <span className="text-[var(--bullish)] font-semibold">TP</span>
          <span className="text-slate-300">${formatPrice(takeProfit)}</span>
        </div>
      </div>
    </div>
  );
};
