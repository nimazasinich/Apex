/**
 * Client-side majors price feed seam.
 * Calls same-origin /api/market/majors — swap-ready if the server cascade changes.
 */

import { DataState, SymbolTicker } from '../types';

export const MAJOR_SYMBOLS = [
  'BTC-USDT',
  'ETH-USDT',
  'SOL-USDT',
  'BNB-USDT',
  'XRP-USDT',
  'DOGE-USDT',
] as const;

export interface MajorsPriceFeedResult {
  tickers: SymbolTicker[];
  dataState: DataState;
  timestamp: number;
}

/** Placeholder majors when API has not returned yet — never labeled live. */
export function placeholderMajors(): SymbolTicker[] {
  const now = Date.now();
  return MAJOR_SYMBOLS.map((symbol) => ({
    symbol,
    lastPrice: 0,
    turnover24h: 0,
    priceChange24hPct: 0,
    volume24h: 0,
    high24h: 0,
    low24h: 0,
    fundingRate: 0,
    openInterest: 0,
    dataState: 'not_configured' as DataState,
    timestamp: now,
  }));
}

export async function fetchMajorPrices(): Promise<MajorsPriceFeedResult> {
  try {
    const res = await fetch('/api/market/majors');
    if (!res.ok) {
      return {
        tickers: placeholderMajors(),
        dataState: 'unavailable',
        timestamp: Date.now(),
      };
    }
    const data = await res.json();
    return {
      tickers: Array.isArray(data.symbols) ? data.symbols : placeholderMajors(),
      dataState: (data.dataState as DataState) || 'degraded',
      timestamp: data.timestamp || Date.now(),
    };
  } catch {
    return {
      tickers: placeholderMajors(),
      dataState: 'unavailable',
      timestamp: Date.now(),
    };
  }
}
