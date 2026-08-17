import React, { useId, useRef } from 'react';
import { AlertTriangle, Circle, Database, Loader2, LockKeyhole, RefreshCw } from 'lucide-react';
import type { UiDataState } from '../../types';

export type Availability = 'loading' | 'ready' | 'empty' | 'error' | 'locked';

export function WorkspacePageFrame({
  className = '',
  main,
  context,
}: {
  className?: string;
  main: React.ReactNode;
  context: React.ReactNode;
}) {
  return (
    <div className={`apex-page-frame ${className}`.trim()}>
      <section className="apex-page-main">{main}</section>
      <aside className="apex-context-panel" aria-label="Page context">{context}</aside>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="apex-v3-heading">
      <div>
        <span className="apex-v3-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="apex-v3-heading-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  className = '',
  children,
  as: Element = 'section',
}: {
  className?: string;
  children: React.ReactNode;
  as?: 'section' | 'article' | 'div';
}) {
  return <Element className={`apex-v3-panel ${className}`.trim()}>{children}</Element>;
}

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="apex-v3-panel-head">
      <div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
      {action}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'violet';
}) {
  return (
    <article className={`apex-v3-metric tone-${tone}`}>
      <div className="apex-v3-metric-top">
        <span>{label}</span>
        {icon && <i aria-hidden="true">{icon}</i>}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

const STATE_TONE: Record<UiDataState, 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'violet'> = {
  loading: 'info',
  live: 'positive',
  delayed: 'warning',
  stale: 'warning',
  partial: 'warning',
  proxy: 'violet',
  local: 'info',
  unavailable: 'negative',
  blocked: 'negative',
  error: 'negative',
};

export function StatusBadge({
  children,
  tone,
  state,
  label,
  detail,
}: {
  children?: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'violet';
  state?: UiDataState;
  label?: string;
  detail?: string;
}) {
  const resolvedTone = tone ?? (state ? STATE_TONE[state] : 'neutral');
  const text = children ?? label ?? state?.toUpperCase() ?? 'UNKNOWN';
  return <span className={`apex-v3-status tone-${resolvedTone}`} title={detail} aria-label={detail ? `${String(text)}: ${detail}` : undefined}><Circle size={7} fill="currentColor" aria-hidden="true" />{text}</span>;
}

export interface TabOption<T extends string> {
  id: T;
  label: string;
  count?: number;
  disabled?: boolean;
  disabledReason?: string;
}

export function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
  children,
}: {
  label: string;
  tabs: TabOption<T>[];
  active: T;
  onChange: (tab: T) => void;
  children: React.ReactNode;
}) {
  const id = useId().replace(/:/g, '');
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
  const enabledTabs = tabs.filter((tab) => !tab.disabled);
  const activeEnabledIndex = Math.max(0, enabledTabs.findIndex((tab) => tab.id === active));
  const focusTab = (index: number) => {
    if (!enabledTabs.length) return;
    const normalizedIndex = (index + enabledTabs.length) % enabledTabs.length;
    const next = enabledTabs[normalizedIndex];
    onChange(next.id);
    window.requestAnimationFrame(() => buttonRefs.current.get(next.id)?.focus());
  };
  return <div className="apex-tabs">
    <div role="tablist" aria-label={label} className="apex-tabs-list">
      {tabs.map((tab, index) => <button
        key={tab.id}
        ref={(element) => { if (element) buttonRefs.current.set(tab.id, element); else buttonRefs.current.delete(tab.id); }}
        id={`${id}-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-selected={active === tab.id}
        aria-controls={`${id}-panel-${tab.id}`}
        aria-disabled={tab.disabled || undefined}
        tabIndex={active === tab.id ? 0 : -1}
        title={tab.disabled ? tab.disabledReason : undefined}
        disabled={tab.disabled}
        onClick={() => onChange(tab.id)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') { event.preventDefault(); focusTab(activeEnabledIndex + 1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); focusTab(activeEnabledIndex - 1); }
          if (event.key === 'Home') { event.preventDefault(); focusTab(0); }
          if (event.key === 'End') { event.preventDefault(); focusTab(enabledTabs.length - 1); }
        }}
      >{tab.label}{typeof tab.count === 'number' && <em>{tab.count}</em>}</button>)}
    </div>
    <div id={`${id}-panel-${active}`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} className="apex-tabs-panel">{children}</div>
  </div>;
}

export function DataState({
  availability,
  title,
  detail,
  onRetry,
}: {
  availability: Exclude<Availability, 'ready'>;
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  const Icon = availability === 'loading'
    ? Loader2
    : availability === 'locked'
      ? LockKeyhole
      : availability === 'error'
        ? AlertTriangle
        : Database;
  return (
    <div className={`apex-v3-data-state state-${availability}`}>
      <Icon size={24} className={availability === 'loading' ? 'spin' : ''} />
      <strong>{title}</strong>
      <span>{detail}</span>
      {onRetry && availability === 'error' && (
        <button type="button" className="apex-v3-button secondary" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function TinySparkline({
  values,
  tone = 'positive',
  width = 104,
  height = 34,
}: {
  values: number[];
  tone?: 'positive' | 'negative' | 'info' | 'violet' | 'warning';
  width?: number;
  height?: number;
}) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return <span className="apex-v3-dash">—</span>;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const points = clean.map((value, index) => {
    const x = 2 + (index / (clean.length - 1)) * (width - 4);
    const y = 2 + (1 - (value - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className={`apex-v3-sparkline tone-${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend sparkline">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Donut({
  value,
  label,
  detail,
  tone = 'positive',
}: {
  value: number | null;
  label: string;
  detail: string;
  tone?: 'positive' | 'negative' | 'warning' | 'info' | 'violet';
}) {
  const safe = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={`apex-v3-donut tone-${tone}`} style={{ '--donut-value': `${safe * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{value == null ? '—' : `${Math.round(value)}%`}</strong><span>{label}</span><small>{detail}</small></div>
    </div>
  );
}

export function KeyValueList({ rows }: { rows: Array<{ label: string; value: React.ReactNode; tone?: string }> }) {
  return (
    <dl className="apex-v3-kv-list">
      {rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className={row.tone || ''}>{row.value}</dd></div>)}
    </dl>
  );
}

export function formatMaybeNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions) {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', options).format(value);
}

export function parseFinite(record: Record<string, unknown> | null | undefined, ...keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const raw = record[key];
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function parseString(record: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim()) return String(value);
  }
  return '';
}

export function timestampFrom(record: Record<string, unknown>): number | null {
  const raw = record.createdAt ?? record.updatedAt ?? record.time ?? record.ts ?? record.timestamp;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 10_000_000_000 ? raw : raw * 1000;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
