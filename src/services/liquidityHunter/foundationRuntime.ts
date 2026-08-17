import path from 'node:path';
import { AppendOnlyEventLog } from '../realtime/appendOnlyEventLog';
import { InProcessEventBus } from '../realtime/inProcessEventBus';
import { RealtimeHealthTracker, type RealtimeHealthSnapshot } from '../realtime/realtimeHealth';
import { RealtimeSeriesStore } from '../realtime/realtimeSeriesStore';
import { OrderBookRebuilder } from '../realtime/orderBookRebuilder';
import { SequenceGuard } from '../realtime/sequenceGuard';
import { SnapshotCoordinator } from '../realtime/snapshotCoordinator';
import { WorldStateStore } from '../realtime/worldStateStore';
import { PublicFeedManager, type PublicFeedManagerSnapshot } from '../realtime/publicFeedManager';
import { EvidenceProviderManager, type EvidenceProviderManagerSnapshot } from '../realtime/evidenceProviderManager';
import { getEdgeCatalog, summarizeEdgeCatalog, type EdgeAvailability } from './edgeCatalog';
import { readLiquidityHunterFeatureFlags, type LiquidityHunterFeatureFlags } from './featureFlags';
import { LIQUIDITY_HUNTER_CORE_FUSION_POLICY } from './fusionPolicy';
import { LiquidityHunterDynamicFusionEngine } from './dynamicFusionEngine';
import { LiquidityHunterPaperCanary, type LiquidityHunterPaperCanarySnapshot } from './paperCanary';
import { loadHistoricalSimilarityMetaModel, type LiquidityHunterMetaModelEvaluator } from './historicalSimilarityMetaModel';
import { LiquidityHunterShadowEvaluationScheduler, type LiquidityHunterShadowContextProvider, type LiquidityHunterShadowEvaluationSchedulerSnapshot } from './shadowEvaluationScheduler';
import { EdgeThresholdGovernanceStore, type EdgeThresholdGovernanceSnapshot } from './edgeThresholdRegistry';
import { HistoricalMicrostructureRepository, type HistoricalMicrostructureStats } from '../research/historicalMicrostructure';

export interface LiquidityHunterOperationsSnapshot {
  status: 'DISABLED' | 'CORE_READY' | 'DEGRADED';
  shadowOnly: true;
  executionDependency: false;
  autonomousLiveExecutionEnabled: false;
  flags: LiquidityHunterFeatureFlags;
  edgeCatalog: Record<EdgeAvailability, number> & { total: number };
  realtime: RealtimeHealthSnapshot & {
    queue: ReturnType<InProcessEventBus['stats']>;
    worldStateEntries: number;
    seriesKeys: number;
    seriesEvents: number;
    orderBooksTracked: number;
    recordingPath: string | null;
    setupRecordingPath: string | null;
    historicalMicrostructurePath: string | null;
    historicalMicrostructure: HistoricalMicrostructureStats | null;
    publicFeeds: PublicFeedManagerSnapshot;
    evidenceProviders: EvidenceProviderManagerSnapshot;
    paperCanary: LiquidityHunterPaperCanarySnapshot;
    shadowEvaluation: LiquidityHunterShadowEvaluationSchedulerSnapshot;
  };
  thresholdGovernance: EdgeThresholdGovernanceSnapshot;
  policy: {
    version: string;
    automaticPromotionEnabled: false;
    majorityVoteAllowed: false;
    layer4MayRescueDeterministicFailure: false;
  };
  reasons: string[];
}

