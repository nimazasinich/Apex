import type { BacktestCandle } from './backtesting';
import type {
  StrategyDefinition,
  StrategyFusionComponentDefinition,
  StrategyFusionComponentKey,
} from '../types';
import type { NewsResult, OnChainResult, SentimentResult } from './providers/supplementalTypes';
import { deriveSmartMoneyContext } from './smartMoneyContextEngine';

export type StrategyFusionQuality = 'LIVE' | 'HISTORICAL' | 'PROXY' | 'MISSING' | 'STALE';

export interface StrategyFusionFeature {
  key: StrategyFusionComponentKey;
  value: number;
  quality: StrategyFusionQuality;
  available: boolean;
  observedAt?: string;
  reason: string;
}

export interface StrategyFusionComponentResult extends StrategyFusionFeature {
  label: string;
  role: 'DIRECTIONAL' | 'QUALITY';
  configuredWeight: number;
  effectiveWeight: number;
  required: boolean;
  contribution: number;
}

export interface StrategyFusionSnapshot {
  version: 'strategy_fusion_v1';
  strategyId: string;
  strategyVersion: number;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
  generatedAt: number;
  generatedAtIso: string;
  score: number;
  confidence: number;
  completeness: number;
  agreement: number;
  qualityMultiplier: number;
  actionable: boolean;
  state: 'ACTIONABLE' | 'CONFLICTED' | 'INCOMPLETE' | 'BLOCKED';
  components: StrategyFusionComponentResult[];
  missingRequired: StrategyFusionComponentKey[];
  warnings: string[];
  reasons: string[];
}

export interface StrategyFusionInput {
  definition: StrategyDefinition;
  symbol: string;
  interval: string;
  direction: 'LONG' | 'SHORT';
  candles?: BacktestCandle[];
  fundingDirectional?: number | null;
  openInterestDirectional?: number | null;
  news?: NewsResult | null;
  sentiment?: SentimentResult | null;
  onchain?: OnChainResult | null;
  parameters?: Record<string, number | string>;
}

const clamp = (value: number, min = -1, max = 1): number => Math.max(min, Math.min(max, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);
const finite = (value: unknown, fallback = 0): number => Number.isFinite(Number(value)) ? Number(value) : fallback;

function sortedCandles(candles: BacktestCandle[] | undefined): BacktestCandle[] {
  return (candles || [])
    .map((row) => ({ ...row, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume || 0) }))
    .filter((row) => [row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite))
    .sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
}

function ema(values: number[], length: number): number | null {
  if (values.length < length) return null;
  const alpha = 2 / (length + 1);
  let current = values[0];
  for (let index = 1; index < values.length; index += 1) current = values[index] * alpha + current * (1 - alpha);
  return current;
}

