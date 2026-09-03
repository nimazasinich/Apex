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
import {
  buildAcademyIntelligence,
  formatAcademyMetric,
  type AcademyIntelligence,
  type AcademyMeasure,
} from '../academy/academyIntelligence';
import './StrategyCompareDialog.css';

/** Two is the minimum that compares anything; four is the point where the
 *  columns of a 1050px dialog stop being wide enough to read a wrapped
 *  sentence. */
const MAX_COMPARED = 4;

interface StrategyCompareDialogProps {
  strategies: StrategyDefinition[];
  initialStrategyId: string;
  /** Optional pre-selected set (2–4 ids) — e.g. from a caller's own row
   *  checkboxes. Falls back to `[initialStrategyId]` when omitted, which
   *  keeps every existing call site working unchanged. Extra ids beyond
   *  `MAX_COMPARED` are dropped rather than rejected. */
  initialStrategyIds?: string[];
  onClose: () => void;
}

/* One row per attribute instead of one card per model. The previous layout gave
   every model its own `<dl>`, so nothing guaranteed that "Net return" in the
   first column sat at the same height as "Net return" in the second — a summary
   that wrapped to a different number of lines pushed every row below it out of
   step, which is what the `min-height: 52px` on the summary paragraph was
   compensating for. Declaring the rows once and rendering a real table makes
   alignment structural, so the pinned height and the 7px type it forced are both
   gone. */

/* A cell reports its own availability rather than having the renderer guess it
   from the rendered text. The earlier version matched cell text against a set of
   known placeholder strings, which meant every new row had to remember to reuse
   one of those exact strings or its "no measurement" state would silently render
   styled as a measurement. `unavailable` is now stated by the row that knows. */
interface CompareCell {
  text: string;
  /** True when `text` names an absent measurement instead of reporting one. */
  unavailable?: boolean;
  /** Why the value reads the way it does, in terms of recorded evidence. */
  title?: string;
  tone?: 'pass' | 'fail' | 'warn';
}

interface CompareRow {
  label: string;
  /** Metric values are tabular figures; prose rows are not. */
  numeric?: boolean;
  /** Long prose that is allowed to set the row height. */
  prose?: boolean;
  cell: (intelligence: AcademyIntelligence, metricsComparable: boolean) => CompareCell;
}

interface CompareSection {
  title: string;
  /** Stated in the divider row so a reader knows what the group depends on. */
  note: string;
  rows: CompareRow[];
}

function measureCell(measure: AcademyMeasure): CompareCell {
  if (measure.state === 'unmeasured') {
    return {
      // The regime measure can report a real profitable/measured ratio while its
      // gate result is absent, so an unmeasured cell keeps whatever figure was
      // genuinely recorded and says only the gate is missing.
      text: measure.label === '—' ? 'Not measured' : `${measure.label} · gate not recorded`,
      unavailable: true,
      title: measure.detail,
    };
  }
  return { text: measure.label, title: measure.detail, tone: measure.state };
}

function metricCell(intelligence: AcademyIntelligence, key: string, comparable: boolean): CompareCell {
  const metric = intelligence.metrics.find((candidate) => candidate.key === key);
  if (!metric) return { text: 'Unavailable', unavailable: true };
  if (!comparable) return { text: 'Not comparable', unavailable: true, title: metric.tooltip };
  if (metric.value == null) return { text: 'Unavailable', unavailable: true, title: `${metric.tooltip} The bound snapshot did not report a finite value for it.` };
  return { text: formatAcademyMetric(metric), title: metric.tooltip };
}

