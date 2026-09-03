import './StrategyPage.css';
import './StrategyStudioReference.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { StrategyOptimizationReport } from '../../services/strategyOptimization';
import type { StrategyOptimizationProfile } from '../../services/strategyOptimizationStore';
import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';
import type { StrategyFusionSnapshot } from '../../services/strategyFusion';
import type {
  StrategyDefinition,
  StrategyRankScore,
  StrategyValidationReport,
  SymbolTicker,
  TradeDirection,
} from '../../types';
import { strategyDefinitions } from '../../services/strategyRegistry';
import { buildStrategyParameterValues, normalizeStrategyParameterAliases } from '../../services/strategyParameters';
import { apiMutate } from '../../services/apiMutate';
import { fetchJsonWithTimeout } from '../../services/apiQuery';
import { buildStrategyEvidenceSnapshot } from '../../services/strategyEvidence';
import { navigateWorkspace, readWorkspaceContext, writeWorkspaceContext } from '../../lib/workspaceContext';
import type { AutopilotControllerView } from '../../lib/useAutopilotController';
import { StrategyDetailPage } from './StrategyDetailPage';
import { StrategyCompareDialog } from './StrategyCompareDialog';
import { StrategyEvidenceRail } from './StrategyEvidenceRail';
import { StrategyLibraryRail, type StrategyLibraryFilters, type StrategyLibraryViewMode } from './StrategyLibraryRail';
import { StrategyModelWorkspace, type StrategyWorkspaceInterval } from './StrategyModelWorkspace';
import { StrategyWorkflowStepper, type StrategyWorkflowStage } from './StrategyWorkflowStepper';
import { hasBoundEvidence, strategyDisplayStatus, supportedDirections } from './strategyPresentation';
import { interpretLiquidityHunterReadPlaneMessage } from '../../services/liquidityHunterReadPlaneClient';

const BOOKMARKS_KEY = 'apex:saved-strategies';
const STRATEGY_LIBRARY_VIEW_MODE_KEY = 'apex:strategy-library-view-mode:v1';
const WORKSPACE_INTERVALS: StrategyWorkspaceInterval[] = ['5m', '15m', '1h', '4h', '1d'];

const DEFAULT_FILTERS: StrategyLibraryFilters = {
  search: '',
  status: 'all',
  category: 'all',
  dataTier: 'all',
  direction: 'all',
  bookmarkedOnly: false,
};

function readBookmarks(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const value = JSON.parse(window.localStorage.getItem(BOOKMARKS_KEY) || '[]') as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeBookmarks(bookmarks: Set<string>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...bookmarks]));
    return true;
  } catch {
    return false;
  }
}


