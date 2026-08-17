import type { MarketEvent, MarketEventType } from '../../contracts/realtime/marketEvent';
import { validateMarketEvent } from '../../contracts/realtime/marketEvent';
import type { AppendOnlyEventLog } from './appendOnlyEventLog';
import type { InProcessEventBus } from './inProcessEventBus';
import { RealtimeHealthTracker } from './realtimeHealth';
import type { RealtimeSeriesStore } from './realtimeSeriesStore';
import type { OrderBookRebuilder } from './orderBookRebuilder';
import { SequenceGuard } from './sequenceGuard';
import { WorldStateStore } from './worldStateStore';

const DEFAULT_TTLS: Record<MarketEventType, number> = {
  TRADE: 5_000,
  QUOTE: 5_000,
  ORDERBOOK_SNAPSHOT: 5_000,
  ORDERBOOK_DELTA: 5_000,
  LIQUIDATION: 30_000,
  FUNDING: 5 * 60_000,
  OPEN_INTEREST: 60_000,
  OPTION_TRADE: 60_000,
  WALLET_POSITION: 60_000,
  SENTIMENT_EVENT: 30_000,
};

export interface SnapshotCoordinatorOptions {
  eventBus: InProcessEventBus;
  worldState: WorldStateStore;
  sequenceGuard: SequenceGuard;
  health: RealtimeHealthTracker;
  eventLog?: AppendOnlyEventLog | null;
  ttlByType?: Partial<Record<MarketEventType, number>>;
  seriesStore?: RealtimeSeriesStore | null;
  orderBook?: OrderBookRebuilder | null;
}

export class SnapshotCoordinator {
  private readonly eventBus: InProcessEventBus;
  private readonly worldState: WorldStateStore;
  private readonly sequenceGuard: SequenceGuard;
  private readonly health: RealtimeHealthTracker;
  private readonly eventLog: AppendOnlyEventLog | null;
  private readonly ttlByType: Record<MarketEventType, number>;
  private readonly seriesStore: RealtimeSeriesStore | null;
  private readonly orderBook: OrderBookRebuilder | null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: SnapshotCoordinatorOptions) {
    this.eventBus = options.eventBus;
    this.worldState = options.worldState;
    this.sequenceGuard = options.sequenceGuard;
    this.health = options.health;
    this.eventLog = options.eventLog ?? null;
    this.ttlByType = { ...DEFAULT_TTLS, ...(options.ttlByType ?? {}) };
    this.seriesStore = options.seriesStore ?? null;
    this.orderBook = options.orderBook ?? null;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.eventBus.subscribe((event) => this.consume(event));
  }

  async consume(event: MarketEvent): Promise<void> {
    const validation = validateMarketEvent(event);
    if (!validation.ok) {
      const reason = validation.reasons.join(',');
      this.health.invalid(reason);
      throw new Error(`invalid_market_event:${reason}`);
    }

    const sequence = this.sequenceGuard.inspect(event);
    if (sequence.status === 'DUPLICATE') {
      this.health.duplicate();
      return;
    }
    if (sequence.status === 'GAP') {
      const reason = sequence.reason ?? 'sequence_gap';
      this.health.gap(reason);
      this.worldState.invalidate({ source: event.source, symbol: event.symbol, eventType: event.type }, reason, event.receivedAt);
      this.seriesStore?.invalidateSeries({ source: event.source, symbol: event.symbol, type: event.type });
      if (event.type === 'ORDERBOOK_DELTA' || event.type === 'ORDERBOOK_SNAPSHOT') {
        this.seriesStore?.invalidateSeries({ source: event.source, symbol: event.symbol, type: 'ORDERBOOK_DELTA' });
        this.seriesStore?.invalidateSeries({ source: event.source, symbol: event.symbol, type: 'ORDERBOOK_SNAPSHOT' });
        this.orderBook?.markRebuilding(event.source, event.symbol, reason, event.receivedAt);
      }
      return;
    }
    if (sequence.status === 'OUT_OF_ORDER') {
      const reason = sequence.reason ?? 'out_of_order';
      this.health.outOfOrder(reason);
      return;
    }

    if (this.eventLog) {
      try {
        await this.eventLog.append(event);
        this.health.persisted();
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'event_log_write_failed';
        this.health.persistenceFailed(reason);
        throw error;
      }
    }

    this.seriesStore?.append(event, event.receivedAt);
    this.orderBook?.apply(event, event.receivedAt);
    this.worldState.apply(event, {
      ttlMs: this.ttlByType[event.type],
      quality: 'VALID',
      reasons: sequence.status === 'UNSEQUENCED' ? ['source_does_not_publish_sequence'] : [],
      now: event.receivedAt,
    });
    this.health.accepted(event.receivedAt);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
