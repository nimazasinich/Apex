/**
 * APEX-NEXT Shared Primitive Component Library (REQ-061, REQ-063)
 * All dashboard cards, tiles, badges, tabs, rings, and empty states are built from these primitives.
 */

import React from 'react';
import { DataState, ReadinessTier, TradeDirection } from '../types';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  Info,
  Loader2,
  Radio,
  XCircle,
} from 'lucide-react';

// ==========================================
// 1. SectionCard Primitive
// ==========================================
export interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  /** Stronger glass + accent rim for the scanner hero */
  variant?: 'default' | 'hero';
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  subtitle,
  icon,
  action,
  headerRight,
  children,
  className = '',
  noPadding = false,
  variant = 'default',
}) => {
  const shell = variant === 'hero' ? 'glass-hero' : 'glass-panel';
  return (
    <div
      className={`${shell} flex flex-col overflow-hidden transition-colors ${className}`}
    >
      <div className="px-3 py-2 glass-panel-header flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className="shrink-0 text-[var(--accent)] flex items-center justify-center">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex flex-col gap-0.5">
            <h2 className="font-display terminal-text-base font-semibold text-slate-50 tracking-normal normal-case truncate">
              {title}
            </h2>
            {subtitle && (
              <span className="card-subtitle truncate">
                {subtitle}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
          {action}
        </div>
      </div>
      <div className={`flex-1 overflow-hidden flex flex-col ${noPadding ? '' : 'p-2.5'}`}>
        {children}
      </div>
    </div>
  );
};

// ==========================================
// 2. MetricTile Primitive
// ==========================================
export interface MetricTileProps {
  label: string;
  value: React.ReactNode;
  subValue?: string;
  changePct?: number;
  direction?: TradeDirection;
  className?: string;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  subValue,
  changePct,
  direction,
  className = '',
}) => {
  const isPositive = changePct !== undefined && changePct >= 0;
  const isNegative = changePct !== undefined && changePct < 0;

  let valueColor = 'text-slate-100';
  if (direction === 'LONG' || isPositive) valueColor = 'text-[var(--bullish)]';
  if (direction === 'SHORT' || isNegative) valueColor = 'text-[var(--bearish)]';

  return (
    <div
      className={`glass-inset p-2.5 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between text-[var(--neutral-subtle)] label-meta">
        <span>{label}</span>
        {changePct !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 font-terminal-num font-medium ${
              isPositive ? 'text-[var(--bullish)]' : 'text-[var(--bearish)]'
            }`}
          >
            {isPositive ? (
              <ArrowUpRight className="w-3 h-3" aria-hidden />
            ) : (
              <ArrowDownRight className="w-3 h-3" aria-hidden />
            )}
            {isPositive ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        )}
      </div>
      <div className={`font-terminal-num terminal-text-lg font-bold mt-1 ${valueColor}`}>
        {value}
      </div>
      {subValue && (
        <div className="terminal-text-xs text-[var(--neutral-subtle)] mt-0.5 truncate">
          {subValue}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. Pill / ReadinessBadge Primitive (REQ-017)
// ==========================================
export interface PillProps {
  tier?: ReadinessTier;
  label?: string;
  color?: 'bullish' | 'bearish' | 'cyan' | 'warning' | 'neutral';
  size?: 'xs' | 'sm';
  className?: string;
}

export const Pill: React.FC<PillProps> = ({
  tier,
  label,
  color,
  size = 'sm',
  className = '',
}) => {
  let bgClass = 'bg-slate-800/60 text-slate-300 border-slate-600/50';
  let text = label || tier || '';
  let Icon: React.ComponentType<{ className?: string }> | null = null;

  if (tier === 'CONFIRMED') {
    bgClass = 'bg-[var(--bullish-bg)] text-[var(--bullish)] border-[var(--bullish)]/40 font-semibold';
    Icon = CheckCircle2;
  } else if (tier === 'WATCHLIST') {
    bgClass = 'bg-[var(--accent-glow)] text-[var(--accent)] border-[var(--accent)]/40 font-semibold';
    Icon = Eye;
  } else if (tier === 'CAUTION') {
    bgClass = 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/40 font-medium';
    Icon = AlertTriangle;
  } else if (tier === 'BLOCKED') {
    bgClass = 'bg-[var(--bearish-bg)] text-[var(--bearish)] border-[var(--bearish)]/40 font-medium opacity-80';
    Icon = XCircle;
  } else if (color === 'bullish') {
    bgClass = 'bg-[var(--bullish-bg)] text-[var(--bullish)] border-[var(--bullish)]/30';
    Icon = ArrowUpRight;
  } else if (color === 'bearish') {
    bgClass = 'bg-[var(--bearish-bg)] text-[var(--bearish)] border-[var(--bearish)]/30';
    Icon = ArrowDownRight;
  } else if (color === 'cyan') {
    bgClass = 'bg-[var(--accent-glow)] text-[var(--accent-2)] border-[var(--accent-2)]/30';
  } else if (color === 'warning') {
    bgClass = 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/30';
    Icon = AlertTriangle;
  }

  const padding =
    size === 'xs' ? 'px-2 py-0.5 terminal-text-xs gap-0.5' : 'px-2.5 py-0.5 terminal-text-xs gap-1';
  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border tracking-wide uppercase font-terminal-num whitespace-nowrap ${padding} ${bgClass} ${className}`}
    >
      {Icon && <Icon className={iconSize} aria-hidden />}
      {text}
    </span>
  );
};

// ==========================================
// 4. StatusBadge Primitive (REQ-004) — always color + label (never color alone)
// ==========================================
export interface StatusBadgeProps {
  state: DataState;
  showLabel?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  state,
  showLabel = true,
  className = '',
}) => {
  let dotColor = 'bg-[var(--bullish)]';
  let labelText = showLabel ? 'LIVE FEED' : 'LIVE';
  let textColor = 'text-[var(--bullish)]';
  let Icon: React.ComponentType<{ className?: string }> = Radio;

  if (state === 'degraded') {
    dotColor = 'bg-[var(--warning)] animate-pulse';
    labelText = showLabel ? 'DEGRADED' : 'DEG';
    textColor = 'text-[var(--warning)]';
    Icon = AlertTriangle;
  } else if (state === 'not_configured') {
    dotColor = 'bg-slate-500';
    labelText = showLabel ? 'NOT CONFIGURED' : 'N/A';
    textColor = 'text-slate-400';
    Icon = Info;
  } else if (state === 'unavailable') {
    dotColor = 'bg-[var(--bearish)]';
    labelText = showLabel ? 'UNAVAILABLE' : 'DOWN';
    textColor = 'text-[var(--bearish)]';
    Icon = XCircle;
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border border-white/15 bg-black/25 ${textColor} ${className}`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden />
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="font-terminal-num terminal-text-xs font-semibold tracking-wide uppercase">
        {labelText}
      </span>
    </div>
  );
};

// ==========================================
// 5. FilterTabs Primitive
// ==========================================
export interface FilterTabOption {
  key: string;
  label: string;
  count?: number;
}

export interface FilterTabsProps {
  options: FilterTabOption[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export const FilterTabs: React.FC<FilterTabsProps> = ({
  options,
  activeKey,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center glass-inset p-0.5 ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.key === activeKey;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`px-2.5 py-1 rounded-full terminal-text-xs font-medium transition-all ${
              isActive
                ? 'bg-[var(--accent)]/25 text-[var(--accent)]'
                : 'text-[var(--neutral-subtle)] hover:text-slate-200'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className="ml-1 opacity-70 font-terminal-num">({opt.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ==========================================
// 6. EmptyState Primitive (REQ-015, REQ-063)
// ==========================================
export interface EmptyStateProps {
  type?: 'empty' | 'loading' | 'error';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'empty',
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-6 text-center my-auto ${className}`}
    >
      <div className="w-10 h-10 rounded-full glass-inset flex items-center justify-center mb-3">
        {type === 'loading' && (
          <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
        )}
        {type === 'error' && (
          <XCircle className="w-5 h-5 text-[var(--bearish)]" />
        )}
        {type === 'empty' && (
          <Info className="w-5 h-5 text-[var(--neutral-subtle)]" />
        )}
      </div>
      <h3 className="font-display terminal-text-sm font-semibold text-slate-200 mb-1">
        {title}
      </h3>
      <p className="terminal-text-xs text-[var(--neutral-subtle)] max-w-xs mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-3 py-1.5 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-[var(--accent)] border border-[var(--accent)]/40 rounded terminal-text-xs font-semibold tracking-wide transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

// ==========================================
// 7. ConfidenceRing Primitive (REQ-024, REQ-061)
// ==========================================
export interface ConfidenceRingProps {
  score: number; // 0 to 100
  size?: number; // px, default 54
  strokeWidth?: number;
  label?: string;
  className?: string;
}

export const ConfidenceRing: React.FC<ConfidenceRingProps> = ({
  score,
  size = 54,
  strokeWidth = 5,
  label = 'CONF',
  className = '',
}) => {
  const bounded = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (bounded / 100) * circumference;

  let color = 'var(--warning)';
  let bandLabel = 'MED';
  let BandIcon = AlertTriangle;
  if (bounded >= 75) {
    color = 'var(--bullish)';
    bandLabel = 'HIGH';
    BandIcon = CheckCircle2;
  } else if (bounded < 50) {
    color = 'var(--bearish)';
    bandLabel = 'LOW';
    BandIcon = XCircle;
  }

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-terminal-num terminal-text-sm font-bold text-slate-100">
          {bounded}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 terminal-text-xs text-[var(--neutral-subtle)] mt-1 uppercase tracking-wider">
        <BandIcon className="w-3 h-3" style={{ color }} aria-hidden />
        {label} · {bandLabel}
      </span>
    </div>
  );
};
