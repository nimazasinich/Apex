import type { HistoricalTopOfBookTick } from './historicalMicrostructure';

export interface CrossVenueMarketMakingConfig {
  makerVenue: string;
  hedgeVenue: string;
  orderSizeBase: number;
  maxInventoryBase: number;
  queueAheadFraction: number;
  makerFeeBps: number;
  takerFeeBps: number;
  quoteLatencyMs: number;
  hedgeLatencyMs: number;
  cancelLatencyMs: number;
  maxSyncSkewMs: number;
  maxBookGapMs: number;
  maxHedgeSlippageBps: number;
}

export interface MarketMakingFill {
  timestamp: number;
  side: 'BUY' | 'SELL';
  makerVenue: string;
  hedgeVenue: string;
  makerPrice: number;
  hedgePrice: number | null;
  requestedSize: number;
  filledSize: number;
  makerFeeUsd: number;
  takerFeeUsd: number;
  grossPnlUsd: number | null;
  netPnlUsd: number | null;
  hedged: boolean;
  reason: string;
}

export interface CrossVenueMarketMakingResult {
  simulationOnly: true;
  executionAuthorized: false;
  fills: MarketMakingFill[];
  metrics: {
    quoteCycles: number;
    makerFills: number;
    hedgedFills: number;
    unhedgedFills: number;
    partialFills: number;
    skippedUnsynchronized: number;
    skippedStale: number;
    skippedInventoryCap: number;
    rejectedHedgeSlippage: number;
    grossPnlUsd: number;
    feesUsd: number;
    netPnlUsd: number;
    maxInventoryBase: number;
  };
}

export interface FundingObservation {
  timestamp: number;
  rate: number;
  effectiveAt?: number | null;
  source?: string;
}

export interface FundingAwareAvellanedaConfig {
  orderSizeBase: number;
  maxInventoryBase: number;
  riskAversion: number;
  liquidityKappa: number;
  minHalfSpreadBps: number;
  volatilityLookback: number;
  fundingSkewMultiplier: number;
  queueAheadFraction: number;
  makerFeeBps: number;
  quoteLatencyMs: number;
  cancelLatencyMs: number;
  maxBookGapMs: number;
}

export interface AvellanedaQuotePoint {
  timestamp: number;
  mid: number;
  reservationPrice: number;
  bid: number;
  ask: number;
  halfSpreadBps: number;
  volatilityBps: number;
  fundingRate: number;
  inventoryBefore: number;
  inventoryAfter: number;
  buyFilled: number;
  sellFilled: number;
}

export interface FundingAwareAvellanedaResult {
  simulationOnly: true;
  executionAuthorized: false;
  quotes: AvellanedaQuotePoint[];
  metrics: {
    quoteCycles: number;
    makerFills: number;
    partialFills: number;
    skippedStale: number;
    skippedInventoryCap: number;
    maxAbsInventoryBase: number;
    endingInventoryBase: number;
    cashUsd: number;
    markToMarketUsd: number;
    makerFeesUsd: number;
    fundingPnlUsd: number;
    netPnlUsd: number;
  };
}

function finite(value: unknown, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`market_making_config_invalid:${name}`);
  return parsed;
}

function normalizeCrossConfig(input: Partial<CrossVenueMarketMakingConfig> & Pick<CrossVenueMarketMakingConfig, 'makerVenue' | 'hedgeVenue'>): CrossVenueMarketMakingConfig {
  const makerVenue = String(input.makerVenue || '').trim().toLowerCase();
  const hedgeVenue = String(input.hedgeVenue || '').trim().toLowerCase();
  if (!makerVenue || !hedgeVenue || makerVenue === hedgeVenue) throw new Error('market_making_distinct_venues_required');
  return {
    makerVenue,
    hedgeVenue,
    orderSizeBase: finite(input.orderSizeBase ?? 0.01, 'orderSizeBase', 1e-9, 1_000_000),
    maxInventoryBase: finite(input.maxInventoryBase ?? 0.05, 'maxInventoryBase', 1e-9, 1_000_000),
    queueAheadFraction: finite(input.queueAheadFraction ?? 0.5, 'queueAheadFraction', 0, 1),
    makerFeeBps: finite(input.makerFeeBps ?? 2, 'makerFeeBps', -20, 100),
    takerFeeBps: finite(input.takerFeeBps ?? 5, 'takerFeeBps', 0, 200),
    quoteLatencyMs: finite(input.quoteLatencyMs ?? 40, 'quoteLatencyMs', 0, 60_000),
    hedgeLatencyMs: finite(input.hedgeLatencyMs ?? 80, 'hedgeLatencyMs', 0, 60_000),
    cancelLatencyMs: finite(input.cancelLatencyMs ?? 80, 'cancelLatencyMs', 0, 60_000),
    maxSyncSkewMs: finite(input.maxSyncSkewMs ?? 250, 'maxSyncSkewMs', 0, 60_000),
    maxBookGapMs: finite(input.maxBookGapMs ?? 2_000, 'maxBookGapMs', 1, 10 * 60_000),
    maxHedgeSlippageBps: finite(input.maxHedgeSlippageBps ?? 20, 'maxHedgeSlippageBps', 0, 10_000),
  };
}

