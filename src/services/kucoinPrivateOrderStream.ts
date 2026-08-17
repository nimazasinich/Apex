/**
 * Server-only KuCoin Classic Futures private order stream.
 *
 * The stream is a read/reconciliation plane only. It has no order submission,
 * cancellation, or execution-authority method. REST remains the recovery
 * authority after disconnects or ambiguous events.
 */

export type PrivateOrderStreamState =
  | 'DISABLED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DEGRADED'
  | 'CLOSED';

export interface KuCoinPrivateBullet {
  token?: string;
  instanceServers?: Array<{ endpoint?: string; pingInterval?: number; pingTimeout?: number }>;
}

export interface KuCoinPrivateOrderEvent {
  topic: string;
  subject: string | null;
  receivedAt: number;
  data: Record<string, unknown>;
}

interface WebSocketEventLike { data?: unknown }
export interface PrivateWebSocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: WebSocketEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type PrivateWebSocketFactory = (url: string) => PrivateWebSocketLike;

export interface KuCoinPrivateOrderStreamOptions {
  enabled?: boolean;
  fetchBullet: () => Promise<unknown>;
  websocketFactory?: PrivateWebSocketFactory;
  onEvent: (event: KuCoinPrivateOrderEvent) => void | Promise<void>;
  onReconnectNeeded?: () => void | Promise<void>;
  now?: () => number;
  random?: () => number;
}

