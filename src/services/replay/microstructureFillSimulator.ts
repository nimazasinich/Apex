import { Worker } from 'node:worker_threads';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';

export type MicrostructureOrderSide = 'BUY' | 'SELL';
export type MicrostructureEntryType = 'MARKET' | 'LIMIT';

export interface MicrostructureSimulationInput {
  simulationId: string;
  symbol: string;
  events: MarketEvent[];
  executionSource?: string;
  orderSide: MicrostructureOrderSide;
  entryType: MicrostructureEntryType;
  submitAt: number;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  latencyMs?: number;
  maxHorizonMs?: number;
  queueAheadFraction?: number;
  makerFeeBps?: number;
  takerFeeBps?: number;
  marketSlippageBps?: number;
}

export interface MicrostructureFill {
  timestamp: number;
  price: number;
  quantity: number;
  liquidity: 'MAKER' | 'TAKER';
  reason: 'ENTRY' | 'STOP' | 'TARGET' | 'EXPIRY_EXIT';
}

export interface MicrostructureSimulationResult {
  simulationId: string;
  symbol: string;
  executionSource: string | null;
  status: 'NOT_FILLED' | 'PARTIALLY_FILLED' | 'FILLED_OPEN' | 'TARGET_HIT' | 'STOPPED' | 'EXPIRED';
  entryFilledQuantity: number;
  averageEntryPrice: number | null;
  exitFilledQuantity: number;
  averageExitPrice: number | null;
  queueAheadInitial: number | null;
  queueAheadRemaining: number | null;
  entryFills: MicrostructureFill[];
  exitFills: MicrostructureFill[];
  grossReturnPct: number | null;
  netReturnPct: number | null;
  totalFeesUsd: number;
  latencyMs: number;
  methodology: 'DETERMINISTIC_EVENT_LEVEL_QUEUE_APPROXIMATION_V1';
  executionSimulation: true;
  caveats: string[];
}

/**
 * Deterministic event-level approximation for research replay. It is designed
 * to be conservative and reproducible, not to claim exchange matching-engine
 * fidelity. For passive limits, displayed queue at the limit is placed ahead
 * of the simulated order and qualifying aggressor flow consumes that queue
 * before fills are credited. Market/stop/target exits pay spread plus explicit
 * slippage and taker fees.
 *
 * IMPORTANT: keep this function self-contained. The worker pool serializes its
 * runtime JavaScript representation into worker_threads for CPU isolation.
 */