function normalizeAvellanedaConfig(input: Partial<FundingAwareAvellanedaConfig> = {}): FundingAwareAvellanedaConfig {
  return {
    orderSizeBase: finite(input.orderSizeBase ?? 0.01, 'orderSizeBase', 1e-9, 1_000_000),
    maxInventoryBase: finite(input.maxInventoryBase ?? 0.05, 'maxInventoryBase', 1e-9, 1_000_000),
    riskAversion: finite(input.riskAversion ?? 0.15, 'riskAversion', 1e-6, 100),
    liquidityKappa: finite(input.liquidityKappa ?? 1.5, 'liquidityKappa', 1e-6, 1_000),
    minHalfSpreadBps: finite(input.minHalfSpreadBps ?? 2, 'minHalfSpreadBps', 0, 1_000),
    volatilityLookback: Math.floor(finite(input.volatilityLookback ?? 20, 'volatilityLookback', 3, 10_000)),
    fundingSkewMultiplier: finite(input.fundingSkewMultiplier ?? 5_000, 'fundingSkewMultiplier', 0, 1_000_000),
    queueAheadFraction: finite(input.queueAheadFraction ?? 0.5, 'queueAheadFraction', 0, 1),
    makerFeeBps: finite(input.makerFeeBps ?? 2, 'makerFeeBps', -20, 100),
    quoteLatencyMs: finite(input.quoteLatencyMs ?? 40, 'quoteLatencyMs', 0, 60_000),
    cancelLatencyMs: finite(input.cancelLatencyMs ?? 80, 'cancelLatencyMs', 0, 60_000),
    maxBookGapMs: finite(input.maxBookGapMs ?? 2_000, 'maxBookGapMs', 1, 10 * 60_000),
  };
}

function sortedTicks(rows: readonly HistoricalTopOfBookTick[], venue?: string): HistoricalTopOfBookTick[] {
  const normalizedVenue = venue?.toLowerCase();
  return rows
    .filter((row) => (!normalizedVenue || row.venue.toLowerCase() === normalizedVenue)
      && Number.isFinite(row.timestamp) && row.timestamp > 0
      && Number.isFinite(row.bid) && Number.isFinite(row.ask) && row.bid > 0 && row.ask > row.bid
      && Number.isFinite(row.bidSize) && row.bidSize >= 0 && Number.isFinite(row.askSize) && row.askSize >= 0)
    .map((row) => ({ ...row, venue: row.venue.toLowerCase() }))
    .sort((a, b) => a.timestamp - b.timestamp || (a.sequence ?? 0) - (b.sequence ?? 0));
}

function firstAtOrAfter(rows: readonly HistoricalTopOfBookTick[], timestamp: number, startIndex = 0): { row: HistoricalTopOfBookTick | null; index: number } {
  let low = Math.max(0, startIndex);
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rows[mid].timestamp < timestamp) low = mid + 1;
    else high = mid;
  }
  return { row: rows[low] ?? null, index: low };
}

function closestAtOrBefore(rows: readonly HistoricalTopOfBookTick[], timestamp: number): HistoricalTopOfBookTick | null {
  let low = 0; let high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rows[mid].timestamp <= timestamp) low = mid + 1; else high = mid;
  }
  return rows[Math.max(0, low - 1)] ?? null;
}

