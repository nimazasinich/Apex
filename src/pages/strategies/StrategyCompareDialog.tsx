import React, { useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { StrategyDefinition } from '../../types';
import { useDialogA11y } from '../../lib/useDialogA11y';
import {
  evidenceComparable,
  hasBoundEvidence,
  strategyDataTier,
  strategyDisplayStatus,
  supportedDirections,
} from './strategyPresentation';

interface StrategyCompareDialogProps {
  strategies: StrategyDefinition[];
  initialStrategyId: string;
  onClose: () => void;
}

function metric(value: number | undefined, suffix = ''): string {
  return Number.isFinite(value) ? `${Number(value).toFixed(2)}${suffix}` : 'Not comparable';
}

export function StrategyCompareDialog({ strategies, initialStrategyId, onClose }: StrategyCompareDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([initialStrategyId]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogA11y<HTMLElement>({ isOpen: true, onClose, initialFocusRef: closeRef });
  const selected = useMemo(() => selectedIds.map((id) => strategies.find((strategy) => strategy.strategyId === id)).filter((strategy): strategy is StrategyDefinition => Boolean(strategy)), [selectedIds, strategies]);
  const comparison = useMemo(() => evidenceComparable(selected), [selected]);

  const toggle = (strategyId: string) => setSelectedIds((current) => {
    if (current.includes(strategyId)) return current.filter((id) => id !== strategyId);
    if (current.length >= 3) return current;
    return [...current, strategyId];
  });

  return (
    <div className="strategy-compare-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="strategy-compare-dialog" role="dialog" aria-modal="true" aria-labelledby="strategy-compare-title">
        <header>
          <div><span>Evidence-aware comparison</span><h2 id="strategy-compare-title">Compare 2–3 Models</h2><p>{comparison.reason}</p><small>Select up to three registered strategies. Metrics only appear when each model has bound comparable evidence.</small></div>
          <button ref={closeRef} type="button" aria-label="Close strategy comparison" onClick={onClose}><X size={17} /></button>
        </header>

        <div className="strategy-compare-picker" aria-label="Models to compare">
          {strategies.map((strategy) => {
            const checked = selectedIds.includes(strategy.strategyId);
            return (
              <button key={strategy.strategyId} type="button" className={checked ? 'selected' : ''} aria-pressed={checked} disabled={!checked && selectedIds.length >= 3} onClick={() => toggle(strategy.strategyId)}>
                <span>{checked && <Check size={12} />}</span>{strategy.name}
              </button>
            );
          })}
        </div>

        <div className="strategy-compare-grid">
          {selected.map((strategy) => {
            const snapshot = strategy.latestSnapshot;
            const comparableMetrics = comparison.comparable && hasBoundEvidence(strategy);
            return (
              <article key={strategy.strategyId}>
                <span className={`strategy-status ${strategyDisplayStatus(strategy).toLowerCase().replaceAll(' ', '-')}`}>{strategyDisplayStatus(strategy)}</span>
                <h3>{strategy.name}</h3>
                <p>{strategy.summary}</p>
                <dl>
                  <div><dt>Data tier</dt><dd>{strategyDataTier(strategy)}</dd></div>
                  <div><dt>Directions</dt><dd>{supportedDirections(strategy).join(' / ')}</dd></div>
                  <div><dt>Intervals</dt><dd>{strategy.supportedIntervals.join(' · ')}</dd></div>
                  <div><dt>Requirements</dt><dd>{strategy.dataRequirements.join(' · ')}</dd></div>
                  <div><dt>Evidence context</dt><dd>{hasBoundEvidence(strategy) ? `${snapshot?.symbol} · ${snapshot?.interval} · ${snapshot?.direction}` : 'Evidence pending'}</dd></div>
                  <div><dt>Net return</dt><dd>{comparableMetrics ? metric(snapshot?.netReturnPct, '%') : 'Not comparable'}</dd></div>
                  <div><dt>Max drawdown</dt><dd>{comparableMetrics ? metric(snapshot?.maxDrawdownPct, '%') : 'Not comparable'}</dd></div>
                  <div><dt>Profit factor</dt><dd>{comparableMetrics ? metric(snapshot?.profitFactor) : 'Not comparable'}</dd></div>
                </dl>
              </article>
            );
          })}
          {selected.length < 2 && <div className="strategy-compare-empty"><strong>Choose another model</strong><span>Comparison needs at least two selected models; unavailable evidence stays labeled as not comparable.</span></div>}
        </div>
      </section>
    </div>
  );
}