function defaultWebSocketFactory(url: string): PrivateWebSocketLike {
  if (typeof WebSocket === 'undefined') throw new Error('websocket_not_available');
  return new WebSocket(url) as unknown as PrivateWebSocketLike;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function unwrapBullet(value: unknown): KuCoinPrivateBullet {
  const row = asRecord(value);
  if (!row) throw new Error('private_ws_bullet_malformed');
  const data = asRecord(row.data) ?? row;
  const token = typeof data.token === 'string' ? data.token : '';
  const instanceServers = Array.isArray(data.instanceServers) ? data.instanceServers as KuCoinPrivateBullet['instanceServers'] : undefined;
  if (!token || !instanceServers?.length) throw new Error('private_ws_bullet_incomplete');
  return { token, instanceServers };
}

function timerUnref(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
  const candidate = timer as unknown as { unref?: () => void };
  candidate.unref?.();
}

export class KuCoinPrivateOrderStream {
  private socket: PrivateWebSocketLike | null = null;
  private stateValue: PrivateOrderStreamState;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private closing = false;
  private tokenCache: { bullet: KuCoinPrivateBullet; expiresAt: number } | null = null;
  private stateHandlers = new Set<(state: PrivateOrderStreamState) => void>();
  private connectPromise: Promise<void> | null = null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly websocketFactory: PrivateWebSocketFactory;
  private readonly enabled: boolean;

  constructor(private readonly options: KuCoinPrivateOrderStreamOptions) {
    this.enabled = options.enabled !== false;
    this.stateValue = this.enabled ? 'DISCONNECTED' : 'DISABLED';
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.websocketFactory = options.websocketFactory ?? defaultWebSocketFactory;
  }

  get state(): PrivateOrderStreamState { return this.stateValue; }

  onStateChange(handler: (state: PrivateOrderStreamState) => void): () => void {
    this.stateHandlers.add(handler);
    handler(this.stateValue);
    return () => this.stateHandlers.delete(handler);
  }

  start(): void {
    if (!this.enabled || this.closing || this.stateValue === 'CONNECTED') return;
    void this.ensureConnected();
  }

  close(): void {
    this.closing = true;
    this.clearTimers();
    try { this.socket?.close(); } catch { /* no-op */ }
    this.socket = null;
    this.connectPromise = null;
    this.setState('CLOSED');
  }

  private setState(state: PrivateOrderStreamState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    for (const handler of this.stateHandlers) {
      try { handler(state); } catch { /* diagnostics cannot break the transport */ }
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.silenceTimer = null;
    this.tokenRefreshTimer = null;
  }

  private async bullet(): Promise<KuCoinPrivateBullet> {
    if (this.tokenCache && this.now() < this.tokenCache.expiresAt) return this.tokenCache.bullet;
    const bullet = unwrapBullet(await this.options.fetchBullet());
    // Classic WebSocket tokens are time-limited. Refresh well before the documented 24h lifetime.
    this.tokenCache = { bullet, expiresAt: this.now() + 20 * 60 * 60 * 1000 };
    return bullet;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.enabled || this.closing) return;
    if (this.connectPromise) return this.connectPromise;
    this.setState(this.retryCount ? 'RECONNECTING' : 'CONNECTING');
    this.connectPromise = this.connect().catch(() => {
      if (!this.closing) {
        this.setState('DEGRADED');
        this.scheduleReconnect();
      }
    }).finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  private async connect(): Promise<void> {
    const bullet = await this.bullet();
    const server = bullet.instanceServers?.find((row) => typeof row.endpoint === 'string' && row.endpoint.startsWith('wss://'));
    if (!server?.endpoint || !bullet.token) throw new Error('private_ws_server_missing');
    const connectId = `apex-private-${this.now()}-${Math.floor(this.random() * 1e9)}`;
    const url = `${server.endpoint}${server.endpoint.includes('?') ? '&' : '?'}token=${encodeURIComponent(bullet.token)}&connectId=${encodeURIComponent(connectId)}`;
    const socket = this.websocketFactory(url);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
      socket.onopen = () => {
        if (this.closing) { try { socket.close(); } catch { /* no-op */ } return; }
        this.retryCount = 0;
        this.setState('CONNECTED');
        this.send({
          id: String(this.now()),
          type: 'subscribe',
          topic: '/contractMarket/tradeOrders',
          response: true,
          privateChannel: true,
        });
        this.startHeartbeat(server.pingInterval, server.pingTimeout);
        this.scheduleTokenRefresh();
        if (!settled) { settled = true; resolve(); }
      };
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onerror = () => {
        if (!settled) {
          fail(new Error('private_ws_socket_error'));
          return;
        }
        if (this.closing) return;
        this.setState('DEGRADED');
        try { socket.close(); } catch { /* close/reconcile below remains authoritative */ }
      };
      socket.onclose = () => {
        this.clearTimers();
        this.socket = null;
        if (this.closing) return;
        this.setState('DEGRADED');
        void Promise.resolve(this.options.onReconnectNeeded?.()).finally(() => this.scheduleReconnect());
      };
    });
  }


  private scheduleTokenRefresh(): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    if (!this.tokenCache || this.closing) return;
    const delay = Math.max(1_000, this.tokenCache.expiresAt - this.now());
    this.tokenRefreshTimer = setTimeout(() => {
      this.tokenRefreshTimer = null;
      if (this.closing) return;
      this.tokenCache = null;
      this.setState('RECONNECTING');
      // Deliberately reconnect before token expiry; onclose invokes REST reconciliation
      // before resubscription, so missed/ambiguous state never becomes authoritative.
      try { this.socket?.close(); } catch { this.scheduleReconnect(); }
    }, delay);
    timerUnref(this.tokenRefreshTimer);
  }

  private startHeartbeat(pingIntervalRaw?: number, pingTimeoutRaw?: number): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const pingInterval = Number.isFinite(Number(pingIntervalRaw)) ? Math.max(1_000, Number(pingIntervalRaw) - 1_000) : 18_000;
    const pingTimeout = Number.isFinite(Number(pingTimeoutRaw)) ? Math.max(2_000, Number(pingTimeoutRaw)) : 10_000;
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState !== 1) return;
      this.send({ id: String(this.now()), type: 'ping' });
      // Keep one outstanding heartbeat deadline. Re-arming the timeout on every
      // outbound ping would postpone silence detection forever whenever the ping
      // interval is shorter than pingTimeout. Only inbound traffic clears the
      // deadline in handleMessage(), after which the next ping arms a new one.
      if (!this.silenceTimer) this.armSilenceTimeout(pingTimeout);
    }, pingInterval);
    timerUnref(this.pingTimer);
  }

  private armSilenceTimeout(timeoutMs: number): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this.closing) return;
      this.setState('DEGRADED');
      try { this.socket?.close(); } catch { /* no-op */ }
    }, timeoutMs);
    timerUnref(this.silenceTimer);
  }

  private scheduleReconnect(): void {
    if (this.closing || this.reconnectTimer) return;
    const delay = Math.min(30_000, 500 * (2 ** Math.min(this.retryCount, 6))) + Math.floor(this.random() * 250);
    this.retryCount += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected();
    }, delay);
    timerUnref(this.reconnectTimer);
  }

  private send(value: unknown): void {
    if (this.socket?.readyState !== 1) return;
    this.socket.send(JSON.stringify(value));
  }

  private handleMessage(raw: unknown): void {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { return; }
    }
    const row = asRecord(parsed);
    if (!row) return;
    if (row.type === 'pong' || row.type === 'ack' || row.type === 'welcome') return;
    if (row.type !== 'message') return;
    const data = asRecord(row.data);
    const topic = typeof row.topic === 'string' ? row.topic : '';
    if (!data || !topic.startsWith('/contractMarket/tradeOrders')) return;
    const event: KuCoinPrivateOrderEvent = {
      topic,
      subject: typeof row.subject === 'string' ? row.subject : null,
      receivedAt: this.now(),
      data,
    };
    void Promise.resolve(this.options.onEvent(event)).catch(() => {
      this.setState('DEGRADED');
      void Promise.resolve(this.options.onReconnectNeeded?.());
    });
  }
}
