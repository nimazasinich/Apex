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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-lh-evidence-sim-'));
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
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, esModuleInterop: true },
  });
  const errors = (output.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`transpile_failed:${file}:${errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('|')}`);
  const target = path.join(temp, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output.outputText);
}
const fromTemp = (file) => require(path.join(temp, file));
const { InProcessEventBus } = fromTemp('src/services/realtime/inProcessEventBus.js');
const { DeribitOptionsPublicFeed } = fromTemp('src/services/realtime/deribitOptionsPublicFeed.js');
const { importDeribitOptionsHistory } = fromTemp('src/services/realtime/deribitOptionsHistoricalImporter.js');
const { blackScholesSpotGammaFromTradeIv } = fromTemp('src/services/realtime/deribitOptionMath.js');
const { HyblockLiquidationTopologyFeed } = fromTemp('src/services/realtime/hyblockLiquidationTopologyFeed.js');
const { HyperliquidWalletHistoryGradingFeed } = fromTemp('src/services/realtime/hyperliquidWalletHistoryGradingFeed.js');
const { RealtimeSeriesStore } = fromTemp('src/services/realtime/realtimeSeriesStore.js');
const { WorldStateStore } = fromTemp('src/services/realtime/worldStateStore.js');
const { OrderBookRebuilder } = fromTemp('src/services/realtime/orderBookRebuilder.js');
const { evaluateLiquidationTopologyEdge } = fromTemp('src/services/liquidityHunter/edges/liquidationTopologyEdge.js');
const { evaluateWhalePositioningEdge } = fromTemp('src/services/liquidityHunter/edges/whalePositioningEdge.js');
const { computeWalletPerformanceMetrics, deriveWalletGradeV2, WALLET_GRADING_VERSION } = fromTemp('src/services/liquidityHunter/walletGrading.js');
const { simulateMicrostructureOrder, runMicrostructureSimulationBatch } = fromTemp('src/services/replay/microstructureFillSimulator.js');
const { runLiquidityHunterMicrostructureValidation } = fromTemp('src/services/replay/liquidityHunterMicrostructureValidation.js');

