import type { MarketEvent } from '../../../contracts/realtime/marketEvent';
import { buildEdgeEvidence, clamp01, pickNumber, type LiquidityHunterEdgeContext } from '../edgeRuntime';

const PRIMARY_FUTURES_SOURCES = new Set(['binance-usdm-ws', 'kucoin-futures-ws']);

interface ClassifiedTrade {
  event: MarketEvent;
  price: number;
  size: number;
  sign: 1 | -1;
}

function classify(event: MarketEvent): ClassifiedTrade | null {
  if (!event.payload || typeof event.payload !== 'object') return null;
  const row = event.payload as Record<string, unknown>;
  const price = pickNumber(row, ['price']);
  const size = pickNumber(row, ['size', 'quantity', 'qty', 'volume']);
  if (!price || price <= 0 || !size || size <= 0) return null;
  const explicit = String(row.aggressorSide ?? row.side ?? '').toUpperCase();
  let sign: 1 | -1 | null = explicit === 'BUY' ? 1 : explicit === 'SELL' ? -1 : null;
  if (sign === null && typeof row.isBuyerMaker === 'boolean') sign = row.isBuyerMaker ? -1 : 1;
  if (sign === null) return null;
  return { event, price, size, sign };
}

export function evaluateMultiExchangeCvdEdge(context: LiquidityHunterEdgeContext) {
  const since = context.now - 60_000;
  const events = context.seriesStore.query({ symbol: context.symbol, type: 'TRADE', since, limit: 20_000 });
  const available = events.map(classify).filter((row): row is ClassifiedTrade => Boolean(row));
  const availableSources = new Set(available.map((row) => row.event.source));
  const primaryPairActive = [...PRIMARY_FUTURES_SOURCES].every((source) => availableSources.has(source));
  // Binance USD-M + KuCoin USDT-M are the canonical two-source Futures pair.
  // When both are present, keep the CVD calculation isolated to that pair so a
  // tertiary venue cannot distort the primary signal. If either is unavailable,
  // preserve the existing >=2-source fallback behavior rather than fabricating data.
  const classified = primaryPairActive
    ? available.filter((row) => PRIMARY_FUTURES_SOURCES.has(row.event.source))
    : available;
  const sources = new Set(classified.map((row) => row.event.source));
  if (classified.length < 20 || sources.size < 2) {
    return buildEdgeEvidence({
      edgeId: 'MULTI_EXCHANGE_CVD',
      status: events.length ? 'UNKNOWN' : 'NOT_CONFIGURED',
      dataQuality: clamp01(Math.min(classified.length / 20, 1) * Math.min(sources.size / 2, 1)),
      observedAt: classified.at(-1)?.event.exchangeTimestamp ?? context.now,
      expiresAt: context.now,
      conflictingReasons: [sources.size < 2 ? 'minimum_two_trade_sources_required' : 'insufficient_classified_trade_sample'],
      rawEventIds: classified.map((row) => row.event.eventId),
      metadata: { sourceCount: sources.size, availableSourceCount: availableSources.size, primaryPairActive, classifiedTrades: classified.length, totalTrades: events.length },
    }, context.now);
  }

  const bySource: Record<string, { delta: number; volume: number; trades: number }> = {};
  let aggregateDelta = 0;
  let totalVolume = 0;
  for (const trade of classified) {
    aggregateDelta += trade.sign * trade.size;
    totalVolume += trade.size;
    const current = bySource[trade.event.source] ?? { delta: 0, volume: 0, trades: 0 };
    current.delta += trade.sign * trade.size;
    current.volume += trade.size;
    current.trades += 1;
    bySource[trade.event.source] = current;
  }
  const firstPrice = classified[0].price;
  const lastPrice = classified.at(-1)!.price;
  const priceChangePct = ((lastPrice - firstPrice) / firstPrice) * 100;
  const flowImbalance = totalVolume > 0 ? aggregateDelta / totalVolume : 0;
  const meaningfulPrice = Math.abs(priceChangePct) >= 0.03;
  const meaningfulFlow = Math.abs(flowImbalance) >= 0.12;

  let classification = 'NONE';
  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (meaningfulPrice && meaningfulFlow) {
    if (priceChangePct < 0 && flowImbalance > 0) { classification = 'ABSORPTION_LONG'; direction = 'LONG'; }
    else if (priceChangePct > 0 && flowImbalance < 0) { classification = 'ABSORPTION_SHORT'; direction = 'SHORT'; }
    else if (priceChangePct > 0 && flowImbalance > 0) { classification = 'CONTINUATION_LONG'; direction = 'LONG'; }
    else if (priceChangePct < 0 && flowImbalance < 0) { classification = 'CONTINUATION_SHORT'; direction = 'SHORT'; }
  }

  const agreementRatios = Object.values(bySource).map((row) => row.volume > 0 ? row.delta / row.volume : 0);
  const directionalAgreement = direction === 'LONG'
    ? agreementRatios.filter((value) => value > 0).length / agreementRatios.length
    : direction === 'SHORT'
      ? agreementRatios.filter((value) => value < 0).length / agreementRatios.length
      : 0;
  const score = clamp01(Math.abs(flowImbalance) * 1.8 * 0.55 + Math.min(Math.abs(priceChangePct) / 0.4, 1) * 0.25 + directionalAgreement * 0.20);
  const classifiedRatio = classified.length / Math.max(events.length, 1);
  const dataQuality = clamp01(0.60 + Math.min(sources.size / 3, 1) * 0.20 + classifiedRatio * 0.20);
  const observedAt = classified.at(-1)!.event.exchangeTimestamp;

  return buildEdgeEvidence({
    edgeId: 'MULTI_EXCHANGE_CVD',
    status: classification === 'NONE' ? 'FAIL' : 'PASS',
    direction,
    score,
    dataQuality,
    observedAt,
    expiresAt: observedAt + 5_000,
    supportingReasons: [
      `classification:${classification}`,
      `flow_imbalance:${flowImbalance.toFixed(4)}`,
      `price_change_pct:${priceChangePct.toFixed(4)}`,
      `source_count:${sources.size}`,
    ],
    conflictingReasons: [
      ...(!meaningfulPrice ? ['price_displacement_below_threshold'] : []),
      ...(!meaningfulFlow ? ['cvd_imbalance_below_threshold'] : []),
      ...(direction !== 'NEUTRAL' && directionalAgreement < 0.5 ? ['cross_exchange_directional_agreement_weak'] : []),
    ],
    rawEventIds: classified.map((row) => row.event.eventId),
    metadata: {
      classification,
      aggregateDelta,
      totalVolume,
      flowImbalance,
      priceChangePct,
      sourceCount: sources.size,
      availableSourceCount: availableSources.size,
      primaryPairActive,
      directionalAgreement,
      bySource,
    },
  }, context.now);
}
