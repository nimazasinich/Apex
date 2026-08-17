/**
 * APEX-NEXT Institutional Correlation Matrix Card (REQ-019)
 * D3-powered Pearson correlation heatmap and inter-symbol co-movement analyzer
 * for Top Volume perpetual contracts.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { CorrelationMatrixResult, CorrelationPair, DataState } from '../types';
import { FilterTabs, Pill, SectionCard, StatusBadge } from './primitives';
import { ProvenanceChip } from './ui/ProvenanceChip';
import { describeProvenance } from '../lib/dataProvenance';
import { Activity, ArrowRightLeft, RefreshCw } from 'lucide-react';

/** Matrix auto-refreshes every 60s; allow two cycles before calling it cached. */
const CORRELATION_STALE_AFTER_MS = 120_000;

interface CorrelationMatrixCardProps {
  onSelectSymbol?: (symbol: string) => void;
  minLiquidityUsd?: number;
  viewMode?: 'volume' | 'correlation';
  onViewModeChange?: (mode: 'volume' | 'correlation') => void;
}

export const CorrelationMatrixCard: React.FC<CorrelationMatrixCardProps> = ({
  onSelectSymbol,
  viewMode = 'correlation',
  onViewModeChange,
}) => {
  const [data, setData] = useState<CorrelationMatrixResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'pairs'>('heatmap');
  const [hoveredPair, setHoveredPair] = useState<{
    symbolX: string;
    symbolY: string;
    r: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 320 });

  const fetchCorrelation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market/correlation?limit=8');
      if (!res.ok) throw new Error('Failed to load correlation matrix');
      const json: CorrelationMatrixResult = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error fetching correlation matrix');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCorrelation();
    const interval = setInterval(fetchCorrelation, 60000); // 60s auto-refresh
    return () => clearInterval(interval);
  }, []);

  // ResizeObserver for responsive D3 canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 100) {
          const w = Math.min(600, width);
          const h = Math.min(380, Math.max(260, w * 0.75));
          setDimensions({ width: w, height: h });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Format symbol names cleanly (remove -USDT for dense axis labels)
  const formatShortSymbol = (sym: string) => sym.replace('-USDT', '');

  // Render D3 heatmap
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (
      !svgRef.current ||
      !data ||
      !data.symbols ||
      data.symbols.length === 0 ||
      activeTab !== 'heatmap'
    ) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const n = data.symbols.length;
    const margin = { top: 50, right: 20, bottom: 20, left: 55 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;
    const cellSize = Math.min(width / n, height / n);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // D3 scale for symbols
    const scale = d3
      .scaleBand()
      .domain(data.symbols)
      .range([0, cellSize * n])
      .padding(0.06);

    // D3 Color Diverging Scale (-1.0 to +1.0)
    // -1: #ff7597 (rose short), 0: #191233 (void), +1: #34e7b3 (teal long)
    const colorScale = d3
      .scaleLinear<string>()
      .domain([-1.0, 0, 1.0])
      .range(['#ff7597', '#191233', '#34e7b3']);

    // Draw X Axis labels (Top)
    g.append('g')
      .selectAll('text')
      .data(data.symbols)
      .enter()
      .append('text')
      .text((d) => formatShortSymbol(d))
      .attr('x', (d) => (scale(d) || 0) + scale.bandwidth() / 2)
      .attr('y', -10)
      .attr('text-anchor', 'start')
      .attr('transform', (d) => {
        const xPos = (scale(d) || 0) + scale.bandwidth() / 2;
        return `rotate(-40, ${xPos}, -10)`;
      })
      .attr('fill', '#b6b1d4')
      .style('font-size', '10px')
      .style('font-family', 'monospace')
      .style('font-weight', '600')
      .style('cursor', 'pointer')
      .on('click', (_, d) => {
        if (onSelectSymbol) onSelectSymbol(d);
      });

    // Draw Y Axis labels (Left)
    g.append('g')
      .selectAll('text')
      .data(data.symbols)
      .enter()
      .append('text')
      .text((d) => formatShortSymbol(d))
      .attr('x', -8)
      .attr('y', (d) => (scale(d) || 0) + scale.bandwidth() / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('fill', '#b6b1d4')
      .style('font-size', '10px')
      .style('font-family', 'monospace')
      .style('font-weight', '600')
      .style('cursor', 'pointer')
      .on('click', (_, d) => {
        if (onSelectSymbol) onSelectSymbol(d);
      });

    // Flatten matrix into cell items
    const cells: Array<{
      rowSymbol: string;
      colSymbol: string;
      r: number;
      i: number;
      j: number;
    }> = [];
    data.symbols.forEach((rowSym, i) => {
      data.symbols.forEach((colSym, j) => {
        cells.push({
          rowSymbol: rowSym,
          colSymbol: colSym,
          r: data.matrix[i][j],
          i,
          j,
        });
      });
    });

    // Draw heatmap rects
    g.selectAll('rect')
      .data(cells)
      .enter()
      .append('rect')
      .attr('x', (d) => scale(d.colSymbol) || 0)
      .attr('y', (d) => scale(d.rowSymbol) || 0)
      .attr('width', scale.bandwidth())
      .attr('height', scale.bandwidth())
      .attr('rx', 4)
      .attr('ry', 4)
      .style('fill', (d) => colorScale(d.r))
      .style('stroke', '#241a3d')
      .style('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => {
        setHoveredPair({
          symbolX: d.rowSymbol,
          symbolY: d.colSymbol,
          r: d.r,
        });
      })
      .on('mouseleave', () => {
        setHoveredPair(null);
      })
      .on('click', (_, d) => {
        if (onSelectSymbol && d.rowSymbol !== d.colSymbol) {
          onSelectSymbol(d.colSymbol);
        }
      });

    // Draw value text inside cells if cellSize > 28
    if (cellSize > 26) {
      g.selectAll('.cell-label')
        .data(cells)
        .enter()
        .append('text')
        .attr('class', 'cell-label')
        .attr('x', (d) => (scale(d.colSymbol) || 0) + scale.bandwidth() / 2)
        .attr('y', (d) => (scale(d.rowSymbol) || 0) + scale.bandwidth() / 2 + 3)
        .attr('text-anchor', 'middle')
        .attr('pointer-events', 'none')
        .text((d) => (d.i === d.j ? '1.0' : d.r.toFixed(2)))
        .style('font-size', cellSize > 35 ? '10px' : '8px')
        .style('font-family', 'monospace')
        .style('font-weight', '700')
        .style('fill', (d) =>
          d.i === d.j
            ? '#0d0a1c'
            : Math.abs(d.r) > 0.6
            ? '#0d0a1c'
            : '#f4f2fb'
        );
    }
  }, [data, dimensions, activeTab]);

  const topCorrelatedPairs = useMemo(() => {
    if (!data) return [];
    return data.pairs.slice(0, 6);
  }, [data]);

  const getCorrelationTag = (r: number) => {
    if (Math.abs(r - 1.0) < 0.01)
      return { label: 'IDENTICAL', color: 'text-slate-400' };
    if (r >= 0.75) return { label: 'STRONG POSITIVE', color: 'text-emerald-400' };
    if (r >= 0.35)
      return { label: 'MODERATE POSITIVE', color: 'text-teal-300' };
    if (r <= -0.5) return { label: 'INVERSE MOVE', color: 'text-rose-400' };
    if (r <= -0.2)
      return { label: 'MODERATE INVERSE', color: 'text-rose-300' };
    return { label: 'UNCORRELATED', color: 'text-slate-400' };
  };

  return (
    <SectionCard
      title="Correlation matrix"
      subtitle="Inter-symbol co-movement"
      icon={<ArrowRightLeft className="w-4 h-4" aria-hidden />}
      headerRight={
        <div className="flex items-center gap-2">
          {onViewModeChange && (
            <FilterTabs
              options={[
                { key: 'volume', label: 'Turnover' },
                { key: 'correlation', label: 'Correlation' },
              ]}
              activeKey={viewMode}
              onChange={(key) => onViewModeChange(key as any)}
            />
          )}
          {data && (
            <>
              <ProvenanceChip
                meta={describeProvenance({
                  dataState: data.dataState,
                  timestamp: data.timestamp,
                  source: data.source,
                  loading,
                  error,
                  staleAfterMs: CORRELATION_STALE_AFTER_MS,
                })}
              />
              <StatusBadge state={data.dataState} />
            </>
          )}
          <button
            onClick={fetchCorrelation}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors rounded"
            title="Refresh correlation matrix"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
      noPadding
    >
      <div className="flex flex-col h-full bg-transparent">
        {/* Sub-header tab navigation */}
        <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <FilterTabs
            options={[
              { key: 'heatmap', label: 'Heatmap' },
              { key: 'pairs', label: 'Top Pairs' },
            ]}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as any)}
          />

          {hoveredPair && (
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="font-mono font-bold text-slate-200">
                {hoveredPair.symbolX.replace('-USDT', '')} /{' '}
                {hoveredPair.symbolY.replace('-USDT', '')}
              </span>
              <span
                className={`font-mono font-semibold ${
                  hoveredPair.r > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                r = {hoveredPair.r.toFixed(3)}
              </span>
              <span className="text-slate-400 text-[10px]">
                ({getCorrelationTag(hoveredPair.r).label})
              </span>
            </div>
          )}
        </div>

        {/* Content area */}
        <div
          ref={containerRef}
          className="flex-1 p-3 flex flex-col justify-center items-center min-h-[280px]"
        >
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              <span className="text-xs">Computing Pearson covariance matrix...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-rose-400">
              <span className="text-xs">{error}</span>
              <button
                onClick={fetchCorrelation}
                className="text-xs text-indigo-400 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : activeTab === 'heatmap' ? (
            <div className="w-full flex flex-col items-center">
              <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                className="overflow-visible"
              />

              {/* Color scale legend */}
              <div className="w-full max-w-[280px] mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[#ff7597] inline-block" />
                  <span>-1.0 Inverse</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[#191233] inline-block" />
                  <span>0.0 Neutral</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[#34e7b3] inline-block" />
                  <span>+1.0 Highly Correlated</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-2 py-1">
              {topCorrelatedPairs.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-6">
                  No pairs computed
                </div>
              ) : (
                topCorrelatedPairs.map((pair) => {
                  const tag = getCorrelationTag(pair.r);
                  return (
                    <div
                      key={`${pair.symbolX}-${pair.symbolY}`}
                      className="flex items-center justify-between px-3 py-2 bg-[rgba(26,18,48,0.65)] border border-[var(--border)] rounded-md hover:bg-[var(--accent)]/10 transition-colors cursor-pointer"
                      onClick={() => {
                        if (onSelectSymbol) onSelectSymbol(pair.symbolY);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono font-bold text-xs text-slate-100">
                          {pair.symbolX.replace('-USDT', '')}
                        </span>
                        <span className="text-slate-500 text-xs">↔</span>
                        <span className="font-mono font-bold text-xs text-slate-100">
                          {pair.symbolY.replace('-USDT', '')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-semibold ${tag.color}`}>
                          {tag.label}
                        </span>
                        <Pill
                          tier={
                            pair.r >= 0.7
                              ? 'CONFIRMED'
                              : pair.r >= 0.3
                              ? 'WATCHLIST'
                              : 'CAUTION'
                          }
                          label={`r = ${pair.r >= 0 ? '+' : ''}${pair.r.toFixed(2)}`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
};