const COMPARE_SECTIONS: CompareSection[] = [
  {
    title: 'Model',
    note: 'Registry facts — independent of any dataset',
    rows: [
      { label: 'Summary', prose: true, cell: (intelligence) => ({ text: intelligence.strategy.summary }) },
      { label: 'Family', cell: (intelligence) => ({ text: intelligence.family }) },
      { label: 'Data tier', cell: (intelligence) => ({ text: strategyDataTier(intelligence.strategy) }) },
      { label: 'Directions', cell: (intelligence) => ({ text: supportedDirections(intelligence.strategy).join(' / ') }) },
      { label: 'Intervals', cell: (intelligence) => ({ text: intelligence.strategy.supportedIntervals.join(' · ') }) },
      { label: 'Requirements', prose: true, cell: (intelligence) => ({ text: intelligence.strategy.dataRequirements.join(' · ') }) },
    ],
  },
  {
    title: 'Validation state',
    note: 'Recorded per model — comparable even across different datasets',
    rows: [
      {
        label: 'Evidence context',
        cell: (intelligence) => {
          const snapshot = intelligence.strategy.latestSnapshot;
          if (!hasBoundEvidence(intelligence.strategy)) {
            return { text: 'Evidence pending', unavailable: true, title: intelligence.evidenceDetail };
          }
          return { text: `${snapshot?.symbol} · ${snapshot?.interval} · ${snapshot?.direction}` };
        },
      },
      {
        label: 'Validation scope',
        cell: (intelligence) => ({
          text: intelligence.scopeLabel,
          unavailable: intelligence.validationScope == null,
          title: intelligence.scopeDetail,
          tone: intelligence.validationScope === 'FULL_STRATEGY' ? 'pass' : intelligence.validationScope === 'BASE_REPLAY' ? 'warn' : undefined,
        }),
      },
      {
        label: 'Evidence quality',
        cell: (intelligence) => ({
          text: intelligence.evidenceLabel,
          unavailable: intelligence.evidenceQuality === 'none',
          title: intelligence.evidenceDetail,
          tone: intelligence.evidenceQuality === 'complete-live' ? 'pass' : intelligence.evidenceQuality === 'none' ? undefined : 'warn',
        }),
      },
      {
        label: 'Gates passed',
        cell: (intelligence) => ({
          text: intelligence.gatesLabel,
          unavailable: intelligence.gatesPassed == null,
          title: intelligence.gatesPassed == null
            ? 'No gate results are recorded for this model.'
            : intelligence.gates.map((gate) => `${gate.label}: ${gate.state}`).join(' · '),
          tone: intelligence.gatesPassed == null ? undefined : intelligence.gatesPassed === intelligence.gatesTotal ? 'pass' : 'fail',
        }),
      },
      { label: 'Out-of-sample', cell: (intelligence) => measureCell(intelligence.outOfSample) },
      { label: 'Statistical evidence', cell: (intelligence) => measureCell(intelligence.statistical) },
      {
        /* The request asked for "PBO / bias evidence". APEX computes no
           probability-of-backtest-overfitting metric anywhere in the pipeline, so
           this row reports the selection-bias evidence that does exist — the
           deflated Sharpe probability and the multiplicity correction it was
           deflated against — and the tooltip says PBO is absent rather than
           letting a reader assume the number shown is one. */
        label: 'Selection-bias evidence',
        cell: (intelligence) => {
          const statistical = intelligence.strategy.latestSnapshot?.statistical;
          const note = 'APEX records selection-bias evidence as a deflated Sharpe probability against the number of selection hypotheses tried. No probability-of-backtest-overfitting (PBO) metric is computed in this pipeline, so none is shown.';
          if (!statistical) return { text: 'Not recorded', unavailable: true, title: `No statistical evidence block was recorded for this model. ${note}` };
          const dsr = statistical.deflatedSharpeRatioProbability;
          const dsrText = dsr == null ? 'DSR not reported' : `DSR ${(dsr * 100).toFixed(1)}%`;
          return {
            text: `${dsrText} · ${statistical.selectionHypotheses} hyp.`,
            unavailable: dsr == null,
            title: `${dsrText} against ${statistical.selectionHypotheses} selection hypotheses at corrected alpha ${statistical.correctedAlpha.toFixed(4)}. ${note}`,
          };
        },
      },
      { label: 'Regime behaviour', cell: (intelligence) => measureCell(intelligence.regime) },
      { label: 'Cost resilience', cell: (intelligence) => measureCell(intelligence.cost) },
      {
        label: 'Readiness',
        cell: (intelligence) => ({
          text: intelligence.readinessLabel,
          unavailable: intelligence.readiness === 'no-evidence',
          title: intelligence.readinessDetail,
          tone: intelligence.readiness === 'paper-forward' ? 'pass' : intelligence.readiness === 'blocked' ? 'fail' : 'warn',
        }),
      },
      {
        label: 'Open blockers',
        prose: true,
        cell: (intelligence) => intelligence.blockers.length
          ? { text: intelligence.blockers.join(' '), tone: 'fail', title: `${intelligence.blockers.length} recorded blocker${intelligence.blockers.length === 1 ? '' : 's'}.` }
          : { text: 'None recorded', title: 'No registry, provenance, gate or statistical blocker is recorded for this model.' },
      },
    ],
  },
  {
    title: 'Holdout measurements',
    note: 'Shown only when every selected model was measured on the same dataset context',
    rows: [
      { label: 'Net return', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'netReturnPct', comparable) },
      { label: 'Max drawdown', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'maxDrawdownPct', comparable) },
      { label: 'Win rate', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'winRatePct', comparable) },
      { label: 'Profit factor', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'profitFactor', comparable) },
      { label: 'Expectancy / obs', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'expectancyPct', comparable) },
      { label: 'DSR probability', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'deflatedSharpeRatioProbability', comparable) },
      { label: 'P(mean > 0)', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'probabilityPositiveMean', comparable) },
      { label: 'CI lower bound', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'lowerConfidenceBoundPct', comparable) },
      { label: 'Effective sample', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'effectiveSampleSize', comparable) },
      { label: 'Cost-stress return', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'costStressPnlPct', comparable) },
      { label: 'Ranking score', numeric: true, cell: (intelligence, comparable) => metricCell(intelligence, 'rankScore', comparable) },
    ],
  },
];

/* Which precondition failed, in the order that actually explains the cell. A
   model with no bound snapshot is unavailable for its own reason even when the
   set-level comparison already failed, so that case is reported first rather
   than repeating the set-level message. */
