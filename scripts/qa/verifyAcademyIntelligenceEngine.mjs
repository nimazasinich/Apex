import { existsSync, readFileSync } from 'node:fs';

const checks = [];
const check = (name, passed, detail = '') => checks.push({ name, passed: Boolean(passed), detail });
const read = (path) => readFileSync(path, 'utf8');

const requiredFiles = [
  'src/features/academy/engine/academyEngine.ts',
  'src/features/academy/knowledge/strategyKnowledgeBase.ts',
  'src/features/academy/discovery/strategyCollector.ts',
  'src/features/academy/evaluation/evaluationPipeline.ts',
  'src/features/academy/storage/academyStore.ts',
  'src/features/academy/api/academyRoutes.ts',
  'src/features/academy/ml/similarityEngine.ts',
  'src/tests/academyIntelligenceEngine.test.ts',
  'Doc/ACADEMY_INTELLIGENCE_ENGINE.md',
];
check('independent Academy module tree exists', requiredFiles.every(existsSync), requiredFiles.filter((file) => !existsSync(file)).join(', '));

const types = read('src/features/academy/types.ts');
check('lifecycle contract is complete', ['DISCOVERED', 'BACKTESTED', 'VALIDATED', 'SHADOW', 'LIVE_ELIGIBLE', 'RETIRED'].every((state) => types.includes(`'${state}'`)));
check('unknown evidence states are explicit', ['NOT_EVALUATED', 'INSUFFICIENT_DATA', 'UNAVAILABLE'].every((state) => types.includes(`'${state}'`)));
check('consumer authority is non-executing', types.includes("authority: 'ADVISORY_AND_SAFETY_GATE_ONLY'") && types.includes('executionAuthorized: false'));

const lifecycle = read('src/features/academy/evaluation/lifecycle.ts');
check('LIVE_ELIGIBLE is server-governance only', lifecycle.includes("to === 'LIVE_ELIGIBLE'") && lifecycle.includes("authority === 'SERVER_GOVERNANCE'"));
check('sealed holdout is required for strict validation', lifecycle.includes("holdoutProtocolStatus === 'PASSED'"));

const routes = read('src/features/academy/api/academyRoutes.ts');
check('Academy API exposes status control cycle knowledge and consumer intelligence', [
  '/api/academy/status',
  '/api/academy/control',
  '/api/academy/cycle',
  '/api/academy/strategies',
  '/api/academy/intelligence/:consumer/:strategyId',
].every((route) => routes.includes(route)));
check('external imports stay unverified', routes.includes("verification: 'UNVERIFIED'") && routes.includes('performanceEvidenceTrusted: false'));

const engine = read('src/features/academy/engine/academyEngine.ts');
const storage = read('src/features/academy/storage/academyStore.ts');
check('engine implements learn evaluate store improve phases', ['LEARNING', 'EVALUATING', 'STORING', 'IMPROVING'].every((phase) => engine.includes(`'${phase}'`)));
check('knowledge storage uses the durable atomic writer', storage.includes('writeDurableJsonFileSync') && storage.includes('academy_strategy_evidence_required'));

const scanner = read('src/services/scannerCore.ts');
const tradePlan = read('src/services/tradePlan.ts');
const risk = read('src/services/riskGovernor.ts');
check('Scanner integration fails closed when supplied intelligence blocks', scanner.includes('academyScannerGate') && scanner.includes('ACADEMY_INTELLIGENCE_BLOCKED'));
check('TradePlan integration applies Academy validation errors', tradePlan.includes('academyTradePlanErrors'));
check('RiskGovernor integration records an Academy safety check', risk.includes('academyRiskGate') && risk.includes('ACADEMY_STRATEGY_INTELLIGENCE'));

const page = read('src/pages/academy/AcademyPage.tsx');
check('Academy UI has real ON/OFF status control and counters', page.includes('/api/academy/control') && page.includes('Academy Engine') && page.includes('analyzed') && page.includes('academyLastUpdate'));

const test = read('src/tests/academyIntelligenceEngine.test.ts');
check('required Academy tests are present', [
  'strategy ingestion and automated evaluation',
  'persistent knowledge storage and lifecycle',
  'integration with Scanner, TradePlan, and RiskGovernor',
].every((name) => test.includes(name)));

for (const result of checks) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
}
const failures = checks.filter((result) => !result.passed);
if (failures.length) {
  console.error(`Academy Intelligence Engine source contract failed: ${failures.length}/${checks.length}.`);
  process.exit(1);
}
console.log(`Academy Intelligence Engine source contract passed: ${checks.length}/${checks.length}.`);

