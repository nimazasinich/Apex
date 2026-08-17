/**
 * APEX-NEXT Top 10 by 24h Volume / Turnover Card (REQ-010)
 */

import React from 'react';
import { SymbolTicker } from '../types';
import { FilterTabs, SectionCard, StatusBadge } from './primitives';
import { Sparkline } from './Sparkline';
import { getTickerSparkline } from '../lib/sparkline';
import { ArrowDownRight, ArrowUpRight, BarChart3 } from 'lucide-react';

export interface TopVolumeTableProps {
  tickers: SymbolTicker[];
  isLoading?: boolean;
  onSelectSymbol: (symbol: string) => void;
  selectedSymbol?: string;
  viewMode?: 'volume' | 'correlation';
  onViewModeChange?: (mode: 'volume' | 'correlation') => void;
}

export const TopVolumeTable: React.FC<TopVolumeTableProps> = ({
  tickers,
  isLoading = false,
  onSelectSymbol,
  selectedSymbol,
  viewMode = 'volume',
  onViewModeChange,
}) => {
  const top10 = [...tickers]
    .sort((a, b) => b.turnover24h - a.turnover24h)
    .slice(0, 10);

  const dataState = top10.length > 0 ? top10[0].dataState : 'live';

  return (
    <SectionCard
      title="Top volume"
      subtitle="Futures turnover (USD)"
      icon={<BarChart3 className="w-4 h-4" aria-hidden />}
      headerRight={
        <div className="flex items-center gap-2">
          {onViewModeChange && (
            <FilterTabs
              options={[
                { key: 'volume', label: 'Turnover' },
                { key: 'correlation', label: 'Correlation' },
              ]}
              activeKey={viewMode}
              onChange={(key) => onViewModeChange(key as 'volume' | 'correlation')}
            />
          )}
          <StatusBadge state={dataState} showLabel={false} />
        </div>
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
              <th className="px-2 text-right">Turnover</th>
              <th className="pl-2 pr-3 text-right">24h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {isLoading && top10.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-[var(--neutral-subtle)]">
                  Loading turnover…
                </td>
              </tr>
            ) : (
              top10.map((ticker) => {
                const isSelected = ticker.symbol === selectedSymbol;
                const isPos = ticker.priceChange24hPct >= 0;
                const turnoverM = ticker.turnover24h / 1e6;

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
                    <td className="px-2 text-right font-terminal-num text-slate-300">
                      $
                      {turnoverM >= 1000
                        ? `${(turnoverM / 1000).toFixed(2)}B`
                        : `${turnoverM.toFixed(1)}M`}
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
        <span>Double-click to inspect</span>
        <span className="font-terminal-num">Top 10</span>
      </div>
    </SectionCard>
  );
};
