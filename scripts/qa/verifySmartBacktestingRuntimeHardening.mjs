#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pagePath = path.join(root, 'src/pages/backtesting/BacktestingPage.tsx');
const builderPath = path.join(root, 'src/pages/backtesting/BacktestRunBuilder.tsx');
const coveragePath = path.join(root, 'src/pages/backtesting/backtestCoverage.ts');
const fixturesDir = path.join(root, 'QA/smart-backtesting-fixtures');
const page = fs.readFileSync(pagePath, 'utf8');
const builder = fs.readFileSync(builderPath, 'utf8');
const coverage = fs.readFileSync(coveragePath, 'utf8');
const errors = [];
function check(label, ok) {
  if (ok) console.log(`PASS ${label}`);
  else { console.error(`FAIL ${label}`); errors.push(label); }
}
check('Smart Mode remains default', page.includes("useState<BacktestStudioMode>('smart')"));
check('Smart checkpoint localStorage key is explicit', page.includes('apex:backtesting-smart-checkpoint:v1'));
check('Smart loop is continuous and bounded', page.includes('while (!smartStopRequestedRef.current)') && page.includes('SMART_MAX_ITERATIONS') && page.includes('SMART_MAX_RUNTIME_MS'));
check('Smart loop keeps best and latest result separate', page.includes('bestScore') && page.includes('latestScore') && page.includes('bestRunId') && page.includes('latestRunId'));
check('Smart loop has safe stop/no-improvement/provider failure states', page.includes('SMART_NO_IMPROVEMENT_LIMIT') && page.includes('Stopped safely') && page.includes('provider returned no usable market data'));
check('Smart loop uses canonical backtest source header only', page.includes("runBacktest('smart')") && page.includes('X-APEX-Backtest-Source') && !page.includes('/api/trading/order'));
check('Start/Stop/Resume remain one primary Smart flow', builder.includes('Start Smart Backtest') && builder.includes('Stop') && builder.includes('Resume Smart Backtest'));
check('Coverage reports requested/returned/used/executable', coverage.includes('requestedCandles') && coverage.includes('returnedCandles') && coverage.includes('usedCandles') && coverage.includes('executableCandles'));
check('Partial history explanation is explicit', coverage.includes('this backtest is based only on returned usable data'));
const manifestPath = path.join(fixturesDir, 'manifest.json');
check('Synthetic smart fixture manifest exists', fs.existsSync(manifestPath));
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  check('Synthetic fixtures are clearly non-live', manifest.syntheticOnly === true && manifest.liveQualificationClaimed === false && /Not live market data/.test(manifest.label));
  check('Synthetic fixtures cover requested candle horizons', [500, 1000, 2000, 3000, 5000].every((h) => manifest.horizons.includes(h)));
  check('Synthetic fixtures cover partial/low/no trade cases', ['gap_partial', 'low_trade', 'no_trade'].every((r) => manifest.regimes.includes(r)));
  check('Synthetic fixture files are present', Array.isArray(manifest.files) && manifest.files.length >= 30);
}
if (errors.length) {
  console.error(`${errors.length} Smart Backtesting runtime-hardening checks failed.`);
  process.exit(1);
}
console.log('Smart Backtesting runtime hardening: all checks passed');
