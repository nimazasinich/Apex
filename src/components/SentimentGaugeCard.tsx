/**
 * APEX-NEXT Market Sentiment Gauge (REQ-012, REQ-030, REQ-031)
 * 5-zone segmented colored arc with tick labels at zone boundaries.
 */

import React from 'react';
import { SentimentComposite } from '../types';
import { SectionCard, StatusBadge } from './primitives';
import { ProvenanceChip } from './ui/ProvenanceChip';
import { describeProvenance } from '../lib/dataProvenance';
import { Frown, Gauge, Meh, Smile, SmilePlus } from 'lucide-react';

export interface SentimentGaugeCardProps {
  sentiment: SentimentComposite | null;
  isLoading?: boolean;
}

/** Composite refreshes on a 30s cadence; allow two cycles before calling it cached. */
const SENTIMENT_STALE_AFTER_MS = 60_000;

/** Zone colors: Extreme Fear → Fear → Neutral → Greed → Extreme Greed */
const ZONE_COLORS = ['#ff7597', '#ff9aad', '#ffd166', '#67e8f9', '#34e7b3'] as const;
const ZONE_BOUNDS = [0, 20, 40, 60, 80, 100] as const;
const ZONE_TICK_LABELS = ['0', '20', '40', '60', '80', '100'] as const;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Semicircle arc from angleA to angleB (0° = left, 180° = right) */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startScore: number,
  endScore: number
) {
  const startAngle = (startScore / 100) * 180;
  const endAngle = (endScore / 100) * 180;
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export const SentimentGaugeCard: React.FC<SentimentGaugeCardProps> = ({
  sentiment,
  isLoading = false,
}) => {
  if (isLoading || !sentiment) {
    return (
      <SectionCard
        title="Market Mood"
        subtitle="0–100 composite"
        icon={<Gauge className="w-4 h-4" aria-hidden />}
        className="h-full"
      >
        <div className="flex flex-col items-center justify-center my-auto py-6 text-[var(--neutral-subtle)] terminal-text-xs">
          Loading sentiment inputs…
        </div>
      </SectionCard>
    );
  }

  const { score, zone, inputs, dataState } = sentiment;
  const bounded = Math.max(0, Math.min(100, score));
  const provenance = describeProvenance({
    dataState,
    timestamp: sentiment.timestamp,
    source: sentiment.source,
    staleAfterMs: SENTIMENT_STALE_AFTER_MS,
  });

  let ZoneIcon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> = Meh;
  let zoneColor: string = ZONE_COLORS[2];
  if (bounded <= 20) {
    ZoneIcon = Frown;
    zoneColor = ZONE_COLORS[0];
  } else if (bounded <= 40) {
    ZoneIcon = Frown;
    zoneColor = ZONE_COLORS[1];
  } else if (bounded <= 60) {
    ZoneIcon = Meh;
    zoneColor = ZONE_COLORS[2];
  } else if (bounded <= 80) {
    ZoneIcon = Smile;
    zoneColor = ZONE_COLORS[3];
  } else {
    ZoneIcon = SmilePlus;
    zoneColor = ZONE_COLORS[4];
  }

  const cx = 80;
  const cy = 78;
  const radius = 58;
  const strokeWidth = 11;
  const needleAngle = (bounded / 100) * 180;
  const needle = polarToCartesian(cx, cy, radius - 6, needleAngle);

  return (
    <SectionCard
      title="Market Mood"
      subtitle="Five-zone composite"
      icon={<Gauge className="w-4 h-4" aria-hidden />}
      headerRight={
        <div className="flex items-center gap-2 min-w-0">
          <ProvenanceChip meta={provenance} />
          <StatusBadge state={dataState} showLabel={false} />
        </div>
      }
      className="h-full flex flex-col justify-between"
    >
      <div className="flex flex-col items-center justify-center pt-1 pb-0">
        <div className="relative flex flex-col items-center">
          <svg width="160" height="96" viewBox="0 0 160 96" className="overflow-visible">
            {/* 5 colored zone segments */}
            {ZONE_COLORS.map((color, i) => (
              <path
                key={color}
                d={describeArc(cx, cy, radius, ZONE_BOUNDS[i], ZONE_BOUNDS[i + 1])}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
                opacity={0.9}
              />
            ))}
            {/* Tick marks + labels at zone boundaries */}
            {ZONE_BOUNDS.map((bound, i) => {
              const ang = (bound / 100) * 180;
              const outer = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 2, ang);
              const inner = polarToCartesian(cx, cy, radius - strokeWidth / 2 - 2, ang);
              const labelPos = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 11, ang);
              return (
                <g key={bound}>
                  <line
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth={1}
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--neutral-subtle)"
                    fontSize="8"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {ZONE_TICK_LABELS[i]}
                  </text>
                </g>
              );
            })}
            {/* Needle */}
            <line
              x1={cx}
              y1={cy}
              x2={needle.x}
              y2={needle.y}
              stroke="#f8fafc"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={3.5} fill="#f8fafc" />
          </svg>
          <div className="absolute top-10 flex flex-col items-center pointer-events-none">
            <span className="font-terminal-num terminal-text-xl font-bold text-slate-100">
              {bounded}
            </span>
            <span
              className="inline-flex items-center gap-1 terminal-text-xs font-semibold mt-0.5"
              style={{ color: zoneColor }}
            >
              <ZoneIcon className="w-3 h-3" style={{ color: zoneColor }} aria-hidden />
              {zone}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between w-full px-1 mt-0.5 label-meta">
          <span className="text-[var(--bearish)]">Fear</span>
          <span>Neutral</span>
          <span className="text-[var(--bullish)]">Greed</span>
        </div>
      </div>

      <div className="mt-1.5 border-t border-[var(--border-subtle)] pt-1.5 space-y-1">
        <div className="label-meta mb-0.5">Inputs</div>
        {inputs.map((inp) => {
          const isLive = inp.dataState === 'live';
          return (
            <div
              key={inp.name}
              className="flex items-center justify-between glass-inset px-2 py-1"
            >
              <div className="flex flex-col overflow-hidden mr-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="terminal-text-xs font-semibold text-slate-200 truncate">
                    {inp.name}
                  </span>
                  <StatusBadge state={inp.dataState} showLabel={false} />
                </div>
              </div>
              <div className="text-right shrink-0">
                {isLive ? (
                  <span className="font-terminal-num terminal-text-xs font-semibold text-slate-100">
                    {inp.score}
                  </span>
                ) : (
                  <span className="label-meta">Skipped</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};