export interface FoundationRuntime {
  flags: LiquidityHunterFeatureFlags;
  bus: InProcessEventBus;
  worldState: WorldStateStore;
  seriesStore: RealtimeSeriesStore;
  orderBook: OrderBookRebuilder;
  sequenceGuard: SequenceGuard;
  health: RealtimeHealthTracker;
  eventLog: AppendOnlyEventLog | null;
  setupEventLog: AppendOnlyEventLog | null;
  coordinator: SnapshotCoordinator;
  engine: LiquidityHunterDynamicFusionEngine;
  edgeThresholdGovernance: EdgeThresholdGovernanceStore;
  publicFeeds: PublicFeedManager;
  evidenceProviders: EvidenceProviderManager;
  paperCanary: LiquidityHunterPaperCanary;
  unsubscribePaperCanary: (() => void) | null;
  historicalMicrostructure: HistoricalMicrostructureRepository | null;
  unsubscribeHistoricalMicrostructure: (() => void) | null;
  shadowEvaluation: LiquidityHunterShadowEvaluationScheduler | null;
  recordingPath: string | null;
  setupRecordingPath: string | null;
  initializedAt: number;
}

export interface LiquidityHunterFoundationOptions {
  shadowContextProvider?: LiquidityHunterShadowContextProvider;
}

let runtime: FoundationRuntime | null = null;
let initializationError: string | null = null;
let metaModelInitializationError: string | null = null;

function safeReadFlags(env: Record<string, string | undefined>): LiquidityHunterFeatureFlags {
  try {
    return readLiquidityHunterFeatureFlags(env);
  } catch (error) {
    initializationError = error instanceof Error ? error.message : 'liquidity_hunter_flag_validation_failed';
    return readLiquidityHunterFeatureFlags({});
  }
}

function finiteBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function initializeLiquidityHunterFoundation(
  env: Record<string, string | undefined> = process.env,
  options: LiquidityHunterFoundationOptions = {},
): LiquidityHunterOperationsSnapshot {
  if (runtime) return getLiquidityHunterOperationsSnapshot();
  initializationError = null;
  metaModelInitializationError = null;
  try {
    const flags = safeReadFlags(env);
    const bus = new InProcessEventBus({
      maxQueuePerSource: finiteBoundedInt(env.APEX_REALTIME_QUEUE_MAX_PER_SOURCE, 1_024, 8, 100_000),
    });
    const worldState = new WorldStateStore();
    const seriesStore = new RealtimeSeriesStore({
      maxEventsPerKey: finiteBoundedInt(env.APEX_REALTIME_SERIES_MAX_PER_KEY, 5_000, 32, 100_000),
      maxAgeMs: finiteBoundedInt(env.APEX_REALTIME_SERIES_MAX_AGE_MS, 24 * 60 * 60 * 1_000, 60_000, 30 * 24 * 60 * 60 * 1_000),
    });
    const orderBook = new OrderBookRebuilder();
    const sequenceGuard = new SequenceGuard();
    const health = new RealtimeHealthTracker();
    const recordingPath = flags.realtimeEventRecordingEnabled
      ? path.resolve(env.APEX_REALTIME_EVENT_LOG_PATH || '.apex-data/liquidity-hunter/events.jsonl')
      : null;
    const eventLog = recordingPath
      ? new AppendOnlyEventLog({
          filePath: recordingPath,
          maxSegmentBytes: finiteBoundedInt(
            env.APEX_REALTIME_EVENT_SEGMENT_BYTES,
            16 * 1024 * 1024,
            64 * 1024,
            512 * 1024 * 1024,
          ),
          maxSegments: finiteBoundedInt(env.APEX_REALTIME_EVENT_MAX_SEGMENTS, 8, 1, 1_000),
          fsync: true,
        })
      : null;
    const historicalCaptureEnabled = String(env.APEX_HISTORICAL_MICROSTRUCTURE_CAPTURE_ENABLED || '').trim().toLowerCase() === 'true';
    const historicalMicrostructure = historicalCaptureEnabled
      ? new HistoricalMicrostructureRepository({
          ...(String(env.APEX_HISTORICAL_MICROSTRUCTURE_PATH || '').trim() ? { filePath: path.resolve(String(env.APEX_HISTORICAL_MICROSTRUCTURE_PATH)) } : {}),
          maxSegmentBytes: finiteBoundedInt(env.APEX_HISTORICAL_MICROSTRUCTURE_SEGMENT_BYTES, 32 * 1024 * 1024, 64 * 1024, 512 * 1024 * 1024),
          maxSegments: finiteBoundedInt(env.APEX_HISTORICAL_MICROSTRUCTURE_MAX_SEGMENTS, 32, 1, 1_000),
          fsync: true,
        })
      : null;
    const unsubscribeHistoricalMicrostructure = historicalMicrostructure
      ? bus.subscribe(async (event) => { await historicalMicrostructure.appendMarketEvent(event); })
      : null;

    const setupRecordingPath = flags.liquidityHunterEnabled
      ? path.resolve(env.APEX_LIQUIDITY_HUNTER_SETUP_LOG_PATH || '.apex-data/liquidity-hunter/setup-transitions.jsonl')
      : null;
    const setupEventLog = setupRecordingPath
      ? new AppendOnlyEventLog({
          filePath: setupRecordingPath,
          maxSegmentBytes: finiteBoundedInt(env.APEX_REALTIME_EVENT_SEGMENT_BYTES, 16 * 1024 * 1024, 64 * 1024, 512 * 1024 * 1024),
          maxSegments: finiteBoundedInt(env.APEX_REALTIME_EVENT_MAX_SEGMENTS, 8, 1, 1_000),
          fsync: true,
        })
      : null;
    const coordinator = new SnapshotCoordinator({ eventBus: bus, worldState, sequenceGuard, health, eventLog, seriesStore, orderBook });
    let metaModel: LiquidityHunterMetaModelEvaluator | null = null;
    if (flags.metaModelEnabled) {
      const artifactPath = String(env.APEX_META_MODEL_ARTIFACT_PATH || '').trim();
      if (!artifactPath) {
        metaModelInitializationError = 'meta_model_enabled_without_artifact';
      } else {
        try {
          metaModel = loadHistoricalSimilarityMetaModel(path.resolve(artifactPath));
        } catch (error) {
          metaModelInitializationError = `meta_model_artifact_invalid:${error instanceof Error ? error.message : String(error)}`;
        }
      }
    }
    const edgeThresholdGovernance = new EdgeThresholdGovernanceStore(
      env.APEX_LIQUIDITY_HUNTER_EDGE_THRESHOLD_PATH || '.apex-data/liquidity-hunter/edge-thresholds.json',
    );
    const engine = new LiquidityHunterDynamicFusionEngine({
      flags,
      worldState,
      seriesStore,
      orderBook,
      metaModel,
      edgeThresholdResolver: (edgeId, symbol, timeframe, regime) => edgeThresholdGovernance.resolveForRuntime(edgeId, symbol, timeframe, regime),
      setupEventLog,
    });
    const requestedSymbols = String(env.APEX_LIQUIDITY_HUNTER_SYMBOLS || 'BTC-USDT')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const publicFeeds = new PublicFeedManager({
      enabled: flags.publicFeedsEnabled,
      binanceEnabled: flags.binancePublicFeedEnabled,
      kucoinEnabled: flags.kucoinPublicFeedEnabled,
      bybitEnabled: flags.bybitPublicFeedEnabled,
      symbols: requestedSymbols,
      eventBus: bus,
    });
    const hyperliquidWallets = String(env.APEX_HYPERLIQUID_WALLET_WATCHLIST || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const evidenceProviders = new EvidenceProviderManager({
      deribitOptionsEnabled: flags.deribitOptionsPublicEnabled,
      hyblockLiquidationEnabled: flags.hyblockLiquidationTopologyEnabled,
      hyperliquidWalletObserverEnabled: flags.hyperliquidWalletObserverEnabled,
      hyperliquidWalletHistoryGradingEnabled: flags.hyperliquidWalletHistoryGradingEnabled,
      sentimentVelocityEnabled: flags.sentimentVelocityEnabled,
      symbols: requestedSymbols,
      hyperliquidWallets,
      eventBus: bus,
      deribitBaseUrl: env.APEX_DERIBIT_PUBLIC_BASE_URL,
      hyblockApiKey: env.APEX_HYBLOCK_API_KEY,
      hyblockBaseUrl: env.APEX_HYBLOCK_API_BASE_URL,
      hyblockExchange: env.APEX_HYBLOCK_LIQUIDATION_EXCHANGE,
      hyblockLookback: env.APEX_HYBLOCK_LIQUIDATION_LOOKBACK,
      hyblockPollIntervalMs: finiteBoundedInt(env.APEX_HYBLOCK_LIQUIDATION_POLL_MS, 60_000, 30_000, 10 * 60_000),
      deribitPollIntervalMs: finiteBoundedInt(env.APEX_DERIBIT_OPTIONS_POLL_MS, 20_000, 5_000, 120_000),
      hyperliquidPollIntervalMs: finiteBoundedInt(env.APEX_HYPERLIQUID_WALLET_POLL_MS, 60_000, 15_000, 10 * 60_000),
      hyperliquidConcurrency: finiteBoundedInt(env.APEX_HYPERLIQUID_WALLET_CONCURRENCY, 4, 1, 8),
      hyperliquidHistoryPollIntervalMs: finiteBoundedInt(env.APEX_HYPERLIQUID_WALLET_HISTORY_POLL_MS, 6 * 60 * 60_000, 30 * 60_000, 24 * 60 * 60_000),
      hyperliquidHistoryLookbackDays: finiteBoundedInt(env.APEX_HYPERLIQUID_WALLET_HISTORY_LOOKBACK_DAYS, 60, 14, 180),
      hyperliquidHistoryConcurrency: finiteBoundedInt(env.APEX_HYPERLIQUID_WALLET_HISTORY_CONCURRENCY, 2, 1, 4),
      sentimentPollIntervalMs: finiteBoundedInt(env.APEX_SENTIMENT_VELOCITY_POLL_MS, 15_000, 5_000, 5 * 60_000),
      sentimentConcurrency: finiteBoundedInt(env.APEX_SENTIMENT_VELOCITY_CONCURRENCY, 2, 1, 4),
    });
    const paperCanary = new LiquidityHunterPaperCanary({
      enabled: flags.paperCanaryEnabled,
      storePath: env.APEX_LIQUIDITY_HUNTER_PAPER_CANARY_STORE_PATH || '.apex-data/liquidity-hunter/paper-canary.json',
      horizonMs: finiteBoundedInt(env.APEX_LIQUIDITY_HUNTER_PAPER_CANARY_HORIZON_MS, 60 * 60_000, 60_000, 24 * 60 * 60_000),
      maxRecords: finiteBoundedInt(env.APEX_LIQUIDITY_HUNTER_PAPER_CANARY_MAX_RECORDS, 1_000, 10, 10_000),
    });
    const paperCanaryInitialization = paperCanary.initialize();
    const unsubscribePaperCanary = flags.paperCanaryEnabled
      ? bus.subscribe((event) => paperCanary.onMarketEvent(event))
      : null;
    const shadowEvaluation = flags.paperCanaryEnabled && options.shadowContextProvider
      ? new LiquidityHunterShadowEvaluationScheduler({
          enabled: true,
          symbols: requestedSymbols,
          intervalMs: finiteBoundedInt(env.APEX_LIQUIDITY_HUNTER_SHADOW_EVALUATION_INTERVAL_MS, 30_000, 10_000, 10 * 60_000),
          maxConcurrency: finiteBoundedInt(env.APEX_LIQUIDITY_HUNTER_SHADOW_EVALUATION_CONCURRENCY, 2, 1, 4),
          engine,
          paperCanary,
          contextProvider: options.shadowContextProvider,
        })
      : null;
    coordinator.start();
    publicFeeds.start();
    evidenceProviders.start();
    runtime = {
      flags,
      bus,
      worldState,
      seriesStore,
      orderBook,
      sequenceGuard,
      health,
      eventLog,
      setupEventLog,
      coordinator,
      engine,
      edgeThresholdGovernance,
      publicFeeds,
      evidenceProviders,
      paperCanary,
      unsubscribePaperCanary,
      historicalMicrostructure,
      unsubscribeHistoricalMicrostructure,
      shadowEvaluation,
      recordingPath,
      setupRecordingPath,
      initializedAt: Date.now(),
    };
    void paperCanaryInitialization.then(() => {
      if (paperCanary.snapshot(1).lastPersistenceError) return;
      if (runtime?.shadowEvaluation === shadowEvaluation) shadowEvaluation?.start();
    });
    return getLiquidityHunterOperationsSnapshot();
  } catch (error) {
    initializationError = error instanceof Error ? error.message : 'liquidity_hunter_initialization_failed';
    return getLiquidityHunterOperationsSnapshot(env);
  }
}

export function getLiquidityHunterRuntime(): FoundationRuntime | null {
  return runtime;
}

export function getLiquidityHunterOperationsSnapshot(
  env: Record<string, string | undefined> = process.env,
): LiquidityHunterOperationsSnapshot {
  const flags = runtime?.flags ?? safeReadFlags(env);
  const enabled = flags.liquidityHunterEnabled || flags.realtimeEventRecordingEnabled;
  const health = runtime?.health.snapshot(enabled) ?? new RealtimeHealthTracker().snapshot(false);
  const reasons: string[] = [];
  if (!enabled) reasons.push('liquidity_hunter_core_disabled_by_default');
  if (initializationError) reasons.push(initializationError);
  if (metaModelInitializationError) reasons.push(metaModelInitializationError);
  if (flags.publicFeedsEnabled && !flags.binancePublicFeedEnabled && !flags.kucoinPublicFeedEnabled && !flags.bybitPublicFeedEnabled) reasons.push('public_feeds_enabled_but_no_exchange_feed_selected');
  if (flags.realtimeL2Enabled && (runtime?.orderBook.stats().books ?? 0) === 0) reasons.push('l2_enabled_but_no_valid_orderbook_adapter_data_seen');
  if (flags.optionsGexEnabled && !flags.deribitOptionsPublicEnabled) reasons.push('options_gex_enabled_without_public_or_verified_provider');
  if (flags.deribitOptionsPublicEnabled) reasons.push('deribit_options_public_flow_uses_event_time_iv_gamma_when_available_but_is_not_complete_dealer_inventory');
  if (flags.hyblockLiquidationTopologyEnabled && !String(env.APEX_HYBLOCK_API_KEY || '').trim()) reasons.push('hyblock_liquidation_topology_enabled_without_api_key');
  if (flags.hyblockLiquidationTopologyEnabled) reasons.push('hyblock_predictive_liquidation_topology_is_external_provider_evidence_and_remains_shadow_only');
  if (flags.walletGradingEnabled && !flags.hyperliquidWalletObserverEnabled && !flags.hyperliquidWalletHistoryGradingEnabled) reasons.push('wallet_grading_enabled_without_public_observer_or_verified_grading_provider');
  if (flags.hyperliquidWalletObserverEnabled) reasons.push('hyperliquid_public_wallet_observer_is_unrated_observation_only_and_not_a_grading_provider');
  if (flags.hyperliquidWalletHistoryGradingEnabled) reasons.push('hyperliquid_wallet_grading_uses_realized_public_fills_and_funding_only_and_remains_shadow_only');
  if (flags.sentimentVelocityEnabled) reasons.push('sentiment_velocity_uses_existing_supplemental_provider_chain_and_remains_shadow_only');
  if (flags.metaModelEnabled) reasons.push('meta_model_uses_versioned_development_only_historical_similarity_artifact_and_remains_shadow_only');
  if (flags.paperCanaryEnabled) reasons.push('paper_canary_tracks_signal_outcomes_only_and_never_submits_orders');
  const paperCanaryPersistenceError = runtime?.paperCanary.snapshot(1).lastPersistenceError ?? null;
  if (flags.paperCanaryEnabled && paperCanaryPersistenceError) reasons.push('paper_canary_persistence_unavailable');
  if (flags.paperCanaryEnabled && !runtime?.shadowEvaluation) reasons.push('paper_canary_shadow_evaluation_context_provider_unavailable');
  if (flags.testnetCanaryEnabled) reasons.push('testnet_canary_wired_to_risk_authorized_trade_plan_and_requires_explicit_manual_confirmation');

  const degraded = Boolean(initializationError) || health.status === 'DEGRADED' || Boolean(paperCanaryPersistenceError);
  return {
    status: !enabled ? 'DISABLED' : degraded ? 'DEGRADED' : 'CORE_READY',
    shadowOnly: true,
    executionDependency: false,
    autonomousLiveExecutionEnabled: false,
    flags,
    edgeCatalog: summarizeEdgeCatalog(),
    realtime: {
      ...health,
      queue: runtime?.bus.stats() ?? {
        published: 0,
        delivered: 0,
        sampled: 0,
        rejected: 0,
        handlerFailures: 0,
        queued: 0,
      },
      worldStateEntries: runtime?.worldState.snapshot().entries.length ?? 0,
      seriesKeys: runtime?.seriesStore.stats().keys ?? 0,
      seriesEvents: runtime?.seriesStore.stats().events ?? 0,
      orderBooksTracked: runtime?.orderBook.stats().books ?? 0,
      recordingPath: runtime?.recordingPath ?? null,
      setupRecordingPath: runtime?.setupRecordingPath ?? null,
      historicalMicrostructurePath: runtime?.historicalMicrostructure?.storagePath() ?? null,
      historicalMicrostructure: runtime?.historicalMicrostructure?.stats() ?? null,
      publicFeeds: runtime?.publicFeeds.snapshot() ?? { enabled: false, symbols: [], feeds: [] },
      evidenceProviders: runtime?.evidenceProviders.snapshot() ?? { providers: [] },
      paperCanary: runtime?.paperCanary.snapshot(20) ?? { enabled: false, executionDependency: false, orderSubmissionAllowed: false, open: 0, resolved: 0, records: [], lastPersistenceError: null },
      shadowEvaluation: runtime?.shadowEvaluation?.snapshot() ?? { enabled: false, running: false, executionDependency: false, orderSubmissionAllowed: false, symbols: [], intervalMs: 30_000, evaluations: 0, captures: 0, failures: 0, lastRunAt: null, lastSuccessAt: null, lastError: null },
    },
    thresholdGovernance: runtime?.edgeThresholdGovernance.snapshot() ?? {
      version: 'lh_edge_threshold_governance_v1',
      activeRevision: 1,
      activeProfiles: [],
      proposals: [],
      history: [],
      automaticPromotionEnabled: false,
    },
    policy: {
      version: LIQUIDITY_HUNTER_CORE_FUSION_POLICY.version,
      automaticPromotionEnabled: false,
      majorityVoteAllowed: false,
      layer4MayRescueDeterministicFailure: false,
    },
    reasons,
  };
}

export function getLiquidityHunterEdgeCatalog() {
  return getEdgeCatalog();
}

export async function shutdownLiquidityHunterFoundation(): Promise<void> {
  const current = runtime;
  runtime = null;
  if (!current) return;
  current.unsubscribePaperCanary?.();
  current.unsubscribeHistoricalMicrostructure?.();
  await Promise.allSettled([current.shadowEvaluation?.stop(), current.publicFeeds.stop(), current.evidenceProviders.stop(), current.paperCanary.flush()]);
  await current.bus.close();
  current.coordinator.stop();
  await current.eventLog?.close();
  await current.setupEventLog?.close();
  await current.historicalMicrostructure?.close();
}