function candleFeatures(candlesInput: BacktestCandle[] | undefined, direction: 'LONG' | 'SHORT'): StrategyFusionFeature[] {
  const candles = sortedCandles(candlesInput);
  if (candles.length < 60) {
    return (['technical', 'smartMoney', 'orderFlow', 'liquidity', 'regime'] as StrategyFusionComponentKey[]).map((key) => ({
      key,
      value: 0,
      quality: 'MISSING',
      available: false,
      reason: `At least 60 closed candles are required for ${key}.`,
    }));
  }
  const closes = candles.map((row) => row.close);
  const recent = candles.slice(-80);
  const last = closes.at(-1) || 0;
  const e20 = ema(closes.slice(-120), 20) || last;
  const e50 = ema(closes.slice(-180), 50) || last;
  const e200 = ema(closes, Math.min(200, closes.length)) || e50;
  const momentumBase = closes[Math.max(0, closes.length - 13)] || last;
  const momentum = last > 0 ? (last - momentumBase) / last : 0;
  const trendSpread = last > 0 ? ((e20 - e50) / last) * 70 + ((e50 - e200) / last) * 35 : 0;
  const technical = clamp(momentum * 24 + trendSpread);

  let signedVolume = 0;
  let totalVolume = 0;
  let rangeSum = 0;
  let bodySum = 0;
  for (const row of recent.slice(-30)) {
    const volume = Math.max(0, row.volume);
    const range = Math.max(Number.EPSILON, row.high - row.low);
    const bodyDirection = clamp((row.close - row.open) / range);
    signedVolume += bodyDirection * volume;
    totalVolume += volume;
    rangeSum += range;
    bodySum += Math.abs(row.close - row.open);
  }
  const orderFlow = totalVolume > 0 ? clamp(signedVolume / totalVolume) : 0;
  const averageRange = rangeSum / Math.max(1, Math.min(30, recent.length));
  const averageBody = bodySum / Math.max(1, Math.min(30, recent.length));
  const volumeValues = recent.slice(-30).map((row) => Math.max(0, row.volume));
  const volumeMean = volumeValues.reduce((sum, value) => sum + value, 0) / Math.max(1, volumeValues.length);
  const volumeVariance = volumeValues.reduce((sum, value) => sum + (value - volumeMean) ** 2, 0) / Math.max(1, volumeValues.length);
  const volumeCv = volumeMean > 0 ? Math.sqrt(volumeVariance) / volumeMean : 2;
  const bodyEfficiency = averageRange > 0 ? clamp01(averageBody / averageRange) : 0;
  const liquidityQuality = clamp01(0.75 - Math.min(0.55, volumeCv * 0.22) + bodyEfficiency * 0.25);
  const regime = clamp(((e50 - e200) / Math.max(last, Number.EPSILON)) * 120 + momentum * 10);

  const converted = recent.map((row) => ({
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
  let smartMoney = 0;
  let smartMoneyReason = 'Smart-money context could not be derived.';
  try {
    const context = deriveSmartMoneyContext({ candles5m: converted, candles15m: converted, candles4h: converted, direction });
    smartMoney = context.smcDirectionalScore;
    smartMoneyReason = context.reasons.join(' ');
  } catch {
    smartMoney = 0;
  }

  return [
    { key: 'technical', value: technical, quality: 'HISTORICAL', available: true, reason: 'EMA alignment and bounded momentum from verified closed candles.' },
    { key: 'smartMoney', value: smartMoney, quality: 'PROXY', available: true, reason: smartMoneyReason },
    { key: 'orderFlow', value: orderFlow, quality: 'PROXY', available: true, reason: 'Candle-body signed-volume proxy; not a replacement for L2 trade flow.' },
    { key: 'liquidity', value: liquidityQuality, quality: 'PROXY', available: true, reason: 'Candle volume stability and body/range efficiency proxy.' },
    { key: 'regime', value: regime, quality: 'HISTORICAL', available: true, reason: 'Long/medium trend spread and momentum regime.' },
  ];
}

function sourceQuality(source: string | undefined): StrategyFusionQuality {
  if (source === 'live') return 'LIVE';
  if (source === 'degraded') return 'STALE';
  return 'MISSING';
}

function newsFeature(news: NewsResult | null | undefined): StrategyFusionFeature {
  if (!news || news.source === 'not_configured' || news.source === 'unavailable' || !news.data.length) {
    return { key: 'news', value: 0, quality: 'MISSING', available: false, reason: news?.reason || 'No current news evidence is configured.' };
  }
  let weighted = 0;
  let weight = 0;
  const now = Date.now();
  for (const article of news.data.slice(0, 40)) {
    const score = article.sentiment === 'bullish' ? 1 : article.sentiment === 'bearish' ? -1 : 0;
    const ageHours = Math.max(0, (now - Date.parse(article.publishedAt)) / 3_600_000);
    const recency = Number.isFinite(ageHours) ? Math.exp(-ageHours / 24) : 0.25;
    weighted += score * recency;
    weight += recency;
  }
  const quality = sourceQuality(news.source);
  return {
    key: 'news',
    value: weight > 0 ? clamp(weighted / weight) : 0,
    quality,
    available: quality === 'LIVE',
    observedAt: news.updatedAt,
    reason: `${news.data.length} current article(s) aggregated with recency weighting.`,
  };
}

function sentimentFeature(sentiment: SentimentResult | null | undefined): StrategyFusionFeature {
  if (!sentiment || sentiment.valid !== true || !sentiment.data || sentiment.source === 'not_configured' || sentiment.source === 'unavailable') {
    return { key: 'sentiment', value: 0, quality: 'MISSING', available: false, reason: sentiment?.reason || 'No current sentiment evidence is configured.' };
  }
  const quality = sourceQuality(sentiment.source);
  return {
    key: 'sentiment',
    value: clamp(finite(sentiment.data.value) * clamp01(finite(sentiment.data.confidence, 0.5))),
    quality,
    available: quality === 'LIVE',
    observedAt: sentiment.updatedAt,
    reason: `${sentiment.provider} ${sentiment.data.label.toLowerCase()} sentiment with ${(sentiment.data.confidence * 100).toFixed(0)}% model confidence.`,
  };
}

function whaleFeature(onchain: OnChainResult | null | undefined): StrategyFusionFeature {
  if (!onchain || onchain.source === 'not_configured' || onchain.source === 'unavailable' || !onchain.data.length) {
    return { key: 'whaleFlow', value: 0, quality: 'MISSING', available: false, reason: onchain?.reason || 'No current on-chain whale-flow evidence is configured.' };
  }
  let directional = 0;
  let scale = 0;
  let classified = 0;
  for (const signal of onchain.data.slice(0, 200)) {
    const size = Math.log10(Math.max(10, finite(signal.amountUSD, Math.abs(signal.amount)))) / 10;
    if (signal.type === 'exchange_deposit') {
      directional -= size;
      scale += size;
      classified += 1;
    } else if (signal.type === 'exchange_withdrawal') {
      directional += size;
      scale += size;
      classified += 1;
    }
  }
  return {
    key: 'whaleFlow',
    value: scale > 0 ? clamp(directional / scale) : 0,
    quality: sourceQuality(onchain.source),
    available: classified > 0 && onchain.source === 'live',
    observedAt: onchain.updatedAt,
    reason: classified > 0
      ? `${classified} exchange-classified whale flow(s); deposits are sell-pressure risk and withdrawals are accumulation evidence.`
      : 'On-chain transfers exist, but none are classified as exchange deposits or withdrawals.',
  };
}

function directFeature(key: 'funding' | 'openInterest', value: number | null | undefined): StrategyFusionFeature {
  if (!Number.isFinite(value)) return { key, value: 0, quality: 'MISSING', available: false, reason: `No verified ${key} directional feature was supplied.` };
  return { key, value: clamp(Number(value)), quality: 'LIVE', available: true, reason: `Verified ${key} directional feature supplied by the market-data path.` };
}

function effectiveWeight(component: StrategyFusionComponentDefinition, parameters: Record<string, number | string> | undefined): number {
  const override = Number(parameters?.[`fusion.${component.key}`]);
  if (!Number.isFinite(override)) return component.weight;
  return Math.max(component.minWeight, Math.min(component.maxWeight, override));
}

export function evaluateStrategyFusion(input: StrategyFusionInput): StrategyFusionSnapshot {
  const blueprint = input.definition.fusion;
  const generatedAt = Date.now();
  if (!blueprint) {
    return {
      version: 'strategy_fusion_v1',
      strategyId: input.definition.strategyId,
      strategyVersion: input.definition.version,
      symbol: input.symbol,
      interval: input.interval,
      direction: input.direction,
      generatedAt,
      generatedAtIso: new Date(generatedAt).toISOString(),
      score: 0,
      confidence: 0,
      completeness: 0,
      agreement: 0,
      qualityMultiplier: 0,
      actionable: false,
      state: 'BLOCKED',
      components: [],
      missingRequired: [],
      warnings: ['This registry definition has no strategy-fusion blueprint.'],
      reasons: ['Fusion is unavailable for this strategy.'],
    };
  }

  const features = new Map<StrategyFusionComponentKey, StrategyFusionFeature>();
  for (const feature of candleFeatures(input.candles, input.direction)) features.set(feature.key, feature);
  features.set('funding', directFeature('funding', input.fundingDirectional));
  features.set('openInterest', directFeature('openInterest', input.openInterestDirectional));
  features.set('news', newsFeature(input.news));
  features.set('sentiment', sentimentFeature(input.sentiment));
  features.set('whaleFlow', whaleFeature(input.onchain));

  const components: StrategyFusionComponentResult[] = blueprint.components.map((component) => {
    const feature = features.get(component.key) || { key: component.key, value: 0, quality: 'MISSING' as const, available: false, reason: 'Feature unavailable.' };
    const weight = effectiveWeight(component, input.parameters);
    return {
      ...feature,
      label: component.label,
      role: component.role,
      configuredWeight: component.weight,
      effectiveWeight: weight,
      required: component.required,
      contribution: feature.available && component.role === 'DIRECTIONAL' ? clamp(feature.value) * weight : 0,
    };
  });

  const totalWeight = components.reduce((sum, component) => sum + Math.max(0, component.effectiveWeight), 0);
  const availableWeight = components.reduce((sum, component) => sum + (component.available ? Math.max(0, component.effectiveWeight) : 0), 0);
  const directional = components.filter((component) => component.role === 'DIRECTIONAL' && component.available && component.effectiveWeight > 0);
  const directionalWeight = directional.reduce((sum, component) => sum + component.effectiveWeight, 0);
  const signedScore = directionalWeight > 0 ? directional.reduce((sum, component) => sum + component.contribution, 0) / directionalWeight : 0;
  const desiredSign = input.direction === 'LONG' ? 1 : -1;
  const alignedWeight = directional.reduce((sum, component) => sum + (component.value * desiredSign > 0.05 ? component.effectiveWeight : 0), 0);
  const opposedWeight = directional.reduce((sum, component) => sum + (component.value * desiredSign < -0.05 ? component.effectiveWeight : 0), 0);
  const decisiveWeight = alignedWeight + opposedWeight;
  const agreement = decisiveWeight > 0 ? alignedWeight / decisiveWeight : 0;
  const qualityRows = components.filter((component) => component.role === 'QUALITY' && component.available);
  const qualityWeight = qualityRows.reduce((sum, component) => sum + component.effectiveWeight, 0);
  const qualityMultiplier = qualityWeight > 0
    ? clamp01(qualityRows.reduce((sum, component) => sum + clamp01(component.value) * component.effectiveWeight, 0) / qualityWeight)
    : 1;
  const completeness = totalWeight > 0 ? availableWeight / totalWeight : 0;
  const missingRequired = components.filter((component) => component.required && !component.available).map((component) => component.key);
  const directionalConfidence = clamp01(Math.abs(signedScore));
  const confidence = clamp01(directionalConfidence * (0.55 + agreement * 0.25 + qualityMultiplier * 0.20) * completeness);
  const directionAligned = signedScore * desiredSign > 0;
  const registryBlocked = input.definition.status === 'blocked';
  const actionable = !registryBlocked && missingRequired.length === 0
    && completeness >= blueprint.minCompleteness
    && agreement >= blueprint.minAgreement
    && directionAligned
    && confidence >= 0.35;
  const state: StrategyFusionSnapshot['state'] = registryBlocked
    ? 'BLOCKED'
    : actionable
      ? 'ACTIONABLE'
    : missingRequired.length > 0 || completeness < blueprint.minCompleteness
      ? 'INCOMPLETE'
      : agreement < blueprint.minAgreement || !directionAligned
        ? 'CONFLICTED'
        : 'BLOCKED';
  const warnings: string[] = [];
  if (components.some((component) => component.quality === 'PROXY')) warnings.push('One or more layers use candle-derived proxies; they are not equivalent to historical L2 or alternative-data evidence.');
  if (registryBlocked) warnings.push(input.definition.blockedReason || 'Strategy execution prerequisites are blocked.');
  if (blueprint.evolution.liveOnlyWeightsManualUntilHistoricalData) warnings.push('News, sentiment, and whale-flow weights remain manual-only until timestamp-aligned historical datasets are persisted.');
  if (missingRequired.length) warnings.push(`Missing required layers: ${missingRequired.join(', ')}.`);
  const reasons = components
    .filter((component) => component.available && Math.abs(component.contribution) > 0.02)
    .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution))
    .slice(0, 5)
    .map((component) => `${component.label}: ${component.value >= 0 ? 'bullish/constructive' : 'bearish/defensive'} (${component.value.toFixed(2)}).`);
  if (!reasons.length) reasons.push('No sufficiently strong directional component is currently available.');

  return {
    version: 'strategy_fusion_v1',
    strategyId: input.definition.strategyId,
    strategyVersion: input.definition.version,
    symbol: input.symbol,
    interval: input.interval,
    direction: input.direction,
    generatedAt,
    generatedAtIso: new Date(generatedAt).toISOString(),
    score: Number(signedScore.toFixed(6)),
    confidence: Number(confidence.toFixed(6)),
    completeness: Number(completeness.toFixed(6)),
    agreement: Number(agreement.toFixed(6)),
    qualityMultiplier: Number(qualityMultiplier.toFixed(6)),
    actionable,
    state,
    components,
    missingRequired,
    warnings,
    reasons,
  };
}
