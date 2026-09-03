import { loadProxySettings, saveProxySettings, getRuntimeProxyConfig } from './src/services/proxySettingsStore';
import { normalizeProxyConfig } from './src/services/proxyConfig';
import "dotenv/config";
import express from "express";
import { createServer as createHttpServer } from "node:http";
import path from "path";
import crypto from "crypto";
import { existsSync, readFileSync } from "fs";
// Type-only: vite is a devDependency and is loaded lazily in the dev branch
// below. A static value import here made the bundled production server
// top-level `require("vite")`, so `node dist/server.cjs` crashed on any
// production install that omitted devDependencies. Keep this type-only.
import type { createServer as createViteServer } from "vite";
import { DEFAULT_SCANNER_CONFIG, registerApexNextMarketRoutes } from './src/services/apexNextMarketRoutes';
import { DecisionMemoryMirror } from './src/services/decisionMemoryMirror';
import { resolvePrivateDataDir } from './src/services/privateConfigFile';
import { isResearchOutcomeLog } from './src/services/researchOutcomeFeedback';
import {
  getDecisionMemoryDatasetSyncIntervalMs,
  getDecisionMemoryDatasetDurabilityStatus,
  isDecisionMemoryDatasetSyncConfigured,
  restoreDecisionMemoryFromDataset,
  syncDecisionMemoryToDataset,
} from './src/services/decisionMemoryDatasetSync';
import { registerDecisionMemoryRoutes } from './src/services/routes/decisionMemoryRoutes';
import { resolveHost, resolvePort } from './src/utils/cliConfig';
import { ensureApexPortAvailable } from './scripts/utilities/portTakeover.mts';
import { initializeSupplementalOrchestrator, getSupplementalOrchestrator } from './src/services/supplementalOrchestrator';
import { getProviderHealthTracker } from './src/services/providerHealth';
import {
  buildOperationsStatus,
  createUnavailableOperationsStatus,
} from './src/services/operationsStatus';
import { buildProductionReadiness } from './src/services/productionReadiness';
import {
  smartFetchJson,
  pruneProxyState,
  getProxyPoolInfo,
  probeProxyConfiguration,
} from './src/services/proxyFetch';
import { IntegrationHealthHistory } from './src/services/integrationHealthHistory';
import { persistTelegramConfigUpdate } from './src/services/telegramConfigPersistence';
import {
  routeBinanceSentiment,
  pruneProviderRouterState,
  SYMBOL_NOT_SUPPORTED,
  type FetchJson,
  type DataEnvelope,
} from './src/services/providerRouter';
import {
  toKuCoinKlineGranularity,
  kucoinTicker   as ecKucoinTicker,
  kucoinLevel2   as ecKucoinLevel2,
  kucoinCandles  as ecKucoinCandles,
  kucoinContract as ecKucoinContract,
  binanceExchangeInfo   as ecBinanceExchangeInfo,
  binanceGlobalLongShort as ecBinanceLongShort,
  binanceTakerBuySell    as ecBinanceTaker,
  binanceTicker          as ecBinanceTicker,
  binanceDepth           as ecBinanceDepth,
  binanceKlines          as ecBinanceKlines,
  binanceFunding         as ecBinanceFunding,
  binanceOpenInterest    as ecBinanceOpenInterest,
  toKuCoinFuturesSymbol,
} from './src/services/providers/publicExchangeClient';
import { writePrivateJsonFileSync, resolvePrivateConfigPath } from './src/services/privateConfigFile';
import {
  assertMutationAllowed,
  assertComputeHeavyAllowed,
  assertPrivateReadAllowed,
  buildRuntimeSecurityPosture,
  assertSafeOutboundUrlResolved,
  buildSecurityHeaders,
  isComputeHeavyRoute,
  isOriginAllowed,
  isPrivateReadRoute,
  MutationRateLimiter,
  parseCorsAllowlist,
  resolveDeploymentProfile,
} from './src/services/serverSecurity';
import {
  deriveProbeStatus,
  deriveProxyPoolStatus,
  deriveSupplementalStatus,
} from './src/services/healthStatus';
import {
  COMPLETED_SUPPLEMENTAL_DEFAULTS,
  createCompletedDefaultExternalSources,
} from './src/config/completedApiDefaults';
import {
  loadBundledPrivateApiSeed,
  primarySeedKeys,
  reserveSeedKeys,
} from './src/services/privateApiSeed';
import {
  probeAllSupplementalKeys,
  probeSupplementalKey,
  type SupplementalProbeKey,
  type SupplementalProbeResult,
} from './src/services/supplementalKeyProbe';
import { getCanonicalDatasourceGateway } from './src/services/datasource/canonicalDatasourceGateway';
import {
  DEFAULT_NEWSAPI_QUERY,
  normalizeNewsApiQuery,
  type NewsApiQueryOptions,
} from './src/services/providers/newsApiRequest';
import { fetchIntelligenceFeedSnapshot } from './src/services/intelligenceFeedProbe';
import { iconProxy } from './src/services/iconProxy';
import { readLocalIcon } from './src/services/localIconAssets';
import { fetchHfSpaceIntelStatus, fetchHfSpaceNews, fetchHfSpaceFearGreed, fetchHfSpaceWhales } from './src/services/hfSpaceIntel';
import { HF_SPACE_2_ORIGIN, HF_SPACE_4_ORIGIN } from './src/services/hfSpaceIntel';
import {
  analyzeSpace2Sentiment,
  getSpace2DefiProtocols,
  getSpace2DefiYields,
  getSpace2HistoricalCandles,
  getSpace4Funding,
  getSpace4Market,
  getSpace4OpenInterest,
  getSpace4OrderBook,
  getSpace4Snapshot,
  pruneHfSpacesClientState,
} from './src/services/hfSpacesClient';
import {
  alignQuantityDownToLot,
  evaluateManualTestnetOrder,
  getTestnetReadiness,
  KuCoinFuturesTestnetAdapter,
  loadValidationCredentials,
  loadTestnetCredentials,
  loadTestnetRiskConfig,
  TestnetOrderStore,
  ValidationRecordStore,
  type ContractRules,
  type ManualTestnetOrderRequest,
  type TestnetFillRecord,
  type TestnetOrderRecord,
  type TestnetOrderStatus,
  type ValidationRecord,
} from './src/services/testnetExecution';
import {
  EXCHANGE_SESSION_COOKIE,
  ExchangeSessionManager,
  fetchAccountSnapshot,
  parseCookie,
  previewLiveOrder,
  submitPreviewedLiveOrder,
  toPublicPreview,
} from './src/services/connectedExchange';
import {
  DemoAccountManager,
  toPublicDemoPreview,
} from './src/services/demoAccount';
import { buildWorkspaceInsights } from './src/services/workspaceInsights';
import { TABDEAL_SESSION_COOKIE, TabdealSessionManager } from './src/services/exchanges/tabdeal/tabdealSessionManager';
import { evaluateRiskGovernor, loadRiskGovernorPolicy } from './src/services/riskGovernor';
import { evaluateMlGovernance } from './src/services/mlGovernance';
import { parseShadowMlModelFile } from './src/services/shadowMlModel';
import { getTradingModuleRegistry } from './src/services/tradingModuleRegistry';
import { AdaptiveThresholdGovernanceStore } from './src/services/adaptiveThresholdGovernance';
import { buildFastAdaptiveShadowRecommendation } from './src/services/fastAdaptiveShadowController';
import { marketStatistics } from './src/services/onlineStatistics';
import { getCandles, getHfFallbackCycleTelemetry, getTickers } from './src/services/marketDataService';
import { OpenInterestHistoryStore, OpenInterestSampler } from './src/services/openInterestHistory';
import { simulateCrossVenueMarketMaking, simulateFundingAwareAvellaneda } from './src/services/research/marketMakingSimulator';
import { adaptSmartMoneyContext } from './src/services/smartMoneyContextAdapter';
import { bootstrapFundingOiContext } from './src/services/liquidityHunter/restContextBootstrap';
import { attachLiquidityHunterWebSocketGateway, type LiquidityHunterWebSocketGateway } from './src/services/readPlane/liquidityHunterWebSocketGateway';
import { buildLiquidityHunterViewModel } from './src/services/readPlane/liquidityHunterViewModel';
import { createReplayDatasetManifest } from './src/services/replay/replayDatasetManifest';
import { runLiquidityHunterEventReplay } from './src/services/replay/eventReplayRunner';
import type { EdgeThresholdOptimizationReport } from './src/services/liquidityHunter/edgeThresholdOptimizer';
import { liquidityHunterManualCanaryRegistry } from './src/services/liquidityHunter/manualCanaryRegistry';
import type { TradePlan } from './src/services/tradePlan';
import { ExecutionPositionStateMachine } from './src/services/execution/executionPositionStateMachine';
import { PositionProtectionCoordinator } from './src/services/execution/positionProtectionCoordinator';
import {
  getLiquidityHunterEdgeCatalog,
  getLiquidityHunterOperationsSnapshot,
  getLiquidityHunterRuntime,
  initializeLiquidityHunterFoundation,
  shutdownLiquidityHunterFoundation,
} from './src/services/liquidityHunter/foundationRuntime';

// Adapter: expose the smart direct/proxy fetch to the provider router.
const routerFetch: FetchJson = (url, opts) =>
  smartFetchJson(url, { logKey: opts?.logKey, timeoutMs: opts?.timeoutMs });

const app = express();
let acceptingRequests = true;
let lastPrimaryProviderProbe: {
  checkedAt: number;
  kucoin: 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  binance: 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
} | null = null;
let activeHttpServer: ReturnType<typeof createHttpServer> | null = null;
let activeViteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;
let liquidityHunterWsGateway: LiquidityHunterWebSocketGateway | null = null;
const openInterestHistoryStore = new OpenInterestHistoryStore();
let openInterestSampler: OpenInterestSampler | null = null;
const liquidityHunterReplayRuns = new Map<string, { id: string; status: 'RUNNING' | 'COMPLETED' | 'FAILED'; createdAt: number; result?: unknown; error?: string }>();
const liquidityHunterExecutionLifecycles = new ExecutionPositionStateMachine();
const liquidityHunterProtectionCoordinator = new PositionProtectionCoordinator();
let shutdownStarted = false;
const PORT = resolvePort();
const HOST = resolveHost();
const EXCHANGE_REQUEST_TIMEOUT_MS = Number(process.env.EXCHANGE_REQUEST_TIMEOUT_MS || 20000);
const KUCOIN_FUTURES_BASE = process.env.KUCOIN_FUTURES_BASE || "https://api-futures.kucoin.com";
/** Binance USD-M base — BINANCE_PROXY_BASE_URL overrides for geo-restricted relays (HTTP 451). */
const BINANCE_FUTURES_BASE =
  process.env.BINANCE_PROXY_BASE_URL ||
  process.env.BINANCE_FUTURES_BASE ||
  "https://fapi.binance.com";
const EXCHANGE_ROUTE_COOLDOWN_MS = Number(process.env.EXCHANGE_ROUTE_COOLDOWN_MS || 15_000);
const JSON_BODY_LIMIT = (process.env.APEX_JSON_BODY_LIMIT || '256kb').trim() || '256kb';
const OPERATOR_TOKEN = (process.env.APEX_OPERATOR_TOKEN || '').trim();
// GAP EXE-05: explicit deployment profile. 'local' (default) preserves prior
// behavior; 'production' hard-requires an operator token and TLS on every
// mutating request (see assertMutationAllowed / serverSecurity.ts).
const DEPLOYMENT_PROFILE = resolveDeploymentProfile(process.env.APEX_DEPLOYMENT_PROFILE);
if (DEPLOYMENT_PROFILE === 'production' && !OPERATOR_TOKEN) {
  console.error(
    '[Security] APEX_DEPLOYMENT_PROFILE=production but APEX_OPERATOR_TOKEN is not set. ' +
    'All mutating /api requests will be rejected (503) until an operator token is configured.'
  );
}
const CORS_ALLOWLIST = parseCorsAllowlist(process.env.APEX_CORS_ORIGINS, PORT);
const SSRF_PRIVATE_HOST_ALLOWLIST = (process.env.APEX_SSRF_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MUTATION_RATE_LIMIT = Number(process.env.APEX_MUTATION_RATE_LIMIT || 60);
const MUTATION_RATE_WINDOW_MS = Number(process.env.APEX_MUTATION_RATE_WINDOW_MS || 60_000);
const mutationRateLimiter = new MutationRateLimiter(
  Number.isFinite(MUTATION_RATE_LIMIT) && MUTATION_RATE_LIMIT > 0 ? MUTATION_RATE_LIMIT : 60,
  Number.isFinite(MUTATION_RATE_WINDOW_MS) && MUTATION_RATE_WINDOW_MS > 0 ? MUTATION_RATE_WINDOW_MS : 60_000
);
const COMPUTE_RATE_LIMIT = Number(process.env.APEX_COMPUTE_RATE_LIMIT || 20);
const COMPUTE_RATE_WINDOW_MS = Number(process.env.APEX_COMPUTE_RATE_WINDOW_MS || 60_000);
const computeRateLimiter = new MutationRateLimiter(
  Number.isFinite(COMPUTE_RATE_LIMIT) && COMPUTE_RATE_LIMIT > 0 ? COMPUTE_RATE_LIMIT : 20,
  Number.isFinite(COMPUTE_RATE_WINDOW_MS) && COMPUTE_RATE_WINDOW_MS > 0 ? COMPUTE_RATE_WINDOW_MS : 60_000
);
const exchangeSessionManager = new ExchangeSessionManager();
const tabdealSessionManager = new TabdealSessionManager();
const DEMO_SESSION_COOKIE = 'apex_demo_session';
const ACCOUNT_MODE_COOKIE = 'apex_account_mode';
const demoAccountManager = new DemoAccountManager({
  async quote(symbol) {
    const [tickerResult, contractResult] = await Promise.all([
      ecKucoinTicker(symbol),
      ecKucoinContract(symbol),
    ]);
    if (!tickerResult.ok || !contractResult.ok) throw new Error('demo_market_quote_unavailable');
    const ticker = tickerResult.data && typeof tickerResult.data === 'object'
      ? tickerResult.data as Record<string, unknown>
      : {};
    const contract = contractResult.data && typeof contractResult.data === 'object'
      ? contractResult.data as Record<string, unknown>
      : {};
    return {
      symbol: toKuCoinFuturesSymbol(symbol),
      price: Number(ticker.price ?? ticker.markPrice ?? contract.markPrice ?? 0),
      multiplier: Number(contract.multiplier ?? 0),
      lotSize: Number(contract.lotSize ?? 1),
      tickSize: Number(contract.tickSize ?? 0),
      maxLeverage: Number(contract.maxLeverage ?? 100),
      status: String(contract.status ?? 'Open'),
    };
  },
});

app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.use((req, res, next) => {
  for (const [key, value] of Object.entries(buildSecurityHeaders(req.path))) {
    res.setHeader(key, value);
  }
  next();
});

app.use((req, res, next) => {
  const incomingRequestId = typeof req.headers['x-request-id'] === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(req.headers['x-request-id'])
    ? req.headers['x-request-id']
    : null;
  const requestId = incomingRequestId || crypto.randomUUID();
  const startedAt = Date.now();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const log = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      event: 'http_request',
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    };
    console.log(JSON.stringify(log));
  });

  if (!acceptingRequests && req.path.startsWith('/api/') && req.path !== '/api/readiness') {
    return res.status(503).json({
      ok: false,
      error: {
        code: 'server_draining',
        message: 'The server is shutting down and is not accepting new work.',
        requestId,
        retryable: true,
        issues: [],
      },
    });
  }
  next();
});

app.get('/api/readiness', (_req, res) => {
  const now = Date.now();
  const supplementalSummary = getProviderHealthTracker().getSummary();
  const governance = adaptiveThresholdGovernance.snapshot();
  const production = buildProductionReadiness({
    now,
    acceptingRequests,
    providerProbe: lastPrimaryProviderProbe,
    exchange: exchangeSessionManager.diagnostics(now),
    persistence: {
      decisionMemoryAvailable: Boolean(decisionMemoryMirror),
      decisionMemoryWritable: decisionMemoryMirror?.persistenceStatus().writable ?? false,
      adaptiveGovernanceAvailable: Boolean(governance.active),
    },
    liquidityHunter: getLiquidityHunterOperationsSnapshot(),
    supplementalSummary,
  });
  res.status(acceptingRequests ? 200 : 503).json({
    ok: acceptingRequests,
    state: acceptingRequests ? 'ready' : 'draining',
    requestId: res.locals.requestId,
    timestamp: now,
    production,
  });
});

// Same-origin crypto-icon proxy. Fetches from a closed CDN host allowlist
// server-side and serves the bytes here, so the browser never requests a CDN
// directly and the strict `img-src 'self'` CSP holds. The only caller input is
// :asset, constrained to ICON_ASSET_PATTERN and used to fill fixed URL
// templates — no attacker-controlled URL, no SSRF surface. Mounted above the
// `/api` no-store middleware so icons can be cached by the browser.
app.get('/api/icon/:asset', async (req, res) => {
  const asset = String(req.params.asset || '').toLowerCase().replace(/\.(png|svg|jpg|jpeg|webp|gif)$/i, '');

  // Shipped artwork wins, so the top-300 set never depends on egress. This
  // matters even though the frontend links /crypto-icons/<a>.png directly: any
  // other consumer of /api/icon/* gets the same offline guarantee, and a symbol
  // that resolves locally can no longer be poisoned by the 10-minute negative
  // cache that a transport stall would otherwise write.
  const shipped = readLocalIcon(asset);
  if (shipped) {
    res.setHeader('Content-Type', shipped.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Icon-Cache', 'local');
    return res.status(200).end(shipped.body);
  }

  const result = await iconProxy.get(asset);
  if (!result.ok || !result.body) {
    // Short negative cache: avoids hammering upstreams for unknown assets while
    // still letting a newly-added icon appear within minutes.
    res.setHeader('Cache-Control', 'public, max-age=600');
    if (result.status === 400) return res.status(400).json({ ok: false, error: 'icon_unavailable' });
    // Icons are optional presentation assets. A cached upstream miss should let
    // CoinIcon move straight to its in-memory letter fallback without logging a
    // noisy HTTP 404 for every newly listed asset in browser developer tools.
    res.setHeader('X-Icon-Status', 'unavailable');
    return res.status(204).end();
  }
  res.setHeader('Content-Type', result.contentType || 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.setHeader('X-Icon-Cache', result.cached ? 'hit' : 'miss');
  return res.status(200).end(result.body);
});

// Market/account GET responses are live operational data. Prevent the browser,
// service worker, and intermediary proxies from replaying an old empty payload.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const decisionMemoryMirrorEnabled = process.env.APEX_DECISION_MEMORY_MIRROR !== 'false';
const decisionMemoryMirror = decisionMemoryMirrorEnabled
  ? new DecisionMemoryMirror(process.env.APEX_DECISION_MEMORY_PATH)
  : null;
/**
 * Research/paper outcome memory for the Smart Autopilot lifecycle.
 *
 * Same store class, deliberately DIFFERENT file. These rows are simulated
 * replay outcomes, and `adaptiveThresholdGovernance.propose()` below reads
 * `decisionMemoryMirror` — the live one — to move live scanner thresholds.
 * Keeping the two stores separate is what stops a backtest from retuning live
 * gating. Do not merge them or pass this store to `propose()`.
 */
const researchOutcomeMemory = decisionMemoryMirrorEnabled
  ? new DecisionMemoryMirror(
      process.env.APEX_RESEARCH_OUTCOME_MEMORY_PATH
        || path.join(resolvePrivateDataDir(), 'decision-memory', 'research-outcome-memory-v1.json'),
    )
  : null;
const adaptiveThresholdGovernance = new AdaptiveThresholdGovernanceStore(
  DEFAULT_SCANNER_CONFIG,
  process.env.APEX_ADAPTIVE_GOVERNANCE_PATH,
);

app.use((req, res, next) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && isOriginAllowed(origin, CORS_ALLOWLIST)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, X-APEX-CSRF, X-APEX-Operator-Token'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.path.startsWith('/api/')) return next();

  const auth = assertMutationAllowed({
    method: req.method,
    path: req.path,
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : null,
    referer: typeof req.headers.referer === 'string' ? req.headers.referer : null,
    operatorTokenHeader:
      typeof req.headers['x-apex-operator-token'] === 'string'
        ? req.headers['x-apex-operator-token']
        : null,
    csrfHeader:
      typeof req.headers['x-apex-csrf'] === 'string' ? req.headers['x-apex-csrf'] : null,
    remoteAddress: req.socket.remoteAddress || null,
    configuredOperatorToken: OPERATOR_TOKEN,
    allowedOrigins: CORS_ALLOWLIST,
    deploymentProfile: DEPLOYMENT_PROFILE,
    requestIsSecure: req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https',
  });
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const rateKey = `${req.socket.remoteAddress || 'unknown'}|${req.path}`;
  if (!mutationRateLimiter.allow(rateKey)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }
  next();
});

app.use((req, res, next) => {
  if (!isComputeHeavyRoute(req.path)) return next();

  // Compute-heavy routes include GETs (e.g. /api/market/backtest) that never
  // reach the mutation-auth middleware above. Apply the same local-first trust
  // model so an unauthenticated cross-origin or off-box caller cannot drive
  // expensive replays and third-party market-data fan-out. Same-origin browser
  // GETs send no Origin header and originate from loopback, so the local UI is
  // unaffected.
  const auth = assertComputeHeavyAllowed({
    method: req.method,
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : null,
    referer: typeof req.headers.referer === 'string' ? req.headers.referer : null,
    remoteAddress: req.socket.remoteAddress || null,
    allowedOrigins: CORS_ALLOWLIST,
    deploymentProfile: DEPLOYMENT_PROFILE,
  });
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const rateKey = `${req.socket.remoteAddress || 'unknown'}|${req.path}`;
  if (!computeRateLimiter.allow(rateKey)) {
    res.setHeader('Retry-After', String(Math.ceil(COMPUTE_RATE_WINDOW_MS / 1000)));
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }
  next();
});

app.use((req, res, next) => {
  if (!isPrivateReadRoute(req.path)) return next();

  // The private read plane. The mutation-auth middleware above filters on method
  // before it ever calls assertMutationAllowed, and the compute-heavy middleware
  // only matches replay routes, so account/execution/decision-memory/operations
  // GETs previously reached their handlers with no authentication at all — even
  // in the production profile, where a token is mandatory for every mutation.
  // assertPrivateReadAllowed reuses those same two trust models rather than
  // adding a third, so the local UI is unaffected: its same-origin GETs carry no
  // Origin header and come from loopback.
  //
  // Intentionally no rate limiter here. These are cheap reads that the UI polls
  // on a timer, and the two limiters above exist to bound *expensive* or
  // *state-changing* work; a third bucket would only risk throttling the app's
  // own dashboards.
  const auth = assertPrivateReadAllowed({
    method: req.method,
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : null,
    referer: typeof req.headers.referer === 'string' ? req.headers.referer : null,
    operatorTokenHeader:
      typeof req.headers['x-apex-operator-token'] === 'string'
        ? req.headers['x-apex-operator-token']
        : null,
    remoteAddress: req.socket.remoteAddress || null,
    configuredOperatorToken: OPERATOR_TOKEN,
    allowedOrigins: CORS_ALLOWLIST,
    deploymentProfile: DEPLOYMENT_PROFILE,
    requestIsSecure: req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https',
  });
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }
  next();
});

// Registered after the CORS-header and auth/guard middleware above so its
// GET routes (/api/market/*, /api/system/health) actually receive
// Access-Control-Allow-Origin headers instead of short-circuiting past them.
const apexNextMarketRoutes = registerApexNextMarketRoutes(app, {
  onShadowLogs: (logs) => {
    if (decisionMemoryMirror && logs.length) {
      try {
        decisionMemoryMirror.putMany(logs);
      } catch (error) {
        console.error('[decision-memory] shadow batch persistence failed', error instanceof Error ? error.message : 'unknown_error');
      }
    }
  },
  onResearchOutcomeLogs: (logs) => {
    // Simulated replay outcomes -> research-scoped store ONLY.
    if (researchOutcomeMemory && logs.length) {
      researchOutcomeMemory.putMany(logs);
    }
  },
  // Read-back for the forward loop: the next cycle sees what earlier cycles'
  // simulated paper positions actually did. Reads the RESEARCH store, never the
  // live decision memory.
  researchOutcomeLogProvider: () => (researchOutcomeMemory ? researchOutcomeMemory.exportAll() : []),
  scannerConfigProvider: () => adaptiveThresholdGovernance.getActiveConfig(),
  // Outcome calibration reads LIVE decision memory only. Simulated/research rows remain isolated.
  decisionOutcomeLogProvider: () => (decisionMemoryMirror ? decisionMemoryMirror.exportAll().filter((row) => !isResearchOutcomeLog(row)) : []),
});

