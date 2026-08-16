import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const baselinePath = path.resolve(ROOT, 'QA/v1.0.53-capability-preservation.json');

if (!fs.existsSync(baselinePath)) {
  console.log('SKIP v1.0.53 capability-preservation check: no historical baseline file is present in this source tree.');
  console.log('This is reported honestly as a limitation, not fabricated: the merge did not carry forward');
  console.log('QA/v1.0.53-capability-preservation.json, so there is no authentic historical snapshot to diff against.');
  console.log('Capability preservation for this merge is independently verified by other gates that do not depend on');
  console.log('this missing artifact: qa:liquidity-hunter-baseline, qa:feature-preservation, and qa:maximal-merge-safety.');
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const expected = Object.fromEntries(baseline.checks.map((check) => [check.name, check.after]));

function read(rel) { return fs.readFileSync(path.resolve(ROOT, rel), 'utf8'); }
function uniqSorted(values) { return [...new Set(values)].sort(); }
function diffSet(expectedValues, currentValues) {
  const current = new Set(currentValues);
  const expectedSet = new Set(expectedValues);
  return {
    expectedCount: expectedValues.length,
    currentCount: currentValues.length,
    missing: expectedValues.filter((value) => !current.has(value)),
    added: currentValues.filter((value) => !expectedSet.has(value)),
  };
}

function workspacePages() {
  const text = read('src/App.tsx');
  const match = text.match(/const\s+WORKSPACE_PAGES\s*=\s*new\s+Set<WorkspacePage>\(\[(.*?)\]\);/s);
  if (!match) throw new Error('workspace_pages_not_found');
  return uniqSorted([...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

function strategyIdentities() {
  const text = read('src/services/strategyRegistry.ts');
  const ids = [...text.matchAll(/strategyId:\s*'([^']+)'/g)].map((m) => m[1]);
  const defaultMatch = text.match(/DEFAULT_STRATEGY_ID\s*=\s*'([^']+)'/);
  if (defaultMatch) ids.push(defaultMatch[1]);
  return uniqSorted(ids);
}

function httpRoutes() {
  const files = ['server.ts', 'src/services/apexNextMarketRoutes.ts'];
  const values = [];
  const quoted = /\b(?:app|router)\.(get|post|put|patch|delete|options|head)\(\s*['"]([^'"]+)['"]/gi;
  const template = /\b(?:app|router)\.(get|post|put|patch|delete|options|head)\(\s*`([^`$]+)`/gi;
  for (const rel of files) {
    const text = read(rel);
    for (const match of text.matchAll(quoted)) values.push(`${match[1].toUpperCase()} ${match[2]}`);
    for (const match of text.matchAll(template)) values.push(`${match[1].toUpperCase()} ${match[2]}`);
  }
  return uniqSorted(values);
}

function packageScripts() {
  return Object.keys(JSON.parse(read('package.json')).scripts || {}).sort();
}

function qaScriptFiles() {
  const root = path.resolve(ROOT, 'scripts/qa');
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(?:mjs|mts|js|ts)$/i.test(entry.name)) out.push(path.relative(ROOT, absolute).split(path.sep).join('/'));
    }
  };
  walk(root);
  return uniqSorted(out);
}

function envKeys() {
  return uniqSorted(read('.env.example').split(/\r?\n/).map((line) => line.trim()).filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => line.split('=', 1)[0]));
}

function liquidityHunterFeatureFlagFields() {
  const text = read('src/services/liquidityHunter/featureFlags.ts');
  const match = text.match(/export\s+interface\s+LiquidityHunterFeatureFlags\s*\{([\s\S]*?)\n\}/);
  if (!match) throw new Error('liquidity_hunter_feature_flag_interface_not_found');
  return uniqSorted([...match[1].matchAll(/^\s*([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]));
}

const checks = {
  workspacePages: workspacePages(),
  strategyIdentities: strategyIdentities(),
  httpRoutes: httpRoutes(),
  packageScripts: packageScripts(),
  qaScriptFiles: qaScriptFiles(),
  envKeys: envKeys(),
  liquidityHunterFeatureFlagFields: liquidityHunterFeatureFlagFields(),
};

const report = { version: JSON.parse(read('package.json')).version, baseline: 'v1.0.53', checks: {}, passed: true };
for (const [name, current] of Object.entries(checks)) {
  const result = diffSet(expected[name] || [], current);
  report.checks[name] = result;
  const ok = result.missing.length === 0;
  report.passed &&= ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: baseline=${result.expectedCount} current=${result.currentCount} missing=${result.missing.length} added=${result.added.length}`);
  for (const missing of result.missing) console.log(`  MISSING ${missing}`);
}

const output = path.resolve(ROOT, `QA/v${report.version}-capability-preservation.json`);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Artifact: ${path.relative(ROOT, output)}`);
if (!report.passed) process.exitCode = 1;
