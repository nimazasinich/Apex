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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-lh-safe-completion-'));
const governanceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-lh-threshold-governance-'));

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

function transpileSourceTree() {
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
        jsx: ts.JsxEmit.ReactJSX,
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
}

const checks = [];
const check = (label, condition, detail = '') => {
  const passed = Boolean(condition);
  checks.push({ label, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

try {
  transpileSourceTree();
  const fromTemp = (file) => require(path.join(temp, file));
  const { EDGE_IDS } = fromTemp('src/contracts/realtime/edgeEvidence.js');
  const {
    EdgeThresholdGovernanceStore,
    applyEdgeThresholdGate,
    classifyEdgeSymbolClass,
    createBaselineEdgeThresholdProfile,
    edgeThresholdUniverse,
  } = fromTemp('src/services/liquidityHunter/edgeThresholdRegistry.js');
  const { optimizeEdgeThreshold } = fromTemp('src/services/liquidityHunter/edgeThresholdOptimizer.js');
  const { listStrategyDefinitions, STRATEGY_LIQUIDITY_HUNTER_EDGE_MAP } = fromTemp('src/services/strategyRegistry.js');

  const symbolClass = classifyEdgeSymbolClass('BTC-USDT');
  const profiles = EDGE_IDS.map((edgeId) => createBaselineEdgeThresholdProfile({ edgeId, symbolClass, timeframe: 'EVENT', regime: 'ANY' }));
  check('all 10 Liquidity Hunter edges have a semantics-preserving baseline threshold', profiles.length === 10 && profiles.every((profile) => profile.baseline === 0 && profile.promotionState === 'BASELINE'));
  check('threshold governance universe exactly matches the 10 evidence edges', JSON.stringify(edgeThresholdUniverse()) === JSON.stringify(EDGE_IDS));

  const edgeId = 'FUNDING_OI';
  const profile = profiles.find((row) => row.edgeId === edgeId);
  const now = Date.UTC(2026, 7, 8, 0, 0, 0);
  const development = Array.from({ length: 120 }, (_, index) => ({
    edgeId,
    timestamp: now + index * 1_000,
    score: index < 60 ? 0.20 : 0.70,
    dataQuality: 0.90,
    netReturnPct: index < 60 ? -1.0 : 1.2,
    regime: ['TREND', 'RANGE', 'VOLATILE'][index % 3],
    role: 'DEVELOPMENT',
    sourceVersion: 'liquidity-hunter-core-v1',
  }));
  const holdout = Array.from({ length: 40 }, (_, index) => ({
    edgeId,
    timestamp: now + 200_000 + index * 1_000,
    score: index < 20 ? 0.20 : 0.70,
    dataQuality: 0.90,
    netReturnPct: index < 20 ? -0.8 : 1.1,
    regime: ['TREND', 'RANGE', 'VOLATILE'][index % 3],
    role: 'HOLDOUT',
    sourceVersion: 'liquidity-hunter-core-v1',
  }));
  const report = optimizeEdgeThreshold({
    profile,
    observations: [...development, ...holdout],
    validationContext: {
      sourceSet: ['binance-futures-public', 'kucoin-futures-public'],
      featureVersion: 'liquidity-hunter-core-v1',
      validationProtocol: 'PURGED_WALK_FORWARD_HOLDOUT',
      datasetFingerprintSha256: 'a'.repeat(64),
    },
    now,
  });
  check('edge optimizer selects only from development data and evaluates a candidate on isolated holdout', report.development.sampleCount === 120 && report.holdout.sampleCount === 40 && report.candidateThreshold !== null);
  check('edge optimizer can produce a manually reviewable stable candidate on deterministic evidence', report.eligibleForManualReview === true && report.blockers.length === 0, `candidate=${report.candidateThreshold}`);
  check('edge optimizer has no automatic promotion capability', report.automaticPromotionEnabled === false && report.shadowOnly === true);

  const storePath = path.join(governanceDir, 'thresholds.json');
  const store = new EdgeThresholdGovernanceStore(storePath);
  const before = store.resolveForRuntime(edgeId, 'BTC-USDT', 'EVENT', 'ANY');
  const proposal = store.stage(report, { symbolClass, timeframe: 'EVENT', regime: 'ANY' });
  const afterStage = store.resolveForRuntime(edgeId, 'BTC-USDT', 'EVENT', 'ANY');
  check('staging a candidate does not mutate the active runtime threshold', before.baseline === 0 && afterStage.baseline === 0 && proposal.status === 'PENDING_REVIEW');

  let missingApproverRejected = false;
  try { store.approve(proposal.id, ''); } catch (error) { missingApproverRejected = String(error?.message || error).includes('manual_approver_required'); }
  check('manual threshold promotion rejects an empty approver identity', missingApproverRejected);
  let missingCanaryEvidenceRejected = false;
  try { store.approve(proposal.id, 'qa-operator'); } catch (error) { missingCanaryEvidenceRejected = String(error?.message || error).includes('paper_canary_evidence_required'); }
  check('manual threshold promotion fails closed until Paper Canary and validation evidence is attached', missingCanaryEvidenceRejected);
  const promotionEvidence = {
    version: 'lh_edge_threshold_promotion_evidence_v1',
    sourceSet: ['kucoin-futures-public', 'binance-futures-public'],
    featureVersion: 'liquidity-hunter-core-v1',
    validationFingerprintSha256: 'a'.repeat(64),
    reproducibility: { passed: true, fingerprintSha256: 'b'.repeat(64) },
    costLatencyStress: { passed: true, fingerprintSha256: 'c'.repeat(64) },
    qualityConcentration: { passed: true, fingerprintSha256: 'd'.repeat(64) },
    paperCanary: { resolved: 24, fingerprintSha256: 'e'.repeat(64) },
    dataSourceStable: true,
    riskGovernorCompatible: true,
  };
  const canaryReady = store.markPaperCanaryReady(proposal.id, promotionEvidence);
  check('validated promotion evidence advances only the proposal lifecycle to PAPER_CANARY', canaryReady.profile.promotionState === 'PAPER_CANARY' && store.resolveForRuntime(edgeId, 'BTC-USDT', 'EVENT', 'ANY').baseline === 0);
  const promotedRevision = store.approve(proposal.id, 'qa-operator');
  const promoted = store.resolveForRuntime(edgeId, 'BTC-USDT', 'EVENT', 'ANY');
  const unrelated = store.resolveForRuntime('SESSION_LIQUIDITY', 'BTC-USDT', 'EVENT', 'ANY');
  check('explicit manual approval changes only the targeted edge/scope', promoted.baseline === report.candidateThreshold && promoted.promotionState === 'MANUALLY_PROMOTED' && unrelated.baseline === 0);

  const passEvidence = {
    edgeId,
    status: 'PASS',
    direction: 'LONG',
    score: 0.15,
    dataQuality: 0.90,
    observedAt: now,
    expiresAt: now + 60_000,
    sourceVersion: 'qa',
    supportingReasons: ['qa'],
    conflictingReasons: [],
    rawEventIds: [],
  };
  const baselineGated = applyEdgeThresholdGate(passEvidence, before);
  const promotedGated = applyEdgeThresholdGate(passEvidence, promoted);
  check('baseline threshold 0 preserves existing PASS evidence', baselineGated.status === 'PASS');
  check('a manually promoted threshold gates only a low-score PASS row', promotedGated.status === 'FAIL' && promotedGated.conflictingReasons.some((reason) => reason.includes('manually_governed_threshold')));

  const rollback = store.rollback(1, 'qa-operator');
  const rolledBack = store.resolveForRuntime(edgeId, 'BTC-USDT', 'EVENT', 'ANY');
  check('manual rollback restores the baseline behavior', rollback.source === 'ROLLBACK' && rolledBack.baseline === 0);
  check('governance persistence is isolated to the supplied test path', fs.existsSync(storePath) && storePath.startsWith(governanceDir));

  const definitions = listStrategyDefinitions({ includeBaseline: true });
  const strategyIds = new Set(definitions.map((definition) => definition.strategyId));
  const mappedIds = Object.keys(STRATEGY_LIQUIDITY_HUNTER_EDGE_MAP);
  const mappedDefinitions = definitions.filter((definition) => mappedIds.includes(definition.strategyId));
  const bindings = mappedDefinitions.flatMap((definition) => definition.liquidityHunterEdges ?? []);
  check('planned strategies expose Liquidity Hunter metadata without creating new strategies', mappedDefinitions.length === mappedIds.length && mappedIds.every((id) => strategyIds.has(id)) && definitions.length === 15);
  check('all current strategy-edge bindings remain optional and SHADOW_ONLY', bindings.length > 0 && bindings.every((binding) => binding.required === false && binding.authority === 'SHADOW_ONLY'));
  check('no Liquidity Hunter edge is registered as an executable strategy identity', EDGE_IDS.every((edgeId) => !strategyIds.has(edgeId) && !strategyIds.has(edgeId.toLowerCase())));
  const l2 = definitions.find((definition) => definition.strategyId === 'l2-liquidity-state-scalper-v1');
  check('blocked L2 strategy remains blocked after metadata integration', l2?.status === 'blocked' && Boolean(l2.blockedReason));

  const marketDataSource = fs.readFileSync(path.join(root, 'src/services/marketDataService.ts'), 'utf8');
  const historicalStart = marketDataSource.indexOf('export async function getHistoricalCandles');
  const historicalSource = historicalStart >= 0 ? marketDataSource.slice(historicalStart, historicalStart + 4_500) : '';
  check('KuCoin Futures long-history pagination is implemented with the public kline/query time cursor', marketDataSource.includes('async function getPaginatedKuCoinHistory') && marketDataSource.includes("params.set('to', String(endTime))") && marketDataSource.includes('/api/v1/kline/query'));
  check('long-history provider order remains Binance Futures then KuCoin Futures then existing fallback chain', historicalSource.indexOf('getPaginatedBinanceHistory') >= 0 && historicalSource.indexOf('getPaginatedKuCoinHistory') > historicalSource.indexOf('getPaginatedBinanceHistory') && historicalSource.indexOf('getCandles') > historicalSource.indexOf('getPaginatedKuCoinHistory'));

  const validationSource = fs.readFileSync(path.join(root, 'src/services/replay/liquidityHunterWalkForwardValidation.ts'), 'utf8');
  check('walk-forward validation emits advisory edge-threshold reports without promotion', validationSource.includes('edgeThresholdOptimization') && validationSource.includes('optimizeEdgeThreshold') && validationSource.includes('automaticPromotionEnabled: false'));
  check('threshold selection is explicitly split between DEVELOPMENT and HOLDOUT roles', validationSource.includes("'HOLDOUT' ? 'HOLDOUT' : 'DEVELOPMENT'") && validationSource.includes('Purged chronological windows'));

  const fusionSource = fs.readFileSync(path.join(root, 'src/services/liquidityHunter/dynamicFusionEngine.ts'), 'utf8');
  check('runtime fusion applies only manually governed edge thresholds after evaluator/meta evidence exists', fusionSource.includes('applyEdgeThresholdGate') && fusionSource.includes('const governedEvidence = evidence.map') && fusionSource.indexOf('const governedEvidence = evidence.map') > fusionSource.indexOf("edgeId === 'META_MODEL'"));

  const foundationSource = fs.readFileSync(path.join(root, 'src/services/liquidityHunter/foundationRuntime.ts'), 'utf8');
  const operationsSource = fs.readFileSync(path.join(root, 'src/services/operationsStatus.ts'), 'utf8');
  const featureFlagsSource = fs.readFileSync(path.join(root, 'src/services/liquidityHunter/featureFlags.ts'), 'utf8');
  const fusionPolicySource = fs.readFileSync(path.join(root, 'src/services/liquidityHunter/fusionPolicy.ts'), 'utf8');
  check('read-plane operations snapshot exposes threshold governance without write authority', foundationSource.includes('thresholdGovernance: EdgeThresholdGovernanceSnapshot') && foundationSource.includes('edgeThresholdGovernance.snapshot()') && operationsSource.includes("version: 'lh_edge_threshold_governance_v1'"));
  check('Liquidity Hunter remains shadow-only and non-authoritative', foundationSource.includes('autonomousLiveExecutionEnabled: false') && fusionPolicySource.includes('shadowOnly: true') && fusionPolicySource.includes('authoritative: false'));
  check('automatic threshold promotion remains disabled', store.snapshot().automaticPromotionEnabled === false && fusionPolicySource.includes('automaticPromotionEnabled: false'));
  check('Liquidity Hunter autonomous-live capability remains hard-disabled', featureFlagsSource.includes('autonomousLiveExecutionEnabled: false') && !featureFlagsSource.includes('autonomousLiveExecutionEnabled: true'));

  const routesSource = fs.readFileSync(path.join(root, 'src/services/apexNextMarketRoutes.ts'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  check('Liquidity Hunter submission remains explicit manual-testnet only', routesSource.includes('authorizeLiquidityHunterTradePlan') && serverSource.includes("app.post('/api/liquidity-hunter/manual-testnet/:setupId/submit'") && serverSource.includes('CONFIRM_LIQUIDITY_HUNTER_TESTNET') && !/\/api\/liquidity-hunter\/live/.test(serverSource));

  check('manual governance revision records before/after evidence and rollback target without changing execution dependencies', promotedRevision.source === 'MANUAL_PROMOTION' && promotedRevision.approver === 'qa-operator' && promotedRevision.changedProfileBefore?.baseline === 0 && promotedRevision.changedProfileAfter?.baseline === report.candidateThreshold && promotedRevision.promotionEvidence?.paperCanary.resolved === 24 && promotedRevision.rollbackTargetRevision === 1);

  const failures = checks.filter((row) => !row.passed);
  const artifact = {
    generatedAt: new Date().toISOString(),
    checks,
    summary: {
      passed: checks.length - failures.length,
      total: checks.length,
      edgeCount: EDGE_IDS.length,
      strategyCount: definitions.length,
      mappedStrategyCount: mappedDefinitions.length,
      manualThresholdCandidate: report.candidateThreshold,
      automaticPromotionEnabled: false,
      autonomousLiveExecutionEnabled: false,
      authoritative: false,
      shadowOnly: true,
    },
  };
  fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
  fs.writeFileSync(path.join(root, 'QA', `liquidity-hunter-safe-completion-v${packageVersion}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`\nLiquidity Hunter safe completion runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(governanceDir, { recursive: true, force: true });
}
