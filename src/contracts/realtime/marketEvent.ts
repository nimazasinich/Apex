import { containsNonFiniteNumber } from './evidenceValue';

export const MARKET_EVENT_TYPES = [
  'TRADE',
  'QUOTE',
  'ORDERBOOK_SNAPSHOT',
  'ORDERBOOK_DELTA',
  'LIQUIDATION',
  'FUNDING',
  'OPEN_INTEREST',
  'OPTION_TRADE',
  'WALLET_POSITION',
  'SENTIMENT_EVENT',
] as const;

export type MarketEventType = (typeof MARKET_EVENT_TYPES)[number];
export type MarketEventIngestionKind = 'LIVE' | 'HISTORICAL_BOOTSTRAP' | 'REPLAY';

export interface MarketEvent<TPayload = unknown> {
  eventId: string;
  type: MarketEventType;
  source: string;
  symbol: string;
  exchangeTimestamp: number;
  receivedAt: number;
  sequence?: number;
  sequenceStart?: number;
  previousSequence?: number;
  schemaVersion: number;
  ingestionKind?: MarketEventIngestionKind;
  payload: TPayload;
}

export interface MarketEventValidation {
  ok: boolean;
  reasons: string[];
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export function isMarketEventType(value: unknown): value is MarketEventType {
  return typeof value === 'string' && (MARKET_EVENT_TYPES as readonly string[]).includes(value);
}

export function validateMarketEvent(event: MarketEvent): MarketEventValidation {
  const reasons: string[] = [];
  if (!IDENTIFIER_PATTERN.test(event.eventId)) reasons.push('invalid_event_id');
  if (!isMarketEventType(event.type)) reasons.push('invalid_event_type');
  if (!IDENTIFIER_PATTERN.test(event.source)) reasons.push('invalid_source');
  if (!SYMBOL_PATTERN.test(event.symbol)) reasons.push('invalid_symbol');
  if (!Number.isFinite(event.exchangeTimestamp) || event.exchangeTimestamp < 0) reasons.push('invalid_exchange_timestamp');
  if (!Number.isFinite(event.receivedAt) || event.receivedAt < 0) {
    reasons.push('invalid_received_at');
  } else if (Number.isFinite(event.exchangeTimestamp) && event.exchangeTimestamp > event.receivedAt + 5_000) {
    reasons.push('exchange_timestamp_too_far_in_future');
  } else if ((event.ingestionKind ?? 'LIVE') === 'LIVE' && Number.isFinite(event.exchangeTimestamp) && event.receivedAt - event.exchangeTimestamp > 24 * 60 * 60 * 1_000) {
    reasons.push('exchange_timestamp_too_old');
  }
  if (event.ingestionKind !== undefined && !['LIVE', 'HISTORICAL_BOOTSTRAP', 'REPLAY'].includes(event.ingestionKind)) reasons.push('invalid_ingestion_kind');
  if (event.sequence !== undefined && (!Number.isSafeInteger(event.sequence) || event.sequence < 0)) {
    reasons.push('invalid_sequence');
  }
  if (event.sequenceStart !== undefined && (!Number.isSafeInteger(event.sequenceStart) || event.sequenceStart < 0)) {
    reasons.push('invalid_sequence_start');
  }
  if (event.previousSequence !== undefined && (!Number.isSafeInteger(event.previousSequence) || event.previousSequence < 0)) {
    reasons.push('invalid_previous_sequence');
  }
  if (event.sequenceStart !== undefined && event.sequence === undefined) reasons.push('sequence_end_required_for_range');
  if (event.sequenceStart !== undefined && event.sequence !== undefined && event.sequenceStart > event.sequence) reasons.push('sequence_range_invalid');
  if (!Number.isSafeInteger(event.schemaVersion) || event.schemaVersion < 1 || event.schemaVersion > 1_000) {
    reasons.push('invalid_schema_version');
  }
  if (containsNonFiniteNumber(event.payload)) reasons.push('non_finite_payload');
  return { ok: reasons.length === 0, reasons };
}

export function assertValidMarketEvent(event: MarketEvent): void {
  const validation = validateMarketEvent(event);
  if (!validation.ok) throw new Error(`invalid_market_event:${validation.reasons.join(',')}`);
}
