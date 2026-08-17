import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readLiquidityHunterFeatureFlags } from '../../src/services/liquidityHunter/featureFlags';
import { readEventReplay } from '../../src/services/replay/eventReplayReader';
import { runLiquidityHunterEventReplay } from '../../src/services/replay/eventReplayRunner';
import { runLiquidityHunterMicrostructureValidation } from '../../src/services/replay/liquidityHunterMicrostructureValidation';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

const filePath = path.resolve(arg('file') || process.env.APEX_REALTIME_EVENT_LOG_PATH || '.apex-data/liquidity-hunter/events.jsonl');
const symbol = (arg('symbol') || 'BTC-USDT').toUpperCase();
const output = path.resolve(arg('out') || `QA/liquidity-hunter-microstructure-${symbol.toLowerCase()}-${Date.now()}.json`);
const read = readEventReplay(filePath);
if (!read.events.length) throw new Error(`no_replay_events_found:${filePath}`);

const flags = readLiquidityHunterFeatureFlags({
  APEX_LIQUIDITY_HUNTER_ENABLED: 'true',
  APEX_LIQUIDITY_HUNTER_SHADOW_ONLY: 'true',
  APEX_REALTIME_L2_ENABLED: arg('l2') === 'false' ? 'false' : 'true',
  APEX_OPTIONS_GEX_ENABLED: arg('gex') === 'true' ? 'true' : 'false',
  APEX_WALLET_GRADING_ENABLED: arg('wallets') === 'true' ? 'true' : 'false',
  APEX_SENTIMENT_VELOCITY_ENABLED: arg('sentiment') === 'true' ? 'true' : 'false',
  APEX_META_MODEL_ENABLED: 'false',
});

const replay = await runLiquidityHunterEventReplay({
  events: read.events,
  symbol,
  flags,
  evaluateEveryEvents: Number(arg('evaluate-every') || 50),
});
const report = await runLiquidityHunterMicrostructureValidation({
  events: read.events,
  evaluations: replay.evaluations,
  symbol,
  executionSource: arg('execution-source') || undefined,
  entryPolicy: arg('entry') === 'limit' ? 'LIMIT_AT_SIGNAL_PRICE' : 'MARKET_AT_CONFIRMATION',
  quantity: Number(arg('quantity') || 1),
  latencyMs: Number(arg('latency-ms') || 100),
  makerFeeBps: Number(arg('maker-fee-bps') || 2),
  takerFeeBps: Number(arg('taker-fee-bps') || 5),
  marketSlippageBps: Number(arg('slippage-bps') || 1),
  queueAheadFraction: Number(arg('queue-ahead') || 1),
  maxHorizonMs: Number(arg('horizon-ms') || 60 * 60_000),
  maxCandidates: Number(arg('max-candidates') || 500),
  concurrency: Number(arg('concurrency') || 2),
});

await writeFile(output, `${JSON.stringify({
  source: { filePath, corruptLines: read.corruptLines, fingerprint: read.deterministicFingerprint },
  replayFingerprint: replay.deterministicFingerprint,
  report,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output,
  sourceEvents: read.events.length,
  candidateCount: report.candidateCount,
  simulatedCount: report.simulatedCount,
  executionSource: report.executionSource,
  workerThreads: report.uniqueWorkerThreads,
  summary: report.summary,
  shadowOnly: report.shadowOnly,
  authoritative: report.authoritative,
}, null, 2));