function readStrategyLibraryViewMode(): StrategyLibraryViewMode {
  if (typeof window === 'undefined') return 'cards';
  try {
    return window.localStorage.getItem(STRATEGY_LIBRARY_VIEW_MODE_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

function writeStrategyLibraryViewMode(mode: StrategyLibraryViewMode): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STRATEGY_LIBRARY_VIEW_MODE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

function defaultParameters(strategy: StrategyDefinition, values?: Record<string, number | string>): Record<string, number | string> {
  return buildStrategyParameterValues(strategy, values);
}

function fallbackInterval(strategy: StrategyDefinition, preferred?: string): StrategyWorkspaceInterval {
  if (preferred && WORKSPACE_INTERVALS.includes(preferred as StrategyWorkspaceInterval) && strategy.supportedIntervals.includes(preferred as StrategyWorkspaceInterval)) {
    return preferred as StrategyWorkspaceInterval;
  }
  return WORKSPACE_INTERVALS.find((interval) => strategy.supportedIntervals.includes(interval)) ?? '1h';
}

interface StrategyPageProps {
  tickers?: SymbolTicker[];
  selectedSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
  autopilotEnabled?: boolean;
  /** Live binding to the one server-side Autopilot controller. */
  autopilotController?: AutopilotControllerView;
}

const FALLBACK_MARKETS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT'];

type LiquidityHunterManualTestnetPlan = {
  liquidityHunter?: { setupId?: string | null; setupState?: string; symbol?: string };
  tradePlan?: { symbol?: string; direction?: string; quantity?: number; entryPrice?: number } | null;
  risk?: { decision?: string; approvedQuantity?: number; reasons?: string[] } | null;
  reasons?: string[];
};

type LiquidityHunterManualTestnetSafety = {
  manualConfirmationRequired: boolean;
  testnetOnly: boolean;
  autonomousLiveExecutionEnabled: boolean;
};

export function StrategyPage({
  tickers = [],
  selectedSymbol = 'BTC-USDT',
  onSelectSymbol,
  autopilotEnabled = false,
  autopilotController,
}: StrategyPageProps = {}) {
  const [initialContext] = useState(() => readWorkspaceContext());
  const initialStrategyId = initialContext?.strategyId && strategyDefinitions.some((strategy) => strategy.strategyId === initialContext.strategyId)
    ? initialContext.strategyId
    : 'crypto-multi-alpha-ls-v1';
  const initialStrategy = strategyDefinitions.find((strategy) => strategy.strategyId === initialStrategyId) ?? strategyDefinitions[0];

  const [strategies, setStrategies] = useState<StrategyDefinition[]>(() => strategyDefinitions.map((strategy) => ({ ...strategy, latestSnapshot: undefined })));
  const [selectedStrategyId, setSelectedStrategyId] = useState(initialStrategyId);
  const [filters, setFilters] = useState<StrategyLibraryFilters>(DEFAULT_FILTERS);
  const [libraryViewMode, setLibraryViewModeState] = useState<StrategyLibraryViewMode>(readStrategyLibraryViewMode);
  const [bookmarks, setBookmarks] = useState<Set<string>>(readBookmarks);
  const [symbol, setSymbol] = useState(initialContext?.symbol || selectedSymbol || 'BTC-USDT');
  const [direction, setDirection] = useState<TradeDirection>(() => {
    const allowed = supportedDirections(initialStrategy);
    return initialContext?.direction && allowed.includes(initialContext.direction) ? initialContext.direction : allowed[0];
  });
  const [interval, setInterval] = useState<StrategyWorkspaceInterval>(() => fallbackInterval(initialStrategy, initialContext?.interval));
  const [parameters, setParameters] = useState<Record<string, number | string>>(() => defaultParameters(
    initialStrategy,
    initialContext?.strategyId === initialStrategyId ? initialContext.strategyParameters : undefined,
  ));
  const [detailOpen, setDetailOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [validationRunning, setValidationRunning] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [optimizationRunning, setOptimizationRunning] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);
  const [optimizationReport, setOptimizationReport] = useState<StrategyOptimizationReport | null>(null);
  const [activeOptimizationProfile, setActiveOptimizationProfile] = useState<StrategyOptimizationProfile | null>(null);
  const [fusionSnapshot, setFusionSnapshot] = useState<StrategyFusionSnapshot | null>(null);
  const [fusionRunning, setFusionRunning] = useState(false);
  const [fusionMessage, setFusionMessage] = useState<string | null>(null);
  const [liquidityHunterRunning, setLiquidityHunterRunning] = useState(false);
  const [liquidityHunterMessage, setLiquidityHunterMessage] = useState<string | null>(null);
  const [liquidityHunterEvaluation, setLiquidityHunterEvaluation] = useState<LiquidityHunterEvaluation | null>(null);
  const [liquidityHunterLive, setLiquidityHunterLive] = useState(false);
  const [liquidityHunterReconnect, setLiquidityHunterReconnect] = useState(0);
  const [liquidityHunterGovernance, setLiquidityHunterGovernance] = useState<unknown>(null);
  const [liquidityHunterDatasets, setLiquidityHunterDatasets] = useState<unknown[]>([]);
  const [liquidityHunterManualTestnetPlans, setLiquidityHunterManualTestnetPlans] = useState<LiquidityHunterManualTestnetPlan[]>([]);
  const [liquidityHunterManualTestnetSafety, setLiquidityHunterManualTestnetSafety] = useState<LiquidityHunterManualTestnetSafety | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const validationRequestRef = useRef(0);
  const validationAbortRef = useRef<AbortController | null>(null);
  const optimizationRequestRef = useRef(0);
  const optimizationAbortRef = useRef<AbortController | null>(null);
  const optimizationInFlightRef = useRef(false);
  const profileRequestRef = useRef(0);
  const fusionRequestRef = useRef(0);
  const fusionAbortRef = useRef<AbortController | null>(null);
  const liquidityHunterRequestRef = useRef(0);
  const liquidityHunterAbortRef = useRef<AbortController | null>(null);

  const selected = useMemo(
    () => strategies.find((strategy) => strategy.strategyId === selectedStrategyId) ?? strategies[0],
    [selectedStrategyId, strategies],
  );

  const marketOptions = useMemo(() => {
    const apiSymbols = tickers
      .map((ticker) => String(ticker.symbol || '').trim().toUpperCase())
      .filter(Boolean);
    const source = apiSymbols.length ? apiSymbols : FALLBACK_MARKETS;
    return [...new Set([symbol, ...source])].slice(0, 120);
  }, [symbol, tickers]);

  const handleSymbolChange = (nextSymbol: string) => {
    setSymbol(nextSymbol);
    onSelectSymbol?.(nextSymbol);
  };

  const setLibraryViewMode = (mode: StrategyLibraryViewMode) => {
    if (!writeStrategyLibraryViewMode(mode)) {
      setToast('Strategy view preference was not saved because browser persistence is unavailable.');
      return;
    }
    setLibraryViewModeState(mode);
  };

  const refreshLiquidityHunterManualTestnetPlans = useCallback(async () => {
    const payload = await fetchJsonWithTimeout<{ plans?: LiquidityHunterManualTestnetPlan[]; safety?: LiquidityHunterManualTestnetSafety }>(
      '/api/liquidity-hunter/manual-testnet/plans',
      { timeoutMs: 12_000 },
    );
    setLiquidityHunterManualTestnetPlans(Array.isArray(payload.plans) ? payload.plans : []);
    setLiquidityHunterManualTestnetSafety(payload.safety ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchJsonWithTimeout<{ strategies?: StrategyDefinition[]; message?: string }>('/api/strategies', { timeoutMs: 12_000 })
      .then((payload) => {
        if (!cancelled && payload.strategies?.length) {
          setStrategies(payload.strategies);
          setLibraryError(null);
        }
      })
      .catch((error) => { if (!cancelled) setLibraryError(error instanceof Error ? error.message : 'Strategy library unavailable.'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected && strategies.length) setSelectedStrategyId(strategies[0].strategyId);
  }, [selected, strategies]);

  useEffect(() => {
    if (!tickers.length) return;
    const available = new Set(tickers.map((ticker) => ticker.symbol));
    if (available.has(symbol)) return;
    const nextSymbol = available.has(selectedSymbol) ? selectedSymbol : tickers[0]?.symbol;
    if (!nextSymbol) return;
    setSymbol(nextSymbol);
    onSelectSymbol?.(nextSymbol);
  }, [onSelectSymbol, selectedSymbol, symbol, tickers]);

  useEffect(() => {
    if (!selected) return;
    const allowed = supportedDirections(selected);
    if (!allowed.includes(direction)) setDirection(allowed[0]);
    setInterval((current) => fallbackInterval(selected, current));
    setParameters(defaultParameters(
      selected,
      initialContext?.strategyId === selected.strategyId ? initialContext.strategyParameters : undefined,
    ));
    setValidationMessage(null);
    setOptimizationMessage(null);
    setOptimizationReport(null);
    setActiveOptimizationProfile(null);
    setFusionSnapshot(null);
    setFusionMessage(null);
    setLiquidityHunterMessage(null);
    setLiquidityHunterEvaluation(null);
    liquidityHunterRequestRef.current += 1;
    liquidityHunterAbortRef.current?.abort();
    setLiquidityHunterRunning(false);
    fusionRequestRef.current += 1;
    fusionAbortRef.current?.abort();
    setFusionRunning(false);
    profileRequestRef.current += 1;
    optimizationRequestRef.current += 1;
    optimizationAbortRef.current?.abort();
    optimizationInFlightRef.current = false;
    setOptimizationRunning(false);
    validationRequestRef.current += 1;
    validationAbortRef.current?.abort();
    setValidationRunning(false);
  }, [initialContext, selected?.strategyId]);

  useEffect(() => {
    fusionRequestRef.current += 1;
    fusionAbortRef.current?.abort();
    setFusionSnapshot(null);
    setFusionMessage(null);
    setFusionRunning(false);
    liquidityHunterRequestRef.current += 1;
    liquidityHunterAbortRef.current?.abort();
    setLiquidityHunterEvaluation(null);
    setLiquidityHunterMessage(null);
    setLiquidityHunterRunning(false);
  }, [direction, interval, parameters, selected?.strategyId, symbol]);

  useEffect(() => {
    if (!selected) return;
    const requestId = ++profileRequestRef.current;
    const query = new URLSearchParams({ symbol, interval, direction });
    fetchJsonWithTimeout<{
      activeProfile?: StrategyOptimizationProfile | null;
      latestReport?: StrategyOptimizationReport | null;
      message?: string;
    }>(`/api/strategies/${encodeURIComponent(selected.strategyId)}/optimization?${query.toString()}`, { timeoutMs: 12_000 })
      .then((payload) => {
        if (requestId !== profileRequestRef.current) return;
        setActiveOptimizationProfile(payload.activeProfile ?? null);
        setOptimizationReport(payload.latestReport ?? null);
        if (payload.activeProfile?.parameters) {
          setParameters((current) => normalizeStrategyParameterAliases(selected, { ...current, ...payload.activeProfile?.parameters }));
        }
      })
      .catch(() => {
        if (requestId === profileRequestRef.current) setActiveOptimizationProfile(null);
      });
  }, [direction, interval, selected?.strategyId, symbol]);

  useEffect(() => {
    if (!selected) return;
    writeWorkspaceContext({
      source: 'strategies',
      strategyId: selected.strategyId,
      strategyName: selected.name,
      symbol,
      direction,
      interval,
      strategyParameters: parameters,
    });
  }, [direction, interval, parameters, selected, symbol]);

  useEffect(() => () => { validationAbortRef.current?.abort(); optimizationAbortRef.current?.abort(); fusionAbortRef.current?.abort(); liquidityHunterAbortRef.current?.abort(); }, []);

  useEffect(() => {
    if (!liquidityHunterLive || typeof window === 'undefined') return undefined;
    let closed = false;
    let retry: number | null = null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/liquidity-hunter?symbol=${encodeURIComponent(symbol)}`);
    socket.onopen = () => setLiquidityHunterMessage('Live shadow read plane connected · read-only · no execution authority.');
    socket.onmessage = (event) => {
      try {
        const action = interpretLiquidityHunterReadPlaneMessage(JSON.parse(String(event.data)));
        if (action.kind === 'RESYNC') {
          setLiquidityHunterMessage(`Read-plane resync required: ${action.reason}.`);
          socket.close();
          if (!closed) retry = window.setTimeout(() => setLiquidityHunterReconnect((value) => value + 1), 100);
          return;
        }
        if (action.kind === 'EVALUATION') {
          setLiquidityHunterEvaluation(action.evaluation);
          setLiquidityHunterRunning(false);
        }
      } catch { setLiquidityHunterMessage('Liquidity Hunter read-plane payload was invalid.'); }
    };
    socket.onerror = () => { setLiquidityHunterRunning(false); setLiquidityHunterMessage('Liquidity Hunter read plane is unavailable or disabled; the on-demand result remains visible.'); };
    socket.onclose = () => {
      if (!closed && retry === null) retry = window.setTimeout(() => setLiquidityHunterReconnect((value) => value + 1), 1_000);
    };
    return () => { closed = true; if (retry !== null) window.clearTimeout(retry); socket.close(); };
  }, [liquidityHunterLive, liquidityHunterReconnect, symbol]);

  useEffect(() => {
    if (!liquidityHunterEvaluation) return;
    Promise.allSettled([
      fetchJsonWithTimeout<{ governance?: unknown }>('/api/liquidity-hunter/edge-thresholds', { timeoutMs: 12_000 }),
      fetchJsonWithTimeout<{ datasets?: unknown[] }>('/api/liquidity-hunter/replay-datasets', { timeoutMs: 12_000 }),
      refreshLiquidityHunterManualTestnetPlans(),
    ]).then(([thresholds, datasets]) => {
      if (thresholds.status === 'fulfilled') setLiquidityHunterGovernance(thresholds.value.governance ?? null);
      if (datasets.status === 'fulfilled') setLiquidityHunterDatasets(Array.isArray(datasets.value.datasets) ? datasets.value.datasets : []);
    });
  }, [liquidityHunterEvaluation?.evaluationId, refreshLiquidityHunterManualTestnetPlans]);

  if (!selected) return null;

  const toggleBookmark = (strategyId: string = selected.strategyId) => {
    const target = strategies.find((strategy) => strategy.strategyId === strategyId) ?? selected;
    setBookmarks((current) => {
      const next = new Set(current);
      const removing = next.has(strategyId);
      if (removing) next.delete(strategyId); else next.add(strategyId);
      if (!writeBookmarks(next)) {
        setToast('Bookmark was not saved because browser persistence is unavailable.');
        return current;
      }
      setToast(removing ? `${target.name} removed from browser bookmarks` : `${target.name} bookmarked in this browser`);
      return next;
    });
  };

  const sendToBacktesting = (nextParameters: Record<string, number | string> = parameters) => {
    if (selected.status === 'blocked') {
      setValidationMessage(selected.blockedReason || 'This strategy is blocked.');
      return;
    }
    writeWorkspaceContext({
      source: 'strategies',
      strategyId: selected.strategyId,
      strategyName: selected.name,
      symbol,
      direction,
      interval,
      strategyParameters: nextParameters,
    });
    navigateWorkspace('backtesting');
  };

  const runValidation = async () => {
    if (selected.status === 'blocked') {
      setValidationMessage(selected.blockedReason || 'This strategy is blocked.');
      return;
    }
    validationAbortRef.current?.abort();
    const controller = new AbortController();
    validationAbortRef.current = controller;
    const requestId = ++validationRequestRef.current;
    const identity = { strategyId: selected.strategyId, name: selected.name, direction, symbol, interval };
    setValidationRunning(true);
    setValidationMessage(null);

    try {
      const response = await apiMutate(`/api/strategies/${encodeURIComponent(identity.strategyId)}/validate`, {
        method: 'POST',
        body: JSON.stringify({ symbol: identity.symbol, interval: identity.interval, direction: identity.direction, maxBars: 72 }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        validation?: StrategyValidationReport;
        rank?: StrategyRankScore;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.validation || !payload.rank) {
        throw new Error(payload.message || payload.error || `Validation failed (${response.status}).`);
      }
      if (requestId !== validationRequestRef.current) return;

      const latestSnapshot = buildStrategyEvidenceSnapshot(selected, payload.validation, payload.rank);
      setStrategies((current) => current.map((strategy) => strategy.strategyId === identity.strategyId ? {
        ...strategy,
        status: payload.validation?.fullStrategyValidated ? 'validated' : 'candidate',
        latestSnapshot,
      } : strategy));
      setValidationMessage(`${identity.direction} validation complete — ${payload.validation.fullStrategyValidated ? 'full strategy validated' : payload.validation.passedAllGates ? 'base replay gates passed; full-strategy evidence remains incomplete' : 'one or more gates remain'} · score ${payload.rank.score.toFixed(0)}.`);
      setToast(`Validation completed for ${identity.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === validationRequestRef.current) setValidationMessage(error instanceof Error ? error.message : 'Validation failed.');
    } finally {
      if (requestId === validationRequestRef.current) setValidationRunning(false);
    }
  };


  const runOptimization = async () => {
    if (selected.status === 'blocked') {
      setOptimizationMessage(selected.blockedReason || 'This strategy is blocked.');
      return;
    }
    if (optimizationInFlightRef.current) {
      setOptimizationMessage('An optimization is already running for this workspace.');
      return;
    }
    const controller = new AbortController();
    optimizationAbortRef.current = controller;
    optimizationInFlightRef.current = true;
    const requestId = ++optimizationRequestRef.current;
    const identity = { strategyId: selected.strategyId, name: selected.name, direction, symbol, interval };
    setOptimizationRunning(true);
    setOptimizationMessage(null);

    try {
      const response = await apiMutate(`/api/strategies/${encodeURIComponent(identity.strategyId)}/optimize`, {
        method: 'POST',
        body: JSON.stringify({
          symbol: identity.symbol,
          interval: identity.interval,
          direction: identity.direction,
          maxBars: 72,
          bars: 2500,
          coarseCandidates: 28,
          refinementCandidates: 12,
          maxConcurrent: 4,
          autoPromote: false,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        report?: StrategyOptimizationReport;
        activeProfile?: StrategyOptimizationProfile | null;
        note?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.report) {
        throw new Error(payload.message || payload.error || `Optimization failed (${response.status}).`);
      }
      if (requestId !== optimizationRequestRef.current) return;
      setOptimizationReport(payload.report);
      setActiveOptimizationProfile(payload.activeProfile ?? null);
      if (payload.activeProfile?.parameters) {
        setParameters((current) => normalizeStrategyParameterAliases(selected, { ...current, ...payload.activeProfile?.parameters }));
      }
      const improvement = payload.report.promotion.developmentValidationImprovement.toFixed(3);
      setOptimizationMessage(payload.report.promotion.eligible
        ? `Optimization candidate is eligible for review · development-validation utility delta ${Number(improvement) >= 0 ? '+' : ''}${improvement}. Active thresholds were not changed.`
        : `Optimization completed without promotion · ${payload.report.promotion.blockers.join(', ') || 'no safe improvement'}.`);
      setToast(`Optimization completed for ${identity.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === optimizationRequestRef.current) setOptimizationMessage(error instanceof Error ? error.message : 'Optimization failed.');
    } finally {
      if (requestId === optimizationRequestRef.current) setOptimizationRunning(false);
      if (optimizationAbortRef.current === controller) {
        optimizationAbortRef.current = null;
        optimizationInFlightRef.current = false;
      }
    }
  };


  const refreshFusionPreview = async () => {
    if (!selected.fusion) {
      setFusionMessage('This strategy has no dynamic-fusion blueprint.');
      return;
    }
    fusionAbortRef.current?.abort();
    const controller = new AbortController();
    fusionAbortRef.current = controller;
    const requestId = ++fusionRequestRef.current;
    setFusionRunning(true);
    setFusionMessage(null);
    try {
      const response = await apiMutate(`/api/strategies/${encodeURIComponent(selected.strategyId)}/fusion-preview`, {
        method: 'POST',
        body: JSON.stringify({ symbol, interval, direction, parameters }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        snapshot?: StrategyFusionSnapshot;
        note?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.snapshot) throw new Error(payload.message || payload.error || `Fusion preview failed (${response.status}).`);
      if (requestId !== fusionRequestRef.current) return;
      setFusionSnapshot(payload.snapshot);
      // A successful refresh is already visible through the populated fusion metrics.
      // Keep this status row reserved for errors so the compact Strategy Studio does
      // not sacrifice metric visibility to a redundant success banner.
      setFusionMessage(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === fusionRequestRef.current) setFusionMessage(error instanceof Error ? error.message : 'Fusion preview failed.');
    } finally {
      if (requestId === fusionRequestRef.current) setFusionRunning(false);
    }
  };


  const runLiquidityHunterShadow = async () => {
    liquidityHunterAbortRef.current?.abort();
    const controller = new AbortController();
    liquidityHunterAbortRef.current = controller;
    const requestId = ++liquidityHunterRequestRef.current;
    setLiquidityHunterRunning(true);
    setLiquidityHunterMessage(null);
    try {
      const response = await apiMutate('/api/liquidity-hunter/shadow/evaluate', {
        method: 'POST',
        body: JSON.stringify({ symbol }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        evaluation?: LiquidityHunterEvaluation;
        error?: string;
        message?: string;
        context?: {
          smartMoney?: { availability?: string };
          fundingOpenInterest?: { available?: boolean; fundingEvents?: number; openInterestEvents?: number };
        };
      };
      if (!response.ok || !payload.evaluation) {
        const disabled = response.status === 409 && payload.error === 'liquidity_hunter_disabled';
        throw new Error(disabled
          ? 'Liquidity Hunter is disabled by configuration. Enable the shadow core on the server before evaluating.'
          : payload.message || payload.error || `Liquidity Hunter evaluation failed (${response.status}).`);
      }
      if (requestId !== liquidityHunterRequestRef.current) return;
      setLiquidityHunterEvaluation(payload.evaluation);
      setLiquidityHunterLive(true);
      const smc = payload.context?.smartMoney?.availability ?? 'unknown';
      const fundingOi = payload.context?.fundingOpenInterest?.available ? 'available' : 'partial/unavailable';
      setLiquidityHunterMessage(`Shadow evaluation complete · SMC ${smc} · funding/OI ${fundingOi}. No execution was authorized.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === liquidityHunterRequestRef.current) setLiquidityHunterMessage(error instanceof Error ? error.message : 'Liquidity Hunter evaluation failed.');
    } finally {
      if (requestId === liquidityHunterRequestRef.current) setLiquidityHunterRunning(false);
    }
  };

  const submitLiquidityHunterManualTestnet = async (setupId: string) => {
    const response = await apiMutate(`/api/liquidity-hunter/manual-testnet/${encodeURIComponent(setupId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ confirmation: 'CONFIRM_LIQUIDITY_HUNTER_TESTNET' }),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; order?: { exchangeOrderId?: string | null; id?: string | null; status?: string } };
    if (!response.ok || !payload.ok) {
      const messages: Record<string, string> = {
        liquidity_hunter_testnet_canary_disabled: 'Liquidity Hunter testnet canary is disabled by server configuration.',
        explicit_liquidity_hunter_testnet_confirmation_required: 'The required manual confirmation was not received.',
        liquidity_hunter_risk_authorized_plan_unavailable: 'This risk-authorized plan is no longer available. Refresh the pending plans.',
      };
      throw new Error(messages[payload.error || ''] || payload.error || `Testnet submission failed (${response.status}).`);
    }
    const reference = payload.order?.exchangeOrderId || payload.order?.id;
    setLiquidityHunterMessage(reference
      ? `Manual testnet order acknowledged · reference ${reference}.`
      : `Manual testnet submission accepted${payload.order?.status ? ` · ${payload.order.status}` : ''}.`);
    await refreshLiquidityHunterManualTestnetPlans();
  };


  const promoteOptimization = async () => {
    if (!optimizationReport?.promotion.eligible) {
      setOptimizationMessage('The latest optimization candidate is not eligible for manual promotion.');
      return;
    }
    optimizationAbortRef.current?.abort();
    const controller = new AbortController();
    optimizationAbortRef.current = controller;
    const requestId = ++optimizationRequestRef.current;
    setOptimizationRunning(true);
    setOptimizationMessage(null);
    try {
      const response = await apiMutate(`/api/strategies/${encodeURIComponent(selected.strategyId)}/optimization/promote`, {
        method: 'POST',
        body: JSON.stringify({ symbol, interval, direction, reportGeneratedAt: optimizationReport.generatedAt }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        activeProfile?: StrategyOptimizationProfile;
        note?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.activeProfile) {
        throw new Error(payload.message || payload.error || `Promotion failed (${response.status}).`);
      }
      if (requestId !== optimizationRequestRef.current) return;
      setActiveOptimizationProfile(payload.activeProfile);
      setParameters((current) => normalizeStrategyParameterAliases(selected, { ...current, ...payload.activeProfile?.parameters }));
      setOptimizationMessage(`Manual promotion activated revision r${payload.activeProfile.revision} for this exact context.`);
      setToast(`Reviewed optimization profile activated for ${selected.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === optimizationRequestRef.current) setOptimizationMessage(error instanceof Error ? error.message : 'Promotion failed.');
    } finally {
      if (requestId === optimizationRequestRef.current) setOptimizationRunning(false);
    }
  };

  const rollbackOptimization = async () => {
    if (!activeOptimizationProfile?.previousRevision) {
      setOptimizationMessage('No earlier active optimization revision is available for this exact context.');
      return;
    }
    optimizationAbortRef.current?.abort();
    const controller = new AbortController();
    optimizationAbortRef.current = controller;
    const requestId = ++optimizationRequestRef.current;
    setOptimizationRunning(true);
    setOptimizationMessage(null);
    try {
      const response = await apiMutate(`/api/strategies/${encodeURIComponent(selected.strategyId)}/optimization/rollback`, {
        method: 'POST',
        body: JSON.stringify({ symbol, interval, direction }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        activeProfile?: StrategyOptimizationProfile;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.activeProfile) {
        throw new Error(payload.message || payload.error || `Rollback failed (${response.status}).`);
      }
      if (requestId !== optimizationRequestRef.current) return;
      setActiveOptimizationProfile(payload.activeProfile);
      setParameters((current) => normalizeStrategyParameterAliases(selected, { ...current, ...payload.activeProfile?.parameters }));
      setOptimizationMessage(`Rollback revision r${payload.activeProfile.revision} activated from r${payload.activeProfile.restoredRevision ?? '—'}.`);
      setToast(`Optimization rollback activated for ${selected.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === optimizationRequestRef.current) setOptimizationMessage(error instanceof Error ? error.message : 'Rollback failed.');
    } finally {
      if (requestId === optimizationRequestRef.current) setOptimizationRunning(false);
    }
  };

  const selectedEvidenceReady = hasBoundEvidence(selected) && strategyDisplayStatus(selected) === 'Verified';
  const workflowStage: StrategyWorkflowStage = selected.status === 'blocked'
    ? 'configure'
    : validationRunning
      ? 'validate'
      : selectedEvidenceReady
        ? 'send-to-backtesting'
        : 'configure';

  return (
    <section className="strategy-studio" aria-label="Strategy Studio">
      <StrategyLibraryRail
        strategies={strategies}
        selectedStrategyId={selected.strategyId}
        bookmarks={bookmarks}
        filters={filters}
        viewMode={libraryViewMode}
        onViewModeChange={setLibraryViewMode}
        onFiltersChange={setFilters}
        onSelect={setSelectedStrategyId}
        onToggleBookmark={toggleBookmark}
      />

      <section className="strategy-center-column" aria-label="Strategy configuration workspace">
        <StrategyWorkflowStepper
          stage={workflowStage}
          validationRunning={validationRunning}
          evidenceReady={selectedEvidenceReady}
          blocked={selected.status === 'blocked'}
          evidenceBound={hasBoundEvidence(selected)}
        />
        <StrategyModelWorkspace
          strategy={selected}
          symbol={symbol}
          marketOptions={marketOptions}
          direction={direction}
          interval={interval}
          parameters={parameters}
          bookmarked={bookmarks.has(selected.strategyId)}
          onSymbolChange={handleSymbolChange}
          onDirectionChange={setDirection}
          onIntervalChange={setInterval}
          onParameterChange={(key, value) => setParameters((current) => ({ ...current, [key]: value }))}
          onOpenDetails={() => setDetailOpen(true)}
          onSendToBacktesting={() => sendToBacktesting()}
          onCompare={() => setCompareOpen(true)}
          onBookmark={toggleBookmark}
          fusionSnapshot={fusionSnapshot}
          fusionRunning={fusionRunning}
          fusionMessage={fusionMessage}
          onRefreshFusion={() => void refreshFusionPreview()}
        />
      </section>

      <StrategyEvidenceRail
        strategy={selected}
        validationRunning={validationRunning}
        validationMessage={validationMessage}
        onRunValidation={() => void runValidation()}
        optimizationRunning={optimizationRunning}
        optimizationMessage={optimizationMessage}
        optimizationReport={optimizationReport}
        activeOptimizationProfile={activeOptimizationProfile}
        onRunOptimization={() => void runOptimization()}
        onPromoteOptimization={() => void promoteOptimization()}
        onRollbackOptimization={() => void rollbackOptimization()}
        liquidityHunterRunning={liquidityHunterRunning}
        liquidityHunterMessage={liquidityHunterMessage}
        liquidityHunterEvaluation={liquidityHunterEvaluation}
        liquidityHunterGovernance={liquidityHunterGovernance}
        liquidityHunterDatasets={liquidityHunterDatasets}
        liquidityHunterManualTestnetPlans={liquidityHunterManualTestnetPlans}
        liquidityHunterManualTestnetSafety={liquidityHunterManualTestnetSafety}
        onSubmitLiquidityHunterManualTestnet={submitLiquidityHunterManualTestnet}
        onRunLiquidityHunter={() => void runLiquidityHunterShadow()}
        autopilotEnabled={autopilotEnabled}
        autopilotPhase={autopilotController?.phase ?? null}
        autopilotPhaseText={autopilotController?.phaseText ?? null}
        autopilotDisconnected={Boolean(autopilotController?.transportError)}
      />

      {libraryError && (
        <div className="strategy-library-error" role="status"><AlertTriangle size={14} />{libraryError} Registry definitions remain visible, but server evidence may be stale.</div>
      )}
      {detailOpen && (
        <StrategyDetailPage
          strategy={selected}
          initialParameterValues={parameters}
          onClose={() => setDetailOpen(false)}
          onSendToBacktesting={(nextParameters) => {
            setParameters(nextParameters);
            setDetailOpen(false);
            sendToBacktesting(nextParameters);
          }}
          onRunValidation={() => void runValidation()}
          validationRunning={validationRunning}
          validationMessage={validationMessage}
        />
      )}
      {compareOpen && <StrategyCompareDialog strategies={strategies} initialStrategyId={selected.strategyId} onClose={() => setCompareOpen(false)} />}
      {toast && <button type="button" className="strategy-toast" onClick={() => setToast(null)}>{toast}</button>}
    </section>
  );
}