export function simulateMicrostructureOrder(input: MicrostructureSimulationInput): MicrostructureSimulationResult {
  const finite = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const positive = (value: unknown): number | null => {
    const parsed = finite(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  };
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const sideSign = input.orderSide === 'BUY' ? 1 : -1;
  const latencyMs = clamp(Math.floor(input.latencyMs ?? 100), 0, 10_000);
  const maxHorizonMs = clamp(Math.floor(input.maxHorizonMs ?? 60 * 60_000), 1_000, 24 * 60 * 60_000);
  const queueAheadFraction = clamp(Number(input.queueAheadFraction ?? 1), 0, 5);
  const makerFeeBps = clamp(Number(input.makerFeeBps ?? 2), -5, 20);
  const takerFeeBps = clamp(Number(input.takerFeeBps ?? 5), 0, 50);
  const marketSlippageBps = clamp(Number(input.marketSlippageBps ?? 1), 0, 100);
  const quantity = positive(input.quantity) ?? 0;
  const limitPrice = input.entryType === 'LIMIT' ? positive(input.limitPrice) : null;
  const stopPrice = positive(input.stopPrice);
  const targetPrice = positive(input.targetPrice);
  if (!input.simulationId || !input.symbol || quantity <= 0 || !Number.isFinite(input.submitAt) || (input.entryType === 'LIMIT' && limitPrice === null)) {
    throw new Error('invalid_microstructure_simulation_input');
  }

  const executionSource = String(input.executionSource ?? '').trim() || null;
  const events = input.events
    .filter((event) => event && event.symbol === input.symbol && (!executionSource || event.source === executionSource) && Number.isFinite(event.exchangeTimestamp))
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.exchangeTimestamp - b.event.exchangeTimestamp || a.event.receivedAt - b.event.receivedAt || a.index - b.index)
    .map((row) => row.event);
  const effectiveSubmit = input.submitAt + latencyMs;
  const expiryAt = input.submitAt + maxHorizonMs;

  const bids = new Map<number, number>();
  const asks = new Map<number, number>();
  let lastQuote: { bid: number; ask: number; bidSize: number | null; askSize: number | null; timestamp: number } | null = null;
  let snapshotSeen = false;

  const applySnapshot = (payload: any) => {
    bids.clear(); asks.clear();
    for (const row of Array.isArray(payload?.bids) ? payload.bids : []) {
      const price = positive(row?.price); const size = finite(row?.size);
      if (price !== null && size !== null && size >= 0) bids.set(price, size);
    }
    for (const row of Array.isArray(payload?.asks) ? payload.asks : []) {
      const price = positive(row?.price); const size = finite(row?.size);
      if (price !== null && size !== null && size >= 0) asks.set(price, size);
    }
    snapshotSeen = true;
  };
  const applyDelta = (payload: any) => {
    for (const row of Array.isArray(payload?.updates) ? payload.updates : []) {
      const price = positive(row?.price); const size = finite(row?.size); const side = String(row?.side || '').toUpperCase();
      if (price === null || size === null || size < 0 || (side !== 'BID' && side !== 'ASK')) continue;
      const book = side === 'BID' ? bids : asks;
      if (size === 0) book.delete(price); else book.set(price, size);
    }
  };
  const updateQuote = (event: any) => {
    const payload = event.payload as any;
    const bid = positive(payload?.bid); const ask = positive(payload?.ask);
    if (bid === null || ask === null || ask < bid) return;
    lastQuote = {
      bid, ask,
      bidSize: positive(payload?.bidSize),
      askSize: positive(payload?.askSize),
      timestamp: event.exchangeTimestamp,
    };
  };
  const adverseMarketPrice = (orderSide: MicrostructureOrderSide, quote: typeof lastQuote, fallbackTradePrice?: number | null) => {
    const basis = quote ? (orderSide === 'BUY' ? quote.ask : quote.bid) : fallbackTradePrice;
    if (basis === null || basis === undefined || !Number.isFinite(basis) || basis <= 0) return null;
    const slip = marketSlippageBps / 10_000;
    return basis * (orderSide === 'BUY' ? 1 + slip : 1 - slip);
  };
  const weightedAverage = (fills: MicrostructureFill[]) => {
    const qty = fills.reduce((sum, row) => sum + row.quantity, 0);
    return qty > 0 ? fills.reduce((sum, row) => sum + row.price * row.quantity, 0) / qty : null;
  };

  // Build the visible book/quote state up to effective submission.
  let startIndex = 0;
  for (; startIndex < events.length; startIndex += 1) {
    const event = events[startIndex];
    if (event.exchangeTimestamp > effectiveSubmit) break;
    if (event.type === 'ORDERBOOK_SNAPSHOT') applySnapshot(event.payload);
    else if (event.type === 'ORDERBOOK_DELTA' && snapshotSeen) applyDelta(event.payload);
    else if (event.type === 'QUOTE') updateQuote(event);
  }

  let queueAheadInitial: number | null = null;
  let queueAheadRemaining: number | null = null;
  if (input.entryType === 'LIMIT' && limitPrice !== null) {
    const book = input.orderSide === 'BUY' ? bids : asks;
    const displayed = finite(book.get(limitPrice));
    let quoteDisplayed: number | null = null;
    if (lastQuote) {
      const quote = lastQuote as { bid: number; ask: number; bidSize: number | null; askSize: number | null; timestamp: number };
      const referencePrice = input.orderSide === 'BUY' ? quote.bid : quote.ask;
      if (Math.abs(referencePrice - limitPrice) <= Math.max(1e-10, limitPrice * 1e-10)) {
        quoteDisplayed = input.orderSide === 'BUY' ? quote.bidSize : quote.askSize;
      }
    }
    const basis = displayed !== null && displayed >= 0 ? displayed : quoteDisplayed;
    queueAheadInitial = basis !== null ? basis * queueAheadFraction : null;
    queueAheadRemaining = queueAheadInitial;
  }

  const entryFills: MicrostructureFill[] = [];
  const exitFills: MicrostructureFill[] = [];
  let entryRemaining = quantity;
  let exitPending: { reason: 'STOP' | 'TARGET' | 'EXPIRY_EXIT'; activateAt: number } | null = null;
  let resolvedStatus: MicrostructureSimulationResult['status'] | null = null;

  const addEntry = (timestamp: number, price: number, qty: number, liquidity: 'MAKER' | 'TAKER') => {
    const used = Math.min(entryRemaining, Math.max(0, qty));
    if (used <= 0) return;
    entryFills.push({ timestamp, price, quantity: used, liquidity, reason: 'ENTRY' });
    entryRemaining -= used;
  };

  const triggerExitIfNeeded = (timestamp: number, observedPrice: number) => {
    if (exitPending || entryFills.length === 0) return;
    const stopTouched = stopPrice !== null && (input.orderSide === 'BUY' ? observedPrice <= stopPrice : observedPrice >= stopPrice);
    const targetTouched = targetPrice !== null && (input.orderSide === 'BUY' ? observedPrice >= targetPrice : observedPrice <= targetPrice);
    // Conservative same-observation ordering: stop wins if both thresholds are
    // simultaneously implied by a coarse event.
    if (stopTouched) exitPending = { reason: 'STOP', activateAt: timestamp + latencyMs };
    else if (targetTouched) exitPending = { reason: 'TARGET', activateAt: timestamp + latencyMs };
  };

  const executePendingExit = (timestamp: number, fallbackPrice: number | null) => {
    if (!exitPending || timestamp < exitPending.activateAt) return false;
    const filledQty = entryFills.reduce((sum, row) => sum + row.quantity, 0);
    const alreadyExited = exitFills.reduce((sum, row) => sum + row.quantity, 0);
    const remaining = Math.max(0, filledQty - alreadyExited);
    if (remaining <= 0) return true;
    const exitSide: MicrostructureOrderSide = input.orderSide === 'BUY' ? 'SELL' : 'BUY';
    const px = adverseMarketPrice(exitSide, lastQuote, fallbackPrice);
    if (px === null) return false;
    exitFills.push({ timestamp, price: px, quantity: remaining, liquidity: 'TAKER', reason: exitPending.reason });
    resolvedStatus = exitPending.reason === 'STOP' ? 'STOPPED' : exitPending.reason === 'TARGET' ? 'TARGET_HIT' : 'EXPIRED';
    entryRemaining = 0;
    return true;
  };

  // Market entry executes at first usable quote/trade after latency.
  if (input.entryType === 'MARKET') {
    for (let index = startIndex; index < events.length; index += 1) {
      const event = events[index];
      if (event.exchangeTimestamp > expiryAt) break;
      if (event.type === 'QUOTE') updateQuote(event);
      if (event.type === 'ORDERBOOK_SNAPSHOT') applySnapshot(event.payload);
      if (event.type === 'ORDERBOOK_DELTA' && snapshotSeen) applyDelta(event.payload);
      const fallback = event.type === 'TRADE' ? positive((event.payload as any)?.price) : null;
      const px = adverseMarketPrice(input.orderSide, lastQuote, fallback);
      if (px !== null) {
        addEntry(event.exchangeTimestamp, px, entryRemaining, 'TAKER');
        startIndex = index + 1;
        break;
      }
    }
  }

  for (let index = startIndex; index < events.length; index += 1) {
    const event = events[index];
    if (event.exchangeTimestamp > expiryAt) break;
    if (event.type === 'QUOTE') updateQuote(event);
    else if (event.type === 'ORDERBOOK_SNAPSHOT') applySnapshot(event.payload);
    else if (event.type === 'ORDERBOOK_DELTA' && snapshotSeen) applyDelta(event.payload);

    const tradePrice = event.type === 'TRADE' ? positive((event.payload as any)?.price) : null;
    const tradeSize = event.type === 'TRADE' ? positive((event.payload as any)?.size) : null;
    const aggressor = event.type === 'TRADE' ? String((event.payload as any)?.aggressorSide || '').toUpperCase() : '';

    if (input.entryType === 'LIMIT' && limitPrice !== null && entryRemaining > 0 && tradePrice !== null && tradeSize !== null) {
      const qualifies = input.orderSide === 'BUY'
        ? aggressor === 'SELL' && tradePrice <= limitPrice
        : aggressor === 'BUY' && tradePrice >= limitPrice;
      if (qualifies) {
        let available = tradeSize;
        if (queueAheadRemaining !== null && queueAheadRemaining > 0) {
          const consumedAhead = Math.min(queueAheadRemaining, available);
          queueAheadRemaining -= consumedAhead;
          available -= consumedAhead;
        }
        if (available > 0) addEntry(event.exchangeTimestamp, limitPrice, available, 'MAKER');
      }
    }

    if (tradePrice !== null) triggerExitIfNeeded(event.exchangeTimestamp, tradePrice);
    else if (lastQuote) {
      const quote = lastQuote as { bid: number; ask: number; bidSize: number | null; askSize: number | null; timestamp: number };
      triggerExitIfNeeded(event.exchangeTimestamp, (quote.bid + quote.ask) / 2);
    }
    if (executePendingExit(event.exchangeTimestamp, tradePrice)) break;
  }

  const entryFilledQuantity = entryFills.reduce((sum, row) => sum + row.quantity, 0);
  const exitFilledQuantity = exitFills.reduce((sum, row) => sum + row.quantity, 0);
  const averageEntryPrice = weightedAverage(entryFills);

  if (!resolvedStatus && entryFilledQuantity > 0) {
    exitPending = { reason: 'EXPIRY_EXIT', activateAt: expiryAt };
    // Use the latest available quote/trade at or before expiry for a conservative
    // expiry liquidation. If no market state exists, the position remains open.
    let fallback: number | null = null;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.exchangeTimestamp > expiryAt || event.exchangeTimestamp < effectiveSubmit) continue;
      if (event.type === 'QUOTE') updateQuote(event);
      if (event.type === 'TRADE') fallback = positive((event.payload as any)?.price);
      if (lastQuote || fallback !== null) break;
    }
    executePendingExit(expiryAt, fallback);
  }

  const averageExitPrice = weightedAverage(exitFills);
  const entryMakerNotional = entryFills.filter((row) => row.liquidity === 'MAKER').reduce((sum, row) => sum + row.price * row.quantity, 0);
  const entryTakerNotional = entryFills.filter((row) => row.liquidity === 'TAKER').reduce((sum, row) => sum + row.price * row.quantity, 0);
  const exitNotional = exitFills.reduce((sum, row) => sum + row.price * row.quantity, 0);
  const totalFeesUsd = entryMakerNotional * makerFeeBps / 10_000 + (entryTakerNotional + exitNotional) * takerFeeBps / 10_000;
  const roundTripQty = Math.min(entryFilledQuantity, exitFilledQuantity);
  let grossReturnPct: number | null = null;
  let netReturnPct: number | null = null;
  if (roundTripQty > 0 && averageEntryPrice !== null && averageExitPrice !== null) {
    grossReturnPct = sideSign * (averageExitPrice - averageEntryPrice) / averageEntryPrice * 100;
    const referenceNotional = averageEntryPrice * roundTripQty;
    netReturnPct = referenceNotional > 0 ? grossReturnPct - totalFeesUsd / referenceNotional * 100 : grossReturnPct;
  }

  let status: MicrostructureSimulationResult['status'];
  if (resolvedStatus) status = resolvedStatus;
  else if (entryFilledQuantity <= 0) status = 'NOT_FILLED';
  else if (entryFilledQuantity + 1e-12 < quantity) status = 'PARTIALLY_FILLED';
  else status = 'FILLED_OPEN';

  return {
    simulationId: input.simulationId,
    symbol: input.symbol,
    executionSource,
    status,
    entryFilledQuantity,
    averageEntryPrice,
    exitFilledQuantity,
    averageExitPrice,
    queueAheadInitial,
    queueAheadRemaining,
    entryFills,
    exitFills,
    grossReturnPct,
    netReturnPct,
    totalFeesUsd,
    latencyMs,
    methodology: 'DETERMINISTIC_EVENT_LEVEL_QUEUE_APPROXIMATION_V1',
    executionSimulation: true,
    caveats: [
      executionSource ? `Only events from execution source ${executionSource} are used for fill/queue simulation.` : 'No execution source was supplied; callers should avoid mixed-venue datasets.',
      'Displayed-depth queue position is approximated; private matching-engine priority is unavailable.',
      'Qualifying aggressor volume is used to consume displayed queue conservatively before passive fills.',
      'Market and protective exits include configured latency, spread and slippage but do not model venue-specific hidden queues.',
    ],
  };
}

