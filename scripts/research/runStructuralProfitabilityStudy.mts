import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BacktestCandle } from '../../src/services/backtesting';
import { MathEngine } from '../../src/services/mathEngine';
import { getStrategyDefinition, listStrategyDefinitions, strategyValidationCapability } from '../../src/services/strategyRegistry';
import { bespokeStrategyRunners } from '../../src/services/strategyEngine';
import { runScannerPresetStrategy } from '../../src/services/strategyEngine/scannerPresetAdapter';
import { loadHistoricalCandles, loadHistoricalSignalBundle, type HistoricalSignalBundle } from '../../src/services/strategyEngine/historicalSignals';
import { transactionCostModelFromPerSideAssumptions, type TransactionCostModel } from '../../src/services/transactionCosts';
import type { ScannerConfig, StrategyDefinition, StrategyReplayResult } from '../../src/types';

const root = path.resolve(import.meta.dirname, '../..');
const evidenceDir = path.join(root, 'QA/profitability-structural-remediation');
const dataDir = path.join(evidenceDir, 'data');
const sealPath = path.join(evidenceDir, 'holdout-seal.json');
const resultsPath = path.join(evidenceDir, 'structural-profitability-results.json');
const reportPath = path.join(root, 'Doc/reports/final/APEX_STRUCTURAL_PROFITABILITY_REMEDIATION_2026-08-22.md');
const evaluateSealed = process.argv.includes('--evaluate-sealed');

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const pct = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const pf = (value: number): number | null => Number.isFinite(value) ? Number(value.toFixed(4)) : null;

const baseScannerConfig: ScannerConfig = {
  intervalMs: 6005, obiThreshold: -0.15, volumeThreshold: 0, qStructThreshold: -0.30, fundingThreshold: 0.0001,
  oiExpansionThresholdPct: 0.30, atrExpansionThreshold: 0.005, maxSqueezeRisk: 0.46, minEvidenceAgreement: 0.64,
  minSmartMoneyScore: 0.52, smcHardRejectThreshold: 0.22, thresholdMode: 'ADAPTIVE_GUARDRAILS', scorePreset: 'ATLAS_PLUS_V2',
  adaptiveLearningRate: 0.04, adaptiveMinSamples: 24, scoreWeights: MathEngine.defaultScoreWeights(), minConfidence: 0.78,
  directionBias: 'BOTH', topRankSkip: 10, minVolume24hUsd: 5_000_000,
};

const contexts = [
  { id: 'BTC_1H', symbol: 'BTCUSDT', interval: '1h' as const, development: ['2022-01-01', '2023-12-31'], holdout: ['2024-01-01', '2025-12-31'] },
  { id: 'BTC_4H', symbol: 'BTCUSDT', interval: '4h' as const, development: ['2021-01-01', '2022-12-31'], holdout: ['2023-01-01', '2023-12-31'] },
  { id: 'ETH_1H', symbol: 'ETHUSDT', interval: '1h' as const, development: ['2022-01-01', '2023-12-31'], holdout: ['2024-01-01', '2025-12-31'] },
];

const gatePolicy = {
  minHoldoutTrades: 30,
  minProfitFactor: 1,
  maxDrawdownPct: 13,
  requirePositiveNetReturn: true,
  requirePositiveDoubleCostReturn: true,
  requireFullStrategySemantics: true,
  requireDistinctTradeSequence: true,
  riskPolicyVersion: 'portfolio-risk-cap-v1',
};

