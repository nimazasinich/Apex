import type { Candle, Candlestick, OrderBook, SymbolTicker } from '../../types';
import type { SupplementalBundle } from '../providers/supplementalTypes';
import type { CommanderEvidenceV1 } from '../../contracts/commander/commanderEvidence';
import { buildElliottEvidence } from './evidence/elliottEvidence';
import { buildFibonacciEvidence } from './evidence/fibonacciEvidence';
import { buildDirectionDivergenceEvidence } from './evidence/directionDivergenceEvidence';
import { buildFundingOiEvidence } from './evidence/fundingOiEvidence';
import { buildHarmonicEvidence } from './evidence/harmonicEvidence';
import { buildLiquidityEvidence } from './evidence/liquidityEvidence';
import { buildMomentumEvidence } from './evidence/momentumEvidence';
import { buildNewsEvidence } from './evidence/newsEvidence';
import { buildPriceActionEvidence } from './evidence/priceActionEvidence';
import { buildSentimentEvidence } from './evidence/sentimentEvidence';
import { buildSmartMoneyEvidence } from './evidence/smartMoneyEvidence';
import { buildVolatilityEvidence } from './evidence/volatilityEvidence';
import { buildWhaleEvidence } from './evidence/whaleEvidence';
import { buildIntelligenceConsensus, parliamentFingerprint, type IntelligenceConsensusV1 } from './intelligenceConsensus';

export interface NativeParliamentInput {
  ticker: SymbolTicker;
  candles1h?: Candle[];
  candles15m?: Candle[];
  candles5m?: Candle[];
  candles1m?: Candle[];
  orderBook?: OrderBook;
  spread?: number;
  oiChangePercent?: number;
  supplementalBundle?: SupplementalBundle;
  timestamp: number;
  source: string;
}

export interface ParliamentScanShadowV1 {
  version: 'commander_parliament_scan_shadow_v1';
  timestamp: string;
  shadowOnly: true;
  authoritativeSelection: 'CURRENT_APEX_CANDIDATES';
  results: IntelligenceConsensusV1[];
  failures: Array<{ symbol: string; reason: 'shadow_evaluation_failed' }>;
  fingerprint: string;
}

export interface NativeParliamentSnapshotV1 {
  consensus: IntelligenceConsensusV1;
  evidence: CommanderEvidenceV1[];
}