app.get('/api/security/bootstrap', (req, res) => {
  const requestIsSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const riskPolicy = loadRiskGovernorPolicy();
  const exchangeDiagnostics = exchangeSessionManager.diagnostics();
  const posture = buildRuntimeSecurityPosture({
    deploymentProfile: DEPLOYMENT_PROFILE,
    operatorTokenConfigured: OPERATOR_TOKEN.length > 0,
    requestIsSecure,
    killSwitches: riskPolicy.killSwitches,
    manualLiveExecutionArmedSessions: exchangeDiagnostics.executionArmedSessions,
  });
  res.json({
    ok: true,
    csrfHeaderRequired: true,
    operatorTokenRequired: posture.operatorAuthRequired,
    corsAllowlist: CORS_ALLOWLIST,
    host: HOST,
    port: PORT,
    ...posture,
  });
});

function exchangeSessionId(req: express.Request): string | null {
  return parseCookie(req.headers.cookie, EXCHANGE_SESSION_COOKIE);
}

function tabdealSessionId(req: express.Request): string | null {
  return parseCookie(req.headers.cookie, TABDEAL_SESSION_COOKIE);
}

function exchangeSessionCookie(req: express.Request, sessionId: string, maxAgeMs: number) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = req.secure || forwardedProto === 'https';
  return [
    `${EXCHANGE_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
    `Max-Age=${Math.max(1, Math.floor(maxAgeMs / 1000))}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function clearExchangeSessionCookie(req: express.Request) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = req.secure || forwardedProto === 'https';
  return [
    `${EXCHANGE_SESSION_COOKIE}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function scopedCookie(req: express.Request, name: string, value: string, maxAgeMs: number, httpOnly = true) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = req.secure || forwardedProto === 'https';
  return [
    `${name}=${encodeURIComponent(value)}`,
    httpOnly ? 'HttpOnly' : '',
    'SameSite=Strict',
    'Path=/api',
    `Max-Age=${Math.max(1, Math.floor(maxAgeMs / 1000))}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function requestedAccountMode(req: express.Request): 'demo' | 'live' {
  return parseCookie(req.headers.cookie, ACCOUNT_MODE_COOKIE) === 'live' ? 'live' : 'demo';
}

function ensureDemoSession(req: express.Request, startingBalanceUsd?: number, maxOrderNotionalUsd?: number) {
  const existing = demoAccountManager.get(parseCookie(req.headers.cookie, DEMO_SESSION_COOKIE));
  return existing || demoAccountManager.create(startingBalanceUsd, maxOrderNotionalUsd);
}

function accountCookies(req: express.Request, mode: 'demo' | 'live', demoSessionId?: string) {
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return [
    scopedCookie(req, ACCOUNT_MODE_COOKIE, mode, thirtyDays),
    demoSessionId ? scopedCookie(req, DEMO_SESSION_COOKIE, demoSessionId, thirtyDays) : null,
  ].filter((cookie): cookie is string => Boolean(cookie));
}

function accountRouteError(res: express.Response, error: unknown, fallback = 'exchange_request_failed') {
  const raw = error instanceof Error ? error.message : fallback;
  if (raw.startsWith('trade_plan_invalid:')) {
    return res.status(422).json({ ok: false, error: 'trade_plan_invalid', message: raw.slice('trade_plan_invalid:'.length, 240) });
  }
  const knownClientErrors = new Set([
    'invalid_api_key', 'invalid_api_secret', 'invalid_api_passphrase', 'unsupported_api_key_version',
    'execution_not_armed', 'invalid_order_request', 'invalid_order_quantity_or_leverage',
    'limit_price_required', 'contract_not_open', 'invalid_quantity_step',
    'leverage_exceeds_contract_max', 'invalid_price_tick', 'invalid_protection_price_tick',
    'market_reference_unavailable', 'session_notional_limit_exceeded',
    'insufficient_available_margin', 'exchange_open_order_limit_reached',
    'explicit_live_confirmation_required', 'order_preview_expired',
    'explicit_demo_confirmation_required', 'demo_order_not_found', 'reduce_only_has_no_exposure',
    'reduce_only_protection_not_allowed', 'long_take_profit_must_be_above_entry',
    'long_stop_loss_must_be_below_entry', 'short_take_profit_must_be_below_entry',
    'short_stop_loss_must_be_above_entry', 'risk_governor_rejected', 'risk_governor_deferred',
    'risk_governor_reduced_below_minimum', 'risk_governor_recheck_failed',
    'risk_changed_repreview_required', 'live_order_state_unknown_reconciliation_required',
    'live_connection_required', 'demo_market_quote_unavailable',
  ]);
  if (knownClientErrors.has(raw)) {
    const status = raw === 'execution_not_armed' ? 403 : raw === 'order_preview_expired' ? 410 : raw === 'live_order_state_unknown_reconciliation_required' ? 202 : 422;
    return res.status(status).json({ ok: false, error: raw });
  }
  if (/api.key|passphrase|signature|access denied|permission|40000[3-9]/i.test(raw)) {
    return res.status(401).json({ ok: false, error: 'exchange_authentication_failed' });
  }
  return res.status(502).json({ ok: false, error: fallback, message: raw.slice(0, 240) });
}


/**
 * Secondary Tabdeal FAPI connection. This surface is authenticated READ_ONLY
 * only. It cannot select an execution venue, arm trading, or reach a submit
 * endpoint. Credentials live only inside the short-lived server session.
 */
app.post('/api/exchanges/tabdeal/connect', async (req, res) => {
  try {
    const previousId = tabdealSessionId(req);
    const { session, snapshot } = await tabdealSessionManager.connect(req.body || {});
    if (previousId && previousId !== session.id) tabdealSessionManager.disconnect(previousId);
    res.setHeader('Set-Cookie', scopedCookie(req, TABDEAL_SESSION_COOKIE, session.id, session.expiresAt - Date.now()));
    return res.json({ ok: true, connection: tabdealSessionManager.publicState(session), snapshot });
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'tabdeal_connection_failed';
    const status = raw === 'invalid_tabdeal_api_key' || raw === 'invalid_tabdeal_api_secret' ? 422 : /api|signature|permission|access/i.test(raw) ? 401 : 502;
    return res.status(status).json({ ok: false, error: raw.slice(0, 240) });
  }
});

app.get('/api/exchanges/tabdeal/connection', async (req, res) => {
  const session = tabdealSessionManager.get(tabdealSessionId(req));
  if (session) await tabdealSessionManager.refresh(session);
  return res.json({ ok: true, connection: tabdealSessionManager.publicState(session) });
});

app.get('/api/exchanges/tabdeal/snapshot', async (req, res) => {
  const session = tabdealSessionManager.get(tabdealSessionId(req));
  if (!session) return res.status(401).json({ ok: false, error: 'tabdeal_not_connected' });
  try {
    const symbol = typeof req.query.symbol === 'string' && req.query.symbol.trim() ? req.query.symbol.trim().toUpperCase() : undefined;
    const snapshot = await session.positions.getAccountSnapshot(symbol);
    session.lastAccountReadOk = true;
    return res.json({ ok: true, connection: tabdealSessionManager.publicState(session), snapshot });
  } catch (error) {
    session.lastAccountReadOk = false;
    return res.status(502).json({ ok: false, error: error instanceof Error ? error.message.slice(0, 240) : 'tabdeal_snapshot_failed' });
  }
});

app.delete('/api/exchanges/tabdeal/connection', (req, res) => {
  tabdealSessionManager.disconnect(tabdealSessionId(req));
  return res
    .setHeader('Set-Cookie', scopedCookie(req, TABDEAL_SESSION_COOKIE, '', 1))
    .json({ ok: true, connection: tabdealSessionManager.publicState(null) });
});

/**
 * Browser-supplied exchange credentials are verified once, retained only in
 * this process' short-lived memory, and represented in the browser by an
 * opaque HttpOnly cookie. Secrets are never returned to the client or written
 * to LocalStorage.
 */
app.post('/api/account/connect', async (req, res) => {
  try {
    const previousId = exchangeSessionId(req);
    const { session, snapshot } = await exchangeSessionManager.connect(req.body || {});
    if (previousId && previousId !== session.id) exchangeSessionManager.disconnect(previousId);
    res.setHeader('Set-Cookie', [
      exchangeSessionCookie(req, session.id, session.expiresAt - Date.now()),
      ...accountCookies(req, 'live'),
    ]);
    return res.json({
      ok: true,
      connection: exchangeSessionManager.publicState(session),
      snapshot,
    });
  } catch (error) {
    return accountRouteError(res, error, 'exchange_connection_failed');
  }
});

app.get('/api/account/connection', (req, res) => {
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  if (requestedAccountMode(req) === 'live') {
    return res.json({ ok: true, connection: exchangeSessionManager.publicState(liveSession) });
  }
  const demoSession = ensureDemoSession(req);
  res.setHeader('Set-Cookie', accountCookies(req, 'demo', demoSession.id));
  return res.json({ ok: true, connection: demoAccountManager.publicState(demoSession, liveSession) });
});

app.delete('/api/account/connection', async (req, res) => {
  exchangeSessionManager.disconnect(exchangeSessionId(req));
  const demoSession = ensureDemoSession(req);
  res.setHeader('Set-Cookie', [clearExchangeSessionCookie(req), ...accountCookies(req, 'demo', demoSession.id)]);
  return res.json({
    ok: true,
    connection: demoAccountManager.publicState(demoSession, null),
    snapshot: await demoAccountManager.snapshot(demoSession),
  });
});

app.post('/api/account/mode', async (req, res) => {
  const mode = String(req.body?.mode || '').toLowerCase();
  if (mode !== 'demo' && mode !== 'live') return res.status(422).json({ ok: false, error: 'invalid_account_mode' });
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  if (mode === 'live') {
    if (!liveSession) return res.status(409).json({ ok: false, error: 'live_connection_required' });
    res.setHeader('Set-Cookie', accountCookies(req, 'live'));
    try {
      const snapshot = await fetchAccountSnapshot(liveSession.adapter, true);
      return res.json({ ok: true, connection: exchangeSessionManager.publicState(liveSession), snapshot });
    } catch (error) {
      return accountRouteError(res, error, 'portfolio_sync_failed');
    }
  }
  const demoSession = ensureDemoSession(req, Number(req.body?.startingBalanceUsd), Number(req.body?.maxOrderNotionalUsd));
  res.setHeader('Set-Cookie', accountCookies(req, 'demo', demoSession.id));
  return res.json({
    ok: true,
    connection: demoAccountManager.publicState(demoSession, liveSession),
    snapshot: await demoAccountManager.snapshot(demoSession),
  });
});

app.post('/api/account/demo/reset', async (req, res) => {
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  const demoSession = demoAccountManager.reset(
    parseCookie(req.headers.cookie, DEMO_SESSION_COOKIE),
    Number(req.body?.startingBalanceUsd),
    Number(req.body?.maxOrderNotionalUsd),
  );
  res.setHeader('Set-Cookie', accountCookies(req, 'demo', demoSession.id));
  return res.json({
    ok: true,
    connection: demoAccountManager.publicState(demoSession, liveSession),
    snapshot: await demoAccountManager.snapshot(demoSession),
  });
});

app.get('/api/account/portfolio', async (req, res) => {
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  if (requestedAccountMode(req) === 'demo') {
    const demoSession = ensureDemoSession(req);
    res.setHeader('Set-Cookie', accountCookies(req, 'demo', demoSession.id));
    return res.json({
      ok: true,
      connection: demoAccountManager.publicState(demoSession, liveSession),
      snapshot: await demoAccountManager.snapshot(demoSession),
    });
  }
  if (!liveSession) return res.status(401).json({ ok: false, error: 'exchange_not_connected', state: 'locked' });
  try {
    const snapshot = await fetchAccountSnapshot(liveSession.adapter, true);
    return res.json({ ok: true, connection: exchangeSessionManager.publicState(liveSession), snapshot });
  } catch (error) {
    return accountRouteError(res, error, 'portfolio_sync_failed');
  }
});



/**
 * View-model endpoint for the visual workspace pages. The server normalizes
 * Demo and Live exchange payloads into one stable contract so the UI never
 * needs to guess KuCoin field names or fabricate missing values.
 */
app.get('/api/account/workspace', async (req, res) => {
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  try {
    if (requestedAccountMode(req) === 'demo') {
      const demoSession = ensureDemoSession(req);
      res.setHeader('Set-Cookie', accountCookies(req, 'demo', demoSession.id));
      const snapshot = await demoAccountManager.snapshot(demoSession);
      return res.json({
        ok: true,
        connection: demoAccountManager.publicState(demoSession, liveSession),
        snapshot,
        insights: buildWorkspaceInsights(snapshot),
        reconciliation: liveSession
          ? liveSession.intentStore.reconciliationSummaryForApiKey(liveSession.apiKeyHint)
          : null,
      });
    }
    if (!liveSession) return res.status(401).json({ ok: false, error: 'exchange_not_connected', state: 'locked' });
    const snapshot = await fetchAccountSnapshot(liveSession.adapter, true);
    return res.json({
      ok: true,
      connection: exchangeSessionManager.publicState(liveSession),
      snapshot,
      insights: buildWorkspaceInsights(snapshot),
      reconciliation: liveSession.intentStore.reconciliationSummaryForApiKey(liveSession.apiKeyHint),
    });
  } catch (error) {
    return accountRouteError(res, error, 'workspace_sync_failed');
  }
});

app.post('/api/account/orders/preview', async (req, res) => {
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  if (requestedAccountMode(req) === 'demo') {
    const demoSession = ensureDemoSession(req);
    res.setHeader('Set-Cookie', accountCookies(req, 'demo', demoSession.id));
    try {
      const preview = await demoAccountManager.preview(demoSession, req.body || {});
      return res.json({ ok: true, environment: 'DEMO', mode: 'demo', preview: toPublicDemoPreview(preview) });
    } catch (error) {
      return accountRouteError(res, error, 'demo_order_preview_failed');
    }
  }
  if (!liveSession) return res.status(401).json({ ok: false, error: 'exchange_not_connected', state: 'locked' });
  try {
    const preview = await previewLiveOrder(liveSession, req.body || {});
    return res.json({ ok: true, environment: 'LIVE', preview: toPublicPreview(preview) });
  } catch (error) {
    return accountRouteError(res, error, 'order_preview_failed');
  }
});

app.post('/api/account/orders', async (req, res) => {
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  if (requestedAccountMode(req) === 'demo') {
    const demoSession = ensureDemoSession(req);
    try {
      const result = await demoAccountManager.submit(
        demoSession,
        String(req.body?.previewId || ''),
        String(req.body?.confirmation || ''),
      );
      return res.status(201).json(result);
    } catch (error) {
      return accountRouteError(res, error, 'demo_order_submission_failed');
    }
  }
  if (!liveSession) return res.status(401).json({ ok: false, error: 'exchange_not_connected', state: 'locked' });
  try {
    const result = await submitPreviewedLiveOrder(
      liveSession,
      String(req.body?.previewId || ''),
      String(req.body?.confirmation || ''),
    );
    return res.status(201).json(result);
  } catch (error) {
    return accountRouteError(res, error, 'live_order_submission_failed');
  }
});

app.post('/api/account/orders/:id/cancel', async (req, res) => {
  const orderId = String(req.params.id || '').trim();
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(orderId)) return res.status(422).json({ ok: false, error: 'invalid_order_id' });
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  if (requestedAccountMode(req) === 'demo') {
    const demoSession = ensureDemoSession(req);
    try { return res.json(demoAccountManager.cancel(demoSession, orderId)); }
    catch (error) { return accountRouteError(res, error, 'demo_order_cancel_failed'); }
  }
  if (!liveSession) return res.status(401).json({ ok: false, error: 'exchange_not_connected', state: 'locked' });
  if (!liveSession.executionArmed) return res.status(403).json({ ok: false, error: 'execution_not_armed' });
  try {
    const exchangeResponse = await liveSession.adapter.cancel(orderId);
    return res.json({ ok: true, environment: 'LIVE', orderId, exchangeResponse });
  } catch (error) {
    return accountRouteError(res, error, 'live_order_cancel_failed');
  }
});

/** Server-owned execution truth. This intentionally exposes readiness, not order capability. */
let testnetOrderStore: TestnetOrderStore | null = null;
let validationRecordStore: ValidationRecordStore | null = null;
let testnetReconciliationState: { status: 'NOT_CONFIGURED' | 'SYNCED' | 'DEGRADED'; lastRunAt: string | null; reason: string | null } = { status: 'NOT_CONFIGURED', lastRunAt: null, reason: null };
const testnetStore = () => {
  const storePath = (process.env.APEX_TESTNET_ORDER_STORE_PATH || '').trim();
  if (!storePath) return null;
  if (!testnetOrderStore) testnetOrderStore = new TestnetOrderStore(storePath);
  return testnetOrderStore;
};
const testnetAdapter = () => {
  const credentials = loadTestnetCredentials();
  return credentials ? new KuCoinFuturesTestnetAdapter(credentials) : null;
};
const validationStore = () => {
  const storePath = (process.env.APEX_VALIDATION_RECORD_STORE_PATH || '').trim();
  if (!storePath) return null;
  if (!validationRecordStore) validationRecordStore = new ValidationRecordStore(storePath);
  return validationRecordStore;
};
const validationAdapter = () => {
  const credentials = loadValidationCredentials();
  return credentials ? new KuCoinFuturesTestnetAdapter(credentials) : null;
};
const validationConfigured = () => ({
  configured: Boolean(validationAdapter() && validationStore()),
  missing: [!loadValidationCredentials() ? 'server-side KuCoin Validation credentials' : null, !(process.env.APEX_VALIDATION_RECORD_STORE_PATH || '').trim() ? 'durable Validation record store path' : null].filter(Boolean),
});
const mapTestnetStatus = (payload: any): TestnetOrderStatus => {
  if (payload?.isActive === true) return Number(payload.dealSize || 0) > 0 ? 'PARTIALLY_FILLED' : 'ACKNOWLEDGED';
  if (payload?.cancelExist === true) return 'CANCELLED';
  if (Number(payload?.dealSize || 0) >= Number(payload?.size || Infinity)) return 'FILLED';
  return 'UNKNOWN';
};
const normalizeTestnetFills = (payload: unknown, record: TestnetOrderRecord): TestnetFillRecord[] => {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.items)
      ? (payload as any).items
      : Array.isArray((payload as any)?.data?.items)
        ? (payload as any).data.items
        : [];
  const rows = source.filter((item: any) => {
    const orderId = String(item?.orderId || item?.order_id || '');
    const clientOid = String(item?.clientOid || item?.clientOrderId || '');
    return (record.exchangeOrderId && orderId === record.exchangeOrderId) || clientOid === record.clientOid;
  });
  return rows.map((item: any, index: number) => ({
    id: String(item?.tradeId || item?.id || `${record.clientOid}-${index}`),
    exchangeOrderId: String(item?.orderId || item?.order_id || record.exchangeOrderId || '') || null,
    clientOid: String(item?.clientOid || item?.clientOrderId || record.clientOid || '') || null,
    quantity: Math.max(0, Number(item?.size ?? item?.dealSize ?? item?.quantity ?? 0)),
    price: Math.max(0, Number(item?.price ?? item?.dealPrice ?? 0)),
    fee: Number.isFinite(Number(item?.fee)) ? Number(item.fee) : null,
    feeCurrency: String(item?.feeCurrency || item?.feeCurrencyCode || '') || null,
    timestamp: Number.isFinite(Number(item?.tradeTime ?? item?.createdAt ?? item?.ts)) ? Number(item?.tradeTime ?? item?.createdAt ?? item?.ts) : null,
  })).filter((fill: TestnetFillRecord) => fill.quantity > 0 && fill.price > 0);
};
const reconcileTestnetOrder = async (record: TestnetOrderRecord) => {
  const adapter = testnetAdapter();
  const store = testnetStore();
  if (!adapter || !store) return null;
  store.update(record.id, { status: 'RECONCILING', lastReconciledAt: new Date().toISOString(), reconciliationAttempts: (record.reconciliationAttempts || 0) + 1 });
  try {
    const remote = await adapter.orderByClientOid(record.clientOid) as any;
    const exchangeOrderId = String(remote?.id || record.exchangeOrderId || '') || null;
    const enrichedRecord = { ...record, exchangeOrderId };
    let fills: TestnetFillRecord[] = record.fills ?? [];
    try { fills = normalizeTestnetFills(await adapter.recentTrades(), enrichedRecord); } catch { /* Order state remains authoritative if fill history is temporarily unavailable. */ }
    const fillQuantity = fills.reduce((sum, fill) => sum + fill.quantity, 0);
    const remoteQuantity = Math.max(0, Number(remote?.dealSize || 0));
    const executedQuantity = Math.min(record.quantity, Math.max(fillQuantity, remoteQuantity));
    const fillNotional = fills.reduce((sum, fill) => sum + fill.quantity * fill.price, 0);
    const remoteAverage = Number(remote?.dealFunds || 0) > 0 && remoteQuantity > 0 ? Number(remote.dealFunds) / remoteQuantity : null;
    const now = new Date().toISOString();
    return store.update(record.id, { status: mapTestnetStatus(remote), exchangeOrderId, exchangeResponse: remote && typeof remote === 'object' ? remote : null, lastReconciledAt: now, lastSuccessfulReconciliationAt: now, reconciliationError: null, executedQuantity, remainingQuantity: Math.max(0, record.quantity - executedQuantity), averageFillPrice: fillQuantity > 0 ? fillNotional / fillQuantity : remoteAverage, fills, exchangeStateMatches: true, reason: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'reconciliation_failed';
    testnetReconciliationState = { status: 'DEGRADED', lastRunAt: new Date().toISOString(), reason: message };
    return store.update(record.id, { status: 'UNKNOWN', lastReconciledAt: new Date().toISOString(), reconciliationError: message, exchangeStateMatches: false, reason: message });
  }
};

/**
 * Authoritative execution-capability snapshot. Keep namespace readiness distinct
 * from the verified-account live route so operators never mistake testnet state
 * for application-global live availability.
 */
app.get('/api/execution/readiness', (req, res) => {
  const testnet = getTestnetReadiness();
  const liveSession = exchangeSessionManager.get(exchangeSessionId(req));
  const live = {
    available: Boolean(liveSession),
    verifiedSession: Boolean(liveSession),
    executionArmed: liveSession?.executionArmed === true,
    mode: 'MANUAL' as const,
    autonomousExecutionAvailable: false as const,
    previewRoute: '/api/account/orders/preview' as const,
    submitRoute: '/api/account/orders' as const,
    requiresOrderPreview: true as const,
    requiresExplicitConfirmation: true as const,
  };
  return res.json({
    ok: true,
    ...testnet,
    capabilitiesVersion: 'execution_capabilities_v2',
    paper: { available: true, autonomousExecutionAvailable: false as const },
    testnet,
    live,
    validation: validationConfigured(),
    reconciliation: testnetReconciliationState,
    risk: loadTestnetRiskConfig(),
  });
});

/** Readiness deliberately uses the real Futures API only for read-only authentication checks. */
app.get('/api/execution/validation/readiness', async (_req, res) => {
  const adapter = validationAdapter(); const store = validationStore();
  if (!adapter || !store) return res.status(503).json({ ok: false, environment: 'VALIDATION', error: 'validation_not_configured', ...validationConfigured() });
  try {
    const [serverTime, account, contract, ticker] = await Promise.all([adapter.serverTime(), adapter.accountOverview(), adapter.contract('XBTUSDTM'), adapter.ticker('XBTUSDTM')]);
    if (!contract || !ticker) throw new Error('validation_contract_or_ticker_unavailable');
    return res.json({ ok: true, environment: 'VALIDATION', serverTime, availableMargin: Number((account as any)?.availableBalance ?? 0), store: 'WRITABLE', message: 'KuCoin Validation is ready. Requests use /api/v1/orders/test and do not enter the matching engine.' });
  } catch (error) { return res.status(503).json({ ok: false, environment: 'VALIDATION', error: 'validation_readiness_failed', message: error instanceof Error ? error.message : 'unknown_error' }); }
});

app.get('/api/execution/validation/history', (_req, res) => {
  const store = validationStore();
  if (!store) return res.status(503).json({ ok: false, error: 'validation_not_configured', ...validationConfigured() });
  return res.json({ ok: true, environment: 'VALIDATION', records: store.all() });
});

/** Validation route is deliberately separate from Testnet and never calls adapter.submit(). */
app.post('/api/execution/validation/orders', async (req, res) => {
  const adapter = validationAdapter(); const store = validationStore();
  const input = req.body as ManualTestnetOrderRequest;
  if (!adapter || !store) return res.status(503).json({ ok: false, error: 'validation_not_configured', ...validationConfigured() });
  if (!input || (input as any).environment !== 'VALIDATION' || !['LONG', 'SHORT'].includes(input.intent) || !['market', 'limit'].includes(input.type)) return res.status(400).json({ ok: false, error: 'invalid_validation_request' });
  const clientOid = (input.clientOid || crypto.randomUUID()).trim();
  if (store.findByClientOid(clientOid)) return res.status(409).json({ ok: false, error: 'duplicate_client_order_id' });
  const now = new Date().toISOString(); const symbol = toKuCoinFuturesSymbol(String(input.symbol || ''));
  const record: ValidationRecord = { id: crypto.randomUUID(), environment: 'VALIDATION', clientOid, createdAt: now, updatedAt: now, symbol, side: input.intent === 'LONG' ? 'buy' : 'sell', intent: input.intent, type: input.type, quantity: Number(input.quantity), price: input.type === 'limit' ? Number(input.price) : null, estimatedNotional: null, status: 'VALIDATING_LOCALLY', riskDecision: 'PENDING', kucoinCode: null, response: null, errorCode: null, reason: null };
  store.create(record);
  try {
    const [contractPayload, accountPayload, ordersPayload, tickerPayload] = await Promise.all([adapter.contract(symbol), adapter.accountOverview(), adapter.openOrders(), adapter.ticker(symbol)]);
    const contract = contractPayload as any;
    const rules: ContractRules = { symbol, status: String(contract?.status || ''), lotSize: Number(contract?.lotSize || 1), tickSize: Number(contract?.tickSize || 0), multiplier: Number(contract?.multiplier || 0), minQuantity: Number(contract?.minOrderSize || contract?.minSize || 0) || undefined, minNotional: Number(contract?.minNotional || 0) || undefined };
    const availableMargin = Number((accountPayload as any)?.availableBalance ?? 0); const marketPrice = Number((tickerPayload as any)?.price ?? 0); const remoteOpen = Array.isArray((ordersPayload as any)?.items) ? (ordersPayload as any).items.length : 0;
    const decision = evaluateManualTestnetOrder({ ...input, environment: 'TESTNET', clientOid, symbol }, rules, availableMargin, remoteOpen, loadTestnetRiskConfig(), marketPrice);
    if (!decision.ok) { const rejected = store.update(record.id, { status: 'RISK_REJECTED', riskDecision: 'REJECTED', reason: decision.reason, errorCode: decision.reason, estimatedNotional: 'notional' in decision ? decision.notional ?? null : null }); return res.status(422).json({ ok: false, error: 'risk_rejected', record: rejected }); }
    store.update(record.id, { status: 'SUBMITTING_VALIDATION', riskDecision: 'APPROVED', estimatedNotional: decision.notional });
    try { const response = await adapter.validateOrder({ clientOid, symbol, side: record.side, type: record.type, quantity: record.quantity, price: record.price }); const validated = store.update(record.id, { status: 'VALIDATED', response: response && typeof response === 'object' ? response as Record<string, unknown> : {}, kucoinCode: '200000', reason: 'Validated by KuCoin; not submitted to the matching engine.' }); return res.status(201).json({ ok: true, environment: 'VALIDATION', message: 'KuCoin validation accepted. No order was executed.', record: validated }); }
    catch (error) { const message = error instanceof Error ? error.message : 'validation_failed'; const uncertain = /timeout|abort|network/i.test(message); const updated = store.update(record.id, { status: uncertain ? 'VALIDATION_UNKNOWN' : 'EXCHANGE_REJECTED', errorCode: uncertain ? 'validation_unknown' : 'kucoin_validation_rejected', reason: message }); return res.status(uncertain ? 202 : 422).json({ ok: false, error: updated?.errorCode, record: updated }); }
  } catch (error) { const message = error instanceof Error ? error.message : 'validation_preflight_failed'; const updated = store.update(record.id, { status: 'VALIDATION_FAILED', riskDecision: 'REJECTED', errorCode: 'validation_preflight_failed', reason: message }); return res.status(503).json({ ok: false, error: 'validation_preflight_failed', record: updated }); }
});

app.get('/api/execution/testnet/account', async (_req, res) => {
  const readiness = getTestnetReadiness();
  const adapter = testnetAdapter();
  if (readiness.state !== 'READY' || !adapter) return res.status(503).json({ ok: false, error: 'testnet_not_ready', readiness });
  try {
    const [serverTime, account, positions, openOrders] = await Promise.all([adapter.serverTime(), adapter.accountOverview(), adapter.positions(), adapter.openOrders()]);
    return res.json({ ok: true, environment: 'TESTNET', serverTime, account, positions, openOrders, reconciledAt: new Date().toISOString() });
  } catch (error) {
    return res.status(503).json({ ok: false, error: 'testnet_account_sync_failed', message: error instanceof Error ? error.message : 'unknown_error' });
  }
});

app.get('/api/execution/testnet/orders', (_req, res) => {
  const readiness = getTestnetReadiness();
  const store = testnetStore();
  if (!store) return res.status(503).json({ ok: false, error: 'testnet_not_ready', readiness });
  return res.json({ ok: true, environment: 'TESTNET', orders: store.all() });
});

const handleManualTestnetOrder = async (req: express.Request, res: express.Response, boundPlan: TradePlan | null = null) => {
  const readiness = getTestnetReadiness();
  const adapter = testnetAdapter();
  const store = testnetStore();
  if (readiness.state !== 'READY' || !adapter || !store) return res.status(503).json({ ok: false, error: 'testnet_not_ready', readiness });
  const input = req.body as ManualTestnetOrderRequest;
  if (!input || input.environment !== 'TESTNET' || !['LONG', 'SHORT'].includes(input.intent) || !['market', 'limit'].includes(input.type)) return res.status(400).json({ ok: false, error: 'invalid_manual_testnet_order' });
  const clientOid = (input.clientOid || crypto.randomUUID()).trim();
  const duplicate = store.findByClientOid(clientOid);
  if (duplicate) return res.status(409).json({ ok: false, error: 'duplicate_client_order_id', order: duplicate });
  const now = new Date().toISOString();
  const record: TestnetOrderRecord = { id: crypto.randomUUID(), environment: 'TESTNET', symbol: toKuCoinFuturesSymbol(String(input.symbol || '')), side: input.intent === 'LONG' ? 'buy' : 'sell', intent: input.intent, type: input.type, quantity: Number(input.quantity), price: input.type === 'limit' ? Number(input.price) : null, clientOid, exchangeOrderId: null, status: 'VALIDATING', submittedAt: null, createdAt: now, updatedAt: now, lastReconciledAt: null, riskDecision: 'PENDING', reason: null, exchangeResponse: null, fills: [], protectiveOrderStatus: 'NOT_REQUESTED' };
  store.create(record);
  const lifecycle = boundPlan ? liquidityHunterExecutionLifecycles.create({ executionId: record.id, expiresAt: boundPlan.expiresAt, clientOrderId: clientOid }) : null;
  try {
    const [contractPayload, accountPayload, ordersPayload, tickerPayload, positionsPayload] = await Promise.all([adapter.contract(record.symbol), adapter.accountOverview(), adapter.openOrders(), adapter.ticker(record.symbol), adapter.positions()]);
    const contract = contractPayload as any;
    const rules: ContractRules = { symbol: record.symbol, status: String(contract?.status || ''), lotSize: Number(contract?.lotSize || 1), tickSize: Number(contract?.tickSize || 0), multiplier: Number(contract?.multiplier || 0), minQuantity: Number(contract?.minOrderSize || contract?.minSize || 0) || undefined, minNotional: Number(contract?.minNotional || 0) || undefined };
    const executionInput: ManualTestnetOrderRequest = boundPlan && rules.multiplier > 0
      ? { ...input, quantity: alignQuantityDownToLot(Number(input.quantity) / rules.multiplier, rules.lotSize) }
      : input;
    if (boundPlan) store.update(record.id, { quantity: executionInput.quantity });
    const availableMargin = Number((accountPayload as any)?.availableBalance ?? 0);
    const exchangeOpenOrders = Array.isArray((ordersPayload as any)?.items) ? (ordersPayload as any).items.length : 0;
    const marketPrice = Number((tickerPayload as any)?.price ?? 0);
    const decision = evaluateManualTestnetOrder({ ...executionInput, clientOid, symbol: record.symbol }, rules, availableMargin, Math.max(store.openCount(), exchangeOpenOrders), loadTestnetRiskConfig(), marketPrice);
    if (!decision.ok) {
      if (lifecycle) liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'REJECTED', reason: decision.reason });
      const rejected = store.update(record.id, { status: 'RISK_REJECTED', riskDecision: 'REJECTED', reason: decision.reason });
      return res.status(422).json({ ok: false, error: 'risk_rejected', reason: decision.reason, order: rejected });
    }
    const positions = Array.isArray((positionsPayload as any)?.items) ? (positionsPayload as any).items : Array.isArray(positionsPayload) ? positionsPayload as any[] : [];
    const equity = Number((accountPayload as any)?.accountEquity ?? (accountPayload as any)?.equity ?? availableMargin);
    const positionNotional = (position: any) => Math.abs(Number(position?.currentQty ?? position?.size ?? 0)) * Number(position?.multiplier ?? 1) * Number(position?.markPrice ?? position?.avgEntryPrice ?? 0);
    const centralRisk = evaluateRiskGovernor({
      order: {
        symbol: record.symbol,
        direction: record.intent,
        quantity: record.quantity,
        entryPrice: record.type === 'limit' ? Number(record.price) : marketPrice,
        notionalUsd: decision.notional,
        contractMultiplier: rules.multiplier,
        leverage: 1,
        reduceOnly: false,
        exchange: 'kucoin-testnet',
        strategy: boundPlan ? 'liquidity-hunter-manual-testnet' : 'manual-testnet',
      },
      account: { equityUsd: equity, availableMarginUsd: availableMargin, timestamp: Date.now() },
      portfolio: {
        openPositionCount: positions.filter((position: any) => Math.abs(Number(position?.currentQty ?? position?.size ?? 0)) > 0).length,
        totalOpenRiskUsd: null,
        symbolExposureUsd: positions.filter((position: any) => String(position?.symbol || '') === record.symbol).reduce((sum: number, position: any) => sum + positionNotional(position), 0),
        correlatedExposureUsd: positions.reduce((sum: number, position: any) => sum + positionNotional(position), 0),
        dailyPnlUsd: null,
        weeklyPnlUsd: null,
        drawdownPct: null,
        consecutiveLosses: null,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'MANUAL',
      plan: boundPlan,
      policy: loadRiskGovernorPolicy(),
    });
    if (centralRisk.decision === 'REJECTED' || centralRisk.decision === 'DEFERRED') {
      if (lifecycle) liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'REJECTED', reason: centralRisk.reasons.join(' ') || centralRisk.decision });
      const rejected = store.update(record.id, { status: 'RISK_REJECTED', riskDecision: 'REJECTED', reason: centralRisk.reasons.join(' ') || centralRisk.decision });
      return res.status(422).json({ ok: false, error: 'risk_governor_rejected', riskDecision: centralRisk, order: rejected });
    }
    if (lifecycle) {
      liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'RISK_AUTHORIZED', reason: 'central_risk_governor_approved' });
      liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'AWAITING_MANUAL_CONFIRMATION', reason: 'explicit_manual_confirmation_received' });
    }
    // H1 fix: testnet must submit the Risk Governor-approved (possibly reduced) quantity,
    // never the originally requested record.quantity, and must recheck after lot-size rounding.
    let approvedQuantity = record.quantity;
    let finalRisk = centralRisk;
    if (centralRisk.decision === 'APPROVED_REDUCED') {
      approvedQuantity = alignQuantityDownToLot(centralRisk.approvedQuantity, rules.lotSize);
      if (approvedQuantity <= 0) {
        const rejected = store.update(record.id, { status: 'RISK_REJECTED', riskDecision: 'REJECTED', reason: 'risk_governor_reduced_below_minimum' });
        return res.status(422).json({ ok: false, error: 'risk_governor_reduced_below_minimum', order: rejected });
      }
      const referencePrice = record.type === 'limit' ? Number(record.price) : marketPrice;
      finalRisk = evaluateRiskGovernor({
        order: {
          symbol: record.symbol,
          direction: record.intent,
          quantity: approvedQuantity,
          entryPrice: referencePrice,
          notionalUsd: approvedQuantity * rules.multiplier * referencePrice,
          contractMultiplier: rules.multiplier,
          leverage: 1,
          reduceOnly: false,
          exchange: 'kucoin-testnet',
          strategy: boundPlan ? 'liquidity-hunter-manual-testnet' : 'manual-testnet',
        },
        account: { equityUsd: equity, availableMarginUsd: availableMargin, timestamp: Date.now() },
        portfolio: {
          openPositionCount: positions.filter((position: any) => Math.abs(Number(position?.currentQty ?? position?.size ?? 0)) > 0).length,
          totalOpenRiskUsd: null,
          symbolExposureUsd: positions.filter((position: any) => String(position?.symbol || '') === record.symbol).reduce((sum: number, position: any) => sum + positionNotional(position), 0),
          correlatedExposureUsd: positions.reduce((sum: number, position: any) => sum + positionNotional(position), 0),
          dailyPnlUsd: null,
          weeklyPnlUsd: null,
          drawdownPct: null,
          consecutiveLosses: null,
        },
        market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
        executionMode: 'MANUAL',
        plan: boundPlan,
        policy: loadRiskGovernorPolicy(),
      });
      if (finalRisk.decision === 'REJECTED' || finalRisk.decision === 'DEFERRED') {
        if (lifecycle) liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'REJECTED', reason: finalRisk.reasons.join(' ') || finalRisk.decision });
        const rejected = store.update(record.id, { status: 'RISK_REJECTED', riskDecision: 'REJECTED', reason: finalRisk.reasons.join(' ') || finalRisk.decision });
        return res.status(422).json({ ok: false, error: 'risk_governor_recheck_failed', riskDecision: finalRisk, order: rejected });
      }
    }
    if (lifecycle) liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'SUBMITTING', reason: 'manual_testnet_submission_started' });
    store.update(record.id, { status: 'SUBMITTING', riskDecision: 'APPROVED', quantity: approvedQuantity, reason: finalRisk.reasons.join(' ') || null });
    try {
      const submitted = boundPlan
        ? await adapter.submitLiveOrder({ clientOid, symbol: record.symbol, side: record.side, type: record.type, quantity: approvedQuantity, price: record.price, leverage: boundPlan.leverage, marginMode: 'ISOLATED', timeInForce: 'GTC', reduceOnly: false, takeProfitPrice: boundPlan.takeProfitTargets[0], stopLossPrice: boundPlan.stopLoss })
        : await adapter.submit({ clientOid, symbol: record.symbol, side: record.side, type: record.type, quantity: approvedQuantity, price: record.price });
      const exchangeOrderId = String((submitted as any)?.orderId || (submitted as any)?.id || '') || null;
      const acknowledged = store.update(record.id, { status: 'ACKNOWLEDGED', exchangeOrderId, submittedAt: new Date().toISOString(), exchangeResponse: submitted && typeof submitted === 'object' ? submitted as Record<string, unknown> : null, protectiveOrderStatus: boundPlan ? 'ATTACHED_UNVERIFIED' : 'NOT_REQUESTED' });
      if (lifecycle) liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'ACKNOWLEDGED', reason: 'exchange_acknowledged', exchangeOrderId: exchangeOrderId ?? undefined });
      const reconciled = acknowledged ? await reconcileTestnetOrder(acknowledged) : null;
      let protection = null;
      if (boundPlan && reconciled && (reconciled.executedQuantity ?? 0) > 0 && (reconciled.averageFillPrice ?? 0) > 0) {
        const filledState = (reconciled.executedQuantity ?? 0) >= reconciled.quantity ? 'FILLED' : 'PARTIALLY_FILLED';
        liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle!.executionId, nextState: filledState, reason: 'reconciled_testnet_fill' });
        protection = liquidityHunterProtectionCoordinator.create({ executionId: lifecycle!.executionId, symbol: boundPlan.symbol, direction: boundPlan.direction, filledQuantity: reconciled.executedQuantity!, averageFillPrice: reconciled.averageFillPrice!, stopLoss: boundPlan.stopLoss, targets: boundPlan.takeProfitTargets });
        if (filledState === 'FILLED') liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle!.executionId, nextState: 'PROTECTING', reason: 'exchange_attached_protection_requested' });
      }
      return res.status(201).json({ ok: true, order: reconciled ?? acknowledged, lifecycle: lifecycle ? liquidityHunterExecutionLifecycles.snapshot(lifecycle.executionId) : null, protection });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'exchange_submission_failed';
      if (lifecycle) liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'UNKNOWN', reason: message });
      const reconciling = store.update(record.id, { status: 'RECONCILING', submittedAt: new Date().toISOString(), reason: message });
      if (lifecycle) liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'RECONCILING', reason: 'exchange_reconciliation_started' });
      const reconciled = reconciling ? await reconcileTestnetOrder(reconciling) : null;
      if (reconciled && reconciled.status !== 'UNKNOWN') {
        if (lifecycle) {
          const nextState = reconciled.status === 'FILLED' ? 'FILLED' : reconciled.status === 'PARTIALLY_FILLED' ? 'PARTIALLY_FILLED' : reconciled.status === 'CANCELLED' ? 'CANCELLED' : reconciled.status === 'REJECTED' ? 'REJECTED' : 'ACKNOWLEDGED';
          liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState, reason: 'exchange_reconciliation_resolved', exchangeOrderId: reconciled.exchangeOrderId ?? undefined });
        }
        return res.status(201).json({ ok: true, reconciledAfterSubmissionError: true, order: reconciled });
      }
      const definitiveClientRejection = /invalid|parameter|insufficient|not allowed|forbidden|minimum|maximum|size|price|symbol|risk limit/i.test(message)
        && !/timeout|abort|network|server|gateway|http_5\d\d/i.test(message);
      const finalOrder = store.update(record.id, {
        status: definitiveClientRejection ? 'REJECTED' : 'UNKNOWN',
        reason: message,
        reconciliationError: reconciled?.reconciliationError ?? message,
      });
      return res.status(definitiveClientRejection ? 422 : 202).json({
        ok: false,
        error: definitiveClientRejection ? 'exchange_rejected_verified_client_error' : 'submission_unknown_reconciliation_required',
        order: finalOrder,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'validation_sync_failed';
    if (lifecycle) {
      const current = liquidityHunterExecutionLifecycles.snapshot(lifecycle.executionId);
      if (current && ['CREATED', 'RISK_AUTHORIZED', 'AWAITING_MANUAL_CONFIRMATION'].includes(current.state)) liquidityHunterExecutionLifecycles.transition({ executionId: lifecycle.executionId, nextState: 'REJECTED', reason: message });
    }
    const updated = store.update(record.id, { status: 'REJECTED', riskDecision: 'REJECTED', reason: message });
    return res.status(503).json({ ok: false, error: 'testnet_pretrade_sync_failed', order: updated });
  }
};

