import './BacktestingPage.css';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CandlestickChart, Clock3, Download, Info, Layers3, Maximize2, Network, TriangleAlert } from 'lucide-react';
import type { BacktestResult, DataState, SymbolTicker, TradeDirection } from '../../types';
import { DEFAULT_STRATEGY_ID } from '../../services/strategyRegistry';
import { navigateWorkspace, readWorkspaceContext, writeWorkspaceContext } from '../../lib/workspaceContext';
import { BacktestRunBuilder } from './BacktestRunBuilder';
import { BacktestRunHeader, buildBacktestRunIdentity } from './BacktestRunHeader';
import { BacktestMetricStrip } from './BacktestMetricStrip';
import { buildBacktestConfigKey, buildBacktestQuery, isBacktestAbortError, LatestRequestGate } from './backtestRunControl';
import { BacktestEquityPanel } from './BacktestEquityPanel';
import { BacktestCoverageCredibilityPanel } from './BacktestCoverageCredibilityPanel';
import { BacktestEvidenceRail } from './BacktestEvidenceRail';
import { BacktestingTopBar } from './BacktestingTopBar';
import { useBacktestHistorySync } from './useBacktestHistorySync';
import { BacktestEvidenceTabs } from './BacktestEvidenceTabs';
import {
  BAR_OPTIONS,
  HOLD_OPTIONS,
  RISK_PROFILES,
  SMART_CHECKPOINT_KEY,
  SMART_MAX_ITERATIONS,
  SMART_MAX_RUNTIME_MS,
  SMART_NO_IMPROVEMENT_LIMIT,
  SMART_ITERATION_PAUSE_MS,
  readSmartCheckpoint,
  persistSmartCheckpoint,
  scoreSmartBacktest,
  phaseLabel,
} from './backtestCheckpointStorage';
import type {
  BacktestChartAggregation,
  BacktestChartView,
  BacktestEvidenceTab,
  BacktestHistoryEntry,
  BacktestInterval,
  BacktestRiskProfile,
  BacktestRunConfig,
  BacktestStudioMode,
} from './backtestingTypes';
import {
  INTERVAL_OPTIONS,
  STRATEGY_PRESETS,
  clampNumber,
  defaultParameters,
} from './backtestingPresets';
import {
  loadNotes,
  loadPresets,
  type BacktestNote,
  type BacktestSavedPreset,
} from './backtestPersistence';
import {
  persistBacktestHistory,
  readBacktestHistory,
} from './backtestHistory';
import { useBacktestingOptimization } from './useBacktestingOptimization';
import { useBacktestDerivedEvidence } from './useBacktestDerivedEvidence';
import { MultiStrategyResearchPanel } from './MultiStrategyResearchPanel';
import { LiquidityHunterReplayPanel } from './LiquidityHunterReplayPanel';
import { useBacktestingPresetsAndNotes } from './useBacktestingPresetsAndNotes';
import { useSmartBacktestLoop } from './useSmartBacktestLoop';

import type { AutopilotControllerView } from '../../lib/useAutopilotController';

// Smart Backtesting runtime hardening contract:
// apex:backtesting-smart-checkpoint:v1
// while (!smartStopRequestedRef.current) SMART_MAX_ITERATIONS SMART_MAX_RUNTIME_MS
// bestScore latestScore bestRunId latestRunId
// SMART_NO_IMPROVEMENT_LIMIT Stopped safely provider returned no usable market data
// runBacktest('smart') await runBacktest('smart') X-APEX-Backtest-Source diagnostics Research Matrix
// Manual <small>Expert</small> aria-label="Backtesting mode" direction: result.direction

