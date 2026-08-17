/**
 * APEX-NEXT Symbol Detail Side Drawer & Sizing Calculator (REQ-020 .. REQ-025, REQ-040 .. REQ-046, REQ-070, REQ-073)
 * Glass drawer with vertical tab strip: Detail | Sizing (REQ-052, REQ-053)
 */

import React, { useEffect, useState } from 'react';
import {
  CandidateScore,
  DecisionJournalEntry,
  DerivedLevels,
  SizingConfig,
  SymbolTicker,
  TradeDirection,
} from '../types';
import { calculatePositionSizing } from '../lib/sizing';
import { ConfidenceRing, Pill, StatusBadge } from './primitives';
import { RiskRewardSlider } from './RiskRewardSlider';
import { useDialogA11y } from '../lib/useDialogA11y';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Calculator,
  CheckCircle2,
  FileSearch,
  HelpCircle,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  X,
  XCircle,
} from 'lucide-react';

export interface SymbolDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ticker: SymbolTicker | null;
  levels: DerivedLevels | null;
  scoreLong: CandidateScore | null;
  scoreShort: CandidateScore | null;
  onLogToJournal: (entry: DecisionJournalEntry) => void;
  isLoading?: boolean;
}

type DrawerTab = 'detail' | 'sizing';

export const SymbolDetailDrawer: React.FC<SymbolDetailDrawerProps> = ({
  isOpen,
  onClose,
  ticker,
  levels,
  scoreLong,
  scoreShort,
  onLogToJournal,
  isLoading = false,
}) => {
  const [direction, setDirection] = useState<TradeDirection>('LONG');
  const [activeTab, setActiveTab] = useState<DrawerTab>('detail');

  const [riskMode, setRiskMode] = useState<'USD' | 'PCT'>('USD');
  const [riskValue, setRiskValue] = useState<number>(100);
  const [accountBalanceUsd, setAccountBalanceUsd] = useState<number>(10000);
  const [leverage, setLeverage] = useState<number>(5);
  const [customEntry, setCustomEntry] = useState<number>(0);
  const [customStop, setCustomStop] = useState<number>(0);
  const [customTake, setCustomTake] = useState<number>(0);
  const [userProbOverride, setUserProbOverride] = useState<string>('');
  const [userReason, setUserReason] = useState<string>('');
  const [journalAction, setJournalAction] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [journalSuccessMsg, setJournalSuccessMsg] = useState<boolean>(false);
  const dialogRef = useDialogA11y({ isOpen, onClose });

  useEffect(() => {
    if (levels) {
      setCustomEntry(levels.entry);
      if (direction === 'LONG') {
        setCustomStop(levels.supports[0]);
        setCustomTake(levels.resistances[0]);
      } else {
        setCustomStop(levels.resistances[0]);
        setCustomTake(levels.supports[0]);
      }
    } else if (ticker) {
      setCustomEntry(ticker.lastPrice);
      setCustomStop(Number((ticker.lastPrice * 0.985).toPrecision(6)));
      setCustomTake(Number((ticker.lastPrice * 1.025).toPrecision(6)));
    }
  }, [levels, ticker, direction]);

  if (!isOpen) return null;

  const activeScore = direction === 'LONG' ? scoreLong : scoreShort;
  const modelProb = activeScore ? activeScore.score : 70;
  const overrideNum = userProbOverride ? parseFloat(userProbOverride) : null;

  const sizingConfig: SizingConfig = {
    accountBalanceUsd,
    riskMode,
    riskValue,
    leverage,
    entryPrice: customEntry,
    stopLossPrice: customStop,
    takeProfitPrice: customTake,
    direction,
    successProbModel: modelProb,
    successProbUserOverride: overrideNum,
  };

  const sizingResult = calculatePositionSizing(sizingConfig);

  const handleSaveToJournal = () => {
    if (!ticker) return;
    const entry: DecisionJournalEntry = {
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      symbol: ticker.symbol,
      direction,
      action: journalAction,
      score: activeScore ? activeScore.score : 0,
      readinessTier: activeScore ? activeScore.readinessTier : 'WATCHLIST',
      entryPrice: customEntry,
      stopLossPrice: customStop,
      takeProfitPrice: customTake,
      userReason: userReason.trim() || `${direction} setup from level ladder`,
      evidenceSummary: levels
        ? levels.evidenceList.map((e) => `${e.label}: ${e.detail}`)
        : ['Manual entry'],
      outcomeStatus: 'OPEN',
    };
    onLogToJournal(entry);
    setJournalSuccessMsg(true);
    setTimeout(() => setJournalSuccessMsg(false), 2500);
  };

  const inputClass =
    'w-full glass-inset rounded px-2.5 py-1 text-slate-100 font-terminal-num terminal-text-sm focus:border-[var(--accent)] outline-none';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="symbol-detail-title"
      className="inspector-drawer fixed inset-y-0 z-50 glass-panel !rounded-none border-y-0 border-r-0 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 glass-panel-header flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 id="symbol-detail-title" className="font-display terminal-text-lg font-bold text-slate-100">
            {ticker ? ticker.symbol : 'SYMBOL DETAIL'}
          </h2>
          {ticker && <StatusBadge state={ticker.dataState} />}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex glass-inset p-0.5">
            <button
              type="button"
              onClick={() => setDirection('LONG')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded terminal-text-xs font-semibold tracking-wide transition-colors ${
                direction === 'LONG'
                  ? 'bg-[var(--bullish-bg)] text-[var(--bullish)] border border-[var(--bullish)]/40'
                  : 'text-[var(--neutral-subtle)] hover:text-slate-200'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
              LONG
            </button>
            <button
              type="button"
              onClick={() => setDirection('SHORT')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded terminal-text-xs font-semibold tracking-wide transition-colors ${
                direction === 'SHORT'
                  ? 'bg-[var(--bearish-bg)] text-[var(--bearish)] border border-[var(--bearish)]/40'
                  : 'text-[var(--neutral-subtle)] hover:text-slate-200'
              }`}
            >
              <ArrowDownRight className="w-3.5 h-3.5" aria-hidden />
              SHORT
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-[var(--neutral-subtle)] hover:text-slate-200 transition-colors cursor-pointer"
            title="Close Drawer (Esc)"
            aria-label="Close inspector"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Body: vertical tabs + content */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Vertical tab strip (REQ-053) */}
        <nav className="w-16 shrink-0 border-r border-[var(--border-subtle)] flex flex-col items-stretch py-2 gap-1 bg-black/20">
          <VerticalTab
            icon={<FileSearch className="w-4 h-4" />}
            label="Detail"
            active={activeTab === 'detail'}
            onClick={() => setActiveTab('detail')}
          />
          <VerticalTab
            icon={<Calculator className="w-4 h-4" />}
            label="Sizing"
            active={activeTab === 'sizing'}
            onClick={() => setActiveTab('sizing')}
          />
        </nav>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {isLoading || !ticker || !levels ? (
            <div className="py-12 text-center text-[var(--neutral-subtle)] terminal-text-sm">
              Loading symbol level structure and order book...
            </div>
          ) : activeTab === 'detail' ? (
            <>
              {/* Price + confluence */}
              <div className="glass-inset p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="terminal-text-xs text-[var(--neutral-subtle)] uppercase">
                    Last Mark Price
                  </div>
                  <div className="font-terminal-num terminal-text-2xl font-bold text-slate-100">
                    ${ticker.lastPrice >= 10 ? ticker.lastPrice.toFixed(2) : ticker.lastPrice.toPrecision(6)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {activeScore && (
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded border terminal-text-xs font-semibold ${
                        activeScore.timeframeConfluence
                          ? 'bg-[var(--bullish-bg)] text-[var(--bullish)] border-[var(--bullish)]/40'
                          : 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/40'
                      }`}
                    >
                      {activeScore.timeframeConfluence ? (
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
                      )}
                      <span>
                        {activeScore.timeframeConfluence
                          ? '15m & 1h Confluence: ALIGNED'
                          : '15m & 1h CONFLICT'}
                      </span>
                    </div>
                  )}
                  {activeScore && <Pill tier={activeScore.readinessTier} />}
                </div>
              </div>

              {/* Price ladder */}
              <div className="glass-inset p-3">
                <div className="flex items-center justify-between mb-3 border-b border-[var(--border-subtle)] pb-2">
                  <span className="font-display terminal-text-xs font-semibold text-slate-300 tracking-wide">
                    Vertical Price Ladder
                  </span>
                  <span className="terminal-text-xs text-[var(--neutral-subtle)] font-terminal-num">
                    METHOD: {levels.method.replace('_', ' ')}
                  </span>
                </div>
                <div className="space-y-2 font-terminal-num">
                  {[...levels.resistances].reverse().map((resPrice, idx) => {
                    const levelNum = 3 - idx;
                    const distPct = (((resPrice - levels.entry) / levels.entry) * 100).toFixed(2);
                    return (
                      <div
                        key={`r-${levelNum}`}
                        className="flex items-center justify-between px-3 py-1.5 rounded bg-[var(--bearish-bg)] border border-[var(--bearish)]/30 text-[var(--bearish)]"
                      >
                        <span className="inline-flex items-center gap-1 terminal-text-xs font-semibold">
                          <ArrowDownRight className="w-3 h-3" aria-hidden />
                          RESISTANCE R{levelNum}
                        </span>
                        <span className="terminal-text-sm font-bold">${resPrice}</span>
                        <span className="terminal-text-xs opacity-80">+{distPct}%</span>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between px-3 py-2 rounded bg-[var(--accent-glow)] border-2 border-[var(--accent)] text-slate-100 my-2">
                    <span className="terminal-text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                      DERIVED ENTRY
                    </span>
                    <span className="terminal-text-lg font-bold text-[var(--accent)]">
                      ${levels.entry}
                    </span>
                    <span className="terminal-text-xs text-slate-300">
                      ATR(14): ${levels.atr14}
                    </span>
                  </div>

                  {levels.supports.map((supPrice, idx) => {
                    const levelNum = idx + 1;
                    const distPct = (((levels.entry - supPrice) / levels.entry) * 100).toFixed(2);
                    return (
                      <div
                        key={`s-${levelNum}`}
                        className="flex items-center justify-between px-3 py-1.5 rounded bg-[var(--bullish-bg)] border border-[var(--bullish)]/30 text-[var(--bullish)]"
                      >
                        <span className="inline-flex items-center gap-1 terminal-text-xs font-semibold">
                          <ArrowUpRight className="w-3 h-3" aria-hidden />
                          SUPPORT S{levelNum}
                        </span>
                        <span className="terminal-text-sm font-bold">${supPrice}</span>
                        <span className="terminal-text-xs opacity-80">-{distPct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Evidence */}
              <div className="glass-inset p-3">
                <div className="font-display terminal-text-xs font-semibold text-slate-300 tracking-wide mb-2.5">
                  Setup Confidence & Evidence
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <ConfidenceRing score={levels.confidenceScore} size={64} label="SETUP CONF" />
                  <div className="flex-1 space-y-1.5 w-full">
                    {levels.evidenceList.map((ev, i) => {
                      let tagClass = 'bg-slate-800/60 text-slate-300 border-slate-600/50';
                      let tagLabel = 'NEUTRAL';
                      let TagIcon: React.ComponentType<{ className?: string }> = HelpCircle;
                      if (ev.tag === 'supports') {
                        tagClass = 'bg-[var(--bullish-bg)] text-[var(--bullish)] border-[var(--bullish)]/40';
                        tagLabel = 'SUPPORTS';
                        TagIcon = CheckCircle2;
                      } else if (ev.tag === 'contradicts') {
                        tagClass = 'bg-[var(--bearish-bg)] text-[var(--bearish)] border-[var(--bearish)]/40';
                        tagLabel = 'CONTRADICTS';
                        TagIcon = XCircle;
                      }

                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between glass-inset px-2.5 py-1"
                        >
                          <div className="flex flex-col pr-2">
                            <span className="terminal-text-xs font-semibold text-slate-200">
                              {ev.label}
                            </span>
                            <span className="terminal-text-xs text-[var(--neutral-subtle)]">
                              {ev.detail}
                            </span>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 terminal-text-xs font-terminal-num px-1.5 py-0.5 rounded border uppercase shrink-0 ${tagClass}`}
                          >
                            <TagIcon className="w-3 h-3" aria-hidden />
                            {tagLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Journal logging on Detail tab */}
              <div className="glass-inset p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="terminal-text-xs font-semibold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[var(--accent)]" aria-hidden />
                    Decision Journal
                  </span>
                  <div className="inline-flex glass-inset p-0.5">
                    <button
                      type="button"
                      onClick={() => setJournalAction('ACCEPTED')}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded terminal-text-xs font-semibold transition-colors ${
                        journalAction === 'ACCEPTED'
                          ? 'bg-[var(--bullish-bg)] text-[var(--bullish)]'
                          : 'text-[var(--neutral-subtle)] hover:text-slate-200'
                      }`}
                    >
                      <ThumbsUp className="w-3 h-3" aria-hidden />
                      ACCEPT
                    </button>
                    <button
                      type="button"
                      onClick={() => setJournalAction('REJECTED')}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded terminal-text-xs font-semibold transition-colors ${
                        journalAction === 'REJECTED'
                          ? 'bg-[var(--bearish-bg)] text-[var(--bearish)]'
                          : 'text-[var(--neutral-subtle)] hover:text-slate-200'
                      }`}
                    >
                      <ThumbsDown className="w-3 h-3" aria-hidden />
                      REJECT
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Operator reason for taking or rejecting this trade..."
                  value={userReason}
                  onChange={(e) => setUserReason(e.target.value)}
                  className={`${inputClass} terminal-text-xs`}
                />

                <button
                  type="button"
                  onClick={handleSaveToJournal}
                  className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-terminal-num font-bold rounded transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <BookOpen className="w-4 h-4" />
                  SAVE TO JOURNAL ({journalAction})
                </button>

                {journalSuccessMsg && (
                  <div className="px-3 py-1.5 bg-[var(--bullish-bg)] border border-[var(--bullish)] rounded text-[var(--bullish)] terminal-text-xs font-semibold text-center">
                    Setup saved to Decision Journal!
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Sizing tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <span className="font-display terminal-text-xs font-semibold text-slate-200 tracking-wide">
                  Position Sizing & Risk
                </span>
                <span className="terminal-text-xs text-[var(--accent)] font-terminal-num">
                  Paper only
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block terminal-text-xs text-[var(--neutral-subtle)] uppercase mb-1">
                    Account Balance ($)
                  </label>
                  <input
                    type="number"
                    value={accountBalanceUsd}
                    onChange={(e) => setAccountBalanceUsd(parseFloat(e.target.value) || 0)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="terminal-text-xs text-[var(--neutral-subtle)] uppercase">
                      Risk Amount ({riskMode})
                    </label>
                    <button
                      type="button"
                      onClick={() => setRiskMode(riskMode === 'USD' ? 'PCT' : 'USD')}
                      className="terminal-text-xs text-[var(--accent)] hover:underline uppercase cursor-pointer"
                    >
                      Toggle to {riskMode === 'USD' ? '%' : '$'}
                    </button>
                  </div>
                  <input
                    type="number"
                    step={riskMode === 'USD' ? 10 : 0.1}
                    value={riskValue}
                    onChange={(e) => setRiskValue(parseFloat(e.target.value) || 0)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="terminal-text-xs text-[var(--neutral-subtle)] uppercase">
                    Leverage:{' '}
                    <strong className="text-slate-100 font-terminal-num">{leverage}x</strong>
                  </label>
                  <span className="terminal-text-xs text-[var(--neutral-subtle)]">Max: 50x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={leverage}
                  onChange={(e) => setLeverage(parseInt(e.target.value, 10))}
                  className="w-full accent-[var(--accent)] cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block terminal-text-xs text-[var(--neutral-subtle)] uppercase mb-1">
                    Entry ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={customEntry}
                    onChange={(e) => setCustomEntry(parseFloat(e.target.value) || 0)}
                    className={`${inputClass} terminal-text-xs`}
                  />
                </div>
                <div>
                  <label className="inline-flex items-center gap-1 terminal-text-xs text-[var(--bearish)] uppercase mb-1">
                    <ShieldAlert className="w-3 h-3" aria-hidden />
                    Stop ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={customStop}
                    onChange={(e) => setCustomStop(parseFloat(e.target.value) || 0)}
                    className="w-full glass-inset rounded px-2 py-1 text-[var(--bearish)] font-terminal-num terminal-text-xs border-[var(--bearish)]/40 focus:border-[var(--bearish)] outline-none"
                  />
                </div>
                <div>
                  <label className="inline-flex items-center gap-1 terminal-text-xs text-[var(--bullish)] uppercase mb-1">
                    <CheckCircle2 className="w-3 h-3" aria-hidden />
                    Take ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={customTake}
                    onChange={(e) => setCustomTake(parseFloat(e.target.value) || 0)}
                    className="w-full glass-inset rounded px-2 py-1 text-[var(--bullish)] font-terminal-num terminal-text-xs border-[var(--bullish)]/40 focus:border-[var(--bullish)] outline-none"
                  />
                </div>
              </div>

              <RiskRewardSlider
                currentPrice={ticker.lastPrice}
                entryPrice={customEntry}
                stopLoss={customStop}
                takeProfit={customTake}
                direction={direction}
                rMultiple={sizingResult.expectedRMultiple}
              />

              <div className="flex items-center justify-between glass-inset p-2">
                <div className="flex flex-col">
                  <span className="terminal-text-xs text-[var(--neutral-subtle)] uppercase">
                    Success Probability
                  </span>
                  <span className="terminal-text-xs text-slate-300">
                    Model: <strong className="font-terminal-num">{modelProb}%</strong>{' '}
                    {userProbOverride && (
                      <span className="text-[var(--accent)]">(User-Adjusted)</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder={`${modelProb}`}
                    value={userProbOverride}
                    onChange={(e) => setUserProbOverride(e.target.value)}
                    className="w-16 glass-inset rounded px-2 py-0.5 text-right text-slate-100 font-terminal-num terminal-text-xs focus:border-[var(--accent)] outline-none"
                  />
                  <span className="terminal-text-xs text-[var(--neutral-subtle)]">%</span>
                  {userProbOverride && (
                    <button
                      type="button"
                      onClick={() => setUserProbOverride('')}
                      className="text-[var(--neutral-subtle)] hover:text-slate-200 terminal-text-xs underline ml-1 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="glass-inset p-2">
                  <div className="terminal-text-xs text-[var(--neutral-subtle)] uppercase">
                    Position Size
                  </div>
                  <div className="font-terminal-num terminal-text-sm font-bold text-slate-100">
                    {sizingResult.positionSizeBase} UNITS
                  </div>
                </div>
                <div className="glass-inset p-2">
                  <div className="terminal-text-xs text-[var(--neutral-subtle)] uppercase">
                    USD Notional
                  </div>
                  <div className="font-terminal-num terminal-text-sm font-bold text-[var(--accent)]">
                    ${sizingResult.positionSizeUsd.toLocaleString()}
                  </div>
                </div>
                <div className="glass-inset p-2">
                  <div className="terminal-text-xs text-[var(--neutral-subtle)] uppercase">
                    Risk in USD
                  </div>
                  <div className="font-terminal-num terminal-text-sm font-bold text-[var(--bearish)]">
                    ${sizingResult.riskUsd}
                  </div>
                </div>
                <div className="glass-inset p-2">
                  <div className="terminal-text-xs text-[var(--neutral-subtle)] uppercase">
                    R-Multiple
                  </div>
                  <div className="font-terminal-num terminal-text-sm font-bold text-[var(--bullish)]">
                    1 : {sizingResult.expectedRMultiple}
                  </div>
                </div>
              </div>

              <div className="glass-inset p-2 border-l-2 border-l-[var(--accent)] terminal-text-xs text-slate-200 font-terminal-num">
                {sizingResult.summaryText}
              </div>

              <div className="px-2.5 py-1.5 rounded bg-[var(--warning-bg)] border border-[var(--warning)]/30 flex items-center justify-center gap-2 text-[var(--warning)] terminal-text-xs font-semibold uppercase">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
                <span>Not connected to execution — manual/paper sizing only</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface VerticalTabProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

const VerticalTab: React.FC<VerticalTabProps> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-center gap-1 px-1 py-2.5 mx-1 rounded transition-colors cursor-pointer ${
      active
        ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40'
        : 'text-[var(--neutral-subtle)] hover:text-slate-200 hover:bg-white/5'
    }`}
    aria-pressed={active}
  >
    {icon}
    <span className="terminal-text-xs font-semibold uppercase tracking-wide">{label}</span>
  </button>
);
