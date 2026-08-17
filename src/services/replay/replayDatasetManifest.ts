import { createHash } from 'node:crypto';
import type { MarketEvent, MarketEventType } from '../../contracts/realtime/marketEvent';
import { assertValidMarketEvent } from '../../contracts/realtime/marketEvent';

export interface ReplayDatasetManifest {
  schemaVersion: 1;
  datasetId: string;
  symbols: string[];
  sources: string[];
  startAt: number | null;
  endAt: number | null;
  eventCount: number;
  eventCountsByType: Partial<Record<MarketEventType, number>>;
  eventCountsBySource: Record<string, number>;
  outOfOrderCount: number;
  checksumSha256: string;
  createdAt: number;
}

function canonicalEventLine(event: MarketEvent): string {
  return JSON.stringify({
    eventId: event.eventId,
    type: event.type,
    source: event.source,
    symbol: event.symbol,
    exchangeTimestamp: event.exchangeTimestamp,
    receivedAt: event.receivedAt,
    sequence: event.sequence ?? null,
    sequenceStart: event.sequenceStart ?? null,
    previousSequence: event.previousSequence ?? null,
    schemaVersion: event.schemaVersion,
    ingestionKind: event.ingestionKind ?? 'LIVE',
    payload: event.payload,
  });
}

export function checksumReplayEvents(events: readonly MarketEvent[]): string {
  const hash = createHash('sha256');
  for (const event of events) hash.update(canonicalEventLine(event)).update('\n');
  return hash.digest('hex');
}

export function createReplayDatasetManifest(
  events: readonly MarketEvent[],
  options: { datasetId?: string; createdAt?: number } = {},
): ReplayDatasetManifest {
  if (events.length > 1_000_000) throw new Error('replay_dataset_event_limit_exceeded');
  const eventCountsByType: Partial<Record<MarketEventType, number>> = {};
  const eventCountsBySource: Record<string, number> = {};
  const symbols = new Set<string>();
  const sources = new Set<string>();
  let startAt: number | null = null;
  let endAt: number | null = null;
  let outOfOrderCount = 0;
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    assertValidMarketEvent(event);
    eventCountsByType[event.type] = (eventCountsByType[event.type] ?? 0) + 1;
    eventCountsBySource[event.source] = (eventCountsBySource[event.source] ?? 0) + 1;
    symbols.add(event.symbol);
    sources.add(event.source);
    startAt = startAt === null ? event.exchangeTimestamp : Math.min(startAt, event.exchangeTimestamp);
    endAt = endAt === null ? event.exchangeTimestamp : Math.max(endAt, event.exchangeTimestamp);
    if (event.exchangeTimestamp < previousTimestamp) outOfOrderCount += 1;
    previousTimestamp = event.exchangeTimestamp;
  }
  const checksumSha256 = checksumReplayEvents(events);
  return {
    schemaVersion: 1,
    datasetId: options.datasetId ?? `event-replay-${checksumSha256.slice(0, 16)}`,
    symbols: [...symbols].sort(),
    sources: [...sources].sort(),
    startAt,
    endAt,
    eventCount: events.length,
    eventCountsByType,
    eventCountsBySource,
    outOfOrderCount,
    checksumSha256,
    createdAt: options.createdAt ?? Date.now(),
  };
}

export function verifyReplayDatasetManifest(events: readonly MarketEvent[], manifest: ReplayDatasetManifest): string[] {
  const issues: string[] = [];
  if (manifest.schemaVersion !== 1) issues.push('unsupported_manifest_schema');
  if (manifest.eventCount !== events.length) issues.push('manifest_event_count_mismatch');
  if (checksumReplayEvents(events) !== manifest.checksumSha256) issues.push('manifest_checksum_mismatch');
  const generated = createReplayDatasetManifest(events, { datasetId: manifest.datasetId, createdAt: manifest.createdAt });
  if (generated.startAt !== manifest.startAt || generated.endAt !== manifest.endAt) issues.push('manifest_time_range_mismatch');
  if (JSON.stringify(generated.symbols) !== JSON.stringify(manifest.symbols)) issues.push('manifest_symbol_mismatch');
  if (JSON.stringify(generated.sources) !== JSON.stringify(manifest.sources)) issues.push('manifest_source_mismatch');
  return issues;
}
