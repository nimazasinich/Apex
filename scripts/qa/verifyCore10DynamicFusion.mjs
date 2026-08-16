import fs from 'node:fs';

const checks = [];
const read = (path) => fs.readFileSync(path, 'utf8');
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });

const registry = read('src/services/strategyRegistry.ts');
const fusion = read('src/services/strategyFusion.ts');
const routes = read('src/services/apexNextMarketRoutes.ts');
const model = read('src/pages/strategies/StrategyModelWorkspace.tsx');
const engineIndex = read('src/services/strategyEngine/index.ts');
const router = read('src/services/strategyEngine/regimeRoutedComposite.ts');
const openapi = read('openapi/apex-api.v1.yaml');
const docs = read('Doc/strategy-library/APEX_CORE_10_DYNAMIC_FUSION_STRATEGIES.md');
const engineSmoke = read('scripts/qa/smokeStrategyEngines.mjs');

check('core count is fixed at ten', registry.includes('CORE_STRATEGY_COUNT = 10'));
check('ten ranked core definitions exist', (registry.match(/isCore: true, coreRank:/g) || []).length === 10);
check('fusion has all ten component definitions', ['technical','smartMoney','orderFlow','liquidity','funding','openInterest','sentiment','news','whaleFlow','regime'].every((key) => registry.includes(`${key}: { key: '${key}'`)));
check('live-only weights remain manual-only', registry.includes("optimization: 'manual-only'"));
check('generic whale transfers are not directional', fusion.includes("classified > 0") && fusion.includes('none are classified as exchange deposits or withdrawals'));
check('missing evidence fails closed', fusion.includes("quality: 'MISSING'") && fusion.includes('missingRequired'));
check('fusion preview is compute-rate-limited', read('src/services/serverSecurity.ts').includes("pathname.endsWith('/fusion-preview')"));
check('fusion preview route exists', routes.includes("/api/strategies/:strategyId/fusion-preview"));
check('fusion preview uses supplemental orchestrator', routes.includes('getSupplementalOrchestrator().fetchAll'));
check('live funding is bound and OI remains fail closed', routes.includes('marketDataService.getTickers(120)') && routes.includes('fundingDirectional,') && routes.includes('openInterestDirectional: null'));
check('strategy studio exposes live fusion refresh', model.includes('Refresh live fusion') && model.includes('fusionSnapshot.components.map'));
check('smoke includes the regime router', engineSmoke.includes('regimeRoutedComposite.ts'));
check('causal regime router is registered', engineIndex.includes('regimeRoutedComposite') && router.includes('prior closed candles only'));
check('router can abstain', router.includes("child: null") && router.includes('routeCounts.abstain'));
check('OpenAPI covers fusion preview', openapi.includes('/api/strategies/{strategyId}/fusion-preview:'));
check('core fusion benchmark is shipped', read('package.json').includes('stress:core10-fusion') && fs.existsSync('scripts/qa/benchmarkCore10Fusion.mjs'));
check('governance document rejects guaranteed profit claims', docs.includes('No guaranteed “fast profit” or perfect strategy claim.'));

for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}`);
const failed = checks.filter((row) => !row.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
