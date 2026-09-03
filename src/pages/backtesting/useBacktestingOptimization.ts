import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { TradeDirection } from '../../types';
import { apiMutate } from '../../services/apiMutate';
import type { StrategyOptimizationReport } from '../../services/strategyOptimization';
import type { StrategyOptimizationProfile } from '../../services/strategyOptimizationStore';
import type { BacktestInterval, BacktestStrategyPreset } from './backtestingTypes';

export interface SmartOptimizationOutcome {
  advanced: boolean;
  message: string;
  report: StrategyOptimizationReport;
  activeProfile: StrategyOptimizationProfile | null;
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
  parameterOverrideRef,
  setParameters,
}: UseBacktestingOptimizationArgs) {
  const [optimizationRunning, setOptimizationRunning] = useState(false);
  const [optimizationReport, setOptimizationReport] = useState<StrategyOptimizationReport | null>(null);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);
  const [activeOptimizationProfile, setActiveOptimizationProfile] = useState<StrategyOptimizationProfile | null>(null);

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

  const runSmartOptimization = useCallback(async (autoAdvance = false): Promise<SmartOptimizationOutcome | null> => {
    if (strategy.disabled || optimizationRunning) return null;
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
      if (requestId !== optimizationRequestRef.current) return null;
      setOptimizationReport(payload.report);
      setActiveOptimizationProfile(payload.activeProfile ?? null);
      const developmentValidation = payload.report.developmentValidation.candidate.metrics.totalPnlPct;
      if (!payload.report.promotion.eligible) {
        const message = `No robust positive candidate advanced. ${payload.report.promotion.blockers.join(', ') || 'The evidence gates were not satisfied.'}`;
        setOptimizationMessage(message);
        return { advanced: false, message, report: payload.report, activeProfile: payload.activeProfile ?? null };
      }

      if (!autoAdvance) {
        const message = `Candidate passed development gates with ${developmentValidation >= 0 ? '+' : ''}${developmentValidation.toFixed(2)}% development-validation P&L. Promotion still requires candidate-matched FULL_STRATEGY final validation.`;
        setOptimizationMessage(message);
        return { advanced: false, message, report: payload.report, activeProfile: payload.activeProfile ?? null };
      }

      // Smart Backtest must advance to a genuinely different evidence subject.
      // Promote only the exact development-eligible research profile after the backend final-validation gate, then apply it
      // locally. This changes no live-order authority.
      const promoteResponse = await apiMutate(`/api/strategies/${encodeURIComponent(strategy.id)}/optimization/promote`, {
        method: 'POST',
        body: JSON.stringify({ symbol, interval, direction, reportGeneratedAt: payload.report.generatedAt }),
        signal: controller.signal,
      });
      const promoted = await promoteResponse.json().catch(() => ({})) as { activeProfile?: StrategyOptimizationProfile; message?: string; error?: string };
      if (!promoteResponse.ok || !promoted.activeProfile) {
        throw new Error(promoted.message || promoted.error || `Automatic research-profile advance failed (${promoteResponse.status}).`);
      }
      if (requestId !== optimizationRequestRef.current) return null;
      mergePromotedParameters(promoted.activeProfile, true);
      const message = `Smart Backtest advanced to research revision r${promoted.activeProfile.revision} after all promotion gates passed. The next replay uses that exact profile; live execution remains disabled.`;
      setOptimizationMessage(message);
      return { advanced: true, message, report: payload.report, activeProfile: promoted.activeProfile };
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError') && requestId === optimizationRequestRef.current) {
        setOptimizationMessage(caught instanceof Error ? caught.message : 'Optimization failed.');
      }
      return null;
    } finally {
      if (requestId === optimizationRequestRef.current) setOptimizationRunning(false);
      if (optimizationAbortRef.current === controller) optimizationAbortRef.current = null;
    }
  }, [bars, commissionPct, direction, fundingPct, interval, maxHoldBars, mergePromotedParameters, optimizationRunning, slippagePct, strategy.disabled, strategy.id, symbol]);

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

  useEffect(() => () => {
    optimizationRequestRef.current += 1;
    optimizationAbortRef.current?.abort();
  }, []);

  return {
    optimizationRunning,
    optimizationReport,
    optimizationMessage,
    activeOptimizationProfile,
    runSmartOptimization,
    promoteSmartOptimization,
  };
}
