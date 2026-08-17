import { createHash } from 'node:crypto';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';
import {
  runMicrostructureSimulationBatch,
  type MicrostructureSimulationInput,
  type MicrostructureWorkerResult,
} from './microstructureFillSimulator';

export type LiquidityHunterEntrySimulationPolicy = 'MARKET_AT_CONFIRMATION' | 'LIMIT_AT_SIGNAL_PRICE';

export interface LiquidityHunterMicrostructureValidationInput {
  events: MarketEvent[];
  evaluations: LiquidityHunterEvaluation[];
  symbol: string;
  executionSource?: string;
  entryPolicy?: LiquidityHunterEntrySimulationPolicy;
  quantity?: number;
  latencyMs?: number;
  makerFeeBps?: number;
  takerFeeBps?: number;
  marketSlippageBps?: number;
  queueAheadFraction?: number;
  maxHorizonMs?: number;
  maxCandidates?: number;
  concurrency?: number;
}

export interface LiquidityHunterMicrostructureValidationReport {
  version: 'lh_microstructure_validation_v2';
  symbol: string;
  executionSource: string | null;
  entryPolicy: LiquidityHunterEntrySimulationPolicy;
  candidateCount: number;
  simulatedCount: number;
  uniqueWorkerThreads: number[];
  results: MicrostructureWorkerResult[];
  summary: {
    filledShare: number | null;
    targetHitShare: number | null;
    stoppedShare: number | null;
    medianNetReturnPct: number | null;
  };
  shadowOnly: true;
  authoritative: false;
  executionDependency: false;
  fingerprintSha256: string;
  caveats: string[];
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function inferSignalPrice(events: readonly MarketEvent[], symbol: string, at: number, executionSource: string): number | null {
  let best: { timestamp: number; price: number } | null = null;
  for (const event of events) {
    if (event.symbol !== symbol || event.source !== executionSource || event.exchangeTimestamp > at || !event.payload || typeof event.payload !== 'object') continue;
    const row = event.payload as Record<string, unknown>;
    let price: number | null = null;
    if (event.type === 'TRADE') {
      const parsed = Number(row.price);
      if (Number.isFinite(parsed) && parsed > 0) price = parsed;
    } else if (event.type === 'QUOTE') {
      const bid = Number(row.bid);
      const ask = Number(row.ask);
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid) price = (bid + ask) / 2;
    }
    if (price !== null && (!best || event.exchangeTimestamp >= best.timestamp)) best = { timestamp: event.exchangeTimestamp, price };
  }
  return best?.price ?? null;
}


