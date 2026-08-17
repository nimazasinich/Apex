import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import { validateMarketEvent } from '../../contracts/realtime/marketEvent';

export interface EventReplayReadResult {
  events: MarketEvent[];
  corruptLines: number;
  deterministicFingerprint: string;
  files: string[];
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Read the current append-only segment plus rotated segments without creating
 * a writer worker. This keeps replay and audit reads side-effect free.
 */
export function readEventReplay(filePath: string): EventReplayReadResult {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);
  const files = existsSync(dir)
    ? readdirSync(dir)
      .filter((name) => name.startsWith(`${base}.`) && name.endsWith('.jsonl'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => path.join(dir, name))
      .concat(existsSync(resolved) ? [resolved] : [])
    : [];
  const events: MarketEvent[] = [];
  let corruptLines = 0;
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as MarketEvent;
        if ((event as unknown as { recordType?: string }).recordType === 'LIQUIDITY_HUNTER_SETUP_TRANSITION') continue;
        if (!validateMarketEvent(event).ok) {
          corruptLines += 1;
          continue;
        }
        events.push(event);
      } catch {
        corruptLines += 1;
      }
    }
  }
  const stable = events.map((event) => JSON.stringify(event)).join('\n');
  return {
    events,
    corruptLines,
    deterministicFingerprint: fnv1a(stable),
    files,
  };
}