app.post('/api/execution/testnet/orders', (req, res) => handleManualTestnetOrder(req, res));

app.post('/api/liquidity-hunter/manual-testnet/:setupId/submit', async (req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime?.flags.liquidityHunterEnabled || !runtime.flags.testnetCanaryEnabled) return res.status(409).json({ error: 'liquidity_hunter_testnet_canary_disabled' });
  if (String(req.body?.confirmation || '') !== 'CONFIRM_LIQUIDITY_HUNTER_TESTNET') return res.status(422).json({ error: 'explicit_liquidity_hunter_testnet_confirmation_required' });
  const authorization = liquidityHunterManualCanaryRegistry.get(String(req.params.setupId || ''));
  if (!authorization?.tradePlan || !authorization.risk || !['APPROVED', 'APPROVED_REDUCED'].includes(authorization.risk.decision)) return res.status(409).json({ error: 'liquidity_hunter_risk_authorized_plan_unavailable' });
  const plan = authorization.tradePlan;
  req.body = { environment: 'TESTNET', symbol: plan.symbol, intent: plan.direction, type: plan.entryType.toLowerCase(), quantity: authorization.risk.approvedQuantity || plan.quantity, price: plan.entryPrice, clientOid: `lh-${authorization.liquidityHunter.setupId}` };
  return handleManualTestnetOrder(req, res, plan);
});

app.post('/api/execution/testnet/orders/:id/cancel', async (req, res) => {
  const readiness = getTestnetReadiness();
  const adapter = testnetAdapter();
  const store = testnetStore();
  const record = store?.all().find((item) => item.id === req.params.id) ?? null;
  if (readiness.state !== 'READY' || !adapter || !store || !record) return res.status(503).json({ ok: false, error: 'testnet_order_unavailable', readiness });
  if (!record.exchangeOrderId) return res.status(409).json({ ok: false, error: 'exchange_order_id_unavailable', order: record });
  store.update(record.id, { status: 'CANCEL_PENDING' });
  try { await adapter.cancel(record.exchangeOrderId); const reconciled = await reconcileTestnetOrder(record); return res.json({ ok: Boolean(reconciled?.status === 'CANCELLED'), error: reconciled?.status === 'CANCELLED' ? undefined : 'cancel_reconciling', order: reconciled }); }
  catch (error) { const message = error instanceof Error ? error.message : 'cancel_failed'; const uncertain = /timeout|abort|network/i.test(message); return res.status(uncertain ? 202 : 502).json({ ok: false, error: uncertain ? 'cancel_unknown_reconciling' : 'cancel_rejected', order: store.update(record.id, { status: uncertain ? 'UNKNOWN' : 'REJECTED', reason: message }) }); }
});

/**
 * Explicit namespace fence. It must not claim application-global live absence:
 * verified manual Live KuCoin orders intentionally live under /api/account/orders.
 */
app.use('/api/execution', (req, res) => res.status(503).json({
  ok: false,
  error: 'execution_namespace_route_unavailable',
  requestedEnvironment: typeof req.body?.environment === 'string' ? req.body.environment.toUpperCase() : 'UNSPECIFIED',
  activeEnvironment: getTestnetReadiness().activeEnvironment,
  message: 'This /api/execution namespace exposes readiness, validation, and manual-testnet surfaces only. Verified manual Live KuCoin preview/submission is served under /api/account/orders; autonomous live execution is unavailable.',
  readiness: getTestnetReadiness(),
}));

registerDecisionMemoryRoutes(app, decisionMemoryMirror);

app.get('/api/operations/trading-modules', (_req, res) => {
  return res.json({ ok: true, modules: getTradingModuleRegistry(), generatedAt: new Date().toISOString() });
});

app.get('/api/operations/adaptive-thresholds', (_req, res) => {
  return res.json({ ok: true, governance: adaptiveThresholdGovernance.snapshot() });
});

app.get('/api/operations/adaptive-thresholds/fast-shadow', (req, res) => {
  if (!decisionMemoryMirror) return res.status(503).json({ ok: false, error: 'mirror_disabled' });
  const requestedMinSamples = Number(req.query.minSamples);
  const minSamples = Number.isFinite(requestedMinSamples)
    ? Math.max(8, Math.min(500, Math.floor(requestedMinSamples)))
    : undefined;
  const recommendation = buildFastAdaptiveShadowRecommendation(
    adaptiveThresholdGovernance.getActiveConfig(),
    decisionMemoryMirror.exportAll(),
    { minSamples },
  );
  return res.json({
    ok: true,
    recommendation,
    applied: false,
    note: 'Shadow-only recommendation. No scanner configuration or order path was changed.',
  });
});

app.get('/api/operations/market-streaming', (_req, res) => {
  const enabled = ['1', 'true', 'yes', 'on', 'enabled'].includes(
    String(process.env.APEX_KUCOIN_STREAMING_ENABLED || '').trim().toLowerCase(),
  );
  return res.json({
    ok: true,
    kucoinPublicStreaming: {
      enabled,
      defaultEnabled: false,
      mode: 'browser_public_websocket',
      sequenceValidation: true,
      gapPolicy: 'fail_closed_and_rest_reseed',
      executionDependency: false,
    },
  });
});


app.get('/api/operations/liquidity-hunter', (_req, res) => {
  return res.json({
    ok: true,
    foundation: getLiquidityHunterOperationsSnapshot(),
    readPlane: liquidityHunterWsGateway?.snapshot() ?? { clients: 0, sequence: 0, enabled: false, intervalMs: 100 },
    edges: getLiquidityHunterEdgeCatalog(),
    note: 'Core strategy evaluation and the optional websocket read plane are shadow/read-only. No automatic threshold promotion and no execution wiring.',
  });
});

app.get('/api/liquidity-hunter/paper-canary', (req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, Math.floor(requestedLimit))) : 100;
  return res.json({
    ok: true,
    paperCanary: runtime.paperCanary.snapshot(limit),
    safety: { paperOnly: true, executionDependency: false, orderSubmissionAllowed: false, autonomousLiveExecutionEnabled: false },
  });
});

app.get('/api/liquidity-hunter/state/:symbol', (req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  const evaluation = runtime.engine.latestEvaluation(symbol);
  const operations = getLiquidityHunterOperationsSnapshot();
  return res.json({
    ok: true,
    evaluation,
    view: buildLiquidityHunterViewModel({ symbol, evaluation, operations }),
    operations,
    safety: { shadowOnly: true, authoritative: false, executionAuthorized: false, autonomousLiveExecutionEnabled: false },
  });
});

app.get('/api/liquidity-hunter/world-state/:symbol', (req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  const snapshot = runtime.worldState.snapshot();
  return res.json({ ok: true, symbol, generatedAt: snapshot.generatedAt, entries: snapshot.entries.filter((row) => row.symbol === symbol) });
});

