import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Crosshair, ShieldAlert, Target } from 'lucide-react';
import type { DerivedLevels, TradeDirection } from '../../types';

export interface LevelLadderPanelProps {
  levels: DerivedLevels;
  direction: TradeDirection;
  currentPrice?: number | null;
}

interface LevelRow {
  key: string;
  label: string;
  price: number;
  kind: 'target' | 'stop' | 'entry';
  distancePct: number;
  r: number;
}

function formatPrice(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 2 : 8 });
}

export function LevelLadderPanel({ levels, direction, currentPrice = null }: LevelLadderPanelProps) {
  const isLong = direction === 'LONG';
  const targets = isLong ? levels.resistances : levels.supports;
  const stops = isLong ? levels.supports : levels.resistances;
  const riskDistance = Math.abs(levels.entry - stops[0]);
  const rows = useMemo<LevelRow[]>(() => {
    const targetRows: LevelRow[] = targets.map((price, index) => ({
      key: `target-${index}`,
      label: `T${index + 1}`,
      price,
      kind: 'target' as const,
      distancePct: levels.entry > 0 ? ((price - levels.entry) / levels.entry) * 100 : 0,
      r: riskDistance > 0 ? Math.abs(price - levels.entry) / riskDistance : 0,
    }));
    const stopRows: LevelRow[] = stops.map((price, index) => ({
      key: `stop-${index}`,
      label: `S${index + 1}`,
      price,
      kind: 'stop' as const,
      distancePct: levels.entry > 0 ? ((price - levels.entry) / levels.entry) * 100 : 0,
      r: riskDistance > 0 ? Math.abs(price - levels.entry) / riskDistance : 0,
    }));
    const entryRow: LevelRow = {
      key: 'entry',
      label: 'ENTRY',
      price: levels.entry,
      kind: 'entry',
      distancePct: 0,
      r: 0,
    };
    return isLong
      ? [[...targetRows].reverse(), [entryRow], stopRows].flat()
      : [[...stopRows].reverse(), [entryRow], targetRows].flat();
  }, [isLong, levels.entry, riskDistance, stops, targets]);

  return <div className="apex-execution-ladder" data-direction={direction.toLowerCase()}>
    <div className="apex-execution-summary-grid">
      <div><Target size={14} /><span><small>Nearest target</small><strong>{formatPrice(targets[0])}</strong></span></div>
      <div><ShieldAlert size={14} /><span><small>Initial stop</small><strong>{formatPrice(stops[0])}</strong></span></div>
      <div><Crosshair size={14} /><span><small>Gross R/R</small><strong>{levels.riskReward.rMultiple.toFixed(2)}R</strong></span></div>
    </div>
    <div className="apex-execution-ladder-list">
      {rows.map((row) => <div key={row.key} className={`apex-execution-level ${row.kind}`}>
        <span className="apex-execution-level-tag">
          {row.kind === 'target' ? (isLong ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />) : row.kind === 'stop' ? <ShieldAlert size={12} /> : <Crosshair size={12} />}
          {row.label}
        </span>
        <strong>{formatPrice(row.price)}</strong>
        <span>{row.distancePct > 0 ? '+' : ''}{row.distancePct.toFixed(2)}%</span>
        <em>{row.kind === 'entry' ? levels.method.replaceAll('_', ' ') : `${row.r.toFixed(2)}R`}</em>
        {currentPrice != null && Number.isFinite(currentPrice) && Math.abs(currentPrice - row.price) <= Math.max(levels.atr14 * .15, levels.entry * .0005) ? <i>MARK</i> : null}
      </div>)}
    </div>
    <p className="apex-execution-footnote">Levels are derived from verified market candles and remain informational until a valid preview and confirmation are completed.</p>
  </div>;
}
