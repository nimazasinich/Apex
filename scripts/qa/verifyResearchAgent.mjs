import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rel = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(rel(p), 'utf8');
const exists = (p) => fs.existsSync(rel(p));
const checks = [];
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) });

const required = [
  'scripts/research-agent/README.md',
  'scripts/research-agent/runQueuedStudies.mts',
  'scripts/research-agent/openHoldout.mts',
  'scripts/research-agent/summarizeRuns.mts',
  'scripts/research-agent/flagRunRisks.mts',
  'scripts/research-agent/scaffoldStudy.mts',
  'scripts/research-agent/suggestHypotheses.mts',
  'scripts/research-agent/lib/researchAgentData.mts',
  'scripts/research-agent/lib/researchAgentSafety.mts',
  'scripts/research-agent/lib/studyTemplate.mts',
  'scripts/research-agent/study-queue.json',
  'scripts/research-agent/promotion-ledger.json',
  'scripts/research-agent/run-history.json',
  'scripts/research-agent/holdout-open-history.json',
];
check('research-agent file set is complete', required.every(exists));

const queue = JSON.parse(read('scripts/research-agent/study-queue.json'));
const ledger = JSON.parse(read('scripts/research-agent/promotion-ledger.json'));
const runHistory = JSON.parse(read('scripts/research-agent/run-history.json'));
const holdoutHistory = JSON.parse(read('scripts/research-agent/holdout-open-history.json'));
check('research agent ships with no auto-queued studies', Array.isArray(queue.studies) && queue.studies.length === 0);
check('promotion ledger ships empty', Array.isArray(ledger.candidates) && ledger.candidates.length === 0);
check('run history baseline is a JSON array', Array.isArray(runHistory));
check('holdout history baseline is a JSON array', Array.isArray(holdoutHistory));

const runner = read('scripts/research-agent/runQueuedStudies.mts');
const opener = read('scripts/research-agent/openHoldout.mts');
const safety = read('scripts/research-agent/lib/researchAgentSafety.mts');
const template = read('scripts/research-agent/lib/studyTemplate.mts');
const packageJson = JSON.parse(read('package.json'));
const qaSuiteCatalog = read('scripts/qa/qaSuiteCatalog.mjs');
const gateDependencyMap = read('scripts/gates/gateDependencyMap.mjs');

check('development runner uses local tsx only', runner.includes('resolveLocalTsxCli(root)') && /spawn\(process\.execPath, \[tsxCli, script\]/.test(runner) && !runner.includes("spawn('npx'"));
check('development runner records exact study hash', runner.includes('studySha256 = sha256File') && runner.includes('studySha256,'));
check('development runner marks process failures failed', runner.includes("entry.status = finalSucceeded ? 'ran' : 'failed'"));
check('duplicate candidate ids are blocked', runner.includes('duplicate id') && runner.includes('is not allowed'));
check('unknown dependencies are blocked', runner.includes('depends on unknown id'));
check('queue metadata cannot smuggle sealed flag', runner.includes('assertSafeHypothesisText'));

check('study path is confined to scripts/research mts', safety.includes("script.startsWith('scripts/research/')") && safety.includes("script.endsWith('.mts')") && safety.includes("relative.startsWith('..')"));
check('candidate ids are filename-safe', safety.includes("/^[a-z0-9][a-z0-9-]{0,79}$/"));
check('sealed-capability check requires argv gate', safety.includes('process\\.argv\\.includes') && safety.includes('--evaluate-sealed'));
check('tsx child execution resolves only project-local package bin', safety.includes("node_modules', 'tsx', 'package.json") && safety.includes('research-agent will not fetch tooling from the network'));

check('holdout opener is TTY-only', opener.includes('!input.isTTY || !output.isTTY'));
check('holdout approval is bound to SHA-256', opener.includes('approvedStudySha256') && opener.includes('approval.approvedStudySha256 !== studySha256'));
check('holdout requires matching successful development run', opener.includes('latestSuccessfulDevelopmentRun') && opener.includes('No successful development run record exists'));
check('holdout blocks reuse by candidate id and study hash', opener.includes('priorById') && opener.includes('priorByHash') && opener.includes('There is no reopen flag'));
check('holdout preflights local tsx before consuming one-shot record', opener.indexOf('const tsxCli = resolveLocalTsxCli(root)') > 0 && opener.indexOf('const tsxCli = resolveLocalTsxCli(root)') < opener.indexOf("status: 'OPENING'"));
const sealedSpawnIndex = opener.indexOf("spawnSync(process.execPath, [tsxCli, study, '--evaluate-sealed']");
check('holdout records OPENING before sealed child spawn', opener.indexOf("status: 'OPENING'") > 0 && sealedSpawnIndex > opener.indexOf("status: 'OPENING'"));
check('holdout child is the only path that passes sealed flag', /spawnSync\(process\.execPath, \[tsxCli, study, '--evaluate-sealed'\]/.test(opener) && opener.includes('resolveLocalTsxCli(root)'));
check('no force or yes CLI branch exists', !opener.includes("arg === '--force'") && !opener.includes("arg === '--yes'"));

check('new study scaffold uses repository promotion gate', template.includes('maxDrawdownPct: 13') && template.includes('minTrades: 30') && template.includes('r.trades >= gatePolicy.minTrades'));
check('scaffold stays non-executable until implemented', template.includes("study is a scaffold — implement runStudy() before running this file"));

for (const scriptName of [
  'research:queue',
  'research:summary',
  'research:risks',
  'research:scaffold',
  'research:suggest',
  'research:open-holdout',
  'qa:research-agent',
]) {
  check(`package script ${scriptName} is wired`, typeof packageJson.scripts?.[scriptName] === 'string');
}

for (const [alias, canonical] of [
  ['research:summarize', 'research:summary'],
  ['research:flag-risks', 'research:risks'],
  ['research:holdout', 'research:open-holdout'],
]) {
  check(`legacy package script ${alias} remains compatible`, packageJson.scripts?.[alias] === packageJson.scripts?.[canonical]);
}
check('research-agent QA participates in source contracts', (packageJson.scripts?.['check:source-contracts']?.includes('qa:research-agent')) || (packageJson.scripts?.['check:source-contracts']?.includes('qa:suite:source-core') && qaSuiteCatalog.includes("'qa:research-agent'")));
check('research-agent QA participates in gate dependency mapping', gateDependencyMap.includes("gate: 'qa:research-agent'") && gateDependencyMap.includes("'scripts/research-agent/**'"));

let passed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.label}`);
  if (item.ok) passed += 1;
}
console.log(`${passed}/${checks.length} research-agent integration checks passed`);
if (passed !== checks.length) process.exitCode = 1;