app.get('/api/liquidity-hunter/evidence/:symbol', (req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  const evaluation = runtime.engine.latestEvaluation(symbol);
  return res.json({
    ok: true, symbol, evaluationId: evaluation?.evaluationId ?? null,
    evidence: evaluation?.evidence ?? [],
    sourceAges: (evaluation?.evidence ?? []).map((row) => ({ edgeId: row.edgeId, observedAt: row.observedAt, expiresAt: row.expiresAt, ageMs: Math.max(0, Date.now() - row.observedAt), status: row.status })),
  });
});

app.get('/api/liquidity-hunter/setups', (_req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  return res.json({ ok: true, setups: runtime.engine.setupSnapshots(), durable: Boolean(runtime.setupEventLog), generatedAt: Date.now() });
});

app.get('/api/liquidity-hunter/setups/:setupId', (req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  const setupId = String(req.params.setupId || '').trim();
  const setup = runtime.engine.setupSnapshots().find((row) => row.setupId === setupId) ?? null;
  return setup ? res.json({ ok: true, setup }) : res.status(404).json({ error: 'liquidity_hunter_setup_not_found' });
});

app.get('/api/liquidity-hunter/replay-datasets', (_req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime?.eventLog) return res.json({ ok: true, datasets: [], reason: 'realtime_event_recording_disabled' });
  const read = runtime.eventLog.readAll();
  const manifest = read.events.length ? createReplayDatasetManifest(read.events) : null;
  return res.json({ ok: true, datasets: manifest ? [{ manifest, files: read.files, corruptLines: read.corruptLines }] : [], generatedAt: Date.now() });
});

app.get('/api/liquidity-hunter/replay-runs', (_req, res) => res.json({ ok: true, runs: [...liquidityHunterReplayRuns.values()] }));
app.get('/api/liquidity-hunter/replay-runs/:runId', (req, res) => {
  const run = liquidityHunterReplayRuns.get(String(req.params.runId || ''));
  return run ? res.json({ ok: true, run }) : res.status(404).json({ error: 'liquidity_hunter_replay_run_not_found' });
});

app.post('/api/liquidity-hunter/replay', async (req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime?.eventLog) return res.status(409).json({ error: 'realtime_event_recording_disabled' });
  const symbol = String(req.body?.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  const events = runtime.eventLog.readAll().events.filter((event) => event.symbol === symbol);
  if (!events.length) return res.status(409).json({ error: 'replay_dataset_empty' });
  const id = crypto.randomUUID();
  const record = { id, status: 'RUNNING' as const, createdAt: Date.now() };
  liquidityHunterReplayRuns.set(id, record);
  try {
    const result = await runLiquidityHunterEventReplay({ events, symbol, flags: runtime.flags, manifest: createReplayDatasetManifest(events) });
    liquidityHunterReplayRuns.set(id, { ...record, status: 'COMPLETED', result });
    return res.status(201).json({ ok: true, run: liquidityHunterReplayRuns.get(id) });
  } catch (error) {
    liquidityHunterReplayRuns.set(id, { ...record, status: 'FAILED', error: error instanceof Error ? error.message : String(error) });
    return res.status(422).json({ error: 'liquidity_hunter_replay_failed', run: liquidityHunterReplayRuns.get(id) });
  }
});

app.get('/api/liquidity-hunter/edge-thresholds', (_req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  return res.json({ ok: true, governance: runtime.edgeThresholdGovernance.snapshot(), automaticPromotionEnabled: false });
});

function verifyOperatorToken(req: express.Request, res: express.Response): boolean {
  if (OPERATOR_TOKEN) {
    const tokenHeader = req.headers['x-apex-operator-token'];
    const provided = typeof tokenHeader === 'string' ? tokenHeader.trim() : '';
    if (!provided || provided !== OPERATOR_TOKEN) {
      res.status(401).json({ error: 'operator_token_required' });
      return false;
    }
  }
  return true;
}

app.post('/api/liquidity-hunter/edge-thresholds/propose', (req, res) => {
  if (!verifyOperatorToken(req, res)) return;
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  try {
    const report = req.body?.report as EdgeThresholdOptimizationReport;
    const symbolClass = String(req.body?.symbolClass || '').toUpperCase() as 'BTC' | 'ETH' | 'LARGE_CAP' | 'MID_CAP' | 'LOW_LIQUIDITY';
    if (!['BTC', 'ETH', 'LARGE_CAP', 'MID_CAP', 'LOW_LIQUIDITY'].includes(symbolClass)) return res.status(400).json({ error: 'invalid_symbol_class' });
    const proposal = runtime.edgeThresholdGovernance.stage(report, { symbolClass, timeframe: String(req.body?.timeframe || 'REALTIME'), regime: String(req.body?.regime || 'ANY') });
    return res.status(201).json({ ok: true, proposal });
  } catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : 'edge_threshold_proposal_failed' }); }
});

app.post('/api/liquidity-hunter/edge-thresholds/approve', (req, res) => {
  if (!verifyOperatorToken(req, res)) return;
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  try {
    const proposalId = String(req.body?.proposalId || '');
    if (req.body?.promotionEvidence) runtime.edgeThresholdGovernance.markPaperCanaryReady(proposalId, req.body.promotionEvidence);
    return res.json({ ok: true, revision: runtime.edgeThresholdGovernance.approve(proposalId, String(req.body?.approvedBy || '')) });
  }
  catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : 'edge_threshold_approval_failed' }); }
});

app.post('/api/liquidity-hunter/edge-thresholds/reject', (req, res) => {
  if (!verifyOperatorToken(req, res)) return;
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  try { return res.json({ ok: true, proposal: runtime.edgeThresholdGovernance.reject(String(req.body?.proposalId || ''), String(req.body?.reason || 'operator_rejected')) }); }
  catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : 'edge_threshold_rejection_failed' }); }
});

app.get('/api/liquidity-hunter/manual-testnet/plans', (_req, res) => res.json({
  ok: true,
  plans: liquidityHunterManualCanaryRegistry.list(),
  safety: { manualConfirmationRequired: true, testnetOnly: true, autonomousLiveExecutionEnabled: false },
}));

