#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const requireFromHere = createRequire(import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const reportPath = path.join(root, 'QA', `comprehensive-simulation-v${packageJson.version}.json`);
const dataDir = path.join(root, 'QA', 'simulated-data');

function resolveTypeScript() {
  const local = path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js');
  if (fs.existsSync(local)) return local;
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const globalTs = path.join(globalRoot, 'typescript', 'lib', 'typescript.js');
    if (fs.existsSync(globalTs)) return globalTs;
  } catch { /* fall through */ }
  throw new Error('typescript_runtime_unavailable');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) out.push(absolute);
  }
  return out;
}

function compileSource() {
  const ts = requireFromHere(resolveTypeScript());
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-comprehensive-sim-'));
  for (const absolute of walk(path.join(root, 'src'))) {
    const rel = path.relative(root, absolute);
    const source = fs.readFileSync(absolute, 'utf8');
    const result = ts.transpileModule(source, {
      fileName: rel,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    const diagnostics = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
    if (diagnostics.length) throw new Error(`transpile_failed:${rel}:${diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, ' ')).join('|')}`);
    const target = path.join(out, rel.replace(/\.tsx?$/, '.js'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, result.outputText);
  }
  // Import-only shims: the risk module imports proxy plumbing, but this simulation
  // intentionally never performs network I/O. These shims cannot authorize or execute trades.
  const undiciDir = path.join(out, 'node_modules', 'undici');
  const socksDir = path.join(out, 'node_modules', 'socks-proxy-agent');
  fs.mkdirSync(undiciDir, { recursive: true });
  fs.mkdirSync(socksDir, { recursive: true });
  fs.writeFileSync(path.join(undiciDir, 'index.js'), "class Agent{constructor(o={}){this.options=o} close(){}};module.exports={Agent,fetch:globalThis.fetch,Headers:globalThis.Headers,Request:globalThis.Request,Response:globalThis.Response};\n");
  fs.writeFileSync(path.join(socksDir, 'index.js'), "class SocksProxyAgent{constructor(url){this.url=url}};module.exports={SocksProxyAgent};\n");
  return out;
}

function seededRng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function approx(a, b, tolerance = 1e-8) {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}

function readAndVerifyCorpus() {
  const manifestPath = path.join(dataDir, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'simulation manifest missing; run qa:generate-simulation-data first');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.syntheticOnly, true);
  assert.equal(manifest.deterministic, true);
  const datasets = new Map();
  for (const file of manifest.files) {
    const absolute = path.join(dataDir, file.file);
    const text = fs.readFileSync(absolute, 'utf8');
    assert.equal(crypto.createHash('sha256').update(text).digest('hex'), file.sha256, `fixture hash mismatch: ${file.file}`);
    const key = `${file.symbol}|${file.regime}`;
    const existing = datasets.get(key) ?? { symbol: file.symbol, regime: file.regime };
    if (file.kind === 'candles') existing.candles = JSON.parse(text);
    else existing.events = JSON.parse(text);
    datasets.set(key, existing);
  }
  return { manifest, datasets: [...datasets.values()] };
}

const checks = [];
const failures = [];
const check = (name, fn) => {
  try { fn(); checks.push({ name, ok: true }); }
  catch (error) { const detail = error instanceof Error ? error.message : String(error); checks.push({ name, ok: false, detail }); failures.push({ name, detail }); }
};

const build = compileSource();
const requireBuild = createRequire(path.join(build, 'entry.cjs'));
const fromBuild = (rel) => requireBuild(path.join(build, rel));
const replay = fromBuild('src/services/strategyEngine/replayHarness.js');
const adaptive = fromBuild('src/services/adaptiveLearningStress.js');
const provider = fromBuild('src/services/providerRoutingStress.js');
const micro = fromBuild('src/services/replay/microstructureFillSimulator.js');
const multi = fromBuild('src/services/multiAgentResearchCouncil.js');
const sizer = fromBuild('src/services/execution/paperMultiTradeSizer.js');
const tradePlan = fromBuild('src/services/tradePlan.js');
const riskGovernor = fromBuild('src/services/riskGovernor.js');
const corpus = readAndVerifyCorpus();

try {
  // 1) Deterministic market corpus + candle sanitization + indicator cache equivalence.
  for (const dataset of corpus.datasets) {
    const rows = dataset.candles;
    check(`corpus-shape:${dataset.symbol}:${dataset.regime}`, () => {
      assert.ok(rows.length >= 450 || dataset.regime === 'feed_gap_recovery');
      assert.ok(dataset.events.length > 200);
      for (const row of rows) {
        assert.ok([row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite));
        assert.ok(row.high >= Math.max(row.open, row.close, row.low));
        assert.ok(row.low <= Math.min(row.open, row.close, row.high));
      }
    });
    const dirty = [...rows].reverse();
    if (rows[30]) dirty.push({ ...rows[30], close: Number.NaN });
    if (rows[40]) dirty.push({ ...rows[40], time: 'invalid-time' });
    if (rows[50]) dirty.push({ ...rows[50], high: rows[50].low - 1 });
    if (rows[80]) dirty.push({ ...rows[80], close: rows[80].close + 1 });
    const clean = replay.sanitizeCandles(dirty);
    check(`sanitize:${dataset.symbol}:${dataset.regime}`, () => {
      assert.ok(clean.length >= rows.length - 2);
      for (let index = 1; index < clean.length; index += 1) assert.ok(Date.parse(clean[index].time) > Date.parse(clean[index - 1].time));
    });
    const cache = replay.buildReplayIndicatorCache(rows);
    const closes = rows.map((item) => item.close);
    for (const length of [2, 5, 14, 30]) {
      for (const end of [Math.min(rows.length, 60), Math.min(rows.length, 180), rows.length]) {
        if (end < length) continue;
        check(`indicators:${dataset.symbol}:${dataset.regime}:${length}:${end}`, () => {
          assert.ok(approx(cache.smaClose(end, length), replay.sma(closes, end, length), 1e-10));
          assert.ok(approx(cache.stdClose(end, length), replay.rollingStd(closes, end, length), 1e-8));
          if (end >= length + 1) assert.ok(approx(cache.atr(end, length), replay.atr(rows, end, length), 1e-10));
          assert.ok(approx(cache.vwap(end, length), replay.rollingVwap(rows, end, length), 1e-10));
        });
      }
    }
  }

  // 2) Adaptive-learning and provider-routing determinism / fabrication guards.
  for (let seed = 1; seed <= 100; seed += 1) {
    const result = adaptive.runAdaptiveLearningStress({ seed, cycles: 300, candidatesPerCycle: 8, generatedAt: '2026-08-13T00:00:00.000Z' });
    check(`adaptive:${seed}`, () => { assert.equal(result.verdict, 'PASS'); assert.ok(result.run.acceptanceRate <= 0.2); });
  }
  for (let seed = 1; seed <= 60; seed += 1) {
    const result = await provider.runProviderRoutingStress({ seed, generatedAt: '2026-08-13T00:00:00.000Z' });
    check(`provider:${seed}`, () => { assert.equal(result.verdict, 'PASS'); assert.ok(result.scenarios.every((scenario) => !scenario.fabricated)); });
  }

  // 3) Event-level microstructure fuzz across market/limit, BUY/SELL, fees, latency and queues.
  for (let seed = 1; seed <= 1000; seed += 1) {
    const rng = seededRng(seed ^ 0xC0FFEE);
    const dataset = corpus.datasets[(seed - 1) % corpus.datasets.length];
    const side = rng() < 0.5 ? 'BUY' : 'SELL';
    const entryType = rng() < 0.5 ? 'MARKET' : 'LIMIT';
    const firstQuote = dataset.events.find((event) => event.type === 'QUOTE')?.payload;
    const base = firstQuote ? (firstQuote.bid + firstQuote.ask) / 2 : dataset.candles.at(-1).close;
    const quantity = 0.01 + rng() * 8;
    const limitPrice = side === 'BUY' ? base * (1 - rng() * 0.002) : base * (1 + rng() * 0.002);
    const submitAt = dataset.events[0].exchangeTimestamp;
    const result = micro.simulateMicrostructureOrder({
      simulationId: `comprehensive-${seed}`, symbol: dataset.symbol, events: dataset.events, executionSource: 'apex-deterministic-sim',
      orderSide: side, entryType, submitAt, quantity, limitPrice: entryType === 'LIMIT' ? limitPrice : undefined,
      stopPrice: side === 'BUY' ? base * 0.97 : base * 1.03, targetPrice: side === 'BUY' ? base * 1.03 : base * 0.97,
      latencyMs: rng() * 500, maxHorizonMs: 35_000, queueAheadFraction: rng() * 2,
      makerFeeBps: rng() * 5, takerFeeBps: rng() * 10, marketSlippageBps: rng() * 5,
    });
    check(`micro:${seed}`, () => {
      assert.ok(result.entryFilledQuantity >= -1e-9 && result.entryFilledQuantity <= quantity + 1e-8);
      assert.ok(result.exitFilledQuantity >= -1e-9 && result.exitFilledQuantity <= result.entryFilledQuantity + 1e-8);
      for (const fill of [...result.entryFills, ...result.exitFills]) assert.ok(Number.isFinite(fill.price) && fill.price > 0 && Number.isFinite(fill.quantity) && fill.quantity > 0);
      if (result.netReturnPct !== null) assert.ok(Number.isFinite(result.netReturnPct));
    });
  }

  // 4) Adversarial Trade Plan / Risk Governor fuzz, including underreported notional regression.
  for (let seed = 1; seed <= 250; seed += 1) {
    const rng = seededRng(seed ^ 0xBAD5EED);
    const entry = 80 + rng() * 500;
    const stopDistance = entry * (0.02 + rng() * 0.04);
    const levels = { symbol: 'BTC-USDT', entry, resistances: [entry + stopDistance * 2.4, entry + stopDistance * 3, entry + stopDistance * 4], supports: [entry - stopDistance, entry - stopDistance * 1.5, entry - stopDistance * 2], method: 'ATR_BANDS', atr14: stopDistance * 0.7, confidenceScore: 80, evidenceList: [], riskReward: { nearestTarget: entry + stopDistance * 2.4, nearestStop: entry - stopDistance, rMultiple: 2.4, riskPct: 5 }, dataState: 'live' };
    const plan = tradePlan.buildTradePlan({
      symbol: 'BTC-USDT', direction: 'LONG', levels,
      sizing: { accountBalanceUsd: 10_000, riskMode: 'PCT', riskValue: 0.25 + rng() * 0.5, leverage: 1 + Math.floor(rng() * 3), entryPrice: entry, stopLossPrice: entry - stopDistance, takeProfitPrice: levels.resistances[0], direction: 'LONG', successProbModel: 65, successProbUserOverride: null },
      spread: entry * 0.00005, spreadState: 'VALID', fundingRate: 0.00005, fundingState: 'VALID', now: 1_000, ttlMs: 60_000,
    });
    const baseInput = {
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
      portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true }, executionMode: 'AUTOMATED', plan, policy: riskGovernor.loadRiskGovernorPolicy({}), now: 1_000,
    };
    const normal = riskGovernor.evaluateRiskGovernor({ ...baseInput, order: { symbol: plan.symbol, direction: plan.direction, quantity: plan.quantity, entryPrice: plan.entryPrice, notionalUsd: plan.sizing.positionSizeUsd, leverage: plan.leverage, reduceOnly: false, exchange: 'paper' } });
    check(`risk-normal:${seed}`, () => assert.ok(['APPROVED', 'APPROVED_REDUCED'].includes(normal.decision)));
    const understated = riskGovernor.evaluateRiskGovernor({ ...baseInput, order: { symbol: plan.symbol, direction: plan.direction, quantity: plan.quantity * 1000, entryPrice: plan.entryPrice, notionalUsd: plan.sizing.positionSizeUsd, leverage: plan.leverage, reduceOnly: false, exchange: 'paper' } });
    check(`risk-understated:${seed}`, () => { assert.equal(understated.decision, 'REJECTED'); assert.equal(understated.checks.find((item) => item.code === 'ORDER_GEOMETRY')?.status, 'FAIL'); });
    const multiplier = 0.1;
    const contractQuantity = plan.quantity / multiplier;
    const derivative = riskGovernor.evaluateRiskGovernor({ ...baseInput, order: { symbol: 'XBTUSDTM', direction: plan.direction, quantity: contractQuantity, entryPrice: plan.entryPrice, notionalUsd: plan.sizing.positionSizeUsd, contractMultiplier: multiplier, leverage: plan.leverage, reduceOnly: false, exchange: 'kucoin' } });
    check(`risk-contract-multiplier:${seed}`, () => assert.ok(['APPROVED', 'APPROVED_REDUCED'].includes(derivative.decision)));
    const badLeverage = riskGovernor.evaluateRiskGovernor({ ...baseInput, order: { symbol: plan.symbol, direction: plan.direction, quantity: plan.quantity, entryPrice: plan.entryPrice, notionalUsd: plan.sizing.positionSizeUsd, leverage: seed % 2 ? 0 : Number.NaN, reduceOnly: false, exchange: 'paper' } });
    check(`risk-leverage:${seed}`, () => assert.equal(badLeverage.decision, 'REJECTED'));
    const corruptedPlan = { ...plan, sizing: { ...plan.sizing, positionSizeBase: plan.quantity * 10 } };
    check(`plan-integrity:${seed}`, () => { const result = tradePlan.assertTradePlanSubmittable(corruptedPlan, 1_000); assert.equal(result.ok, false); assert.ok(result.errors.some((error) => error.includes('base-quantity'))); });
  }

  // 5) Multi-agent research remains deterministic and paper-only; position sizing stays inside budgets.
  for (let seed = 1; seed <= 100; seed += 1) {
    const rng = seededRng(seed ^ 0xA63E17);
    const jobs = Array.from({ length: 12 }, (_, index) => ({
      id: `seed-${seed}-job-${index}`, strategyId: `s${index % 4}`, symbol: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'][index % 3], interval: '1h', direction: index % 4 === 0 ? 'SHORT' : 'LONG', status: 'COMPLETED',
      metrics: { totalPnlPct: 2 + rng() * 12, maxDrawdownPct: 1 + rng() * 8, profitFactor: 1.05 + rng(), tradeCount: 20 + index, winRatePct: 48 + rng() * 15, requestedBars: 1000, candlesUsed: 1000, dataSource: 'apex-deterministic-sim', dataState: 'live', historyComplete: true },
      utility: 2 + rng() * 15, error: null,
    }));
    const report = { version: 'multi_strategy_research_v2', jobs, ranking: [...jobs].sort((a, b) => b.utility - a.utility).map((item, index) => ({ id: item.id, utility: item.utility, rank: index + 1 })), paperPortfolio: jobs.slice(0, 3).map((item) => ({ id: item.id, strategyId: item.strategyId, symbol: item.symbol, direction: item.direction, weight: 1 / 3 })), conflicts: [], runtime: { jobs: 12, completed: 12, failed: 0, cancelled: 0, concurrency: 4, elapsedMs: 1 }, researchOnly: true, executionAuthorized: false, automaticOrderSubmission: false, deterministicFingerprint: 'b'.repeat(64) };
    const council = multi.runMultiAgentResearchCouncil(report, { capitalUsd: 100_000, portfolioRiskPct: 1, maxSlots: 3 });
    const repeat = multi.runMultiAgentResearchCouncil(report, { capitalUsd: 100_000, portfolioRiskPct: 1, maxSlots: 3 });
    check(`multi-agent:${seed}`, () => { assert.equal(council.deterministicFingerprint, repeat.deterministicFingerprint); assert.equal(council.safety.executionAuthorized, false); assert.ok(council.paperTradePlan.every((item) => item.orderSubmissionAllowed === false)); });
    const entries = council.paperTradePlan.map((item, index) => ({ id: item.id, entryPrice: 100 + index * 10, stopPrice: item.direction === 'LONG' ? 98 + index * 10 : 102 + index * 10 }));
    const sized = sizer.sizePaperMultiTradePositions({ sourceCouncilFingerprint: council.deterministicFingerprint, sourcePlanFingerprint: council.paperTradePlanFingerprint, plans: council.paperTradePlan, entries });
    check(`paper-sizing:${seed}`, () => { assert.equal(sized.safety.executionAuthorized, false); for (const item of sized.positions) { assert.ok(item.notionalUsedUsd <= item.notionalBudgetUsd + 0.01); assert.ok(item.maxLossUsedUsd <= item.maxLossBudgetUsd + 0.01); assert.equal(item.orderSubmissionAllowed, false); } });
  }
} finally {
  fs.rmSync(build, { recursive: true, force: true });
}

const report = {
  schemaVersion: 1,
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  syntheticOnly: true,
  liveQualificationClaimed: false,
  corpus: { datasets: corpus.manifest.datasets, candleRows: corpus.manifest.candleRows, eventRows: corpus.manifest.eventRows, seed: corpus.manifest.seed },
  checks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.slice(0, 100),
  categories: ['fixture-integrity', 'candle-sanitization', 'indicator-equivalence', 'adaptive-learning', 'provider-routing', 'microstructure-fuzz', 'risk-governor-adversarial', 'trade-plan-integrity', 'multi-agent-determinism', 'paper-sizing-safety'],
  note: 'Synthetic qualification cannot substitute for live exchange/network/credential evidence. Simulation rows are research-only and grant no execution authority.',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
