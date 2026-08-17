import { performance } from 'node:perf_hooks';
import type { Express, Request, Response } from 'express';
import { buildCorrelationMatrix } from '../lib/correlation';
import { deriveSymbolLevels } from '../lib/levels';
import { calculateSentimentComposite } from '../lib/sentiment';
import { buildCanonicalDecision, DECISION_ADAPTER_VERSION } from './canonicalDecisionAdapter';
import { decisionSnapshotsToLogs } from './decisionSnapshotLogger';
import { buildTradePlan } from './tradePlan';
import { MathEngine } from './mathEngine';
import { marketStatistics } from './onlineStatistics';
import { buildDirectionDivergence } from './directionDivergence';
import { runApexProductionInputReplay, runApexReplayBacktestDirectional, type BacktestCandle, type ProductionReplayDataset } from './backtesting';
import * as marketDataService from './marketDataService';
import { DEFAULT_STRATEGY_ID, clientSafeStrategy, getStrategyDefinition, listClientSafeStrategies, listStrategyDefinitions, strategyExecutionCapability, strategyValidationCapability } from './strategyRegistry';
import { buildStrategyParameterValues, normalizeStrategyParameterAliases, readStrategyParameterValue, validateStrategyParameterValues } from './strategyParameters';
import { buildScannerPresetConfig, runScannerPresetStrategy } from './strategyEngine/scannerPresetAdapter';
import { bespokeStrategyRunners } from './strategyEngine';
import { buildStrategyValidationReport, gateData, gateDrawdown, gateOutOfSample, gateSample } from './strategyValidation';
import { scoreStrategyValidation } from './strategyRanking';
import { buildStrategyEvidenceSnapshot } from './strategyEvidence';
import { apiValidationError, validateBacktestQuery, validateProductionReplayRequest, validateStrategyOptimizationInput, validateStrategyValidationInput } from './apiValidation';
import { BacktestExecutionCache, buildBacktestReplayCacheKey, type BacktestCacheState } from './backtestExecutionCache';
import { applyStrategyOptimizationScannerDeltas, optimizeStrategy, strategyOptimizationMetricsFromSummary, type StrategyOptimizationReport } from './strategyOptimization';
import { StrategyOptimizationStore, type StrategyOptimizationContext, type StrategyOptimizationProfile } from './strategyOptimizationStore';
import { evaluateStrategyFusion } from './strategyFusion';
import { runMultiStrategyResearch } from './multiStrategyResearchOrchestrator';
import { runMultiAgentResearchCouncil, type PaperTradeBudgetPlan } from './multiAgentResearchCouncil';
import { MultiAgentCouncilStore } from './multiAgentCouncilStore';
import { sizePaperMultiTradePositions, type PaperTradeEntryStopInput } from './execution/paperMultiTradeSizer';
import { buildSmartAutopilotPlan, runSmartAutopilotOptimizationCouncil, type SmartAutopilotContext, type SmartAutopilotOptimizationCouncil } from './smartAutopilot';
import { evaluateAutomaticPromotionGate, type AutomaticPromotionGateResult } from './strategyPromotionGate';
import {
  activeProfileSubject,
  definitionDefaultsSubject,
  identifyStrategyValidationSubject,
  optimizationCandidateSubject,
  validationReplayInputs,
  type StrategyValidationSubject,
} from './strategyValidationSubject';
import { resolveAutopilotSchedulerConfig, type AutopilotSchedulerConfig } from './autopilotScheduler';
import {
  autopilotControllerReducer,
  createAutopilotControllerState,
  isCycleInFlight,
  publicAutopilotControllerState,
  type AutopilotControllerEvent,
} from './autopilotControllerState';
import {
  buildResearchOutcomeLogs,
  summarizeResearchOutcomes,
  type ResearchOutcomeSummary,
} from './researchOutcomeFeedback';
import {
  aggregateForwardEvidence,
  applyForwardEvidenceToContexts,
  averageTrueRange,
  forwardContextKey,
  forwardPositionToLog,
  markForwardPosition,
  openForwardPosition,
  readForwardPositions,
  PAPER_FORWARD_VERSION,
  type ForwardBar,
  type ForwardEvidenceReport,
  type ForwardMark,
  type ForwardPosition,
} from './paperForwardEvaluator';
import { getSupplementalOrchestrator } from './supplementalOrchestrator';
import type { SupplementalBundle } from './providers/supplementalTypes';
import { computeTransactionCostPct, transactionCostInputsFromModel, transactionCostModelFromPerSideAssumptions, transactionCostModelFromRoundTripPct, type TransactionCostModel } from './transactionCosts';
import { selectIndependentRegimeSlices } from './marketRegimes';
import { getLiquidityHunterRuntime } from './liquidityHunter/foundationRuntime';
import { authorizeLiquidityHunterTradePlan } from './liquidityHunter/decisionBridge';
import { liquidityHunterManualCanaryRegistry } from './liquidityHunter/manualCanaryRegistry';
import { buildOpportunityShortlistComparison, discoverOpportunity } from './strategyCommander/opportunity/opportunityDiscovery';
import type { OpportunityCandidateV1 } from './strategyCommander/opportunity/opportunityTypes';
import { buildNativeParliamentSnapshot, buildParliamentScanShadow, type ParliamentScanShadowV1 } from './strategyCommander/parliamentShadow';
import type { IntelligenceConsensusV1 } from './strategyCommander/intelligenceConsensus';
import { buildStrategyCommanderDecision, buildStrategyCommanderScanShadow, strategyParameterProfileFingerprint, type StrategyCommanderScanShadowV1 } from './strategyCommander/strategyCommander';
import { buildCommanderOutcomeAttribution, buildCommanderResearchComparison, extractCommanderOutcomeObservations, type CommanderOutcomeAttributionV1, type CommanderResearchComparisonV1 } from './strategyCommander/commanderOutcomeFeedback';
import { resolveStrategyCompetenceForIdentity } from './strategyCommander/strategyCompetence';
import { extractEvidenceOutcomeObservations, resolveEvidenceCompetence, type EvidenceCompetenceV1 } from './strategyCommander/evidenceCompetence';
import type { CommanderEvidenceV1 } from '../contracts/commander/commanderEvidence';
import type { BacktestResult, Candle, Candlestick, CandidateScore, DirectionMarketDataSource, OrderBookSummary, SignalDecisionLog, SymbolTicker, DataState, ScannerConfig, TradeDirection, StrategyDefinition, StrategyReplayResult, StrategyValidationReport, StrategyRankScore } from '../types';

// Real production defaults, copied verbatim from apex-trading-engine/src/App.tsx
// (the live App's useState<ScannerConfig> initializer) so the backtest replay
// below scores candidates with the same thresholds the real scanner ships with,
// not an invented set of numbers.
export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  intervalMs: 6005,
  obiThreshold: -0.15,
  volumeThreshold: 0,
  qStructThreshold: -0.30,
  fundingThreshold: 0.0001,
  oiExpansionThresholdPct: 0.30,
  atrExpansionThreshold: 0.005,
  maxSqueezeRisk: 0.46,
  minEvidenceAgreement: 0.64,
  minSmartMoneyScore: 0.52,
  smcHardRejectThreshold: 0.22,
  thresholdMode: 'ADAPTIVE_GUARDRAILS',
  scorePreset: 'ATLAS_PLUS_V2',
  adaptiveLearningRate: 0.04,
  adaptiveMinSamples: 24,
  scoreWeights: MathEngine.defaultScoreWeights(),
  minConfidence: 0.78,
  directionBias: 'SHORT_ONLY',
  topRankSkip: 10,
  minVolume24hUsd: 5000000,
};

interface MarketCacheItem<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const marketCache = new Map<string, MarketCacheItem<any>>();

function getMarketCache<T>(key: string): T | null {
  const item = marketCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > item.ttlMs) {
    marketCache.delete(key);
    return null;
  }
  return item.data as T;
}

function setMarketCache<T>(key: string, data: T, ttlMs: number): void {
  marketCache.set(key, { data, timestamp: Date.now(), ttlMs });
}

function cleanSymbol(symbol: string): string {
  return symbol.replace('-', '').toUpperCase();
}

function formatTickerSymbol(raw: string): string {
  // NOTE: previously this chained multiple .replace() calls, which double-fired
  // on inputs like "XBTUSDTM" (the first replace already appends "-USDT", then
  // the later .replace(/USDT$/, '-USDT') matches the "USDT" tail of that result
  // again, producing "XBT--USDT"). Using an if/else chain with early returns
  // (mirrors normalizeTickerSymbol below) makes each branch mutually exclusive.
  const upper = raw.toUpperCase();
  let result: string;
  if (upper.endsWith('USDTM')) result = `${upper.slice(0, -5)}-USDT`;
  else if (upper.endsWith('USDM')) result = `${upper.slice(0, -4)}-USDT`;
  else if (upper.endsWith('USDT')) result = `${upper.slice(0, -4)}-USDT`;
  else if (upper.endsWith('M')) result = upper.slice(0, -1);
  else result = upper.includes('-') ? upper : `${upper}-USDT`;

  // KuCoin's real Bitcoin Futures contract is prefixed "XBT" (e.g. XBTUSDTM),
  // but the rest of this app keys off "BTC-USDT". Without this, the live ticker
  // for Bitcoin surfaces as "XBT-USDT" and misses canonical symbol lookups.
  if (result === 'XBT-USDT') return 'BTC-USDT';
  return result;
}

function normalizeTickerSymbol(symbol: string): string {
  const raw = symbol.toUpperCase().trim();
  // Same double-fire risk as formatTickerSymbol: an input that's already in
  // canonical "XXX-USDT" form (e.g. a ticker.symbol round-tripped back in)
  // also ends with "USDT", so it must be returned as-is before the exchange
  // suffix checks below would otherwise re-insert a second dash.
  let result: string;
  if (raw.includes('-')) result = raw;
  else if (raw.endsWith('USDTM')) result = raw.replace(/USDTM$/, '-USDT');
  else if (raw.endsWith('USDM')) result = raw.replace(/USDM$/, '-USDT');
  else if (raw.endsWith('USDT')) result = raw.replace(/USDT$/, '-USDT');
  else result = raw;

  // Same XBT->BTC normalization as formatTickerSymbol above, applied here too
  // so a raw "XBTUSDTM"/"XBT-USDT" passed straight into a route param (e.g.
  // /api/market/symbol/XBTUSDTM) resolves to the same "BTC-USDT" key the rest
  // of the app uses, instead of silently missing every lookup.
  if (result === 'XBT-USDT') return 'BTC-USDT';
  return result;
}

function parseLeverageQuery(value: unknown, fallback = 5): number {
  const raw = String(value ?? '').trim().toLowerCase();
  const primary = raw.includes(':') ? raw.split(':')[0] : raw.replace(/x$/, '');
  const candidate = Number(primary);
  return Number.isFinite(candidate) && candidate > 0
    ? Math.max(1, Math.min(100, candidate))
    : fallback;
}

// NOTE: this used to fetch KuCoin directly. It now delegates to
// marketDataService.getTickers(), which tries Binance first, then KuCoin,
// then HF Space (see marketDataService.ts header for the priority rationale
// — this was an explicit owner decision, not a unilateral change). Function
// Existing call sites keep the old function name, but all failure paths now
// return an honest empty/unavailable state instead of synthetic prices.
async function fetchKuCoinTickers(limit = 40): Promise<{
  tickers: SymbolTicker[];
  dataState: DataState;
  source: marketDataService.MarketDataSource | 'none';
}> {
  const cacheKey = `kucoin_tickers_${limit}`;
  const cached = getMarketCache<{
    tickers: SymbolTicker[];
    dataState: DataState;
    source: marketDataService.MarketDataSource | 'none';
  }>(cacheKey);
  if (cached) return cached;

  try {
    const { tickers, dataState, source } = await marketDataService.getTickers(limit);
    const result = { tickers, dataState: tickers.length ? dataState : 'unavailable' as DataState, source };
    setMarketCache(cacheKey, result, 5000);
    return result;
  } catch {
    const result = { tickers: [], dataState: 'unavailable' as DataState, source: 'none' as const };
    setMarketCache(cacheKey, result, 5000);
    return result;
  }
}

interface RouteCandlesResult {
  candles: Candle[];
  dataState: DataState;
  source: marketDataService.MarketDataSource | 'none';
  stale: boolean;
  ageMs: number;
  error?: string;
}

function combineDataStates(...states: DataState[]): DataState {
  if (states.some((state) => state === 'unavailable')) return 'unavailable';
  if (states.every((state) => state === 'live')) return 'live';
  if (states.some((state) => state === 'degraded')) return 'degraded';
  return 'not_configured';
}

