import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Bookmark,
  BookOpen,
  Boxes,
  ChevronRight,
  Droplets,
  FileInput,
  Gauge,
  Info,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Send,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Waves,
} from 'lucide-react';
import { DirectionSelector } from '../../components/ui/DirectionSelector';
import type { StrategyDefinition, TradeDirection } from '../../types';
import type { StrategyFusionSnapshot } from '../../services/strategyFusion';
import { strategyDataTier, strategyDisplayStatus, supportedDirections } from './strategyPresentation';
import { StrategyArtwork } from './StrategyArtwork';

export type StrategyWorkspaceInterval = '5m' | '15m' | '1h' | '4h' | '1d';

interface StrategyModelWorkspaceProps {
  strategy: StrategyDefinition;
  symbol: string;
  marketOptions: string[];
  direction: TradeDirection;
  interval: StrategyWorkspaceInterval;
  parameters: Record<string, number | string>;
  bookmarked: boolean;
  onSymbolChange: (symbol: string) => void;
  onDirectionChange: (direction: TradeDirection) => void;
  onIntervalChange: (interval: StrategyWorkspaceInterval) => void;
  onParameterChange: (key: string, value: number | string) => void;
  onOpenDetails: () => void;
  onSendToBacktesting: () => void;
  onCompare: () => void;
  onBookmark: () => void;
  fusionSnapshot: StrategyFusionSnapshot | null;
  fusionRunning: boolean;
  fusionMessage: string | null;
  onRefreshFusion: () => void;
}

const INTERVALS: StrategyWorkspaceInterval[] = ['5m', '15m', '1h', '4h', '1d'];

function ParameterHint({ text }: { text: string }) {
  return (
    <span className="strategy-parameter-help" tabIndex={0} aria-label={text} data-tooltip={text}>
      <Info size={10} aria-hidden="true" />
    </span>
  );
}

function ExplanationCard({ title, items, tone, icon }: { title: string; items: string[]; tone: string; icon: React.ReactNode }) {
  return (
    <details className={`strategy-explanation-card ${tone}`}>
      <summary>
        <span className="strategy-explanation-icon">{icon}</span>
        <span><strong>{title}</strong><small>{items[0] ?? 'No executable rule exposed'}</small></span>
        <ChevronRight size={12} className="strategy-explanation-chevron" aria-hidden="true" />
      </summary>
      {items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No executable rules are exposed.</p>}
    </details>
  );
}

function numericValue(value: number | string | undefined, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sliderPct(value: number, min?: number, max?: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || Number(max) <= Number(min)) return 0;
  return Math.max(0, Math.min(100, ((value - Number(min)) / (Number(max) - Number(min))) * 100));
}

function parametersEqual(left: number | string | undefined, right: number | string | undefined): boolean {
  if (typeof left === 'number' || typeof right === 'number') return Number(left) === Number(right);
  return String(left ?? '') === String(right ?? '');
}

function ConfidenceGauge({ value }: { value: number | null }) {
  const pct = Math.max(0, Math.min(1, value ?? 0));
  return (
    <svg className="strategy-confidence-gauge" viewBox="0 0 64 38" aria-label={value == null ? 'Confidence unavailable' : `Confidence ${(pct * 100).toFixed(0)} percent`}>
      <defs><linearGradient id="strategy-confidence-gradient" x1="8" y1="32" x2="56" y2="10"><stop stopColor="#15A05E"/><stop offset=".55" stopColor="#0AA88D"/><stop offset="1" stopColor="#0A9DAE"/></linearGradient></defs>
      <path d="M8 32 A24 24 0 0 1 56 32" fill="none" stroke="#E5EAEE" strokeWidth="7" strokeLinecap="round" pathLength="100" />
      <path d="M8 32 A24 24 0 0 1 56 32" fill="none" stroke="url(#strategy-confidence-gradient)" strokeWidth="7" strokeLinecap="round" pathLength="100" strokeDasharray={`${pct * 100} 100`} />
    </svg>
  );
}