const checks = [];
const check = (label, condition) => { const passed = Boolean(condition); checks.push({ label, passed }); console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`); };
const waitFor = async (predicate, timeoutMs = 3000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
};

try {
  const now = Date.UTC(2026, 7, 7, 12, 0, 0);

  // 1) Event-time IV gamma reconstruction.
  const gamma = blackScholesSpotGammaFromTradeIv({ spot: 68000, strike: 70000, expiry: Date.UTC(2026, 7, 28, 8), timestamp: now, ivPercent: 60, riskFreeRate: 0 });
  check('Deribit event-time IV gamma reconstruction returns finite positive gamma', Number.isFinite(gamma) && gamma > 0);

  const bus = new InProcessEventBus({ maxQueuePerSource: 1000 });
  const optionEvents = [];
  bus.subscribe((event) => optionEvents.push(event));
  const deribitTrades = Array.from({ length: 16 }, (_, index) => ({
    trade_id: String(5000 + index), timestamp: now - index * 1000,
    instrument_name: index % 2 ? 'BTC-28AUG26-70000-C' : 'BTC-28AUG26-65000-P',
    direction: index % 3 ? 'buy' : 'sell', amount: 1, contracts: 1 + index, index_price: 68000, iv: 60,
  }));
  const deribitFetch = async (url) => {
    if (url.includes('get_last_trades_by_currency')) return { result: { trades: deribitTrades } };
    if (url.includes('public/ticker')) return { result: { open_interest: 1000, underlying_price: 68000, greeks: { gamma: 0.123456 } } };
    throw new Error(`unexpected_deribit_url:${url}`);
  };
  const deribit = new DeribitOptionsPublicFeed({ enabled: true, symbols: ['BTC-USDT'], eventBus: bus, fetchJson: deribitFetch, now: () => now + 5000, pollIntervalMs: 120000 });
  deribit.start();
  await waitFor(() => deribit.snapshot().publishedEvents >= 12);
  await deribit.stop();
  await bus.drainAll();
  const ivEvent = optionEvents.find((event) => event.type === 'OPTION_TRADE');
  check('Deribit live collector prefers event-time trade IV gamma over current ticker gamma', Boolean(ivEvent) && ivEvent.payload.gammaMethodology === 'BLACK_SCHOLES_FROM_DERIBIT_TRADE_IV_ZERO_RATE' && Math.abs(ivEvent.payload.gamma - 0.123456) > 1e-6);
  check('Deribit live event records non-authoritative taker-flow methodology', ivEvent?.payload.methodology === 'DERIBIT_PUBLIC_TAKER_FLOW_EVENT_TIME_IV_GAMMA_PROXY');
  await bus.close();

  let historyRequests = 0;
  const historyFetch = async (url) => {
    historyRequests += 1;
    const parsed = new URL(url);
    const start = Number(parsed.searchParams.get('start_timestamp'));
    const end = Number(parsed.searchParams.get('end_timestamp'));
    if (end - start > 60_000) {
      return { result: { has_more: true, trades: [{ trade_id: `sat-${start}`, timestamp: start, instrument_name: 'BTC-28AUG26-70000-C', direction: 'buy', contracts: 1, index_price: 68000, iv: 60 }] } };
    }
    return { result: { has_more: false, trades: [{ trade_id: `ok-${start}`, timestamp: start + 1000, instrument_name: 'BTC-28AUG26-70000-C', direction: 'buy', contracts: 2, index_price: 68000, iv: 60 }] } };
  };
  const history = await importDeribitOptionsHistory({ currency: 'BTC', startTime: now - 120_000, endTime: now, fetchJson: historyFetch, now: () => now + 1, minimumWindowMs: 60_000 });
  check('Deribit history importer subdivides saturated windows instead of silently truncating', historyRequests >= 3 && history.complete === true && history.incompleteWindows.length === 0);
  check('Deribit historical events retain event-time IV gamma and null historical OI', history.events.length >= 2 && history.events.every((event) => event.payload.openInterest === null && event.payload.gammaMethodology === 'BLACK_SCHOLES_FROM_DERIBIT_TRADE_IV_ZERO_RATE'));
  const budgetLimited = await importDeribitOptionsHistory({ currency: 'BTC', startTime: now - 120_000, endTime: now, fetchJson: historyFetch, now: () => now + 1, minimumWindowMs: 60_000, maxRequests: 1 });
  check('Deribit historical importer reports incomplete coverage instead of throwing when request budget is exhausted', budgetLimited.complete === false && budgetLimited.incompleteWindows.length >= 1);

  // 2) Hyblock predictive liquidation topology provider.
  const liqBus = new InProcessEventBus({ maxQueuePerSource: 100 });
  const liqEvents = [];
  liqBus.subscribe((event) => liqEvents.push(event));
  const secret = 'hyblock-secret-qa-key';
  const hyblock = new HyblockLiquidationTopologyFeed({
    enabled: true, apiKey: secret, symbols: ['BTC-USDT'], eventBus: liqBus, now: () => now,
    pollIntervalMs: 120000,
    fetchJson: async (_url, headers) => {
      if (headers['x-api-key'] !== secret) throw new Error('missing_api_key');
      return { data: [
        { startingPrice: 98000, endingPrice: 98500, side: 'long', size: 30_000_000, timestamp: Math.floor(now / 1000) },
        { startingPrice: 103000, endingPrice: 103500, side: 'short', size: 10_000_000, timestamp: Math.floor(now / 1000) },
      ], metadata: { exchanges: ['binance_perp_stable'] } };
    },
  });
  hyblock.start();
  await waitFor(() => hyblock.snapshot().publishedEvents >= 1);
  await hyblock.stop();
  await liqBus.drainAll();
  const liqEvent = liqEvents.find((event) => event.type === 'LIQUIDATION');
  check('Hyblock provider emits approved predictive topology clusters', Boolean(liqEvent) && liqEvent.payload.predictive === true && liqEvent.payload.methodology === 'HYBLOCK_PREDICTIVE_LIQUIDATION_HEATMAP_V2' && liqEvent.payload.clusters.length === 2);
  check('Hyblock API key never enters market event payload/log material', !JSON.stringify(liqEvent || {}).includes(secret));
  let rejectedBase = false;
  try { new HyblockLiquidationTopologyFeed({ enabled: true, apiKey: secret, symbols: ['BTC-USDT'], eventBus: liqBus, baseUrl: 'https://evil.example/v2' }); }
  catch { rejectedBase = true; }
  check('Hyblock runtime base URL is restricted to official allowlisted host', rejectedBase);

  const series = new RealtimeSeriesStore();
  series.append({ eventId: 'price', type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: now, receivedAt: now, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 100000, size: 1, aggressorSide: 'BUY' } }, now);
  series.append(liqEvent, now);
  const edgeContext = { symbol: 'BTC-USDT', now, currentPrice: 100000, seriesStore: series, worldState: new WorldStateStore(), orderBook: new OrderBookRebuilder() };
  const liqEvidence = evaluateLiquidationTopologyEdge(edgeContext);
  check('Liquidation edge accepts only approved predictive topology and maps downside long-liquidation sweep', liqEvidence.status === 'PASS' && liqEvidence.metadata?.expectedSweepDirection === 'DOWN');
  const unapprovedSeries = new RealtimeSeriesStore();
  unapprovedSeries.append({ ...liqEvent, eventId: 'unapproved', source: 'observed-liquidations', payload: { ...liqEvent.payload, methodology: 'OBSERVED_FORCE_ORDERS', predictive: false } }, now);
  const unapproved = evaluateLiquidationTopologyEdge({ ...edgeContext, seriesStore: unapprovedSeries });
  check('Observed liquidation events cannot masquerade as predictive topology', unapproved.status === 'UNKNOWN');
  await liqBus.close();

  // 3) Fee/funding-adjusted long-history wallet grading.
  const positiveTrades = Array.from({ length: 140 }, (_, index) => ({
    timestamp: now - (140 - index) * 6 * 60 * 60_000,
    closedPnlUsd: index % 5 === 0 ? -2 : 10,
    feeUsd: 0.1,
    notionalUsd: 10_000,
  }));
  const positiveFunding = Array.from({ length: 60 }, (_, index) => ({ timestamp: now - (60 - index) * 12 * 60 * 60_000, fundingUsd: 0.25 }));
  const strongMetrics = computeWalletPerformanceMetrics({ trades: positiveTrades, funding: positiveFunding, completeHistory: true });
  check('Wallet grade v2 uses fee/funding-adjusted realized history and can produce S only with long complete sample', deriveWalletGradeV2(strongMetrics) === 'S' && strongMetrics.historyDays >= 30 && strongMetrics.closedTrades >= 120);
  const losingTrades = Array.from({ length: 100 }, (_, index) => ({ timestamp: now - (100 - index) * 8 * 60 * 60_000, closedPnlUsd: index % 5 === 0 ? 2 : -5, feeUsd: 0.1, notionalUsd: 8_000 }));
  const weakMetrics = computeWalletPerformanceMetrics({ trades: losingTrades, funding: [], completeHistory: true });
  check('Wallet grade v2 identifies statistically persistent realized loser cohort', deriveWalletGradeV2(weakMetrics) === 'F');
  check('Truncated wallet history is never graded', deriveWalletGradeV2({ ...strongMetrics, completeHistory: false }) === 'UNRATED');

  const rawWallet = '0x1111111111111111111111111111111111111111';
  const walletBus = new InProcessEventBus({ maxQueuePerSource: 1000 });
  const walletEvents = [];
  walletBus.subscribe((event) => walletEvents.push(event));
  let fundingHistoryCalls = 0;
  const walletFetch = async (_url, body) => {
    if (body?.type === 'userFillsByTime') {
      const start = Number(body.startTime);
      const end = Number(body.endTime);
      return Array.from({ length: 32 }, (_, index) => ({
        coin: 'BTC', px: '100', sz: '100', closedPnl: index % 5 === 0 ? '-2' : '10', fee: '0.1',
        time: start + Math.floor((end - start) * (index + 1) / 33), tid: `${start}-${index}`,
      }));
    }
    if (body?.type === 'userFunding') {
      fundingHistoryCalls += 1;
      const start = Number(body.startTime);
      const end = Number(body.endTime);
      const count = end - start > 24 * 60 * 60_000 ? 500 : 8;
      return Array.from({ length: count }, (_, index) => ({ time: start + Math.floor((end - start) * (index + 1) / (count + 1)), hash: `fund-${start}-${index}`, delta: { type: 'funding', coin: 'BTC', usdc: '0.01' } }));
    }
    if (body?.type === 'clearinghouseState') return { assetPositions: [{ position: { coin: 'BTC', szi: '1', leverage: { value: '3' } } }] };
    throw new Error(`unexpected_wallet_request:${JSON.stringify(body)}`);
  };
  const historyFeed = new HyperliquidWalletHistoryGradingFeed({ enabled: true, symbols: ['BTC-USDT'], wallets: [rawWallet], eventBus: walletBus, fetchJson: walletFetch, now: () => now, lookbackDays: 35, pollIntervalMs: 24 * 60 * 60_000, minimumWindowMs: 24 * 60 * 60_000 });
  historyFeed.start();
  await waitFor(() => historyFeed.snapshot().publishedEvents >= 1, 5000);
  await historyFeed.stop();
  await walletBus.drainAll();
  const gradedEvent = walletEvents.find((event) => event.source === 'hyperliquid-wallet-history-grader');
  check('Hyperliquid history grader emits pseudonymized grading-ready event from bounded public fills/funding history', Boolean(gradedEvent) && gradedEvent.payload.wallet !== rawWallet && gradedEvent.payload.gradingVersion === WALLET_GRADING_VERSION && gradedEvent.payload.gradingReady === true);
  check('Raw wallet address is never emitted by the history grader', !JSON.stringify(gradedEvent || {}).toLowerCase().includes(rawWallet.toLowerCase()));
  check('Hyperliquid funding history subdivides saturated time-range responses instead of silently truncating', fundingHistoryCalls > 5 && gradedEvent?.payload.completeHistory === true);
  await walletBus.close();

  const whaleSeries = new RealtimeSeriesStore();
  for (let i = 0; i < 3; i += 1) {
    whaleSeries.append({
      eventId: `graded-${i}`, type: 'WALLET_POSITION', source: 'hyperliquid-wallet-history-grader', symbol: 'BTC-USDT', exchangeTimestamp: now - i, receivedAt: now, schemaVersion: 1, ingestionKind: 'REPLAY',
      payload: { wallet: `hlg-${i}`, grade: i === 0 ? 'S' : 'A', direction: 'LONG', leverage: 3, closedTrades: 120, observationOnly: false, gradingReady: true, methodology: 'HYPERLIQUID_PUBLIC_FILLS_PLUS_FUNDING_REALIZED_HISTORY', gradingVersion: WALLET_GRADING_VERSION },
    }, now);
  }
  whaleSeries.append({
    eventId: 'forged-s', type: 'WALLET_POSITION', source: 'external-forged', symbol: 'BTC-USDT', exchangeTimestamp: now, receivedAt: now, schemaVersion: 1, ingestionKind: 'REPLAY',
    payload: { wallet: 'fake', grade: 'S', direction: 'SHORT', closedTrades: 999, observationOnly: false, gradingReady: true, methodology: 'HYPERLIQUID_PUBLIC_FILLS_PLUS_FUNDING_REALIZED_HISTORY', gradingVersion: WALLET_GRADING_VERSION },
  }, now);
  const whaleEvidence = evaluateWhalePositioningEdge({ symbol: 'BTC-USDT', now, seriesStore: whaleSeries, worldState: new WorldStateStore(), orderBook: new OrderBookRebuilder() });
  check('Whale edge trusts internally graded history but rejects externally forged declared grades', whaleEvidence.status === 'PASS' && whaleEvidence.direction === 'LONG' && whaleEvidence.metadata?.gradedWallets === 3);

  // 4) Deterministic event-level queue/fill simulation and real worker threads.
  const t0 = now;
  const microEvents = [
    { eventId: 'ob', type: 'ORDERBOOK_SNAPSHOT', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0, receivedAt: t0, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { bids: [{ price: 100, size: 5 }], asks: [{ price: 101, size: 5 }] } },
    { eventId: 'q0', type: 'QUOTE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0, receivedAt: t0, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { bid: 100, ask: 101, bidSize: 5, askSize: 5 } },
    { eventId: 'other-sell', type: 'TRADE', source: 'other-venue', symbol: 'BTC-USDT', exchangeTimestamp: t0 + 500, receivedAt: t0 + 500, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 100, size: 100, aggressorSide: 'SELL' } },
    { eventId: 's1', type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0 + 1000, receivedAt: t0 + 1000, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 100, size: 4, aggressorSide: 'SELL' } },
    { eventId: 's2', type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0 + 2000, receivedAt: t0 + 2000, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 100, size: 3, aggressorSide: 'SELL' } },
    { eventId: 's3', type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0 + 3000, receivedAt: t0 + 3000, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 100, size: 2, aggressorSide: 'SELL' } },
    { eventId: 'q1', type: 'QUOTE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0 + 4000, receivedAt: t0 + 4000, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { bid: 103.9, ask: 104.1, bidSize: 5, askSize: 5 } },
    { eventId: 'up', type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0 + 4000, receivedAt: t0 + 4000, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 104, size: 1, aggressorSide: 'BUY' } },
  ];
  const microInput = { simulationId: 'sim-1', symbol: 'BTC-USDT', events: microEvents, executionSource: 'qa', orderSide: 'BUY', entryType: 'LIMIT', submitAt: t0, quantity: 3, limitPrice: 100, stopPrice: 98, targetPrice: 104, latencyMs: 0, queueAheadFraction: 1, makerFeeBps: 2, takerFeeBps: 5, marketSlippageBps: 1, maxHorizonMs: 10_000 };
  const micro = simulateMicrostructureOrder(microInput);
  check('Microstructure simulator consumes displayed queue before passive fills', micro.queueAheadInitial === 5 && micro.entryFilledQuantity === 3 && micro.entryFills.length === 2);
  check('Microstructure simulator isolates queue/fills to one execution venue', micro.executionSource === 'qa' && micro.entryFills[0]?.timestamp === t0 + 2000);
  check('Microstructure simulator applies protective target exit with fees/slippage', micro.status === 'TARGET_HIT' && micro.netReturnPct > 0 && micro.totalFeesUsd > 0);
  const batch = await runMicrostructureSimulationBatch(Array.from({ length: 8 }, (_, index) => ({ ...microInput, simulationId: `worker-${index}` })), 2);
  check('Microstructure validation reuses a bounded persistent Node worker-thread pool', new Set(batch.map((row) => row.workerThreadId)).size === 2 && batch.every((row) => row.result.status === 'TARGET_HIT'));

  const evaluation = {
    evaluationId: 'eval-micro', symbol: 'BTC-USDT', generatedAt: t0, setupId: 'setup-micro', setupState: 'READY_FOR_CONFIRMATION', transitions: [], layers: [], evidence: [],
    macro: { expectedSweepDirection: 'DOWN', postSweepTradeBias: 'LONG', volatilityRegime: 'AMPLIFYING', score: 0.8 }, target: null,
    trigger: { kind: 'ABSORPTION_REVERSAL_TRIGGER', direction: 'LONG', score: 0.9, invalidationPrice: 98, reasons: [] }, shadowValidation: 'CONFIRM', fusionScore: 0.8,
    eligibleForManualConfirmation: true, shadowOnly: true, authoritative: false, reasons: [],
  };
  const validation = await runLiquidityHunterMicrostructureValidation({ events: microEvents, evaluations: [evaluation], symbol: 'BTC-USDT', entryPolicy: 'LIMIT_AT_SIGNAL_PRICE', quantity: 3, latencyMs: 0, maxHorizonMs: 10_000, concurrency: 2 });
  check('Microstructure validation report remains shadow-only, venue-isolated and execution-independent', validation.simulatedCount === 1 && validation.executionSource === 'qa' && validation.shadowOnly === true && validation.authoritative === false && validation.executionDependency === false);

  const failures = checks.filter((row) => !row.passed);
  const artifact = {
    generatedAt: new Date().toISOString(),
    checks,
    summary: {
      passed: checks.length - failures.length,
      total: checks.length,
      hyblockMode: 'OPTIONAL_AUTHENTICATED_PREDICTIVE_TOPOLOGY_SHADOW_ONLY',
      deribitMode: 'EVENT_TIME_IV_GAMMA_TAKER_FLOW_PROXY',
      walletGradingVersion: WALLET_GRADING_VERSION,
      microstructureMethodology: micro.methodology,
      workerThreadIds: [...new Set(batch.map((row) => row.workerThreadId))],
      autonomousLiveExecutionEnabled: false,
    },
  };
  fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
  fs.writeFileSync(path.join(root, 'QA', `liquidity-hunter-evidence-simulation-v${packageVersion}.json`), JSON.stringify(artifact, null, 2) + '\n');
  console.log(`\nLiquidity Hunter evidence/simulation runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
