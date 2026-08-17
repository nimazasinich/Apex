export type PublicFeedConnectionState =
  | 'DISABLED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'RECONNECTING'
  | 'STOPPED';

export interface PublicFeedSnapshot {
  source: string;
  state: PublicFeedConnectionState;
  symbols: string[];
  connectedAt: number | null;
  lastMessageAt: number | null;
  lastError: string | null;
  reconnects: number;
  publishedEvents: number;
  rejectedEvents: number;
}

export interface WebSocketEventLike { data?: unknown }

export interface WebSocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: WebSocketEventLike) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export function defaultWebSocketFactory(url: string): WebSocketLike {
  if (typeof WebSocket === 'undefined') throw new Error('websocket_not_available');
  return new WebSocket(url) as unknown as WebSocketLike;
}

export function decodeWebSocketData(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return null;
}

export function normalizeCanonicalSymbols(values: readonly string[]): string[] {
  const symbols = values
    .map((value) => String(value || '').trim().toUpperCase())
    .map((value) => value.replace(/[^A-Z0-9_-]/g, ''))
    .filter((value) => /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(value));
  return [...new Set(symbols)].slice(0, 20);
}

export function toExchangeSymbol(canonical: string): string {
  return canonical.replace(/[-_]/g, '');
}

export function toCanonicalSymbol(exchangeSymbol: string): string {
  const normalized = exchangeSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.endsWith('USDT') && normalized.length > 4) return `${normalized.slice(0, -4)}-USDT`;
  if (normalized.endsWith('USDC') && normalized.length > 4) return `${normalized.slice(0, -4)}-USDC`;
  return normalized;
}
