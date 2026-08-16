#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const foundationFiles = [
  'src/contracts/realtime/evidenceValue.ts',
  'src/contracts/realtime/marketEvent.ts',
  'src/contracts/realtime/marketPayloads.ts',
  'src/contracts/realtime/worldState.ts',
  'src/contracts/realtime/edgeEvidence.ts',
  'src/contracts/realtime/edgeThreshold.ts',
  'src/contracts/realtime/liquidityHunterState.ts',
  'src/contracts/realtime/executionPositionState.ts',
  'src/contracts/realtime/websocketMessages.ts',
  'src/services/realtime/inProcessEventBus.ts',
  'src/services/realtime/appendOnlyEventLog.ts',
  'src/services/realtime/worldStateStore.ts',
  'src/services/realtime/realtimeSeriesStore.ts',
  'src/services/realtime/orderBookRebuilder.ts',
  'src/services/realtime/sequenceGuard.ts',
  'src/services/realtime/snapshotCoordinator.ts',
  'src/services/realtime/realtimeHealth.ts',
  'src/services/realtime/publicFeedTypes.ts',
  'src/services/realtime/binanceUsdmPublicFeed.ts',
  'src/services/realtime/kucoinFuturesPublicFeed.ts',
  'src/services/realtime/bybitLinearPublicFeed.ts',
  'src/services/realtime/publicFeedManager.ts',
  'src/services/realtime/deribitOptionsPublicFeed.ts',
  'src/services/realtime/hyperliquidWalletObservationFeed.ts',
  'src/services/realtime/deribitOptionMath.ts',
  'src/services/realtime/deribitOptionsHistoricalImporter.ts',
  'src/services/realtime/hyblockLiquidationTopologyFeed.ts',
  'src/services/realtime/hyperliquidWalletHistoryGradingFeed.ts',
  'src/services/realtime/evidenceProviderManager.ts',
  'src/services/realtime/sentimentVelocityFeed.ts',
  'src/services/liquidityHunter/edgeCatalog.ts',
  'src/services/liquidityHunter/featureFlags.ts',
  'src/services/liquidityHunter/fusionPolicy.ts',
  'src/services/liquidityHunter/foundationRuntime.ts',
  'src/services/liquidityHunter/restContextBootstrap.ts',
  'src/services/liquidityHunter/restContextBootstrapCore.ts',
  'src/services/replay/eventReplayReader.ts',
  'src/services/replay/replayDatasetManifest.ts',
  'src/services/replay/eventReplayRunner.ts',
  'src/services/replay/liquidityHunterOutcomeAnalysis.ts',
  'src/services/replay/liquidityHunterWalkForwardValidation.ts',
  'src/services/replay/microstructureFillSimulator.ts',
  'src/services/replay/liquidityHunterMicrostructureValidation.ts',
  'src/services/liquidityHunter/paperCanary.ts',
  'src/services/liquidityHunter/shadowEvaluationScheduler.ts',
  'src/services/readPlane/liquidityHunterWebSocketGateway.ts',
  'src/services/execution/executionPositionStateMachine.ts',
];

const coreFiles = [
  'src/services/liquidityHunter/edgeRuntime.ts',
  'src/services/liquidityHunter/edges/fundingOiEdge.ts',
  'src/services/liquidityHunter/edges/sessionLiquidityEdge.ts',
  'src/services/liquidityHunter/edges/liquidationTopologyEdge.ts',
  'src/services/liquidityHunter/edges/multiExchangeCvdEdge.ts',
  'src/services/liquidityHunter/edges/icebergAbsorptionEdge.ts',
  'src/services/liquidityHunter/edges/optionsGammaEdge.ts',
  'src/services/liquidityHunter/edges/whalePositioningEdge.ts',
  'src/services/liquidityHunter/edges/contrarianWalletEdge.ts',
  'src/services/liquidityHunter/edges/sentimentVelocityEdge.ts',
  'src/services/liquidityHunter/edges/metaModelEdge.ts',
  'src/services/liquidityHunter/layer1MacroEvaluator.ts',
  'src/services/liquidityHunter/layer2TargetEvaluator.ts',
  'src/services/liquidityHunter/layer3MicrostructureEvaluator.ts',
  'src/services/liquidityHunter/layer4ShadowValidator.ts',
  'src/services/liquidityHunter/setupStateMachine.ts',
  'src/services/liquidityHunter/dynamicFusionEngine.ts',
  'src/services/liquidityHunter/decisionBridge.ts',
  'src/services/liquidityHunter/historicalSimilarityMetaModel.ts',
  'src/services/liquidityHunter/researchReadiness.ts',
];

