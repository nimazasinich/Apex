import type { StrategyDefinition, StrategyReplayResult } from '../../types';
import type { BacktestCandle } from '../backtesting';
import type { TransactionCostModel } from '../transactionCosts';
import { asOf, type HistoricalSignalBundle, type NewsSignalRow } from './historicalSignals';
import { buildReplayIndicatorCache, finalizeReplay, sanitizeCandles, simulateBracketTrade } from './replayHarness';

interface SignalReplayArgs {
  candles: BacktestCandle[];
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  maxBars: number;
  definition: StrategyDefinition;
  transactionCostModel: TransactionCostModel;
  historicalSignals?: HistoricalSignalBundle;
  parameters?: Record<string, number | string>;
}

type Direction = 'LONG' | 'SHORT';

function allowed(requested: SignalReplayArgs['direction'], direction: Direction): boolean {
  return requested === 'BOTH' || requested === direction;
}

function indexAtOrBefore(timestamps: number[], timestamp: number): number {
  let low = 0;
  let high = timestamps.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (timestamps[middle] <= timestamp) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function headlineTone(news: NewsSignalRow): number {
  const positive = ['approval', 'approve', 'adoption', 'surge', 'rally', 'record', 'launch', 'gain', 'bull', 'inflow', 'breakout', 'upgrade', 'win'];
  const negative = ['hack', 'ban', 'lawsuit', 'fraud', 'crash', 'plunge', 'outflow', 'bear', 'liquidation', 'reject', 'downgrade', 'exploit', 'collapse'];
  const words = news.title.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.reduce((score, word) => score + (positive.includes(word) ? 1 : 0) - (negative.includes(word) ? 1 : 0), 0);
}

function runNativeSignalReplay(args: SignalReplayArgs): StrategyReplayResult {
  const candles = sanitizeCandles(args.candles);
  const signals = args.historicalSignals;
  if (!signals) {
    const unavailable = finalizeReplay(candles, [], args.definition.strategyId, 0, { historical_signal_bundle_unavailable: 1 });
    unavailable.summary.replayMode = 'HISTORICAL_SIGNAL_FAIL_CLOSED';
    unavailable.summary.configOverrides = [{
      field: 'historicalSignals', configured: 'required', effective: 'unavailable',
      reason: 'This scanner family no longer falls back to the shared candle-proxy replay.', policyVersion: 'native-signal-adapter-v1',
    }];
    return unavailable;
  }

  const timestamps = candles.map((row) => Date.parse(row.time));
  const indicators = buildReplayIndicatorCache(candles);
  const trades: StrategyReplayResult['trades'] = [];
  const rejectionCounts: Record<string, number> = {};
  let rejected = 0;
  let nextEligibleIndex = 0;
  const reject = (reason: string) => { rejected += 1; rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1; };
  const enter = (signalIndex: number, direction: Direction, stopMultiplier: number, rewardRisk: number, reason: string, rawScore: number) => {
    if (signalIndex < 50 || signalIndex >= candles.length - 1 || signalIndex < nextEligibleIndex || !allowed(args.direction, direction)) return;
    const currentAtr = indicators.atr(signalIndex, 14);
    if (!currentAtr || !Number.isFinite(currentAtr)) { reject('atr_unavailable'); return; }
    const trade = simulateBracketTrade({
      candles, signalIndex, direction, stopDistance: currentAtr * stopMultiplier, targetDistance: currentAtr * stopMultiplier * rewardRisk,
      maxBars: args.maxBars, transactionCostModel: args.transactionCostModel, rawScore: Math.min(1, Math.abs(rawScore)),
      confidence: Math.min(0.95, 0.55 + Math.abs(rawScore) * 0.35), entryReason: reason,
    });
    trades.push(trade);
    nextEligibleIndex = signalIndex + Math.max(1, trade.barsHeld);
  };

  if (args.definition.strategyId === 'funding-basis-carry-v1') {
    const threshold = Number(args.parameters?.fundingThreshold ?? 0.00018);
    for (const funding of signals.funding) {
      const index = indexAtOrBefore(timestamps, funding.t);
      if (index < 50 || index >= candles.length - 1) continue;
      const positioning = asOf(signals.positioning, funding.t, 2 * 3_600_000);
      const prior = asOf(signals.positioning, funding.t - 24 * 3_600_000, 2 * 3_600_000);
      const book = asOf(signals.orderBookDepth, funding.t, 8 * 86_400_000);
      if (!positioning || !prior || !book) { reject('funding_context_unavailable'); continue; }
      const oiChange = prior.oi > 0 ? positioning.oi / prior.oi - 1 : 0;
      if (Math.abs(funding.rate) < threshold || oiChange < 0.002 || book.bidNotional + book.askNotional <= 0) { reject('carry_or_crowding_gate'); continue; }
      const direction: Direction = funding.rate > 0 ? 'SHORT' : 'LONG';
      enter(index, direction, 1.25, 1.4,
        `Native funding ${Number(funding.rate * 10_000).toFixed(2)} bps, OI ${Number(oiChange * 100).toFixed(2)}%, and archived ±1% book depth passed the carry diagnostic gate.`,
        Math.min(1, Math.abs(funding.rate) / Math.max(threshold, 0.00001) / 3));
    }
  } else if (args.definition.strategyId === 'whale-flow-sentiment-reversal-v1') {
    for (const sentiment of signals.sentiment) {
      if (sentiment.value > 28 && sentiment.value < 72) continue;
      const index = indexAtOrBefore(timestamps, sentiment.t);
      if (index < 50 || index >= candles.length - 1) continue;
      const positioning = asOf(signals.positioning, timestamps[index], 6 * 3_600_000);
      if (!positioning || !Number.isFinite(positioning.takerRatio)) { reject('large_participant_proxy_unavailable'); continue; }
      const momentum = candles[index - 24]?.close > 0 ? candles[index].close / candles[index - 24].close - 1 : 0;
      const fearLong = sentiment.value <= 28 && momentum < -0.015 && positioning.takerRatio < 1;
      const greedShort = sentiment.value >= 72 && momentum > 0.015 && positioning.takerRatio > 1;
      if (!fearLong && !greedShort) { reject('capitulation_alignment_gate'); continue; }
      const direction: Direction = fearLong ? 'LONG' : 'SHORT';
      enter(index, direction, 1.35, 1.8,
        `Daily sentiment ${sentiment.value} with Binance top-trader/taker-flow proxy ${positioning.takerRatio.toFixed(3)} confirmed a bounded capitulation reversal; proxy is not entity-classified whale flow.`,
        Math.abs(50 - sentiment.value) / 50);
    }
  } else if (args.definition.strategyId === 'news-sentiment-momentum-breakout-v1') {
    for (const news of signals.news) {
      const tone = headlineTone(news);
      if (tone === 0) continue;
      const index = indexAtOrBefore(timestamps, news.t);
      if (index < 50 || index >= candles.length - 1) continue;
      const momentum = candles[index - 12]?.close > 0 ? candles[index].close / candles[index - 12].close - 1 : 0;
      const avgVolume = indicators.smaVolume(index, 20) ?? 0;
      const direction: Direction = tone > 0 ? 'LONG' : 'SHORT';
      if (Math.sign(momentum) !== Math.sign(tone) || Math.abs(momentum) < 0.004 || candles[index].volume < avgVolume) { reject('news_price_volume_confirmation'); continue; }
      enter(index, direction, 1.1, 1.7,
        `Timestamped Google News headline tone ${tone > 0 ? 'positive' : 'negative'} aligned with 12-hour price momentum and real candle volume: ${news.publisher || 'indexed publisher'}.`,
        Math.min(1, Math.abs(tone) / 3 + Math.abs(momentum) * 5));
    }
  } else if (args.definition.strategyId === 'liquidity-sweep-fvg-reversal-v1') {
    for (const book of signals.orderBookDepth) {
      const index = indexAtOrBefore(timestamps, book.t);
      if (index < 50 || index >= candles.length - 1) continue;
      const prior = candles.slice(index - 24, index);
      const priorLow = Math.min(...prior.map((row) => row.low));
      const priorHigh = Math.max(...prior.map((row) => row.high));
      const longSweep = candles[index].low < priorLow && candles[index].close > priorLow && book.imbalance > 0.02;
      const shortSweep = candles[index].high > priorHigh && candles[index].close < priorHigh && book.imbalance < -0.02;
      if (!longSweep && !shortSweep) { reject('sweep_book_imbalance_gate'); continue; }
      enter(index, longSweep ? 'LONG' : 'SHORT', 1.15, 1.9,
        `Measured 24-hour liquidity sweep reclaimed with archived ±1% order-book depth imbalance ${book.imbalance.toFixed(3)}.`,
        Math.min(1, Math.abs(book.imbalance) * 4));
    }
  } else if (args.definition.strategyId === 'crypto-multi-alpha-ls-v1') {
    for (const funding of signals.funding) {
      const index = indexAtOrBefore(timestamps, funding.t);
      if (index < 50 || index >= candles.length - 1) continue;
      const positioning = asOf(signals.positioning, funding.t, 2 * 3_600_000);
      const sentiment = asOf(signals.sentiment, funding.t, 36 * 3_600_000);
      if (!positioning || !Number.isFinite(positioning.takerRatio) || !sentiment) { reject('multi_alpha_completeness_gate'); continue; }
      const momentum = candles[index - 24]?.close > 0 ? candles[index].close / candles[index - 24].close - 1 : 0;
      if (Math.abs(momentum) < 0.008 || Math.abs(positioning.takerRatio - 1) < 0.02) { reject('multi_alpha_agreement_gate'); continue; }
      const direction: Direction = momentum > 0 ? 'LONG' : 'SHORT';
      const sentimentAgrees = direction === 'LONG' ? sentiment.value >= 35 : sentiment.value <= 65;
      const flowAgrees = direction === 'LONG' ? positioning.takerRatio > 1 : positioning.takerRatio < 1;
      if (!sentimentAgrees || !flowAgrees) { reject('multi_alpha_direction_conflict'); continue; }
      enter(index, direction, 1.3, 1.8,
        `Native 24-hour momentum, funding ${Number(funding.rate * 10_000).toFixed(2)} bps, OI/top-trader flow, and daily sentiment ${sentiment.value} agreed.`,
        Math.min(1, Math.abs(momentum) * 8 + Math.abs(positioning.takerRatio - 1)));
    }
  }

  const result = finalizeReplay(candles, trades, args.definition.strategyId, rejected, rejectionCounts);
  result.summary.replayMode = 'HISTORICAL_NATIVE_SIGNAL_REPLAY';
  result.summary.configOverrides = [{
    field: 'historicalSignals', configured: 'required', effective: signals.identitySha256,
    reason: 'Scanner-family replay consumed the strategy-specific, hash-verified historical signal bundle.', policyVersion: 'native-signal-adapter-v1',
  }];
  return result;
}

export function isNativeSignalScannerStrategy(strategyId: string): boolean {
  return [
    'crypto-multi-alpha-ls-v1',
    'funding-basis-carry-v1',
    'liquidity-sweep-fvg-reversal-v1',
    'whale-flow-sentiment-reversal-v1',
    'news-sentiment-momentum-breakout-v1',
  ].includes(strategyId);
}

export function runSignalAwareScannerStrategy(args: SignalReplayArgs): StrategyReplayResult {
  return runNativeSignalReplay(args);
}
