import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const checks = [];
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) });

const server = read('server.ts');
const connected = read('src/services/connectedExchange.ts');
const liveRiskTelemetry = read('src/services/liveRiskTelemetry.ts');
const router = read('src/services/providerRouter.ts');
const lhRest = read('src/services/liquidityHunter/restContextBootstrap.ts');
const routes = read('src/services/apexNextMarketRoutes.ts');
const panel = read('src/pages/backtesting/MultiStrategyResearchPanel.tsx');
const packageJson = JSON.parse(read('package.json'));

check('execution readiness exposes versioned capability truth', server.includes("capabilitiesVersion: 'execution_capabilities_v2'"));
check('execution readiness names account preview route', server.includes("previewRoute: '/api/account/orders/preview'"));
check('execution readiness names account submit route', server.includes("submitRoute: '/api/account/orders'"));
check('execution namespace fence does not globally deny verified manual live', server.includes('Verified manual Live KuCoin preview/submission is served under /api/account/orders'));

check('live risk telemetry helper exists', liveRiskTelemetry.includes('export function deriveLiveRiskTelemetry'));
check('live risk derives total open risk instead of hardcoded null', connected.includes('totalOpenRiskUsd: telemetry.totalOpenRiskUsd'));
check('live risk consumes position history in preview/submit path', (connected.match(/positionHistory/g) || []).length >= 6);
check('drawdown remains fail-honest unless explicitly reported', liveRiskTelemetry.includes('Only an exchange/account supplied drawdown measure is accepted') && liveRiskTelemetry.includes("['drawdownPct', 'currentDrawdownPct', 'maxDrawdownPct']"));

check('LH imports explicit read-only public provider', lhRest.includes("../providers/publicExchangeClient"));
check('LH does not import legacy exchangeClient barrel', !/from ['"]\.\.\/exchangeClient['"]/.test(lhRest));
check('public provider module exists', exists('src/services/providers/publicExchangeClient.ts'));
check('legacy exchangeClient is compatibility-only barrel', read('src/services/exchangeClient.ts').includes("export * from './providers/publicExchangeClient'"));

check('provider capability registry exists', router.includes('PROVIDER_CAPABILITIES'));
check('provider priority integrity assertion exists', router.includes('assertProviderPriorityIntegrity'));
check('Bitget is not executable priority', !/PROVIDER_PRIORITY[\s\S]*?bitget[\s\S]*?as const/.test(router));
check('OKX is not executable priority', !/PROVIDER_PRIORITY[\s\S]*?okx[\s\S]*?as const/.test(router));

check('multi-backtest route restored', routes.includes("'/api/strategies/multi-backtest'"));
check('paper multi-trade sizing route restored', routes.includes("'/api/strategies/paper-multi-trade/size'"));
check('server-side council receipt store used', routes.includes('multiAgentCouncilStore.put') && routes.includes('multiAgentCouncilStore.verify'));
check('multi-backtest exact history is fail-closed', routes.includes('insufficient_requested_history'));
check('strategy parameters are definition-aware validated', routes.includes('validateStrategyParameterValues'));
check('paper Research Matrix remains visibly paper-only', /paper[- ]only/i.test(panel) && !/Place Order|Submit Live|Live Order/i.test(panel));

const stale = [
  'src/pages/StrategiesPage.tsx',
  'src/pages/StrategyDetailPage.tsx',
  'src/pages/StrategyStudioPage.tsx',
  'src/components/BacktestingPage.tsx',
  'src/components/workspace/SettingsView.tsx',
];
check('stale duplicate production pages are retired', stale.every((p) => !exists(p)));

check('two-tier replay coordinator is restored as research-only', exists('src/services/replay/twoTierReplayCoordinator.ts') && read('src/services/replay/twoTierReplayCoordinator.ts').includes('researchOnly: true') && read('src/services/replay/twoTierReplayCoordinator.ts').includes('executionAuthorized: false'));
check('read-plane view model is exposed by LH state route', exists('src/services/readPlane/liquidityHunterViewModel.ts') && server.includes('buildLiquidityHunterViewModel'));
check('multi-agent runtime verifier is wired', packageJson.scripts?.['qa:multi-agent-multi-trading']?.includes('qa:multi-agent-multi-trading-runtime'));
check('unified safety runtime is wired into runtime gate', packageJson.scripts?.['qa:unified-safety-runtime'] && packageJson.scripts?.['test:runtime']?.includes('qa:unified-safety-runtime'));

check('R2 verifier is wired into package scripts', packageJson.scripts?.['qa:ui-completeness-r2'] && packageJson.scripts?.['check:source-contracts']?.includes('qa:ui-completeness-r2'));
check('Research Matrix verifier is wired into package scripts', packageJson.scripts?.['qa:research-workspace-layout'] && packageJson.scripts?.['check:source-contracts']?.includes('qa:research-workspace-layout'));
check('multi-agent paper research verifier is wired into package scripts', packageJson.scripts?.['qa:multi-agent-multi-trading'] && packageJson.scripts?.['check:source-contracts']?.includes('qa:multi-agent-multi-trading'));

let passed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.label}`);
  if (c.ok) passed += 1;
}
console.log(`${passed}/${checks.length} maximal merge safety checks passed`);
if (passed !== checks.length) process.exitCode = 1;
