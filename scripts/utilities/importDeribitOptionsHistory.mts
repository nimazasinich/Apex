import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importDeribitOptionsHistory } from '../../src/services/realtime/deribitOptionsHistoricalImporter';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

const currencyRaw = (arg('currency') || 'BTC').toUpperCase();
if (currencyRaw !== 'BTC' && currencyRaw !== 'ETH') throw new Error('currency_must_be_BTC_or_ETH');
const startTime = Number(arg('start-ms'));
const endTime = Number(arg('end-ms'));
if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) || endTime <= startTime) {
  throw new Error('provide_--start-ms_and_--end-ms');
}
const output = path.resolve(arg('out') || `QA/deribit-${currencyRaw.toLowerCase()}-option-flow-${startTime}-${endTime}.jsonl`);
const result = await importDeribitOptionsHistory({
  currency: currencyRaw,
  startTime,
  endTime,
  baseUrl: process.env.APEX_DERIBIT_PUBLIC_BASE_URL,
  maxRequests: Number(arg('max-requests') || 2048),
  minimumWindowMs: Number(arg('minimum-window-ms') || 60_000),
});
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, result.events.map((event) => JSON.stringify(event)).join('\n') + (result.events.length ? '\n' : ''), 'utf8');
console.log(JSON.stringify({
  output,
  events: result.events.length,
  requests: result.requests,
  sourceTrades: result.sourceTrades,
  rejectedTrades: result.rejectedTrades,
  complete: result.complete,
  incompleteWindows: result.incompleteWindows.length,
  methodology: result.methodology,
}, null, 2));
