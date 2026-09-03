#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();
const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-lh-research-completion-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

for (const absolute of walk(path.join(root, 'src'))) {
  const file = path.relative(root, absolute);
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
    },
  });
  const errors = (output.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    throw new Error(`transpile_failed:${file}:${errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')).join('|')}`);
  }
  const target = path.join(temp, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output.outputText);
}

const fromTemp = (file) => require(path.join(temp, file));
const { InProcessEventBus } = fromTemp('src/services/realtime/inProcessEventBus.js');
const { SentimentVelocityFeed } = fromTemp('src/services/realtime/sentimentVelocityFeed.js');
const { EvidenceProviderManager } = fromTemp('src/services/realtime/evidenceProviderManager.js');
const { RealtimeSeriesStore } = fromTemp('src/services/realtime/realtimeSeriesStore.js');
const { publishFundingOiBootstrap } = fromTemp('src/services/liquidityHunter/restContextBootstrapCore.js');
const {
  buildLiquidityHunterMetaFeatureVector,
  createLiquidityHunterHistoricalSimilarityArtifact,
  HistoricalSimilarityMetaModel,
  validateLiquidityHunterHistoricalSimilarityArtifact,
} = fromTemp('src/services/liquidityHunter/historicalSimilarityMetaModel.js');
const { evaluateLiquidityHunterResearchReadiness } = fromTemp('src/services/liquidityHunter/researchReadiness.js');
const { LiquidityHunterShadowEvaluationScheduler } = fromTemp('src/services/liquidityHunter/shadowEvaluationScheduler.js');
const { initializeLiquidityHunterFoundation, getLiquidityHunterOperationsSnapshot, shutdownLiquidityHunterFoundation } = fromTemp('src/services/liquidityHunter/foundationRuntime.js');
const { readLiquidityHunterFeatureFlags } = fromTemp('src/services/liquidityHunter/featureFlags.js');