export function StrategyModelWorkspace(props: StrategyModelWorkspaceProps) {
  const {
    strategy,
    symbol,
    marketOptions,
    direction,
    interval,
    parameters,
    bookmarked,
    onSymbolChange,
    onDirectionChange,
    onIntervalChange,
    onParameterChange,
    onOpenDetails,
    onSendToBacktesting,
    onCompare,
    onBookmark,
    fusionSnapshot,
    fusionRunning,
    fusionMessage,
    onRefreshFusion,
  } = props;
  const status = strategyDisplayStatus(strategy);
  const directions = supportedDirections(strategy);
  const blocked = strategy.status === 'blocked';
  const defaultParameterValues = useMemo(() => new Map(strategy.parameters.map((parameter) => [parameter.key, parameter.default])), [strategy.parameters]);
  const changedParameterKeys = useMemo(() => strategy.parameters
    .filter((parameter) => !parametersEqual(parameters[parameter.key] ?? parameter.default, parameter.default))
    .map((parameter) => parameter.key), [defaultParameterValues, parameters, strategy.parameters]);
  const hasParameterChanges = changedParameterKeys.length > 0;
  const resetParameters = () => strategy.parameters.forEach((parameter) => onParameterChange(parameter.key, parameter.default));
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    if (!autoRefresh || !strategy.fusion) return undefined;
    const timer = window.setInterval(onRefreshFusion, 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, onRefreshFusion, strategy.fusion]);

  const fusionByKey = useMemo(() => new Map(fusionSnapshot?.components.map((component) => [component.key, component]) ?? []), [fusionSnapshot]);
  const liquidity = fusionByKey.get('liquidity');
  const confidence = fusionSnapshot?.confidence ?? null;
  const compositeScoreLabel = fusionSnapshot ? `${Math.round((fusionSnapshot.score <= 1 ? fusionSnapshot.score * 100 : fusionSnapshot.score))}` : '—';
  const fusionStateLabel = !fusionSnapshot ? 'Pending' : fusionSnapshot.state === 'ACTIONABLE' ? 'Aligned' : fusionSnapshot.state === 'CONFLICTED' ? 'Conflicted' : fusionSnapshot.state === 'INCOMPLETE' ? 'Incomplete' : 'Blocked';
  const liquidityQualityLabel = !liquidity ? '—' : liquidity.quality === 'LIVE' ? 'High' : liquidity.quality === 'HISTORICAL' ? 'Good' : liquidity.quality === 'PROXY' ? 'Proxy' : liquidity.quality === 'STALE' ? 'Stale' : 'Low';
  const explanation = [
    { title: 'Inputs', tone: 'input', icon: <FileInput size={18} />, items: strategy.dataRequirements },
    { title: 'Regime & Setup', tone: 'setup', icon: <Boxes size={18} />, items: [...strategy.regimeRules, ...strategy.setupRules] },
    { title: 'Trigger', tone: 'trigger', icon: <Sparkles size={18} />, items: strategy.triggerRules },
    { title: 'Risk & Sizing', tone: 'risk', icon: <Shield size={18} />, items: strategy.riskRules },
    { title: 'Exit', tone: 'exit', icon: <Target size={18} />, items: strategy.exitRules },
    { title: 'Limits', tone: 'warning', icon: <AlertTriangle size={18} />, items: [...strategy.noTradeRules, ...strategy.knownFailureModes] },
  ];

  return (
    <main className="strategy-model-workspace">
      <section className="strategy-identity-card">
        <header className="strategy-model-header">
          <div className="strategy-model-heading">
            <span className={`strategy-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
            <h2 title={strategy.summary}>{strategy.name}</h2>
          </div>
          <div className="strategy-identity-actions">
            <button type="button" className={bookmarked ? 'bookmarked' : ''} aria-pressed={bookmarked} onClick={onBookmark} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark model'}><Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} /></button>
            <button type="button" onClick={onOpenDetails} aria-label="Open strategy details"><MoreHorizontal size={17} /></button>
          </div>
          <StrategyArtwork className="strategy-hero-art" hero />
        </header>

        <dl className="strategy-model-meta">
          <div><dt>STRATEGY ID</dt><dd>{strategy.strategyId}</dd></div>
          <div><dt>DIRECTION</dt><dd>{directions.length > 1 ? 'Long / Short' : directions[0]}</dd></div>
          <div><dt>INTERVALS</dt><dd>{strategy.supportedIntervals.join(' · ')}</dd></div>
          <div><dt>DATA TIER</dt><dd>{strategyDataTier(strategy)}</dd></div>
          <div><dt>SIGNAL</dt><dd>{strategy.engine}</dd></div>
          <div><dt>LAST UPDATED</dt><dd>{fusionSnapshot ? new Date(fusionSnapshot.generatedAt).toLocaleDateString() : '—'}</dd></div>
        </dl>
      </section>

      {strategy.blockedReason && (
        <div className="strategy-blocked-notice" role="status">
          <AlertTriangle size={16} />
          <span><strong>Prerequisite blocked</strong>{strategy.blockedReason}</span>
        </div>
      )}

      <section className="strategy-configuration-panel" aria-label="Strategy configuration">
        <header><div><SlidersHorizontal size={16} /><span><strong>Configuration</strong><small>{hasParameterChanges ? `${changedParameterKeys.length} changed from defaults` : 'Using registered defaults'}</small></span></div>{hasParameterChanges && <button type="button" className="strategy-reset-parameters" onClick={resetParameters}><RotateCcw size={13} />Reset defaults</button>}</header>
        <div className="strategy-config-controls">
          <label><span>Market</span><select value={symbol} onChange={(event) => onSymbolChange(event.target.value)}>{marketOptions.map((market) => <option key={market} value={market}>{market}</option>)}</select></label>
          <label><span>Timeframe</span><select value={interval} onChange={(event) => onIntervalChange(event.target.value as StrategyWorkspaceInterval)}>{INTERVALS.map((candidate) => <option key={candidate} value={candidate} disabled={!strategy.supportedIntervals.includes(candidate)}>{candidate}{strategy.supportedIntervals.includes(candidate) ? '' : ' — unsupported'}</option>)}</select></label>
          <div className="strategy-direction-control"><span>Direction</span><DirectionSelector value={direction} allowed={directions} onChange={onDirectionChange} ariaLabel={`Direction for ${strategy.name}`} compact /></div>
        </div>

        {strategy.parameters.length > 0 ? (
          <div className="strategy-parameter-grid">
            {strategy.parameters.map((parameter) => {
              const numeric = typeof parameter.default === 'number';
              const value = numeric ? numericValue(parameters[parameter.key], Number(parameter.default)) : parameters[parameter.key] ?? parameter.default;
              const pct = numeric ? sliderPct(Number(value), parameter.min, parameter.max) : 0;
              return (
                <label key={parameter.key} className={`${numeric ? 'strategy-parameter-card is-numeric' : 'strategy-parameter-card'} ${changedParameterKeys.includes(parameter.key) ? 'is-changed' : ''}`}>
                  <div className="strategy-parameter-label"><span>{parameter.label}</span><em>{changedParameterKeys.includes(parameter.key) ? 'Changed' : `Default ${parameter.default}`}</em><ParameterHint text={parameter.reason} /></div>
                  {numeric ? (
                    <>
                      <input
                        className="strategy-parameter-number"
                        type="number"
                        value={value}
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.step}
                        aria-label={`${parameter.label} numeric value`}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next)) onParameterChange(parameter.key, next);
                        }}
                      />
                      <input
                        className="strategy-parameter-slider"
                        type="range"
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.step}
                        value={value}
                        aria-label={parameter.label}
                        style={{ '--pct': `${pct}%` } as React.CSSProperties}
                        onChange={(event) => onParameterChange(parameter.key, Number(event.target.value))}
                      />
                      <div className="strategy-parameter-bounds"><span>{parameter.min ?? '—'}</span><span>{parameter.max ?? '—'}</span></div>
                    </>
                  ) : (
                    <input type="text" value={String(value)} onChange={(event) => onParameterChange(parameter.key, event.target.value)} />
                  )}
                </label>
              );
            })}
          </div>
        ) : <p className="strategy-parameter-empty">No tunable parameters.</p>}
      </section>

      {strategy.fusion && (
        <section className="strategy-fusion-panel" aria-label="Dynamic strategy fusion">
          <header className="strategy-fusion-header">
            <div><Waves size={16} /><strong>DYNAMIC FUSION</strong><span className="strategy-live-context-badge">LIVE CONTEXT</span></div>
            <div className="strategy-fusion-toolbar">
              <label className="strategy-auto-refresh">Auto-refresh <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /><span aria-hidden="true" /></label>
              <small>{fusionSnapshot ? 'Just now' : 'Not refreshed'}</small>
              <button type="button" onClick={onRefreshFusion} disabled={fusionRunning} aria-label="Refresh live fusion"><RefreshCw size={13} className={fusionRunning ? 'spin' : ''} /></button>
            </div>
          </header>
          {fusionMessage && <p className="strategy-fusion-message" role="status">{fusionMessage}</p>}
          <div className="strategy-fusion-metrics">
            <article><span>Composite Score</span><strong>{compositeScoreLabel}</strong><Sparkles size={25} /></article>
            <article><span>Fusion State</span><strong>{fusionStateLabel}</strong><Boxes size={25} /></article>
            <article><span>Liquidity Quality</span><strong>{liquidity?.available ? liquidityQualityLabel : 'Unavailable'}</strong><Droplets size={25} /></article>
            <article><span>Completeness</span><strong>{fusionSnapshot ? `${Math.round(fusionSnapshot.completeness * 100)}%` : '—'}</strong><Waves size={25} /></article>
            <article className="strategy-confidence-card"><span>Confidence</span><strong>{confidence == null ? '—' : `${Math.round(confidence * 100)}%`}</strong><ConfidenceGauge value={confidence} /></article>
          </div>
          {fusionSnapshot && (
            <details className="strategy-fusion-details">
              <summary>Inspect all fusion components and provenance</summary>
              <div className="strategy-fusion-components">
                {fusionSnapshot.components.map((component) => (
                  <article key={component.key} className={component.available ? 'available' : 'missing'}>
                    <div><strong>{component.label}</strong><span>{component.quality}</span></div>
                    <p>{component.available ? component.value.toFixed(3) : 'Unavailable'} · weight {component.effectiveWeight.toFixed(2)}</p>
                    <small>{component.reason}</small>
                  </article>
                ))}
              </div>
              {fusionSnapshot.reasons.length > 0 && <ul className="strategy-fusion-reasons">{fusionSnapshot.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
              {fusionSnapshot.warnings.length > 0 && <div className="strategy-fusion-warnings" role="note">{fusionSnapshot.warnings.map((warning) => <p key={warning}><AlertTriangle size={13} />{warning}</p>)}</div>}
            </details>
          )}
        </section>
      )}

      <section className="strategy-explanation" aria-label="Strategy explanation">
        <header><BookOpen size={16} /><div><strong>Model Explanation</strong></div></header>
        <div className="strategy-explanation-grid">
          {explanation.map((item) => <ExplanationCard key={item.title} {...item} />)}
        </div>
      </section>

      <div className="strategy-safety-note">
        <ShieldCheck size={14} />
        <span>Strategy Studio is research-only · validation and execution evidence stay explicit in Backtesting.</span>
      </div>

      <footer className="strategy-model-actions">
        <button type="button" className="primary" disabled={blocked} onClick={onSendToBacktesting}>
          {blocked ? 'Prerequisites Required' : 'Send to Backtesting'}
          {blocked ? <AlertTriangle size={15} /> : <Send size={16} />}
        </button>
        <button type="button" onClick={onBookmark}><Bookmark size={15} />{bookmarked ? 'Remove Preset' : 'Save as Preset'}</button>
        <button type="button" onClick={onCompare}><ArrowLeftRight size={15} />Compare</button>
        <button type="button" onClick={onOpenDetails}><BookOpen size={15} />View Details</button>
      </footer>
    </main>
  );
}
