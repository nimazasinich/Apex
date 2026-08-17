import React, { useId, useMemo } from 'react';

type Point = { x: number; y: number };

function smoothPath(points: Point[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  path += ` Q ${last.x.toFixed(2)} ${last.y.toFixed(2)} ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return path;
}

export function MiniSparkline({ values, tone = 'positive', bars = false }: { values: number[]; tone?: 'positive' | 'negative' | 'neutral' | 'violet'; bars?: boolean }) {
  const id = useId().replace(/:/g, '');
  const points = useMemo(() => {
    const clean = values.filter(Number.isFinite);
    if (!clean.length) return [];
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = Math.max(max - min, 0.000001);
    return clean.map((value, index) => ({
      x: clean.length === 1 ? 50 : (index / (clean.length - 1)) * 100,
      y: 27 - ((value - min) / range) * 20,
    }));
  }, [values]);

  if (!points.length) return <span className="apex-mini-chart-empty" aria-hidden="true" />;

  if (bars) {
    const width = Math.max(4, 86 / points.length);
    return (
      <svg className={`apex-mini-sparkline ${tone}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
        {points.map((point, index) => <rect key={index} x={5 + index * (90 / points.length)} y={point.y} width={width} height={30 - point.y} rx="1.8" />)}
      </svg>
    );
  }

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} 32 L ${points[0].x.toFixed(2)} 32 Z`;

  return (
    <svg className={`apex-mini-sparkline ${tone}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".22" />
          <stop offset=".62" stopColor="currentColor" stopOpacity=".08" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <filter id={`spark-glow-${id}`} x="-15%" y="-35%" width="130%" height="170%">
          <feGaussianBlur stdDeviation=".75" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path className="area" d={areaPath} fill={`url(#spark-${id})`} />
      <path className="line" d={linePath} filter={`url(#spark-glow-${id})`} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.1" />
    </svg>
  );
}
