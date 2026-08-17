import {
  binanceFunding,
  binanceFundingHistory,
  binanceOpenInterest,
  binanceOpenInterestHistory,
  kucoinFundingHistory,
  kucoinOpenInterestHistory,
  type ExchangeResult,
} from '../providers/publicExchangeClient';
import type { InProcessEventBus } from '../realtime/inProcessEventBus';
import type { RealtimeSeriesStore } from '../realtime/realtimeSeriesStore';
import type { SmartFetchPriority } from '../proxyFetch';
import {
  BINANCE_FUNDING_OI_BOOTSTRAP_SOURCE,
  KUCOIN_FUNDING_OI_BOOTSTRAP_SOURCE,
  publishFundingOiBootstrap,
  type FundingOiBootstrapResult,
  type FundingOiRawSnapshot,
} from './restContextBootstrapCore';

export type { FundingOiBootstrapResult } from './restContextBootstrapCore';

export interface FundingOiContextBootstrapResult {
  source: 'multi-futures-rest-context';
  fundingEvents: number;
  openInterestEvents: number;
  available: boolean;
  primaryPairAvailable: boolean;
  reasons: string[];
  sources: FundingOiBootstrapResult[];
}

export interface FundingOiBootstrapFetchers {
  fundingHistory?: typeof binanceFundingHistory;
  fundingCurrent?: typeof binanceFunding;
  openInterestHistory?: typeof binanceOpenInterestHistory;
  openInterestCurrent?: typeof binanceOpenInterest;
  kucoinFundingHistory?: typeof kucoinFundingHistory;
  kucoinOpenInterestHistory?: typeof kucoinOpenInterestHistory;
}

function objectRows(result: ExchangeResult | null): Array<Record<string, unknown>> {
  if (!result?.ok || !Array.isArray(result.data)) return [];
  return result.data.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
}

function objectValue(result: ExchangeResult | null): Record<string, unknown> | null {
  if (!result?.ok || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return null;
  return result.data as Record<string, unknown>;
}

function reasonFor(result: PromiseSettledResult<ExchangeResult>, label: string, reasons: string[]): ExchangeResult | null {
  if (result.status === 'rejected') {
    reasons.push(`${label}:${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    return null;
  }
  if (!result.value.ok) reasons.push(`${label}:${result.value.reason}`);
  return result.value;
}

/**
 * Fetches public Binance USD-M + KuCoin USDT-M funding/open-interest context in
 * parallel and publishes each venue under an independent source identity.
 * The aggregate is shadow-only research context; it cannot authorize trading.
 */
export async function bootstrapFundingOiContext(input: {
  symbol: string;
  eventBus: InProcessEventBus;
  seriesStore: RealtimeSeriesStore;
  now?: number;
  priority?: SmartFetchPriority;
  fetchers?: FundingOiBootstrapFetchers;
}): Promise<FundingOiContextBootstrapResult> {
  const symbol = input.symbol.trim().toUpperCase();
  const fetchers = {
    fundingHistory: input.fetchers?.fundingHistory ?? binanceFundingHistory,
    fundingCurrent: input.fetchers?.fundingCurrent ?? binanceFunding,
    openInterestHistory: input.fetchers?.openInterestHistory ?? binanceOpenInterestHistory,
    openInterestCurrent: input.fetchers?.openInterestCurrent ?? binanceOpenInterest,
    kucoinFundingHistory: input.fetchers?.kucoinFundingHistory ?? kucoinFundingHistory,
    kucoinOpenInterestHistory: input.fetchers?.kucoinOpenInterestHistory ?? kucoinOpenInterestHistory,
  };

  const priority = input.priority ?? 'interactive';
  const settled = await Promise.allSettled([
    fetchers.fundingHistory(symbol, 48, priority),
    fetchers.fundingCurrent(symbol),
    fetchers.openInterestHistory(symbol, '5m', 8, priority),
    fetchers.openInterestCurrent(symbol, priority),
    fetchers.kucoinFundingHistory(symbol, 48, priority),
    fetchers.kucoinOpenInterestHistory(symbol, '5min', 8, priority),
  ]);

  const binanceReasons: string[] = [];
  const kucoinReasons: string[] = [];
  const binanceFundingHistoryResult = reasonFor(settled[0], 'binance_funding_history', binanceReasons);
  const binanceFundingCurrentResult = reasonFor(settled[1], 'binance_funding_current', binanceReasons);
  const binanceOiHistoryResult = reasonFor(settled[2], 'binance_oi_history', binanceReasons);
  const binanceOiCurrentResult = reasonFor(settled[3], 'binance_oi_current', binanceReasons);
  const kucoinFundingHistoryResult = reasonFor(settled[4], 'kucoin_funding_history', kucoinReasons);
  const kucoinOiHistoryResult = reasonFor(settled[5], 'kucoin_oi_history', kucoinReasons);

  const binanceRaw: FundingOiRawSnapshot = {
    fundingHistory: objectRows(binanceFundingHistoryResult),
    currentFunding: objectValue(binanceFundingCurrentResult),
    openInterestHistory: objectRows(binanceOiHistoryResult),
    currentOpenInterest: objectValue(binanceOiCurrentResult),
    reasons: binanceReasons,
  };

  // KuCoin UTA history uses { fundingRate, ts } and { openInterest, ts }.
  // The core publisher accepts these normalized aliases directly. Do not mix
  // KuCoin's projected nextFundingRate into the settled historical series.
  const kucoinOiRows = objectRows(kucoinOiHistoryResult);
  const kucoinRaw: FundingOiRawSnapshot = {
    fundingHistory: objectRows(kucoinFundingHistoryResult),
    currentFunding: null,
    openInterestHistory: kucoinOiRows,
    currentOpenInterest: kucoinOiRows.at(-1) ?? null,
    reasons: kucoinReasons,
  };

  const [binance, kucoin] = await Promise.all([
    publishFundingOiBootstrap({
      symbol,
      eventBus: input.eventBus,
      seriesStore: input.seriesStore,
      raw: binanceRaw,
      now: input.now,
      source: BINANCE_FUNDING_OI_BOOTSTRAP_SOURCE,
    }),
    publishFundingOiBootstrap({
      symbol,
      eventBus: input.eventBus,
      seriesStore: input.seriesStore,
      raw: kucoinRaw,
      now: input.now,
      source: KUCOIN_FUNDING_OI_BOOTSTRAP_SOURCE,
    }),
  ]);

  const sources = [binance, kucoin];
  const reasons = sources.flatMap((row) => row.reasons.map((reason) => `${row.source}:${reason}`));
  const primaryPairAvailable = binance.available && kucoin.available;
  const available = binance.available || kucoin.available;
  if (!available && reasons.length === 0) reasons.push('no_public_futures_funding_oi_source_available');

  return {
    source: 'multi-futures-rest-context',
    fundingEvents: binance.fundingEvents + kucoin.fundingEvents,
    openInterestEvents: binance.openInterestEvents + kucoin.openInterestEvents,
    available,
    primaryPairAvailable,
    reasons,
    sources,
  };
}