function fillAtBid(current: HistoricalTopOfBookTick, future: HistoricalTopOfBookTick, requested: number, queueAheadFraction: number): number {
  const ahead = current.bidSize * queueAheadFraction;
  if (future.bid < current.bid) return Math.min(requested, Math.max(0, current.bidSize - ahead));
  if (future.bid > current.bid) return 0;
  const consumed = Math.max(0, current.bidSize - future.bidSize);
  return Math.min(requested, Math.max(0, consumed - ahead));
}

function fillAtAsk(current: HistoricalTopOfBookTick, future: HistoricalTopOfBookTick, requested: number, queueAheadFraction: number): number {
  const ahead = current.askSize * queueAheadFraction;
  if (future.ask > current.ask) return Math.min(requested, Math.max(0, current.askSize - ahead));
  if (future.ask < current.ask) return 0;
  const consumed = Math.max(0, current.askSize - future.askSize);
  return Math.min(requested, Math.max(0, consumed - ahead));
}

function feeUsd(notionalUsd: number, bps: number): number {
  return notionalUsd * bps / 10_000;
}

export function simulateCrossVenueMarketMaking(
  makerRows: readonly HistoricalTopOfBookTick[],
  hedgeRows: readonly HistoricalTopOfBookTick[],
  input: Partial<CrossVenueMarketMakingConfig> & Pick<CrossVenueMarketMakingConfig, 'makerVenue' | 'hedgeVenue'>,
): CrossVenueMarketMakingResult {
  const cfg = normalizeCrossConfig(input);
  const maker = sortedTicks(makerRows, cfg.makerVenue);
  const hedge = sortedTicks(hedgeRows, cfg.hedgeVenue);
  const fills: MarketMakingFill[] = [];
  let inventory = 0; let maxInventory = 0;
  let skippedUnsynchronized = 0; let skippedStale = 0; let skippedInventoryCap = 0; let rejectedHedgeSlippage = 0; let partialFills = 0;

  const record = (side: 'BUY' | 'SELL', now: HistoricalTopOfBookTick, future: HistoricalTopOfBookTick, size: number) => {
    if (size <= 0) return;
    if (size + 1e-12 < cfg.orderSizeBase) partialFills += 1;
    const signed = side === 'BUY' ? size : -size;
    if (Math.abs(inventory + signed) > cfg.maxInventoryBase + 1e-12) { skippedInventoryCap += 1; return; }
    inventory += signed; maxInventory = Math.max(maxInventory, Math.abs(inventory));
    const makerPrice = side === 'BUY' ? now.bid : now.ask;
    const hedgeTargetAt = future.timestamp + cfg.hedgeLatencyMs;
    const hedgeTick = firstAtOrAfter(hedge, hedgeTargetAt).row;
    const makerFee = feeUsd(makerPrice * size, cfg.makerFeeBps);
    if (!hedgeTick || hedgeTick.timestamp - hedgeTargetAt > cfg.maxBookGapMs) {
      fills.push({ timestamp: future.timestamp, side, makerVenue: cfg.makerVenue, hedgeVenue: cfg.hedgeVenue, makerPrice, hedgePrice: null, requestedSize: cfg.orderSizeBase, filledSize: size, makerFeeUsd: makerFee, takerFeeUsd: 0, grossPnlUsd: null, netPnlUsd: null, hedged: false, reason: 'hedge_book_unavailable' });
      return;
    }
    const hedgePrice = side === 'BUY' ? hedgeTick.bid : hedgeTick.ask;
    const makerMid = (now.bid + now.ask) / 2;
    const hedgeMid = (hedgeTick.bid + hedgeTick.ask) / 2;
    const dislocationBps = makerMid > 0 ? Math.abs(hedgeMid - makerMid) / makerMid * 10_000 : Number.POSITIVE_INFINITY;
    if (dislocationBps > cfg.maxHedgeSlippageBps) {
      rejectedHedgeSlippage += 1;
      fills.push({ timestamp: future.timestamp, side, makerVenue: cfg.makerVenue, hedgeVenue: cfg.hedgeVenue, makerPrice, hedgePrice, requestedSize: cfg.orderSizeBase, filledSize: size, makerFeeUsd: makerFee, takerFeeUsd: 0, grossPnlUsd: null, netPnlUsd: null, hedged: false, reason: 'hedge_slippage_limit' });
      return;
    }
    const takerFee = feeUsd(hedgePrice * size, cfg.takerFeeBps);
    const gross = side === 'BUY' ? (hedgePrice - makerPrice) * size : (makerPrice - hedgePrice) * size;
    const net = gross - makerFee - takerFee;
    inventory -= signed;
    fills.push({ timestamp: future.timestamp, side, makerVenue: cfg.makerVenue, hedgeVenue: cfg.hedgeVenue, makerPrice, hedgePrice, requestedSize: cfg.orderSizeBase, filledSize: size, makerFeeUsd: makerFee, takerFeeUsd: takerFee, grossPnlUsd: gross, netPnlUsd: net, hedged: true, reason: 'hedged' });
  };

  for (let index = 0; index < maker.length - 1; index += 1) {
    const now = maker[index];
    const synchronized = closestAtOrBefore(hedge, now.timestamp);
    if (!synchronized || Math.abs(now.timestamp - synchronized.timestamp) > cfg.maxSyncSkewMs) { skippedUnsynchronized += 1; continue; }
    const activeAt = now.timestamp + cfg.quoteLatencyMs;
    const futureSearch = firstAtOrAfter(maker, activeAt, index + 1);
    const future = futureSearch.row;
    if (!future || future.timestamp - activeAt > Math.min(cfg.maxBookGapMs, cfg.cancelLatencyMs + cfg.maxBookGapMs)) { skippedStale += 1; continue; }
    const buyFill = fillAtBid(now, future, cfg.orderSizeBase, cfg.queueAheadFraction);
    const sellFill = fillAtAsk(now, future, cfg.orderSizeBase, cfg.queueAheadFraction);
    record('BUY', now, future, buyFill);
    record('SELL', now, future, sellFill);
  }

  const hedged = fills.filter((row) => row.hedged);
  const grossPnlUsd = hedged.reduce((sum, row) => sum + (row.grossPnlUsd ?? 0), 0);
  const feesUsd = fills.reduce((sum, row) => sum + row.makerFeeUsd + row.takerFeeUsd, 0);
  return {
    simulationOnly: true,
    executionAuthorized: false,
    fills,
    metrics: {
      quoteCycles: Math.max(0, maker.length - 1), makerFills: fills.length, hedgedFills: hedged.length, unhedgedFills: fills.length - hedged.length,
      partialFills, skippedUnsynchronized, skippedStale, skippedInventoryCap, rejectedHedgeSlippage,
      grossPnlUsd, feesUsd, netPnlUsd: hedged.reduce((sum, row) => sum + (row.netPnlUsd ?? 0), 0), maxInventoryBase: maxInventory,
    },
  };
}

