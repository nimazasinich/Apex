/**
 * APEX-NEXT Market Movers (REQ-011) — gainers / losers with liquidity floor.
 */

import React, { useState } from 'react';
import { SymbolTicker } from '../types';
import { FilterTabs, SectionCard } from './primitives';
import { Sparkline } from './Sparkline';
import { getTickerSparkline } from '../lib/sparkline';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';

export interface GainersLosersCardProps {
  tickers: SymbolTicker[];
  minLiquidityUsd: number;
  onSelectSymbol: (symbol: string) => void;
  selectedSymbol?: string;
}

export const GainersLosersCard: React.FC<GainersLosersCardProps> = ({
  tickers,
  minLiquidityUsd,
  onSelectSymbol,
  selectedSymbol,
}) => {
  const [mode, setMode] = useState<'gainers' | 'losers'>('gainers');

  const qualified = tickers.filter((t) => t.turnover24h >= minLiquidityUsd);

  const gainers = [...qualified]
    .sort((a, b) => b.priceChange24hPct - a.priceChange24hPct)
    .slice(0, 10);

  const losers = [...qualified]
    .sort((a, b) => a.priceChange24hPct - b.priceChange24hPct)
    .slice(0, 10);

  const activeList = mode === 'gainers' ? gainers : losers;
  const floorM = minLiquidityUsd / 1e6;

  return (
    <SectionCard
      title="Market movers"
      subtitle={`Floor ≥ $${floorM}M`}
      icon={<TrendingUp className="w-4 h-4" aria-hidden />}
      headerRight={
        <FilterTabs
          options={[
            { key: 'gainers', label: 'Gainers' },
            { key: 'losers', label: 'Losers' },
          ]}
          activeKey={mode}
          onChange={(k) => setMode(k as 'gainers' | 'losers')}
        />
      }
      noPadding
      className="h-full flex flex-col"
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse table-dense">
          <thead>
            <tr className="border-b border-[var(--border)] label-meta">
              <th className="pl-3 pr-2">Symbol</th>
              <th className="px-2 text-right">Price</th>
              <th className="px-2 text-center">1h</th>
              <th className="pl-2 pr-3 text-right">24h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {activeList.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-[var(--neutral-subtle)]">
                  No symbols meet ${floorM}M floor
                </td>
              </tr>
            ) : (
              activeList.map((ticker) => {
                const isSelected = ticker.symbol === selectedSymbol;
                const isPos = ticker.priceChange24hPct >= 0;

                return (
                  <tr
                    key={ticker.symbol}
                    onDoubleClick={() => onSelectSymbol(ticker.symbol)}
                    onClick={() => onSelectSymbol(ticker.symbol)}
                    className={`hover:bg-white/5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]' : ''
                    }`}
                  >
                    <td
                      className="pl-3 pr-2 font-semibold text-slate-100 font-terminal-num symbol-cell"
                      title={ticker.symbol}
                    >
                      {ticker.symbol}
                    </td>
                    <td className="px-2 text-right font-terminal-num text-slate-200">
                      $
                      {ticker.lastPrice >= 10
                        ? ticker.lastPrice.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : ticker.lastPrice.toPrecision(5)}
                    </td>
                    <td className="px-2 text-center">
                      <Sparkline
                        data={getTickerSparkline(ticker)}
                        fallbackChangePct={ticker.priceChange24hPct}
                        width={48}
                        height={16}
                      />
                    </td>
                    <td
                      className={`pl-2 pr-3 text-right font-terminal-num font-semibold ${
                        isPos ? 'text-[var(--bullish)]' : 'text-[var(--bearish)]'
                      }`}
                    >
                      <span className="inline-flex items-center justify-end gap-0.5">
                        {isPos ? (
                          <ArrowUpRight className="w-3 h-3" aria-hidden />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" aria-hidden />
                        )}
                        {isPos ? '+' : ''}
                        {ticker.priceChange24hPct.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1 border-t border-[var(--border-subtle)] flex items-center justify-between terminal-text-xs text-[var(--neutral-subtle)]">
        <span>Liquidity floor applied</span>
        <span className="font-terminal-num">{activeList.length}</span>
      </div>
    </SectionCard>
  );
};
