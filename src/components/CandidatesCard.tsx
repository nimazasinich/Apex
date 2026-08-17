/**
 * APEX-NEXT Two-Directional Candidates Scanner Card (REQ-013..018)
 * Hero bento tile — Long | Short equal columns, readiness tiers, guards.
 */

import React from 'react';
import { CandidateScore, DataState } from '../types';
import { EmptyState, Pill, SectionCard, StatusBadge } from './primitives';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react';

export interface CandidatesCardProps {
  longCandidates: CandidateScore[];
  shortCandidates: CandidateScore[];
  dataState: DataState;
  scanTimestamp: number;
  activeCandidateCount: number;
  isScanning?: boolean;
  onRunScan: () => void;
  onSelectSymbol: (symbol: string) => void;
  selectedSymbol?: string;
}

export const CandidatesCard: React.FC<CandidatesCardProps> = ({
  longCandidates,
  shortCandidates,
  dataState,
  scanTimestamp,
  activeCandidateCount,
  isScanning = false,
  onRunScan,
  onSelectSymbol,
  selectedSymbol,
}) => {
  const hasNoData = longCandidates.length === 0 && shortCandidates.length === 0;

  return (
    <SectionCard
      title="Two-Directional Scanner"
      subtitle="Real-time perpetual opportunities"
      icon={<ScanSearch className="w-4 h-4" aria-hidden />}
      variant="hero"
      headerRight={
        <div className="flex items-center gap-2">
          <StatusBadge state={dataState} showLabel={false} />
          <button
            type="button"
            onClick={onRunScan}
            disabled={isScanning}
            className="px-2.5 py-1 bg-[var(--accent)]/20 hover:bg-[var(--accent)]/30 text-[var(--accent)] border border-[var(--accent)]/50 rounded-full terminal-text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {isScanning ? 'Scanning…' : 'Run scan'}
          </button>
        </div>
      }
      noPadding
      className="h-full flex flex-col"
    >
      <div className="px-3 py-1 border-b border-[var(--border-subtle)] flex items-center justify-between terminal-text-xs text-[var(--neutral-subtle)]">
        <div className="flex items-center gap-3">
          <span>
            State{' '}
            <strong className="text-slate-200 font-terminal-num">
              {isScanning ? 'Scanning' : 'Idle'}
            </strong>
          </span>
          <span>
            Active{' '}
            <strong className="text-[var(--accent)] font-terminal-num">
              {activeCandidateCount}
            </strong>
          </span>
        </div>
        <span className="font-terminal-num text-slate-300">
          {scanTimestamp > 0
            ? new Date(scanTimestamp).toLocaleTimeString()
            : 'Never scanned'}
        </span>
      </div>

      {hasNoData ? (
        <EmptyState
          title="No opportunities yet"
          description="Run a scan to evaluate perpetuals against momentum, order flow, and squeeze guards."
          actionLabel="Run two-directional scan"
          onAction={onRunScan}
          className="flex-1"
        />
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)] overflow-hidden">
          <div className="flex flex-col overflow-hidden">
            <div className="px-3 py-1 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bullish-bg)]/40">
              <div className="flex items-center gap-1.5 text-[var(--bullish)] font-semibold terminal-text-xs">
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
                <span>Long setups</span>
              </div>
              <span className="label-meta">{longCandidates.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse table-dense">
                <thead>
                  <tr className="border-b border-[var(--border)] label-meta">
                    <th className="pl-3 pr-2">Symbol</th>
                    <th className="px-2 text-right">Score</th>
                    <th className="px-2 text-center">Tier</th>
                    <th className="pl-2 pr-3 text-right">Guard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {longCandidates.map((c) => (
                    <CandidateRow
                      key={`long-${c.symbol}`}
                      candidate={c}
                      onSelectSymbol={onSelectSymbol}
                      isSelected={c.symbol === selectedSymbol}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden">
            <div className="px-3 py-1 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bearish-bg)]/40">
              <div className="flex items-center gap-1.5 text-[var(--bearish)] font-semibold terminal-text-xs">
                <ArrowDownRight className="w-3.5 h-3.5" aria-hidden />
                <span>Short setups</span>
              </div>
              <span className="label-meta">{shortCandidates.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse table-dense">
                <thead>
                  <tr className="border-b border-[var(--border)] label-meta">
                    <th className="pl-3 pr-2">Symbol</th>
                    <th className="px-2 text-right">Score</th>
                    <th className="px-2 text-center">Tier</th>
                    <th className="pl-2 pr-3 text-right">Guard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {shortCandidates.map((c) => (
                    <CandidateRow
                      key={`short-${c.symbol}`}
                      candidate={c}
                      onSelectSymbol={onSelectSymbol}
                      isSelected={c.symbol === selectedSymbol}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

interface CandidateRowProps {
  candidate: CandidateScore;
  onSelectSymbol: (symbol: string) => void;
  isSelected: boolean;
}

const CandidateRow: React.FC<CandidateRowProps> = ({
  candidate,
  onSelectSymbol,
  isSelected,
}) => {
  const { symbol, score, readinessTier, guardPass, guardReasons } = candidate;
  const decisionQuality = candidate.canonicalDecision?.confidence;
  const completeness = candidate.featureCompletenessPct ?? candidate.canonicalDecision?.featureCompletenessPct;
  const scoreTitle = [
    `Ranking score: ${score}`,
    decisionQuality != null ? `Decision quality: ${(decisionQuality * 100).toFixed(0)}% (not win probability)` : null,
    completeness != null ? `Feature completeness: ${completeness}%` : null,
    candidate.timeframeConfluenceState ? `15m/1h: ${candidate.timeframeConfluenceState}` : null,
    candidate.shadowDecision ? `Advanced shadow: ${candidate.shadowDecision.status} · ${candidate.shadowDecision.reasonCode}` : null,
    candidate.shadowDecision?.smcAvailability ? `SMC: ${candidate.shadowDecision.smcAvailability}` : null,
  ].filter(Boolean).join('\n');

  return (
    <tr
      onDoubleClick={() => onSelectSymbol(symbol)}
      onClick={() => onSelectSymbol(symbol)}
      className={`hover:bg-white/5 cursor-pointer transition-colors ${
        isSelected ? 'bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]' : ''
      }`}
    >
      <td className="pl-3 pr-2 font-semibold text-slate-100 font-terminal-num symbol-cell" title={symbol}>
        {symbol}
      </td>
      <td className="px-2 text-right font-terminal-num font-bold text-slate-100" title={scoreTitle}>{score}</td>
      <td className="px-2 text-center">
        <Pill tier={readinessTier} size="xs" />
      </td>
      <td className="pl-2 pr-3 text-right">
        {guardPass ? (
          <span className="inline-flex items-center gap-0.5 text-[var(--bullish)] font-terminal-num font-semibold">
            <CheckCircle2 className="w-3 h-3" aria-hidden />
            Pass
          </span>
        ) : (
          <div className="relative group inline-flex items-center justify-end">
            <span className="inline-flex items-center gap-0.5 text-[var(--warning)] font-terminal-num font-semibold cursor-help">
              <ShieldAlert className="w-3 h-3 text-[var(--warning)]" aria-hidden />
              Flag
            </span>
            <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block z-50 w-56 p-2 glass-panel text-left">
              <div className="label-meta text-[var(--warning)] mb-1">Guard reasons</div>
              <ul className="terminal-text-xs text-slate-300 list-disc pl-3 space-y-0.5">
                {(guardReasons || []).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
};
