import React, { useId, useMemo } from 'react';

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function ArcGauge({ value, label }: { value: number; label: string }) {
  const gradientId = useId().replace(/:/g, '');
  const safe = clamp(value);
  const gaugeAngle = -90 + safe * 1.8;

  return (
    <div className="apex-arc-gauge" aria-label={`Market mood ${Math.round(safe)} ${label}`}>
      <svg viewBox="0 0 160 104" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0" stopColor="#f04452" />
            <stop offset="0.24" stopColor="#f78b3d" />
            <stop offset="0.5" stopColor="#f2cb45" />
            <stop offset="0.74" stopColor="#83c94a" />
            <stop offset="1" stopColor="#24b447" />
          </linearGradient>
          <filter id={`${gradientId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path className="apex-arc-track" d="M 18 80 A 62 62 0 0 1 142 80" pathLength="100" />
        <path className="apex-arc-spectrum" d="M 18 80 A 62 62 0 0 1 142 80" pathLength="100" stroke={`url(#${gradientId})`} />
        {[0, 25, 50, 75, 100].map((tick) => {
          const radians = Math.PI - (tick / 100) * Math.PI;
          return <circle key={tick} className="apex-arc-tick" cx={80 + Math.cos(radians) * 62} cy={80 - Math.sin(radians) * 62} r="1.8" />;
        })}
        <g className="apex-arc-indicator" style={{ '--gauge-angle': `${gaugeAngle}deg` } as React.CSSProperties}>
          <circle className="apex-arc-marker" cx="80" cy="23" r="4" filter={`url(#${gradientId}-glow)`} />
        </g>
      </svg>
      <div className="apex-arc-value"><strong>{Math.round(safe)}</strong><span>{label}</span></div>
      <div className="apex-arc-scale"><span>0</span><span>100</span></div>
    </div>
  );
}

export function RingGauge({ value, label }: { value: number | null; label: string }) {
  const gradientId = useId().replace(/:/g, '');
  const safe = clamp(value ?? 0);
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference * (1 - safe / 100);

  return (
    <div className="apex-ring-gauge" aria-label={`${label}: ${value === null ? 'Unavailable' : `${safe.toFixed(2)} percent`}`}>
      <svg viewBox="0 0 108 108" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#72db61" />
            <stop offset="0.52" stopColor="#2fbd48" />
            <stop offset="1" stopColor="#138f34" />
          </linearGradient>
        </defs>
        <circle className="apex-ring-track" cx="54" cy="54" r="45" />
        <circle
          className="apex-ring-progress"
          cx="54"
          cy="54"
          r="45"
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        <circle className="apex-ring-highlight" cx="54" cy="54" r="36" />
      </svg>
      <div><strong>{value === null ? '—' : `${safe.toFixed(2)}%`}</strong><span>{label}</span></div>
    </div>
  );
}

export function MiniSparkline({ values, tone = 'positive', bars = false }: { values: number[]; tone?: 'positive' | 'negative' | 'neutral' | 'violet'; bars?: boolean }) {
  const points = useMemo(() => {
    const clean = values.filter(Number.isFinite);
    if (!clean.length) return [];
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = Math.max(max - min, 0.000001);
    return clean.map((value, index) => ({
      x: clean.length === 1 ? 50 : (index / (clean.length - 1)) * 100,
      y: 28 - ((value - min) / range) * 22,
      value,
    }));
  }, [values]);

  if (!points.length) return <span className="apex-mini-chart-empty" aria-hidden="true" />;

  if (bars) {
    const width = Math.max(4, 86 / points.length);
    return (
      <svg className={`apex-mini-sparkline ${tone}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
        {points.map((point, index) => <rect key={index} x={5 + index * (90 / points.length)} y={point.y} width={width} height={30 - point.y} rx="1.5" />)}
      </svg>
    );
  }

  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `0,32 ${line} 100,32`;
  return (
    <svg className={`apex-mini-sparkline ${tone}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polygon className="area" points={area} />
      <polyline points={line} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2" />
    </svg>
  );
}
