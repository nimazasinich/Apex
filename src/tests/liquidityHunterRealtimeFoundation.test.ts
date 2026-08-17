import { mkdtempSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MarketEvent } from '../contracts/realtime/marketEvent';
import { AppendOnlyEventLog } from '../services/realtime/appendOnlyEventLog';
import { EventQueueOverflowError, InProcessEventBus } from '../services/realtime/inProcessEventBus';
import { RealtimeHealthTracker } from '../services/realtime/realtimeHealth';
import { SequenceGuard, sequenceKey } from '../services/realtime/sequenceGuard';
import { SnapshotCoordinator } from '../services/realtime/snapshotCoordinator';
import { WorldStateStore } from '../services/realtime/worldStateStore';

function trade(sequence: number, eventId = `trade-${sequence}`): MarketEvent {
  return {
    eventId,
    type: 'TRADE',
    source: 'binance-usdm',
    symbol: 'BTC-USDT',
    exchangeTimestamp: 1_000 + sequence,
    receivedAt: 2_000 + sequence,
    sequence,
    schemaVersion: 1,
    payload: { price: 100 + sequence, size: 1 },
  };
}

describe('liquidity hunter realtime foundation', () => {
  it('delivers source events in order', async () => {
    const bus = new InProcessEventBus({ maxQueuePerSource: 8 });
    const received: string[] = [];
    bus.subscribe(async (event) => { received.push(event.eventId); });
    await Promise.all([bus.publish(trade(1)), bus.publish(trade(2)), bus.publish(trade(3))]);
    expect(received).toEqual(['trade-1', 'trade-2', 'trade-3']);
  });

  it('never silently drops lossless order-book deltas under pressure', async () => {
    const bus = new InProcessEventBus({ maxQueuePerSource: 8 });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    bus.subscribe(async () => blocker);
    const first = bus.publish({ ...trade(1), type: 'ORDERBOOK_DELTA' });
    const queued = Array.from({ length: 8 }, (_, index) => bus.publish({
      ...trade(index + 2),
      type: 'ORDERBOOK_DELTA' as const,
      eventId: `depth-${index}`,
    }));
    await expect(bus.publish({ ...trade(99), type: 'ORDERBOOK_DELTA', eventId: 'overflow' }))
      .rejects.toBeInstanceOf(EventQueueOverflowError);
    release();
    await Promise.all([first, ...queued]);
  });

  it('detects gaps and requires an explicit reseed', () => {
    const guard = new SequenceGuard();
    expect(guard.inspect(trade(10)).status).toBe('ACCEPTED');
    expect(guard.inspect(trade(12)).status).toBe('GAP');
    expect(guard.inspect(trade(11)).status).toBe('GAP');
    guard.seed(sequenceKey(trade(11)), 11);
    expect(guard.inspect(trade(12)).status).toBe('ACCEPTED');
  });

  it('persists before materializing world state and replays deterministically', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'apex-lh-'));
    const filePath = path.join(dir, 'events.jsonl');
    const log = new AppendOnlyEventLog({ filePath, fsync: false, maxSegmentBytes: 64 * 1024 });
    const bus = new InProcessEventBus({ maxQueuePerSource: 8 });
    const store = new WorldStateStore();
    const health = new RealtimeHealthTracker();
    const coordinator = new SnapshotCoordinator({
      eventBus: bus,
      worldState: store,
      sequenceGuard: new SequenceGuard(),
      health,
      eventLog: log,
    });
    coordinator.start();
    await bus.publish(trade(1));
    await log.flush();
    expect(log.readAll().events.map((row) => row.eventId)).toEqual(['trade-1']);
    expect(store.snapshot(2_001).entries).toHaveLength(1);
    expect(health.snapshot(true).persistedEvents).toBe(1);
    const persistedMode = statSync(filePath).mode & 0o777;
    if (process.platform !== 'win32') expect(persistedMode).toBe(0o600);
    else expect(persistedMode).not.toBe(0);
    coordinator.stop();
  });

  it('reports corrupt log rows without treating them as valid evidence', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'apex-lh-corrupt-'));
    const filePath = path.join(dir, 'events.jsonl');
    writeFileSync(filePath, `${JSON.stringify(trade(1))}\n{not-json}\n`, 'utf8');
    const result = new AppendOnlyEventLog({ filePath, fsync: false }).readAll();
    expect(result.events).toHaveLength(1);
    expect(result.corruptLines).toBe(1);
  });

  it('marks expired world-state entries stale instead of fabricating continuity', () => {
    const store = new WorldStateStore();
    const row = trade(1);
    const entry = store.apply(row, { ttlMs: 100, now: 2_001 });
    expect(store.get(entry.key, row.exchangeTimestamp + 99)?.quality).toBe('VALID');
    expect(store.get(entry.key, row.exchangeTimestamp + 100)?.quality).toBe('STALE');
  });
  it('drains in-flight events before closing and rejects new publications', async () => {
    const bus = new InProcessEventBus({ maxQueuePerSource: 8 });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    bus.subscribe(async () => blocker);
    const published = bus.publish(trade(1));
    await Promise.resolve();
    let closed = false;
    const closing = bus.close().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    await expect(bus.publish(trade(2))).rejects.toThrow('event_bus_closed');
    release();
    await published;
    await closing;
    expect(closed).toBe(true);
  });

  it('replays rotated segments deterministically regardless of file mtimes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'apex-lh-order-'));
    const filePath = path.join(dir, 'events.jsonl');
    const first = `${filePath}.2026-08-07T00-00-00-000Z.1.jsonl`;
    const second = `${filePath}.2026-08-07T00-00-01-000Z.2.jsonl`;
    writeFileSync(first, `${JSON.stringify(trade(1))}
`, 'utf8');
    writeFileSync(second, `${JSON.stringify(trade(2))}
`, 'utf8');
    writeFileSync(filePath, `${JSON.stringify(trade(3))}
`, 'utf8');
    utimesSync(first, new Date(3_000), new Date(3_000));
    utimesSync(second, new Date(1_000), new Date(1_000));
    utimesSync(filePath, new Date(2_000), new Date(2_000));
    const result = new AppendOnlyEventLog({ filePath, fsync: false }).readAll();
    expect(result.events.map((row) => row.eventId)).toEqual(['trade-1', 'trade-2', 'trade-3']);
  });

});