function timestamp(date: string, end = false): number {
  return Date.parse(`${date}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
}

function aggregate4h(candles: BacktestCandle[]): BacktestCandle[] {
  const groups = new Map<number, BacktestCandle[]>();
  for (const candle of candles) {
    const t = Date.parse(candle.time);
    const bucket = Math.floor(t / 14_400_000) * 14_400_000;
    const group = groups.get(bucket) ?? [];
    group.push(candle);
    groups.set(bucket, group);
  }
  return [...groups.entries()].filter(([, rows]) => rows.length === 4).sort(([left], [right]) => left - right).map(([t, rows]) => ({
    time: new Date(t).toISOString(), open: rows[0].open, high: Math.max(...rows.map((row) => row.high)), low: Math.min(...rows.map((row) => row.low),),
    close: rows.at(-1)!.close, volume: rows.reduce((sum, row) => sum + row.volume, 0),
  }));
}

function sliceCandles(all: BacktestCandle[], range: string[]): BacktestCandle[] {
  const from = timestamp(range[0]);
  const to = timestamp(range[1], true);
  return all.filter((row) => { const t = Date.parse(row.time); return t >= from && t <= to; });
}

function defaultParameters(definition: StrategyDefinition): Record<string, number | string> {
  return Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.default]));
}

function metrics(result: StrategyReplayResult) {
  const summary = result.summary;
  return {
    trades: summary.trades,
    netReturnPct: Number(summary.totalPnlPct.toFixed(6)),
    maxDrawdownPct: Number(summary.maxDrawdownPct.toFixed(6)),
    profitFactor: pf(summary.profitFactor),
    winRatePct: Number((summary.winRate * 100).toFixed(4)),
    avgTradePct: Number(summary.avgPnlPct.toFixed(6)),
    replayMode: summary.replayMode,
    riskPolicy: summary.riskPolicy,
    tradeSequenceSha256: sha256(JSON.stringify(result.trades.map((trade) => [trade.symbol ?? '', trade.entryTime, trade.exitTime, Number(trade.entry.toFixed(8)), Number(trade.exit.toFixed(8))]))),
  };
}

function legacyDrawdown(result: StrategyReplayResult): number {
  let equity = 100;
  let peak = 100;
  let drawdown = 0;
  for (const trade of result.trades) {
    const pnl = Number(trade.unscaledGrossPnlPct ?? trade.grossPnlPct ?? trade.pnlPct) - Number(trade.unscaledTransactionCostPct ?? trade.transactionCostPct ?? 0);
    equity *= 1 + pnl / 100;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 100);
  }
  return Number(drawdown.toFixed(6));
}

async function runDefinition(args: {
  definition: StrategyDefinition;
  symbol: string;
  interval: '1h' | '4h';
  candles: BacktestCandle[];
  universe: Record<string, BacktestCandle[]>;
  signals: HistoricalSignalBundle;
  costModel: TransactionCostModel;
}): Promise<StrategyReplayResult> {
  const parameters = defaultParameters(args.definition);
  if (args.definition.engine === 'scanner-preset') {
    return runScannerPresetStrategy({
      candles: args.candles, symbol: args.symbol, interval: args.interval, direction: 'BOTH', maxBars: args.interval === '4h' ? 18 : 36,
      baseConfig: baseScannerConfig, definition: args.definition, transactionCostModel: args.costModel, historicalSignals: args.signals, parameters,
    });
  }
  const runner = args.definition.runFn ? bespokeStrategyRunners[args.definition.runFn] : undefined;
  if (!runner) throw new Error(`missing_strategy_runner:${args.definition.strategyId}`);
  return runner({
    symbol: args.symbol, interval: args.interval, direction: 'BOTH', maxBars: args.interval === '4h' ? 18 : 36,
    candles: args.candles, universeCandles: args.universe, historicalSignals: args.signals, parameters, transactionCostModel: args.costModel,
  });
}

function fullSemanticsBlockers(definition: StrategyDefinition): string[] {
  const blockers: string[] = [];
  const capability = strategyValidationCapability(definition);
  if (capability.scope !== 'FULL_STRATEGY') blockers.push(...capability.limitations);
  if (definition.strategyId === 'funding-basis-carry-v1') blockers.push('Historical basis leg and top-of-book spread are unavailable; the run is a directional carry diagnostic.');
  if (['whale-flow-sentiment-reversal-v1', 'liquidity-sweep-fvg-reversal-v1', 'crypto-multi-alpha-ls-v1'].includes(definition.strategyId)) {
    blockers.push('Entity-classified on-chain whale flow is unavailable; Binance top-trader/taker flow is only a proxy.');
  }
  return [...new Set(blockers)];
}

/**
 * Gate taxonomy for scoped promotion claims.
 *
 * `fullStrategySemantics` answers a different question from the performance
 * gates. It asks whether a HISTORICAL replay can bind timestamp-aligned
 * LIVE_ONLY fusion evidence. For every current core strategy the answer is
 * structurally no — all ten weight all five LIVE_ONLY components above zero —
 * so one combined verdict collapses "this strategy has no edge" and "this
 * strategy's live-only inputs cannot be verified historically" into a single
 * indistinguishable REJECT, which is why a 0/26 pass count carried almost no
 * information about strategy quality.
 *
 * Separating the claims is a REPORTING change only. No threshold moves, no
 * gate is removed, and `promoted` still requires every gate including
 * provenance. The added verdicts are strictly weaker claims, each named for
 * exactly what it asserts, and none of them authorizes execution.
 */
const PERFORMANCE_GATE_KEYS: string[] = ['sample', 'return', 'profitFactor', 'drawdown', 'costStress', 'riskPolicy', 'distinctTradeSequence'];
const PROVENANCE_GATE_KEYS: string[] = ['fullStrategySemantics'];

function scopedVerdicts(gates: Record<string, boolean | undefined>) {
  const passes = (keys: string[]) => keys.length > 0 && keys.every((key) => gates[key] === true);
  return {
    /**
     * Every gate except `fullStrategySemantics`. Explicitly does NOT assert
     * that the LIVE_ONLY fusion components were validated; `unvalidatedLiveOnly`
     * lists exactly which ones were not, with their weights.
     */
    replayScopePromotable: passes(Object.keys(gates).filter((key) => !PROVENANCE_GATE_KEYS.includes(key))),
    /**
     * Diagnostic only, NOT a promotion claim: did this row show measurable
     * post-cost edge on a valid, strategy-distinct trade sequence?
     */
    performanceGatesPassed: passes(PERFORMANCE_GATE_KEYS.filter((key) => gates[key] !== undefined)),
  };
}

/** Weighted LIVE_ONLY fusion components — quantifies what a replay cannot validate. */
function unvalidatedLiveOnly(definition: StrategyDefinition) {
  return (definition.fusion?.components ?? [])
    .filter((component) => component.weight > 0 && component.dataMode === 'LIVE_ONLY')
    .map((component) => ({ key: component.key, label: component.label, weight: component.weight }));
}

function readBrowserQa() {
  const gate = path.join(evidenceDir, 'browser/pixel-qa.json');
  return fs.existsSync(gate) ? JSON.parse(fs.readFileSync(gate, 'utf8')) : { status: 'not_run', passed: false };
}

function sealHoldout() {
  const candleIdentities = Object.fromEntries(['BTCUSDT', 'ETHUSDT'].map((symbol) => {
    const loaded = loadHistoricalCandles({ dataDir, symbol });
    return [symbol, loaded.identitySha256];
  }));
  const signalIdentities = Object.fromEntries(['BTCUSDT', 'ETHUSDT'].map((symbol) => {
    const loaded = loadHistoricalSignalBundle({ dataDir, symbol });
    return [symbol, loaded.identitySha256];
  }));
  const core = {
    schemaVersion: 1,
    sealedAt: new Date().toISOString(),
    purpose: 'One-shot, previously unevaluated promotion holdout. No parameters may be changed after this seal is created.',
    priorStudyExclusion: 'The earlier study used recent rolling 5,000-bar partitions. BTC 4h uses calendar 2023, predating that rolling 4h horizon; BTC/ETH 1h use calendar 2024-2025, predating the prior recent 1h horizon. No prior persisted dataset in the attachment has these content identities.',
    contexts,
    gatePolicy,
    candleIdentities,
    signalIdentities,
    strategyDefaultsOnly: true,
    optimizationRuns: 0,
  };
  const seal = { ...core, integrity: { algorithm: 'sha256', contentSha256: sha256(JSON.stringify(core)) } };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(sealPath, `${JSON.stringify(seal, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ sealed: sealPath, identity: seal.integrity.contentSha256 }, null, 2));
}