function toCandlesticks(rows: Candle[] | undefined): Candlestick[] | undefined {
  if (!rows) return undefined;
  return rows.map((row) => ({
    time: new Date(row.timestamp).toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
}

export function buildNativeParliamentSnapshot(input: NativeParliamentInput): NativeParliamentSnapshotV1 {
  const oneHour = toCandlesticks(input.candles1h);
  const fifteenMinute = toCandlesticks(input.candles15m);
  const fiveMinute = toCandlesticks(input.candles5m);
  const oneMinute = toCandlesticks(input.candles1m);
  const receivedAt = new Date(input.timestamp).toISOString();
  const observedAt = oneHour?.at(-1)?.time ?? fifteenMinute?.at(-1)?.time ?? receivedAt;
  const expiresAt = new Date(input.timestamp + 90_000).toISOString();
  const inputFingerprint = parliamentFingerprint({
    symbol: input.ticker.symbol,
    tickerTimestamp: input.ticker.timestamp,
    receivedAt,
    endpoints: {
      oneHour: oneHour?.at(-1)?.time ?? null,
      fifteenMinute: fifteenMinute?.at(-1)?.time ?? null,
      fiveMinute: fiveMinute?.at(-1)?.time ?? null,
      oneMinute: oneMinute?.at(-1)?.time ?? null,
    },
  });
  const base = {
    symbol: input.ticker.symbol,
    observedAt,
    receivedAt,
    expiresAt,
    source: input.source,
    sourceVersion: 'apex-native-candidate-enrichment-v1',
    inputFingerprint,
  };
  const evidence = [
    buildMomentumEvidence({ ...base, evidenceId: `${inputFingerprint}:momentum`, timeframe: '1h', candles: oneHour }),
    buildDirectionDivergenceEvidence({
      ...base,
      evidenceId: `${inputFingerprint}:direction-divergence`,
      timeframe: 'multi',
      orderDirection: input.ticker.priceChange24hPct < 0 ? 'SHORT' : 'LONG',
      timeframes: { '1m': oneMinute, '5m': fiveMinute, '15m': fifteenMinute, '1h': oneHour },
      fundingRate: input.ticker.fundingQuality === 'VALID' || input.ticker.fundingQuality === 'ESTIMATED' ? input.ticker.fundingRate : undefined,
      oiChangePercent: input.oiChangePercent,
      marketDataSource: input.ticker.dataState === 'live' ? 'kucoin_live' : input.ticker.dataState === 'unavailable' ? 'unavailable' : 'kucoin_live_binance_unavailable',
    }),
    buildPriceActionEvidence({ ...base, evidenceId: `${inputFingerprint}:price-action`, timeframe: '1h', candles: oneHour }),
    buildSmartMoneyEvidence({
      ...base,
      evidenceId: `${inputFingerprint}:smart-money`,
      timeframe: 'multi',
      candles1m: oneMinute,
      candles5m: fiveMinute,
      candles15m: fifteenMinute,
      direction: input.ticker.priceChange24hPct < 0 ? 'SHORT' : 'LONG',
    }),
    buildLiquidityEvidence({
      ...base,
      evidenceId: `${inputFingerprint}:liquidity`,
      timeframe: 'realtime',
      candles: oneHour,
      orderBook: input.orderBook,
      spread: input.spread,
      price: input.ticker.lastPrice,
    }),
    buildVolatilityEvidence({ ...base, evidenceId: `${inputFingerprint}:volatility`, timeframe: '1h', candles: oneHour, price: input.ticker.lastPrice }),
    buildFundingOiEvidence({
      ...base,
      evidenceId: `${inputFingerprint}:funding-oi`,
      timeframe: 'realtime',
      fundingRate: input.ticker.fundingQuality === 'VALID' || input.ticker.fundingQuality === 'ESTIMATED' ? input.ticker.fundingRate : undefined,
      oiChangePercent: input.oiChangePercent,
    }),
    buildNewsEvidence({ ...base, evidenceId: `${inputFingerprint}:news`, timeframe: 'realtime', supplementalBundle: input.supplementalBundle }),
    buildSentimentEvidence({ ...base, evidenceId: `${inputFingerprint}:sentiment`, timeframe: 'realtime', supplementalBundle: input.supplementalBundle }),
    buildWhaleEvidence({ ...base, evidenceId: `${inputFingerprint}:whale`, timeframe: 'realtime', supplementalBundle: input.supplementalBundle }),
    buildFibonacciEvidence({ ...base, evidenceId: `${inputFingerprint}:fibonacci`, timeframe: '1h', candles: input.candles1h }),
    buildElliottEvidence({ ...base, evidenceId: `${inputFingerprint}:elliott`, timeframe: '1h', candles: input.candles1h }),
    buildHarmonicEvidence({ ...base, evidenceId: `${inputFingerprint}:harmonic`, timeframe: '1h', candles: input.candles1h }),
  ];
  return {
    consensus: buildIntelligenceConsensus({ symbol: input.ticker.symbol, timestamp: receivedAt, evidence }),
    evidence: evidence.map((row) => ({
      ...row,
      thesisTags: [...row.thesisTags],
      supportingReasons: [...row.supportingReasons],
      conflictingReasons: [...row.conflictingReasons],
      rawEvidenceIds: [...row.rawEvidenceIds],
    })),
  };
}

export function buildNativeParliamentConsensus(input: NativeParliamentInput): IntelligenceConsensusV1 {
  return buildNativeParliamentSnapshot(input).consensus;
}

export function buildParliamentScanShadow(input: {
  timestamp: number;
  results: readonly IntelligenceConsensusV1[];
  failures?: ReadonlyArray<{ symbol: string; reason: 'shadow_evaluation_failed' }>;
}): ParliamentScanShadowV1 {
  const unsigned = {
    version: 'commander_parliament_scan_shadow_v1' as const,
    timestamp: new Date(input.timestamp).toISOString(),
    shadowOnly: true as const,
    authoritativeSelection: 'CURRENT_APEX_CANDIDATES' as const,
    results: [...input.results].sort((left, right) => left.symbol.localeCompare(right.symbol)),
    failures: [...(input.failures ?? [])].sort((left, right) => left.symbol.localeCompare(right.symbol)),
  };
  return { ...unsigned, fingerprint: parliamentFingerprint(unsigned) };
}
