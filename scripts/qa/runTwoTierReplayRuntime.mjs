#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();
const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-two-tier-replay-'));
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.test.ts')) files.push(full);
  }
  return files;
}
for (const absolute of walk(path.join(root, 'src'))) {
  const file = path.relative(root, absolute);
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, esModuleInterop: true },
  });
  const errors = (output.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`transpile_failed:${file}:${errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('|')}`);
  const target = path.join(temp, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output.outputText);
}
const fromTemp = (file) => require(path.join(temp, file));
const { runLiquidityHunterResearchReplay } = fromTemp('src/services/replay/researchReplayRunner.js');
const { runLiquidityHunterAuthoritativeReplay } = fromTemp('src/services/replay/authoritativeReplayRunner.js');
const { runTwoTierLiquidityHunterReplay } = fromTemp('src/services/replay/twoTierReplayCoordinator.js');
const { buildLiquidityHunterViewModel } = fromTemp('src/services/readPlane/liquidityHunterViewModel.js');

const NOW = Date.UTC(2026, 7, 8, 0, 0, 0);
const flags = {
  liquidityHunterEnabled: true, shadowOnly: true, realtimeEventRecordingEnabled: false,
  publicFeedsEnabled: false, binancePublicFeedEnabled: false, kucoinPublicFeedEnabled: false, bybitPublicFeedEnabled: false,
  realtimeL2Enabled: false, optionsGexEnabled: false, deribitOptionsPublicEnabled: false,
  hyblockLiquidationTopologyEnabled: false, walletGradingEnabled: false,
  hyperliquidWalletObserverEnabled: false, hyperliquidWalletHistoryGradingEnabled: false,
  sentimentVelocityEnabled: false, metaModelEnabled: false, websocketEnabled: false,
  paperCanaryEnabled: false, testnetCanaryEnabled: false, autonomousLiveExecutionEnabled: false,
};
let seq = 0;
const event = (type, offset, source = 'binance-usdm-ws', payload = { price: 100 + offset / 10000, size: 1, aggressorSide: 'BUY' }, extra = {}) => ({
  eventId: `${type}:${++seq}:${offset}`, type, source, symbol: 'BTC-USDT', exchangeTimestamp: NOW + offset,
  receivedAt: NOW + offset + 2, schemaVersion: 1, ingestionKind: 'REPLAY', payload, ...extra,
});
function researchEvents() {
  const rows = [];
  for (let i = 0; i < 80; i += 1) rows.push(event('TRADE', i * 100));
  rows.push(event('FUNDING', 9_000, 'binance-usdm-rest-context', { rate: 0.0001 }));
  rows.push(event('OPEN_INTEREST', 9_100, 'binance-usdm-rest-context', { openInterest: 1000 }));
  rows.push(event('OPEN_INTEREST', 9_200, 'binance-usdm-rest-context', { openInterest: 1020 }));
  return rows;
}
const checks=[];
const check=(label,ok)=>{const passed=Boolean(ok);checks.push({label,passed});console.log(`${passed?'PASS':'FAIL'} ${label}`)};
try {
  const events = researchEvents();
  const a = await runLiquidityHunterResearchReplay({ events, symbol:'BTC-USDT', flags, sampleBucketMs:1000, evaluateEveryEvents:2 });
  const b = await runLiquidityHunterResearchReplay({ events, symbol:'BTC-USDT', flags, sampleBucketMs:1000, evaluateEveryEvents:2 });
  check('fast replay is deterministic', a.deterministicFingerprint === b.deterministicFingerprint);
  check('fast replay thins research events', a.replayEventCount < a.sourceEventCount);
  check('fast replay cannot authorize execution', a.executionAuthorized === false && a.authoritative === false);

  const high = await runLiquidityHunterAuthoritativeReplay({ events, symbol:'BTC-USDT', flags });
  check('authoritative tier remains research-only', high.executionAuthorized === false && high.shadowOnly === true && high.matchingEngineAuthoritative === false);
  check('authoritative tier fails closed without full same-source L2 sequence', high.eligibility.fullEventSequence === false && high.microstructure === null);

  const two = await runTwoTierLiquidityHunterReplay({ events, symbol:'BTC-USDT', flags, advancement:{ minimumFastFusionScore:0, minimumPassedLayers:0 } });
  check('two-tier coordinator advances eligible fast research', two.advancedToAuthoritative === true && two.authoritative?.tier === 'AUTHORITATIVE_MICROSTRUCTURE_RESEARCH');
  check('two-tier coordinator has literal research-only execution denial', two.researchOnly === true && two.executionAuthorized === false);

  const operations = { status:'CORE_READY', realtime:{ worldStateEntries:2, seriesEvents:3, orderBooksTracked:1, evidenceProviders:{ providers:[] } } };
  const view = buildLiquidityHunterViewModel({ symbol:'BTC-USDT', evaluation:null, operations, now:NOW });
  check('read-plane view model exposes honest no-evaluation state', view.state === 'NO_EVALUATION' && view.safety.executionAuthorized === false);

  const failed=checks.filter(x=>!x.passed);
  console.log(`\nTwo-tier replay/read-plane runtime: ${checks.length-failed.length}/${checks.length} PASS`);
  process.exitCode=failed.length?1:0;
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
