/**
 * Adapter around deriveSmartMoneyContext with explicit availability states.
 * Never substitutes missing SMC with apparently valid neutral evidence.
 */
import type { Candle, SmcAvailabilityState, SmartMoneyContext } from '../types';
import { deriveSmartMoneyContext, type SmartMoneyInput } from './smartMoneyContextEngine';

const MIN_1M_BARS = 20;
const MIN_5M_BARS = 16;
const MIN_15M_BARS = 12;
const DEFAULT_MAX_AGE_MS = 20 * 60 * 1000;

export interface SmcAdapterInput {
  candles1m?: Candle[];
  candles5m?: Candle[];
  candles15m?: Candle[];
  candles4h?: Candle[];
  direction?: 'SHORT' | 'LONG';
  maxAgeMs?: number;
  now?: number;
}

export interface SmcAdapterResult {
  context: SmartMoneyContext | null;
  availability: SmcAvailabilityState;
  reasons: string[];
}

function toCandlestick(c: Candle) {
  return {
    time: new Date(c.timestamp).toISOString(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

function isStale(candles: Candle[] | undefined, maxAgeMs: number, now: number): boolean {
  if (!candles?.length) return true;
  const lastTs = candles[candles.length - 1]?.timestamp ?? 0;
  return now - lastTs > maxAgeMs;
}

function hasHistory(candles: Candle[] | undefined, minBars: number): boolean {
  return Boolean(candles && candles.length >= minBars);
}

export function adaptSmartMoneyContext(input: SmcAdapterInput): SmcAdapterResult {
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const reasons: string[] = [];

  const c1 = input.candles1m ?? [];
  const c5 = input.candles5m ?? [];
  const c15 = input.candles15m ?? [];
  const c4h = input.candles4h ?? [];

  const has1m = hasHistory(c1, MIN_1M_BARS);
  const has5m = hasHistory(c5, MIN_5M_BARS);
  const has15m = hasHistory(c15, MIN_15M_BARS);
  const hasFast = has1m || has5m;
  const hasMid = has5m || has15m;

  if (!hasFast && !hasMid) {
    return {
      context: null,
      availability: 'INSUFFICIENT_HISTORY',
      reasons: ['SMC requires at least 1m/5m candle history; insufficient bars available.'],
    };
  }

  const staleSeries = [
    has1m && isStale(c1, maxAgeMs, now) ? '1m' : null,
    has5m && isStale(c5, maxAgeMs, now) ? '5m' : null,
    has15m && isStale(c15, maxAgeMs, now) ? '15m' : null,
  ].filter(Boolean) as string[];

  if (staleSeries.length > 0 && staleSeries.length === [has1m, has5m, has15m].filter(Boolean).length) {
    return {
      context: null,
      availability: 'STALE',
      reasons: [`SMC candle series stale: ${staleSeries.join(', ')}.`],
    };
  }

  if (staleSeries.length > 0) {
    reasons.push(`Partial stale SMC inputs ignored: ${staleSeries.join(', ')}.`);
  }

  const smcInput: SmartMoneyInput = {
    candles1m: has1m ? c1.map(toCandlestick) : undefined,
    candles5m: has5m ? c5.map(toCandlestick) : undefined,
    candles15m: has15m ? c15.map(toCandlestick) : undefined,
    candles4h: c4h.length >= 8 ? c4h.map(toCandlestick) : undefined,
    direction: input.direction,
  };

  try {
    const context = deriveSmartMoneyContext(smcInput);
    return {
      context,
      availability: 'AVAILABLE',
      reasons: reasons.length ? reasons : ['SMC derived from available candle sets.'],
    };
  } catch (err) {
    return {
      context: null,
      availability: 'UNAVAILABLE',
      reasons: [`SMC derivation failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