export interface MicrostructureWorkerResult {
  result: MicrostructureSimulationResult;
  workerThreadId: number;
}

export async function runMicrostructureSimulationBatch(
  inputs: readonly MicrostructureSimulationInput[],
  concurrency = 2,
): Promise<MicrostructureWorkerResult[]> {
  if (inputs.length === 0) return [];
  const boundedConcurrency = Math.max(1, Math.min(8, Math.floor(concurrency)));
  const results: MicrostructureWorkerResult[] = new Array(inputs.length);
  let next = 0;
  const workerSource = `
    const { parentPort, threadId } = require('node:worker_threads');
    const simulate = ${simulateMicrostructureOrder.toString()};
    parentPort.on('message', (message) => {
      try {
        const result = simulate(message.input);
        parentPort.postMessage({ requestId: message.requestId, ok: true, result, threadId });
      } catch (error) {
        parentPort.postMessage({ requestId: message.requestId, ok: false, error: error && error.message ? error.message : String(error), threadId });
      }
    });
  `;

  // Keep one worker alive per concurrency slot instead of paying process/thread
  // startup overhead for every candidate. Each worker receives one task at a
  // time, which keeps result ordering deterministic while providing true CPU
  // isolation and bounded parallelism.
  const runners = Array.from({ length: Math.min(boundedConcurrency, inputs.length) }, async () => {
    const worker = new Worker(workerSource, { eval: true });
    try {
      while (true) {
        const index = next++;
        if (index >= inputs.length) return;
        results[index] = await new Promise<MicrostructureWorkerResult>((resolve, reject) => {
          const requestId = index;
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error('microstructure_worker_timeout'));
          }, 30_000);
          const onMessage = (message: { requestId?: number; ok?: boolean; result?: MicrostructureSimulationResult; error?: string; threadId?: number }) => {
            if (message.requestId !== requestId) return;
            cleanup();
            if (!message.ok || !message.result || !Number.isSafeInteger(message.threadId)) {
              reject(new Error(`microstructure_worker_failed:${message.error || 'unknown'}`));
              return;
            }
            resolve({ result: message.result, workerThreadId: message.threadId! });
          };
          const onError = (error: Error) => {
            cleanup();
            reject(error);
          };
          const cleanup = () => {
            clearTimeout(timer);
            worker.off('message', onMessage);
            worker.off('error', onError);
          };
          worker.on('message', onMessage);
          worker.once('error', onError);
          worker.postMessage({ requestId, input: inputs[index] });
        });
      }
    } finally {
      await worker.terminate();
    }
  });
  await Promise.all(runners);
  return results;
}