function toDirectionCandles(rows: Candle[] | undefined): Candlestick[] {
  return (rows || []).map((row) => ({
    time: new Date(row.timestamp).toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
}

function directionMarketSource(
  source: marketDataService.MarketDataSource | 'none',
  state: DataState,
): DirectionMarketDataSource {
  if (state === 'unavailable' || source === 'none') return 'unavailable';
  if (source === 'kucoin') return state === 'live' ? 'kucoin_live' : 'kucoin_live_binance_unavailable';
  if (source === 'binance') return 'binance_futures_failover';
  return 'unavailable';
}

async function mapWithConcurrency<T, R>(
  rows: T[],
  concurrency: number,
  mapper: (row: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(rows.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, rows.length || 1)) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      results[index] = await mapper(rows[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function unavailableOrderBook(symbol: string): OrderBookSummary {
  return {
    symbol: normalizeTickerSymbol(symbol),
    bidDepthUsd: 0,
    askDepthUsd: 0,
    imbalancePct: 0,
    dataState: 'unavailable',
  };
}

async function fetchCandlesForSymbol(
  symbol: string,
  _currentPrice: number,
  intervalKey: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1h',
  limit = 30,
  priority: 'interactive' | 'background' | 'critical' = 'interactive',
): Promise<RouteCandlesResult> {
  const cacheKey = `candles_${normalizeTickerSymbol(symbol)}_${intervalKey}_${limit}`;
  const cached = getMarketCache<RouteCandlesResult>(cacheKey);
  if (cached) return cached;

  try {
    const candleResult = await marketDataService.getCandles(
      normalizeTickerSymbol(symbol),
      intervalKey,
      limit,
      priority,
    );
    const result: RouteCandlesResult = {
      candles: candleResult.candles,
      dataState: candleResult.dataState,
      source: candleResult.source,
      stale: candleResult.stale === true,
      ageMs: candleResult.ageMs || 0,
    };
    setMarketCache(cacheKey, result, 30000);
    return result;
  } catch {
    const result: RouteCandlesResult = {
      candles: [], dataState: 'unavailable', source: 'none', stale: false, ageMs: 0,
      error: 'verified_candles_unavailable',
    };
    setMarketCache(cacheKey, result, 5000);
    return result;
  }
}

// Verified closed-candle history for the replay engine. The selected interval
// and requested bar count are part of the cache key so the UI never presents a
// different horizon than the one actually evaluated by the backend.
async function fetchHistoricalCandlesForBacktest(
  symbol: string,
  count: number,
  interval: marketDataService.CandleInterval,
): Promise<{ candles: BacktestCandle[]; dataState: DataState; source: string }> {
  const cacheKey = `backtest_candles_${normalizeTickerSymbol(symbol)}_${interval}_${count}`;
  const cached = getMarketCache<{ candles: BacktestCandle[]; dataState: DataState; source: string }>(cacheKey);
  if (cached) return cached;

  try {
    const result = await marketDataService.getHistoricalCandles(
      normalizeTickerSymbol(symbol),
      interval,
      count,
    );
    const payload = {
      candles: result.candles.map((row) => ({
        time: new Date(row.timestamp).toISOString(),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      })),
      dataState: result.dataState,
      source: result.source,
    };
    setMarketCache(cacheKey, payload, 60000);
    return payload;
  } catch {
    return { candles: [], dataState: 'unavailable', source: 'none' };
  }
}

async function fetchMicrostructure(symbol: string): Promise<{
  orderBook: marketDataService.OrderBookResult | null;
  qStructDirectional: number | null;
  dataState: DataState;
  candles1m?: Candle[];
  candles5m?: Candle[];
  candles15m?: Candle[];
}> {
  const [orderBook, oneMinute, fiveMinute, fifteenMinute] = await Promise.all([
    marketDataService.getOrderBook(symbol, 20, 'background').catch(() => null),
    marketDataService.getCandles(symbol, '1m', 30, 'background').catch(() => null),
    marketDataService.getCandles(symbol, '5m', 30, 'background').catch(() => null),
    marketDataService.getCandles(symbol, '15m', 30, 'background').catch(() => null),
  ]);
  const toEngineCandles = (rows: Candle[] | undefined) => (rows || []).map((row) => ({
    time: new Date(row.timestamp).toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
  const one = toEngineCandles(oneMinute?.candles);
  const five = toEngineCandles(fiveMinute?.candles);
  const fifteen = toEngineCandles(fifteenMinute?.candles);
  const availability = [one.length >= 10, five.length >= 10, fifteen.length >= 10];
  const qStructDirectional = availability.some(Boolean)
    ? MathEngine.calculateQStructDirectional({
        confluence1M: MathEngine.computeRealConfluence(one),
        confluence5M: MathEngine.computeRealConfluence(five),
        confluence15M: MathEngine.computeRealConfluence(fifteen),
        confluence1MAvailable: availability[0],
        confluence5MAvailable: availability[1],
        confluence15MAvailable: availability[2],
      })
    : null;
  const state = combineDataStates(
    orderBook?.dataState ?? 'unavailable',
    oneMinute?.dataState ?? 'unavailable',
    fiveMinute?.dataState ?? 'unavailable',
    fifteenMinute?.dataState ?? 'unavailable',
  );
  return {
    orderBook,
    qStructDirectional,
    dataState: state,
    candles1m: oneMinute?.candles,
    candles5m: fiveMinute?.candles,
    candles15m: fifteenMinute?.candles,
  };
}

function candidateFromSnapshot(snapshot: ReturnType<typeof buildCanonicalDecision>): CandidateScore {
  return {
    ...snapshot.baseline,
    shadowDecision: snapshot.shadow,
    canonicalDecision: {
      confidence: snapshot.confidence,
      calibratedProbability: snapshot.calibratedProbability,
      expectedNetEdge: snapshot.expectedNetEdge,
      modelUncertainty: snapshot.modelUncertainty,
      featureCompletenessPct: snapshot.featureCompletenessPct,
      engineVersion: snapshot.engineVersion,
      createdAt: snapshot.createdAt,
      expiresAt: snapshot.expiresAt,
    },
  };
}

async function fetchCandidateEnrichment(
  symbol: string,
  lastPrice: number,
  includeShadow: boolean,
  includeDirection: boolean,
): Promise<{
  candles1h: Candle[];
  candles15m: Candle[];
  candles1m?: Candle[];
  candles5m?: Candle[];
  orderBookResult: marketDataService.OrderBookResult | null;
  qStructDirectional: number | null;
  supplementalBundle: SupplementalBundle;
  candle1hState: DataState;
  candle15mState: DataState;
}> {
  const [candle1h, candle15m, orderBookResult] = await Promise.all([
    fetchCandlesForSymbol(symbol, lastPrice, '1h', 30, 'background'),
    fetchCandlesForSymbol(symbol, lastPrice, '15m', 30, 'background'),
    marketDataService.getOrderBook(symbol, 20, 'background').catch(() => null),
  ]);

  let candles1m: Candle[] | undefined;
  let candles5m: Candle[] | undefined;
  let qStructDirectional: number | null = null;

  if (includeShadow || includeDirection) {
    const [oneMinute, fiveMinute] = await Promise.all([
      marketDataService.getCandles(symbol, '1m', 30, 'background').catch(() => null),
      marketDataService.getCandles(symbol, '5m', 30, 'background').catch(() => null),
    ]);
    candles1m = oneMinute?.candles;
    candles5m = fiveMinute?.candles;
    const one = (oneMinute?.candles || []).map((row) => ({
      time: new Date(row.timestamp).toISOString(),
      open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
    }));
    const five = (fiveMinute?.candles || []).map((row) => ({
      time: new Date(row.timestamp).toISOString(),
      open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
    }));
    const fifteen = candle15m.candles.map((row) => ({
      time: new Date(row.timestamp).toISOString(),
      open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
    }));
    const availability = [one.length >= 10, five.length >= 10, fifteen.length >= 10];
    if (includeShadow && availability.some(Boolean)) {
      qStructDirectional = MathEngine.calculateQStructDirectional({
        confluence1M: MathEngine.computeRealConfluence(one),
        confluence5M: MathEngine.computeRealConfluence(five),
        confluence15M: MathEngine.computeRealConfluence(fifteen),
        confluence1MAvailable: availability[0],
        confluence5MAvailable: availability[1],
        confluence15MAvailable: availability[2],
      });
    }
  }

  return {
    candles1h: candle1h.candles,
    candles15m: candle15m.candles,
    candles1m,
    candles5m,
    orderBookResult,
    qStructDirectional,
    supplementalBundle: getSupplementalOrchestrator().getCachedBundle(symbol),
    candle1hState: candle1h.dataState,
    candle15mState: candle15m.dataState,
  };
}

/**
 * Handle returned to the host server so it can tear down the optional
 * background Smart Autopilot loop during graceful shutdown.
 */
export interface ApexNextMarketRoutesHandle {
  stopSmartAutopilotScheduler: () => void;
}

export function registerApexNextMarketRoutes(
  app: Express,
  options?: {
    onShadowLogs?: (logs: SignalDecisionLog[]) => void;
    /**
     * Sink for SIMULATED research/paper outcome rows. Deliberately separate
     * from `onShadowLogs`: these rows must never reach the live decision memory
     * that feeds adaptive threshold proposals for live scanning.
     */
    onResearchOutcomeLogs?: (logs: SignalDecisionLog[]) => void;
    /**
     * Read-back of the research-scoped outcome store. This is how a cycle sees
     * what earlier cycles' forward paper positions actually did. It is a READ of
     * the research mirror only — the live decision memory is never passed here.
     */
    researchOutcomeLogProvider?: () => SignalDecisionLog[];
    scannerConfigProvider?: () => ScannerConfig;
  },
): ApexNextMarketRoutesHandle {
  const activeScannerConfig = (): ScannerConfig => {
    const configured = options?.scannerConfigProvider?.() ?? DEFAULT_SCANNER_CONFIG;
    return { ...configured, scoreWeights: { ...configured.scoreWeights } };
  };

  const resolveStrategyScannerConfig = (args: {
    definition: StrategyDefinition;
    parameters: Record<string, number | string>;
    scannerConfig?: ScannerConfig;
    optimizationProfile?: StrategyOptimizationProfile | null;
    authoritative?: boolean;
  }): ScannerConfig => {
    const configured = buildScannerPresetConfig(
      args.scannerConfig ?? activeScannerConfig(),
      args.definition,
      args.parameters,
      { applyDefinitionOverrides: args.authoritative !== true },
    );
    return args.optimizationProfile
      ? applyStrategyOptimizationScannerDeltas(configured, args.optimizationProfile.scannerConfigDeltas)
      : configured;
  };

  const validationReports = new Map<string, StrategyValidationReport>();
  const rankScores = new Map<string, StrategyRankScore>();
  const backtestReplayCache = new BacktestExecutionCache<StrategyReplayResult>({ ttlMs: 30_000, maxEntries: 48 });
  const strategyOptimizationStore = new StrategyOptimizationStore();
  const strategyOptimizationJobs = new Map<string, Promise<StrategyOptimizationReport>>();
  const multiAgentCouncilStore = new MultiAgentCouncilStore();
  const commanderShadowRecords = new Map<string, {
    decision: StrategyCommanderScanShadowV1['results'][number];
    horizon: string;
    expiresAt: number;
    evidenceIds: string[];
    parameterProfileFingerprints: Record<string, string>;
    evidence: CommanderEvidenceV1[];
  }>();
  let latestSmartAutopilotCycle: unknown = null;

  /**
   * The single Smart Autopilot controller. Declared here so the status route,
   * the cycle runner and the scheduler all observe one machine — there is no
   * second controller anywhere. It starts OFF and is armed either by the
   * environment flag below or by an operator request.
   */
  let autopilotController = createAutopilotControllerState(false, Date.now(), 'NONE');
  const dispatchAutopilotEvent = (event: AutopilotControllerEvent): void => {
    autopilotController = autopilotControllerReducer(autopilotController, event);
  };

  const runStrategyDefinition = async (args: {
    definition: StrategyDefinition;
    candles: BacktestCandle[];
    symbol: string;
    interval: marketDataService.CandleInterval;
    direction: 'LONG' | 'SHORT';
    maxBars: number;
    parameters?: Record<string, number | string>;
    transactionCostPct?: number;
    transactionCostModel?: TransactionCostModel;
    includeUniverse?: boolean;
    scannerConfig?: ScannerConfig;
    applyActiveOptimization?: boolean;
    scannerConfigAuthoritative?: boolean;
  }): Promise<StrategyReplayResult> => {
    if (args.definition.status === 'blocked' || args.definition.status === 'deprecated') {
      throw new Error(args.definition.blockedReason || 'This strategy is not executable in the current APEX data environment.');
    }

    if (!args.definition.supportedIntervals.includes(args.interval)) {
      throw new Error(`${args.definition.name} does not support the ${args.interval} interval.`);
    }

    const optimizationContext: StrategyOptimizationContext = {
      strategyId: args.definition.strategyId,
      symbol: args.symbol,
      interval: args.interval,
      direction: args.direction,
    };
    const activeOptimization = args.applyActiveOptimization === false
      ? null
      : strategyOptimizationStore.getActive(optimizationContext);
    const effectiveParameters = buildStrategyParameterValues(args.definition, {
      ...(activeOptimization?.parameters || {}),
      ...(args.parameters || {}),
    });
    const transactionCostModel = args.transactionCostModel
      ?? (Number.isFinite(args.transactionCostPct) ? transactionCostModelFromRoundTripPct(Number(args.transactionCostPct)) : null);
    if (!transactionCostModel) throw new Error('An explicit transaction-cost model is required for strategy replay.');
    let result: StrategyReplayResult;
    if (args.definition.engine === 'scanner-preset') {
      const effectiveScannerConfig = resolveStrategyScannerConfig({
        definition: args.definition,
        parameters: effectiveParameters,
        scannerConfig: args.scannerConfig,
        optimizationProfile: activeOptimization,
        authoritative: args.scannerConfigAuthoritative,
      });
      result = runScannerPresetStrategy({
        candles: args.candles,
        symbol: args.symbol,
        interval: args.interval,
        direction: args.direction,
        maxBars: args.maxBars,
        baseConfig: effectiveScannerConfig,
        definition: args.definition,
        transactionCostPct: args.transactionCostPct,
        parameters: {},
        applyDefinitionOverrides: false,
      });
    } else {
      const runner = args.definition.runFn ? bespokeStrategyRunners[args.definition.runFn] : undefined;
      if (!runner) throw new Error(`Strategy engine ${args.definition.runFn || 'unknown'} is not registered.`);

      let universeCandles: Record<string, BacktestCandle[]> | undefined;
      if (args.definition.runFn === 'adaptiveTrendPortfolio' && args.includeUniverse !== false) {
        const market = await fetchKuCoinTickers(20);
        const symbols = [...market.tickers]
          .sort((left, right) => right.turnover24h - left.turnover24h)
          .map((ticker) => ticker.symbol)
          .filter((symbol, index, list) => list.indexOf(symbol) === index)
          .slice(0, 5);
        if (!symbols.includes(args.symbol)) symbols.unshift(args.symbol);
        const rows = await Promise.all(symbols.slice(0, 5).map(async (symbol) => {
          const history = await fetchHistoricalCandlesForBacktest(symbol, args.candles.length, args.interval);
          return [symbol, history.candles] as const;
        }));
        universeCandles = Object.fromEntries(rows.filter(([, candles]) => candles.length >= 80));
      }

      result = runner({
        symbol: args.symbol,
        interval: args.interval,
        direction: args.direction,
        maxBars: args.maxBars,
        candles: args.candles,
        universeCandles,
        parameters: effectiveParameters,
        transactionCostModel,
      });
    }

    if (activeOptimization) {
      result.summary.optimizationProfile = {
        revision: activeOptimization.revision,
        promotedAt: activeOptimization.promotedAt,
        sourceReportAt: activeOptimization.sourceReportAt,
      };
    }
    return result;
  };

  const optimizeAutopilotContext = async (args: {
    definition: StrategyDefinition;
    symbol: string;
    interval: marketDataService.CandleInterval;
    direction: 'LONG' | 'SHORT';
    requestedBars: number;
    maxHoldBars: number;
    coarseCandidates: number;
    refinementCandidates: number;
    maxConcurrent: number;
    commissionPctPerSide: number;
    slippagePctPerSide: number;
    fundingPctEstimate: number;
  }): Promise<{ report: StrategyOptimizationReport; council: SmartAutopilotOptimizationCouncil; promotionGate: AutomaticPromotionGateResult | null; activeProfile: StrategyOptimizationProfile | null; promoted: boolean }> => {
    const context: StrategyOptimizationContext = {
      strategyId: args.definition.strategyId, symbol: args.symbol, interval: args.interval, direction: args.direction,
    };
    const activeProfile = strategyOptimizationStore.getActive(context);
    const jobKey = [
      context.strategyId, context.symbol, context.interval, context.direction, args.requestedBars, args.maxHoldBars,
      args.coarseCandidates, args.refinementCandidates, args.maxConcurrent, false,
      args.commissionPctPerSide, args.slippagePctPerSide, args.fundingPctEstimate,
      `base-r${activeProfile?.revision ?? 0}`,
    ].join('|');

    let job = strategyOptimizationJobs.get(jobKey);
    let ownsJob = false;
    if (!job) {
      ownsJob = true;
      job = (async () => {
        const historical = await fetchHistoricalCandlesForBacktest(args.symbol, args.requestedBars, args.interval);
        if (historical.candles.length < 1_000) throw new Error(`insufficient_optimization_history:${historical.candles.length}`);
        const defaultParameters = Object.fromEntries(args.definition.parameters.map((parameter) => [parameter.key, parameter.default]));
        const baseParameters = normalizeStrategyParameterAliases(args.definition, { ...defaultParameters, ...(activeProfile?.parameters || {}) });
        const globalScannerConfig = activeScannerConfig();
        const baseScannerConfig = activeProfile?.scannerConfig ?? {
          ...globalScannerConfig,
          ...(args.definition.scannerConfigOverrides || {}),
          scoreWeights: {
            ...globalScannerConfig.scoreWeights,
            ...(args.definition.scoreWeights || {}),
            ...(args.definition.scannerConfigOverrides?.scoreWeights || {}),
          },
        };
        const roundTripCostPct = args.commissionPctPerSide * 2 + args.slippagePctPerSide * 2 + args.fundingPctEstimate;
        const report = await optimizeStrategy({
          definition: args.definition,
          candles: historical.candles,
          baseScannerConfig,
          baseParameters,
          symbol: args.symbol,
          interval: args.interval,
          direction: args.direction,
          transactionCostPct: roundTripCostPct,
          autoPromote: false,
          budget: {
            coarseCandidates: args.coarseCandidates,
            refinementCandidates: args.refinementCandidates,
            maxConcurrent: args.maxConcurrent,
            purgeBars: args.maxHoldBars,
            embargoBars: args.maxHoldBars,
          },
          evaluator: async ({ candles, parameters, scannerConfig, transactionCostPct }) => {
            const replay = await runStrategyDefinition({
              definition: args.definition,
              candles,
              symbol: args.symbol,
              interval: args.interval,
              direction: args.direction,
              maxBars: args.maxHoldBars,
              parameters,
              scannerConfig,
              transactionCostPct,
              includeUniverse: false,
              applyActiveOptimization: false,
              scannerConfigAuthoritative: true,
            });
            return strategyOptimizationMetricsFromSummary(replay.summary);
          },
        });
        if (args.definition.runFn === 'adaptiveTrendPortfolio') {
          report.promotion.eligible = false;
          report.promotion.blockers = [...new Set([...report.promotion.blockers, 'multi_symbol_universe_identity_required'])];
          report.warnings.push('The portfolio strategy was optimized as a single-symbol diagnostic only; automatic promotion is blocked until synchronized universe identities are persisted.');
        }
        strategyOptimizationStore.saveReport(report);
        return report;
      })();
      strategyOptimizationJobs.set(jobKey, job);
    }

    try {
      const report = await job;
      const council = runSmartAutopilotOptimizationCouncil(report);
      let promoted = false;
      let promotionGate: AutomaticPromotionGateResult | null = null;

      // The council is the cheap gate. Only when it approves do we spend the
      // walk-forward suite, and only when THAT also passes may the profile be
      // promoted without a human. This can only narrow promotion.
      if (council.approvedForPromotion) {
        let validation: StrategyValidationReport | null = null;
        let rank: StrategyRankScore | null = null;
        let validationError: string | null = null;

        // The one identity this cycle may promote, materialized from the winner
        // exactly as `StrategyOptimizationStore.promote` will install it. The
        // same object is validated below and handed to the gate, so "validated"
        // and "promoted" cannot drift apart.
        const candidateSubject = optimizationCandidateSubject({
          definition: args.definition,
          parameters: report.winner.parameters,
          scannerConfig: report.winner.scannerConfig,
          sourceReportAt: report.generatedAt,
          activeProfileRevision: activeProfile?.revision ?? null,
        });

        try {
          const suite = await runStrategyValidationSuite({
            definition: args.definition,
            symbol: args.symbol,
            interval: args.interval,
            direction: args.direction,
            maxHoldBars: args.maxHoldBars,
            costAssumptions: {
              commissionPctPerSide: args.commissionPctPerSide,
              slippagePctPerSide: args.slippagePctPerSide,
              fundingPctEstimate: args.fundingPctEstimate,
            },
            subject: candidateSubject,
            // The active profile appears ONLY here, as an explicit comparison.
            // It never touches the candidate's own gates.
            baseline: activeProfile
              ? activeProfileSubject({ definition: args.definition, profile: activeProfile })
              : null,
          });
          if (suite.status === 'completed') {
            validation = suite.report;
            rank = suite.rank;
            validationReports.set(args.definition.strategyId, suite.report);
            rankScores.set(args.definition.strategyId, suite.rank);
          } else {
            validationError = `insufficient_validation_history:${suite.candles}`;
          }
        } catch (error) {
          // A failed validation run must never fall through to promotion.
          validationError = error instanceof Error ? error.message : String(error);
        }

        promotionGate = evaluateAutomaticPromotionGate({
          strategyId: args.definition.strategyId,
          strategyVersion: args.definition.version,
          reportGeneratedAt: report.generatedAt,
          optimizerEligible: report.promotion.eligible,
          councilApproved: council.approvedForPromotion,
          validation,
          rank,
          candidateSubject,
        });
        if (validationError) {
          promotionGate = {
            ...promotionGate,
            authorized: false,
            blockers: [...new Set([...promotionGate.blockers, `validation_run_failed:${validationError}`])],
          };
        }

        if (promotionGate.authorized) {
          const latestProfile = strategyOptimizationStore.getActive(context);
          if (!latestProfile || latestProfile.sourceReportAt !== report.generatedAt) {
            strategyOptimizationStore.promote(report, 'AUTOMATIC_PROMOTION');
            promoted = true;
            report.promotion.automaticallyPromoted = true;
            report.warnings.push('smart_autopilot_multi_agent_promotion_completed');
            strategyOptimizationStore.saveReport(report);
          }
        } else {
          report.warnings.push(`smart_autopilot_promotion_blocked_by_validation:${promotionGate.blockers.join(',')}`);
          strategyOptimizationStore.saveReport(report);
        }
      }
      return { report, council, promotionGate, activeProfile: strategyOptimizationStore.getActive(context), promoted };
    } finally {
      if (ownsJob) strategyOptimizationJobs.delete(jobKey);
    }
  };

  const buildBacktestPayload = (args: {
    replay: StrategyReplayResult;
    candles: BacktestCandle[];
    definition: StrategyDefinition;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    interval: marketDataService.CandleInterval;
    source: string;
    dataState: DataState;
    requestedBars: number;
    maxHoldBars: number;
    costModel?: BacktestResult['costModel'];
    runId?: string;
    configFingerprint?: string;
  }): BacktestResult => {
    const timeline = args.replay.trades.map((trade) => {
      const riskPct = trade.entry > 0 ? Math.abs(trade.entry - trade.stop) / trade.entry * 100 : 0;
      const rMultiple = riskPct > 0 ? trade.pnlPct / riskPct : 0;
      return {
        symbol: trade.symbol ?? args.symbol,
        timestamp: Date.parse(trade.entryTime),
        price: Number(trade.entry.toFixed(8)),
        score: Math.round((trade.rawScore ?? trade.confidence ?? 0) * 100),
        tier: trade.outcome === 'TP' ? 'CONFIRMED' as const : trade.outcome === 'SL' ? 'CAUTION' as const : 'WATCHLIST' as const,
        outcome: trade.pnlPct > 0 ? 'WIN' as const : trade.pnlPct < 0 ? 'LOSS' as const : 'OPEN' as const,
        entry: Number(trade.entry.toFixed(8)),
        exit: Number(trade.exit.toFixed(8)),
        stop: Number(trade.stop.toFixed(8)),
        target: Number(trade.target.toFixed(8)),
        rMultiple: Number(rMultiple.toFixed(3)),
        barsHeld: trade.barsHeld,
        pnlPct: Number(trade.pnlPct.toFixed(4)),
        reason: trade.entryReason,
      };
    });

    let peak = args.replay.equityCurve[0] ?? 100;
    const equityCurve = args.replay.equityCurve.map((equity, index) => {
      peak = Math.max(peak, equity);
      const trade = args.replay.trades[Math.max(0, index - 1)];
      return {
        step: index,
        timestamp: trade ? Date.parse(trade.exitTime) : undefined,
        equity: Number(equity.toFixed(5)),
        drawdownPct: Number((peak > 0 ? ((equity - peak) / peak) * 100 : 0).toFixed(5)),
      };
    });

    const avgRMultiple = timeline.length ? timeline.reduce((sum, row) => sum + row.rMultiple, 0) / timeline.length : 0;
    const firstClose = args.candles.find((candle) => Number.isFinite(candle.close) && candle.close > 0)?.close || 1;
    const sampleStride = Math.max(1, Math.ceil(args.candles.length / 600));
    const marketCurve = args.candles
      .filter((_candle, index) => index % sampleStride === 0 || index === args.candles.length - 1)
      .map((candle, index) => ({
        step: index,
        timestamp: Date.parse(candle.time),
        close: Number(candle.close.toFixed(8)),
        normalized: Number(((candle.close / firstClose) * 100).toFixed(5)),
      }));
    const warmupBars = Math.min(220, Math.max(40, Math.floor(args.candles.length * 0.12)));
    const diagnostics: NonNullable<BacktestResult['diagnostics']> = {
      requestedBars: args.requestedBars,
      candlesReturned: args.candles.length,
      warmupBars,
      executableBars: Math.max(0, args.candles.length - warmupBars),
      tradeCount: timeline.length,
      noTradeReason: timeline.length
        ? undefined
        : args.replay.summary.acceptedCandidates === 0
          ? 'No setup passed the strategy entry and risk gates in the requested history.'
          : 'Candidates were detected but none resolved into a completed trade within the hold window.',
    };
    const validationCapability = strategyValidationCapability(args.definition);
    const validationDisclaimer = validationCapability.scope === 'BASE_REPLAY'
      ? `Base-replay evidence only. ${validationCapability.limitations.join(' ')} Historical results are not a guarantee of future performance.`
      : 'Backtests are deterministic historical simulations with explicit costs and bounded rules. Historical results are not a guarantee of future performance.';
    return {
      symbol: args.symbol,
      direction: args.direction,
      interval: args.interval,
      source: args.source,
      requestedBars: args.requestedBars,
      maxHoldBars: args.maxHoldBars,
      candlesUsed: args.replay.summary.candles,
      lookbackCandles: args.requestedBars,
      simulatedScans: diagnostics.executableBars,
      flaggedSignals: (args.replay.summary.acceptedCandidates ?? args.replay.trades.length) + (args.replay.summary.rejectedCandidates ?? 0),
      acceptedCandidates: args.replay.summary.acceptedCandidates ?? args.replay.trades.length,
      rejectedCandidates: args.replay.summary.rejectedCandidates ?? 0,
      rejectionCounts: args.replay.summary.rejectionCounts ?? {},
      historicalWinRatePct: Number((args.replay.summary.winRate * 100).toFixed(1)),
      avgRMultipleRealized: Number(avgRMultiple.toFixed(2)),
      avgPnlPct: Number(args.replay.summary.avgPnlPct.toFixed(4)),
      totalPnlPct: Number(args.replay.summary.totalPnlPct.toFixed(4)),
      maxDrawdownPct: Number(Math.abs(args.replay.summary.maxDrawdownPct).toFixed(4)),
      profitFactor: Number.isFinite(args.replay.summary.profitFactor) ? Number(args.replay.summary.profitFactor.toFixed(4)) : null,
      wins: args.replay.summary.wins,
      losses: args.replay.summary.losses,
      timed: args.replay.summary.timed,
      equityCurve,
      marketCurve,
      diagnostics,
      timeline,
      dataState: args.dataState,
      strategy: args.definition.strategyId,
      strategyVersion: args.definition.version,
      replayMode: args.replay.summary.replayMode ?? 'DETERMINISTIC_STRATEGY_REPLAY',
      configOverrides: args.replay.summary.configOverrides ?? [],
      effectiveScoreWeights: args.replay.summary.effectiveScoreWeights,
      costModel: args.costModel,
      audit: {
        runId: args.runId || `bt-${Date.now()}`,
        engine: args.definition.engine === 'scanner-preset' ? 'APEX_CANONICAL_REPLAY' : `APEX_${args.definition.runFn || 'BESPOKE'}_REPLAY`,
        generatedAt: Date.now(),
        closedCandlesOnly: true,
        lookaheadPolicy: 'DISABLED',
        fillPolicy: 'NEXT_BAR_OR_BRACKET',
        deterministic: true,
        configFingerprint: args.configFingerprint || `${args.definition.strategyId}:${args.symbol}:${args.interval}:${args.direction}:${args.requestedBars}:${args.maxHoldBars}`,
        optimizationRevision: args.replay.summary.optimizationProfile?.revision,
        optimizationSourceReportAt: args.replay.summary.optimizationProfile?.sourceReportAt,
      },
      disclaimer: validationDisclaimer,
    };
  };

  /**
   * Shared walk-forward validation suite.
   *
   * Extracted verbatim from the `/validate` route so that Smart Autopilot's
   * automatic-promotion gate measures a candidate with exactly the same gates,
   * cost stress, neighbour perturbation and regime slices an operator sees.
   *
   * The suite NEVER decides for itself what it is measuring. Every caller — the
   * manual `/validate` route and the automatic-promotion path alike — passes a
   * fully materialized `subject`, and every replay inside the suite is built by
   * `validationReplayInputs`, which pins `applyActiveOptimization: false` as a
   * literal. There is therefore no code path left in which validation silently
   * reads the active optimization profile, and no window in which a promotion
   * landing mid-suite could change the identity under test.
   *
   * `baseline` is the ONLY way the previously active profile can appear in a
   * report, it must be requested explicitly, and it is recorded as a comparison
   * that never contributes to `gates` or `passedAllGates`.
   */
  const runStrategyValidationSuite = async (args: {
    definition: StrategyDefinition;
    symbol: string;
    interval: marketDataService.CandleInterval;
    direction: 'LONG' | 'SHORT';
    maxHoldBars: number;
    costAssumptions: { commissionPctPerSide: number; slippagePctPerSide: number; fundingPctEstimate: number };
    subject: StrategyValidationSubject;
    baseline?: StrategyValidationSubject | null;
  }): Promise<
    | { status: 'insufficient_history'; candles: number }
    | { status: 'completed'; report: StrategyValidationReport; rank: StrategyRankScore }
  > => {
    const { definition, symbol, interval, direction, maxHoldBars, costAssumptions, subject } = args;
    const baseTransactionCostModel = transactionCostModelFromPerSideAssumptions(costAssumptions);
    const historical = await fetchHistoricalCandlesForBacktest(symbol, 2_400, interval);
    if (historical.candles.length < 1_200) {
      return { status: 'insufficient_history', candles: historical.candles.length };
    }

    const sliceSize = Math.floor(historical.candles.length / 4);
    const slices = [0, 1, 2, 3].map((index) => historical.candles.slice(index * sliceSize, index === 3 ? historical.candles.length : (index + 1) * sliceSize));
    const runSlice = async (candles: BacktestCandle[], transactionCostModel = baseTransactionCostModel, overrides?: Record<string, number | string>) => {
      const replay = await runStrategyDefinition({
        definition, candles, symbol, interval, direction, maxBars: maxHoldBars, transactionCostModel,
        includeUniverse: false,
        // Every slice replays the pinned subject. `applyActiveOptimization` is a
        // literal `false` here, not a defaulted flag, so this replay cannot read
        // the optimization store even if the active profile changes mid-suite.
        ...validationReplayInputs(subject, overrides),
      });
      const roundTripCostPct = computeTransactionCostPct(transactionCostInputsFromModel(transactionCostModel, candles[0]?.close || 1, 1));
      return buildBacktestPayload({
        replay, candles, definition, symbol, direction, interval, source: historical.source, dataState: historical.dataState,
        requestedBars: candles.length, maxHoldBars,
        costModel: { ...costAssumptions, roundTripCostPct, appliedByEngine: true },
      });
    };

    const windowResults = await Promise.all(slices.slice(0, 3).map((candles, index) => runSlice(candles).then((result) => ({
      label: `Walk-forward ${index + 1}`,
      from: Date.parse(candles[0].time),
      to: Date.parse(candles.at(-1)?.time || candles[0].time),
      result,
    }))));
    const holdoutResult = await runSlice(slices[3]);
    const stressedTransactionCostModel = transactionCostModelFromPerSideAssumptions(costAssumptions, { feeMultiplier: 2, slippageMultiplier: 2 });
    const costStressResult = await runSlice(slices[3], stressedTransactionCostModel);
    // Neighbours perturb the values actually under test. The subject is already
    // fully materialized — for definition defaults it carries the defaults — so
    // there is one source of truth here rather than a candidate/else branch.
    const numericBase = Object.fromEntries(
      Object.entries(subject.parameters)
        .filter(([, value]) => typeof value === 'number')
        .map(([key, value]) => [key, Number(value)]),
    );
    const neighborDeltas = [-0.1, 0.1, -0.2, 0.2];
    const neighborRuns = await Promise.all(neighborDeltas.map(async (delta) => {
      const parameters = Object.fromEntries(Object.entries(numericBase).map(([key, value]) => [key, value * (1 + delta)]));
      const result = await runSlice(slices[3], baseTransactionCostModel, parameters);
      return { paramDelta: Object.fromEntries(Object.keys(parameters).map((key) => [key, delta])), totalPnlPct: result.totalPnlPct };
    }));
    const reproducibilityCheck = await runSlice(slices[3]);
    const regimeSelection = selectIndependentRegimeSlices(historical.candles);
    const regimeResults = regimeSelection.status === 'available'
      ? Object.fromEntries(await Promise.all(Object.entries(regimeSelection.slices).map(async ([label, slice]) => [label, await runSlice(slice.candles)] as const)))
      : undefined;
    const holdoutRange = { from: Date.parse(slices[3][0].time), to: Date.parse(slices[3].at(-1)?.time || slices[3][0].time), result: holdoutResult };

    // The baseline is opt-in and comparison-only. It replays a DIFFERENT
    // identity over the same holdout candles, using its own pinned subject, so
    // it can never leak into the candidate's replays above — those already ran.
    let baseline: StrategyValidationReport['baseline'];
    if (args.baseline) {
      const baselineSubject = args.baseline;
      const baselineReplay = await runStrategyDefinition({
        definition, candles: slices[3], symbol, interval, direction, maxBars: maxHoldBars,
        transactionCostModel: baseTransactionCostModel,
        includeUniverse: false,
        ...validationReplayInputs(baselineSubject),
      });
      const baselineRoundTripCostPct = computeTransactionCostPct(
        transactionCostInputsFromModel(baseTransactionCostModel, slices[3][0]?.close || 1, 1),
      );
      const baselineResult = buildBacktestPayload({
        replay: baselineReplay, candles: slices[3], definition, symbol, direction, interval,
        source: historical.source, dataState: historical.dataState,
        requestedBars: slices[3].length, maxHoldBars,
        costModel: { ...costAssumptions, roundTripCostPct: baselineRoundTripCostPct, appliedByEngine: true },
      });
      baseline = {
        subject: identifyStrategyValidationSubject(baselineSubject),
        comparedOn: 'HOLDOUT_SLICE',
        holdoutTotalPnlPct: baselineResult.totalPnlPct,
        holdoutMaxDrawdownPct: baselineResult.maxDrawdownPct,
        holdoutGates: {
          data: gateData(baselineResult),
          sample: gateSample(baselineResult),
          outOfSample: gateOutOfSample(baselineResult),
          drawdown: gateDrawdown(baselineResult),
        },
      };
    }

    const validationCapability = strategyValidationCapability(definition);
    const report = buildStrategyValidationReport({
      strategyId: definition.strategyId,
      strategyVersion: definition.version,
      windows: windowResults,
      holdout: holdoutRange,
      neighborRuns,
      costStressResult,
      feeMultiplier: 2,
      slippageMultiplier: 2,
      regimeResults,
      regimeStatus: regimeSelection.status,
      regimeReason: regimeSelection.reason,
      triedVariants: neighborRuns.length + windowResults.length + 3,
      reproducible: Math.abs(reproducibilityCheck.totalPnlPct - holdoutResult.totalPnlPct) < 0.0001,
      validationScope: validationCapability.scope,
      validationLimitations: validationCapability.limitations,
      subject: identifyStrategyValidationSubject(subject),
      baseline,
    });
    const rank = scoreStrategyValidation(report, { symbolGroup: symbol, timeframe: interval, regime: 'mixed' });
    return { status: 'completed', report, rank };
  };
  app.get('/api/market/top-volume', async (req: Request, res: Response) => {
    const requestedLimit = Number(req.query.limit ?? 40);
    const limit = Math.min(120, Math.max(10, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 40));
    const { tickers, dataState, source } = await fetchKuCoinTickers(limit);
    const sorted = [...tickers].sort((a, b) => b.turnover24h - a.turnover24h).slice(0, limit);
    res.json({ symbols: sorted, count: sorted.length, dataState, source, limit, timestamp: Date.now() });
  });

  app.get('/api/market/gainers-losers', async (req: Request, res: Response) => {
    const minLiquidityUsd = Number(req.query.minLiquidity || '10000000');
    const { tickers, dataState, source } = await fetchKuCoinTickers();
    const qualified = tickers.filter((t) => t.turnover24h >= minLiquidityUsd);
    const gainers = [...qualified].sort((a, b) => b.priceChange24hPct - a.priceChange24hPct).slice(0, 10);
    const losers = [...qualified].sort((a, b) => a.priceChange24hPct - b.priceChange24hPct).slice(0, 10);
    res.json({ gainers, losers, minLiquidityUsd, dataState, source, timestamp: Date.now() });
  });

  app.get('/api/market/correlation', async (req: Request, res: Response) => {
    const limit = Math.min(10, Math.max(3, Number(req.query.limit ?? 8)));
    const { tickers, dataState } = await fetchKuCoinTickers();
    const topSymbols = [...tickers]
      .sort((a, b) => b.turnover24h - a.turnover24h)
      .slice(0, limit)
      .map((t) => t.symbol);

    const pricesMap: Record<string, number[]> = {};
    const candleStates = await mapWithConcurrency(
      topSymbols,
      3,
      async (symbol) => {
        const ticker = tickers.find((t) => t.symbol === symbol);
        const result = await fetchCandlesForSymbol(symbol, ticker?.lastPrice || 100, '1h', 30, 'background');
        pricesMap[symbol] = result.candles.map((c) => c.close);
        return result.dataState;
      },
    );

    const effectiveState: DataState = candleStates.every((state) => state === 'live') ? dataState : 'degraded';
    const correlation = buildCorrelationMatrix(topSymbols, pricesMap, effectiveState);
    res.json(correlation);
  });

  app.get('/api/market/sentiment', async (_req: Request, res: Response) => {
    const { tickers, dataState } = await fetchKuCoinTickers();
    let avgFunding = 0;
    if (tickers.length > 0) {
      avgFunding = tickers.reduce((sum, t) => sum + (t.fundingRate || 0), 0) / tickers.length;
    }
    const composite = calculateSentimentComposite({
      fundingRateSkewPct: Number((avgFunding * 100).toFixed(4)),
      fundingState: dataState,
      longShortRatio: undefined,
      longShortState: 'not_configured',
      headlineToneScore: undefined,
      headlineState: 'not_configured',
    });
    res.json(composite);
  });

  app.get('/api/market/candidates', async (req: Request, res: Response) => {
    const minLiquidityUsd = Number(req.query.minLiquidity || '10000000');
    const requestedLimit = Number(req.query.limit || 16);
    const includeShadow = String(req.query.includeShadow ?? '1') !== '0';
    const includeDirection = String(req.query.includeDirection ?? '1') !== '0';
    const scanLimit = Math.min(24, Math.max(6, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 16));
    const responseCacheKey = `candidate_response_${scanLimit}_${Math.round(minLiquidityUsd)}_${includeShadow ? 'shadow' : 'fast'}_${includeDirection ? 'direction' : 'plain'}`;
    const cachedResponse = getMarketCache<any>(responseCacheKey);
    if (cachedResponse) {
      res.json(cachedResponse);
      return;
    }
    const { tickers, dataState, source } = await fetchKuCoinTickers(Math.max(24, scanLimit));
    const scanTickers = [...tickers]
      .filter((ticker) => ticker.turnover24h >= minLiquidityUsd)
      .sort((a, b) => b.turnover24h - a.turnover24h)
      .slice(0, scanLimit);
    const scanTimestamp = Date.now();
    const cycleId = `candidates-${scanTimestamp}`;
    const longCandidates: CandidateScore[] = [];
    const shortCandidates: CandidateScore[] = [];
    const opportunityCandidates: OpportunityCandidateV1[] = [];
    const parliamentResults: IntelligenceConsensusV1[] = [];
    const parliamentFailures: ParliamentScanShadowV1['failures'] = [];
    const commanderResults: StrategyCommanderScanShadowV1['results'] = [];
    const evidenceCompetenceResults: EvidenceCompetenceV1[] = [];
    const commanderFailures: StrategyCommanderScanShadowV1['failures'] = [];
    const commanderDefinitions = listStrategyDefinitions();
    const commanderUniverse = scanTickers.map((ticker) => ticker.symbol);
    let commanderOutcomeObservations: ReturnType<typeof extractCommanderOutcomeObservations>['observations'] = [];
    try {
      commanderOutcomeObservations = extractCommanderOutcomeObservations(options?.researchOutcomeLogProvider?.() ?? []).observations;
    } catch {
      commanderOutcomeObservations = [];
    }
    const evidenceOutcomeObservations = extractEvidenceOutcomeObservations(commanderOutcomeObservations);
    const snapshotRows: Array<{ snapshot: ReturnType<typeof buildCanonicalDecision>; direction: TradeDirection }> = [];

    const marketInputs = await mapWithConcurrency(
      scanTickers,
      3,
      async (ticker) => {
        const enrichment = await fetchCandidateEnrichment(ticker.symbol, ticker.lastPrice, includeShadow, includeDirection);
        return {
          enrichment,
          state: combineDataStates(
            dataState,
            enrichment.candle1hState,
            enrichment.candle15mState,
            enrichment.orderBookResult?.dataState ?? 'unavailable',
          ),
        };
      },
    );
    const effectiveState: DataState = marketInputs.every((input) => input.state === 'live')
      ? dataState
      : marketInputs.some((input) => input.state !== 'unavailable')
        ? 'degraded'
        : 'unavailable';

    scanTickers.forEach((ticker, idx) => {
      const { enrichment, state } = marketInputs[idx];
      const orderBook = enrichment.orderBookResult?.summary ?? unavailableOrderBook(ticker.symbol);
      const guardedTicker: SymbolTicker = { ...ticker, dataState: state };
      const shadowCtx = {
        ticker: guardedTicker,
        candles1h: enrichment.candles1h,
        candles15m: enrichment.candles15m,
        candles1m: enrichment.candles1m,
        candles5m: enrichment.candles5m,
        orderBook,
        orderBookDetail: enrichment.orderBookResult,
        qStructDirectional: enrichment.qStructDirectional,
        minLiquidityUsd,
        scannerConfig: activeScannerConfig(),
        advancedInputs: { supplementalBundle: enrichment.supplementalBundle },
      };
      const opportunity = discoverOpportunity({
        ticker: guardedTicker,
        candles1h: enrichment.candles1h,
        candles15m: enrichment.candles15m,
        orderBook,
        horizon: '1h',
        timestamp: scanTimestamp,
        asOfTimestamp: scanTimestamp,
        minLiquidityUsd,
      });
      opportunityCandidates.push(opportunity);
      try {
        const nativeParliament = buildNativeParliamentSnapshot({
          ticker: guardedTicker,
          candles1h: enrichment.candles1h,
          candles15m: enrichment.candles15m,
          candles1m: enrichment.candles1m,
          candles5m: enrichment.candles5m,
          orderBook: enrichment.orderBookResult?.book,
          spread: enrichment.orderBookResult?.spread, supplementalBundle: enrichment.supplementalBundle,
          timestamp: scanTimestamp,
          source,
        });
        const parliament = nativeParliament.consensus;
        parliamentResults.push(parliament);
        const preliminaryCommander = buildStrategyCommanderDecision({
          consensus: parliament,
          opportunity,
          definitions: commanderDefinitions,
          universe: commanderUniverse,
        });
        const commanderDirection = preliminaryCommander.marketContext.preferredDirection;
        const parameterProfileFingerprints = Object.fromEntries(commanderDefinitions.map((definition) => {
          const activeProfile = commanderDirection
            ? strategyOptimizationStore.getActive({
              strategyId: definition.strategyId,
              symbol: guardedTicker.symbol,
              interval: opportunity.horizon,
              direction: commanderDirection,
            })
            : null;
          return [definition.strategyId, strategyParameterProfileFingerprint(definition, activeProfile?.parameters)];
        }));
        const unobservedCommanderDecision = buildStrategyCommanderDecision({
          consensus: parliament,
          opportunity,
          definitions: commanderDefinitions,
          universe: commanderUniverse,
          parameterProfileFingerprints,
        });
        const observedStrategyCompetence = Object.fromEntries(unobservedCommanderDecision.rankings.map((ranking) => [
          ranking.strategyId,
          resolveStrategyCompetenceForIdentity({
            target: {
              strategyId: ranking.strategyId,
              strategyVersion: ranking.strategyVersion,
              parameterProfileFingerprint: parameterProfileFingerprints[ranking.strategyId],
              symbol: guardedTicker.symbol,
              interval: opportunity.horizon,
              direction: unobservedCommanderDecision.marketContext.preferredDirection!,
              regime: unobservedCommanderDecision.marketContext.regime,
              thesis: unobservedCommanderDecision.marketContext.primaryThesis ?? null,
              trendRelation: unobservedCommanderDecision.marketContext.trendRelation,
            },
            observations: commanderOutcomeObservations,
          }),
        ]));
        const commanderDecision = buildStrategyCommanderDecision({
          consensus: parliament,
          opportunity,
          definitions: commanderDefinitions,
          universe: commanderUniverse,
          parameterProfileFingerprints,
          observedStrategyCompetence,
        });
        for (const evidence of nativeParliament.evidence) {
          evidenceCompetenceResults.push(resolveEvidenceCompetence({
            target: {
              evidenceId: evidence.evidenceId,
              symbol: evidence.symbol,
              expertId: evidence.expertId,
              expertVersion: evidence.expertVersion,
              family: evidence.family,
              timeframe: evidence.timeframe,
              direction: evidence.direction,
              regime: commanderDecision.marketContext.regime,
              thesis: commanderDecision.marketContext.primaryThesis ?? null,
              trendRelation: commanderDecision.marketContext.trendRelation,
            },
            observations: evidenceOutcomeObservations,
          }));
        }
        commanderResults.push(commanderDecision);
        commanderShadowRecords.set(guardedTicker.symbol.toUpperCase(), {
          decision: commanderDecision,
          horizon: opportunity.horizon,
          expiresAt: scanTimestamp + 90_000,
          evidenceIds: [...parliament.evidenceIds],
          parameterProfileFingerprints,
          evidence: nativeParliament.evidence.map((row) => ({
            ...row,
            thesisTags: [...row.thesisTags], supportingReasons: [...row.supportingReasons], conflictingReasons: [...row.conflictingReasons], rawEvidenceIds: [...row.rawEvidenceIds],
          })),
        });
      } catch {
        parliamentFailures.push({ symbol: guardedTicker.symbol, reason: 'shadow_evaluation_failed' });
        commanderFailures.push({ symbol: guardedTicker.symbol, reason: 'commander_evaluation_failed' });
      }
      const longSnapshot = buildCanonicalDecision(shadowCtx, 'LONG', { includeShadow });
      const shortSnapshot = buildCanonicalDecision(shadowCtx, 'SHORT', { includeShadow });
      const oneMinute = toDirectionCandles(enrichment.candles1m);
      const fiveMinute = toDirectionCandles(enrichment.candles5m);
      const fifteenMinute = toDirectionCandles(enrichment.candles15m);
      const oneHour = toDirectionCandles(enrichment.candles1h);
      const directionContext = {
        fundingRate: guardedTicker.fundingRate,
        marketDataSource: directionMarketSource(source, state),
      };
      const confluence1MAvailable = oneMinute.length >= 10;
      const candidateLevels = deriveSymbolLevels(guardedTicker, enrichment.candles1h, 'ATR_BANDS');
      const lifecycleBase = {
        smoothedObi: marketStatistics.smoothOBI(guardedTicker.symbol, Math.max(-1, Math.min(1, orderBook.imbalancePct / 100))),
        confluence1M: confluence1MAvailable ? MathEngine.computeRealConfluence(oneMinute) : 0,
        confluenceAvailable: confluence1MAvailable,
        dataState: combineDataStates(state, orderBook.dataState),
        entryPrice: candidateLevels.entry,
      };
      const longLifecycleContext = {
        ...lifecycleBase,
        stopLoss: candidateLevels.supports[0],
        takeProfit: candidateLevels.resistances[0],
      };
      const shortLifecycleContext = {
        ...lifecycleBase,
        stopLoss: candidateLevels.resistances[0],
        takeProfit: candidateLevels.supports[0],
      };
      const longCandidate: CandidateScore = {
        ...candidateFromSnapshot(longSnapshot),
        lifecycleContext: longLifecycleContext,
        directionDivergenceShadow: includeDirection
          ? buildDirectionDivergence('LONG', { '1m': oneMinute, '5m': fiveMinute, '15m': fifteenMinute, '1h': oneHour }, directionContext)
          : undefined,
      };
      const shortCandidate: CandidateScore = {
        ...candidateFromSnapshot(shortSnapshot),
        lifecycleContext: shortLifecycleContext,
        directionDivergenceShadow: includeDirection
          ? buildDirectionDivergence('SHORT', { '1m': oneMinute, '5m': fiveMinute, '15m': fifteenMinute, '1h': oneHour }, directionContext)
          : undefined,
      };
      longCandidates.push(longCandidate);
      shortCandidates.push(shortCandidate);
      if (includeShadow) {
        snapshotRows.push({ snapshot: longSnapshot, direction: 'LONG' }, { snapshot: shortSnapshot, direction: 'SHORT' });
      }
    });

    const shadowLogs = includeShadow ? decisionSnapshotsToLogs(snapshotRows, cycleId) : [];
    if (shadowLogs.length) options?.onShadowLogs?.(shadowLogs);

    longCandidates.sort((a, b) => b.score - a.score);
    shortCandidates.sort((a, b) => b.score - a.score);
    opportunityCandidates.sort((a, b) => b.opportunityScore - a.opportunityScore || a.symbol.localeCompare(b.symbol));
    const opportunityShadow = buildOpportunityShortlistComparison({
      longCandidates,
      shortCandidates,
      opportunityShortlist: opportunityCandidates,
      timestamp: scanTimestamp,
      dataState: effectiveState,
      limit: 10,
    });
    const intelligenceParliamentShadow = buildParliamentScanShadow({
      timestamp: scanTimestamp,
      results: parliamentResults,
      failures: parliamentFailures,
    });
    const strategyCommanderShadow = buildStrategyCommanderScanShadow({
      timestamp: scanTimestamp,
      results: commanderResults,
      failures: commanderFailures,
      evidenceCompetence: evidenceCompetenceResults,
    });
    const responsePayload = {
      longCandidates: longCandidates.slice(0, 10),
      shortCandidates: shortCandidates.slice(0, 10),
      scanTimestamp,
      dataState: effectiveState,
      source,
      decisionAdapterVersion: DECISION_ADAPTER_VERSION,
      shadowMode: includeShadow,
      directionShadowMode: includeDirection,
      opportunityShadow,
      intelligenceParliamentShadow,
      strategyCommanderShadow,
      activeCandidateCount:
        longCandidates.filter((c) => c.guardPass).length +
        shortCandidates.filter((c) => c.guardPass).length,
      scannedCount: scanTickers.length,
      requestedScanLimit: scanLimit,
      shadowLogCount: shadowLogs.length,
    };
    setMarketCache(responseCacheKey, responsePayload, includeShadow || includeDirection ? 15_000 : 25_000);
    res.json(responsePayload);
  });

  app.get('/api/market/symbol/:symbol', async (req: Request, res: Response) => {
    const symbol = normalizeTickerSymbol(String(req.params.symbol));
    try {
    const { tickers, dataState, source } = await fetchKuCoinTickers();
    const ticker = tickers.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
    if (!ticker) {
      res.status(503).json({
        success: false,
        symbol,
        dataState: 'unavailable',
        source,
        error: 'verified_ticker_unavailable',
      });
      return;
    }

    const requestedInterval = String(req.query.interval || '1h');
    const supportedIntervals = new Set(['1m', '5m', '15m', '1h', '4h', '1d']);
    const intervalKey = (supportedIntervals.has(requestedInterval) ? requestedInterval : '1h') as '1m'|'5m'|'15m'|'1h'|'4h'|'1d';
    const requestedCandleLimit = Number(req.query.limit);
    const limit = Math.min(300, Math.max(30, Number.isFinite(requestedCandleLimit) ? Math.floor(requestedCandleLimit) : 90));
    const includeMicrostructure = String(req.query.includeMicrostructure || '0') === '1';
    const includeShadow = String(req.query.includeShadow ?? '1') !== '0';
    const includeDirection = String(req.query.includeDirection ?? '1') !== '0';
    const [candleResult, scoring1hResult, scoring15mResult, microstructure] = await Promise.all([
      fetchCandlesForSymbol(ticker.symbol, ticker.lastPrice, intervalKey, limit),
      intervalKey === '1h'
        ? fetchCandlesForSymbol(ticker.symbol, ticker.lastPrice, '1h', Math.max(90, limit))
        : fetchCandlesForSymbol(ticker.symbol, ticker.lastPrice, '1h', 90),
      intervalKey === '15m'
        ? fetchCandlesForSymbol(ticker.symbol, ticker.lastPrice, '15m', Math.max(60, limit))
        : fetchCandlesForSymbol(ticker.symbol, ticker.lastPrice, '15m', 60),
      includeMicrostructure || includeShadow || includeDirection
        ? fetchMicrostructure(ticker.symbol)
        : Promise.resolve({ orderBook: null, qStructDirectional: null, dataState: 'not_configured' as DataState, candles1m: undefined, candles5m: undefined, candles15m: undefined }),
    ]);
    const { candles } = candleResult;
    const effectiveState = includeMicrostructure || includeShadow || includeDirection
      ? combineDataStates(dataState, candleResult.dataState, scoring1hResult.dataState, scoring15mResult.dataState, microstructure.dataState)
      : combineDataStates(dataState, candleResult.dataState, scoring1hResult.dataState, scoring15mResult.dataState);
    const guardedTicker: SymbolTicker = { ...ticker, dataState: effectiveState };
    const orderBook = microstructure.orderBook?.summary ?? unavailableOrderBook(ticker.symbol);
    const levels = deriveSymbolLevels(guardedTicker, candles, 'ATR_BANDS');
    const canonicalLong = buildCanonicalDecision({
      ticker: guardedTicker,
      candles1h: scoring1hResult.candles,
      candles15m: scoring15mResult.candles,
      candles1m: microstructure.candles1m,
      candles5m: microstructure.candles5m,
      orderBook,
      orderBookDetail: microstructure.orderBook,
      qStructDirectional: microstructure.qStructDirectional,
      minLiquidityUsd: 10000000,
      scannerConfig: activeScannerConfig(),
    }, 'LONG', { includeShadow });
    const scoreLong = candidateFromSnapshot(canonicalLong);
    const canonicalShort = buildCanonicalDecision({
      ticker: guardedTicker,
      candles1h: scoring1hResult.candles,
      candles15m: scoring15mResult.candles,
      candles1m: microstructure.candles1m,
      candles5m: microstructure.candles5m,
      orderBook,
      orderBookDetail: microstructure.orderBook,
      qStructDirectional: microstructure.qStructDirectional,
      minLiquidityUsd: 10000000,
      scannerConfig: activeScannerConfig(),
    }, 'SHORT', { includeShadow });
    const scoreShort = candidateFromSnapshot(canonicalShort);

    const detailOneMinute = toDirectionCandles(microstructure.candles1m);
    const detailFiveMinute = toDirectionCandles(microstructure.candles5m);
    const detailFifteenMinute = toDirectionCandles(scoring15mResult.candles);
    const detailOneHour = toDirectionCandles(scoring1hResult.candles);
    const detailDirectionContext = {
      fundingRate: guardedTicker.fundingRate,
      marketDataSource: directionMarketSource(source, effectiveState),
    };
    const detailConfluenceAvailable = detailOneMinute.length >= 10;
    const detailLifecycleBase = {
      smoothedObi: marketStatistics.smoothOBI(guardedTicker.symbol, Math.max(-1, Math.min(1, orderBook.imbalancePct / 100))),
      confluence1M: detailConfluenceAvailable ? MathEngine.computeRealConfluence(detailOneMinute) : 0,
      confluenceAvailable: detailConfluenceAvailable,
      dataState: combineDataStates(effectiveState, orderBook.dataState),
      entryPrice: levels.entry,
    };
    scoreLong.lifecycleContext = { ...detailLifecycleBase, stopLoss: levels.supports[0], takeProfit: levels.resistances[0] };
    scoreShort.lifecycleContext = { ...detailLifecycleBase, stopLoss: levels.resistances[0], takeProfit: levels.supports[0] };
    if (includeDirection) {
      const detailTimeframes = { '1m': detailOneMinute, '5m': detailFiveMinute, '15m': detailFifteenMinute, '1h': detailOneHour };
      scoreLong.directionDivergenceShadow = buildDirectionDivergence('LONG', detailTimeframes, detailDirectionContext);
      scoreShort.directionDivergenceShadow = buildDirectionDivergence('SHORT', detailTimeframes, detailDirectionContext);
    }

    const accountBalance = Number(req.query.accountBalance || '10000');
    const riskPct = Number(req.query.riskPct || '1');
    const leverage = parseLeverageQuery(req.query.leverage, 5);
    const spread = microstructure.orderBook?.spread ?? null;
    const tradePlanLong = buildTradePlan({
      symbol: ticker.symbol,
      direction: 'LONG',
      levels,
      sizing: {
        accountBalanceUsd: accountBalance,
        riskMode: 'PCT',
        riskValue: riskPct,
        leverage,
        entryPrice: levels.entry,
        stopLossPrice: levels.supports[0],
        takeProfitPrice: levels.resistances[0],
        direction: 'LONG',
        successProbModel: scoreLong.score,
        successProbUserOverride: null,
      },
      decisionRef: {
        score: scoreLong.score,
        readinessTier: scoreLong.readinessTier,
        engineVersion: DECISION_ADAPTER_VERSION,
        createdAt: Date.now(),
      },
      spread,
      spreadState: spread == null ? 'MISSING' : microstructure.orderBook?.dataState === 'live' ? 'VALID' : 'ESTIMATED',
      fundingRate: Number.isFinite(guardedTicker.fundingRate) ? guardedTicker.fundingRate : null,
      fundingState: Number.isFinite(guardedTicker.fundingRate) && guardedTicker.dataState === 'live' ? 'VALID' : Number.isFinite(guardedTicker.fundingRate) ? 'ESTIMATED' : 'MISSING',
    });
    const tradePlanShort = buildTradePlan({
      symbol: ticker.symbol,
      direction: 'SHORT',
      levels,
      sizing: {
        accountBalanceUsd: accountBalance,
        riskMode: 'PCT',
        riskValue: riskPct,
        leverage,
        entryPrice: levels.entry,
        stopLossPrice: levels.resistances[0],
        takeProfitPrice: levels.supports[0],
        direction: 'SHORT',
        successProbModel: scoreShort.score,
        successProbUserOverride: null,
      },
      decisionRef: {
        score: scoreShort.score,
        readinessTier: scoreShort.readinessTier,
        engineVersion: DECISION_ADAPTER_VERSION,
        createdAt: Date.now(),
      },
      spread,
      spreadState: spread == null ? 'MISSING' : microstructure.orderBook?.dataState === 'live' ? 'VALID' : 'ESTIMATED',
      fundingRate: Number.isFinite(guardedTicker.fundingRate) ? guardedTicker.fundingRate : null,
      fundingState: Number.isFinite(guardedTicker.fundingRate) && guardedTicker.dataState === 'live' ? 'VALID' : Number.isFinite(guardedTicker.fundingRate) ? 'ESTIMATED' : 'MISSING',
    });

    let liquidityHunterAuthorization = null;
    const liquidityRuntime = getLiquidityHunterRuntime();
    const liquidityEvaluation = liquidityRuntime?.engine.latestEvaluation(ticker.symbol) ?? null;
    if (liquidityRuntime?.flags.liquidityHunterEnabled && liquidityEvaluation?.eligibleForManualConfirmation && liquidityEvaluation.trigger.direction) {
      const direction = liquidityEvaluation.trigger.direction;
      const canonical = direction === 'LONG' ? canonicalLong : canonicalShort;
      const stopLossPrice = direction === 'LONG' ? levels.supports[0] : levels.resistances[0];
      const takeProfitPrice = direction === 'LONG' ? levels.resistances[0] : levels.supports[0];
      liquidityHunterAuthorization = authorizeLiquidityHunterTradePlan({
        decision: canonical,
        evaluation: liquidityEvaluation,
        tradePlan: {
          levels,
          sizing: {
            accountBalanceUsd: accountBalance,
            riskMode: 'PCT', riskValue: riskPct, leverage,
            entryPrice: levels.entry, stopLossPrice, takeProfitPrice, direction,
            successProbModel: canonical.rankingScore, successProbUserOverride: null,
          },
          spread,
          spreadState: spread == null ? 'MISSING' : microstructure.orderBook?.dataState === 'live' ? 'VALID' : 'ESTIMATED',
          fundingRate: Number.isFinite(guardedTicker.fundingRate) ? guardedTicker.fundingRate : null,
          fundingState: Number.isFinite(guardedTicker.fundingRate) && guardedTicker.dataState === 'live' ? 'VALID' : Number.isFinite(guardedTicker.fundingRate) ? 'ESTIMATED' : 'MISSING',
        },
        risk: {
          account: { equityUsd: accountBalance, availableMarginUsd: Number(req.query.availableMargin || accountBalance), timestamp: Date.now() },
          portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
          market: { dataState: effectiveState, ageMs: candleResult.ageMs, exchangeDegraded: effectiveState === 'unavailable', reconciliationHealthy: true },
        },
      });
      liquidityHunterManualCanaryRegistry.put(liquidityHunterAuthorization);
    }

    res.json({
      ticker: guardedTicker,
      candles,
      candleFeed: {
        source: candleResult.source,
        dataState: candleResult.dataState,
        stale: candleResult.stale,
        ageMs: candleResult.ageMs,
        error: candleResult.error || null,
      },
      orderBook,
      // Preserve the full live price ladder for the analytical Trading depth chart.
      // This is additive and remains null when no trustworthy book is available.
      orderBookLevels: microstructure.orderBook?.book ?? null,
      microstructure: {
        source: microstructure.orderBook?.source ?? null,
        obi: microstructure.orderBook?.obi ?? null,
        microPrice: microstructure.orderBook?.microPrice ?? null,
        spread: microstructure.orderBook?.spread ?? null,
        qStructDirectional: microstructure.qStructDirectional,
        volumeUnit: microstructure.orderBook?.volumeUnit ?? null,
      },
      levels,
      scoreLong,
      scoreShort,
      tradePlanLong,
      tradePlanShort,
      liquidityHunterAuthorization,
      decisionAdapterVersion: DECISION_ADAPTER_VERSION,
      shadowMode: includeShadow,
      directionShadowMode: includeDirection,
      timeframeFeeds: {
        primary: { interval: intervalKey, dataState: candleResult.dataState, source: candleResult.source },
        tf1h: { interval: '1h', dataState: scoring1hResult.dataState, source: scoring1hResult.source, ageMs: scoring1hResult.ageMs },
        tf15m: { interval: '15m', dataState: scoring15mResult.dataState, source: scoring15mResult.source, ageMs: scoring15mResult.ageMs },
      },
      dataState: effectiveState,
      source,
      timestamp: Date.now(),
    });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[Market Symbol] ${symbol} unavailable: ${detail}`);
      res.status(503).json({
        success: false,
        symbol,
        dataState: 'unavailable',
        source: 'unavailable',
        error: 'market_symbol_unavailable',
        detail,
        timestamp: Date.now(),
      });
    }
  });

  app.get('/api/strategies', (_req: Request, res: Response) => {
    const strategies = listClientSafeStrategies().map((strategy) => {
      const validation = validationReports.get(strategy.strategyId);
      const rank = rankScores.get(strategy.strategyId);
      return {
        ...strategy,
        executionCapability: strategyExecutionCapability(strategy),
        status: validation?.fullStrategyValidated ? 'validated' as const : strategy.status,
        latestSnapshot: buildStrategyEvidenceSnapshot(strategy, validation, rank),
      };
    });
    res.json({ strategies, count: strategies.length, defaultStrategyId: DEFAULT_STRATEGY_ID, timestamp: Date.now() });
  });

  app.get('/api/strategies/autopilot/status', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      // The real controller phase: OFF | RESEARCHING | VALIDATING | WAITING | FAILED.
      controller: publicAutopilotControllerState(autopilotController),
      scheduler: publicSchedulerState(),
      latestCycle: latestSmartAutopilotCycle,
      safety: {
        researchOnly: true,
        paperOnly: true,
        executionAuthorized: false,
        automaticOrderSubmission: false,
        autonomousLiveExecutionEnabled: false,
      },
      note: autopilotController.enabled
        ? 'The Smart Autopilot research controller is armed. It runs the same research/paper-only cycle regardless of trigger and submits no exchange order; live promotion and execution remain manual.'
        : 'The Smart Autopilot research controller is stopped. Start it from the APEX client or set APEX_AUTOPILOT_SCHEDULER to arm it at boot. It never submits an exchange order.',
    });
  });

  /**
   * Bounded controls for one Smart Autopilot research cycle. Both the client
   * route and the optional server-side scheduler build this same shape, so
   * neither can reach the cycle body through a different code path.
   */
  type SmartAutopilotCycleControls = {
    cycleIndex: number;
    maxContexts: number;
    requestedBars: number;
    maxHoldBars: number;
    optimizerConcurrency: number;
    coarseCandidates: number;
    refinementCandidates: number;
    commissionPctPerSide: number;
    slippagePctPerSide: number;
    fundingPctEstimate: number;
    paperCapitalUsd: number;
    portfolioRiskPct: number;
    maxDirectionalWeight: number;
    symbol: string;
    symbols: string[];
    preferredInterval: string;
    trigger: 'CLIENT_REQUEST' | 'SERVER_SCHEDULER';
  };

  const boundedAutopilotControl = (
    name: string, raw: unknown, fallback: number, min: number, max: number, integer = false,
  ): number => {
    const value = raw === undefined || raw === null || raw === '' ? fallback : Number(raw);
    if (!Number.isFinite(value)) throw new Error(`non_finite_control:${name}`);
    if (value < min || value > max) throw new Error(`out_of_range_control:${name}`);
    return integer ? Math.floor(value) : value;
  };

  /**
   * Parse untrusted control input into bounded controls. Throws on any value
   * outside the accepted range; callers translate that into HTTP 422.
   */
  const parseSmartAutopilotControls = (
    body: Record<string, unknown> | null | undefined,
    trigger: SmartAutopilotCycleControls['trigger'],
  ): SmartAutopilotCycleControls => {
    const bounded = boundedAutopilotControl;
    const symbol = normalizeTickerSymbol(String(body?.symbol || 'BTC-USDT'));
    const requestedSymbols = Array.isArray(body?.symbols)
      ? (body.symbols as unknown[]).map((value) => normalizeTickerSymbol(String(value || ''))).filter(Boolean).slice(0, 6)
      : [];
    return {
      cycleIndex: bounded('cycleIndex', body?.cycleIndex, 0, 0, 1_000_000, true),
      maxContexts: bounded('maxContexts', body?.maxContexts, 6, 1, 8, true),
      requestedBars: bounded('bars', body?.bars, 3_000, 1_000, 5_000, true),
      maxHoldBars: bounded('maxHoldBars', body?.maxHoldBars, 72, 1, 240, true),
      optimizerConcurrency: bounded('optimizerConcurrency', body?.optimizerConcurrency, 2, 1, 3, true),
      coarseCandidates: bounded('coarseCandidates', body?.coarseCandidates, 20, 8, 48, true),
      refinementCandidates: bounded('refinementCandidates', body?.refinementCandidates, 8, 0, 24, true),
      commissionPctPerSide: bounded('commissionPct', body?.commissionPct, 0.04, 0, 5),
      slippagePctPerSide: bounded('slippagePct', body?.slippagePct, 0.05, 0, 5),
      fundingPctEstimate: bounded('fundingPct', body?.fundingPct, 0.01, 0, 5),
      paperCapitalUsd: bounded('paperCapitalUsd', body?.paperCapitalUsd, 100_000, 100, 1_000_000_000),
      portfolioRiskPct: bounded('portfolioRiskPct', body?.portfolioRiskPct, 1, 0.05, 5),
      maxDirectionalWeight: bounded('maxDirectionalWeight', body?.maxDirectionalWeight, 0.7, 0.1, 1),
      symbol,
      symbols: [...new Set([symbol, ...requestedSymbols])],
      preferredInterval: String(body?.preferredInterval || '1h'),
      trigger,
    };
  };

  /**
   * ---- Forward PAPER evaluation ------------------------------------------
   *
   * The replay half of the loop (researchOutcomeFeedback) compares the
   * optimizer's holdout against a replay of the same history. The forward half
   * below opens a SIMULATED position per approved paper slot and marks it on
   * later cycles against bars that did not exist when the slot was approved.
   *
   * Everything here is simulated: no exchange client, no order, no Risk
   * Governor interaction, no execution authorization. Rows are written only to
   * the research-scoped sink, never to the live decision memory.
   */
  const FORWARD_MARK_BARS = 300;

  const forwardBarsCacheKey = (symbol: string, interval: string): string =>
    `autopilot_forward_bars_${symbol}_${interval}`;

  const loadForwardBars = async (symbol: string, interval: string): Promise<ForwardBar[]> => {
    const cacheKey = forwardBarsCacheKey(symbol, interval);
    const cached = getMarketCache<ForwardBar[]>(cacheKey);
    if (cached) return cached;
    try {
      const result = await marketDataService.getCandles(
        symbol,
        interval as marketDataService.CandleInterval,
        FORWARD_MARK_BARS,
        'background',
      );
      const bars: ForwardBar[] = result.candles.map((row) => ({
        timestamp: row.timestamp,
        high: row.high,
        low: row.low,
        close: row.close,
      }));
      setMarketCache(cacheKey, bars, 30_000);
      return bars;
    } catch {
      return [];
    }
  };

  /**
   * Mark every still-open forward position against newly arrived bars.
   *
   * Bars are fetched once per symbol/interval, and `markForwardPosition` drops
   * anything at or before the entry bar, so no position can be settled on data
   * it already saw.
   */
  const markOpenForwardPositions = async (
    positions: readonly ForwardPosition[],
    now: number,
  ): Promise<{ marked: ForwardPosition[]; changed: ForwardPosition[] }> => {
    const open = positions.filter((position) => position.state === 'OPEN');
    if (!open.length) return { marked: [...positions], changed: [] };

    const groups = new Map<string, ForwardBar[]>();
    for (const position of open) {
      const key = `${position.symbol}|${position.interval}`;
      if (groups.has(key)) continue;
      groups.set(key, await loadForwardBars(position.symbol, position.interval));
    }

    const changed: ForwardPosition[] = [];
    const byId = new Map(positions.map((position) => [position.id, position]));
    for (const position of open) {
      const bars = groups.get(`${position.symbol}|${position.interval}`) ?? [];
      if (!bars.length) continue;
      const next = markForwardPosition(position, bars, now);
      if (next.state === position.state && next.barsHeld === position.barsHeld) continue;
      byId.set(position.id, next);
      changed.push(next);
    }
    return { marked: [...byId.values()], changed };
  };

  /**
   * Open one forward position per approved paper slot.
   *
   * A context that already has an open position is skipped, so a repeating
   * cycle accumulates independent samples over time instead of stacking
   * duplicates of the same trade.
   */
  const openForwardPositionsForPlan = async (args: {
    cycleIndex: number;
    plans: readonly PaperTradeBudgetPlan[];
    contextByJobId: Map<string, { context: SmartAutopilotContext; activeRevision: number | null }>;
    expectedPnlPctByJobId: Record<string, number | null>;
    existing: readonly ForwardPosition[];
    maxHoldBars: number;
    costModel: TransactionCostModel;
    now: number;
  }): Promise<ForwardPosition[]> => {
    const openKeys = new Set(
      args.existing.filter((position) => position.state === 'OPEN').map((position) => position.contextKey),
    );
    const opened: ForwardPosition[] = [];

    for (const plan of args.plans) {
      // Defence in depth: a plan that ever claimed order authority is not
      // eligible for anything here, simulated or not.
      if (plan.orderSubmissionAllowed !== false || plan.requiresManualConfirmation !== true) continue;
      const attribution = args.contextByJobId.get(plan.id);
      if (!attribution) continue;
      const { context } = attribution;
      const contextKey = forwardContextKey(context);
      if (openKeys.has(contextKey)) continue;

      const bars = await loadForwardBars(context.symbol, context.interval);
      if (bars.length < 2) continue;
      const last = bars[bars.length - 1];
      if (!Number.isFinite(last.close) || last.close <= 0) continue;
      const mark: ForwardMark = {
        symbol: context.symbol,
        interval: context.interval,
        close: last.close,
        atr: averageTrueRange(bars),
        timestamp: last.timestamp,
      };

      const position = openForwardPosition({
        cycleIndex: args.cycleIndex,
        jobId: plan.id,
        strategyId: context.strategyId,
        symbol: context.symbol,
        interval: context.interval,
        direction: context.direction,
        profileRevision: attribution.activeRevision,
        consensusScore: plan.consensusScore,
        notionalBudgetUsd: plan.notionalBudgetUsd,
        maxLossBudgetUsd: plan.maxLossBudgetUsd,
        expectedPnlPct: args.expectedPnlPctByJobId[plan.id] ?? null,
        mark,
        maxHoldBars: args.maxHoldBars,
        costModel: args.costModel,
        openedAt: args.now,
      });
      if (!position) continue;
      openKeys.add(contextKey);
      opened.push(position);
    }

    return opened;
  };

  /**
   * Run one Smart Autopilot research cycle.
   *
   * This is the ONLY implementation of the cycle. It is research/paper-only by
   * construction: it never sets execution authorization, never submits an
   * order, and its safety block below is hardcoded rather than derived from
   * caller input.
   */
  const runSmartAutopilotCycle = async (
    controls: SmartAutopilotCycleControls,
  ): Promise<{ status: 'no_contexts' } | { status: 'completed'; cycle: Record<string, unknown> }> => {
    const {
      cycleIndex, maxContexts, requestedBars, maxHoldBars, optimizerConcurrency,
      coarseCandidates, refinementCandidates, commissionPctPerSide, slippagePctPerSide,
      fundingPctEstimate, paperCapitalUsd, portfolioRiskPct, maxDirectionalWeight,
      symbol, symbols, preferredInterval, trigger,
    } = controls;

    const plan = buildSmartAutopilotPlan({
      strategies: listClientSafeStrategies().map((strategy) => ({
        strategyId: strategy.strategyId,
        status: strategy.status,
        supportedIntervals: strategy.supportedIntervals,
        longShort: strategy.longShort,
      })),
      symbol,
      symbols,
      preferredInterval,
      cycleIndex,
      maxContexts,
    });

    if (!plan.contexts.length) {
      dispatchAutopilotEvent({ type: 'CYCLE_FAILED', at: Date.now(), error: 'smart_autopilot_no_executable_contexts' });
      return { status: 'no_contexts' };
    }

    // ---- Consume prior forward evidence ------------------------------------
    // Read what earlier cycles' SIMULATED forward positions actually did, mark
    // the ones still open against bars that have since arrived, and drop the
    // contexts forward evidence has demoted. This is the "next cycle consumes
    // aggregated forward evidence" half of the loop; it reads the
    // research-scoped store only and can only NARROW the research rotation.
    let forwardEvidence: ForwardEvidenceReport | null = null;
    let priorForwardPositions: ForwardPosition[] = [];
    let forwardDemotions: ReturnType<typeof applyForwardEvidenceToContexts>['demoted'] = [];
    let researchContexts = plan.contexts;
    try {
      priorForwardPositions = readForwardPositions(options?.researchOutcomeLogProvider?.() ?? []);
      if (priorForwardPositions.length) {
        const marked = await markOpenForwardPositions(priorForwardPositions, Date.now());
        priorForwardPositions = marked.marked;
        if (marked.changed.length) {
          options?.onResearchOutcomeLogs?.(marked.changed.map(forwardPositionToLog));
        }
        forwardEvidence = aggregateForwardEvidence(priorForwardPositions);
        const filtered = applyForwardEvidenceToContexts(researchContexts, forwardEvidence, { minRetained: 1 });
        researchContexts = filtered.contexts;
        forwardDemotions = filtered.demoted;
      }
    } catch (error) {
      // Forward evidence is an improvement signal, not a precondition. A failure
      // here must not stop the research cycle from running.
      console.warn('[Smart Autopilot] forward evidence read failed:', error instanceof Error ? error.message : String(error));
    }

    // The controller phase now tracks real work, whether this cycle was
    // triggered by the operator's client or by the server scheduler.
    const cycleStartedAt = Date.now();
    const commanderRecordsForCycle = new Map(
      [...commanderShadowRecords.entries()]
        .filter(([, record]) => record.expiresAt >= cycleStartedAt)
        .map(([symbolKey, record]) => [symbolKey, {
          ...record,
          evidenceIds: [...record.evidenceIds],
          parameterProfileFingerprints: { ...record.parameterProfileFingerprints },
          evidence: record.evidence.map((row) => ({
            ...row,
            thesisTags: [...row.thesisTags], supportingReasons: [...row.supportingReasons], conflictingReasons: [...row.conflictingReasons], rawEvidenceIds: [...row.rawEvidenceIds],
          })),
        }]),
    );
    dispatchAutopilotEvent({ type: 'CYCLE_STARTED', at: cycleStartedAt, cycleIndex });

    const started = performance.now();
    const optimizationResults: Array<{
      context: (typeof plan.contexts)[number];
      status: 'COMPLETED' | 'FAILED';
      promoted: boolean;
      activeRevision: number | null;
      activeProfile: StrategyOptimizationProfile | null;
      report: StrategyOptimizationReport | null;
      council: SmartAutopilotOptimizationCouncil | null;
      promotionGate: AutomaticPromotionGateResult | null;
      error: string | null;
    }> = new Array(researchContexts.length);
    let nextContext = 0;
    const workers = Array.from({ length: Math.min(optimizerConcurrency, researchContexts.length) }, async () => {
      while (true) {
        const index = nextContext++;
        if (index >= researchContexts.length) return;
        const context = researchContexts[index];
        const definition = getStrategyDefinition(context.strategyId);
        if (!definition || definition.status === 'blocked' || definition.status === 'deprecated') {
          optimizationResults[index] = { context, status: 'FAILED', promoted: false, activeRevision: null, activeProfile: null, report: null, council: null, promotionGate: null, error: 'strategy_not_executable' };
          continue;
        }
        if (!definition.supportedIntervals.includes(context.interval as marketDataService.CandleInterval)) {
          optimizationResults[index] = { context, status: 'FAILED', promoted: false, activeRevision: null, activeProfile: null, report: null, council: null, promotionGate: null, error: 'unsupported_interval' };
          continue;
        }
        try {
          const optimized = await optimizeAutopilotContext({
            definition,
            symbol: context.symbol,
            interval: context.interval as marketDataService.CandleInterval,
            direction: context.direction,
            requestedBars,
            maxHoldBars,
            coarseCandidates,
            refinementCandidates,
            maxConcurrent: 2,
            commissionPctPerSide,
            slippagePctPerSide,
            fundingPctEstimate,
          });
          optimizationResults[index] = {
            context,
            status: 'COMPLETED',
            promoted: optimized.promoted,
            activeRevision: optimized.activeProfile?.revision ?? null,
            activeProfile: optimized.activeProfile,
            report: optimized.report,
            council: optimized.council,
            promotionGate: optimized.promotionGate,
            error: null,
          };
        } catch (error) {
          optimizationResults[index] = {
            context,
            status: 'FAILED',
            promoted: false,
            activeRevision: null,
            activeProfile: null,
            report: null,
            council: null,
            promotionGate: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    });
    await Promise.all(workers);

    const successful = optimizationResults.filter((row) => row?.status === 'COMPLETED');
    // One attribution key per optimized context, shared by the replay outcome
    // rows AND the forward paper positions, so every piece of evidence points at
    // the exact strategy / symbol / interval / direction / profile revision and
    // cycle that produced it.
    const jobIdFor = (contextId: string): string => `autopilot:${cycleIndex}:${contextId}`;
    const contextByJobId = new Map<string, { context: SmartAutopilotContext; activeRevision: number | null }>();
    const expectedPnlPctByJobId: Record<string, number | null> = {};
    const commanderAttributionByJobId: Record<string, CommanderOutcomeAttributionV1 | undefined> = {};
    const commanderResearchComparisonByJobId: Record<string, CommanderResearchComparisonV1 | undefined> = {};
    for (const row of successful) {
      if (!row) continue;
      const jobId = jobIdFor(row.context.id);
      contextByJobId.set(jobId, { context: row.context, activeRevision: row.activeRevision });
      expectedPnlPctByJobId[jobId] = row.report?.holdout.candidate.metrics.totalPnlPct ?? null;
      const commanderRecord = commanderRecordsForCycle.get(row.context.symbol.toUpperCase());
      const definition = getStrategyDefinition(row.context.strategyId);
      const actualProfileFingerprint = definition
        ? strategyParameterProfileFingerprint(definition, row.activeProfile?.parameters)
        : null;
      const expectedProfileFingerprint = commanderRecord?.parameterProfileFingerprints[row.context.strategyId] ?? null;
      if (commanderRecord && definition) {
        commanderResearchComparisonByJobId[jobId] = buildCommanderResearchComparison({
          decision: commanderRecord.decision,
          horizon: commanderRecord.horizon,
          expectedParameterProfileFingerprint: expectedProfileFingerprint,
          actualParameterProfileFingerprint: actualProfileFingerprint,
          strategyId: row.context.strategyId,
          strategyVersion: String(definition.version),
          symbol: row.context.symbol,
          interval: row.context.interval,
          direction: row.context.direction,
        }) ?? undefined;
        commanderAttributionByJobId[jobId] = buildCommanderOutcomeAttribution({
          decision: commanderRecord.decision,
          evidence: commanderRecord.evidence,
          horizon: commanderRecord.horizon,
          expectedParameterProfileFingerprint: expectedProfileFingerprint,
          actualParameterProfileFingerprint: actualProfileFingerprint,
          strategyId: row.context.strategyId,
          symbol: row.context.symbol,
          interval: row.context.interval,
          direction: row.context.direction,
        }) ?? undefined;
      }
    }
    let research: Awaited<ReturnType<typeof runMultiStrategyResearch>> | null = null;
    let multiAgent: ReturnType<typeof runMultiAgentResearchCouncil> | null = null;
    let paperPlanReceipt: ReturnType<MultiAgentCouncilStore['put']> | null = null;
    if (successful.length) {
      const roundTripCostPct = commissionPctPerSide * 2 + slippagePctPerSide * 2 + fundingPctEstimate;
      const researchJobs = successful.map((row) => ({
        id: jobIdFor(row.context.id),
        strategyId: row.context.strategyId,
        symbol: row.context.symbol,
        interval: row.context.interval as marketDataService.CandleInterval,
        direction: row.context.direction,
        requestedBars,
        maxHoldBars,
        transactionCostPct: roundTripCostPct,
      }));
      research = await runMultiStrategyResearch({
        jobs: researchJobs,
        concurrency: Math.min(3, optimizerConcurrency + 1),
        timeoutMs: 60_000,
        maxPortfolioSlots: 4,
        execute: async (job, signal) => {
          if (signal.aborted) throw new Error('smart_autopilot_research_cancelled');
          const definition = getStrategyDefinition(job.strategyId);
          if (!definition) throw new Error('strategy_not_found');
          const historical = await fetchHistoricalCandlesForBacktest(job.symbol, job.requestedBars, job.interval);
          // The history fetch is the long pole here (paginated provider requests
          // plus fallbacks) and does not accept this signal, so re-check the
          // deadline before entering the CPU-heavy replay — the same guard the
          // manual /multi-strategy route already applies between these steps.
          if (signal.aborted) throw new Error('smart_autopilot_research_cancelled');
          if (historical.candles.length !== job.requestedBars) throw new Error(`insufficient_requested_history:${historical.candles.length}/${job.requestedBars}`);
          const replay = await runStrategyDefinition({
            definition,
            candles: historical.candles,
            symbol: job.symbol,
            interval: job.interval,
            direction: job.direction,
            maxBars: job.maxHoldBars,
            transactionCostPct: job.transactionCostPct,
            includeUniverse: definition.runFn === 'adaptiveTrendPortfolio',
            applyActiveOptimization: true,
          });
          return {
            totalPnlPct: replay.summary.totalPnlPct,
            maxDrawdownPct: Math.abs(replay.summary.maxDrawdownPct),
            profitFactor: Number.isFinite(replay.summary.profitFactor) ? replay.summary.profitFactor : null,
            tradeCount: replay.trades.length,
            winRatePct: replay.summary.winRate * 100,
            requestedBars: job.requestedBars,
            candlesUsed: historical.candles.length,
            dataSource: historical.source,
            dataState: historical.dataState,
            historyComplete: historical.candles.length === job.requestedBars,
          };
        },
      });
      // Optimization and replay are done; the remaining work is consensus
      // review, ranking and paper-budget allocation.
      dispatchAutopilotEvent({ type: 'CYCLE_VALIDATING', at: Date.now() });
      multiAgent = runMultiAgentResearchCouncil(research, {
        capitalUsd: paperCapitalUsd,
        portfolioRiskPct,
        maxSlots: 4,
        maxSymbolWeight: 0.4,
        maxDirectionalWeight,
        maxDrawdownPct: 20,
        minProfitFactor: 1.05,
        minTrades: 6,
      });
      paperPlanReceipt = multiAgentCouncilStore.put(multiAgent);
    }

    // ---- Outcome feedback -------------------------------------------------
    // Record what the promoted profiles actually did on replay, against what the
    // optimizer's holdout predicted. These rows are SIMULATED and go to the
    // research-scoped sink only; they never enter the live decision memory that
    // backs adaptive threshold proposals for live scanning.
    let outcomeFeedback: ResearchOutcomeSummary | null = null;
    if (research) {
      try {
        const outcomeInput = {
          cycleIndex,
          generatedAt: Date.now(),
          jobs: research.jobs.map((job) => ({
            id: job.id,
            strategyId: job.strategyId,
            symbol: job.symbol,
            interval: job.interval,
            direction: job.direction,
            status: job.status,
            metrics: job.metrics,
            utility: job.utility,
            error: job.error,
          })),
          paperTradePlan: (multiAgent?.paperTradePlan ?? []).map((slot: PaperTradeBudgetPlan) => ({
            id: slot.id,
            strategyId: slot.strategyId,
            symbol: slot.symbol,
            direction: slot.direction,
            consensusScore: slot.consensusScore,
            notionalBudgetUsd: slot.notionalBudgetUsd,
          })),
          expectedPnlPctByJobId,
          commanderAttributionByJobId,
          commanderResearchComparisonByJobId,
        };
        const outcomeLogs = buildResearchOutcomeLogs(outcomeInput);
        outcomeFeedback = summarizeResearchOutcomes(outcomeInput, outcomeLogs);
        if (outcomeLogs.length) options?.onResearchOutcomeLogs?.(outcomeLogs);
      } catch (error) {
        console.warn('[Smart Autopilot] outcome feedback failed:', error instanceof Error ? error.message : String(error));
      }
    }

    // ---- Open forward paper positions --------------------------------------
    // Each slot the council approved becomes a SIMULATED position entered at the
    // last closed bar. It is settled on a LATER cycle against bars that do not
    // exist yet, which is what makes this forward evidence rather than another
    // replay. No order is submitted and no execution authority is granted.
    let forwardOpened: ForwardPosition[] = [];
    if (multiAgent?.paperTradePlan?.length) {
      try {
        forwardOpened = await openForwardPositionsForPlan({
          cycleIndex,
          plans: multiAgent.paperTradePlan,
          contextByJobId,
          expectedPnlPctByJobId,
          existing: priorForwardPositions,
          maxHoldBars,
          costModel: transactionCostModelFromPerSideAssumptions({
            commissionPctPerSide,
            slippagePctPerSide,
            fundingPctEstimate,
          }),
          now: Date.now(),
        });
        if (forwardOpened.length) {
          options?.onResearchOutcomeLogs?.(forwardOpened.map(forwardPositionToLog));
        }
      } catch (error) {
        console.warn('[Smart Autopilot] forward paper open failed:', error instanceof Error ? error.message : String(error));
      }
    }

    const forwardEvaluation = {
      version: PAPER_FORWARD_VERSION,
      // Evidence read at the start of this cycle, from positions opened earlier.
      evidence: forwardEvidence,
      // Contexts this cycle skipped because forward evidence demoted them.
      demotedContexts: forwardDemotions,
      contextsResearched: researchContexts.length,
      contextsPlanned: plan.contexts.length,
      openedThisCycle: forwardOpened.map((position) => ({
        id: position.id,
        contextKey: position.contextKey,
        jobId: position.jobId,
        strategyId: position.strategyId,
        symbol: position.symbol,
        interval: position.interval,
        direction: position.direction,
        profileRevision: position.profileRevision,
        entryPrice: position.entryPrice,
        stopPrice: position.stopPrice,
        targetPrice: position.targetPrice,
        quantity: position.quantity,
        notionalUsd: position.notionalUsd,
        maxHoldBars: position.maxHoldBars,
        expectedPnlPct: position.expectedPnlPct,
      })),
      openPositions: priorForwardPositions.filter((position) => position.state === 'OPEN').length + forwardOpened.length,
      safety: {
        simulated: true,
        researchOnly: true,
        paperOnly: true,
        executionAuthorized: false,
        orderSubmissionAllowed: false,
        writesLiveDecisionMemory: false,
      },
    };

    const publicOptimizationResults = optimizationResults.map((row) => ({
      context: row.context,
      status: row.status,
      promoted: row.promoted,
      activeRevision: row.activeRevision,
      error: row.error,
      evidence: row.report ? {
        holdoutPnlPct: row.report.holdout.candidate.metrics.totalPnlPct,
        holdoutImprovement: row.report.promotion.holdoutImprovement,
        neighborPassRate: row.report.promotion.neighborPassRate,
        overfitGap: row.report.promotion.overfitGap,
      } : null,
      council: row.council ? {
        supports: row.council.supports,
        cautions: row.council.cautions,
        vetoes: row.council.vetoes,
        consensusScore: row.council.consensusScore,
        approvedForPromotion: row.council.approvedForPromotion,
        blockers: row.council.blockers,
      } : null,
      promotionGate: row.promotionGate ? {
        version: row.promotionGate.version,
        authorized: row.promotionGate.authorized,
        blockers: row.promotionGate.blockers,
        validationPassed: row.promotionGate.validationPassed,
        failedGates: row.promotionGate.failedGates,
        rankScore: row.promotionGate.rankScore,
        minRankScore: row.promotionGate.minRankScore,
        validatedAt: row.promotionGate.validatedAt,
      } : null,
    }));
    const elapsedMs = Number((performance.now() - started).toFixed(3));
    const cycle = {
      version: 'smart_autopilot_cycle_v1',
      cycleIndex,
      trigger,
      generatedAt: Date.now(),
      plan,
      optimization: {
        completed: successful.length,
        failed: optimizationResults.filter((row) => row?.status === 'FAILED').length,
        promoted: optimizationResults.filter((row) => row?.promoted).length,
        results: publicOptimizationResults,
      },
      research,
      multiAgent,
      paperPlanReceipt,
      outcomeFeedback,
      forwardEvaluation,
      runtime: { elapsedMs, optimizerConcurrency },
      safety: {
        researchOnly: true,
        paperOnly: true,
        executionAuthorized: false,
        automaticOrderSubmission: false,
        autonomousLiveExecutionEnabled: false,
        riskGovernorBypassAllowed: false,
        manualConfirmationRequired: true,
      },
      note: 'Smart Autopilot rotates strategy/timeframe/direction contexts, auto-promotes only multi-agent-approved robust candidates, then replays the active profiles through the existing multi-strategy + paper council pipeline. No exchange order is submitted.',
    };
    latestSmartAutopilotCycle = cycle;
    dispatchAutopilotEvent({ type: 'CYCLE_COMPLETED', at: Date.now() });
    return { status: 'completed', cycle };
  };

  app.post('/api/strategies/autopilot/cycle', async (req: Request, res: Response) => {
    let controls: SmartAutopilotCycleControls;
    try {
      controls = parseSmartAutopilotControls(req.body, 'CLIENT_REQUEST');
    } catch (error) {
      res.status(422).json({ error: 'smart_autopilot_controls_invalid', message: error instanceof Error ? error.message : String(error) });
      return;
    }

    try {
      const outcome = await runSmartAutopilotCycle(controls);
      if (outcome.status === 'no_contexts') {
        res.status(409).json({ error: 'smart_autopilot_no_executable_contexts', message: 'No executable strategy/timeframe/direction context is available.' });
        return;
      }
      res.json({ ok: true, cycle: outcome.cycle });
    } catch (error) {
      // A thrown cycle must land the controller in FAILED, not leave it
      // reporting RESEARCHING forever.
      const message = error instanceof Error ? error.message : String(error);
      dispatchAutopilotEvent({ type: 'CYCLE_FAILED', at: Date.now(), error: message });
      res.status(500).json({ error: 'smart_autopilot_cycle_failed', message });
    }
  });

  /**
   * Real start/stop for the one controller above. This is the endpoint the
   * Autopilot button in the client calls, which is what makes the button a
   * control rather than a label.
   *
   * Arming only permits RESEARCH cycles. It grants no execution authority, does
   * not touch the Risk Governor or DecisionBridge, and cannot promote anything
   * to live.
   */
  app.post('/api/strategies/autopilot/control', (req: Request, res: Response) => {
    const action = String(req.body?.action || '').trim().toUpperCase();
    if (action !== 'START' && action !== 'STOP') {
      res.status(422).json({
        error: 'autopilot_control_action_invalid',
        message: 'Provide action "START" or "STOP".',
      });
      return;
    }

    if (action === 'START') {
      dispatchAutopilotEvent({ type: 'START', at: Date.now(), by: 'OPERATOR' });
      armSmartAutopilotScheduler('OPERATOR');
    } else {
      dispatchAutopilotEvent({ type: 'STOP', at: Date.now() });
      stopSmartAutopilotScheduler();
    }

    res.json({
      ok: true,
      action,
      controller: publicAutopilotControllerState(autopilotController),
      scheduler: publicSchedulerState(),
      safety: {
        researchOnly: true,
        paperOnly: true,
        executionAuthorized: false,
        automaticOrderSubmission: false,
        autonomousLiveExecutionEnabled: false,
        riskGovernorBypassAllowed: false,
        manualConfirmationRequired: true,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Optional server-side scheduler (default OFF).
  //
  // It drives `runSmartAutopilotCycle` — the exact same research/paper-only path
  // the client route uses — so it cannot reach execution authorization, the Risk
  // Governor, or DecisionBridge. Its only job is supplying the missing trigger.
  // ---------------------------------------------------------------------------
  const schedulerConfig: AutopilotSchedulerConfig = resolveAutopilotSchedulerConfig(process.env);
  const schedulerState = {
    nextCycleIndex: 0,
    /** Wall-clock time the armed loop is expected to fire again. */
    nextRunAt: null as number | null,
  };
  let schedulerTimer: ReturnType<typeof setInterval> | null = null;

  const publicSchedulerState = () => ({
    mode: schedulerConfig.enabled ? 'SERVER_SCHEDULED' : 'CLIENT_OPT_IN',
    /** True only while a real interval is armed on this process. */
    serverBackgroundLoop: schedulerTimer !== null,
    version: schedulerConfig.version,
    envEnabled: schedulerConfig.enabled,
    disabledReason: schedulerConfig.disabledReason,
    intervalMs: schedulerConfig.intervalMs,
    maxContexts: schedulerConfig.maxContexts,
    symbols: schedulerConfig.symbols,
    preferredInterval: schedulerConfig.preferredInterval,
    nextCycleIndex: schedulerState.nextCycleIndex,
    nextRunAt: schedulerTimer === null ? null : schedulerState.nextRunAt,
  });

  const runScheduledAutopilotCycle = async (): Promise<void> => {
    // Single-flight: a slow cycle must never stack up behind the timer. The
    // controller is the one source of truth for whether a cycle is in flight.
    if (isCycleInFlight(autopilotController)) {
      dispatchAutopilotEvent({ type: 'CYCLE_SKIPPED', at: Date.now() });
      return;
    }
    schedulerState.nextRunAt = Date.now() + schedulerConfig.intervalMs;
    try {
      const controls = parseSmartAutopilotControls(
        {
          cycleIndex: schedulerState.nextCycleIndex,
          maxContexts: schedulerConfig.maxContexts,
          symbol: schedulerConfig.symbols[0],
          symbols: schedulerConfig.symbols,
          preferredInterval: schedulerConfig.preferredInterval,
        },
        'SERVER_SCHEDULER',
      );
      schedulerState.nextCycleIndex = (schedulerState.nextCycleIndex + 1) % 1_000_001;
      // runSmartAutopilotCycle dispatches STARTED / VALIDATING / COMPLETED and
      // reports no_contexts as a FAILED phase, so nothing is double-counted.
      await runSmartAutopilotCycle(controls);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatchAutopilotEvent({ type: 'CYCLE_FAILED', at: Date.now(), error: message });
      console.warn('[Smart Autopilot] scheduled cycle failed:', message);
    }
  };

  const stopSmartAutopilotScheduler = (): void => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    schedulerState.nextRunAt = null;
  };

  /**
   * Arm the one background loop. Idempotent, so a repeated START from the UI
   * cannot create a second timer (which would be a parallel controller).
   */
  const armSmartAutopilotScheduler = (armedBy: 'ENV' | 'OPERATOR'): void => {
    if (schedulerTimer) return;
    schedulerTimer = setInterval(() => { void runScheduledAutopilotCycle(); }, schedulerConfig.intervalMs);
    // Never hold the process open; graceful shutdown also clears it explicitly.
    schedulerTimer.unref?.();
    schedulerState.nextRunAt = Date.now() + schedulerConfig.intervalMs;
    console.log(JSON.stringify({
      level: 'info',
      event: 'smart_autopilot_scheduler_started',
      armedBy,
      intervalMs: schedulerConfig.intervalMs,
      maxContexts: schedulerConfig.maxContexts,
      symbols: schedulerConfig.symbols,
      researchOnly: true,
      executionAuthorized: false,
    }));
  };

  if (schedulerConfig.enabled) {
    dispatchAutopilotEvent({ type: 'START', at: Date.now(), by: 'ENV' });
    armSmartAutopilotScheduler('ENV');
  }

  app.post('/api/strategies/multi-backtest', async (req: Request, res: Response) => {
    const rawJobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [];
    if (!rawJobs.length || rawJobs.length > 16) {
      res.status(422).json({ error: 'multi_strategy_jobs_invalid', message: 'Provide between 1 and 16 research jobs.' });
      return;
    }

    const bounded = (name: string, value: unknown, fallback: number, min: number, max: number, integer = false) => {
      const candidate = value === undefined || value === null || value === '' ? fallback : Number(value);
      if (!Number.isFinite(candidate)) throw new Error(`non_finite_control:${name}`);
      if (candidate < min || candidate > max) throw new Error(`out_of_range_control:${name}`);
      return integer ? Math.floor(candidate) : candidate;
    };

    let jobs: Array<{
      id: string;
      strategyId: string;
      symbol: string;
      interval: marketDataService.CandleInterval;
      direction: 'LONG' | 'SHORT';
      requestedBars: number;
      maxHoldBars: number;
      transactionCostPct: number;
      parameters: Record<string, number | string>;
      definition: NonNullable<ReturnType<typeof getStrategyDefinition>>;
    }>;

    try {
      jobs = rawJobs.map((raw: any, index: number) => {
        const strategyId = String(raw?.strategyId || '').trim();
        const definition = getStrategyDefinition(strategyId);
        if (!definition) throw new Error(`strategy_not_found:${strategyId || index}`);
        if (definition.status === 'blocked' || definition.status === 'deprecated') throw new Error(`strategy_not_executable:${strategyId}`);
        const symbol = normalizeTickerSymbol(String(raw?.symbol || 'BTC-USDT'));
        const interval = String(raw?.interval || definition.supportedIntervals[0] || '1h') as marketDataService.CandleInterval;
        if (!definition.supportedIntervals.includes(interval)) throw new Error(`unsupported_interval:${strategyId}:${interval}`);
        const rawDirection = String(raw?.direction ?? (definition.longShort === 'SHORT' ? 'SHORT' : 'LONG')).trim().toUpperCase();
        if (rawDirection !== 'LONG' && rawDirection !== 'SHORT') throw new Error(`invalid_direction:${strategyId}:${rawDirection || 'empty'}`);
        const direction = rawDirection as 'LONG' | 'SHORT';
        if (definition.longShort !== 'BOTH' && definition.longShort !== direction) throw new Error(`unsupported_direction:${strategyId}:${direction}`);

        const rawParameters = raw?.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters)
          ? raw.parameters as Record<string, unknown>
          : {};
        const validatedParameters = validateStrategyParameterValues(definition, rawParameters);
        if (!validatedParameters.ok) throw new Error(`invalid_strategy_parameter:${validatedParameters.parameter}:${validatedParameters.error}`);

        return {
          id: String(raw?.id || `${strategyId}:${symbol}:${interval}:${direction}:${index}`).slice(0, 160),
          strategyId,
          symbol,
          interval,
          direction,
          // Current verified history service has an explicit 5,000 closed-candle ceiling.
          // Do not accept a larger public research horizon and silently truncate it.
          requestedBars: bounded(`jobs[${index}].requestedBars`, raw?.requestedBars, 3_000, 400, 5_000, true),
          maxHoldBars: bounded(`jobs[${index}].maxHoldBars`, raw?.maxHoldBars, 72, 1, 500, true),
          transactionCostPct: bounded(`jobs[${index}].transactionCostPct`, raw?.transactionCostPct, 0.12, 0, 5),
          parameters: validatedParameters.values,
          definition,
        };
      });
    } catch (error) {
      res.status(422).json({ error: 'multi_strategy_jobs_invalid', message: error instanceof Error ? error.message : String(error) });
      return;
    }

    let concurrency: number;
    let timeoutMs: number;
    let maxPortfolioSlots: number;
    let paperCapitalUsd: number;
    let portfolioRiskPct: number;
    let maxSymbolWeight: number;
    let maxDirectionalWeight: number;
    let agentMaxDrawdownPct: number;
    let agentMinProfitFactor: number;
    let agentMinTrades: number;
    try {
      concurrency = bounded('concurrency', req.body?.concurrency, 3, 1, 4, true);
      timeoutMs = bounded('timeoutMs', req.body?.timeoutMs, 45_000, 5_000, 120_000, true);
      maxPortfolioSlots = bounded('maxPortfolioSlots', req.body?.maxPortfolioSlots, 4, 1, 8, true);
      paperCapitalUsd = bounded('paperCapitalUsd', req.body?.paperCapitalUsd, 100_000, 100, 1_000_000_000);
      portfolioRiskPct = bounded('portfolioRiskPct', req.body?.portfolioRiskPct, 1, 0.05, 10);
      maxSymbolWeight = bounded('maxSymbolWeight', req.body?.maxSymbolWeight, 0.4, 0.05, 1);
      maxDirectionalWeight = bounded('maxDirectionalWeight', req.body?.maxDirectionalWeight, 0.7, 0.1, 1);
      agentMaxDrawdownPct = bounded('agentMaxDrawdownPct', req.body?.agentMaxDrawdownPct, 20, 1, 80);
      agentMinProfitFactor = bounded('agentMinProfitFactor', req.body?.agentMinProfitFactor, 1, 0, 5);
      agentMinTrades = bounded('agentMinTrades', req.body?.agentMinTrades, 8, 1, 1_000, true);
    } catch (error) {
      res.status(422).json({ error: 'multi_strategy_controls_invalid', message: error instanceof Error ? error.message : String(error) });
      return;
    }

    try {
      const report = await runMultiStrategyResearch<(typeof jobs)[number]>({
        jobs,
        concurrency,
        timeoutMs,
        maxPortfolioSlots,
        execute: async (job, signal) => {
          if (signal.aborted) throw new Error('multi_strategy_cancelled');
          const historical = await fetchHistoricalCandlesForBacktest(job.symbol, job.requestedBars, job.interval);
          const candlesUsed = historical.candles.length;
          // Research horizon truth is fail-closed: a shorter provider history is
          // surfaced as a failed job, never as a successful run for another horizon.
          if (candlesUsed !== job.requestedBars) throw new Error(`insufficient_requested_history:${candlesUsed}/${job.requestedBars}`);
          if (signal.aborted) throw new Error('multi_strategy_cancelled');
          const replay = await runStrategyDefinition({
            definition: job.definition,
            candles: historical.candles,
            symbol: job.symbol,
            interval: job.interval,
            direction: job.direction,
            maxBars: job.maxHoldBars,
            transactionCostPct: job.transactionCostPct,
            parameters: job.parameters,
            includeUniverse: job.definition.runFn === 'adaptiveTrendPortfolio',
          });
          return {
            totalPnlPct: replay.summary.totalPnlPct,
            maxDrawdownPct: Math.abs(replay.summary.maxDrawdownPct),
            profitFactor: Number.isFinite(replay.summary.profitFactor) ? replay.summary.profitFactor : null,
            tradeCount: replay.trades.length,
            winRatePct: replay.summary.winRate * 100,
            requestedBars: job.requestedBars,
            candlesUsed,
            dataSource: historical.source,
            dataState: historical.dataState,
            historyComplete: candlesUsed === job.requestedBars,
          };
        },
      });

      const multiAgent = runMultiAgentResearchCouncil(report, {
        capitalUsd: paperCapitalUsd,
        portfolioRiskPct,
        maxSlots: maxPortfolioSlots,
        maxSymbolWeight,
        maxDirectionalWeight,
        maxDrawdownPct: agentMaxDrawdownPct,
        minProfitFactor: agentMinProfitFactor,
        minTrades: agentMinTrades,
      });
      const paperPlanReceipt = multiAgentCouncilStore.put(multiAgent);
      res.json({
        ok: true,
        report,
        multiAgent,
        paperPlanReceipt,
        safety: {
          researchOnly: true,
          paperOnly: true,
          executionAuthorized: false,
          automaticOrderSubmission: false,
          autonomousLiveExecutionEnabled: false,
          riskGovernorBypassAllowed: false,
          manualConfirmationRequired: true,
        },
        note: 'Multi-strategy and council outputs are research/paper evidence only. Exact paper plans are server-bound to a short-lived council receipt before sizing.',
      });
    } catch (error) {
      res.status(422).json({ error: 'multi_strategy_backtest_failed', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/strategies/paper-multi-trade/size', (req: Request, res: Response) => {
    const plans = Array.isArray(req.body?.plans) ? req.body.plans as PaperTradeBudgetPlan[] : [];
    const entries = Array.isArray(req.body?.entries) ? req.body.entries as PaperTradeEntryStopInput[] : [];
    const sourceCouncilFingerprint = String(req.body?.sourceCouncilFingerprint || '').trim();
    if (!plans.length || plans.length > 10 || entries.length > 10) {
      res.status(422).json({ error: 'paper_multi_trade_plans_invalid', message: 'Provide 1–10 paper plans and at most 10 entry/stop rows.' });
      return;
    }
    try {
      const receipt = multiAgentCouncilStore.verify(sourceCouncilFingerprint, plans);
      const report = sizePaperMultiTradePositions({
        sourceCouncilFingerprint,
        sourcePlanFingerprint: receipt.planFingerprint,
        plans,
        entries,
      });
      res.json({
        ok: true,
        report,
        receipt: { councilFingerprint: receipt.councilFingerprint, planFingerprint: receipt.planFingerprint, expiresAt: receipt.expiresAt },
        safety: {
          paperOnly: true,
          executionAuthorized: false,
          automaticOrderSubmission: false,
          exchangeClientDependency: false,
          requiresRiskGovernorApproval: true,
          manualConfirmationRequired: true,
        },
        note: 'Sizing is paper-only and bound to the exact server-generated council plan set. It creates no exchange order or leverage request.',
      });
    } catch (error) {
      res.status(422).json({ error: 'paper_multi_trade_sizing_failed', message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/strategies/:strategyId', (req: Request, res: Response) => {
    const definition = getStrategyDefinition(String(req.params.strategyId || ''));
    if (!definition) {
      res.status(404).json({ error: 'strategy_not_found', message: 'The requested strategy is not registered.' });
      return;
    }
    const validation = validationReports.get(definition.strategyId);
    const rank = rankScores.get(definition.strategyId);
    const status = validation?.fullStrategyValidated ? 'validated' : definition.status;
    const strategy = {
      ...clientSafeStrategy(definition),
      executionCapability: strategyExecutionCapability(definition),
      status,
      latestSnapshot: buildStrategyEvidenceSnapshot(definition, validation, rank),
    };
    res.json({ strategy, validation: validation ?? null, rank: rank ?? null });
  });

  app.post('/api/strategies/:strategyId/fusion-preview', async (req: Request, res: Response) => {
    const definition = getStrategyDefinition(String(req.params.strategyId || ''));
    if (!definition) {
      res.status(404).json({ error: 'strategy_not_found', message: 'The requested strategy is not registered.' });
      return;
    }
    if (!definition.fusion) {
      res.status(409).json({ error: 'strategy_fusion_unavailable', message: 'This strategy has no dynamic-fusion blueprint.' });
      return;
    }

    const symbol = normalizeTickerSymbol(String(req.body?.symbol || 'BTC-USDT'));
    const interval = String(req.body?.interval || definition.supportedIntervals[0] || '1h') as marketDataService.CandleInterval;
    if (!definition.supportedIntervals.includes(interval)) {
      res.status(422).json({ error: 'unsupported_interval', message: `${definition.name} does not support ${interval}.` });
      return;
    }
    const requestedDirection = String(req.body?.direction || (definition.longShort === 'SHORT' ? 'SHORT' : 'LONG')).toUpperCase();
    const direction = requestedDirection === 'SHORT' ? 'SHORT' as const : 'LONG' as const;
    if (definition.longShort !== 'BOTH' && definition.longShort !== direction) {
      res.status(422).json({ error: 'unsupported_direction', message: `${definition.name} does not support ${direction}.` });
      return;
    }

    const rawParameters = req.body?.parameters && typeof req.body.parameters === 'object' ? req.body.parameters as Record<string, unknown> : {};
    const parameters: Record<string, number | string> = {};
    for (const parameter of definition.parameters) {
      const supplied = readStrategyParameterValue(parameter, rawParameters);
      if (typeof parameter.default === 'number') {
        const numeric = Number(supplied ?? parameter.default);
        if (!Number.isFinite(numeric)) {
          res.status(422).json({ error: 'invalid_strategy_parameter', parameter: parameter.key });
          return;
        }
        parameters[parameter.key] = Math.max(parameter.min ?? Number.NEGATIVE_INFINITY, Math.min(parameter.max ?? Number.POSITIVE_INFINITY, numeric));
      } else {
        parameters[parameter.key] = typeof supplied === 'string' ? supplied.slice(0, 160) : String(parameter.default);
      }
    }

    try {
      const [historical, supplemental, tickerResult] = await Promise.all([
        fetchHistoricalCandlesForBacktest(symbol, 320, interval),
        getSupplementalOrchestrator().fetchAll(symbol).catch(() => null),
        marketDataService.getTickers(120).catch(() => null),
      ]);
      const ticker = tickerResult?.tickers.find((row) => normalizeTickerSymbol(row.symbol) === symbol);
      const fundingDirectional = ticker?.dataState === 'live' && Number.isFinite(ticker.fundingRate)
        ? Math.max(-1, Math.min(1, -Number(ticker.fundingRate) / 0.0005))
        : null;
      const snapshot = evaluateStrategyFusion({
        definition,
        symbol,
        interval,
        direction,
        candles: historical.candles,
        fundingDirectional,
        // A current OI level has no direction by itself. Keep it unavailable
        // until a timestamped delta or historical OI series is bound.
        openInterestDirectional: null,
        news: supplemental?.news ?? null,
        sentiment: supplemental?.sentiment ?? null,
        onchain: supplemental?.onchain ?? null,
        parameters,
      });
      res.json({
        ok: true,
        snapshot,
        provenance: {
          candleSource: historical.source,
          candleState: historical.dataState,
          candleCount: historical.candles.length,
          newsSource: supplemental?.news.source ?? 'unavailable',
          sentimentSource: supplemental?.sentiment.source ?? 'unavailable',
          onchainSource: supplemental?.onchain.source ?? 'unavailable',
          fundingSource: fundingDirectional === null ? 'unavailable_or_degraded' : `live:${tickerResult?.source || 'market'}`,
          openInterestSource: 'not_bound_to_fusion_preview',
        },
        note: 'This preview is current-context evidence. Live-only layers are not used by historical optimization until timestamp-aligned snapshots exist.',
      });
    } catch (error) {
      res.status(503).json({ error: 'strategy_fusion_preview_failed', message: error instanceof Error ? error.message : 'Fusion preview failed.' });
    }
  });

  app.get('/api/strategies/:strategyId/optimization', (req: Request, res: Response) => {
    const definition = getStrategyDefinition(String(req.params.strategyId || ''));
    if (!definition) {
      res.status(404).json({ error: 'strategy_not_found', message: 'The requested strategy is not registered.' });
      return;
    }
    const symbol = normalizeTickerSymbol(String(req.query.symbol || 'BTC-USDT'));
    const interval = String(req.query.interval || definition.supportedIntervals[0] || '1h');
    const direction = String(req.query.direction || (definition.longShort === 'LONG' ? 'LONG' : 'SHORT')).toUpperCase() === 'LONG' ? 'LONG' as const : 'SHORT' as const;
    const context: StrategyOptimizationContext = { strategyId: definition.strategyId, symbol, interval, direction };
    res.json({
      ok: true,
      activeProfile: strategyOptimizationStore.getActive(context),
      latestReport: strategyOptimizationStore.latestReport(context),
      // Without this, an unreadable store looks exactly like "nothing promoted
      // yet" to the Strategy Studio, which is the misleading state this endpoint
      // must not present. Null in the normal case.
      storeCorruption: strategyOptimizationStore.corruptionState(),
    });
  });

  app.post('/api/strategies/:strategyId/optimize', async (req: Request, res: Response) => {
    const definition = getStrategyDefinition(String(req.params.strategyId || ''));
    if (!definition) {
      res.status(404).json({ error: 'strategy_not_found', message: 'The requested strategy is not registered.' });
      return;
    }
    if (definition.status === 'blocked' || definition.status === 'deprecated') {
      res.status(409).json({ error: 'strategy_not_executable', message: definition.blockedReason || 'Strategy prerequisites are not available.' });
      return;
    }

    const validated = validateStrategyOptimizationInput({
      ...(req.query as Record<string, unknown>),
      ...(req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}),
    });
    if (!validated.ok) {
      res.status(422).json(apiValidationError(res.locals.requestId as string | undefined, validated.issues));
      return;
    }
    const value = validated.value;
    const symbol = normalizeTickerSymbol(value.symbol);
    const interval = value.interval as marketDataService.CandleInterval;
    if (!definition.supportedIntervals.includes(interval)) {
      res.status(422).json({ error: 'unsupported_interval', message: `${definition.name} does not support ${interval}.` });
      return;
    }
    const direction = value.direction;
    if (definition.longShort !== 'BOTH' && definition.longShort !== direction) {
      res.status(422).json({ error: 'unsupported_direction', message: `${definition.name} does not support ${direction}.` });
      return;
    }

    const context: StrategyOptimizationContext = { strategyId: definition.strategyId, symbol, interval, direction };
    const activeProfile = strategyOptimizationStore.getActive(context);
    const jobKey = [
      context.strategyId, context.symbol, context.interval, context.direction, value.requestedBars, value.maxHoldBars,
      value.coarseCandidates, value.refinementCandidates, value.maxConcurrent, value.autoPromote,
      value.commissionPctPerSide, value.slippagePctPerSide, value.fundingPctEstimate,
      `base-r${activeProfile?.revision ?? 0}`,
    ].join('|');
    const existingJob = strategyOptimizationJobs.get(jobKey);
    if (existingJob) {
      try {
        const report = await existingJob;
        res.json({ ok: true, coalesced: true, report, activeProfile: strategyOptimizationStore.getActive(context) });
      } catch (error) {
        res.status(500).json({ error: 'strategy_optimization_failed', message: error instanceof Error ? error.message : 'Optimization failed.' });
      }
      return;
    }

    const job = (async () => {
      const historical = await fetchHistoricalCandlesForBacktest(symbol, value.requestedBars, interval);
      if (historical.candles.length < 1_000) throw new Error(`insufficient_optimization_history:${historical.candles.length}`);
      const defaultParameters = Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.default]));
      const baseParameters = normalizeStrategyParameterAliases(definition, { ...defaultParameters, ...(activeProfile?.parameters || {}) });
      const globalScannerConfig = activeScannerConfig();
      const baseScannerConfig = activeProfile?.scannerConfig ?? {
        ...globalScannerConfig,
        ...(definition.scannerConfigOverrides || {}),
        scoreWeights: {
          ...globalScannerConfig.scoreWeights,
          ...(definition.scoreWeights || {}),
          ...(definition.scannerConfigOverrides?.scoreWeights || {}),
        },
      };
      const roundTripCostPct = value.commissionPctPerSide * 2 + value.slippagePctPerSide * 2 + value.fundingPctEstimate;
      const report = await optimizeStrategy({
        definition,
        candles: historical.candles,
        baseScannerConfig,
        baseParameters,
        symbol,
        interval,
        direction,
        transactionCostPct: roundTripCostPct,
        autoPromote: value.autoPromote,
        budget: {
          coarseCandidates: value.coarseCandidates,
          refinementCandidates: value.refinementCandidates,
          maxConcurrent: value.maxConcurrent,
          purgeBars: value.maxHoldBars,
          embargoBars: value.maxHoldBars,
        },
        evaluator: async ({ candles, parameters, scannerConfig, transactionCostPct }) => {
          const replay = await runStrategyDefinition({
            definition,
            candles,
            symbol,
            interval,
            direction,
            maxBars: value.maxHoldBars,
            parameters,
            scannerConfig,
            transactionCostPct,
            includeUniverse: false,
            applyActiveOptimization: false,
            scannerConfigAuthoritative: true,
          });
          return strategyOptimizationMetricsFromSummary(replay.summary);
        },
      });

      if (definition.runFn === 'adaptiveTrendPortfolio') {
        report.promotion.eligible = false;
        report.promotion.blockers = [...new Set([...report.promotion.blockers, 'multi_symbol_universe_identity_required'])];
        report.warnings.push('The portfolio strategy was optimized as a single-symbol diagnostic only; automatic promotion is blocked until synchronized universe identities are persisted.');
      }
      if (value.autoPromote) {
        report.warnings.push('legacy_auto_promote_ignored_use_smart_autopilot_cycle');
      }
      strategyOptimizationStore.saveReport(report);
      return report;
    })();

    strategyOptimizationJobs.set(jobKey, job);
    try {
      const report = await job;
      res.json({
        ok: true,
        coalesced: false,
        report,
        activeProfile: strategyOptimizationStore.getActive(context),
        note: report.promotion.eligible
          ? 'The optimizer produced an eligible candidate. Active thresholds did not change; use explicit manual promotion or the five-agent Smart Autopilot cycle.'
          : 'The optimizer completed without changing active thresholds; one or more holdout, cost, drawdown, sample, stability, or isolation gates blocked promotion.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Strategy optimization failed.';
      const status = message.includes('insufficient') ? 503 : message.includes('timeout') ? 504 : 500;
      res.status(status).json({ error: 'strategy_optimization_failed', message });
    } finally {
      strategyOptimizationJobs.delete(jobKey);
    }
  });

  app.post('/api/strategies/:strategyId/optimization/promote', (req: Request, res: Response) => {
    const definition = getStrategyDefinition(String(req.params.strategyId || ''));
    if (!definition) {
      res.status(404).json({ error: 'strategy_not_found', message: 'The requested strategy is not registered.' });
      return;
    }
    const symbol = normalizeTickerSymbol(String(req.body?.symbol || 'BTC-USDT'));
    const interval = String(req.body?.interval || definition.supportedIntervals[0] || '1h');
    const direction = String(req.body?.direction || (definition.longShort === 'LONG' ? 'LONG' : 'SHORT')).toUpperCase() === 'LONG' ? 'LONG' as const : 'SHORT' as const;
    const context: StrategyOptimizationContext = { strategyId: definition.strategyId, symbol, interval, direction };
    const report = strategyOptimizationStore.latestReport(context);
    if (!report) {
      res.status(404).json({ error: 'strategy_optimization_report_not_found', message: 'Run optimization for this exact context before promotion.' });
      return;
    }
    const reviewedGeneratedAt = Number(req.body?.reportGeneratedAt);
    if (!Number.isFinite(reviewedGeneratedAt) || reviewedGeneratedAt !== report.generatedAt) {
      res.status(409).json({
        error: 'strategy_optimization_review_stale',
        message: 'The candidate being promoted is not the exact report that was reviewed. Refresh Strategy Studio and review the latest optimization report.',
        latestGeneratedAt: report.generatedAt,
      });
      return;
    }
    if (!report.promotion.eligible) {
      res.status(409).json({ error: 'strategy_optimization_not_eligible', blockers: report.promotion.blockers });
      return;
    }
    try {
      const profile = strategyOptimizationStore.promote(report);
      res.json({
        ok: true,
        activeProfile: profile,
        note: 'The reviewed optimizer candidate was promoted manually for this exact strategy/symbol/interval/direction context.',
      });
    } catch (error) {
      res.status(409).json({ error: 'strategy_optimization_promotion_failed', message: error instanceof Error ? error.message : 'Promotion failed.' });
    }
  });

  app.post('/api/strategies/:strategyId/optimization/rollback', (req: Request, res: Response) => {
    const definition = getStrategyDefinition(String(req.params.strategyId || ''));
    if (!definition) {
      res.status(404).json({ error: 'strategy_not_found', message: 'The requested strategy is not registered.' });
      return;
    }
    const symbol = normalizeTickerSymbol(String(req.body?.symbol || 'BTC-USDT'));
    const interval = String(req.body?.interval || definition.supportedIntervals[0] || '1h');
    const direction = String(req.body?.direction || (definition.longShort === 'LONG' ? 'LONG' : 'SHORT')).toUpperCase() === 'LONG' ? 'LONG' as const : 'SHORT' as const;
    const targetRevision = Number(req.body?.targetRevision);
    const context: StrategyOptimizationContext = { strategyId: definition.strategyId, symbol, interval, direction };
    const profile = strategyOptimizationStore.rollback(context, Number.isFinite(targetRevision) ? Math.floor(targetRevision) : undefined);
    if (!profile) {
      res.status(404).json({ error: 'optimization_rollback_target_not_found' });
      return;
    }
    res.json({ ok: true, activeProfile: profile });
  });

  app.post('/api/strategies/:strategyId/validate', async (req: Request, res: Response) => {
    const definition = getStrategyDefinition(String(req.params.strategyId || ''));
    if (!definition) {
      res.status(404).json({ error: 'strategy_not_found', message: 'The requested strategy is not registered.' });
      return;
    }
    if (definition.status === 'blocked') {
      res.status(409).json({ error: 'strategy_blocked', message: definition.blockedReason || 'Strategy prerequisites are not available.' });
      return;
    }

    const validationInput = validateStrategyValidationInput({
      ...(req.query as Record<string, unknown>),
      ...(req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}),
    });
    if (!validationInput.ok) {
      res.status(422).json(apiValidationError(res.locals.requestId as string | undefined, validationInput.issues));
      return;
    }
    const symbol = normalizeTickerSymbol(validationInput.value.symbol);
    const interval = validationInput.value.interval as marketDataService.CandleInterval;
    const direction = validationInput.value.direction;
    const maxHoldBars = validationInput.value.maxHoldBars;
    const costAssumptions = {
      commissionPctPerSide: validationInput.value.commissionPctPerSide,
      slippagePctPerSide: validationInput.value.slippagePctPerSide,
      fundingPctEstimate: validationInput.value.fundingPctEstimate,
    };
    // Manual validation names its subject as explicitly as the automatic path
    // does. Historically this route passed no flag at all, so the replay fell
    // through to `strategyOptimizationStore.getActive` and measured whichever
    // profile happened to be promoted — while the response looked like a
    // statement about the strategy itself. The behaviour is preserved (an active
    // profile is still what gets measured when one exists) but it is now stated
    // rather than inherited, snapshotted once so a concurrent promotion cannot
    // change the identity mid-suite, and stamped onto the report.
    //
    // The subject kind is ACTIVE_PROFILE or DEFINITION_DEFAULTS, never
    // OPTIMIZATION_CANDIDATE, so a report produced here can never satisfy the
    // automatic-promotion gate: promoting candidate A always requires a run that
    // named A as its subject.
    const activeProfile = strategyOptimizationStore.getActive({
      strategyId: definition.strategyId, symbol, interval, direction,
    });
    const subject = activeProfile
      ? activeProfileSubject({ definition, profile: activeProfile })
      : definitionDefaultsSubject(definition);
    try {
      const suite = await runStrategyValidationSuite({
        definition, symbol, interval, direction, maxHoldBars, costAssumptions, subject,
      });
      if (suite.status === 'insufficient_history') {
        res.status(503).json({ error: 'insufficient_validation_history', candles: suite.candles, message: 'At least 1,200 verified candles are required for walk-forward validation.' });
        return;
      }
      const { report, rank } = suite;
      validationReports.set(definition.strategyId, report);
      rankScores.set(definition.strategyId, rank);
      res.json({ validation: report, rank, regime: report.regimeStatus });
    } catch (error) {
      res.status(500).json({ error: 'validation_failed', message: error instanceof Error ? error.message : 'Strategy validation failed.' });
    }
  });

  app.get('/api/market/backtest', async (req: Request, res: Response) => {
    const routeStartedAt = performance.now();
    const validatedQuery = validateBacktestQuery(req.query as Record<string, unknown>);
    if (!validatedQuery.ok) {
      res.status(422).json(apiValidationError(res.locals.requestId as string | undefined, validatedQuery.issues));
      return;
    }
    const {
      symbol,
      direction,
      strategyId,
      interval,
      requestedBars,
      maxHoldBars,
      commissionPctPerSide,
      slippagePctPerSide,
      fundingPctEstimate,
      parameters,
    } = validatedQuery.value;
    const definition = getStrategyDefinition(strategyId || DEFAULT_STRATEGY_ID);
    if (!definition) {
      res.status(404).json({ error: 'strategy_not_found', message: `Strategy ${strategyId} is not registered.` });
      return;
    }
    if (definition.status === 'blocked') {
      res.status(409).json({ error: 'strategy_blocked', strategy: strategyId, message: definition.blockedReason || 'Strategy prerequisites are not available.' });
      return;
    }

    const validatedParameters = validateStrategyParameterValues(definition, parameters ?? {}, { materializeDefaults: false });
    if (!validatedParameters.ok) {
      res.status(422).json({
        error: 'invalid_strategy_parameter',
        strategy: definition.strategyId,
        parameter: validatedParameters.parameter,
        reason: validatedParameters.error,
        message: `Invalid parameter ${validatedParameters.parameter}: ${validatedParameters.error}.`,
      });
      return;
    }
    const effectiveRouteParameters = validatedParameters.values;

    const routeTransactionCostModel = transactionCostModelFromPerSideAssumptions({ commissionPctPerSide, slippagePctPerSide, fundingPctEstimate });
    const roundTripCostPct = computeTransactionCostPct(transactionCostInputsFromModel(routeTransactionCostModel, 1, 1));
    const costModel: NonNullable<BacktestResult['costModel']> = {
      commissionPctPerSide, slippagePctPerSide, fundingPctEstimate, roundTripCostPct, appliedByEngine: true,
    };
    // The replay route only needs a canonical symbol. Avoid blocking the run on the
    // bulk ticker universe because that endpoint can time out independently of
    // historical candle providers. Symbol validation still happens in the candle
    // provider/router and no synthetic history is introduced.
    const tickerLookupStartedAt = performance.now();
    const tickerSymbol = normalizeTickerSymbol(symbol);
    const tickerLookupMs = performance.now() - tickerLookupStartedAt;
    const historyStartedAt = performance.now();
    const historical = await fetchHistoricalCandlesForBacktest(tickerSymbol, requestedBars, interval);
    const historyFetchMs = performance.now() - historyStartedAt;
    const historicalCandles = historical.candles;

    if (historicalCandles.length < 80) {
      const totalMs = performance.now() - routeStartedAt;
      res.status(503).json({
        symbol: tickerSymbol, direction, interval, source: historical.source, candlesUsed: historicalCandles.length,
        requestedBars, lookbackCandles: requestedBars, maxHoldBars, simulatedScans: 0, flaggedSignals: 0,
        acceptedCandidates: 0, rejectedCandidates: 0, rejectionCounts: {}, historicalWinRatePct: 0,
        avgRMultipleRealized: 0, avgPnlPct: 0, totalPnlPct: 0, maxDrawdownPct: 0, profitFactor: 0,
        wins: 0, losses: 0, timed: 0, equityCurve: [], timeline: [], dataState: historical.dataState,
        strategy: definition.strategyId, strategyVersion: definition.version,
        runtime: { totalMs, tickerLookupMs, historyFetchMs, replayMs: 0, tickerLookupState: 'skipped' },
        error: 'insufficient_history', message: `Not enough verified closed ${interval} candle history was returned to run this backtest. Received ${historicalCandles.length} of ${requestedBars} requested candles in ${historyFetchMs.toFixed(0)} ms.`,
      });
      return;
    }

    try {
      const replayStartedAt = performance.now();
      const scannerConfig = definition.engine === 'scanner-preset' ? activeScannerConfig() : undefined;
      const routeOptimizationProfile = strategyOptimizationStore.getActive({
        strategyId: definition.strategyId,
        symbol: tickerSymbol,
        interval,
        direction,
      });
      const cacheParameters = buildStrategyParameterValues(definition, { ...(routeOptimizationProfile?.parameters || {}), ...effectiveRouteParameters });
      const cacheScannerConfig = definition.engine === 'scanner-preset'
        ? resolveStrategyScannerConfig({
            definition,
            parameters: cacheParameters,
            scannerConfig,
            optimizationProfile: routeOptimizationProfile,
          })
        : undefined;
      const replayArgs = {
        definition,
        candles: historicalCandles,
        symbol: tickerSymbol,
        interval,
        direction,
        maxBars: maxHoldBars,
        parameters: effectiveRouteParameters,
        transactionCostPct: roundTripCostPct,
        transactionCostModel: routeTransactionCostModel,
        scannerConfig,
      };
      let replay: StrategyReplayResult;
      let replayCacheState: BacktestCacheState | 'BYPASS';
      if (definition.runFn === 'adaptiveTrendPortfolio') {
        // This engine also consumes a live multi-symbol universe. Until those
        // secondary datasets have their own content identities, caching it
        // would risk returning a replay produced from an older universe.
        replay = await runStrategyDefinition(replayArgs);
        replayCacheState = 'BYPASS';
      } else {
        const replayCacheKey = buildBacktestReplayCacheKey({
          strategyId: definition.strategyId,
          strategyVersion: definition.version,
          symbol: tickerSymbol,
          interval,
          direction,
          requestedBars,
          maxHoldBars,
          roundTripCostPct,
          parameters: cacheParameters,
          scannerConfig: cacheScannerConfig,
          source: historical.source,
          candles: historicalCandles,
        });
        const cachedReplay = await backtestReplayCache.execute(replayCacheKey, () => runStrategyDefinition(replayArgs));
        replay = cachedReplay.value;
        replayCacheState = cachedReplay.state;
      }
      const replayMs = performance.now() - replayStartedAt;
      const payload = buildBacktestPayload({
        replay,
        candles: historicalCandles,
        definition,
        symbol: tickerSymbol,
        direction,
        interval,
        source: historical.source,
        dataState: historical.dataState,
        requestedBars,
        maxHoldBars,
        costModel,
        runId: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        configFingerprint: `${definition.strategyId}:${tickerSymbol}:${interval}:${direction}:${requestedBars}:${maxHoldBars}:${roundTripCostPct.toFixed(4)}:optimizer-r${routeOptimizationProfile?.revision ?? 0}`,
      });
      const totalMs = performance.now() - routeStartedAt;
      res.json({
        ...payload,
        runtime: { totalMs, tickerLookupMs, historyFetchMs, replayMs, tickerLookupState: 'skipped' as const, replayCache: replayCacheState },
      });
    } catch (error) {
      const totalMs = performance.now() - routeStartedAt;
      res.status(422).json({
        error: 'strategy_run_failed',
        strategy: strategyId,
        runtime: { totalMs, tickerLookupMs, historyFetchMs, replayMs: Math.max(0, totalMs - tickerLookupMs - historyFetchMs), tickerLookupState: 'skipped' },
        message: error instanceof Error ? error.message : 'Strategy backtest failed.',
      });
    }
  });

  app.get('/api/market/majors', async (_req: Request, res: Response) => {
    const { tickers, dataState } = await fetchKuCoinTickers();
    const majors = [...tickers]
      .sort((a, b) => b.turnover24h - a.turnover24h)
      .filter((ticker) => ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT', 'DOGE-USDT'].includes(ticker.symbol))
      .slice(0, 6);
    res.json({ symbols: majors, dataState, timestamp: Date.now() });
  });

  app.get('/api/system/health', async (_req: Request, res: Response) => {
    const market = await fetchKuCoinTickers();
    const fallbackState = market.dataState === 'unavailable' ? 'unavailable' : 'degraded';
    res.json({
      kucoinStatus: market.source === 'kucoin' ? 'live' : fallbackState,
      binanceStatus: market.source === 'binance' ? 'live' : 'not_configured',
      sentimentStatus: 'not_configured',
      cacheHitRatePct: 0,
      cacheTotalQueries: 0,
      cacheHits: 0,
      uptimeSeconds: Math.round(process.uptime()),
      lastErrorLog: [],
      activeCandidateCount: 0,
      lastScanTimestamp: 0,
    });
  });

  app.post('/api/market/backtest/production-input', (req: Request, res: Response) => {
    const validated = validateProductionReplayRequest(req.body);
    if (!validated.ok) {
      const tooLarge = validated.issues.some((issue) => issue.code === 'too_large');
      if (tooLarge) {
        return res.status(413).json({
          ok: false,
          error: 'production_replay_dataset_too_large',
          maxRows: 5_000,
          issues: validated.issues,
        });
      }
      return res.status(422).json(apiValidationError(res.locals.requestId as string | undefined, validated.issues));
    }

    const { candles, inputs, direction, interval, maxHoldBars, symbol } = validated.value;
    const result = runApexProductionInputReplay({
      candles: candles as unknown as ProductionReplayDataset['candles'],
      inputs: inputs as unknown as ProductionReplayDataset['inputs'],
    }, {
      symbol: normalizeTickerSymbol(symbol),
      interval,
      scannerConfig: activeScannerConfig(),
      direction,
      maxBars: maxHoldBars,
    });
    return res.json({
      ok: true,
      ...result,
      dataState: result.summary.downgradedBars === 0 ? 'live' : 'degraded',
      productionAligned: (result.summary.productionAlignedBars ?? 0) > 0 && (result.summary.downgradedBars ?? 0) === 0,
    });
  });

  return { stopSmartAutopilotScheduler };
}
