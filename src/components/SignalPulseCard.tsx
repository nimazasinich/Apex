/**
 * Signal Pulse — compact secondary tile derived from existing scan data.
 * Honors dataState: never implies a confident pulse when feed is degraded/unavailable.
 */

import React, { useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { CandidateScore, DataState, ReadinessTier } from '../types';
import { EmptyState, SectionCard, StatusBadge } from './primitives';

export interface SignalPulseCardProps {
  longCandidates: CandidateScore[];
  shortCandidates: CandidateScore[];
  dataState: DataState;
  scanTimestamp: number;
  activeCandidateCount: number;
  isScanning?: boolean;
}

const TIER_ORDER: ReadinessTier[] = ['CONFIRMED', 'WATCHLIST', 'CAUTION', 'BLOCKED'];

const TIER_META: Record<
  ReadinessTier,
  { color: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  CONFIRMED: { color: 'var(--bullish)', Icon: CheckCircle2 },
  WATCHLIST: { color: 'var(--accent)', Icon: Eye },
  CAUTION: { color: 'var(--warning)', Icon: AlertTriangle },
  BLOCKED: { color: 'var(--bearish)', Icon: XCircle },
};

function countTiers(candidates: CandidateScore[]): Record<ReadinessTier, number> {
  const counts: Record<ReadinessTier, number> = {
    CONFIRMED: 0,
    WATCHLIST: 0,
    CAUTION: 0,
    BLOCKED: 0,
  };
  for (const c of candidates) {
    if (c.readinessTier && counts[c.readinessTier] !== undefined) {
      counts[c.readinessTier] += 1;
    }
  }
  return counts;
}

export const SignalPulseCard: React.FC<SignalPulseCardProps> = ({
  longCandidates,
  shortCandidates,
  dataState,
  scanTimestamp,
  activeCandidateCount,
  isScanning = false,
}) => {
  const feedBroken = dataState === 'degraded' || dataState === 'unavailable' || dataState === 'not_configured';

  const all = useMemo(
    () => [...longCandidates, ...shortCandidates],
    [longCandidates, shortCandidates]
  );
  const tierCounts = useMemo(() => countTiers(all), [all]);
  const total = all.length || 1;
  const longN = longCandidates.length;
  const shortN = shortCandidates.length;
  const bias =
    longN === shortN ? 'Balanced' : longN > shortN ? 'Long bias' : 'Short bias';

  const ageLabel = (() => {
    if (!scanTimestamp) return 'No scan';
    const secs = Math.max(0, Math.floor((Date.now() - scanTimestamp) / 1000));
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  })();

  return (
    <SectionCard
      title="Signal pulse"
      subtitle="Scan snapshot"
      icon={<Activity className="w-4 h-4" aria-hidden />}
      headerRight={<StatusBadge state={dataState} showLabel={false} />}
      className="h-full"
    >
      {feedBroken ? (
        <EmptyState
          type="error"
          title="Pulse unavailable"
          description={
            dataState === 'degraded'
              ? 'Feed is degraded — pulse paused so you do not act on stale signals.'
              : 'Market feed is unavailable. Pulse will resume when data returns.'
          }
        />
      ) : isScanning && all.length === 0 ? (
        <EmptyState
          type="loading"
          title="Scanning…"
          description="Building the first pulse from the two-directional scan."
        />
      ) : all.length === 0 ? (
        <EmptyState
          type="empty"
          title="No signals yet"
          description="Run a scan to populate long/short pulse and readiness mix."
        />
      ) : (
        <div className="flex flex-col gap-2.5 h-full overflow-hidden">
          {/* Direction bias */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[var(--accent-2)]" aria-hidden />
              <span className="terminal-text-xs font-semibold text-slate-200">
                {bias}
              </span>
            </div>
            <span className="font-terminal-num terminal-text-xs text-[var(--neutral-subtle)]">
              {activeCandidateCount} active · {ageLabel}
            </span>
          </div>

          {/* Long vs Short bars */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between terminal-text-xs">
              <span className="inline-flex items-center gap-1 text-[var(--bullish)] font-semibold">
                <ArrowUpRight className="w-3 h-3" aria-hidden />
                LONG
              </span>
              <span className="font-terminal-num text-[var(--bullish)]">{longN}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--bullish)] transition-all"
                style={{ width: `${(longN / total) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between terminal-text-xs">
              <span className="inline-flex items-center gap-1 text-[var(--bearish)] font-semibold">
                <ArrowDownRight className="w-3 h-3" aria-hidden />
                SHORT
              </span>
              <span className="font-terminal-num text-[var(--bearish)]">{shortN}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--bearish)] transition-all"
                style={{ width: `${(shortN / total) * 100}%` }}
              />
            </div>
          </div>

          {/* Tier mix */}
          <div className="mt-auto flex flex-wrap gap-1.5">
            {TIER_ORDER.map((tier) => {
              const n = tierCounts[tier];
              if (!n) return null;
              const { color, Icon } = TIER_META[tier];
              return (
                <span
                  key={tier}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 terminal-text-xs font-terminal-num"
                  style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
                >
                  <Icon className="w-2.5 h-2.5" aria-hidden />
                  {tier.slice(0, 4)} {n}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
};
