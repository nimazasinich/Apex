import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import { assertValidMarketEvent } from '../../contracts/realtime/marketEvent';

export type EventDeliveryClass = 'CRITICAL' | 'LOSSLESS' | 'SAMPLEABLE';
export type EventPublishDisposition = 'DELIVERED' | 'SAMPLED';
export type EventHandler = (event: MarketEvent) => void | Promise<void>;

export interface InProcessEventBusOptions {
  maxQueuePerSource?: number;
  deliveryClass?: (event: MarketEvent) => EventDeliveryClass;
}

export interface EventBusStats {
  published: number;
  delivered: number;
  sampled: number;
  rejected: number;
  handlerFailures: number;
  queued: number;
}

interface PendingEvent {
  event: MarketEvent;
  deliveryClass: EventDeliveryClass;
  resolve: (disposition: EventPublishDisposition) => void;
  reject: (error: Error) => void;
}

interface SourceQueue {
  items: PendingEvent[];
  draining: boolean;
}

export class EventQueueOverflowError extends Error {
  constructor(public readonly source: string, public readonly capacity: number) {
    super(`event_queue_overflow:${source}:${capacity}`);
    this.name = 'EventQueueOverflowError';
  }
}

/**
 * Market events that feed authoritative strategy evidence are lossless by
 * default. Only sentiment events may be sampled under pressure because they
 * are shadow-only and independently time-boxed. High-rate trade reduction must
 * happen in a source-local accumulator before the central bus, never by
 * silently dropping trades used for CVD.
 */
function defaultDeliveryClass(event: MarketEvent): EventDeliveryClass {
  if (event.type === 'SENTIMENT_EVENT') return 'SAMPLEABLE';
  if (event.type === 'ORDERBOOK_DELTA') return 'CRITICAL';
  return 'LOSSLESS';
}

export class InProcessEventBus {
  private readonly maxQueuePerSource: number;
  private readonly deliveryClass: (event: MarketEvent) => EventDeliveryClass;
  private readonly subscribers = new Set<EventHandler>();
  private readonly queues = new Map<string, SourceQueue>();
  private readonly idleWaiters = new Set<() => void>();
  private accepting = true;
  private readonly counters: Omit<EventBusStats, 'queued'> = {
    published: 0,
    delivered: 0,
    sampled: 0,
    rejected: 0,
    handlerFailures: 0,
  };

  constructor(options: InProcessEventBusOptions = {}) {
    const requested = options.maxQueuePerSource ?? 1_024;
    if (!Number.isSafeInteger(requested) || requested < 8 || requested > 100_000) {
      throw new Error('invalid_event_queue_capacity');
    }
    this.maxQueuePerSource = requested;
    this.deliveryClass = options.deliveryClass ?? defaultDeliveryClass;
  }

  subscribe(handler: EventHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  async publish(event: MarketEvent): Promise<EventPublishDisposition> {
    if (!this.accepting) throw new Error('event_bus_closed');
    assertValidMarketEvent(event);
    this.counters.published += 1;
    const queue = this.queues.get(event.source) ?? { items: [], draining: false };
    this.queues.set(event.source, queue);
    const deliveryClass = this.deliveryClass(event);

    if (queue.items.length >= this.maxQueuePerSource) {
      if (deliveryClass !== 'SAMPLEABLE') {
        this.counters.rejected += 1;
        throw new EventQueueOverflowError(event.source, this.maxQueuePerSource);
      }
      const sampleIndex = queue.items.findIndex((item) => item.deliveryClass === 'SAMPLEABLE');
      if (sampleIndex < 0) {
        this.counters.rejected += 1;
        throw new EventQueueOverflowError(event.source, this.maxQueuePerSource);
      }
      const [sampled] = queue.items.splice(sampleIndex, 1);
      sampled.resolve('SAMPLED');
      this.counters.sampled += 1;
    }

    const completion = new Promise<EventPublishDisposition>((resolve, reject) => {
      queue.items.push({ event, deliveryClass, resolve, reject });
    });
    if (!queue.draining) void this.drain(event.source, queue);
    return completion;
  }

  private async drain(source: string, queue: SourceQueue): Promise<void> {
    queue.draining = true;
    try {
      while (queue.items.length > 0) {
        const pending = queue.items.shift()!;
        try {
          for (const subscriber of this.subscribers) await subscriber(pending.event);
          this.counters.delivered += 1;
          pending.resolve('DELIVERED');
        } catch (error) {
          this.counters.handlerFailures += 1;
          pending.reject(error instanceof Error ? error : new Error('event_handler_failed'));
        }
      }
    } finally {
      queue.draining = false;
      if (queue.items.length === 0) this.queues.delete(source);
      this.notifyIdle();
    }
  }

  private isIdle(): boolean {
    return [...this.queues.values()].every((queue) => !queue.draining && queue.items.length === 0);
  }

  private notifyIdle(): void {
    if (!this.isIdle()) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  async drainAll(): Promise<void> {
    if (this.isIdle()) return;
    await new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }

  async close(): Promise<void> {
    this.accepting = false;
    await this.drainAll();
  }

  stats(): EventBusStats {
    let queued = 0;
    for (const queue of this.queues.values()) queued += queue.items.length;
    return { ...this.counters, queued };
  }
}
