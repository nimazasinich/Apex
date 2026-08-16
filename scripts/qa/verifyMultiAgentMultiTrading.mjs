import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const service = read('src/services/multiAgentResearchCouncil.ts');
const route = read('src/services/apexNextMarketRoutes.ts');
const ui = read('src/pages/backtesting/MultiStrategyResearchPanel.tsx');
const sizer = read('src/services/execution/paperMultiTradeSizer.ts');
const openapi = read('openapi/apex-api.v1.yaml');
const store = read('src/services/multiAgentCouncilStore.ts');
const orchestrator = read('src/services/multiStrategyResearchOrchestrator.ts');

const checks = [
  ['five deterministic roles', ['PERFORMANCE', 'RISK', 'CONFLICT', 'PORTFOLIO', 'EXECUTION_GUARDIAN'].every((id) => service.includes(`'${id}'`))],
  ['risk veto exists', service.includes("agentId: 'RISK'") && service.includes("disposition: veto ? 'VETO'")],
  ['conflict veto exists', service.includes("agentId: 'CONFLICT'") && service.includes("disposition: 'VETO'")],
  ['paper plan cannot submit', service.includes('orderSubmissionAllowed: false')],
  ['manual confirmation retained', service.includes('manualConfirmationRequired: true') && service.includes('requiresManualConfirmation: true')],
  ['autonomous live stays disabled', service.includes('autonomousLiveExecutionEnabled: false')],
  ['risk governor cannot be bypassed', service.includes('riskGovernorBypassAllowed: false')],
  ['route constructs council server-side', route.includes('runMultiAgentResearchCouncil(report')],
  ['route binds paper plans server-side', route.includes('multiAgentCouncilStore.put(multiAgent)') && route.includes('multiAgentCouncilStore.verify(sourceCouncilFingerprint, plans)')],
  ['route rejects silent history truncation', route.includes('candlesUsed !== job.requestedBars') && route.includes('5_000')],
  ['route validates strategy parameters', route.includes('validateStrategyParameterValues(definition, rawParameters)')],
  ['orchestrator projects public job identity', orchestrator.includes('function projectJob') && !orchestrator.includes("results[index] = { ...job, status: 'COMPLETED'" )],
  ['UI exposes paper risk controls', ui.includes('Paper capital') && ui.includes('Total risk %') && ui.includes('Max one-side exposure %')],
  ['UI has no execution action', !/Place Order|Submit Order|Execute Live|Auto Execute/.test(ui)],
  ['paper sizer has no exchange dependency', sizer.includes('exchangeClientDependency: false') && sizer.includes('orderSubmissionAllowed: false')],
  ['paper sizer binds exact plan fingerprint', sizer.includes('fingerprintPaperTradePlans') && sizer.includes('paper_multi_trade_plan_fingerprint_mismatch')],
  ['server provenance store exists', store.includes('class MultiAgentCouncilStore') && store.includes('paper_multi_trade_plan_set_mismatch')],
  ['UI exposes explicit entry/stop paper sizing', ui.includes('Paper Position Sizer') && ui.includes('Calculate paper quantities')],
  ['OpenAPI documents research-only council', openapi.includes('/api/strategies/multi-backtest') && openapi.includes('research')],
  ['OpenAPI documents paper sizing safety', openapi.includes('/api/strategies/paper-multi-trade/size') && openapi.includes('paper')],
];

let failures = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`PASS ${label}`);
  else { failures += 1; console.error(`FAIL ${label}`); }
}
console.log(`${checks.length - failures}/${checks.length} multi-agent/multi-trading source checks passed`);
if (failures) process.exit(1);