function volatilityBps(mids: readonly number[], endExclusive: number, lookback: number): number {
  const start = Math.max(1, endExclusive - lookback);
  const returns: number[] = [];
  for (let i = start; i < endExclusive; i += 1) {
    const a = mids[i - 1]; const b = mids[i];
    if (a > 0 && b > 0) returns.push(Math.log(b / a));
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(Math.max(0, variance)) * 10_000;
}

function latestFundingRate(rows: readonly FundingObservation[], timestamp: number): number {
  let rate = 0;
  for (const row of rows) {
    const effective = Number(row.effectiveAt ?? row.timestamp);
    if (!Number.isFinite(effective) || effective > timestamp) break;
    if (Number.isFinite(row.rate)) rate = row.rate;
  }
  return rate;
}

export function simulateFundingAwareAvellaneda(
  rows: readonly HistoricalTopOfBookTick[],
  fundingRows: readonly FundingObservation[],
  input: Partial<FundingAwareAvellanedaConfig> = {},
): FundingAwareAvellanedaResult {
  const cfg = normalizeAvellanedaConfig(input);
  const ticks = sortedTicks(rows);
  const funding = [...fundingRows]
    .filter((row) => Number.isFinite(row.timestamp) && row.timestamp > 0 && Number.isFinite(row.rate))
    .sort((a, b) => Number(a.effectiveAt ?? a.timestamp) - Number(b.effectiveAt ?? b.timestamp));
  const mids = ticks.map((row) => (row.bid + row.ask) / 2);
  const quotes: AvellanedaQuotePoint[] = [];
  let inventory = 0; let cash = 0; let maxAbsInventory = 0; let makerFees = 0; let fundingPnl = 0;
  let makerFills = 0; let partialFills = 0; let skippedStale = 0; let skippedInventoryCap = 0;
  let previousTimestamp = ticks[0]?.timestamp ?? 0;

  for (let index = 0; index < ticks.length - 1; index += 1) {
    const now = ticks[index];
    const activeAt = now.timestamp + cfg.quoteLatencyMs;
    const future = firstAtOrAfter(ticks, activeAt, index + 1).row;
    if (!future || future.timestamp - activeAt > Math.min(cfg.maxBookGapMs, cfg.cancelLatencyMs + cfg.maxBookGapMs)) { skippedStale += 1; continue; }
    const mid = mids[index];
    const volBps = volatilityBps(mids, index + 1, cfg.volatilityLookback);
    const rate = latestFundingRate(funding, now.timestamp);
    const invNorm = cfg.maxInventoryBase > 0 ? inventory / cfg.maxInventoryBase : 0;
    const inventorySkewBps = invNorm * cfg.riskAversion * Math.max(1, volBps);
    const fundingSkewBps = rate * cfg.fundingSkewMultiplier;
    const reservationPrice = mid * (1 - (inventorySkewBps + fundingSkewBps) / 10_000);
    const modelHalfSpreadBps = cfg.riskAversion * Math.max(1, volBps) + (2 / cfg.riskAversion) * Math.log(1 + cfg.riskAversion / cfg.liquidityKappa);
    const halfSpreadBps = Math.max(cfg.minHalfSpreadBps, Math.min(1_000, modelHalfSpreadBps));
    const bid = reservationPrice * (1 - halfSpreadBps / 10_000);
    const ask = reservationPrice * (1 + halfSpreadBps / 10_000);

    const queueBidTick: HistoricalTopOfBookTick = { ...now, bid, bidSize: now.bidSize };
    const queueAskTick: HistoricalTopOfBookTick = { ...now, ask, askSize: now.askSize };
    let buyFilled = fillAtBid(queueBidTick, future, cfg.orderSizeBase, cfg.queueAheadFraction);
    let sellFilled = fillAtAsk(queueAskTick, future, cfg.orderSizeBase, cfg.queueAheadFraction);
    if (Math.abs(inventory + buyFilled) > cfg.maxInventoryBase + 1e-12) { buyFilled = 0; skippedInventoryCap += 1; }
    if (Math.abs(inventory - sellFilled) > cfg.maxInventoryBase + 1e-12) { sellFilled = 0; skippedInventoryCap += 1; }
    if (buyFilled > 0) {
      if (buyFilled + 1e-12 < cfg.orderSizeBase) partialFills += 1;
      const fee = feeUsd(bid * buyFilled, cfg.makerFeeBps); makerFees += fee; cash -= bid * buyFilled + fee; inventory += buyFilled; makerFills += 1;
    }
    if (sellFilled > 0) {
      if (sellFilled + 1e-12 < cfg.orderSizeBase) partialFills += 1;
      const fee = feeUsd(ask * sellFilled, cfg.makerFeeBps); makerFees += fee; cash += ask * sellFilled - fee; inventory -= sellFilled; makerFills += 1;
    }
    if (now.timestamp > previousTimestamp && inventory !== 0 && rate !== 0) {
      const accrualFraction = Math.min(1, (now.timestamp - previousTimestamp) / (8 * 60 * 60_000));
      const fundingCashflow = -inventory * mid * rate * accrualFraction;
      cash += fundingCashflow; fundingPnl += fundingCashflow;
    }
    previousTimestamp = now.timestamp;
    maxAbsInventory = Math.max(maxAbsInventory, Math.abs(inventory));
    quotes.push({ timestamp: now.timestamp, mid, reservationPrice, bid, ask, halfSpreadBps, volatilityBps: volBps, fundingRate: rate, inventoryBefore: invNorm * cfg.maxInventoryBase, inventoryAfter: inventory, buyFilled, sellFilled });
  }
  const lastMid = mids.at(-1) ?? 0;
  const markToMarketUsd = cash + inventory * lastMid;
  return {
    simulationOnly: true, executionAuthorized: false, quotes,
    metrics: {
      quoteCycles: quotes.length, makerFills, partialFills, skippedStale, skippedInventoryCap, maxAbsInventoryBase: maxAbsInventory,
      endingInventoryBase: inventory, cashUsd: cash, markToMarketUsd, makerFeesUsd: makerFees, fundingPnlUsd: fundingPnl, netPnlUsd: markToMarketUsd,
    },
  };
}