function unavailableReason(strategy: StrategyDefinition, setReason: string, setComparable: boolean): string {
  if (!hasBoundEvidence(strategy)) return 'This model has no bound evidence snapshot yet, so there is nothing to compare for it.';
  if (!setComparable) return setReason;
  return 'The bound snapshot did not report a finite value for this metric.';
}

function chipTone(status: string): string {
  if (status === 'Verified') return 'is-pass';
  if (status === 'Blocked') return 'is-fail';
  if (status === 'Evidence Pending') return 'is-warn';
  return '';
}

export function StrategyCompareDialog({ strategies, initialStrategyId, initialStrategyIds, onClose }: StrategyCompareDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => (initialStrategyIds?.length
    ? [...new Set(initialStrategyIds)].slice(0, MAX_COMPARED)
    : [initialStrategyId]));
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogA11y<HTMLElement>({ isOpen: true, onClose, initialFocusRef: closeRef });
  const selected = useMemo(() => selectedIds.map((id) => strategies.find((strategy) => strategy.strategyId === id)).filter((strategy): strategy is StrategyDefinition => Boolean(strategy)), [selectedIds, strategies]);
  const comparison = useMemo(() => evidenceComparable(selected), [selected]);
  const intelligence = useMemo(() => selected.map((strategy) => buildAcademyIntelligence(strategy)), [selected]);

  const toggle = (strategyId: string) => setSelectedIds((current) => {
    if (current.includes(strategyId)) return current.filter((id) => id !== strategyId);
    if (current.length >= MAX_COMPARED) return current;
    return [...current, strategyId];
  });

  return (
    <div className="strategy-compare-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="strategy-compare-dialog" role="dialog" aria-modal="true" aria-labelledby="strategy-compare-title">
        <header>
          <div><span>Evidence-aware comparison</span><h2 id="strategy-compare-title">Compare 2–4 Models</h2><p>{comparison.reason}</p><small>Select up to four registered strategies. Validation state is comparable for every model; holdout measurements appear only when each model has bound evidence from the same dataset context.</small></div>
          <button ref={closeRef} type="button" aria-label="Close strategy comparison" onClick={onClose}><X size={17} /></button>
        </header>

        <div className="strategy-compare-picker" aria-label="Models to compare">
          {strategies.map((strategy) => {
            const checked = selectedIds.includes(strategy.strategyId);
            return (
              <button key={strategy.strategyId} type="button" className={checked ? 'selected' : ''} aria-pressed={checked} disabled={!checked && selectedIds.length >= MAX_COMPARED} onClick={() => toggle(strategy.strategyId)}>
                <span>{checked && <Check size={12} />}</span>{strategy.name}
              </button>
            );
          })}
        </div>

        <div className="strategy-compare-grid">
          {intelligence.length > 0 && (
            <table className="strategy-compare-matrix">
              <caption>
                {intelligence.length === 1
                  ? 'One model selected — add a second to compare it.'
                  : `${intelligence.length} models side by side. Every row is read from the same field on each model, so an unavailable cell is absent evidence rather than a layout gap.`}
              </caption>
              <colgroup>
                <col className="strategy-compare-label-col" />
                {intelligence.map((row) => <col key={row.strategyId} />)}
              </colgroup>
              <thead>
                <tr>
                  {/* Deliberately an empty td: the corner heads the row-label
                      column, and naming it would make screen readers announce a
                      column header that does not describe any model. */}
                  <td />
                  {intelligence.map((row) => {
                    const status = strategyDisplayStatus(row.strategy);
                    return (
                      <th key={row.strategyId} scope="col">
                        <span className={`strategy-compare-chip ${chipTone(status)}`.trim()}>{status}</span>
                        <strong>{row.name}</strong>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {COMPARE_SECTIONS.map((section) => (
                <tbody key={section.title}>
                  <tr className="section">
                    <th scope="row">{section.title}</th>
                    <td colSpan={intelligence.length}>{section.note}</td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.label} className={row.prose ? 'prose' : undefined}>
                      <th scope="row">{row.label}</th>
                      {intelligence.map((entry) => {
                        const cell = row.cell(entry, comparison.comparable && hasBoundEvidence(entry.strategy));
                        const classNames = [row.numeric ? 'numeric' : '', cell.unavailable ? 'unavailable' : ''].filter(Boolean).join(' ');
                        return (
                          <td
                            key={entry.strategyId}
                            className={classNames || undefined}
                            title={cell.unavailable
                              ? `${cell.title ? `${cell.title} ` : ''}${unavailableReason(entry.strategy, comparison.reason, comparison.comparable)}`
                              : cell.title}
                          >
                            {cell.text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          )}
          {intelligence.length < 2 && <div className="strategy-compare-empty"><strong>Choose another model</strong><span>Comparison needs at least two selected models; unavailable evidence stays labeled as not comparable.</span></div>}
        </div>
      </section>
    </div>
  );
}
