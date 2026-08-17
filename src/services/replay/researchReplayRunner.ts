import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { LiquidityHunterFeatureFlags } from '../liquidityHunter/featureFlags';
import { runLiquidityHunterEventReplay, type EventReplayRunnerResult } from './eventReplayRunner';
import { createReplayDatasetManifest, type ReplayDatasetManifest } from './replayDatasetManifest';

export interface ResearchReplayInput {
  events: MarketEvent[];
  symbol: string;
  flags: LiquidityHunterFeatureFlags;
  manifest?: ReplayDatasetManifest;
  sampleBucketMs?: number;
  maxEvents?: number;
  evaluateEveryEvents?: number;
}

export interface ResearchReplayResult {
  version: 'lh_research_replay_v1';
  tier: 'FAST_RESEARCH';
  symbol: string;
  sourceEventCount: number;
  replayEventCount: number;
  droppedOrderBookDeltaCount: number;
  sampledTradeQuoteCount: number;
  reductionRatio: number;
  replay: EventReplayRunnerResult;
  deterministicFingerprint: string;
  authoritative: false;
  microstructureAuthoritative: false;
  executionAuthorized: false;
  caveats: string[];
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function stableEventOrder(events: readonly MarketEvent[]): MarketEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.exchangeTimestamp - b.event.exchangeTimestamp
      || a.event.receivedAt - b.event.receivedAt
      || a.index - b.index)
    .map(({ event }) => structuredClone(event));
}

/**
 * Fast research tier. It deliberately excludes order-book deltas and keeps at
 * most one genuine TRADE/QUOTE event per source/type/time bucket. It does not
 * synthesize prices, sizes or book states. The tier is therefore suitable for
 * broad candidate elimination but cannot validate L2/queue-sensitive edges.
 */
export async function runLiquidityHunterResearchReplay(input: ResearchReplayInput): Promise<ResearchReplayResult> {
  const symbol = input.symbol.toUpperCase();
  const bucketMs = clampInt(input.sampleBucketMs, 1_000, 100, 60_000);
  const maxEvents = clampInt(input.maxEvents, 250_000, 100, 1_000_000);
  const source = stableEventOrder(input.events.filter((event) => event.symbol === symbol));
  if (!source.length) throw new Error('research_replay_symbol_has_no_events');

  const lastBucketEvent = new Map<string, MarketEvent>();
  const retained: MarketEvent[] = [];
  let droppedOrderBookDeltaCount = 0;
  let sampledTradeQuoteCount = 0;

  for (const event of source) {
    if (event.type === 'ORDERBOOK_DELTA') {
      droppedOrderBookDeltaCount += 1;
      continue;
    }
    if (event.type === 'TRADE' || event.type === 'QUOTE') {
      const bucket = Math.floor(event.exchangeTimestamp / bucketMs);
      const key = `${event.source}:${event.type}:${bucket}`;
      if (lastBucketEvent.has(key)) sampledTradeQuoteCount += 1;
      lastBucketEvent.set(key, event);
      continue;
    }
    retained.push(event);
  }
  retained.push(...lastBucketEvent.values());
  const ordered = stableEventOrder(retained);
  const stride = ordered.length > maxEvents ? Math.ceil(ordered.length / maxEvents) : 1;
  const budgeted = stride === 1
    ? ordered
    : ordered.filter((event, index) => index % stride === 0 || index === ordered.length - 1 || !['TRADE', 'QUOTE'].includes(event.type));
  const replayEvents = budgeted.slice(0, maxEvents);
  if (replayEvents.length < 5) throw new Error('research_replay_insufficient_events_after_reduction');

  const manifest = createReplayDatasetManifest(replayEvents, {
    datasetId: `${input.manifest?.datasetId ?? 'research'}:fast`,
    createdAt: input.manifest?.createdAt ?? replayEvents.at(-1)!.exchangeTimestamp,
  });
  const replay = await runLiquidityHunterEventReplay({
    events: replayEvents,
    symbol,
    flags: input.flags,
    manifest,
    evaluateEveryEvents: input.evaluateEveryEvents ?? 100,
  });
  const reductionRatio = 1 - replayEvents.length / source.length;
  const fingerprint = createHash('sha256')
    .update(replay.deterministicFingerprint)
    .update(`:${source.length}:${replayEvents.length}:${droppedOrderBookDeltaCount}:${sampledTradeQuoteCount}`)
    .digest('hex');

  return {
    version: 'lh_research_replay_v1',
    tier: 'FAST_RESEARCH',
    symbol,
    sourceEventCount: source.length,
    replayEventCount: replayEvents.length,
    droppedOrderBookDeltaCount,
    sampledTradeQuoteCount,
    reductionRatio,
    replay,
    deterministicFingerprint: fingerprint,
    authoritative: false,
    microstructureAuthoritative: false,
    executionAuthorized: false,
    caveats: [
      'TRADE/QUOTE events may be deterministically thinned for candidate elimination.',
      'ORDERBOOK_DELTA events are excluded; L2, iceberg and queue-sensitive conclusions are not validated by this tier.',
      'Only surviving candidates should advance to full event-sequence microstructure replay.',
      'No replay result can authorize or submit an order.',
    ],
  };
}
