import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { MiniSparkline } from '../components/MiniSparkline';

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function fmtMoney(value: number | null | undefined, suffix = 'USDT') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${moneyFormat.format(Number(value))} ${suffix}`;
}

export function fmtCompact(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${compact.format(Number(value))}${suffix}`;
}

export function fmtPct(value: number | null | undefined, signed = true) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const numeric = Number(value);
  return `${signed && numeric > 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

export function fmtPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const numeric = Number(value);
  return numeric >= 1000
    ? numeric.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : numeric.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function tone(value: number | null | undefined) {
  return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : 'neutral';
}

export function timestamp(value: number | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function assetFrom(symbol: string) {
  return symbol
    .replace('XBTUSDTM', 'BTC-USDT')
    .replace(/USDTM$/, '-USDT')
    .split('-')[0];
}

export function V20PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="v20-page-title">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {actions && <div className="v20-page-actions">{actions}</div>}
    </div>
  );
}

export function SoftMetric({
  label,
  value,
  detail,
  icon: Icon,
  accent = 'green',
  chart,
  valueTone,
  className = '',
  sparkBars,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon: React.ComponentType<{ size?: number }>;
  accent?: 'green' | 'blue' | 'violet' | 'amber' | 'red' | 'neutral';
  chart?: number[];
  valueTone?: string;
  className?: string;
  sparkBars?: boolean;
}) {
  return (
    <article className={`v20-metric v20-accent-${accent} ${className}`.trim()}>
      <div className="v20-metric-top">
        <span className="v20-metric-icon"><Icon size={16} /></span>
        <span>{label}</span>
      </div>
      <strong className={valueTone || ''} title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}>{value}</strong>
      {detail && <small>{detail}</small>}
      {chart?.length ? (
        <MiniSparkline
          values={chart}
          tone={accent === 'red' ? 'negative' : accent === 'violet' ? 'violet' : 'positive'}
          bars={sparkBars ?? accent === 'blue'}
        />
      ) : null}
    </article>
  );
}

export function HalfGauge({
  value,
  label,
  toneName = 'green',
  centerText,
}: {
  value: number;
  label: string;
  toneName?: 'green' | 'amber' | 'red';
  centerText?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  // The dial label sits inside the arc (`.v20-half-gauge > strong` is pulled up
  // over the svg), so a needle drawn from the hub outwards crossed straight
  // through its own value on every gauge in the app. It is drawn as an outboard
  // tick instead: r=30 clears the tallest label the shared styles produce, r=40
  // stops just inside the 46-radius arc band it points at.
  const angle = Math.PI * (1 - safe / 100);
  const tickX = (radius: number) => 60 + radius * Math.cos(angle);
  const tickY = (radius: number) => 58 - radius * Math.sin(angle);
  return (
    <div className={`v20-half-gauge ${toneName}`}>
      <svg viewBox="0 0 120 68" aria-label={`${label}: ${Math.round(safe)}%`}>
        <path d="M 14 58 A 46 46 0 0 1 106 58" pathLength="100" className="track" />
        <path
          d="M 14 58 A 46 46 0 0 1 106 58"
          pathLength="100"
          className="value"
          style={{ strokeDasharray: `${safe} ${100 - safe}` }}
        />
        <line
          x1={tickX(30)}
          y1={tickY(30)}
          x2={tickX(40)}
          y2={tickY(40)}
          className="needle"
        />
      </svg>
      <strong>{centerText || `${Math.round(safe)}/100`}</strong>
      <span>{label}</span>
    </div>
  );
}

export function Donut({
  items,
  totalLabel,
}: {
  items: Array<{ label: string; value: number; color: string }>;
  totalLabel: string;
}) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += Math.max(0, item.value) / total * 100;
    return `${item.color} ${start}% ${cursor}%`;
  }).join(', ');
  return (
    <div className="v20-donut" style={{ background: `conic-gradient(${stops || '#e8eeea 0 100%'})` }}>
      <span><strong>{totalLabel}</strong><small>USDT</small></span>
    </div>
  );
}

export function LinePlot({
  values,
  toneName = 'green',
}: {
  values: number[];
  toneName?: 'green' | 'red' | 'violet';
}) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return <div className="v20-chart-empty">No verified data yet</div>;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = Math.max(max - min, 1e-9);
  const points = clean
    .map((value, index) => `${index / Math.max(1, clean.length - 1) * 100},${74 - (value - min) / range * 60}`)
    .join(' ');
  const area = `0,78 ${points} 100,78`;
  return (
    <svg className={`v20-line-plot ${toneName}`} viewBox="0 0 100 80" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`v20-${toneName}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#v20-${toneName})`} />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function HonestEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="v20-empty">
      <CheckCircle2 size={20} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function PaginationControls({
  page,
  pageCount,
  start,
  end,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (!total) return null;
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((candidate) => candidate === 1 || candidate === pageCount || Math.abs(candidate - page) <= 1);
  return (
    <div className="v20-pagination">
      <span>Showing {start}–{end} of {total}</span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        {pages.map((candidate, index) => (
          <React.Fragment key={candidate}>
            {index > 0 && candidate - pages[index - 1] > 1 && <em>…</em>}
            <button
              type="button"
              className={candidate === page ? 'active' : ''}
              aria-current={candidate === page ? 'page' : undefined}
              onClick={() => onPageChange(candidate)}
            >
              {candidate}
            </button>
          </React.Fragment>
        ))}
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}
