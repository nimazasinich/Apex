import React from 'react';
import { CandlestickChart, Clock3, Layers3, Network } from 'lucide-react';
import type { BacktestStudioMode } from './backtestingTypes';
import { navigateWorkspace } from '../../lib/workspaceContext';

interface BacktestingTopBarProps {
  studioMode: BacktestStudioMode;
  onStudioModeChange: (mode: BacktestStudioMode) => void;
  onOpenMultiResearch: () => void;
  onOpenLiquidityHunter: () => void;
}

export function BacktestingTopBar({
  studioMode,
  onStudioModeChange,
  onOpenMultiResearch,
  onOpenLiquidityHunter,
}: BacktestingTopBarProps) {
  return (
    <header className="apex-bt-topbar">
      <div className="apex-bt-title">
        <div>
          <h1>Backtesting Lab</h1>
          <p>Smart backtesting that finds, validates, and improves your edge.</p>
        </div>
      </div>
      <div className="apex-bt-mode-tabs" role="group" aria-label="Backtesting mode">
        <button
          type="button"
          aria-pressed={studioMode === 'smart'}
          className={studioMode === 'smart' ? 'active' : ''}
          onClick={() => onStudioModeChange('smart')}
        >
          Smart <small>Recommended</small>
        </button>
        <button
          type="button"
          aria-pressed={studioMode === 'manual'}
          className={studioMode === 'manual' ? 'active' : ''}
          onClick={() => onStudioModeChange('manual')}
        >
          Manual <small>Expert</small>
        </button>
      </div>
      <div className="apex-bt-topbar-actions">
        <div className="apex-bt-system-links" aria-label="Connected workspaces">
          <button type="button" onClick={() => navigateWorkspace('strategies')}>
            <Layers3 size={14} />Strategy Studio
          </button>
          <button type="button" onClick={() => navigateWorkspace('trading')}>
            <CandlestickChart size={14} />Trading
          </button>
          <button type="button" onClick={onOpenMultiResearch}>
            <Network size={14} />Research Matrix
          </button>
          <button type="button" onClick={onOpenLiquidityHunter}>
            <Network size={14} />Liquidity Hunter
          </button>
        </div>
        <div className="apex-bt-manual-note">
          <Clock3 size={15} />
          <span>
            <strong>Manual research action only.</strong>
            <small>This route cannot place an exchange order.</small>
          </span>
        </div>
      </div>
    </header>
  );
}
