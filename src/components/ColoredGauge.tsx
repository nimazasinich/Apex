import React, { useId } from 'react';

interface ColoredGaugeProps {
  value: number | null | undefined;
  label: string;
  displayValue?: string;
  size?: number;
  inverse?: boolean;
  className?: string;
  /** When set, tints the value text and adds a live pulse so the gauge visibly reacts to the current reading. */
  tone?: 'positive' | 'negative' | 'neutral';
}

export function ColoredGauge({ value, label, displayValue, size = 104, inverse = false, className = '', tone }: ColoredGaugeProps) {
  const id = useId().replace(/:/g, '');
  const normalized = value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(100, value));
  const progress = inverse ? 100 - normalized : normalized;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress / 100);
  const angle = ((progress / 100) * 360 - 90) * Math.PI / 180;
  const markerX = 50 + Math.cos(angle) * radius;
  const markerY = 50 + Math.sin(angle) * radius;

  return (
    <div
      className={`apex-colored-gauge ${size <= 92 ? 'is-compact' : size >= 120 ? 'is-large' : ''} ${tone ? `tone-${tone}` : ''} ${className}`.trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${displayValue ?? (value == null ? 'Unavailable' : `${Math.round(normalized)} percent`)}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={`gauge-${id}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#f0525d" />
            <stop offset="30%" stopColor="#f59f45" />
            <stop offset="56%" stopColor="#edce4c" />
            <stop offset="78%" stopColor="#78cb53" />
            <stop offset="100%" stopColor="#28b94a" />
          </linearGradient>
          <filter id={`gauge-shadow-${id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1f9d3a" floodOpacity="0.22" />
          </filter>
        </defs>
        <circle className="apex-colored-gauge-halo" cx="50" cy="50" r="47" />
        <circle className="apex-colored-gauge-track" cx="50" cy="50" r={radius} />
        <circle
          className="apex-colored-gauge-progress"
          cx="50"
          cy="50"
          r={radius}
          stroke={`url(#gauge-${id})`}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        {[0, 25, 50, 75, 100].map((tick) => {
          const tickAngle = ((tick / 100) * 360 - 90) * Math.PI / 180;
          return <circle key={tick} className="apex-colored-gauge-tick" cx={50 + Math.cos(tickAngle) * 42} cy={50 + Math.sin(tickAngle) * 42} r="1.1" />;
        })}
        <circle className="apex-colored-gauge-marker" cx={markerX} cy={markerY} r="2.7" filter={`url(#gauge-shadow-${id})`} />
        <circle className="apex-colored-gauge-inner" cx="50" cy="50" r="33" />
      </svg>
      <div className="apex-colored-gauge-copy">
        {tone && <i className="apex-colored-gauge-pulse" aria-hidden="true" />}
        <strong>{displayValue ?? (value == null ? '—' : `${Math.round(normalized)}%`)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