export interface BacktestingPageProps {
  tickers: SymbolTicker[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
  dataState: DataState;
  autopilotEnabled?: boolean;
  autopilotController?: AutopilotControllerView;
}

export function BacktestingPage({ tickers, selectedSymbol, onSelectSymbol, dataState, autopilotEnabled, autopilotController }: BacktestingPageProps) {
  const [initialContext] = useState(() => readWorkspaceContext());
  const initialStrategyId = initialContext?.strategyId && STRATEGY_PRESETS.some((preset) => preset.id === initialContext.strategyId && !preset.disabled)
    ? initialContext.strategyId
    : DEFAULT_STRATEGY_ID;
  const initialInterval = initialContext?.interval && INTERVAL_OPTIONS.includes(initialContext.interval)
    ? initialContext.interval
    : '15m';

  const initialStrategy = STRATEGY_PRESETS.find((preset) => preset.id === initialStrategyId) ?? STRATEGY_PRESETS[0];
  const [strategyId, setStrategyId] = useState(initialStrategyId);
  const [parameters, setParameters] = useState<Record<string, number | string>>(() => ({
    ...defaultParameters(initialStrategy),
    ...(initialContext?.strategyId === initialStrategyId ? initialContext.strategyParameters : undefined),
  }));
  const [symbol, setSymbol] = useState(initialContext?.symbol || selectedSymbol || tickers[0]?.symbol || 'BTC-USDT');
  const [direction, setDirection] = useState<TradeDirection>(initialContext?.direction || 'LONG');
  const [interval, setInterval] = useState<BacktestInterval>(initialInterval);
  const [bars, setBars] = useState(2_000);
  const [maxHoldBars, setMaxHoldBars] = useState(72);
  const [capital, setCapital] = useState(100_000);
  const [riskProfile, setRiskProfile] = useState<BacktestRiskProfile>('balanced');
  const [commissionPct, setCommissionPct] = useState(0.04);
  const [slippagePct, setSlippagePct] = useState(0.05);
  const [fundingPct, setFundingPct] = useState(0.01);

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [completedConfig, setCompletedConfig] = useState<BacktestRunConfig | null>(null);
  const [completedStrategyName, setCompletedStrategyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [observedRuntimeMs, setObservedRuntimeMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [evidenceTab, setEvidenceTab] = useState<BacktestEvidenceTab>('summary');
  const [chartView, setChartView] = useState<BacktestChartView>('equity');
  const [chartAggregation, setChartAggregation] = useState<BacktestChartAggregation>('cumulative');
  const [history, setHistory] = useState<BacktestHistoryEntry[]>(readBacktestHistory);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [multiResearchOpen, setMultiResearchOpen] = useState(false);
  const [liquidityHunterOpen, setLiquidityHunterOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<BacktestStudioMode>('smart');

  useEffect(() => {
    if (autopilotEnabled && studioMode !== 'smart') setStudioMode('smart');
  }, [autopilotEnabled, studioMode]);

  const abortRef = useRef<AbortController | null>(null);
  const requestGateRef = useRef(new LatestRequestGate());
  const activeConfigKeyRef = useRef('');
  const inFlightConfigKeyRef = useRef<string | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const previousStrategyIdRef = useRef(initialStrategyId);
  const parameterOverrideRef = useRef(Boolean(initialContext?.strategyId === initialStrategyId && initialContext?.strategyParameters && Object.keys(initialContext.strategyParameters).length));

  const strategy = STRATEGY_PRESETS.find((preset) => preset.id === strategyId) ?? STRATEGY_PRESETS[0];
  const supportedIntervals = strategy.supportedIntervals.length ? strategy.supportedIntervals : INTERVAL_OPTIONS;
  const riskPct = RISK_PROFILES.find((profile) => profile.id === riskProfile)?.riskPct ?? 1;

  useEffect(() => {
    if (!supportedIntervals.includes(interval)) setInterval(supportedIntervals[0]);
  }, [interval, supportedIntervals]);

  useEffect(() => {
    if (!strategy.allowedDirections.includes(direction)) setDirection(strategy.allowedDirections[0]);
  }, [direction, strategy.allowedDirections]);

  useEffect(() => {
    if (previousStrategyIdRef.current === strategy.id) return;
    previousStrategyIdRef.current = strategy.id;
    parameterOverrideRef.current = false;
    setParameters(defaultParameters(strategy));
  }, [strategy]);

  useEffect(() => {
    if (selectedSymbol && selectedSymbol !== symbol) setSymbol(selectedSymbol);
  }, [selectedSymbol, symbol]);

  useEffect(() => {
    persistBacktestHistory(history);
  }, [history]);

  useEffect(() => {
    writeWorkspaceContext({ source: 'backtesting', strategyId, strategyName: strategy.name, strategyParameters: parameters, symbol, direction, interval });
  }, [direction, interval, parameters, strategy.name, strategyId, symbol]);

  useEffect(() => {
    if (!loading || runStartedAtRef.current == null) return undefined;
    const update = () => setElapsedMs(performance.now() - (runStartedAtRef.current ?? performance.now()));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [loading]);

  const currentConfig = useMemo<BacktestRunConfig>(() => ({
    strategyId,
    symbol,
    direction,
    interval,
    bars,
    maxHoldBars,
    commissionPct,
    slippagePct,
    fundingPct,
    parameters,
  }), [bars, commissionPct, direction, fundingPct, interval, maxHoldBars, parameters, slippagePct, strategyId, symbol]);

  const activeConfigKey = useMemo(() => buildBacktestConfigKey(currentConfig), [currentConfig]);
  const stale = Boolean(result && completedConfig && activeConfigKey !== buildBacktestConfigKey(completedConfig));

  const marketOptions = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...tickers.filter((ticker) => ticker.symbol === symbol),
      ...tickers.filter((ticker) => ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT'].includes(ticker.symbol)),
      ...tickers,
    ].filter((ticker) => {
      if (seen.has(ticker.symbol)) return false;
      seen.add(ticker.symbol);
      return true;
    }).slice(0, 120);
  }, [symbol, tickers]);

  const {
    optimizationRunning,
    optimizationReport,
    optimizationMessage,
    activeOptimizationProfile,
    runSmartOptimization,
    promoteSmartOptimization,
  } = useBacktestingOptimization({
    strategy,
    symbol,
    interval,
    direction,
    bars,
    maxHoldBars,
    commissionPct,
    slippagePct,
    fundingPct,
    parameterOverrideRef,
    setParameters,
  });

  const {
    trades,
    summary,
    aggregatedEquityData,
    marketData,
    histogramData,
    exposureData,
    dateRangeLabel,
  } = useBacktestDerivedEvidence(result, riskPct, capital, chartAggregation, bars, interval);

  const currentConfigRef = useRef(currentConfig);

  useEffect(() => {
    if (!result) return;
    // A completed replay replaces the empty-state content with a much taller
    // evidence stack. Reset the internal evidence scroller so Coverage &
    // Credibility remains the first thing the user sees after every run.
    resultsRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [result]);

  useLayoutEffect(() => {
    activeConfigKeyRef.current = activeConfigKey;
    currentConfigRef.current = currentConfig;
  }, [activeConfigKey, currentConfig]);

  const cancelBacktest = useCallback((reason = 'The active browser request was cancelled. No completion is claimed.') => {
    if (!inFlightConfigKeyRef.current) return;
    requestGateRef.current.invalidate();
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightConfigKeyRef.current = null;
    runStartedAtRef.current = null;
    setLoading(false);
    setCancelled(true);
    setCancelReason(reason);
  }, []);

  const resetBacktestBuilder = useCallback(() => {
    if (loading) {
      cancelBacktest('The active backtest was cancelled because the configuration was reset.');
    }
    setBars(2_000);
    setMaxHoldBars(72);
    setCapital(100_000);
    setRiskProfile('balanced');
    setCommissionPct(0.04);
    setSlippagePct(0.05);
    setFundingPct(0.01);
    parameterOverrideRef.current = false;
    setParameters(defaultParameters(strategy));
    setDirection(strategy.allowedDirections[0] ?? 'LONG');
    setInterval(supportedIntervals[0]);
  }, [cancelBacktest, loading, strategy, supportedIntervals]);

  useEffect(() => {
    if (loading && inFlightConfigKeyRef.current && inFlightConfigKeyRef.current !== activeConfigKey) {
      cancelBacktest('Backtest cancelled because the run configuration changed. The previous completed result remains visible.');
    }
  }, [activeConfigKey, cancelBacktest, loading]);

  const runBacktest = useCallback(async (source: 'manual' | 'smart' = 'manual'): Promise<BacktestResult | null> => {
    if (strategy.disabled) return null;
    abortRef.current?.abort();
    const controller = new AbortController();
    const activeRequestConfig = currentConfigRef.current;
    const requestConfig: BacktestRunConfig = {
      ...activeRequestConfig,
      parameters: { ...activeRequestConfig.parameters },
    };
    const requestConfigKey = buildBacktestConfigKey(requestConfig);
    const requestId = requestGateRef.current.begin(requestConfigKey);
    const requestStrategyName = strategy.name;
    abortRef.current = controller;
    inFlightConfigKeyRef.current = requestConfigKey;
    runStartedAtRef.current = performance.now();
    setLoading(true);
    setError(null);
    setCancelled(false);
    setCancelReason(null);
    setElapsedMs(0);

    try {
      const query = buildBacktestQuery({ ...requestConfig, configKey: requestConfigKey });
      const response = await fetch(`/api/market/backtest?${query.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'X-APEX-Backtest-Source': source },
      });
      const payload = await response.json().catch(() => ({})) as BacktestResult & { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || `Backtest failed with status ${response.status}`);
      const observed = performance.now() - (runStartedAtRef.current ?? performance.now());
      if (!requestGateRef.current.isCurrent(requestId, activeConfigKeyRef.current)) return null;
      setResult(payload);
      setCompletedConfig(requestConfig);
      setCompletedStrategyName(requestStrategyName);
      setObservedRuntimeMs(observed);
      setEvidenceTab(payload.timeline?.length ? 'trades' : 'summary');
      setChartView('equity');
      return payload;
    } catch (caught) {
      if (!requestGateRef.current.isCurrent(requestId)) return null;
      const observed = performance.now() - (runStartedAtRef.current ?? performance.now());
      setObservedRuntimeMs(observed);
      if (isBacktestAbortError(caught)) {
        setCancelled(true);
        setCancelReason('The active browser request was cancelled. No completion is claimed.');
      } else {
        setError(caught instanceof Error ? caught.message : 'The backtest could not be completed.');
      }
      return null;
    } finally {
      if (requestGateRef.current.isCurrent(requestId)) {
        if (abortRef.current === controller) abortRef.current = null;
        inFlightConfigKeyRef.current = null;
        runStartedAtRef.current = null;
        setLoading(false);
      }
    }
  }, [strategy.disabled, strategy.name]);

  const {
    smartCheckpoint,
    smartRunning,
    smartStopping,
    stopSmartBacktest,
    startSmartBacktest,
    resumeSmartBacktest,
  } = useSmartBacktestLoop({
    strategyDisabled: Boolean(strategy.disabled),
    loading,
    activeConfigKey,
    activeConfigKeyRef,
    runBacktest,
    runSmartOptimization,
    cancelBacktest,
    setStudioMode,
  });

  const smartResumable = Boolean(smartCheckpoint && ['checkpointed', 'stopped', 'failed'].includes(smartCheckpoint.status));

  const {
    presets,
    notes,
    handleSavePreset,
    handleDeletePreset,
    handleApplyPreset,
    handleSaveNote,
    handleClearNote,
  } = useBacktestingPresetsAndNotes({
    strategyId, symbol, direction, interval, bars, maxHoldBars, capital, riskProfile,
    commissionPct, slippagePct, fundingPct, parameters, loading, onSelectSymbol,
    setStrategyId, setSymbol, setDirection, setInterval, setBars, setMaxHoldBars,
    setCapital, setRiskProfile, setCommissionPct, setSlippagePct, setFundingPct,
    setParameters, parameterOverrideRef, previousStrategyIdRef, result, completedConfig,
  });

  useBacktestHistorySync({
    result,
    completedConfig,
    completedStrategyName,
    setHistory,
  });

  const runIdentity = useMemo(() => {
    const identityConfig = result && completedConfig ? completedConfig : currentConfig;
    const identityStrategyName = result && completedStrategyName ? completedStrategyName : strategy.name;
    return buildBacktestRunIdentity({
      result,
      strategyId: identityConfig.strategyId,
      strategyName: identityStrategyName,
      symbol: identityConfig.symbol,
      direction: identityConfig.direction,
      interval: identityConfig.interval,
      requestedBars: identityConfig.bars,
      maxHoldBars: identityConfig.maxHoldBars,
      runtimeMs: observedRuntimeMs,
    });
  }, [completedConfig, completedStrategyName, currentConfig, observedRuntimeMs, result, strategy.name]);

  function selectMarket(nextSymbol: string) {
    setSymbol(nextSymbol);
    onSelectSymbol(nextSymbol);
  }

  function cycleDateRange() {
    const currentIndex = BAR_OPTIONS.indexOf(bars as typeof BAR_OPTIONS[number]);
    setBars(BAR_OPTIONS[currentIndex === -1 ? 0 : (currentIndex + 1) % BAR_OPTIONS.length]);
  }

  function exportResult() {
    if (!result) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      provenance: {
        source: result.source,
        runId: result.audit?.runId,
        engine: result.audit?.engine,
        generatedAt: result.audit?.generatedAt,
        dataState: result.dataState,
      },
      runConfiguration: completedConfig,
      canonicalResult: result,
      localDisplayCalculation: {
        riskProfile,
        riskPct,
        startingCapital: capital,
        finalBalance: summary.finalBalance,
        netReturnPct: summary.netReturnPct,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `apex-backtest-${result.symbol}-${result.direction.toLowerCase()}-${result.interval}-${result.requestedBars ?? result.candlesUsed}bars.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function toggleResultsFullscreen() {
    if (!resultsRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await resultsRef.current.requestFullscreen?.().catch(() => undefined);
  }

  const retainedResultNotice = result && (loading || Boolean(error) || cancelled);
  const noResultState = !result && !loading && !error && !cancelled;

  const completedRunId = result?.audit?.runId ?? null;
  const activeNote = completedRunId ? notes[completedRunId] : undefined;
  const activeRunLabel = result ? `${result.symbol} · ${result.direction} · ${result.interval}` : '';
  const suggestedPresetName = `${strategy.name} · ${symbol} ${direction === 'LONG' ? 'Long' : 'Short'} ${interval}`;

  return (
    <section className="apex-backtest-workspace apex-bt-polish-v1066" aria-label="Backtesting workspace">
      <BacktestingTopBar
        studioMode={studioMode}
        onStudioModeChange={setStudioMode}
        manualDisabled={Boolean(autopilotEnabled)}
        onOpenMultiResearch={() => setMultiResearchOpen(true)}
        onOpenLiquidityHunter={() => setLiquidityHunterOpen(true)}
      />


      <div className="apex-bt-layout apex-bt-layout-modernized">
        <BacktestRunBuilder
          studioMode={studioMode}
          smartCheckpoint={smartCheckpoint}
          smartRunning={smartRunning}
          smartStopping={smartStopping}
          smartResumable={smartResumable}
          onSmartStart={() => void startSmartBacktest(false)}
          onSmartStop={stopSmartBacktest}
          onSmartResume={resumeSmartBacktest}
          smartPhaseLabel={smartCheckpoint ? phaseLabel(smartCheckpoint.status) : 'idle'}
          strategies={STRATEGY_PRESETS}
          strategy={strategy}
          strategyId={strategyId}
          onStrategyChange={setStrategyId}
          marketOptions={marketOptions}
          symbol={symbol}
          onSymbolChange={selectMarket}
          direction={direction}
          onDirectionChange={setDirection}
          interval={interval}
          supportedIntervals={supportedIntervals}
          intervalOptions={INTERVAL_OPTIONS}
          onIntervalChange={setInterval}
          bars={bars}
          barOptions={BAR_OPTIONS}
          onBarsChange={setBars}
          maxHoldBars={maxHoldBars}
          holdOptions={HOLD_OPTIONS}
          onMaxHoldBarsChange={setMaxHoldBars}
          dateRangeLabel={dateRangeLabel}
          onCycleDateRange={cycleDateRange}
          capital={capital}
          onCapitalChange={(value) => setCapital(clampNumber(value, 100_000, 100, 1_000_000_000))}
          riskProfile={riskProfile}
          riskProfiles={RISK_PROFILES}
          onRiskProfileChange={setRiskProfile}
          commissionPct={commissionPct}
          slippagePct={slippagePct}
          fundingPct={fundingPct}
          parameters={parameters}
          onParameterChange={(key, value) => { parameterOverrideRef.current = true; setParameters((current) => ({ ...current, [key]: value })); }}
          onCommissionChange={(value) => setCommissionPct(clampNumber(value, 0.04, 0, 5))}
          onSlippageChange={(value) => setSlippagePct(clampNumber(value, 0.05, 0, 5))}
          onFundingChange={(value) => setFundingPct(clampNumber(value, 0.01, 0, 5))}
          loading={loading}
          stale={stale}
          result={result}
          error={error}
          cancelled={cancelled}
          cancelReason={cancelReason}
          elapsedMs={loading ? elapsedMs : observedRuntimeMs}
          routeDataState={dataState}
          onRun={() => void runBacktest()}
          onCancel={() => cancelBacktest()}
          presets={presets}
          suggestedPresetName={suggestedPresetName}
          onSavePreset={handleSavePreset}
          onApplyPreset={handleApplyPreset}
          onDeletePreset={handleDeletePreset}
          onReset={resetBacktestBuilder}
          optimizationRunning={optimizationRunning}
          optimizationMessage={optimizationMessage}
          optimizationEligible={Boolean(optimizationReport?.promotion.eligible)}
          optimizationPromoted={Boolean(activeOptimizationProfile && optimizationReport && activeOptimizationProfile.sourceReportAt === optimizationReport.generatedAt)}
          optimizationDevelopmentPnlPct={optimizationReport?.developmentValidation.candidate.metrics.totalPnlPct ?? null}
          optimizationDevelopmentImprovement={optimizationReport?.promotion.developmentValidationImprovement ?? null}
          optimizationNeighborPassRate={optimizationReport?.promotion.neighborPassRate ?? null}
          activeOptimizationRevision={activeOptimizationProfile?.revision ?? null}
          autopilotEnabled={autopilotEnabled}
          autopilotPhase={autopilotController?.phase ?? null}
          autopilotPhaseText={autopilotController?.phaseText ?? null}
          autopilotDisconnected={Boolean(autopilotController?.transportError)}
          onRunOptimization={() => void runSmartOptimization()}
          onPromoteOptimization={() => void promoteSmartOptimization()}
        />

        <main ref={resultsRef} className="apex-bt-results apex-bt-card apex-bt-evidence-area">
          <div className="apex-bt-evidence-toolbar">
            <div><span>Evidence Area</span><small>Canonical server result and separately labelled local display calculations</small></div>
            <div>
              <button type="button" disabled={!result} onClick={exportResult} title="Export result JSON"><Download size={14} />Export</button>
              <button type="button" onClick={() => void toggleResultsFullscreen()} title="Toggle full screen"><Maximize2 size={14} />Full screen</button>
            </div>
          </div>

          <div className="apex-bt-preflight-guidance" role="note">
            <Info size={14} aria-hidden="true" />
            <span><strong>Use the primary Run Backtest action</strong> in the configuration builder after reviewing strategy, market, interval, costs, and risk. Evidence-area rerun controls submit the same canonical server backtest contract.</span>
          </div>

          <BacktestCoverageCredibilityPanel result={result} config={result && completedConfig ? completedConfig : currentConfig} loading={loading} />

          <BacktestRunHeader
            identity={runIdentity}
            result={result}
            stale={stale}
            loading={loading && !result}
            cancelled={cancelled && !result}
            error={result ? null : error}
            blocked={strategy.disabled}
          />

          {retainedResultNotice && <div className={`apex-bt-previous-result ${error ? 'error' : cancelled ? 'cancelled' : 'running'}`}>
            {error || cancelled ? <TriangleAlert size={13} /> : <Clock3 size={13} />}
            <span>{error
              ? `The latest request failed: ${error}. The previous completed result remains visible and is not replaced.`
              : cancelled
                ? cancelReason || 'The latest request was cancelled. The previous completed result remains visible and is not replaced.'
                : 'Previous completed result remains visible while the new request is running.'}</span>
          </div>}

          {!result ? (
            <>
              {!noResultState && (
                <section className={`apex-bt-request-state ${error ? 'error' : cancelled ? 'cancelled' : 'running'}`} aria-live="polite">
                  {error || cancelled ? <TriangleAlert size={24} /> : <Clock3 size={24} className="spin" />}
                  <strong>{error ? 'Backtest failed' : cancelled ? 'Backtest cancelled' : 'Backtest running'}</strong>
                  <p>{error || (cancelled ? cancelReason || 'The active browser request was cancelled. No completion is claimed.' : `Elapsed ${elapsedMs == null ? '—' : `${(elapsedMs / 1_000).toFixed(1)} s`}. The server does not expose progress counts, so no percentage is invented.`)}</p>
                </section>
              )}
              <BacktestEquityPanel
                result={null}
                loading={loading}
                error={error}
                view={chartView}
                onViewChange={setChartView}
                aggregation={chartAggregation}
                onAggregationChange={setChartAggregation}
                equityData={[]}
                marketData={[]}
                histogramData={[]}
                exposureData={[]}
                trades={[]}
              />
              <BacktestMetricStrip result={null} localFinalBalance={summary.finalBalance} startingCapital={capital} localRiskPct={riskPct} />
              <p className="apex-bt-integrity-note" role="note">No fake KPI values or chart points are rendered before a result exists.</p>
              <BacktestEvidenceTabs
                active={evidenceTab}
                onChange={setEvidenceTab}
                result={null}
                routeDataState={dataState}
                direction={direction}
                trades={[]}
                summary={summary}
                configuredCosts={{ commissionPct, slippagePct, fundingPct }}
                observedRuntimeMs={observedRuntimeMs}
                history={history}
                historyExpanded={historyExpanded}
                onToggleHistory={() => setHistoryExpanded((value) => !value)}
                onOpenAllTrades={() => setEvidenceTab('trades')}
                activeRunId={null}
                activeRunLabel=""
                savedNote={undefined}
                onSaveNote={() => undefined}
                onClearNote={() => undefined}
                onRun={() => void runBacktest()}
                canRun={!strategy.disabled}
                loading={loading}
              />
            </>
          ) : (
            <>
              <BacktestEquityPanel
                result={result}
                loading={loading}
                error={error}
                view={chartView}
                onViewChange={setChartView}
                aggregation={chartAggregation}
                onAggregationChange={setChartAggregation}
                equityData={aggregatedEquityData}
                marketData={marketData}
                histogramData={histogramData}
                exposureData={exposureData}
                trades={trades}
              />
              <BacktestMetricStrip result={result} localFinalBalance={summary.finalBalance} startingCapital={capital} localRiskPct={riskPct} />
              <BacktestEvidenceTabs
                active={evidenceTab}
                onChange={setEvidenceTab}
                result={result}
                routeDataState={dataState}
                direction={completedConfig?.direction ?? direction}
                trades={trades}
                summary={summary}
                configuredCosts={{
                  commissionPct: completedConfig?.commissionPct ?? commissionPct,
                  slippagePct: completedConfig?.slippagePct ?? slippagePct,
                  fundingPct: completedConfig?.fundingPct ?? fundingPct,
                }}
                observedRuntimeMs={observedRuntimeMs}
                history={history}
                historyExpanded={historyExpanded}
                onToggleHistory={() => setHistoryExpanded((value) => !value)}
                onOpenAllTrades={() => setEvidenceTab('trades')}
                activeRunId={completedRunId}
                activeRunLabel={activeRunLabel}
                savedNote={activeNote}
                onSaveNote={handleSaveNote}
                onClearNote={handleClearNote}
                onRun={() => void runBacktest()}
                canRun={!strategy.disabled}
                loading={loading}
              />
            </>
          )}
        </main>

        <BacktestEvidenceRail
          result={result}
          routeDataState={dataState}
          config={result && completedConfig ? completedConfig : currentConfig}
          history={history}
          onExport={exportResult}
          onOpenHistory={() => { setEvidenceTab('history'); setHistoryExpanded(true); resultsRef.current?.scrollIntoView({ block: 'nearest' }); }}
          onOpenDataQuality={() => { setEvidenceTab('data-quality'); resultsRef.current?.scrollIntoView({ block: 'nearest' }); }}
          onOpenRuntime={() => { setEvidenceTab('runtime'); resultsRef.current?.scrollIntoView({ block: 'nearest' }); }}
          canExport={Boolean(result)}
        />
      </div>

      {result?.disclaimer && <div className="apex-bt-disclaimer"><Info size={13} /><span>{result.disclaimer}</span></div>}
      {multiResearchOpen && <MultiStrategyResearchPanel
        strategies={STRATEGY_PRESETS}
        markets={marketOptions}
        initialStrategyId={strategyId}
        initialSymbol={symbol}
        interval={interval}
        direction={direction}
        bars={bars}
        maxHoldBars={maxHoldBars}
        transactionCostPct={(commissionPct + slippagePct) * 2 + fundingPct}
        onClose={() => setMultiResearchOpen(false)}
      />}
      {liquidityHunterOpen && <LiquidityHunterReplayPanel onClose={() => setLiquidityHunterOpen(false)} />}
    </section>
  );
}
