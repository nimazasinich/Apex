/**
 * APEX-NEXT Decision Journal & Outcome Tracking Modal (REQ-070, REQ-071, REQ-072)
 * Features:
 * - Filterable Decision Journal table of accepted/rejected paper setups (REQ-070)
 * - Outcome tracking: resolve trades as TARGET_HIT, STOP_HIT, or EXPIRED (REQ-071)
 * - Calibration Report: real calibration curve comparing model predicted success vs realized win rate by tier (REQ-072)
 */

import React, { useState } from 'react';
import {
  CalibrationBucket,
  DecisionJournalEntry,
  ReadinessTier,
} from '../types';
import { computeCalibrationReport, updateJournalEntryOutcome, deleteJournalEntry } from '../lib/storage';
import { FilterTabs, Pill } from './primitives';
import { BookOpen, ArrowDownRight, ArrowUpRight, CheckCircle2, ThumbsDown, ThumbsUp, Trash2, TrendingUp, X, XCircle } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDialogA11y } from '../lib/useDialogA11y';

export interface DecisionJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: DecisionJournalEntry[];
  onRefreshEntries: () => void;
}

export const DecisionJournalModal: React.FC<DecisionJournalModalProps> = ({
  isOpen,
  onClose,
  entries,
  onRefreshEntries,
}) => {
  const [activeTab, setActiveTab] = useState<'journal' | 'calibration'>('journal');
  const [filterAction, setFilterAction] = useState<'ALL' | 'ACCEPTED' | 'REJECTED'>('ALL');
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const dialogRef = useDialogA11y({ isOpen, onClose });

  if (!isOpen) return null;

  const filteredEntries = entries.filter((entry) => {
    if (filterAction !== 'ALL' && entry.action !== filterAction) return false;
    if (filterOutcome === 'OPEN' && entry.outcomeStatus !== 'OPEN') return false;
    if (filterOutcome === 'CLOSED' && entry.outcomeStatus === 'OPEN') return false;
    return true;
  });

  const calibrationBuckets: CalibrationBucket[] = computeCalibrationReport(entries);

  const handleUpdateOutcome = (
    id: string,
    status: 'TARGET_HIT' | 'STOP_HIT' | 'EXPIRED',
    realizedR: number
  ) => {
    updateJournalEntryOutcome(id, status, undefined, realizedR);
    onRefreshEntries();
  };

  const handleDelete = (id: string) => {
    deleteJournalEntry(id);
    onRefreshEntries();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-modal-title"
        className="bg-[rgba(13,10,28,0.85)] border border-[var(--border)] rounded-lg w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl backdrop-blur-[20px]"
      >
        {/* Modal Header */}
        <div className="px-4 py-3 bg-[rgba(26,18,48,0.65)] border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-[var(--accent)]" aria-hidden />
            <h2 id="journal-modal-title" className="terminal-text-base font-bold text-slate-100 uppercase tracking-wide">
              Decision Journal & Calibration Report (REQ-070 .. REQ-072)
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <FilterTabs
              options={[
                { key: 'journal', label: 'Decision Journal', count: entries.length },
                { key: 'calibration', label: 'Calibration Curve' },
              ]}
              activeKey={activeTab}
              onChange={(k) => setActiveTab(k as 'journal' | 'calibration')}
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[rgba(36,26,61,0.55)] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              aria-label="Close decision journal"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          {activeTab === 'journal' ? (
            <>
              {/* Journal Filters Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="terminal-text-xs text-slate-400 uppercase">
                    Action:
                  </span>
                  <FilterTabs
                    options={[
                      { key: 'ALL', label: 'All' },
                      { key: 'ACCEPTED', label: 'Accepted' },
                      { key: 'REJECTED', label: 'Rejected' },
                    ]}
                    activeKey={filterAction}
                    onChange={(k) => setFilterAction(k as any)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="terminal-text-xs text-slate-400 uppercase">
                    Status:
                  </span>
                  <FilterTabs
                    options={[
                      { key: 'ALL', label: 'All' },
                      { key: 'OPEN', label: 'Open' },
                      { key: 'CLOSED', label: 'Closed/Resolved' },
                    ]}
                    activeKey={filterOutcome}
                    onChange={(k) => setFilterOutcome(k as any)}
                  />
                </div>
              </div>

              {/* Journal Table (REQ-070, REQ-071) */}
              <div className="flex-1 overflow-y-auto custom-scrollbar mt-3">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[rgba(26,18,48,0.65)] border-b border-[var(--border)] terminal-text-xs text-slate-400 font-semibold uppercase">
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-2">Symbol</th>
                      <th className="py-2.5 px-2 text-center">Dir / Action</th>
                      <th className="py-2.5 px-2 text-center">Score / Tier</th>
                      <th className="py-2.5 px-2">Reason & Evidence</th>
                      <th className="py-2.5 px-2 text-center">Outcome</th>
                      <th className="py-2.5 px-3 text-right">Resolve</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] terminal-text-xs">
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          No journal entries match selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map((e) => {
                        const isLong = e.direction === 'LONG';
                        const isAccepted = e.action === 'ACCEPTED';
                        return (
                          <tr key={e.id} className="hover:bg-[rgba(36,26,61,0.55)]/60 transition-colors">
                            <td className="py-3 px-3 font-terminal-num text-slate-400 whitespace-nowrap">
                              {new Date(e.timestamp).toLocaleDateString()}{' '}
                              {new Date(e.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-3 px-2 font-terminal-num font-semibold text-slate-100">
                              {e.symbol}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span
                                className={`inline-flex items-center gap-0.5 font-terminal-num font-bold mr-1 ${
                                  isLong ? 'text-[var(--bullish)]' : 'text-[var(--bearish)]'
                                }`}
                              >
                                {isLong ? (
                                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
                                ) : (
                                  <ArrowDownRight className="w-3.5 h-3.5" aria-hidden />
                                )}
                                {e.direction}
                              </span>
                              <span
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                                  isAccepted
                                    ? 'bg-[var(--bullish)]/15 text-[var(--bullish)]'
                                    : 'bg-[var(--bearish)]/15 text-[var(--bearish)]'
                                }`}
                              >
                                {isAccepted ? (
                                  <ThumbsUp className="w-2.5 h-2.5" aria-hidden />
                                ) : (
                                  <ThumbsDown className="w-2.5 h-2.5" aria-hidden />
                                )}
                                {e.action}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <div className="flex flex-col items-center">
                                <span className="font-terminal-num font-bold text-slate-100">
                                  {e.score}/100
                                </span>
                                <Pill tier={e.readinessTier} size="xs" />
                              </div>
                            </td>
                            <td className="py-3 px-2 max-w-xs">
                              <div className="font-medium text-slate-200 truncate">
                                "{e.userReason}"
                              </div>
                              <div className="text-slate-400 text-[11px] truncate">
                                {e.evidenceSummary.join(' • ')}
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span
                                className={`px-2 py-0.5 rounded font-terminal-num text-[11px] font-semibold uppercase ${
                                  e.outcomeStatus === 'TARGET_HIT'
                                    ? 'bg-[var(--bullish)]/20 text-[var(--bullish)] border border-[var(--bullish)]'
                                    : e.outcomeStatus === 'STOP_HIT'
                                    ? 'bg-[var(--bearish)]/20 text-[var(--bearish)] border border-[var(--bearish)]'
                                    : e.outcomeStatus === 'EXPIRED'
                                    ? 'bg-slate-700 text-slate-300'
                                    : 'bg-[var(--accent)]/15 text-[var(--accent)]'
                                }`}
                              >
                                {e.outcomeStatus}
                                {e.realizedR !== undefined && (
                                  <span className="ml-1">({e.realizedR}R)</span>
                                )}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              {e.outcomeStatus === 'OPEN' && isAccepted ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateOutcome(e.id, 'TARGET_HIT', 2.2)
                                    }
                                    title="Mark Target Hit (+2.2R)"
                                    className="p-1 rounded bg-[var(--bullish)]/15 hover:bg-[var(--bullish)]/30 text-[var(--bullish)] cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateOutcome(e.id, 'STOP_HIT', -1.0)
                                    }
                                    title="Mark Stop Hit (-1.0R)"
                                    className="p-1 rounded bg-[var(--bearish)]/15 hover:bg-[var(--bearish)]/30 text-[var(--bearish)] cursor-pointer"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(e.id)}
                                  title="Delete entry"
                                  className="p-1 rounded hover:bg-[rgba(36,26,61,0.55)] text-slate-400 hover:text-[var(--bearish)] cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* Calibration Report View (REQ-072) */
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
              <div className="bg-[rgba(36,26,61,0.55)] border border-[var(--border)] rounded p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="terminal-text-sm font-bold text-slate-100 uppercase">
                      Calibration Curve: Predicted vs. Realized Outcomes (REQ-072)
                    </h3>
                    <p className="terminal-text-xs text-slate-400">
                      Compares model expected success probability against actual win rate
                      of accepted paper trades across readiness tiers.
                    </p>
                  </div>
                  <span className="font-terminal-num terminal-text-xs text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-1 rounded border border-[var(--accent)]/30">
                    4 REGIMES CALIBRATED
                  </span>
                </div>

                {/* Recharts Bar/Line Comparison Chart */}
                <div className="h-64 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={calibrationBuckets}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="tier" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" unit="%" domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(13,10,28,0.72)',
                          borderColor: 'var(--border)',
                          color: '#f8fafc',
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="predictedProbAvg"
                        name="Predicted Prob (%)"
                        fill="var(--accent)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="realizedWinRatePct"
                        name="Realized Win Rate (%)"
                        fill="var(--bullish)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Calibration Detail Breakdown Table */}
              <div className="bg-[rgba(36,26,61,0.55)] border border-[var(--border)] rounded overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[rgba(26,18,48,0.65)] border-b border-[var(--border)] terminal-text-xs text-slate-400 font-semibold uppercase">
                      <th className="py-2.5 px-4">Readiness Tier</th>
                      <th className="py-2.5 px-3 text-right">Model Expected Prob</th>
                      <th className="py-2.5 px-3 text-right">Realized Win Rate</th>
                      <th className="py-2.5 px-3 text-right">Closed Trades</th>
                      <th className="py-2.5 px-3 text-right">Winning Trades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] terminal-text-xs font-terminal-num">
                    {calibrationBuckets.map((b) => (
                      <tr key={b.tier} className="hover:bg-[rgba(55,45,90,0.55)]/40">
                        <td className="py-3 px-4 font-bold text-slate-100">
                          <Pill tier={b.tier} />
                        </td>
                        <td className="py-3 px-3 text-right text-[var(--accent)]">
                          {b.predictedProbAvg.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-[var(--bullish)]">
                          {b.realizedWinRatePct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300">
                          {b.totalTrades}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300">
                          {b.winningTrades}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
