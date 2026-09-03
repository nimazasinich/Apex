import React, { useState } from 'react';
import {
  Activity,
  Bookmark,
  Calendar,
  Check,
  ChevronDown,
  CircleDollarSign,
  Info,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Gauge,
} from 'lucide-react';
import { CoinIcon } from '../../components/CoinIcon';
import { DirectionSelector } from '../../components/ui/DirectionSelector';
import type { AutopilotPhase } from '../../lib/useAutopilotController';
import type { BacktestResult, DataState, SymbolTicker, TradeDirection } from '../../types';
import type { BacktestInterval, BacktestRiskProfile, BacktestStrategyPreset, BacktestStudioMode, SmartBacktestCheckpoint } from './backtestingTypes';
import type { BacktestSavedPreset } from './backtestPersistence';

export interface BacktestRunBuilderProps {
  studioMode: BacktestStudioMode;
  smartCheckpoint: SmartBacktestCheckpoint | null;
  smartRunning: boolean;
  smartStopping: boolean;
  smartResumable: boolean;
  smartPhaseLabel: string;
  onSmartStart: () => void;
  onSmartStop: () => void;
  onSmartResume: () => void;
  strategies: BacktestStrategyPreset[];
  strategy: BacktestStrategyPreset;
  strategyId: string;
  onStrategyChange: (strategyId: string) => void;
  marketOptions: SymbolTicker[];
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  direction: TradeDirection;
  onDirectionChange: (direction: TradeDirection) => void;
  interval: BacktestInterval;
  supportedIntervals: BacktestInterval[];
  intervalOptions: BacktestInterval[];
  onIntervalChange: (interval: BacktestInterval) => void;
  bars: number;
  barOptions: readonly number[];
  onBarsChange: (bars: number) => void;
  maxHoldBars: number;
  holdOptions: readonly number[];
  onMaxHoldBarsChange: (bars: number) => void;
  dateRangeLabel: string;
  onCycleDateRange: () => void;
  capital: number;
  onCapitalChange: (capital: number) => void;
  riskProfile: BacktestRiskProfile;
  riskProfiles: ReadonlyArray<{ id: BacktestRiskProfile; label: string; riskPct: number }>;
  onRiskProfileChange: (profile: BacktestRiskProfile) => void;
  commissionPct: number;
  slippagePct: number;
  fundingPct: number;
  parameters: Record<string, number | string>;
  onParameterChange: (key: string, value: number | string) => void;
  onCommissionChange: (value: number) => void;
  onSlippageChange: (value: number) => void;
  onFundingChange: (value: number) => void;
  loading: boolean;
  stale: boolean;
  result: BacktestResult | null;
  error: string | null;
  cancelled: boolean;
  cancelReason?: string | null;
  elapsedMs: number | null;
  routeDataState: DataState;
  onRun: () => void;
  onCancel: () => void;
  presets: BacktestSavedPreset[];
  suggestedPresetName: string;
  onSavePreset: (name: string) => void;
  onApplyPreset: (preset: BacktestSavedPreset) => void;
  onDeletePreset: (presetId: string) => void;
  onReset: () => void;
  optimizationRunning?: boolean;
  optimizationMessage?: string | null;
  optimizationEligible?: boolean;
  optimizationPromoted?: boolean;
  optimizationDevelopmentPnlPct?: number | null;
  optimizationDevelopmentImprovement?: number | null;
  optimizationNeighborPassRate?: number | null;
  activeOptimizationRevision?: number | null;
  autopilotEnabled?: boolean;
  /** Real controller phase from the server; authoritative when present. */
  autopilotPhase?: AutopilotPhase | null;
  autopilotPhaseText?: string | null;
  autopilotDisconnected?: boolean;
  onRunOptimization?: () => void;
  onPromoteOptimization?: () => void;
}

function dataStateLabel(state: DataState): string {
  return state.replaceAll('_', ' ');
}

