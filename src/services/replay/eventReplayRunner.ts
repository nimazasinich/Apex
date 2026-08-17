import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';
import type { MetaModelEvaluationPayload } from '../../contracts/realtime/marketPayloads';
import type { SmartMoneyContext } from '../../types';
import type { LiquidityHunterFeatureFlags } from '../liquidityHunter/featureFlags';
import { LiquidityHunterDynamicFusionEngine } from '../liquidityHunter/dynamicFusionEngine';
import { InProcessEventBus } from '../realtime/inProcessEventBus';
import { OrderBookRebuilder } from '../realtime/orderBookRebuilder';
import { RealtimeHealthTracker } from '../realtime/realtimeHealth';
import { RealtimeSeriesStore } from '../realtime/realtimeSeriesStore';
import { SequenceGuard } from '../realtime/sequenceGuard';
import { SnapshotCoordinator } from '../realtime/snapshotCoordinator';
import { WorldStateStore } from '../realtime/worldStateStore';
import { createReplayDatasetManifest, type ReplayDatasetManifest, verifyReplayDatasetManifest } from './replayDatasetManifest';

export interface EventReplayRunnerInput {
  events: MarketEvent[];
  symbol: string;
  flags: LiquidityHunterFeatureFlags;
  manifest?: ReplayDatasetManifest;
  evaluateEveryEvents?: number;
  smartMoneyContextAt?: (timestamp: number) => SmartMoneyContext | null | Promise<SmartMoneyContext | null>;
  metaModelAt?: (timestamp: number) => MetaModelEvaluationPayload | null | Promise<MetaModelEvaluationPayload | null>;
  currentPriceAt?: (timestamp: number) => number | null | Promise<number | null>;
}

export interface EventReplayRunnerResult {
  manifest: ReplayDatasetManifest;
  evaluations: LiquidityHunterEvaluation[];
  finalEvaluation: LiquidityHunterEvaluation | null;
  deterministicFingerprint: string;
  health: ReturnType<RealtimeHealthTracker['snapshot']>;
  orderBookStats: ReturnType<OrderBookRebuilder['stats']>;
  seriesStats: ReturnType<RealtimeSeriesStore['stats']>;
  worldStateEntries: number;
}

function deterministicIdFactory(prefix = 'replay'): () => string {
  let value = 0;
  return () => `${prefix}-${String(++value).padStart(10, '0')}`;
}

function evaluationFingerprint(evaluations: LiquidityHunterEvaluation[]): string {
  const hash = createHash('sha256');
  for (const evaluation of evaluations) hash.update(JSON.stringify(evaluation)).update('\n');
  return hash.digest('hex');
}

function orderedReplayEvents(events: readonly MarketEvent[]): MarketEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => left.event.exchangeTimestamp - right.event.exchangeTimestamp
      || left.event.receivedAt - right.event.receivedAt
      || left.index - right.index)
    .map(({ event }) => ({ ...structuredClone(event), ingestionKind: 'REPLAY' as const }));
}

export async function runLiquidityHunterEventReplay(input: EventReplayRunnerInput): Promise<EventReplayRunnerResult> {
  const symbol = input.symbol.toUpperCase();
  const sourceEvents = input.events.filter((event) => event.symbol === symbol);
  if (!sourceEvents.length) throw new Error('replay_symbol_has_no_events');
  const manifest = input.manifest ?? createReplayDatasetManifest(sourceEvents);
  const manifestIssues = verifyReplayDatasetManifest(sourceEvents, manifest);
  if (manifestIssues.length) throw new Error(`replay_manifest_invalid:${manifestIssues.join(',')}`);

  const events = orderedReplayEvents(sourceEvents);
  const bus = new InProcessEventBus({ maxQueuePerSource: 100_000 });
  const worldState = new WorldStateStore();
  const seriesStore = new RealtimeSeriesStore({ maxEventsPerKey: 100_000, maxAgeMs: 30 * 24 * 60 * 60 * 1_000 });
  const orderBook = new OrderBookRebuilder();
  const sequenceGuard = new SequenceGuard();
  const health = new RealtimeHealthTracker();
  const coordinator = new SnapshotCoordinator({ eventBus: bus, worldState, sequenceGuard, health, seriesStore, orderBook });
  const engine = new LiquidityHunterDynamicFusionEngine({
    flags: input.flags,
    worldState,
    seriesStore,
    orderBook,
    idFactory: deterministicIdFactory(),
  });
  coordinator.start();

  const interval = Math.max(1, Math.min(10_000, Math.floor(input.evaluateEveryEvents ?? 50)));
  const evaluations: LiquidityHunterEvaluation[] = [];
  try {
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      await bus.publish(event);
      if ((index + 1) % interval !== 0 && index !== events.length - 1) continue;
      const timestamp = event.exchangeTimestamp;
      const [smartMoneyContext, metaModelEvaluation, currentPrice] = await Promise.all([
        input.smartMoneyContextAt?.(timestamp) ?? null,
        input.metaModelAt?.(timestamp) ?? null,
        input.currentPriceAt?.(timestamp) ?? null,
      ]);
      evaluations.push(await engine.evaluate({
        symbol,
        now: timestamp,
        smartMoneyContext,
        metaModelEvaluation,
        currentPrice,
      }));
    }
    await bus.drainAll();
  } finally {
    coordinator.stop();
    await bus.close();
  }

  return {
    manifest,
    evaluations,
    finalEvaluation: evaluations.at(-1) ?? null,
    deterministicFingerprint: evaluationFingerprint(evaluations),
    health: health.snapshot(true),
    orderBookStats: orderBook.stats(),
    seriesStats: seriesStore.stats(),
    worldStateEntries: worldState.snapshot(events.at(-1)?.exchangeTimestamp ?? Date.now()).entries.length,
  };
}