function resolveExecutionSource(
  events: readonly MarketEvent[],
  symbol: string,
  requested: string | undefined,
  entryPolicy: LiquidityHunterEntrySimulationPolicy,
): string | null {
  const explicit = String(requested ?? '').trim();
  if (explicit) return events.some((event) => event.symbol === symbol && event.source === explicit) ? explicit : null;
  const capabilities = new Map<string, { tradesOrQuotes: boolean; snapshot: boolean }>();
  for (const event of events) {
    if (event.symbol !== symbol) continue;
    const state = capabilities.get(event.source) ?? { tradesOrQuotes: false, snapshot: false };
    if (event.type === 'TRADE' || event.type === 'QUOTE') state.tradesOrQuotes = true;
    if (event.type === 'ORDERBOOK_SNAPSHOT') state.snapshot = true;
    capabilities.set(event.source, state);
  }
  const eligible = [...capabilities.entries()]
    .filter(([, state]) => state.tradesOrQuotes && (entryPolicy === 'MARKET_AT_CONFIRMATION' || state.snapshot))
    .map(([source]) => source)
    .sort();
  if (eligible.includes('binance-usdm-ws')) return 'binance-usdm-ws';
  return eligible.length === 1 ? eligible[0] : null;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Converts only already-eligible shadow setups into deterministic execution
 * simulations. No TradePlan is created and no exchange API is reachable from
 * this module. The entry policy is explicit so a research report cannot hide
 * whether it assumed market entry or passive limit entry.
 */
export async function runLiquidityHunterMicrostructureValidation(
  input: LiquidityHunterMicrostructureValidationInput,
): Promise<LiquidityHunterMicrostructureValidationReport> {
  const symbol = input.symbol.toUpperCase();
  const entryPolicy = input.entryPolicy ?? 'MARKET_AT_CONFIRMATION';
  const quantity = Math.max(0.000001, Math.min(1_000_000, Number(input.quantity ?? 1)));
  const executionSource = resolveExecutionSource(input.events, symbol, input.executionSource, entryPolicy);
  const maxCandidates = Math.max(1, Math.min(5_000, Math.floor(input.maxCandidates ?? 500)));
  const candidates = input.evaluations
    .filter((evaluation) => evaluation.symbol === symbol
      && evaluation.eligibleForManualConfirmation
      && (evaluation.trigger.direction === 'LONG' || evaluation.trigger.direction === 'SHORT')
      && evaluation.trigger.invalidationPrice !== null)
    .slice(0, maxCandidates);

  const tasks: MicrostructureSimulationInput[] = [];
  for (const evaluation of candidates) {
    if (!executionSource) break;
    const signalPrice = inferSignalPrice(input.events, symbol, evaluation.generatedAt, executionSource);
    const invalidation = evaluation.trigger.invalidationPrice;
    if (signalPrice === null || invalidation === null || invalidation <= 0 || signalPrice <= 0) continue;
    const long = evaluation.trigger.direction === 'LONG';
    const risk = long ? signalPrice - invalidation : invalidation - signalPrice;
    if (!(risk > 0)) continue;
    const target = long ? signalPrice + 2 * risk : signalPrice - 2 * risk;
    tasks.push({
      simulationId: evaluation.setupId ?? evaluation.evaluationId,
      symbol,
      events: input.events,
      executionSource,
      orderSide: long ? 'BUY' : 'SELL',
      entryType: entryPolicy === 'LIMIT_AT_SIGNAL_PRICE' ? 'LIMIT' : 'MARKET',
      submitAt: evaluation.generatedAt,
      quantity,
      limitPrice: entryPolicy === 'LIMIT_AT_SIGNAL_PRICE' ? signalPrice : undefined,
      stopPrice: invalidation,
      targetPrice: target,
      latencyMs: input.latencyMs,
      makerFeeBps: input.makerFeeBps,
      takerFeeBps: input.takerFeeBps,
      marketSlippageBps: input.marketSlippageBps,
      queueAheadFraction: input.queueAheadFraction,
      maxHorizonMs: input.maxHorizonMs,
    });
  }

  const results = tasks.length ? await runMicrostructureSimulationBatch(tasks, input.concurrency ?? 2) : [];
  const completed = results.map((row) => row.result);
  const filled = completed.filter((row) => row.entryFilledQuantity > 0);
  const targetHits = completed.filter((row) => row.status === 'TARGET_HIT');
  const stopped = completed.filter((row) => row.status === 'STOPPED');
  const netReturns = completed.map((row) => row.netReturnPct).filter((value): value is number => value !== null && Number.isFinite(value));
  const withoutFingerprint = {
    version: 'lh_microstructure_validation_v2' as const,
    symbol,
    executionSource,
    entryPolicy,
    candidateCount: candidates.length,
    simulatedCount: results.length,
    uniqueWorkerThreads: [...new Set(results.map((row) => row.workerThreadId))].sort((a, b) => a - b),
    results,
    summary: {
      filledShare: completed.length ? filled.length / completed.length : null,
      targetHitShare: completed.length ? targetHits.length / completed.length : null,
      stoppedShare: completed.length ? stopped.length / completed.length : null,
      medianNetReturnPct: median(netReturns),
    },
    shadowOnly: true as const,
    authoritative: false as const,
    executionDependency: false as const,
    caveats: [
      executionSource ? `Simulation is venue-isolated to execution source ${executionSource}.` : 'Execution source could not be resolved unambiguously; no mixed-venue simulation is performed.',
      'This is a deterministic queue-position approximation, not matching-engine ground truth.',
      'Only setups already eligible for manual confirmation are simulated.',
      'Results cannot promote thresholds or authorize orders.',
    ],
  };
  return { ...withoutFingerprint, fingerprintSha256: fingerprint(withoutFingerprint) };
}
