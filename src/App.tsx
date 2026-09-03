import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AlertRule,
  Candle,
  CandidateScore,
  ChartFeedStatus,
  DataState,
  DerivedLevels,
  OrderBook,
  OrderBookSummary,
  SentimentComposite,
  SymbolTicker,
  TerminalSettings,
} from './types';
import { getAlertRules, getSettings, saveAlertRules, saveSettings } from './lib/storage';
import { useAutopilotController } from './lib/useAutopilotController';
import {
  accountIsAvailable,
  getConnection,
  getWorkspaceData,
  type AccountSnapshot,
  type ConnectionState,
  type LiveReconciliationSummary,
} from './services/accountClient';
import { fetchJsonWithTimeout } from './services/apiQuery';
import { persistCandidateShadowLogs } from './services/shadowComparisonPersistence';
import { updateSignalLifecycles } from './services/signalLifecycleTracker';
import { linkLifecycleClosureToDecisionMemory } from './services/decisionOutcome';
import { dispatchCandidateTelegramRecords, dispatchDataDegradedTelegramAlert, dispatchLifecycleTelegramTransitions } from './services/telegram';
import { WorkspaceShell, type WorkspacePage } from './components/workspace/WorkspaceShell';
import { PortfolioPage } from './pages/portfolio/PortfolioPage';
import { OverviewView } from './components/workspace/GeneralViews';
import { MarketsPage as MarketsView } from './components/workspace/MarketsPage';
import { WatchlistPage } from './pages/watchlist/WatchlistPage';
import { ScreenerPage } from './pages/screener/ScreenerPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { PositionsPage } from './pages/positions/PositionsPage';
import { AlertsPage } from './pages/alerts/AlertsPage';
import { HistoryPage } from './pages/history/HistoryPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsCommandPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { HelpPage } from './pages/help/HelpPage';
import type { ScanMeta } from './components/overview/overviewModel';
import { buildWorkspaceInsights, type WorkspaceInsights } from './services/workspaceInsights';
import type { TradePlan } from './services/tradePlan';
import { playAlertTone, showBrowserNotification } from './lib/notifications';
import { RouteErrorBoundary } from './components/ui/RouteErrorBoundary';
import { ServiceWorkerUpdateBanner } from './components/ui/ServiceWorkerUpdateBanner';
import { RouteSkeleton } from './components/ui/RouteSkeleton';
import { sanitizeTickerUniverse } from './lib/tickerUniverse';
import type { OpportunityShortlistComparisonV1 } from './services/strategyCommander/opportunity/opportunityTypes';
import type { ParliamentScanShadowV1 } from './services/strategyCommander/parliamentShadow';
const TradingView = lazy(() => import('./components/workspace/AccountViews').then((module) => ({ default: module.TradingView })));
const BacktestingPage = lazy(() => import('./pages/backtesting/BacktestingPage').then((module) => ({ default: module.BacktestingPage })));
const StrategyPage = lazy(() => import('./pages/strategies/StrategyPage').then((module) => ({ default: module.StrategyPage })));
const AcademyPage = lazy(() => import('./pages/academy/AcademyPage').then((module) => ({ default: module.AcademyPage })));
const ProvidersPage = lazy(() => import('./pages/providers/ProvidersPage').then((module) => ({ default: module.ProvidersPage })));

const INITIAL_CONNECTION: ConnectionState = {
  status: 'not_connected',
  mode: 'live',
  exchange: 'kucoin',
  portfolioState: 'locked',
  executionState: 'locked',
  liveAvailable: false,
};

const INITIAL_CHART_FEED: ChartFeedStatus = {
  loading: true,
  dataState: 'not_configured',
  source: null,
  stale: false,
  ageMs: 0,
  error: null,
};

const WORKSPACE_PAGES = new Set<WorkspacePage>([
  'overview', 'markets', 'watchlist', 'screener', 'portfolio', 'trading', 'orders', 'positions',
  'providers', 'alerts', 'history', 'analytics', 'backtesting', 'academy', 'strategies', 'settings', 'help',
]);

interface TopVolumePayload {
  symbols?: SymbolTicker[];
  dataState?: DataState;
  source?: string;
  timestamp?: number;
}

