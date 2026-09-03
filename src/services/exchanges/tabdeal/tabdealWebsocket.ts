export const TABDEAL_FAPI_DEPTH_WS_URL = 'wss://api1.tabdeal.org/special_margin/stream/';
export const TABDEAL_FAPI_BROADCAST_WS_URL = 'wss://api1.tabdeal.org/special_margin/broadcast/';

export type TabdealWebsocketState = 'IDLE' | 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED';

export interface TabdealWebsocketLike {
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data?: unknown } | unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface TabdealPublicWebsocketOptions {
  factory?: (url: string) => TabdealWebsocketLike;
  onMessage: (payload: unknown) => void;
  onStateChange?: (state: TabdealWebsocketState) => void;
  url?: string;
  subscriptionPayload?: string;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

function defaultFactory(url: string): TabdealWebsocketLike {
  const WS = (globalThis as unknown as { WebSocket?: new (url: string) => TabdealWebsocketLike }).WebSocket;
  if (!WS) throw new Error('tabdeal_websocket_unavailable');
  return new WS(url);
}

/** Public-data only. This class has no execution API by design. */
export class TabdealPublicWebsocket {
  private socket: TabdealWebsocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private callerClosed = false;
  private readonly options: Required<Pick<TabdealPublicWebsocketOptions, 'baseBackoffMs' | 'maxBackoffMs' | 'url'>> & TabdealPublicWebsocketOptions;
  state: TabdealWebsocketState = 'IDLE';

  constructor(options: TabdealPublicWebsocketOptions) {
    this.options = {
      ...options,
      url: options.url ?? TABDEAL_FAPI_DEPTH_WS_URL,
      baseBackoffMs: options.baseBackoffMs ?? 500,
      maxBackoffMs: options.maxBackoffMs ?? 15_000,
    };
  }

  private setState(state: TabdealWebsocketState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }

  connect(): void {
    this.callerClosed = false;
    this.openSocket(this.reconnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING');
  }

  private openSocket(state: 'CONNECTING' | 'RECONNECTING'): void {
    if (this.callerClosed) return;
    this.setState(state);
    const socket = (this.options.factory ?? defaultFactory)(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('OPEN');
      if (this.options.subscriptionPayload) socket.send(this.options.subscriptionPayload);
    };
    socket.onmessage = (event: unknown) => {
      const data = event && typeof event === 'object' && 'data' in (event as Record<string, unknown>) ? (event as { data?: unknown }).data : event;
      if (typeof data === 'string') {
        try { this.options.onMessage(JSON.parse(data)); } catch { this.options.onMessage(data); }
      } else this.options.onMessage(data);
    };
    socket.onerror = () => {
      // onclose owns retry. Never mutate execution state from a public feed error.
    };
    socket.onclose = () => {
      if (this.callerClosed) { this.setState('CLOSED'); return; }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.callerClosed || this.reconnectTimer) return;
    this.setState('RECONNECTING');
    const delay = Math.min(this.options.maxBackoffMs, this.options.baseBackoffMs * 2 ** Math.min(8, this.reconnectAttempt++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket('RECONNECTING');
    }, delay);
    this.reconnectTimer.unref?.();
  }

  disconnect(): void {
    this.callerClosed = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const socket = this.socket;
    this.socket = null;
    this.setState('CLOSED');
    try { socket?.close(); } catch { /* ignore during shutdown */ }
  }
}

export function toTabdealUnderscoreSymbol(symbol: string): string {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const quotes = ['USDT', 'IRT', 'USDC', 'BTC', 'ETH'];
  const quote = quotes.find((q) => normalized.endsWith(q) && normalized.length > q.length);
  return quote ? `${normalized.slice(0, -quote.length)}_${quote}` : symbol.toUpperCase();
}

export function buildTabdealDepthSubscription(symbols: string[], period: '100ms' | '200ms' | '1000ms' | '5000ms' = '1000ms', id = 1): string {
  return JSON.stringify({
    method: 'SUBSCRIBE',
    params: symbols.slice(0, 50).map((s) => `special_margin@${toTabdealUnderscoreSymbol(s)}@depth@${period}`),
    id,
  });
}