function duration(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)} s` : `${value.toFixed(0)} ms`;
}

function FieldHint({ text }: { text: string }) {
  return (
    <span className="apex-bt-field-help" tabIndex={0} aria-label={text} data-tooltip={text}>
      <Info size={10} aria-hidden="true" />
    </span>
  );
}

export function BacktestRunBuilder(props: BacktestRunBuilderProps) {
  const {
    studioMode,
    smartCheckpoint,
    smartRunning,
    smartStopping,
    smartResumable,
    smartPhaseLabel,
    onSmartStart,
    onSmartStop,
    onSmartResume,
    strategies,
    strategy,
    strategyId,
    onStrategyChange,
    marketOptions,
    symbol,
    onSymbolChange,
    direction,
    onDirectionChange,
    interval,
    supportedIntervals,
    intervalOptions,
    onIntervalChange,
    bars,
    barOptions,
    onBarsChange,
    maxHoldBars,
    holdOptions,
    onMaxHoldBarsChange,
    dateRangeLabel,
    onCycleDateRange,
    capital,
    onCapitalChange,
    riskProfile,
    riskProfiles,
    onRiskProfileChange,
    commissionPct,
    slippagePct,
    fundingPct,
    parameters,
    onParameterChange,
    onCommissionChange,
    onSlippageChange,
    onFundingChange,
    loading,
    stale,
    result,
    error,
    cancelled,
    cancelReason,
    elapsedMs,
    routeDataState,
    onRun,
    onCancel,
    presets,
    suggestedPresetName,
    onSavePreset,
    onApplyPreset,
    onDeletePreset,
    onReset,
    optimizationRunning = false,
    optimizationMessage = null,
    optimizationEligible = false,
    optimizationPromoted = false,
    optimizationDevelopmentPnlPct = null,
    optimizationDevelopmentImprovement = null,
    optimizationNeighborPassRate = null,
    activeOptimizationRevision = null,
    autopilotEnabled = false,
    autopilotPhase = null,
    autopilotPhaseText = null,
    autopilotDisconnected = false,
    onRunOptimization = () => undefined,
    onPromoteOptimization = () => undefined,
  } = props;
  const maxConfiguredBars = barOptions.length ? Math.max(...barOptions) : bars;
  const compactHorizonLabel = bars >= maxConfiguredBars ? 'Max available' : `${bars.toLocaleString()} bars`;

  const [presetPanelOpen, setPresetPanelOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [optimizationExpanded, setOptimizationExpanded] = useState(false);

  const openPresetPanel = () => {
    setPresetName(suggestedPresetName);
    setPresetPanelOpen((value) => !value);
  };

  const resultState = result?.dataState ?? routeDataState;
  const statusTitle = loading
    ? 'Replay running'
    : error
      ? 'Replay failed'
      : cancelled
        ? 'Replay cancelled'
        : result
          ? stale
            ? 'Completed result is stale'
            : 'Completed result is current'
          : 'Ready for verified replay';
  const statusDetail = loading
    ? `Elapsed ${duration(elapsedMs)}. The server does not provide progress counts, so no percentage is shown.`
    : error
      ? error
      : cancelled
        ? cancelReason || 'The browser cancelled the active request. No completion is claimed.'
        : result
          ? `${result.candlesUsed.toLocaleString()} candles · ${result.simulatedScans.toLocaleString()} scans · ${result.timeline.length} trades`
          : `Configured to request ${bars.toLocaleString()} closed ${interval} candles.`;
  const smartPrimaryLabel = smartRunning ? 'Stop' : smartResumable ? 'Resume Smart Backtest' : 'Start Smart Backtest';
  const smartPrimaryAction = smartRunning ? onSmartStop : smartResumable ? onSmartResume : onSmartStart;
  const smartStatus = smartCheckpoint?.status ?? 'idle';
  const bestResultText = smartCheckpoint?.bestNetReturnPct == null ? '—' : `${smartCheckpoint.bestNetReturnPct >= 0 ? '+' : ''}${smartCheckpoint.bestNetReturnPct.toFixed(2)}%`;
  const latestResultText = smartCheckpoint?.latestNetReturnPct == null ? '—' : `${smartCheckpoint.latestNetReturnPct >= 0 ? '+' : ''}${smartCheckpoint.latestNetReturnPct.toFixed(2)}%`;

  return (
    <aside className="apex-bt-run-builder apex-bt-card" aria-label="Backtest run builder">
      <div className="apex-bt-card-title apex-bt-studio-builder-title">
        <span>{studioMode === 'smart' ? 'Smart Run Builder' : 'Manual / Expert Builder'}</span>
        <div className="apex-bt-builder-command">
          <em className={`apex-bt-ready-chip ${stale ? 'dirty' : ''}`}>{studioMode === 'smart' ? 'Smart mode' : stale ? 'Changed' : 'Manual'}</em>
        </div>
      </div>

      <section className={`apex-bt-smart-mode-card status-${smartStatus}`} aria-label="Smart Mode run orchestration">
        <header>
          <span><Activity size={14} aria-hidden="true" /><strong>Smart Controls</strong></span>
          <em>{smartPhaseLabel}</em>
        </header>
        <p>Smart mode auto-configures, tests, improves, and repeats through the canonical backtest route. It never creates a live trading order.</p>
        <div className="apex-bt-smart-summary-grid" aria-label="Smart setup summary">
          <span><small>Strategy</small><strong>{strategy.name}</strong><em>auto-confirmed</em></span>
          <span><small>Market</small><strong>{symbol}</strong><em>{interval}</em></span>
          <span><small>Direction</small><strong>{direction}</strong><em>{bars.toLocaleString()} candles</em></span>
          <span><small>Risk profile</small><strong>{riskProfiles.find((item) => item.id === riskProfile)?.label ?? riskProfile}</strong><em>{commissionPct.toFixed(2)}% fee</em></span>
        </div>
        <div className="apex-bt-smart-controls">
          <button
            type="button"
            className={`apex-bt-smart-primary ${smartRunning ? 'stop' : ''}`}
            disabled={strategy.disabled || (loading && !smartRunning) || smartStopping}
            onClick={smartPrimaryAction}
            aria-label={smartPrimaryLabel}
          >
            {smartRunning ? <RefreshCw className="spin" size={14} aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}
            {smartStopping ? 'Stopping…' : smartPrimaryLabel}
          </button>
          <button
            type="button"
            className="apex-bt-smart-secondary"
            onClick={onSmartResume}
            disabled={!smartResumable || smartRunning || strategy.disabled || loading}
            title={smartResumable ? 'Resume the latest saved Smart Backtest checkpoint' : 'No resumable Smart Backtest checkpoint is available yet'}
          >
            Resume Last Run
          </button>
        </div>
        <div className="apex-bt-smart-progress-title"><strong>Smart Progress &amp; Status</strong><small>{smartCheckpoint ? smartPhaseLabel : 'Idle'}</small></div>
        <dl className="apex-bt-smart-progress-grid">
          <div><dt>Iteration</dt><dd>{smartCheckpoint?.iteration ?? 0} / {smartCheckpoint?.maxIterations ?? 250}</dd></div>
          <div><dt>Elapsed</dt><dd>{duration(smartCheckpoint?.elapsedMs ?? null)}</dd></div>
          <div><dt>Best result</dt><dd className={(smartCheckpoint?.bestNetReturnPct ?? 0) >= 0 ? 'positive' : 'negative'}>{bestResultText}</dd></div>
          <div><dt>Latest result</dt><dd className={(smartCheckpoint?.latestNetReturnPct ?? 0) >= 0 ? 'positive' : 'negative'}>{latestResultText}</dd></div>
          <div><dt>No improvement</dt><dd>{smartCheckpoint?.noImprovementIterations ?? 0} / 20</dd></div>
          <div><dt>Status</dt><dd>{smartCheckpoint?.stopReason ?? 'Ready to run safely'}</dd></div>
        </dl>
        <div className="apex-bt-smart-next">
          <span><strong>Last change</strong><small>{smartCheckpoint?.lastChange ?? 'No smart iteration has run yet.'}</small></span>
          <span><strong>What it will try next</strong><small>{smartCheckpoint?.nextAction ?? 'Start a canonical run, evaluate it, and save a checkpoint.'}</small></span>
        </div>
        <div className="apex-bt-stop-conditions" aria-label="Smart Mode stop conditions">
          <span>Stops on user Stop</span><span>max runtime 2h</span><span>max iterations 250</span><span>20 no-improvement iterations</span><span>provider/data failure</span>
        </div>
      </section>

      <details className="apex-bt-expert-details" open>
        <summary>Advanced manual controls</summary>

      <div className="apex-bt-form-section">
        <label className="apex-bt-field">
          <span>Strategy</span>
          <div className="apex-bt-symbol-control strategy">
            <TrendingUp size={15} className="apex-bt-strategy-glyph" aria-hidden="true" />
            <select value={strategyId} onChange={(event) => onStrategyChange(event.target.value)} disabled={loading}>
              {strategies.map((preset) => (
                <option key={preset.id} value={preset.id} disabled={preset.disabled}>
                  {preset.name}{preset.disabled ? ' — blocked' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </div>
        </label>

        <div className="apex-bt-tag-row" aria-label="Strategy attributes">
          {strategy.tags.map((tag) => <span key={tag.label} className={`apex-bt-tag ${tag.tone}`}>{tag.label}</span>)}
          <span className="apex-bt-tag blue">Tier {strategy.dataTier}</span>
        </div>

        <div className="apex-bt-three-col apex-bt-market-period-row">
          <label className="apex-bt-field">
            <span>Market</span>
            <div className="apex-bt-symbol-control">
              <CoinIcon symbol={symbol} size={20} />
              <select value={symbol} onChange={(event) => onSymbolChange(event.target.value)} disabled={loading}>
                {marketOptions.length
                  ? marketOptions.map((ticker) => <option key={ticker.symbol} value={ticker.symbol}>{ticker.symbol}</option>)
                  : <option value={symbol}>{symbol}</option>}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
          <label className="apex-bt-field">
            <span>Timeframe</span>
            <div className="apex-bt-symbol-control plain">
              <select value={interval} onChange={(event) => onIntervalChange(event.target.value as BacktestInterval)} disabled={loading}>
                {intervalOptions.map((option) => (
                  <option key={option} value={option} disabled={!supportedIntervals.includes(option)}>
                    {option}{supportedIntervals.includes(option) ? '' : ' — unsupported'}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
          <div className="apex-bt-field apex-bt-period-field">
            <span>Data horizon</span>
            <button type="button" className="apex-bt-date-range" onClick={onCycleDateRange} disabled={loading} title={dateRangeLabel} aria-label={`Data horizon: ${compactHorizonLabel}. ${dateRangeLabel}`}>
              <Calendar size={14} aria-hidden="true" />
              <span>{compactHorizonLabel}</span>
            </button>
          </div>
        </div>

        <div className="apex-bt-three-col apex-bt-replay-window-row">
          <label className="apex-bt-field">
            <span>History bars</span>
            <div className="apex-bt-symbol-control plain">
              <select value={bars} onChange={(event) => onBarsChange(Number(event.target.value))} disabled={loading}>
                {barOptions.map((option) => <option key={option} value={option}>{option.toLocaleString()} bars</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
          <label className="apex-bt-field">
            <span>Maximum hold</span>
            <div className="apex-bt-symbol-control plain">
              <select value={maxHoldBars} onChange={(event) => onMaxHoldBarsChange(Number(event.target.value))} disabled={loading}>
                {holdOptions.map((option) => <option key={option} value={option}>{option} bars</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </label>
          <div className="apex-bt-field apex-bt-direction-field">
            <span>Direction</span>
            <DirectionSelector value={direction} allowed={strategy.allowedDirections} onChange={onDirectionChange} ariaLabel="Backtest direction" compact disabled={loading} />
          </div>
        </div>

        <label className="apex-bt-field apex-bt-capital-field">
          <span>Display capital</span>
          <div className="apex-bt-number suffix">
            <input
              type="number"
              min={100}
              max={1_000_000_000}
              step={100}
              value={capital}
              disabled={loading}
              onChange={(event) => onCapitalChange(Number(event.target.value))}
            />
            <b>USDT</b>
          </div>
        </label>

        <div className="apex-bt-field apex-bt-risk-profile-field">
          <div className="apex-bt-field-label"><span>Risk profile</span><FieldHint text="Changes capital scaling only; it is not a canonical engine input." /></div>
          <div className="apex-bt-segmented three">
            {riskProfiles.map((profile) => (
              <button
                type="button"
                key={profile.id}
                className={riskProfile === profile.id ? 'active' : ''}
                disabled={loading}
                onClick={() => onRiskProfileChange(profile.id)}
              >
                {profile.label}
              </button>
            ))}
          </div>
        </div>

        {strategy.parameters.length > 0 && (
          <div className="apex-bt-parameter-section" aria-label="Strategy parameters">
            <div className="apex-bt-subtitle"><ShieldCheck size={14} aria-hidden="true" /><span><strong>Strategy parameters</strong></span></div>
            <div className="apex-bt-parameter-grid">
              {strategy.parameters.map((parameter) => {
                const numeric = typeof parameter.default === 'number';
                return (
                  <label className="apex-bt-field" key={parameter.key}>
                    <div className="apex-bt-field-label"><span>{parameter.label}</span><FieldHint text={parameter.reason} /></div>
                    <input
                      type={numeric ? 'number' : 'text'}
                      value={parameters[parameter.key] ?? parameter.default}
                      min={numeric ? parameter.min : undefined}
                      max={numeric ? parameter.max : undefined}
                      step={numeric ? parameter.step : undefined}
                      disabled={loading}
                      title={parameter.reason}
                      onChange={(event) => {
                        if (numeric) {
                          const value = Number(event.target.value);
                          if (Number.isFinite(value)) onParameterChange(parameter.key, value);
                        } else {
                          onParameterChange(parameter.key, event.target.value);
                        }
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="apex-bt-divider" />

      <div className="apex-bt-form-section cost">
        <div className="apex-bt-subtitle">
          <CircleDollarSign size={14} aria-hidden="true" />
          <span><strong>Cost assumptions</strong></span>
          <span className="apex-bt-infotip" title="Sent to the server and applied by the replay engine."><Info size={11} /></span>
        </div>
        <div className="apex-bt-cost-row three">
          <label className="apex-bt-field"><span>Commission / side</span><div className="apex-bt-number suffix"><input type="number" min={0} max={5} step={0.01} value={commissionPct} disabled={loading} onChange={(event) => onCommissionChange(Number(event.target.value))} /><b>%</b></div></label>
          <label className="apex-bt-field"><span>Slippage / side</span><div className="apex-bt-number suffix"><input type="number" min={0} max={5} step={0.01} value={slippagePct} disabled={loading} onChange={(event) => onSlippageChange(Number(event.target.value))} /><b>%</b></div></label>
          <label className="apex-bt-field"><span>Funding estimate</span><div className="apex-bt-number suffix"><input type="number" min={0} max={5} step={0.01} value={fundingPct} disabled={loading} onChange={(event) => onFundingChange(Number(event.target.value))} /><b>%</b></div></label>
        </div>
      </div>

      <section className={`apex-bt-smart-autopilot ${autopilotEnabled ? 'active' : ''} ${autopilotPhase === 'RESEARCHING' || autopilotPhase === 'VALIDATING' ? 'running' : ''}`} aria-label="Global Autopilot status">
        <header>
          <span><Activity size={14} aria-hidden="true" /><strong>Global Autopilot</strong><em>{autopilotDisconnected ? 'UNREACHABLE' : autopilotPhase ?? (autopilotEnabled ? 'STARTING' : 'MANUAL')}</em></span>
          <small>Controlled from the application header</small>
        </header>
        <div className="apex-bt-smart-autopilot-grid">
          <span><small>Scope</small><strong>Strategy × market × timeframe × direction</strong></span>
          <span><small>Cadence</small><strong>Immediate start + server schedule</strong></span>
          <span><small>Promotion gate</small><strong>5-agent consensus</strong></span>
          <span><small>Output</small><strong>Research + paper plan only</strong></span>
        </div>
        <p>{autopilotPhaseText || (autopilotEnabled
          ? 'The server owns the only automatic lifecycle. This page observes it and cannot create a duplicate timer.'
          : 'Manual research mode is active. Start safe research Autopilot from the global header when required.')}</p>
      </section>

      <section className={`apex-bt-optimization-panel ${optimizationExpanded ? 'expanded' : ''}`} aria-label="Robust strategy optimization">
        <header>
          <button type="button" className="apex-bt-optimization-toggle" aria-expanded={optimizationExpanded} onClick={() => setOptimizationExpanded((value) => !value)}>
            <span><Gauge size={13} aria-hidden="true" /><strong>Robust Optimization</strong></span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          <em className={autopilotEnabled || optimizationPromoted ? 'active' : ''}>{optimizationPromoted ? `Verified${activeOptimizationRevision ? ` · r${activeOptimizationRevision}` : ''}` : autopilotEnabled ? 'Autopilot' : optimizationEligible ? 'Candidate ready' : 'Manual review'}</em>
        </header>
        {optimizationExpanded && (
          <div className="apex-bt-optimization-body">
            <div className="apex-bt-optimization-copy">
              <strong>{optimizationPromoted ? 'Validated profile active' : optimizationEligible ? 'Development-eligible candidate ready' : 'Search for robust improvement'}</strong>
              <small>{optimizationMessage || 'Uses development-only chronological selection, cost stress, neighbor stability and a sealed final holdout reserved for later validation.'}</small>
            </div>
            {(optimizationDevelopmentPnlPct != null || optimizationDevelopmentImprovement != null || optimizationNeighborPassRate != null) && (
              <dl>
                <div><dt>Development validation P&amp;L</dt><dd className={(optimizationDevelopmentPnlPct ?? 0) >= 0 ? 'positive' : 'negative'}>{optimizationDevelopmentPnlPct == null ? '—' : `${optimizationDevelopmentPnlPct >= 0 ? '+' : ''}${optimizationDevelopmentPnlPct.toFixed(2)}%`}</dd></div>
                <div><dt>Utility Δ</dt><dd>{optimizationDevelopmentImprovement == null ? '—' : `${optimizationDevelopmentImprovement >= 0 ? '+' : ''}${optimizationDevelopmentImprovement.toFixed(3)}`}</dd></div>
                <div><dt>Neighbor pass</dt><dd>{optimizationNeighborPassRate == null ? '—' : `${(optimizationNeighborPassRate * 100).toFixed(0)}%`}</dd></div>
              </dl>
            )}
            <div className="apex-bt-optimization-actions">
              <button type="button" onClick={onRunOptimization} disabled={loading || optimizationRunning || strategy.disabled}>
                <Gauge size={12} aria-hidden="true" />{optimizationRunning ? 'Optimizing…' : 'Optimize safely'}
              </button>
              {optimizationEligible && !optimizationPromoted && (
                <button type="button" className="promote" onClick={onPromoteOptimization} disabled={loading || optimizationRunning}>
                  <Check size={12} aria-hidden="true" />Promote candidate
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="apex-bt-preset-wrap">
        {presetPanelOpen && (
          <div className="apex-bt-preset-panel" aria-label="Saved backtest presets">
            <div className="apex-bt-preset-save-row">
              <input
                type="text"
                value={presetName}
                maxLength={80}
                placeholder="Preset name"
                onChange={(event) => setPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && presetName.trim()) { event.preventDefault(); onSavePreset(presetName.trim()); setPresetPanelOpen(false); }
                }}
              />
              <button type="button" className="apex-bt-preset-save" disabled={!presetName.trim()} onClick={() => { onSavePreset(presetName.trim()); setPresetPanelOpen(false); }}>
                <Check size={13} aria-hidden="true" />Save
              </button>
            </div>
            {presets.length ? (
              <ul className="apex-bt-preset-list">
                {presets.map((preset) => (
                  <li key={preset.id}>
                    <button type="button" className="apex-bt-preset-load" disabled={loading} title="Apply this preset" onClick={() => { onApplyPreset(preset); setPresetPanelOpen(false); }}>
                      <span>{preset.name}</span>
                      <small>{preset.config.symbol} · {preset.config.interval} · {preset.config.direction.toLowerCase()}</small>
                    </button>
                    <button type="button" className="apex-bt-preset-delete" aria-label={`Delete preset ${preset.name}`} title="Delete preset" onClick={() => onDeletePreset(preset.id)}>
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="apex-bt-preset-empty">No presets saved in this browser yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="apex-bt-builder-actions">
        <button type="button" className="apex-bt-preset-toggle" onClick={openPresetPanel} disabled={loading}>
          <Bookmark size={13} aria-hidden="true" />{presetPanelOpen ? 'Close Presets' : 'Save Preset'}
        </button>
        <button type="button" className="apex-bt-run-button" disabled={loading || strategy.disabled} onClick={onRun}>
          {loading ? <RefreshCw className="spin" size={14} aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}
          {loading ? 'Running Backtest…' : stale ? 'Apply & Run' : 'Run Backtest'}
        </button>
        <button type="button" className="apex-bt-reset-button" disabled={loading} onClick={onReset} title="Restore default configuration">
          <RotateCcw size={13} aria-hidden="true" />Reset
        </button>
      </div>
      {loading && <button type="button" className="apex-bt-cancel-run" onClick={onCancel}>Cancel Run</button>}
      </details>

      <div className="apex-bt-lock-hint"><Lock size={11} /><span>Backtesting is research-only. It never submits an exchange order.</span></div>

      <div className={`apex-bt-run-audit ${loading ? 'running' : result ? 'complete' : error ? 'failed' : cancelled ? 'cancelled' : ''}`} aria-live="polite">
        <Activity size={12} aria-hidden="true" />
        <span><strong>{statusTitle}</strong><small>{statusDetail}</small></span>
      </div>

      <div className="apex-bt-strategy-description">
        <h4>Strategy scope</h4>
        <p title={strategy.description}>{strategy.description}</p>
        {strategy.blockedReason && <small>{strategy.blockedReason}</small>}
      </div>

      <div className="apex-bt-data-note">
        <ShieldCheck size={14} aria-hidden="true" />
        <span><strong>Data source state</strong><small>{result?.source ? `${result.source} closed candles` : 'Resolved by the server at run time'}</small></span>
        <em className={resultState === 'live' ? 'live' : 'degraded'}>{dataStateLabel(resultState)}</em>
      </div>
    </aside>
  );
}
