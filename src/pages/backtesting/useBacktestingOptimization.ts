import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { SymbolTicker, TradeDirection } from '../../types';
import { apiMutate } from '../../services/apiMutate';
import type { StrategyOptimizationReport } from '../../services/strategyOptimization';
import type { StrategyOptimizationProfile } from '../../services/strategyOptimizationStore';
import type { BacktestInterval, BacktestStrategyPreset } from './backtestingTypes';

const SMART_AUTOPILOT_CYCLE_KEY = 'apex:smart-autopilot-cycle:v1';

interface SmartAutopilotCyclePayload {
  cycleIndex: number;
  plan: { totalContexts: number; contexts: Array<{ strategyId: string; symbol: string; interval: string; direction: 'LONG' | 'SHORT' }> };
  optimization: { completed: number; failed: number; promoted: number };
  multiAgent: { council: { approvedJobs: number; vetoedJobs: number }; paperTradePlan: unknown[] } | null;
  runtime: { elapsedMs: number; optimizerConcurrency: number };
}

function readSmartAutopilotCycleIndex(): number {
  if (typeof window === 'undefined') return 0;
  const parsed = Number(window.localStorage.getItem(SMART_AUTOPILOT_CYCLE_KEY) || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

interface UseBacktestingOptimizationArgs {
  strategy: BacktestStrategyPreset;
  symbol: string;
  interval: BacktestInterval;
  direction: TradeDirection;
  bars: number;
  maxHoldBars: number;
  commissionPct: number;
  slippagePct: number;
  fundingPct: number;
  capital: number;
  riskPct: number;
  marketOptions: SymbolTicker[];
  autopilotEnabled: boolean;
  /**
   * True when the server scheduler is already running the loop. The client then
   * stops driving cycles itself so there is exactly one cycle driver.
   */
  serverDriven?: boolean;
  parameterOverrideRef: MutableRefObject<boolean>;
  setParameters: Dispatch<SetStateAction<Record<string, number | string>>>;
}

export function useBacktestingOptimization({
  strategy,
  symbol,
  interval,
  direction,
  bars,
  maxHoldBars,
  commissionPct,
  slippagePct,
  fundingPct,
  capital,
  riskPct,
  marketOptions,
  autopilotEnabled,
  serverDriven = false,
  parameterOverrideRef,
  setParameters,
}: UseBacktestingOptimizationArgs) {
  const [autopilotStatus, setAutopilotStatus] = useState<{ at: number; ok: boolean; message: string } | null>(null);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [optimizationRunning, setOptimizationRunning] = useState(false);
  const [optimizationReport, setOptimizationReport] = useState<StrategyOptimizationReport | null>(null);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);
  const [activeOptimizationProfile, setActiveOptimizationProfile] = useState<StrategyOptimizationProfile | null>(null);

  const autopilotInFlightRef = useRef(false);
  const autopilotCycleIndexRef = useRef<number>(readSmartAutopilotCycleIndex());
  const autopilotAbortRef = useRef<AbortController | null>(null);
  const optimizationAbortRef = useRef<AbortController | null>(null);
  const optimizationRequestRef = useRef(0);

  const mergePromotedParameters = useCallback((profile: StrategyOptimizationProfile, force = false): boolean => {
    setActiveOptimizationProfile(profile);
    const shouldApply = force || !parameterOverrideRef.current;
    if (shouldApply) {
      parameterOverrideRef.current = false;
      setParameters((current) => ({ ...current, ...profile.parameters }));
    }
    return shouldApply;
  }, [parameterOverrideRef, setParameters]);

  useEffect(() => {
    optimizationRequestRef.current += 1;
    optimizationAbortRef.current?.abort();
    optimizationAbortRef.current = null;
    setOptimizationRunning(false);
    setOptimizationReport(null);
    setActiveOptimizationProfile(null);
    setOptimizationMessage(null);

    const controller = new AbortController();
    const requestId = ++optimizationRequestRef.current;
    optimizationAbortRef.current = controller;
    const query = new URLSearchParams({ symbol, interval, direction });
    void fetch(`/api/strategies/${encodeURIComponent(strategy.id)}/optimization?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json().catch(() => null) as Promise<{ activeProfile?: StrategyOptimizationProfile | null; latestReport?: StrategyOptimizationReport | null } | null>;
      })
      .then((payload) => {
        if (!payload || requestId !== optimizationRequestRef.current) return;
        setOptimizationReport(payload.latestReport ?? null);
        if (payload.activeProfile) {
          const applied = mergePromotedParameters(payload.activeProfile, false);
          if (!applied) setOptimizationMessage(`Active optimizer revision r${payload.activeProfile.revision} exists for this context, but your explicit parameter overrides remain authoritative.`);
        }
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError') && requestId === optimizationRequestRef.current) {
          setOptimizationMessage('Optimizer state could not be loaded; manual replay remains available.');
        }
      })
      .finally(() => {
        if (optimizationAbortRef.current === controller) optimizationAbortRef.current = null;
      });

    return () => controller.abort();
  }, [direction, interval, mergePromotedParameters, strategy.id, symbol]);

  const runSmartOptimization = useCallback(async () => {
    if (strategy.disabled || optimizationRunning) return;
    optimizationAbortRef.current?.abort();
    const controller = new AbortController();
    optimizationAbortRef.current = controller;
    const requestId = ++optimizationRequestRef.current;
    setOptimizationRunning(true);
    setOptimizationMessage(null);
    try {
      const response = await apiMutate(`/api/strategies/${encodeURIComponent(strategy.id)}/optimize`, {
        method: 'POST',
        body: JSON.stringify({
          symbol, interval, direction, maxBars: maxHoldBars, bars: Math.max(2_500, bars),
          coarseCandidates: 36, refinementCandidates: 16, maxConcurrent: 4,
          commissionPct, slippagePct, fundingPct, autoPromote: false,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        report?: StrategyOptimizationReport;
        activeProfile?: StrategyOptimizationProfile | null;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.report) throw new Error(payload.message || payload.error || `Optimization failed (${response.status}).`);
      if (requestId !== optimizationRequestRef.current) return;
      setOptimizationReport(payload.report);
      setActiveOptimizationProfile(payload.activeProfile ?? null);
      const holdout = payload.report.holdout.candidate.metrics.totalPnlPct;
      setOptimizationMessage(payload.report.promotion.eligible
        ? `Candidate passed robust promotion gates with ${holdout >= 0 ? '+' : ''}${holdout.toFixed(2)}% untouched-holdout P&L. Review and promote it before the next replay.`
        : `No robust positive candidate was promoted. ${payload.report.promotion.blockers.join(', ') || 'The evidence gates were not satisfied.'}`);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError') && requestId === optimizationRequestRef.current) {
        setOptimizationMessage(caught instanceof Error ? caught.message : 'Optimization failed.');
      }
    } finally {
      if (requestId === optimizationRequestRef.current) setOptimizationRunning(false);
      if (optimizationAbortRef.current === controller) optimizationAbortRef.current = null;
    }
  }, [bars, commissionPct, direction, fundingPct, interval, maxHoldBars, optimizationRunning, slippagePct, strategy.disabled, strategy.id, symbol]);

  const promoteSmartOptimization = useCallback(async () => {
    if (!optimizationReport?.promotion.eligible || optimizationRunning) return;
    const requestId = ++optimizationRequestRef.current;
    setOptimizationRunning(true);
    setOptimizationMessage('Promoting the reviewed exact-context candidate…');
    try {
      const response = await apiMutate(`/api/strategies/${encodeURIComponent(strategy.id)}/optimization/promote`, {
        method: 'POST',
        body: JSON.stringify({ symbol, interval, direction, reportGeneratedAt: optimizationReport.generatedAt }),
      });
      const payload = await response.json().catch(() => ({})) as { activeProfile?: StrategyOptimizationProfile; message?: string; error?: string };
      if (!response.ok || !payload.activeProfile) throw new Error(payload.message || payload.error || `Promotion failed (${response.status}).`);
      if (requestId !== optimizationRequestRef.current) return;
      mergePromotedParameters(payload.activeProfile, true);
      setOptimizationMessage(`Revision r${payload.activeProfile.revision} is active for this exact strategy/market/timeframe/direction. The next replay will use the promoted profile unless you deliberately override a parameter.`);
    } catch (caught) {
      if (requestId === optimizationRequestRef.current) setOptimizationMessage(caught instanceof Error ? caught.message : 'Promotion failed.');
    } finally {
      if (requestId === optimizationRequestRef.current) setOptimizationRunning(false);
    }
  }, [direction, interval, mergePromotedParameters, optimizationReport, optimizationRunning, strategy.id, symbol]);

  const runAutopilotOptimization = useCallback(async () => {
    if (!autopilotEnabled || autopilotInFlightRef.current) return;
    const controller = new AbortController();
    autopilotInFlightRef.current = true;
    autopilotAbortRef.current = controller;
    setAutopilotRunning(true);
    const cycleIndex = autopilotCycleIndexRef.current;
    setAutopilotStatus({ at: Date.now(), ok: true, message: `Smart Autopilot cycle ${cycleIndex + 1} is tuning strategy × market × timeframe × direction contexts…` });
    try {
      const response = await apiMutate('/api/strategies/autopilot/cycle', {
        method: 'POST',
        body: JSON.stringify({
          cycleIndex,
          symbol,
          symbols: marketOptions.slice(0, 4).map((ticker) => ticker.symbol),
          preferredInterval: interval,
          maxContexts: 6,
          bars: Math.max(3_000, bars),
          maxHoldBars,
          optimizerConcurrency: 2,
          coarseCandidates: 20,
          refinementCandidates: 8,
          commissionPct,
          slippagePct,
          fundingPct,
          paperCapitalUsd: capital,
          portfolioRiskPct: riskPct,
          maxDirectionalWeight: 0.7,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as { cycle?: SmartAutopilotCyclePayload; message?: string; error?: string };
      if (!response.ok || !payload.cycle) throw new Error(payload.message || payload.error || `Smart Autopilot cycle failed (${response.status}).`);

      const cycle = payload.cycle;
      autopilotCycleIndexRef.current = cycleIndex + 1;
      if (typeof window !== 'undefined') window.localStorage.setItem(SMART_AUTOPILOT_CYCLE_KEY, String(autopilotCycleIndexRef.current));

      const query = new URLSearchParams({ symbol, interval, direction });
      const activeResponse = await fetch(`/api/strategies/${encodeURIComponent(strategy.id)}/optimization?${query.toString()}`, { signal: controller.signal });
      if (activeResponse.ok) {
        const activePayload = await activeResponse.json().catch(() => ({})) as { activeProfile?: StrategyOptimizationProfile | null; latestReport?: StrategyOptimizationReport | null };
        if (activePayload.latestReport) setOptimizationReport(activePayload.latestReport);
        if (activePayload.activeProfile) mergePromotedParameters(activePayload.activeProfile, false);
      }

      const paperCandidates = cycle.multiAgent?.council.approvedJobs ?? 0;
      const message = `Cycle ${cycle.cycleIndex + 1}: tuned ${cycle.optimization.completed}/${cycle.plan.contexts.length} contexts, promoted ${cycle.optimization.promoted}, ${paperCandidates} paper candidate${paperCandidates === 1 ? '' : 's'} survived the multi-agent council.`;
      setAutopilotStatus({ at: Date.now(), ok: cycle.optimization.failed === 0, message });
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setAutopilotStatus({ at: Date.now(), ok: false, message: caught instanceof Error ? caught.message : 'Smart Autopilot cycle failed.' });
      }
    } finally {
      if (autopilotAbortRef.current === controller) {
        autopilotAbortRef.current = null;
        autopilotInFlightRef.current = false;
        setAutopilotRunning(false);
      }
    }
  }, [autopilotEnabled, bars, capital, commissionPct, direction, fundingPct, interval, marketOptions, maxHoldBars, mergePromotedParameters, riskPct, slippagePct, strategy.id, symbol]);

  useEffect(() => {
    if (!autopilotEnabled) return undefined;
    // The server controller owns the cadence whenever its background loop is
    // armed. Running the client timer too would double-drive the same cycle
    // route and make the reported phase disagree with what is actually running.
    if (serverDriven) return undefined;
    void runAutopilotOptimization();
    const timer = window.setInterval(() => void runAutopilotOptimization(), 5 * 60_000);
    return () => {
      window.clearInterval(timer);
      autopilotAbortRef.current?.abort();
      autopilotAbortRef.current = null;
      autopilotInFlightRef.current = false;
      setAutopilotRunning(false);
    };
  }, [autopilotEnabled, runAutopilotOptimization, serverDriven]);

  useEffect(() => () => {
    optimizationRequestRef.current += 1;
    optimizationAbortRef.current?.abort();
    autopilotAbortRef.current?.abort();
  }, []);

  return {
    autopilotStatus,
    autopilotRunning,
    optimizationRunning,
    optimizationReport,
    optimizationMessage,
    activeOptimizationProfile,
    runSmartOptimization,
    promoteSmartOptimization,
  };
}
