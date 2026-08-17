/**
 * Public provider capability truth shared by server routing and browser status UI.
 *
 * This module is deliberately dependency-neutral: no process.env, network or Node
 * globals. Browser code may import it safely, while providerRouter remains the
 * server-side routing implementation.
 */
export type PublicProviderId = 'binance' | 'kucoin' | 'bybit' | 'bitget' | 'okx';
export type ProviderTransport = 'REST' | 'WEBSOCKET' | 'REST+WEBSOCKET' | 'NONE';

export interface PublicProviderCapability {
  registered: boolean;
  transport: ProviderTransport;
  categories: readonly string[];
  role: 'PRIMARY' | 'SECONDARY' | 'REALTIME_EVIDENCE' | 'PLANNED';
}

export const PROVIDER_CAPABILITIES: Readonly<Record<PublicProviderId, PublicProviderCapability>> = {
  binance: { registered: true, transport: 'REST+WEBSOCKET', categories: ['ticker', 'orderbook', 'candles', 'trades', 'funding', 'openInterest', 'instruments', 'longShortRatio', 'takerBuySellRatio'], role: 'PRIMARY' },
  kucoin: { registered: true, transport: 'REST+WEBSOCKET', categories: ['ticker', 'orderbook', 'candles', 'trades', 'funding', 'openInterest', 'instruments'], role: 'PRIMARY' },
  bybit: { registered: true, transport: 'WEBSOCKET', categories: ['trades', 'orderbook'], role: 'REALTIME_EVIDENCE' },
  bitget: { registered: false, transport: 'NONE', categories: [], role: 'PLANNED' },
  okx: { registered: false, transport: 'NONE', categories: [], role: 'PLANNED' },
} as const;

/** Only executable REST-backed provider/category pairs may appear here. */
export const PROVIDER_PRIORITY = {
  ticker: ['binance', 'kucoin'],
  orderbook: ['binance', 'kucoin'],
  candles: ['binance', 'kucoin'],
  trades: ['binance', 'kucoin'],
  funding: ['binance', 'kucoin'],
  openInterest: ['binance', 'kucoin'],
  instruments: ['binance', 'kucoin'],
  longShortRatio: ['binance'],
  takerBuySellRatio: ['binance'],
} as const;

export type DataCategory = keyof typeof PROVIDER_PRIORITY;