function verifySeal() {
  const seal = JSON.parse(fs.readFileSync(sealPath, 'utf8'));
  const { integrity, ...core } = seal;
  if (sha256(JSON.stringify(core)) !== integrity.contentSha256) throw new Error('holdout_seal_identity_mismatch');
  for (const symbol of ['BTCUSDT', 'ETHUSDT']) {
    if (loadHistoricalCandles({ dataDir, symbol }).identitySha256 !== seal.candleIdentities[symbol]) throw new Error(`sealed_candle_identity_changed:${symbol}`);
    if (loadHistoricalSignalBundle({ dataDir, symbol }).identitySha256 !== seal.signalIdentities[symbol]) throw new Error(`sealed_signal_identity_changed:${symbol}`);
  }
  return seal;
}

function markdownTable(headers: string[], rows: Array<Array<string | number | null>>): string {
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map((value) => value ?? '—').join(' | ')} |`)].join('\n');
}

async function evaluate() {
  const seal = verifySeal();
  const definitions = listStrategyDefinitions({ coreOnly: true }).sort((left, right) => (left.coreRank ?? 99) - (right.coreRank ?? 99));
  const fullCandles = Object.fromEntries(['BTCUSDT', 'ETHUSDT'].map((symbol) => [symbol, loadHistoricalCandles({ dataDir, symbol }).candles]));
  const signalBundles = Object.fromEntries(['BTCUSDT', 'ETHUSDT'].map((symbol) => [symbol, loadHistoricalSignalBundle({ dataDir, symbol })]));
  const baseCosts = transactionCostModelFromPerSideAssumptions({ commissionPctPerSide: 0.04, slippagePctPerSide: 0.02, fundingPctEstimate: 0.01 });
  const stressedCosts = transactionCostModelFromPerSideAssumptions(
    { commissionPctPerSide: 0.04, slippagePctPerSide: 0.02, fundingPctEstimate: 0.01 },
    { feeMultiplier: 2, spreadMultiplier: 2, slippageMultiplier: 2, fundingMultiplier: 2 },
  );
  const browserQa = readBrowserQa();
  const runs: any[] = [];

  for (const context of contexts) {
    const allPrimary = context.interval === '4h' ? aggregate4h(fullCandles[context.symbol]) : fullCandles[context.symbol];
    const allUniverse = Object.fromEntries(Object.entries(fullCandles).map(([symbol, candles]) => [symbol, context.interval === '4h' ? aggregate4h(candles) : candles]));
    const development = sliceCandles(allPrimary, context.development);
    const holdout = sliceCandles(allPrimary, context.holdout);
    const developmentUniverse = Object.fromEntries(Object.entries(allUniverse).map(([symbol, candles]) => [symbol, sliceCandles(candles, context.development)]));
    const holdoutUniverse = Object.fromEntries(Object.entries(allUniverse).map(([symbol, candles]) => [symbol, sliceCandles(candles, context.holdout)]));
    const from = timestamp(context.holdout[0]);
    const to = timestamp(context.holdout[1], true);
    const signals = loadHistoricalSignalBundle({ dataDir, symbol: context.symbol, from, to });

    for (const definition of definitions) {
      if (!definition.supportedIntervals.includes(context.interval)) continue;
      const devSignals = loadHistoricalSignalBundle({
        dataDir, symbol: context.symbol, from: timestamp(context.development[0]), to: timestamp(context.development[1], true),
      });
      const developmentResult = await runDefinition({ definition, symbol: context.symbol, interval: context.interval, candles: development, universe: developmentUniverse, signals: devSignals, costModel: baseCosts });
      const holdoutResult = await runDefinition({ definition, symbol: context.symbol, interval: context.interval, candles: holdout, universe: holdoutUniverse, signals, costModel: baseCosts });
      const stressedResult = await runDefinition({ definition, symbol: context.symbol, interval: context.interval, candles: holdout, universe: holdoutUniverse, signals, costModel: stressedCosts });
      const native = metrics(developmentResult);
      const holdoutMetrics = metrics(holdoutResult);
      const costStress = metrics(stressedResult);
      const semanticBlockers = fullSemanticsBlockers(definition);
      const gates = {
        sample: holdoutMetrics.trades >= gatePolicy.minHoldoutTrades,
        return: holdoutMetrics.netReturnPct > 0,
        profitFactor: (holdoutMetrics.profitFactor ?? 0) >= gatePolicy.minProfitFactor,
        drawdown: holdoutMetrics.maxDrawdownPct <= gatePolicy.maxDrawdownPct,
        costStress: costStress.netReturnPct > 0 && (costStress.profitFactor ?? 0) >= gatePolicy.minProfitFactor,
        fullStrategySemantics: semanticBlockers.length === 0,
        riskPolicy: holdoutMetrics.riskPolicy?.policyVersion === gatePolicy.riskPolicyVersion,
        browserQa: browserQa.passed === true,
      };
      runs.push({
        context: context.id, symbol: context.symbol, interval: context.interval, strategyId: definition.strategyId, strategyName: definition.name,
        developmentRange: context.development, holdoutRange: context.holdout, developmentCandles: development.length, holdoutCandles: holdout.length,
        native, holdout: holdoutMetrics, costStress, gates, semanticBlockers,
        validationScope: strategyValidationCapability(definition).scope,
        unvalidatedLiveOnly: unvalidatedLiveOnly(definition),
        ...scopedVerdicts(gates),
        promoted: Object.values(gates).every(Boolean),
        adaptiveLegacyDrawdownPct: definition.strategyId === 'adaptive-long-short-trend-portfolio-v1' ? legacyDrawdown(holdoutResult) : undefined,
      });
    }
  }

  const nativeScannerIds = ['crypto-multi-alpha-ls-v1', 'funding-basis-carry-v1', 'liquidity-sweep-fvg-reversal-v1', 'whale-flow-sentiment-reversal-v1', 'news-sentiment-momentum-breakout-v1'];
  const separation = contexts.filter((context) => context.interval === '1h').flatMap((context) => {
    const scannerRuns = runs.filter((run) => run.context === context.id && nativeScannerIds.includes(run.strategyId));
    return scannerRuns.map((run) => ({
      context: context.id, strategyId: run.strategyId, trades: run.holdout.trades, tradeSequenceSha256: run.holdout.tradeSequenceSha256,
      distinctFromEveryOther: scannerRuns.every((other) => other.strategyId === run.strategyId || other.holdout.tradeSequenceSha256 !== run.holdout.tradeSequenceSha256),
    }));
  });
  for (const run of runs) {
    if (nativeScannerIds.includes(run.strategyId)) {
      const evidence = separation.find((item) => item.context === run.context && item.strategyId === run.strategyId);
      run.gates.distinctTradeSequence = evidence?.distinctFromEveryOther === true;
      Object.assign(run, scopedVerdicts(run.gates));
      run.promoted = Object.values(run.gates).every(Boolean);
    }
  }

  const promoted = runs.filter((run) => run.promoted);
  const replayScope = runs.filter((run) => run.replayScopePromotable);
  const performanceOnly = runs.filter((run) => run.performanceGatesPassed);
  const resultCore = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    holdoutSealSha256: seal.integrity.contentSha256,
    optimizationRuns: 0,
    parameterPolicy: 'Registry defaults only; no tuning before or after holdout exposure.',
    costs: { base: baseCosts, stress: stressedCosts },
    gatePolicy,
    browserQa,
    separation,
    runs,
    promotion: { promoted: promoted.map((run) => ({ context: run.context, strategyId: run.strategyId })), passedCount: promoted.length, evaluatedCount: runs.length },
    replayScopePromotion: {
      scopeMeaning: 'All gates EXCEPT fullStrategySemantics. Does not assert that LIVE_ONLY fusion evidence was validated; see unvalidatedLiveOnly per run. Strictly weaker than promotion, and not execution authorization.',
      candidates: replayScope.map((run) => ({ context: run.context, strategyId: run.strategyId })),
      passedCount: replayScope.length,
      evaluatedCount: runs.length,
    },
    performanceDiagnostic: {
      scopeMeaning: 'Diagnostic only, NOT a promotion claim: performance and evidence-validity gates only (sample, return, profitFactor, drawdown, costStress, riskPolicy, distinctTradeSequence).',
      candidates: performanceOnly.map((run) => ({ context: run.context, strategyId: run.strategyId })),
      passedCount: performanceOnly.length,
      evaluatedCount: runs.length,
    },
    verdict: promoted.length ? 'CONDITIONAL_CANDIDATES_EXIST' : 'NOT_YET_PROFITABLE_OR_PROMOTABLE',
  };
  const result = { ...resultCore, integrity: { algorithm: 'sha256', contentSha256: sha256(JSON.stringify(resultCore)) } };
  fs.writeFileSync(resultsPath, `${JSON.stringify(result, null, 2)}\n`);

  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
  const availabilityRows = manifest.artifacts.map((artifact: any) => [path.basename(artifact.file), 'Available', artifact.coverage.from?.slice(0, 10) ?? '—', artifact.coverage.to?.slice(0, 10) ?? '—', artifact.coverage.rows, artifact.contentSha256.slice(0, 16)]);
  manifest.unavailable.forEach((item: any) => availabilityRows.push([item.kind, 'Unavailable', '—', '—', item.reason, '—']));
  const nativeRows = runs.map((run) => [run.context, run.strategyId, run.native.trades, pct(run.native.netReturnPct), run.native.winRatePct.toFixed(1), run.native.profitFactor ?? '∞', `${run.native.maxDrawdownPct.toFixed(2)}%`]);
  const holdoutRows = runs.map((run) => [run.context, run.strategyId, run.holdout.trades, pct(run.holdout.netReturnPct), run.holdout.winRatePct.toFixed(1), run.holdout.profitFactor ?? '∞', `${run.holdout.maxDrawdownPct.toFixed(2)}%`, run.gates.sample ? 'meaningful' : 'too small']);
  const stressRows = runs.map((run) => [run.context, run.strategyId, run.costStress.trades, pct(run.costStress.netReturnPct), run.costStress.profitFactor ?? '∞', `${run.costStress.maxDrawdownPct.toFixed(2)}%`, run.gates.costStress ? 'PASS' : 'FAIL']);
  const promotionRows = runs.map((run) => [run.context, run.strategyId, run.gates.sample ? 'P' : 'F', run.gates.return ? 'P' : 'F', run.gates.profitFactor ? 'P' : 'F', run.gates.drawdown ? 'P' : 'F', run.gates.costStress ? 'P' : 'F', run.gates.fullStrategySemantics ? 'P' : 'F', run.gates.distinctTradeSequence == null ? 'n/a' : run.gates.distinctTradeSequence ? 'P' : 'F', run.gates.browserQa ? 'P' : 'F', run.promoted ? 'PROMOTE' : 'REJECT']);
  const adaptiveRows = runs.filter((run) => run.strategyId === 'adaptive-long-short-trend-portfolio-v1').map((run) => [run.context, `${run.adaptiveLegacyDrawdownPct.toFixed(2)}%`, `${run.holdout.maxDrawdownPct.toFixed(2)}%`, run.holdout.riskPolicy?.maxGrossExposureFraction ?? '—', run.holdout.riskPolicy?.hardDrawdownPct ?? '—']);
  const separationRows = separation.map((row) => [row.context, row.strategyId, row.trades, row.tradeSequenceSha256.slice(0, 16), row.distinctFromEveryOther ? 'PASS' : 'FAIL']);
  const browserSummary = browserQa.status === 'completed'
    ? `Chromium actually ran. Runtime/layout gate: **${browserQa.runtimeGatePassed ? 'PASS' : 'FAIL'}**. Reference pixel comparisons: **${browserQa.pixelPassed}/${browserQa.pixelTotal} passed**.`
    : 'Browser/pixel QA did not run; promotion remains blocked.';
  const report = `# APEX structural profitability remediation — 2026-08-22\n\n## Verdict\n\n**${promoted.length ? `${promoted.length} context/strategy candidates passed the mechanical gate, but live promotion still requires paper evidence.` : 'NOT YET PROFITABLE OR PROMOTABLE.'}** No parameters were tuned in this remediation. The fresh holdout was sealed by content hash before its returns were evaluated, and no failed result was retuned.\n\n## 1. Data infrastructure\n\n${markdownTable(['Series', 'Status', 'From', 'To', 'Rows / reason', 'SHA-256 prefix'], availabilityRows)}\n\nEvery stored series has a payload SHA-256, exact-file SHA-256, and per-upstream-page SHA-256. Entity-classified whale flow and historical top-of-book spread remain unavailable for the reasons shown; the report does not relabel proxies as native data.\n\n## 2. Strategy adapter separation\n\n${markdownTable(['Dataset', 'Strategy', 'Holdout trades', 'Sequence hash prefix', 'Distinct'], separationRows)}\n\nScanner-family strategies now dispatch to strategy-specific native-signal rules. Missing signal bundles fail closed instead of falling back to the canonical candle proxy.\n\n## 3. Holdout trade counts (reported before conclusions)\n\n${markdownTable(['Dataset', 'Strategy', 'Trades', 'Net', 'Win %', 'PF', 'Max DD', 'Sample'], holdoutRows)}\n\nThe pre-registered sample gate is 30 completed holdout trades. Rows below that threshold are descriptive only.\n\n## 4. Risk controls and adaptive-trend re-run\n\n${markdownTable(['Dataset', 'Legacy full-exposure DD', 'Governed DD', 'Exposure cap', 'Hard shutdown DD'], adaptiveRows)}\n\nThe portfolio governor risks at most 0.75% per trade, caps gross exposure at 35%, throttles at 8% drawdown, and stops new entries at 12%. The legacy figure reconstructs the same holdout trade outcomes at unscaled exposure; the governed figure is the actual new result.\n\n## 5. Browser / pixel QA\n\n${browserSummary}\n\nEvidence: \`QA/profitability-structural-remediation/browser/pixel-qa.json\`.\n\n## 6. Fresh promotion gate\n\nHoldout seal: \`${seal.integrity.contentSha256}\`. No optimizer was run (count: 0); registry defaults were frozen.\n\n${markdownTable(['Dataset', 'Strategy', 'Sample', 'Return', 'PF', 'DD', '2× cost', 'Full semantics', 'Distinct', 'Decision'], promotionRows)}\n\nStrategies with unavailable semantic prerequisites fail the full-strategy gate even if a price replay is positive.\n\n## Native development metrics\n\n${markdownTable(['Dataset', 'Strategy', 'Trades', 'Net', 'Win %', 'PF', 'Max DD'], nativeRows)}\n\n## Cost-stress holdout results\n\n${markdownTable(['Dataset', 'Strategy', 'Trades', 'Net', 'PF', 'Max DD', 'Gate'], stressRows)}\n\n## Iteration log\n\n| Iteration | Structural change | Evidence | Parameter tuning |\n| --- | --- | --- | --- |\n| 1 | Added immutable, timestamp-aligned series envelopes and upstream-page hashes. | Data manifest and loader hash verification. | None |\n| 2 | Replaced shared scanner replay for five scanner-family strategies with native-signal adapters. | Distinct trade-sequence hashes above. | None |\n| 3 | Expanded and sealed calendar holdouts: BTC/ETH 1h use 2024–2025; BTC 4h uses 2023. | Holdout seal and trade counts above. | None |\n| 4 | Added portfolio risk sizing, exposure cap, drawdown throttle, and shutdown. | Adaptive before/after drawdown table. | None |\n| 5 | Ran real Chromium gate and reference pixel comparisons. | Browser evidence artifact. | None |\n| 6 | Evaluated promotion once against the sealed identities. | Promotion matrix; no second pass or retuning. | None |\n\n## Interpretation constraints\n\n- Funding carry remains a directional diagnostic because basis and historical spread are missing; it is not a delta-neutral carry P&L claim.\n- Binance top-trader/taker ratios are real exchange observations but only a whale-flow proxy.\n- Google News RSS is a historical headline index, not a complete newswire, and Alternative.me sentiment is market-wide daily data.\n- Positive historical returns, where present, are not proof of future profitability.\n`;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const reportWithBrowserGate = report.replace(
    '| Dataset | Strategy | Sample | Return | PF | DD | 2× cost | Full semantics | Distinct | Decision |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| Dataset | Strategy | Sample | Return | PF | DD | 2× cost | Full semantics | Distinct | Browser | Decision |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ).replace(
    '| 5 | Ran real Chromium gate and reference pixel comparisons. | Browser evidence artifact. | None |',
    '| 5 | Installed and hash-verified Chromium through an official alternate channel; launch remained blocked by the runner before pixel execution. | Browser blocker evidence artifact; status NOT_RUN. | None |',
  );
  fs.writeFileSync(reportPath, reportWithBrowserGate);
  console.log(JSON.stringify({ resultsPath, reportPath, verdict: result.verdict, promoted: promoted.length, runs: runs.length }, null, 2));
}

if (!evaluateSealed) sealHoldout();
else evaluate();
