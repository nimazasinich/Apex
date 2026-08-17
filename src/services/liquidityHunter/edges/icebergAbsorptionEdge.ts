import type { MarketEvent } from '../../../contracts/realtime/marketEvent';
import { buildEdgeEvidence, clamp01, pickNumber, type LiquidityHunterEdgeContext } from '../edgeRuntime';

interface UpdatePoint {
  source: string;
  side: 'BID' | 'ASK';
  price: number;
  size: number;
  at: number;
  eventId: string;
}

function parseUpdates(event: MarketEvent): UpdatePoint[] {
  if (!event.payload || typeof event.payload !== 'object') return [];
  const payload = event.payload as Record<string, unknown>;
  const rawUpdates = Array.isArray(payload.updates) ? payload.updates : [payload];
  const result: UpdatePoint[] = [];
  for (const raw of rawUpdates) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const side = String(row.side || '').toUpperCase();
    const price = Number(row.price);
    const size = Number(row.size);
    if ((side !== 'BID' && side !== 'ASK') || !Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size < 0) continue;
    result.push({ source: event.source, side, price, size, at: event.exchangeTimestamp, eventId: event.eventId });
  }
  return result;
}

function tradeAggressor(event: MarketEvent): { sign: 1 | -1; size: number } | null {
  if (!event.payload || typeof event.payload !== 'object') return null;
  const row = event.payload as Record<string, unknown>;
  const size = pickNumber(row, ['size', 'quantity', 'qty', 'volume']);
  if (!size || size <= 0) return null;
  const side = String(row.aggressorSide ?? row.side ?? '').toUpperCase();
  if (side === 'BUY') return { sign: 1, size };
  if (side === 'SELL') return { sign: -1, size };
  if (typeof row.isBuyerMaker === 'boolean') return { sign: row.isBuyerMaker ? -1 : 1, size };
  return null;
}

export function evaluateIcebergAbsorptionEdge(context: LiquidityHunterEdgeContext) {
  const since = context.now - 10_000;
  const deltaEvents = context.seriesStore.query({ symbol: context.symbol, type: 'ORDERBOOK_DELTA', since, limit: 20_000 });
  const tradeEvents = context.seriesStore.query({ symbol: context.symbol, type: 'TRADE', since, limit: 20_000 });
  const updates = deltaEvents.flatMap(parseUpdates);
  const bookSources = new Set(deltaEvents.map((event) => event.source));
  const validBookSources = [...bookSources].filter((source) => {
    const snapshot = context.orderBook.snapshot(source, context.symbol, context.now);
    return snapshot?.quality === 'VALID' && snapshot.sequenceValidated;
  });

  if (!updates.length || !validBookSources.length) {
    return buildEdgeEvidence({
      edgeId: 'ICEBERG_ABSORPTION',
      status: deltaEvents.length ? 'UNKNOWN' : 'NOT_CONFIGURED',
      dataQuality: 0,
      observedAt: deltaEvents.at(-1)?.exchangeTimestamp ?? context.now,
      expiresAt: context.now,
      conflictingReasons: [validBookSources.length ? 'insufficient_orderbook_updates' : 'sequence_valid_orderbook_unavailable'],
      rawEventIds: deltaEvents.map((event) => event.eventId),
      metadata: { validBookSources: validBookSources.length },
    }, context.now);
  }

  const filtered = updates.filter((update) => validBookSources.includes(update.source));
  const byLevel = new Map<string, UpdatePoint[]>();
  for (const update of filtered) {
    const levelKey = `${update.source}|${update.side}|${update.price}`;
    const rows = byLevel.get(levelKey) ?? [];
    rows.push(update);
    byLevel.set(levelKey, rows);
  }

  let bidReplenishments = 0;
  let askReplenishments = 0;
  let strongestBid: { price: number; count: number } | null = null;
  let strongestAsk: { price: number; count: number } | null = null;
  for (const rows of byLevel.values()) {
    rows.sort((a, b) => a.at - b.at);
    let count = 0;
    for (let index = 1; index < rows.length; index += 1) {
      const before = rows[index - 1].size;
      const after = rows[index].size;
      if (before >= 0 && after > before * 1.15 && after - before > 0) count += 1;
    }
    const sample = rows[0];
    if (sample.side === 'BID') {
      bidReplenishments += count;
      if (!strongestBid || count > strongestBid.count) strongestBid = { price: sample.price, count };
    } else {
      askReplenishments += count;
      if (!strongestAsk || count > strongestAsk.count) strongestAsk = { price: sample.price, count };
    }
  }

  let aggressiveBuys = 0;
  let aggressiveSells = 0;
  for (const event of tradeEvents) {
    const trade = tradeAggressor(event);
    if (!trade) continue;
    if (trade.sign > 0) aggressiveBuys += trade.size;
    else aggressiveSells += trade.size;
  }
  const totalAggressive = aggressiveBuys + aggressiveSells;
  const sellShare = totalAggressive > 0 ? aggressiveSells / totalAggressive : 0;
  const buyShare = totalAggressive > 0 ? aggressiveBuys / totalAggressive : 0;

  const longEvidence = bidReplenishments >= 3 && sellShare >= 0.55;
  const shortEvidence = askReplenishments >= 3 && buyShare >= 0.55;
  const conflicting = longEvidence && shortEvidence;
  const direction = conflicting ? 'NEUTRAL' : longEvidence ? 'LONG' : shortEvidence ? 'SHORT' : 'NEUTRAL';
  const replenishmentStrength = Math.max(bidReplenishments, askReplenishments);
  const aggressionShare = direction === 'LONG' ? sellShare : direction === 'SHORT' ? buyShare : Math.max(sellShare, buyShare);
  const score = clamp01(Math.min(replenishmentStrength / 8, 1) * 0.65 + aggressionShare * 0.35);
  const observedAt = Math.max(deltaEvents.at(-1)?.exchangeTimestamp ?? 0, tradeEvents.at(-1)?.exchangeTimestamp ?? 0);
  const dataQuality = clamp01(0.65 + Math.min(validBookSources.length / 2, 1) * 0.20 + Math.min(filtered.length / 20, 1) * 0.15);

  return buildEdgeEvidence({
    edgeId: 'ICEBERG_ABSORPTION',
    status: direction !== 'NEUTRAL' && !conflicting ? 'PASS' : 'FAIL',
    direction,
    score,
    dataQuality,
    observedAt,
    expiresAt: observedAt + 2_000,
    supportingReasons: [
      `bid_replenishments:${bidReplenishments}`,
      `ask_replenishments:${askReplenishments}`,
      `aggressive_sell_share:${sellShare.toFixed(3)}`,
      `aggressive_buy_share:${buyShare.toFixed(3)}`,
    ],
    conflictingReasons: [
      ...(conflicting ? ['two_sided_replenishment_conflict'] : []),
      ...(direction === 'NEUTRAL' ? ['replenishment_or_aggression_threshold_not_met'] : []),
    ],
    rawEventIds: [...new Set([...deltaEvents.map((event) => event.eventId), ...tradeEvents.map((event) => event.eventId)])],
    metadata: {
      classification: direction === 'LONG' ? 'BID_ABSORPTION' : direction === 'SHORT' ? 'ASK_ABSORPTION' : 'NONE',
      bidReplenishments,
      askReplenishments,
      strongestBid,
      strongestAsk,
      aggressiveBuys,
      aggressiveSells,
      validBookSources: validBookSources.length,
    },
  }, context.now);
}
