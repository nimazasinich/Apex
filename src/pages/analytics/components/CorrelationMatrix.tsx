import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ArrowRightLeft, RefreshCw } from 'lucide-react';
import type { CorrelationMatrixResult, CorrelationPair } from '../../../types';
import { fetchJsonWithTimeout } from '../../../services/apiQuery';
import './CorrelationMatrix.css';

interface CorrelationMatrixProps {
  onSelectSymbol: (symbol: string) => void;
  active?: boolean;
}

function correlationLabel(value: number) {
  if (value >= .75) return 'Strong positive';
  if (value >= .35) return 'Moderate positive';
  if (value <= -.5) return 'Strong inverse';
  if (value <= -.2) return 'Moderate inverse';
  return 'Low correlation';
}

export function CorrelationMatrix({ onSelectSymbol, active = true }: CorrelationMatrixProps) {
  const [data, setData] = useState<CorrelationMatrixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'heatmap' | 'pairs'>('heatmap');
  const [hovered, setHovered] = useState<{ x: string; y: string; r: number } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(560);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJsonWithTimeout<CorrelationMatrixResult>('/api/market/correlation?limit=8', { signal, timeoutMs: 15_000 });
      if (!Array.isArray(payload.symbols) || !Array.isArray(payload.matrix)) throw new Error('Malformed correlation response.');
      setData(payload);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'Correlation data is unavailable.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [active, load]);

  useEffect(() => {
    if (!hostRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.min(680, entry.contentRect.width - 8))));
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data?.symbols.length || tab !== 'heatmap') return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const n = data.symbols.length;
    const height = Math.max(300, Math.min(500, width * .72));
    const margin = { top: 54, right: 14, bottom: 18, left: 58 };
    const plot = Math.min(width - margin.left - margin.right, height - margin.top - margin.bottom);
    const scale = d3.scaleBand<string>().domain(data.symbols).range([0, plot]).padding(.06);
    const color = d3.scaleLinear<string>().domain([-1, 0, 1]).range(['#d75b6a', '#eef1f5', '#2c9a5b']);
    const g = svg.attr('viewBox', `0 0 ${width} ${height}`).append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const short = (symbol: string) => symbol.replace('-USDT', '');
    g.selectAll('.x-label').data(data.symbols).enter().append('text').attr('class', 'x-label').text(short)
      .attr('x', (d) => (scale(d) || 0) + scale.bandwidth() / 2).attr('y', -10).attr('text-anchor', 'start')
      .attr('transform', (d) => { const x = (scale(d) || 0) + scale.bandwidth() / 2; return `rotate(-38,${x},-10)`; })
      .on('click', (_, symbol) => onSelectSymbol(symbol));
    g.selectAll('.y-label').data(data.symbols).enter().append('text').attr('class', 'y-label').text(short)
      .attr('x', -8).attr('y', (d) => (scale(d) || 0) + scale.bandwidth() / 2 + 4).attr('text-anchor', 'end')
      .on('click', (_, symbol) => onSelectSymbol(symbol));
    const cells = data.symbols.flatMap((row, i) => data.symbols.map((column, j) => ({ row, column, i, j, r: Number(data.matrix[i]?.[j] ?? 0) })));
    g.selectAll('rect').data(cells).enter().append('rect')
      .attr('x', (d) => scale(d.column) || 0).attr('y', (d) => scale(d.row) || 0)
      .attr('width', scale.bandwidth()).attr('height', scale.bandwidth()).attr('rx', 4)
      .attr('fill', (d) => color(d.r)).attr('stroke', 'var(--apex-border, #dfe5ed)')
      .on('mouseenter', (_, d) => setHovered({ x: d.row, y: d.column, r: d.r }))
      .on('mouseleave', () => setHovered(null))
      .on('click', (_, d) => onSelectSymbol(d.column));
    if (scale.bandwidth() > 28) {
      g.selectAll('.cell-value').data(cells).enter().append('text').attr('class', 'cell-value')
        .attr('x', (d) => (scale(d.column) || 0) + scale.bandwidth() / 2)
        .attr('y', (d) => (scale(d.row) || 0) + scale.bandwidth() / 2 + 3)
        .attr('text-anchor', 'middle').text((d) => d.r.toFixed(2));
    }
  }, [data, onSelectSymbol, tab, width]);

  const topPairs = useMemo(() => (data?.pairs || []).slice().sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 8), [data]);

  return (
    <section className="apex-correlation" aria-labelledby="correlation-title">
      <header>
        <div><span><ArrowRightLeft size={15} /></span><div><h3 id="correlation-title">Correlation Matrix</h3><p>Live Pearson co-movement from verified candle series.</p></div></div>
        <div className="apex-correlation-actions">
          {data && <em className={data.dataState === 'live' ? 'positive' : 'warning'}>{data.dataState.replace('_', ' ')}</em>}
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh correlation matrix"><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>
        </div>
      </header>
      <div className="apex-correlation-tabs" role="tablist" aria-label="Correlation view">
        <button type="button" role="tab" aria-selected={tab === 'heatmap'} className={tab === 'heatmap' ? 'active' : ''} onClick={() => setTab('heatmap')}>Heatmap</button>
        <button type="button" role="tab" aria-selected={tab === 'pairs'} className={tab === 'pairs' ? 'active' : ''} onClick={() => setTab('pairs')}>Pairs</button>
        {hovered && <span>{hovered.x} / {hovered.y}: <strong>{hovered.r.toFixed(3)}</strong> · {correlationLabel(hovered.r)}</span>}
      </div>
      <div ref={hostRef} className="apex-correlation-body">
        {loading && !data ? <div className="apex-correlation-state"><RefreshCw className="spin" size={20} /><strong>Computing matrix</strong><span>Waiting for overlapping verified candle histories.</span></div>
          : error && !data ? <div className="apex-correlation-state error"><strong>Correlation unavailable</strong><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>
            : !data?.symbols.length ? <div className="apex-correlation-state"><strong>No correlation dataset</strong><span>The endpoint returned no usable symbols.</span></div>
              : tab === 'heatmap' ? <><svg ref={svgRef} role="img" aria-label={`Correlation heatmap for ${data.symbols.join(', ')}`} /><div className="apex-correlation-legend"><span>−1 inverse</span><i /><span>0 neutral</span><i /><span>+1 positive</span></div></>
                : <div className="apex-correlation-pairs">{topPairs.map((pair: CorrelationPair) => <button type="button" key={`${pair.symbolX}-${pair.symbolY}`} onClick={() => onSelectSymbol(pair.symbolY)}><span><strong>{pair.symbolX}</strong><b>↔</b><strong>{pair.symbolY}</strong></span><em className={pair.r >= 0 ? 'positive' : 'negative'}>{pair.r >= 0 ? '+' : ''}{pair.r.toFixed(3)}</em><small>{correlationLabel(pair.r)}</small></button>)}</div>}
      </div>
      {data?.symbols.length ? <details className="apex-correlation-table"><summary>Accessible correlation table</summary><div><table><thead><tr><th>Symbol</th>{data.symbols.map((symbol) => <th key={symbol}>{symbol}</th>)}</tr></thead><tbody>{data.symbols.map((row, i) => <tr key={row}><th><button type="button" onClick={() => onSelectSymbol(row)}>{row}</button></th>{data.symbols.map((column, j) => <td key={column}>{Number(data.matrix[i]?.[j] ?? 0).toFixed(3)}</td>)}</tr>)}</tbody></table></div></details> : null}
    </section>
  );
}