const flags = read('src/services/liquidityHunter/featureFlags.ts');
const catalog = read('src/services/liquidityHunter/edgeCatalog.ts');
const policy = read('src/services/liquidityHunter/fusionPolicy.ts');
const engine = read('src/services/liquidityHunter/dynamicFusionEngine.ts');
const eventBus = read('src/services/realtime/inProcessEventBus.ts');
const eventLog = read('src/services/realtime/appendOnlyEventLog.ts');
const coordinator = read('src/services/realtime/snapshotCoordinator.ts');
const routes = `${read('server.ts')}\n${read('src/services/apexNextMarketRoutes.ts')}`;
const operations = read('src/services/operationsStatus.ts');
const runtime = read('src/services/liquidityHunter/foundationRuntime.ts');
const env = read('.env.example');
const optimizerRoute = read('src/services/apexNextMarketRoutes.ts');
const optimizerValidation = read('src/services/apiValidation.ts');
const optimizer = read('src/services/strategyOptimization.ts');
const restBootstrap = read('src/services/liquidityHunter/restContextBootstrap.ts');
const publicExchangeClient = read('src/services/providers/publicExchangeClient.ts');
const fundingOiEdge = read('src/services/liquidityHunter/edges/fundingOiEdge.ts');
const marketEvent = read('src/contracts/realtime/marketEvent.ts');
const readPlane = read('src/services/readPlane/liquidityHunterWebSocketGateway.ts');
const binanceFeed = read('src/services/realtime/binanceUsdmPublicFeed.ts');
const kucoinFeed = read('src/services/realtime/kucoinFuturesPublicFeed.ts');
const bybitFeed = read('src/services/realtime/bybitLinearPublicFeed.ts');
const replayRunner = read('src/services/replay/eventReplayRunner.ts');
const deribitProvider = read('src/services/realtime/deribitOptionsPublicFeed.ts');
const hyperliquidObserver = read('src/services/realtime/hyperliquidWalletObservationFeed.ts');
const deribitHistory = read('src/services/realtime/deribitOptionsHistoricalImporter.ts');
const hyblockProvider = read('src/services/realtime/hyblockLiquidationTopologyFeed.ts');
const hyperliquidHistory = read('src/services/realtime/hyperliquidWalletHistoryGradingFeed.ts');
const microSimulator = read('src/services/replay/microstructureFillSimulator.ts');
const microValidation = read('src/services/replay/liquidityHunterMicrostructureValidation.ts');
const walletWhale = read('src/services/liquidityHunter/edges/whalePositioningEdge.ts');
const walletContrarian = read('src/services/liquidityHunter/edges/contrarianWalletEdge.ts');
const eventValidation = read('src/services/replay/liquidityHunterWalkForwardValidation.ts');
const paperCanary = read('src/services/liquidityHunter/paperCanary.ts');
const sentimentFeed = read('src/services/realtime/sentimentVelocityFeed.ts');
const metaModel = read('src/services/liquidityHunter/historicalSimilarityMetaModel.ts');
const researchReadiness = read('src/services/liquidityHunter/researchReadiness.ts');
const shadowEvaluationScheduler = read('src/services/liquidityHunter/shadowEvaluationScheduler.ts');
const validationCli = read('scripts/utilities/validateLiquidityHunterRecording.mts');

