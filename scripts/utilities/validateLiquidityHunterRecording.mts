import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readLiquidityHunterFeatureFlags } from '../../src/services/liquidityHunter/featureFlags';
import { evaluateLiquidityHunterResearchReadiness } from '../../src/services/liquidityHunter/researchReadiness';
import { readEventReplay } from '../../src/services/replay/eventReplayReader';
import { runLiquidityHunterWalkForwardValidation } from '../../src/services/replay/liquidityHunterWalkForwardValidation';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

const filePath = path.resolve(arg('file') || process.env.APEX_REALTIME_EVENT_LOG_PATH || '.apex-data/liquidity-hunter/events.jsonl');
const symbol = (arg('symbol') || 'BTC-USDT').toUpperCase();
const output = path.resolve(arg('out') || `QA/liquidity-hunter-validation-${symbol.toLowerCase()}-${Date.now()}.json`);
const read = readEventReplay(filePath);
if (!read.events.length) throw new Error(`no_replay_events_found:${filePath}`);

const flags = readLiquidityHunterFeatureFlags({
  APEX_LIQUIDITY_HUNTER_ENABLED: 'true',
  APEX_LIQUIDITY_HUNTER_SHADOW_ONLY: 'true',
  APEX_REALTIME_L2_ENABLED: arg('l2') === 'false' ? 'false' : 'true',
  APEX_OPTIONS_GEX_ENABLED: arg('gex') === 'true' ? 'true' : 'false',
  APEX_LIQUIDITY_HUNTER_DERIBIT_OPTIONS_ENABLED: 'false',
  APEX_WALLET_GRADING_ENABLED: arg('wallets') === 'true' ? 'true' : 'false',
  APEX_SENTIMENT_VELOCITY_ENABLED: arg('sentiment') === 'true' ? 'true' : 'false',
  APEX_META_MODEL_ENABLED: 'false',
});

const report = await runLiquidityHunterWalkForwardValidation({
  events: read.events,
  symbol,
  flags,
  foldCount: Number(arg('folds') || 3),
  holdoutFraction: Number(arg('holdout') || 0.20),
  warmupMs: Number(arg('warmup-ms') || 60 * 60_000),
  purgeMs: Number(arg('purge-ms') || 5 * 60_000),
  embargoMs: Number(arg('embargo-ms') || 5 * 60_000),
  evaluateEveryEvents: Number(arg('evaluate-every') || 50),
  maxConcurrency: Number(arg('concurrency') || 2),
  roundTripCostBps: Number(arg('cost-bps') || 10),
});
const researchReadiness = evaluateLiquidityHunterResearchReadiness({ walkForward: report });

await writeFile(output, `${JSON.stringify({ source: { filePath, corruptLines: read.corruptLines, fingerprint: read.deterministicFingerprint }, report, researchReadiness }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output,
  sourceEvents: read.events.length,
  corruptLines: read.corruptLines,
  fingerprint: report.fingerprintSha256,
  walkForwardCandidateFolds: report.consistency.walkForwardCandidateFolds,
  holdoutCandidateCount: report.consistency.holdoutCandidateCount,
  holdoutMedianNetReturnPct: report.consistency.holdoutMedianNetReturnPct,
  researchReadiness: researchReadiness.status,
  researchReadinessBlockers: researchReadiness.blockers,
  shadowOnly: report.shadowOnly,
  authoritative: report.authoritative,
}, null, 2));
