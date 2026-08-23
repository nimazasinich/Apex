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

/* One row per attribute instead of one card per model. The previous layout gave
   every model its own `<dl>`, so nothing guaranteed that "Net return" in the
   first column sat at the same height as "Net return" in the second — a summary
   that wrapped to a different number of lines pushed every row below it out of
   step, which is what the `min-height: 52px` on the summary paragraph was
   compensating for. Declaring the rows once and rendering a real table makes
   alignment structural, so the pinned height and the 7px type it forced are both
   gone.

   `cell` returns a string on purpose: the "is this value actually available"
   decision below reads the rendered text, so an unavailable cell can never be
   styled as a measurement by accident. */
interface CompareRow {
  label: string;
  /** Metric values are tabular figures; prose rows are not. */
  numeric?: boolean;
  /** Long prose that is allowed to set the row height. */
  prose?: boolean;
  cell: (strategy: StrategyDefinition, metricsComparable: boolean) => string;
}

const COMPARE_ROWS: CompareRow[] = [
  { label: 'Summary', prose: true, cell: (strategy) => strategy.summary },
  { label: 'Data tier', cell: (strategy) => strategyDataTier(strategy) },
  { label: 'Directions', cell: (strategy) => supportedDirections(strategy).join(' / ') },
  { label: 'Intervals', cell: (strategy) => strategy.supportedIntervals.join(' · ') },
  { label: 'Requirements', prose: true, cell: (strategy) => strategy.dataRequirements.join(' · ') },
  {
    label: 'Evidence context',
    cell: (strategy) => hasBoundEvidence(strategy)
      ? `${strategy.latestSnapshot?.symbol} · ${strategy.latestSnapshot?.interval} · ${strategy.latestSnapshot?.direction}`
      : 'Evidence pending',
  },
  { label: 'Net return', numeric: true, cell: (strategy, comparable) => comparable ? metric(strategy.latestSnapshot?.netReturnPct, '%') : 'Not comparable' },
  { label: 'Max drawdown', numeric: true, cell: (strategy, comparable) => comparable ? metric(strategy.latestSnapshot?.maxDrawdownPct, '%') : 'Not comparable' },
  { label: 'Profit factor', numeric: true, cell: (strategy, comparable) => comparable ? metric(strategy.latestSnapshot?.profitFactor) : 'Not comparable' },
];

const UNAVAILABLE = new Set(['Not comparable', 'Evidence pending']);

/* Which precondition failed, in the order that actually explains the cell. A
   model with no bound snapshot is unavailable for its own reason even when the
   set-level comparison already failed, so that case is reported first rather
   than repeating the set-level message. */
function unavailableReason(strategy: StrategyDefinition, setReason: string, setComparable: boolean): string {
  if (!hasBoundEvidence(strategy)) return 'This model has no bound evidence snapshot yet, so there is nothing to compare for it.';
  if (!setComparable) return setReason;
  return 'The bound snapshot did not report a finite value for this metric.';
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
          {selected.length > 0 && (
            <table className="strategy-compare-matrix">
              <caption>
                {selected.length === 1
                  ? 'One model selected — add a second to compare it.'
                  : `${selected.length} models side by side. Every row is read from the same field on each model, so blanks are absent evidence rather than a layout gap.`}
              </caption>
              <colgroup>
                <col className="strategy-compare-label-col" />
                {selected.map((strategy) => <col key={strategy.strategyId} />)}
              </colgroup>
              <thead>
                <tr>
                  {/* Deliberately an empty td: the corner heads the row-label
                      column, and naming it would make screen readers announce a
                      column header that does not describe any model. */}
                  <td />
                  {selected.map((strategy) => {
                    const status = strategyDisplayStatus(strategy);
                    return (
                      <th key={strategy.strategyId} scope="col">
                        <span className={`strategy-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
                        <strong>{strategy.name}</strong>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label} className={row.prose ? 'prose' : undefined}>
                    <th scope="row">{row.label}</th>
                    {selected.map((strategy) => {
                      const text = row.cell(strategy, comparison.comparable && hasBoundEvidence(strategy));
                      const unavailable = UNAVAILABLE.has(text);
                      const classNames = [row.numeric ? 'numeric' : '', unavailable ? 'unavailable' : ''].filter(Boolean).join(' ');
                      return (
                        <td
                          key={strategy.strategyId}
                          className={classNames || undefined}
                          title={unavailable ? unavailableReason(strategy, comparison.reason, comparison.comparable) : undefined}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {selected.length < 2 && <div className="strategy-compare-empty"><strong>Choose another model</strong><span>Comparison needs at least two selected models; unavailable evidence stays labeled as not comparable.</span></div>}
        </div>
      </section>
    </div>
  );
}
