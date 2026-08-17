import crypto from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { InProcessEventBus } from '../realtime/inProcessEventBus';
import type { RealtimeSeriesStore } from '../realtime/realtimeSeriesStore';

export const BINANCE_FUNDING_OI_BOOTSTRAP_SOURCE = 'binance-usdm-rest-context' as const;
export const KUCOIN_FUNDING_OI_BOOTSTRAP_SOURCE = 'kucoin-futures-rest-context' as const;
/** Backward-compatible alias used by older QA and integrations. */
export const FUNDING_OI_BOOTSTRAP_SOURCE = BINANCE_FUNDING_OI_BOOTSTRAP_SOURCE;

export type FundingOiBootstrapSource =
  | typeof BINANCE_FUNDING_OI_BOOTSTRAP_SOURCE
  | typeof KUCOIN_FUNDING_OI_BOOTSTRAP_SOURCE;

export interface FundingOiBootstrapResult {
  source: FundingOiBootstrapSource;
  fundingEvents: number;
  openInterestEvents: number;
  available: boolean;
  reasons: string[];
}

export interface FundingOiRawSnapshot {
  fundingHistory: Array<Record<string, unknown>>;
  currentFunding: Record<string, unknown> | null;
  openInterestHistory: Array<Record<string, unknown>>;
  currentOpenInterest: Record<string, unknown> | null;
  reasons?: string[];
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function id(parts: Array<string | number>): string {
  return `lh-${crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 28)}`;
}

function fundingEvent(
  source: FundingOiBootstrapSource,
  symbol: string,
  rate: number,
  timestamp: number,
  receivedAt: number,
  historical: boolean,
): MarketEvent {
  return {
    eventId: id([source, symbol, 'funding', timestamp, rate]),
    type: 'FUNDING',
    source,
    symbol,
    exchangeTimestamp: timestamp,
    receivedAt,
    schemaVersion: 1,
    ingestionKind: historical ? 'HISTORICAL_BOOTSTRAP' : 'LIVE',
    payload: { rate },
  };
}

function openInterestEvent(
  source: FundingOiBootstrapSource,
  symbol: string,
  openInterest: number,
  timestamp: number,
  receivedAt: number,
  historical: boolean,
): MarketEvent {
  return {
    eventId: id([source, symbol, 'oi', timestamp, openInterest]),
    type: 'OPEN_INTEREST',
    source,
    symbol,
    exchangeTimestamp: timestamp,
    receivedAt,
    schemaVersion: 1,
    ingestionKind: historical ? 'HISTORICAL_BOOTSTRAP' : 'LIVE',
    payload: { openInterest },
  };
}

/**
 * Pure normalized-public-context publisher. It never talks to exchanges and is
 * separately testable from the network wrapper. The source is explicit so
 * Binance USD-M and KuCoin USDT-M histories remain independent series instead
 * of being merged into one artificial funding/OI timeline.
 */
export async function publishFundingOiBootstrap(input: {
  symbol: string;
  eventBus: InProcessEventBus;
  seriesStore: RealtimeSeriesStore;
  raw: FundingOiRawSnapshot;
  now?: number;
  source?: FundingOiBootstrapSource;
}): Promise<FundingOiBootstrapResult> {
  const symbol = input.symbol.trim().toUpperCase();
  const source = input.source ?? FUNDING_OI_BOOTSTRAP_SOURCE;
  const now = input.now ?? Date.now();
  const reasons = [...(input.raw.reasons ?? [])];

  const fundingEvents: MarketEvent[] = [];
  for (const row of input.raw.fundingHistory) {
    const rate = numberValue(row.fundingRate ?? row.rate);
    const timestamp = numberValue(row.fundingTime ?? row.ts ?? row.timestamp ?? row.time);
    if (rate === null || timestamp === null || timestamp < 0) continue;
    fundingEvents.push(fundingEvent(source, symbol, rate, timestamp, now, true));
  }
  if (input.raw.currentFunding) {
    const rate = numberValue(
      input.raw.currentFunding.lastFundingRate
      ?? input.raw.currentFunding.fundingRate
      ?? input.raw.currentFunding.rate,
    );
    const timestamp = numberValue(
      input.raw.currentFunding.time
      ?? input.raw.currentFunding.ts
      ?? input.raw.currentFunding.timestamp,
    ) ?? now;
    if (rate !== null && timestamp >= 0) fundingEvents.push(fundingEvent(source, symbol, rate, timestamp, now, false));
  }

  const oiEvents: MarketEvent[] = [];
  for (const row of input.raw.openInterestHistory) {
    const openInterest = numberValue(row.sumOpenInterest ?? row.openInterest ?? row.oi ?? row.value);
    const timestamp = numberValue(row.timestamp ?? row.ts ?? row.time);
    if (openInterest === null || openInterest <= 0 || timestamp === null || timestamp < 0) continue;
    oiEvents.push(openInterestEvent(source, symbol, openInterest, timestamp, now, true));
  }
  if (input.raw.currentOpenInterest) {
    const openInterest = numberValue(
      input.raw.currentOpenInterest.openInterest
      ?? input.raw.currentOpenInterest.sumOpenInterest
      ?? input.raw.currentOpenInterest.oi
      ?? input.raw.currentOpenInterest.value,
    );
    const timestamp = numberValue(
      input.raw.currentOpenInterest.time
      ?? input.raw.currentOpenInterest.ts
      ?? input.raw.currentOpenInterest.timestamp,
    ) ?? now;
    if (openInterest !== null && openInterest > 0 && timestamp >= 0) oiEvents.push(openInterestEvent(source, symbol, openInterest, timestamp, now, false));
  }

  fundingEvents.sort((a, b) => a.exchangeTimestamp - b.exchangeTimestamp);
  oiEvents.sort((a, b) => a.exchangeTimestamp - b.exchangeTimestamp);

  input.seriesStore.invalidateSeries({ source, symbol, type: 'FUNDING' });
  input.seriesStore.invalidateSeries({ source, symbol, type: 'OPEN_INTEREST' });

  for (const event of [...fundingEvents, ...oiEvents]) await input.eventBus.publish(event);

  const available = fundingEvents.length >= 12 && oiEvents.length >= 2;
  if (!available && reasons.length === 0) reasons.push('insufficient_public_funding_or_open_interest_history');
  return {
    source,
    fundingEvents: fundingEvents.length,
    openInterestEvents: oiEvents.length,
    available,
    reasons,
  };
}
