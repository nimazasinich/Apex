import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KuCoinPrivateOrderStream,
  type PrivateWebSocketLike,
} from '../services/kucoinPrivateOrderStream';

class FakeSocket implements PrivateWebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data?: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  send(data: string) { this.sent.push(data); }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
  error(value: unknown = new Error('socket-error')) { this.onerror?.(value); }
}

const bullet = {
  token: 'secret-token',
  instanceServers: [{ endpoint: 'wss://example.test/ws', pingInterval: 30_000, pingTimeout: 10_000 }],
};

async function flush() { await Promise.resolve(); await Promise.resolve(); }

afterEach(() => {
  vi.useRealTimers();
});

describe('KuCoinPrivateOrderStream', () => {
  it('subscribes only to the private futures order channel and never exposes an execution method', async () => {
    const socket = new FakeSocket();
    const urls: string[] = [];
    const events: unknown[] = [];
    const stream = new KuCoinPrivateOrderStream({
      fetchBullet: async () => bullet,
      websocketFactory: (url) => { urls.push(url); return socket; },
      onEvent: (event) => { events.push(event); },
      now: () => 1234,
      random: () => 0.5,
    });

    stream.start();
    await flush();
    socket.open();
    await flush();

    expect(stream.state).toBe('CONNECTED');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('token=secret-token');
    expect(urls[0]).toContain('connectId=apex-private-1234-500000000');
    const subscribe = JSON.parse(socket.sent[0]) as Record<string, unknown>;
    expect(subscribe).toMatchObject({
      type: 'subscribe',
      topic: '/contractMarket/tradeOrders',
      privateChannel: true,
      response: true,
    });
    expect('submit' in (stream as unknown as Record<string, unknown>)).toBe(false);

    socket.message({ type: 'message', topic: '/contractMarket/ticker:XBTUSDTM', data: { type: 'match' } });
    socket.message({ type: 'message', topic: '/contractMarket/tradeOrders', subject: 'orderChange', data: { type: 'match', orderId: 'o1' } });
    await flush();
    expect(events).toHaveLength(1);
    stream.close();
  });

  it('fails closed on malformed/private bullet data', async () => {
    const stream = new KuCoinPrivateOrderStream({
      fetchBullet: async () => ({ token: '', instanceServers: [] }),
      websocketFactory: () => { throw new Error('should-not-connect'); },
      onEvent: () => undefined,
      random: () => 0,
    });
    stream.start();
    await flush();
    expect(stream.state).toBe('DEGRADED');
    stream.close();
  });

  it('treats a post-connect socket error as degraded and invokes REST reconciliation on close', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const reconcile = vi.fn(async () => undefined);
    const stream = new KuCoinPrivateOrderStream({
      fetchBullet: async () => bullet,
      websocketFactory: () => socket,
      onEvent: () => undefined,
      onReconnectNeeded: reconcile,
      now: () => 10_000,
      random: () => 0,
    });
    stream.start();
    await flush();
    socket.open();
    await flush();
    expect(stream.state).toBe('CONNECTED');

    socket.error();
    await flush();
    expect(stream.state).toBe('DEGRADED');
    expect(socket.closed).toBe(true);
    expect(reconcile).toHaveBeenCalledTimes(1);
    stream.close();
  });

  it('uses REST reconciliation when event application fails instead of treating the event as authoritative success', async () => {
    const socket = new FakeSocket();
    const reconcile = vi.fn(async () => undefined);
    const stream = new KuCoinPrivateOrderStream({
      fetchBullet: async () => bullet,
      websocketFactory: () => socket,
      onEvent: async () => { throw new Error('store-unavailable'); },
      onReconnectNeeded: reconcile,
    });
    stream.start();
    await flush();
    socket.open();
    await flush();
    socket.message({ type: 'message', topic: '/contractMarket/tradeOrders', data: { type: 'match', orderId: 'o1' } });
    await flush();
    expect(stream.state).toBe('DEGRADED');
    expect(reconcile).toHaveBeenCalledTimes(1);
    stream.close();
  });

  it('refreshes the private token by reconnecting before the cached token expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const created: FakeSocket[] = [];
    let fetchCount = 0;
    const rotating = new KuCoinPrivateOrderStream({
      fetchBullet: async () => {
        fetchCount += 1;
        return { token: `token-${fetchCount}`, instanceServers: [{ endpoint: 'wss://example.test/ws', pingInterval: 24 * 60 * 60 * 1000, pingTimeout: 10_000 }] };
      },
      websocketFactory: () => { const socket = new FakeSocket(); created.push(socket); return socket; },
      onEvent: () => undefined,
      onReconnectNeeded: async () => undefined,
      random: () => 0,
    });
    rotating.start();
    await flush();
    created[0].open();
    await flush();
    expect(fetchCount).toBe(1);

    await vi.advanceTimersByTimeAsync(20 * 60 * 60 * 1000);
    await flush();
    expect(created[0].closed).toBe(true);
    await vi.runOnlyPendingTimersAsync();
    await flush();
    expect(fetchCount).toBe(2);
    expect(created.length).toBeGreaterThanOrEqual(2);
    rotating.close();
  });

  it('fails closed when heartbeat traffic goes silent even while outbound pings continue', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T00:00:00Z'));
    const socket = new FakeSocket();
    const reconcile = vi.fn(async () => undefined);
    const stream = new KuCoinPrivateOrderStream({
      fetchBullet: async () => ({ token: 'token-heartbeat', instanceServers: [{ endpoint: 'wss://example.test/ws', pingInterval: 2_000, pingTimeout: 8_000 }] }),
      websocketFactory: () => socket,
      onEvent: () => undefined,
      onReconnectNeeded: reconcile,
      random: () => 0,
    });

    stream.start();
    await flush();
    socket.open();
    await flush();
    expect(stream.state).toBe('CONNECTED');

    // First ping arms one 8s silence deadline. Later outbound pings must not
    // extend that deadline in the absence of any inbound pong/message.
    await vi.advanceTimersByTimeAsync(9_000);
    await flush();
    expect(socket.sent.some((row) => JSON.parse(row).type === 'ping')).toBe(true);
    expect(socket.closed).toBe(true);
    expect(stream.state).toBe('DEGRADED');
    expect(reconcile).toHaveBeenCalledTimes(1);
    stream.close();
  });

});