const checks = [
  ['all realtime foundation files exist', foundationFiles.every(exists)],
  ['all Liquidity Hunter core files exist', coreFiles.every(exists)],
  ['ten edges are registered', (catalog.match(/edgeId:\s*'/g) ?? []).length === 10],
  ['all catalog edges are evidence only', (catalog.match(/availability:[^\n]+evidenceOnly:\s*true/g) ?? []).length === 10],
  ['missing feature flags default false', flags.includes("String(value ?? '').trim()")],
  ['shadow-only cannot be disabled', flags.includes('liquidity_hunter_shadow_only_cannot_be_disabled_in_core_release')],
  ['autonomous live execution is hardcoded false', flags.includes('autonomousLiveExecutionEnabled: false')],
  ['automatic Liquidity Hunter promotion stays false', policy.includes('automaticPromotionEnabled: false')],
  ['majority voting is forbidden', policy.includes('majorityVoteAllowed: false')],
  ['Layer 4 cannot rescue deterministic rejection', policy.includes('layer4MayRescueDeterministicFailure: false')],
  ['edge evaluation uses concurrent read-only multitasking', engine.includes('Promise.allSettled')],
  ['public funding/OI context uses concurrent bounded provider reads', restBootstrap.includes('Promise.allSettled')],
  ['public funding/OI context uses Binance + KuCoin independent primary Futures sources', restBootstrap.includes('BINANCE_FUNDING_OI_BOOTSTRAP_SOURCE') && restBootstrap.includes('KUCOIN_FUNDING_OI_BOOTSTRAP_SOURCE') && publicExchangeClient.includes('/api/ua/v1/market/funding-rate-history') && publicExchangeClient.includes('/api/ua/v1/market/open-interest') && fundingOiEdge.includes('primaryPairActive') && fundingOiEdge.includes('primary_futures_funding_direction_conflict')],
  ['historical bootstrap timestamps are explicitly distinguished from live events', marketEvent.includes("'HISTORICAL_BOOTSTRAP'")],
  ['fusion remains non-authoritative', engine.includes('authoritative: false') && engine.includes('shadowOnly: true')],
  ['read-plane websocket is bounded and execution-read-only', readPlane.includes('MAX_CLIENTS = 64') && readPlane.includes('executionAuthorized: false') && readPlane.includes('read_only_channel')],
  ['public Binance feed normalizes trades quotes and sequence-linked depth', binanceFeed.includes("type: 'TRADE'") && binanceFeed.includes("type: 'QUOTE'") && binanceFeed.includes("type: 'ORDERBOOK_DELTA'") && binanceFeed.includes('previousSequence')],
  ['public KuCoin Futures feed uses public-token transport, canonical USDTM contracts and fail-closed sequence-linked L2', kucoinFeed.includes('/api/v1/bullet-public') && kucoinFeed.includes('toKuCoinUsdtmContract') && kucoinFeed.includes("type: 'TRADE'") && kucoinFeed.includes("type: 'ORDERBOOK_DELTA'") && kucoinFeed.includes('previousSequence') && kucoinFeed.includes('reseedDepth')],
  ['public Bybit feed is explicitly non-authoritative for book sequencing', bybitFeed.includes('unsequenced/non-authoritative') && !bybitFeed.includes('previousSequence:')],
  ['event replay uses deterministic IDs and manifest verification', replayRunner.includes('deterministicIdFactory') && replayRunner.includes('verifyReplayDatasetManifest')],
  ['Deribit option proxy is credential-free, allowlisted, and explicitly non-authoritative', deribitProvider.includes('deribit_base_url_not_allowlisted') && deribitProvider.includes('DERIBIT_PUBLIC_TAKER_FLOW_EVENT_TIME_IV_GAMMA_PROXY') && deribitProvider.includes('Neither path claims to reconstruct complete dealer inventory')],
  ['Hyperliquid wallet observer pseudonymizes before the event bus and remains UNRATED', hyperliquidObserver.includes("grade: 'UNRATED'") && hyperliquidObserver.includes("createHash('sha256')") && hyperliquidObserver.includes('gradingReady: false')],
  ['Hyblock topology adapter is allowlisted, predictive, and keeps API keys out of events', hyblockProvider.includes('hyblock_base_url_not_allowlisted') && hyblockProvider.includes('HYBLOCK_PREDICTIVE_LIQUIDATION_HEATMAP_V2') && !hyblockProvider.includes('payload: { apiKey')],
  ['Deribit historical importer uses event-time endpoint and reports bounded incomplete coverage', deribitHistory.includes('get_last_trades_by_currency_and_time') && deribitHistory.includes('incompleteWindows.push') && deribitHistory.includes('openInterest: null')],
  ['Hyperliquid history grading paginates funding and fails closed at the public fill-history ceiling', hyperliquidHistory.includes('MAX_TIME_RANGE_ROWS = 500') && hyperliquidHistory.includes('MAX_ACCESSIBLE_FILL_ROWS = 10_000') && hyperliquidHistory.includes('completeHistory = false')],
  ['microstructure simulation is venue-isolated and uses a persistent bounded worker pool', microSimulator.includes('executionSource') && microSimulator.includes('const worker = new Worker') && microSimulator.includes('while (true)') && microValidation.includes('resolveExecutionSource') && microValidation.includes("version: 'lh_microstructure_validation_v2'")],
  ['observation-only wallet events cannot self-declare S/F grades', walletWhale.includes("observationOnly ?\n    ? 'UNRATED'") === false && walletWhale.includes("? 'UNRATED'") && walletContrarian.includes("? 'UNRATED'")],
  ['event-level validation is purged/embargoed with a final holdout and no promotion', eventValidation.includes('purgeMs') && eventValidation.includes('embargoMs') && eventValidation.includes("role: 'HOLDOUT'") && eventValidation.includes('automaticPromotionEnabled: false')],
  ['paper canary has no exchange/order dependency', paperCanary.includes('executionDependency: false') && paperCanary.includes('orderSubmissionAllowed: false')],
  ['sentiment velocity is wired through the existing supplemental provider chain without duplicate-score fabrication', sentimentFeed.includes('getSupplementalOrchestrator') && sentimentFeed.includes('lastFingerprint') && sentimentFeed.includes("type: 'SENTIMENT_EVENT'")],
  ['meta model uses fingerprinted DEVELOPMENT-only historical similarity and rejects holdout training', metaModel.includes('meta_model_holdout_training_forbidden') && metaModel.includes('trainingDatasetSha256') && metaModel.includes("datasetRole: 'DEVELOPMENT'")],
  ['meta model remains a second-pass shadow validator after independent edge multitasking', engine.includes('this.metaModel.evaluate(evidence, now)') && engine.includes("createUnavailableEdgeEvidence('META_MODEL'")],
  ['research readiness is advisory only and cannot authorize execution or automatic promotion', researchReadiness.includes('executionAuthorized: false') && researchReadiness.includes('automaticPromotionEnabled: false') && researchReadiness.includes("'MANUAL_REVIEW_ELIGIBLE'")],
  ['paper canary has a bounded unattended shadow-evaluation scheduler with no order dependency', shadowEvaluationScheduler.includes('paperCanary.capture') && shadowEvaluationScheduler.includes('engine.evaluate') && shadowEvaluationScheduler.includes('executionDependency: false') && shadowEvaluationScheduler.includes('orderSubmissionAllowed: false') && !/submitOrder|placeOrder|createTradePlan|executionAuthorized:\s*true/.test(shadowEvaluationScheduler)],
  ['paper canary scheduler starts only after persisted canary state initializes', runtime.includes('paperCanaryInitialization.then') && runtime.includes('runtime?.shadowEvaluation === shadowEvaluation')],
  ['paper canary unattended scheduler fails closed on persistence corruption', runtime.includes('paperCanary.snapshot(1).lastPersistenceError') && runtime.includes('paper_canary_persistence_unavailable')],
  ['recording validation exposes the advisory research-readiness gate', validationCli.includes('evaluateLiquidityHunterResearchReadiness') && validationCli.includes('researchReadinessBlockers')],
  ['server wires the scheduler through the shadow context without automatic submission', routes.includes('shadowContextProvider: async (symbol)') && routes.includes('buildLiquidityHunterShadowContext(symbol)') && routes.includes('explicit_liquidity_hunter_testnet_confirmation_required')],
  ['unattended Paper Canary context fetches use background request priority', routes.includes("buildLiquidityHunterShadowContext(symbol, 'background')") && restBootstrap.includes('priority?: SmartFetchPriority') && restBootstrap.includes("input.priority ?? 'interactive'")],
  ['event logging uses a worker thread', eventLog.includes("from 'node:worker_threads'") && eventLog.includes('new Worker(')],
  ['authoritative trades are not sampleable by default', eventBus.includes("if (event.type === 'SENTIMENT_EVENT') return 'SAMPLEABLE'")],
  ['sequence gaps invalidate dependent world state', coordinator.includes('worldState.invalidate')],
  ['operations route remains read-only', routes.includes("app.get('/api/operations/liquidity-hunter'")],
  ['shadow evaluation route exists', routes.includes("app.post('/api/liquidity-hunter/shadow/evaluate'" )],
  ['only explicit manual-testnet Liquidity Hunter submission exists and autonomous live remains absent', routes.includes("app.post('/api/liquidity-hunter/manual-testnet/:setupId/submit'") && routes.includes('explicit_liquidity_hunter_testnet_confirmation_required') && !/app\.(post|put|patch|delete)\(['\"]\/api\/liquidity-hunter\/live/.test(routes)],
  ['operations status exposes core state', operations.includes('liquidityHunter: OperationsLiquidityHunterSection') && runtime.includes("'CORE_READY'")],
  ['graceful shutdown flush is wired', routes.includes('shutdownLiquidityHunterFoundation()')],
  ['all documented flags are in env example', [
    'APEX_LIQUIDITY_HUNTER_ENABLED',
    'APEX_LIQUIDITY_HUNTER_SHADOW_ONLY',
    'APEX_REALTIME_EVENT_RECORDING_ENABLED',
    'APEX_LIQUIDITY_HUNTER_PUBLIC_FEEDS_ENABLED',
    'APEX_LIQUIDITY_HUNTER_BINANCE_WS_ENABLED',
    'APEX_LIQUIDITY_HUNTER_KUCOIN_WS_ENABLED',
    'APEX_LIQUIDITY_HUNTER_BYBIT_WS_ENABLED',
    'APEX_LIQUIDITY_HUNTER_SYMBOLS',
    'APEX_REALTIME_L2_ENABLED',
    'APEX_OPTIONS_GEX_ENABLED',
    'APEX_LIQUIDITY_HUNTER_DERIBIT_OPTIONS_ENABLED',
    'APEX_LIQUIDITY_HUNTER_HYBLOCK_LIQUIDATION_ENABLED',
    'APEX_WALLET_GRADING_ENABLED',
    'APEX_LIQUIDITY_HUNTER_HYPERLIQUID_WALLET_OBSERVER_ENABLED',
    'APEX_LIQUIDITY_HUNTER_HYPERLIQUID_WALLET_HISTORY_GRADING_ENABLED',
    'APEX_SENTIMENT_VELOCITY_ENABLED',
    'APEX_META_MODEL_ENABLED',
    'APEX_LIQUIDITY_HUNTER_WS_ENABLED',
    'APEX_LIQUIDITY_HUNTER_PAPER_CANARY',
    'APEX_LIQUIDITY_HUNTER_SHADOW_EVALUATION_INTERVAL_MS',
    'APEX_LIQUIDITY_HUNTER_SHADOW_EVALUATION_CONCURRENCY',
    'APEX_LIQUIDITY_HUNTER_TESTNET_CANARY',
  ].every((name) => env.includes(name))],
  ['no edge is registered as an executable strategy', !read('src/services/strategyRegistry.ts').includes("strategyId: 'LIQUIDATION_TOPOLOGY'")],
  ['optimizer defaults to manual promotion', /parseBoolean\(input\.autoPromote,\s*false\)/.test(optimizerValidation)],
  ['legacy optimizer auto-promotion remains disabled and separate from Liquidity Hunter', !optimizerRoute.includes('if (value.autoPromote && report.promotion.eligible)') && optimizerRoute.includes('legacy_auto_promote_ignored_use_smart_autopilot_cycle')],
  ['optimizer has purge and embargo isolation', optimizer.includes('purgeBars') && optimizer.includes('embargoBars') && optimizer.includes('validationIsolation')],
];

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures += 1;
}
console.log(`\nLiquidity Hunter core source contract: ${checks.length - failures}/${checks.length} PASS`);
process.exit(failures === 0 ? 0 : 1);
