/**
 * APEX-NEXT Backtest / Replay Mode Modal (REQ-075)
 * Runs the advanced scannerCore replay engine against historical OHLCV using PROXY_REPLAY inputs.
 * Live candidate ranking still uses scoreCandidate via the Canonical Decision Adapter.
 */

import React, { useEffect, useState } from 'react';
import { BacktestResult, TradeDirection } from '../types';
import { Pill, StatusBadge } from './primitives';
import { History, Play, RefreshCw, X } from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useDialogA11y } from '../lib/useDialogA11y';

export interface BacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BacktestModal: React.FC<BacktestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [symbol, setSymbol] = useState<string>('BTC-USDT');
  const [direction, setDirection] = useState<TradeDirection>('LONG');
  const [lookback, setLookback] = useState<number>(60);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const dialogRef = useDialogA11y({ isOpen, onClose });

  const handleRunBacktest = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/market/backtest?symbol=${symbol}&direction=${direction}&lookback=${lookback}`
      );
      if (res.ok) {
        const data: BacktestResult = await res.json();
        setResult(data);
      }
    } catch (e) {
      console.error('Backtest error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !result && !loading) {
      handleRunBacktest();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backtest-modal-title"
        className="bg-[rgba(13,10,28,0.85)] border border-[var(--border)] rounded-lg backdrop-blur-[20px] w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[rgba(26,18,48,0.65)] border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-[var(--accent)]" aria-hidden />
            <h2 id="backtest-modal-title" className="terminal-text-base font-bold text-slate-100 uppercase tracking-wide">
              Historical Backtest & Replay Mode (REQ-075)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[rgba(36,26,61,0.55)] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close backtest"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {/* Controls Strip */}
        <div className="p-3 bg-[rgba(36,26,61,0.55)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <label className="block terminal-text-xs text-slate-400 uppercase mb-0.5">
                Symbol
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-[rgba(13,10,28,0.72)] border border-[var(--border)] rounded px-2 py-1 text-slate-100 font-terminal-num terminal-text-xs outline-none"
              >
                <option value="BTC-USDT">BTC-USDT</option>
                <option value="ETH-USDT">ETH-USDT</option>
                <option value="SOL-USDT">SOL-USDT</option>
                <option value="DOGE-USDT">DOGE-USDT</option>
              </select>
            </div>
            <div>
              <label className="block terminal-text-xs text-slate-400 uppercase mb-0.5">
                Direction
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
                className="bg-[rgba(13,10,28,0.72)] border border-[var(--border)] rounded px-2 py-1 text-slate-100 font-terminal-num terminal-text-xs outline-none"
              >
                <option value="LONG">LONG SETUP</option>
                <option value="SHORT">SHORT SETUP</option>
              </select>
            </div>
            <div>
              <label className="block terminal-text-xs text-slate-400 uppercase mb-0.5">
                Lookback (Scans)
              </label>
              <select
                value={lookback}
                onChange={(e) => setLookback(parseInt(e.target.value, 10))}
                className="bg-[rgba(13,10,28,0.72)] border border-[var(--border)] rounded px-2 py-1 text-slate-100 font-terminal-num terminal-text-xs outline-none"
              >
                <option value={30}>30 Scans (~120h)</option>
                <option value={60}>60 Scans (~240h)</option>
                <option value={120}>120 Scans (~480h)</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRunBacktest}
            disabled={loading}
            className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black font-terminal-num font-bold rounded transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>REPLAY HISTORICAL SCANS</span>
          </button>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {loading || !result ? (
            <div className="py-16 text-center text-slate-400 terminal-text-sm">
              Replaying historical OHLCV data through scoring & level engine...
            </div>
          ) : (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[rgba(36,26,61,0.55)] p-3 rounded border border-[var(--border)]">
                  <div className="terminal-text-xs text-slate-400 uppercase">
                    Scans Replayed
                  </div>
                  <div className="font-terminal-num terminal-text-xl font-bold text-slate-100">
                    {result.simulatedScans} SCANS
                  </div>
                </div>
                <div className="bg-[rgba(36,26,61,0.55)] p-3 rounded border border-[var(--border)]">
                  <div className="terminal-text-xs text-slate-400 uppercase">
                    Confirmed/Watchlist Signals
                  </div>
                  <div className="font-terminal-num terminal-text-xl font-bold text-[var(--accent)]">
                    {result.flaggedSignals} SIGNALS
                  </div>
                </div>
                <div className="bg-[rgba(36,26,61,0.55)] p-3 rounded border border-[var(--border)]">
                  <div className="terminal-text-xs text-slate-400 uppercase">
                    Historical Win Rate
                  </div>
                  <div className="font-terminal-num terminal-text-xl font-bold text-[var(--bullish)]">
                    {result.historicalWinRatePct}%
                  </div>
                </div>
                <div className="bg-[rgba(36,26,61,0.55)] p-3 rounded border border-[var(--border)]">
                  <div className="terminal-text-xs text-slate-400 uppercase">
                    Avg Realized R-Multiple
                  </div>
                  <div className="font-terminal-num terminal-text-xl font-bold text-[var(--bullish)]">
                    +{result.avgRMultipleRealized} R
                  </div>
                </div>
              </div>

              {/* Score Trajectory over Replay Horizon */}
              <div className="bg-[rgba(36,26,61,0.55)] p-4 rounded border border-[var(--border)]">
                <div className="terminal-text-xs font-semibold text-slate-300 uppercase mb-3">
                  Historical Score Trajectory & Readiness Tier Overlay
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.timeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="timestamp"
                        stroke="#94a3b8"
                        tickFormatter={(v) =>
                          new Date(v).toLocaleTimeString([], { hour: '2-digit' })
                        }
                      />
                      <YAxis stroke="#94a3b8" domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(13,10,28,0.72)',
                          borderColor: 'var(--border)',
                          color: '#f8fafc',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        dot={false}
                        name="Scanner Score"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Decision Breakdown */}
              <div className="bg-[rgba(36,26,61,0.55)] p-3 rounded border border-[var(--border)]">
                <div className="terminal-text-xs font-semibold text-slate-300 uppercase mb-2">
                  Decision Breakdown across Lookback
                </div>
                <div className="flex flex-wrap items-center gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Pill label="ACCEPTED" color="bullish" size="xs" />
                    <span className="font-terminal-num font-bold text-slate-100">
                      {result.acceptedCandidates}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill label="REJECTED" color="bearish" size="xs" />
                    <span className="font-terminal-num font-bold text-slate-100">
                      {result.rejectedCandidates}
                    </span>
                  </div>
                </div>
                {Object.keys(result.rejectionCounts).length > 0 && (
                  <>
                    <div className="terminal-text-xs text-slate-400 uppercase mb-1">
                      Rejection Reasons
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {Object.entries(result.rejectionCounts).map(([reasonCode, count]) => (
                        <div key={reasonCode} className="flex items-center gap-1.5">
                          <span className="terminal-text-xs text-slate-400">{reasonCode}</span>
                          <span className="font-terminal-num font-semibold text-slate-200">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
