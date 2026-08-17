/**
 * APEX-NEXT Fixed Top Bar & Navigation Rails (REQ-051, REQ-052, REQ-053, REQ-055, REQ-074)
 * - Fixed top bar with terminal branding, UTC time, and alert notification banner
 * - Left rail: icon-only, collapsed by default, flyout label on hover/click (REQ-051)
 * - Right rail: mirrors collapsed behavior, triggers symbol detail drawer (REQ-052)
 * - Keyboard accessible: Esc closes panels (REQ-055)
 */

import React, { useEffect, useState } from 'react';
import { AlertRule, DataState } from '../types';
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutGrid,
  PanelRight,
  ScanSearch,
  Server,
  Sliders,
} from 'lucide-react';
import { StatusBadge } from './primitives';
import { BrandMark } from './BrandMark';

export interface NavBarProps {
  dataState: DataState;
  activeSymbol: string;
  onOpenJournal: () => void;
  onOpenBacktest: () => void;
  onOpenHealth: () => void;
  onOpenSettings: () => void;
  onOpenDrawer: () => void;
  activeAlerts: Array<{ rule: AlertRule; symbol: string; tier: string }>;
  onClearAlerts: () => void;
}

export const NavBar: React.FC<NavBarProps> = ({
  dataState,
  activeSymbol,
  onOpenJournal,
  onOpenBacktest,
  onOpenHealth,
  onOpenSettings,
  onOpenDrawer,
  activeAlerts,
  onClearAlerts,
}) => {
  const [clockUtc, setClockUtc] = useState<string>('');
  const [leftRailHovered, setLeftRailHovered] = useState<boolean>(false);
  const [rightRailHovered, setRightRailHovered] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClockUtc(now.toISOString().slice(11, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* 1. FIXED TOP STATUS BAR */}
      <header className="topbar-height glass-panel !rounded-none border-x-0 border-t-0 px-3 flex items-center justify-between shrink-0 z-40 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[var(--accent)] font-display font-bold terminal-text-lg tracking-wider">
            <BrandMark size={26} />
            <span>APEX-NEXT</span>
          </div>
          <span className="hidden sm:inline-block px-2 py-0.5 rounded-full glass-inset card-subtitle text-slate-300">
            Futures intelligence
          </span>
          <StatusBadge state={dataState} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded glass-inset hover:bg-[var(--accent)]/15 terminal-text-xs font-semibold text-slate-100 font-terminal-num transition-colors cursor-pointer"
            title="Open Symbol Detail Drawer (DoubleClick any row)"
            aria-label={`Inspect ${activeSymbol}`}
          >
            <span className="text-[var(--accent)]">INSPECT:</span>
            <span>{activeSymbol}</span>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--neutral-subtle)]" aria-hidden />
          </button>

          <button
            type="button"
            onClick={onOpenJournal}
            className="px-2.5 py-1 rounded glass-inset hover:bg-[var(--accent)]/15 terminal-text-xs font-semibold text-slate-200 hover:text-[var(--accent)] transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Decision Journal & Calibration Report (REQ-070..072)"
            aria-label="Decision Journal"
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden />
            <span className="hidden lg:inline">JOURNAL</span>
          </button>

          <button
            type="button"
            onClick={onOpenBacktest}
            className="px-2.5 py-1 rounded glass-inset hover:bg-[var(--accent)]/15 terminal-text-xs font-semibold text-slate-200 hover:text-[var(--accent)] transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Historical Backtest & Replay Mode (REQ-075)"
            aria-label="Historical Backtest"
          >
            <History className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden />
            <span className="hidden lg:inline">BACKTEST</span>
          </button>

          <button
            type="button"
            onClick={onOpenHealth}
            className="px-2.5 py-1 rounded glass-inset hover:bg-[var(--accent)]/15 terminal-text-xs font-semibold text-slate-200 hover:text-[var(--accent)] transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Operations & System Health (REQ-076)"
            aria-label="System Health Diagnostics"
          >
            <Server className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden />
            <span className="hidden xl:inline">DIAGNOSTICS</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded glass-inset text-[var(--neutral-subtle)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            title="Terminal Settings & Alert Configuration (REQ-080, 081)"
            aria-label="Terminal Settings"
          >
            <Sliders className="w-4 h-4" aria-hidden />
          </button>

          <div className="px-2.5 py-1 rounded glass-inset font-terminal-num terminal-text-xs font-semibold text-slate-300" aria-live="polite">
            {clockUtc || 'UTC'}
          </div>
        </div>
      </header>

      {/* 2. IN-APP ALERT NOTIFICATIONS BANNER (REQ-074) */}
      {activeAlerts.length > 0 && (
        <div className="bg-[var(--warning-bg)] border-b border-[var(--warning)]/50 px-4 py-1.5 flex items-center justify-between terminal-text-xs font-semibold text-slate-100 z-30">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[var(--warning)] animate-bounce" />
            <span>
              <strong className="text-[var(--warning)]">[ALERT TRIGGERED]</strong>{' '}
              {activeAlerts.map((a, i) => (
                <span key={i} className="mr-3">
                  <strong>{a.symbol}</strong> ({a.tier}) via rule &ldquo;{a.rule.name}&rdquo;
                </span>
              ))}
            </span>
          </div>
          <button
            type="button"
            onClick={onClearAlerts}
            className="text-slate-300 hover:text-white uppercase font-terminal-num underline cursor-pointer"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* 3. COLLAPSED LEFT NAVIGATION RAIL (REQ-051) */}
      <aside
        onMouseEnter={() => setLeftRailHovered(true)}
        onMouseLeave={() => setLeftRailHovered(false)}
        className="rail-left fixed left-0 bottom-0 glass-panel !rounded-none border-y-0 border-l-0 z-30 flex flex-col items-center py-3 gap-4"
        aria-label="Primary navigation"
      >
        <RailButton
          icon={<LayoutGrid className="w-5 h-5 text-[var(--accent)]" />}
          label="Two-Directional Scanner Grid"
          isHovered={leftRailHovered}
          onClick={() => {}}
          active
          side="left"
        />
        <RailButton
          icon={<BookOpen className="w-5 h-5 text-slate-300" />}
          label="Decision Journal & Calibration"
          isHovered={leftRailHovered}
          onClick={onOpenJournal}
          side="left"
        />
        <RailButton
          icon={<History className="w-5 h-5 text-slate-300" />}
          label="Historical Backtest Mode"
          isHovered={leftRailHovered}
          onClick={onOpenBacktest}
          side="left"
        />
        <RailButton
          icon={<Server className="w-5 h-5 text-slate-300" />}
          label="System Health Diagnostics"
          isHovered={leftRailHovered}
          onClick={onOpenHealth}
          side="left"
        />
        <div className="mt-auto">
          <RailButton
            icon={<Sliders className="w-5 h-5 text-slate-400" />}
            label="Terminal Settings"
            isHovered={leftRailHovered}
            onClick={onOpenSettings}
            side="left"
          />
        </div>
      </aside>

      {/* 4. COLLAPSED RIGHT INSPECTOR RAIL (REQ-052) */}
      <aside
        onMouseEnter={() => setRightRailHovered(true)}
        onMouseLeave={() => setRightRailHovered(false)}
        className="rail-right fixed right-0 bottom-0 glass-panel !rounded-none border-y-0 border-r-0 z-30 flex flex-col items-center py-3 gap-4"
        aria-label="Symbol inspector"
      >
        <RailButton
          icon={<PanelRight className="w-5 h-5 text-[var(--accent)]" />}
          label="Open Symbol Inspector"
          isHovered={rightRailHovered}
          onClick={onOpenDrawer}
          active
          side="right"
        />
        <RailButton
          icon={<ScanSearch className="w-5 h-5 text-slate-300" />}
          label={`Inspect ${activeSymbol}`}
          isHovered={rightRailHovered}
          onClick={onOpenDrawer}
          side="right"
        />
      </aside>
    </>
  );
};

interface RailButtonProps {
  icon: React.ReactNode;
  label: string;
  isHovered: boolean;
  onClick: () => void;
  active?: boolean;
  side: 'left' | 'right';
}

const RailButton: React.FC<RailButtonProps> = ({
  icon,
  label,
  onClick,
  active = false,
  side,
}) => {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        className={`w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer ${
          active
            ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/40'
            : 'hover:bg-[var(--accent)]/10'
        }`}
        aria-label={label}
      >
        {icon}
      </button>

      <div
        className={`absolute top-0 ${
          side === 'left' ? 'left-full ml-2' : 'right-full mr-2'
        } hidden group-hover:flex items-center gap-1 px-2.5 py-1.5 glass-panel whitespace-nowrap z-50`}
      >
        {side === 'right' && <ChevronLeft className="w-3 h-3 text-[var(--neutral-subtle)]" />}
        <span className="terminal-text-xs font-semibold text-slate-100 uppercase tracking-wide">
          {label}
        </span>
        {side === 'left' && <ChevronRight className="w-3 h-3 text-[var(--neutral-subtle)]" />}
      </div>
    </div>
  );
};