interface CandidatesPayload {
  longCandidates?: CandidateScore[];
  shortCandidates?: CandidateScore[];
  scanTimestamp?: number;
  scannedCount?: number;
  activeCandidateCount?: number;
  qualifiedSetupCount?: number;
  watchCandidateCount?: number;
  abstainedCandidateCount?: number;
  universeCount?: number;
  eligibleUniverseCount?: number;
  shadowMode?: boolean;
  directionShadowMode?: boolean;
  dataState?: DataState;
  source?: string;
  opportunityShadow?: OpportunityShortlistComparisonV1;
  intelligenceParliamentShadow?: ParliamentScanShadowV1;
}

interface SymbolDetailPayload {
  candles?: Candle[];
  orderBook?: OrderBookSummary | null;
  orderBookLevels?: OrderBook | null;
  levels?: DerivedLevels | null;
  scoreLong?: CandidateScore | null;
  scoreShort?: CandidateScore | null;
  tradePlanLong?: TradePlan | null;
  tradePlanShort?: TradePlan | null;
  dataState?: DataState;
  source?: string;
  candleFeed?: {
    source?: string | null;
    dataState?: DataState;
    stale?: boolean;
    ageMs?: number;
    error?: string | null;
  };
}

function initialPage(): WorkspacePage {
  if (typeof window === 'undefined') return 'overview';
  const hash = window.location.hash.replace(/^#\/?/, '') as WorkspacePage;
  return WORKSPACE_PAGES.has(hash) ? hash : 'overview';
}

export default function App() {
  const [page, setPage] = useState<WorkspacePage>(initialPage);
  const [settings, setSettings] = useState<TerminalSettings>(getSettings());
  // One binding to the single server-side controller. All Autopilot surfaces
  // read the same real phase from here, so no page can invent a second
  // controller or a cosmetic state. Persisted preference is only a boot opt-in;
  // the server remains authoritative after status is known.
  const autopilotController = useAutopilotController(settings.autopilotEnabled);
  const setAutopilotEnabled = useCallback((enabled: boolean) => {
    setSettings((current) => {
      const next = { ...current, autopilotEnabled: enabled };
      saveSettings(next);
      return next;
    });
    void (enabled ? autopilotController.start() : autopilotController.stop());
  }, [autopilotController.start, autopilotController.stop]);
  const applySettings = useCallback((next: TerminalSettings) => {
    const changed = next.autopilotEnabled !== settings.autopilotEnabled;
    setSettings(next);
    if (changed) void (next.autopilotEnabled ? autopilotController.start() : autopilotController.stop());
  }, [autopilotController.start, autopilotController.stop, settings.autopilotEnabled]);
  const effectiveAutopilotEnabled = autopilotController.phase === null
    ? settings.autopilotEnabled
    : autopilotController.enabled;
  const [alertRules, setAlertRules] = useState<AlertRule[]>(getAlertRules());
  const [activeAlerts, setActiveAlerts] = useState<Array<{ rule: AlertRule; symbol: string; tier: string }>>([]);

  const [dataState, setDataState] = useState<DataState>('not_configured');
  const [tickers, setTickers] = useState<SymbolTicker[]>([]);
  const [sentiment, setSentiment] = useState<SentimentComposite | null>(null);
  const [longCandidates, setLongCandidates] = useState<CandidateScore[]>([]);
  const [shortCandidates, setShortCandidates] = useState<CandidateScore[]>([]);
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketProvider, setMarketProvider] = useState<string | null>(null);
  const [marketObservedAt, setMarketObservedAt] = useState<number | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USDT');
  const [detailLevels, setDetailLevels] = useState<DerivedLevels | null>(null);
  const [detailLongScore, setDetailLongScore] = useState<CandidateScore | null>(null);
  const [detailShortScore, setDetailShortScore] = useState<CandidateScore | null>(null);
  const [detailTradePlanLong, setDetailTradePlanLong] = useState<TradePlan | null>(null);
  const [detailTradePlanShort, setDetailTradePlanShort] = useState<TradePlan | null>(null);
  const [chartCandles, setChartCandles] = useState<Candle[]>([]);
  const [chartOrderBook, setChartOrderBook] = useState<OrderBookSummary | null>(null);
  const [chartOrderBookLevels, setChartOrderBookLevels] = useState<OrderBook | null>(null);
  const [chartInterval, setChartInterval] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');
  const [chartFeed, setChartFeed] = useState<ChartFeedStatus>(INITIAL_CHART_FEED);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const lastGoodSymbolDetailRef = useRef(new Map<string, { payload: SymbolDetailPayload; observedAt: number }>());

  const [connection, setConnection] = useState<ConnectionState>(INITIAL_CONNECTION);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [insights, setInsights] = useState<WorkspaceInsights | null>(null);
  const [reconciliation, setReconciliation] = useState<LiveReconciliationSummary | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);

  const tickerRequestInFlight = useRef(false);
  const intelligenceRequestInFlight = useRef(false);
  const accountRequestInFlight = useRef(false);
  const connectionRef = useRef(connection);

  useEffect(() => { connectionRef.current = connection; }, [connection]);

  const evaluateAlertTriggers = useCallback((nextLong: CandidateScore[], nextShort: CandidateScore[], nextTickers: SymbolTicker[] = tickers) => {
    const allCandidates = [...nextLong, ...nextShort];
    const triggered: Array<{ rule: AlertRule; symbol: string; tier: string }> = [];
    const triggeredRuleIds = new Set<string>();
    const now = Date.now();
    const readinessRank: Record<CandidateScore['readinessTier'], number> = { BLOCKED: 0, CAUTION: 1, WATCHLIST: 2, CONFIRMED: 3 };

    for (const rule of alertRules) {
      if (!rule.enabled || (rule.triggerOnce && rule.triggeredCount > 0)) continue;
      // Avoid firing the same continuously-true condition on every polling cycle.
      if (rule.lastTriggeredAt && now - rule.lastTriggeredAt < 60_000) continue;

      if (rule.alertType === 'PORTFOLIO') {
        const value = rule.portfolioMetric === 'RISK_SCORE'
          ? insights?.account.riskScore
          : insights?.account.marginRatioPct;
        if (!Number.isFinite(value) || !Number.isFinite(rule.targetValue)) continue;
        const matches = rule.condition === 'BELOW'
          ? Number(value) <= Number(rule.targetValue)
          : Number(value) >= Number(rule.targetValue);
        if (matches) {
          triggered.push({ rule, symbol: 'PORTFOLIO', tier: rule.portfolioMetric || 'MARGIN_RATIO_PCT' });
          triggeredRuleIds.add(rule.id);
        }
        continue;
      }

      if (rule.alertType === 'PRICE' && rule.symbolFilter && Number.isFinite(rule.targetValue)) {
        const ticker = nextTickers.find((item) => item.symbol === rule.symbolFilter);
        if (!ticker) continue;
        const matches = rule.condition === 'BELOW'
          ? ticker.lastPrice <= Number(rule.targetValue)
          : rule.condition === 'CHANGE_ABOVE'
            ? Math.abs(ticker.priceChange24hPct) >= Number(rule.targetValue)
            : ticker.lastPrice >= Number(rule.targetValue);
        if (matches) {
          triggered.push({ rule, symbol: ticker.symbol, tier: rule.condition === 'CHANGE_ABOVE' ? '24H_MOVE' : 'PRICE' });
          triggeredRuleIds.add(rule.id);
        }
        continue;
      }

      const matchingCandidates = allCandidates
        .filter((candidate) => !rule.symbolFilter || rule.symbolFilter === candidate.symbol)
        .filter((candidate) => rule.direction === 'BOTH' || rule.direction === candidate.direction)
        .filter((candidate) => candidate.guardPass)
        .filter((candidate) => !candidate.decisionState || candidate.decisionState === 'SIGNAL' || candidate.decisionState === 'QUALIFIED_SETUP')
        .filter((candidate) => candidate.score >= rule.minScore)
        .filter((candidate) => readinessRank[candidate.readinessTier] >= readinessRank[rule.minReadiness])
        .sort((left, right) => right.score - left.score);
      const candidate = matchingCandidates[0];
      if (candidate) {
        triggered.push({ rule, symbol: candidate.symbol, tier: candidate.readinessTier });
        triggeredRuleIds.add(rule.id);
      }
    }

    if (triggered.length) {
      setActiveAlerts((current) => {
        const merged = [...triggered.slice(0, 5), ...current];
        return merged.filter((item, index, rows) => rows.findIndex((candidate) =>
          candidate.rule.id === item.rule.id && candidate.symbol === item.symbol && candidate.tier === item.tier,
        ) === index).slice(0, 12);
      });
      const primaryTrigger = triggered[0];
      if (settings.soundAlertsEnabled) playAlertTone();
      showBrowserNotification(
        `APEX alert · ${primaryTrigger.symbol}`,
        `${primaryTrigger.rule.name} (${primaryTrigger.tier})${triggered.length > 1 ? ` · +${triggered.length - 1} more` : ''}`,
      );
      const updatedRules = alertRules.map((rule) => triggeredRuleIds.has(rule.id)
        ? { ...rule, triggeredCount: rule.triggeredCount + 1, lastTriggeredAt: now, enabled: rule.triggerOnce ? false : rule.enabled }
        : rule);
      setAlertRules(updatedRules);
      saveAlertRules(updatedRules);
    }
  }, [alertRules, insights, settings.soundAlertsEnabled, tickers]);


  const fetchTickerUniverse = useCallback(async () => {
    if (tickerRequestInFlight.current) return;
    tickerRequestInFlight.current = true;
    setMarketLoading(true);
    try {
      const topData = await fetchJsonWithTimeout<TopVolumePayload | null>('/api/market/top-volume?limit=120', { timeoutMs: 22_000 });
      const nextTickers = sanitizeTickerUniverse(Array.isArray(topData?.symbols) ? topData.symbols : []);
      setTickers(nextTickers);
      setMarketProvider(typeof topData?.source === 'string' && topData.source !== 'none' ? topData.source : null);
      setMarketObservedAt(nextTickers.reduce<number | null>((latest, ticker) => {
        const observedAt = Number(ticker.timestamp);
        if (!Number.isFinite(observedAt) || observedAt <= 0) return latest;
        return latest === null ? observedAt : Math.max(latest, observedAt);
      }, null));
      setDataState(topData?.dataState || (nextTickers.length ? 'live' : 'unavailable'));
      if (nextTickers.length) {
        setSelectedSymbol((current) => nextTickers.some((ticker) => ticker.symbol === current) ? current : nextTickers[0].symbol);
      }
    } catch (error) {
      console.warn('ticker_universe_sync_failed', error);
      setDataState((current) => current === 'live' ? 'degraded' : 'unavailable');
    } finally {
      tickerRequestInFlight.current = false;
      setMarketLoading(false);
    }
  }, []);

  const fetchMarketIntelligence = useCallback(async () => {
    if (intelligenceRequestInFlight.current) return;
    intelligenceRequestInFlight.current = true;
    try {
      const [sentimentResult, candidatesResult] = await Promise.allSettled([
        fetchJsonWithTimeout<SentimentComposite>('/api/market/sentiment', { timeoutMs: 10_000 }),
        fetchJsonWithTimeout<CandidatesPayload>(
          `/api/market/candidates?limit=24&includeShadow=0&includeDirection=1&minLiquidity=${encodeURIComponent(String(settings.minLiquidityUsd))}`,
          { timeoutMs: 20_000 },
        ),
      ]);

      if (sentimentResult.status === 'fulfilled') setSentiment(sentimentResult.value);
      else setDataState((current) => current === 'live' ? 'degraded' : current);
      if (candidatesResult.status === 'fulfilled') {
        const payload = candidatesResult.value;
        const rawLong = Array.isArray(payload?.longCandidates) ? payload.longCandidates : [];
        const rawShort = Array.isArray(payload?.shortCandidates) ? payload.shortCandidates : [];
        const lifecycle = updateSignalLifecycles(rawLong, rawShort, payload?.scanTimestamp ?? Date.now());
        const nextLong = lifecycle.longCandidates;
        const nextShort = lifecycle.shortCandidates;
        setLongCandidates(nextLong);
        setShortCandidates(nextShort);
        setScanMeta({
          scannedCount: payload?.scannedCount ?? rawLong.length,
          activeCandidateCount: payload?.activeCandidateCount ?? 0,
          qualifiedSetupCount: payload?.qualifiedSetupCount ?? 0,
          watchCandidateCount: payload?.watchCandidateCount ?? 0,
          abstainedCandidateCount: payload?.abstainedCandidateCount ?? 0,
          universeCount: payload?.universeCount ?? payload?.scannedCount ?? rawLong.length,
          eligibleUniverseCount: payload?.eligibleUniverseCount ?? payload?.scannedCount ?? rawLong.length,
          scanTimestamp: payload?.scanTimestamp ?? null,
        });
        void persistCandidateShadowLogs({
          longCandidates: nextLong,
          shortCandidates: nextShort,
          scanTimestamp: payload?.scanTimestamp,
          shadowMode: payload?.shadowMode !== false,
          opportunityShadow: payload?.opportunityShadow,
          intelligenceParliamentShadow: payload?.intelligenceParliamentShadow,
        }).catch((err) => console.warn('shadow_log_persist_failed', err));
        if (lifecycle.closures.length) {
          void Promise.allSettled(
            lifecycle.closures.map((closure) => linkLifecycleClosureToDecisionMemory(closure)),
          ).catch((error) => console.warn('decision_outcome_link_failed', error));
        }
        void dispatchCandidateTelegramRecords(lifecycle.created)
          .catch((error) => console.warn('telegram_candidate_dispatch_failed', error));
        void dispatchLifecycleTelegramTransitions(lifecycle.transitions)
          .catch((error) => console.warn('telegram_lifecycle_dispatch_failed', error));
        if (payload?.dataState) {
          setDataState((current) => payload.dataState === 'unavailable'
            ? (current === 'live' ? 'degraded' : current)
            : payload.dataState === 'degraded' && current === 'live' ? 'degraded' : current);
        }
        if (payload?.dataState && payload.dataState !== 'live') {
          void dispatchDataDegradedTelegramAlert({
            state: payload.dataState,
            source: payload.source,
            detail: 'Candidate scan completed with incomplete or non-live market evidence.',
          }).catch((error) => console.warn('telegram_data_degraded_dispatch_failed', error));
        }
      } else {
        setDataState((current) => current === 'live' ? 'degraded' : current);
      }
    } catch (error) {
      console.warn('market_intelligence_sync_failed', error);
      setDataState((current) => current === 'live' ? 'degraded' : current);
    } finally {
      intelligenceRequestInFlight.current = false;
    }
  }, [settings.minLiquidityUsd]);

  const refreshMarketData = useCallback(async () => {
    await Promise.allSettled([fetchTickerUniverse(), fetchMarketIntelligence()]);
  }, [fetchMarketIntelligence, fetchTickerUniverse]);

  const refreshAccount = useCallback(async (options: { silent?: boolean } = {}) => {
    if (accountRequestInFlight.current) return;
    accountRequestInFlight.current = true;
    if (!options.silent) setAccountLoading(true);
    setAccountError(null);
    try {
      let currentConnection = connectionRef.current;
      // A failed first bootstrap used to strand the whole account side of the
      // app in `not_connected`: the polling effect was disabled and refreshAccount
      // returned before probing the server again. Re-probe connection state here
      // so Portfolio / Orders / Positions / History self-heal after server startup
      // races or a transient browser-network error.
      if (!accountIsAvailable(currentConnection)) {
        const probed = (await getConnection({ signal: AbortSignal.timeout(8_000) })) ?? INITIAL_CONNECTION;
        connectionRef.current = probed;
        setConnection(probed);
        currentConnection = probed;
      }
      if (!accountIsAvailable(currentConnection)) {
        setSnapshot(null);
        setInsights(null);
        setReconciliation(null);
        return;
      }
      const result = await getWorkspaceData({ signal: AbortSignal.timeout(12_000) });
      const nextConnection = result.connection ?? INITIAL_CONNECTION;
      connectionRef.current = nextConnection;
      setConnection(nextConnection);
      setSnapshot(result.snapshot);
      setInsights(result.insights);
      setReconciliation(result.reconciliation);
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      if (!aborted) setAccountError(error instanceof Error ? error.message : 'account_sync_failed');
      try {
        const current = (await getConnection({ signal: AbortSignal.timeout(8_000) })) ?? INITIAL_CONNECTION;
        connectionRef.current = current;
        setConnection(current);
        if (!accountIsAvailable(current)) { setSnapshot(null); setInsights(null); setReconciliation(null); }
      } catch { /* retain the actionable portfolio error */ }
    } finally {
      accountRequestInFlight.current = false;
      if (!options.silent) setAccountLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      setAccountLoading(true);
      try {
        const current = (await getConnection({ signal: AbortSignal.timeout(12_000) })) ?? INITIAL_CONNECTION;
        if (!active) return;
        connectionRef.current = current;
        setConnection(current);
        if (accountIsAvailable(current)) {
          const result = await getWorkspaceData({ signal: AbortSignal.timeout(12_000) });
          if (!active) return;
          const nextConnection = result.connection ?? INITIAL_CONNECTION;
          connectionRef.current = nextConnection;
          setConnection(nextConnection);
          setSnapshot(result.snapshot);
          setInsights(result.insights);
          setReconciliation(result.reconciliation);
        } else { setSnapshot(null); setInsights(null); }
      } catch (error) {
        if (active) setAccountError(error instanceof Error ? error.message : 'account_bootstrap_failed');
      } finally {
        if (active) setAccountLoading(false);
      }
    };
    void bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void fetchTickerUniverse();
    void fetchMarketIntelligence();
    const tickerTimer = window.setInterval(() => void fetchTickerUniverse(), 12_000);
    const intelligenceTimer = window.setInterval(() => void fetchMarketIntelligence(), 30_000);
    return () => {
      window.clearInterval(tickerTimer);
      window.clearInterval(intelligenceTimer);
    };
  }, [fetchMarketIntelligence, fetchTickerUniverse]);


  useEffect(() => {
    evaluateAlertTriggers(longCandidates, shortCandidates, tickers);
  }, [evaluateAlertTriggers, longCandidates, shortCandidates, tickers]);

  useEffect(() => {
    // Always keep a lightweight recovery probe alive. When account state is
    // available this refreshes the workspace; when bootstrap failed it first
    // re-reads /api/account/connection and can recover without a page reload.
    const id = window.setInterval(() => void refreshAccount({ silent: true }), accountIsAvailable(connection) ? 8_000 : 12_000);
    return () => window.clearInterval(id);
  }, [connection?.status, connection?.mode, refreshAccount]);

  useEffect(() => {
    // Analytics consumes the selected market candle/feed contract too. Keeping
    // detail loading limited to Overview/Trading left Analytics with an empty
    // chart even while the same symbol was healthy elsewhere. Fetch detail for
    // every route that actually renders that contract; do not fan out to pages
    // that only need the ticker universe.
    if (page !== 'overview' && page !== 'trading' && page !== 'analytics') return undefined;
    const controller = new AbortController();
    const includeMicrostructure = page === 'trading';
    // Overview and Analytics request the same non-microstructure detail contract,
    // so they must share the same last-good cache. Keying by page discarded a
    // perfectly valid Overview snapshot when the user navigated to Analytics.
    const detailCacheKey = `${selectedSymbol}:${chartInterval}:${includeMicrostructure ? 'micro' : 'base'}`;
    const cachedDetail = lastGoodSymbolDetailRef.current.get(detailCacheKey);
    setChartFeed((current) => ({ ...current, loading: true, error: null }));
    if (!cachedDetail) {
      setChartCandles([]);
      setChartOrderBook(null);
      setChartOrderBookLevels(null);
    }

    const applyPayload = (payload: SymbolDetailPayload, staleOverride = false, staleReason: string | null = null) => {
      const candles = Array.isArray(payload.candles) ? payload.candles : [];
      const feed = payload.candleFeed || {};
      setDetailLevels(payload.levels || null);
      setDetailLongScore(payload.scoreLong || null);
      setDetailShortScore(payload.scoreShort || null);
      setDetailTradePlanLong(payload.tradePlanLong || null);
      setDetailTradePlanShort(payload.tradePlanShort || null);
      setChartCandles(candles);
      setChartOrderBook(payload.orderBook || null);
      setChartOrderBookLevels(payload.orderBookLevels || null);
      setChartFeed({
        loading: false,
        dataState: staleOverride ? 'degraded' : (feed.dataState || payload.dataState || (candles.length ? 'degraded' : 'unavailable')),
        source: feed.source || payload.source || null,
        stale: staleOverride || feed.stale === true,
        ageMs: staleOverride && cachedDetail ? Math.max(0, Date.now() - cachedDetail.observedAt) : Number(feed.ageMs || 0),
        error: staleReason || (candles.length ? null : String(feed.error || 'verified_candles_unavailable')),
      });
    };

    const loadDetail = async () => {
      try {
        const payload = await fetchJsonWithTimeout<SymbolDetailPayload>(
          `/api/market/symbol/${encodeURIComponent(selectedSymbol)}?interval=${chartInterval}&limit=120&includeMicrostructure=${includeMicrostructure ? '1' : '0'}&includeDirection=1&accountBalance=${encodeURIComponent(String(settings.defaultAccountBalanceUsd))}&riskPct=${encodeURIComponent(String(settings.defaultRiskPct))}&leverage=${encodeURIComponent(String(settings.defaultLeverage))}`,
          { timeoutMs: includeMicrostructure ? 26_000 : 20_000, signal: controller.signal },
        );
        const candles = Array.isArray(payload.candles) ? payload.candles : [];
        if (candles.length) lastGoodSymbolDetailRef.current.set(detailCacheKey, { payload, observedAt: Date.now() });
        applyPayload(payload);
      } catch (error) {
        if (controller.signal.aborted) return;
        const failure = error instanceof Error ? error.message : 'market_detail_sync_failed';
        const lastGood = lastGoodSymbolDetailRef.current.get(detailCacheKey);
        if (lastGood && Date.now() - lastGood.observedAt <= 15 * 60_000) {
          applyPayload(lastGood.payload, true, `live_refresh_failed:${failure}`);
          return;
        }
        setDetailLevels(null);
        setDetailLongScore(null);
        setDetailShortScore(null);
        setDetailTradePlanLong(null);
        setDetailTradePlanShort(null);
        setChartCandles([]);
        setChartOrderBook(null);
        setChartOrderBookLevels(null);
        setChartFeed({
          loading: false,
          dataState: 'unavailable',
          source: null,
          stale: false,
          ageMs: 0,
          error: failure,
        });
      }
    };

    void loadDetail();
    return () => controller.abort('selected_market_changed');
  }, [selectedSymbol, chartInterval, detailRefreshKey, page, settings.defaultAccountBalanceUsd, settings.defaultRiskPct, settings.defaultLeverage]);

  useEffect(() => {
    const onHashChange = () => setPage(initialPage());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const navigate = (nextPage: WorkspacePage) => {
    const target = `#/${nextPage}`;
    if (window.location.hash !== target) window.history.pushState(null, '', target);
    setPage(nextPage);
  };

  const onConnectionChange = (nextConnection: ConnectionState, nextSnapshot?: AccountSnapshot | null) => {
    connectionRef.current = nextConnection;
    setConnection(nextConnection);
    const normalizedSnapshot = nextSnapshot === undefined ? null : nextSnapshot;
    setSnapshot(normalizedSnapshot);
    setInsights(normalizedSnapshot ? buildWorkspaceInsights(normalizedSnapshot) : null);
    setReconciliation(null);
    setAccountError(null);
  };

  const marketProps = {
    tickers,
    sentiment,
    longCandidates,
    shortCandidates,
    dataState,
    loading: marketLoading,
    selectedSymbol,
    candles: chartCandles,
    chartFeed,
    onSelectSymbol: setSelectedSymbol,
    onRefresh: () => void refreshMarketData(),
    onViewAssetDetails: () => navigate('markets'),
    onOpenTrading: (symbol?: string) => { if (symbol) setSelectedSymbol(symbol); navigate('trading'); },
    onOpenWatchlist: () => navigate('watchlist'),
  };
  const accountProps = {
    connection,
    snapshot,
    insights,
    reconciliation,
    loading: accountLoading,
    error: accountError,
    onConnect: () => navigate('settings'),
    onRefresh: refreshAccount,
    onOpenTrading: (symbol?: string) => { if (symbol) setSelectedSymbol(symbol); navigate('trading'); },
    onOpenSettings: () => navigate('settings'),
  };
  const selectedTicker = useMemo(
    () => tickers.find((ticker) => ticker.symbol === selectedSymbol) || tickers[0] || null,
    [selectedSymbol, tickers],
  );
  const effectiveLongScore = useMemo(() => {
    const tracked = longCandidates.find((candidate) => candidate.symbol === selectedSymbol) || null;
    if (!detailLongScore) return tracked;
    return tracked ? {
      ...detailLongScore,
      signalId: tracked.signalId,
      signalLifecycle: tracked.signalLifecycle,
      directionDivergenceShadow: detailLongScore.directionDivergenceShadow ?? tracked.directionDivergenceShadow,
      lifecycleContext: detailLongScore.lifecycleContext ?? tracked.lifecycleContext,
    } : detailLongScore;
  }, [detailLongScore, longCandidates, selectedSymbol]);
  const effectiveShortScore = useMemo(() => {
    const tracked = shortCandidates.find((candidate) => candidate.symbol === selectedSymbol) || null;
    if (!detailShortScore) return tracked;
    return tracked ? {
      ...detailShortScore,
      signalId: tracked.signalId,
      signalLifecycle: tracked.signalLifecycle,
      directionDivergenceShadow: detailShortScore.directionDivergenceShadow ?? tracked.directionDivergenceShadow,
      lifecycleContext: detailShortScore.lifecycleContext ?? tracked.lifecycleContext,
    } : detailShortScore;
  }, [detailShortScore, selectedSymbol, shortCandidates]);
  const retrySelectedMarket = useCallback(() => setDetailRefreshKey((current) => current + 1), []);

  let content: React.ReactNode;
  switch (page) {
    case 'markets': content = <MarketsView {...marketProps} />; break;
    case 'watchlist': content = <WatchlistPage {...marketProps} onOpenTrading={() => navigate('trading')} onOpenMarkets={() => navigate('markets')} />; break;
    case 'screener': content = <ScreenerPage {...marketProps} />; break;
    case 'portfolio': content = <PortfolioPage {...accountProps} />; break;
    case 'trading': content = <TradingView {...accountProps} settings={settings} tickers={tickers} selectedTicker={selectedTicker} onSelectSymbol={setSelectedSymbol} levels={detailLevels} longScore={effectiveLongScore} shortScore={effectiveShortScore} tradePlanLong={detailTradePlanLong} tradePlanShort={detailTradePlanShort} chartCandles={chartCandles} chartOrderBook={chartOrderBook} chartOrderBookLevels={chartOrderBookLevels} chartInterval={chartInterval} chartFeed={chartFeed} onRetryChart={retrySelectedMarket} onChartIntervalChange={setChartInterval} />; break;
    case 'orders': content = <OrdersPage {...accountProps} />; break;
    case 'positions': content = <PositionsPage {...accountProps} />; break;
    case 'providers': content = <ProvidersPage onNavigate={(destination) => navigate(destination)} />; break;
    case 'alerts': content = <AlertsPage rules={alertRules} activeAlerts={activeAlerts} tickers={tickers} candidates={[...longCandidates, ...shortCandidates]} onRulesChange={(nextRules) => { if (!saveAlertRules(nextRules)) return false; setAlertRules(nextRules); return true; }} />; break;
    case 'history': content = <HistoryPage {...accountProps} />; break;
    case 'analytics': content = <AnalyticsPage account={accountProps} market={marketProps} />; break;
    case 'backtesting': content = <BacktestingPage tickers={tickers} selectedSymbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} dataState={dataState} autopilotEnabled={effectiveAutopilotEnabled} autopilotController={autopilotController} />; break;
    case 'academy': content = <AcademyPage onNavigate={(destination) => navigate(destination)} autopilotController={autopilotController} />; break;
    case 'strategies': content = <StrategyPage tickers={tickers} selectedSymbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} autopilotEnabled={effectiveAutopilotEnabled} autopilotController={autopilotController} />; break;
    case 'settings': content = <SettingsPage connection={connection} settings={settings} onSettingsChange={applySettings} onConnectionChange={onConnectionChange} />; break;
    case 'help': content = <HelpPage />; break;
    default: content = (
      <OverviewView
        {...marketProps}
        connection={connection}
        settings={settings}
        snapshot={snapshot}
        account={accountProps}
        insights={insights}
        reconciliation={reconciliation}
        autopilotController={autopilotController}
        selectedTicker={selectedTicker}
        chartCandles={chartCandles}
        chartOrderBook={chartOrderBook}
        chartInterval={chartInterval}
        chartFeed={chartFeed}
        tradePlanLong={detailTradePlanLong}
        tradePlanShort={detailTradePlanShort}
        scanMeta={scanMeta}
        marketProvider={marketProvider}
        marketObservedAt={marketObservedAt}
        onRetryChart={retrySelectedMarket}
        onChartIntervalChange={setChartInterval}
        onNavigate={(destination) => navigate(destination)}
      />
    );
  }

  return <><WorkspaceShell page={page} onNavigate={navigate} connection={connection} marketState={dataState} symbols={tickers} onSelectSymbol={setSelectedSymbol} autopilotPreferenceEnabled={settings.autopilotEnabled} autopilotController={autopilotController} onAutopilotEnabledChange={setAutopilotEnabled}><RouteErrorBoundary route={page} resetKey={page}><Suspense fallback={<RouteSkeleton page={page} />}>{content}</Suspense></RouteErrorBoundary></WorkspaceShell><ServiceWorkerUpdateBanner /></>;
}