const checks = [];
const check = (label, condition) => {
  const passed = Boolean(condition);
  checks.push({ label, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
};

try {
  const now = Date.UTC(2026, 7, 7, 12, 0, 0);

  const disabledResearchFlags = readLiquidityHunterFeatureFlags({
    APEX_LIQUIDITY_HUNTER_ENABLED: 'false',
    APEX_SENTIMENT_VELOCITY_ENABLED: 'true',
    APEX_META_MODEL_ENABLED: 'true',
  });
  check(
    'sentiment/meta research services remain dormant while Liquidity Hunter core is disabled',
    disabledResearchFlags.sentimentVelocityEnabled === false && disabledResearchFlags.metaModelEnabled === false,
  );

  // Sentiment bridge: changed observations only, shadow bus only.
  const bus = new InProcessEventBus({ maxQueuePerSource: 64 });
  const received = [];
  bus.subscribe((event) => { received.push(event); });
  const sentimentRows = [
    { value: 0.20, confidence: 0.80, label: 'POSITIVE' },
    { value: 0.20, confidence: 0.80, label: 'POSITIVE' },
    { value: 0.55, confidence: 0.90, label: 'POSITIVE' },
  ];
  let sentimentIndex = 0;
  const feed = new SentimentVelocityFeed({
    enabled: true,
    symbols: ['BTC-USDT'],
    eventBus: bus,
    now: () => now + sentimentIndex * 1000,
    pollIntervalMs: 120_000,
    fetchSentiment: async (symbol) => {
      const row = sentimentRows[Math.min(sentimentIndex, sentimentRows.length - 1)];
      sentimentIndex += 1;
      return {
        category: 'sentiment', provider: 'qa-sentiment', symbol,
        data: { ...row, modelVersion: 'qa-v1' }, source: 'live', status: 'OK', latencyMs: 1,
        updatedAt: new Date(now + sentimentIndex * 1000).toISOString(),
      };
    },
  });
  await feed.pollSymbol('BTC-USDT');
  await feed.pollSymbol('BTC-USDT');
  await feed.pollSymbol('BTC-USDT');
  await bus.drainAll();
  check('sentiment bridge publishes normalized SENTIMENT_EVENT rows', received.length === 2 && received.every((event) => event.type === 'SENTIMENT_EVENT'));
  check('sentiment bridge suppresses unchanged provider scores', feed.snapshot().publishedEvents === 2);
  check('sentiment bridge remains a shadow evidence source with no execution payload', received.every((event) => event.source === 'supplemental-sentiment-shadow' && !JSON.stringify(event).match(/order|execute|authorization/i)));
  check('sentiment credibility is bounded from provider confidence', received.every((event) => event.payload.credibility >= 0 && event.payload.credibility <= 1));
  await feed.stop();
  await bus.close();

  const managerBus = new InProcessEventBus({ maxQueuePerSource: 64 });
  const manager = new EvidenceProviderManager({
    deribitOptionsEnabled: false,
    hyblockLiquidationEnabled: false,
    hyperliquidWalletObserverEnabled: false,
    hyperliquidWalletHistoryGradingEnabled: false,
    sentimentVelocityEnabled: false,
    symbols: ['BTC-USDT'],
    eventBus: managerBus,
  });
  const managerSnapshot = manager.snapshot();
  check('evidence provider manager exposes the sentiment provider alongside existing providers', managerSnapshot.providers.some((row) => row.source === 'supplemental-sentiment-shadow'));
  await manager.stop();
  await managerBus.close();

  // Repeated public Funding/OI bootstrap refreshes must re-materialize the bounded
  // series even when the normalized event ids are deterministic and unchanged.
  // This protects unattended shadow scheduling from losing context after the
  // second identical REST refresh.
  const fundingBus = new InProcessEventBus({ maxQueuePerSource: 64 });
  const fundingSeries = new RealtimeSeriesStore({ maxEventsPerKey: 128 });
  fundingBus.subscribe((event) => { fundingSeries.append(event, event.receivedAt); });
  const fundingRaw = {
    fundingHistory: Array.from({ length: 12 }, (_, index) => ({
      fundingRate: String(0.0001 + index * 0.000001),
      fundingTime: now - (12 - index) * 8 * 60 * 60 * 1000,
    })),
    currentFunding: { lastFundingRate: '0.000123', time: now },
    openInterestHistory: [
      { sumOpenInterest: '1000', timestamp: now - 10 * 60 * 1000 },
      { sumOpenInterest: '1010', timestamp: now - 5 * 60 * 1000 },
    ],
    currentOpenInterest: { openInterest: '1020', time: now },
    reasons: [],
  };
  await publishFundingOiBootstrap({
    symbol: 'BTC-USDT',
    eventBus: fundingBus,
    seriesStore: fundingSeries,
    raw: fundingRaw,
    now,
  });
  await fundingBus.drainAll();
  const firstFundingCount = fundingSeries.query({
    symbol: 'BTC-USDT',
    type: 'FUNDING',
    sources: ['binance-usdm-rest-context'],
    limit: 128,
  }).length;
  const firstOiCount = fundingSeries.query({
    symbol: 'BTC-USDT',
    type: 'OPEN_INTEREST',
    sources: ['binance-usdm-rest-context'],
    limit: 128,
  }).length;
  await publishFundingOiBootstrap({
    symbol: 'BTC-USDT',
    eventBus: fundingBus,
    seriesStore: fundingSeries,
    raw: fundingRaw,
    now: now + 30_000,
  });
  await fundingBus.drainAll();
  const secondFundingCount = fundingSeries.query({
    symbol: 'BTC-USDT',
    type: 'FUNDING',
    sources: ['binance-usdm-rest-context'],
    limit: 128,
  }).length;
  const secondOiCount = fundingSeries.query({
    symbol: 'BTC-USDT',
    type: 'OPEN_INTEREST',
    sources: ['binance-usdm-rest-context'],
    limit: 128,
  }).length;
  check(
    'repeated identical Funding/OI bootstrap refreshes keep normalized series populated',
    firstFundingCount >= 12 &&
      firstOiCount >= 2 &&
      secondFundingCount === firstFundingCount &&
      secondOiCount === firstOiCount,
  );
  await fundingBus.close();

  // Meta evaluator: development-only, fingerprinted, deterministic nearest-neighbor shadow evidence.
  const mkEvidence = (direction) => [
    'LIQUIDATION_TOPOLOGY', 'WHALE_POSITIONING', 'ICEBERG_ABSORPTION', 'OPTIONS_GAMMA', 'MULTI_EXCHANGE_CVD',
    'SESSION_LIQUIDITY', 'FUNDING_OI', 'SENTIMENT_VELOCITY', 'CONTRARIAN_WALLETS',
  ].map((edgeId, index) => ({
    edgeId, status: 'PASS', direction, score: 0.70 + index * 0.01, dataQuality: 0.85,
    observedAt: now, expiresAt: now + 60_000, sourceVersion: 'qa', supportingReasons: [], conflictingReasons: [], rawEventIds: [],
  }));
  const longFeatures = buildLiquidityHunterMetaFeatureVector(mkEvidence('LONG'));
  const shortFeatures = buildLiquidityHunterMetaFeatureVector(mkEvidence('SHORT'));
  const examples = Array.from({ length: 24 }, (_, index) => ({
    id: `dev-${index}`,
    datasetRole: 'DEVELOPMENT',
    features: index < 16 ? longFeatures : shortFeatures,
    direction: index < 16 ? 'LONG' : 'SHORT',
    outcomeR: index < 16 ? 1.2 : 0.8,
  }));
  const artifact = createLiquidityHunterHistoricalSimilarityArtifact({ modelVersion: 'qa-meta-v1', createdAt: now, examples });
  const model = new HistoricalSimilarityMetaModel(artifact);
  const firstMeta = model.evaluate(mkEvidence('LONG'), now);
  const secondMeta = model.evaluate(mkEvidence('LONG'), now);
  check('meta artifact is SHA-256 fingerprinted and validates', artifact.trainingDatasetSha256.length === 64 && validateLiquidityHunterHistoricalSimilarityArtifact(artifact).modelVersion === 'qa-meta-v1');
  check('historical similarity meta evaluator is deterministic', JSON.stringify(firstMeta) === JSON.stringify(secondMeta));
  check('historical similarity meta evaluator produces shadow-compatible versioned LONG evidence', firstMeta?.direction === 'LONG' && firstMeta.score > 0.55 && firstMeta.featureVersion === 'lh-edge-evidence-v1');
  const losingArtifact = createLiquidityHunterHistoricalSimilarityArtifact({
    modelVersion: 'qa-meta-losing-v1', createdAt: now,
    examples: Array.from({ length: 24 }, (_, index) => ({
      id: `loser-${index}`, datasetRole: 'DEVELOPMENT', features: longFeatures, direction: 'LONG', outcomeR: -1,
    })),
  });
  const losingMeta = new HistoricalSimilarityMetaModel(losingArtifact).evaluate(mkEvidence('LONG'), now);
  check('losing historical examples cannot reinforce the direction that failed', losingMeta === null || losingMeta.direction !== 'LONG');
  let holdoutRejected = false;
  try {
    const tampered = structuredClone(artifact);
    tampered.examples[0].datasetRole = 'HOLDOUT';
    validateLiquidityHunterHistoricalSimilarityArtifact(tampered);
  } catch (error) {
    holdoutRejected = String(error).includes('meta_model_holdout_training_forbidden');
  }
  check('meta artifact rejects HOLDOUT examples from training', holdoutRejected);

  // Research readiness is an advisory gate only; it never promotes or authorizes execution.
  const walkForward = {
    fingerprintSha256: 'a'.repeat(64),
    walkForward: [{}, {}, {}],
    consistency: {
      walkForwardCandidateFolds: 3,
      walkForwardPositiveMedianNetFolds: 3,
      holdoutCandidateCount: 30,
      holdoutMedianNetReturnPct: 0.40,
      holdoutTwoRBeforeInvalidationShare: 0.50,
    },
    shadowOnly: true,
    authoritative: false,
    automaticPromotionEnabled: false,
  };
  const paperEligible = evaluateLiquidityHunterResearchReadiness({ walkForward, now });
  check('research gate can mark statistically-qualified evidence for Paper Canary observation only', paperEligible.status === 'PAPER_CANARY_OBSERVATION_ELIGIBLE');
  check('research gate cannot promote thresholds or authorize execution', paperEligible.automaticPromotionEnabled === false && paperEligible.executionAuthorized === false && paperEligible.authoritative === false);

  const microstructure = {
    fingerprintSha256: 'b'.repeat(64), simulatedCount: 30,
    summary: { filledShare: 0.80, targetHitShare: 0.60, stoppedShare: 0.25, medianNetReturnPct: 0.25 },
    shadowOnly: true, authoritative: false, executionDependency: false,
  };
  const manualReview = evaluateLiquidityHunterResearchReadiness({ walkForward, microstructure, now });
  check('microstructure-qualified evidence advances only to manual review eligibility', manualReview.status === 'MANUAL_REVIEW_ELIGIBLE' && manualReview.executionAuthorized === false);

  const weakWalkForward = structuredClone(walkForward);
  weakWalkForward.consistency.holdoutCandidateCount = 2;
  weakWalkForward.consistency.holdoutMedianNetReturnPct = -0.2;
  const blocked = evaluateLiquidityHunterResearchReadiness({ walkForward: weakWalkForward, microstructure, now });
  check('weak untouched holdout evidence fails closed', blocked.status === 'NOT_READY' && blocked.blockers.length >= 2);

  // Paper Canary scheduler: bounded unattended shadow evaluation, still no execution dependency.
  const scheduledSymbols = [];
  const capturedSetups = [];
  const scheduler = new LiquidityHunterShadowEvaluationScheduler({
    enabled: true,
    symbols: ['BTC-USDT', 'ETH-USDT'],
    intervalMs: 120_000,
    maxConcurrency: 2,
    now: () => now,
    contextProvider: async (symbol) => {
      scheduledSymbols.push(symbol);
      return { currentPrice: 100, smartMoneyContext: null };
    },
    engine: {
      evaluate: async ({ symbol }) => ({
        evaluationId: `qa-eval-${symbol}`,
        setupId: `qa-setup-${symbol}`,
        symbol,
        evaluatedAt: now,
        expiresAt: now + 60_000,
        state: 'READY_FOR_MANUAL_CONFIRMATION',
        sweepDirection: 'DOWN',
        tradeBias: 'LONG',
        eligibleForManualConfirmation: true,
        fusionScore: 0.80,
        trigger: { direction: 'LONG', invalidationPrice: 99 },
      }),
    },
    paperCanary: {
      hasSetup: (setupId) => capturedSetups.some((row) => row.setupId === setupId),
      capture: (evaluation, price) => {
        const existing = capturedSetups.find((row) => row.setupId === evaluation.setupId);
        if (existing) return existing;
        const record = { setupId: evaluation.setupId, price };
        capturedSetups.push(record);
        return record;
      },
    },
  });
  await scheduler.runOnce();
  const schedulerSnapshot = scheduler.snapshot();
  check('paper canary scheduler evaluates configured symbols without manual POST calls', schedulerSnapshot.evaluations === 2 && new Set(scheduledSymbols).size === 2);
  check('paper canary scheduler records only through the research canary capture path', schedulerSnapshot.captures === 2 && capturedSetups.every((row) => row.price === 100));
  await scheduler.runOnce();
  const repeatedSnapshot = scheduler.snapshot();
  check('paper canary scheduler does not count an already-tracked setup as a new capture', repeatedSnapshot.evaluations === 4 && repeatedSnapshot.captures === 2 && capturedSetups.length === 2);
  check('paper canary scheduler remains explicitly non-executing', schedulerSnapshot.executionDependency === false && schedulerSnapshot.orderSubmissionAllowed === false);
  await scheduler.stop();

  // Foundation integration: enabling Paper Canary on an isolated temp store starts
  // the unattended shadow scheduler without adding any execution capability.
  initializeLiquidityHunterFoundation({
    APEX_LIQUIDITY_HUNTER_ENABLED: 'true',
    APEX_LIQUIDITY_HUNTER_SHADOW_ONLY: 'true',
    APEX_LIQUIDITY_HUNTER_PAPER_CANARY: 'true',
    APEX_LIQUIDITY_HUNTER_SYMBOLS: 'BTC-USDT',
    APEX_LIQUIDITY_HUNTER_PAPER_CANARY_STORE_PATH: path.join(temp, 'paper-canary.json'),
    APEX_LIQUIDITY_HUNTER_SHADOW_EVALUATION_INTERVAL_MS: '120000',
  }, {
    shadowContextProvider: async () => ({ currentPrice: 100, smartMoneyContext: null }),
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (getLiquidityHunterOperationsSnapshot().realtime.shadowEvaluation.evaluations > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const foundationSnapshot = getLiquidityHunterOperationsSnapshot();
  check('foundation starts unattended shadow evaluation when Paper Canary is explicitly enabled', foundationSnapshot.realtime.paperCanary.enabled === true && foundationSnapshot.realtime.shadowEvaluation.enabled === true && foundationSnapshot.realtime.shadowEvaluation.evaluations >= 1);
  check('foundation Paper Canary integration preserves hard execution safety invariants', foundationSnapshot.shadowOnly === true && foundationSnapshot.executionDependency === false && foundationSnapshot.autonomousLiveExecutionEnabled === false && foundationSnapshot.realtime.paperCanary.orderSubmissionAllowed === false && foundationSnapshot.realtime.shadowEvaluation.orderSubmissionAllowed === false);
  await shutdownLiquidityHunterFoundation();

  const corruptStore = path.join(temp, 'paper-canary-corrupt.json');
  fs.writeFileSync(corruptStore, '{not-json\n');
  initializeLiquidityHunterFoundation({
    APEX_LIQUIDITY_HUNTER_ENABLED: 'true',
    APEX_LIQUIDITY_HUNTER_SHADOW_ONLY: 'true',
    APEX_LIQUIDITY_HUNTER_PAPER_CANARY: 'true',
    APEX_LIQUIDITY_HUNTER_SYMBOLS: 'BTC-USDT',
    APEX_LIQUIDITY_HUNTER_PAPER_CANARY_STORE_PATH: corruptStore,
    APEX_LIQUIDITY_HUNTER_SHADOW_EVALUATION_INTERVAL_MS: '120000',
  }, {
    shadowContextProvider: async () => ({ currentPrice: 100, smartMoneyContext: null }),
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (getLiquidityHunterOperationsSnapshot().realtime.paperCanary.lastPersistenceError) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const corruptSnapshot = getLiquidityHunterOperationsSnapshot();
  check('corrupt Paper Canary persistence fails closed before unattended shadow evaluation', corruptSnapshot.status === 'DEGRADED' && corruptSnapshot.realtime.paperCanary.lastPersistenceError !== null && corruptSnapshot.realtime.shadowEvaluation.evaluations === 0 && corruptSnapshot.reasons.includes('paper_canary_persistence_unavailable'));
  await shutdownLiquidityHunterFoundation();

  const failures = checks.filter((row) => !row.passed);
  const artifactOut = {
    generatedAt: new Date().toISOString(),
    checks,
    summary: {
      passed: checks.length - failures.length,
      total: checks.length,
      sentimentSource: 'supplemental-sentiment-shadow',
      metaModel: 'DEVELOPMENT_ONLY_HISTORICAL_SIMILARITY_SHADOW',
      automaticPromotionEnabled: false,
      executionAuthorized: false,
    },
  };
  fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
  fs.writeFileSync(path.join(root, 'QA', `liquidity-hunter-research-completion-v${packageVersion}.json`), JSON.stringify(artifactOut, null, 2) + '\n');
  console.log(`\nLiquidity Hunter research completion runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
