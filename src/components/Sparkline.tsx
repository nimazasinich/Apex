/**
 * APEX-NEXT 1-Hour Price Momentum Sparkline Component
 * Renders an institutional mini SVG chart with bullish/bearish color styling
 * and interactive hover tooltip.
 */

import React, { useId } from 'react';
import { getSparklineTrend } from '../lib/sparkline';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  fallbackChangePct?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 68,
  height = 20,
  className = '',
  fallbackChangePct,
}) => {
  const gradientId = useId();

  if (!data || data.length < 2) {
    return (
      <div
        className={`inline-block opacity-30 bg-slate-800 rounded ${className}`}
        style={{ width, height }}
      />
    );
  }

  const trend = getSparklineTrend(data, fallbackChangePct);
  const color = trend === 'bullish' ? '#34e7b3' : '#ff7597';

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const padX = 2;
  const padY = 3;
  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;

  const points = data.map((val, idx) => {
    const x = padX + (idx / (data.length - 1)) * usableWidth;
    const y =
      padY + usableHeight - ((val - minVal) / range) * usableHeight;
    return { x, y, val };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const firstP = points[0];
  const lastP = points[points.length - 1];

  const areaPath = `${linePath} L ${lastP.x.toFixed(1)} ${height} L ${firstP.x.toFixed(1)} ${height} Z`;

  const pctChange = ((data[data.length - 1] - data[0]) / (data[0] || 1)) * 100;
  const formattedPct = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`;

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      title={`1h Momentum: ${formattedPct}`}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={lastP.x}
          cy={lastP.y}
          r="2"
          fill={color}
          className="animate-pulse"
        />
      </svg>
    </div>
  );
};