async function buildLiquidityHunterShadowContext(symbol: string, priority: 'interactive' | 'background' = 'interactive') {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) throw new Error('liquidity_hunter_runtime_unavailable');

  const fundingOiBootstrapPromise = bootstrapFundingOiContext({
    symbol,
    eventBus: runtime.bus,
    seriesStore: runtime.seriesStore,
    priority,
  });
  const candleRequests = [
    ['1m', 48],
    ['5m', 36],
    ['15m', 28],
    ['4h', 12],
  ] as const;
  const candleResults = await Promise.allSettled(
    candleRequests.map(([interval, limit]) => getCandles(symbol, interval, limit, priority)),
  );
  const fundingOiBootstrap = await fundingOiBootstrapPromise.catch((error) => ({
    source: 'multi-futures-rest-context' as const,
    fundingEvents: 0,
    openInterestEvents: 0,
    available: false,
    primaryPairAvailable: false,
    sources: [],
    reasons: [error instanceof Error ? error.message : String(error)],
  }));
  const candleContext: Record<string, { source: string | null; dataState: string; count: number; error?: string }> = {};
  const candlesByInterval = new Map<string, Awaited<ReturnType<typeof getCandles>>['candles']>();
  candleResults.forEach((result, index) => {
    const [interval] = candleRequests[index];
    if (result.status === 'fulfilled') {
      candlesByInterval.set(interval, result.value.candles);
      candleContext[interval] = {
        source: result.value.source ?? null,
        dataState: result.value.dataState,
        count: result.value.candles.length,
      };
    } else {
      candleContext[interval] = {
        source: null,
        dataState: 'unavailable',
        count: 0,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  });
  const smc = adaptSmartMoneyContext({
    candles1m: candlesByInterval.get('1m'),
    candles5m: candlesByInterval.get('5m'),
    candles15m: candlesByInterval.get('15m'),
    candles4h: candlesByInterval.get('4h'),
    now: Date.now(),
  });
  const latestTrade = runtime.seriesStore.query({ symbol, type: 'TRADE', limit: 1 }).at(-1);
  const latestQuote = runtime.seriesStore.query({ symbol, type: 'QUOTE', limit: 1 }).at(-1);
  const latestTradePrice = latestTrade?.payload && typeof latestTrade.payload === 'object'
    ? Number((latestTrade.payload as Record<string, unknown>).price)
    : NaN;
  const quotePayload = latestQuote?.payload && typeof latestQuote.payload === 'object'
    ? latestQuote.payload as Record<string, unknown>
    : null;
  const bid = Number(quotePayload?.bid);
  const ask = Number(quotePayload?.ask);
  const currentPrice = Number.isFinite(latestTradePrice) && latestTradePrice > 0
    ? latestTradePrice
    : Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid
      ? (bid + ask) / 2
      : null;

  return {
    smartMoneyContext: smc.context ?? undefined,
    currentPrice,
    diagnostics: {
      smartMoney: { availability: smc.availability, reasons: smc.reasons },
      fundingOpenInterest: fundingOiBootstrap,
      candles: candleContext,
    },
  };
}

app.post('/api/liquidity-hunter/shadow/evaluate', async (req, res) => {
  const runtime = getLiquidityHunterRuntime();
  if (!runtime) return res.status(503).json({ error: 'liquidity_hunter_runtime_unavailable' });
  if (!runtime.flags.liquidityHunterEnabled) return res.status(409).json({ error: 'liquidity_hunter_disabled', shadowOnly: true });
  const symbol = String(req.body?.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(symbol)) return res.status(400).json({ error: 'invalid_symbol' });
  try {
    const context = await buildLiquidityHunterShadowContext(symbol);
    const evaluation = await runtime.engine.evaluate({
      symbol,
      smartMoneyContext: context.smartMoneyContext,
      currentPrice: context.currentPrice,
    });
    const paperCanary = context.currentPrice !== null
      ? runtime.paperCanary.capture(evaluation, context.currentPrice)
      : null;
    return res.json({
      ok: true,
      evaluation,
      paperCanary,
      context: context.diagnostics,
      safety: { shadowOnly: true, authoritative: false, executionAuthorized: false, autonomousLiveExecutionEnabled: false },
      note: 'Shadow evaluation uses server-held realtime evidence plus server-fetched public candle/funding/OI context. It cannot submit orders or promote thresholds.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'liquidity_hunter_shadow_evaluation_failed', message: error instanceof Error ? error.message : 'Evaluation failed.' });
  }
});

app.get('/api/operations/market-statistics', (req, res) => {
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(50, Math.floor(requestedLimit)))
    : 12;
  return res.json({
    ok: true,
    shadowOnly: true,
    executionDependency: false,
    symbolCount: marketStatistics.symbolCount,
    rows: marketStatistics.listSnapshots(limit),
    generatedAt: new Date().toISOString(),
  });
});

app.post('/api/operations/adaptive-thresholds/propose', (_req, res) => {
  if (!decisionMemoryMirror) return res.status(503).json({ ok: false, error: 'mirror_disabled' });
  try {
    // Defense in depth: simulated research/paper rows must never influence live
    // scanner thresholds, even if a future change routes them into this mirror.
    // Approval of any resulting proposal remains manual.
    const liveLogs = decisionMemoryMirror.exportAll().filter((row) => !isResearchOutcomeLog(row));
    const proposal = adaptiveThresholdGovernance.propose(liveLogs);
    return res.status(201).json({ ok: true, proposal, governance: adaptiveThresholdGovernance.snapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'adaptive_proposal_failed';
    const status = message.includes('insufficient') || message.includes('no_change') ? 409 : 400;
    return res.status(status).json({ ok: false, error: message, governance: adaptiveThresholdGovernance.snapshot() });
  }
});

app.post('/api/operations/adaptive-thresholds/approve', (req, res) => {
  try {
    const proposalId = typeof req.body?.proposalId === 'string' ? req.body.proposalId.trim() : '';
    if (!proposalId) return res.status(400).json({ ok: false, error: 'proposal_id_required' });
    const revision = adaptiveThresholdGovernance.approve(proposalId);
    return res.json({ ok: true, revision, governance: adaptiveThresholdGovernance.snapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'adaptive_approval_failed';
    const status = message.includes('not_found') ? 404 : message.includes('blocked') || message.includes('stale') ? 409 : 400;
    return res.status(status).json({ ok: false, error: message, governance: adaptiveThresholdGovernance.snapshot() });
  }
});

app.post('/api/operations/adaptive-thresholds/reject', (req, res) => {
  try {
    const proposalId = typeof req.body?.proposalId === 'string' ? req.body.proposalId.trim() : '';
    if (!proposalId) return res.status(400).json({ ok: false, error: 'proposal_id_required' });
    const proposal = adaptiveThresholdGovernance.reject(proposalId, String(req.body?.reason || 'operator_rejected'));
    return res.json({ ok: true, proposal, governance: adaptiveThresholdGovernance.snapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'adaptive_rejection_failed';
    return res.status(message.includes('not_found') ? 404 : 400).json({ ok: false, error: message });
  }
});

app.post('/api/operations/adaptive-thresholds/rollback', (req, res) => {
  try {
    const target = Number(req.body?.targetRevision);
    const revision = adaptiveThresholdGovernance.rollback(Number.isFinite(target) ? Math.floor(target) : undefined);
    return res.json({ ok: true, revision, governance: adaptiveThresholdGovernance.snapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'adaptive_rollback_failed';
    return res.status(message.includes('not_found') ? 404 : 400).json({ ok: false, error: message });
  }
});

app.get('/api/operations/ml-governance', (_req, res) => {
  if (!decisionMemoryMirror) return res.status(503).json({ ok: false, error: 'mirror_disabled' });
  const modelPath = (process.env.APEX_SHADOW_ML_MODEL_PATH || '').trim();
  let model: ReturnType<typeof parseShadowMlModelFile> | null = null;
  let modelError: string | null = null;
  if (modelPath) {
    try { model = parseShadowMlModelFile(JSON.parse(readFileSync(path.resolve(modelPath), 'utf8'))); }
    catch (error) { modelError = error instanceof Error ? error.message : 'model_read_failed'; }
  }
  const report = evaluateMlGovernance(decisionMemoryMirror.exportAll(), model);
  return res.json({ ok: true, modelPathConfigured: Boolean(modelPath), modelError, report });
});

app.get('/api/operations/status', (_req, res) => {
  try {
    const mlDir = path.resolve(process.cwd(), 'Doc/automation/ml_shadow');
    const adaptiveStressDir = path.resolve(process.cwd(), 'Doc/automation/adaptive_learning');
    const providerRoutingDir = path.resolve(process.cwd(), 'Doc/automation/provider_routing');
    const loadMatrix100Dir = path.resolve(process.cwd(), 'Doc/automation/load_matrix_100');
    const loadMatrixFastDir = path.resolve(process.cwd(), 'Doc/automation/load_matrix_fast_1m_5m');
    const status = buildOperationsStatus({
      providerHealth: getProviderHealthTracker().getAllHealth(),
      decisionMemoryMirrorEnabled: Boolean(decisionMemoryMirror),
      decisionMemoryStats: decisionMemoryMirror?.stats() ?? null,
      datasetSync: getDecisionMemoryDatasetDurabilityStatus(),
      mlShadowDir: mlDir,
      adaptiveStressDir,
      providerRoutingDir,
      loadMatrix100Dir,
      loadMatrixFastDir,
      readFile: (filePath: string) => {
        try {
          return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
        } catch {
          return null;
        }
      },
      fileExists: (filePath: string) => existsSync(filePath),
      liquidityHunter: getLiquidityHunterOperationsSnapshot(),
      adaptiveThresholdGovernance: (() => {
        const snapshot = adaptiveThresholdGovernance.snapshot();
        return {
          activeRevision: snapshot.active.revision,
          revisionCount: snapshot.history.length,
          proposalCount: snapshot.proposals.length,
          pendingProposalCount: snapshot.pending.length,
        };
      })(),
      marketDataFallback: getHfFallbackCycleTelemetry(),
    });
    return res.status(200).json(status);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'operations_status_read_failed';
    return res.status(200).json(createUnavailableOperationsStatus(reason));
  }
});

type ExchangeSource = "kucoin" | "binance";

type ExchangeReason =
  | "EXCHANGE_LEGAL_RESTRICTION"
  | "EXCHANGE_FORBIDDEN_OR_GEO_BLOCKED"
  | "EXCHANGE_RATE_LIMITED"
  | "EXCHANGE_UPSTREAM_ERROR"
  | "EXCHANGE_UNREACHABLE"
  | "EXCHANGE_BAD_RESPONSE"
  | "EXCHANGE_AUTH_REQUIRED";

interface ExchangeErrorPayload {
  error: true;
  reason: ExchangeReason;
  source: ExchangeSource;
  endpoint: string;
  symbol?: string;
  status?: number;
  dataSource: "unavailable";
  msg: string;
}

class ExchangeProxyError extends Error {
  constructor(
    public reason: ExchangeReason,
    public status: number,
    message: string,
    public upstreamStatus?: number
  ) {
    super(message);
  }
}


const exchangeRouteCooldowns = new Map<string, number>();

// #region debug-point C:kucoin-candle-abort-reporter
const DEBUG_TELEMETRY_ENABLED = process.env.APEX_DEBUG_TELEMETRY === 'true';
const DEBUG_SERVER_URL = "http://127.0.0.1:7777/event";
const DEBUG_SESSION_ID = "kucoin-candle-abort";
function reportDebugEvent(runId: "pre-fix" | "post-fix", hypothesisId: string, location: string, msg: string, data: Record<string, unknown>): void {
  if (!DEBUG_TELEMETRY_ENABLED) return;
  fetch(DEBUG_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId,
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

function exchangeRouteCooldownKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}:${u.searchParams.get("symbol") || ""}`;
  } catch {
    return url;
  }
}

function assertExchangeRouteNotCoolingDown(url: string): void {
  const key = exchangeRouteCooldownKey(url);
  const until = exchangeRouteCooldowns.get(key) || 0;
  if (until > Date.now()) {
    throw new ExchangeProxyError(
      "EXCHANGE_UNREACHABLE",
      503,
      "Exchange route temporarily cooling down after a transport failure"
    );
  }
  if (until) exchangeRouteCooldowns.delete(key);
}

function recordExchangeRouteTransportFailure(url: string): void {
  exchangeRouteCooldowns.set(exchangeRouteCooldownKey(url), Date.now() + EXCHANGE_ROUTE_COOLDOWN_MS);
}

const classifyStatus = (status: number): ExchangeReason => {
  if (status === 451) return "EXCHANGE_LEGAL_RESTRICTION";
  if (status === 403) return "EXCHANGE_FORBIDDEN_OR_GEO_BLOCKED";
  if (status === 429) return "EXCHANGE_RATE_LIMITED";
  if (status >= 500) return "EXCHANGE_UPSTREAM_ERROR";
  return "EXCHANGE_BAD_RESPONSE";
};

async function fetchExchangeJson(
  url: string,
  method = "GET",
  headers: Record<string, string> = {}
): Promise<any> {
  const traceId = `server-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  // #region debug-point C:server-fetch-start
  reportDebugEvent("pre-fix", "C", "server.ts:fetchExchangeJson:start", "Server exchange fetch started.", {
    traceId,
    url,
    method,
    timeoutMs: EXCHANGE_REQUEST_TIMEOUT_MS,
  });
  // #endregion
  assertExchangeRouteNotCoolingDown(url);
  // Direct-first with health-based proxy-pool rotation (see proxyFetch.ts).
  const result = await smartFetchJson(url, {
    method,
    headers,
    timeoutMs: EXCHANGE_REQUEST_TIMEOUT_MS,
    logKey: url,
  });
  // #region debug-point C:server-fetch-result
  reportDebugEvent("pre-fix", result.ok ? "C" : "D", "server.ts:fetchExchangeJson:result", "Server exchange fetch completed.", {
    traceId,
    url,
    ok: result.ok,
    status: result.status,
    error: result.error ?? null,
    elapsedMs: Date.now() - startedAt,
  });
  // #endregion

  if (!result.ok) {
    if (result.status === 0) {
      recordExchangeRouteTransportFailure(url);
      throw new ExchangeProxyError(
        "EXCHANGE_UNREACHABLE",
        502,
        result.error || "Exchange request failed"
      );
    }
    if (result.error === "bad_json") {
      throw new ExchangeProxyError(
        "EXCHANGE_BAD_RESPONSE",
        502,
        "Upstream returned invalid JSON",
        result.status
      );
    }
    const reason = classifyStatus(result.status);
    throw new ExchangeProxyError(
      reason,
      result.status === 429 ? 429 : 502,
      `Upstream HTTP ${result.status}`,
      result.status
    );
  }

  if (result.json == null) {
    throw new ExchangeProxyError(
      "EXCHANGE_BAD_RESPONSE",
      502,
      "Upstream returned empty body"
    );
  }

  return result.json;
}

function assertKuCoinSuccess(json: any, endpoint: string) {
  if (!json || json.code !== "200000") {
    throw new ExchangeProxyError(
      "EXCHANGE_BAD_RESPONSE",
      502,
      `KuCoin ${endpoint} returned bad payload`
    );
  }
}

function sendExchangeError(
  res: express.Response,
  err: unknown,
  source: ExchangeSource,
  endpoint: string,
  symbol?: string,
  logLevel: "error" | "warn" = "error"
) {
  const proxyErr =
    err instanceof ExchangeProxyError
      ? err
      : new ExchangeProxyError(
          "EXCHANGE_UNREACHABLE",
          502,
          err instanceof Error ? err.message : String(err)
        );

  const payload: ExchangeErrorPayload = {
    error: true,
    reason: proxyErr.reason,
    source,
    endpoint,
    symbol,
    status: proxyErr.upstreamStatus,
    dataSource: "unavailable",
    msg: proxyErr.message,
  };

  const line = `[Proxy Error] ${source}/${endpoint}${symbol ? ` ${symbol}` : ""}: ${payload.reason} ${payload.msg}`;
  if (logLevel === "warn") console.warn(line);
  else console.error(line);

  res.status(proxyErr.status || 502).json(payload);
}

/**
 * Send a successful exchange response in the { ok } envelope format.
 * `data` is the unwrapped exchange payload (KuCoin envelope already stripped).
 */
function sendExchangeOk(
  res: express.Response,
  exchange: 'kucoin' | 'binance',
  route: string,
  url: string,
  data: any,
) {
  res.json({
    ok: true,
    exchange,
    route,
    url,
    data,
    _dataSource: 'live', // backwards-compat field consumed by frontend
  });
}

/**
 * Send an exchange failure in the { ok: false } envelope format.
 */
function sendExchangeErr(
  res: express.Response,
  exchange: 'kucoin' | 'binance',
  route: string,
  url: string,
  err: unknown,
  symbol?: string,
  logLevel: 'error' | 'warn' = 'error',
) {
  const proxyErr =
    err instanceof ExchangeProxyError
      ? err
      : new ExchangeProxyError(
          'EXCHANGE_UNREACHABLE',
          502,
          err instanceof Error ? err.message : String(err),
        );

  const line = `[Proxy Error] ${exchange}/${route}${symbol ? ` ${symbol}` : ''}: ${proxyErr.reason} ${proxyErr.message}`;
  if (logLevel === 'warn') console.warn(line);
  else console.error(line);

  res.status(proxyErr.status || 502).json({
    ok: false,
    exchange,
    route,
    url,
    reason: proxyErr.reason,
    message: proxyErr.message,
    dataSource: 'unavailable',
  });
}

/** @deprecated Use sendExchangeOk for new KuCoin routes */
function sendLive(res: express.Response, json: any) {
  res.json({ ...json, _dataSource: "live" });
}


// ─────────────────────────────────────────────────────────────────────────────
// BACKTESTING DATASOURCE ROUTES — HuggingFace Space allowlist only
// ─────────────────────────────────────────────────────────────────────────────

const BACKTEST_REQUEST_TIMEOUT_MS = Number(process.env.BACKTEST_DATASOURCE_TIMEOUT_MS || 15_000);
const BACKTEST_SPACE_PROFILES = [
  {
    id: 'datasourceforcryptocurrency-4',
    label: 'Short Hunter & Multi-Source Datasource Gateway',
    role: 'canonical OHLCV & short-hunter gateway',
    sourcePage: 'https://huggingface.co/spaces/Really-amin/Datasourceforcryptocurrency-4',
    runtimeOrigin: 'https://really-amin-datasourceforcryptocurrency-4.hf.space',
    defaultEndpoint: '/api/history',
    defaultEndpoints: [
      '/api/history',
      '/api/ohlcv',
      '/api/klines',
    ],
    dataSets: [
      'canonical historical OHLCV series',
      'short-hunter real-time snapshot gateway',
      'funding rates & open interest streams',
      'news and EVM whale transfer feeds',
    ],
  },
  {
    id: 'datasourceforcryptocurrency-2',
    label: 'Cryptocurrency Data Source & Historical Archive',
    role: 'historical + archive intelligence hub',
    sourcePage: 'https://huggingface.co/spaces/Really-amin/Datasourceforcryptocurrency-2',
    runtimeOrigin: 'https://really-amin-datasourceforcryptocurrency-2.hf.space',
    defaultEndpoint: '/api/ohlcv',
    defaultEndpoints: [
      '/api/ohlcv',
      '/api/history',
      '/api/crypto/history/{symbol}',
    ],
    dataSets: [
      'canonical multi-timeframe OHLCV',
      'Alternative.me Fear & Greed index',
      'historical funding rate coverage',
      'DeFi protocols and yield analytics',
    ],
  },
] as const;

type BacktestSpaceProfile = typeof BACKTEST_SPACE_PROFILES[number];
type BacktestSpaceProfileId = BacktestSpaceProfile['id'];

interface BacktestAttempt {
  url: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

interface NormalizedBacktestCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function getBacktestProfile(input: unknown): BacktestSpaceProfile {
  const id = String(input || BACKTEST_SPACE_PROFILES[0].id).trim() as BacktestSpaceProfileId;
  return BACKTEST_SPACE_PROFILES.find((profile) => profile.id === id) || BACKTEST_SPACE_PROFILES[0];
}

function backtestPublicProfile(profile: BacktestSpaceProfile) {
  return {
    id: profile.id,
    label: profile.label,
    role: profile.role,
    sourcePage: profile.sourcePage,
    runtimeOrigin: profile.runtimeOrigin,
    defaultEndpoint: profile.defaultEndpoint,
    dataSets: profile.dataSets,
  };
}

function assertBacktestUrlAllowed(url: URL): void {
  const allowed = new Set(
    BACKTEST_SPACE_PROFILES.flatMap((profile) => [
      new URL(profile.sourcePage).origin,
      new URL(profile.runtimeOrigin).origin,
    ])
  );
  if (!allowed.has(url.origin)) {
    throw new Error('Backtesting datasource is locked to the approved HuggingFace Spaces only');
  }
}

function normalizeBacktestInterval(input: unknown): string {
  const value = String(input || '5m').trim().toLowerCase();
  const allowed = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d']);
  return allowed.has(value) ? value : '5m';
}

function sanitizeBacktestEndpointPath(input: unknown, profile: BacktestSpaceProfile): string {
  let value = String(input || '').trim();
  if (!value) return profile.defaultEndpoint;
  if (/^https?:\/\//i.test(value) || value.includes('//')) {
    throw new Error('Only relative paths inside the approved HuggingFace Spaces are accepted');
  }
  if (value.includes('..')) {
    throw new Error('Backtesting endpoint path cannot contain parent directory traversal');
  }
  if (!value.startsWith('/')) value = `/${value}`;
  return value;
}

const HF_ASSET_ID_BY_BASE: Record<string, string> = {
  BTC: 'bitcoin', XBT: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', ADA: 'cardano',
  XRP: 'ripple', DOGE: 'dogecoin', AVAX: 'avalanche-2', SUI: 'sui', ARB: 'arbitrum', OP: 'optimism',
  NEAR: 'near', LINK: 'chainlink', DOT: 'polkadot', LTC: 'litecoin', BCH: 'bitcoin-cash', TRX: 'tron',
  MATIC: 'matic-network', POL: 'polygon-ecosystem-token', PEPE: 'pepe', WIF: 'dogwifcoin', TAO: 'bittensor',
};

function backtestSymbolContext(symbolInput: string) {
  const normalized = symbolInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'BTCUSDT';
  const compact = normalized.replace(/[-_/]/g, '');
  const baseSymbol = compact.replace(/(USDT|USDC|USD|PERP)$/i, '') || compact;
  const quoteSymbol = compact.slice(baseSymbol.length) || 'USDT';
  const coinId = HF_ASSET_ID_BY_BASE[baseSymbol] || baseSymbol.toLowerCase();
  return { symbol: compact, rawSymbol: normalized, baseSymbol, quoteSymbol, coinId };
}

function intervalToHistoryDays(interval: string, limit: number): number {
  const minutesByInterval: Record<string, number> = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
  const minutes = minutesByInterval[interval] || 5;
  return Math.max(1, Math.min(365, Math.ceil((minutes * limit) / 1440)));
}

function applyBacktestEndpointTemplate(template: string, ctx: ReturnType<typeof backtestSymbolContext>, interval: string, limit: number): string {
  return template
    .replace(/\{symbol\}/g, encodeURIComponent(ctx.symbol))
    .replace(/\{rawSymbol\}/g, encodeURIComponent(ctx.rawSymbol))
    .replace(/\{baseSymbol\}/g, encodeURIComponent(ctx.baseSymbol))
    .replace(/\{quoteSymbol\}/g, encodeURIComponent(ctx.quoteSymbol))
    .replace(/\{coinId\}/g, encodeURIComponent(ctx.coinId))
    .replace(/\{interval\}/g, encodeURIComponent(interval))
    .replace(/\{limit\}/g, encodeURIComponent(String(limit)));
}

function buildBacktestUrl(profile: BacktestSpaceProfile, endpointTemplate: string, symbol: string, interval: string, limit: number): string {
  const ctx = backtestSymbolContext(symbol);
  const endpointPath = applyBacktestEndpointTemplate(endpointTemplate, ctx, interval, limit);
  const url = new URL(endpointPath, profile.runtimeOrigin);
  assertBacktestUrlAllowed(url);
  if (!url.searchParams.has('symbol')) url.searchParams.set('symbol', ctx.symbol);
  if (profile.id === 'datasourceforcryptocurrency-4') {
    if (!url.searchParams.has('interval')) url.searchParams.set('interval', interval);
  } else {
    if (!url.searchParams.has('timeframe')) url.searchParams.set('timeframe', interval);
  }
  if (!url.searchParams.has('limit')) url.searchParams.set('limit', String(limit));
  return url.toString();
}

async function fetchBacktestText(url: string): Promise<{ status: number; text: string; contentType: string }> {
  const parsed = new URL(url);
  assertBacktestUrlAllowed(parsed);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKTEST_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json,text/csv,text/plain;q=0.8,*/*;q=0.2' },
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, text, contentType: res.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function timeString(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v > 10_000_000_000 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  const s = String(v);
  const numeric = Number(s);
  if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(s)) {
    const ms = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    return new Date(ms).toISOString();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : s;
}

function candleFromArray(row: unknown[]): NormalizedBacktestCandle | null {
  if (row.length < 5) return null;
  const time = timeString(row[0]);
  const open = num(row[1]);
  const high = num(row[2]);
  const low = num(row[3]);
  const close = num(row[4]);
  const volume = num(row[5]) ?? 0;
  if (!time || open == null || high == null || low == null || close == null) return null;
  return { time, open, high, low, close, volume };
}

function candleFromObject(row: Record<string, unknown>): NormalizedBacktestCandle | null {
  const time = timeString(row.time ?? row.timestamp ?? row.datetime ?? row.date ?? row.t ?? row.openTime);
  const price = num(row.price ?? row.current_price ?? row.close ?? row.c);
  const open = num(row.open ?? row.o) ?? price;
  const high = num(row.high ?? row.h) ?? price;
  const low = num(row.low ?? row.l) ?? price;
  const close = num(row.close ?? row.c ?? row.price ?? row.current_price) ?? price;
  const volume = num(row.volume ?? row.vol ?? row.v ?? row.baseVolume ?? row.total_volume) ?? 0;
  if (!time || open == null || high == null || low == null || close == null) return null;
  return { time, open, high, low, close, volume };
}

function chartObjectToCandles(obj: Record<string, unknown>): NormalizedBacktestCandle[] {
  const chart = obj.chart && typeof obj.chart === 'object' ? obj.chart as Record<string, unknown> : obj;
  const labels = Array.isArray(chart.labels) ? chart.labels : Array.isArray(chart.timestamps) ? chart.timestamps : null;
  const prices = Array.isArray(chart.prices) ? chart.prices : Array.isArray(chart.price) ? chart.price : null;
  const volumes = Array.isArray(chart.volumes) ? chart.volumes : Array.isArray(chart.volume) ? chart.volume : [];
  if (!labels || !prices || labels.length !== prices.length) return [];
  return prices.map((price, idx) => {
    const t = timeString(labels[idx]);
    const p = num(price);
    if (!t || p == null) return null;
    return { time: t, open: p, high: p, low: p, close: p, volume: num(volumes[idx]) ?? 0 };
  }).filter((row): row is NormalizedBacktestCandle => Boolean(row));
}

function normalizeBacktestCandles(payload: unknown, depth = 0): NormalizedBacktestCandle[] {
  if (depth > 5 || payload == null) return [];
  if (Array.isArray(payload)) {
    const rows = payload
      .map((row) => Array.isArray(row)
        ? candleFromArray(row)
        : row && typeof row === 'object'
          ? candleFromObject(row as Record<string, unknown>)
          : null)
      .filter((row): row is NormalizedBacktestCandle => Boolean(row));
    if (rows.length) {
      return rows
        .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
        .filter((row, index, arr) => index === 0 || row.time !== arr[index - 1].time);
    }
    for (const item of payload) {
      const nested = normalizeBacktestCandles(item, depth + 1);
      if (nested.length) return nested;
    }
    return [];
  }
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const chartRows = chartObjectToCandles(obj);
    if (chartRows.length) return chartRows;
    for (const key of ['candles', 'ohlcv', 'klines', 'data', 'result', 'rows', 'items', 'payload', 'chart', 'prices']) {
      const nested = normalizeBacktestCandles(obj[key], depth + 1);
      if (nested.length) return nested;
    }
  }
  return [];
}

function parseCsvCandles(text: string): NormalizedBacktestCandle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const first = lines[0].split(',').map((x) => x.trim().toLowerCase());
  const hasHeader = first.some((x) => ['time', 'timestamp', 'date', 'open', 'high', 'low', 'close', 'volume'].includes(x));
  const header = hasHeader ? first : ['time', 'open', 'high', 'low', 'close', 'volume'];
  const rows = (hasHeader ? lines.slice(1) : lines).map((line) => line.split(',').map((x) => x.trim()));
  return rows
    .map((cols) => {
      const obj: Record<string, unknown> = {};
      header.forEach((h, idx) => { obj[h] = cols[idx]; });
      return candleFromObject(obj) || candleFromArray(cols);
    })
    .filter((row): row is NormalizedBacktestCandle => Boolean(row));
}

function compactRawSample(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.slice(0, 3);
  if (payload && typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>).slice(0, 12)) {
      out[k] = Array.isArray(v) ? v.slice(0, 3) : v;
    }
    return out;
  }
  return String(payload).slice(0, 500);
}

app.get('/api/backtest/datasource/status', async (req, res) => {
  const requestedProfile = getBacktestProfile(req.query.profileId || req.query.profile);
  const attempts: BacktestAttempt[] = [];
  const probeProfiles = String(req.query.all || '').toLowerCase() === 'true'
    ? BACKTEST_SPACE_PROFILES
    : [requestedProfile];
  const probeResults: Array<ReturnType<typeof backtestPublicProfile> & { ok: boolean; status?: number; reason?: string }> = [];

  for (const profile of probeProfiles) {
    try {
      const pageUrl = new URL(profile.sourcePage);
      assertBacktestUrlAllowed(pageUrl);
      const page = await fetchBacktestText(profile.sourcePage);
      const ok = page.status >= 200 && page.status < 500;
      attempts.push({ url: profile.sourcePage, ok, status: page.status });
      probeResults.push({ ...backtestPublicProfile(profile), ok, status: page.status });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      attempts.push({ url: profile.sourcePage, ok: false, reason });
      probeResults.push({ ...backtestPublicProfile(profile), ok: false, reason });
    }
  }

  const activeResult = probeResults.find((p) => p.id === requestedProfile.id) || probeResults[0];
  const ok = probeResults.some((p) => p.ok);
  res.status(ok ? 200 : 502).json({
    ok: Boolean(activeResult?.ok),
    source: 'huggingface-space',
    profileId: requestedProfile.id,
    profileLabel: requestedProfile.label,
    sourcePage: requestedProfile.sourcePage,
    runtimeOrigin: requestedProfile.runtimeOrigin,
    dataSets: requestedProfile.dataSets,
    profiles: probeResults,
    dataSource: activeResult?.ok ? 'live' : 'unavailable',
    attempts,
    message: activeResult?.ok
      ? `${requestedProfile.label} is reachable`
      : `${requestedProfile.label} was not reachable from this server runtime`,
  });
});

app.post('/api/backtest/datasource/fetch', async (req, res) => {
  const attempts: BacktestAttempt[] = [];
  let profile = getBacktestProfile(req.body?.profileId);
  try {
    const symbol = String(req.body?.symbol || 'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const interval = normalizeBacktestInterval(req.body?.interval);
    const limit = Math.max(50, Math.min(5000, Number(req.body?.limit || 500)));
    profile = getBacktestProfile(req.body?.profileId);
    const requestedPath = sanitizeBacktestEndpointPath(req.body?.endpointPath, profile);
    const endpointPaths = Array.from(new Set([requestedPath, ...profile.defaultEndpoints]));

    let lastSample: unknown = null;
    for (const endpointPath of endpointPaths) {
      const url = buildBacktestUrl(profile, endpointPath, symbol, interval, limit);
      try {
        const fetched = await fetchBacktestText(url);
        if (fetched.status < 200 || fetched.status >= 300) {
          attempts.push({ url, ok: false, status: fetched.status, reason: 'HTTP status outside 2xx' });
          continue;
        }
        let payload: unknown = null;
        let candles: NormalizedBacktestCandle[] = [];
        const trimmed = fetched.text.trim();
        if (!trimmed) {
          attempts.push({ url, ok: false, status: fetched.status, reason: 'empty response body' });
          continue;
        }
        if (fetched.contentType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
          payload = JSON.parse(trimmed);
          lastSample = compactRawSample(payload);
          candles = normalizeBacktestCandles(payload);
        } else {
          payload = trimmed.slice(0, 500);
          lastSample = payload;
          candles = parseCsvCandles(trimmed);
        }
        if (candles.length > 0) {
          return res.json({
            ok: true,
            source: 'huggingface-space',
            profileId: profile.id,
            profileLabel: profile.label,
            sourcePage: profile.sourcePage,
            runtimeOrigin: profile.runtimeOrigin,
            dataSets: profile.dataSets,
            profiles: BACKTEST_SPACE_PROFILES.map(backtestPublicProfile),
            url,
            endpointPath,
            dataSource: 'live',
            candles: candles.slice(-limit),
            attempts: [...attempts, { url, ok: true, status: fetched.status }],
            rawSample: lastSample,
            message: `Loaded ${candles.length} normalized candle rows from ${profile.label}`,
          });
        }
        attempts.push({ url, ok: false, status: fetched.status, reason: 'response did not contain recognizable OHLCV/price-series rows' });
      } catch (err) {
        attempts.push({ url, ok: false, reason: err instanceof Error ? err.message : String(err) });
      }
    }

    res.status(502).json({
      ok: false,
      source: 'huggingface-space',
      profileId: profile.id,
      profileLabel: profile.label,
      sourcePage: profile.sourcePage,
      runtimeOrigin: profile.runtimeOrigin,
      dataSets: profile.dataSets,
      profiles: BACKTEST_SPACE_PROFILES.map(backtestPublicProfile),
      dataSource: 'unavailable',
      attempts,
      rawSample: lastSample,
      message: `No endpoint on ${profile.label} returned recognizable OHLCV/price-series rows`,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      source: 'huggingface-space',
      profileId: profile.id,
      profileLabel: profile.label,
      sourcePage: profile.sourcePage,
      runtimeOrigin: profile.runtimeOrigin,
      dataSets: profile.dataSets,
      profiles: BACKTEST_SPACE_PROFILES.map(backtestPublicProfile),
      dataSource: 'unavailable',
      attempts,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// KUCOIN authenticated account overview through server-side signing
// ─────────────────────────────────────────────────────────────────────────────

app.post("/api/kucoin/account-overview", (_req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'endpoint_replaced',
    replacement: '/api/account/connect',
    message: 'Use the verified HttpOnly exchange-session flow; credentials are no longer accepted by this legacy endpoint.',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KUCOIN public market routes — real data only
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/kucoin/ticker", async (req, res) => {
  const symbol = (req.query.symbol as string) || "XBTUSDTM";
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/ticker?symbol=${encodeURIComponent(symbol)}`;
  try {
    const json = await fetchExchangeJson(url);
    assertKuCoinSuccess(json, "ticker");
    sendExchangeOk(res, 'kucoin', 'ticker', url, json.data);
  } catch (err) {
    sendExchangeErr(res, 'kucoin', 'ticker', url, err, symbol);
  }
});

app.get("/api/kucoin/level2", async (req, res) => {
  const symbol = (req.query.symbol as string) || "XBTUSDTM";
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/level2/snapshot?symbol=${encodeURIComponent(symbol)}`;
  try {
    const json = await fetchExchangeJson(url);
    assertKuCoinSuccess(json, "level2");
    sendExchangeOk(res, 'kucoin', 'level2', url, json.data);
  } catch (err) {
    sendExchangeErr(res, 'kucoin', 'level2', url, err, symbol);
  }
});

app.get("/api/kucoin/candles", async (req, res) => {
  const symbol = (req.query.symbol as string) || "XBTUSDTM";
  const granularityInput = (req.query.granularity as string) || "1";
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  // toKuCoinKlineGranularity normalises '1'/'1min'/'60' → 60 (seconds).
  // KuCoin REST kline API uses MINUTES → divide by 60.
  const granularitySec = toKuCoinKlineGranularity(granularityInput);
  const granularityMin = granularitySec / 60;

  const params = new URLSearchParams({ symbol, granularity: String(granularityMin) });
  if (from) params.set("from", from);
  if (to)   params.set("to", to);

  const url = `${KUCOIN_FUTURES_BASE}/api/v1/kline/query?${params.toString()}`;
  const routeTraceId = `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // #region debug-point C:route-candles-start
  reportDebugEvent("pre-fix", "C", "server.ts:/api/kucoin/candles:start", "KuCoin candles route received request.", {
    routeTraceId,
    symbol,
    granularityInput,
    granularityMin,
    from: from ?? null,
    to: to ?? null,
    url,
  });
  // #endregion
  try {
    const json = await fetchExchangeJson(url);
    assertKuCoinSuccess(json, "candles");
    // #region debug-point C:route-candles-success
    reportDebugEvent("pre-fix", "C", "server.ts:/api/kucoin/candles:success", "KuCoin candles route succeeded.", {
      routeTraceId,
      symbol,
      dataLength: Array.isArray(json?.data) ? json.data.length : null,
    });
    // #endregion
    sendExchangeOk(res, 'kucoin', 'candles', url, json.data);
  } catch (err) {
    // #region debug-point D:route-candles-error
    reportDebugEvent("pre-fix", "D", "server.ts:/api/kucoin/candles:error", "KuCoin candles route failed.", {
      routeTraceId,
      symbol,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : typeof err,
    });
    // #endregion
    sendExchangeErr(res, 'kucoin', 'candles', url, err, symbol);
  }
});

app.get("/api/kucoin/funding", async (req, res) => {
  const symbol = (req.query.symbol as string) || "XBTUSDTM";
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/funding-rate/${encodeURIComponent(symbol)}/current`;
  try {
    const json = await fetchExchangeJson(url);
    assertKuCoinSuccess(json, "funding");
    sendExchangeOk(res, 'kucoin', 'funding', url, json.data);
  } catch (err) {
    sendExchangeErr(res, 'kucoin', 'funding', url, err, symbol);
  }
});

app.get("/api/kucoin/contracts-active", async (_req, res) => {
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/contracts/active`;
  try {
    const json = await fetchExchangeJson(url);
    assertKuCoinSuccess(json, "contracts-active");
    sendExchangeOk(res, 'kucoin', 'contracts-active', url, json.data);
  } catch (err) {
    sendExchangeErr(res, 'kucoin', 'contracts-active', url, err);
  }
});

app.get("/api/kucoin/contracts/active", async (_req, res) => {
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/contracts/active`;
  try {
    const json = await fetchExchangeJson(url);
    assertKuCoinSuccess(json, "contracts/active");
    sendExchangeOk(res, 'kucoin', 'contracts/active', url, json.data);
  } catch (err) {
    sendExchangeErr(res, 'kucoin', 'contracts/active', url, err);
  }
});

app.get("/api/kucoin/contract", async (req, res) => {
  const symbol = (req.query.symbol as string) || "XBTUSDTM";
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/contracts/${encodeURIComponent(symbol)}`;
  try {
    const json = await fetchExchangeJson(url);
    assertKuCoinSuccess(json, "contract");
    sendExchangeOk(res, 'kucoin', 'contract', url, json.data);
  } catch (err) {
    sendExchangeErr(res, 'kucoin', 'contract', url, err, symbol);
  }
});

app.get("/api/kucoin/trades", async (req, res) => {
  const symbol = (req.query.symbol as string) || "XBTUSDTM";
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/trade/history?symbol=${encodeURIComponent(symbol)}`;
  try {
    const json = await fetchExchangeJson(url);
    assertKuCoinSuccess(json, "trades");
    sendExchangeOk(res, 'kucoin', 'trades', url, json.data);
  } catch (err) {
    sendExchangeErr(res, 'kucoin', 'trades', url, err, symbol);
  }
});

app.post("/api/kucoin/bullet-public", async (_req, res) => {
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/bullet-public`;
  try {
    const json = await fetchExchangeJson(url, "POST");
    assertKuCoinSuccess(json, "bullet-public");
    sendExchangeOk(res, 'kucoin', 'bullet-public', url, json.data);
  } catch (err) {
    sendExchangeErr(res, 'kucoin', 'bullet-public', url, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BINANCE sentiment routes — optional real data only
// ─────────────────────────────────────────────────────────────────────────────

const BINANCE_FUTURES_BASE_URL = BINANCE_FUTURES_BASE;

// Map a provider-router envelope onto the response shape the frontend expects.
// live/degraded carry data; unavailable carries no fabricated value.
function sendSentimentEnvelope(
  res: express.Response,
  env: DataEnvelope<any>,
  endpoint: string
) {
  if (env.status === "unavailable") {
    return res.status(200).json({
      error: true,
      reason:
        env.reason === SYMBOL_NOT_SUPPORTED
          ? "EXCHANGE_BAD_RESPONSE"
          : "EXCHANGE_UNREACHABLE",
      reasonCode: env.reason,
      source: "binance",
      endpoint,
      symbol: env.symbol,
      dataSource: "unavailable",
      optional: true,
      msg: env.reason || "Binance sentiment unavailable",
    });
  }
  // live or degraded
  return res.status(200).json({
    code: "200000",
    _dataSource: env.status, // 'live' | 'degraded'
    provider: env.provider,
    reason: env.reason,
    latencyMs: env.latencyMs,
    value: env.value, // canonical envelope field
    data: env.value, // legacy-compatible alias
  });
}

app.get("/api/binance/sentiment-ls", async (req, res) => {
  const symbol = (req.query.symbol as string) || "BTCUSDT";
  const period = (req.query.period as string) || "5m";
  const params = new URLSearchParams({
    symbol,
    period,
    limit: String(req.query.limit || 30),
  });
  const url = `${BINANCE_FUTURES_BASE_URL}/futures/data/globalLongShortAccountRatio?${params.toString()}`;

  const env = await routeBinanceSentiment(
    "longShortRatio",
    "sentiment-ls",
    symbol,
    url,
    routerFetch
  );
  sendSentimentEnvelope(res, env, "sentiment-ls");
});

app.get("/api/binance/sentiment-taker", async (req, res) => {
  const symbol = (req.query.symbol as string) || "BTCUSDT";
  const period = (req.query.period as string) || "5m";
  const params = new URLSearchParams({
    symbol,
    period,
    limit: String(req.query.limit || 30),
  });
  const url = `${BINANCE_FUTURES_BASE_URL}/futures/data/takerlongshortRatio?${params.toString()}`;

  const env = await routeBinanceSentiment(
    "takerBuySellRatio",
    "sentiment-taker",
    symbol,
    url,
    routerFetch
  );
  sendSentimentEnvelope(res, env, "sentiment-taker");
});

// ─────────────────────────────────────────────────────────────────────────────
// BINANCE USD-M public market routes — REST co-primary / KuCoin failover target
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/binance/ticker', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTCUSDT';
  const result = await ecBinanceTicker(symbol);
  if (!result.ok) return sendExchangeErr(res, 'binance', 'ticker', result.url, result.message, symbol, 'warn');
  sendExchangeOk(res, 'binance', 'ticker', result.url, result.data);
});

app.get('/api/binance/depth', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTCUSDT';
  const limit = Number(req.query.limit || 20);
  const result = await ecBinanceDepth(symbol, limit);
  if (!result.ok) return sendExchangeErr(res, 'binance', 'depth', result.url, result.message, symbol, 'warn');
  sendExchangeOk(res, 'binance', 'depth', result.url, result.data);
});

app.get('/api/binance/klines', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTCUSDT';
  const interval = (req.query.interval as string) || '1m';
  const limit = Number(req.query.limit || 120);
  const result = await ecBinanceKlines(symbol, interval, limit);
  if (!result.ok) return sendExchangeErr(res, 'binance', 'klines', result.url, result.message, symbol, 'warn');
  sendExchangeOk(res, 'binance', 'klines', result.url, result.data);
});

app.get('/api/binance/premium-index', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTCUSDT';
  const result = await ecBinanceFunding(symbol);
  if (!result.ok) return sendExchangeErr(res, 'binance', 'premium-index', result.url, result.message, symbol, 'warn');
  sendExchangeOk(res, 'binance', 'premium-index', result.url, result.data);
});

app.get('/api/binance/open-interest', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTCUSDT';
  const result = await ecBinanceOpenInterest(symbol);
  if (!result.ok) return sendExchangeErr(res, 'binance', 'open-interest', result.url, result.message, symbol, 'warn');
  sendExchangeOk(res, 'binance', 'open-interest', result.url, result.data);
});

// ─────────────────────────────────────────────────────────────────────────────
// HF SPACE intel proxy — news / sentiment / whales (Space-2 primary, Space-4 fallback)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/hf-space/status', async (_req, res) => {
  try {
    const status = await fetchHfSpaceIntelStatus();
    res.json({ ok: true, ...status });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'hf_status_failed' });
  }
});

app.get('/api/hf-space/intel/news', async (_req, res) => {
  try {
    const status = await fetchHfSpaceIntelStatus();
    const news = await fetchHfSpaceNews(status);
    res.json({ ...news, subSources: { cryptoDtSource: status.cryptoDtSource, cryptoApiClean: status.cryptoApiClean } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'hf_news_failed' });
  }
});

app.get('/api/hf-space/intel/sentiment', async (_req, res) => {
  try {
    const status = await fetchHfSpaceIntelStatus();
    const sentiment = await fetchHfSpaceFearGreed(status);
    res.json({ ...sentiment, subSources: { cryptoDtSource: status.cryptoDtSource, cryptoApiClean: status.cryptoApiClean } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'hf_sentiment_failed' });
  }
});

app.get('/api/hf-space/intel/whales', async (_req, res) => {
  try {
    const whales = await fetchHfSpaceWhales();
    res.json(whales);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'hf_whales_failed' });
  }
});

// Space-2 enrichment. These routes never enter execution decisions directly;
// they expose validated historical/intelligence data to local consumers.
app.get('/api/hf-space/intel/defi/protocols', async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const result = await getSpace2DefiProtocols(limit);
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_2' });
  res.json({ ok: true, dataState: 'degraded', source: 'hf_space_2', upstream: result.source, protocols: result.rows });
});

app.get('/api/hf-space/intel/defi/yields', async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const result = await getSpace2DefiYields(limit);
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_2' });
  res.json({ ok: true, dataState: 'degraded', source: 'hf_space_2', upstream: result.source, pools: result.rows });
});

app.get('/api/hf-space/historical/:symbol', async (req, res) => {
  const limit = Math.max(2, Math.min(1000, Number(req.query.limit || 500)));
  const result = await getSpace2HistoricalCandles(String(req.params.symbol), '1h', limit);
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_2' });
  res.json({
    ok: true,
    dataState: 'degraded',
    source: 'hf_space_2',
    upstreamExchange: result.exchange,
    candles: result.candles,
  });
});

app.post('/api/hf-space/intel/sentiment/analyze', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const requestedMode = String(req.body?.mode || 'crypto');
  const mode = ['crypto', 'financial', 'social', 'news'].includes(requestedMode)
    ? requestedMode as 'crypto' | 'financial' | 'social' | 'news'
    : 'crypto';
  const result = await analyzeSpace2Sentiment(text, mode);
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_2' });
  res.json({ ok: true, dataState: 'degraded', spaceSource: 'hf_space_2', ...result });
});

// Space-4 Short Hunter gateway. Results are explicitly tertiary/degraded even
// when the upstream says LIVE/REAL because Binance and KuCoin remain primary.
app.get('/api/hf-space/short-hunter/market/:symbol', async (req, res) => {
  const result = await getSpace4Market(String(req.params.symbol));
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_4' });
  res.json({ ok: true, dataState: 'degraded', source: 'hf_space_4', data: result });
});

app.get('/api/hf-space/short-hunter/orderbook/:symbol', async (req, res) => {
  const limit = Math.max(5, Math.min(100, Number(req.query.limit || 20)));
  const result = await getSpace4OrderBook(String(req.params.symbol), limit);
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_4' });
  res.json({ ok: true, dataState: 'degraded', source: 'hf_space_4', data: result });
});

app.get('/api/hf-space/short-hunter/funding/:symbol', async (req, res) => {
  const result = await getSpace4Funding(String(req.params.symbol));
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_4' });
  res.json({ ok: true, dataState: 'degraded', source: 'hf_space_4', data: result });
});

app.get('/api/hf-space/short-hunter/open-interest/:symbol', async (req, res) => {
  const result = await getSpace4OpenInterest(String(req.params.symbol));
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_4' });
  res.json({ ok: true, dataState: 'degraded', source: 'hf_space_4', data: result });
});

app.get('/api/hf-space/short-hunter/snapshot/:symbol', async (req, res) => {
  const limit = Math.max(30, Math.min(1000, Number(req.query.limit || 120)));
  const orderbookLimit = Math.max(5, Math.min(100, Number(req.query.orderbookLimit || 20)));
  const result = await getSpace4Snapshot(String(req.params.symbol), limit, orderbookLimit);
  if (!result) return res.status(503).json({ ok: false, dataState: 'unavailable', source: 'hf_space_4' });
  res.json({ ok: true, dataState: 'degraded', source: 'hf_space_4', data: result });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLEMENTAL INTELLIGENCE ROUTES — news, sentiment, on-chain
// ─────────────────────────────────────────────────────────────────────────────

// Initialize supplemental orchestrator.
// Provider secrets may come from environment variables or the runtime settings
// panel. Runtime values are persisted server-side only and are never returned
// to the browser; status endpoints expose only boolean "configured" flags.
// Resolved outside the repository/source root (see privateConfigFile.ts);
// a legacy copy at the old repo-root path is migrated automatically once.
const SUPPLEMENTAL_CONFIG_PATH = resolvePrivateConfigPath(
  "supplemental.config.json",
  [path.resolve(process.cwd(), ".supplemental.config.json")],
);

type SupplementalKeyName =
  | 'newsApiKey'
  | 'coinMarketCapKey'
  | 'huggingFaceToken'
  | 'etherscanKey'
  | 'tronScanKey'
  | 'bscScanKey';

type SupplementalKeyStore = Record<SupplementalKeyName, string>;
type SupplementalReserveKeyStore = Record<SupplementalKeyName, string[]>;

type SupplementalConfigFile = SupplementalKeyStore & {
  reserveKeys?: Partial<SupplementalReserveKeyStore>;
  defaultPackSource?: string;
  newsApiQuery?: NewsApiQueryOptions;
  /** Last successful/failed live probes — restores green "live" pills after restart. */
  lastProbe?: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>>;
};

// The private seed is loaded server-side only. Its credentials are never
// imported by browser code and status APIs expose only configured/count flags.
const bundledPrivateApiSeed = loadBundledPrivateApiSeed();
if (!bundledPrivateApiSeed.source) {
  console.warn(
    '\x1b[33m[APEX WARNING] No private API seed found (.apex-private-seed/api-provider-seed.json) — all supplemental providers will show Not configured.\x1b[0m',
  );
} else {
  console.log(`[APEX Seed] Loaded private API seed from source: ${bundledPrivateApiSeed.source}`);
}
const bundledPrimaryKeys = primarySeedKeys(bundledPrivateApiSeed);
const bundledReserveKeys = reserveSeedKeys(bundledPrivateApiSeed);

/** Private attached API pack → env → saved private runtime config precedence. */
const DEFAULT_SUPPLEMENTAL_KEYS: SupplementalKeyStore = {
  newsApiKey: bundledPrimaryKeys.newsApiKey || COMPLETED_SUPPLEMENTAL_DEFAULTS.newsApiKey,
  coinMarketCapKey: bundledPrimaryKeys.coinMarketCapKey || COMPLETED_SUPPLEMENTAL_DEFAULTS.coinMarketCapKey,
  huggingFaceToken: bundledPrimaryKeys.huggingFaceToken || COMPLETED_SUPPLEMENTAL_DEFAULTS.huggingFaceToken,
  etherscanKey: bundledPrimaryKeys.etherscanKey || COMPLETED_SUPPLEMENTAL_DEFAULTS.etherscanKey,
  tronScanKey: bundledPrimaryKeys.tronScanKey || COMPLETED_SUPPLEMENTAL_DEFAULTS.tronScanKey,
  bscScanKey: bundledPrimaryKeys.bscScanKey || COMPLETED_SUPPLEMENTAL_DEFAULTS.bscScanKey,
};

const DEFAULT_SUPPLEMENTAL_RESERVE_KEYS: SupplementalReserveKeyStore = {
  newsApiKey: bundledReserveKeys.newsApiKey,
  coinMarketCapKey: bundledReserveKeys.coinMarketCapKey,
  huggingFaceToken: bundledReserveKeys.huggingFaceToken,
  etherscanKey: bundledReserveKeys.etherscanKey,
  tronScanKey: bundledReserveKeys.tronScanKey,
  bscScanKey: bundledReserveKeys.bscScanKey,
};

function readSavedSupplementalConfig(): {
  keys: Partial<SupplementalKeyStore>;
  reserveKeys: Partial<SupplementalReserveKeyStore>;
  newsApiQuery: NewsApiQueryOptions;
  lastProbe: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>>;
} {
  try {
    if (!existsSync(SUPPLEMENTAL_CONFIG_PATH)) {
      return { keys: {}, reserveKeys: {}, newsApiQuery: { ...DEFAULT_NEWSAPI_QUERY }, lastProbe: {} };
    }
    const raw = JSON.parse(readFileSync(SUPPLEMENTAL_CONFIG_PATH, "utf8"));
    const out: Partial<SupplementalKeyStore> = {};
    for (const key of Object.keys(DEFAULT_SUPPLEMENTAL_KEYS) as SupplementalKeyName[]) {
      if (typeof raw?.[key] === "string" && raw[key].trim()) out[key] = raw[key].trim();
    }
    const reserveKeys: Partial<SupplementalReserveKeyStore> = {};
    for (const key of Object.keys(DEFAULT_SUPPLEMENTAL_KEYS) as SupplementalKeyName[]) {
      const values = raw?.reserveKeys?.[key];
      if (!Array.isArray(values)) continue;
      reserveKeys[key] = [...new Set(values.map((value: unknown) => String(value || '').trim()).filter(Boolean))];
    }
    const lastProbe: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>> = {};
    const savedProbe = raw?.lastProbe;
    if (savedProbe && typeof savedProbe === "object") {
      for (const key of Object.keys(DEFAULT_SUPPLEMENTAL_KEYS) as SupplementalProbeKey[]) {
        const entry = savedProbe[key];
        if (entry && typeof entry === "object" && entry.key === key) {
          lastProbe[key] = entry as SupplementalProbeResult;
        }
      }
    }
    return {
      keys: out,
      reserveKeys,
      newsApiQuery: normalizeNewsApiQuery(raw?.newsApiQuery),
      lastProbe,
    };
  } catch {
    return { keys: {}, reserveKeys: {}, newsApiQuery: { ...DEFAULT_NEWSAPI_QUERY }, lastProbe: {} };
  }
}

const savedSupplementalConfig = readSavedSupplementalConfig();
const savedSupplementalKeys = savedSupplementalConfig.keys;
const savedSupplementalReserveKeys = savedSupplementalConfig.reserveKeys;
const hadSavedSupplementalConfig = Object.keys(savedSupplementalKeys).length > 0
  || Object.values(savedSupplementalReserveKeys).some((rows) => Array.isArray(rows) && rows.length > 0)
  || Boolean(savedSupplementalConfig.newsApiQuery);

let supplementalKeys: SupplementalKeyStore = {
  newsApiKey: process.env.NEWSAPI_KEY || DEFAULT_SUPPLEMENTAL_KEYS.newsApiKey,
  coinMarketCapKey: process.env.COINMARKETCAP_KEY || process.env.CMC_API_KEY || DEFAULT_SUPPLEMENTAL_KEYS.coinMarketCapKey,
  huggingFaceToken: process.env.HUGGING_FACE_TOKEN || process.env.HF_TOKEN || DEFAULT_SUPPLEMENTAL_KEYS.huggingFaceToken,
  etherscanKey: process.env.ETHERSCAN_KEY || DEFAULT_SUPPLEMENTAL_KEYS.etherscanKey,
  tronScanKey: process.env.TRONSCAN_KEY || DEFAULT_SUPPLEMENTAL_KEYS.tronScanKey,
  bscScanKey: process.env.BSCSCAN_KEY || DEFAULT_SUPPLEMENTAL_KEYS.bscScanKey,
  ...savedSupplementalKeys,
};

let supplementalReserveKeys: SupplementalReserveKeyStore = {
  ...DEFAULT_SUPPLEMENTAL_RESERVE_KEYS,
  ...Object.fromEntries(Object.entries(savedSupplementalReserveKeys).map(([key, rows]) => [key, Array.isArray(rows) ? rows : []])),
} as SupplementalReserveKeyStore;

let supplementalNewsApiQuery: NewsApiQueryOptions = savedSupplementalConfig.newsApiQuery;

const supplementalTimeout = Number(process.env.SUPPLEMENTAL_PROVIDER_TIMEOUT_MS || 8000);
const healthTracker = getProviderHealthTracker();

/** Live verification state — green in Settings only after a successful probe. */
const supplementalVerified: Record<SupplementalProbeKey, boolean> = {
  newsApiKey: false,
  coinMarketCapKey: false,
  huggingFaceToken: false,
  etherscanKey: false,
  tronScanKey: false,
  bscScanKey: false,
};

const supplementalProbeCache: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>> =
  { ...savedSupplementalConfig.lastProbe };

function supplementalVerifiedStatus() {
  const out = { ...supplementalVerified };
  for (const key of Object.keys(out) as SupplementalProbeKey[]) {
    if (!out[key] && supplementalProbeCache[key]?.ok) out[key] = true;
  }
  return out;
}

function persistSupplementalKeys(): void {
  try {
    const payload: SupplementalConfigFile = {
      ...supplementalKeys,
      reserveKeys: supplementalReserveKeys,
      defaultPackSource: bundledPrivateApiSeed.source,
      newsApiQuery: supplementalNewsApiQuery,
      lastProbe: Object.keys(supplementalProbeCache).length > 0 ? { ...supplementalProbeCache } : undefined,
    };
    writePrivateJsonFileSync(SUPPLEMENTAL_CONFIG_PATH, payload);
  } catch { /* runtime values still apply for this process */ }
}

function restoreSupplementalProbeCache(
  saved: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>>,
): void {
  for (const key of Object.keys(DEFAULT_SUPPLEMENTAL_KEYS) as SupplementalProbeKey[]) {
    const entry = saved[key];
    if (!entry || entry.key !== key) continue;
    supplementalProbeCache[key] = entry;
    if (entry.ok) {
      supplementalVerified[key] = true;
      const trackerName =
        key === 'newsApiKey' ? 'NewsAPI'
        : key === 'coinMarketCapKey' ? 'CoinMarketCap'
        : key === 'huggingFaceToken' ? 'HuggingFace'
        : key === 'etherscanKey' ? 'Etherscan'
        : key === 'tronScanKey' ? 'TronScan'
        : key === 'bscScanKey' ? 'BscScan'
        : null;
      if (trackerName) healthTracker.recordSuccess(trackerName, entry.latencyMs);
    }
  }
}

// Seed completed Doc defaults to disk on first boot so Settings sees them as configured.
if (!hadSavedSupplementalConfig && !existsSync(SUPPLEMENTAL_CONFIG_PATH)) {
  persistSupplementalKeys();
}

restoreSupplementalProbeCache(savedSupplementalConfig.lastProbe);

function rebuildSupplementalOrchestrator(): void {
  initializeSupplementalOrchestrator({
    newsApiKey: supplementalKeys.newsApiKey,
    newsApiKeys: [supplementalKeys.newsApiKey, ...supplementalReserveKeys.newsApiKey],
    newsApiQuery: supplementalNewsApiQuery,
    coinMarketCapKey: supplementalKeys.coinMarketCapKey,
    coinMarketCapKeys: [supplementalKeys.coinMarketCapKey, ...supplementalReserveKeys.coinMarketCapKey],
    huggingFaceToken: supplementalKeys.huggingFaceToken,
    huggingFaceTokens: [supplementalKeys.huggingFaceToken, ...supplementalReserveKeys.huggingFaceToken],
    etherscanKey: supplementalKeys.etherscanKey,
    etherscanKeys: [supplementalKeys.etherscanKey, ...supplementalReserveKeys.etherscanKey],
    tronScanKey: supplementalKeys.tronScanKey,
    tronScanKeys: [supplementalKeys.tronScanKey, ...supplementalReserveKeys.tronScanKey],
    bscScanKey: supplementalKeys.bscScanKey,
    bscScanKeys: [supplementalKeys.bscScanKey, ...supplementalReserveKeys.bscScanKey],
    timeout: supplementalTimeout,
  });

  healthTracker.setConfigured('NewsAPI', Boolean(supplementalKeys.newsApiKey));
  healthTracker.setConfigured('CoinMarketCap', Boolean(supplementalKeys.coinMarketCapKey));
  healthTracker.setConfigured('HuggingFace', Boolean(supplementalKeys.huggingFaceToken));
  healthTracker.setConfigured('Etherscan', Boolean(supplementalKeys.etherscanKey));
  healthTracker.setConfigured('TronScan', Boolean(supplementalKeys.tronScanKey));
  healthTracker.setConfigured('BscScan', Boolean(supplementalKeys.bscScanKey || supplementalKeys.etherscanKey));
  healthTracker.setConfigured('Binance', true);
  healthTracker.setConfigured('KuCoin', true);
  healthTracker.setConfigured('HF Space 4', true);
  healthTracker.setConfigured('HF Space 2', true);
  healthTracker.setConfigured('Alternative.me', true);
}

function supplementalConfigStatus() {
  return {
    newsApiKey: supplementalKeys.newsApiKey.length > 0,
    coinMarketCapKey: supplementalKeys.coinMarketCapKey.length > 0,
    huggingFaceToken: supplementalKeys.huggingFaceToken.length > 0,
    etherscanKey: supplementalKeys.etherscanKey.length > 0,
    tronScanKey: supplementalKeys.tronScanKey.length > 0,
    bscScanKey: supplementalKeys.bscScanKey.length > 0,
  };
}

function clearSupplementalVerification(keys?: SupplementalProbeKey[]) {
  const list = keys ?? (Object.keys(supplementalVerified) as SupplementalProbeKey[]);
  for (const k of list) {
    supplementalVerified[k] = false;
    delete supplementalProbeCache[k];
  }
}

rebuildSupplementalOrchestrator();
loadProxySettings();
const proxyProbeHistory = new IntegrationHealthHistory(12);
const supplementalProbeHistory = new IntegrationHealthHistory(18);

export async function runProviderHealthSweep(): Promise<void> {
  try {
    const kcStart = Date.now();
    const kcPromise = smartFetchJson(`${KUCOIN_FUTURES_BASE}/api/v1/timestamp`, { timeoutMs: 6000, logKey: 'health:kc_time' })
      .then((res) => ({ res, latencyMs: Math.max(1, Date.now() - kcStart) }));

    const bnStart = Date.now();
    const bnPromise = smartFetchJson(`${BINANCE_FUTURES_BASE}/fapi/v1/time`, { timeoutMs: 6000, logKey: 'health:bn_time' })
      .then((res) => ({ res, latencyMs: Math.max(1, Date.now() - bnStart) }));

    const gwStart = Date.now();
    const gatewayPromise = getCanonicalDatasourceGateway().probeHealth()
      .then((res) => ({ res, latencyMs: Math.max(1, Date.now() - gwStart) }))
      .catch(() => ({ res: null, latencyMs: Math.max(1, Date.now() - gwStart) }));

    const fgStart = Date.now();
    const fgPromise = getCanonicalDatasourceGateway().getFearGreed(1)
      .then((res) => ({ res, latencyMs: Math.max(1, Date.now() - fgStart) }))
      .catch(() => ({ res: null, latencyMs: Math.max(1, Date.now() - fgStart) }));

    const [kcTime, bnTime, gatewayProbe, fgProbe] = await Promise.allSettled([
      kcPromise,
      bnPromise,
      gatewayPromise,
      fgPromise,
    ]);

    if (kcTime.status === 'fulfilled' && kcTime.value.res.ok) {
      healthTracker.recordSuccess('KuCoin', kcTime.value.latencyMs);
    } else {
      const lat = kcTime.status === 'fulfilled' ? kcTime.value.latencyMs : undefined;
      healthTracker.recordFailure('KuCoin', 'Probe failed', false, lat);
    }

    if (bnTime.status === 'fulfilled' && bnTime.value.res.ok) {
      healthTracker.recordSuccess('Binance', bnTime.value.latencyMs);
    } else {
      const lat = bnTime.status === 'fulfilled' ? bnTime.value.latencyMs : undefined;
      healthTracker.recordFailure('Binance', 'Probe failed', false, lat);
    }

    if (gatewayProbe.status === 'fulfilled' && gatewayProbe.value?.res?.space4?.ok) {
      healthTracker.recordSuccess('HF Space 4', gatewayProbe.value.latencyMs);
    } else {
      const lat = gatewayProbe.status === 'fulfilled' ? gatewayProbe.value.latencyMs : undefined;
      healthTracker.recordFailure('HF Space 4', 'Probe failed', false, lat);
    }

    if (gatewayProbe.status === 'fulfilled' && gatewayProbe.value?.res?.space2?.ok) {
      healthTracker.recordSuccess('HF Space 2', gatewayProbe.value.latencyMs);
    } else {
      const lat = gatewayProbe.status === 'fulfilled' ? gatewayProbe.value.latencyMs : undefined;
      healthTracker.recordFailure('HF Space 2', 'Probe failed', false, lat);
    }

    if (fgProbe.status === 'fulfilled' && fgProbe.value?.res?.success && fgProbe.value.res.data.length > 0) {
      healthTracker.recordSuccess('Alternative.me', fgProbe.value.latencyMs);
    } else {
      const lat = fgProbe.status === 'fulfilled' ? fgProbe.value.latencyMs : undefined;
      healthTracker.recordFailure('Alternative.me', 'Probe failed', false, lat);
    }
  } catch {
    // Non-blocking telemetry
  }
}

// Initial bootstrap probe sweep
void runProviderHealthSweep();

app.get('/api/supplemental/config/status', (_req, res) => {
  const keyCounts = Object.fromEntries((Object.keys(DEFAULT_SUPPLEMENTAL_KEYS) as SupplementalKeyName[]).map((key) => [
    key,
    (supplementalKeys[key] ? 1 : 0) + supplementalReserveKeys[key].filter(Boolean).length,
  ]));
  res.json({
    ok: true,
    configured: supplementalConfigStatus(),
    verified: supplementalVerifiedStatus(),
    keyCounts,
    proxy: getRuntimeProxyConfig(),
    proxyHealth: getProxyPoolInfo(),
    proxyProbeHistory: proxyProbeHistory.list(),
    defaultPackLoaded: Boolean(bundledPrivateApiSeed.source),
    defaultPackSource: bundledPrivateApiSeed.source || null,
    newsApiQuery: supplementalNewsApiQuery,
    lastProbe: supplementalProbeCache,
    probeHistory: supplementalProbeHistory.list(),
  });
});

app.post('/api/supplemental/proxy/test', async (req, res) => {
  const checkedAt = Date.now();
  try {
    const probe = await probeProxyConfiguration(req.body?.proxy, [
      { provider: 'Binance Futures', url: `${BINANCE_FUTURES_BASE}/fapi/v1/time` },
      { provider: 'KuCoin Futures', url: `${KUCOIN_FUTURES_BASE}/api/v1/timestamp` },
      { provider: 'HF Space 2', url: `${HF_SPACE_2_ORIGIN.replace(/\/$/, '')}/api/new-sources/status` },
      { provider: 'HF Space 4', url: `${HF_SPACE_4_ORIGIN.replace(/\/$/, '')}/api/health` },
    ], 10_000);
    const passed = probe.results.filter((row) => row.ok).length;
    const state = passed === probe.results.length ? 'CONNECTED' : passed > 0 ? 'DEGRADED' : 'DISCONNECTED';
    const routes = new Set(probe.results.filter((row) => row.ok).map((row) => row.route));
    const route = routes.size > 1 ? 'mixed' : routes.values().next().value || 'none';
    const latencyMs = probe.results.length
      ? Math.round(probe.results.reduce((sum, row) => sum + row.latencyMs, 0) / probe.results.length)
      : null;
    // Draft testing an unsaved proxy configuration must not overwrite active-policy health.
    const draftSummary = `${passed}/${probe.results.length} fixed provider probes succeeded in ${probe.config.mode} mode`;
    return res.json({
      ok: passed > 0,
      state,
      ...probe,
      draftResult: { checkedAt: probe.checkedAt, state, latencyMs, route, summary: draftSummary },
      history: proxyProbeHistory.list(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_proxy_configuration';
    return res.status(400).json({ ok: false, state: 'MISCONFIGURED', error: message, checkedAt, results: [], history: proxyProbeHistory.list() });
  }
});

app.post('/api/supplemental/config', (req, res) => {
  const body = req.body ?? {};
  if (body.proxy !== undefined) {
    try { normalizeProxyConfig(body.proxy); } catch (error) { return res.status(400).json({ ok: false, error: (error as Error).message }); }
    try { saveProxySettings(body.proxy); } catch { return res.status(503).json({ ok: false, error: 'Proxy settings could not be saved. Previous mode remains active.' }); }
    // Clearing stale draft/prior diagnostics so new configuration starts with honest state
    proxyProbeHistory.clear();
    if (Object.keys(body).length === 1) return res.json({ ok: true, proxy: getRuntimeProxyConfig(), configured: supplementalConfigStatus(), verified: supplementalVerifiedStatus() });
  }
  const touched: SupplementalProbeKey[] = [];
  for (const key of Object.keys(DEFAULT_SUPPLEMENTAL_KEYS) as SupplementalKeyName[]) {
    if (typeof body[key] === 'string' && body[key].trim()) {
      supplementalKeys[key] = body[key].trim();
      touched.push(key);
    }
  }
  if (body.newsApiQuery && typeof body.newsApiQuery === 'object') {
    supplementalNewsApiQuery = normalizeNewsApiQuery(body.newsApiQuery);
  }
  // Changing a secret invalidates prior live verification for that key.
  clearSupplementalVerification(touched);
  persistSupplementalKeys();
  rebuildSupplementalOrchestrator();
  res.json({
    ok: true,
    configured: supplementalConfigStatus(),
    verified: supplementalVerifiedStatus(),
    newsApiQuery: supplementalNewsApiQuery,
  });
});

/** Restore Intelligence API keys to the completed Doc defaults (overwrites current store). */
app.post('/api/supplemental/config/defaults', (_req, res) => {
  supplementalKeys = { ...DEFAULT_SUPPLEMENTAL_KEYS };
  supplementalReserveKeys = Object.fromEntries(Object.entries(DEFAULT_SUPPLEMENTAL_RESERVE_KEYS).map(([key, rows]) => [key, [...rows]])) as SupplementalReserveKeyStore;
  supplementalNewsApiQuery = { ...DEFAULT_NEWSAPI_QUERY };
  clearSupplementalVerification();
  persistSupplementalKeys();
  rebuildSupplementalOrchestrator();
  res.json({
    ok: true,
    configured: supplementalConfigStatus(),
    verified: supplementalVerifiedStatus(),
    newsApiQuery: supplementalNewsApiQuery,
  });
});

async function probeSupplementalKeyFamily(key: SupplementalProbeKey): Promise<SupplementalProbeResult> {
  const candidates = [...new Set([supplementalKeys[key], ...(supplementalReserveKeys[key] || [])].map((value) => String(value || '').trim()).filter(Boolean))];
  if (!candidates.length) {
    return { key, ok: false, latencyMs: 0, status: 'EMPTY', detail: 'no key stored' };
  }

  let totalLatencyMs = 0;
  let lastResult: SupplementalProbeResult = { key, ok: false, latencyMs: 0, status: 'UNVERIFIED' };
  for (let index = 0; index < candidates.length; index += 1) {
    const result = await probeSupplementalKey(key, candidates[index], {
      newsApiQuery: key === 'newsApiKey' ? supplementalNewsApiQuery : undefined,
    });
    totalLatencyMs += Math.max(0, Number(result.latencyMs) || 0);
    lastResult = result;
    if (result.ok) {
      return {
        ...result,
        latencyMs: totalLatencyMs,
        detail: `${result.detail ? `${result.detail} · ` : ''}${index === 0 ? 'primary credential verified' : `reserve credential ${index} verified`} · ${candidates.length} key${candidates.length === 1 ? '' : 's'} in family`,
      };
    }
  }

  return {
    ...lastResult,
    latencyMs: totalLatencyMs,
    detail: `${lastResult.detail ? `${lastResult.detail} · ` : ''}all ${candidates.length} stored credential${candidates.length === 1 ? '' : 's'} failed live verification`,
  };
}

/** Probe one or all stored key families using the same bounded primary→reserve order as Smart routing. */
app.post('/api/supplemental/config/probe', async (req, res) => {
  const requested = typeof req.body?.key === 'string' ? String(req.body.key).trim() : '';
  const keys = (Object.keys(DEFAULT_SUPPLEMENTAL_KEYS) as SupplementalProbeKey[]);
  const targetKeys = requested
    ? keys.filter((k) => k === requested)
    : keys.filter((k) => Boolean(supplementalKeys[k]) || (supplementalReserveKeys[k]?.length || 0) > 0);

  if (requested && targetKeys.length === 0) {
    return res.status(400).json({ ok: false, error: 'unknown_key' });
  }

  const probeRows = await Promise.all(targetKeys.map(async (key) => [key, await probeSupplementalKeyFamily(key)] as const));
  const results: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>> = {};
  for (const [key, result] of probeRows) {
    results[key] = result;
    supplementalVerified[key] = result.ok;
    supplementalProbeCache[key] = result;
    const trackerName =
      key === 'newsApiKey' ? 'NewsAPI'
      : key === 'coinMarketCapKey' ? 'CoinMarketCap'
      : key === 'huggingFaceToken' ? 'HuggingFace'
      : key === 'etherscanKey' ? 'Etherscan'
      : key === 'tronScanKey' ? 'TronScan'
      : key === 'bscScanKey' ? 'BscScan'
      : null;
    if (trackerName) {
      if (result.ok) healthTracker.recordSuccess(trackerName, result.latencyMs);
      else healthTracker.recordFailure(trackerName, result.detail || result.status, false, result.latencyMs);
    }
  }

  const passed = probeRows.filter(([, result]) => result.ok).length;
  supplementalProbeHistory.record({
    checkedAt: Date.now(),
    state: passed === probeRows.length && probeRows.length > 0 ? 'CONNECTED' : passed > 0 ? 'DEGRADED' : targetKeys.length ? 'DISCONNECTED' : 'MISCONFIGURED',
    latencyMs: probeRows.length ? Math.round(probeRows.reduce((sum, [, result]) => sum + result.latencyMs, 0) / probeRows.length) : 0,
    route: 'mixed',
    summary: `${passed}/${probeRows.length} stored credential families passed live verification`,
  });

  persistSupplementalKeys();

  res.json({
    ok: true,
    results,
    configured: supplementalConfigStatus(),
    verified: supplementalVerifiedStatus(),
    history: supplementalProbeHistory.list(),
  });
});

/** Live feeds: Binance/KuCoin → approved HF Spaces → operator-key fallbacks. */
app.get('/api/intelligence/feeds', async (_req, res) => {
  try {
    const snapshot = await fetchIntelligenceFeedSnapshot({
      etherscanKey: supplementalKeys.etherscanKey,
      etherscanKeys: [supplementalKeys.etherscanKey, ...supplementalReserveKeys.etherscanKey],
      coinMarketCapKey: supplementalKeys.coinMarketCapKey,
      coinMarketCapKeys: [supplementalKeys.coinMarketCapKey, ...supplementalReserveKeys.coinMarketCapKey],
      newsApiKey: supplementalKeys.newsApiKey,
      newsApiKeys: [supplementalKeys.newsApiKey, ...supplementalReserveKeys.newsApiKey],
      newsApiQuery: supplementalNewsApiQuery,
    });
    res.json({ ok: true, ...snapshot });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'feed_failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Runtime external API source profiles (news/sentiment/on-chain/custom)
// These are operator-managed connection profiles. Secrets are persisted
// server-side and never returned by GET endpoints; the scanner only uses the
// typed supplemental keys above until a custom parser is explicitly wired.
// ─────────────────────────────────────────────────────────────────────────────
// Resolved outside the repository/source root (see privateConfigFile.ts);
// a legacy copy at the old repo-root path is migrated automatically once.
const EXTERNAL_SOURCES_CONFIG_PATH = resolvePrivateConfigPath(
  "external-api-sources.config.json",
  [path.resolve(process.cwd(), ".external-api-sources.config.json")],
);

type ExternalApiCategory = 'news' | 'sentiment' | 'onchain' | 'exchange' | 'webhook' | 'custom';
type ExternalApiMethod = 'GET' | 'POST';
type ExternalApiAuthType = 'none' | 'bearer' | 'apiKeyHeader' | 'apiKeyQuery' | 'customHeader';

interface ExternalApiSourceConfig {
  id: string;
  enabled: boolean;
  category: ExternalApiCategory;
  name: string;
  baseUrl: string;
  method: ExternalApiMethod;
  authType: ExternalApiAuthType;
  authKeyName?: string;
  secret?: string;
  parserHint?: string;
  notes?: string;
}

function sanitizeExternalSource(src: ExternalApiSourceConfig) {
  const { secret: _secret, ...rest } = src;
  return { ...rest, hasSecret: Boolean(src.secret && src.secret.trim()) };
}

function normalizeExternalSource(input: any, existing?: ExternalApiSourceConfig): ExternalApiSourceConfig | null {
  if (!input || typeof input !== 'object') return null;
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim().slice(0, 80) : crypto.randomUUID();
  const category = ['news', 'sentiment', 'onchain', 'exchange', 'webhook', 'custom'].includes(input.category)
    ? input.category as ExternalApiCategory
    : 'custom';
  const method = input.method === 'POST' ? 'POST' : 'GET';
  const authType = ['none', 'bearer', 'apiKeyHeader', 'apiKeyQuery', 'customHeader'].includes(input.authType)
    ? input.authType as ExternalApiAuthType
    : 'none';
  const secret = typeof input.secret === 'string' && input.secret.trim()
    ? input.secret.trim()
    : existing?.secret || '';
  return {
    id,
    enabled: Boolean(input.enabled),
    category,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 120) : `${category.toUpperCase()} Source`,
    baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl.trim().slice(0, 1200) : '',
    method,
    authType,
    authKeyName: typeof input.authKeyName === 'string' ? input.authKeyName.trim().slice(0, 120) : '',
    secret,
    parserHint: typeof input.parserHint === 'string' ? input.parserHint.trim().slice(0, 120) : '',
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 300) : '',
  };
}

function readExternalApiSources(): ExternalApiSourceConfig[] {
  try {
    if (!existsSync(EXTERNAL_SOURCES_CONFIG_PATH)) return [];
    const raw = JSON.parse(readFileSync(EXTERNAL_SOURCES_CONFIG_PATH, "utf8"));
    if (!Array.isArray(raw?.sources)) return [];
    return raw.sources.map((src: any) => normalizeExternalSource(src)).filter(Boolean) as ExternalApiSourceConfig[];
  } catch {
    return [];
  }
}

let externalApiSources: ExternalApiSourceConfig[] = readExternalApiSources();

function persistExternalApiSources(): void {
  try {
    writePrivateJsonFileSync(EXTERNAL_SOURCES_CONFIG_PATH, { sources: externalApiSources });
  } catch { /* runtime values still apply */ }
}

function attachedPrivateExternalSourceDefaults(): ExternalApiSourceConfig[] {
  const cryptoCompareKey = bundledPrivateApiSeed.additionalSecrets?.cryptoCompareKeys?.[0] || '';
  const rows: ExternalApiSourceConfig[] = [];
  if (cryptoCompareKey) {
    rows.push({
      id: 'default-cryptocompare-market',
      enabled: false,
      category: 'exchange',
      name: 'CryptoCompare · keyed market reference',
      baseUrl: 'https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH&tsyms=USD',
      method: 'GET',
      authType: 'apiKeyQuery',
      authKeyName: 'api_key',
      secret: cryptoCompareKey,
      parserHint: 'market-reference',
      notes: 'Attached private API pack · diagnostics/reference only; not futures execution evidence',
    });
  }
  return rows;
}

function allDefaultExternalSources(): ExternalApiSourceConfig[] {
  return [
    ...createCompletedDefaultExternalSources().map((src) => src as ExternalApiSourceConfig),
    ...attachedPrivateExternalSourceDefaults(),
  ];
}

function seedCompletedDefaultExternalSources(): void {
  const defaults = allDefaultExternalSources();
  const byId = new Map(externalApiSources.map((src) => [src.id, src]));
  let changed = false;
  for (const src of defaults) {
    if (!byId.has(src.id)) {
      externalApiSources.push(src);
      changed = true;
    }
  }
  if (changed) persistExternalApiSources();
}

seedCompletedDefaultExternalSources();

/** Merge / restore canonical keyless public/HF custom API profiles. */
app.post('/api/external-sources/config/defaults', (_req, res) => {
  const defaults = allDefaultExternalSources();
  const byId = new Map(externalApiSources.map((src) => [src.id, src]));
  for (const src of defaults) {
    byId.set(src.id, src);
  }
  externalApiSources = Array.from(byId.values());
  persistExternalApiSources();
  res.json({ ok: true, sources: externalApiSources.map(sanitizeExternalSource) });
});

function appendAuthToExternalRequest(src: ExternalApiSourceConfig, url: URL): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' };
  const secret = src.secret?.trim() || '';
  if (!secret || src.authType === 'none') return headers;

  const keyName = (src.authKeyName || '').trim();
  if (src.authType === 'bearer') headers.Authorization = `Bearer ${secret}`;
  if (src.authType === 'apiKeyHeader') headers[keyName || 'X-API-Key'] = secret;
  if (src.authType === 'customHeader') headers[keyName || 'Authorization'] = secret;
  if (src.authType === 'apiKeyQuery') url.searchParams.set(keyName || 'api_key', secret);
  return headers;
}

app.get('/api/external-sources/status', (_req, res) => {
  res.json({ ok: true, sources: externalApiSources.map(sanitizeExternalSource) });
});

app.post('/api/external-sources/config', (req, res) => {
  const incoming = Array.isArray(req.body?.sources) ? req.body.sources : [];
  const previous = new Map(externalApiSources.map((src) => [src.id, src]));
  externalApiSources = incoming
    .map((src: any) => normalizeExternalSource(src, typeof src?.id === 'string' ? previous.get(src.id) : undefined))
    .filter(Boolean) as ExternalApiSourceConfig[];
  persistExternalApiSources();
  res.json({ ok: true, sources: externalApiSources.map(sanitizeExternalSource) });
});

app.post('/api/external-sources/test', async (req, res) => {
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  const source = externalApiSources.find((src) => src.id === id);
  if (!source) return res.status(404).json({ ok: false, error: 'source_not_found' });
  if (!source.enabled) return res.status(200).json({ ok: false, error: 'source_disabled' });
  if (!/^https?:\/\//i.test(source.baseUrl)) return res.status(400).json({ ok: false, error: 'invalid_url' });

  const safety = await assertSafeOutboundUrlResolved(
    source.baseUrl,
    SSRF_PRIVATE_HOST_ALLOWLIST
  );
  if (!safety.ok || !safety.url) {
    return res.status(400).json({ ok: false, error: 'ssrf_blocked', reason: safety.reason || 'blocked' });
  }

  try {
    const url = safety.url;
    const headers = appendAuthToExternalRequest(source, url);
    const started = Date.now();
    const upstream = await fetch(url, {
      method: source.method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    res.json({
      ok: upstream.ok,
      status: upstream.status,
      latencyMs: Date.now() - started,
      contentType: upstream.headers.get('content-type') || '',
    });
  } catch (err: any) {
    res.status(200).json({ ok: false, error: err?.message || 'request_failed' });
  }
});

/**
 * GET /api/supplemental/news?symbol=BTCUSDT
 * Fetch crypto news for a symbol
 */
app.get('/api/supplemental/news', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTCUSDT';

  try {
    const orchestrator = getSupplementalOrchestrator();
    const result = await orchestrator.fetchNews(symbol);
    
    if (result.source !== 'not_configured') {
      healthTracker.recordSuccess('NewsAPI');
    } else {
      healthTracker.recordFailure('NewsAPI', 'Not configured', false);
    }

    res.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error';
    healthTracker.recordFailure('NewsAPI', reason, false);
    
    res.json({
      category: 'news',
      provider: 'aggregated',
      symbol,
      data: [],
      source: 'unavailable',
      status: 'FETCH_ERROR',
      reason,
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/supplemental/sentiment?symbol=BTCUSDT
 * Fetch market sentiment for a symbol
 */
app.get('/api/supplemental/sentiment', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTCUSDT';

  try {
    const orchestrator = getSupplementalOrchestrator();
    const result = await orchestrator.fetchSentiment(symbol);
    
    if (result.source === 'live') {
      healthTracker.recordSuccess('HuggingFace');
    } else if (result.source !== 'not_configured') {
      healthTracker.recordFailure('HuggingFace', result.reason || result.status, false);
    }

    res.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error';
    healthTracker.recordFailure('HuggingFace', reason, false);
    
    res.json({
      category: 'sentiment',
      provider: 'aggregated',
      symbol,
      data: { value: 0, label: 'NEUTRAL', confidence: 0 },
      source: 'unavailable',
      status: 'FETCH_ERROR',
      reason,
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/supplemental/onchain?symbol=ETHUSDT
 * Fetch on-chain signals (whale transfers, exchange movements)
 */
app.get('/api/supplemental/onchain', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'ETHUSDT';

  try {
    const orchestrator = getSupplementalOrchestrator();
    const result = await orchestrator.fetchOnChain(symbol);
    
    if (result.source === 'live' || result.source === 'degraded') {
      const provider = result.provider;
      if (provider === 'Etherscan' || provider === 'TronScan') {
        healthTracker.recordSuccess(provider);
      }
    }

    res.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error';
    healthTracker.recordFailure('Etherscan', reason, false);
    
    res.json({
      category: 'onchain',
      provider: 'aggregated',
      symbol,
      data: [],
      source: 'unavailable',
      status: 'FETCH_ERROR',
      reason,
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/supplemental/all?symbol=BTCUSDT
 * Fetch all supplemental intelligence in parallel
 */
app.get('/api/supplemental/all', async (req, res) => {
  const symbol = (req.query.symbol as string) || 'BTCUSDT';

  try {
    const orchestrator = getSupplementalOrchestrator();
    const results = await orchestrator.fetchAll(symbol);
    
    res.json({
      symbol,
      news: results.news,
      sentiment: results.sentiment,
      onchain: results.onchain,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error';
    
    res.json({
      symbol,
      error: true,
      reason,
      fetchedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/supplemental/health
 * Check which providers are configured and their status
 */
app.get('/api/supplemental/health', (_req, res) => {
  const orchestrator = getSupplementalOrchestrator();
  const providersStatus = orchestrator.getProvidersStatus();
  const healthSummary = healthTracker.getSummary();

  res.json({
    providers: providersStatus,
    health: healthSummary,
    trackedAt: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Adaptive-loop feedback + service health
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_START_MS = Date.now();

interface FeedbackSample {
  receivedAt: number;
  ticker: string;
  direction: "SHORT" | "LONG";
  outcome: "WIN" | "LOSS" | "BREAKEVEN";
  pnlPercentage: number;
  confidenceAdjustment: number;
}

// In-memory only, by design (no DB). Capped ring buffer.
const FEEDBACK_CAP = 500;
const feedbackStore: FeedbackSample[] = [];

// POST /api/feedback — receives a user-verified training sample for the
// client-side adaptive loop. Validated, stored in memory, never persisted.
app.post("/api/feedback", (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const direction =
    b.direction === "LONG" ? "LONG" : b.direction === "SHORT" ? "SHORT" : null;
  const outcome =
    b.outcome === "WIN" || b.outcome === "LOSS" || b.outcome === "BREAKEVEN"
      ? b.outcome
      : null;
  const pnl = Number(b.pnlPercentage);
  const adj = Number(b.confidenceAdjustment);

  if (!direction || !outcome || !Number.isFinite(pnl)) {
    return res
      .status(400)
      .json({ error: true, reason: "INVALID_FEEDBACK_PAYLOAD" });
  }

  const sample: FeedbackSample = {
    receivedAt: Date.now(),
    ticker: typeof b.ticker === "string" ? b.ticker.slice(0, 32) : "UNKNOWN",
    direction,
    outcome,
    pnlPercentage: pnl,
    confidenceAdjustment: Number.isFinite(adj) ? adj : 0,
  };

  feedbackStore.push(sample);
  if (feedbackStore.length > FEEDBACK_CAP) {
    feedbackStore.splice(0, feedbackStore.length - FEEDBACK_CAP);
  }

  const wins = feedbackStore.filter((s) => s.outcome === "WIN").length;
  res.json({
    ok: true,
    stored: feedbackStore.length,
    winRate: feedbackStore.length
      ? Math.round((wins / feedbackStore.length) * 100)
      : 0,
  });
});

// GET /api/health — provider-aware exchange connectivity and server status.
// exchangeClient uses the same proxy-aware smartFetchJson path as application
// routes, so the response labels the transport policy instead of claiming that
// these probes bypass the proxy layer.
app.get("/api/health", async (_req, res) => {
  const proxyInfo = getProxyPoolInfo();
  const supplementalOrchestrator = getSupplementalOrchestrator();
  const supplementalProviders = supplementalOrchestrator.getProvidersStatus();
  const supplementalHealth = healthTracker.getSummary();
  const supplementalStatus = deriveSupplementalStatus(supplementalHealth);

  // Run direct exchange checks in parallel (8s timeout each inside ecKucoin*)
  const [
    kcTicker,
    kcLevel2,
    kcCandles,
    kcContract,
    bnExchangeInfo,
    bnLongShort,
    bnTaker,
  ] = await Promise.all([
    ecKucoinTicker('XBTUSDTM'),
    ecKucoinLevel2('XBTUSDTM'),
    ecKucoinCandles('XBTUSDTM', 60),
    ecKucoinContract('XBTUSDTM'),
    ecBinanceExchangeInfo(),
    ecBinanceLongShort('BTCUSDT', '5m', 1),
    ecBinanceTaker('BTCUSDT', '5m', 1),
  ]);

  const kucoinStatus = deriveProbeStatus([kcTicker, kcLevel2, kcCandles, kcContract]);
  const binanceStatus = deriveProbeStatus([bnExchangeInfo, bnLongShort, bnTaker]);
  const proxyPoolStatus = deriveProxyPoolStatus(proxyInfo);
  lastPrimaryProviderProbe = {
    checkedAt: Date.now(),
    kucoin: kucoinStatus,
    binance: binanceStatus,
  };

  if (kucoinStatus === 'READY') healthTracker.recordSuccess('KuCoin');
  else healthTracker.recordFailure('KuCoin', 'KuCoin probe failed');

  if (binanceStatus === 'READY') healthTracker.recordSuccess('Binance');
  else healthTracker.recordFailure('Binance', 'Binance probe failed');

  const gateway = getCanonicalDatasourceGateway();
  const [hfHealth, fearGreed] = await Promise.all([
    gateway.probeHealth().catch(() => null),
    gateway.getFearGreed(1).catch(() => null),
  ]);

  if (hfHealth?.space4.ok) healthTracker.recordSuccess('HF Space 4');
  else if (hfHealth) healthTracker.recordFailure('HF Space 4', `HTTP ${hfHealth.space4.status}`);

  if (hfHealth?.space2.ok) healthTracker.recordSuccess('HF Space 2');
  else if (hfHealth) healthTracker.recordFailure('HF Space 2', `HTTP ${hfHealth.space2.status}`);

  if (fearGreed?.success && fearGreed.data.length > 0) healthTracker.recordSuccess('Alternative.me');
  else healthTracker.recordFailure('Alternative.me', 'Fear & Greed unavailable');

  // Strip large data payloads from health response (exchange info is huge)
  const slim = (r: any) =>
    r.ok
      ? { ok: true, exchange: r.exchange, route: r.route }
      : { ok: false, exchange: r.exchange, route: r.route, reason: r.reason, message: r.message, status: r.status };

  res.json({
    server:      'ok',
    marketMode:  'futures',
    timestamp:   new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - SERVER_START_MS) / 1000),
    // Legacy fields remain for existing consumers; the structured health
    // section below is the authoritative provider-aware contract.
    kucoinCoreStatus:        kucoinStatus === 'READY' ? 'LIVE' : kucoinStatus,
    binanceSentimentStatus:  binanceStatus === 'READY' ? 'LIVE' : binanceStatus,
    proxy: {
      kucoinBase:    KUCOIN_FUTURES_BASE,
      binanceBase:   BINANCE_FUTURES_BASE,
      mode:          proxyInfo.mode,
      poolSize:      proxyInfo.poolSize,
      healthyProxies: proxyInfo.healthy,
      smartDns:      proxyInfo.smartDns,
      smartProxyDiscovery: proxyInfo.smartProxyDiscovery,
      discoveryRoutes: proxyInfo.discoveryRoutes,
    },
    supplemental: supplementalStatus.toLowerCase(),
    health: {
      server: { status: 'READY' as const },
      kucoinCore: {
        status: kucoinStatus,
        probeMode: 'proxy_aware',
        transportPolicy: proxyInfo.mode,
      },
      binanceSentiment: {
        status: binanceStatus,
        probeMode: 'proxy_aware',
        transportPolicy: proxyInfo.mode,
      },
      supplemental: {
        status: supplementalStatus,
        configuredProviders: supplementalHealth.configuredProviders,
        configuredHealthyProviders: supplementalHealth.configuredHealthyProviders,
        configuredUnhealthyProviders: supplementalHealth.configuredUnhealthyProviders,
        providers: supplementalProviders,
      },
      proxyPool: {
        status: proxyPoolStatus,
        poolSize: proxyInfo.poolSize,
        healthyProxies: proxyInfo.healthy,
        smartDns: proxyInfo.smartDns,
        smartProxyDiscovery: proxyInfo.smartProxyDiscovery,
        discoveryRoutes: proxyInfo.discoveryRoutes,
      },
    },
    feedback: { samplesStored: feedbackStore.length },
    exchangeConnectivity: {
      kucoin: {
        ticker:   slim(kcTicker),
        level2:   slim(kcLevel2),
        candles:  slim(kcCandles),
        contract: slim(kcContract),
      },
      binance: {
        exchangeInfo: slim(bnExchangeInfo),
        longShort:    slim(bnLongShort),
        takerBuySell: slim(bnTaker),
      },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Telegram notifications (server-side only — bot token NEVER leaves the server)
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ENABLED
// ─────────────────────────────────────────────────────────────────────────────
// Resolved outside the repository/source root (see privateConfigFile.ts);
// a legacy copy at the old repo-root path is migrated automatically once.
const TELEGRAM_CONFIG_PATH = resolvePrivateConfigPath(
  "telegram.config.json",
  [path.resolve(process.cwd(), ".telegram.config.json")],
);

// Mutable so they can be updated at runtime via POST /api/telegram/config.
// Seed order: saved config file (if present) overrides environment variables.
let TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
let TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();
let TELEGRAM_ENABLED = (process.env.TELEGRAM_ENABLED || "false").trim().toLowerCase() === "true";

(function loadSavedTelegramConfig() {
  try {
    if (!existsSync(TELEGRAM_CONFIG_PATH)) return;
    const raw = JSON.parse(readFileSync(TELEGRAM_CONFIG_PATH, "utf8"));
    if (typeof raw?.botToken === "string" && raw.botToken.trim()) TELEGRAM_BOT_TOKEN = raw.botToken.trim();
    if (typeof raw?.chatId === "string" && raw.chatId.trim()) TELEGRAM_CHAT_ID = raw.chatId.trim();
    if (typeof raw?.enabled === "boolean") TELEGRAM_ENABLED = raw.enabled;
  } catch { /* corrupt/unreadable config is non-fatal — fall back to env */ }
})();

function persistTelegramConfig(value: { botToken: string; chatId: string; enabled: boolean }): void {
  writePrivateJsonFileSync(TELEGRAM_CONFIG_PATH, value);
}

function telegramConfigured(): boolean {
  return TELEGRAM_BOT_TOKEN.length > 0 && TELEGRAM_CHAT_ID.length > 0;
}

const telegramProbeHistory = new IntegrationHealthHistory(12);
let telegramLastTest: { ok: boolean; checkedAt: number; latencyMs: number; route: 'direct' | 'proxy' | 'none'; error: string | null } | null = null;

async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string; latencyMs?: number; route?: 'direct' | 'proxy' | 'none' }> {
  if (!telegramConfigured()) return { ok: false, error: "not_configured", latencyMs: 0, route: 'none' };
  const startedAt = Date.now();
  try {
    // Telegram Bot API — not an exchange route, but it still uses the same
    // proxy-aware server fetch path so DNS/proxy-restricted networks can send
    // tests. Token is interpolated into the URL path only and is never logged.
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const result = await smartFetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
      timeoutMs: 15_000,
      logKey: "telegram_send_message",
      cacheMode: "none",
      deduplicate: false,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.status ? `telegram_http_${result.status}` : "telegram_unreachable_proxy_or_dns",
        latencyMs: Date.now() - startedAt,
        route: result.route === 'direct' ? 'direct' : 'proxy',
      };
    }
    const json: any = result.json;
    if (json && json.ok === false) return { ok: false, error: "telegram_api_error", latencyMs: Date.now() - startedAt, route: result.route === 'direct' ? 'direct' : 'proxy' };
    return { ok: true, latencyMs: Date.now() - startedAt, route: result.route === 'direct' ? 'direct' : 'proxy' };
  } catch (err: any) {
    return { ok: false, error: err?.message || "telegram_unreachable", latencyMs: Date.now() - startedAt, route: 'none' };
  }
}

app.get("/api/telegram/status", (_req, res) => {
  // Never expose the token; only whether config is present and enabled.
  res.json({
    configured: telegramConfigured(),
    enabled: TELEGRAM_ENABLED && telegramConfigured(),
    chatConfigured: TELEGRAM_CHAT_ID.length > 0,
    tokenConfigured: TELEGRAM_BOT_TOKEN.length > 0,
    lastTest: telegramLastTest,
    history: telegramProbeHistory.list(),
  });
});

// Save bot token / chat id / enabled at runtime (persisted server-side; the
// token is write-only and is NEVER returned by any route). An empty/omitted
// botToken or chatId leaves the existing stored value untouched, so the user
// can update one field without re-pasting the token.
app.post("/api/telegram/config", (req, res) => {
  let next;
  try {
    next = persistTelegramConfigUpdate(
      { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID, enabled: TELEGRAM_ENABLED },
      req.body,
      persistTelegramConfig,
    );
  }
  catch { return res.status(503).json({ ok: false, error: 'telegram_config_persist_failed', configured: telegramConfigured(), enabled: TELEGRAM_ENABLED && telegramConfigured(), chatConfigured: TELEGRAM_CHAT_ID.length > 0, tokenConfigured: TELEGRAM_BOT_TOKEN.length > 0 }); }
  TELEGRAM_BOT_TOKEN = next.botToken;
  TELEGRAM_CHAT_ID = next.chatId;
  TELEGRAM_ENABLED = next.enabled;
  res.json({
    ok: true,
    configured: telegramConfigured(),
    enabled: TELEGRAM_ENABLED && telegramConfigured(),
    chatConfigured: TELEGRAM_CHAT_ID.length > 0,
    tokenConfigured: TELEGRAM_BOT_TOKEN.length > 0,
  });
});

app.get("/api/market/open-interest-history/:symbol", (req, res) => {
  const symbol = String(req.params.symbol || '').trim();
  const hours = Math.max(1, Math.min(24 * 14, Number(req.query.hours || 24)));
  const venue = typeof req.query.venue === 'string' ? req.query.venue.trim() : undefined;
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol_required' });
  const series = openInterestHistoryStore.series(symbol, { venue, since: Date.now() - hours * 60 * 60_000 });
  res.json({ ok: true, ...series });
});

app.get("/api/market/open-interest-history", (_req, res) => {
  res.json({ ok: true, ...openInterestHistoryStore.stats() });
});

function historicalResearchWindow(body: unknown): { since: number; until: number } {
  const row = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const hours = Math.max(1, Math.min(24 * 30, Number(row.hours || 24)));
  const until = Number.isFinite(Number(row.until)) ? Math.floor(Number(row.until)) : Date.now();
  return { since: until - hours * 60 * 60_000, until };
}

app.get('/api/research/microstructure/status', (_req, res) => {
  const repository = getLiquidityHunterRuntime()?.historicalMicrostructure;
  if (!repository) return res.status(503).json({ ok: false, error: 'historical_microstructure_capture_not_enabled' });
  return res.json({ ok: true, path: repository.storagePath(), stats: repository.stats(), executionAuthorized: false });
});

app.get('/api/research/microstructure/l1/:symbol', (req, res) => {
  const repository = getLiquidityHunterRuntime()?.historicalMicrostructure;
  if (!repository) return res.status(503).json({ ok: false, error: 'historical_microstructure_capture_not_enabled' });
  const symbol = String(req.params.symbol || '').trim();
  const venue = typeof req.query.venue === 'string' ? req.query.venue.trim() : undefined;
  const hours = Math.max(1, Math.min(24 * 30, Number(req.query.hours || 24)));
  try {
    const series = repository.l1Series(symbol, { venue, since: Date.now() - hours * 60 * 60_000 });
    return res.json({ ok: true, ...series, quotes: series.quotes.slice(-20_000), executionAuthorized: false });
  } catch (error) { return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'historical_l1_query_invalid' }); }
});

app.get('/api/research/microstructure/l2/:symbol', (req, res) => {
  const repository = getLiquidityHunterRuntime()?.historicalMicrostructure;
  if (!repository) return res.status(503).json({ ok: false, error: 'historical_microstructure_capture_not_enabled' });
  const symbol = String(req.params.symbol || '').trim();
  const venue = typeof req.query.venue === 'string' ? req.query.venue.trim() : undefined;
  const hours = Math.max(1, Math.min(24 * 30, Number(req.query.hours || 24)));
  try {
    const since = Date.now() - hours * 60 * 60_000;
    const series = repository.l2Series(symbol, { venue, since });
    const top = repository.l2TopOfBookSeries(symbol, { venue, since }).slice(-20_000);
    return res.json({ ok: true, status: series.status, corruptLines: series.corruptLines, sequenceErrors: series.sequenceErrors, finalBook: series.finalBook, topOfBook: top, executionAuthorized: false });
  } catch (error) { return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : 'historical_l2_query_invalid' }); }
});

app.post('/api/research/market-making/cross-venue/simulate', (req, res) => {
  const repository = getLiquidityHunterRuntime()?.historicalMicrostructure;
  if (!repository) return res.status(503).json({ ok: false, error: 'historical_microstructure_capture_not_enabled' });
  const symbol = String(req.body?.symbol || '').trim();
  const makerVenue = String(req.body?.makerVenue || '').trim();
  const hedgeVenue = String(req.body?.hedgeVenue || '').trim();
  const window = historicalResearchWindow(req.body);
  try {
    const maker = repository.l2TopOfBookSeries(symbol, { venue: makerVenue, ...window }).slice(-20_000);
    const hedge = repository.l2TopOfBookSeries(symbol, { venue: hedgeVenue, ...window }).slice(-20_000);
    if (maker.length < 2 || hedge.length < 2) return res.status(409).json({ ok: false, error: 'historical_two_venue_l2_insufficient', makerTicks: maker.length, hedgeTicks: hedge.length });
    const result = simulateCrossVenueMarketMaking(maker, hedge, { makerVenue, hedgeVenue, ...(req.body?.config || {}) });
    return res.json({ ok: true, symbol, result });
  } catch (error) { return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : 'cross_venue_simulation_failed' }); }
});

app.post('/api/research/market-making/funding-aware/simulate', (req, res) => {
  const repository = getLiquidityHunterRuntime()?.historicalMicrostructure;
  if (!repository) return res.status(503).json({ ok: false, error: 'historical_microstructure_capture_not_enabled' });
  const symbol = String(req.body?.symbol || '').trim();
  const venue = String(req.body?.venue || '').trim();
  const window = historicalResearchWindow(req.body);
  try {
    const ticks = repository.l2TopOfBookSeries(symbol, { venue, ...window }).slice(-20_000);
    const funding = repository.fundingSeries(symbol, { venue, ...window }).slice(-5_000);
    if (ticks.length < 4) return res.status(409).json({ ok: false, error: 'historical_l2_insufficient', ticks: ticks.length, fundingRows: funding.length });
    const result = simulateFundingAwareAvellaneda(ticks, funding, req.body?.config || {});
    return res.json({ ok: true, symbol, venue, fundingRows: funding.length, result });
  } catch (error) { return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : 'funding_aware_simulation_failed' }); }
});

app.post("/api/telegram/test", async (_req, res) => {
  if (!telegramConfigured()) {
    const checkedAt = Date.now();
    telegramLastTest = { ok: false, checkedAt, latencyMs: 0, route: 'none', error: 'not_configured' };
    telegramProbeHistory.record({ checkedAt, state: 'MISCONFIGURED', latencyMs: 0, route: 'none', summary: 'Telegram bot token or chat id is not configured' });
    return res.status(200).json({ ok: false, error: "not_configured" });
  }
  const result = await sendTelegramMessage("✅ APEX Trading Engine — Telegram test message. Notifications are wired correctly.");
  const checkedAt = Date.now();
  telegramLastTest = { ok: result.ok, checkedAt, latencyMs: result.latencyMs ?? 0, route: result.route ?? 'none', error: result.error ?? null };
  telegramProbeHistory.record({
    checkedAt,
    state: result.ok ? 'CONNECTED' : 'DISCONNECTED',
    latencyMs: result.latencyMs ?? 0,
    route: result.route ?? 'none',
    summary: result.ok ? 'Telegram Bot API test message delivered' : `Telegram test failed: ${result.error || 'unknown_error'}`,
  });
  res.status(200).json({ ...result, checkedAt, history: telegramProbeHistory.list() });
});

app.post("/api/telegram/send", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.slice(0, 3500) : "";
  if (!text) return res.status(400).json({ ok: false, error: "missing_text" });
  if (!TELEGRAM_ENABLED || !telegramConfigured()) {
    // App must work without Telegram — this is a non-fatal, honest no-op.
    return res.status(200).json({ ok: false, error: "disabled_or_unconfigured" });
  }
  const result = await sendTelegramMessage(text);
  res.status(200).json(result);
});

async function initializeDecisionMemoryDatasetDurability(): Promise<void> {
  if (!decisionMemoryMirror) return;

  const restore = await restoreDecisionMemoryFromDataset(decisionMemoryMirror);
  console.log(`[Decision Memory Dataset] restore status=${restore.status} rows=${restore.rowCount}`);

  if (!isDecisionMemoryDatasetSyncConfigured()) return;
  const intervalMs = getDecisionMemoryDatasetSyncIntervalMs();
  setInterval(() => {
    void syncDecisionMemoryToDataset(decisionMemoryMirror).then((result) => {
      console.log(`[Decision Memory Dataset] sync status=${result.status} rows=${result.rowCount}`);
    });
  }, intervalMs).unref?.();
}

function initializeOpenInterestHistorySampler(): void {
  const intervalMs = Math.max(60_000, Math.min(60 * 60_000, Number(process.env.APEX_OI_SAMPLE_INTERVAL_MS || 5 * 60_000)));
  let lastWarningAt = 0;
  openInterestSampler = new OpenInterestSampler({
    intervalMs,
    initialDelayMs: Math.max(5_000, Math.min(5 * 60_000, Number(process.env.APEX_OI_INITIAL_DELAY_MS || 45_000))),
    maxBackoffMs: 30 * 60_000,
    store: openInterestHistoryStore,
    sample: async () => {
      const snapshot = await getTickers(20);
      const observedAt = Date.now();
      return snapshot.tickers
        .filter((ticker) => Number.isFinite(ticker.openInterest) && ticker.openInterest > 0)
        .map((ticker) => ({
          symbol: ticker.symbol,
          venue: snapshot.source,
          openInterestUsd: ticker.openInterest,
          observedAt,
          sourceTimestamp: null,
          provenance: `marketDataService:${snapshot.source}:verified-current-oi`,
          dataState: ticker.dataState === 'live' ? 'live' as const : 'degraded' as const,
        }));
    },
    onError: (error) => {
      const now = Date.now();
      if (now - lastWarningAt < 5 * 60_000) return;
      lastWarningAt = now;
      console.warn(JSON.stringify({ level: 'warn', event: 'open_interest_sampler_retry_scheduled', message: error instanceof Error ? error.message : 'unknown_error' }));
    },
  });
  openInterestSampler.start();
}

async function reconcilePersistedTestnetOrders(): Promise<void> {
  const readiness = getTestnetReadiness();
  const store = testnetStore();
  if (readiness.state !== 'READY' || !store) {
    testnetReconciliationState = { status: 'NOT_CONFIGURED', lastRunAt: new Date().toISOString(), reason: readiness.missing.join('; ') || 'testnet_not_ready' };
    return;
  }
  const candidates = store.all().filter((order) => ['SUBMITTING', 'ACKNOWLEDGED', 'PARTIALLY_FILLED', 'UNKNOWN', 'RECONCILING', 'CANCEL_PENDING'].includes(order.status));
  try {
    await Promise.all(candidates.map((order) => reconcileTestnetOrder(order)));
    testnetReconciliationState = { status: 'SYNCED', lastRunAt: new Date().toISOString(), reason: null };
  } catch (error) {
    testnetReconciliationState = { status: 'DEGRADED', lastRunAt: new Date().toISOString(), reason: error instanceof Error ? error.message : 'startup_reconciliation_failed' };
  }
}

function logProxyStartup(): void {
  const proxy = getProxyPoolInfo();
  if (proxy.smartProxyDiscovery) {
    console.log(
      `[Proxy] mode=${proxy.mode} smartDns=${proxy.smartDns} lazyRoutes=${proxy.discoveryRoutes} `
      + `(direct first; loopback proxy discovery activates only after a retryable direct failure)`,
    );
    return;
  }
  if (proxy.poolSize === 0) {
    console.warn(
      '[Proxy] No PROXY_POOL_URLS — Binance and supplemental providers use direct-only Node fetch. '
      + 'If routes time out, copy .env.example to .env (local proxy on :10808) and restart.',
    );
    return;
  }
  console.log(
    `[Proxy] mode=${proxy.mode} smartDns=${proxy.smartDns} routes=${proxy.poolSize} healthy=${proxy.healthy} `
    + `maxConcurrency=${proxy.maxConcurrency} `
    + `(SOCKS5/HTTP pool — supplemental providers use adaptive direct/proxy routing)`,
  );
}

async function startServer() {
  await ensureApexPortAvailable({
    port: PORT,
    host: HOST,
    workspaceRoot: process.cwd(),
    force: /^(1|true|yes)$/i.test(process.env.APEX_FORCE_PORT_TAKEOVER || ''),
  });
  initializeLiquidityHunterFoundation(process.env, {
    shadowContextProvider: async (symbol) => {
      const context = await buildLiquidityHunterShadowContext(symbol, 'background');
      return {
        smartMoneyContext: context.smartMoneyContext,
        currentPrice: context.currentPrice,
      };
    },
  });
  await initializeDecisionMemoryDatasetDurability();
  initializeOpenInterestHistorySampler();
  await reconcilePersistedTestnetOrders();
  const distPath = path.resolve(process.cwd(), "dist");

  // Serve the pre-built bundle ONLY in production. Previously this also triggered
  // whenever dist/index.html merely existed, which silently shadowed live source
  // edits in dev behind a stale build. Set NODE_ENV=production (or APEX_SERVE_DIST=1)
  // to serve the static bundle.
  const serveStatic = process.env.NODE_ENV === "production" || process.env.APEX_SERVE_DIST === "1";
  if (serveStatic && existsSync(path.join(distPath, "index.html"))) {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });

    activeHttpServer = app.listen(PORT, HOST, () => {
      console.log(`[Proxy Server] Live at http://${HOST}:${PORT} (production/static)`);
      logProxyStartup();
      if (OPERATOR_TOKEN) console.log('[Security] Operator token required for mutating /api POST routes');
      else console.log('[Security] Operator token not set — local/same-origin CSRF guard only');
    });
    liquidityHunterWsGateway = attachLiquidityHunterWebSocketGateway(activeHttpServer);

    return;
  }

  process.env.APEX_VITE_MIDDLEWARE = '1';
  const httpServer = createHttpServer(app);
  activeHttpServer = httpServer;
  liquidityHunterWsGateway = attachLiquidityHunterWebSocketGateway(httpServer);
  const hmrEnabled = process.env.DISABLE_HMR !== 'true' && process.env.APEX_ENABLE_HMR === 'true';
  // Loaded here, not at module scope, so the production server never resolves
  // vite (a devDependency). This branch is dev-only: production returned above.
  const { createServer: createViteServerLazy } = await import("vite");
  const vite = await createViteServerLazy({
    server: {
      middlewareMode: hmrEnabled ? { server: httpServer } : true,
      port: PORT,
      strictPort: true,
      hmr: hmrEnabled
        ? {
            server: httpServer,
            port: PORT,
            clientPort: PORT,
            host: '127.0.0.1',
          }
        : false,
    },
    plugins: hmrEnabled ? [] : [{
      name: 'apex-disable-vite-hmr-client',
      transformIndexHtml(html) {
        return html.replace(/\n?\s*<script type="module" src="\/@vite\/client"><\/script>/, '');
      },
    }],
    appType: "spa",
  });

  activeViteServer = vite;
  app.use(vite.middlewares);

  httpServer.listen(PORT, HOST, () => {
    console.log(`[Proxy Server] Live at http://${HOST}:${PORT} (vite middleware)`);
    logProxyStartup();
    if (OPERATOR_TOKEN) console.log('[Security] Operator token required for mutating /api POST routes');
    else console.log('[Security] Operator token not set — local/same-origin CSRF guard only');
    if (hmrEnabled) {
      console.log(`[Vite] HMR enabled at ws://127.0.0.1:${PORT}`);
    } else {
      console.log('[Vite] HMR disabled (integrated dev). Set APEX_ENABLE_HMR=true to enable.');
    }
  });
}

// Periodic state maintenance — bound memory of proxy health, LKG cache,
// cooldowns and the Binance symbol-support cache.
const maintenanceTimer = setInterval(() => {
  try {
    pruneProxyState();
    pruneProviderRouterState();
    pruneHfSpacesClientState();
    mutationRateLimiter.prune();
    computeRateLimiter.prune();
    void runProviderHealthSweep();
  } catch (err) {
    console.warn("[Proxy Server] prune cycle failed", err);
  }
}, 30_000);
maintenanceTimer.unref?.();

async function closeHttpServer(deadlineMs: number): Promise<void> {
  const server = activeHttpServer;
  if (!server) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };
    server.close(finish);
    server.closeIdleConnections?.();
    timer = setTimeout(() => {
      server.closeAllConnections?.();
      finish();
    }, deadlineMs);
    timer.unref?.();
  });
}

async function gracefulShutdown(signal: 'SIGINT' | 'SIGTERM' | 'uncaught_exception' | 'unhandled_rejection'): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  acceptingRequests = false;
  clearInterval(maintenanceTimer);
  apexNextMarketRoutes.stopSmartAutopilotScheduler();
  openInterestSampler?.stop();
  openInterestSampler = null;
  const deadlineMs = Math.max(1_000, Math.min(30_000, Number(process.env.APEX_SHUTDOWN_DEADLINE_MS || 10_000)));
  console.log(JSON.stringify({ level: 'info', event: 'shutdown_started', signal, deadlineMs }));
  const hardExit = setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', event: 'shutdown_deadline_exceeded', signal, deadlineMs }));
    process.exit(1);
  }, deadlineMs + 500);
  hardExit.unref?.();

  try {
    await Promise.allSettled([
      closeHttpServer(deadlineMs),
      activeViteServer?.close() ?? Promise.resolve(),
      liquidityHunterWsGateway?.close() ?? Promise.resolve(),
      shutdownLiquidityHunterFoundation(),
    ]);
    console.log(JSON.stringify({ level: 'info', event: 'shutdown_complete', signal }));
    clearTimeout(hardExit);
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'shutdown_failed', signal, message: error instanceof Error ? error.message : 'unknown_error' }));
    clearTimeout(hardExit);
    process.exit(1);
  }
}

process.once('SIGINT', () => { void gracefulShutdown('SIGINT'); });
process.once('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });

// Process-level safety net: an uncaught exception or unhandled rejection anywhere
// in the request pipeline (routes, providers, the liquidity-hunter workers) must
// never crash the process silently or leave it in an unknown state. Log with full
// context, then fail closed via the same graceful-shutdown path already used for
// SIGINT/SIGTERM so in-flight connections are drained instead of hard-killed.
let terminatingOnFatalError = false;
function handleFatalProcessError(kind: 'uncaught_exception' | 'unhandled_rejection', error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('EBUSY') && (message.includes('watch') || message.includes('locked'))) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'transient_fs_watch_error',
      message,
    }));
    return;
  }
  console.error(JSON.stringify({
    level: 'error',
    event: kind,
    message,
    stack: error instanceof Error ? error.stack : undefined,
  }));
  if (terminatingOnFatalError) return;
  terminatingOnFatalError = true;
  acceptingRequests = false;
  void gracefulShutdown(kind);
}
process.on('uncaughtException', (error) => handleFatalProcessError('uncaught_exception', error));
process.on('unhandledRejection', (reason) => handleFatalProcessError('unhandled_rejection', reason));

startServer().catch((error) => {
  acceptingRequests = false;
  console.error(JSON.stringify({ level: 'error', event: 'startup_failed', message: error instanceof Error ? error.message : 'unknown_error' }));
  process.exitCode = 1;
});
