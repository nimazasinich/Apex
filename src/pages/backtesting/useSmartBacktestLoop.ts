import { useCallback, useRef, useState } from 'react';
import type { BacktestResult } from '../../types';
import type { BacktestStudioMode, SmartBacktestCheckpoint, SmartBacktestPhase } from './backtestingTypes';
import {
  SMART_MAX_ITERATIONS,
  SMART_MAX_RUNTIME_MS,
  SMART_NO_IMPROVEMENT_LIMIT,
  SMART_ITERATION_PAUSE_MS,
  readSmartCheckpoint,
  persistSmartCheckpoint,
  scoreSmartBacktest,
} from './backtestCheckpointStorage';

interface UseSmartBacktestLoopOptions {
  strategyDisabled: boolean;
  loading: boolean;
  activeConfigKey: string;
  activeConfigKeyRef: React.MutableRefObject<string>;
  runBacktest: (source?: 'manual' | 'smart') => Promise<BacktestResult | null>;
  runSmartOptimization: () => Promise<void>;
  cancelBacktest: (reason?: string) => void;
  setStudioMode: (mode: BacktestStudioMode) => void;
}

export function useSmartBacktestLoop({
  strategyDisabled,
  loading,
  activeConfigKey,
  activeConfigKeyRef,
  runBacktest,
  runSmartOptimization,
  cancelBacktest,
  setStudioMode,
}: UseSmartBacktestLoopOptions) {
  const [smartCheckpoint, setSmartCheckpointState] = useState<SmartBacktestCheckpoint | null>(readSmartCheckpoint);
  const [smartRunning, setSmartRunning] = useState(false);
  const [smartStopping, setSmartStopping] = useState(false);
  const smartStopRequestedRef = useRef(false);

  const setSmartCheckpoint = useCallback((next: SmartBacktestCheckpoint | null | ((current: SmartBacktestCheckpoint | null) => SmartBacktestCheckpoint | null)) => {
    setSmartCheckpointState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      persistSmartCheckpoint(resolved);
      return resolved;
    });
  }, []);

  const updateSmartCheckpoint = useCallback((patch: Partial<SmartBacktestCheckpoint> | ((current: SmartBacktestCheckpoint | null) => SmartBacktestCheckpoint)) => {
    setSmartCheckpoint((current) => {
      if (typeof patch === 'function') return patch(current);
      const now = Date.now();
      const base: SmartBacktestCheckpoint = current ?? {
        id: `smart-${now}`,
        status: 'idle',
        iteration: 0,
        maxIterations: SMART_MAX_ITERATIONS,
        noImprovementIterations: 0,
        maxRuntimeMs: SMART_MAX_RUNTIME_MS,
        startedAt: now,
        updatedAt: now,
        elapsedMs: 0,
        configKey: activeConfigKeyRef.current,
        bestScore: null,
        latestScore: null,
        bestRunId: null,
        latestRunId: null,
        bestNetReturnPct: null,
        latestNetReturnPct: null,
        latestTradeCount: null,
        stopReason: null,
        lastChange: 'Smart setup confirmed the selected strategy, market, timeframe, costs, and risk profile.',
        nextAction: 'Start a canonical backtest, evaluate the result, then run safe optimization if evidence supports it.',
      };
      return { ...base, ...patch, updatedAt: now, elapsedMs: now - base.startedAt };
    });
  }, [activeConfigKeyRef, setSmartCheckpoint]);

  const stopSmartBacktest = useCallback(() => {
    smartStopRequestedRef.current = true;
    setSmartStopping(true);
    cancelBacktest('Smart Backtest stop requested. The latest completed checkpoint remains resumable.');
    updateSmartCheckpoint({
      status: 'stopped',
      stopReason: 'Stopped safely by the user. No duplicate smart job remains active.',
      nextAction: 'Resume will continue from the saved checkpoint with the current configuration.',
    });
    setSmartRunning(false);
    setSmartStopping(false);
  }, [cancelBacktest, updateSmartCheckpoint]);

  const startSmartBacktest = useCallback(async (resume = false) => {
    if (strategyDisabled || loading || smartRunning) return;
    smartStopRequestedRef.current = false;
    setStudioMode('smart');
    setSmartRunning(true);
    setSmartStopping(false);
    const now = Date.now();
    const startedAt = resume && smartCheckpoint ? smartCheckpoint.startedAt : now;
    const sessionId = resume && smartCheckpoint ? smartCheckpoint.id : `smart-${now}`;
    let iteration = resume && smartCheckpoint ? smartCheckpoint.iteration : 0;
    let noImprovementIterations = resume && smartCheckpoint ? smartCheckpoint.noImprovementIterations : 0;
    let bestScore = resume && smartCheckpoint ? smartCheckpoint.bestScore : null;
    let bestRunId = resume && smartCheckpoint ? smartCheckpoint.bestRunId : null;
    let bestNetReturnPct = resume && smartCheckpoint ? smartCheckpoint.bestNetReturnPct : null;

    updateSmartCheckpoint({
      id: sessionId,
      status: 'auto_configure',
      iteration,
      maxIterations: SMART_MAX_ITERATIONS,
      maxRuntimeMs: SMART_MAX_RUNTIME_MS,
      configKey: activeConfigKey,
      startedAt,
      stopReason: null,
      lastChange: resume
        ? 'Loaded the persisted Smart Mode checkpoint and confirmed the current setup before continuing.'
        : 'Smart setup confirmed strategy, market, timeframe, history horizon, direction, costs, and display risk profile.',
      nextAction: 'Run canonical replays continuously, compare latest versus best, optimize safely, and checkpoint after each iteration.',
    });

    const finishSmartRun = (status: SmartBacktestPhase, stopReason: string, nextAction: string): void => {
      updateSmartCheckpoint({
        status,
        stopReason,
        nextAction,
      });
    };

    try {
      while (!smartStopRequestedRef.current) {
        const elapsed = Date.now() - startedAt;
        if (iteration >= SMART_MAX_ITERATIONS) {
          finishSmartRun('completed', `Stopped after reaching the ${SMART_MAX_ITERATIONS} iteration safety limit.`, 'Review the saved best result or switch to Manual / Expert mode.');
          break;
        }
        if (elapsed >= SMART_MAX_RUNTIME_MS) {
          finishSmartRun('completed', 'Stopped after reaching the maximum Smart Mode runtime.', 'Resume later from the saved checkpoint or export the best result.');
          break;
        }
        if (noImprovementIterations >= SMART_NO_IMPROVEMENT_LIMIT) {
          finishSmartRun('completed', `Stopped after ${SMART_NO_IMPROVEMENT_LIMIT} iterations without improvement.`, 'Review the saved best result or switch to Manual / Expert mode.');
          break;
        }

        const nextIteration = iteration + 1;
        updateSmartCheckpoint({
          status: 'testing',
          iteration: nextIteration,
          startedAt,
          nextAction: 'Waiting for the canonical server backtest result. No live order can be created by this flow.',
        });

        const latest = await runBacktest('smart');
        if (smartStopRequestedRef.current) {
          finishSmartRun('stopped', 'Stopped safely by the user after the in-flight request was cancelled.', 'Resume continues from this checkpoint.');
          break;
        }
        if (!latest) {
          finishSmartRun('failed', 'The server did not return a completed replay result.', 'Review the visible error, adjust inputs if needed, then resume.');
          break;
        }

        const latestScore = scoreSmartBacktest(latest);
        const improved = bestScore == null || latestScore > bestScore;
        const runId = latest.audit?.runId ?? `${latest.symbol}-${latest.direction}-${latest.interval}-${latest.audit?.generatedAt ?? Date.now()}`;
        if (improved) {
          bestScore = latestScore;
          bestRunId = runId;
          bestNetReturnPct = latest.totalPnlPct;
          noImprovementIterations = 0;
        } else {
          noImprovementIterations += 1;
        }
        iteration = nextIteration;

        updateSmartCheckpoint({
          id: sessionId,
          status: 'evaluating',
          iteration,
          maxIterations: SMART_MAX_ITERATIONS,
          noImprovementIterations,
          maxRuntimeMs: SMART_MAX_RUNTIME_MS,
          startedAt,
          configKey: activeConfigKeyRef.current,
          latestScore,
          bestScore,
          latestRunId: runId,
          bestRunId: bestRunId ?? runId,
          latestNetReturnPct: latest.totalPnlPct,
          bestNetReturnPct: bestNetReturnPct ?? latest.totalPnlPct,
          latestTradeCount: latest.timeline.length,
          stopReason: null,
          lastChange: improved ? 'Latest result became the saved best checkpoint.' : 'Latest result was kept as latest only; the previous best checkpoint remains protected.',
          nextAction: 'Run Smart Optimization to search for a robust candidate before the next iteration.',
        });

        if (latest.dataState === 'unavailable') {
          finishSmartRun('failed', 'Stopped because the provider returned no usable market data for this configuration.', 'Choose another market/timeframe or use synthetic fixtures only in explicit QA mode.');
          break;
        }
        if (noImprovementIterations >= SMART_NO_IMPROVEMENT_LIMIT) {
          finishSmartRun('completed', `Stopped after ${SMART_NO_IMPROVEMENT_LIMIT} iterations without improvement.`, 'Review the saved best result or switch to Manual / Expert mode.');
          break;
        }
        if (iteration >= SMART_MAX_ITERATIONS) {
          finishSmartRun('completed', `Stopped after reaching the ${SMART_MAX_ITERATIONS} iteration safety limit.`, 'Review the saved best result or export the run report.');
          break;
        }

        updateSmartCheckpoint({
          status: 'improving',
          nextAction: 'Running safe robust optimization. Promotion still requires its existing evidence gates.',
        });
        await runSmartOptimization();
        if (smartStopRequestedRef.current) {
          finishSmartRun('stopped', 'Stopped safely after the latest completed iteration and checkpoint.', 'Resume continues from this checkpoint.');
          break;
        }

        updateSmartCheckpoint({
          status: 'checkpointed',
          lastChange: 'Smart Mode saved a checkpoint and prepared the next safe iteration.',
          nextAction: 'Continuing automatically unless Stop is pressed or a safety stop condition is reached.',
        });
        await new Promise((resolve) => globalThis.setTimeout(resolve, SMART_ITERATION_PAUSE_MS));
      }
    } finally {
      setSmartRunning(false);
      setSmartStopping(false);
    }
  }, [activeConfigKey, activeConfigKeyRef, cancelBacktest, loading, runBacktest, runSmartOptimization, setStudioMode, smartCheckpoint, smartRunning, strategyDisabled, updateSmartCheckpoint]);

  const resumeSmartBacktest = useCallback(() => void startSmartBacktest(true), [startSmartBacktest]);

  return {
    smartCheckpoint,
    smartRunning,
    smartStopping,
    smartStopRequestedRef,
    stopSmartBacktest,
    startSmartBacktest,
    resumeSmartBacktest,
  };
}
