#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();

const root = process.cwd();
process.env.NODE_PATH = [path.join(root, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-liquidity-core-'));

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
  const source = fs.readFileSync(absolute, 'utf8');
  const output = ts.transpileModule(source, {
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
  if (errors.length) throw new Error(`transpile_failed:${file}:${errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, ' ')).join('|')}`);
  const target = path.join(temp, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output.outputText);
}

const { WorldStateStore } = require(path.join(temp, 'src/services/realtime/worldStateStore.js'));
const { RealtimeSeriesStore } = require(path.join(temp, 'src/services/realtime/realtimeSeriesStore.js'));
const { OrderBookRebuilder } = require(path.join(temp, 'src/services/realtime/orderBookRebuilder.js'));
const { LiquidityHunterDynamicFusionEngine } = require(path.join(temp, 'src/services/liquidityHunter/dynamicFusionEngine.js'));
const { bridgeLiquidityHunterToCanonicalDecision } = require(path.join(temp, 'src/services/liquidityHunter/decisionBridge.js'));

const NOW = Date.UTC(2026, 7, 7, 13, 0, 0);
const checks = [];
const check = (label, condition) => {
  const passed = Boolean(condition);
  checks.push({ label, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
};

function event(type, source, sequence, payload, offsetMs) {
  return {
    eventId: `${source}-${type}-${sequence}-${offsetMs}`,
    type,
    source,
    symbol: 'BTC-USDT',
    exchangeTimestamp: NOW + offsetMs,
    receivedAt: NOW + offsetMs + 10,
    sequence,
    schemaVersion: 1,
    payload,
  };
}

function buildRuntime() {
  const worldState = new WorldStateStore();
  const seriesStore = new RealtimeSeriesStore({ maxEventsPerKey: 10_000, maxAgeMs: 48 * 60 * 60_000 });
  const orderBook = new OrderBookRebuilder();
  const append = (row) => { seriesStore.append(row, NOW); orderBook.apply(row, row.receivedAt); };

  const funding = [0.00008, 0.00011, 0.00009, 0.00010, 0.00012, 0.00007, 0.00013, 0.00009, 0.00010, 0.00011, 0.00008, 0.00012, 0.00085];
  funding.forEach((rate, index) => append(event('FUNDING', 'binance-usdm', index + 1, { rate }, -12 * 60_000 + index * 50_000)));
  append(event('OPEN_INTEREST', 'binance-usdm', 1, { openInterest: 1_000 }, -20_000));
  append(event('OPEN_INTEREST', 'binance-usdm', 2, { openInterest: 1_025 }, -5_000));
  append(event('LIQUIDATION', 'verified-liqmap', 1, { clusters: [{ id: 'long-pool', side: 'LONG', lowerPrice: 98.8, upperPrice: 99.2, notionalUsd: 50_000_000, confidence: 0.92 }], methodology: 'VERIFIED_REPLAY_LIQUIDATION_TOPOLOGY_V1', predictive: true }, -3_000));

  for (const source of ['binance-usdm', 'bybit-linear']) {
    append(event('ORDERBOOK_SNAPSHOT', source, 1, { bids: [[99.0, 1], [98.9, 2]], asks: [[99.2, 2], [99.3, 3]] }, -4_900));
    [1, 2, 4, 7, 11].forEach((size, index) => append(event('ORDERBOOK_DELTA', source, index + 2, { updates: [{ side: 'BID', price: 99.0, size }] }, -5_000 + index * 1_000)));
  }

  let seqA = 1;
  let seqB = 1;
  for (let index = 0; index < 24; index += 1) {
    const source = index % 2 === 0 ? 'binance-usdm' : 'bybit-linear';
    const sequence = source === 'binance-usdm' ? seqA++ : seqB++;
    append(event('TRADE', source, sequence, { price: 100.4 - index * 0.025, size: 5, aggressorSide: 'BUY' }, -55_000 + index * 1_800));
  }
  for (let index = 0; index < 12; index += 1) {
    const source = index % 2 === 0 ? 'binance-usdm' : 'bybit-linear';
    const sequence = source === 'binance-usdm' ? seqA++ : seqB++;
    append(event('TRADE', source, sequence, { price: 99.82 - index * 0.003, size: 2, aggressorSide: 'SELL' }, -9_000 + index * 600));
  }

  const wallets = [
    ['s1', 'S', 'LONG', 140, 28, 8], ['s2', 'S', 'LONG', 120, 24, 10], ['a1', 'A', 'LONG', 90, 18, 14],
    ['f1', 'F', 'SHORT', 120, -22, 52], ['f2', 'F', 'SHORT', 95, -18, 48], ['f3', 'F', 'SHORT', 80, -15, 46], ['f4', 'F', 'SHORT', 70, -16, 50], ['f5', 'F', 'SHORT', 65, -14, 47],
  ];
  wallets.forEach(([wallet, grade, direction, closedTrades, netPnlPct, maxDrawdownPct], index) => append(event('WALLET_POSITION', 'hyperliquid', index + 1, { wallet, grade, direction, closedTrades, netPnlPct, maxDrawdownPct, leverage: grade === 'F' ? 12 : 3 }, -5_000 + index * 100)));
  return { worldState, seriesStore, orderBook };
}

const smartMoneyContext = {
  smcDirectionalScore: 0.72,
  smcContextScore: 0.70,
  setupModel: 'LIQUIDITY_SWEEP_REVERSAL',
  controlSide: 'DEMAND',
  smartMoneyBiasScore: 0.74,
  flipSetupScore: 0.5,
  chochSetupScore: 0.58,
  continuationScore: 0.2,
  ifcQualityScore: 0.85,
  liquiditySweepScore: 0.88,
  zoneFreshnessScore: 0.82,
  unmitigatedZoneProximity: 0.9,
  htfSupplyInControl: false,
  htfDemandInControl: true,
  reasons: ['runtime_fixture'],
};

try {
  const runtime = buildRuntime();
  const engine = new LiquidityHunterDynamicFusionEngine({
    ...runtime,
    flags: {
      liquidityHunterEnabled: true,
      shadowOnly: true,
      realtimeEventRecordingEnabled: false,
      publicFeedsEnabled: false,
      binancePublicFeedEnabled: false,
      kucoinPublicFeedEnabled: false,
      bybitPublicFeedEnabled: false,
      realtimeL2Enabled: true,
      optionsGexEnabled: false,
      deribitOptionsPublicEnabled: false,
      hyblockLiquidationTopologyEnabled: false,
      walletGradingEnabled: true, hyperliquidWalletObserverEnabled: false,
      hyperliquidWalletHistoryGradingEnabled: false,
      sentimentVelocityEnabled: false,
      metaModelEnabled: true,
      websocketEnabled: false,
      paperCanaryEnabled: false,
      testnetCanaryEnabled: false,
      autonomousLiveExecutionEnabled: false,
    },
  });

  const result = await engine.evaluate({
    symbol: 'BTC-USDT',
    now: NOW,
    currentPrice: 100,
    smartMoneyContext,
    metaModelEvaluation: { direction: 'LONG', score: 0.82, modelVersion: 'fixture-v1', featureVersion: 'fixture-features-v1', generatedAt: NOW - 500, expiresAt: NOW + 20_000 },
  });

  check('core output remains shadow only', result.shadowOnly === true && result.authoritative === false);
  check('macro separates downside sweep from long post-sweep bias', result.macro.expectedSweepDirection === 'DOWN' && result.macro.postSweepTradeBias === 'LONG');
  check('Layer 1 macro passes', result.layers[0].status === 'PASSED');
  check('Layer 2 target passes', result.layers[1].status === 'PASSED' && result.target?.liquidityType === 'LONG_LIQUIDATIONS');
  check('Layer 3 requires aligned CVD plus iceberg absorption', result.layers[2].status === 'PASSED' && result.trigger.kind === 'ABSORPTION_REVERSAL_TRIGGER' && result.trigger.direction === 'LONG');
  check('Layer 4 confirms only after deterministic trigger', result.layers[3].status === 'PASSED' && /^CONFIRM/.test(result.shadowValidation));
  check('setup reaches manual confirmation only', result.setupState === 'READY_FOR_CONFIRMATION' && result.eligibleForManualConfirmation === true && result.reasons.includes('manual_confirmation_candidate_only'));
  check('all ten edge identities are present in one evaluation', new Set(result.evidence.map((row) => row.edgeId)).size === 10);
  check('disabled optional edges remain NOT_CONFIGURED rather than fabricated neutral data', result.evidence.filter((row) => ['OPTIONS_GAMMA', 'SENTIMENT_VELOCITY'].includes(row.edgeId)).every((row) => row.status === 'NOT_CONFIGURED' && row.score === null));

  const localMetaRuntime = buildRuntime();
  const localMetaEngine = new LiquidityHunterDynamicFusionEngine({
    ...localMetaRuntime,
    flags: {
      liquidityHunterEnabled: true, shadowOnly: true, realtimeEventRecordingEnabled: false, publicFeedsEnabled: false, binancePublicFeedEnabled: false, kucoinPublicFeedEnabled: false, bybitPublicFeedEnabled: false, realtimeL2Enabled: true,
      optionsGexEnabled: false, deribitOptionsPublicEnabled: false, hyblockLiquidationTopologyEnabled: false, walletGradingEnabled: true, hyperliquidWalletObserverEnabled: false, hyperliquidWalletHistoryGradingEnabled: false,
      sentimentVelocityEnabled: false, metaModelEnabled: true, websocketEnabled: false, paperCanaryEnabled: false, testnetCanaryEnabled: false, autonomousLiveExecutionEnabled: false,
    },
    metaModel: {
      evaluate: (evidence, now) => evidence.length === 9
        ? { direction: 'LONG', score: 0.80, modelVersion: 'local-meta-fixture-v1', featureVersion: 'lh-edge-evidence-v1', generatedAt: now, expiresAt: now + 20_000 }
        : null,
    },
  });
  const localMeta = await localMetaEngine.evaluate({ symbol: 'BTC-USDT', now: NOW, currentPrice: 100, smartMoneyContext });
  const localMetaEvidence = localMeta.evidence.find((row) => row.edgeId === 'META_MODEL');
  check('local meta evaluator runs as a second pass after nine independent edges', localMetaEvidence?.status === 'PASS' && localMetaEvidence.direction === 'LONG' && localMetaEvidence.metadata?.modelVersion === 'local-meta-fixture-v1');

  const staleRuntime = buildRuntime();
  const staleEngine = new LiquidityHunterDynamicFusionEngine({
    ...staleRuntime,
    flags: {
      liquidityHunterEnabled: true, shadowOnly: true, realtimeEventRecordingEnabled: false, publicFeedsEnabled: false, binancePublicFeedEnabled: false, kucoinPublicFeedEnabled: false, bybitPublicFeedEnabled: false, realtimeL2Enabled: true,
      optionsGexEnabled: false, deribitOptionsPublicEnabled: false, hyblockLiquidationTopologyEnabled: false, walletGradingEnabled: true, hyperliquidWalletObserverEnabled: false, hyperliquidWalletHistoryGradingEnabled: false, sentimentVelocityEnabled: false, metaModelEnabled: false,
      websocketEnabled: false, paperCanaryEnabled: false, testnetCanaryEnabled: false, autonomousLiveExecutionEnabled: false,
    },
  });
  const stale = await staleEngine.evaluate({ symbol: 'BTC-USDT', now: NOW + 10_000, currentPrice: 100, smartMoneyContext });
  check('expired microstructure evidence fails closed', stale.layers[2].status !== 'PASSED' && stale.eligibleForManualConfirmation === false);

  const canonical = {
    symbol: 'BTC-USDT', interval: '1m', direction: 'LONG', generatedAt: NOW,
    decision: 'WATCH', action: 'HOLD', confidence: 0.6, score: 60,
    reasons: ['baseline'], supportingSignals: [], conflictingSignals: [],
  };
  const bridged = bridgeLiquidityHunterToCanonicalDecision(canonical, result);
  check('decision bridge cannot authorize execution', bridged.executionAuthorized === false);

  const failures = checks.filter((row) => !row.passed);
  const artifact = {
    generatedAt: new Date().toISOString(),
    deterministicFixtureOnly: true,
    safety: { shadowOnly: result.shadowOnly, authoritative: result.authoritative, executionAuthorized: bridged.executionAuthorized },
    result: {
      setupState: result.setupState,
      fusionScore: result.fusionScore,
      expectedSweepDirection: result.macro.expectedSweepDirection,
      postSweepTradeBias: result.macro.postSweepTradeBias,
      trigger: result.trigger.kind,
      shadowValidation: result.shadowValidation,
    },
    checks,
  };
  const output = path.join(root, 'QA', 'liquidity-hunter-core-v1.0.56.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`\nLiquidity Hunter core runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  console.log(`Artifact: ${path.relative(root, output)}`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
