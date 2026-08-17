/**
 * APEX-NEXT Operations & System Health Diagnostics Page (REQ-076)
 * Real diagnostics view: uptime of data sources, recent error log, cache hit rates, active candidate count.
 */

import React, { useEffect, useState } from 'react';
import { SystemHealthReport } from '../types';
import { StatusBadge } from './primitives';
import { Activity, RefreshCw, Server, ShieldCheck, X } from 'lucide-react';
import { useDialogA11y } from '../lib/useDialogA11y';

export interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const dialogRef = useDialogA11y({ isOpen, onClose });

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/health');
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (e) {
      console.error('Failed to fetch health report:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatUptime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${hours}h ${mins}m ${s}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="health-modal-title"
        className="bg-[rgba(13,10,28,0.85)] border border-[var(--border)] rounded-lg backdrop-blur-[20px] w-full max-w-3xl h-[75vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[rgba(26,18,48,0.65)] border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-[var(--accent)]" aria-hidden />
            <h2 id="health-modal-title" className="terminal-text-base font-bold text-slate-100 uppercase tracking-wide">
              Operations & System Health Diagnostics (REQ-076)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchHealth}
              disabled={loading}
              className="p-1 rounded hover:bg-[rgba(36,26,61,0.55)] text-slate-400 hover:text-[var(--accent)] transition-colors cursor-pointer"
              title="Refresh Diagnostics"
              aria-label="Refresh diagnostics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[rgba(36,26,61,0.55)] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              aria-label="Close system health"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Diagnostics Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {!report ? (
            <div className="py-12 text-center text-slate-400 terminal-text-sm">
              Loading system health report...
            </div>
          ) : (
            <>
              {/* Data Feed Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[rgba(36,26,61,0.55)] p-3 rounded border border-[var(--border)] flex items-center justify-between">
                  <div>
                    <div className="terminal-text-xs text-slate-400 uppercase">
                      KuCoin Futures Feed
                    </div>
                    <div className="terminal-text-xs text-slate-300 mt-1">
                      Primary Public REST
                    </div>
                  </div>
                  <StatusBadge state={report.kucoinStatus} />
                </div>
                <div className="bg-[rgba(36,26,61,0.55)] p-3 rounded border border-[var(--border)] flex items-center justify-between">
                  <div>
                    <div className="terminal-text-xs text-slate-400 uppercase">
                      Binance Verification
                    </div>
                    <div className="terminal-text-xs text-slate-300 mt-1">
                      Secondary Reference
                    </div>
                  </div>
                  <StatusBadge state={report.binanceStatus} />
                </div>
                <div className="bg-[rgba(36,26,61,0.55)] p-3 rounded border border-[var(--border)] flex items-center justify-between">
                  <div>
                    <div className="terminal-text-xs text-slate-400 uppercase">
                      Sentiment Composite
                    </div>
                    <div className="terminal-text-xs text-slate-300 mt-1">
                      Exchange-Derived
                    </div>
                  </div>
                  <StatusBadge state={report.sentimentStatus} />
                </div>
              </div>

              {/* Cache & Uptime Performance */}
              <div className="bg-[rgba(36,26,61,0.55)] border border-[var(--border)] rounded p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="terminal-text-xs text-slate-400 uppercase">
                    Cache Hit Rate
                  </div>
                  <div className="font-terminal-num terminal-text-xl font-bold text-[var(--accent)]">
                    {report.cacheHitRatePct}%
                  </div>
                  <div className="terminal-text-xs text-slate-400 font-terminal-num">
                    {report.cacheHits} / {report.cacheTotalQueries} Hits
                  </div>
                </div>
                <div>
                  <div className="terminal-text-xs text-slate-400 uppercase">
                    Terminal Uptime
                  </div>
                  <div className="font-terminal-num terminal-text-xl font-bold text-slate-100">
                    {formatUptime(report.uptimeSeconds)}
                  </div>
                  <div className="terminal-text-xs text-slate-400">
                    Server Session
                  </div>
                </div>
                <div>
                  <div className="terminal-text-xs text-slate-400 uppercase">
                    Active Candidates
                  </div>
                  <div className="font-terminal-num terminal-text-xl font-bold text-[var(--bullish)]">
                    {report.activeCandidateCount}
                  </div>
                  <div className="terminal-text-xs text-slate-400">
                    Passed Safety Guard
                  </div>
                </div>
                <div>
                  <div className="terminal-text-xs text-slate-400 uppercase">
                    Last Scan Time
                  </div>
                  <div className="font-terminal-num terminal-text-sm font-semibold text-slate-100">
                    {new Date(report.lastScanTimestamp).toLocaleTimeString()}
                  </div>
                  <div className="terminal-text-xs text-slate-400">
                    Real-time Scan
                  </div>
                </div>
              </div>

              {/* System Error & Warning Log */}
              <div className="bg-[rgba(36,26,61,0.55)] border border-[var(--border)] rounded p-3">
                <div className="terminal-text-xs font-semibold text-slate-300 uppercase mb-2 flex items-center justify-between">
                  <span>Recent Diagnostic Event Log</span>
                  <span className="font-terminal-num text-slate-400">
                    {report.lastErrorLog.length} EVENTS
                  </span>
                </div>
                {report.lastErrorLog.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 terminal-text-xs flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[var(--bullish)]" />
                    <span>All feeds and internal modules reporting zero errors.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5 font-terminal-num terminal-text-xs max-h-48 overflow-y-auto custom-scrollbar">
                    {report.lastErrorLog.map((err, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-[rgba(13,10,28,0.72)] px-2.5 py-1.5 rounded border border-[var(--border)]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--warning)]">[WARNING]</span>
                          <span className="text-slate-300 font-semibold">
                            {err.source}:
                          </span>
                          <span className="text-slate-400">{err.message}</span>
                        </div>
                        <span className="text-slate-500">
                          {new Date(err.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
