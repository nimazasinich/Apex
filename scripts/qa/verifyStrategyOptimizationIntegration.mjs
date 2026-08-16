#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
function check(name, pass, detail = '') {
  const item = { name, pass: Boolean(pass), detail };
  checks.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const optimizer = read('src/services/strategyOptimization.ts');
const store = read('src/services/strategyOptimizationStore.ts');
const durable = read('src/services/durableJsonFile.ts');
const routes = read('src/services/apexNextMarketRoutes.ts');
const validation = read('src/services/apiValidation.ts');
const security = read('src/services/serverSecurity.ts');
const scannerAdapter = read('src/services/strategyEngine/scannerPresetAdapter.ts');
const strategyPage = read('src/pages/strategies/StrategyPage.tsx');
const evidenceRail = read('src/pages/strategies/StrategyEvidenceRail.tsx');
const openapi = read('openapi/apex-api.v1.yaml');
const pkg = JSON.parse(read('package.json'));

check('optimizer and revision store exist', exists('src/services/strategyOptimization.ts') && exists('src/services/strategyOptimizationStore.ts'));
check('optimizer uses chronological selection and untouched holdout', optimizer.includes('splitChronologically') && optimizer.includes('split.holdout') && optimizer.includes('fullSelectionWindows'));
check('successive halving reduces expensive window evaluations', optimizer.includes('Successive halving') && optimizer.includes('secondaryCount') && optimizer.includes('refinementFinalistCount') && optimizer.includes('searchEfficiency'));
check('cost stress and neighbor stability gate promotion', optimizer.includes('costStressMultiplier') && optimizer.includes('cost_stress_failed') && optimizer.includes('neighbor_stability_failed'));
check('overfit, drawdown, sample, and holdout gates remain fail closed', ['overfit_gap_exceeds_limit','holdout_drawdown_exceeds_limit','holdout_trade_count_too_low','holdout_improvement_below_minimum'].every((text) => optimizer.includes(text)));
check('search is bounded by hard field limits and ten fields', optimizer.includes('SCANNER_FIELD_RANGES') && optimizer.includes('return fields.slice(0, 10)'));
check('optimizer has abort and timeout controls', optimizer.includes('throwIfAborted') && optimizer.includes('strategy_optimizer_timeout'));
check('evaluation failures are not cached', optimizer.includes('cache.delete(key)'));
check('promotion remains exact-context only', store.includes('strategyId|') || store.includes("`${context.strategyId}|${context.symbol.toUpperCase()}|${context.interval}|${context.direction}`"));
// The durability primitives moved out of the store and into durableJsonFile.ts,
// so this assertion follows the behavior to where it now lives instead of
// pinning the store's former inline implementation. It is strictly stronger than
// the string pair it replaces: the old check proved tmp+rename and 0o600 only,
// this one additionally proves the data-file fsync the old store never did.
check('optimization profiles persist atomically with restrictive mode',
  store.includes('writeDurableJsonFileSync(this.filePath')
  && durable.includes('renameSync(temporary, target)')
  && durable.includes('chmodSync(target, 0o600)')
  && durable.includes('fsyncSync(dataFd)'));
check('a corrupt optimization store is surfaced instead of silently overwritten',
  store.includes('readDurableJsonFileSync')
  && store.includes('strategy_optimization_store_corrupt')
  && store.includes('corruptionState'));
check('rollback creates an immutable new revision', store.includes("source: 'ROLLBACK'") && store.includes('restoredRevision') && store.includes('rollbackProfile'));
check('route supports state, optimize, explicit promotion, and rollback operations', routes.includes("app.get('/api/strategies/:strategyId/optimization'") && routes.includes("app.post('/api/strategies/:strategyId/optimize'") && routes.includes("app.post('/api/strategies/:strategyId/optimization/promote'") && routes.includes("app.post('/api/strategies/:strategyId/optimization/rollback'"));
check('identical optimization jobs are coalesced', routes.includes('strategyOptimizationJobs.get(jobKey)') && routes.includes('coalesced: true'));
check('active profile is applied to strategy execution', routes.includes('strategyOptimizationStore.getActive(optimizationContext)') && routes.includes('result.summary.optimizationProfile'));
check('optimized thresholds remain layered over live adaptive governance', optimizer.includes('applyStrategyOptimizationScannerDeltas') && store.includes('scannerConfigDeltas') && routes.includes('resolveStrategyScannerConfig') && routes.includes('applyStrategyOptimizationScannerDeltas(configured'));
check('user parameters override promoted defaults', (routes.includes('const effectiveParameters = normalizeStrategyParameterAliases') || routes.includes('const effectiveParameters = buildStrategyParameterValues')) && routes.indexOf('...(activeOptimization?.parameters || {})') < routes.indexOf('...(args.parameters || {})'));
check('cache identity includes optimization revision', routes.includes('optimizer-r${routeOptimizationProfile?.revision ?? 0}'));
check('multi-symbol portfolio auto-promotion stays blocked without universe identity', routes.includes('multi_symbol_universe_identity_required'));
check('scanner candidates can bypass fixed registry overrides only during optimizer evaluation', scannerAdapter.includes('applyDefinitionOverrides') && routes.includes('scannerConfigAuthoritative: true'));
check('optimization workload input is finite and bounded', validation.includes('validateStrategyOptimizationInput') && validation.includes('1000, 5000') && validation.includes('1, 8'));
check('optimization route is compute-rate-limited', security.includes("pathname.endsWith('/optimize')"));
check('Strategy Studio exposes optimize, manual promotion, active profile, and rollback', strategyPage.includes('/optimize') && strategyPage.includes('/optimization?') && strategyPage.includes('/optimization/promote') && strategyPage.includes('/optimization/rollback') && evidenceRail.includes('Run Smart Optimization') && evidenceRail.includes('Promote reviewed candidate') && evidenceRail.includes('Roll back'));
check('Strategy Studio describes evidence rather than perfection', evidenceRail.includes('untouched holdout') && optimizer.includes('cannot prove a perfect strategy'));
check('OpenAPI documents optimization state, optimize, promotion, and rollback', openapi.includes('/api/strategies/{strategyId}/optimization:') && openapi.includes('/api/strategies/{strategyId}/optimize:') && openapi.includes('/api/strategies/{strategyId}/optimization/promote:') && openapi.includes('/api/strategies/{strategyId}/optimization/rollback:'));
check('optimizer tests cover stable promotion, holdout rejection, persistence, and rollback', read('src/tests/strategyOptimization.test.ts').includes('holdout reverses') && read('src/tests/strategyOptimization.test.ts').includes("source).toBe('ROLLBACK')"));
check('optimizer load benchmark is shipped', pkg.scripts?.['stress:strategy-optimization'] === 'tsx scripts/qa/benchmarkStrategyOptimization.mts' && exists('scripts/qa/benchmarkStrategyOptimization.mts'));

const failed = checks.filter((item) => !item.pass);
const report = { generatedAt: new Date().toISOString(), evidenceClass: 'source-contract', passed: checks.length - failed.length, total: checks.length, checks };
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, 'QA/strategy-optimization-integration-contract.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} strategy optimization integration checks failed.`);
  process.exit(1);
}
console.log(`\nStrategy optimization integration source contract passed (${checks.length}/${checks.length}).`);
